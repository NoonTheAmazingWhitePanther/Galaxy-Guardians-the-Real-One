/**
 * js/modules/ui/zoom-enhancer.js
 * AIMS ZOOM ENHANCER — aims-sat-zoom satellite.
 *
 * A small magnifier box that shows a zoomed crop of the main canvas,
 * centered on AIMS's EFFECTIVE aim position (Aims.aim.ex/ey — "exactly
 * what AIMS is looking at", i.e. the finger position after its offset
 * bias, the same point AIMS itself resolves hits against).
 *
 * Box: 100×100 CSS px, positioned at (aim.x - 125, aim.y - 75) — offset
 * from the RAW finger/pointer position (not the effective one), so the
 * box sits up-and-left of the actual touch point and never sits under
 * the finger itself.
 *
 * Zoom: crops a 50×50 CSS-px region of the main canvas around the
 * effective aim position and scales it to fill the 100×100 box — a
 * straightforward 2× magnification. Adjust ZOOM_FACTOR below to change.
 */
import { Aims } from '../../core/aims.js';
import { DEBUG_STATE } from '../debug/debug-state.js';

const BOX_SIZE     = 100;   // CSS px — the magnifier box itself
const OFFSET_X     = -125;  // CSS px from raw finger position
const OFFSET_Y     = -75;
const ZOOM_FACTOR   = 2;    // 2× — source crop is BOX_SIZE / ZOOM_FACTOR
const SOURCE_SIZE   = BOX_SIZE / ZOOM_FACTOR;   // 50×50 CSS px cropped

export const ZoomEnhancer = {
  enabled: false,
  _canvas: null,      // the small magnifier <canvas>
  _ctx: null,
  _sourceCanvas: null, // the main game canvas, cropped FROM

  init(sourceCanvas) {
    this._sourceCanvas = sourceCanvas;

    const c = document.createElement('canvas');
    c.id = 'zoom-enhancer-box';
    c.width  = BOX_SIZE;
    c.height = BOX_SIZE;
    c.style.position = 'fixed';
    c.style.zIndex = '90';
    c.style.borderRadius = '8px';
    c.style.border = '1px solid rgba(255,255,255,0.25)';
    c.style.boxShadow = '0 4px 16px rgba(0,0,0,0.5)';
    c.style.pointerEvents = 'none';   // never intercepts input — display only
    c.style.display = 'none';
    document.body.appendChild(c);

    this._canvas = c;
    this._ctx = c.getContext('2d');
  },

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled && this._canvas) this._canvas.style.display = 'none';
    return this.enabled;
  },

  /**
   * Call once per rendered frame while AIMS is enabled. No-op when the
   * enhancer itself is off, or before init().
   */
  render() {
    if (!this.enabled || !this._canvas || !this._sourceCanvas) return;

    const aim = Aims.aim;
    const dpr = DEBUG_STATE.dpr || window.devicePixelRatio || 1;

    // Box position — CSS px, offset from the RAW finger point.
    const boxX = aim.x + OFFSET_X;
    const boxY = aim.y + OFFSET_Y;
    this._canvas.style.left = `${boxX}px`;
    this._canvas.style.top  = `${boxY}px`;
    this._canvas.style.display = 'block';

    // Crop content — centered on the EFFECTIVE aim position, converted to
    // the source canvas's device-px backing store (same dpr scaling used
    // throughout the render pipeline; see Aims.debugDraw for the same math).
    const srcCx = aim.ex * dpr;
    const srcCy = aim.ey * dpr;
    const srcHalf = (SOURCE_SIZE / 2) * dpr;

    this._ctx.clearRect(0, 0, BOX_SIZE, BOX_SIZE);
    try {
      this._ctx.drawImage(
        this._sourceCanvas,
        srcCx - srcHalf, srcCy - srcHalf, srcHalf * 2, srcHalf * 2,
        0, 0, BOX_SIZE, BOX_SIZE
      );
    } catch (_) { /* source not painted yet — skip this frame */ }

    // Crosshair — marks the exact effective aim point within the crop.
    this._ctx.strokeStyle = 'rgba(255,200,80,0.85)';
    this._ctx.lineWidth = 1;
    this._ctx.beginPath();
    this._ctx.moveTo(BOX_SIZE / 2 - 6, BOX_SIZE / 2);
    this._ctx.lineTo(BOX_SIZE / 2 + 6, BOX_SIZE / 2);
    this._ctx.moveTo(BOX_SIZE / 2, BOX_SIZE / 2 - 6);
    this._ctx.lineTo(BOX_SIZE / 2, BOX_SIZE / 2 + 6);
    this._ctx.stroke();
  }
};

export default ZoomEnhancer;
