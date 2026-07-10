/**
 * js/modules/input/input.module.js
 * The Input Router. Unified pointer events with priority chain.
 *
 * REFACTOR (2026-06-19):
 * - Removed _bindKeyboard() — all keyboard handling lives in in-keyboard.js
 * - InKeyboard.enable() called on init (always on for now)
 *
 * REFACTOR (AIMS, this pass): retired the deferred-retry model (try real
 * touch, defer one frame to AIMS only on a miss). AIMS is now a strict
 * either/or, not a fallback — see rules.md §8:
 *   - InAims OFF: every touch is normal, exactly as if AIMS didn't exist.
 *   - InAims ON: every touch drives the ACTIVE PROFILE (aims-profiles.js
 *     — Trackpad/Joystick/Offset), which updates a persistent aim point
 *     (Aims.aim.x/y), and a synthesized event fires AT THE AIM instead of
 *     the raw finger — into the same "virtual space" chain (debug panels,
 *     canvas satellites, world/canvas), never into HTML buttons/bars,
 *     which keep their own direct listeners regardless of AIMS state.
 * "Just a different configuration of what's firing" — same downstream
 * code either way, only the coordinates (and which subset of the chain
 * is reachable) differ.
 */
import { InConfigMenu } from './in-config-menu.js';
import { InUI }         from './in-ui.js';
import { InDebug }      from './in-debug.js';
import { InButtons }    from './in-buttons.js';
import { InCamera }     from './in-camera.js';
import { InPlanet }     from './in-planet.js';
import { SelectionTool } from './in-selection-tool.js';
import { InKeyboard }   from './in-keyboard.js';
import { InAims }      from './in-aims.js';
import { AimsProfiles } from './aims-profiles.js';
import { CanvasSatellites } from '../ui/canvas-satellites.js';
import { Aims }        from '../../core/aims.js';
import { DebugRouter } from '../debug/debug-router.js';
import { InputGov }    from '../debug/governor.js';

export const InputState = {
  mouseX: 0, mouseY: 0,
  isPointerDown: false, pointerButton: 0,
  isHolding: false, holdTime: 0,
  touchCount: 0,
  spDrag: false, zmDrag: false,
  panPadActive: false, panPadDir: { x: 0, y: 0 }, panPadPower: 0,
  panLocked: false,   // sticky pan mode — all canvas touches route to pan

  // ── The one canonical "where the effective click/drag is right now" ──
  // AIMS on: the aim (Aims.aim.x/y — wherever the active profile placed
  // it). AIMS off: the real pointer (mouseX/mouseY), exactly as if AIMS
  // never existed. ONE value, computed the SAME way every single time
  // (InputModule's own internal _syncFinalPointer, called at the end of
  // every pointer event and every aimsTick — see rules.md §8) — so
  // nothing in this codebase has to decide for itself which coordinate
  // is "the real one" and risk getting it wrong in one spot but not
  // another. "The pointer never misses, and it's always the same."
  finalPointerX: 0, finalPointerY: 0
};

// A synthesized event carrying the AIM's position instead of the real
// finger's — everything the "virtual space" chain reads (clientX/Y,
// pointerId, preventDefault/stopPropagation/stopImmediatePropagation).
// No `target` — the three handlers this chain actually calls (InDebug,
// CanvasSatellites, SelectionTool/InPlanet) all hit-test off coordinates,
// never off e.target (that was the whole lesson from the earlier Proxy
// attempt — the handlers that DO read e.target, InButtons/InUI/
// InConfigMenu, are exactly the ones excluded from this chain, see below).
function _aimShim(pointerId) {
  return {
    clientX: Aims.aim.x, clientY: Aims.aim.y, pointerId,
    preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
  };
}

// The AIM-eligible subset — "virtual space" only, per rules.md §8. Never
// InButtons/InConfigMenu/InUI/InCamera: those are HTML-DOM/camera-drag
// specific, and HTML buttons already have their own direct listeners
// that fire independently, on the REAL touch location, regardless of
// AIMS. Routing the aim into InButtons here (e.g. via elementFromPoint
// happening to land on debug-btn) would be the exact "HTML buttons are a
// no-go for AIMS" violation §8 exists to prevent.
function _aimChainDown(pointerId) {
  const e = _aimShim(pointerId);
  if (CanvasSatellites.handleDown(e)) return true;
  if (InDebug.handleDown(e))          return true;
  if (SelectionTool.handleDown(e))    return true;
  if (!DebugRouter.masterEnabled && !SelectionTool.enabled) { InPlanet.handleDown(e); return true; }
  return false;
}
function _aimChainMove(pointerId) {
  const e = _aimShim(pointerId);
  if (CanvasSatellites.handleMove(e)) return true;
  if (InDebug.handleMove(e))          return true;
  if (SelectionTool.handleMove(e))    return true;
  InPlanet.handleMove(e);
  return true;
}
function _aimChainUp(pointerId) {
  const e = _aimShim(pointerId);
  if (CanvasSatellites.handleUp(e)) return true;
  if (InDebug.handleUp(e))          return true;
  if (SelectionTool.handleUp(e))    return true;
  InPlanet.handleUp(e);
  return true;
}

