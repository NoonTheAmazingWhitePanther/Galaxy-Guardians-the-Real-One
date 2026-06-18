/**
 * js/modules/debug/debug-router.js
 * Central Hub. STATE & RENDERING ONLY. No input listeners.
 */
import { DrawCallCounter } from './draw-call-counter.js';
import { PhysicsCounter } from './physics-counter.js';
import { DebugRenderer } from '../rendering/debug-renderer.js';
import { DEBUG_STATE } from './debug-state.js';

export const DebugRouter = {
  panels: [],
  masterEnabled: true,

  init(canvas) {
    DrawCallCounter.install();

    this.panels = [
      {
        id: 'drawCalls', type: 'drawCalls', visible: true,
        x: DEBUG_STATE.defaultPositions.drawCalls.x,
        y: DEBUG_STATE.defaultPositions.drawCalls.y,
        refreshRate: DEBUG_STATE.refreshRates[DEBUG_STATE.defaultRefreshIdx],
        lastUpdate: 0,
        refreshRates: DEBUG_STATE.refreshRates,
        currentRateIdx: DEBUG_STATE.defaultRefreshIdx
      },
      {
        id: 'physics', type: 'physics', visible: true,
        x: DEBUG_STATE.defaultPositions.physics.x,
        y: DEBUG_STATE.defaultPositions.physics.y,
        refreshRate: DEBUG_STATE.refreshRates[DEBUG_STATE.defaultRefreshIdx],
        lastUpdate: 0,
        refreshRates: DEBUG_STATE.refreshRates,
        currentRateIdx: DEBUG_STATE.defaultRefreshIdx
      }
    ];
  },

  resetAll() {
    DrawCallCounter.reset();
    PhysicsCounter.reset();
  },

  drawAll(ctx) {
    if (!this.masterEnabled) return;
    const now = performance.now();
    for (const panel of this.panels) {
      if (!panel.visible) continue;
      if (now - panel.lastUpdate >= panel.refreshRate) {
        panel.lastUpdate = now;
      }
      const data = panel.type === 'drawCalls' ? DrawCallCounter : PhysicsCounter;
      if (data) DebugRenderer.renderPanel(ctx, panel, data);
    }
  },

  toggleAll() {
    this.masterEnabled = !this.masterEnabled;
  }
};