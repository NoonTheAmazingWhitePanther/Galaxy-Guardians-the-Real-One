/**
 * js/core/aims-cast.js
 * AIMS CAST — the 2D equivalent of a 3D ray cast.
 *
 * A 3D engine always casts a ray — same mechanism whether it's a mouse
 * pointer picking an object or a gun's line of fire — and only the ray's
 * origin/direction/length change per use. This is that idea in 2D: ONE
 * function, cast(x, y, radius), used for EVERY AIMS resolution regardless
 * of when it runs or how forgiving it needs to be. Never "a different
 * input module taking over" — just different x, y, and radius fed into
 * the same hit-test/collision-check between a touch point and the
 * virtual-space objects it might be aiming at.
 *
 * "Virtual space" here means exactly what rules.md §8 says AIMS may ever
 * resolve onto: satellite buttons (while visibly active) and debug panels
 * (canvas-drawn, not real DOM). Nothing else is a cast candidate — HTML
 * buttons/bars are never in this list, by design, not by omission.
 *
 * Deliberately NOT a spatial index / pixel bitmap. There are only ever a
 * handful of satellites + panels live at once — a plain linear scan over
 * their LIVE bounds, read fresh on every single cast call (not cached,
 * not registered ahead of time, nothing to go stale or need a manual
 * sync call after a panel moves) is cheap enough that a pre-built pixel
 * array bought nothing but a second thing to keep correct.
 */
import { DebugRouter } from '../modules/debug/debug-router.js';
import { DEBUG_STATE } from '../modules/debug/debug-state.js';
import { CanvasSatellites } from '../modules/ui/canvas-satellites.js';

function _satelliteCandidates() {
  // Satellites are canvas-drawn now, not real DOM — CanvasSatellites is
  // the live source of truth for both position AND visibility (its own
  // isActive() gate), same guarantee the old getBoundingClientRect()
  // zero-rect skip used to give for free, just no longer DOM-dependent.
  return CanvasSatellites.candidates();
}

function _panelCandidates() {
  const out = [];
  // Panels are blitted under translate(viewPan) → scale(viewZoom) — both in
  // debug+panel mode AND in the pinned tuning layer. Identity ONLY in
  // console mode. Same math _registerDebugPanels() used to use.
  const on = !(DebugRouter.masterEnabled && DebugRouter._consoleMode);
  const vz = on ? (DEBUG_STATE.viewZoom || 1) : 1;
  const ox = on ? (DEBUG_STATE.viewPanX || 0) : 0;
  const oy = on ? (DEBUG_STATE.viewPanY || 0) : 0;
  for (const panel of DebugRouter.panels) {
    if (!panel.visible) continue;
    let w = 180, h = 60;
    try {
      const L = panel.computeLayout(panel.getData?.() ?? {});
      if (L && Number.isFinite(L.w) && Number.isFinite(L.h)) { w = L.w; h = L.h; }
    } catch (_) { /* fall back to the placeholder box above */ }
    const rect = { left: panel.x * vz + ox, top: panel.y * vz + oy, width: w * vz, height: h * vz };
    out.push({ type: 'panel', panel, rect, depth: 1 });
  }
  return out;
}

// Shortest distance from point (x,y) to the edge of a rect — 0 if the
// point is already inside it. This is what the radius gets compared
// against: radius=0 only ever hits something you're literally on top of;
// radius>0 forgives being up to that many px away from the nearest edge.
function _distToRect(x, y, rect) {
  const dx = Math.max(rect.left - x, 0, x - (rect.left + rect.width));
  const dy = Math.max(rect.top - y, 0, y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

export const AimsCast = {
  /**
   * The one entry point. Depth breaks ties the same way the old bitmap's
   * depth-layer priority did (panels=1 beat satellites=2 on overlap);
   * within equal depth, closest wins. Returns null on a genuine miss —
   * radius didn't reach anything.
   */
  cast(x, y, radius) {
    const candidates = [..._panelCandidates(), ..._satelliteCandidates()];
    let best = null, bestDist = Infinity;
    for (const c of candidates) {
      const d = _distToRect(x, y, c.rect);
      if (d > radius) continue;
      // <= (not <): on an exact tie — e.g. a point inside two overlapping
      // satellites, both at distance 0 — the LATER candidate wins, which
      // is the one drawn on top (render order = list order). Keeps this
      // deferred path's pick consistent with CanvasSatellites' own
      // immediate hit-test, which iterates back-to-front for the same
      // reason. Visible ⟺ touchable, both paths.
      if (!best || c.depth < best.depth || (c.depth === best.depth && d <= bestDist)) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  },

  /** All current candidates, for the "Show Map" debug visualization. */
  allCandidates() {
    return [..._panelCandidates(), ..._satelliteCandidates()];
  }
};

export default AimsCast;
