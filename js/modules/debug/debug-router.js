/**
 * js/modules/debug/debug-router.js
 */
import { GovernorRegistry, ManualOverrides, PhysicsGov, RenderGov, InputGov, CacheGov } from './governor.js';
import { Panel } from './panel.js';
import { MasterGovernor } from './master-governor.js';
import { DEBUG_STATE } from './debug-state.js';
import { DebugRenderer } from '../rendering/debug-renderer.js';
import { Accumulator } from '../rendering/accumulator.js';
import { PhysicsCounter } from './physics-counter.js';
import { DrawCallCounter } from './draw-call-counter.js';
import { QueOps } from '../../core/que-ops.js';
import { Aims } from '../../core/aims.js';
import { config } from '../../core/config.js';
import { FpsCounter } from './fps-counter.js';
import { MsProbe } from '../../core/ms-probe.js';
import { StateCache } from '../../core/state-cache.js';
import { FutureCache } from '../../core/future-cache.js';
import { GovernorProfiles } from './governor-profiles.js';

export const DebugRouter = {
  panels: [],
  masterEnabled: true,
  _canvas: null,
  _config: null,
  _initialized: false,

  async init(canvas) {
    this._canvas = canvas;

    GovernorRegistry.register('PhysicsGov',      PhysicsGov);
    GovernorRegistry.register('RenderGov',        RenderGov);
    GovernorRegistry.register('InputGov',         InputGov);
    GovernorRegistry.register('CacheGov',         CacheGov);
    GovernorRegistry.register('ManualOverrides',  ManualOverrides);
    GovernorRegistry.register('QueOps',           QueOps);
    GovernorRegistry.register('Aims',             Aims);
    GovernorRegistry.register('PhysicsCounter',   PhysicsCounter);
    GovernorRegistry.register('DrawCallCounter',  DrawCallCounter);
    GovernorRegistry.register('Accumulator',      Accumulator);
    GovernorRegistry.register('config',           config);
    GovernorRegistry.register('FpsCounter',       FpsCounter);
    GovernorRegistry.register('MsProbe',          MsProbe);
    GovernorRegistry.register('StateCache',       StateCache);
    GovernorRegistry.register('FutureCache',      FutureCache);
    GovernorRegistry.register('GovernorProfiles', GovernorProfiles);

    window._DebugRouter = this;
    window._GovernorProfiles = GovernorProfiles;
    window._ManualOverrides = ManualOverrides;

    try {
      const response = await fetch('./js/modules/debug/debug-config.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this._config = await response.json();
    } catch (err) {
      console.warn('[DebugRouter] Config load failed:', err);
      this._config = { panels: [] };
    }

    this.panels = [];
    for (const panelCfg of this._config.panels) {
      const panel = new Panel(panelCfg, panelCfg.position?.x, panelCfg.position?.y);
      this.panels.push(panel);
    }

    for (const panel of this.panels) {
      MasterGovernor.register(panel);
    }
    MasterGovernor.lockRatios();

    this._initialized = true;
  },

  _getDataForPanel(panel) {
    switch (panel.id) {
      case 'governor':   return GovernorProfiles;
      case 'fps':        return FpsCounter.debugInfo;
      case 'physics':    return PhysicsCounter;
      case 'input':      return InputGov;
      case 'drawCalls':  return DrawCallCounter;
      case 'queops':     return QueOps.getDebugInfo();
      case 'aim':        return Aims.debugInfo;
      case 'msProbe':    return MsProbe.allAsMap();
      case 'stateCache': return StateCache.debugInfo;
      default:           return {};
    }
  },

  // Called every rAF unconditionally — but only does work when needed
  updateData() {
    if (!this._initialized) return;

    const debugOn  = this.masterEnabled;
    const tuningOn = window._TuningLayer?._panels?.length > 0;

    // Nothing active — skip entirely, zero overhead
    if (!debugOn && !tuningOn) return;

    const now = performance.now();

    for (const panel of this.panels) {
      // Debug on → update all panels
      // Tuning on (debug off) → update only pinned panels
      const shouldUpdate = debugOn || (tuningOn && panel.pinned);
      if (!shouldUpdate) continue;

      if (panel.isDue(now)) {
        panel.markRendered(now);
        panel._cachedData = this._getDataForPanel(panel);
        panel._dataDirty  = true;
      }
    }
  },

  drawAll(ctx) {
    if (!this.masterEnabled || !this._initialized) return;

    // Data already updated by updateData() — just draw
    for (const panel of this.panels) {
      if (!panel.visible) continue;
      DebugRenderer.renderPanel(ctx, panel, panel._cachedData ?? {});
    }

    DebugRenderer.renderMasterSlider(ctx, this.panels);
  },

  toggleAll() {
    this.masterEnabled = !this.masterEnabled;
    // Force all panels to redraw — pin button visibility changes with debug state
    for (const panel of this.panels) panel._chromeDirty = true;
    try { window.InAims?.onDebugToggle(this.masterEnabled); } catch (_) {}
  },

  resetAll() {
    PhysicsCounter.reset();
  }
};
