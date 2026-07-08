# Burn Map Architecture — Distributed Solar Events
**Turning point: from expensive per-particle distance checks to spatial grid lookup.**

---

## The Pattern You're Describing

Currently:
- **Gravity Field**: Spatial grid; every loose particle queries once per tick → forces
- **Collision Heatmap**: Spatial grid; every body queries collisions → spring breaks
- **Burn Zone**: Per-particle `Math.sqrt(sdx*sdx + sdy*sdy) < sunBurnR * 4` check (expensive)

New:
- **Burn Map**: Spatial grid; cells precomputed with heat/damage intensity
- Every loose particle queries burn map cell → instant heat value
- Every body node queries burn map cell → instant damage rate
- Multiple suns, novas, supernovas all write to same map in one pass

---

## Burn Map Concept

```
┌─────────────────────────────────────────┐
│      World Space (10000×10000)          │
├─────────────────────────────────────────┤
│  ╔═══╦═══╦═══╗                         │
│  ║ 0 ║ 1 ║ 2 ║  ← Burn Map Grid       │
│  ╠═══╬═══╬═══╣     Cell Size = 400px   │
│  ║ 3 ║ 4 ║ 5 ║     Each cell = heat   │
│  ╠═══╬═══╬═══╣     intensity [0,1]    │
│  ║ 6 ║ 7 ║ 8 ║                        │
│  ╚═══╩═══╩═══╝                         │
│                                         │
│  Cell [4] (center):  heat = 0.92       │
│  Cell [1] (above):   heat = 0.45       │
│  Cell [7] (below):   heat = 0.38       │
│  Cell [0] (far):     heat = 0.0        │
│                                         │
└─────────────────────────────────────────┘

Burn sources (all write to map in one pass):
  • Main sun (x, y, radius=300, intensity=1.0)
  • Nova explosions (x, y, radius=500, intensity=0.7, life=0.3)
  • Supernova (x, y, radius=1500, intensity=0.95, life=0.5)
  • Stellar flares (local spikes)
```

---

## Current (Per-Particle) Cost

```javascript
// tick.js line 157-162 — EVERY LOOSE PARTICLE, EVERY TICK
for (const lp of survivors) {
  const sdx = sunX - lp.x, sdy = sunY - lp.y;
  const sd2 = sdx * sdx + sdy * sdy;
  const sd = Math.sqrt(sd2) + 0.1;
  const inBurnZone = sd < sunBurnR * 4;      // Distance check
  const inCritical = sd < sunBurnR;           // Another distance check
}
```

Cost: **350 particles × 3 operations × 60 fps = 63,000 distance checks/sec**

---

## New (Burn Map) Cost

```javascript
// tick.js — SAME LOOP, different query
for (const lp of survivors) {
  const cellX = Math.floor(lp.x / 400);       // Grid hash
  const cellY = Math.floor(lp.y / 400);
  const heat = burnMap.get(cellX, cellY) || 0; // O(1) lookup
  
  // Use heat directly (no sqrt, no sqrt2)
  const inBurnZone = heat > 0.1;
  const inCritical = heat > 0.8;
}
```

Cost: **350 particles × 2 operations (hash + map lookup) × 60 fps = 42,000 ops/sec**
Saving: **~33% reduction in per-particle work** (no sqrt, no branching distance math)

---

## Multiple Suns / Novas / Supernovas

**Same burn map, many sources:**

```javascript
export const updateBurnMap = (burnMap, suns, novas, supernovas) => {
  // Clear or decay existing map (one pass)
  burnMap.clear();
  
  // Write all burn sources in one pass
  const sources = [
    ...suns.map(s => ({ x: s.x, y: s.y, r: s.burnRadius, i: 1.0, life: 1.0 })),
    ...novas.map(n => ({ x: n.x, y: n.y, r: 500, i: 0.7, life: n.life })),
    ...supernovas.map(s => ({ x: s.x, y: s.y, r: 1500, i: 0.95, life: s.life }))
  ];
  
  for (const src of sources) {
    const cx = Math.floor(src.x / cellSize);
    const cy = Math.floor(src.y / cellSize);
    
    // Write to grid cells in falloff radius
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        const dist = Math.hypot(dx, dy) * cellSize;
        if (dist < src.r) {
          const falloff = 1 - (dist / src.r);
          const cellHeat = src.i * falloff * src.life;
          burnMap.set(cx + dx, cy + dy, Math.max(
            burnMap.get(cx + dx, cy + dy) || 0,
            cellHeat
          ));
        }
      }
    }
  }
  return burnMap;
};
```

**Key insight**: One grid update per tick (cheap), then **every particle pays O(1) lookup** instead of O(n sqrt) distance checks.

---

## Architecture: BurnMap Module

Create `js/core/burn-map.js`:

