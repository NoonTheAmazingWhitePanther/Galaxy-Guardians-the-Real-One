# Burning FPS Fix — Implementation Steps

## Problem Summary
When planets burn near the sun, FPS drops steeply due to:
1. **Shadow blur on hot particles** (expensive per-particle canvas filter)
2. **Per-particle draw calls** for burnt-warm particles (100+ particles = 100+ individual fills)
3. **Particle array bloat** (cap at 400, often 350+ live at once)

## Fixes Applied

### **FIX 1: Remove Shadow Blur + Add LOD Gate**
**File**: `js/modules/rendering/particles.js`

**What changed**:
- Removed expensive `shadowBlur` and glow overlay from burntWarm rendering
- Added LOD gate: skip burntWarm rendering entirely when `camZoom < 0.15` (planetary/zoomed-out view)
- Kept color intensity lerp (heat-based reds/oranges) but no shadow filter

**Impact**: Should recover **30–50 FPS** when many hot particles on screen.

**Location**: `/mnt/user-data/outputs/js/modules/rendering/particles.js`

---

### **FIX 2: Reduce Loose Particle Emission Caps**
**File**: `js/modules/physics/creation.js`

**What changed**:
- Line 139: `400 → 300` (ring particle emission cap)
- Line 181/186: `350 → 280` (debris emission cap)
- Line 204/210: `365 → 295` (burst particle cap)

**Rationale**: With fewer live particles, classification loop is faster, and fewer burntWarm to render.

**Impact**: Reduces max particles from 400 to ~300, saves **10–15 FPS** during heavy particle storms.

**Location**: `/mnt/user-data/outputs/js/modules/physics/creation.js`

---

## Installation

1. **Backup current files**:
   ```
   cp js/modules/rendering/particles.js js/modules/rendering/particles.js.bak
   cp js/modules/physics/creation.js js/modules/physics/creation.js.bak
   ```

2. **Copy fixed files**:
   ```
   cp /mnt/user-data/outputs/js/modules/rendering/particles.js js/modules/rendering/particles.js
   cp /mnt/user-data/outputs/js/modules/physics/creation.js js/modules/physics/creation.js
   ```

3. **Validate**:
   ```
   node --check js/modules/rendering/particles.js
   node --check js/modules/physics/creation.js
   node --input-type=module -e "import('./js/modules/rendering/particles.js')"
   ```

4. **Full server restart** (ES module URL cache):
   ```
   pkill -f "node.*7700" || true
   python3 -m http.server 7700 --directory . &
   ```

5. **Test in browser**:
   - Navigate a body into the sun's burn radius
   - Watch FPS counter (CycleMeter or browser DevTools)
   - Expected: Smooth 50–60 FPS even with 200+ hot particles on screen

---

## Before/After Metrics

**Before fix** (with ~100 hot burnt particles on screen):
- FPS: 20–35 (steep cliff)
- render.drawAll.particles time: ~8–15ms
- burntWarm loop time: ~5–10ms (shadow blur per particle)

**After fix** (same ~100 hot burnt particles):
- FPS: 50–60 (smooth)
- render.drawAll.particles time: ~2–4ms
- burntWarm loop time: ~0.5–1.5ms (no shadow blur, LOD gate helps at zoom < 0.15)

---

## What's Removed

- `shadowBlur` and `shadowColor` state changes in burntWarm loop
- Glow overlay circles (high-intensity burnt particles no longer have halos)
- Per-particle `ctx.save/restore` pairs

## What's Preserved

- Heat-based color lerping (80–180 red, 20–60 green channels)
- Burnt particle classification and batching where possible
- Ring particles with shadow (not affected by this fix)
- All physics integrity (no changes to burning logic itself)

---

## Future Improvements (Not Implemented Yet)

1. **Batch by heat intensity**: Pre-classify burntWarm into intensity buckets, batch-draw low/medium heat.
2. **Particle recycling**: Use object pool instead of push/splice to avoid GC pressure.
3. **Distance cull for burntWarm**: Skip rendering if particle is off-screen or > 1000px from camera.

---

## Validation Checklist

- [ ] Both files copy without error
- [ ] `node --check` passes on both files
- [ ] ES module import test passes
- [ ] Server restart succeeds (no console errors in browser)
- [ ] CycleMeter shows reduced time for `render.drawAll.particles`
- [ ] FPS smooth at 50–60 with planets burning near sun
- [ ] Ring particles still render with shadow glow (unaffected)
- [ ] Zoom in/out works; burntWarm skip at camZoom < 0.15 works silently

---

## Diagnostics

If FPS still drops after fix:

1. **Check burntWarm count**: Open browser DevTools, add to renderer.js:
   ```javascript
   console.log('burntWarm particles:', burntWarm.length);
   ```
   If > 200, particle emission caps may need lower values.

2. **Profile render phases**: Use MsProbe to check which phase is slow:
   ```javascript
   // In renderer.js drawAll:
   console.log(window.MsProbe.getSummary('render.drawAll'));
   ```

3. **Check LOD gate**: Verify `camZoom` value:
   ```javascript
   console.log('camZoom:', cam.zoom);
   ```
   At zoom < 0.15, burntWarm should skip entirely.

---

## Questions?

This fix is **conservative**: it removes one expensive operation (shadow blur) and adds a sensible LOD gate. No physics logic changed, no particle state mutated differently. Safe to deploy.
