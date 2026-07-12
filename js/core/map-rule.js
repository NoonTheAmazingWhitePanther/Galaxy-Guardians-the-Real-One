/**
 * js/core/map-rule.js
 * THE SINGULAR MAP RULE (Noon's design, 2026-07-12).
 *
 * One lattice law for every spatial map. A renter declares a CONTRACT —
 * channels, cellSize, resolution, smoothing, skip cadence, per-channel decay —
 * and the engine provides the grid, the update law, and the read API. No map
 * owns private cell math ever again.
 *
 * THE UPDATE LAW — delta-deposit (+1/−1, "iteration without the for loop"):
 * nothing ever rebuilds the world. Each tracked id remembers what it deposited
 * and where; when it moves or its values change, the engine subtracts the old
 * deposit and adds the new one. Two cell writes per changed body, zero for
 * unchanged ones. The grid is kinematic by increments.
 *
 * THE ABSORPTION LAW: planets (and paint, and panels, and the benchmark)
 * ABSORB the smoothed fields — they never resolve contacts from them.
 * Contact resolution and the spring mesh stay pairwise-exact, always; fields
 * carry awareness, styling, and far influence. ~Real, never mush.
 *
 * SMOOTHING: each renter owns a second buffer; every `skip` ticks the raw
 * deposits are box-blurred into it ("averaged, smoothed and summed" — each
 * cell from its neighbors, so the one next to it is exactly one increment of
 * work). Reads absorb the SMOOTHED buffer; raw stays exact for delta math.
 *
 * DECAY: per-channel, indexed by TICK, never wall-clock — so any consumer
 * living in the future (ghost sim, cached streams) evaluates the field at
 * ITS tick honestly.
 *
 * SCENES: declared sub-rectangles of the world ("little scenes") that the
 * benchmark can watch — averaged channel readings over the rect, live, to
 * observe the real-time teamwork of nearby cells.
 *
 * GHOST GUARD: deposits are refused while GravityField.ghostMode is on —
 * ghost bodies are clones living in the future; letting them deposit would
 * corrupt the live maps.
 */
import { FieldGrid } from './field-grid.js';
import { SUN } from './state.js';
import { ManualOverrides } from '../modules/debug/governor.js';

// ═══ THE ALIGNMENT LAW (Noon, 2026-07-12) ═══
// Every renter covers the SAME world rectangle — one shared anchor, sun-
// centered, one span. Resolution and buffer may differ per renter; world
// coordinates may not. The same X,Y is the same place on every grid, always.
// A renter must never own private bounds.
class Renter {
  constructor(name, contract) {
    this.name = name;
    this.channels = contract.channels.slice();          // channel names, in order
    this.cellSize = contract.cellSize || 96;            // px per cell at res ×1
    this.smoothing = contract.smoothing ?? 1;           // blur passes per refresh · 0 = never (raw-only renters)
    this.skip = Math.max(1, contract.skip ?? 4);        // smooth every N ticks
    this.decay = contract.decay || {};                  // channelName -> per-tick factor
    this.resBias = contract.resBias ?? 1;               // per-renter resolution bias (× the global dial)
    this.version = 0;                                   // bumps whenever geometry actually changes
    // span comes from THE ALIGNMENT LAW — the shared anchor, never private
    this._res = 0;                                      // applied resolution mult
    this._deposits = new Map();                         // id -> {cx, cy, vals:Float32Array}
    this._lastSmoothTick = -1;
    this._lastDecayTick = -1;
    this.grid = null;
    this.smoothed = null;                               // Float32Array, grid geometry
    this._scratch = null;
    this._applyResolution(1);
  }

  _applyResolution(mult) {
    const m = Math.max(0.25, Math.min(4, (mult || 1) * this.resBias));
    if (m === this._res) return;
    this._res = m;
    this.version++;                                     // owners watch this to invalidate caches
    const span = MapRule.anchorSpan;
    const n = Math.max(8, Math.min(512, Math.round(span / (this.cellSize / m))));
    if (!this.grid) this.grid = new FieldGrid(n, n, this.channels.length);
    else this.grid.resize(n, n, this.channels.length);
    this.grid.setBounds(SUN.x - span / 2, SUN.y - span / 2, span, span);
    this._span = span;
    this.smoothed = new Float32Array(this.grid.data.length);
    this._scratch = new Float32Array(this.grid.data.length);
    this._deposits.clear();                             // geometry changed → deposits void
    this.grid.clear();
  }

