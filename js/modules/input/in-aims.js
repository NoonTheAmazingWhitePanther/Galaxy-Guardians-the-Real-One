/**
 * js/modules/input/in-aims.js
 * AIMS binding layer for Galaxy Guardians.
 *
 * Registers every interactive element into the Aims pixel map.
 * Sits at top of InputModule priority chain.
 * Toggle: InAims.enable() / InAims.disable() / Tab key
 *
 * LAYERS:
 *   1 — debug panels (canvas-drawn, highest priority)
 *   2 — HUD: speed, zoom, pan pad, sliders, config menu
 *   3 — canvas world: planet spawn area
 */

import { Aims }          from '../../core/aims.js';
import { CameraModule }  from '../camera/camera.module.js';
import { DebugRouter }   from '../debug/debug-router.js';
import { clamp }         from '../../core/math.js';
import { Accumulator }   from '../rendering/accumulator.js';
import { FutureCache }   from '../../core/future-cache.js';
import {
  state, setPhysSpeed, togglePause
} from '../../core/state.js';

// ── Injected deps (no circular imports) ──────────────────────────────────
let _canvas     = null;
let _InputState = null;
let _InUI       = null;
let _InDebug    = null;
let _enabled    = false;
let _built      = false;

const el = (id) => document.getElementById(id);

// ── Safe registration helpers ─────────────────────────────────────────────
function _safeReg(id, cfg) {
  const e = el(id);
  if (!e) return;
  Aims.registerElement(e, { id, ...cfg });
}

function _safeRegEl(e, cfg) {
  if (!e) return;
  Aims.registerElement(e, cfg);
}