```javascript
/**
 * Burn Map: Spatial grid of heat intensity [0,1].
 * Similar to gravity-field.js, but for distributed burn sources.
 * 
 * One map, many sources (suns, novas, supernovas, flares).
 * Written once per tick, read by all particles.
 */

const CELL_SIZE = 400;  // px per grid cell (tunable like gravity-field)
const MAX_CELLS = 256;  // 256×256 grid = 102,400 world units

export const BurnMap = {
  grid: new Float32Array(MAX_CELLS * MAX_CELLS),
  cellSize: CELL_SIZE,
  
  clear: () => {
    BurnMap.grid.fill(0);
  },
  
  set: (cellX, cellY, intensity) => {
    if (cellX < 0 || cellX >= MAX_CELLS || cellY < 0 || cellY >= MAX_CELLS) return;
    BurnMap.grid[cellY * MAX_CELLS + cellX] = Math.max(
      BurnMap.grid[cellY * MAX_CELLS + cellX],
      Math.min(intensity, 1)
    );
  },
  
  get: (cellX, cellY) => {
    if (cellX < 0 || cellX >= MAX_CELLS || cellY < 0 || cellY >= MAX_CELLS) return 0;
    return BurnMap.grid[cellY * MAX_CELLS + cellX];
  },
  
  /**
   * Write all burn sources to the map in one pass.
   * @param {Array} suns - [{x, y, burnRadius, mass}]
   * @param {Array} novas - [{x, y, life, birthTime}]
   * @param {Array} supernovas - [{x, y, life, birthTime}]
   */
  update: (suns, novas, supernovas) => {
    BurnMap.clear();
    
    // Main suns
    for (const sun of suns) {
      BurnMap.writeSource(sun.x, sun.y, sun.burnRadius, 1.0, 1.0);
    }
    
    // Novas (temporary, fade)
    for (const nova of novas) {
      const life = nova.life || 0;  // [0,1] or managed externally
      if (life > 0) {
        BurnMap.writeSource(nova.x, nova.y, 500, 0.7, life);
      }
    }
    
    // Supernovas (large, intense, fade)
    for (const sn of supernovas) {
      const life = sn.life || 0;
      if (life > 0) {
        BurnMap.writeSource(sn.x, sn.y, 1500, 0.95, life);
      }
    }
  },
  
  /**
   * Write one burn source to grid with falloff.
   */
  writeSource: (srcX, srcY, radius, intensity, lifeAlpha) => {
    const cx = Math.floor(srcX / CELL_SIZE);
    const cy = Math.floor(srcY / CELL_SIZE);
    const cellRadius = Math.ceil(radius / CELL_SIZE) + 1;
    
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const dist = Math.hypot(dx * CELL_SIZE, dy * CELL_SIZE);
        if (dist < radius) {
          const falloff = 1 - (dist / radius);
          const cellHeat = intensity * falloff * lifeAlpha;
          BurnMap.set(cx + dx, cy + dy, cellHeat);
        }
      }
    }
  },
  
  /**
   * Query heat at a world position.
   */
  queryHeat: (x, y) => {
    const cellX = Math.floor(x / CELL_SIZE);
    const cellY = Math.floor(y / CELL_SIZE);
    return BurnMap.get(cellX, cellY);
  }
};
```

---

## Integration into tick.js

**Replace distance checks with burn map queries:**

```javascript
// OLD (line 157-162)
const sdx = sunX - lp.x, sdy = sunY - lp.y;
const sd2 = sdx * sdx + sdy * sdy;
const sd = Math.sqrt(sd2) + 0.1;
const inBurnZone = sd < sunBurnR * 4;
const inCritical = sd < sunBurnR;

// NEW
const heat = BurnMap.queryHeat(lp.x, lp.y);
const inBurnZone = heat > 0.1;   // Tunable thresholds
const inCritical = heat > 0.8;
```

**Replace heat accumulation with map value:**

```javascript
// OLD (line 212-215)
if (lp.isBurnt) {
  lp.heat = sd < sunBurnR * 3 ? Math.min(1, lp.heat + 0.015 * dt) : Math.max(0.5, lp.heat - 0.003 * dt);
} else {
  lp.heat = sd < sunBurnR * 3 ? Math.min(1, lp.heat + 0.02 * dt) : Math.max(0, lp.heat - 0.008 * dt);
}

// NEW
const mapHeat = BurnMap.queryHeat(lp.x, lp.y);
const heatRate = lp.isBurnt ? 0.015 : 0.02;
const coolingRate = lp.isBurnt ? 0.003 : 0.008;
lp.heat = mapHeat > 0.1 
  ? Math.min(1, lp.heat + heatRate * mapHeat * dt)
  : Math.max(0, lp.heat - coolingRate * dt);
```

---

## Integration into bodies (particles)

For body particles (not loose), same approach:

