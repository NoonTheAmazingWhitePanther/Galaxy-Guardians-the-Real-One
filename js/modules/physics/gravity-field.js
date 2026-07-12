/**
 * js/modules/physics/gravity-field.js
 * Prime Module: GravityField — the planet gravity grid (weight map).
 *
 * MIGRATED UNDER THE MAP RULE (2026-07-12) — the biggest outlaw brought in.
 * Geometry and storage now come from the one lattice; the sliced far-field
 * build, the near/far Ewald split, gatherNear, and the double buffer survive
 * INTACT — only where the cells live changed.
 *
 * What the law changed:
 *   · Bounds hysteresis is DEAD. THE ALIGNMENT LAW anchors the weight map on
 *     the sun with the shared span (sunMapSpan) — the same X,Y is the same
 *     cell on every grid, forever. No re-anchoring, no wandering box.
 *   · Storage is two renters:
 *       'gravityField'     channels m · mx · my   (Σmass, Σm·x, Σm·y)
 *       'gravityCollision' channels hard · soft   (impulse heat per segment)
 *     Separate renters per THE SEPARATION RULE — never new channels on
 *     someone else's grid. Both rent at cellSize 250 so gravGridCols 48
 *     reproduces the classic 48×48 over the default 12000 span; the knob now
 *     drives the renter's resBias (cols/48) on top of the mapRuleRes dial.
 *   · Mass moved from PAINT to THE DEPOSIT LAW: per-body delta deposits
 *     (+1/−1) — same cell → value diffs only, moved → subtract old / add
 *     new, dead → retire. No more O(cells) clear every frame.
 *   · The far-field FRAME is now a WINDOW: frozen back-frame geometry covers
 *     only the occupied cell bbox + the classic pad (15% + 600px), snapped to
 *     the shared lattice — build cost stays proportional to the cluster, not
 *     the span. Outside the window, sampleInto falls back exactly as before.
 *
 * What did NOT change (the build logic, byte-honest):
 *   · ONE for the Sun (analytic / SunGravMap), MANY for the planets here.
 *   · Smooth force splitting: far share f·S(d) lives in the field, exact
 *     near share f·(1−S(d)) added per body at gather — the two always sum
 *     to the exact force, no exclusion-set mismatch at cell boundaries.
 *   · Double buffer: build into BACK in gravGridBudget-cell slices from a
 *     mass snapshot, swap when done; sampling always reads a coherent FRONT.
 *   · gatherNear subtracts the aggregate's blended split share (same 4
 *     corners, same weights, same S) and adds exact per-body forces.
 *   · GHOST MODE: while FutureCache body-swaps, applyGravity falls back to
 *     the exact legacy loop; ghost collisions never paint the live map.
 *   · Grid SLEEPS below gravGridMinBodies and wakes at scale.
 *   · Collision heat decay: 0.94 per rAF with the 0.05 floor — private
 *     upkeep over renter storage (contract decay {}), byte-identical to the
 *     old arrays. (The tick-indexed PULSE law can claim it later if wanted.)
 */

import { config } from '../../core/config.js';
import { state } from '../../core/state.js';
import { ManualOverrides } from '../debug/governor.js';
import { MsProbe } from '../../core/ms-probe.js';
import { MapRule } from '../../core/map-rule.js';

const SOFT = 300;            // same softening as the legacy per-body loop
const BASE_COLS = 48;        // gravGridCols value that means resBias 1
const CELL_PX = 250;         // 12000 default span / 48 — the classic lattice

const _v3 = new Float32Array(3);   // deposit scratch: m, m·x, m·y
const _seen = new Set();           // live keys this frame (retire the rest)

const _mkFrame = () => ({
  x0: 0, y0: 0, cellW: 1, cellH: 1, invCW: 1, invCH: 1,
  cols: 0, rows: 0, w: 1, h: 1,
  fx: null, fy: null,        // Float32Array cols*rows — force per unit mass
  R2: 0,                     // split radius this frame was built with
  ready: false,
});

