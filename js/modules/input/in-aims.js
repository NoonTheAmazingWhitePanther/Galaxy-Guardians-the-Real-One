/**
 * js/modules/input/in-aims.js
 * AIMS binding layer for Galaxy Guardians.
 *
 * AIMS is a 2D ray cast (see core/aims-cast.js) applied to touch input:
 * ONE resolution function, cast(x, y, radius), used every time — never a
 * separate "different input module" taking over. Only the numbers change.
 *
 * SCOPE (rules.md §8 — "HTML buttons are a no-go for AIMS"):
 *   - satellite buttons (dbg-sat / aims-sat / paint-sat), while active
 *   - debug panels (canvas-drawn, "virtual space")
 *   - nothing else. HTML buttons/bars always use plain native touch.
 *
 * Toggle: InAims.enable() / InAims.disable() / Tab key.
 * Long-press aims-btn (main.js): InAims.toggleMode() — 'fake' (default,
 * tight radius) ⇄ 'real' (full finger-size radius) — same cast() either
 * way, just a different radius. See rules.md §8.
 */

import { Aims }              from '../../core/aims.js';
import { AimsCast }          from '../../core/aims-cast.js';
import { CanvasSatellites }  from '../ui/canvas-satellites.js';

// ── Injected deps (no circular imports) ──────────────────────────────────
let _canvas     = null;
let _InputState = null;
let _InUI       = null;
let _InDebug    = null;
let _enabled    = false;

// Radius presets — the ONLY thing that differs between modes. 'real' reuses
// the historical AIM_RADIUS (core/aims.js) finger-size constant; 'fake' is
// deliberately tight (mostly leans on the offset alone, minimal extra
// forgiveness) so the two feel meaningfully different to hold-switch between.
const FAKE_RADIUS = 2;

// ── Public API ────────────────────────────────────────────────────────────
export const InAims = {

  get enabled() { return _enabled; },

  _mode: 'fake',
  get mode() { return InAims._mode; },
  toggleMode() {
    InAims._mode = (InAims._mode === 'fake') ? 'real' : 'fake';
    console.log('[InAims] mode →', InAims._mode, '(radius', InAims.castRadius + 'px)');
    return InAims._mode;
  },
  get castRadius() {
    return InAims._mode === 'real' ? Aims.aim.radius : FAKE_RADIUS;
  },

  /**
   * THE resolution function. One cast, at (x, y) with the current mode's
   * radius, against every live satellite + debug panel — read fresh, every
   * single call, straight off the DOM/panel state, never from a cache.
   * Called from InputModule._deferAimsRetry, already one loop cycle after
   * the original miss, so doing real, live work here (not reading from
   * anything pre-built) is "slow but only once": paid exactly once per
   * unresolved tap, never proactively, never on a timer, nothing to keep
   * in sync by hand — the reason `syncDebugPanels()` used to have to be
   * called from a dozen places elsewhere whenever a panel moved.
   */
  resolve(x, y) {
    const hit = AimsCast.cast(x, y, InAims.castRadius);
    if (!hit) return false;

    if (hit.type === 'satellite') {
      CanvasSatellites.fireTap(hit.satellite);
      return true;
    }
    if (hit.type === 'panel') {
      _InDebug?.handleDown?.({
        clientX: x, clientY: y, pointerId: 0,
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
      });
      return true;
    }
    return false;
  },

  // Show/Hide Map — debug-only overlay toggle for aims-sat-showmap. The
  // render call site (main.js) is already gated to debug/tuning-active
  // contexts, so this flag only ever has a visible effect there.
  showMap: true,
  toggleShowMap() {
    InAims.showMap = !InAims.showMap;
    return InAims.showMap;
  },

  init(canvas, InputState, InUI, InDebug) {
    _canvas     = canvas;
    _InputState = InputState;
    _InUI       = InUI;
    _InDebug    = InDebug;
  },

  enable() {
    if (_enabled) return;
    _enabled = true;
    console.log('[InAims] AIMS enabled | mode:', InAims._mode);
  },

  disable() {
    _enabled = false;
    console.log('[InAims] AIMS disabled');
  },

  // Legacy no-ops — kept so the many existing `window._InAims?.X?.()`
  // call sites elsewhere (debug-router.js, in-debug.js, in-ui.js,
  // panel-arrange.js, prefs-store.js) don't need to change. Under the old
  // bitmap design these had to proactively re-sync a cache after every
  // panel move/resize; under AimsCast there's no cache to sync — every
  // cast() call already reads live state, every time. Not dead code paths
  // that silently fail — deliberate no-ops with somewhere to point back to.
  syncDebugPanels() {},
  onResize() {},

  /**
   * Refresh — aims-sat-refresh's action. Under the old bitmap design this
   * force-rebuilt the registration cache; there's no cache left to
   * rebuild, so this is now a confirmation no-op rather than invented new
   * behaviour. Logs so the button still visibly does SOMETHING on tap
   * rather than feeling dead.
   */
  refresh() {
    console.log('[InAims] cast() reads live state on every call — nothing to refresh.');
  },

  debugDraw(ctx, showMap = false) {
    if (!_enabled || !showMap) return;
    // Live visualization of the ACTUAL current cast candidates — every
    // satellite + panel cast() would consider right now — rather than a
    // rasterized snapshot of a pixel map that could silently go stale.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = 1;
    for (const c of AimsCast.allCandidates()) {
      ctx.strokeStyle = c.type === 'panel' ? 'rgba(130,210,255,0.6)' : 'rgba(255,200,80,0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(c.rect.left * dpr, c.rect.top * dpr, c.rect.width * dpr, c.rect.height * dpr);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
};