  chIndex(chName) { return this.channels.indexOf(chName); }

  /**
   * THE DELTA LAW. Report an id's current position + channel values; the
   * engine writes only what changed: same cell → value diffs; moved cell →
   * full remove old / add new. `vals` length must equal channels length.
   */
  deposit(id, x, y, vals) {
    const g = this.grid, ch = g.channels;
    const cx = g.colOf(x), cy = g.rowOf(y);
    let rec = this._deposits.get(id);
    if (!rec) {
      rec = { cx, cy, vals: new Float32Array(ch) };
      this._deposits.set(id, rec);
      const i = g.index(cx, cy);
      for (let c = 0; c < ch; c++) { g.data[i + c] += vals[c]; rec.vals[c] = vals[c]; }
      return;
    }
    if (rec.cx === cx && rec.cy === cy) {
      const i = g.index(cx, cy);
      for (let c = 0; c < ch; c++) {
        const d = vals[c] - rec.vals[c];
        if (d !== 0) { g.data[i + c] += d; rec.vals[c] = vals[c]; }
      }
      return;
    }
    const iOld = g.index(rec.cx, rec.cy);
    const iNew = g.index(cx, cy);
    for (let c = 0; c < ch; c++) {
      g.data[iOld + c] -= rec.vals[c];
      g.data[iNew + c] += vals[c];
      rec.vals[c] = vals[c];
    }
    rec.cx = cx; rec.cy = cy;
  }

  /**
   * THE PULSE LAW — the second write law. Deposits are for persistent ids;
   * pulses are fire-and-forget splats (impacts, novas, force commands) that
   * MUST have decay on their channel, or they never leave. Linear falloff
   * over `radius` px. Untracked on purpose — decay is their retirement.
   */
  pulse(x, y, chName, v, radius = 0) {
    const c = this.chIndex(chName);
    if (c < 0) return;
    const g = this.grid;
    if (radius <= g.cellW) { g.splat(x, y, c, v); return; }
    const c0 = g.colOf(x - radius), c1 = g.colOf(x + radius);
    const r0 = g.rowOf(y - radius), r1 = g.rowOf(y + radius);
    const inv = 1 / radius;
    for (let rr = r0; rr <= r1; rr++) {
      const cy = g.y0 + (rr + 0.5) * g.cellH - y;
      for (let cc = c0; cc <= c1; cc++) {
        const cx = g.x0 + (cc + 0.5) * g.cellW - x;
        const d = Math.sqrt(cx * cx + cy * cy) * inv;
        if (d >= 1) continue;
        g.data[g.index(cc, rr) + c] += v * (1 - d);
      }
    }
  }

  /** Remove an id's deposit entirely (death, absorption, despawn). */
  retire(id) {
    const rec = this._deposits.get(id);
    if (!rec) return;
    const i = this.grid.index(rec.cx, rec.cy);
    for (let c = 0; c < this.grid.channels; c++) this.grid.data[i + c] -= rec.vals[c];
    this._deposits.delete(id);
  }

  /** Tick-indexed decay + skip-cadenced smoothing. Call once per LIVE tick. */
  refresh(tick) {
    // decay — pure function of elapsed ticks (ghost/stream honest)
    if (this._lastDecayTick < 0) this._lastDecayTick = tick;
    const dt = tick - this._lastDecayTick;
    if (dt > 0) {
      for (const [chName, f] of Object.entries(this.decay)) {
        const c = this.chIndex(chName);
        if (c < 0) continue;
        const k = Math.pow(f, dt);
        const d = this.grid.data, n = d.length, CH = this.grid.channels;
        for (let i = c; i < n; i += CH) d[i] *= k;
      }
      // decayed channels drift from tracked deposit values on purpose — the
      // deposits are sources; decay is the field forgetting. Re-deposits
      // re-anchor them.
      this._lastDecayTick = tick;
    }
    // smoothing — every `skip` ticks (registered; Skip Action Panels read us).
    // smoothing:0 renters never blur — their product is the RAW grid (gravity,
    // sun geometry) and blurring would corrupt exact math.
    if (this.smoothing > 0 &&
        (this._lastSmoothTick < 0 || tick - this._lastSmoothTick >= this.skip)) {
      this._lastSmoothTick = tick;
      this._smooth();
    }
  }

