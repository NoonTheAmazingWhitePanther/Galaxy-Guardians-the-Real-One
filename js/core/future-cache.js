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
const HARD_CAP = 4096;   // raised from 1000 (2026-07-12, Noon: 1024 at least) — mirror AUTO_MAX in governor.js

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

// ── PACKED SNAPSHOTS (2026-07-12, Noon: the 1024-depth enabler) ────────────
// An object-clone snapshot costs ~3MB/tick at 160 planets (≈3GB at depth
// 1024) and ~29k allocations per ghost tick. Packed, a tick stores:
//   · desc[]  — one shallow body descriptor per body ({...b} minus the
//     particle/spring arrays) — Dormancy/TrajectoryPreview read cx/cy/mass/
//     radius off these exactly as before, and splice pushes into them.
//   · pdata   — Float64Array, 5 values per particle (x y vx vy heat).
//     Float64 ON PURPOSE: playback must be byte-for-byte what the ghost
//     computed. fx/fy are zeroed at tick start — never stored.
//   · pdead / sbrk — Uint8 per particle / per spring. Spring NUMBERS are
//     static for a spring's whole life (only `broken` evolves).
// ≈ 8× smaller, ~180 allocations per tick instead of ~29k.
//
// STRUCTURE GENERATIONS: particle/spring arrays never change length in a
// body's life; structure changes only when bodies are born/die (splits,
// merges, spawns). Each such tick stores a full-clone KEYFRAME instead of a
// packed entry; packed entries in between share the keyframe's structure.
// Playback of a packed tick pairs descriptors with the CURRENT live graph
// by id and writes the floats into the existing particle objects in place —
// zero allocation on the play path, and body/particle object identity stays
// stable across played ticks (kinder to selection + trails than the old
// adopt-a-new-graph-every-tick flow). Any pairing surprise bails to a cache
// miss + invalidate — live physics recomputes, never corrupts.
//
// THE WORKING SET: the ghost no longer clones the whole world every tick.
// One persistent graph (_ws) lives at the frontier and keeps stepping;
// each tick packs a snapshot of it. _ws is (re)seeded from LIVE state only,
// and only when null — and null ⟺ buffer empty (invalidate/wrap/reset all
// null it), so a stale working set can never extend a live frontier.
const PSTRIDE = 5;

