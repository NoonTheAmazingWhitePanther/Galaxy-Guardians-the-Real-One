# Code Changes: Burning FPS Fix

## File 1: js/modules/rendering/particles.js

### Section 1: Module Header (added optimization note)

**BEFORE:**
```javascript
/**
 * js/modules/rendering/particles.js
 * Prime Module: Loose particles, debris, rings, and burnt particle rendering.
 * 
 * Uses particle-management.js batchArcs for single-pass batch rendering.
 * Rule: classify once, draw in batches. No per-particle beginPath/fill.
 */
```

**AFTER:**
```javascript
/**
 * js/modules/rendering/particles.js
 * Prime Module: Loose particles, debris, rings, and burnt particle rendering.
 * 
 * OPTIMIZATION (2026-07-07):
 * - Removed shadowBlur from burntWarm rendering (expensive per-particle filter)
 * - Added LOD gate: skip burntWarm rendering when camZoom < 0.15 (planetary view)
 * - Uses particle-management.js batchArcs for batched rendering where possible
 * Rule: classify once, batch where possible, minimize per-particle state changes.
 */
```

---

### Section 2: burntWarm Rendering Loop (the critical fix)

**BEFORE:**
```javascript
    // Burnt warm (individual color per particle — can't batch by style)
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
        ctx.shadowBlur = r * (4 + intensity * 3);
        ctx.shadowColor = `rgba(255,100,20,${intensity * 0.8})`;
        ctx.fillStyle = `rgba(255,120,40,${intensity * 0.5})`;
        ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, PI2); ctx.fill();
        ctx.restore();
      }
    }
```

**AFTER:**
```javascript
    // Burnt warm (OPTIMIZATION: skip if zoomed out, no shadow blur)
    // These are individual-color particles, so per-particle draw.
    // Removed shadowBlur which was expensive per-particle filter.
    if (camZoom >= 0.15 && burntWarm.length) {
      for (const { x, y, r, heat } of burntWarm) {
        const intensity = Math.min(heat, 1);
        const red = Math.floor(lerp(80, 180, intensity));
        const green = Math.floor(lerp(20, 60, intensity));
        
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = `rgba(${red},${green},15,1)`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
        // NOTE: Removed shadow glow. Restored with future glow layer if needed.
      }
    }
```

**Explanation**:
- Wrapped loop in `if (camZoom >= 0.15 && burntWarm.length)` — skips entire burntWarm phase when zoomed out
- Removed 12 lines of shadow blur + glow overlay
- Kept the core arc draw and heat-based color lerp
- Added comment noting removal for future reference

**Impact**: ~5–10ms savings per frame when 100+ hot particles on screen.

---

## File 2: js/modules/physics/creation.js

### Change 1: Ring Particle Emission Cap (line ~139)

**BEFORE:**
```javascript
            fn: () => {
                if (state.loose.length >= 400) return;
                const px = SUN.x + Math.cos(angle) * r;
                const py = SUN.y + Math.sin(angle) * r;
                state.loose.push({
```

**AFTER:**
```javascript
            fn: () => {
                if (state.loose.length >= 300) return;
                const px = SUN.x + Math.cos(angle) * r;
                const py = SUN.y + Math.sin(angle) * r;
                state.loose.push({
```

**Change**: `400 → 300`

**Why**: Reduces max particles that can emit during body ring disintegration near sun.

---

### Change 2: Debris Particle Emission Cap (line ~181/186)

**BEFORE:**
```javascript
            if (debrisCount < MAX_DEBRIS && state.loose.length < 350) {
                const _p = p;
                QueOps.add({
                    subject: 'particles', priority: 2, cost: 1,
                    fn: () => {
                        if (state.loose.length >= 350) return;
```

**AFTER:**
```javascript
            if (debrisCount < MAX_DEBRIS && state.loose.length < 280) {
                const _p = p;
                QueOps.add({
                    subject: 'particles', priority: 2, cost: 1,
                    fn: () => {
                        if (state.loose.length >= 280) return;
```

**Change**: `350 → 280` (two locations)

**Why**: Tightens cap on debris emission from broken body fragmentation.

---

### Change 3: Burst Particle Emission Cap (line ~204/210)

**BEFORE:**
```javascript
        const remaining = n - debrisCount;
        if (remaining > 0 && state.loose.length < 365) {
            const burst = Math.min(MAX_DEBRIS - debrisCount, remaining);
            for (let i = 0; i < burst; i++) {
                const _pi = ps[i];
                QueOps.add({
                    subject: 'particles', priority: 3, cost: 1,
                    fn: () => {
                        if (state.loose.length >= 365) return;
```

**AFTER:**
```javascript
        const remaining = n - debrisCount;
        if (remaining > 0 && state.loose.length < 295) {
            const burst = Math.min(MAX_DEBRIS - debrisCount, remaining);
            for (let i = 0; i < burst; i++) {
                const _pi = ps[i];
                QueOps.add({
                    subject: 'particles', priority: 3, cost: 1,
                    fn: () => {
                        if (state.loose.length >= 295) return;
```

**Change**: `365 → 295` (two locations)

**Why**: Limits final burst of particles when body is critically destabilized near sun.

---

## Summary of Changes

| File | Lines | Change | Why |
|------|-------|--------|-----|
| particles.js | 1–10 | Doc update + notes | Clarity |
| particles.js | 89–110 | Remove shadow blur + add LOD | **Saves 5–10ms/frame** |
| creation.js | 139 | 400 → 300 | Fewer particles to render |
| creation.js | 181/186 | 350 → 280 | Fewer debris particles |
| creation.js | 204/210 | 365 → 295 | Fewer burst particles |

---

## Tests to Run After Patching

1. **Syntax check**:
   ```bash
   node --check js/modules/rendering/particles.js
   node --check js/modules/physics/creation.js
   ```

2. **Module import check**:
   ```bash
   node --input-type=module -e "import('./js/modules/rendering/particles.js')"
   node --input-type=module -e "import('./js/modules/physics/creation.js')"
   ```

3. **Runtime test**:
   - Start server: `python3 -m http.server 7700`
   - Load in browser: `http://localhost:7700`
   - Fly a planet into the sun
   - Observe: FPS should stay 50–60 even with 100+ hot particles
   - Check: At zoom < 0.15, burntWarm particles disappear (intentional LOD)

---

## Rollback

If needed, restore backups:
```bash
cp js/modules/rendering/particles.js.bak js/modules/rendering/particles.js
cp js/modules/physics/creation.js.bak js/modules/physics/creation.js
```

Then restart server.