  /** Zero everything — grid, smoothed buffer, tracked deposits. Owner's reset. */
  wipe() {
    this.grid.clear();
    this.smoothed.fill(0);
    this._deposits.clear();
  }

  /** Box blur raw → smoothed, `smoothing` passes. Neighbor-summed averages. */
  _smooth() {
    const g = this.grid, C = g.cols, R = g.rows, CH = g.channels;
    let src = g.data, dst = this.smoothed;
    for (let pass = 0; pass < Math.max(1, this.smoothing); pass++) {
      for (let r = 0; r < R; r++) {
        const rU = r > 0 ? r - 1 : r, rD = r < R - 1 ? r + 1 : r;
        for (let c = 0; c < C; c++) {
          const cL = c > 0 ? c - 1 : c, cR = c < C - 1 ? c + 1 : c;
          const i = (r * C + c) * CH;
          const iU = (rU * C + c) * CH, iD = (rD * C + c) * CH;
          const iL = (r * C + cL) * CH, iR = (r * C + cR) * CH;
          for (let ch = 0; ch < CH; ch++) {
            dst[i + ch] = (src[i + ch] * 4 + src[iU + ch] + src[iD + ch] + src[iL + ch] + src[iR + ch]) / 8;
          }
        }
      }
      if (pass + 1 < Math.max(1, this.smoothing)) {   // ping-pong further passes
        const t = dst === this.smoothed ? this._scratch : this.smoothed;
        src = dst; dst = t;
      }
    }
    if (dst !== this.smoothed) this.smoothed.set(dst);
  }

  /** ABSORB one smoothed channel at world (x,y) — bilinear. */
  absorb(x, y, chName) {
    const c = this.chIndex(chName);
    if (c < 0) return 0;
    _abs2.x = 0; _abs2.y = 0;
    // sample2 reads two channels; pair with itself when only one is wanted
    return this.grid.sample2(x, y, c, c, _abs2, this.smoothed) ? _abs2.x : 0;
  }

  /** ABSORB a smoothed vector channel pair (e.g. momentum x/y). */
  absorb2(x, y, chA, chB, out) {
    const a = this.chIndex(chA), b = this.chIndex(chB);
    if (a < 0 || b < 0) { out.x = 0; out.y = 0; return false; }
    return this.grid.sample2(x, y, a, b, out, this.smoothed);
  }
}
const _abs2 = { x: 0, y: 0 };

