/**
 * js/modules/debug/benchmark.js
 * BEST PREFERENCES — device benchmark + persistence. (Rebuilt 2026-07-13.)
 *
 * THE SHAPE OF A RUN
 *   Sessions climb the planet ladder: 10 → 20 → 30 → … → 1000 (the 1000
 *   rule — 1000 planets is the ceiling and the score scale). Every planet
 *   spawns INSIDE THE SCREEN no matter the zoom (camera world-rect), so the
 *   benchmark always stresses what the player actually sees.
 *
 * WHAT A SESSION PERFECTS
 *   The four machines: QueOps, FutureCache, Dormancy, and the pixel maps
 *   (Map Rule + gravity grid). Each machine exposes its time / delay /
 *   amount / size knobs. Per knob the session:
 *     1. measures the AUTO base (the Automatics),
 *     2. sweeps the knob's ladder MANUALLY (the Manuals), reading fps +
 *        virtual cycles (the Rates) and the delta vs base (the Changes),
 *     3. RETURNS TO BASE (knob back to AUTO) before touching the next knob —
 *        every sweep is isolated, nothing stacks.
 *   Then the per-knob winners are composed, measured together, and the
 *   session verdict is MANUAL vs AUTO — whichever actually holds more frames.
 *
 * TIME LIMITS (the modes)
 *   WAKEUP      1 minute  — the pulse check.
 *   MODERATION  3 minutes — the working physical.
 *   FULL        5 minutes — the complete inspection.
 *   The deadline governs: a run climbs sessions until the clock, the fps
 *   floor, or the 1000 ceiling stops it. Cut short, never started mid-ladder.
 *
 * PURE FRAMES LAW (locked): the ENTIRE run measures at skip = 0. Frame
 * skipping is the last resort of live play, never of measurement.
 *
 * SCORE — the 1000 rule made literal: score = the heaviest session (planet
 * count) that still held the target frame rate. 320/1000 means 320 planets
 * held; 1000/1000 is the finish line.
 *
 * Version check without a version number: the variable-count signature
 * (count of user-changeable governor knobs). Match = same engine shape.
 */

import { ManualOverrides, ScreenGov, RenderGov } from './governor.js';
import { GovernorProfiles } from './governor-profiles.js';
import { state, SUN, sunGravMult, PALS } from '../../core/state.js';
import { config } from '../../core/config.js';
import { makeBody } from '../physics/creation.js';
import { hypot, clamp } from '../../core/math.js';
import { FutureCache } from '../../core/future-cache.js';
import { CameraModule } from '../camera/camera.module.js';
import { DebugRouter } from './debug-router.js';

const STORAGE_KEY = 'gg_best_prefs';
const FILE_URL    = 'best-preferences.json';

// ── The session ladder — the 1000 rule ────────────────────────────────────
// 10-planet steps to the 1000 ceiling. Every rung is a session.
const TIERS = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);

// ── The modes — time limits own the run ──────────────────────────────────
const MODES = {
  WAKEUP:     { label: 'Wakeup',     seconds: 60  },
  MODERATION: { label: 'Moderation', seconds: 180 },
  FULL:       { label: 'Full',       seconds: 300 },
};

// THE MARCH: 20 seconds per session, then the next rung — 10 done, 20 done,
// 30 done… A session sweeps as much as fits in its 20s (core knob order
// rotates per session so every knob gets its day), wraps its verdict, and
// the ladder moves. The last stretch is reserved for the verdict measure.
const SESSION_MS      = 20000;
const VERDICT_RESERVE = 1800;

// Target real frame rate, derived from the DETECTED refresh (ScreenGov):
// stable max refresh of the current screen × tolerance, never a hardcoded 60.
const TARGET_RATIO = 0.92;
const TARGET_FPS = () => Math.round(ScreenGov.hz * TARGET_RATIO);

// Leanest sweep value still below this → the device is saturated; stop.
const FLOOR_FPS = 6;

// Live-memory ceiling: stop spawning a session once total particles cross it.
const MAX_LIVE_PARTICLES = 45000;

