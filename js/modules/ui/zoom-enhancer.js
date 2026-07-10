/**
 * js/modules/ui/zoom-enhancer.js
 * AIMS ZOOM ENHANCER — aims-sat-zoom satellite.
 *
 * A small magnifier box that shows a zoomed crop of the main canvas,
 * centered on the aim's position (Aims.aim.x/y — the one authoritative
 * position every profile writes to; see aims-profiles.js). CONFIRMED:
 * the crosshair drawn inside the box sits at the box's exact geometric
 * center (BOX_SIZE/2, BOX_SIZE/2) — always, unconditionally — and the
 * crop is always cropped centered on aim.x/y, so that center point IS
 * exactly where the aim is, regardless of which profile (Trackpad/
 * Joystick/Offset) is currently computing aim.x/y. There's no separate
 * "Offset profile" special case here — this box doesn't know or care
 * which profile is active, it just always shows the aim.
 *
 * Two DIFFERENT, UNRELATED offsets are in play in this file and in
 * Profile 3 (aims-profiles.js) — same word, deliberately renamed here to
 * BOX_OFFSET_X/Y so they can't be confused reading the code:
 *   - BOX_OFFSET_X/Y (below) — where the magnifier BOX ITSELF sits on
 *     screen relative to the aim, purely so it doesn't cover the aim/
 *     finger. Presentational only — never touches what's shown inside it
 *     or where the crosshair sits within it.
 *   - Aims.aim.offsetX/offsetY (core/aims.js, AIM_OFFSET_X/Y) — Profile
 *     3/Offset's own finger-bias correction, used ONLY inside that one
 *     profile's onDown/onMove math to compute aim.x/y in the first
 *     place. This file never reads it directly.
 *
 * Box: 100×100 CSS px, positioned at (aim.x + BOX_OFFSET_X, aim.y +
 * BOX_OFFSET_Y) — up-and-left of the aim, never covering it.
 *
 * Zoom: crops a 50×50 CSS-px region of the main canvas around the aim
 * position and scales it to fill the 100×100 box — a straightforward 2×
 * magnification. Adjust ZOOM_FACTOR below to change.
 */
import { Aims } from '../../core/aims.js';
import { DEBUG_STATE } from '../debug/debug-state.js';
import { AimsEdge, AUTOMATE_CLAMP_INSET } from '../../core/aims-edge.js';

const BOX_SIZE      = 100;   // CSS px — the magnifier box itself
const BOX_OFFSET_X  = -125;  // CSS px — box's OWN screen position relative to the aim (display only, see header)
const BOX_OFFSET_Y  = -75;
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

    // Box's OWN screen position — offset from the aim purely for display
    // (BOX_OFFSET_X/Y, see header). Nothing here affects what's cropped
    // or where the crosshair sits — that's the next block, always
    // centered on aim.x/y regardless of this.
    //
    // Same AimsEdge the Offset profile uses (aims-sat-mirror satellite,
    // core/aims-edge.js) — "even the Zoom Enhancer should be doing this."
    // BOX_OFFSET_X/Y naturally push the box up-left of the aim, same
    // direction the base finger-bias offset favors, so the exact same
    // corner (top-left) is where the box would otherwise run off-screen
    // — reusing computeSign() here isn't a coincidence, it's the same
    // problem in the same direction, just for a 100×100 box instead of a
    // point. Clamp is box-aware (accounts for BOX_SIZE), not just a
    // point clamp — the WHOLE box has to stay on-screen, not just its
    // top-left corner.
    // BOX_SIZE passed for both elemW/elemH — the box's own footprint
    // matters here (unlike the crosshair, a point). See core/aims-edge.js.
    const { signX, signY } = AimsEdge.computeSign(aim.x, aim.y, BOX_OFFSET_X, BOX_OFFSET_Y, BOX_SIZE, BOX_SIZE);
    let boxX = aim.x + BOX_OFFSET_X * signX;
    let boxY = aim.y + BOX_OFFSET_Y * signY;
    // Hard, unconditional guarantee — "the offset should never be drawn
    // outside of the screen," no mode check, matching AimsEdge.clamp()'s
    // own unconditional guarantee for the crosshair. Box-aware (accounts
    // for BOX_SIZE) since the WHOLE box has to stay on-screen, not just
    // its top-left corner — AimsEdge.clamp() itself is point-only.
    const inset = AUTOMATE_CLAMP_INSET;
    boxX = Math.min(Math.max(boxX, inset), window.innerWidth  - BOX_SIZE - inset);
    boxY = Math.min(Math.max(boxY, inset), window.innerHeight - BOX_SIZE - inset);
    this._canvas.style.left = `${boxX}px`;
    this._canvas.style.top  = `${boxY}px`;
    this._canvas.style.display = 'block';

    // Crop content — centered on the aim position, converted to the
    // source canvas's device-px backing store (same dpr scaling used
    // throughout the render pipeline).
    const srcCx = aim.x * dpr;
    const srcCy = aim.y * dpr;
    const srcHalf = (SOURCE_SIZE / 2) * dpr;

    this._ctx.clearRect(0, 0, BOX_SIZE, BOX_SIZE);
    try {
      this._ctx.drawImage(
        this._sourceCanvas,
        srcCx - srcHalf, srcCy - srcHalf, srcHalf * 2, srcHalf * 2,
        0, 0, BOX_SIZE, BOX_SIZE
      );
    } catch (_) { /* source not painted yet — skip this frame */ }

    // Crosshair — ALWAYS at the box's exact geometric center
    // (BOX_SIZE/2, BOX_SIZE/2), because the crop above is ALWAYS cropped
    // centered on aim.x/y. That center point marks exactly where the aim
    // is, right now, no matter which profile is currently computing it —
    // this box has no profile-specific logic of its own at all.
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
