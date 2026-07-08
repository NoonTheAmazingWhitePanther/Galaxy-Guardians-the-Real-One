/**
 * js/modules/debug/benchmark.js
 * BEST PREFERENCES — device benchmark + persistence.
 *
 * The "1000 law": the ideal is 1000 virtual cycles/sec. The benchmark loads the
 * scene to progressively heavier planet counts (30 → 960) and, at each tier,
 * walks a quality ladder to find the richest settings that still hold the
 * target frame rate. The winning settings are written to best-preferences.json
 * (and localStorage), keyed by a VARIABLE-COUNT SIGNATURE.
 *
 * Version check without a version number: we count how many user-changeable
 * (non-read-only) debug variables the engine exposes. If a saved file's count
 * matches the engine's current count, it's the same "shape" of engine and the
 * saved best preferences are loaded. If it differs (a newer build with more/
 * fewer knobs), we fall back to the built-in Base (BALANCE) profile.
 */

import { ManualOverrides, TrailGov } from './governor.js';
import { GovernorProfiles } from './governor-profiles.js';
import { state, SUN, sunGravMult, PALS } from '../../core/state.js';
import { config } from '../../core/config.js';
import { CONFIG } from '../../config/config-index.js';
import { makeBody } from '../physics/creation.js';
import { hypot, clamp } from '../../core/math.js';
import { FpsCounter } from './fps-counter.js';
import { FutureCache } from '../../core/future-cache.js';
import { DebugRouter } from './debug-router.js';

const STORAGE_KEY = 'gg_best_prefs';
const FILE_URL    = 'best-preferences.json';

// Planet-count ladder — the stress steps. 1000-cycle ideal held in mind at each.
const TIERS = [30, 60, 90, 120, 240, 480, 960];

// Target real frame rate to hold while maximizing quality. The virtual cycle
// count (FpsCounter.avgVirtual) is the score we push toward the 1000 ideal.
const TARGET_FPS = 55;

// If the leanest level still can't clear this, the device is saturated — heavier
// tiers are pointless, so the whole run stops (your "makes no sense to continue").
const FLOOR_FPS = 6;

// Never let the live scene itself exhaust memory: stop spawning a tier once total
// live particles cross this, and record the actual count reached.
const MAX_LIVE_PARTICLES = 45000;

// The knobs we tune, each with its values ordered LEAN → RICH (index = richness:
// [0] cheapest/safest, last = highest quality/cost). Cost rises with richness, so
// a sweep can stop the moment a value drops below target. These are the REAL
// governor variables (renderFrameSkip/physicsFrameSkip are out of 60).
const KNOBS = [
  { key: 'physicsSubsteps',  values: [2, 3, 4, 6, 8, 12] },
  { key: 'renderFrameSkip',  values: [50, 40, 30, 20, 10, 0] },   // rich = skip nothing
  { key: 'physicsFrameSkip', values: [30, 20, 10, 0] },           // rich = skip nothing
  { key: 'trailGlowDepth',   values: [4, 6, 8, 10, 12] },
  { key: 'trailMax',         values: [6, 8, 12, 16, 24, 32] },
  { key: 'trailDensity',     values: [8, 16, 32, 64, 120, 240] },
  { key: 'cacheMsBudget',    values: [1, 1.5, 2, 2.5, 3] },
  { key: 'cacheTargetAhead', values: [12, 24, 40, 60, 90, 120] },
];

// The leanest safe config — every knob at its cheapest value. Benchmarks start
// here so the very first measurement can't crash, then climb.
function _leanestCfg() {
  const cfg = {};
  for (const k of KNOBS) cfg[k.key] = k.values[0];
  return cfg;
}

// ── frame stepping helpers ────────────────────────────────────────────────
const _raf = () => new Promise(res => requestAnimationFrame(() => res()));
async function _waitFrames(n) { for (let i = 0; i < n; i++) await _raf(); }

