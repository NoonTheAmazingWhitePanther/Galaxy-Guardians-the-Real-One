/**
 * js/modules/input/in-planet.js
 * Handles Planet Spawning:
 *   HOLD STILL  → charge, release to spawn one big planet (classic, plane 0).
 *   HOLD + DRAG → the PLANT PLANET BRUSH: paints a planet every BRUSH_SPACING
 *                 screen-px along the stroke, each into the NEXT plane of
 *                 existence (round-robin over config.PLANE_COUNT) — one stroke
 *                 seeds the whole metaverse of parallel physics strings.
 */
import { CameraModule } from '../camera/camera.module.js';
import { InputState } from './input.module.js';
import { config } from '../../core/config.js';
import { ManualOverrides } from '../debug/governor.js';

const BRUSH_SPACING = 90;   // screen px of stroke between planted planets
const BRUSH_SLOP    = 14;   // move this far before the hold becomes a brush
const _ov = (k, d) => {
  const v = ManualOverrides[k]?.value;
  return Number.isFinite(v) ? v : d;
};

export const InPlanet = {
  cursorEl: null,
  slider: null,
  pcountEl: null,
  _brush: null,               // { lastX, lastY, dist, planted }
  _plane: 0,                  // round-robin cursor across planes

  init(canvas, cursorEl, slider, pcountEl) {
    this.cursorEl = cursorEl;
    this.slider = slider;
    this.pcountEl = pcountEl;
  },

  handleDown(e) {
    // Only left click (button 0) or touch
    if (e.button !== 0 && e.pointerType !== 'touch') return false;

    InputState.isHolding = true;
    InputState.holdTime = performance.now();
    InputState.mouseX = e.clientX;
    InputState.mouseY = e.clientY;
    this._brush = { lastX: e.clientX, lastY: e.clientY, dist: 0, planted: 0 };

    // CRITICAL: Prevent browser from intercepting touch as scroll gesture
    if (e.cancelable) e.preventDefault();

    if (this.cursorEl) this.cursorEl.classList.add('holding');
    return true; // CONSUMED
  },

  handleMove(e) {
    if (!InputState.isHolding) return false;

    // Update coordinates so charge ring follows finger/cursor
    InputState.mouseX = e.clientX;
    InputState.mouseY = e.clientY;

    // ── Plant Planet Brush ──────────────────────────────────────────────
    const b = this._brush;
    if (b) {
      b.dist += Math.hypot(e.clientX - b.lastX, e.clientY - b.lastY);
      b.lastX = e.clientX; b.lastY = e.clientY;
      // First planet plants once the stroke is clearly a drag; the rest every
      // BRUSH_SPACING of path length after that.
      const due = b.planted === 0 ? BRUSH_SLOP : BRUSH_SPACING;
      if (b.dist >= due) {
        b.dist = 0;
        b.planted++;
        this._plantBrush(e.clientX, e.clientY);
      }
    }

    // Keep preventing default to ensure drag isn't interrupted
    if (e.cancelable) e.preventDefault();
    return true; // CONSUMED
  },

  handleUp(e) {
    // If we were holding, ALWAYS release regardless of button type
    if (!InputState.isHolding) return false;

    InputState.isHolding = false;
    if (this.cursorEl) this.cursorEl.classList.remove('holding');

    const brushed = (this._brush?.planted || 0) > 0;
    this._brush = null;
    // A brush stroke already planted its planets — no charged mega-spawn on top.
    if (!brushed) this._spawnPlanet();
    return true; // CONSUMED
  },

  // Brush planet — governed by the PLANET BRUSH panel:
  //   size   = between Start and Max, spread by the Random factor
  //            (0 = always the midpoint, 1 = full min..max randomness)
  //   plane  = fixed group knob, or -1 = the CPU selects (round-robin)
  //   color  = named palette knob, or -1 = Random (the classic way)
  _plantBrush(sx, sy) {
    const lo = Math.min(_ov('brushSizeMin', 24), _ov('brushSizeMax', 60));
    const hi = Math.max(_ov('brushSizeMin', 24), _ov('brushSizeMax', 60));
    const rf = Math.max(0, Math.min(1, _ov('brushRandom', 1)));
    const t  = 0.5 + (Math.random() - 0.5) * rf;
    const radius = Math.max(10, Math.min(110, Math.round(lo + (hi - lo) * t)));

    const planeCount = Math.max(1, config.PLANE_COUNT | 0);
    const planeKnob  = Math.round(_ov('brushPlane', -1));
    let plane;
    if (planeKnob >= 0 && planeKnob < planeCount) {
      plane = planeKnob;                                   // fixed group
    } else {
      plane = this._plane;                                 // CPU selects
      this._plane = (this._plane + 1) % planeCount;
    }

    const palIdx = Math.round(_ov('brushColor', -1));

    const w = CameraModule.screenToWorld(sx, sy);
    import('../ui/overlays.js').then((module) => {
      module.OverlaysModule.spawnPlanet(w.x, w.y, radius / 8, this.pcountEl, plane, palIdx);
    });
  },

  _spawnPlanet() {
    const charge = Math.min((performance.now() - InputState.holdTime) / 2000, 1);
    const sliderVal = parseFloat(this.slider.value);
    const raw = sliderVal * (1 + charge * 4);
    const t = Math.min(raw / 50, 1);
    const multiplier = 0.25 + 2.25 * Math.pow(t, 1.4);
    const radius = Math.max(10, Math.min(110, Math.round(40 * multiplier)));

    const w = CameraModule.screenToWorld(InputState.mouseX, InputState.mouseY);

    import('../ui/overlays.js').then((module) => {
      module.OverlaysModule.spawnPlanet(w.x, w.y, radius / 8, this.pcountEl, 0);
    });
  }
};