// Pure Frames Law keys — pinned 0 for the whole run, excluded from rotation.
const SKIP_KEYS_LIST = ['renderFrameSkip', 'physicsFrameSkip'];

// ── THE SUBJECTS — the four machines and their knobs ─────────────────────
// Ladders ordered LEAN → RICH. Every knob here is a real ManualOverrides
// path consumed by its machine; reset(key) hands it back to the governor.
const SUBJECTS = [
  { name: 'queops', knobs: [
    { key: 'queOpsBudget',     values: [64, 128, 256, 512, 1024] },  // amount (ops/frame)
    { key: 'queOpsDelay',      values: [0.5, 0.2, 0.1, 0.05] },      // delay (s)
  ]},
  { name: 'cache', knobs: [
    { key: 'cacheMsBudget',    values: [1, 1.5, 2, 2.5, 3] },        // time (ms/frame)
    { key: 'cacheTargetAhead', values: [60, 250, 512, 1024] },       // amount (steps)
  ]},
  { name: 'dormancy', knobs: [
    { key: 'dormancyCoastK',   values: [8, 6, 4, 2, 1] },            // rate (1 real step per K)
    { key: 'dormancyHorizon',  values: [30, 60, 120, 240] },         // amount (ticks scanned)
  ]},
  { name: 'fields', knobs: [
    { key: 'mapRuleRes',       values: [0.25, 0.5, 1, 2] },          // size (lattice res ×)
    { key: 'mapRuleSkip',      values: [8, 4, 2, 1] },               // delay (ticks/smooth)
    { key: 'gravGridBudget',   values: [128, 256, 512, 1024] },      // amount (cells/frame)
  ]},
];
const ALL_KNOBS = SUBJECTS.flatMap(s => s.knobs);
const CORE_KEYS = new Set(ALL_KNOBS.map(k => k.key));

// ── THE COVERAGE LEDGER — the cycling manual-configuration list ──────────
// The four machines above are the CORE: manual + default, needed inside the
// benchmark EVERY TIME, they stay. Everything else that shapes the physical
// and graphical cores rotates through over runs: each run tests the knobs
// the ledger says were forgotten longest (never-tested first), marks them
// covered, and writes the list back into best-preferences so the NEXT run
// picks up where this one left off. Not just QA — physical and graphical
// coherence and harmony: every governor hand gets its day on the bench.
//
// EXCLUDED — panel settings and configuration are NOT the simulation:
//   ps* (panel look) · panelGridSize · brush* (planting tool config) ·
//   guiGov* (interface governor) · selectionPanSpeed · overlays/witness
//   draws (gravGridOverlay, dormancyTween*) · test triggers (novaTest) ·
//   the skip keys (owned by the Pure Frames Law) · the CORE keys (already
//   swept every session). Sentinel-valued knobs (negative defaults like
//   novaShowPlane -1 = "all") are skipped — a generic ladder around a
//   sentinel is noise, not a test.
const ROTATION_EXCLUDE_PREFIX = ['ps', 'brush', 'guiGov'];
const ROTATION_EXCLUDE_KEYS = new Set([
  'panelGridSize', 'selectionPanSpeed',
  'gravGridOverlay', 'dormancyTween', 'dormancyTweenLock',
  'novaTest',
  // Skip machinery — the Pure Frames Law's domain; with skips pinned 0 for
  // the whole run, sweeping their bases measures nothing.
  'physicsSkipBase', 'renderSkipBase', 'inputFrameSkip', 'inputSkipBase',
  // The 1000 law itself — a LAW, not a knob to perfect.
  'cycleTarget',
  // The Render Pulse heartbeat — time authority; sweeping it mid-benchmark
  // changes what "fps" even means.
  'pulseHz',
  ...SKIP_KEYS_LIST,
]);
const ROTATION_PER_SESSION = 3;   // forgotten knobs tested per session

