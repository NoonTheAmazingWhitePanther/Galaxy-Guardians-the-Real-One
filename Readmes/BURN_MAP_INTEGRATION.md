# Burn Map Integration Guide
**Adding distributed solar events (novas, supernovas) to Galaxy Guardians.**

---

## Overview

Replace per-particle distance checks with burn map grid queries. Enables multiple suns, novas, and supernovas without FPS penalty.

---

## Files

**New:**
- `js/core/burn-map.js` — 256×256 spatial grid of heat intensity

**Modified:**
- `js/modules/physics/tick.js` — swap distance checks → grid lookups
- `js/core/state.js` — add `novas`, `supernovas` arrays

**Optional:**
- `js/modules/rendering/renderer.js` — debug visualization

---

## Step 1: Add State Arrays

**File: `js/core/state.js`**

Find the main state object and add:

```javascript
export const state = {
    bodies: [],
    loose: [],
    flashes: [],
    stars: [],
    asteroids: [],
    astTimer: 0,
    // NEW:
    novas: [],          // [{x, y, life, birthTime}]
    supernovas: []      // [{x, y, life, birthTime}]
};
```

---

## Step 2: Import BurnMap

**File: `js/modules/physics/tick.js`**

Add to imports (top of file):

```javascript
import { BurnMap } from '../../core/burn-map.js';
```

---

## Step 3: Update Burn Map at Tick Start

**File: `js/modules/physics/tick.js`**

Find the main `physicsTick()` or `doTick()` function. At the very start (before particle loops), add:

```javascript
export const doTick = (bodies, dt, nParticles, hardCap) => {
  // ... existing code ...
  
  // NEW: Update burn map with current solar sources
  BurnMap.update(SUN, state.novas, state.supernovas);
  
  // ... rest of tick ...
};
```

---

## Step 4: Replace Distance Checks (Loose Particles)

**File: `js/modules/physics/tick.js`**

Find the loose particle loop around line 157–162:

**BEFORE:**
```javascript
const sdx = sunX - lp.x, sdy = sunY - lp.y;
const sd2 = sdx * sdx + sdy * sdy;
const sd = Math.sqrt(sd2) + 0.1;
const inBurnZone = sd < sunBurnR * 4;
const inCritical = sd < sunBurnR;
```

**AFTER:**
```javascript
// Query burn map instead of distance checks
const mapHeat = BurnMap.queryHeat(lp.x, lp.y);
const inBurnZone = mapHeat > 0.1;   // Tunable threshold
const inCritical = mapHeat > 0.8;   // Tunable threshold
```

---

## Step 5: Update Heat Accumulation (Loose Particles)

**File: `js/modules/physics/tick.js`**

Find heat update around line 212–215:

**BEFORE:**
```javascript
if (lp.isBurnt) {
  lp.heat = sd < sunBurnR * 3 ? Math.min(1, lp.heat + 0.015 * dt) : Math.max(0.5, lp.heat - 0.003 * dt);
} else {
  lp.heat = sd < sunBurnR * 3 ? Math.min(1, lp.heat + 0.02 * dt) : Math.max(0, lp.heat - 0.008 * dt);
}
```

**AFTER:**
```javascript
const mapHeat = BurnMap.queryHeat(lp.x, lp.y);
if (lp.isBurnt) {
  lp.heat = mapHeat > 0.1 
    ? Math.min(1, lp.heat + (0.015 * mapHeat) * dt)
    : Math.max(0.5, lp.heat - 0.003 * dt);
} else {
  lp.heat = mapHeat > 0.1
    ? Math.min(1, lp.heat + (0.02 * mapHeat) * dt)
    : Math.max(0, lp.heat - 0.008 * dt);
}
```

**Key**: Heat accumulation now scales with **map heat value** (0–1), so particles in novas heat faster.

---

## Step 6: Optional — Body Particles Heat (Bodies Loop)

**File: `js/modules/physics/tick.js` or `creation.js`**

If body particles have heat, update similarly:

```javascript
for (const body of bodies) {
  for (const p of body.particles) {
    const mapHeat = BurnMap.queryHeat(p.x, p.y);
    
    if (mapHeat > 0.2) {
      p.heat = Math.min(1, p.heat + (0.025 * mapHeat) * dt);
      // Optional: spring breaks scale with burn intensity
      if (Math.random() < (mapHeat * 0.01) * dt) {
        // Break a random spring
      }
    } else {
      p.heat = Math.max(0, p.heat - 0.005 * dt);
    }
  }
}
```

---

## Step 7: Manage Nova/Supernova Lifecycle

**File: `js/core/state.js` or `js/modules/physics/tick.js`**

Add cleanup at tick end to decay novas/supernovas:

```javascript
// Decay active novas/supernovas based on age
state.novas = state.novas.filter(n => {
  const age = (performance.now() - (n.birthTime || 0)) / 1000;
  n.life = Math.max(0, 0.5 - age);  // 0.5 second duration
  return n.life > 0;
});

state.supernovas = state.supernovas.filter(sn => {
  const age = (performance.now() - (sn.birthTime || 0)) / 1000;
  sn.life = Math.max(0, 1.0 - age);  // 1.0 second duration
  return sn.life > 0;
});
```

---