// AIMS charge delay — a real touch must be held this long before it's
// captured as AIMS input at all. Below this threshold, a touch that
// releases early is treated as if it never happened for AIMS purposes —
// no profile update, no chain fire. Gives the user a moment to "chill"
// before a touch commits, and a moment to bail on an accidental graze
// before it does anything. See rules.md §8 — this is a standing
// principle, not a one-off tuning knob for this feature alone.
//
// 99ms: increased from the original 25ms. Same reading convention as
// before — "0.099s" as a target value in seconds (99ms), not 0.099
// milliseconds (99 MICROseconds, which would again be shorter than a
// single frame at 60fps and functionally a no-op).
const AIMS_CHARGE_MS = 99;

let _aimsChargeTimer = null;

// Which chain owns the CURRENT gesture, decided once on pointerdown and
// consulted on every subsequent move/up for it — 'normal' (a satellite/
// panel/button/UI/camera claimed it for real, on the real touch — AIMS
// never gets involved for the rest of this gesture), 'aims' (missed all
// of those, AIMS is on, so this is a charge→profile→aim gesture), or
// 'world' (missed all of those, AIMS is off, so this is a plain
// SelectionTool/InPlanet tap on the real position, exactly as before
// AIMS existed). Explicit tracking, not inferred from which handlers
// happen to self-gate true/false — that ambiguity is what let a real,
// precise tap on a satellite get swallowed by AIMS's charge timer
// instead of ever reaching the satellite at all. See rules.md §8: real
// pointer always gets first try at satellite buttons, panels, and
// canvas; AIMS never blocks a real, direct hit on any of them — it only
// ever engages for a touch that missed all of them.
let _gestureMode = 'none';
let _aimsCaptured    = false;   // true once the charge completes and this touch is actively driving AIMS

// ── AIMS Tap Bulb ─────────────────────────────────────────────────────────
// "Placing the cursor" (moving the aim via Trackpad/Joystick/Offset) can
// leave your actual finger somewhere far from wherever the aim ended up —
// Trackpad especially, since it's pure relative delta. The bulb solves
// that: after a captured gesture releases, a big, easy target appears
// right where your finger ALREADY is (real x,y, not the aim's), and
// tapping IT fires a fresh tap at the aim's position — "more manipulation
// after placing the cursor," without reaching back to wherever the aim
// visually sits. This is the one deliberate exception to "AIMS routes
// every touch through the active profile": hitting the bulb is checked
// with a REAL, NORMAL point hit-test (real finger x/y against the bulb's
// real x/y), overriding AIMS entirely for exactly this one tap — not a
// profile, not the charge delay, just "did a real touch land on this
// real button." See rules.md §8.
const BULB_RADIUS = 15;    // screen px — 1/3 of the original 45px. Still comfortably bigger than the ~7px aim radius, without eating this much screen.
const BULB_FLASH_MS = 220; // how long the confirmed/cancelled flash holds before the bulb fully hides

// Full state machine — six real states, each with its own meaning and its
// own rendering in main.js's _drawAimsBulb, not just "shown or not":
//   hidden      — nothing to confirm right now. Not drawn at all.
//   idle        — appeared, waiting. Soft breathing pulse.
//   held        — a real touch is on it right now. Bright, filled.
//   cancelling  — held, but the touch has slid OUTSIDE the bulb's own
//                 radius without releasing yet — standard "slide off to
//                 cancel" (same pattern Android's own ripple buttons use).
//                 Warns with a shift toward red BEFORE anything is
//                 decided — release now and nothing fires; slide back in
//                 and it's `held` again, still armed.
//   confirmed   — released while held (inside the radius) — the tap DID
//                 fire. Brief bright flash, then hides.
//   cancelled   — released while cancelling (outside the radius) — the
//                 tap did NOT fire. Brief red flash, distinct from
//                 confirmed, then hides.
let _bulbState = 'hidden';
let _bulbX = 0, _bulbY = 0;
let _bulbFlashUntil = 0;   // performance.now() timestamp — confirmed/cancelled clear at this time