export const MapRule = {
  _renters: new Map(),
  _scenes: new Map(),

  /** THE ALIGNMENT LAW's single anchor — one span for every grid. */
  get anchorSpan() { return ManualOverrides.get('sunMapSpan', 12000); },

  _anchor: { x: NaN, y: NaN, span: 0 },

  /**
   * THE ALIGNMENT LAW, enforced live: if the sun moved or the span knob
   * changed, every renter re-anchors (bounds re-applied, deposits void,
   * version bumped so owners rebuild). Three compares when nothing changed.
   * Called from refreshAll AND from the physics renters' own updates, so
   * physics grids stay honest even with mapRuleOn = 0.
   */
  anchorWatch() {
    const a = this._anchor, span = this.anchorSpan;
    if (a.x === SUN.x && a.y === SUN.y && a.span === span) return false;
    a.x = SUN.x; a.y = SUN.y; a.span = span;
    const res = ManualOverrides.get('mapRuleRes', 1);
    for (const r of this._renters.values()) { r._res = 0; r._applyResolution(res); }
    return true;
  },

  /** Live census for the FIELDS panel — how much of physics the law holds. */
  stats: { renters: 0, channels: 0, cells: 0, roster: '', forceHot: 0 },

  /** Advance every renter's decay + smoothing to `tick`. One call per live tick. */
  refreshAll(tick) {
    this.anchorWatch();
    let ch = 0, cells = 0;
    const names = [];
    for (const r of this._renters.values()) {
      r._applyResolution(ManualOverrides.get('mapRuleRes', 1));
      r.refresh(tick);
      ch += r.channels.length;
      cells += r.grid.cols * r.grid.rows;
      names.push(r.name + '(' + r.channels.length + ')');
    }
    const st = this.stats;
    st.renters = this._renters.size;
    st.channels = ch;
    st.cells = cells;
    st.roster = names.join(' ');
    st.forceHot = ForceField._hotTicks;
  },

  /** Declare a renter under the law. Re-declaring returns the existing one. */
  declare(name, contract) {
    if (this._renters.has(name)) return this._renters.get(name);
    const r = new Renter(name, contract);
    this._renters.set(name, r);
    return r;
  },

  get(name) { return this._renters.get(name) || null; },

  /** Skip registry — the Skip Action Panels bind here; skipping stays visible. */
  list() {
    const out = [];
    for (const r of this._renters.values()) {
      out.push({ name: r.name, skip: r.skip, cells: r.grid.cols * r.grid.rows,
                 channels: r.channels.join(','), res: r._res });
    }
    return out;
  },

  /** Governor hand: resolution multiplier for one renter (tessellation dial). */
  setResolution(name, mult) { this._renters.get(name)?._applyResolution(mult); },

  /** Declare a watchable "little scene" — a sub-rect of the world. */
  scene(name, x0, y0, w, h) { this._scenes.set(name, { x0, y0, w, h }); },

  /** Benchmark eye: average of a smoothed channel over a scene's rect. */
  watchScene(sceneName, renterName, chName) {
    const s = this._scenes.get(sceneName), r = this._renters.get(renterName);
    if (!s || !r) return 0;
    const c = r.chIndex(chName);
    if (c < 0) return 0;
    const g = r.grid;
    const c0 = g.colOf(s.x0), c1 = g.colOf(s.x0 + s.w);
    const r0 = g.rowOf(s.y0), r1 = g.rowOf(s.y0 + s.h);
    let sum = 0, n = 0;
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      sum += r.smoothed[g.index(cc, rr) + c]; n++;
    }
    return n ? sum / n : 0;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// BODY FIELDS — the first renter born under the law.
// One deposit per body COM per live tick, delta-law all the way:
//   weight   — body mass (absolute)
//   heat     — body heat (absolute)
//   momX/Y   — mass × COM displacement this tick (flow field)
//   threat   — presence count, DECAYING: recently-visited cells stay warm, so
//              absorbing `threat` around you is the awareness radius Noon
//              asked planets to own — without any per-planet grid.
// ═══════════════════════════════════════════════════════════════════════════
import { GravityField } from '../modules/physics/gravity-field.js';

const _vals = new Float32Array(7);

export const BodyFields = {
  renter: null,
  _prev: new Map(),          // id -> {x, y}
  _tick: 0,

  _ensure() {
    if (this.renter) return this.renter;
    this.renter = MapRule.declare('bodyFields', {
      channels: ['weight', 'heat', 'momX', 'momY', 'threat', 'kinetic', 'count'],
      cellSize: 96,
      smoothing: 1,
      skip: 4,
      decay: { threat: 0.985 },        // ~50-tick half-life of "someone was here"
    });
    return this.renter;
  },

  get enabled() { return ManualOverrides.get('mapRuleOn', 1) >= 0.5; },

  /** Once per LIVE tick, after COM update. Ghost ticks are refused. */
  tick(bodies) {
    if (!this.enabled || GravityField.ghostMode) return;
    const r = this._ensure();
    r.skip = Math.max(1, Math.round(ManualOverrides.get('mapRuleSkip', 4)));
    this._tick++;
    PlaneFields.clear();                       // PAINT law: this tick's truth only
    const seen = _seen; seen.clear();
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.id == null) continue;
      seen.add(b.id);
      const prev = this._prev.get(b.id);
      _vals[0] = b.mass || 0;
      _vals[1] = b.heat || 0;
      _vals[2] = prev ? (b.mass || 0) * (b.cx - prev.x) : 0;
      _vals[3] = prev ? (b.mass || 0) * (b.cy - prev.y) : 0;
      _vals[4] = 1;
      // kinetic — ½·m·(COM displacement this tick)²: the energy census.
      if (prev) {
        const ddx = b.cx - prev.x, ddy = b.cy - prev.y;
        _vals[5] = 0.5 * (b.mass || 0) * (ddx * ddx + ddy * ddy);
      } else _vals[5] = 0;
      _vals[6] = b.particles ? b.particles.length : 0;   // density census
      r.deposit(b.id, b.cx, b.cy, _vals);
      const pr = (Number.isFinite(b.radius) && b.radius > 0) ? b.radius : 8;
      PlaneFields.mark(b.cx, b.cy, pr, b.plane | 0);
      if (prev) { prev.x = b.cx; prev.y = b.cy; }
      else this._prev.set(b.id, { x: b.cx, y: b.cy });
    }
    // retire the dead / despawned
    for (const id of r._deposits.keys()) {
      if (!seen.has(id)) { r.retire(id); this._prev.delete(id); }
    }
    MapRule.refreshAll(this._tick);
  },
};
const _seen = new Set();

