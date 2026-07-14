/**
 * js/modules/debug/auto-tuner.js
 * THE AUTOMATIC — the Governor gone completely automatic, live.
 *
 * One button and every knob belongs to the same system that runs the
 * benchmark — but here it tunes DURING PLAY, with whatever the user is
 * doing in the app as the workload. No scene takeover, no spawning, no
 * clearing: a benchmark without user interference, riding the real game.
 *
 * THE LOOP (delay + check-up, always):
 *   COOLDOWN — the mandated delay between knob switches.
 *   BASELINE — measure the live fps as it is right now.
 *   SWITCH   — pick ONE knob, remember its prior state, set a candidate.
 *   SETTLE   — the check-up pause; a fresh value gets a breath before
 *              anyone judges it.
 *   TRIAL    — measure again on the same workload.
 *   VERDICT  — kept only if it WINS by a margin; otherwise reverted to
 *              exactly what it was (manual value or the governor's hand).
 *
 * THE ITERATOR LAW (individual, per knob): every knob carries its own
 * tested-count. The next knob is ALWAYS one with the lowest count — the 0s
 * first, then the least-tested. The knob with the highest score was checked
 * last by definition; the search is always for the forgotten.
 *
 * THE VAULT IS ITS OWN: gg_auto_governor — never the benchmark's
 * best-preferences. Benchmark lists stay saved alone for best results;
 * this list is the real-time ruling, and it's what makes the QUICK FIX
 * possible: when live fps craters, the tuner applies its best-known wins
 * from memory instantly instead of exploring.
 *
 * Suspends itself while a real Benchmark runs or the sim is paused —
 * contaminated windows are never judged.
 */

import { ManualOverrides, ScreenGov } from './governor.js';
import { GovernorProfiles } from './governor-profiles.js';
import { Benchmark, autoLadder } from './benchmark.js';
import { state } from '../../core/state.js';
import { FutureCache } from '../../core/future-cache.js';

const STORAGE_KEY = 'gg_auto_governor';   // ITS OWN vault — see header

const COOLDOWN_MS   = 2500;  // delay between knob switches (the law)
const SETTLE_MS     = 500;   // check-up pause after a switch, before judging
const MEASURE_MS    = 800;   // measurement window (baseline and trial)
const KEEP_MARGIN   = 0.5;   // fps a change must WIN by to be kept
const RESCUE_RATIO  = 0.7;   // live fps below target×this → quick fix
const RESCUE_GAP_MS = 10000; // rescue at most once per this window
const RESCUE_MAX    = 3;     // best-known wins applied per rescue

// ── THE WEIRD — random evolution, on purpose ──────────────────────────────
// Before any NNW sits on top of this, the random floor must be assured:
// rounds of random mathematical unknowns — random knobs, random ops,
// counting whatever they randomly want — that move WEIRD on purpose. Safety
// is the shape of the round, not the size of the move: exactly 3 variables
// per round, mutations clamped finite/positive, judged as a GROUP with the
// same delay + check-up laws, and reverted as a group when they lose.
// TIME AND STATE AUTHORITY — never touched live. These knobs own the
// clock (timescale, substeps) or the state history (snapshot vault):
// flipping them mid-play is what made the sim leap ~100 physics ticks and
// snap back to where it was, over and over — a stale-future/snapshot
// replay loop. The isolated benchmark may still test them; the live
// Automatic may not.
const LIVE_EXCLUDE = new Set([
  'physicsTimeScale', 'physicsSubsteps',
  'cacheSnapshotInterval', 'cacheVaultSize',
  'pulseHz',                       // the heartbeat itself — hands off
]);

const WEIRD_VARS   = 3;      // the safety law — 3 random variables per round
const WEIRD_EVERY  = 5;      // the constant — every Nth Automatic round is weird
const WEIRD_RANGES = [       // the three dice — log-uniform multiplier spans
  [0.5, 2],                  // 🎲1 weird
  [0.25, 4],                 // 🎲2 weirder
  [0.1, 10],                 // 🎲3 weirdest
];