// Generic ladder around a knob's current base value: toggles get [0,1],
// numbers get half / base / double. LEAN→RICH ordering isn't knowable
// generically — the sweep is isolated and returns to base, so order is
// only cosmetic here; best-by-fps still decides.
function _autoLadder(v) {
  if (v === 0 || v === 1) return [0, 1];
  if (Number.isInteger(v)) return [...new Set([Math.max(1, Math.round(v / 2)), v, v * 2])];
  return [...new Set([+(v / 2).toFixed(3), v, +(v * 2).toFixed(3)])];
}
// Shared with the AutoTuner — the SAME system turns the knobs live.
export const autoLadder = _autoLadder;

// Pure Frames Law — pinned 0 for the whole run, released after.
// (Declared as SKIP_KEYS_LIST before the ledger block that excludes them.)
const SKIP_KEYS = SKIP_KEYS_LIST;

// ── frame stepping helpers ────────────────────────────────────────────────
const _raf = () => new Promise(res => requestAnimationFrame(() => res()));
async function _waitFrames(n) { for (let i = 0; i < n; i++) await _raf(); }

export const Benchmark = {
  running:  false,
  status:   'idle',
  progress: 0,          // 0..1 — time elapsed over the mode's budget
  lastResults: null,    // per-session measurements from the most recent run
  lastPrefs:   null,    // full prefs object from load or last run
  _onStatus: null,      // optional UI callback(status, progress)
  _deadline: 0,
  _stopRequested: false,

  // 🔴 STOP — the red button's hand. The run aborts at the next checkpoint,
  // saves NOTHING, and leaves the screen a clean slate (new clean planets).
  stop() { if (this.running) this._stopRequested = true; },

  // A checkpoint is cut by the deadline OR the red button.
  _cut() { return this._stopRequested || this._timeLeft() <= 0; },

  // "Benchmarking... 🔴 Stop." — plain text above the bottom bar. No animation.
  _liveStrip(on) {
    try { document.getElementById('bench-live')?.classList.toggle('on', !!on); } catch (_) {}
  },

  // ── Variable-count signature ──────────────────────────────────────────
  signature() {
    let n = 0;
    for (const key of Object.keys(ManualOverrides)) {
      const desc = Object.getOwnPropertyDescriptor(ManualOverrides, key);
      if (!desc || typeof desc.get === 'function') continue;
      const entry = desc.value;
      if (entry && typeof entry === 'object' && typeof entry.isManual === 'boolean') n++;
    }
    return n;
  },

  _setStatus(status, progress = this.progress) {
    this.status = status;
    this.progress = progress;
    try { this._onStatus?.(status, progress); } catch (_) {}
  },

  _timeLeft()  { return Math.max(0, this._deadline - performance.now()); },
  _timeText()  {
    const s = Math.ceil(this._timeLeft() / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },

  // ── Persistence ─────────────────────────────────────────────────────────
  async load() {
    const sig = this.signature();
    try {
      const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.signature === sig && data.base) {
          this._applyPreferences(data);
          this.lastResults = data.sessions ?? null;
          this.lastPrefs = data;
          this._setStatus('loaded (cache)');
          console.log('[Benchmark] best preferences loaded from cache');
          return true;
        }
      }
    } catch (e) { console.warn('[Benchmark] cache load failed', e); }

    try {
      const res = await fetch(FILE_URL, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.signature === sig && data.base) {
          this._applyPreferences(data);
          this.lastResults = data.sessions ?? null;
          this.lastPrefs = data;
          this._setStatus('loaded (file)');
          console.log('[Benchmark] best preferences loaded from', FILE_URL);
          return true;
        }
        console.log(`[Benchmark] ${FILE_URL} signature ${data?.signature} ≠ engine ${sig} — using Base`);
      }
    } catch (_) { /* no file — expected on fresh installs */ }

    this._fallbackToBase();
    this._setStatus('base (no saved prefs)');
    return false;
  },

  _fallbackToBase() {
    GovernorProfiles.applyProfile('BALANCE');
    console.log('[Benchmark] fell back to Base (BALANCE) profile');
  },

  // Apply a preferences object: base holds only the knobs where MANUAL beat
  // AUTO in the heaviest session — everything absent stays the governor's.
  _applyPreferences(data) {
    const base = data.base || {};
    for (const [key, value] of Object.entries(base)) {
      if (ManualOverrides[key] && typeof ManualOverrides[key] === 'object') {
        ManualOverrides.set(key, value);
      }
    }
    GovernorProfiles.setBase?.(base);
  },

  _buildPreferences(sessions, mode) {
    // Base = the heaviest completed session where MANUAL won its verdict;
    // AUTO victories leave the governor in charge (empty base entry).
    let base = {};
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i];
      if (s.winner === 'manual' && s.settings) { base = { ...s.settings }; break; }
    }
    return {
      generated:  new Date().toISOString(),
      signature:  this.signature(),
      idealCycle: 1000,               // the 1000 law (cycles), for reference
      maxPlanets: 1000,               // the 1000 rule (this ladder's ceiling)
      mode,
      targetFps:  TARGET_FPS(),
      base,
      sessions,
    };
  },

  save(prefs) {
    const json = JSON.stringify(prefs, null, 2);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, json);
    } catch (e) { console.warn('[Benchmark] cache save failed', e); }
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = FILE_URL;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { console.warn('[Benchmark] file export failed', e); }
  },

  // ── Scene control ───────────────────────────────────────────────────────
  _clearBodies() {
    state.bodies = [];
    state.loose  = [];
    state.flashes = [];
    try { FutureCache.invalidate(); } catch (_) {}
  },

  // The visible world rectangle — screenToWorld over the canvas corners.
  // Zoom is inherent to the transform: whatever the camera shows IS the rect.
  _viewRect() {
    const C = CameraModule;
    const a = C.screenToWorld(0, 0);
    const b = C.screenToWorld(C.width || 0, C.height || 0);
    return {
      minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
    };
  },

  // Spawn up to `n` bodies, EVERY ONE inside the screen no matter the zoom.
  // Radius-inset so the whole blob is born visible; orbital velocity around
  // the Sun preserved so the scene lives, not just sits. Stops early at the
  // particle ceiling; returns the body count reached.
  _spawnTo(n) {
    const rect = this._viewRect();
    let particles = 0;
    for (const b of state.bodies) particles += b?.particles?.length || 0;
    while (state.bodies.length < n) {
      if (particles >= MAX_LIVE_PARTICLES) break;
      const radius = clamp(10 + Math.random() * 30, 16, 110);
      const spanX = Math.max(1, (rect.maxX - rect.minX) - radius * 2);
      const spanY = Math.max(1, (rect.maxY - rect.minY) - radius * 2);
      const x = rect.minX + radius + Math.random() * spanX;
      const y = rect.minY + radius + Math.random() * spanY;
      const pal = PALS[Math.floor(Math.random() * PALS.length)];
      const body = makeBody(x, y, radius, pal);
      body.gravMult = sunGravMult;
      const nP = body.particles.length;
      const d  = hypot(x - SUN.x, y - SUN.y) || 1;
      const v  = Math.sqrt(config.GRAV_CONST * SUN.mass * sunGravMult / Math.max(nP, 1) / Math.max(d, 1));
      const vx = -(y - SUN.y) / d * v;
      const vy =  (x - SUN.x) / d * v;
      for (const p of body.particles) { p.vx = vx; p.vy = vy; }
      state.bodies.push(body);
      particles += nP;
    }
    try { FutureCache.invalidate(); } catch (_) {}
    return state.bodies.length;
  },

  // Direct wall-clock measurement — TIME-boxed, not frame-boxed: at low fps
  // a frame-counted window stretches to eternity and eats the whole session.
  // Warm ~120ms, then count whatever frames land inside ~380ms. Fully
  // isolated to the current config (the contamination fix stays).
  async _measure(warmMs = 120, sampleMs = 380) {
    const w0 = performance.now();
    while (performance.now() - w0 < warmMs) await _raf();
    const t0 = performance.now();
    let frames = 0, t1 = t0;
    do { await _raf(); frames++; t1 = performance.now(); } while (t1 - t0 < sampleMs);
    const real = frames * 1000 / Math.max(1, t1 - t0);
    const base = RenderGov.BASE, skip = RenderGov.frameSkip;
    const virtual = real * base / Math.max(1, base - skip);
    return { fps: +real.toFixed(1), virtual: +virtual.toFixed(1) };
  },

  // ── The rotation ledger ─────────────────────────────────────────────────
  // Every eligible governor knob outside the core: real data entries, not
  // panel/config, not sentinels. This IS "the list" — enumerated live from
  // the engine, so new knobs join the rotation the day they're born.
  _eligibleRotationKeys() {
    const keys = [];
    for (const key of Object.keys(ManualOverrides)) {
      const desc = Object.getOwnPropertyDescriptor(ManualOverrides, key);
      if (!desc || typeof desc.get === 'function') continue;
      const entry = desc.value;
      if (!entry || typeof entry !== 'object' || typeof entry.isManual !== 'boolean') continue;
      if (CORE_KEYS.has(key) || ROTATION_EXCLUDE_KEYS.has(key)) continue;
      if (ROTATION_EXCLUDE_PREFIX.some(p => key.startsWith(p))) continue;
      if (typeof entry.value !== 'number' || entry.value < 0) continue;  // sentinel guard
      keys.push(key);
    }
    return keys;
  },

  // The full tunable space — core + rotation. The AutoTuner draws from this
  // so live tuning and benchmarking are ONE system with two clocks.
  tunableKeys() {
    return [...CORE_KEYS, ...this._eligibleRotationKeys()];
  },

  // Queue = forgotten-first: never-tested knobs lead, then oldest coverage.
  // Read from the saved ledger (coverage: key → run number last tested).
  _rotationQueue() {
    const cov = this.lastPrefs?.coverage || {};
    return this._eligibleRotationKeys()
      .sort((a, b) => (cov[a] ?? -1) - (cov[b] ?? -1))
      .map(key => ({
        key,
        values: _autoLadder(ManualOverrides[key].value),
        subject: 'rotation',
      }));
  },

  // ── ONE SESSION — perfect the four machines at this planet count ────────
  // Returns the session record, or null if the deadline fired before the
  // AUTO base could even be read.
  async _session(planets, runNumber, modeBudgetMs, rotation = [], covered = null, si = 0) {
    this._clearBodies();
    const reached = this._spawnTo(planets);
    const sessionEnd = performance.now() + SESSION_MS;   // the 20-second box
    const sweepEnd   = sessionEnd - VERDICT_RESERVE;     // verdict gets the rest
    const sCut = () => this._cut() || performance.now() >= sweepEnd;
    const tick = (txt) => this._setStatus(
      `#${runNumber} · ${reached}p · ${txt} · ${this._timeText()}`,
      1 - this._timeLeft() / modeBudgetMs
    );

    // THE AUTOMATICS — core + this session's rotation knobs at AUTO,
    // the governor's own hand. (A stray manual on a rotation knob would
    // contaminate the base — hand it back before reading.)
    for (const k of ALL_KNOBS) ManualOverrides.reset(k.key);
    for (const r of rotation) ManualOverrides.reset(r.key);
    if (this._cut()) return null;
    const auto = await this._measure();
    tick(`auto ${auto.fps}fps`);

    const knobReport = {};
    const settings = {};

    // THE MANUALS — one plan, rotated: session i starts the core sweep at
    // core knob i (round-robin), so when the 20s box cuts a sweep short,
    // the NEXT session leads with the knobs this one never reached. Then
    // this session's slice of the rotation (the forgotten variables).
    const core = SUBJECTS.flatMap(s => s.knobs.map(k => ({ ...k, subject: s.name })));
    const r0 = si % core.length;
    const plan = [...core.slice(r0), ...core.slice(0, r0), ...rotation];
    for (const knob of plan) {
        if (sCut()) break;
        const sweep = [];
        let bestV = null, bestFps = -1;
        for (const v of knob.values) {
          if (sCut()) break;
          ManualOverrides.set(knob.key, v);
          const m = await this._measure();
          tick(`${knob.subject === 'rotation' ? '↻' : ''}${knob.key}=${v} · ${m.fps}fps`);
          sweep.push([v, m.fps, +(m.fps - auto.fps).toFixed(1)]);
          // Best = most frames; within 1fps of the best, richer wins.
          if (m.fps > bestFps + 1 || (m.fps > bestFps - 1 && bestV !== null &&
              knob.values.indexOf(v) > knob.values.indexOf(bestV))) {
            bestFps = Math.max(bestFps, m.fps); bestV = v;
          } else if (bestV === null) { bestFps = m.fps; bestV = v; }
        }
        ManualOverrides.reset(knob.key);            // return to base — isolated
        if (bestV !== null) {
          settings[knob.key] = bestV;
          knobReport[knob.key] = {
            subject: knob.subject,
            best: bestV,
            delta: +(bestFps - auto.fps).toFixed(1), // the Change that mattered
            sweep,                                    // [value, fps, Δ] rows
          };
          // The ledger: a rotation knob counts as TESTED only when its
          // sweep actually measured something.
          if (knob.subject === 'rotation' && covered) covered.add(knob.key);
        }
        if (this._cut()) break;
    }

    // THE VERDICT — compose the winners, measure together, manual vs auto.
    let manual = null, winner = 'auto';
    if (Object.keys(settings).length && !this._cut()) {
      for (const [k, v] of Object.entries(settings)) ManualOverrides.set(k, v);
      manual = await this._measure();
      tick(`manual ${manual.fps}fps vs auto ${auto.fps}fps`);
      winner = manual.fps > auto.fps ? 'manual' : 'auto';
      if (winner === 'auto') for (const k of Object.keys(settings)) ManualOverrides.reset(k);
    }

    return {
      planets, reached,
      capped:  reached < planets,
      auto,                                  // the Automatics' rates
      manual,                                // the composed Manuals' rates
      winner,
      held:    Math.max(auto.fps, manual?.fps ?? 0) >= TARGET_FPS(),
      fps:     Math.max(auto.fps, manual?.fps ?? 0),
      settings: winner === 'manual' ? { ...settings } : {},
      knobs:   knobReport,
    };
  },

  // Compat for staged callers.
  get tierCount() { return TIERS.length; },
  get modes()     { return MODES; },

  // ── THE RUN — deadline-owned session climb ──────────────────────────────
  // mode ∈ WAKEUP (1 min) · MODERATION (3 min) · FULL (5 min).
  async run({ mode = 'FULL' } = {}) {
    if (this.running) return;
    const M = MODES[mode] || MODES.FULL;
    this.running = true;
    this._stopRequested = false;
    this._deadline = performance.now() + M.seconds * 1000;
    this._liveStrip(true);
    this._setStatus(`${M.label} · starting…`, 0);

    const savedBodies  = state.bodies;
    const savedLoose   = state.loose;
    const savedFlashes = state.flashes;
    const savedPaused  = state.paused;
    const savedSpeed   = state.physSpeed;
    const savedDebug   = DebugRouter.masterEnabled;
    DebugRouter.masterEnabled = false;

    const prev = this.lastPrefs;
    const runNumber = (prev?.runs || 0) + 1;
    const sessions = [];
    let collapsed = false;

    try {
      state.paused    = false;
      state.physSpeed = 1;

      // PURE FRAMES LAW: the whole run measures at skip = 0.
      for (const k of SKIP_KEYS) ManualOverrides.set(k, 0);

      // THE ROTATION — forgotten-first queue from the saved ledger; each
      // session takes the next slice, so the whole list cycles across runs.
      const queue = this._rotationQueue();
      const covered = new Set();
      let qi = 0;

      let si = 0;
      for (const planets of TIERS) {
        if (this._cut()) break;
        const slice = queue.slice(qi, qi + ROTATION_PER_SESSION);
        qi += slice.length;
        const s = await this._session(planets, runNumber, M.seconds * 1000, slice, covered, si++);
        if (!s) break;
        sessions.push(s);
        this._setStatus(
          `#${runNumber} · ${s.reached}p done · ${s.fps}fps · ${s.winner} · ${this._timeText()}`,
          1 - this._timeLeft() / (M.seconds * 1000)
        );
        if (s.fps <= FLOOR_FPS || s.capped) { collapsed = true; break; }
      }

      if (this._stopRequested) {
        // 🔴 STOPPED — save nothing, apply nothing. The finally block hands
        // over a clean slate instead of restoring the pre-run scene.
        this._setStatus('stopped · clean slate', 1);
        console.log('[Benchmark] stopped by the red button — nothing saved');
        return;
      }

      // THE 1000-RULE SCORE: heaviest session that held the target.
      const heaviestHeld = sessions.reduce((s, r) => r.held ? Math.max(s, r.reached) : s, 0);
      const avgFps = +(sessions.reduce((s, r) => s + r.fps, 0) / Math.max(1, sessions.length)).toFixed(1);
      const score  = heaviestHeld;
      const prevScore = prev?.score ?? 0;
      const improvement = score - prevScore;

      const prefs = this._buildPreferences(sessions, mode);
      // THE LEDGER, written forward: merge this run's tested rotation knobs
      // over the saved coverage, list what's still untested — the NEXT run
      // reads this and starts with the forgotten ones.
      const coverage = { ...(prev?.coverage || {}) };
      for (const key of covered) coverage[key] = runNumber;
      const eligible = this._eligibleRotationKeys();
      prefs.coverage = coverage;
      prefs.untested = eligible.filter(k => !(k in coverage));
      prefs.rotationTested = [...covered];
      prefs.collapsed   = collapsed;
      prefs.runs        = runNumber;
      prefs.score       = score;          // planets held — x/1000
      prefs.avgFps      = avgFps;
      prefs.prevScore   = prevScore;
      prefs.improvement = improvement;
      prefs.history     = [...(prev?.history || []), { run: runNumber, mode, score, avgFps }].slice(-30);

      this.lastResults = sessions;
      this.lastPrefs   = prefs;
      this.save(prefs);
      this._applyPreferences(prefs);
      this._setStatus(`done · ${score}/1000 planets ${improvement >= 0 ? 'Δ+' : 'Δ'}${improvement}`, 1);
      console.log('[Benchmark] complete', prefs);
    } catch (e) {
      console.error('[Benchmark] failed', e);
      this._setStatus('failed', this.progress);
    } finally {
      for (const k of SKIP_KEYS) ManualOverrides.reset(k);   // release Pure Frames pins
      if (this._stopRequested) {
        // Clean slate — like a fresh clear: new clean planets, no restore.
        for (const k of ALL_KNOBS) ManualOverrides.reset(k.key);
        state.bodies = []; state.loose = []; state.flashes = [];
        state.paused    = savedPaused;
        state.physSpeed = savedSpeed;
      } else {
        state.bodies    = savedBodies;
        state.loose     = savedLoose;
        state.flashes   = savedFlashes;
        state.paused    = savedPaused;
        state.physSpeed = savedSpeed;
      }
      DebugRouter.masterEnabled = savedDebug;
      try { FutureCache.invalidate(); } catch (_) {}
      this._liveStrip(false);
      this._stopRequested = false;
      this.running = false;
    }
  },

  get info() {
    const p = this.lastPrefs;
    if (!p || !p.runs) return null;
    return {
      runs:        p.runs,
      score:       p.score ?? 0,
      avgFps:      p.avgFps ?? 0,
      improvement: p.improvement ?? 0,
      collapsed:   !!p.collapsed,
    };
  },

  get debugInfo() {
    return {
      signature: this.signature(),
      status:    this.status,
      running:   this.running,
      runs:      this.lastPrefs?.runs ?? 0,
      score:     this.lastPrefs?.score ?? 0,
    };
  }
};

export default Benchmark;
