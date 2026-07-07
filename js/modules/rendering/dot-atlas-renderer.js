/**
 * js/modules/rendering/dot-atlas-renderer.js
 * Simplified: Optional caching layer. Default is normal render.
 */

import { DotAtlas } from '../../core/dot-atlas.js';
import { CameraModule } from '../camera/camera.module.js';
import { MsProbe } from '../../core/ms-probe.js';

export const DotAtlasRenderer = {
  caches: new Map(),  // body.id -> cache

  /**
   * Initialize cache for a body.
   */
  initBody: (body) => {
    MsProbe.call('dotatlas.initBody', () => {
      if (!DotAtlasRenderer.caches.has(body.id)) {
        const cache = DotAtlas.initCache(body);
        if (cache) {  // Only cache if not dead/burnt
          DotAtlasRenderer.caches.set(body.id, cache);
        }
      }
    });
  },

  /**
   * Draw with optional caching layer.
   * Skip if body is tweening, burning, or dead/burnt.
   */
  draw: (ctx, body, drawNormalFn) => {
    MsProbe.call('dotatlas.draw', () => {
      // GATE 1: Dead/burnt planets (heat >= 2.0) — skip entirely, already disintegrating
      if (body.heat && body.heat >= 2.0) {
        return;  // Don't render, planet is gone
      }

      // GATE 2: Skip dot atlas during tween (position/rotation only, no shape change)
      if (body.tween && body.tween.active) {
        drawNormalFn();
        return;
      }

      // GATE 3: Skip cache if burning (0.05 < heat < 2.0) — heat changes color every frame
      // Burning planets must always render particles live to show color shifts
      if (body.heat && body.heat > 0.05) {
        drawNormalFn();
        return;
      }

      // Frustum cull first
      const padding = body.radius * 1.5;
      const cam = CameraModule.cam;
      if (body.cx + padding < cam.x - cam.width / 2 ||
          body.cx - padding > cam.x + cam.width / 2 ||
          body.cy + padding < cam.y - cam.height / 2 ||
          body.cy - padding > cam.y + cam.height / 2) {
        return;  // Off-screen
      }

      DotAtlasRenderer.initBody(body);
      const cache = DotAtlasRenderer.caches.get(body.id);
      
      if (!cache) return;

      // Use caching layer with stability thresholds
      DotAtlas.draw(ctx, body, cache, drawNormalFn);
      
      // Update debug info
      DotAtlas.debugInfo.activeCaches = DotAtlasRenderer.caches.size;
      DotAtlas.debugInfo.totalBodies = 0;  // Will be set by panel
      if (cache.isCached && cache.cacheOpacity > 0.5) {
        DotAtlas.debugInfo.cachedPlanets++;
      }
    });
  },

  /**
   * Clear all caches.
   */
  clearAll: () => {
    DotAtlasRenderer.caches.clear();
  }
};
