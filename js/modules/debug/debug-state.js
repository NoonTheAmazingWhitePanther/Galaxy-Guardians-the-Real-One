/**
 * js/modules/debug/debug-state.js
 * Central configuration for debug panels.
 *
 * FIX (2026-06-19): Added dpr field so renderer and hit-test use the same scale.
 * dpr is set once in main.js resize() via DEBUG_STATE.setDpr().
 */
export const DEBUG_STATE = {
  // ── THE RATIO KEEPER ──
  scale: 1.0,

  // Device pixel ratio — set by main.js resize(), read by renderer + hit-test
  dpr: 1,
  setDpr(v) { this.dpr = v; },

  style: {
    bg: 'rgba(8, 8, 18, 0.88)',
    border: 'rgba(255, 255, 255, 0.18)',
    textDim: 'rgba(240, 245, 255, 0.6)',
    textFaint: 'rgba(240, 245, 255, 0.4)',
    accent: 'rgba(130, 210, 255, 0.9)',
    font: '"Space Mono", ui-monospace, monospace',

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

  resolutionScale: 1.0,
  defaultPositions: {
    drawCalls: { x: 16, y: 80  },
    physics:   { x: 16, y: 220 },
    queops:    { x: 16, y: 360 }
  },
  refreshRates: [16, 33, 100, 250, 500],
  defaultRefreshIdx: 2
};
