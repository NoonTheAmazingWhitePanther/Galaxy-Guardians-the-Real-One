# Galaxy Guardians — Burning FPS Diagnosis
**When planets burn near the sun, FPS drops steeply. Root cause analysis.**

---

## What's Happening

When bodies approach the sun's burn radius (300px), they:

1. **Physics**: Heat increases rapidly → particles are marked `.isBurnt` → life drains faster → bodies fragment into debris
2. **Particle Emission**: Broken body particles spawn into `state.loose` array (capped at 400 total)
3. **Rendering**: All loose particles must be classified and drawn every frame

The FPS cliff happens because **too many hot/burnt particles need individual per-frame rendering overhead**.

---

## Current Bottlenecks

### 1. **Per-Particle Rendering (Line 91-110 in particles.js)**
```javascript
// Burnt warm particles — individual color per particle
// These are few, so per-particle draw is acceptable
for (const { x, y, r, heat } of burntWarm) {
  const intensity = Math.min(heat, 1);
  const red = Math.floor(lerp(80, 180, intensity));
  const green = Math.floor(lerp(20, 60, intensity));
  
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = `rgba(${red},${green},15,1)`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
  
  // Glow overlay for hot burnt
  if (intensity > 0.2) {
    ctx.save();
    ctx.globalAlpha = intensity * 0.6;
    ctx.shadowBlur = r * (4 + intensity * 3);  // ← EXPENSIVE PER PARTICLE
    ctx.shadowColor = `rgba(255,100,20,${intensity * 0.8})`;
    ctx.fillStyle = `rgba(255,120,40,${intensity * 0.5})`;
    ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, PI2); ctx.fill();
    ctx.restore();
  }
}
```

**Problem**: When 100+ burnt particles are on screen, this loop becomes a bottleneck:
- Per-particle `beginPath/arc/fill` calls × intensity > 100 particles
- **Shadow blur** set on EVERY hot particle (very expensive in canvas)
- `ctx.save/restore` × 2 per hot particle
- Per-particle lerp + color floor operations

**Estimate**: 100 hot/burnt particles × (2 arc fills + 1 shadow blur + state saves) = **~300+ draw calls**, not batched.

---

### 2. **Heat Accumulation Rate (Line 212-214 in tick.js)**
```javascript
if (lp.isBurnt) {
  lp.heat = sd < sunBurnR * 3 ? Math.min(1, lp.heat + 0.015 * dt) : Math.max(0.5, lp.heat - 0.003 * dt);
} else {
  lp.heat = sd < sunBurnR * 3 ? Math.min(1, lp.heat + 0.02 * dt) : Math.max(0, lp.heat - 0.008 * dt);
}
```

When a body disintegrates near the sun:
- All loose particles inherit `heat: rndR(0.3, 0.8)` from emission (creation.js:146)
- Loose particles in `sunBurnR * 3` zone (= 900px) gain heat at **0.02 dt/frame**
- Heat maxes out at 1.0, making all of them render with shadow blur
- Once a body has 50+ hot particles, that's 50+ shadow blur operations per frame

**Estimate**: 50 hot particles × 1 shadow blur = **~50 expensive canvas operations**.

---

### 3. **Particle Array Size**
```javascript
if (state.loose.length >= 400) return;  // creation.js:139
```

The cap is 400 particles. When bodies burn continuously near the sun, the array fills to ~350–400, and **every loose particle in render.drawAll.particles must be looped and classified, even if off-screen**.

**Per-frame cost**: ~350 particles × classification logic + rendering.

---

## The Smoking Gun: Canvas Shadow Blur

Canvas `shadowBlur` is **not cheap**. Every particle with `intensity > 0.2` (heat > 0.2) triggers:
```javascript
ctx.shadowBlur = r * (4 + intensity * 3);
ctx.shadowColor = `rgba(255,100,20,${intensity * 0.8})`;
```

When 100+ hot particles are on screen, the GPU/CPU is computing and applying blur filters **100+ times per frame**. This is the primary FPS killer.

---

## Proposed Fixes (In Priority Order)

### **PRIORITY 1: Disable Shadow Blur in Burnt Particle Rendering**
Remove or gate the shadow blur:

```javascript
// Burnt warm (individual color per particle)
for (const { x, y, r, heat } of burntWarm) {
  const intensity = Math.min(heat, 1);
  const red = Math.floor(lerp(80, 180, intensity));
  const green = Math.floor(lerp(20, 60, intensity));
  
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = `rgba(${red},${green},15,1)`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
  
  // REMOVE or gate the glow. For now: silent kill.
  // if (intensity > 0.2) { ... shadowBlur ... }
}
```

