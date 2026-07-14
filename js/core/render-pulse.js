/**
 * js/core/render-pulse.js
 * THE RENDER PULSE — the fixed heartbeat of the frame.
 *
 * THE LAW: the presentation renders on a fixed grid — every 16.6ms at the
 * default 60, raisable to 120 / 240 / 360 / 480 via the pulseHz knob —
 * constant forever, no matter the CPU load. Frame skipping is DEMOTED: it
 * may skip work INSIDE the pulse window (decorations, tails, deferred ops),
 * but it may never skip the beat itself. The head — the frame, the bodies,
 * the first trail segment — renders on every beat.
 *
 * HOW "no matter what" actually holds in a browser: rAF is the only door
 * to the screen and JS is one thread, so a beat cannot be conjured while
 * the thread is blocked. The law is therefore enforced as a DEADLINE:
 * every frame knows its next beat boundary, QueOps is handed exactly the
 * time remaining to it (work that doesn't fit is DELAYED, never allowed to
 * push the beat), and the beat render is unconditional whenever a boundary
 * has passed. Above the display's real Hz, extra beats can't paint extra
 * frames — they tighten the deadline and sharpen the diagnosis instead:
 * at 240 the blame window is 4.17ms.
 *
 * THE VERDICT — "declare what is the problem in between 16.6": every frame
 * is bracketed into phases (physics · queops · data · render · debug ·
 * other) with plain performance.now() marks. When a frame overruns its
 * pulse window, the phase that ate the most of it is BLAMED, counted, and
 * named. The ledger is the stethoscope: stabilize 60 by reading who keeps
 * breaking it.
 */

import { ManualOverrides, ScreenGov } from '../modules/debug/governor.js';

const HZ_LADDER = [60, 120, 240, 360, 480];

export const RenderPulse = {
  _t0: 0,                 // grid origin
  _lastBeatRendered: -1,  // index of the last beat that got its head render
  _frameStart: 0,
  _lastMark: 0,
  _phases: {},            // this frame's ms per phase
  beatDue: false,

  // The ledger — who broke the pulse, how often, how badly.
  ledger: { overruns: 0, frames: 0, blame: {}, worstMs: 0, lastBlame: '—' },

  get hz() {
    const v = ManualOverrides.get('pulseHz', 60);
    // snap to the ladder — the grid only speaks these
    return HZ_LADDER.reduce((b, h) => Math.abs(h - v) < Math.abs(b - v) ? h : b, 60);
  },
  get interval() { return 1000 / this.hz; },

  // ── Frame lifecycle ──────────────────────────────────────────────────────
  beginFrame(t) {
    if (!this._t0) this._t0 = t;
    this._frameStart = t;
    this._lastMark = performance.now();
    this._phases = {};
    // A beat is due if a grid boundary passed since the last head render.
    const beatIdx = Math.floor((t - this._t0) / this.interval);
    this.beatDue = beatIdx > this._lastBeatRendered;
    return this.beatDue;
  },

  // The head rendered — this beat is honored.
  markRendered(t) {
    this._lastBeatRendered = Math.floor((t - this._t0) / this.interval);
  },

  // Time left inside the current pulse window — QueOps' door.
  budgetLeft() {
    const now = performance.now();
    const into = (now - this._t0) % this.interval;
    return Math.max(0.5, this.interval - into);
  },

  // ── Phase marks — cheap brackets, one now() each ─────────────────────────
  mark(phase) {
    const now = performance.now();
    this._phases[phase] = (this._phases[phase] || 0) + (now - this._lastMark);
    this._lastMark = now;
  },

  endFrame() {
    const now = performance.now();
    this._phases.other = (this._phases.other || 0) + (now - this._lastMark);
    const dur = now - this._frameStart;
    const L = this.ledger;
    L.frames++;
    if (dur > this.interval + 0.5) {                 // the pulse broke
      L.overruns++;
      if (dur > L.worstMs) L.worstMs = +dur.toFixed(1);
      let blame = 'other', worst = 0;
      for (const [k, v] of Object.entries(this._phases)) {
        if (v > worst) { worst = v; blame = k; }
      }
      L.blame[blame] = (L.blame[blame] || 0) + 1;
      L.lastBlame = `${blame} ${worst.toFixed(1)}ms of ${this.interval.toFixed(1)}`;
    }
  },

  resetLedger() {
    this.ledger = { overruns: 0, frames: 0, blame: {}, worstMs: 0, lastBlame: '—' };
  },

  get debugInfo() {
    const L = this.ledger;
    return {
      hz: this.hz,
      intervalMs: +this.interval.toFixed(2),
      displayHz: ScreenGov.hz,
      frames: L.frames,
      overruns: L.overruns,
      overrunPct: L.frames ? +(L.overruns * 100 / L.frames).toFixed(1) : 0,
      worstMs: L.worstMs,
      lastBlame: L.lastBlame,
      blame: { ...L.blame },
    };
  },
};

if (typeof window !== 'undefined') window.RenderPulse = RenderPulse;

export default RenderPulse;
