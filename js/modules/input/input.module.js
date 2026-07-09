/**
 * js/modules/input/input.module.js
 * The Input Router. Unified pointer events with priority chain.
 *
 * REFACTOR (2026-06-19):
 * - Removed _bindKeyboard() — all keyboard handling lives in in-keyboard.js
 * - InKeyboard.enable() called on init (always on for now)
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
  panLocked: false   // sticky pan mode — all canvas touches route to pan
};

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

  _bindGlobalEvents(canvas) {
    // POINTER DOWN
    window.addEventListener('pointerdown', (e) => {
      InputState.mouseX      = e.clientX;
      InputState.mouseY      = e.clientY;
      InputState.isPointerDown = true;
      InputState.pointerButton = e.button;
      Aims.aim.x = e.clientX; Aims.aim.y = e.clientY;

      // Real touch, real coordinates, no offset — this is the ONLY pass
      // for every HTML button/bar in the app (pan-pad, selection/aims/
      // painting toggles, zoom bar, speed bar, fps text, bottom bar...).
      // Native touch already lands correctly on 44px targets; AIMS must
      // never second-guess it here. See rules.md — "HTML buttons are a
      // no-go for AIMS."
      if (InDebug.handleDown(e))            return;  // Debug panels first
      if (CanvasSatellites.handleDown(e))   return;  // Satellites — canvas-drawn, "virtual space", see rules.md §8
      if (InButtons.handleDown(e))          return;  // Buttons second
      if (InConfigMenu.handleDown(e))       return;
      if (InUI.handleDown(e))               return;
      if (InCamera.handleDown(e))           return;

      // Everything above missed at the real touch point. If AIMS is on,
      // give it ONE loop cycle to try again with an offset — deferred,
      // not a same-frame retry (see InputModule._deferAimsRetry below).
      // This suppresses the immediate world-fallthrough for this tap; the
      // deferred pass resolves it one frame later, at real coordinates —
      // a fresh, genuine hit-test, not an approximation of one.
      if (InAims.enabled) {
        InputModule._deferAimsRetry(e.clientX, e.clientY, e.pointerId);
        return;
      }

      if (SelectionTool.handleDown(e)) return;  // Capturing planets takes over from brush painting
      // Planet planting disabled when debug is on, or while selecting — one
      // gesture, one job — debug = tuning, selecting = capturing, else = playing
      if (!DebugRouter.masterEnabled && !SelectionTool.enabled) InPlanet.handleDown(e);
    });

    // POINTER MOVE
    window.addEventListener('pointermove', (e) => {
      // Position tracking always runs — never skipped, so the latest
      // coordinates are always accurate (same role as physicsAccumulator
      // always banking real dt regardless of tick-skip).
      InputState.mouseX = e.clientX;
      InputState.mouseY = e.clientY;
      Aims.aim.moveTo(e.clientX, e.clientY);

      // Tick-skip governor — throttles the expensive handler chain only.
      // Bresenham-style, same math as RenderGov/PhysicsGov, counted per
      // pointermove event instead of per rAF frame. AUTO stays at 0 skip
      // (see InputGov) — this only engages when manually tuned.
      if (!InputGov.shouldProcess()) return;

      if (InDebug.handleMove(e))  return;  // Debug drag takes priority
      if (CanvasSatellites.handleMove(e)) return;
      if (InUI.handleMove(e))     return;
      if (InCamera.handleMove(e)) return;
      if (SelectionTool.handleMove(e)) return;
      InPlanet.handleMove(e);
    });

    // UNIFIED RELEASE
    const handleGlobalUp = (e) => {
      InputState.isPointerDown = false;

      if (InDebug.handleUp(e))   return;  // Release debug drag first
      if (CanvasSatellites.handleUp(e)) return;
      if (InButtons.handleUp(e)) return;  // Handle buttons
      if (InUI.handleUp(e))      return;
      if (InCamera.handleUp(e)) return;
      if (SelectionTool.handleUp(e)) return;
      InPlanet.handleUp(e);
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
   * DEFERRED AIMS RETRY — one loop cycle later, with the offset, as a
   * completely fresh real hit-test. Not a same-frame approximation of one.
   *
   * This is genuinely just "cast a ray with different numbers" (see
   * core/aims-cast.js and rules.md §8) — InAims.resolve() is the ONE
   * function that does the actual work, at (x+offset, y+offset), with
   * whichever radius the current mode implies. There is no separate
   * "different input module" branching happening here anymore; the mode
   * switch (long-press aims-btn) only changes the radius resolve() casts
   * with, never the code path.
   *
   * Deliberately single-shot (tap only) — resolves one discrete hit, not
   * a drag. A satellite wired with hold semantics (satWireHold in
   * main.js) still gets its tap path correctly (paired synthetic
   * pointerdown+pointerup — `held` stays false, same as a genuine quick
   * tap), but a deliberate long-press aimed at a tiny satellite isn't
   * assisted — land that one for real.
   */
  _deferAimsRetry(x, y, pointerId) {
    requestAnimationFrame(() => {
      const dx = Aims.aim.offsetX, dy = Aims.aim.offsetY;
      const sx = x + dx, sy = y + dy;

      if (InAims.resolve(sx, sy)) return;

      // Nothing AIMS covers was there. Fall through to the same world
      // interaction a normal miss would get, one frame late, at the RAW
      // (un-offset) point — world/canvas taps never use the bias.
      const raw = {
        clientX: x, clientY: y, pointerId,
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
      };
      if (SelectionTool.handleDown(raw)) return;
      if (!DebugRouter.masterEnabled && !SelectionTool.enabled) InPlanet.handleDown(raw);
    });
  }
};

// Export InKeyboard so other modules can query key state if needed
export { InKeyboard };
export { InAims };
