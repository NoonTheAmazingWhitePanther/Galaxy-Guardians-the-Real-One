/**
 * js/modules/ui/planet-inspector.js
 * SELECTION ZOOM BOX — the live magnifier companion to the "selection"
 * debug Panel (js/modules/debug/panels/selection.json).
 *
 * REFACTOR: the vitals text card and its own close button used to live
 * here too, as a standalone DOM overlay. Per direction ("make the
 * Inspector panel like a normal Panel... hold all the panel features
 * including dragging"), the vitals moved into a REAL debug Panel
 * (SelectionVitals, core/selection-vitals.js + panels/selection.json) —
 * it gets dragging/pin/minimize/maximize for free from the existing
 * Panel system, which a hand-rolled DOM div never could. This file now
 * ONLY does the one thing a real Panel's text-line renderer can't: a
 * live magnified crop of the main canvas. Same technique as
 * zoom-enhancer.js (crop the ALREADY-RENDERED canvas around a screen
 * point, scale it up) — not a second render pass, not a separate camera.
 *
 * Screen-anchored (left edge, vertically centered) — NOT attached to the
 * selection Panel's own (draggable) position. Deliberately kept simple:
 * following the panel's live x/y would need replicating the debug view's
 * pan/zoom transform (panel-space → screen-space, see in-debug.js's
 * _toPanel), which is a real but separate piece of work from what was
 * asked for here.
 */
import { SelectionTool } from '../input/in-selection-tool.js';
import { SelectionVitals } from '../../core/selection-vitals.js';
import { CameraModule } from '../camera/camera.module.js';
import { DEBUG_STATE } from '../debug/debug-state.js';

const BOX_SIZE    = 110;   // CSS px — magnifier box, same idea as ZoomEnhancer's
const ZOOM_FACTOR = 3;     // magnification — tighter than ZoomEnhancer's 2×, planets are usually smaller than a full aim gesture's working area
const SOURCE_SIZE = BOX_SIZE / ZOOM_FACTOR;

export const PlanetInspector = {
  _sourceCanvas: null,
  _canvas: null, _ctx: null,

  init(sourceCanvas) {
    this._sourceCanvas = sourceCanvas;

    const c = document.createElement('canvas');
    c.id = 'planet-inspector-zoom';
    c.width = BOX_SIZE; c.height = BOX_SIZE;
    c.style.position = 'fixed';
    c.style.left = 'var(--safe, 16px)';
    c.style.top = '50%';
    c.style.transform = 'translateY(-50%)';
    c.style.zIndex = '60';
    c.style.borderRadius = '8px';
    c.style.border = '1px solid rgba(255,255,255,0.25)';
    c.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
    c.style.pointerEvents = 'none';   // display only, never intercepts input
    c.style.display = 'none';
    document.body.appendChild(c);

    this._canvas = c;
    this._ctx = c.getContext('2d');
  },

  /** Call once per rendered frame. No-op (and hides) when nothing's
   *  captured, or before init(). */
  render() {
    if (!this._canvas || !this._sourceCanvas) return;
    const wx = SelectionVitals.worldX, wy = SelectionVitals.worldY;
    if (wx == null || wy == null) { this._canvas.style.display = 'none'; return; }
    this._canvas.style.display = 'block';

    const screen = CameraModule.worldToScreen(wx, wy);
    const dpr = DEBUG_STATE.dpr || window.devicePixelRatio || 1;
    const srcCx = screen.x * dpr, srcCy = screen.y * dpr;
    const srcHalf = (SOURCE_SIZE / 2) * dpr;

    this._ctx.clearRect(0, 0, BOX_SIZE, BOX_SIZE);
    try {
      this._ctx.drawImage(
        this._sourceCanvas,
        srcCx - srcHalf, srcCy - srcHalf, srcHalf * 2, srcHalf * 2,
        0, 0, BOX_SIZE, BOX_SIZE
      );
    } catch (_) { /* source not painted yet — skip this frame */ }

    // Ring at the exact centroid — gold when the Sun is jointly captured
    // (same visual language SelectionTool's own overlay uses), blue
    // otherwise.
    this._ctx.strokeStyle = SelectionTool.sunIncluded ? 'rgba(255,200,80,0.9)' : 'rgba(130,210,255,0.9)';
    this._ctx.lineWidth = 1.5;
    this._ctx.beginPath();
    this._ctx.arc(BOX_SIZE / 2, BOX_SIZE / 2, 6, 0, Math.PI * 2);
    this._ctx.stroke();
  }
};

export default PlanetInspector;
