/**
 * js/core/trajectory-preview.js
 * Prime Module: TrajectoryPreview — the orbit preview IS the Future Cache.
 *
 * THE OLD WAY (gone): a standalone toy integrator (predictOrbit) ran a
 * fictional 100-particle test body through a hand-rolled damped two-body
 * approximation, alone in an empty universe — no other planets, no burn
 * physics beyond a distance check, nothing to do with what would actually
 * happen. It was FAKE PHYSICS wearing a pretty line.
 *
 * THE NEW WAY: while the player holds to charge a planet, this module walks
 * the candidate forward through FutureCache's OWN already-cached future —
 * peekAt(tick) for every tick FutureCache has already computed for the REAL
 * world. Ghost-stepped ticks in this engine ALWAYS use the exact legacy
 * direct-sum gravity loop (GravityField.ghostMode forces it — see
 * gravity-field.js), never the grid approximation. So integrating the
 * candidate with that same direct-sum formula against those same cached
 * bodies isn't "inspired by" the real physics — it IS the real physics,
 * one tick early, missing only the new body's own pull on everyone else
 * (which doesn't exist yet to feel).
 *
 * "Enjoying more cache data, nothing is wasted": CacheGov's per-frame
 * topUp() extends FutureCache's frontier every frame regardless of whether
 * anyone is holding — this module spends nothing to make that happen, it
 * only ever consumes room that's already there. As the frontier grows, the
 * walk simply has further to go, automatically, for free.
 *
 * ON COMMIT (planet confirmed): spawnPlanet() no longer calls
 * FutureCache.invalidate(). Instead it hands the freshly-made body to
 * commit(), which splices the ALREADY-COMPUTED path directly into every
 * still-cached tick via FutureCache.spliceBodyIntoFuture() — the entire
 * pre-existing frontier for every other body survives untouched. The one
 * bounded approximation this buys: those already-cached ticks don't yet
 * feel the new body's pull on its neighbors. It self-heals the instant the
 * frontier advances past the splice point — the next _shadowTick() seeds
 * from a buffer entry that already contains the real body, so everything
 * computed from there on is the ordinary exact two-way simulation.
 *
 * ON FAILURE (nothing meaningful was ever walked — a brush stamp, or an
 * instant tap-release faster than one render frame): commit() falls back
 * to FutureCache.invalidate() itself, so correctness is NEVER sacrificed
 * for the optimization — the safe path is always available. cancel() is
 * the explicit rollback for a hold that turned into a brush stroke instead
 * of a classic spawn: nothing was ever committed, so it's normally a
 * cheap no-op, with FutureCache.unspliceBody() as the defensive net in
 * case a future code path ever spliced speculatively before confirming.
 */
import { config } from './config.js';
import { state, SUN } from './state.js';
import { FutureCache } from './future-cache.js';
import { PhysicsGov, ManualOverrides } from '../modules/debug/governor.js';
import { MsProbe } from './ms-probe.js';

const SOFT_SUN    = 500;   // matches applyGravity's sun-term softening exactly
const SOFT_PLANET = 300;   // matches applyGravity's legacy-loop softening exactly

