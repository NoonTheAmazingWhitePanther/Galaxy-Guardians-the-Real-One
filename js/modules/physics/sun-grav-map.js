/**
 * js/modules/physics/sun-grav-map.js
 * SUN GRAVITY MAP (Noon's design, 2026-07-12) — the sun as a literal constant.
 *
 * The whole world space is gridded once; each cell owns the sun's pull at its
 * center. Because the sun never moves, what's stored is PURE GEOMETRY:
 *
 *     ux = (dx/d) / (d² + 500)      uy = (dy/d) / (d² + 500)
 *
 * — direction × falloff, with G, sun mass, per-body gravMult and particle
 * mass ALL factored out to apply time. Consequence: sun mass changes and
 * burst events cost NOTHING — the multiply at apply time reads the live
 * mass. sqrt is paid exactly once per cell, ever ("we will use dsqrt to the
 * grid map once and that's it").
 *
 * GROWTH: built in row slices, a few rows per live tick, starting from the
 * sun's own rows and growing outward frame by frame until the span is
 * covered — exactly the "starts small around the sun and grows" law.
 * Until a cell's row is built (and outside the span, and inside the
 * near-exact ring where the gradient is too steep for cells), applyGravity
 * falls back to the analytic path — never wrong, only unbuilt.
 *
 * Knobs: sunGravMap (0/1) · sunMapNearR (analytic ring, px)
 *        sunMapSpan (world coverage, px) · A/B live via the knob + MsProbe
 *        physics.grav share.
 */
import { SUN } from '../../core/state.js';
import { ManualOverrides } from '../debug/governor.js';

const COLS = 256, ROWS = 256;
const ROWS_PER_TICK = 8;            // growth speed: 32 live ticks to full coverage

export const SunGravMap = {
  ux: new Float32Array(COLS * ROWS),
  uy: new Float32Array(COLS * ROWS),
  _builtLo: -1,                     // rows built so far grow outward from the
  _builtHi: -1,                     // sun's row: [lo..hi] inclusive
  _x0: 0, _y0: 0, _cw: 1, _ch: 1, _invCw: 1, _invCh: 1,
  _span: 0, _sunRow: 0,
  _sunX: 0, _sunY: 0,

  get enabled() { return ManualOverrides.get('sunGravMap', 1) >= 0.5; },
  get nearR2() { const r = ManualOverrides.get('sunMapNearR', 1500); return r * r; },
  get ready()  { return this._builtLo >= 0; },
  get coveragePct() {
    return this._builtLo < 0 ? 0
      : Math.round(100 * (this._builtHi - this._builtLo + 1) / ROWS);
  },

  /** (Re)anchor the grid on the sun and restart growth. Cheap; geometry only. */
  rebuild() {
    const span = ManualOverrides.get('sunMapSpan', 12000);
    this._span = span;
    this._sunX = SUN.x; this._sunY = SUN.y;
    this._x0 = SUN.x - span / 2; this._y0 = SUN.y - span / 2;
    this._cw = span / COLS; this._ch = span / ROWS;
    this._invCw = 1 / this._cw; this._invCh = 1 / this._ch;
    this._sunRow = Math.max(0, Math.min(ROWS - 1, ((SUN.y - this._y0) * this._invCh) | 0));
    this._builtLo = -1; this._builtHi = -1;
  },

  _buildRow(r) {
    const y = this._y0 + (r + 0.5) * this._ch;
    const dy = this._sunY - y;
    const base = r * COLS;
    for (let c = 0; c < COLS; c++) {
      const x = this._x0 + (c + 0.5) * this._cw;
      const dx = this._sunX - x;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) + 0.1;              // the one sqrt this cell will ever pay
      const u = 1 / (d * (d2 + 500));
      this.ux[base + c] = dx * u;
      this.uy[base + c] = dy * u;
    }
  },

  /** Called once per LIVE tick — grows the map outward from the sun. */
  update() {
    if (!this.enabled) return;
    if (this._span !== ManualOverrides.get('sunMapSpan', 12000)
        || this._sunX !== SUN.x || this._sunY !== SUN.y) this.rebuild();
    if (this._builtLo === 0 && this._builtHi === ROWS - 1) return;   // complete
    for (let i = 0; i < ROWS_PER_TICK; i++) {
      if (this._builtLo < 0) {                     // first row: the sun's own
        this._builtLo = this._builtHi = this._sunRow;
        this._buildRow(this._sunRow);
        continue;
      }
      // alternate outward: one row up, one row down, until both edges hit
      const canUp = this._builtLo > 0, canDn = this._builtHi < ROWS - 1;
      if (!canUp && !canDn) return;
      if (canUp && (!canDn || (this._sunRow - this._builtLo) <= (this._builtHi - this._sunRow))) {
        this._buildRow(--this._builtLo);
      } else if (canDn) {
        this._buildRow(++this._builtHi);
      }
    }
  },

  /**
   * Sample the geometry field at (x,y) into out {x,y}. Returns false when the
   * caller must use the analytic path: map off/unbuilt here, inside the
   * near-exact ring (gradient too steep for cells), or outside the span.
   * Nearest-cell on purpose — the cheapest read there is; smoothness is
   * covered by the analytic near ring where it actually matters.
   */
  sampleInto(x, y, out) {
    if (this._builtLo < 0) return false;
    const dx = this._sunX - x, dy = this._sunY - y;
    if (dx * dx + dy * dy < this.nearR2) return false;      // near ring → exact
    const c = ((x - this._x0) * this._invCw) | 0;
    const r = ((y - this._y0) * this._invCh) | 0;
    if (c < 0 || c >= COLS || r < this._builtLo || r > this._builtHi) return false;
    const i = r * COLS + c;
    out.x = this.ux[i];
    out.y = this.uy[i];
    return true;
  },
};
