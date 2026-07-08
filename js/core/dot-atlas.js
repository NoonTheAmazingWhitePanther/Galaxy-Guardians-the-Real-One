/**
 * js/core/dot-atlas.js
 * Billboard render-to-texture — the standard imposter technique.
 *
 * REPLACES the old stability-heuristic cache (hasChanged / needsCheckUp /
 * isCached / fade in-out). That model tracked staleness INDIRECTLY by
 * sampling for changes, and had a structural hole: any state that bypassed
 * DotAtlas.draw entirely (e.g. burning bypassing the cache) also bypassed
 * the change-detection that would have invalidated it — so on return to a
 * cacheable state, it showed whatever sprite was sitting there from before,
 * ignoring everything that happened in between. Two rounds of patching that
 * heuristic kept finding new holes of the same shape.
 *
 * THIS MODEL instead separates two concerns that don't need to be coupled:
 *   1. The BLIT — draw one quad (drawImage) onto the main canvas. Happens
 *      every single frame, unconditionally. Cheap.
 *   2. The REFRESH — redraw the billboard's offscreen content via the real
 *      drawNormalFn. Happens on a cadence: every frame while heat > 0.05
 *      (actively dynamic — burning, melting, color-shifting), otherwise at
 *      most every REFRESH_COLD_MS.
 *
 * There is no "isCached" flag to get stuck. Worst case the billboard is
 * REFRESH_COLD_MS old — then it self-heals on its own next refresh,
 * guaranteed, every time, with no separate bypass path required.
 *
 * The offscreen render is still the REAL drawNormalFn, redirected — same
 * "real snapshot" principle as before, just on a much simpler schedule.
 */

import { MsProbe } from './ms-probe.js';
import { QueOps } from './que-ops.js';

export const DotAtlas = {
  REFRESH_HOT_MS: 0,      // every frame while heat > 0.05 (visually dynamic)
  REFRESH_COLD_MS: 400,   // baseline cold cadence, at full screen prominence

  // ── Screen-space LOD ("the soldier") ────────────────────────────────────
  // Below this on-screen radius (px), a body's cold cadence starts easing
  // off — you're too far away or too zoomed out to tell it apart from a
  // slightly-stale one. Never applies to hot bodies: an actively burning
  // one must not visibly stutter regardless of how small it's drawn.
  SCREEN_PROMINENCE_PX: 40,
  MAX_COLD_SLOWDOWN: 4,   // cold cadence never exceeds REFRESH_COLD_MS × this

  debugInfo: {
    activeCaches: 0,
    totalBodies: 0
  },

  /**
   * Initialize billboard cache for a body.
   */
  initCache: (body) => {
    // GATE: Don't cache dead/burnt planets (heat >= 2.0 — disintegrating)
    if (body.heat && body.heat >= 2.0) {
      return null;
    }
    return {
      billboardCanvas: null,
      lastRefresh: -Infinity  // force an immediate first refresh
    };
  },

  /**
   * Redraw the billboard's offscreen content via the real drawNormalFn.
   * Whatever bodies.js draws live is exactly what lands in the billboard —
   * no separate approximation to keep in sync.
   */
  refresh: (body, cache, drawNormalFn) => {
    MsProbe.call('dotatlas.captureSprite', () => {
      const size = Math.ceil(body.radius * 4);
      if (!cache.billboardCanvas || cache.billboardCanvas.width !== size) {
        cache.billboardCanvas = document.createElement('canvas');
        cache.billboardCanvas.width = size;
        cache.billboardCanvas.height = size;
      } else {
        // Reset the bitmap without a rectangle draw call: reassigning
        // width clears the canvas to transparent (property mutation, not
        // a fillRect/clearRect op). Still necessary — embers use additive
        // 'lighter' blending, so without a reset, hot bodies (refreshed
        // every frame) would stack brightness frame over frame and blow out.
        cache.billboardCanvas.width = size;
      }

      const bctx = cache.billboardCanvas.getContext('2d');
      bctx.save();

      // drawNormalFn draws in world coordinates (body.cx/cy) — shift the
      // billboard's coordinate system so that world position lands
      // centered in the billboard.
      bctx.translate(size / 2 - body.cx, size / 2 - body.cy);
      drawNormalFn(bctx);

      bctx.restore();
      cache.lastRefresh = performance.now();
    });
  },

  /**
   * Always blits the billboard. Refreshes its content first if due.
   *
   * screenRadius (px, optional): the body's on-screen size right now. Cold
   * bodies drawn small (peripheral, or the view is zoomed out) get a slower
   * refresh cadence — presentation-only, physics is never touched by this.
   * Omit it (or pass 0) to always use the baseline cold cadence.
   */
  draw: (ctx, body, cache, drawNormalFn, screenRadius = Infinity) => {
    const now = performance.now();
    const hot = !!(body.heat && body.heat > 0.05);

    let interval;
    if (hot) {
      interval = DotAtlas.REFRESH_HOT_MS;   // always full rate, never throttled
    } else {
      const prominence = Math.min(1, screenRadius / DotAtlas.SCREEN_PROMINENCE_PX);
      const slow = 1 + (1 - prominence) * (DotAtlas.MAX_COLD_SLOWDOWN - 1);
      interval = DotAtlas.REFRESH_COLD_MS * slow;
    }

    const firstEver = !cache.billboardCanvas;
    const due = firstEver || (now - cache.lastRefresh) >= interval;

    // Cold refreshes are deferrable presentation work — they respect the
    // shared frame ledger QueOps opened at the top of this frame, and
    // simply wait for next frame if it's already tight (same self-healing
    // guarantee the cadence itself already relies on). Hot bodies and a
    // body's first-ever refresh are never gated: an actively burning body
    // must not visibly stutter, and a body can't stay blank forever.
    if (due && (firstEver || hot || QueOps.remaining() > 0)) {
      DotAtlas.refresh(body, cache, drawNormalFn);
    }

    const bc = cache.billboardCanvas;
    ctx.drawImage(bc, body.cx - bc.width / 2, body.cy - bc.height / 2);
  }
};