export const FutureCache = {
  _buffer: new Map(),     // tickIndex -> entry (packed | keyframe | legacy clone)
  _frontierTick: 0,       // furthest tick index computed & cached (>= playhead, always)
  _playheadTick: 0,       // tick index currently live/displayed
  _hits: 0,               // running counters for the debug panel
  _misses: 0,

  _ws: null,              // persistent ghost working set (bodies/loose/asteroids/astTimer)
  _wsSig: null,           // structure signature: [{id, np, ns}] of _ws.bodies
  _wsGen: 0,              // structure generation of _ws
  _liveGen: -1,           // generation of the CURRENT live graph (for in-place playback)
  _genSeq: 0,             // generation id source
  _bytes: 0,              // approximate bytes held by the buffer (panel truth)

  get packed() { return ManualOverrides.get('cachePacked', 1) >= 0.5; },

  _sig(bodies) {
    const s = new Array(bodies.length);
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      s[i] = { id: b.id, np: b.particles.length, ns: b.springs.length };
    }
    return s;
  },
  _sigMatches(bodies) {
    const s = this._wsSig;
    if (!s || s.length !== bodies.length) return false;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i], e = s[i];
      if (b.id !== e.id || b.particles.length !== e.np || b.springs.length !== e.ns) return false;
    }
    return true;
  },

  _entryBytes(e) {
    if (e.kind === 'packed') {
      return e.pdata.byteLength + e.pdead.byteLength + e.sbrk.byteLength
        + e.bodies.length * 400 + e.loose.length * 200 + 512;
    }
    // keyframe / legacy clone — rough object-graph estimate
    let p = 0, sN = 0;
    for (const b of e.bodies) { p += b.particles ? b.particles.length : 0; sN += b.springs ? b.springs.length : 0; }
    return p * 180 + sN * 100 + e.bodies.length * 400 + e.loose.length * 200 + 512;
  },
  _store(tick, e) { this._buffer.set(tick, e); this._bytes += e._sz = this._entryBytes(e); },

  _packEntry(gen, events) {
    const bodies = this._ws.bodies;
    let tp = 0, ts = 0;
    for (let i = 0; i < bodies.length; i++) { tp += bodies[i].particles.length; ts += bodies[i].springs.length; }
    const desc = new Array(bodies.length);
    const pdata = new Float64Array(tp * PSTRIDE);
    const pdead = new Uint8Array(tp);
    const sbrk = new Uint8Array(ts);
    let pi = 0, di = 0, si = 0;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const d = { ...b };
      d.particles = null;                 // structure lives in the generation's keyframe
      d.springs = null;
      desc[i] = d;
      const ps = b.particles;
      for (let k = 0; k < ps.length; k++) {
        const p = ps[k];
        pdata[di]     = p.x;
        pdata[di + 1] = p.y;
        pdata[di + 2] = p.vx;
        pdata[di + 3] = p.vy;
        pdata[di + 4] = p.heat;
        di += PSTRIDE;
        pdead[pi++] = p.dead ? 1 : 0;
      }
      const ss = b.springs;
      for (let k = 0; k < ss.length; k++) sbrk[si++] = ss[k].broken ? 1 : 0;
    }
    return {
      kind: 'packed', gen,
      bodies: desc, pdata, pdead, sbrk,
      loose: cloneLoose(this._ws.loose),
      asteroids: cloneAsteroids(this._ws.asteroids),
      astTimer: this._ws.astTimer,
      events,
    };
  },

  // ── Invalidation ──────────────────────────────────────────────────────
  // Call whenever something outside the deterministic tick sequence
  // mutates bodies/loose/asteroids/gravity — the cached future is no
  // longer valid and must be thrown away. Cheap: it's just a Map + two
  // counters, there's no live-state cost to discarding it.
  invalidate() {
    this._buffer.clear();
    this._frontierTick = this._playheadTick;
    this._ws = null; this._wsSig = null;       // null ⟺ empty buffer — the invariant
    this._bytes = 0;
  },

  // Full reset — new session / game restart.
  reset() {
    this._buffer.clear();
    this._frontierTick = 0;
    this._playheadTick = 0;
    this._hits = 0;
    this._misses = 0;
    this._ws = null; this._wsSig = null;
    this._liveGen = -1;
    this._bytes = 0;
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
    this._ws = null; this._wsSig = null;
    this._bytes = 0;
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

    if (cached.kind === 'packed') {
      // ── materialize IN PLACE: floats into the existing live particle
      // objects, descriptors become the bodies with the arrays reattached.
      // Zero allocation; identity of particles/springs stays stable.
      if (!this._materialize(cached)) {
        // pairing surprise (live graph diverged from the cached generation)
        // → honest miss: throw the future away, live physics recomputes.
        this.invalidate();
        this._misses++;
        return false;
      }
    } else {
      // keyframe / legacy clone — adopt the frozen graph directly (its only
      // referent is this entry; nothing re-reads it after consumption).
      state.bodies = cached.bodies;
      this._liveGen = cached.gen ?? this._liveGen;
    }
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
    this._bytes -= cached._sz || 0;
    this._playheadTick = nextTick;
    this._hits++;
    this._wrapGuard();
    return true;
  },

  /** Write a packed entry into the current live graph. True on success;
   *  false on any pairing surprise (caller treats as a miss). */
  _materialize(e) {
    if (e.gen !== this._liveGen) return false;
    const live = state.bodies;
    const desc = e.bodies, pdata = e.pdata, pdead = e.pdead, sbrk = e.sbrk;
    let map = null;                                 // built only if index pairing slips
    let di = 0, pi = 0, si = 0;
    for (let i = 0; i < desc.length; i++) {
      const d = desc[i];
      if (d.particles) continue;                    // spliced ghost — already a full body
      let lb = live[i];
      if (!lb || lb.id !== d.id) {
        if (!map) { map = new Map(); for (let j = 0; j < live.length; j++) map.set(live[j].id, live[j]); }
        lb = map.get(d.id);
        if (!lb) return false;
      }
      d.particles = lb.particles;
      d.springs = lb.springs;
      const ps = lb.particles;
      for (let k = 0; k < ps.length; k++) {
        const p = ps[k];
        p.x    = pdata[di];
        p.y    = pdata[di + 1];
        p.vx   = pdata[di + 2];
        p.vy   = pdata[di + 3];
        p.heat = pdata[di + 4];
        di += PSTRIDE;
        p.dead = pdead[pi++] === 1;
        p.fx = 0; p.fy = 0;
      }
      const ss = lb.springs;
      for (let k = 0; k < ss.length; k++) ss[k].broken = sbrk[si++] === 1;
    }
    state.bodies = desc;                            // descriptors are now the bodies
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
  // Runs ONE tick of physics on an isolated graph — never the live state —
  // and stores the result. PACKED mode (default): one persistent working set
  // lives at the frontier and keeps stepping; each tick stores a packed
  // snapshot (typed arrays), with a full-clone keyframe only when structure
  // changes. Ghost-captured QueOps closures must hold ids/numbers, never
  // object refs (see the split op in tick.js) — the working set keeps
  // mutating after capture. LEGACY mode (cachePacked 0): the original
  // clone-per-tick flow, frozen graphs stored as-is.
  _shadowTick() {
    const packed = this.packed;
    let working;
    if (packed) {
      // ── THE WORKING SET: one persistent graph at the frontier ──
      if (!this._ws) {
        // null ⟺ empty buffer. If entries somehow exist without a working
        // set (knob flipped mid-flight), they extend a frontier we can no
        // longer step — drop them and restart from live.
        if (this.bufferedAhead > 0) this.invalidate();
        this._ws = {
          bodies:    cloneBodies(state.bodies),
          loose:     cloneLoose(state.loose),
          asteroids: cloneAsteroids(state.asteroids),
          astTimer:  state.astTimer,
        };
        this._wsSig = this._sig(this._ws.bodies);
        this._wsGen = ++this._genSeq;
        this._liveGen = this._wsGen;       // seeded from live → same structure
      }
      working = this._ws;
    } else {
      // ── legacy flow: clone per tick from the frontier entry ──
      const seed = this._buffer.get(this._frontierTick);
      const seedOk = seed && seed.kind !== 'packed';   // packed entries can't seed the legacy path
      working = seedOk
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
      if (seed && !seedOk) this.invalidate();          // mixed chain — restart clean
    }

    // ── swap live → ghost ──
    GravityField.ghostMode = true;   // predictions use the EXACT legacy loop, never the grid
    const liveBodies = state.bodies, liveLoose = state.loose, liveFlashes = state.flashes,
          liveAsteroids = state.asteroids, liveAstTimer = state.astTimer;

    state.bodies    = working.bodies;
    state.loose     = working.loose;
    state.flashes   = [];              // capture-only: anything pushed here is "born on this tick"
    state.asteroids = working.asteroids;
    state.astTimer  = working.astTimer;

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

    // capture the mutated result BEFORE restoring live. tickLoose/splits may
    // have REPLACED the arrays on state — carry the replacements back.
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
    if (this.packed && this._ws) {
      this._ws.bodies    = resultBodies;
      this._ws.loose     = resultLoose;
      this._ws.asteroids = resultAsteroids;
      this._ws.astTimer  = resultAstTimer;
      if (this._sigMatches(resultBodies)) {
        // same structure generation — the cheap, common tick
        this._store(this._frontierTick, this._packEntry(this._wsGen, events));
      } else {
        // structure changed (split / merge / body death) — KEYFRAME: one
        // full clone at the structural event, packed ticks resume after.
        this._wsSig = this._sig(resultBodies);
        this._wsGen = ++this._genSeq;
        this._store(this._frontierTick, {
          kind: 'key', gen: this._wsGen,
          bodies: cloneBodies(resultBodies),
          loose: cloneLoose(resultLoose),
          asteroids: cloneAsteroids(resultAsteroids),
          astTimer: resultAstTimer, events,
        });
      }
    } else {
      // legacy clone entry — frozen graph stored as-is (today's flow)
      this._store(this._frontierTick, {
        kind: 'key', gen: this._liveGen,
        bodies: resultBodies, loose: resultLoose, asteroids: resultAsteroids,
        astTimer: resultAstTimer, events,
      });
    }
  },

  // ── The conveyor (valved 1:1 pump) ──────────────────────────────────────
  // THE LAW (2026-07-11, Noon): one tick produced per tick consumed — every
  // logical tick computed exactly once. Depth is pure lookahead, never a
  // per-frame cost. At ×12 the conveyor moves 12 ticks: 12 out, 12 in.
  //
  // THE VALVE (post-6fps-spiral fix): 1:1 is a CEILING, not an obligation.
  // All ghost work — replacement and growth both — lives inside ONE ms
  // budget, and a tick that (by running cost estimate) won't fit is never
  // started. A replacement shortfall just drains the buffer: lookahead
  // shrinking is graceful, and a drained buffer degrades to plain live
  // grid physics at full fps — never a locked 6fps producing ghosts it
  // can't afford. Growth obeys the ×1 rule: at most ONE tick per frame
  // ("caching in the future just +1"), so a post-spawn rebuild replenishes
  // at exactly ×1 speed, one step ahead per frame, on top of replacement.
  _ghostMsEma: 0.5,   // running cost of one ghost tick (ms) — optimistic start:
                      // worst case is ONE over-budget tick at spawn, then the
                      // EMA blocks further ones until it decays enough to retry.

  _timedShadowTick() {
    const t0 = performance.now();
    this._shadowTick();
    this._ghostMsEma = this._ghostMsEma * 0.8 + (performance.now() - t0) * 0.2;
  },

  pump(consumed, msBudget, targetAhead) {
    // No planets yet — nothing to cache, and caching an empty world is exactly
    // what wipes the first plant. Do nothing until a body exists.
    if (!this.active) return 0;
    const cap = Math.min(HARD_CAP, targetAhead);
    const start = performance.now();
    // "Will one more tick fit?" — elapsed + estimated cost inside the budget,
    // AND the shared frame ledger still open. Checked BEFORE every tick, so
    // an expensive ghost tick is never started on a hunch.
    const fits = () =>
      (performance.now() - start) + this._ghostMsEma * 0.75 <= msBudget
      && QueOps.remaining() > 0;

    let steps = 0;

    // Replacement — the conveyor. Up to one produced per consumed (misses
    // excluded: a miss already paid live physics this frame; ghosting it too
    // is the double-pay this design kills). If the buffer sits ABOVE cap,
    // owed is 0 and consumption alone drains it down — no special case.
    let owe = Math.min(consumed, Math.max(0, cap - this.bufferedAhead));
    while (owe > 0 && fits()) { this._timedShadowTick(); steps++; owe--; }
    const starved = owe > 0;   // couldn't keep 1:1 → real pressure signal

    // Growth — the ×1 law: at most ONE step deeper per frame, spare-room only.
    if (this.bufferedAhead < cap && fits()) { this._timedShadowTick(); steps++; }

    // If ghost work is priced out entirely (EMA > budget), decay the estimate
    // slowly so caching re-tries once conditions improve (bodies died, scene
    // calmed) instead of staying priced out forever on a stale number.
    if (steps === 0 && this.bufferedAhead < cap) this._ghostMsEma *= 0.98;

    // Pressure for CacheGov AUTO: only a genuine replacement shortfall halves
    // the target. "Not full yet" is the normal state of a ×1 fill and must
    // never read as overload (that misread once collapsed 1000→1 every boot).
    CacheGov.reportFill(starved);
    return steps;
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
    // Under the persistent working set the frontier no longer re-seeds from
    // buffer entries — the splice must enter the working set itself or the
    // new body would never simulate in the future. Its own mutable copy;
    // the structure change triggers a keyframe on the next packed tick.
    if (this._ws && n > 0) {
      const g = makeGhostAt(this._frontierTick);
      if (g) {
        this._ws.bodies.push({
          ...g,
          particles: g.particles.map(p => ({ ...p })),
          springs: g.springs.map(s => ({ ...s })),
        });
      }
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
    if (this._ws) {
      const idx = this._ws.bodies.findIndex(b => b.id === ghostId);
      if (idx >= 0) { this._ws.bodies.splice(idx, 1); n++; }
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
      packed: this.packed ? 1 : 0,
      bufferMB: +(this._bytes / (1024 * 1024)).toFixed(1),
    };
  },
};
