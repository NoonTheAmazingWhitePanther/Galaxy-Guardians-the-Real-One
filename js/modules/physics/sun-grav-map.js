/**
 * js/modules/physics/sun-grav-map.js
 * SUN GRAVITY MAP (Noon's design, 2026-07-12) — the sun as a literal constant.
 *
 * MIGRATED UNDER THE MAP RULE (2026-07-12, same day it was born) — now a
 * READ-ONLY renter: the lattice provides geometry and storage; this module
 * keeps only what makes it the sun map — the analytic near ring, the
 * grow-outward-from-the-sun build law, and the factored-geometry cells:
 *
 *     ux = (dx/d) / (d² + 500)      uy = (dy/d) / (d² + 500)
 *
 * — direction × falloff, with G, sun mass, per-body gravMult and particle
 * mass ALL factored out to apply time. Consequence: sun mass changes and
 * burst events cost NOTHING — the multiply at apply time reads the live
 * mass. sqrt is paid exactly once per cell, ever ("we will use dsqrt to the
 * grid map once and that's it").
 *
 * What the law changed:
 *   · Private anchor math is DEAD — bounds come from THE ALIGNMENT LAW
 *     (sun-centered, sunMapSpan), enforced live by MapRule.anchorWatch():
 *     a sun move or span change re-anchors the lattice and growth restarts.
 *   · Cell size is the contract's 46.875px (the classic 12000/256), so the
 *     default span reproduces the original 256². Span and mapRuleRes now
 *     scale the cell COUNT (cap 512) — the pitch holds, the coverage flexes.
 *   · NONE of the three write laws apply: this is the fourth kind, a
 *     read-only geometry field — built row by row, never deposited, never
 *     pulsed, never repainted, smoothing 0 (blur would bend the sun).
 *
 * GROWTH (unchanged): built in row slices, a few rows per live tick,
 * starting from the sun's own row and alternating outward until the span
 * is covered. Until a cell's row is built (and outside the span, and inside
 * the near-exact ring where the gradient is too steep for cells),
 * applyGravity falls back to the analytic path — never wrong, only unbuilt.
 *
 * HOT PATH: sampleInto reads cached scalars refreshed once per update() —
 * geometry FROM the lattice, cached as views, zero property chains per
 * particle. Nearest-cell on purpose — the cheapest read there is;
 * smoothness is covered by the analytic near ring where it matters.
 *
 * Knobs: sunGravMap (0/1) · sunMapNearR (analytic ring, px)
 *        sunMapSpan (world coverage — THE ALIGNMENT LAW anchor)
 *        A/B live via the knob + MsProbe physics.grav share.
 */
import { SUN } from '../../core/state.js';
import { ManualOverrides } from '../debug/governor.js';
import { MapRule } from '../../core/map-rule.js';

const ROWS_PER_TICK = 8;            // growth speed: 256 rows → 32 live ticks

export const SunGravMap = {
  _renter: null,
  _geomV: -1,                       // renter geometry version we built against
  _builtLo: -1,                     // rows built so far grow outward from the
  _builtHi: -1,                     // sun's row: [lo..hi] inclusive
  _sunRow: 0,

  // hot-path caches — refreshed from the renter grid once per update()
  _data: null, _cols: 0, _rows: 0,
  _x0: 0, _y0: 0, _invCw: 1, _invCh: 1,

  _r() {
    if (this._renter) return this._renter;
    this._renter = MapRule.declare('sunGravMap', {
      channels: ['ux', 'uy'],
      cellSize: 46.875,             // the classic pitch: 12000 default span / 256
      smoothing: 0,                 // read-only geometry — never blurred
      skip: 30,
      decay: {},
    });
    return this._renter;
  },

  get enabled() { return ManualOverrides.get('sunGravMap', 1) >= 0.5; },
  get nearR2() { const r = ManualOverrides.get('sunMapNearR', 1500); return r * r; },
  get ready()  { return this._builtLo >= 0; },
  get coveragePct() {
    return (this._builtLo < 0 || this._rows === 0) ? 0
      : Math.round(100 * (this._builtHi - this._builtLo + 1) / this._rows);
  },

  /** One row of pure geometry — the one sqrt each cell will ever pay. */
  _buildRow(r) {
    const d = this._data, cols = this._cols;
    const g = this._renter.grid;
    const y = g.y0 + (r + 0.5) * g.cellH;
    const dy = SUN.y - y;
    const base = r * cols * 2;
    for (let c = 0; c < cols; c++) {
      const x = g.x0 + (c + 0.5) * g.cellW;
      const dx = SUN.x - x;
      const d2 = dx * dx + dy * dy;
      const dd = Math.sqrt(d2) + 0.1;
      const u = 1 / (dd * (d2 + 500));
      d[base + c * 2]     = dx * u;
      d[base + c * 2 + 1] = dy * u;
    }
  },

  /** Called once per LIVE tick — grows the map outward from the sun. */
  update() {
    if (!this.enabled) return;
    const r = this._r();
    // geometry under the law — self-driven (honest even with mapRuleOn 0)
    MapRule.anchorWatch();
    r._applyResolution(ManualOverrides.get('mapRuleRes', 1));
    if (r.version !== this._geomV) {          // re-anchored / re-tessellated → regrow
      this._geomV = r.version;
      const g = r.grid;
      this._data = g.data; this._cols = g.cols; this._rows = g.rows;
      this._x0 = g.x0; this._y0 = g.y0; this._invCw = g.invCW; this._invCh = g.invCH;
      this._sunRow = g.rowOf(SUN.y);
      this._builtLo = -1; this._builtHi = -1;
    }
    if (this._builtLo === 0 && this._builtHi === this._rows - 1) return;   // complete
    for (let i = 0; i < ROWS_PER_TICK; i++) {
      if (this._builtLo < 0) {                     // first row: the sun's own
        this._builtLo = this._builtHi = this._sunRow;
        this._buildRow(this._sunRow);
        continue;
      }
      // alternate outward: one row up, one row down, until both edges hit
      const canUp = this._builtLo > 0, canDn = this._builtHi < this._rows - 1;
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
   * Nearest-cell on purpose — the cheapest read there is.
   */
  sampleInto(x, y, out) {
    if (this._builtLo < 0) return false;
    const dx = SUN.x - x, dy = SUN.y - y;
    if (dx * dx + dy * dy < this.nearR2) return false;      // near ring → exact
    const c = ((x - this._x0) * this._invCw) | 0;
    const r = ((y - this._y0) * this._invCh) | 0;
    if (c < 0 || c >= this._cols || r < this._builtLo || r > this._builtHi) return false;
    const i = (r * this._cols + c) * 2;
    out.x = this._data[i];
    out.y = this._data[i + 1];
    return true;
  },
};