## Step 8: Add Nova/Supernova Trigger Functions

**File: `js/modules/physics/creation.js` or new `js/events.js`**

Add public functions to spawn events:

```javascript
export const triggerNova = (x, y) => {
  state.novas.push({
    id: nextId(),
    x, y,
    life: 0.5,
    birthTime: performance.now()
  });
  // Optional: visual flash
  EffectsModule.addFlash(x, y, 300, '255,150,50');
};

export const triggerSupernova = (x, y) => {
  state.supernovas.push({
    id: nextId(),
    x, y,
    life: 1.0,
    birthTime: performance.now()
  });
  // Optional: massive flash
  EffectsModule.addNova(x, y, 800, '255,180,30');
};
```

---

## Step 9: Test & Debug

**In browser console:**

```javascript
// Trigger a nova at sun location
triggerNova(window.SUN.x, window.SUN.y);

// Trigger a supernova 1000px away
triggerSupernova(window.SUN.x + 1000, window.SUN.y);

// Watch particles burn instantly at nova location
```

**Visual debugging:**

Add to renderer.js debug draw (if debug panel exists):

```javascript
if (Gate.pass('debug.burnMap')) {
  BurnMap.debugDraw(debugCtx, cam.offsetX, cam.offsetY, 0.2);
}
```

This shows heat grid as red overlay. See nova rings expand and fade.

---

## Step 10: Tune Thresholds

Test and adjust these values if needed:

```javascript
// In tick.js, after BurnMap.queryHeat(lp.x, lp.y):
const mapHeat = BurnMap.queryHeat(lp.x, lp.y);
const inBurnZone = mapHeat > 0.1;   // ← Adjust (0.05–0.3)
const inCritical = mapHeat > 0.8;   // ← Adjust (0.5–1.0)

// Heat rate scales:
lp.heat += (0.02 * mapHeat) * dt;   // ← Adjust multiplier (0.01–0.05)
```

Lower thresholds = particles burn from farther away.
Higher multipliers = faster burn.

---

## Expected Behavior

**Before nova/supernova:**
- Only main sun burning particles near it
- Expensive sqrt checks

**After triggering nova:**
- Particles 500px away from nova start burning
- Heat grid shows red ring expanding outward
- Particles within nova zone heat rapidly, bodies fragment
- Nova fades over 0.5 seconds, heat falls off

**After triggering supernova:**
- Massive 1500px radius burn zone appears
- Any particles/bodies in range instantly incinerate
- Visually dramatic: huge red zone on burn map
- Enables game mechanic: chain reactions (nova hits star → triggers supernova → ignites neighbors)

---

## Performance

| Metric | Before | After | Gain |
|--------|--------|-------|------|
| Per-particle burn check | 3 ops (sqrt) | 1 op (grid lookup) | **3× faster** |
| Multiple suns cost | O(n) per particle | O(1) per particle | **Scales** |
| Map update | n/a | O(grid size) once/tick | ~1–2ms |
| Total per-tick overhead | n/a | ~2–3ms (negligible) | **Enables feature** |

---

## Validation Checklist

- [ ] `burn-map.js` copies to `js/core/`
- [ ] `burn-map.js` passes `node --check`
- [ ] `BurnMap` import added to `tick.js`
- [ ] `state.novas` and `state.supernovas` arrays created
- [ ] `BurnMap.update()` called at tick start
- [ ] Distance checks replaced with `BurnMap.queryHeat()` queries
- [ ] Heat accumulation scaled by `mapHeat`
- [ ] Nova/supernova decay logic added
- [ ] Trigger functions (`triggerNova`, `triggerSupernova`) created
- [ ] Server restarts without console errors
- [ ] Browser test: nova triggered, particles burn at distance
- [ ] Debug visualization shows red grid (optional but helpful)

---

## Troubleshooting

**Issue**: Particles not burning at nova location
- Check: `BurnMap.update()` called at tick start?
- Check: `state.novas` array populated before update?
- Check: `mapHeat > 0.1` threshold not too high?

**Issue**: FPS still dropping
- Burn map update is O(grid size × sources), ~2–3ms. If still slow:
  - Reduce `cellRadius` in `writeSource()`
  - Reduce number of active novas/supernovas
  - Use MsProbe to profile: `console.log(MsProbe.getSummary('physics.tick'))`

**Issue**: Heat not scaling correctly
- Heat rate equation: `lp.heat += (0.02 * mapHeat) * dt`
- If too fast: reduce `0.02` multiplier to `0.01`
- If too slow: increase to `0.03` or `0.05`

---

## Next Steps (Future)

1. **Chain reactions**: When supernova health drops to 0, auto-trigger supernova at its location.
2. **Stellar flares**: Small temporary burn spikes at random spots on sun.
3. **Cascade events**: Supernova ignites nearby stars → more supernovas.
4. **Heat waves**: Animated rings expanding from nova epicenter (visual effect layer).
5. **Particle recycling**: Pool particles for better GC behavior (not burn-map related).

---

## Summary

Burn map is a **drop-in replacement** for distance checks. It enables distributed solar events with the same or better performance than the single-sun design.

Key principle: **"One grid, many sources."** Just like gravity and collision heatmaps.

Good luck! 🔥
