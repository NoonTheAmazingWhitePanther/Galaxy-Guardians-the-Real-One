/**
 * js/modules/physics/gravity-field.js
 * Prime Module: GravityField — the planet gravity grid (weight map).
 *
 * ONE for the Sun, MANY for the planets:
 *   · The sun's field stays ANALYTIC — computed exactly per particle in
 *     applyGravity (one softened inverse-square, cheap, always correct).
 *   · Every planet's pull flows through this grid. Each physics frame the
 *     world box around the live cluster is divided into cells; each cell is
 *     declared with HOW MUCH gravity (Σ mass) and WHERE (mass-weighted center
 *     of mass). The far field is then rebuilt from those cell aggregates —
 *     each occupied cell acting as a single point mass — giving a global
 *     gravity scope with O(1) lookup per particle instead of O(bodies).
 *
 * Near/far split (correctness):
 *   The force field per target cell EXCLUDES occupied cells within `near`
 *   ring cells. At gather time applyGravity direct-computes bodies found in
 *   the same ring via the live cell→bodies index. Close encounters therefore
 *   keep exact per-body forces (and the p.body self-skip); only the smooth
 *   far field is interpolated.
 *
 * Double buffer:
 *   The field builds into a BACK frame in slices (gravGridBudget cells per
 *   frame) from a mass-map snapshot, then swaps. Sampling always reads a
 *   COHERENT front frame with its own frozen geometry. Bounds use hysteresis
 *   so build/gather geometry stays aligned across frames.
 *
 * Dominant tracking:
 *   The heaviest body in the box is exposed as `dominant` — the current
 *   "sun role" the rest of the cluster is falling toward. Purely
 *   informational for now (camera / UI / future rules).
 *
 * GHOST MODE (FutureCache):
 *   Predictions must never learn from a stale field. While FutureCache body-
 *   swaps and steps ghosts, `ghostMode` is set and applyGravity falls back to
 *   the exact legacy loop. The cached future stays exact; only live frames
 *   ride the grid.
 *
 * COLLISION MAP (weight map, second tenant):
 *   Beyond HOW MUCH gravity and WHERE, each segment now records WHERE
 *   collisions happen: HARD (body↔body impulses) and SOFT (loose-debris
 *   hits), deposited by collisions.js at resolve time, decaying ~1s.
 *   Ghost-gated — predicted collisions never paint the live map. The
 *   overlay writes both into the segment's text: `1.2k ⚡3 ∙5`.
 *
 * The lattice itself is the generic core/field-grid.js — this module is just
 * gravity renting cells in it (the collision map rents alongside).
 */

import { FieldGrid } from '../../core/field-grid.js';
import { config } from '../../core/config.js';
import { state } from '../../core/state.js';
import { ManualOverrides } from '../debug/governor.js';
import { MsProbe } from '../../core/ms-probe.js';

const SOFT = 300;            // same softening as the legacy per-body loop
const _c = { x: 0, y: 0 };   // scratch cell-center

const _mkFrame = () => ({
  x0: 0, y0: 0, cellW: 1, cellH: 1, invCW: 1, invCH: 1,
  cols: 0, rows: 0, w: 1, h: 1,
  fx: null, fy: null,        // Float32Array cols*rows — force per unit mass
  R2: 0,                     // split radius this frame was built with
  ready: false,
});