**Impact**: Should recover ~30–50 FPS when 100+ hot particles are on screen.

---

### **PRIORITY 2: Batch by Heat Intensity (Pre-classified)**
Instead of per-particle loop, pre-classify into intensity buckets and batch-draw:

```javascript
// Before loop over burntWarm:
const highHeat = [];    // heat >= 0.5
const mediumHeat = [];  // heat 0.2–0.5
const lowHeat = [];     // heat < 0.2

for (const { x, y, r, heat } of burntWarm) {
  const intensity = Math.min(heat, 1);
  const red = Math.floor(lerp(80, 180, intensity));
  const green = Math.floor(lerp(20, 60, intensity));
  
  if (heat >= 0.5) {
    highHeat.push({ x, y, r, red, green });
  } else if (heat >= 0.2) {
    mediumHeat.push({ x, y, r, red, green });
  } else {
    lowHeat.push({ x, y, r, red, green });
  }
}

// Draw high-heat with per-particle calls (fewer)
for (const { x, y, r, red, green } of highHeat) {
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = `rgba(${red},${green},15,1)`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
}

// Draw medium/low heat batched
if (mediumHeat.length) {
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(100,40,15,0.9)';
  batchArcs(ctx, mediumHeat);
}
```

**Impact**: Reduces per-particle overhead by ~50% for non-critical heat levels.

---

### **PRIORITY 3: LOD for Loose Particles**
Add a camZoom check to skip rendering burnt particles when zoomed out:

```javascript
export const drawLoose: (ctx, camZoom) => {
  // LOD: skip when zoomed out too far
  if (camZoom < 0.05) return;
  
  // NEW: Skip burning particles if very zoomed out
  const skipBurning = camZoom < 0.15;
  
  // ... classification loop ...
  
  // Only render burntWarm if not in low-zoom LOD
  if (!skipBurning) {
    for (const { x, y, r, heat } of burntWarm) {
      // ... render ...
    }
  }
};
```

**Impact**: Reclaims ~20–30 FPS at zoom < 0.15 (planetary view).

---

### **PRIORITY 4: Reduce Loose Particle Emission During Burn**
Tighten the cap on loose particles emitted during body fragmentation:

```javascript
// creation.js:139
if (state.loose.length >= 300) return;  // was 400

// creation.js:181
if (state.loose.length < 300) {  // was 350
```

**Impact**: Fewer particles to classify and render; max 300 instead of 400.

---

### **PRIORITY 5: Implement Particle Recycling / Object Pool**
Instead of `push/splice`, reuse dead particle objects:

```javascript
// Preallocate 400 particle objects at startup
const particlePool = Array.from({ length: 400 }, () => ({ 
  x: 0, y: 0, vx: 0, vy: 0, 
  heat: 0, life: 0, 
  dead: true 
}));

// When emitting: find a dead particle and reuse
const idx = particlePool.findIndex(p => p.dead);
if (idx !== -1) {
  const p = particlePool[idx];
  p.x = px; p.y = py; p.vx = vx; p.vy = vy;
  p.heat = heat; p.life = life; p.dead = false;
  // no push
}
```

**Impact**: Eliminates garbage collection pressure; stable 60 FPS during particle storms. (Requires refactor of state.loose access.)

---

## Recommended Implementation Path

1. **Immediate (easiest)**: Remove shadow blur from burntWarm rendering → should buy **30–50 FPS**.
2. **Next**: Add camZoom LOD gate for burntWarm.
3. **Then**: Batch classify by heat intensity.
4. **Later**: Reduce emission cap + particle recycling.

---

## Testing Strategy

Use **MsProbe** to measure:
```javascript
MsProbe.record('render.drawAll.particles.burntWarm', performance.now() - t0);
```

Before fix: expect **5–15ms** when 100+ hot particles are on screen.
After PRIORITY 1: expect **1–3ms**.

---

## Files to Modify

- `js/modules/rendering/particles.js` → Remove shadowBlur, add LOD, batch by intensity
- `js/modules/physics/creation.js` → Reduce emission caps (400 → 300)
- `js/modules/rendering/renderer.js` → Add MsProbe timing for burntWarm phase

---

## Summary

**Root cause**: Shadow blur + per-particle draw calls when 100+ hot particles on screen.

**Immediate relief**: Disable shadow blur in burntWarm rendering. Should restore smooth FPS.

**Proper fix**: Batch by heat intensity + LOD gates + reduce emission + particle recycling.
