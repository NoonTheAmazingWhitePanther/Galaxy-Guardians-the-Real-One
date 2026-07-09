/**
 * js/modules/debug/panel-snap-guides.js
 *
 * SNAP GUIDES — Adobe/Canva-style alignment lines, visual only.
 *
 * This module does NOT move panels. PanelArrange already owns snapping,
 * grid size, spacing, and collision ejection (settle() on drag release).
 * This module only draws the white guide lines + gold intersection arcs
 * that help the user SEE alignment opportunities while a panel is being
 * dragged — same relationship the marquee has to selection.
 *
 * Reuses real engine values instead of inventing new constants:
 *   - PanelArrange.gridSize()      → grid line spacing (ManualOverrides.panelGridSize)
 *   - PanelArrange MIN_GAP (2px)   → default panel-to-panel spacing
 *   - panel-master.js SLIDER_PAD + SLIDER_W (6 + 20 = 26px) → the strip
 *     reserved for each panel's master slider, which sits just to the
 *     right of the panel. Right-edge guides account for this so a panel
 *     can't be snapped so close it overlaps its neighbour's slider.
 *
 * Caching: the guide set is only rebuilt when panel layout actually
 * changes (drag start, or any panel move/resize while a drag is live).
 * Rendered once per frame as a single OffscreenCanvas blit.
 */
import { PanelArrange } from './panel-arrange.js';

// Mirrors panel-master.js — kept in sync manually since importing the
// constants directly would require exporting them from panel-master.js.
const MASTER_SLIDER_PAD   = 6;
const MASTER_SLIDER_W     = 20;
const RIGHT_EDGE_RESERVE  = MASTER_SLIDER_PAD + MASTER_SLIDER_W;  // 26px

