/**
 * js/modules/input/in-aims.js
 * AIMS binding layer for Galaxy Guardians.
 *
 * AIMS drives a persistent aim point (Aims.aim.x/y) through one of three
 * PROFILES (aims-profiles.js — Trackpad / Joystick / Offset), and fires
 * synthesized events at the aim into the same "virtual space" chain a
 * real touch would use. Never "a different input module taking over" —
 * the downstream code (debug panels, satellites, world) can't tell an
 * aim-driven event from a real one; only the coordinates, and which
 * profile is computing them, differ. See rules.md §8.
 *
 * SCOPE (rules.md §8 — "HTML buttons are a no-go for AIMS"):
 *   - satellite buttons (dbg-sat / aims-sat / paint-sat), while active
 *   - debug panels (canvas-drawn, "virtual space")
 *   - world/canvas (planet charging, brush painting)
 *   - nothing else. HTML buttons/bars always use plain native touch,
 *     via their own direct listeners — never reachable through AIMS.
 *
 * Toggle: InAims.enable() / InAims.disable() / Tab key.
 * Long-press aims-btn (main.js): InAims.cycleProfile() — Trackpad →
 * Joystick → Offset → Trackpad. Tap still toggles on/off.
 *
 * The aim is ALWAYS visible while enabled (main.js's _drawAimCursor —
 * no longer gated on pointer-down state) and NEVER visible while
 * disabled — "always show the last position so the user knows," per
 * direction. Aims.aim.x/y is untouched while AIMS is off, so turning it
 * back on resumes exactly where the aim was left, not wherever the
 * finger currently is.
 */

import { AimsCast }          from '../../core/aims-cast.js';
import { AimsProfiles }      from './aims-profiles.js';
import { DEBUG_STATE }       from '../debug/debug-state.js';

// ── Injected deps (no circular imports) ──────────────────────────────────
let _canvas     = null;
let _InputState = null;
let _InUI       = null;
let _InDebug    = null;
let _enabled    = false;

// ── Public API ────────────────────────────────────────────────────────────
export const InAims = {

  get enabled() { return _enabled; },

  // Delegates to AimsProfiles — one source of truth for which profile is
  // active, not a separately-tracked mirror of it.
  get profile() { return AimsProfiles.active; },
  get mode() { return AimsProfiles.active.label; },   // display name for the title/HUD
  cycleProfile() {
    const p = AimsProfiles.cycle();
    console.log('[InAims] profile →', p.label);
    return p;
  },

  // Show/Hide Map — debug-only overlay toggle for aims-sat-showmap. The
  // render call site (main.js) is already gated to debug/tuning-active
  // contexts, so this flag only ever has a visible effect there.
  // FIX ("the aims Blueprint is showing whenever it is on, it never needs
  // to be visible"): this defaulted to true, so the dashed-rectangle
  // candidate overlay (debugDraw below) appeared automatically the moment
  // AIMS was enabled, every time, with no one having asked for it. Default
  // is now off — 🗺️ still toggles it on for actual debugging, it just
  // doesn't announce itself uninvited anymore.
  showMap: false,
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
    console.log('[InAims] AIMS enabled | profile:', AimsProfiles.active.label);
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
   * force-rebuilt a registration cache; under the current profile-driven
   * model there's no cache or resolution step to refresh at all — AIMS
   * routes every touch live, through whichever profile is active. Kept as
   * a confirmation no-op rather than invented new behaviour, so the
   * button still visibly does SOMETHING on tap rather than feeling dead.
   */
  refresh() {
    console.log('[InAims] nothing to refresh — AIMS routes every touch live now.');
  },

  /**
   * "Show Map" (aims-sat-showmap) — diagnostic overlay only, not what
   * AIMS actually resolves against anymore (there's no resolution step;
   * see the header comment). Still useful as a live view of the two
   * "virtual space" categories §8 defines — satellites and debug panels
   * — via AimsCast.allCandidates(), which is otherwise unused now.
   */

  debugDraw(ctx, showMap = false) {
    if (!_enabled || !showMap) return;
    // Live visualization of the ACTUAL current cast candidates — every
    // satellite + panel cast() would consider right now — rather than a
    // rasterized snapshot of a pixel map that could silently go stale.
    //
    // FIX: dpr was hardcoded to 1 here — same bug class as the satellites
    // and overlays.js had (setTransform to raw device-pixel identity,
    // then drawing CSS-pixel-equivalent coordinates unscaled). Every rect
    // was landing squished toward the top-left corner instead of over
    // its actual candidate — the "blue rectangle near debug-btn" report.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = DEBUG_STATE.dpr || 1;
    for (const c of AimsCast.allCandidates()) {
      ctx.strokeStyle = c.type === 'panel' ? 'rgba(130,210,255,0.6)' : 'rgba(255,200,80,0.6)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.strokeRect(c.rect.left * dpr, c.rect.top * dpr, c.rect.width * dpr, c.rect.height * dpr);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
};
