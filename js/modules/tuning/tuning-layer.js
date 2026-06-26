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

export const TuningLayer = {
  _panels: [],

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

  // Called every rAF from main.js — outside debug toggle gate
  drawAll(ctx) {
    if (this._panels.length === 0) return;

    const now = performance.now();

    for (const panel of this._panels) {
      // Same isDue/markRendered pattern as DebugRouter — shared timer, no conflict
      if (panel.isDue(now)) {
        panel.markRendered(now);
        if (window._DebugRouter) {
          panel._cachedData = window._DebugRouter._getDataForPanel(panel);
        }
      }
      DebugRenderer.renderPanel(ctx, panel, panel._cachedData ?? {});
    }
  },

  get count() {
    return this._panels.length;
  }
};

// Expose globally so Panel.pin() can reach it without circular imports
window._TuningLayer = TuningLayer;

export default TuningLayer;
