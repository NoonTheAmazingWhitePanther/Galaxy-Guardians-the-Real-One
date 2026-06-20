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
import { InCamera }     from './in-camera.js';
import { InPlanet }     from './in-planet.js';
import { InKeyboard }   from './in-keyboard.js';
import { InAims }      from './in-aims.js';

export const InputState = {
  mouseX: 0, mouseY: 0,
  isPointerDown: false, pointerButton: 0,
  isHolding: false, holdTime: 0,
  touchCount: 0,
  spDrag: false, zmDrag: false,
  panPadActive: false, panPadDir: { x: 0, y: 0 }, panPadPower: 0
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

      if (InAims.handleDown(e))     return;  // AIMS first — pixel-perfect map
      if (InConfigMenu.handleDown(e)) return;
      if (InUI.handleDown(e))        return;
      if (InDebug.handleDown(e))     return;
      if (InCamera.handleDown(e))    return;
      InPlanet.handleDown(e);
    });

    // POINTER MOVE
    window.addEventListener('pointermove', (e) => {
      InputState.mouseX = e.clientX;
      InputState.mouseY = e.clientY;

      if (InAims.handleMove(e))   return;
      if (InUI.handleMove(e))     return;
      if (InDebug.handleMove(e))  return;
      if (InCamera.handleMove(e)) return;
      InPlanet.handleMove(e);
    });

    // UNIFIED RELEASE
    const handleGlobalUp = (e) => {
      InputState.isPointerDown = false;

      InAims.handleUp(e);
      if (InUI.handleUp(e))     return;
      if (InDebug.handleUp(e))  return;
      if (InCamera.handleUp(e)) return;
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
  }
};

// Export InKeyboard so other modules can query key state if needed
export { InKeyboard };
export { InAims };
