/**
 * js/modules/debug/master-governor.js
 * ─────────────────────────────────────────────────────────────────────────
 * GLOBAL MASTER SLIDER — controls all panel masters proportionally.
 *
 * This is the "master channel" in the DJ studio metaphor.
 * It scales all per-panel master sliders together, maintaining their ratios.
 *
 * CONCEPT:
 *   - Each panel has its own master slider (panel.panelMasterValue)
 *   - The global master scales ALL of them proportionally
 *   - Ratios between panels are preserved
 *   - Example: if Physics is at 0.5x and Render is at 0.5x,
 *     moving global master to 0.25x makes both 0.25x
 *
 * USAGE:
 *   // 1. Register panels at init (done by debug-router.js)
 *   MasterGovernor.register(panel);
 *
 *   // 2. Lock current ratios as baseline
 *   MasterGovernor.lockRatios();
 *
 *   // 3. Move the global master
 *   MasterGovernor.setValue(0.5);  // All panels scale to 50%
 *   MasterGovernor.setValue(2.0);  // All panels scale to 200%
 *
 *   // 4. Reset to 1.0
 *   MasterGovernor.reset();
 *
 * DEPENDENCIES: none
 * USED BY:
 *   - debug-router.js          (registers panels, calls lockRatios)
 *   - master-slider-renderer.js (reads value for rendering)
 *   - in-debug.js              (calls setValue on drag)
 * ─────────────────────────────────────────────────────────────────────────
 */

export const MasterGovernor = {
  _panels: [],            // registered panel objects
  _baselines: new Map(),  // panelId → baseline value (captured at lockRatios)
  _value: 1.0,            // current multiplier (0.0 to 2.0)

  /**
   * register(panel)
   * ─────────────────────────────────────────────────────────────────────
   * Register a panel to be controlled by the global master.
   *
   * Args:
   *   - panel: panel object with { id, panelMasterValue }
   */  register(panel) {
    this._panels.push(panel);
    this._baselines.set(panel.id, panel.panelMasterValue ?? 1.0);
    console.log(`[MasterGovernor] Registered panel: ${panel.id}`);
  },

  /**
   * unregister(panelId)
   * ─────────────────────────────────────────────────────────────────────
   * Remove a panel from global master control.
   */
  unregister(panelId) {
    this._panels = this._panels.filter(p => p.id !== panelId);
    this._baselines.delete(panelId);
  },

  /**
   * lockRatios()
   * ─────────────────────────────────────────────────────────────────────
   * Lock current ratios. All panels are captured as baselines.
   * Future setValue() calls will scale proportionally from these baselines.
   *
   * Call this after registering all panels to establish the starting mix.
   */
  lockRatios() {
    for (const panel of this._panels) {
      this._baselines.set(panel.id, panel.panelMasterValue ?? 1.0);
    }
    console.log(`[MasterGovernor] Ratios locked at value=${this._value.toFixed(2)}`);
  },

  /**
   * setValue(v)
   * ─────────────────────────────────────────────────────────────────────
   * Set the global master value (0.0 to 2.0).
   * Scales all panel masters proportionally.
   *
   * Args:
   *   - v: multiplier (0.0 = 0%, 1.0 = 100%, 2.0 = 200%)
   */
  setValue(v) {
    this._value = Math.max(0.0, Math.min(2.0, v));

    for (const panel of this._panels) {
      const baseline = this._baselines.get(panel.id) ?? 1.0;
      panel.panelMasterValue = baseline * this._value;
    }
  },

  /**   * reset()
   * ─────────────────────────────────────────────────────────────────────
   * Reset to 1.0 (no scaling).
   */
  reset() {
    this.setValue(1.0);
    console.log(`[MasterGovernor] Reset to 1.0x`);
  },

  /**
   * get value()
   * Current global master value.
   */
  get value() {
    return this._value;
  },

  /**
   * get label()
   * Display label for the global master.
   */
  get label() {
    return `${this._value.toFixed(2)}x`;
  },

  /**
   * get pressure()
   * Visual pressure (0-1) for rendering the slider fill.
   * 0.0 = minimum, 1.0 = maximum, 0.5 = neutral
   */
  get pressure() {
    return this._value / 2.0;
  },

  /**
   * get debugInfo()
   * Debug information for display.
   */
  get debugInfo() {
    const panels = {};
    for (const panel of this._panels) {
      const baseline = this._baselines.get(panel.id) ?? 1.0;
      panels[panel.id] = {
        baseline,
        current: panel.panelMasterValue,
        scaled: (panel.panelMasterValue).toFixed(2)
      };
    }
    return {
      value: this._value,      label: this.label,
      panels
    };
  },

  /**
   * clear()
   * ─────────────────────────────────────────────────────────────────────
   * Clear all registered panels (for testing/reset).
   */
  clear() {
    this._panels = [];
    this._baselines.clear();
    this._value = 1.0;
  }
};

export default MasterGovernor;