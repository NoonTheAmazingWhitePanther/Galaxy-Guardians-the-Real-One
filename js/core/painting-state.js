/**
 * js/core/painting-state.js
 * Global painting mode toggle.
 * When OFF: brush is disabled, no planets can be planted.
 * When ON: brush works normally.
 */

// Spray brush — scatters multiple stamps around the brush point instead of
// a single stamp per spacing interval. 3 spread levels, cycled by long-press
// on the "spray brush" satellite (paint-sat-spray). Radii are CSS px, same
// space as BRUSH_SPACING in in-planet.js.
const SPREAD_RADII = [20, 40, 70];      // level 0 / 1 / 2 — scatter radius
const SPRAY_COUNT  = [3, 5, 8];         // stamps per trigger, scaled with spread

export const PaintingState = {
  enabled: false,  // Start OFF by default

  spray: {
    enabled: false,
    level: 0,    // index into SPREAD_RADII / SPRAY_COUNT
  },

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
   * Spray brush on/off — tap action for paint-sat-spray.
   */
  toggleSpray: () => {
    PaintingState.spray.enabled = !PaintingState.spray.enabled;
    return PaintingState.spray.enabled;
  },

  /**
   * Cycle spread level 0→1→2→0 — long-press action for paint-sat-spray.
   * Also implicitly turns spray ON, since adjusting spread only makes sense
   * once spraying — matches how a real spray-can's nozzle twist works.
   */
  cycleSpread: () => {
    PaintingState.spray.enabled = true;
    PaintingState.spray.level = (PaintingState.spray.level + 1) % SPREAD_RADII.length;
    return PaintingState.spray.level;
  },

  get sprayRadius() { return SPREAD_RADII[PaintingState.spray.level]; },
  get sprayCount()  { return SPRAY_COUNT[PaintingState.spray.level]; },

  /**
   * Debug info for panel.
   */
  debugInfo: {
    get status() {
      return PaintingState.enabled ? 'ON' : 'OFF';
    }
  }
};
