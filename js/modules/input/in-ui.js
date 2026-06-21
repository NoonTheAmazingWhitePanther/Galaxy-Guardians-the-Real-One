/**
 * js/modules/input/in-ui.js
 * Handles HTML DOM UI interactions.
 */
import { clamp, hypot } from '../../core/math.js';
import { state, setPhysSpeed, setSunGravMult, togglePause, SPEED_MAX } from '../../core/state.js';
import { CameraModule } from '../camera/camera.module.js';
import { StateCache } from '../../core/state-cache.js';
import { TrailsModule } from '../rendering/trails.js';
import { InputState } from './input.module.js';

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
    if (zmIn) zmIn.addEventListener('pointerdown', (e) => { e.preventDefault(); CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom * 1.3, CameraModule.cam.minZoom, CameraModule.cam.maxZoom); });
    if (zmOut) zmOut.addEventListener('pointerdown', (e) => { e.preventDefault(); CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom / 1.3, CameraModule.cam.minZoom, CameraModule.cam.maxZoom); });
    if (zmFit) zmFit.addEventListener('pointerdown', (e) => { e.preventDefault(); CameraModule.frameBodies(); });

    if (zmTrack) {
      zmTrack.addEventListener('pointerdown', (e) => { 
        InputState.zmDrag = true; 
        this._zmTrackPos(e.clientY); 
        e.preventDefault(); 
      });
    }

    // Clear Button
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      state.bodies = []; state.loose = []; state.flashes = [];
      StateCache.clear(); 
      for (const buf of TrailsModule.trailBufs) buf.used = false;
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
    const speed = Math.min(InputState.panPadPower / CameraModule.cam.zoom, 100);
    CameraModule.cam.x += InputState.panPadDir.x * speed;
    CameraModule.cam.y += InputState.panPadDir.y * speed;
  };
});