/**
 * js/core/future-cache.js
 * FutureCache — pre-computes physics ticks AHEAD of the live playhead using
 * spare frame-time budget, then lets the live loop "play" them back instead
 * of recomputing. Like a video buffer: cache ahead, play, keep caching more
 * while playing — never lets the frontier fall behind or overlap itself.
 *
 * A played cached tick is NOT an approximation — it's byte-for-byte the same
 * result live computation would have produced, including the visual side
 * effects it triggers (collision flashes, ring spawns). Those are captured
 * at cache time and replayed at the moment the tick is actually shown, not
 * fired early during the silent pre-compute pass.
 *
 * Correctness depends on determinism: nothing outside the tick sequence
 * itself may mutate bodies/loose/asteroids between the playhead and the
 * frontier. Anything that does (changing gravity, clearing the field)
 * MUST call invalidate() — see the call sites in in-ui.js / in-aims.js.
 *
 * NEW PLANETS ARE THE ONE EXCEPTION: spawnPlanet() no longer invalidates.
 * TrajectoryPreview (js/core/trajectory-preview.js) precomputes the new
 * body's path through the ALREADY-cached future (see spliceBodyIntoFuture
 * below), so confirming a planet folds it into the existing buffer instead
 * of throwing the whole frontier away — nothing already built is wasted.
 */
import { state } from './state.js';
import { tickBodies, tickLoose } from '../modules/physics/tick.js';
import { GravityField } from '../modules/physics/gravity-field.js';
import { AsteroidsModule } from '../modules/entities/asteroids.js';
import { QueOps } from './que-ops.js';
import { PhysicsCounter } from '../modules/debug/physics-counter.js';
import { MsProbe } from './ms-probe.js';
import { PhysicsGov, CacheGov, ManualOverrides } from '../modules/debug/governor.js';
import { config } from './config.js';

// Hard ceiling regardless of panel target — a safety rail against runaway
// memory use, independent of whatever the user dials in. Raised to 1000 for
// higher-end targets; the AUTO controller (CacheGov) still ranges 1..1000
// on its own, so this only bites a manual over-dial.
const HARD_CAP = 1000;

// Fail-safe ceiling for the tick counters. playhead/frontier are otherwise
// monotonic and grow forever over a long session; hits/misses too. When the
// playhead crosses this we rebase everything back to 0 (buffer thrown away —
// it's rebuildable and cheap; live state is never touched). Keeps every
// number on the CACHE panel bounded. NOT a correctness mechanism, just a
// known, deliberate reset — bufferedAhead stays 0 right after a wrap.
const WRAP_MAX = 100000;

function cloneBodies(bodies) {
  const out = new Array(bodies.length);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    out[i] = {
      ...b,
      particles: b.particles.map(p => ({ ...p })),
      springs: b.springs.map(s => ({ ...s })),
    };
  }
  return out;
}
function cloneLoose(loose) {
  return loose.map(p => ({ ...p }));
}
function cloneAsteroids(asteroids) {
  return asteroids.map(a => ({ ...a }));
}

