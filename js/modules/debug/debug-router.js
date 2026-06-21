/**
 * js/modules/debug/debug-router.js
 * Central Hub. STATE & RENDERING ONLY. No input listeners.
 *
 * UPDATED (2026-06-19): Added third panel — QueOps queue monitor.
 */
import { DrawCallCounter } from './draw-call-counter.js';
import { PhysicsCounter }  from './physics-counter.js';
import { DebugRenderer }   from '../rendering/debug-renderer.js';
import { DEBUG_STATE }     from './debug-state.js';
import { QueOps }          from '../../core/que-ops.js';
import { Aims }            from '../../core/aims.js';

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
      },
      {
        id: 'queops', type: 'queops', visible: true,
        x: DEBUG_STATE.defaultPositions.queops.x,
        y: DEBUG_STATE.defaultPositions.queops.y,
        refreshRate: DEBUG_STATE.refreshRates[DEBUG_STATE.defaultRefreshIdx],
        lastUpdate: 0,
        refreshRates: DEBUG_STATE.refreshRates,
        currentRateIdx: DEBUG_STATE.defaultRefreshIdx
      },
      {
        id: 'aim', type: 'aim', visible: true,
        x: DEBUG_STATE.defaultPositions.aim.x,
        y: DEBUG_STATE.defaultPositions.aim.y,
        refreshRate: 16, // always max refresh — aim moves fast
        lastUpdate: 0,
        refreshRates: DEBUG_STATE.refreshRates,
        currentRateIdx: 0
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
      let data;
      if      (panel.type === 'drawCalls') data = DrawCallCounter;
      else if (panel.type === 'physics')   data = PhysicsCounter;
      else if (panel.type === 'queops')    data = QueOps.getDebugInfo();
      else if (panel.type === 'aim')        data = Aims.debugInfo;
      if (data) DebugRenderer.renderPanel(ctx, panel, data);
    }
  },

  toggleAll() {
    this.masterEnabled = !this.masterEnabled;
  }
};
