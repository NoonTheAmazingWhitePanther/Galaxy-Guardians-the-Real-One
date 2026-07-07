/**
 * js/core/dot-atlas.js
 * Simplified: Cache planets only when stable (no shape changes for N ms).
 * Stability thresholds: 33ms, 66ms, 99ms, 180ms, 360ms
 * 
 * Default: render normally
 * Stable 33ms+: capture and cache
 * On change: fade out cache, back to normal
 * Stable again: recache
 */

import { MsProbe } from './ms-probe.js';

export const DotAtlas = {
  STABILITY_THRESHOLDS: [33, 66, 99, 180, 360],  // ms
  FADE_IN: 0.1,   // opacity increase per frame
  FADE_OUT: 0.1,  // opacity decrease per frame
  
  /**
   * Debug info provider for panels.
   */
  debugInfo: {
    cachedPlanets: 0,
    activeCaches: 0,
    totalBodies: 0
  },

  /**
   * Initialize cache for a body.
   */
  initCache: (body) => {
    // GATE: Don't cache dead/burnt planets (heat >= 2.0 means they're disintegrating)
    if (body.heat && body.heat >= 2.0) {
      return null;  // No cache for dead planets
    }
    
    return {
      spriteCanvas: null,
      lastChangeTime: performance.now(),
      stableTime: 0,
      isCached: false,
      cacheOpacity: 0,
      lastParticleCount: body.particles.length,
      lastHeat: body.heat || 0
    };
  },

  /**
   * Check if body has changed (shape, heat, particles).
   */
  hasChanged: (body, cache) => {
    const particleCountChanged = Math.abs(body.particles.length - cache.lastParticleCount) > 1;
    const heatChanged = Math.abs((body.heat || 0) - cache.lastHeat) > 0.1;

    if (particleCountChanged || heatChanged) {
      cache.lastChangeTime = performance.now();
      cache.lastParticleCount = body.particles.length;
      cache.lastHeat = body.heat || 0;
      cache.lastCheckTime = performance.now();  // Reset check timer

      // BUG FIX (was comparing body.heat to a value just overwritten to
      // equal body.heat — always false, dead code). ANY detected change
      // invalidates the sprite: it no longer matches the body's current
      // state. Recapture happens next time stability is regained.
      cache.isCached = false;
      cache.cacheOpacity = 0;

      return true;
    }
    return false;
  },

  /**
   * Check-up: Only re-evaluate stability every 1000ms to save cycles.
   * Between check-ups, trust the cached state.
   */
  needsCheckUp: (cache) => {
    const now = performance.now();
    if (!cache.lastCheckTime) {
      cache.lastCheckTime = now;
      return true;
    }
    const timeSinceCheck = now - cache.lastCheckTime;
    if (timeSinceCheck >= 1000) {  // Check every 1 second
      cache.lastCheckTime = now;
      return true;
    }
    return false;
  },

  /**
   * Get stability level (0=unstable, 1-5=stability threshold index).
   */
  getStabilityLevel: (cache) => {
    const stableMs = performance.now() - cache.lastChangeTime;
    for (let i = 0; i < DotAtlas.STABILITY_THRESHOLDS.length; i++) {
      if (stableMs < DotAtlas.STABILITY_THRESHOLDS[i]) {
        return i;
      }
    }
    return DotAtlas.STABILITY_THRESHOLDS.length;
  },

  /**
   * Capture planet to canvas sprite — a REAL snapshot, not a re-implementation.
   * We redirect the exact same drawNormal() the live renderer uses onto an
   * offscreen canvas and grab the pixels it produces. Whatever bodies.js
   * draws live (hull, springs, particles, burn glow, aura, heat sparkles)
   * is what gets cached — pixel-identical, always in sync, no drift, no
   * separate "cardboard" approximation to maintain by hand.
   */
  captureSprite: (ctx, body, cache, drawNormalFn) => {
    MsProbe.call('dotatlas.captureSprite', () => {
      // Pad past the aura radius (body.radius * 1.6, gradient reaches
      // 1.76x) plus room for heat-sparkle halo.
      const size = Math.ceil(body.radius * 4);
      if (!cache.spriteCanvas || cache.spriteCanvas.width !== size) {
        cache.spriteCanvas = document.createElement('canvas');
        cache.spriteCanvas.width = size;
        cache.spriteCanvas.height = size;
      }

      const spriteCtx = cache.spriteCanvas.getContext('2d');
      spriteCtx.clearRect(0, 0, size, size);
      spriteCtx.save();

      // drawNormalFn draws in world coordinates (body.cx/cy), so shift the
      // sprite canvas's coordinate system so that world position lands
      // centered in the sprite.
      spriteCtx.translate(size / 2 - body.cx, size / 2 - body.cy);

      drawNormalFn(spriteCtx);

      spriteCtx.restore();
      cache.isCached = true;
      cache.cacheOpacity = 0;  // Start fade-in
    });
  },

  /**
   * Draw cached sprite or normal render.
   */
  draw: (ctx, body, cache, drawNormal) => {
    // OPTIMIZATION: Only check for changes every 1 second (check-up)
    if (DotAtlas.needsCheckUp(cache)) {
      DotAtlas.hasChanged(body, cache);
    }

    const stabilityLevel = DotAtlas.getStabilityLevel(cache);

    // Not stable enough yet - use normal render, fade out cache
    if (stabilityLevel < 1) {
      cache.cacheOpacity = Math.max(0, cache.cacheOpacity - DotAtlas.FADE_OUT);
      if (cache.cacheOpacity > 0 && cache.spriteCanvas) {
        ctx.globalAlpha = cache.cacheOpacity;
        ctx.drawImage(cache.spriteCanvas, body.cx - cache.spriteCanvas.width / 2, body.cy - cache.spriteCanvas.height / 2);
        ctx.globalAlpha = 1;
      }
      drawNormal();
      return;
    }

    // Stable - capture and fade in cache
    if (!cache.isCached) {
      DotAtlas.captureSprite(ctx, body, cache, drawNormal);
    }

    cache.cacheOpacity = Math.min(1, cache.cacheOpacity + DotAtlas.FADE_IN);

    if (cache.cacheOpacity >= 0.95) {
      // Use cache
      ctx.globalAlpha = 1;
      ctx.drawImage(cache.spriteCanvas, body.cx - cache.spriteCanvas.width / 2, body.cy - cache.spriteCanvas.height / 2);
    } else {
      // Blend cache + normal
      drawNormal();
      if (cache.cacheOpacity > 0 && cache.spriteCanvas) {
        ctx.globalAlpha = cache.cacheOpacity;
        ctx.drawImage(cache.spriteCanvas, body.cx - cache.spriteCanvas.width / 2, body.cy - cache.spriteCanvas.height / 2);
        ctx.globalAlpha = 1;
      }
    }
  }
};
