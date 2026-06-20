/**
 * js/modules/input/in-aims.js
 * AIMS binding layer for Galaxy Guardians.
 *
 * Registers every interactive element into the Aims pixel map.
 * Replaces DOM hit testing with pixel-perfect layer resolution.
 *
 * LAYERS:
 *   1 — debug panels (canvas-drawn, highest priority)
 *   2 — HUD: speed bar, zoom bar, pan pad, UI toolbar, config menu
 *   3 — canvas world: sun touch zone, planet spawn area
 *
 * TOGGLE:
 *   InAims.enable()  — activates AIMS as primary pointer resolver
 *   InAims.disable() — falls back to normal DOM + InputModule routing
 *   InAims.enabled   — current state
 *
 * Called from input.module.js after all elements exist in DOM.
 */

import { Aims }          from '../../core/aims.js';
import { CameraModule }  from '../camera/camera.module.js';
import { DebugRouter }   from '../debug/debug-router.js';
import {
  state, setPhysSpeed, setSunGravMult,
  togglePause, SPEED_MAX
} from '../../core/state.js';
import { clamp } from '../../core/math.js';
import { Accumulator } from '../rendering/accumulator.js';

// ── Helpers ───────────────────────────────────────────────────────────────
const el  = (id) => document.getElementById(id);
const reg = (cfg) => Aims.register(cfg);

let _canvas      = null;
let _enabled     = false;
let _built       = false;
let _InputState  = null;
let _InUI        = null;
let _InDebug     = null;

// ── Registration ──────────────────────────────────────────────────────────
// Safe registerElement — skips null/missing DOM elements silently
function _safeReg(id, cfg) {
  const e = el(id);
  if (!e) { console.warn(`[InAims] element not found: #${id}`); return; }
  Aims.registerElement(e, { id, ...cfg });
}

function _registerAll() {
  // ── DEPTH 2: HUD buttons ─────────────────────────────────────────────

  // Speed bar
  _safeReg('sp-fast',  { depth: 2, on: { tap: () => { setPhysSpeed(parseFloat((state.physSpeed + 0.5).toFixed(1))); _InUI?._updateSpeedUI?.(); } } });
  _safeReg('sp-slow',  { depth: 2, on: { tap: () => { setPhysSpeed(parseFloat((state.physSpeed - 0.5).toFixed(1))); _InUI?._updateSpeedUI?.(); } } });
  _safeReg('sp-pause', { depth: 2, on: { tap: () => { togglePause(); _InUI?._updateSpeedUI?.(); } } });

  // Speed track — drag zone
  const spTrack = el('sp-track');
  if (spTrack) {
    Aims.registerElement(spTrack, { id: 'sp-track',
      id: 'sp-track', depth: 2,
      on: {
        pointerdown: ({ aim }) => {
          _InputState.spDrag = true;
          _InUI._spTrackPos(aim.ey);
        },
        pointermove: ({ aim }) => {
          if (_InputState.spDrag) _InUI._spTrackPos(aim.ey);
        },
        pointerup: () => { _InputState.spDrag = false; }
      }
    });
  }

  // Zoom bar
  _safeReg('zm-in',  { depth: 2, on: { tap: () => { CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom * 1.3, CameraModule.cam.minZoom, CameraModule.cam.maxZoom); } } });
  _safeReg('zm-out', { depth: 2, on: { tap: () => { CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom / 1.3, CameraModule.cam.minZoom, CameraModule.cam.maxZoom); } } });
  _safeReg('zm-fit', { depth: 2, on: { tap: () => CameraModule.frameBodies() } });

  // Zoom track — drag zone
  const zmTrack = el('zm-track');
  if (zmTrack) {
    Aims.registerElement(zmTrack, {
      id: 'zm-track', depth: 2,
      on: {
        pointerdown: ({ aim }) => {
          _InputState.zmDrag = true;
          _InUI._zmTrackPos(aim.ey);
        },
        pointermove: ({ aim }) => {
          if (_InputState.zmDrag) _InUI._zmTrackPos(aim.ey);
        },
        pointerup: () => { _InputState.zmDrag = false; }
      }
    });
  }

  // Pan pad
  const panPad = el('pan-pad');
  if (panPad) {
    Aims.registerElement(panPad, {
      id: 'pan-pad', depth: 2,
      on: {
        pointerdown: ({ aim }) => {
          _InputState.panPadActive = true;
          _InputState.panPadPower  = 0;
          panPad.classList.add('active');
          _InUI._handlePanPadMove({ clientX: aim.ex, clientY: aim.ey });
        },
        pointermove: ({ aim }) => {
          if (_InputState.panPadActive)
            _InUI._handlePanPadMove({ clientX: aim.ex, clientY: aim.ey });
        },
        pointerup: () => {
          _InputState.panPadActive = false;
          _InputState.panPadPower  = 0;
          _InputState.panPadDir    = { x: 0, y: 0 };
          panPad.classList.remove('active');
        }
      }
    });
  }

  // UI toolbar — clear, config, sliders
  _safeReg('clear-btn', { depth: 2,
    on: {
      tap: () => {
        state.bodies = []; state.loose = []; state.flashes = [];
        Accumulator.clear();
        const pc = el('pcount'); if (pc) pc.textContent = '—';
      }
    }
  });

  _safeReg('config-btn', { depth: 2,
    on: { tap: () => el('config-btn')?.click() }
  });

  // Size slider — pass through to DOM (range input handles own drag)
  const sizeSlider = el('size-slider');
  if (sizeSlider) {
    Aims.registerElement(sizeSlider, { id: 'size-slider', depth: 2, passthrough: false,
      on: { tap: () => {} } // DOM range handles itself, just block world layer
    });
  }

  // Grav slider
  const gravSlider = el('grav-slider');
  if (gravSlider) {
    Aims.registerElement(gravSlider, { id: 'grav-slider', depth: 2, passthrough: false,
      on: { tap: () => {} }
    });
  }

  // Config menu — registers as a passthrough zone so buttons inside still work via DOM
  const configMenu = el('config-menu');
  if (configMenu) {
    Aims.registerElement(configMenu, {
      id: 'config-menu', depth: 1, passthrough: false,
      on: { tap: () => {} } // DOM handles individual config inputs
    });
  }

  // ── DEPTH 1: Debug panels ─────────────────────────────────────────────
  // Debug panels are canvas-drawn — no DOM element.
  // Their bounds come from panel.x/y + size, registered dynamically.
  _registerDebugPanels();

  // ── DEPTH 3: Canvas world zones ───────────────────────────────────────
  const w = _canvas ? _canvas.getBoundingClientRect().width : window.innerWidth;
  const h = _canvas ? _canvas.getBoundingClientRect().height : window.innerHeight;

  // Planet spawn zone — full canvas minus HUD strips
  reg({
    id: 'canvas-world', depth: 3,
    bounds: { x: 60, y: 60, w: w - 120, h: h - 120 },
    passthrough: false,
    on: {
      pointerdown: ({ aim }) => {
        _InputState.isHolding = true;
        _InputState.holdTime  = performance.now();
        _InputState.mouseX    = aim.ex;
        _InputState.mouseY    = aim.ey;
        const cursor = el('cursor');
        if (cursor) cursor.classList.add('holding');
      },
      pointermove: ({ aim }) => {
        if (_InputState.isHolding) {
          _InputState.mouseX = aim.ex;
          _InputState.mouseY = aim.ey;
        }
      },
      pointerup: () => {
        if (_InputState.isHolding) {
          _InputState.isHolding = false;
          const cursor = el('cursor');
          if (cursor) cursor.classList.remove('holding');
          // Delegate actual spawn to InPlanet._spawnPlanet via dynamic import
          import('./in-planet.js').then(m => {
            if (m.InPlanet._spawnPlanet) m.InPlanet._spawnPlanet();
          });
        }
      }
    }
  });

  _built = true;
  Aims.rebuild(window.innerWidth, window.innerHeight);
  console.log('[InAims] All items registered. Map built.');
}

