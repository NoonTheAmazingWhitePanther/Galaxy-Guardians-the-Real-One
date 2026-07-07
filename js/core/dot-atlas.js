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
    const heatChanged = Math.abs(body.heat - cache.lastHeat) > 0.1;
    
    if (particleCountChanged || heatChanged) {
      cache.lastChangeTime = performance.now();
      cache.lastParticleCount = body.particles.length;
      cache.lastHeat = body.heat || 0;
      cache.lastCheckTime = performance.now();  // Reset check timer
      
      // If heat just increased significantly, force immediate recapture
      if (heatChanged && (body.heat || 0) > (cache.lastHeat || 0)) {
        cache.isCached = false;  // Invalidate cache when heating up
        cache.cacheOpacity = 0;
      }
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
   * Capture planet to canvas sprite (simple particle render).
   * High quality: match live particle rendering as closely as possible.
   */
  captureSprite: (ctx, body, cache) => {
    MsProbe.call('dotatlas.captureSprite', () => {
      const size = Math.ceil(body.radius * 2.5);
      if (!cache.spriteCanvas || cache.spriteCanvas.width !== size) {
        cache.spriteCanvas = document.createElement('canvas');
        cache.spriteCanvas.width = size;
        cache.spriteCanvas.height = size;
      }

      const spriteCtx = cache.spriteCanvas.getContext('2d');
      spriteCtx.clearRect(0, 0, size, size);
      spriteCtx.save();
      spriteCtx.translate(size / 2, size / 2);

      // Draw particles with full quality (matching live renderer)
      const alive = body.particles.filter(p => !p.dead);
      
      // Draw convex hull outline first (like live render)
      if (alive.length > 2) {
        const hull = body.particles.filter(p => !p.dead);
        if (hull.length > 2) {
          spriteCtx.strokeStyle = body.pal.lo;
          spriteCtx.lineWidth = 1.2;
          spriteCtx.beginPath();
          spriteCtx.moveTo(hull[0].x - body.cx, hull[0].y - body.cy);
          for (let i = 1; i < hull.length; i++) {
            spriteCtx.lineTo(hull[i].x - body.cx, hull[i].y - body.cy);
          }
          spriteCtx.closePath();
          spriteCtx.stroke();
        }
      }

      // Draw hull fill
      if (alive.length > 2) {
        spriteCtx.fillStyle = body.pal.hi;
        spriteCtx.beginPath();
        spriteCtx.moveTo(alive[0].x - body.cx, alive[0].y - body.cy);
        for (let i = 1; i < alive.length; i++) {
          spriteCtx.lineTo(alive[i].x - body.cx, alive[i].y - body.cy);
        }
        spriteCtx.closePath();
        spriteCtx.fill();
      }

      // Draw particles with glow (high quality)
      for (const p of alive) {
        const dx = p.x - body.cx;
        const dy = p.y - body.cy;
        const r = Math.max(1.5, 2.5);
        
        // Glow
        spriteCtx.fillStyle = `rgba(${p.pal.gc},0.4)`;
        spriteCtx.beginPath();
        spriteCtx.arc(dx, dy, r * 1.8, 0, Math.PI * 2);
        spriteCtx.fill();
        
        // Core
        spriteCtx.fillStyle = `rgba(${p.pal.gc},1)`;
        spriteCtx.beginPath();
        spriteCtx.arc(dx, dy, r, 0, Math.PI * 2);
        spriteCtx.fill();
      }

      // Draw aura (like live render)
      const auraRadius = body.radius * 0.6;
      const auraGrad = spriteCtx.createRadialGradient(0, 0, auraRadius * 0.1, 0, 0, auraRadius);
      auraGrad.addColorStop(0, body.pal.hi + '66');
      auraGrad.addColorStop(0.5, body.pal.lo + '33');
      auraGrad.addColorStop(1, body.pal.lo + '00');
      spriteCtx.fillStyle = auraGrad;
      spriteCtx.beginPath();
      spriteCtx.arc(0, 0, auraRadius, 0, Math.PI * 2);
      spriteCtx.fill();

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
      DotAtlas.captureSprite(ctx, body, cache);
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
