/**
 * js/modules/debug/debug-state.js
 * Central configuration for debug panels.
 */
export const DEBUG_STATE = {
  // ── THE RATIO KEEPER ──
  // 1.0 = normal, 1.25 = 25% larger, 1.5 = 50% larger.
  // All padding, fonts, and widths multiply by this to keep exact proportions.
  scale: 1.0,
  
  style: {
    bg: 'rgba(8, 8, 18, 0.88)',
    border: 'rgba(255, 255, 255, 0.18)',
    textDim: 'rgba(240, 245, 255, 0.6)',
    textFaint: 'rgba(240, 245, 255, 0.4)',
    accent: 'rgba(130, 210, 255, 0.9)',
    font: '"Space Mono", ui-monospace, monospace',
    
    // Base values (multiplied by 'scale' in the renderer)
    fontSize: 11,
    padX: 10,
    padY: 6,
    radius: 10,
    lineHeight: 15,
    labelW: 95,
    valW: 45,
    shadowBlur: 12,
    shadowOffsetY: 4,
    shadowColor: 'rgba(0, 0, 0, 0.4)'
  },
  
  resolutionScale: 1.0, // Strictly for offscreen canvas pixel density
  defaultPositions: {
    drawCalls: { x: 16, y: 80 },
    physics: { x: 16, y: 220 }
  },
  refreshRates: [16, 33, 100, 250, 500],
  defaultRefreshIdx: 2
};