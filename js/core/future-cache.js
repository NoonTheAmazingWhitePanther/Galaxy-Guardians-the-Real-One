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
 * frontier. Anything that does (spawning a planet, changing gravity,
 * clearing the field) MUST call invalidate() — see the call sites in
 * planet.js / in-ui.js / in-aims.js.
 */
import { state } from './state.js';
import { tickBodies, tickLoose } from '../modules/physics/tick.js';
import { AsteroidsModule } from '../modules/entities/asteroids.js';
import { QueOps } from './que-ops.js';
import { PhysicsCounter } from '../modules/debug/physics-counter.js';
import { MsProbe } from './ms-probe.js';
import { PhysicsGov } from '../modules/debug/governor.js';

// Hard ceiling regardless of panel target — a safety rail against runaway
// memory use on a low-end device, independent of whatever the user dials in.
const HARD_CAP = 480;

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

  // Peek — true if the next tick is already cached, without consuming it.
  // Lets the caller snapshot pre-tick state (for StateCache's interpolation
  // buffer) BEFORE playNext() swaps state.bodies/loose to the cached result.
  get hasNext() {
    return this._buffer.has(this._playheadTick + 1);
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
    return true;
  },

  // Call after a live (cache-miss) physicsTick() so the playhead counter
  // stays in sync with reality. Frontier can never trail behind playhead —
  // if caching hadn't started yet (frontier === old playhead), bump it up
  // to match; there's nothing cached to lose.
  recordLiveTick() {
    this._playheadTick++;
    if (this._frontierTick < this._playheadTick) {
      this._frontierTick = this._playheadTick;
    }
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
    MsProbe.call('physics.cacheTick', () => {
      tickBodies(step);
      tickLoose(step);
      AsteroidsModule.tick(step);
    });

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
    const cap = Math.min(HARD_CAP, targetAhead);
    const start = performance.now();
    let stepsDone = 0;
    while (this.bufferedAhead < cap && (performance.now() - start) < msBudget) {
      this._shadowTick();
      stepsDone++;
    }
    return stepsDone;
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