function _registerDebugPanels() {
  // Called once at startup and re-called if panels move
  for (const panel of DebugRouter.panels) {
    if (!panel.visible) continue;
    // Approximate panel size — debug-renderer knows exact size but
    // we use a conservative estimate here; in-debug.js refines via _btns
    const pw = 160, ph = 220;
    const id = `debug-panel-${panel.id}`;
    if (Aims._items?.has(id)) Aims.unregister(id);
    reg({
      id, depth: 1,
      bounds: { x: panel.x, y: panel.y, w: pw, h: ph },
      passthrough: false,
      on: {
        pointerdown: ({ aim }) => {
          // Delegate to InDebug which has precise button hit testing
          _InDebug.handleDown({
            clientX: aim.ex, clientY: aim.ey,
            pointerId: 0, preventDefault: () => {}, stopImmediatePropagation: () => {}
          });
        }
      }
    });
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
export const InAims = {

  get enabled() { return _enabled; },

  init(canvas, InputState, InUI, InDebug) {
    _canvas     = canvas;
    _InputState = InputState;
    _InUI       = InUI;
    _InDebug    = InDebug;
    // Don't register yet — wait for enable() to be called explicitly
    // so DOM is guaranteed to be painted and all rects are valid
  },

  enable() {
    if (_enabled) return;
    _enabled = true;
    // Defer registration to after DOM is fully painted
    const doEnable = () => {
      if (!_built) _registerAll();
      Aims.bindPointer(_canvas);
      console.log('[InAims] AIMS enabled — pixel-perfect input active');
    };
    // Double rAF ensures layout is complete
    requestAnimationFrame(() => requestAnimationFrame(doEnable));
  },

  disable() {
    _enabled = false;
    console.log('[InAims] AIMS disabled — normal DOM input restored');
  },

  /**
   * Call from main loop or after panel drag to keep debug panel
   * bounds in sync with their current positions.
   */
  syncDebugPanels() {
    _registerDebugPanels();
    Aims.rebuild(window.innerWidth, window.innerHeight);
  },

  /**
   * Call from resize handler.
   */
  onResize() {
    if (!_built) return;
    // Re-register DOM elements — their rects changed
    Aims.rebuild(window.innerWidth, window.innerHeight);
  },

  /**
   * handleDown — called from InputModule priority chain.
   * If AIMS is enabled, resolve through map first.
   * Returns true if consumed.
   */
  handleDown(e) {
    if (!_enabled) return false;
    const hits = Aims.aim.down(e.clientX, e.clientY);
    return hits.length > 0;
  },

  handleMove(e) {
    if (!_enabled) return false;
    const hits = Aims.aim.move(e.clientX, e.clientY);
    return hits.length > 0 && _InputState.isPointerDown;
  },

  handleUp(e) {
    if (!_enabled) return false;
    Aims.aim.up(e.clientX, e.clientY);
    return false; // never fully consume up — let others clean up state
  },

  /**
   * Draw debug overlay — call from renderer when debug active.
   */
  debugDraw(ctx, showMap = false) {
    if (_enabled) Aims.debugDraw(ctx, showMap);
  }
};
