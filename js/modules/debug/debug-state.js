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

  // ── VIEW ZOOM ──
  // A pure canvas transform applied at draw time — zooms OUT from the panel
  // layer so you can see the whole debug surface at once. Does NOT touch
  // panel sizing (that's PANEL SETTINGS / scale above). 1.0 = 100%; range
  // allows real zoom-out AND zoom-in (clamped in in-ui). Starts one zm-out
  // step below 100%. FIT frames the whole debug screen (every visible panel).
  // EDITABLE only inside debug (panel mode); outside debug the zoom bar goes
  // back to the camera and pinned tuning panels render LOCKED at this value.
  // Console mode ignores it.
  viewZoom: 0.55,   // zoomed OUT to fit the ×2 panel ratio in the same screen footprint

  // ── VIEW PAN ──
  // Screen-px translation of the panel layer, driven by the PAN PAD while
  // debug+panel mode is active (outside debug the pad pans the camera and this
  // is LOCKED, like viewZoom). Draw transform is
  // translate(viewPanX, viewPanY) → scale(viewZoom). FIT resets both to home.
  viewPanX: 0,
  viewPanY: 0,

  // ── MARQUEE (know-it-all rectangle) ──
  // Hold-press on empty space in debug+panel mode → selection rect. Written by
  // in-debug, drawn by DebugRouter.drawAll inside the view transform (coords
  // are PANEL-space). null when idle; {active, x0, y0, x1, y1} while dragging.
  marquee: null,

  // ── SELECTION (the marquee's result) ──
  // Panel ids caught by the last marquee. Persists after release: drawn as an
  // animated (LED-marching) rectangle that re-fits LIVE to the bounding box of
  // the selected panels — lowest X to farthest X+w, same for Y — no matter
  // where the panels move. null / empty = no selection.
  selection: null,

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
    knobR: 14,
    shadowBlur: 12,
    shadowOffsetY: 4,
    shadowColor: 'rgba(0, 0, 0, 0.4)'
  },

  resolutionScale: 1.0,
  defaultPositions: {
    drawCalls: { x: 16, y: 80  },
    physics:   { x: 16, y: 220 },
    queops:    { x: 16, y: 360 },
    aim:       { x: 16, y: 500 }
  },
  refreshRates: [16, 33, 100, 250, 500],
  defaultRefreshIdx: 2
};
