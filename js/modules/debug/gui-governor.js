/**
 * js/modules/debug/gui-governor.js
 *
 * GUI GOVERNOR — reserve the frame budget for the interface.
 *
 * When you're tuning, the physics is just heat: every tick spends time on
 * integration, cache top-up, StateCache snapshots and the dormancy scan — data
 * transfer and work that has nothing to do with how the GUI feels. This
 * governor lets you starve the simulation so that time goes to the GUI and
 * input instead, giving a fully responsive, fine-tuned feel.
 *
 * The console is a DOM overlay, so it already repaints at the browser's full
 * rate independent of the sim loop — GUI stays live no matter what. This just
 * decides how much the *simulation* is allowed to spend.
 *
 * Modes (guiGovMode):
 *   0 OFF   — normal. Sim runs live.
 *   1 SLOW  — slow-motion: banked sim-time scaled by slowFactor. The system is
 *             visibly still doing its work, just gently — for when you want to
 *             see that "physics is working", only quieter.
 *   2 PAUSE — physics fully held: no ticks, no cache top-up, no snapshots, no
 *             dormancy scan. The sim is still DRAWN (frozen, visible), the GUI
 *             stays fully live. The work is removed; the picture remains.
 *   3 HALT  — PAUSE plus the canvas is throttled to ~10fps, handing almost the
 *             entire frame to the DOM GUI + input. Maximum power reserved.
 *
 * Tuning is unaffected in every mode — the knobs are ManualOverrides, which the
 * sim state never gates.
 */
import { ManualOverrides } from './governor.js';

const CANVAS_EVERY_HALT = 6;   // draw the canvas 1 frame in 6 during HALT (~10fps @60)

export const GuiGovernor = {
  MODES: ['OFF', 'SLOW', 'PAUSE', 'HALT'],
  _cf: 0,

  get mode()       { return Math.max(0, Math.min(3, Math.round(ManualOverrides.get('guiGovMode', 0)))); },
  get slowFactor() { return Math.max(0.02, Math.min(1, ManualOverrides.get('guiGovSlowFactor', 0.15))); },

  // Sim-time rate this frame: 1 live, slowFactor in SLOW, 0 when held.
  get simRate() { const m = this.mode; return m === 0 ? 1 : m === 1 ? this.slowFactor : 0; },
  get paused()  { return this.mode >= 2; },

  // Should the canvas render this frame? Only HALT throttles it; the DOM GUI
  // (console) is unaffected either way.
  shouldRenderCanvas() {
    if (this.mode !== 3) return true;
    this._cf++;
    return (this._cf % CANVAS_EVERY_HALT) === 0;
  },

  get label() { return this.MODES[this.mode]; },

  get debugInfo() {
    const m = this.mode;
    return {
      mode: this.label,
      sim:  m === 0 ? 'live' : m === 1 ? `slow ${Math.round(this.slowFactor * 100)}%` : 'held',
      gui:  m === 3 ? 'focus · canvas ~10fps' : 'full speed',
      work: m === 0 ? 'running' : m === 1 ? 'working (slow)' : 'held · gui live',
    };
  },
};

export default GuiGovernor;