```javascript
// In bodies.particles loop
for (const p of body.particles) {
  const mapHeat = BurnMap.queryHeat(p.x, p.y);
  
  if (mapHeat > 0.3) {
    p.heat = Math.min(1, p.heat + 0.025 * mapHeat * dt);
    // Spring break rate scales with burn intensity
    if (Math.random() < mapHeat * 0.01 * dt) {
      // Break spring near this particle
    }
  } else {
    p.heat = Math.max(0, p.heat - 0.005 * dt);
  }
}
```

---

## Rendering: Visualize Burn Map (Debug)

Add burn map visualization to debug panels:

```javascript
// renderer.js debug draw
if (Gate.pass('debug.burnMap')) {
  const { grid, cellSize, queryHeat } = BurnMap;
  ctx.globalAlpha = 0.3;
  
  for (let cy = 0; cy < 256; cy++) {
    for (let cx = 0; cx < 256; cx++) {
      const heat = BurnMap.get(cx, cy);
      if (heat > 0) {
        const r = Math.floor(30 + heat * 225);
        ctx.fillStyle = `rgba(${r},0,0,${heat * 0.5})`;
        ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize);
      }
    }
  }
  ctx.globalAlpha = 1;
}
```

Visualizing the map shows:
- Main sun as bright red blob
- Nova rings radiating outward
- Supernova as massive orange zone
- All heat falloff in real time

---

## Burn Events: Nova / Supernova

Replace simple flashes with actual burn sources:

```javascript
// In physics or input handler
export const triggerNova = (x, y) => {
  state.novas.push({
    id: nextId(),
    x, y,
    life: 0.5,        // Fade over 0.5 seconds
    birthTime: performance.now(),
    radius: 500,
    intensity: 0.7
  });
  // Burn map picks this up automatically next tick
};

export const triggerSupernova = (x, y) => {
  state.supernovas.push({
    id: nextId(),
    x, y,
    life: 1.5,        // Longer duration
    birthTime: performance.now(),
    radius: 1500,
    intensity: 0.95
  });
  // All particles in 1500px radius burn instantly
};

// Decay novas/supernovas naturally
state.novas = state.novas.filter(n => {
  const age = (performance.now() - n.birthTime) / 1000;
  n.life = Math.max(0, 0.5 - age);
  return n.life > 0;
});
```

---

## Performance Gains

| Operation | Old | New | Gain |
|-----------|-----|-----|------|
| Per-loose-particle burn check | 3× (sqrt + 2× compare) | 1× (grid lookup) | **3× faster** |
| Per-body-particle burn check | 3× (sqrt + 2× compare) | 1× (grid lookup) | **3× faster** |
| Multiple suns support | O(n) per particle | O(1) per particle | **Scales linearly with suns** |
| Nova/supernova cost | n/a (not feasible before) | O(grid size) once/tick | **Enables feature** |
| Memory | ~0 | ~256KB (32-bit float grid) | Negligible |

---

## Implementation Order

1. **Create** `js/core/burn-map.js` (simple spatial grid, like gravity-field.js)
2. **Import** into `js/modules/physics/tick.js`
3. **Call** `BurnMap.update(suns, novas, supernovas)` at tick start
4. **Replace** distance checks → `BurnMap.queryHeat(x, y)` queries
5. **Add** `state.novas` and `state.supernovas` arrays
6. **Test**: Trigger novas/supernovas, watch particles burn everywhere
7. **Debug**: Add burn map visualization to confirm grid is correct
8. **Tune**: Cell size (400px is start), falloff curves, intensity scales

---

## Expected Results

**Before** (current):
- Only main sun burns particles
- Expensive sqrt check per particle
- FPS cliff when many particles near sun
- No supernova mechanic possible

**After** (burn map):
- Main sun + novas + supernovas all burn simultaneously
- 3× faster particle heat calculation
- Smooth 60 FPS even with distributed burn sources
- Visually rich: "little suns everywhere" with natural heat falloff
- Enables game mechanic: cascade nova events (star dies → supernova → ignites nearby stars)

---

## Code Files to Create/Modify

**New files:**
- `js/core/burn-map.js` — the map itself (~150 lines)

**Modified files:**
- `js/modules/physics/tick.js` — swap distance checks for burn map queries (~30 lines)
- `js/core/state.js` — add `novas`, `supernovas` arrays
- `js/modules/rendering/renderer.js` — optional debug visualization

**Minimal risk**: Burn map is isolated, reads from it are a drop-in replacement for distance checks.

---

## Summary

You've identified the **right architectural pattern**: 
- Gravity Field works because it pre-computes forces on a spatial grid.
- Collision Heatmap works because it pre-computes spring stress on a grid.
- Burn Map works because it pre-computes heat on a grid.

All three follow the same principle: **"One grid, many queries."**

With burn map, "little suns everywhere" is not just feasible—it's **faster and simpler** than the current single-sun design.

Shall we build it?