function _bulbDist(x, y) {
  return Math.hypot(x - _bulbX, y - _bulbY);
}

function _showBulb(x, y) {
  _bulbState = 'idle';
  _bulbX = x; _bulbY = y;
}

function _hideBulb() {
  _bulbState = 'hidden';
}

// ── finalPointerX/Y sync ────────────────────────────────────────────────
// One function, called at the end of every pointer event and every
// aimsTick — never computed inline anywhere else. AIMS on → the aim;
// AIMS off → the real pointer. This IS the guarantee "it's always the
// same": every caller gets this exact same value, computed this exact
// same way, no matter which event path got them there.
function _syncFinalPointer() {
  if (InAims.enabled) {
    InputState.finalPointerX = Aims.aim.x;
    InputState.finalPointerY = Aims.aim.y;
  } else {
    InputState.finalPointerX = InputState.mouseX;
    InputState.finalPointerY = InputState.mouseY;
  }
}


export const InputModule = {
  init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal) {
    InUI.init(uiEl, slider, pcountEl, gravSlider, gravVal);
    InDebug.init(canvas);
    InCamera.init(canvas);
    InPlanet.init(canvas, cursorEl, slider, pcountEl);
    InConfigMenu.init();
    InKeyboard.enable();
    InAims.init(canvas, InputState, InUI, InDebug);
    this._bindGlobalEvents(canvas);
  },

  // Read by _drawAimCursor (main.js) for the blue/red state — true only
  // while a touch has cleared the charge delay and is actively driving
  // the aim right now, not merely while AIMS is enabled.
  get aimsCaptured() { return _aimsCaptured; },

  // Read by main.js's status readout — the third state aimsCaptured alone
  // can't distinguish: a touch can be down without being captured yet
  // (still charging). 'idle' | 'charging' | 'captured'.
  get aimsPhase() {
    if (_aimsCaptured) return 'captured';
    if (InputState.isPointerDown) return 'charging';
    return 'idle';
  },

  // Read by main.js's _drawAimsBulb for full-state rendering.
  get bulbState() {
    const flashRemain = (_bulbState === 'confirmed' || _bulbState === 'cancelled')
      ? Math.max(0, _bulbFlashUntil - performance.now()) / BULB_FLASH_MS
      : 0;
    return { state: _bulbState, x: _bulbX, y: _bulbY, radius: BULB_RADIUS, flashRemain };
  },

  _bindGlobalEvents(canvas) {
    // POINTER DOWN
    window.addEventListener('pointerdown', (e) => {
      try {
        InputState.mouseX      = e.clientX;
        InputState.mouseY      = e.clientY;
        InputState.isPointerDown = true;
        InputState.pointerButton = e.button;
        _gestureMode = 'none';

        // BULB — checked before anything else, including the normal
        // chain. A real hit here overrides everything for this one tap;
        // it does not start a new gesture of any other kind. Only
        // hittable while idle — mid-flash (confirmed/cancelled) is not a
        // live target, just a fading acknowledgment.
        if (InAims.enabled && _bulbState === 'idle' && _bulbDist(e.clientX, e.clientY) <= BULB_RADIUS) {
          _bulbState = 'held';
          return;
        }

        // Real touch, real coordinates — ALWAYS gets first try, on every
        // satellite/panel/button/UI/camera, regardless of AIMS state.
        // "Real Pointer should still be operational on satellite
        // buttons, panels, canvas... AIMS is a preference of choice of
        // what pointer the user wants to use" — AIMS never gets to
        // intercept a touch that would otherwise land correctly on a
        // real, fixed-position thing; it only ever engages for a touch
        // that misses all of them. See rules.md §8.
        //
        // CanvasSatellites checked BEFORE InDebug — this order used to
        // be reversed, and InDebug's own "empty space, arm the marquee"
        // catch-all has no knowledge of satellite positions at all, so
        // any tap landing exactly on a dbg-sat satellite was being
        // swallowed as "empty space" before CanvasSatellites ever got a
        // chance to see it. Satellites render on top of panels
        // (main.js's draw order) — hit-testing them first matches that.
        if (CanvasSatellites.handleDown(e))   { _gestureMode = 'normal'; return; }
        if (InDebug.handleDown(e))            { _gestureMode = 'normal'; return; }
        if (InButtons.handleDown(e))          { _gestureMode = 'normal'; return; }
        if (InConfigMenu.handleDown(e))       { _gestureMode = 'normal'; return; }
        if (InUI.handleDown(e))               { _gestureMode = 'normal'; return; }
        if (InCamera.handleDown(e))           { _gestureMode = 'normal'; return; }

        // Missed everything above — nothing but open canvas/world under
        // this touch. THIS is the one place AIMS actually changes
        // behavior: off, it's a normal world tap (SelectionTool/
        // InPlanet, exactly as before AIMS existed); on, it becomes an
        // AIMS-profile-driven gesture instead — charge, then the active
        // profile takes over from here. "AIMS is a preference of choice
        // of what pointer the user wants to use" for reaching the canvas
        // specifically — that's the one interaction genuinely ambiguous
        // enough to have two meanings; a satellite/panel/button never is.
        if (InAims.enabled) {
          _gestureMode = 'aims';
          _hideBulb();   // a fresh gesture retires whatever bulb was showing
          _aimsCaptured = false;
          clearTimeout(_aimsChargeTimer);
          const pid = e.pointerId;
          _aimsChargeTimer = setTimeout(() => {
            if (!InputState.isPointerDown) return;   // released before charge completed — nothing captured, ever
            _aimsCaptured = true;
            // Anchor from the LATEST tracked position, not the original
            // down position — pointermove tracking (below) runs
            // unconditionally even during the charge window, so a finger
            // that already moved before capture completes anchors from
            // where it actually is now, not a stale down point.
            AimsProfiles.active.onDown(InputState.mouseX, InputState.mouseY);
            _aimChainDown(pid);
            // This callback runs asynchronously, after the pointerdown
            // handler's own try/finally has already completed — needs
            // its own sync, now that onDown has actually moved the aim.
            _syncFinalPointer();
          }, AIMS_CHARGE_MS);
          return;
        }

        _gestureMode = 'world';
        if (SelectionTool.handleDown(e)) return;  // Capturing planets takes over from brush painting
        // Planet planting disabled when debug is on, or while selecting — one
        // gesture, one job — debug = tuning, selecting = capturing, else = playing
        if (!DebugRouter.masterEnabled && !SelectionTool.enabled) InPlanet.handleDown(e);
      } finally {
        // Runs no matter which branch/return above fired. Doesn't cover
        // the async charge-complete callback (setTimeout, above) — that
        // one syncs itself, since it runs after this has already finished.
        _syncFinalPointer();
      }
    });

    // POINTER MOVE
    window.addEventListener('pointermove', (e) => {
      try {
        // Position tracking always runs — never skipped, so the latest
        // coordinates are always accurate (same role as physicsAccumulator
        // always banking real dt regardless of tick-skip).
        InputState.mouseX = e.clientX;
        InputState.mouseY = e.clientY;

        // Tick-skip governor — throttles the expensive handler chain only.
        // Bresenham-style, same math as RenderGov/PhysicsGov, counted per
        // pointermove event instead of per rAF frame. AUTO stays at 0 skip
        // (see InputGov) — this only engages when manually tuned.
        if (!InputGov.shouldProcess()) return;

        if (_bulbState === 'held' || _bulbState === 'cancelling') {
          // Standard "slide off to cancel": stays armed (held) while inside
          // the radius, warns (cancelling) the moment it isn't — and can
          // slide back in and re-arm before release, same as it can slide
          // back out. Nothing else processes this event while a bulb
          // interaction is in progress.
          _bulbState = (_bulbDist(e.clientX, e.clientY) <= BULB_RADIUS) ? 'held' : 'cancelling';
          return;
        }

        // Whichever chain claimed this gesture on the way down keeps it
        // for the rest of the gesture — no re-deciding per move event.
        if (_gestureMode === 'normal') {
          if (InDebug.handleMove(e))  return;  // Debug drag takes priority
          if (CanvasSatellites.handleMove(e)) return;
          if (InUI.handleMove(e))     return;
          if (InCamera.handleMove(e)) return;
          return;   // consumed by whichever of the above actually owns this drag
        }

        if (_gestureMode === 'aims') {
          // Only once captured (charge cleared) AND still down. A move
          // during the charge window itself is silently absorbed — the
          // charge callback anchors from InputState.mouseX/Y (already kept
          // current by the tracking above) once it fires, so nothing is
          // lost, but feeding a profile moves before its own onDown has
          // ever run would corrupt Trackpad's/Joystick's internal state
          // (stale _lastX/_lastY from whatever the previous gesture was).
          if (InputState.isPointerDown && _aimsCaptured) {
            AimsProfiles.active.onMove(e.clientX, e.clientY);
            _aimChainMove(e.pointerId);
          }
          return;
        }

        if (_gestureMode === 'world') {
          if (SelectionTool.handleMove(e)) return;
          InPlanet.handleMove(e);
        }
      } finally {
        _syncFinalPointer();
      }
    });

    // UNIFIED RELEASE
    const handleGlobalUp = (e) => {
      try {
        InputState.isPointerDown = false;

        if (_bulbState === 'held' || _bulbState === 'cancelling') {
          if (_bulbState === 'held') {
            // Real tap on the bulb, confirmed — fire ONE fresh tap at the
            // aim's CURRENT position (which may have been fine-tuned again
            // since the bulb appeared — nothing stops that).
            _aimChainDown(e.pointerId);
            _aimChainUp(e.pointerId);
            _bulbState = 'confirmed';
          } else {
            // Released outside the radius — cancelled, does NOT fire.
            _bulbState = 'cancelled';
          }
          _bulbFlashUntil = performance.now() + BULB_FLASH_MS;
          return;
        }

        if (_gestureMode === 'normal') {
          if (InDebug.handleUp(e))   return;  // Release debug drag first
          if (CanvasSatellites.handleUp(e)) return;
          if (InButtons.handleUp(e)) return;  // Handle buttons
          if (InUI.handleUp(e))      return;
          if (InCamera.handleUp(e)) return;
          return;
        }

        if (_gestureMode === 'aims') {
          clearTimeout(_aimsChargeTimer);   // released mid-charge → the pending capture never fires at all
          if (_aimsCaptured) {
            AimsProfiles.active.onUp(e.clientX, e.clientY);
            _aimChainUp(e.pointerId);
            // The cursor's been placed — show the bulb right where the
            // finger actually is now, so firing another tap at the aim
            // doesn't mean reaching back to wherever the aim ended up.
            _showBulb(e.clientX, e.clientY);
          }
          _aimsCaptured = false;
          return;
        }

        if (_gestureMode === 'world') {
          if (SelectionTool.handleUp(e)) return;
          InPlanet.handleUp(e);
        }
      } finally {
        _gestureMode = 'none';
        _syncFinalPointer();
      }
    };

    window.addEventListener('pointerup',           handleGlobalUp);
    window.addEventListener('pointercancel',        handleGlobalUp);
    window.addEventListener('lostpointercapture',   handleGlobalUp);
    window.addEventListener('touchcancel',          handleGlobalUp, { passive: false });

    // WHEEL
    canvas.addEventListener('wheel', (e) => {
      if (InCamera.handleWheel(e)) return;
    }, { passive: false });

    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  /**
   * Called once per rendered frame from main.js (mirrors updatePanPad's
   * own per-frame hook) — ONLY meaningful while AIMS is enabled. Most
   * profiles no-op here (Trackpad/Offset only move on a real pointermove);
   * Joystick is the one that needs this — "hold and lean" ramps its power
   * over TIME, not distance, so it has to keep moving the aim between
   * pointer events, same as Pan Pad's own updatePanPad() does for camera
   * pan. If the aim actually moved and a touch is still down, fire a
   * synthesized move into the aim chain so painting/dragging continues
   * smoothly while held-and-leaning, not just in discrete jumps.
   */
  aimsTick() {
    if (!InAims.enabled) {
      // AIMS turned off — the bulb (and any pending charge) belong to a
      // mode that's no longer active. Clear rather than leave a stale
      // "tap here" target sitting on screen for a feature that's off.
      if (_bulbState !== 'hidden') _hideBulb();
      _syncFinalPointer();   // snaps to the real pointer the instant AIMS goes off
      return;
    }
    // Confirmed/cancelled are a timed flash, not a lasting state —
    // once BULB_FLASH_MS has passed, the bulb is done and hides.
    if ((_bulbState === 'confirmed' || _bulbState === 'cancelled') && performance.now() >= _bulbFlashUntil) {
      _hideBulb();
    }
    const beforeX = Aims.aim.x, beforeY = Aims.aim.y;
    AimsProfiles.active.tick();
    // Explicit _gestureMode check, not just isPointerDown — a profile's
    // own tick() already self-gates via its internal _held (Joystick) or
    // no-ops (Trackpad/Offset don't override tick at all), but checking
    // the gesture mode too matches the same explicit-tracking approach
    // pointerdown/move/up use, rather than leaning on self-gating alone.
    if (_gestureMode === 'aims' && InputState.isPointerDown && (Aims.aim.x !== beforeX || Aims.aim.y !== beforeY)) {
      _aimChainMove(0);
    }
    // Covers Joystick's hold-and-lean: it moves the aim every frame while
    // held, between real pointer events, so finalPointer needs its own
    // per-frame sync here too, not just at pointer-event boundaries.
    _syncFinalPointer();
  }
};

// Export InKeyboard so other modules can query key state if needed
export { InKeyboard };
export { InAims };