export const GravityField = {
  // ── renters (lazy — the law may not be awake at import time) ────────────
  _renter: null,             // 'gravityField'      m · mx · my
  _collRenter: null,         // 'gravityCollision'  hard · soft
  _geomV: -1,                // renter geometry version we built against

  _r() {
    if (this._renter) return this._renter;
    this._renter = MapRule.declare('gravityField', {
      channels: ['m', 'mx', 'my'],
      cellSize: CELL_PX,
      smoothing: 0,          // gravity reads RAW — blur would corrupt COMs
      skip: 4,
      decay: {},             // DEPOSIT law: sources are exact, nothing forgets
    });
    return this._renter;
  },
  _cr() {
    if (this._collRenter) return this._collRenter;
    this._collRenter = MapRule.declare('gravityCollision', {
      channels: ['hard', 'soft'],
      cellSize: CELL_PX,     // same lattice pitch → segment == weight-map segment
      smoothing: 0,
      skip: 4,
      decay: {},             // decayed privately per rAF (0.94 + floor), as always
    });
    return this._collRenter;
  },

  /** The weight-map lattice — the renter's grid (kept as `.grid` for all readers). */
  get grid() { return this._r().grid; },

  // ── live near index ──────────────────────────────────────────────────────
  cellBodies: [],                      // live cell→bodies index (refs, rebuilt per frame)
  _cellBodiesLen: 0,

  // ── double-buffered far field (WINDOW frames on the shared lattice) ─────
  _front: _mkFrame(),
  _back:  _mkFrame(),

  // ── build state ──────────────────────────────────────────────────────────
  _building: false,
  _cursor: 0,
  _occ: [],                            // snapshot: {x,y,gm} per occupied cell
  _occLen: 0,
  _occC0: 0, _occC1: 0, _occR0: 0, _occR1: 0,   // occupied cell bbox at snapshot

  _G: 120,                             // GRAV_CONST captured each update
  ghostMode: false,                    // set by FutureCache around ghost stepping
  dominant: null,                      // heaviest live body (the "sun role")

  _collOn: false,                      // true only while the grid is awake
  _awake: false,                       // for wipe-on-sleep transitions

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

  // Going quiet (OFF / EMPTY / SMALL): frames down, deposits retired once so
  // the census and overlay never show a stale weight map. Collision heat is
  // NOT wiped — it froze during sleep before and resumes decay on wake.
  _sleep() {
    this._front.ready = false;
    this._building = false;
    this._collOn = false;
    if (this._awake) { this._r().wipe(); this._awake = false; }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // update() — once per rAF, before the physics substep loop.
  // Deposit is O(bodies) delta-law. Build is sliced under gravGridBudget.
  // ═══════════════════════════════════════════════════════════════════════
  update() {
    const s = this.stats;
    s.gridHits = 0; s.directFalls = 0;
    s.collHard = 0; s.collSoft = 0;                       // per-frame counts (deposits land after us, during substeps)
    if (!this.enabled) { s.mode = 'OFF'; s.on = 0; this._sleep(); return; }
    s.on = 1;
    this._G = config.GRAV_CONST;

    // ── geometry under the law — self-driven, so gravity stays honest even
    // with mapRuleOn 0 (the lattice is storage; mapRuleOn gates awareness) ──
    const gr = this._r(), cr = this._cr();
    MapRule.anchorWatch();
    const cols = Math.max(8, Math.min(96, ManualOverrides.get('gravGridCols', BASE_COLS) | 0));
    gr.resBias = cols / BASE_COLS;
    cr.resBias = cols / BASE_COLS;
    const res = ManualOverrides.get('mapRuleRes', 1);
    gr._applyResolution(res);
    cr._applyResolution(res);
    if (gr.version !== this._geomV) {                     // lattice changed → all caches void
      this._geomV = gr.version;                           // (renter already zeroed itself)
      this._front.ready = false;
      this._building = false;
      this._cellBodiesLen = 0;
    }

    const bodies = state.bodies;
    const n = bodies.length;
    s.bodies = n;
    if (n === 0) { s.mode = 'EMPTY'; s.occupied = 0; this.dominant = null; this._sleep(); return; }

    // Below the threshold the legacy direct loop (with its distance cull) is
    // cheaper than field upkeep + gather — the grid SLEEPS and wakes at scale.
    if (n < ManualOverrides.get('gravGridMinBodies', 80)) {
      s.mode = 'SMALL'; s.occupied = 0;
      this._sleep();
      // still track the dominant body — the "sun role" is wanted regardless
      let dom = null, domM = -1;
      for (let i = 0; i < n; i++) { const b = bodies[i]; if (b.mass > domM) { domM = b.mass; dom = b; } }
      this.dominant = dom; s.dominantMass = Math.round(domM);
      return;
    }
    this._awake = true;

    // Grid time has a name: two children under the physics.gravField parent
    // (auto-nested in the msProbeTree), mirrored into stats for the panel.
    // update() only ever runs on the LIVE path (main loop, pre-substeps) —
    // ghosts never come through here, so no ghost gating is needed.
    const _t0 = performance.now();
    this._collUpkeep();                                   // decay heat · count hot segments
    this._deposit(bodies, n);
    const _t1 = performance.now();
    this._buildSlice(Math.max(16, ManualOverrides.get('gravGridBudget', 512) | 0));
    const _t2 = performance.now();
    MsProbe.record('physics.gravField.deposit', _t1 - _t0);
    MsProbe.record('physics.gravField.build',   _t2 - _t1);
    s.msDeposit = +(_t1 - _t0).toFixed(2);
    s.msBuild   = +(_t2 - _t1).toFixed(2);
    s.msUpdate  = +(_t2 - _t0).toFixed(2);

    s.cols = gr.grid.cols;
    s.cellSize = Math.round(gr.grid.cellW);
    s.mode = this._front.ready ? 'GRID' : 'WARMUP';
  },

  // Collision-map upkeep over RENTER storage: decay everything toward zero
  // (~1s half-life, 0.05 floor — byte-identical to the old private arrays),
  // count hot segments. No realloc, no reanchor wipe: the lattice never
  // moves, and a resolution change already zeroed the renter.
  _collUpkeep() {
    const g = this._cr().grid;
    const d = g.data, cells = g.cols * g.rows;
    let hot = 0;
    for (let i = 0; i < cells; i++) {
      const j = i * 2;
      let h = d[j], sf = d[j + 1];
      if (h > 0) { h *= 0.94; if (h < 0.05) h = 0; d[j] = h; }
      if (sf > 0) { sf *= 0.94; if (sf < 0.05) sf = 0; d[j + 1] = sf; }
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
    const g = this._cr().grid;
    const j = (g.rowOf(y) * g.cols + g.colOf(x)) * 2;
    if (hard) { g.data[j] += 1;     this.stats.collHard++; }
    else      { g.data[j + 1] += 1; this.stats.collSoft++; }
  },

  // THE DEPOSIT LAW: Σm, Σm·x, Σm·y per cell as per-body delta deposits —
  // same cell → value diffs only, moved → subtract old / add new, gone →
  // retire. Plus the live cell→bodies index + dominant, same single pass.
  _deposit(bodies, n) {
    const r = this._r(), g = r.grid;
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
    _seen.clear();
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      const key = b.id != null ? b.id : b;   // id-stable across clone swaps; ref as last resort
      _seen.add(key);
      _v3[0] = b.mass;
      _v3[1] = b.mass * b.cx;
      _v3[2] = b.mass * b.cy;
      r.deposit(key, b.cx, b.cy, _v3);
      const ci = g.rowOf(b.cy) * g.cols + g.colOf(b.cx);
      (this.cellBodies[ci] || (this.cellBodies[ci] = [])).push(b);
      if (b.mass > domM) { domM = b.mass; dom = b; }
    }
    // retire the dead / despawned — their mass leaves the map exactly
    for (const key of r._deposits.keys()) {
      if (!_seen.has(key)) r.retire(key);
    }
    this.dominant = dom;
    this.stats.dominantMass = Math.round(domM);
  },

  // Sliced far-field build into the back frame, then swap. The frame is a
  // WINDOW on the shared lattice: occupied cell bbox + the classic pad
  // (15% of extent + 600px) in whole cells — build cost tracks the cluster,
  // and the window's cells ARE lattice cells (Alignment Law preserved).
  _buildSlice(budget) {
    const g = this._r().grid;

    if (!this._building) {
      // ── snapshot occupied cells (each becomes one point mass at its COM) ──
      // COMs are Σm·x/Σm — exact world positions even in span-edge cells.
      const d = g.data;
      let k = 0;
      let c0 = g.cols, c1 = -1, r0 = g.rows, r1 = -1;
      const G = config.GRAV_CONST;
      for (let cy = 0; cy < g.rows; cy++) {
        for (let cx = 0; cx < g.cols; cx++) {
          const di = (cy * g.cols + cx) * 3;
          const m = d[di];
          if (m <= 0) continue;
          const o = this._occ[k] || (this._occ[k] = { x: 0, y: 0, gm: 0 });
          o.x = d[di + 1] / m;
          o.y = d[di + 2] / m;
          o.gm = G * m;
          k++;
          if (cx < c0) c0 = cx;
          if (cx > c1) c1 = cx;
          if (cy < r0) r0 = cy;
          if (cy > r1) r1 = cy;
        }
      }
      this._occLen = k;
      this.stats.occupied = k;
      if (k === 0) { this._front.ready = false; return; }   // nothing to build from

      // ── the window: occupied bbox + pad, snapped to whole lattice cells ──
      const extW = (c1 - c0 + 1) * g.cellW, extH = (r1 - r0 + 1) * g.cellH;
      const pad = Math.max(extW, extH) * 0.15 + 600;
      const padC = Math.ceil(pad / Math.min(g.cellW, g.cellH));
      c0 = Math.max(0, c0 - padC); c1 = Math.min(g.cols - 1, c1 + padC);
      r0 = Math.max(0, r0 - padC); r1 = Math.min(g.rows - 1, r1 + padC);
      this._occC0 = c0; this._occC1 = c1; this._occR0 = r0; this._occR1 = r1;

      // ── freeze back-frame geometry (a lattice-aligned sub-rect) ──
      const f = this._back;
      f.cellW = g.cellW; f.cellH = g.cellH; f.invCW = g.invCW; f.invCH = g.invCH;
      f.x0 = g.x0 + c0 * g.cellW;
      f.y0 = g.y0 + r0 * g.cellH;
      f.cols = c1 - c0 + 1;
      f.rows = r1 - r0 + 1;
      f.w = f.cols * f.cellW; f.h = f.rows * f.cellH;
      f.R2 = this.splitR2;                 // frozen with the frame — gather must use THIS radius
      const fcells = f.cols * f.rows;
      if (!f.fx || f.fx.length !== fcells) { f.fx = new Float32Array(fcells); f.fy = new Float32Array(fcells); }
      this._cursor = 0;
      this._building = true;
    }

    const f = this._back;
    const fcells = f.cols * f.rows;

    // Smooth force splitting (Ewald-style): every body's force is divided by
    // TRUE DISTANCE into a smooth far part f·S(d) (lives in the field, safe to
    // interpolate) and an exact near part f·(1−S(d)) (added per body at
    // gather). Because S depends only on distance, the two passes always sum
    // to the exact force — no exclusion-set mismatch at cell boundaries.
    const R2 = f.R2, R1 = R2 * 0.5, invRange = R2 > R1 ? 1 / (R2 - R1) : 0;
    const occ = this._occ, occLen = this._occLen;
    const end = Math.min(fcells, this._cursor + budget);

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
    this.stats.buildPct = Math.round((end / fcells) * 100);

    if (end >= fcells) {
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
   * false → point outside front window → caller uses the legacy loop.
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
    if (!this.enabled) return;
    const g = this.grid;
    const d = g.data;

    ctx.save();

    // faint lattice — the FULL shared anchor now (the Alignment Law, visible)
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

    // the built window — where the far field actually lives right now
    const fr = this._front;
    if (fr.ready) {
      ctx.strokeStyle = 'rgba(120,255,180,0.35)';
      ctx.lineWidth = Math.max(2, g.cellW * 0.02);
      ctx.strokeRect(fr.x0, fr.y0, fr.w, fr.h);
    }

    // occupied cells: heat by mass share + COM dot + segment text.
    // The segment's text reads: mass · ⚡hard · ∙soft — HOW MUCH gravity,
    // and HOW MUCH collision is happening in this box right now.
    let maxM = 0;
    for (let ci = 0; ci < g.cols * g.rows; ci++) maxM = Math.max(maxM, d[ci * 3]);
    const cg = this._cr().grid;
    const cd = cg.data;
    const collOk = this._collOn && cg.cols === g.cols && cg.rows === g.rows;
    if (maxM > 0 || collOk) {
      const fontPx = Math.max(10, g.cellH * 0.18);
      ctx.font = `${fontPx}px monospace`;
      ctx.textAlign = 'center';
      for (let cy = 0; cy < g.rows; cy++) {
        for (let cx = 0; cx < g.cols; cx++) {
          const ci = cy * g.cols + cx;
          const di = ci * 3;
          const m = d[di];
          const hard = collOk ? cd[ci * 2] : 0;
          const soft = collOk ? cd[ci * 2 + 1] : 0;
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