export const TrajectoryPreview = {
  _live: false,
  _seed: null,             // {wx,wy,vx,vy,gravMult,radius,nP} — dedupe key + integration constants
  _path: new Map(),        // absolute tick index -> {cx,cy,vx,vy}
  _fromTick: 0,            // playhead tick this candidate was seeded at
  _lastWalked: 0,
  _burnsAt: null,
  _collidesAt: null,

  stats: {
    live: 0, pathTicks: 0, walked: 0, fromTick: 0, toTick: 0,
    burnsAt: -1, collidesAt: -1, splicedLast: 0, msWalk: 0, mode: 'IDLE',
  },

  get enabled() { return ManualOverrides.get('trajPreviewOn', 1) >= 0.5; },

  /**
   * Called every frame while holding, with the CURRENT candidate params.
   * Cheap dedupe (2px position, exact gravMult/particle-count match) — the
   * SAME rule the old getPreviewPath used, so charging in place keeps
   * building on the same path instead of restarting every frame.
   */
  beginIfChanged(wx, wy, vx, vy, gravMult, radius, nP) {
    const s = this._seed;
    const changed = !s
      || Math.abs(s.wx - wx) >= 2 || Math.abs(s.wy - wy) >= 2
      || s.gravMult !== gravMult || s.nP !== nP;
    if (!changed) return;

    this._seed = { wx, wy, vx, vy, gravMult, radius, nP };
    this._path.clear();
    const seedTick = FutureCache.playheadTick;
    this._path.set(seedTick, { cx: wx, cy: wy, vx, vy });
    this._fromTick = seedTick;
    this._lastWalked = seedTick;
    this._burnsAt = null;
    this._collidesAt = null;
    this._live = true;
  },

  /**
   * Walk forward through whatever of the future is ALREADY cached. Never
   * asks FutureCache to compute anything extra — only reads peekAt(), so
   * this is pure profit riding on work the game does anyway.
   */
  update(msBudget) {
    if (!this._live || !this.enabled || state.bodies.length === 0) return;
    const budget = msBudget != null ? msBudget : ManualOverrides.get('trajPreviewMsBudget', 1.5);
    const t0 = performance.now();
    const burnR2 = SUN.burnRadius * SUN.burnRadius;
    const G = config.GRAV_CONST;
    const substeps = config.SUBSTEPS;
    const dt = PhysicsGov.step / substeps;
    const seed = this._seed;

    let tick = this._lastWalked;
    let cur = this._path.get(tick);
    let walked = 0;

    while (tick < FutureCache.frontierTick) {
      if (performance.now() - t0 > budget) break;
      const next = tick + 1;
      const cached = FutureCache.peekAt(next);
      if (!cached) break;                 // frontier hasn't reached here THIS frame — resume next frame

      const others = cached.bodies;
      let px = cur.cx, py = cur.cy, vx = cur.vx, vy = cur.vy;
      let burnt = false;

      for (let sub = 0; sub < substeps; sub++) {
        const sdx = SUN.x - px, sdy = SUN.y - py;
        const sd2 = sdx * sdx + sdy * sdy;
        if (sd2 < burnR2) { this._burnsAt = next; burnt = true; break; }
        const sd = Math.sqrt(sd2) + 0.1;
        let ax = (sdx / sd) * (G * SUN.mass * seed.gravMult / ((sd2 + SOFT_SUN) * seed.nP));
        let ay = (sdy / sd) * (G * SUN.mass * seed.gravMult / ((sd2 + SOFT_SUN) * seed.nP));

        // The SAME legacy direct-sum loop every real ghost tick already
        // uses (ghostMode always takes this path, never the grid) — the
        // candidate is integrated with the exact formula its own real
        // future ticks will use the moment it exists.
        for (let bi = 0; bi < others.length; bi++) {
          const b = others[bi];
          const dx = b.cx - px, dy = b.cy - py;
          const d2 = dx * dx + dy * dy;
          if (d2 > b.mass * 10000) continue;           // same distance cull as the legacy loop
          const d = Math.sqrt(d2) + 0.1;
          const f = G * b.mass / ((d2 + SOFT_PLANET) * seed.nP);
          ax += (dx / d) * f;
          ay += (dy / d) * f;
          if (this._collidesAt == null && d2 < (b.radius + seed.radius) * (b.radius + seed.radius)) {
            this._collidesAt = next;
          }
        }

        vx = (vx + ax * dt) * config.DAMPING;
        vy = (vy + ay * dt) * config.DAMPING;
        px += vx * dt;
        py += vy * dt;
      }

      cur = { cx: px, cy: py, vx, vy };
      this._path.set(next, cur);
      tick = next;
      walked++;
      if (burnt) break;
    }

    this._lastWalked = tick;
    const ms = performance.now() - t0;
    this.stats.live = 1;
    this.stats.pathTicks = this._path.size;
    this.stats.walked = walked;
    this.stats.fromTick = this._fromTick;
    this.stats.toTick = this._lastWalked;
    this.stats.burnsAt = this._burnsAt != null ? this._burnsAt : -1;
    this.stats.collidesAt = this._collidesAt != null ? this._collidesAt : -1;
    this.stats.msWalk = +ms.toFixed(3);
    this.stats.mode = this._burnsAt != null ? 'BURNS' : (walked > 0 ? 'WALKING' : 'WAITING');
    MsProbe.record('physics.trajectory', ms);
  },

  /** Points for drawOrbitPreview — same {x,y} shape getPreviewPath used. */
  getPathPoints() {
    if (!this._live) return [];
    const keys = [...this._path.keys()].sort((a, b) => a - b);
    const out = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      const p = this._path.get(keys[i]);
      out[i] = { x: p.cx, y: p.cy };
    }
    return out;
  },

  /**
   * The planet is now real. Fold the already-computed path straight into
   * FutureCache's existing buffer — no invalidate(), nothing already built
   * is thrown away. Falls back to invalidate() itself whenever there's no
   * meaningfully-walked path to splice, so correctness never depends on
   * the caller having held long enough to preview.
   */
  commit(body) {
    if (!this._live || this._path.size < 2) {
      FutureCache.invalidate();
      this._reset();
      return;
    }
    const offsets = body.particles.map(p => ({
      dx: p.x - body.cx, dy: p.y - body.cy, mass: p.mass, pal: p.pal, isCore: p.isCore,
    }));
    const path = this._path;
    let seq = 0;
    const n = FutureCache.spliceBodyIntoFuture((tick) => {
      const pt = path.get(tick);
      if (!pt) return null;
      const particles = new Array(offsets.length);
      for (let i = 0; i < offsets.length; i++) {
        const o = offsets[i];
        particles[i] = {
          id: `${body.id}_g${seq++}`, x: pt.cx + o.dx, y: pt.cy + o.dy,
          vx: pt.vx, vy: pt.vy, fx: 0, fy: 0,
          mass: o.mass, pal: o.pal, isCore: o.isCore, body: null, dead: false, heat: 0,
        };
      }
      return {
        ...body,
        cx: pt.cx, cy: pt.cy, vx: pt.vx, vy: pt.vy,
        particles,
        springs: body.springs.map(s => ({ ...s })),
      };
    });
    this.stats.splicedLast = n;
    this._reset();
  },

  /**
   * A hold ended WITHOUT spawning this candidate (it became a brush stroke
   * instead). Nothing was ever written into FutureCache before commit(),
   * so this is normally just local cleanup — the unsplice call is the
   * defensive net: harmless when there's nothing to remove, correct when
   * there is.
   */
  cancel(bodyId) {
    if (bodyId != null) FutureCache.unspliceBody(bodyId);
    this._reset();
  },

  _reset() {
    this._live = false;
    this._seed = null;
    this._path.clear();
    this.stats.live = 0;
    this.stats.mode = 'IDLE';
  },
};