export const AutoTuner = {
  enabled: false,
  // THE INDIVIDUAL ITERATORS — key → { n: timesTested, best, delta }.
  // n is the iterator; best/delta are the live-found quick-fix memory.
  ledger: {},
  _phase:   'cooldown',
  _t0:      0,
  _frames:  0,
  _baseline: 0,
  _trialKnob: null,     // { key, candidate, prior: { wasManual, value } }
  _weird: null,         // active weird round: { i, muts: [{key, op, val, prior}] }
  _weirdQueued: 0,      // 1..3 = a weird round of that die fires next baseline
  _weirdOneShot: false, // button-rolled while AUTOMATIC off → stop after verdict
  _roundCount: 0,       // completed Automatic rounds — every WEIRD_EVERYth is weird
  weirdHistory: [],     // last 30 rounds: { i, muts:[[key,op,val]], delta, kept }
  _rafId:    0,
  _lastRescue: 0,
  lastVerdict: '—',

  // ── Persistence — the Automatic List, saved alone ───────────────────────
  load() {
    try {
      const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.ledger = data?.ledger || {};
        this.weirdHistory = data?.weirdHistory || [];
      }
    } catch (e) { console.warn('[AutoTuner] load failed', e); }
  },
  save() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        generated: new Date().toISOString(),
        signature: Benchmark.signature(),
        ledger:    this.ledger,
        weirdHistory: this.weirdHistory.slice(-30),
      }));
    } catch (e) { console.warn('[AutoTuner] save failed', e); }
  },

  // ── On/off ──────────────────────────────────────────────────────────────
  toggle() { this.enabled ? this.stop() : this.start(); return this.enabled; },

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.load();
    this._enterPhase('cooldown');
    this._rafId = requestAnimationFrame(this._loop);
    console.log('[AutoTuner] AUTOMATIC on — the governor tunes itself live');
  },

  stop() {
    if (!this.enabled) return;
    this._revertTrial();                 // never leave a half-judged knob
    this.enabled = false;
    cancelAnimationFrame(this._rafId);
    this.save();
    console.log('[AutoTuner] AUTOMATIC off');
  },

  // The live pool — the benchmark's tunable space minus the time/state
  // authorities (see LIVE_EXCLUDE).
  _livePool() {
    return Benchmark.tunableKeys().filter(k => !LIVE_EXCLUDE.has(k));
  },

  // The rollback fix, part 2: EVERY live knob change — apply, revert,
  // rescue, weird — flushes the FutureCache so no stale precomputed future
  // can replay against the new configuration.
  _flushFutures() {
    try { FutureCache.invalidate(); } catch (_) {}
  },

  // ── The iterator law — lowest count first, 0s before everything ────────
  _pickKey() {
    const keys = this._livePool();
    let lowest = Infinity, pool = [];
    for (const k of keys) {
      const n = this.ledger[k]?.n ?? 0;
      if (n < lowest) { lowest = n; pool = [k]; }
      else if (n === lowest) pool.push(k);
    }
    return pool.length ? pool[(Math.random() * pool.length) | 0] : null;
  },

  _candidateFor(key) {
    const cur = ManualOverrides[key]?.value;
    if (typeof cur !== 'number') return null;
    const opts = autoLadder(cur).filter(v => v !== cur);
    return opts.length ? opts[(Math.random() * opts.length) | 0] : null;
  },

  _revertTrial() {
    const t = this._trialKnob;
    if (t) {
      try {
        if (t.prior.wasManual) ManualOverrides.set(t.key, t.prior.value);
        else ManualOverrides.reset(t.key);     // back to the governor's hand
      } catch (_) {}
      this._trialKnob = null;
      this._flushFutures();
    }
    this._revertWeird();
  },

  _revertWeird() {
    const w = this._weird;
    if (!w) return;
    for (const m of w.muts) {
      try {
        if (m.prior.wasManual) ManualOverrides.set(m.key, m.prior.value);
        else ManualOverrides.reset(m.key);
      } catch (_) {}
    }
    this._weird = null;
    this._flushFutures();
  },

  // ── THE WEIRD ENGINE — random mathematical unknowns, safely caged ───────
  // One mutation: a random op on the knob's current value. Toggles flip;
  // numerics take a log-uniform multiplier from the die's span, sometimes a
  // golden twist or an additive nudge — whatever it randomly wants. Always
  // finite, always positive, ints stay ints.
  _mutate(key, range) {
    const cur = ManualOverrides[key]?.value;
    if (typeof cur !== 'number' || !isFinite(cur)) return null;
    if (cur === 0 || cur === 1) {
      const val = cur === 0 ? 1 : 0;
      return { val, op: 'flip' };
    }
    const roll = Math.random();
    let val, op;
    if (roll < 0.6) {          // log-uniform multiplier — the main unknown
      const [lo, hi] = range;
      const k = Math.exp(Math.log(lo) + Math.random() * (Math.log(hi) - Math.log(lo)));
      val = cur * k; op = `×${k.toFixed(2)}`;
    } else if (roll < 0.8) {   // the golden twist
      const k = Math.random() < 0.5 ? 1.618 : 0.618;
      val = cur * k; op = `×φ${k > 1 ? '' : '⁻¹'}`;
    } else {                   // additive nudge, scaled to the value
      const step = Math.max(1, Math.abs(cur) * 0.25) * (Math.random() < 0.5 ? -1 : 1);
      val = cur + step; op = `${step > 0 ? '+' : ''}${step.toFixed(1)}`;
    }
    if (!isFinite(val) || val <= 0) return null;         // the cage
    if (Number.isInteger(cur)) val = Math.max(1, Math.round(val));
    else val = +val.toFixed(3);
    if (val === cur) return null;
    return { val, op };
  },

  // Roll one random evolution round with die i (1..3). Works with AUTOMATIC
  // on (queued into the loop) or off (one-shot: the loop runs just this
  // round — same delay, check-up, and group verdict — then stops itself).
  rollWeird(i = 1) {
    this._weirdQueued = Math.max(1, Math.min(3, Math.round(i)));
    if (!this.enabled) {
      this._weirdOneShot = true;
      this.enabled = true;
      this.load();
      this._enterPhase('baseline');            // no cooldown for a hand roll
      this._rafId = requestAnimationFrame(this._loop);
      console.log(`[AutoTuner] weird 🎲${this._weirdQueued} — one-shot round`);
    } else {
      console.log(`[AutoTuner] weird 🎲${this._weirdQueued} — queued into the Automatic`);
    }
  },

  // Build the round: exactly WEIRD_VARS random knobs, each with its own
  // random op, priors remembered for the group revert.
  _beginWeird(i) {
    const keys = [...this._livePool()];
    const muts = [];
    while (keys.length && muts.length < WEIRD_VARS) {
      const key = keys.splice((Math.random() * keys.length) | 0, 1)[0];
      const m = this._mutate(key, WEIRD_RANGES[i - 1]);
      if (!m) continue;
      muts.push({
        key, op: m.op, val: m.val,
        prior: { wasManual: ManualOverrides.isManual(key), value: ManualOverrides[key].value },
      });
    }
    if (!muts.length) return false;
    for (const m of muts) ManualOverrides.set(m.key, m.val);   // the move
    this._flushFutures();
    this._weird = { i, muts };
    return true;
  },

  _bump(key, kept, candidate, delta) {
    const e = this.ledger[key] || { n: 0, best: null, delta: 0 };
    e.n += 1;                                   // the iterator ticks
    if (kept && delta > (e.delta || 0)) { e.best = candidate; e.delta = +delta.toFixed(1); }
    this.ledger[key] = e;
    this.save();
  },

  // ── QUICK FIX — the real-time experience law ────────────────────────────
  // Live fps cratered: apply the best-known wins from the Automatic List
  // immediately. Memory over exploration when frames are bleeding.
  _rescue(now) {
    if (now - this._lastRescue < RESCUE_GAP_MS) return false;
    const wins = Object.entries(this.ledger)
      .filter(([, e]) => e.best !== null && e.delta > 0)
      .sort((a, b) => b[1].delta - a[1].delta)
      .slice(0, RESCUE_MAX);
    if (!wins.length) return false;
    for (const [key, e] of wins) {
      try { ManualOverrides.set(key, e.best); } catch (_) {}
    }
    this._lastRescue = now;
    this._flushFutures();
    this.lastVerdict = `rescue ×${wins.length}`;
    console.log('[AutoTuner] quick fix — applied', wins.map(([k, e]) => `${k}=${e.best}`).join(' '));
    return true;
  },

  _enterPhase(phase) {
    this._phase = phase;
    this._t0 = performance.now();
    this._frames = 0;
  },

  // ── The loop — one rAF chain, one state machine ─────────────────────────
  _loop: null,   // bound in init below

  _step(now) {
    if (!this.enabled) return;
    this._rafId = requestAnimationFrame(this._loop);

    // Suspend on contamination: a real benchmark owns the stage, and a
    // paused sim measures nothing. Windows restart clean on resume.
    if (Benchmark.running || state.paused) {
      this._revertTrial();
      if (this._weirdOneShot) {                // a hand roll doesn't linger
        this._weirdOneShot = false;
        this._weirdQueued = 0;
        this.enabled = false;
        cancelAnimationFrame(this._rafId);
        return;
      }
      this._enterPhase('cooldown');
      return;
    }

    this._frames++;
    const elapsed = now - this._t0;

    switch (this._phase) {
      case 'cooldown':                          // the delay between switches
        if (elapsed >= COOLDOWN_MS) this._enterPhase('baseline');
        break;

      case 'baseline':
        if (elapsed < MEASURE_MS) break;
        this._baseline = this._frames * 1000 / elapsed;
        // Frames bleeding? Quick fix from memory, skip exploring this round.
        if (this._baseline < ScreenGov.hz * RESCUE_RATIO && this._rescue(now)) {
          this._enterPhase('cooldown');
          break;
        }
        // THE CONSTANT: every WEIRD_EVERYth Automatic round rolls a random
        // die by itself — the weird is part of the machine, not a guest.
        if (!this._weirdQueued && !this._weirdOneShot &&
            this._roundCount > 0 && this._roundCount % WEIRD_EVERY === 0) {
          this._weirdQueued = 1 + ((Math.random() * 3) | 0);
        }
        if (this._weirdQueued) {                        // a weird round
          const die = this._weirdQueued;
          this._weirdQueued = 0;
          if (this._beginWeird(die)) { this._enterPhase('settle'); break; }
          // nothing mutable rolled — fall through to a normal round
        }
        {
          const key = this._pickKey();
          const candidate = key ? this._candidateFor(key) : null;
          if (!key || candidate === null) {
            if (key) this._bump(key, false, null, 0);   // unsweepable still iterates
            this._enterPhase('cooldown');
            break;
          }
          this._trialKnob = {
            key, candidate,
            prior: { wasManual: ManualOverrides.isManual(key), value: ManualOverrides[key].value },
          };
          ManualOverrides.set(key, candidate);          // the switch
          this._flushFutures();
          this._enterPhase('settle');                   // …then the check-up
        }
        break;

      case 'settle':
        if (elapsed >= SETTLE_MS) this._enterPhase('trial');
        break;

      case 'trial': {
        if (elapsed < MEASURE_MS) break;
        const fps = this._frames * 1000 / elapsed;
        const delta = fps - this._baseline;
        const kept = delta >= KEEP_MARGIN;

        if (this._weird) {                              // GROUP verdict
          const w = this._weird;
          if (!kept) this._revertWeird();
          else this._weird = null;                      // the trio lives
          this.lastVerdict = `🎲${w.i} ${w.muts.map(m => `${m.key}${m.op}`).join(' ')} ` +
                             `${kept ? 'KEPT' : 'reverted'} Δ${delta.toFixed(1)}`;
          this.weirdHistory.push({
            i: w.i, kept, delta: +delta.toFixed(1),
            muts: w.muts.map(m => [m.key, m.op, m.val]),
          });
          this.weirdHistory = this.weirdHistory.slice(-30);
          this.save();
          this._roundCount++;
          if (this._weirdOneShot) {                     // hand roll done — rest
            this._weirdOneShot = false;
            this.enabled = false;
            cancelAnimationFrame(this._rafId);
            console.log('[AutoTuner] weird one-shot verdict:', this.lastVerdict);
            return;
          }
          this._enterPhase('cooldown');
          break;
        }

        const t = this._trialKnob;
        if (!kept) this._revertTrial();
        else this._trialKnob = null;                    // the change lives
        this.lastVerdict = `${t.key}=${t.candidate} ${kept ? 'KEPT' : 'reverted'} Δ${delta.toFixed(1)}`;
        this._bump(t.key, kept, t.candidate, delta);
        this._roundCount++;
        this._enterPhase('cooldown');
        break;
      }
    }
  },

  // ── 🔴 FACTORY DEFAULTS — the red satellite's hand ──────────────────────
  // Restores the WHOLE governor table to factory: the Automatic stops, every
  // knob (all of them, no exceptions) goes back to AUTO, both vaults are
  // wiped (benchmark best-preferences AND the Automatic List), the Base
  // profile is reapplied, and the FutureCache is flushed clean.
  factoryReset() {
    this.stop();
    let n = 0;
    for (const key of Object.keys(ManualOverrides)) {
      const desc = Object.getOwnPropertyDescriptor(ManualOverrides, key);
      if (!desc || typeof desc.get === 'function') continue;
      const entry = desc.value;
      if (!entry || typeof entry !== 'object' || typeof entry.isManual !== 'boolean') continue;
      try { ManualOverrides.reset(key); n++; } catch (_) {}
    }
    this.ledger = {};
    this.weirdHistory = [];
    this._roundCount = 0;
    try {
      localStorage.removeItem(STORAGE_KEY);        // the Automatic List
      localStorage.removeItem('gg_best_prefs');    // the benchmark's vault
    } catch (_) {}
    try { GovernorProfiles.applyProfile('BALANCE'); } catch (_) {}
    this._flushFutures();
    this.lastVerdict = 'factory 🔴';
    console.log(`[AutoTuner] 🔴 factory defaults — ${n} knobs to AUTO, both vaults wiped, Base applied`);
  },

  // ── Panel/console surface ────────────────────────────────────────────────
  get debugInfo() {
    const keys = Benchmark.tunableKeys();
    let zeros = 0, tested = 0;
    for (const k of keys) {
      const n = this.ledger[k]?.n ?? 0;
      if (n === 0) zeros++; else tested++;
    }
    return {
      enabled: this.enabled,
      phase:   this._phase,
      knob:    this._weird ? `🎲${this._weird.i}` : (this._trialKnob?.key ?? '—'),
      baseline: +this._baseline.toFixed(1),
      verdict: this.lastVerdict,
      zeros, tested, pool: keys.length,
      weirdRounds: this.weirdHistory.length,
      weirdKept:   this.weirdHistory.filter(w => w.kept).length,
    };
  },
};

AutoTuner._loop = (t) => AutoTuner._step(t);

if (typeof window !== 'undefined') window.AutoTuner = AutoTuner;

export default AutoTuner;
