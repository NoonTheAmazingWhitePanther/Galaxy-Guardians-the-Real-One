/**
 * js/modules/tuning/tuning-layer.js
 *
 * Holds references to pinned debug panels and draws them every rAF
 * regardless of whether the debug overlay is toggled on or off.
 *
 * Panels are not duplicated — the same Panel instance is reused.
 * TuningLayer just calls renderPanel on its own list.
 *
 * Usage:
 *   TuningLayer.drawAll(ctx)  — called from mainLoop every frame
 *   TuningLayer.add(panel)    — called by panel.pin()
 *   TuningLayer.remove(panel) — called by panel.unpin()
 */
import { DebugRenderer } from '../rendering/debug-renderer.js';
import { MasterSliderRenderer } from '../debug/master-slider-renderer.js';
import { DEBUG_STATE } from '../debug/debug-state.js';

export const TuningLayer = {
  _panels: [],
  _suspended: null,   // stash while a benchmark owns the screen

  // Benchmark clean-slate: pull every pinned panel off the layer without
  // losing them — resume() puts the exact list back. Idempotent both ways.
  suspend() {
    if (this._suspended) return;
    this._suspended = this._panels;
    this._panels = [];
  },
  resume() {
    if (!this._suspended) return;
    this._panels = this._suspended;
    this._suspended = null;
  },

  add(panel) {
    if (!this._panels.includes(panel)) {
      this._panels.push(panel);
      console.log(`[TuningLayer] Pinned: ${panel.id}`);
    }
  },

  remove(panel) {
    this._panels = this._panels.filter(p => p !== panel);
    console.log(`[TuningLayer] Unpinned: ${panel.id}`);
  },

  // Called every rAF from main.js inside shouldRender block.
  // Only draws when debug is OFF — when debug is ON, DebugRouter.drawAll
  // already draws pinned panels as part of its normal panel list.
  drawAll(ctx) {
    if (this._panels.length === 0) return;
    if (window._DebugRouter?.masterEnabled) return;

    // Pinned tuning panels HOLD the debug view transform (zoom + pan), locked:
    // outside debug the zoom bar / pan pad drive the CAMERA, so this value can
    // only be edited from inside debug. Same transform as DebugRouter.drawAll →
    // a pinned panel keeps its exact on-screen place when debug toggles off.
    const vz = DEBUG_STATE.viewZoom || 1;
    const px = DEBUG_STATE.viewPanX || 0;
    const py = DEBUG_STATE.viewPanY || 0;
    ctx.save();
    if (px || py) ctx.translate(px, py);
    if (vz !== 1) ctx.scale(vz, vz);
    for (const panel of this._panels) {
      DebugRenderer.renderPanel(ctx, panel, panel._cachedData ?? {});
    }
    ctx.restore();

    // Debug is OFF here. The global master slider is allowed in this tuning
    // surface too, but only when >=2 panels are pinned — render() self-gates on
    // MasterSliderRenderer.isActive(), which returns true for exactly that case
    // and nulls its own hit-box otherwise. Visible ⟺ touchable, still one rule.
    // Drawn OUTSIDE the transform — fixed size forever (locked rule).
    MasterSliderRenderer.render(ctx, this._panels);
  },

  get count() {
    return this._panels.length;
  }
};

// Expose globally so Panel.pin() can reach it without circular imports
window._TuningLayer = TuningLayer;

// Drain any panels that were pinned before TuningLayer was ready
if (window._tuningPinQueue?.length) {
  for (const panel of window._tuningPinQueue) TuningLayer.add(panel);
  window._tuningPinQueue = [];
}

export default TuningLayer;