export const GravityField = {
  // ── lattice + live near index ─────────────────────────────────────────────
  grid: new FieldGrid(24, 24, 3),     // channels: 0=Σm · 1=Σm·x · 2=Σm·y
  cellBodies: [],                      // live cell→bodies index (refs, rebuilt per frame)
  _cellBodiesLen: 0,

  // ── double-buffered far field ────────────────────────────────────────────
  _front: _mkFrame(),
  _back:  _mkFrame(),

  // ── build state ──────────────────────────────────────────────────────────
  _building: false,
  _cursor: 0,
  _occ: [],                            // snapshot: {cx,cy,x,y,gm} per occupied cell
  _occLen: 0,

  // ── bounds hysteresis (keeps geometry stable so build == gather) ─────────
  _bx0: 0, _by0: 0, _bw: 0, _bh: 0, _hasBounds: false,

  _G: 120,                             // GRAV_CONST captured each update
  ghostMode: false,                    // set by FutureCache around ghost stepping
  dominant: null,                      // heaviest live body (the "sun role")

  // ── collision map: WHERE collisions happen, per weight-map segment ──────
  // Persistent heat (decays ~1s), separate from the per-frame mass channels
  // (grid.clear() wipes those every deposit; this must survive frames).
  // HARD = body↔body impulses · SOFT = loose-debris hits. Ghost-gated:
  // predicted collisions never paint the live map.
  _collHard: null,
  _collSoft: null,
  _collLen: 0,
  _collOn: false,                      // true only while the grid is awake (geometry valid)

  stats: {
    on: 0, occupied: 0, bodies: 0, dominantMass: 0,
    cellSize: 0, cols: 0, buildPct: 0, gridHits: 0, directFalls: 0, mode: 'OFF',
    collHard: 0, collSoft: 0, collCells: 0,          // this frame · hot segments
    msUpdate: 0, msDeposit: 0, msBuild: 0,           // grid time (also in MsProbe tree)
  },

  get enabled() { return ManualOverrides.get('gravGridOn', 1) >= 0.5; },

  /** True when applyGravity may take the grid path this tick. */
  get active() {
    return this.enabled && !this.ghostMode && this._front.ready;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // update() — once per rAF, before the physics substep loop.
  // Deposit is O(bodies). Build is sliced under gravGridBudget cells/frame.
  // ═══════════════════════════════════════════════════════════════════════
  update() {
    const s = this.stats;
    s.gridHits = 0; s.directFalls = 0;
    s.collHard = 0; s.collSoft = 0;                       // per-frame counts (deposits land after us, during substeps)
    if (!this.enabled) { s.mode = 'OFF'; s.on = 0; this._front.ready = false; this._building = false; this._collOn = false; return; }
    s.on = 1;
    this._G = config.GRAV_CONST;

    const bodies = state.bodies;
    const n = bodies.length;
    s.bodies = n;
    if (n === 0) { s.mode = 'EMPTY'; s.occupied = 0; this._front.ready = false; this._building = false; this.dominant = null; this._collOn = false; return; }

    // Below the threshold the legacy direct loop (with its distance cull) is
    // cheaper than field upkeep + gather — the grid SLEEPS and wakes at scale.
    if (n < ManualOverrides.get('gravGridMinBodies', 80)) {
      s.mode = 'SMALL'; s.occupied = 0;
      this._front.ready = false; this._building = false;
      this._collOn = false;                               // asleep grid = frozen geometry: no deposits
      // still track the dominant body — the "sun role" is wanted regardless
      let dom = null, domM = -1;
      for (let i = 0; i < n; i++) { const b = bodies[i]; if (b.mass > domM) { domM = b.mass; dom = b; } }
      this.dominant = dom; s.dominantMass = Math.round(domM);
      return;
    }

    const cols = Math.max(8, Math.min(96, ManualOverrides.get('gravGridCols', 48) | 0));
    this.grid.resize(cols, cols, 3);

    // Grid time has a name: two children under the physics.gravField parent
    // (auto-nested in the msProbeTree), mirrored into stats for the panel.
    // update() only ever runs on the LIVE path (main loop, pre-substeps) —
    // ghosts never come through here, so no ghost gating is needed.
    const _t0 = performance.now();
    const reanchored = this._updateBounds(bodies, n);
    this._collUpkeep(reanchored);                         // decay heat · count hot segments · realloc
    this._deposit(bodies, n);
    const _t1 = performance.now();
    this._buildSlice(Math.max(16, ManualOverrides.get('gravGridBudget', 512) | 0));
    const _t2 = performance.now();
    MsProbe.record('physics.gravField.deposit', _t1 - _t0);
    MsProbe.record('physics.gravField.build',   _t2 - _t1);
    s.msDeposit = +(_t1 - _t0).toFixed(2);
    s.msBuild   = +(_t2 - _t1).toFixed(2);
    s.msUpdate  = +(_t2 - _t0).toFixed(2);

    s.cols = cols;
    s.cellSize = Math.round(this.grid.cellW);
    s.mode = this._front.ready ? 'GRID' : 'WARMUP';
  },

  // Collision-map upkeep: (re)allocate to the current cell count, wipe when
  // the bounds re-anchored (old heat would sit in wrong world segments),
  // decay everything toward zero (~1s half-life), count hot segments.
  _collUpkeep(reanchored) {
    const cells = this.grid.cols * this.grid.rows;
    if (this._collLen !== cells) {
      this._collHard = new Float32Array(cells);
      this._collSoft = new Float32Array(cells);
      this._collLen = cells;
    } else if (reanchored) {
      this._collHard.fill(0);
      this._collSoft.fill(0);
    }
    const H = this._collHard, S = this._collSoft;
    let hot = 0;
    for (let i = 0; i < cells; i++) {
      let h = H[i], sf = S[i];
      if (h > 0) { h *= 0.94; if (h < 0.05) h = 0; H[i] = h; }
      if (sf > 0) { sf *= 0.94; if (sf < 0.05) sf = 0; S[i] = sf; }
      if (h + sf > 0.5) hot++;
    }
    this.stats.collCells = hot;
    this._collOn = true;
  },

  /**
   * Deposit ONE collision into the weight map's segment at world (x,y).
   * hard=1 → body↔body impulse · hard=0 → loose-debris hit. Called from
   * collisions.js at resolve time. GHOST-GATED: predicted collisions (ghost
   * stepping shares the same collision code) never paint the live map.
   */
  noteCollision(x, y, hard) {
    if (this.ghostMode || !this._collOn) return;
    const g = this.grid;
    const ci = g.rowOf(y) * g.cols + g.colOf(x);
    if (hard) { this._collHard[ci] += 1; this.stats.collHard++; }
    else      { this._collSoft[ci] += 1; this.stats.collSoft++; }
  },

  // Bounds: bbox of body COMs + margin, with hysteresis — only re-anchor when
  // the cluster escapes the current box or shrinks well inside it. A stable
  // box keeps cell geometry identical between field build and gather.
  _updateBounds(bodies, n) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (b.cx < minX) minX = b.cx;
      if (b.cx > maxX) maxX = b.cx;
      if (b.cy < minY) minY = b.cy;
      if (b.cy > maxY) maxY = b.cy;
    }
    const pad = Math.max((maxX - minX), (maxY - minY)) * 0.15 + 600;
    const nx0 = minX - pad, ny0 = minY - pad;
    const nw = (maxX - minX) + pad * 2, nh = (maxY - minY) + pad * 2;

    const escaped = !this._hasBounds
      || nx0 < this._bx0 || ny0 < this._by0
      || nx0 + nw > this._bx0 + this._bw
      || ny0 + nh > this._by0 + this._bh;
    const shrunk = this._hasBounds && (nw < this._bw * 0.5 || nh < this._bh * 0.5);

    if (escaped || shrunk) {
      this._bx0 = nx0; this._by0 = ny0; this._bw = nw; this._bh = nh;
      this._hasBounds = true;
      this.grid.setBounds(this._bx0, this._by0, this._bw, this._bh);
      return true;                    // re-anchored — segment identities changed
    }
    this.grid.setBounds(this._bx0, this._by0, this._bw, this._bh);
    return false;
  },

  // Deposit: Σm, Σm·x, Σm·y per cell + live cell→bodies index + dominant.
  _deposit(bodies, n) {
    const g = this.grid;
    g.clear();
    const cells = g.cols * g.rows;
    // reuse the index arrays (truncate, never reallocate the outer array)
    if (this._cellBodiesLen !== cells) {
      this.cellBodies.length = cells;
      for (let i = 0; i < cells; i++) this.cellBodies[i] = null;
      this._cellBodiesLen = cells;
    } else {
      for (let i = 0; i < cells; i++) { const a = this.cellBodies[i]; if (a) a.length = 0; }
    }

    let dom = null, domM = -1;
    const d = g.data;
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      const cx = g.colOf(b.cx), cy = g.rowOf(b.cy);
      const ci = (cy * g.cols + cx);
      const di = ci * 3;
      d[di]     += b.mass;
      d[di + 1] += b.mass * b.cx;
      d[di + 2] += b.mass * b.cy;
      (this.cellBodies[ci] || (this.cellBodies[ci] = [])).push(b);
      if (b.mass > domM) { domM = b.mass; dom = b; }
    }
    this.dominant = dom;
    this.stats.dominantMass = Math.round(domM);
  },

  // Sliced far-field build into the back frame, then swap.
  _buildSlice(budget) {
    const g = this.grid;
    const cells = g.cols * g.rows;

    if (!this._building) {
      // ── snapshot occupied cells (each becomes one point mass at its COM) ──
      const d = g.data;
      let k = 0;
      const G = config.GRAV_CONST;
      for (let cy = 0; cy < g.rows; cy++) {
        for (let cx = 0; cx < g.cols; cx++) {
          const di = (cy * g.cols + cx) * 3;
          const m = d[di];
          if (m <= 0) continue;
          const o = this._occ[k] || (this._occ[k] = { cx: 0, cy: 0, x: 0, y: 0, gm: 0 });
          o.cx = cx; o.cy = cy;
          o.x = d[di + 1] / m;
          o.y = d[di + 2] / m;
          o.gm = G * m;
          k++;
        }
      }
      this._occLen = k;
      this.stats.occupied = k;

      // ── freeze back-frame geometry ──
      const f = this._back;
      f.x0 = g.x0; f.y0 = g.y0; f.w = g.w; f.h = g.h;
      f.cellW = g.cellW; f.cellH = g.cellH; f.invCW = g.invCW; f.invCH = g.invCH;
      f.cols = g.cols; f.rows = g.rows;
      f.R2 = this.splitR2;                 // frozen with the frame — gather must use THIS radius
      if (!f.fx || f.fx.length !== cells) { f.fx = new Float32Array(cells); f.fy = new Float32Array(cells); }
      this._cursor = 0;
      this._building = true;
    }

    const f = this._back;
    if (f.cols * f.rows !== cells) { this._building = false; return; }   // shape changed mid-build → restart next frame

    // Smooth force splitting (Ewald-style): every body's force is divided by
    // TRUE DISTANCE into a smooth far part f·S(d) (lives in the field, safe to
    // interpolate) and an exact near part f·(1−S(d)) (added per body at
    // gather). Because S depends only on distance, the two passes always sum
    // to the exact force — no exclusion-set mismatch at cell boundaries.
    const R2 = f.R2, R1 = R2 * 0.5, invRange = R2 > R1 ? 1 / (R2 - R1) : 0;
    const occ = this._occ, occLen = this._occLen;
    const end = Math.min(cells, this._cursor + budget);

    for (let ci = this._cursor; ci < end; ci++) {
      const tcx = ci % f.cols, tcy = (ci / f.cols) | 0;
      const px = f.x0 + (tcx + 0.5) * f.cellW;
      const py = f.y0 + (tcy + 0.5) * f.cellH;
      let ax = 0, ay = 0;
      for (let oi = 0; oi < occLen; oi++) {
        const o = occ[oi];
        const dx = o.x - px, dy = o.y - py;
        const d2 = dx * dx + dy * dy;
        const dist = Math.sqrt(d2) + 0.1;
        let S = 1;
        if (R2 > 0 && dist < R2) {
          if (dist <= R1) { continue; }                    // fully near → gather handles it exactly
          const t = (dist - R1) * invRange;                // smoothstep R1→R2
          S = t * t * (3 - 2 * t);
        }
        const fF = (o.gm / (d2 + SOFT)) * S;   // far share per unit mass (÷nParticles·×p.mass at gather)
        ax += (dx / dist) * fF;
        ay += (dy / dist) * fF;
      }
      f.fx[ci] = ax;
      f.fy[ci] = ay;
    }
    this._cursor = end;
    this.stats.buildPct = Math.round((end / cells) * 100);

    if (end >= cells) {
      f.ready = true;
      const t = this._front; this._front = this._back; this._back = t;
      this._building = false;                 // next frame snapshots fresh masses
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Gather-side API (hot path — called per particle from applyGravity)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Far field at (x,y) → out {x,y} force per unit mass.
   * false → point outside front frame → caller uses the legacy loop.
   */
  sampleInto(x, y, out) {
    const f = this._front;
    const fx = (x - f.x0) * f.invCW - 0.5;
    const fy = (y - f.y0) * f.invCH - 0.5;
    if (fx < -0.5 || fy < -0.5 || fx > f.cols - 0.5 || fy > f.rows - 0.5) { this.stats.directFalls++; return false; }
    let cx0 = Math.floor(fx), cy0 = Math.floor(fy);
    let tx = fx - cx0, ty = fy - cy0;
    if (cx0 < 0) { cx0 = 0; tx = 0; }
    if (cy0 < 0) { cy0 = 0; ty = 0; }
    let cx1 = cx0 + 1, cy1 = cy0 + 1;
    if (cx1 >= f.cols) { cx1 = f.cols - 1; tx = 0; }
    if (cy1 >= f.rows) { cy1 = f.rows - 1; ty = 0; }
    const i00 = cy0 * f.cols + cx0, i10 = cy0 * f.cols + cx1;
    const i01 = cy1 * f.cols + cx0, i11 = cy1 * f.cols + cx1;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty,       w11 = tx * ty;
    out.x = f.fx[i00] * w00 + f.fx[i10] * w10 + f.fx[i01] * w01 + f.fx[i11] * w11;
    out.y = f.fy[i00] * w00 + f.fy[i10] * w10 + f.fy[i01] * w01 + f.fy[i11] * w11;
    this.stats.gridHits++;
    return true;
  },

  /** Near knob (cells). */
  get near() { return Math.max(0, Math.min(3, ManualOverrides.get('gravGridNear', 2) | 0)); },

  /** Split outer radius in WORLD units — near knob × the smaller cell side. */
  get splitR2() {
    const g = this.grid;
    return this.near * Math.min(g.cellW, g.cellH);
  },

  /** The split radius the CURRENT front frame was built with (gather side). */
  get frontR2() { return this._front.R2; },

  /**
   * Near correction at (px,py) → out {x,y}, force per unit mass, ADDED to the
   * field sample. For every occupied cell in the scan ring this SUBTRACTS the
   * aggregate's split share exactly as the sample blended it (same 4 corners,
   * same weights, same S) and ADDS exact per-body forces — surgically
   * replacing the coarse near-cell terms. Cancels bilinear interpolation
   * error AND center-of-mass aggregation error where they are largest.
   * `pBody` is skipped in the exact pass, so near self-gravity nets to zero.
   */
  gatherNear(px, py, pBody, out) {
    out.x = 0; out.y = 0;
    const fr = this._front;
    const R2 = fr.R2;
    if (R2 <= 0) return 0;                     // pure-field mode (near = 0)
    let checks = 0;                            // exact per-body force evals (returned)
    const R1 = R2 * 0.5, inv = 1 / (R2 - R1);
    const G = this._G;

    // the 4 sample corners in FRONT-frame geometry (mirror of sampleInto)
    const sx = (px - fr.x0) * fr.invCW - 0.5;
    const sy = (py - fr.y0) * fr.invCH - 0.5;
    let cx0 = Math.floor(sx), cy0 = Math.floor(sy);
    let tx = sx - cx0, ty = sy - cy0;
    if (cx0 < 0) { cx0 = 0; tx = 0; }
    if (cy0 < 0) { cy0 = 0; ty = 0; }
    let cx1 = cx0 + 1, cy1 = cy0 + 1;
    if (cx1 >= fr.cols) { cx1 = fr.cols - 1; tx = 0; }
    if (cy1 >= fr.rows) { cy1 = fr.rows - 1; ty = 0; }
    const q0x = fr.x0 + (cx0 + 0.5) * fr.cellW, q1x = fr.x0 + (cx1 + 0.5) * fr.cellW;
    const q0y = fr.y0 + (cy0 + 0.5) * fr.cellH, q1y = fr.y0 + (cy1 + 0.5) * fr.cellH;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty,       w11 = tx * ty;

    const g = this.grid, d = g.data;
    const ring = this.scanRing;
    const pcx = g.colOf(px), pcy = g.rowOf(py);
    const gx0 = Math.max(0, pcx - ring), gx1 = Math.min(g.cols - 1, pcx + ring);
    const gy0 = Math.max(0, pcy - ring), gy1 = Math.min(g.rows - 1, pcy + ring);

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const ci = gy * g.cols + gx;
        const list = this.cellBodies[ci];
        if (!list || list.length === 0) continue;

        // 1) exact per-body forces (full weight)
        for (let li = 0; li < list.length; li++) {
          const b = list[li];
          if (b === pBody) continue;
          checks++;
          const dx = b.cx - px, dy = b.cy - py;
          const d2 = dx * dx + dy * dy;
          const dist = Math.sqrt(d2) + 0.1;
          const fF = G * b.mass / (d2 + SOFT);
          out.x += (dx / dist) * fF;
          out.y += (dy / dist) * fF;
        }

        // 2) subtract the aggregate's split share as the sample blended it
        const m = d[ci * 3];
        if (m <= 0) continue;
        const comX = d[ci * 3 + 1] / m, comY = d[ci * 3 + 2] / m;
        const gm = G * m;
        // corner 00
        this._subShare(comX, comY, gm, q0x, q0y, w00, R1, R2, inv, out);
        this._subShare(comX, comY, gm, q1x, q0y, w10, R1, R2, inv, out);
        this._subShare(comX, comY, gm, q0x, q1y, w01, R1, R2, inv, out);
        this._subShare(comX, comY, gm, q1x, q1y, w11, R1, R2, inv, out);
      }
    }
    return checks;
  },

  /** One corner's share of an aggregate's split term (subtracted from out). */
  _subShare(mx, my, gm, qx, qy, w, R1, R2, inv, out) {
    if (w <= 0) return;
    const dx = mx - qx, dy = my - qy;
    const d2 = dx * dx + dy * dy;
    const dist = Math.sqrt(d2) + 0.1;
    let S = 1;
    if (dist < R2) {
      if (dist <= R1) return;                  // build skipped it here → nothing to subtract
      const t = (dist - R1) * inv;
      S = t * t * (3 - 2 * t);
    }
    const fF = (gm / (d2 + SOFT)) * S * w;
    out.x -= (dx / dist) * fF;
    out.y -= (dy / dist) * fF;
  },

  /**
   * How many LIVE-grid cells around the particle's cell the gather must scan
   * so every body within frontR2 is found (COM can sit anywhere in its cell).
   */
  get scanRing() {
    const g = this.grid;
    const cell = Math.min(g.cellW, g.cellH);
    return Math.ceil(this._front.R2 / cell) + 1;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Weight-map overlay — world space, debug only, called inside shouldRender
  // ═══════════════════════════════════════════════════════════════════════
  drawOverlay(ctx) {
    if (ManualOverrides.get('gravGridOverlay', 0) < 0.5) return;
    if (!this.enabled || !this._hasBounds) return;
    const g = this.grid;
    const d = g.data;

    ctx.save();

    // faint lattice
    ctx.strokeStyle = 'rgba(120,180,255,0.10)';
    ctx.lineWidth = Math.max(1, g.cellW * 0.01);
    ctx.beginPath();
    for (let c = 0; c <= g.cols; c++) {
      const x = g.x0 + c * g.cellW;
      ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y0 + g.h);
    }
    for (let r = 0; r <= g.rows; r++) {
      const y = g.y0 + r * g.cellH;
      ctx.moveTo(g.x0, y); ctx.lineTo(g.x0 + g.w, y);
    }
    ctx.stroke();

    // occupied cells: heat by mass share + COM dot + segment text.
    // The segment's text now reads: mass · ⚡hard · ∙soft — HOW MUCH gravity,
    // and HOW MUCH collision is happening in this box right now.
    let maxM = 0;
    for (let ci = 0; ci < g.cols * g.rows; ci++) maxM = Math.max(maxM, d[ci * 3]);
    const cH = this._collHard, cS = this._collSoft;
    const collOk = this._collOn && cH && cH.length === g.cols * g.rows;
    if (maxM > 0 || collOk) {
      const fontPx = Math.max(10, g.cellH * 0.18);
      ctx.font = `${fontPx}px monospace`;
      ctx.textAlign = 'center';
      for (let cy = 0; cy < g.rows; cy++) {
        for (let cx = 0; cx < g.cols; cx++) {
          const ci = cy * g.cols + cx;
          const di = ci * 3;
          const m = d[di];
          const hard = collOk ? cH[ci] : 0;
          const soft = collOk ? cS[ci] : 0;
          const hasColl = (hard + soft) > 0.5;
          if (m <= 0 && !hasColl) continue;
          const x = g.x0 + cx * g.cellW, y = g.y0 + cy * g.cellH;

          if (m > 0 && maxM > 0) {
            const t = m / maxM;
            ctx.fillStyle = `rgba(255,${Math.round(190 - 120 * t)},60,${0.08 + 0.22 * t})`;
            ctx.fillRect(x, y, g.cellW, g.cellH);
            // center of mass — the WHERE of this box's gravity
            const comX = d[di + 1] / m, comY = d[di + 2] / m;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.arc(comX, comY, Math.max(2, g.cellW * 0.02), 0, Math.PI * 2);
            ctx.fill();
          }

          // collision heat: red segment border, brighter with more impact
          if (hasColl) {
            const ct = Math.min(1, (hard + soft) / 12);
            ctx.strokeStyle = `rgba(255,70,70,${0.25 + 0.6 * ct})`;
            ctx.lineWidth = Math.max(1.5, g.cellW * 0.03);
            ctx.strokeRect(x + 1, y + 1, g.cellW - 2, g.cellH - 2);
          }

          // the segment's text: HOW MUCH · ⚡hard · ∙soft
          let label = m > 0 ? (m >= 1000 ? `${(m / 1000).toFixed(1)}k` : `${Math.round(m)}`) : '';
          if (hard > 0.5) label += ` ⚡${Math.round(hard)}`;
          if (soft > 0.5) label += ` ∙${Math.round(soft)}`;
          if (label) {
            ctx.fillStyle = hasColl ? 'rgba(255,180,160,0.95)' : 'rgba(255,230,160,0.9)';
            ctx.fillText(label.trim(), x + g.cellW / 2, y + fontPx * 1.1);
          }
        }
      }
    }

    // dominant body — the current "sun role"
    if (this.dominant) {
      ctx.strokeStyle = 'rgba(255,220,80,0.9)';
      ctx.lineWidth = Math.max(2, g.cellW * 0.02);
      ctx.beginPath();
      ctx.arc(this.dominant.cx, this.dominant.cy, g.cellW * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  },
};
