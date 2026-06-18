/**
 * js/modules/debug/debug-router.js
 * Manages debug panel states, visibility, and individual configurations.
 */

import { DEBUG_CONFIG, scaled } from './debug-state.js';

export const DebugRouter = {
  // ── PANEL STATES ──
  panels: {
    drawCalls: {
      enabled: true,
      scale: DEBUG_CONFIG.SCALE,
      offsetY: -90,               // Shift up from center
      label: 'DRAW CALLS',
    },
    physics: {
      enabled: true,
      scale: DEBUG_CONFIG.SCALE,
      offsetY: 90,                // Shift down from center
      label: 'PHYSICS OPS',
    },
    // Add more panels here as needed:
    // memory: { enabled: false, scale: 1.0, offsetY: 0, label: 'MEMORY' },
    // network: { enabled: false, scale: 1.0, offsetY: 0, label: 'NETWORK' },
  },

  // ── MASTER TOGGLE ──
  masterEnabled: true,

  /**
   * Toggle a specific panel on/off
   */
  togglePanel(panelName) {
    if (this.panels[panelName]) {
      this.panels[panelName].enabled = !this.panels[panelName].enabled;
      console.log(`[DebugRouter] ${panelName} panel: ${this.panels[panelName].enabled ? 'ON' : 'OFF'}`);
    }
  },

  /**
   * Toggle all panels on/off
   */
  toggleAll() {
    this.masterEnabled = !this.masterEnabled;
    console.log(`[DebugRouter] Master debug: ${this.masterEnabled ? 'ON' : 'OFF'}`);
  },

  /**
   * Set scale for a specific panel   */
  setPanelScale(panelName, scale) {
    if (this.panels[panelName]) {
      this.panels[panelName].scale = scale;
      console.log(`[DebugRouter] ${panelName} scale set to ${scale}`);
    }
  },

  /**
   * Set global scale for all panels
   */
  setGlobalScale(scale) {
    DEBUG_CONFIG.SCALE = scale;
    for (const panel in this.panels) {
      this.panels[panel].scale = scale;
    }
    console.log(`[DebugRouter] Global scale set to ${scale}`);
  },

  /**
   * Get computed options for a panel (merges defaults with panel-specific overrides)
   */
  getPanelOptions(panelName) {
    const panel = this.panels[panelName];
    if (!panel) return null;

    const scale = panel.scale || DEBUG_CONFIG.SCALE;

    return {
      enabled: panel.enabled && this.masterEnabled,
      scale: scale,
      offsetY: panel.offsetY || 0,
      label: panel.label || panelName.toUpperCase(),
      
      // Computed scaled values
      fontSize: scaled(DEBUG_CONFIG.FONT_SIZE, scale),
      padX: scaled(DEBUG_CONFIG.PAD_X, scale),
      padY: scaled(DEBUG_CONFIG.PAD_Y, scale),
      radius: scaled(DEBUG_CONFIG.RADIUS, scale),
      safeMargin: scaled(DEBUG_CONFIG.SAFE_MARGIN, scale),
      shadowBlur: scaled(DEBUG_CONFIG.SHADOW_BLUR, scale),
      shadowOffsetY: scaled(DEBUG_CONFIG.SHADOW_OFFSET_Y, scale),
      lineH: scaled(DEBUG_CONFIG.FONT_SIZE + DEBUG_CONFIG.LINE_HEIGHT_EXTRA, scale),
      labelW: scaled(DEBUG_CONFIG.LABEL_WIDTH, scale),
      valW: scaled(DEBUG_CONFIG.VALUE_WIDTH, scale),
      
      // Colors
      color: DEBUG_CONFIG.COLOR,
      accent: DEBUG_CONFIG.ACCENT,
      bg: DEBUG_CONFIG.BG,      border: DEBUG_CONFIG.BORDER,
      fontFamily: DEBUG_CONFIG.FONT_FAMILY,
      shadowColor: DEBUG_CONFIG.SHADOW_COLOR,
    };
  },

  /**
   * Draw all enabled panels
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} counters - Object containing counter instances
   */
  drawAll(ctx, counters) {
    if (!this.masterEnabled) return;

    // Draw Draw Calls panel
    if (this.panels.drawCalls.enabled && counters.drawCalls) {
      const opts = this.getPanelOptions('drawCalls');
      counters.drawCalls.draw(ctx, opts);
    }

    // Draw Physics panel
    if (this.panels.physics.enabled && counters.physics) {
      const opts = this.getPanelOptions('physics');
      counters.physics.draw(ctx, opts);
    }

    // Add more panels here as needed
  },

  /**
   * Reset all counters
   * @param {object} counters
   */
  resetAll(counters) {
    if (counters.drawCalls) counters.drawCalls.reset();
    if (counters.physics) counters.physics.reset();
  },
};