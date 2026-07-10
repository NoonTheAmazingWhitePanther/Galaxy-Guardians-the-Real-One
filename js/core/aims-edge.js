/**
 * js/core/aims-edge.js
 * AIMS EDGE ASSIST — lets the Offset profile (and the Zoom Enhancer's own
 * magnifier box placement) reach every corner of the screen, not just
 * the corners the base offset (Aims.aim.offsetX/offsetY — always pushes
 * up-and-left, see core/aims.js's AIM_OFFSET_X/Y) happens to favor.
 *
 * The real hardware input is always the thumb (x, y) — the offset is
 * what the user (or the app) declares on top of it. Two guarantees,
 * always true, regardless of mode:
 *
 *   1. The cursor (thumb + offset) is NEVER drawn outside the screen.
 *      Hard clamp, no exceptions — see clamp().
 *   2. Inside the last 5% of width/height near an edge, the offset
 *      AUTOMATICALLY shrinks toward zero and, if pushed further, past
 *      zero into reversal — "a quick camera-like fix," the same way a
 *      3rd-person game camera pulls in and reorients so nothing behind
 *      it hides the character. Continuous, not a snap: the offset
 *      reaches its endpoint (zero) exactly at the edge, and past that
 *      point starts pointing the other way, all as one smooth motion —
 *      see computeSign()/the automate branch.
 *
 * CORRECTED (this pass) — automate used to scale/reverse offsetX and
 * offsetY INDEPENDENTLY, which could distort the direction of the
 * offset (one axis shrinking or flipping while the other didn't).
 * "Keeping the ratio so the feeling be the same" means the two axes
 * shrink and reverse TOGETHER, by the SAME factor, driven by whichever
 * axis is closer to trouble — the offset vector's direction never
 * changes, only its length, until it passes through zero and points
 * the same way in reverse. One shared scale, not two independent ones.
 *
 * EDGE_MARGIN_PCT (this pass) — the trigger zone is 5% of screen width
 * for the X axis and 5% of screen height for the Y axis, not a fixed
 * pixel count — "up to 5 percent of width and 5 percent of height."
 *
 * Manual: aims-sat-mirror satellite, TAP cycles 4 states —
 *   normal → x-eligible → y-eligible → both-eligible → normal
 * "Eligible," not "reversed" — x/y/both SELECT WHICH AXIS is allowed to
 * shrink/reverse when its own edge is caught; the other axis stays flat
 * +1 always. Manual is a deliberate, per-axis, hard on/off (no blend —
 * that's what makes choosing an axis meaningful); automate is the
 * always-both, always-smooth, ratio-preserving version.
 *
 * Automate: HOLD aims-sat-mirror toggles this on/off, independent of and
 * overriding the manual cycle.
 */

export const EDGE_MARGIN_PCT = 0.05;   // 5% of the relevant screen dimension — "up to 5 percent of width and 5 percent of height"
export const AUTOMATE_CLAMP_INSET = 4;   // px — the hard safety clamp keeps the cursor this far inside the true edge, never exactly at 0/width (so the reticle is never half-cut-off), i.e. "the last pixels of the map"

const _state = {
  mode: 'normal',     // 'normal' | 'x' | 'y' | 'both' — WHICH axis is eligible, not whether it's currently flipped
  automate: false
};

// Distance from the CURSOR (anchor + offset already applied — the thing
// actually at risk, not the anchor it was computed from) to whichever
// edge that offset direction pushes toward, accounting for the element's
// own size on that axis (0 for a point). An offset that already pushes
// away from the nearest edge has no relevant edge at all on this axis —
// distance is meaningless, never triggers, regardless of mode.
function _distToRelevantEdge(anchor, extent, baseOffset, elemSize) {
  if (baseOffset === 0) return Infinity;   // nothing to ever reverse on this axis
  const cursor = anchor + baseOffset;   // test the offset-applied cursor, not the raw anchor
  return baseOffset < 0
    ? cursor                              // pushed toward the "0" edge — cursor IS that leading edge already
    : extent - (cursor + elemSize);       // pushed toward the "extent" edge — leading edge is cursor + the element's own size
}

// Manual mode's trigger: a deliberate, hard threshold, per axis. Inside
// the 5%-of-dimension margin of the relevant edge → fully reversed (-1).
// Outside it, anywhere at all, including dead center → fully normal (+1).
// No blend — manual is a yes/no, not a slide; that's what makes it feel
// different from automate rather than a duplicate with fewer axes.
function _axisSignHard(anchor, extent, baseOffset, elemSize) {
  const margin = extent * EDGE_MARGIN_PCT;
  const d = _distToRelevantEdge(anchor, extent, baseOffset, elemSize);
  return d < margin ? -1 : 1;
}

