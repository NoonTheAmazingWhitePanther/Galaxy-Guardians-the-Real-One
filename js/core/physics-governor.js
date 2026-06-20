/**
 * js/core/physics-governor.js
 * Real Time Engine Tuning — Physics side.
 *
 * Controls TWO things independently:
 *
 * 1. TIMESTEP (✖️ ➗) — how big each physics step is.
 *    Bigger = fewer ticks per second = cheaper but less precise.
 *
 * 2. SUBSTEPS (+ −) — max catchup steps allowed per frame.
 *    More = smoother under load but more CPU per frame.
 *    Fewer = cheaper but physics can lag behind real time.
 *
 * Both have manual override + auto mode.
 * Auto-chaos signal: collisions + spring breaks + burn zones.
 */

import { CONFIG } from '../config/config-index.js';

// ── Timestep ──────────────────────────────────────────────────────────────
const STEP_BASE   = 1 / 60;
const STEP_MIN    = 1 / 120;
const STEP_MAX    = 1 / 8;
const MULT_FACTOR = 2.0;
const AUTO_LERP   = 0.02;

// ── Substeps ──────────────────────────────────────────────────────────────
const SUB_BASE    = 16;   // matches CONFIG.physics.MAX_FRAME_SKIP
const SUB_MIN     = 1;
const SUB_MAX     = 32;
const SUB_STEP    = 1;    // + / − increment

let _step        = STEP_BASE;
let _stepManual  = false;
let _sub         = SUB_BASE;
let _subManual   = false;
let _chaosSignal = 0;

export const PhysicsGovernor = {

  // ── Timestep ─────────────────────────────────────────────────────────────
  get step()          { return _step; },
  get pressure()      { return 1 - (_step - STEP_MIN) / (STEP_MAX - STEP_MIN); },
  get isManual()      { return _stepManual; },

  feedChaos(collisions, springBreaks, burnZones) {
    _chaosSignal = collisions + springBreaks * 2 + burnZones;
    if (!_stepManual) this._autoAdjustStep();
  },

  _autoAdjustStep() {
    const chaos  = Math.min(_chaosSignal / 20, 1);
    const target = STEP_BASE + (1 - chaos) * (STEP_MAX - STEP_BASE) * 0.3;
    _step = Math.max(STEP_MIN, Math.min(STEP_MAX, _step + (target - _step) * AUTO_LERP));
  },

  /** ✖️ — bigger timestep, fewer ticks, cheaper */
  multiply() { _stepManual = true; _step = Math.min(_step * MULT_FACTOR, STEP_MAX); },

  /** ➗ — smaller timestep, more ticks, more precise */
  divide()   { _stepManual = true; _step = Math.max(_step / MULT_FACTOR, STEP_MIN); },

  /** 🟰 — reset timestep to baseline */
  idle()     { _stepManual = false; _step = STEP_BASE; },

  get label() {
    const hz = Math.round(1 / _step);
    return `${hz}hz${_stepManual ? ' 🔒' : ''}`;
  },

  // ── Substeps ──────────────────────────────────────────────────────────────
  get substeps()        { return _sub; },
  get subManual()       { return _subManual; },
  get substepPressure() { return (_sub - SUB_MIN) / (SUB_MAX - SUB_MIN); },

  /** + — one more substep per frame (more precise, more CPU) */
  subAdd() {
    _subManual = true;
    _sub = Math.min(_sub + SUB_STEP, SUB_MAX);
  },

  /** − — one fewer substep per frame (cheaper, may lag) */
  subSubtract() {
    _subManual = true;
    _sub = Math.max(_sub - SUB_STEP, SUB_MIN);
  },

  /** 🟰 — reset substeps to baseline */
  subIdle() {
    _subManual = false;
    _sub = SUB_BASE;
  },

  get substepLabel() {
    return `${_sub}sub${_subManual ? ' 🔒' : ''}`;
  }
};
