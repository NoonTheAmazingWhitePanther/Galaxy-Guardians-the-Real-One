/**
 * js/modules/debug/debug-state.js
 * Central configuration for all debug overlays.
 * Change these constants to adjust all debug panels at once.
 */

export const DEBUG_CONFIG = {
  // ── VISUAL CONSTANTS ──
  SCALE: 1.5,                    // Global scale multiplier (1.0 = normal, 1.5 = 50% larger)
  FONT_SIZE: 11,                  // Base font size in pixels
  FONT_FAMILY: '"Space Mono", ui-monospace, monospace',
  
  // ── COLORS (matching CSS variables) ──
  COLOR: 'rgba(240, 245, 255, 0.92)',      // --text-color
  ACCENT: 'rgba(130, 210, 255, 0.9)',      // --accent-color
  BG: 'rgba(8, 8, 18, 0.88)',              // --glass-bg
  BORDER: 'rgba(255, 255, 255, 0.18)',     // --glass-border
  
  // ── SPACING ──
  PAD_X: 10,                      // Horizontal padding
  PAD_Y: 6,                       // Vertical padding
  RADIUS: 10,                     // Border radius
  SAFE_MARGIN: 16,                // Distance from screen edges
  
  // ── SHADOW ──
  SHADOW_BLUR: 12,
  SHADOW_OFFSET_Y: 4,
  SHADOW_COLOR: 'rgba(0, 0, 0, 0.4)',
  
  // ── PANEL SPECIFIC ──
  LINE_HEIGHT_EXTRA: 4,           // Extra space between lines
  LABEL_WIDTH: 95,                // Width for method/label column
  VALUE_WIDTH: 45,                // Width for value column
  
  // ── POSITIONING ──
  POSITION_X: 'LEFT',             // 'LEFT' or 'RIGHT'
  POSITION_Y: 'CENTER',           // 'TOP', 'CENTER', or 'BOTTOM'
};

/**
 * Helper to calculate scaled values
 */
export const scaled = (value, scale = DEBUG_CONFIG.SCALE) => {
  return Math.round(value * scale);
};