export const Benchmark = {
  running:  false,
  status:   'idle',
  progress: 0,          // 0..1
  lastResults: null,    // per-tier measurements from the most recent run
  lastPrefs:   null,    // full prefs object from load or last run (for refinement)
  _onStatus: null,      // optional UI callback(status, progress)

  // ── Variable-count signature ──────────────────────────────────────────
  // Counts the user-changeable (non-read-only) override variables. Real data
  // records only — skips methods and accessor/proxy keys. This IS the version
  // check: a matching count means the saved file targets this engine shape.
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

  // ── Persistence ─────────────────────────────────────────────────────────
  // Load order: localStorage cache → bundled best-preferences.json. First one
  // whose signature matches the engine wins. Otherwise fall back to Base.
  async load() {
    const sig = this.signature();

    // 1) localStorage cache (survives reloads without a rebuild)
    try {
      const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.signature === sig && data.base) {
          this._applyPreferences(data);
          this.lastResults = data.tiers ?? null;
          this.lastPrefs = data;
          this._setStatus('loaded (cache)');
          console.log('[Benchmark] best preferences loaded from cache');
          return true;
        }
      }
    } catch (e) { console.warn('[Benchmark] cache load failed', e); }

    // 2) bundled file
    try {
      const res = await fetch(FILE_URL, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.signature === sig && data.base) {
          this._applyPreferences(data);
          this.lastResults = data.tiers ?? null;
          this.lastPrefs = data;
          this._setStatus('loaded (file)');
          console.log('[Benchmark] best preferences loaded from', FILE_URL);
          return true;
        }
        console.log(`[Benchmark] ${FILE_URL} signature ${data?.signature} ≠ engine ${sig} — using Base`);
      }
    } catch (_) { /* no file — expected on fresh installs */ }

    // 3) fallback — the Base profile we already have
    this._fallbackToBase();
    this._setStatus('base (no saved prefs)');
    return false;
  },

  _fallbackToBase() {
    GovernorProfiles.applyProfile('BALANCE');
    console.log('[Benchmark] fell back to Base (BALANCE) profile');
  },

  // Apply a preferences object to the live engine + Base profile.
  _applyPreferences(data) {
    const base = data.base || {};
    for (const [key, value] of Object.entries(base)) {
      if (ManualOverrides[key] && typeof ManualOverrides[key] === 'object') {
        ManualOverrides.set(key, value);
      }
    }
    // Fold the winning base into the Base profile so MAX/MIN and future user
    // profiles inherit the benchmarked defaults.
    GovernorProfiles.setBase?.(base);
  },

  // Build the preferences object from the current per-tier results.
  _buildPreferences(tiers) {
    // Base = the settings the mid-heavy tier (120) settled on; else the last
    // tier we actually completed; else the leanest safe config.
    const midTier = tiers.find(t => t.planets === 120) || tiers[tiers.length - 1] || null;
    const base = midTier ? { ...midTier.settings } : _leanestCfg();
    return {
      generated:  new Date().toISOString(),
      signature:  this.signature(),
      idealCycle: 1000,               // the 1000 law, recorded for reference
      targetFps:  TARGET_FPS,
      base,
      tiers,
    };
  },

  save(prefs) {
    const json = JSON.stringify(prefs, null, 2);
    // localStorage cache
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, json);
    } catch (e) { console.warn('[Benchmark] cache save failed', e); }
    // Offer the file for baking into the repo
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = FILE_URL;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { console.warn('[Benchmark] file export failed', e); }
  },

  // ── Scene control for the benchmark ───────────────────────────────────
  _applyCfg(cfg) {
    for (const [key, value] of Object.entries(cfg)) {
      if (ManualOverrides[key] && typeof ManualOverrides[key] === 'object') {
        ManualOverrides.set(key, value);
      }
    }
  },

  _clearBodies() {
    state.bodies = [];
    state.loose  = [];
    state.flashes = [];
    try { FutureCache.invalidate(); } catch (_) {}
  },

  // Spawn up to `n` orbiting bodies directly (bypasses the interactive cap).
  // Stops early if total live particles hit the memory ceiling. Returns the
  // actual body count reached.
  _spawnTo(n) {
    let particles = 0;
    for (const b of state.bodies) particles += b?.particles?.length || 0;
    while (state.bodies.length < n) {
      if (particles >= MAX_LIVE_PARTICLES) break;   // live-memory ceiling
      const ang  = Math.random() * Math.PI * 2;
      const dist = 180 + Math.random() * 520;
      const x = SUN.x + Math.cos(ang) * dist;
      const y = SUN.y + Math.sin(ang) * dist;
      const radius = clamp(10 + Math.random() * 30, 16, 110);
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

  // Average real FPS over a measurement window.
  async _measure(warmFrames, sampleFrames) {
    await _waitFrames(warmFrames);
    let sumReal = 0, sumVirt = 0, samples = 0;
    for (let i = 0; i < sampleFrames; i++) {
      await _raf();
      sumReal += FpsCounter.avgReal || 0;
      sumVirt += FpsCounter.avgVirtual || 0;
      samples++;
    }
    return {
      fps:     +(sumReal / Math.max(1, samples)).toFixed(1),
      virtual: +(sumVirt / Math.max(1, samples)).toFixed(1),
    };
  },

  // Richness of a config, 0..1 — how far each knob sits toward its richest
  // value, averaged. ×1000 gives the bench score (the 1000 law: 1000 = maxed).
  _richness(cfg) {
    let got = 0, max = 0;
    for (const k of KNOBS) {
      const idx = k.values.indexOf(cfg[k.key]);
      got += idx < 0 ? 0 : idx;
      max += k.values.length - 1;
    }
    return max > 0 ? got / max : 0;
  },

  // Refine ONE knob from a seeded value: if it already holds target, climb
  // richer while it keeps holding (grab any new headroom); if it no longer
  // holds (device hotter / heavier tier), retreat leaner until it does. This is
  // what makes repeated runs converge — each press starts from the last best
  // and nudges toward the true edge, tightening to ±1 over runs.
  async _refineKnob(knob, cfg, startIdx, capIdx, onStep) {
    const top = Math.min(capIdx, knob.values.length - 1);
    let idx = Math.max(0, Math.min(startIdx, top));
    cfg[knob.key] = knob.values[idx]; this._applyCfg(cfg);
    let m = await this._measure(12, 20); onStep?.(knob.key, knob.values[idx], m);

    if (m.fps >= TARGET_FPS) {
      for (let vi = idx + 1; vi <= top; vi++) {           // climb into headroom
        cfg[knob.key] = knob.values[vi]; this._applyCfg(cfg);
        const mm = await this._measure(12, 20); onStep?.(knob.key, knob.values[vi], mm);
        if (mm.fps >= TARGET_FPS) { idx = vi; m = mm; } else break;
      }
    } else {
      for (let vi = idx - 1; vi >= 0; vi--) {             // retreat to safety
        cfg[knob.key] = knob.values[vi]; this._applyCfg(cfg);
        const mm = await this._measure(12, 20); onStep?.(knob.key, knob.values[vi], mm);
        idx = vi; m = mm;
        if (mm.fps >= TARGET_FPS) break;
      }
    }
    cfg[knob.key] = knob.values[idx]; this._applyCfg(cfg);
    return { idx, m };
  },

  // ── The benchmark ─────────────────────────────────────────────────────
  async run() {
    if (this.running) return;
    this.running = true;
    this._setStatus('starting…', 0);

    const savedBodies  = state.bodies;
    const savedLoose   = state.loose;
    const savedFlashes = state.flashes;
    const savedPaused  = state.paused;
    const savedSpeed   = state.physSpeed;
    const savedDebug   = DebugRouter.masterEnabled;

    // Close the debug panels for the run — they render nothing useful here and
    // just add draw + memory cost. The BEST PREFERENCES button stays visible.
    DebugRouter.masterEnabled = false;

    const prev = this.lastPrefs;
    const runNumber = (prev?.runs || 0) + 1;

    const results = [];
    let collapsed = false;
    try {
      state.paused    = false;
      state.physSpeed = 1;

      // Monotonic ceiling per knob across tiers (heavier can't exceed lighter).
      const capIdx = {};
      for (const k of KNOBS) capIdx[k.key] = k.values.length - 1;

      const totalSteps = TIERS.length * KNOBS.length;
      let step = 0;

      for (let ti = 0; ti < TIERS.length; ti++) {
        const planets = TIERS[ti];
        this._clearBodies();
        const reached = this._spawnTo(planets);

        // Seed this tier from the PREVIOUS run's settings for the same tier (so
        // each press refines the last best); leanest on the very first run.
        const prevTier = prev?.tiers?.find(t => t.planets === planets);
        const cfg = prevTier?.settings ? { ...prevTier.settings } : _leanestCfg();
        this._applyCfg(cfg);
        let lastM = null;

        for (const knob of KNOBS) {
          const startIdx = Math.max(0, knob.values.indexOf(cfg[knob.key]));
          const { idx, m } = await this._refineKnob(
            knob, cfg, startIdx, capIdx[knob.key],
            (key, val, mm) => this._setStatus(`#${runNumber} · ${reached}p · ${key}=${val} · ${mm.fps}fps`, step / totalSteps)
          );
          capIdx[knob.key] = idx;
          lastM = m;
          step++;
        }

        const richness = this._richness(cfg);
        results.push({
          planets, reached,
          fps:      lastM?.fps ?? 0,
          virtual:  lastM?.virtual ?? 0,
          richness: +richness.toFixed(3),
          score:    Math.round(richness * 1000),
          capped:   reached < planets,
          settings: { ...cfg },
        });
        this._setStatus(`#${runNumber} · ${reached}p done · ${lastM?.fps ?? 0}fps`, (ti + 1) / TIERS.length);

        if ((lastM?.fps ?? 0) <= FLOOR_FPS || reached < planets) { collapsed = true; break; }
      }

      // Aggregate: bench score (0..1000, the law) and average sustained fps.
      const avgFps = +(results.reduce((s, r) => s + r.fps, 0)   / Math.max(1, results.length)).toFixed(1);
      const score  = Math.round(results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length));
      const prevScore = prev?.score ?? 0;
      const improvement = score - prevScore;

      const prefs = this._buildPreferences(results);
      prefs.collapsed = collapsed;
      prefs.runs        = runNumber;
      prefs.score       = score;
      prefs.avgFps      = avgFps;
      prefs.prevScore   = prevScore;
      prefs.improvement = improvement;
      prefs.history     = [...(prev?.history || []), { run: runNumber, score, avgFps }].slice(-30);

      this.lastResults = results;
      this.lastPrefs   = prefs;
      this.save(prefs);
      this._applyPreferences(prefs);
      this._setStatus(
        `done · ${score}/1000 ${improvement >= 0 ? 'Δ+' : 'Δ'}${improvement}`,
        1
      );
      console.log('[Benchmark] complete', prefs);
    } catch (e) {
      console.error('[Benchmark] failed', e);
      this._setStatus('failed', this.progress);
    } finally {
      state.bodies    = savedBodies;
      state.loose     = savedLoose;
      state.flashes   = savedFlashes;
      state.paused    = savedPaused;
      state.physSpeed = savedSpeed;
      DebugRouter.masterEnabled = savedDebug;
      try { FutureCache.invalidate(); } catch (_) {}
      this.running = false;
    }
  },

  // Compact summary for the under-button strip. Null when no saved prefs yet.
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
