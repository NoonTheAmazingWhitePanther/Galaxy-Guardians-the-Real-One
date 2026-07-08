/**
 * js/modules/rendering/dot-atlas-renderer.js
 * Billboard caching layer. Every body draws through DotAtlas.draw — the
 * refresh cadence (every frame while hot, throttled while cold) lives
 * inside DotAtlas itself. No separate "bypass entirely while burning"
 * path anymore — that bypass was the hole that caused stale sprites to
 * resurface after burning ended (it skipped refresh-tracking too).
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
   * Draw via the billboard. Skip entirely only for dead/burnt bodies or
   * active position/rotation tweens (shape isn't changing — draw live so
   * tween motion is never a frame stale) or off-screen bodies.
   */
  draw: (ctx, body, drawNormalFn) => {
    MsProbe.call('dotatlas.draw', () => {
      // GATE 1: Dead/burnt planets (heat >= 2.0) — skip entirely, already disintegrating
      if (body.heat && body.heat >= 2.0) {
        return;  // Don't render, planet is gone
      }

      // GATE 2: Skip billboard during tween (position/rotation only, no
      // shape change) — draw live so tween motion is never a frame stale.
      if (body.tween && body.tween.active) {
        drawNormalFn();
        return;
      }

      // Frustum cull first.
      // BUG FIX: this used to read cam.width/cam.height — those properties
      // never existed (screen dims live on CameraModule.width/height, not
      // CameraModule.cam). Every comparison was against undefined → NaN →
      // always false, so this cull never actually culled anything; every
      // body drew every frame regardless of camera position. Fixed to
      // convert the real screen dimensions to world units via cam.zoom.
      const cam = CameraModule.cam;
      const halfW = (CameraModule.width  / 2) / cam.zoom;
      const halfH = (CameraModule.height / 2) / cam.zoom;
      const padding = body.radius * 1.5;
      if (body.cx + padding < cam.x - halfW ||
          body.cx - padding > cam.x + halfW ||
          body.cy + padding < cam.y - halfH ||
          body.cy - padding > cam.y + halfH) {
        return;  // Off-screen
      }

      DotAtlasRenderer.initBody(body);
      const cache = DotAtlasRenderer.caches.get(body.id);

      if (!cache) {
        // initCache returned null (dead/burnt edge case) — draw live.
        drawNormalFn();
        return;
      }

      // Screen-space size — the "soldier" signal: a body rendered at a
      // handful of pixels (peripheral, or just zoomed out) can't be told
      // apart from a slightly-stale one, so DotAtlas throttles its cold
      // refresh cadence down the smaller this is. A body you're zoomed
      // into stays at full cadence. Physics is never touched by this —
      // it's presentation-only, same guarantee as the cold cadence itself.
      const screenRadius = body.radius * cam.zoom;

      DotAtlas.draw(ctx, body, cache, drawNormalFn, screenRadius);

      DotAtlas.debugInfo.activeCaches = DotAtlasRenderer.caches.size;
      DotAtlas.debugInfo.totalBodies = 0;  // Will be set by panel
    });
  },

  /**
   * Clear all caches.
   */
  clearAll: () => {
    DotAtlasRenderer.caches.clear();
  }
};