// ── Registration ──────────────────────────────────────────────────────────
function _registerAll() {
  // ── Depth 2: Speed bar ───────────────────────────────────────────────
  _safeReg('sp-fast', { depth: 2, on: { tap: () => {
    setPhysSpeed(parseFloat((state.physSpeed + 0.5).toFixed(1)));
    _InUI?._updateSpeedUI?.();
  }}});

  _safeReg('sp-slow', { depth: 2, on: { tap: () => {
    setPhysSpeed(parseFloat((state.physSpeed - 0.5).toFixed(1)));
    _InUI?._updateSpeedUI?.();
  }}});

  _safeReg('sp-pause', { depth: 2, on: { tap: () => {
    togglePause();
    _InUI?._updateSpeedUI?.();
  }}});

  _safeRegEl(el('sp-track'), { id: 'sp-track', depth: 2, on: {
    pointerdown: ({ aim }) => {
      if (_InputState) _InputState.spDrag = true;
      _InUI?._spTrackPos?.(aim.ey);
    },
    pointermove: ({ aim }) => {
      if (_InputState?.spDrag) _InUI?._spTrackPos?.(aim.ey);
    },
    pointerup: () => {
      if (_InputState) _InputState.spDrag = false;
    }
  }});

  // ── Depth 2: Zoom bar ────────────────────────────────────────────────
  _safeReg('zm-in', { depth: 2, on: { tap: () => {
    CameraModule.cam.targetZoom = clamp(
      CameraModule.cam.targetZoom * 1.3,
      CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
  }}});

  _safeReg('zm-out', { depth: 2, on: { tap: () => {
    CameraModule.cam.targetZoom = clamp(
      CameraModule.cam.targetZoom / 1.3,
      CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
  }}});

  _safeReg('zm-fit', { depth: 2, on: { tap: () => {
    CameraModule.frameBodies();
  }}});

  _safeRegEl(el('zm-track'), { id: 'zm-track', depth: 2, on: {
    pointerdown: ({ aim }) => {
      if (_InputState) _InputState.zmDrag = true;
      _InUI?._zmTrackPos?.(aim.ey);
    },
    pointermove: ({ aim }) => {
      if (_InputState?.zmDrag) _InUI?._zmTrackPos?.(aim.ey);
    },
    pointerup: () => {
      if (_InputState) _InputState.zmDrag = false;
    }
  }});

  // ── Depth 2: Pan pad ─────────────────────────────────────────────────
  _safeRegEl(el('pan-pad'), { id: 'pan-pad', depth: 2, on: {
    pointerdown: ({ aim }) => {
      if (_InputState) { _InputState.panPadActive = true; _InputState.panPadPower = 0; }
      el('pan-pad')?.classList.add('active');
      _InUI?._handlePanPadMove?.({ clientX: aim.ex, clientY: aim.ey });
    },
    pointermove: ({ aim }) => {
      if (_InputState?.panPadActive)
        _InUI?._handlePanPadMove?.({ clientX: aim.ex, clientY: aim.ey });
    },
    pointerup: () => {
      if (_InputState) {
        _InputState.panPadActive = false;
        _InputState.panPadPower  = 0;
        _InputState.panPadDir    = { x: 0, y: 0 };
      }
      el('pan-pad')?.classList.remove('active');
    }
  }});

  // ── Depth 2: Toolbar ─────────────────────────────────────────────────
  _safeReg('clear-btn', { depth: 2, on: { tap: () => {
    state.bodies = []; state.loose = []; state.flashes = [];
    FutureCache.reset();
    Accumulator.clear();
    const pc = el('pcount'); if (pc) pc.textContent = '—';
  }}});

  _safeReg('config-btn', { depth: 2, on: { tap: () => {
    el('config-btn')?.click();
  }}});

  _safeRegEl(el('size-slider'),  { id: 'size-slider',  depth: 2, passthrough: false, on: { tap: () => {} }});
  _safeRegEl(el('grav-slider'),  { id: 'grav-slider',  depth: 2, passthrough: false, on: { tap: () => {} }});
  _safeRegEl(el('config-menu'),  { id: 'config-menu',  depth: 1, passthrough: false, on: { tap: () => {} }});
  _safeReg('debug-btn', { depth: 2, on: { tap: () => {
    const btn = el('debug-btn');
    DebugRouter.toggleAll();
    btn?.classList.toggle('active', DebugRouter.masterEnabled);
  }}});
  _safeReg('aims-btn', { depth: 2, on: { tap: () => {
    const btn = el('aims-btn');
    if (InAims.enabled) InAims.disable();
    else                InAims.enable();
    btn?.classList.toggle('active', InAims.enabled);
  }}});

  // Debug satellites — the sun-ray fan. Only live while debug is on; the guard
  // stops the canvas hit-map from firing them when they're hidden.
  _safeReg('dbg-closeall', { depth: 2, on: { tap: () => { if (DebugRouter.masterEnabled) DebugRouter.arrangeTetris(); } }});
  _safeReg('dbg-reset',    { depth: 2, on: { tap:  () => { if (DebugRouter.masterEnabled) DebugRouter.undo(); },
                                             hold: () => { if (DebugRouter.masterEnabled) DebugRouter.resetAllToProfile(); } }});
  _safeReg('dbg-arrange',  { depth: 2, on: { tap: () => { if (DebugRouter.masterEnabled) DebugRouter.toggleGridSnap(); } }});

  // ── Depth 1: Debug panels ────────────────────────────────────────────
  _registerDebugPanels();

  // ── Depth 3: Canvas world ────────────────────────────────────────────
  const r = _canvas?.getBoundingClientRect?.();
  const w = r?.width  ?? window.innerWidth;
  const h = r?.height ?? window.innerHeight;

  Aims.register({
    id: 'canvas-world', depth: 3, passthrough: false,
    bounds: { x: 60, y: 60, w: w - 120, h: h - 120 },
    on: {
      pointerdown: ({ aim }) => {
        if (!_InputState) return;
        _InputState.isHolding = true;
        _InputState.holdTime  = performance.now();
        _InputState.mouseX    = aim.ex;
        _InputState.mouseY    = aim.ey;
        el('cursor')?.classList.add('holding');
      },
      pointermove: ({ aim }) => {
        if (_InputState?.isHolding) {
          _InputState.mouseX = aim.ex;
          _InputState.mouseY = aim.ey;
        }
      },
      pointerup: () => {
        if (!_InputState?.isHolding) return;
        _InputState.isHolding = false;
        el('cursor')?.classList.remove('holding');
        import('./in-planet.js').then(m => {
          m.InPlanet?._spawnPlanet?.();
        });
      }
    }
  });

  _built = true;
  Aims.rebuild(window.innerWidth, window.innerHeight);
  console.log('[InAims] registered. Map built. Items:', Aims.debugInfo.items);
}

function _registerDebugPanels() {
  for (const panel of DebugRouter.panels) {
    const id = `debug-panel-${panel.id}`;
    Aims.unregister(id);                 // always clear the old region first
    if (!panel.visible) continue;        // hidden panels leave no phantom bounds
    // Use the panel's ACTUAL drawn size — not a hardcoded box — so minimized
    // panels don't leave a giant phantom hit area and expanded ones aren't clipped.
    let w = 180, h = 60;
    try {
      const L = panel.computeLayout(panel.getData?.() ?? {});
      if (L && Number.isFinite(L.w) && Number.isFinite(L.h)) { w = L.w; h = L.h; }
    } catch (_) {}
    Aims.register({
      id, depth: 1,
      bounds: { x: panel.x, y: panel.y, w, h },
      passthrough: false,
      on: {
        pointerdown: ({ aim }) => {
          _InDebug?.handleDown?.({
            clientX: aim.ex, clientY: aim.ey,
            pointerId: 0,
            preventDefault: () => {},
            stopImmediatePropagation: () => {}
          });
        }
      }
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────
export const InAims = {

  get enabled() { return _enabled; },

  init(canvas, InputState, InUI, InDebug) {
    _canvas     = canvas;
    _InputState = InputState;
    _InUI       = InUI;
    _InDebug    = InDebug;
  },

  enable() {
    if (_enabled) return;
    _enabled = true;
    const doEnable = () => {
      try {
        if (!_built) _registerAll();
        // Don't bindPointer — InputModule already routes through handleDown/Move/Up
        // bindPointer would add a second listener causing double-fires
        console.log('[InAims] AIMS enabled | items:', Aims.debugInfo.items, '| map:', Aims.debugInfo.mapSize);
      } catch (err) {
        console.error('[InAims] enable() failed:', err);
        _enabled = false;
      }
    };
    // If DOM already painted, run now. Otherwise wait.
    if (document.readyState === 'complete' && _canvas) {
      requestAnimationFrame(() => requestAnimationFrame(doEnable));
    } else {
      window.addEventListener('load', () => requestAnimationFrame(() => requestAnimationFrame(doEnable)), { once: true });
    }
  },

  disable() {
    _enabled = false;
    console.log('[InAims] AIMS disabled');
  },

  syncDebugPanels() {
    if (!_built) return;
    _registerDebugPanels();
    Aims.rebuild(window.innerWidth, window.innerHeight);
  },

  onResize() {
    if (!_built) return;
    Aims.rebuild(window.innerWidth, window.innerHeight);
  },

  handleDown(e) {
    if (!_enabled) return false;
    const hits = Aims.aim.down(e.clientX, e.clientY);
    if (Array.isArray(hits) && hits.length > 0) {
      console.log('[InAims] hit:', hits, 'at', e.clientX.toFixed(0), e.clientY.toFixed(0));
      return true;
    }
    return false;
  },

  handleMove(e) {
    if (!_enabled) return false;
    const hits = Aims.aim.move(e.clientX, e.clientY);
    return Array.isArray(hits) && hits.length > 0 && !!_InputState?.isPointerDown;
  },

  handleUp(e) {
    if (!_enabled) return false;
    try { Aims.aim.up(e.clientX, e.clientY); } catch (_) {}
    return false;
  },

  debugDraw(ctx, showMap = false) {
    if (_enabled) Aims.debugDraw(ctx, showMap);
  }
};
