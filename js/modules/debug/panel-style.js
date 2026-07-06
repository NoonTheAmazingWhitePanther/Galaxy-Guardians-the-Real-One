/**
 * js/modules/debug/panel-style.js
 *
 * PANEL SETTINGS — the user's live makeover of every debug panel.
 *
 * Every panel reads DEBUG_STATE.style + DEBUG_STATE.scale in computeLayout and
 * in the renderer, so writing to those two places makes ALL panels inherit the
 * change at once. This module is the single writer.
 *
 * Values are SCALES, not pixels (0.25–2.00, where 1.00 = 100% of the base):
 *
 *   psOverall  → DEBUG_STATE.scale   (the overall ratio — the ONLY sizing
 *                surface; the zoom bar is a separate pure VIEW transform via
 *                DEBUG_STATE.viewZoom and never touches sizing)
 *   psLock     → the "keep ratio" tick. 1 = uniform: only the overall ratio
 *                scales, every panel keeps its proportions. 0 = free: the
 *                per-item multipliers below distort each dimension on its own.
 *   psFont/psPad/psLine/psLabelW/psValW/psRadius → per-item multipliers written
 *                as base × mult into DEBUG_STATE.style; computeLayout + the
 *                renderer then multiply by the overall ratio, so the final size
 *                is  base × item × overall.
 *   psKnob     → knob radius = base × overall × psKnob, written to style.knobR.
 *                controls.js derives the knob's TOUCH RECTANGLE from the same
 *                value, so hit area tracks the drawn size automatically.
 *
 * apply() is idempotent (always recomputed from BASE) and cheap, so it is safe
 * to call at the top of every computeLayout.
 */
import { DEBUG_STATE } from './debug-state.js';
import { ManualOverrides } from './governor.js';

// The untouched defaults every multiplier is measured against. Captured here so
// repeated apply() calls never compound.
const BASE = {
  fontSize:   11,
  padX:       10,
  padY:        6,
  radius:     10,
  lineHeight: 15,
  labelW:     95,
  valW:       45,
  knobR:      14,
  minChR:      9,   // minimized mixer channel knob radius
  minMR:      14,   // minimized mixer master knob radius
  minFont:     7,   // minimized mixer label font px
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (k, d) => {
  const o = ManualOverrides[k];
  const v = o ? o.value : undefined;
  return Number.isFinite(v) ? v : d;
};

export const PanelStyle = {
  BASE,

  apply() {
    const overall = clamp(num('psOverall', 2), 0.30, 3.00);   // glasses ratio: ×1 · ×2 · ×3
    const locked  = num('psLock', 1) >= 0.5;

    // Per-item multiplier: forced to 1 while the ratio is locked (uniform scale).
    const im = (k) => (locked ? 1 : clamp(num(k, 1), 0.25, 2.00));

    // Overall ratio → the shared scale keeper (computeLayout/renderer apply it).
    DEBUG_STATE.scale = overall;

    const st = DEBUG_STATE.style;
    // Base × item only — the overall ratio is applied downstream by sc.
    st.fontSize   = round1(BASE.fontSize   * im('psFont'));
    const p       = im('psPad');
    st.padX       = round1(BASE.padX       * p);
    st.padY       = round1(BASE.padY       * p);
    st.lineHeight = round1(BASE.lineHeight * im('psLine'));
    st.labelW     = Math.round(BASE.labelW * im('psLabelW'));
    st.valW       = Math.round(BASE.valW   * im('psValW'));
    st.radius     = round1(BASE.radius     * im('psRadius'));

    // Knobs are NOT scaled by sc downstream, so fold the overall ratio in here
    // (× overall) plus the dedicated knob multiplier. Touch box follows in
    // controls.js getBounds, which reads this same knobR.
    const knobMul = locked ? 1 : clamp(num('psKnob', 1), 0.25, 2.00);
    st.knobR = Math.max(6, Math.round(BASE.knobR * overall * knobMul));

    // Minimized-panel attributes — their OWN knobs (psMinKnob / psMinFont), so
    // the opened panel and the minimized panel possess different looks. Not
    // gated by psLock: the minimized state is a different creature by design.
    const minKnobMul = clamp(num('psMinKnob', 1), 0.25, 2.00);
    const minFontMul = clamp(num('psMinFont', 1), 0.25, 2.00);
    st.minChR      = Math.max(5, Math.round(BASE.minChR  * overall * minKnobMul));  // mixer channel knob
    st.minMasterR  = Math.max(7, Math.round(BASE.minMR   * overall * minKnobMul));  // mixer master knob
    st.minFontSize = Math.max(5, round1(BASE.minFont * overall * minFontMul));      // mixer labels
  },
};

function round1(v) { return Math.round(v * 10) / 10; }

/**
 * headerIcons(pw, sc) — SINGLE source of the header icon geometry.
 * Renderer draws with it, panel.hitTest tests with it: visible ⟺ touchable
 * by construction. Icons are 2× the old fixed 16px at base scale and now
 * follow the overall ratio, with wider breathing room between them.
 * Left → right: 🖌 edit · ⤓ shrink · 📌 pin · ⛶ maximize · ▼ open/close LAST.
 */
export function headerIcons(pw, sc) {
  const size = Math.max(16, Math.round(16 * sc));   // ×2 at the shipped ×2 ratio
  const gap  = Math.max(5,  Math.round(6 * sc));    // better spacing
  const y    = Math.max(4,  Math.round(4 * sc));
  const min  = pw - size - gap;                     // ▼ the open/close — rightmost
  const max  = min - size - gap;
  const pin  = max - size - gap;
  const shr  = pin - size - gap;
  const edt  = shr - size - gap;
  return { size, gap, y, bandH: y * 2 + size,
           xs: { edt, shr, min, pin, max } };
}

export default PanelStyle;
