/**
 * js/core/physics-governor.js
 * Real Time Engine Tuning — Physics side.
 *
 * Controls how many physics ticks run per second by scaling
 * the physicsStep (timestep). Bigger step = fewer ticks = cheaper.
 *
 * Tuning buttons on debug panel: ✖️ (multiply) and ➗ (divide)
 * Idle (🟰) resets to baseline.
 *
 * Chaos signal: collisions + spring breaks + burn zones active per frame.
 * High chaos → auto pulls toward baseline (more precision).
 * Low chaos  → auto drifts toward skip (save energy).
 *
 * pressure: 0.0 = full coast (max skip), 1.0 = full burn (no skip)
 */

const STEP_BASE   = 1 / 60;   // baseline timestep (matches CONFIG.physics.TIMESTEP)
const STEP_MIN    = 1 / 120;  // max precision (smallest step, most ticks)
const STEP_MAX    = 1 / 8;    // max skip (largest step, fewest ticks)
const MULT_FACTOR = 2.0;      // ✖️ / ➗ jump multiplier
const AUTO_LERP   = 0.02;     // how fast auto-chaos pulls step back to base

let _step        = STEP_BASE;
let _manual      = false; // true = user locked it, auto-chaos paused
let _chaosSignal = 0;     // set each frame by main.js

export const PhysicsGovernor = {

  get step()     { return _step; },
  get pressure() { return 1 - (_step - STEP_MIN) / (STEP_MAX - STEP_MIN); },
  get isManual() { return _manual; },

  /** Call from main.js each frame with raw chaos count */
  feedChaos(collisions, springBreaks, burnZones) {
    _chaosSignal = collisions + springBreaks * 2 + burnZones;
    if (!_manual) this._autoAdjust();
  },

  _autoAdjust() {
    // High chaos → pull step toward STEP_BASE (more precision)
    // Low chaos  → let step drift toward STEP_MAX (coast)
    const chaos = Math.min(_chaosSignal / 20, 1); // normalize 0..1
    const target = STEP_BASE + (1 - chaos) * (STEP_MAX - STEP_BASE) * 0.3;
    _step += (target - _step) * AUTO_LERP;
    _step = Math.max(STEP_MIN, Math.min(STEP_MAX, _step));
  },

  /** ✖️ — multiply step (skip more, cheaper) */
  multiply() {
    _manual = true;
    _step = Math.min(_step * MULT_FACTOR, STEP_MAX);
  },

  /** ➗ — divide step (skip less, more precise) */
  divide() {
    _manual = true;
    _step = Math.max(_step / MULT_FACTOR, STEP_MIN);
  },

  /** 🟰 — reset to baseline, re-enable auto */
  idle() {
    _manual = false;
    _step   = STEP_BASE;
  },

  /** Human-readable current rate */
  get label() {
    const hz = Math.round(1 / _step);
    return `${hz}hz${_manual ? ' 🔒' : ''}`;
  }
};
