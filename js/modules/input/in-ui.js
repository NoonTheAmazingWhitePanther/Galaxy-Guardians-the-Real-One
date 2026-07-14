/**
 * js/modules/input/in-ui.js
 * Handles HTML DOM UI interactions.
 */
import { clamp, hypot } from '../../core/math.js';
import { state, setPhysSpeed, setSunGravMult, togglePause, SPEED_MAX } from '../../core/state.js';
import { CameraModule } from '../camera/camera.module.js';
import { StateCache } from '../../core/state-cache.js';
import { FutureCache } from '../../core/future-cache.js';
import { InputState } from './input.module.js';
import { DEBUG_STATE } from '../debug/debug-state.js';
import { Benchmark } from '../debug/benchmark.js';

// View-zoom (debug + panel mode): the zoom bar zooms the debug panel layer
// (pure view transform) instead of the camera. It does NOT resize panels —
// sizing lives ONLY in PANEL SETTINGS. Master slider is measured off DOM
// buttons, so it is NEVER affected — fixed size forever. Range allows real
// zoom-out AND zoom-in; FIT frames the ENTIRE debug screen (bounding box of
// every visible panel), zoom + pan together.
const VIEW_ZOOM_MIN = 0.15;
const VIEW_ZOOM_MAX = 2.50;
const FIT_MARGIN    = 16;   // screen px kept around the framed panels

