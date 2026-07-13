# Galaxy Guardians: Rendering Deep Dive
**Date:** May 15, 2025

---

## Overview
This rendering system is not just about "drawing shapes." It is a specialized, high-performance engine designed for a specific constraint: **smooth simulation on low-end hardware (e.g., POCO C71)**.

It uses three main architectural tricks:
1. **The Accumulator:** "Phosphor" trails without expensive line math.
2. **The Dot Atlas:** A billboard caching system to skip work for stable bodies.
3. **Sprite Pre-rendering:** Baking star sprites once and only modulating alpha per frame.

---

## 1. The Accumulator (`renderer.js` & `accumulator.js`)
*The most "magical" part. This is how trails are done without a massive number of trails.*

### The Concept
Instead of storing `N` trail coordinates for every planet, the renderer uses a **Ring Buffer of Ghost Canvases**.
* You don't clear the canvas every frame.
* You draw the *previous frame's canvas* onto the current one with slight transparency.
* Old content naturally "decays" or "fades."

### The Loop (Pseudo-code)
```javascript
beginFrame():
  For i from 0 to trailDepth:
    drawImage(canvasHistory[i], alpha=pow(i, 1.4)) // Stack ghosts
  clearRect(headBuffer) // Prepare current frame

flip():
  drawImage(headBuffer, screen)
  head = (head + 1) % trailDepth // Advance buffer
```

*   **Decay:** Controlled by `fadeAlpha` (e.g., 0.55).
*   **Adaptation:** `beginFrame` calculates if physics ran `ticksPerFrame` > 1. If so, it collapses the ring buffer so the trail doesn't stretch too long at high speeds.

---

## 2. The Draw Order (`renderer.js`)
*Everything goes through `DrawAll()`. The order is critical for layering.*

1.  **TweenRenderer:** Interpolate `curX/curY` to `desiredX/desiredY`.
2.  **Accumulator Begin:** Start the decay stack.
3.  **Scale:** `ctx.scale(dpr, dpr)`.
4.  **Starfield:** Draw pre-rendered sprite canvases.
5.  **Camera Transform:** `ctx.translate(-camX, -camY)`.
6.  **Sun:** Rays, Tentacles, Core.
7.  **Trails:** Draw `_drawTrailStamps` (if enabled).
8.  **Bodies:** Soft-body planets (Hull + Particles + Aura).
9.  **Particles:** Loose debris/explosion particles.
10. **Flashes:** Explosion rings.
11. **Finally Blocks:**
    *   `TweenRenderer.revertTweens()` — **Critical:** Always runs, even if Canvas throws an error.
    *   `ctx.restore()` to remove scale/transforms.
12. **Accumulator Flip:** Blit the head buffer to the screen.

---

## 3. Soft-Body Rendering (`bodies.js`)
*Planets are "Soft Bodies." They are made of particles connected by springs.*

### How it renders:
1.  **Convex Hull:** Calculate the mathematical convex hull of all "alive" particles.
2.  **Fill:** Draw a radial gradient inside the hull.
3.  **Burn Overlay:** If `distToSun` is close, apply a second gradient (orange/yellow).
4.  **Springs:** If a spring is stretched > 10% of its length, draw a faint line. This shows the internal tension.
5.  **Aura:** A large, transparent radial gradient around the body.
6.  **Heat Texture:** A "dot at atlas" texture is used to simulate heat on the border.

---

## 4. The Dot Atlas (`dot-atlas-renderer.js`)
*The Optimization: "If it hasn't changed, don't draw it."*

### The Problem
Soft bodies are expensive to render (Hull + Gradients + Particles). Doing this 30 times per frame slows down low-end devices.

### The Solution
**Billboarding:**
1.  We render the planet once to an offscreen `<canvas>` (a "billboard").
2.  We store it in the `DotAtlas`.
3.  Next frame:
    *   Is the body "Hot" (colliding/burning)? -> Re-render and update atlas.
    *   Is the body "Cold" (cruising)? -> Just `drawImage` the cached canvas.
    *   If it hasn't moved much? -> Draw even less frequently.

**Smart Refresh:**
The cache refresh rate adapts to the object's **size on screen**. A small planet far away (10px) doesn't need as frequent cache updates as a giant planet nearby.

---

## 5. Starfield (`effects.js`)
*Background stars use "Sprite Batching."*

*   **Init:** 3 small canvases are created *once* at startup:
    *   `dot`: White point.
    *   `glow`: White point + halo.
    *   `cross`: 4-point spike (large stars).
*   **Draw:** We don't call `arc()` or `fill()` for every star. We just call `drawImage(spriteCanvas, x, y, r, r)` with adjusted alpha.
*   **Result:** This allows us to have hundreds of stars with near-zero CPU cost.

---

## Summary
The rendering system is built on **deferred work** and **simplification**:
1.  **Don't clear.** Let old frames fade.
2.  **Don't draw shapes.** Draw pre-made images.
3.  **Don't update cache.** Only update what is actually moving.
