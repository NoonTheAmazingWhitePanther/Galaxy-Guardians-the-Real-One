/**
 * js/core/render-governor.js
 * Real Time Engine Tuning — Render side.
 *
 * Controls how many frames actually draw per second by skipping
 * render calls. Skip frames when scene is stable, draw full when
 * camera is moving or bodies are changing fast.
 *
 * Tuning buttons on debug panel: ➕ (add) and ➖ (subtract)
 * Idle (🟰) resets to baseline.
 *
 * Chaos signal: camera velocity + max body delta position per frame.
 * High chaos → skip 0 frames (draw everything)
 * Low chaos  → skip more frames (coast)
 *
 * pressure: 0.0 = full coast (max skip), 1.0 = full burn (draw every frame)
 */

const SKIP_MIN  = 0;   // draw every frame
const SKIP_MAX  = 8;   // draw 1 in every 9 frames
const SKIP_BASE = 0;   // baseline: draw every frame
const ADD_STEP  = 1;   // ➕ / ➖ step size
const AUTO_LERP = 0.05;

let _skip        = SKIP_BASE;  // frames to skip between draws
let _skipCounter = 0;          // counts skipped frames
let _manual      = false;
let _chaosSignal = 0;

export const RenderGovernor = {

  get skip()     { return Math.round(_skip); },
  get pressure() { return 1 - _skip / SKIP_MAX; },
  get isManual() { return _manual; },

  /** Call from main.js each frame. Returns true if this frame should render. */
  shouldRender() {
    if (_skipCounter < Math.round(_skip)) {
      _skipCounter++;
      return false;
    }
    _skipCounter = 0;
    return true;
  },

  /** Call from main.js with scene chaos signals */
  feedChaos(cameraVelocity, maxBodyDelta, didPhysicsTick) {
    // Normalize chaos 0..1
    const camChaos  = Math.min(cameraVelocity / 50, 1);
    const bodyChaos = Math.min(maxBodyDelta / 10, 1);
    const tickBonus = didPhysicsTick ? 0.5 : 0;
    _chaosSignal    = Math.min(camChaos + bodyChaos + tickBonus, 1);
    if (!_manual) this._autoAdjust();
  },

  _autoAdjust() {
    // High chaos → skip toward 0 (draw everything)
    // Low chaos  → skip toward SKIP_MAX (coast)
    const target = (1 - _chaosSignal) * SKIP_MAX * 0.4;
    _skip += (target - _skip) * AUTO_LERP;
    _skip  = Math.max(SKIP_MIN, Math.min(SKIP_MAX, _skip));
  },

  /** ➕ — skip more frames (cheaper render) */
  add() {
    _manual = true;
    _skip   = Math.min(Math.round(_skip) + ADD_STEP, SKIP_MAX);
  },

  /** ➖ — skip fewer frames (more responsive) */
  subtract() {
    _manual = true;
    _skip   = Math.max(Math.round(_skip) - ADD_STEP, SKIP_MIN);
  },

  /** 🟰 — reset to baseline, re-enable auto */
  idle() {
    _manual = false;
    _skip   = SKIP_BASE;
    _skipCounter = 0;
  },

  /** Human-readable */
  get label() {
    const s = Math.round(_skip);
    const hz = s === 0 ? '60hz' : `1/${s + 1}`;
    return `${hz}${_manual ? ' 🔒' : ''}`;
  }
};