// ═══════════════════════════════════════════════════════════════════════════
// THE RENTER FAMILY (Noon's separation rule, 2026-07-12): every concern gets
// its OWN grid — all grids alike, all obeying the Alignment Law, so tuning
// one's decay or resolution can never interfere with another's recursing
// iteration. Keep this as a rule: new concerns get new renters, never new
// channels on someone else's grid.
// ═══════════════════════════════════════════════════════════════════════════

/** NOVAS — chaotic transient gravity. `explode()` marks this grid AND
 *  implants the physical push into ForceField — forces generated across
 *  the other grids, exactly one absorption point in the tick. */
export const NovaFields = {
  get renter() {
    return MapRule.declare('novaFields', {
      channels: ['energy', 'chaos'], cellSize: 192, smoothing: 2, skip: 4,
      decay: { energy: 0.97, chaos: 0.94 },
    });
  },
  explode(x, y, energy = 1000, radius = 900) {
    if (ManualOverrides.get('mapRuleOn', 1) < 0.5) return;
    const r = this.renter;
    r.pulse(x, y, 'energy', energy, radius);
    // chaos: a handful of signed sub-pulses — coherent shockwave, not noise
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, d = radius * (0.2 + Math.random() * 0.6);
      r.pulse(x + Math.cos(a) * d, y + Math.sin(a) * d, 'chaos',
              (Math.random() < 0.5 ? -1 : 1) * energy * 0.3, radius * 0.35);
    }
    // the push: radial outward force ring implanted into the FORCE grid
    const ka = energy * 0.002;                       // accel per unit at the ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * radius * 0.5, py = y + Math.sin(a) * radius * 0.5;
      ForceField.implant(px, py, Math.cos(a) * ka, Math.sin(a) * ka, radius * 0.5);
    }
  },
};

/** COLLISION — ongoing contact presence per pair, decaying. Awareness only. */
export const CollisionFields = {
  get renter() {
    return MapRule.declare('collisionFields', {
      channels: ['contact'], cellSize: 128, smoothing: 1, skip: 4,
      decay: { contact: 0.9 },
    });
  },
  mark(x, y, strength = 1) {
    if (ManualOverrides.get('mapRuleOn', 1) < 0.5) return;
    this.renter.pulse(x, y, 'contact', strength, 160);
  },
};

/** IMPACT — one pulse somewhere. Fast decay; the flash, not the bruise. */
export const ImpactField = {
  get renter() {
    return MapRule.declare('impactField', {
      channels: ['pulse'], cellSize: 128, smoothing: 1, skip: 2,
      decay: { pulse: 0.8 },
    });
  },
  pulse(x, y, strength = 1) {
    if (ManualOverrides.get('mapRuleOn', 1) < 0.5) return;
    this.renter.pulse(x, y, 'pulse', strength, 200);
  },
};

/** FORCE — the command grid. Channels store ACCELERATION (force per unit
 *  mass); implant a command anywhere and every particle inside absorbs it as
 *  a real applied force in the tick, while `hot`. Cold field = zero cost. */