const MIN_GAP           = 2;     // matches PanelArrange.MIN_GAP
const SNAP_THRESHOLD    = 10;    // px — how close before a guide is "hit"
const ARC_RADIUS        = 7;
const GUIDE_COLOR       = 'rgba(255,255,255,0.30)';
const GUIDE_COLOR_HIT   = 'rgba(255,255,255,0.75)';   // brighter when the dragged panel is actually on it
const GRID_COLOR        = 'rgba(255,255,255,0.06)';
const ARC_COLOR         = 'rgba(255,200,80,0.55)';    // Tuning gold — matches pinned-panel border

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export const PanelSnapGuides = {
  _lines: [],           // { vertical, x/y, x0..x1/y0..y1 } — edge/center guides from OTHER panels
  _gridLines: [],        // faint background grid (only within the visible panel bounding area)
  _image: null,
  _dirty: true,
  _lastCanvasW: 0,
  _lastCanvasH: 0,
  _lastPx: null, _lastPy: null, _lastVz: null, _lastDpr: null,

  /**
   * Rebuild the guide line list from every panel EXCEPT the one being
   * dragged. Call this on drag start and whenever another panel's layout
   * changes while a drag is live (rare, but PanelArrange glides can be
   * running on other panels simultaneously via multi-select).
   */
  rebuild(panels, draggedPanel, canvasW, canvasH) {
    this._lines = [];

    for (const p of panels) {
      if (p === draggedPanel || p.visible === false) continue;
      const x = p.x, y = p.y, w = p.w || 120, h = p.h || 56;

      // Left / right edges (right edge pushed out by the master-slider strip)
      this._lines.push({ vertical: true, x: x,                              y0: y - 4000, y1: y + 4000 });
      this._lines.push({ vertical: true, x: x + w + MIN_GAP,                 y0: y - 4000, y1: y + 4000 });
      this._lines.push({ vertical: true, x: x - RIGHT_EDGE_RESERVE - MIN_GAP, y0: y - 4000, y1: y + 4000 });

      // Top / bottom edges
      this._lines.push({ vertical: false, y: y,                             x0: x - 4000, x1: x + 4000 });
      this._lines.push({ vertical: false, y: y + h + MIN_GAP,                x0: x - 4000, x1: x + 4000 });

      // Centers (both axes)
      this._lines.push({ vertical: true,  x: x + w / 2, y0: y - 4000, y1: y + 4000, center: true });
      this._lines.push({ vertical: false, y: y + h / 2, x0: x - 4000, x1: x + 4000, center: true });
    }

    // Background grid — capped to the region actually spanned by panels
    // plus a screen's worth of padding, so it never tries to fill an
    // arbitrarily large panel-space extent at extreme zoom-out.
    this._gridLines = [];
    const g = PanelArrange.gridSize();
    if (g > 0) {
      const pad = 400;
      let minX = 0, minY = 0, maxX = canvasW, maxY = canvasH;
      for (const p of panels) {
        minX = Math.min(minX, p.x - pad); minY = Math.min(minY, p.y - pad);
        maxX = Math.max(maxX, p.x + (p.w || 120) + pad);
        maxY = Math.max(maxY, p.y + (p.h || 56) + pad);
      }
      for (let gx = Math.floor(minX / g) * g; gx <= maxX; gx += g) {
        this._gridLines.push({ vertical: true, x: gx, y0: minY, y1: maxY });
      }
      for (let gy = Math.floor(minY / g) * g; gy <= maxY; gy += g) {
        this._gridLines.push({ vertical: false, y: gy, x0: minX, x1: maxX });
      }
    }

    this._dirty = true;
  },

  /**
   * Find the nearest guide to the dragged panel's current bounds, per axis.
   * Returns which lines are "hit" (within SNAP_THRESHOLD) for highlighting —
   * this is purely visual feedback; PanelArrange.settle() does the real snap.
   */
  _hitLines(draggedPanel) {
    const x = draggedPanel.x, y = draggedPanel.y;
    const w = draggedPanel.w || 120, h = draggedPanel.h || 56;
    const hits = new Set();

    for (const ln of this._lines) {
      if (ln.vertical) {
        if (Math.abs(x - ln.x) < SNAP_THRESHOLD || Math.abs((x + w) - ln.x) < SNAP_THRESHOLD) hits.add(ln);
      } else {
        if (Math.abs(y - ln.y) < SNAP_THRESHOLD || Math.abs((y + h) - ln.y) < SNAP_THRESHOLD) hits.add(ln);
      }
    }
    return hits;
  },

  /**
   * Render (or return cached) guide image for the current frame.
   *
   * FIX: this used to be built at canvasW×canvasH = window.innerWidth×
   * window.innerHeight — CSS-pixel VALUES used directly as the offscreen
   * canvas's RAW pixel buffer size (not multiplied by dpr, unlike the
   * main canvas — see main.js's resize(): canvas.width = innerWidth*dpr).
   * Two real consequences, not just one:
   *   1. Lower resolution than the main canvas (blurry lines once
   *      upscaled through the ambient dpr transform at blit time).
   *   2. A genuine positioning/clipping bug: the buffer was implicitly
   *      assuming panel-space [0,innerWidth]×[0,innerHeight] always
   *      equals the visible screen — true ONLY at default zoom=1/pan=0.
   *      This debug view supports zoom 0.15–2.5 and pan (a real,
   *      documented feature) — at any other pan/zoom, the actually-
   *      visible panel-space region is a different rectangle entirely,
   *      so guides for panels outside that narrow default range were
   *      silently clipped off the offscreen buffer (never drawn at all),
   *      or the whole overlay landed in the wrong place relative to
   *      what's actually on screen.
   *
   * Fix: build the offscreen buffer at the REAL device-pixel canvas size
   * (canvasWDevice/canvasHDevice — pass ctx.canvas.width/height, already
   * dpr-multiplied), and bake the SAME pan/zoom/dpr transform the main
   * canvas uses into this offscreen context before drawing any lines —
   * so panel-space coordinates land in the right place regardless of
   * current pan/zoom, at full device resolution. The caller then blits
   * this image in raw device-pixel space (identity transform) — the
   * transform is already baked in, blitting through the ambient
   * transform AGAIN would double-apply it.
   */
  getImage(draggedPanel, canvasWDevice, canvasHDevice, px, py, vz, dpr) {
    const same = !this._dirty && this._image &&
      this._lastCanvasW === canvasWDevice && this._lastCanvasH === canvasHDevice &&
      this._lastPx === px && this._lastPy === py && this._lastVz === vz && this._lastDpr === dpr;
    if (same) return this._image;

    const canvas = makeCanvas(canvasWDevice, canvasHDevice);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(vz * dpr, 0, 0, vz * dpr, px * dpr, py * dpr);
    ctx.clearRect(-px / vz, -py / vz, canvasWDevice / (vz * dpr), canvasHDevice / (vz * dpr));

    // Faint background grid first (under everything)
    ctx.lineWidth = 1 / vz;  // 1 CSS-px-equivalent visual width
    ctx.strokeStyle = GRID_COLOR;
    for (const ln of this._gridLines) {
      ctx.beginPath();
      if (ln.vertical) { ctx.moveTo(ln.x, ln.y0); ctx.lineTo(ln.x, ln.y1); }
      else             { ctx.moveTo(ln.x0, ln.y); ctx.lineTo(ln.x1, ln.y); }
      ctx.stroke();
    }

    // Panel-derived guides — dedupe near-identical lines so a cluster of
    // aligned panels doesn't render a stack of overlapping strokes.
    const seen = [];
    const isDup = (ln) => seen.some(s =>
      s.vertical === ln.vertical &&
      Math.abs((ln.vertical ? ln.x : ln.y) - (s.vertical ? s.x : s.y)) < 1);

    const hits = draggedPanel ? this._hitLines(draggedPanel) : new Set();

    for (const ln of this._lines) {
      if (isDup(ln)) continue;
      seen.push(ln);

      ctx.strokeStyle = hits.has(ln) ? GUIDE_COLOR_HIT : GUIDE_COLOR;
      ctx.lineWidth = (hits.has(ln) ? 1.5 : 1) / vz;  // CSS-px-equivalent
      ctx.beginPath();
      if (ln.vertical) { ctx.moveTo(ln.x, ln.y0); ctx.lineTo(ln.x, ln.y1); }
      else             { ctx.moveTo(ln.x0, ln.y); ctx.lineTo(ln.x1, ln.y); }
      ctx.stroke();
    }

    // 90° arcs at real intersections between a "hit" vertical + horizontal
    // pair only — keeps the readout to meaningful corners, not every
    // theoretical crossing on the canvas.
    ctx.strokeStyle = ARC_COLOR;
    ctx.lineWidth = 1.5 / vz;  // CSS-px-equivalent
    const hitV = [...hits].filter(l => l.vertical);
    const hitH = [...hits].filter(l => !l.vertical);
    for (const v of hitV) {
      for (const h of hitH) {
        ctx.beginPath();
        ctx.arc(v.x, h.y, ARC_RADIUS / vz, 0, Math.PI / 2);  // constant screen-space radius
        ctx.stroke();
      }
    }

    this._image = canvas;
    this._lastCanvasW = canvasWDevice;
    this._lastCanvasH = canvasHDevice;
    this._lastPx = px; this._lastPy = py; this._lastVz = vz; this._lastDpr = dpr;
    this._dirty = false;
    return this._image;
  },

  invalidate() {
    this._dirty = true;
  },

  clear() {
    this._lines = [];
    this._gridLines = [];
    this._image = null;
    this._dirty = true;
    this._lastPx = null; this._lastPy = null; this._lastVz = null; this._lastDpr = null;
  }
};

export default PanelSnapGuides;
