/**
 * js/core/field-grid.js
 * Prime Module: FieldGrid — a generic world-space lattice.
 *
 * NOT a gravity grid. A reusable N-channel float lattice over a world-space
 * rectangle, with O(1) cell hashing and bilinear sampling. Gravity is merely
 * the first tenant; the same lattice serves density maps, dormancy heat maps,
 * plane-occupancy masks, flow fields, statistics overlays — any "divide the
 * physical area and describe it per box" utility.
 *
 * Zero dependencies. Zero per-frame allocation after construction
 * (setBounds() reuses buffers; only a cols/rows/channels change reallocates).
 */

export class FieldGrid {
  /**
   * @param {number} cols     grid columns
   * @param {number} rows     grid rows
   * @param {number} channels floats stored per cell
   */
  constructor(cols, rows, channels) {
    this.cols = 0;
    this.rows = 0;
    this.channels = 0;
    this.x0 = 0; this.y0 = 0;         // world origin (top-left of the box)
    this.w = 1;  this.h = 1;          // world span of the box
    this.cellW = 1; this.cellH = 1;
    this.invCW = 1; this.invCH = 1;
    this.data = null;                  // Float32Array cols*rows*channels
    this.resize(cols, rows, channels);
  }

  /** Reallocate only when the shape actually changes. */
  resize(cols, rows, channels) {
    if (cols === this.cols && rows === this.rows && channels === this.channels) return;
    this.cols = cols | 0;
    this.rows = rows | 0;
    this.channels = channels | 0;
    this.data = new Float32Array(this.cols * this.rows * this.channels);
    this._applyCellSize();
  }

  /** Move/resize the world-space box the lattice covers. Data is NOT cleared. */
  setBounds(x0, y0, w, h) {
    this.x0 = x0; this.y0 = y0;
    this.w = Math.max(w, 1e-6);
    this.h = Math.max(h, 1e-6);
    this._applyCellSize();
  }

  _applyCellSize() {
    this.cellW = this.w / this.cols;
    this.cellH = this.h / this.rows;
    this.invCW = 1 / this.cellW;
    this.invCH = 1 / this.cellH;
  }

  clear() { this.data.fill(0); }

  /** Flat cell index from cell coordinates. No bounds check — caller clamps. */
  index(cx, cy) { return (cy * this.cols + cx) * this.channels; }

  /** Cell column of world x, clamped into the grid. */
  colOf(x) {
    const c = ((x - this.x0) * this.invCW) | 0;
    return c < 0 ? 0 : (c >= this.cols ? this.cols - 1 : c);
  }

  /** Cell row of world y, clamped into the grid. */
  rowOf(y) {
    const r = ((y - this.y0) * this.invCH) | 0;
    return r < 0 ? 0 : (r >= this.rows ? this.rows - 1 : r);
  }

  /** True when a world point lies inside the covered box. */
  contains(x, y) {
    return x >= this.x0 && y >= this.y0 && x < this.x0 + this.w && y < this.y0 + this.h;
  }

  /** World-space center of a cell. Writes into `out` {x,y} (no allocation). */
  cellCenter(cx, cy, out) {
    out.x = this.x0 + (cx + 0.5) * this.cellW;
    out.y = this.y0 + (cy + 0.5) * this.cellH;
    return out;
  }

  /** Add `v` into channel `ch` of the cell containing world (x,y). */
  splat(x, y, ch, v) {
    this.data[this.index(this.colOf(x), this.rowOf(y)) + ch] += v;
  }

  /**
   * Bilinear sample of TWO channels at world (x,y) — the common vector-field
   * case (fx,fy). Writes {x,y} into `out`. Returns false when the point is
   * outside the box (out untouched) so the caller can fall back.
   * `data` may override the buffer read from (used for double-buffered fields
   * that share this grid's geometry).
   */
  sample2(x, y, chA, chB, out, data) {
    const d = data || this.data;
    // continuous cell coordinates centered on cell centers
    const fx = (x - this.x0) * this.invCW - 0.5;
    const fy = (y - this.y0) * this.invCH - 0.5;
    if (fx < -0.5 || fy < -0.5 || fx > this.cols - 0.5 || fy > this.rows - 0.5) return false;
    let cx0 = Math.floor(fx), cy0 = Math.floor(fy);
    let tx = fx - cx0, ty = fy - cy0;
    // clamp the 2x2 patch into the grid (edge cells extend outward)
    if (cx0 < 0) { cx0 = 0; tx = 0; }
    if (cy0 < 0) { cy0 = 0; ty = 0; }
    let cx1 = cx0 + 1, cy1 = cy0 + 1;
    if (cx1 >= this.cols) { cx1 = this.cols - 1; tx = 0; }
    if (cy1 >= this.rows) { cy1 = this.rows - 1; ty = 0; }
    const ch = this.channels;
    const i00 = (cy0 * this.cols + cx0) * ch;
    const i10 = (cy0 * this.cols + cx1) * ch;
    const i01 = (cy1 * this.cols + cx0) * ch;
    const i11 = (cy1 * this.cols + cx1) * ch;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty,       w11 = tx * ty;
    out.x = d[i00 + chA] * w00 + d[i10 + chA] * w10 + d[i01 + chA] * w01 + d[i11 + chA] * w11;
    out.y = d[i00 + chB] * w00 + d[i10 + chB] * w10 + d[i01 + chB] * w01 + d[i11 + chB] * w11;
    return true;
  }
}