const _ffScr = { x: 0, y: 0 };
export const ForceField = {
  _hotTicks: 0,
  get renter() {
    return MapRule.declare('forceField', {
      channels: ['fx', 'fy'], cellSize: 128, smoothing: 2, skip: 2,
      decay: { fx: 0.96, fy: 0.96 },
    });
  },
  get hot() { return this._hotTicks > 0 && ManualOverrides.get('mapRuleOn', 1) >= 0.5; },
  coolOne() { if (this._hotTicks > 0) this._hotTicks--; },
  /** Implant a force command: acceleration (ax, ay) with radius falloff. */
  implant(x, y, ax, ay, radius = 300) {
    if (ManualOverrides.get('mapRuleOn', 1) < 0.5) return;
    const r = this.renter;
    r.pulse(x, y, 'fx', ax, radius);
    r.pulse(x, y, 'fy', ay, radius);
    this._hotTicks = 240;              // ~4s of hot absorption, then free again
  },
  /** Absorb the smoothed acceleration at (x,y) into out {x,y}. */
  absorbInto(x, y, out) {
    const r = this.renter;
    return r.grid.sample2(x, y, 0, 1, out, r.smoothed);
  },
  /**
   * GHOST HONESTY (th_nova law): a ghost tick must feel the field decayed
   * to ITS tick, not the live decay state — decay is a pure function of
   * tick index. Returns decay^ticksAhead; the caller computes it once per
   * ghost tick and multiplies the absorbed acceleration per particle.
   * Live ticks pass 0 → scale 1.
   */
  ghostScale(ticksAhead) {
    if (ticksAhead <= 0) return 1;
    return Math.pow(this.renter.decay.fx ?? 0.96, ticksAhead);
  },
};

/** LOOSE DEBRIS — density census. THE PAINT LAW: tickLoose repaints it every
 *  live tick, one splat per live loose particle. No decay, no tracking —
 *  clear-and-repaint, an authority rewriting the whole truth each tick.
 *  Absorb the smoothed `density` for "how much junk is around here". */
export const LooseFields = {
  get renter() {
    return MapRule.declare('looseFields', {
      channels: ['density'], cellSize: 192, smoothing: 1, skip: 4, decay: {},
    });
  },
  get enabled() { return ManualOverrides.get('mapRuleOn', 1) >= 0.5; },
  clear() { this.renter.grid.clear(); },
  mark(x, y, v = 1) { this.renter.grid.splat(x, y, 0, v); },
};

/** PLANE OCCUPANCY — which planes live where. THE PAINT LAW with OR-BLEND
 *  (the third blend after sum and max): cleared and repainted per live tick
 *  by BodyFields; each body ORs 1<<plane over its radius footprint.
 *  Float32 holds integers exactly to 2^24 → 24 planes, index clamped.
 *  NEVER smoothed and NEVER absorbed bilinearly — an interpolated bitmask
 *  is garbage. Read RAW: maskAt / hasPlane / otherPlanesAt. */
export const PlaneFields = {
  get renter() {
    return MapRule.declare('planeFields', {
      channels: ['mask'], cellSize: 192, smoothing: 0, skip: 4, decay: {},
    });
  },
  clear() { this.renter.grid.clear(); },

  /** OR the body's plane bit over its footprint cells (bbox of radius). */
  mark(x, y, radius, plane) {
    const g = this.renter.grid, d = g.data;
    const bit = 1 << Math.max(0, Math.min(23, plane | 0));
    const c0 = g.colOf(x - radius), c1 = g.colOf(x + radius);
    const r0 = g.rowOf(y - radius), r1 = g.rowOf(y + radius);
    for (let rr = r0; rr <= r1; rr++) {
      const base = rr * g.cols;                  // 1 channel → index == cell
      for (let cc = c0; cc <= c1; cc++) d[base + cc] = d[base + cc] | bit;
    }
  },

  /** The raw bitmask at world (x,y). 0 outside the span. */
  maskAt(x, y) {
    const g = this.renter.grid;
    if (!g.contains(x, y)) return 0;
    return g.data[g.rowOf(y) * g.cols + g.colOf(x)] | 0;
  },

  /** Is plane N present at (x,y)? */
  hasPlane(x, y, plane) {
    return (this.maskAt(x, y) & (1 << Math.max(0, Math.min(23, plane | 0)))) !== 0;
  },

  /** Any plane OTHER than mine at (x,y)? (merge-clearance sense) */
  otherPlanesAt(x, y, plane) {
    return (this.maskAt(x, y) & ~(1 << Math.max(0, Math.min(23, plane | 0)))) !== 0;
  },
};
