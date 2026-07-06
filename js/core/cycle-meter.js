/**
 * js/core/cycle-meter.js
 * CYCLE METER — the ground truth of the 1000 law.
 *
 * Three clocks, three truths:
 *   · PHYSICS cycles/sec — actual steps drained from the physics accumulator
 *     per real second. Not derived, not estimated: counted at the drain.
 *   · VIRTUAL cycles/sec — FpsCounter.avgVirtual, the frame-skip-adjusted
 *     figure the benchmark scores against.
 *   · RENDER frames/sec — how often the world actually painted.
 *
 * The law is a KNOB now (cycleTarget, default 1000): you decide how many
 * cycles you want, the meter tells you how many you're getting, and lawPct is
 * the contract fulfillment. The banked accumulator remainder is surfaced too —
 * time owed to physics that hasn't been spent yet (never discarded except on
 * true overload — the locked rule).
 */
import { ManualOverrides } from '../modules/debug/governor.js';

export const CycleMeter = {
  _steps: 0,
  _renders: 0,
  _winStart: 0,

  stats: {
    target: 1000,     // the chosen law
    physSec: 0,       // TRUE physics steps/sec (accumulator drain)
    virtual: 0,       // FpsCounter.avgVirtual (benchmark's figure)
    renderSec: 0,     // painted frames/sec
    lawPct: 0,        // physSec / target × 100
    bankMs: 0,        // accumulator remainder — banked, owed, never discarded
    stepsFrame: 0,    // steps drained this rAF
  },

  /** Once per rAF, after the substep while-loop. */
  frame(stepsThisFrame, accumulatorRemainder, stepSize) {
    this._steps   += stepsThisFrame;
    this.stats.stepsFrame = stepsThisFrame;
    this.stats.bankMs = +(accumulatorRemainder * 1000).toFixed(1);
    this.stats.target = Math.max(50, ManualOverrides.get('cycleTarget', 1000) | 0);

    const now = performance.now();
    if (!this._winStart) this._winStart = now;
    const span = now - this._winStart;
    if (span >= 500) {                      // half-second rolling window
      const sec = span / 1000;
      this.stats.physSec   = Math.round(this._steps / sec);
      this.stats.renderSec = Math.round(this._renders / sec);
      this.stats.lawPct    = Math.round((this.stats.physSec / this.stats.target) * 100);
      this._steps = 0; this._renders = 0; this._winStart = now;
      // virtual figure piggybacks the window refresh
      try { this.stats.virtual = Math.round(window._FpsCounter?.avgVirtual ?? 0); } catch (_) {}
    }
  },

  /** Once per painted frame (inside shouldRender). */
  paint() { this._renders++; },
};

export default CycleMeter;
