/**
 * js/modules/input/aims-profiles.js
 * AIMS PROFILES — three configurations of the same idea: a real finger
 * touch drives a persistent aim point (Aims.aim.x/y), and everything
 * downstream fires at the aim instead of the raw finger. Never "a
 * different input module" — just different math for where the aim goes.
 * See rules.md §8.
 *
 * Each profile implements the same small interface:
 *   onDown(x, y)  — real touch started at (x, y)
 *   onMove(x, y)  — real touch moved to (x, y)
 *   onUp(x, y)    — real touch lifted at (x, y)
 *   tick(dt)      — called every rendered frame while AIMS is enabled,
 *                   REGARDLESS of pointer state (profiles that only move
 *                   while held — Joystick — just no-op when not active).
 *
 * Long-press aims-btn (main.js) cycles Profile 1 → 2 → 3 → 1.
 */
import { Aims } from '../../core/aims.js';
import { AimsEdge } from '../../core/aims-edge.js';

// ── Profile 1 — Trackpad ───────────────────────────────────────────────
// Relative delta, laptop-trackpad style. The aim moves by exactly the
// distance your finger moves, regardless of where on screen you touch —
// precise, good for fine adjustment, doesn't care where the gesture starts.
const Trackpad = {
  id: 'trackpad',
  label: 'Trackpad',
  _lastX: 0, _lastY: 0,
  onDown(x, y) { this._lastX = x; this._lastY = y; },
  onMove(x, y) {
    Aims.aim.x += (x - this._lastX);
    Aims.aim.y += (y - this._lastY);
    this._lastX = x; this._lastY = y;
  },
  onUp() {},
  tick() {}
};

// ── Profile 2 — Joystick ───────────────────────────────────────────────
// "The entire screen is a joystick window" — same rate model as Pan Pad,
// verbatim (PAN_ACCEL/PAN_MAX, 8-way direction snap), just anchored at
// wherever you touch down instead of a fixed pad center. Hold and lean:
// direction is set by how far you've dragged from the down point, power
// ramps over TIME while held (not distance), same hold-and-lean feel
// Pan Pad already has. See in-ui.js's _handlePanPadMove/updatePanPad —
// this is that model, not a reinvention of it.
const PAN_ACCEL = 0.7, PAN_MAX = 3;
const Joystick = {
  id: 'joystick',
  label: 'Joystick',
  _anchorX: 0, _anchorY: 0,
  _dirX: 0, _dirY: 0,
  _power: 0,
  _held: false,
  onDown(x, y) {
    this._anchorX = x; this._anchorY = y;
    this._dirX = 0; this._dirY = 0; this._power = 0;
    this._held = true;
  },
  onMove(x, y) {
    const angle  = Math.atan2(y - this._anchorY, x - this._anchorX);
    const sector = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    this._dirX = Math.cos(sector);
    this._dirY = Math.sin(sector);
  },
  onUp() {
    this._held = false;
    this._dirX = 0; this._dirY = 0; this._power = 0;
  },
  tick() {
    if (!this._held || (this._dirX === 0 && this._dirY === 0)) return;
    this._power = Math.min(this._power + PAN_ACCEL, PAN_MAX);
    Aims.aim.x += this._dirX * this._power;
    Aims.aim.y += this._dirY * this._power;
  }
};

// ── Profile 3 — Offset ─────────────────────────────────────────────────
// The original "finger bias" idea: the aim tracks your real finger 1:1,
// shifted by a fixed correction (Aims.aim.offsetX/offsetY). Direct,
// immediate, no ramp or delta — good when you just want the aim to sit
// slightly away from exactly under your thumb.
//
// AimsEdge (aims-sat-mirror satellite) lets that fixed correction reach
// every corner instead of favoring the up-left corner it naturally
// leans toward: computeSign() gives back ±1 (manual) or a live
// continuous blend (automate) per axis, and automate's clamp() is a
// hard backstop that keeps the result on-screen even in an edge case
// the blend alone doesn't quite catch.
const Offset = {
  id: 'offset',
  label: 'Offset',
  // computeSign tests the CURSOR (x + offsetX, y + offsetY — the actual
  // aim position before mirroring), not the raw finger (x, y) — "mirror
  // the offset from the Aims Cursor, not the real pointer." That
  // correction lives entirely inside computeSign() itself; this caller's
  // signature never needed to change. elemW/elemH default to 0 here —
  // correct for a point-like crosshair; see zoom-enhancer.js for the
  // box-sized case.
  _place(x, y) {
    const { signX, signY } = AimsEdge.computeSign(x, y, Aims.aim.offsetX, Aims.aim.offsetY);
    const raw = { x: x + Aims.aim.offsetX * signX, y: y + Aims.aim.offsetY * signY };
    const clamped = AimsEdge.clamp(raw.x, raw.y);
    Aims.aim.x = clamped.x;
    Aims.aim.y = clamped.y;
  },
  onDown(x, y) { this._place(x, y); },
  onMove(x, y) { this._place(x, y); },
  onUp() {},
  tick() {}
};

const _profiles = [Trackpad, Joystick, Offset];
let _activeIdx = 0;

export const AimsProfiles = {
  get active() { return _profiles[_activeIdx]; },

  cycle() {
    _activeIdx = (_activeIdx + 1) % _profiles.length;
    return _profiles[_activeIdx];
  },

  get all() { return _profiles; }
};

export default AimsProfiles;