// Automate's per-axis "how much trouble is this axis in," as a fraction:
// 0 = safely clear of its relevant edge, 1 = pushed a full margin's-worth
// PAST it (fully reversed territory). 0.5 lands exactly at the edge
// itself (offset scaled to zero there — "reaches end points at the
// side"). Values beyond [0,1] are clamped — being further past the edge
// than one full margin doesn't need to reverse any harder.
function _axisTrouble(anchor, extent, baseOffset, elemSize) {
  if (baseOffset === 0) return 0;
  const margin = extent * EDGE_MARGIN_PCT;
  const d = _distToRelevantEdge(anchor, extent, baseOffset, elemSize);
  if (d >= margin) return 0;
  const t = (margin - d) / (2 * margin);   // d=margin -> 0, d=0 (at the edge) -> 0.5, d=-margin -> 1
  return Math.max(0, Math.min(1, t));
}

export const AimsEdge = {
  get mode() { return _state.mode; },
  get automate() { return _state.automate; },

  /** Tap — cycles which axis is ELIGIBLE for edge-triggered reversal. Has no effect while automate is on (automate always makes both axes eligible together — see computeSign). */
  cycleMode() {
    const order = ['normal', 'x', 'y', 'both'];
    _state.mode = order[(order.indexOf(_state.mode) + 1) % order.length];
    return _state.mode;
  },

  /** Hold — toggles automate, independent of (and overriding) the manual cycle. */
  toggleAutomate() {
    _state.automate = !_state.automate;
    return _state.automate;
  },

  /**
   * THE shared computation. (anchorX, anchorY) = the point the offset
   * gets ADDED TO — the real thumb for Profile 3, the aim for
   * ZoomEnhancer's box (never the raw anchor tested directly — see the
   * cursor note in the header). (elemW, elemH) — the element's own
   * footprint on each axis, default 0 for a point (the crosshair); pass
   * BOX_SIZE for the zoom box. Returns { signX, signY } — a single
   * multiplier to apply to (baseOffsetX, baseOffsetY) respectively.
   *
   * Automate: ONE shared scale (`signX === signY` always), driven by
   * whichever axis is in the MOST trouble — not two independent per-axis
   * values. This is the fix: scaling X and Y separately could point the
   * offset in a different direction than it started; scaling both by the
   * same factor only ever changes its length, preserving the ratio/
   * direction — "the feeling be the same" — until it passes through
   * zero and reverses, still as one vector.
   *
   * Manual: unchanged shape — independent per-axis hard threshold,
   * restricted to whichever axis the user selected.
   */
  computeSign(anchorX, anchorY, baseOffsetX, baseOffsetY, elemW = 0, elemH = 0) {
    const w = window.innerWidth, h = window.innerHeight;

    if (_state.automate) {
      const troubleX = _axisTrouble(anchorX, w, baseOffsetX, elemW);
      const troubleY = _axisTrouble(anchorY, h, baseOffsetY, elemH);
      const t = Math.max(troubleX, troubleY);   // worst-case axis drives the SHARED scale
      const scale = 1 - 2 * t;                  // +1 (safe) -> 0 (at the edge) -> -1 (past it)
      return { signX: scale, signY: scale };    // same factor on both — ratio preserved
    }

    // Manual — only the ELIGIBLE axis/axes are ever tested for a trigger
    // at all; the other stays flat +1 regardless of position, since the
    // user never selected it. The eligible one(s) still return to +1 the
    // instant the cursor clears the margin — "return normal if I moved
    // away into the center where this could not be triggered."
    const xEligible = (_state.mode === 'x' || _state.mode === 'both');
    const yEligible = (_state.mode === 'y' || _state.mode === 'both');
    return {
      signX: xEligible ? _axisSignHard(anchorX, w, baseOffsetX, elemW) : 1,
      signY: yEligible ? _axisSignHard(anchorY, h, baseOffsetY, elemH) : 1
    };
  },

  /**
   * The hard, unconditional guarantee — "the offset should never be
   * drawn outside of the screen," no exceptions, no mode check. The
   * scaling above handles the smooth, camera-like approach; this is the
   * backstop for whatever it doesn't quite catch (an unlucky combination
   * of a large offset and fast finger movement could still land a few px
   * outside the viewport for one frame). Clamps to
   * [AUTOMATE_CLAMP_INSET, extent-AUTOMATE_CLAMP_INSET] — "push it back
   * to where it needs to be, which is the last pixels of the map."
   * Applied always, in every mode — this one is not conditional.
   */
  clamp(x, y) {
    const w = window.innerWidth, h = window.innerHeight;
    return {
      x: Math.min(Math.max(x, AUTOMATE_CLAMP_INSET), w - AUTOMATE_CLAMP_INSET),
      y: Math.min(Math.max(y, AUTOMATE_CLAMP_INSET), h - AUTOMATE_CLAMP_INSET)
    };
  }
};

export default AimsEdge;