export const InUI = {
  uiEl: null,
  init: function(uiEl, slider, pcountEl, gravSlider, gravVal) {
    this.uiEl = uiEl;
    this._bindDOMEvents(slider, pcountEl, gravSlider, gravVal);
  },

  _bindDOMEvents: function(slider, pcountEl, gravSlider, gravVal) {
    // Gravity Slider
    if (gravSlider) {
      gravSlider.addEventListener('input', () => {
        setSunGravMult(parseFloat(gravSlider.value));
        // Gravity is part of what every future tick computes — anything
        // already cached ahead was computed under the old value.
        FutureCache.invalidate();
        if (gravVal) gravVal.textContent = parseFloat(gravSlider.value).toFixed(2) + 'x';
      });
    }

    // Speed Bar
    const spTrack = document.getElementById('sp-track');
    const spPause = document.getElementById('sp-pause');
    const spFast = document.getElementById('sp-fast');
    const spSlow = document.getElementById('sp-slow');

    if (spPause) spPause.addEventListener('pointerdown', (e) => { e.preventDefault(); togglePause(); this._updateSpeedUI(); });
    if (spFast) spFast.addEventListener('pointerdown', (e) => { e.preventDefault(); setPhysSpeed(parseFloat((state.physSpeed + 0.5).toFixed(1))); this._updateSpeedUI(); });
    if (spSlow) spSlow.addEventListener('pointerdown', (e) => { e.preventDefault(); setPhysSpeed(parseFloat((state.physSpeed - 0.5).toFixed(1))); this._updateSpeedUI(); });

    if (spTrack) {
      spTrack.addEventListener('pointerdown', (e) => { 
        InputState.spDrag = true; 
        this._spTrackPos(e.clientY); 
        e.preventDefault(); 
      });
    }

    // Zoom Bar
    const zmTrack = document.getElementById('zm-track');
    const zmIn = document.getElementById('zm-in');
    const zmOut = document.getElementById('zm-out');
    const zmFit = document.getElementById('zm-fit');
    if (zmIn) zmIn.addEventListener('pointerdown', (e) => { e.preventDefault();
      if (this._panelZoomMode()) { this._panelZoomBy(1.10); return; }
      CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom * 1.3, CameraModule.cam.minZoom, CameraModule.cam.maxZoom); });
    if (zmOut) zmOut.addEventListener('pointerdown', (e) => { e.preventDefault();
      if (this._panelZoomMode()) { this._panelZoomBy(1/1.10); return; }
      CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom / 1.3, CameraModule.cam.minZoom, CameraModule.cam.maxZoom); });
    if (zmFit) zmFit.addEventListener('pointerdown', (e) => { e.preventDefault();
      if (this._panelZoomMode()) { this._panelViewFit(); return; }   // FIT → frame ALL panels
      CameraModule.frameBodies(); });

    if (zmTrack) {
      zmTrack.addEventListener('pointerdown', (e) => {
        if (this._panelZoomMode()) { this._panelZoomTrack(e.clientY); e.preventDefault(); return; }
        InputState.zmDrag = true;
        this._zmTrackPos(e.clientY);
        e.preventDefault();
      });
    }

    // Clear Button — 🔴. During a benchmark this is the STOP button: the run
    // aborts (nothing saved) and the clear below IS the clean slate — the
    // benchmark's own teardown skips restoring the pre-run scene when stopped.
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      try { Benchmark.stop(); } catch (_) {}
      state.bodies = []; state.loose = []; state.flashes = [];
      StateCache.clear();
      FutureCache.reset();
      // (TrailsModule buffer reset removed — the module is retired and its
      // trailBufs was permanently empty; the vault clear above is what
      // actually resets the live stamp trail.)
      if (pcountEl) pcountEl.textContent = '-';
    });
  },

  _spTrackPos: function(clientY) {
    const spTrack = document.getElementById('sp-track');
    if (!spTrack) return;
    const rect = spTrack.getBoundingClientRect();
    const newSpeed = parseFloat((clamp(1 - (clientY - rect.top) / rect.height, 0, 1) * SPEED_MAX).toFixed(1));
    setPhysSpeed(newSpeed);
    this._updateSpeedUI();
  },

  _zmTrackPos: function(clientY) {
    const zmTrack = document.getElementById('zm-track');
    if (!zmTrack) return;
    const rect = zmTrack.getBoundingClientRect();
    const frac = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
    const logMin = Math.log(CameraModule.cam.minZoom);
    const logMax = Math.log(CameraModule.cam.maxZoom);
    CameraModule.cam.targetZoom = Math.exp(logMin + frac * (logMax - logMin));
  },

  // ── View-zoom (debug + panel mode) ────────────────────────────────────────
  // The zoom bar zooms the debug VIEW via DEBUG_STATE.viewZoom — a pure canvas
  // transform at blit time. No panel resizing, no chrome rebuild, no restyle:
  // panel layout and offscreen caches are untouched. Hit-testing (in-debug +
  // AIMS bounds) maps through the same factor. The master vertical slider is
  // measured off DOM buttons and drawn outside the transform: fixed, forever.
  _panelZoomMode: function() {
    const R = window._DebugRouter;
    return !!(R && R.masterEnabled && !R._consoleMode);
  },
  _applyViewZoom: function(v) {
    const oldZ = DEBUG_STATE.viewZoom || 1;
    const newZ = clamp(v, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX);
    // ZOOM FROM THE CENTER OF THE DEBUG TABLE: the pivot is the centroid of
    // every visible panel (screen space). Adjust the pan so that point stays
    // put while the scale changes — the table breathes around its own middle.
    const R = window._DebugRouter;
    const panels = (R?.panels || []).filter(p => p.visible);
    if (panels.length && newZ !== oldZ) {
      let cx = 0, cy = 0;
      for (const p of panels) { cx += p.x + (p.w || 120) / 2; cy += p.y + (p.h || 60) / 2; }
      cx /= panels.length; cy /= panels.length;                       // panel-space pivot
      const sx = cx * oldZ + (DEBUG_STATE.viewPanX || 0);             // its screen position
      const sy = cy * oldZ + (DEBUG_STATE.viewPanY || 0);
      DEBUG_STATE.viewPanX = sx - cx * newZ;                          // keep it fixed
      DEBUG_STATE.viewPanY = sy - cy * newZ;
    }
    DEBUG_STATE.viewZoom = newZ;
    try { window._InAims?.syncDebugPanels(); } catch (_) {}   // view scaled → refresh tap map
  },
  _panelZoomBy:    function(mult) { this._applyViewZoom((DEBUG_STATE.viewZoom || 1) * mult); },
  // FIT → frame the ENTIRE debug screen: bounding box of every visible panel,
  // zoomed + panned to fit inside the viewport with a margin. No panels → home.
  _panelViewFit:   function() {
    const R = window._DebugRouter;
    const panels = (R?.panels || []).filter(p => p.visible);
    if (!panels.length) {
      DEBUG_STATE.viewPanX = 0; DEBUG_STATE.viewPanY = 0;
      this._applyViewZoom(1.0);
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of panels) {
      let w = p.w || 120, h = p.h || 56;
      try {
        const L = p.computeLayout(p._cachedData ?? {});
        if (L && Number.isFinite(L.w) && Number.isFinite(L.h)) { w = L.w; h = L.h; }
      } catch (_) {}
      minX = Math.min(minX, p.x);      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + w);  maxY = Math.max(maxY, p.y + h);
    }
    const boxW = Math.max(1, maxX - minX);
    const boxH = Math.max(1, maxY - minY);
    const availW = Math.max(1, (window.innerWidth  || 1) - FIT_MARGIN * 2);
    const availH = Math.max(1, (window.innerHeight || 1) - FIT_MARGIN * 2);
    const vz = clamp(Math.min(availW / boxW, availH / boxH), VIEW_ZOOM_MIN, VIEW_ZOOM_MAX);
    // Centre the box on screen: pan = screen-centre − box-centre×zoom.
    DEBUG_STATE.viewPanX = (window.innerWidth  || 0) / 2 - (minX + boxW / 2) * vz;
    DEBUG_STATE.viewPanY = (window.innerHeight || 0) / 2 - (minY + boxH / 2) * vz;
    this._applyViewZoom(vz);
  },
  _panelZoomTrack: function(clientY) {
    const t = document.getElementById('zm-track');
    if (!t) return;
    const rect = t.getBoundingClientRect();
    const frac = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
    this._applyViewZoom(VIEW_ZOOM_MIN + frac * (VIEW_ZOOM_MAX - VIEW_ZOOM_MIN));
  },

  _updateSpeedUI: function() {
    const spLabel = document.getElementById('sp-label');
    const spPause = document.getElementById('sp-pause');
    const spFill = document.getElementById('sp-fill');
    const spThumb = document.getElementById('sp-thumb');

    if (spLabel) spLabel.textContent = state.physSpeed === 0 ? '0x' : state.physSpeed === 1 ? '1x' : state.physSpeed.toFixed(1) + 'x';
    if (spPause) { spPause.textContent = state.paused ? '▶' : '▐▐'; spPause.className = state.paused ? 'paused' : ''; }    if (spFill && spThumb) {
      const frac = state.physSpeed / SPEED_MAX;
      spFill.style.height = (frac * 100) + '%';
      spThumb.style.top = ((1 - frac) * 100) + '%';
    }
  },

  // ── ROUTER HANDLERS ──
  handleDown: function(e) {
    // Sticky pan lock — all canvas touches become pan direction input
    if (InputState.panLocked && !e.target.closest('#speed-bar, #zoom-bar, #pan-pad, #debug-btn, #aims-btn, #config-btn')) {
      InputState.panPadActive = true;
      this._handlePanPadMoveRaw(e.clientX, e.clientY);
      return true;
    }
    // If clicking on any UI element, consume it.
    if (this.uiEl && this.uiEl.contains(e.target)) return true;
    if (e.target.closest('#speed-bar, #zoom-bar, #pan-pad, #debug-toggle-btn, #config-btn, #cursor, .fps-counter')) return true;
    // Handle track drags
    if (InputState.spDrag || InputState.zmDrag) return true;
    return false;
  },

  handleMove: function(e) {
    if (InputState.spDrag) { this._spTrackPos(e.clientY); return true; }
    if (InputState.zmDrag) { this._zmTrackPos(e.clientY); return true; }
    // In locked mode route all moves to pan
    if (InputState.panLocked && InputState.panPadActive) {
      this._handlePanPadMoveRaw(e.clientX, e.clientY);
      return true;
    }
    if (this._handlePanPadMove(e)) return true;
    return false;
  },

  handleUp: function() {
    if (InputState.spDrag || InputState.zmDrag) {
      InputState.spDrag = false; InputState.zmDrag = false;
      return true;
    }
    // In locked mode — keep pan active on release, don't deactivate
    if (InputState.panLocked) return false;
    if (this._handlePanPadUp()) return true;
    return false;
  },

  // Pan Pad Logic
  _handlePanPadMove: function(e) {
    if (!InputState.panPadActive) return false;
    const panPad = document.getElementById('pan-pad');
    if (!panPad) return false;
    const rect = panPad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const sector = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    InputState.panPadDir.x = Math.cos(sector); 
    InputState.panPadDir.y = Math.sin(sector);
    return true;
  },

  _handlePanPadUp: function() {
    if (!InputState.panPadActive) return false;
    InputState.panPadActive = false;
    InputState.panLocked    = false;
    InputState.panPadPower  = 0;
    InputState.panPadDir    = { x: 0, y: 0 };
    const panPad = document.getElementById('pan-pad');
    if (panPad) panPad.classList.remove('active', 'locked');
    // If the pad was panning the debug view, land the AIMS tap-map exactly.
    if (this._panelZoomMode()) { try { window._InAims?.syncDebugPanels(); } catch (_) {} }
    return true;
  },

  // Move using raw x,y (not from event — used by locked mode and AIMS)
  _handlePanPadMoveRaw: function(cx, cy) {
    if (!InputState.panPadActive) return false;
    const panPad = document.getElementById('pan-pad');
    if (!panPad) return false;
    const rect   = panPad.getBoundingClientRect();
    const pcx    = rect.left + rect.width / 2;
    const pcy    = rect.top  + rect.height / 2;
    const angle  = Math.atan2(cy - pcy, cx - pcx);
    const sector = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    InputState.panPadDir.x = Math.cos(sector);
    InputState.panPadDir.y = Math.sin(sector);
    return true;
  }
};

