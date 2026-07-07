/**
 * js/core/painting-state.js
 * Global painting mode toggle.
 * When OFF: brush is disabled, no planets can be planted.
 * When ON: brush works normally.
 */

export const PaintingState = {
  enabled: true,  // Start enabled by default

  /**
   * Toggle painting mode.
   */
  toggle: () => {
    PaintingState.enabled = !PaintingState.enabled;
    return PaintingState.enabled;
  },

  /**
   * Set painting state explicitly.
   */
  set: (value) => {
    PaintingState.enabled = !!value;
  },

  /**
   * Check if painting is allowed.
   */
  isAllowed: () => PaintingState.enabled,

  /**
   * Debug info for panel.
   */
  debugInfo: {
    get status() {
      return PaintingState.enabled ? 'ON' : 'OFF';
    }
  }
};