export const FutureCache = {
  _buffer: new Map(),     // tickIndex -> { bodies, loose, asteroids, astTimer, events }
  _frontierTick: 0,       // furthest tick index computed & cached (>= playhead, always)
  _playheadTick: 0,       // tick index currently live/displayed
  _hits: 0,               // running counters for the debug panel
  _misses: 0,

  // ── Invalidation ──────────────────────────────────────────────────────
  // Call whenever something outside the deterministic tick sequence
  // mutates bodies/loose/asteroids/gravity — the cached future is no
  // longer valid and must be thrown away. Cheap: it's just a Map + two
  // counters, there's no live-state cost to discarding it.
  invalidate() {
    this._buffer.clear();
    this._frontierTick = this._playheadTick;
  },

  // Full reset — new session / game restart.
  reset() {
    this._buffer.clear();
    this._frontierTick = 0;
    this._playheadTick = 0;
    this._hits = 0;
    this._misses = 0;
  },

  get bufferedAhead() {
    return this._frontierTick - this._playheadTick;
  },

  // Public read-only ticks — TrajectoryPreview rides these to know how far
  // ahead it may walk (frontier) and what's already been shown (playhead),
  // without reaching into the underscored internals directly.
  get playheadTick() { return this._playheadTick; },
  get frontierTick()  { return this._frontierTick; },

  // ── Read-only window accessors (for the dormancy classifier) ─────────────
  // The un-consumed future currently sitting in the buffer is exactly ticks
  // (playhead, frontier]. peekAt() hands back a cached snapshot WITHOUT
  // consuming it — the classifier only ever reads cx/cy, never mutates.
  get bufferedRange() {
    return { from: this._playheadTick + 1, to: this._frontierTick };
  },
  peekAt(tick) {
    return this._buffer.get(tick) || null;
  },

  // Planet-gate. Nothing is cached, played back, or counted until at least
  // one body exists. On an empty field the shadow sim would cache empty-world
  // ticks, and the first plant would get wiped the instant playNext() does
  // state.bodies = cached.bodies (stale empty snapshot). Gating on this makes
  // that whole failure class impossible: no bodies → no future to clobber.
  get active() {
    return state.bodies.length > 0;
  },

  // ── Rebase fail-safe ────────────────────────────────────────────────────
  // Once the playhead crosses WRAP_MAX, drop the (rebuildable) buffer and zero
  // every counter. Live state.bodies/loose/asteroids are deliberately NOT
  // touched — the sim carries on seamlessly; only the bookkeeping resets.
  _wrapGuard() {
    if (this._playheadTick < WRAP_MAX) return;
    this._buffer.clear();
    this._playheadTick = 0;
    this._frontierTick = 0;
    this._hits   = 0;
    this._misses = 0;
  },

  // Peek — true if the next tick is already cached, without consuming it.
  // Lets the caller snapshot pre-tick state (for StateCache's interpolation
  // buffer) BEFORE playNext() swaps state.bodies/loose to the cached result.
  // Also gated on active(): on an empty field the buffer is always empty, but
  // this makes the intent explicit and never plays back into a bodiless field.
  get hasNext() {
    return this.active && this._buffer.has(this._playheadTick + 1);
  },

  get hitRateLabel() {
    const total = this._hits + this._misses;
    if (total === 0) return '—';
    return `${Math.round((this._hits / total) * 100)}%`;
  },

  get hitsMissesLabel() {
    return `${this._hits} / ${this._misses}`;
  },

  // ── Playback ──────────────────────────────────────────────────────────
  // Try to consume the next tick from cache. Returns true on a hit (state
  // applied, essentially free) or false on a miss (caller must run a live
  // physicsTick() instead). Either way the playhead advances — see
  // recordLiveTick() for the miss side of that.
  playNext() {
    const nextTick = this._playheadTick + 1;
    const cached = this._buffer.get(nextTick);
    if (!cached) {
      this._misses++;
      return false;
    }

    state.bodies    = cached.bodies;
    state.loose     = cached.loose;
    state.asteroids = cached.asteroids;
    state.astTimer  = cached.astTimer;

    // Replay side effects NOW — at the moment this tick is actually shown,
    // not back when it was silently pre-computed.
    if (cached.events.flashes.length) {
      for (let i = 0; i < cached.events.flashes.length; i++) {
        state.flashes.push(cached.events.flashes[i]);
      }
    }
    if (cached.events.queueOps.length) {
      for (let i = 0; i < cached.events.queueOps.length; i++) {
        QueOps.add(cached.events.queueOps[i]);
      }
    }

    this._buffer.delete(nextTick);
    this._playheadTick = nextTick;
    this._hits++;
    this._wrapGuard();
    return true;
  },

  // Call after a live (cache-miss) physicsTick() so the playhead counter
  // stays in sync with reality. Frontier can never trail behind playhead —
  // if caching hadn't started yet (frontier === old playhead), bump it up
  // to match; there's nothing cached to lose.
  recordLiveTick() {
    // No planets yet — don't count frames. Playhead only starts moving once
    // there's actually something being simulated.
    if (!this.active) return;
    this._playheadTick++;
    if (this._frontierTick < this._playheadTick) {
      this._frontierTick = this._playheadTick;
    }
    this._wrapGuard();
  },

  // ── Cache-ahead (the ghost simulation) ──────────────────────────────────
  // Runs ONE tick worth of physics on an isolated clone — never the live
  // state — and stores the result. Each tick gets a freshly-cloned working
  // copy (seeded from the previous tick's stored result, or live state at
  // the very frontier) which is mutated exactly once and then stored as-is.
  // This is what makes it safe for QueOps closures captured during the
  // tick to hold direct references into that object graph: nothing will
  // ever mutate it again after this function returns.
  _shadowTick() {
    const seed = this._buffer.get(this._frontierTick);
    // If a seed exists in the buffer, it's already an isolated clone from
    // when IT was computed (frozen, nothing has touched it since) — safe
    // to clone once from it. Otherwise seed fresh from live state, since
    // frontier === playhead means nothing's cached yet.
    const freshWorking = seed
      ? {
          bodies:    cloneBodies(seed.bodies),
          loose:     cloneLoose(seed.loose),
          asteroids: cloneAsteroids(seed.asteroids),
          astTimer:  seed.astTimer,
        }
      : {
          bodies:    cloneBodies(state.bodies),
          loose:     cloneLoose(state.loose),
          asteroids: cloneAsteroids(state.asteroids),
          astTimer:  state.astTimer,
        };

    // ── swap live → ghost ──
    GravityField.ghostMode = true;   // predictions use the EXACT legacy loop, never the grid
    const liveBodies = state.bodies, liveLoose = state.loose, liveFlashes = state.flashes,
          liveAsteroids = state.asteroids, liveAstTimer = state.astTimer;

    state.bodies    = freshWorking.bodies;
    state.loose     = freshWorking.loose;
    state.flashes   = [];              // capture-only: anything pushed here is "born on this tick"
    state.asteroids = freshWorking.asteroids;
    state.astTimer  = freshWorking.astTimer;

    const queueCapture = [];
    QueOps.beginGhostCapture(queueCapture);

    const savedCounters = { ...PhysicsCounter.stats }; // don't let ghost work pollute live debug counters

    const step = PhysicsGov.step;
    // ── Dirty-future resolution ──────────────────────────────────────────
    // Optionally run the ghost sim at FEWER substeps than live. 0 = exact:
    // the cached future is byte-for-byte what live would produce, so playback
    // stays perfect. >0 forces that substep count for the pre-compute only —
    // cheaper to cache, at the cost of the future (and thus played-back state)
    // becoming an approximation. That's the "_dirty" premise: drop the future's
    // resolution and it still responds about the same. Saved/restored around
    // this one synchronous call so live ticks are never affected.
    const dirt = ManualOverrides.get('cacheDirtySubsteps', 0);
    const savedSubsteps = config.SUBSTEPS;
    if (dirt > 0) config.SUBSTEPS = Math.max(1, Math.round(dirt));
    MsProbe.call('physics.cacheTick', () => {
      tickBodies(step);
      tickLoose(step);
      AsteroidsModule.tick(step);
    });
    config.SUBSTEPS = savedSubsteps;

    PhysicsCounter.stats = savedCounters;
    QueOps.endGhostCapture();

    const events = { flashes: state.flashes, queueOps: queueCapture };

    // capture the mutated result BEFORE restoring live — this object graph
    // is now frozen: nothing will touch it again, safe to store as-is.
    const resultBodies    = state.bodies;
    const resultLoose     = state.loose;
    const resultAsteroids = state.asteroids;
    const resultAstTimer  = state.astTimer;

    // ── swap ghost → live ──
    GravityField.ghostMode = false;
    state.bodies    = liveBodies;
    state.loose     = liveLoose;
    state.flashes   = liveFlashes;
    state.asteroids = liveAsteroids;
    state.astTimer  = liveAstTimer;

    this._frontierTick++;
    this._buffer.set(this._frontierTick, {
      bodies: resultBodies, loose: resultLoose, asteroids: resultAsteroids,
      astTimer: resultAstTimer, events,
    });
  },

  // ── Adaptive top-up ─────────────────────────────────────────────────────
  // Called once per frame with whatever spare time budget CacheGov decides
  // to allow. Caches anywhere from 0 to HARD_CAP steps ahead depending on
  // how much of that budget is actually available RIGHT NOW — this is what
  // makes "sometimes 1, sometimes 100" happen automatically: it just keeps
  // computing ticks until it runs out of either time or room, whichever
  // comes first, every frame.
  topUp(msBudget, targetAhead) {
    // No planets yet — nothing to cache, and caching an empty world is exactly
    // what wipes the first plant. Do nothing until a body exists.
    if (!this.active) return 0;
    const cap = Math.min(HARD_CAP, targetAhead);
    const start = performance.now();
    let stepsDone = 0;
    while (this.bufferedAhead < cap && (performance.now() - start) < msBudget) {
      this._shadowTick();
      stepsDone++;
    }
    // Fill-pressure signal for the AUTO controller: if we couldn't reach the
    // cap, we ran out of time this frame (overloaded) — else we kept up with
    // room to spare. CacheGov uses this to walk its AUTO target between 1 and
    // 1000 all by itself. (No-op when CacheGov is in MANUAL mode.)
    CacheGov.reportFill(this.bufferedAhead < cap);
    return stepsDone;
  },

  // ── Candidate splice — the orbit preview IS the Future Cache ────────────
  // TrajectoryPreview walks the ALREADY-cached future (peekAt) to draw the
  // orbit line for freehand review, spending zero extra simulation on the
  // rest of the world. When the planet is actually confirmed, this method
  // folds that same precomputed path directly into the existing buffer —
  // NO invalidate(), no thrown-away frontier. Every tick still cached
  // (playhead, frontier] gets the new body pushed onto its `bodies` array,
  // reconstructed from `pathAt(tick)` via the caller-supplied factory.
  //
  // Honesty note: the OTHER bodies at those already-cached ticks do not yet
  // feel this body's pull (they were computed before it existed) — that is
  // the one bounded approximation this buys. It self-heals the instant the
  // frontier advances past the splice point: the next _shadowTick() seeds
  // from a buffer entry that already contains the real body, so every tick
  // computed from there on is the ordinary exact simulation, gravity and
  // collisions both ways, same as if the body had always been there.
  //
  // Returns the number of ticks actually patched (0 if none were still
  // cached — e.g. the hold ran longer than the whole buffered window).
  spliceBodyIntoFuture(makeGhostAt) {
    let n = 0;
    for (let tick = this._playheadTick + 1; tick <= this._frontierTick; tick++) {
      const cached = this._buffer.get(tick);
      if (!cached) continue;
      const ghost = makeGhostAt(tick);
      if (!ghost) continue;
      cached.bodies.push(ghost);
      n++;
    }
    return n;
  },

  // Rollback for spliceBodyIntoFuture — strips every body with the given id
  // out of every still-cached tick. Used when a spliced candidate turns out
  // not to have been a real planet after all (init failure after splice, or
  // any other reason the commit must be undone). Cheap: a single pass over
  // whatever's left in the buffer, most of which won't contain the id.
  unspliceBody(ghostId) {
    if (ghostId == null) return 0;
    let n = 0;
    for (const cached of this._buffer.values()) {
      const bodies = cached.bodies;
      const idx = bodies.findIndex(b => b.id === ghostId);
      if (idx >= 0) { bodies.splice(idx, 1); n++; }
    }
    return n;
  },

  get debugInfo() {
    return {
      playhead: this._playheadTick,
      frontier: this._frontierTick,
      ahead: this.bufferedAhead,
      hitRate: this.hitRateLabel,
      hitsMisses: this.hitsMissesLabel,
      hits: this._hits,
      misses: this._misses,
    };
  },
};