// Bind Pan Pad Down event specifically
document.addEventListener('DOMContentLoaded', () => {
  const panPad = document.getElementById('pan-pad');
  if (panPad) {
    panPad.addEventListener('pointerdown', (e) => {
      // Toggle sticky lock on tap vs drag
      // If already locked and tapping pad — unlock
      if (InputState.panLocked) {
        InputState.panLocked   = false;
        InputState.panPadActive = false;
        InputState.panPadPower  = 0;
        InputState.panPadDir    = { x: 0, y: 0 };
        panPad.classList.remove('active', 'locked');
        e.preventDefault();
        return;
      }
      // Normal activation
      InputState.panPadActive = true;
      InputState.panPadPower  = 0;
      panPad.classList.add('active');
      panPad.setPointerCapture(e.pointerId);
      InUI._handlePanPadMove(e);
      e.preventDefault();
    });

    // Tap detection — if finger lifted quickly on the pad, lock it
    panPad.addEventListener('pointerup', (e) => {
      if (!InputState.panLocked && InputState.panPadActive) {
        // Lock — sticky pan mode on
        InputState.panLocked    = true;
        InputState.panPadActive = true;
        panPad.classList.add('locked');
        e.preventDefault();
      }
    });
  }
  
  // Expose Pan Pad update for main loop
  window.Sim = window.Sim || {};
  window.Sim.updatePanPad = function() {
    if (!InputState.panPadActive) return;
    const PAN_ACCEL = 0.7, PAN_MAX = 3;
    InputState.panPadPower = Math.min(InputState.panPadPower + PAN_ACCEL, PAN_MAX);

    // Debug + panel mode → the pan pad pans the DEBUG VIEW (the panel layer),
    // not the camera. Direction matches the camera feel: push right = look
    // right = content slides left. Screen-px speed, independent of cam zoom.
    if (InUI._panelZoomMode()) {
      DEBUG_STATE.viewPanX -= InputState.panPadDir.x * InputState.panPadPower;
      DEBUG_STATE.viewPanY -= InputState.panPadDir.y * InputState.panPadPower;
      // Panels moved on screen — refresh the AIMS tap-map, throttled while the
      // pad is held (final exact sync happens on pad release).
      if ((InUI._panSyncTick = (InUI._panSyncTick || 0) + 1) % 8 === 0) {
        try { window._InAims?.syncDebugPanels(); } catch (_) {}
      }
      return;
    }

    const speed = Math.min(InputState.panPadPower / CameraModule.cam.zoom, 100);
    CameraModule.cam.x += InputState.panPadDir.x * speed;
    CameraModule.cam.y += InputState.panPadDir.y * speed;
  };
});