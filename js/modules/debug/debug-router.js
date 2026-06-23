/**
 * js/modules/debug/debug-router.js
 * Central hub for debug panels.
 */
import { GovernorRegistry, ManualOverrides, PhysicsGov, RenderGov } from './governor.js';
import { Panel } from './panel.js';
import { MasterGovernor } from './master-governor.js';
import { DEBUG_STATE } from './debug-state.js';
import { DebugRenderer } from '../rendering/debug-renderer.js';
import { DebugOverlay } from './debug-overlay.js';
import { Accumulator } from '../rendering/accumulator.js';
import { PhysicsCounter } from './physics-counter.js';
import { DrawCallCounter } from './draw-call-counter.js';
import { QueOps } from '../../core/que-ops.js';
import { Aims } from '../../core/aims.js';
import { config } from '../../core/config.js';

export const DebugRouter = {
  panels: [],
  masterEnabled: true,
  _canvas: null,
  _config: null,
  _initialized: false,

  async init(canvas) {
    this._canvas = canvas;

    // ── Register ALL modules for variable resolution ──────────────────────
    GovernorRegistry.register('PhysicsCounter', PhysicsCounter);
    GovernorRegistry.register('DrawCallCounter', DrawCallCounter);
    GovernorRegistry.register('QueOps', QueOps);
    GovernorRegistry.register('Aims', Aims);
    GovernorRegistry.register('Accumulator', Accumulator);
    GovernorRegistry.register('ManualOverrides', ManualOverrides);
    GovernorRegistry.register('PhysicsGov', PhysicsGov);
    GovernorRegistry.register('RenderGov', RenderGov);
    GovernorRegistry.register('config', config);

    // ── Load config ───────────────────────────────────────────────────────
    try {
      const response = await fetch('./js/modules/debug/debug-config.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this._config = await response.json();
      console.log('[DebugRouter] Config loaded:', this._config.panels.length, 'panels');
    } catch (err) {
      console.warn('[DebugRouter] Failed to load config, using fallback:', err);
      this._config = this._getFallbackConfig();
    }

    // ── Create panels ─────────────────────────────────────────────────────    this.panels = [];
    for (const panelCfg of this._config.panels) {
      const panel = new Panel(panelCfg, panelCfg.position?.x, panelCfg.position?.y);
      this.panels.push(panel);
    }

    // ── Register panels with MasterGovernor ───────────────────────────────
    for (const panel of this.panels) {
      MasterGovernor.register(panel);
    }
    MasterGovernor.lockRatios();

    this._initialized = true;
    console.log('[DebugRouter] Initialized with', this.panels.length, 'panels');
  },

  _getFallbackConfig() {
    return {
      panels: [
        {
          id: 'physics',
          title: 'PHYSICS',
          position: { x: 16, y: 220 },
          refreshRate: 100,
          summaryVariable: 'PhysicsGov.timeScale',
          summaryLabel: 'Time Scale',
          lines: [
            { type: 'header', text: 'PHYSICS', value: 'PhysicsCounter.total', color: 'accent', bold: true },
            { type: 'display', text: 'Particles', value: 'PhysicsCounter.stats.particlesIntegrated' }
          ]
        }
      ]
    };
  },

  _getDataForPanel(panel) {
    switch (panel.id) {
      case 'physics':   return PhysicsCounter;
      case 'drawCalls': return DrawCallCounter;
      case 'queops':    return QueOps.getDebugInfo();
      case 'aim':       return Aims.debugInfo;
      default:          return {};
    }
  },

  drawAll() {
  if (!this.masterEnabled) return;
  if (!this._initialized) return;

  // MUST CLEAR - this is the overlay canvas, independent of game
  DebugOverlay.clear();

  const now = performance.now();
  const ctx = DebugOverlay.ctx;

  for (const panel of this.panels) {
    if (!panel.visible) continue;
    if (!panel.shouldRender(now)) continue;
    const data = this._getDataForPanel(panel);
    DebugRenderer.renderPanel(ctx, panel, data);
  }

  DebugRenderer.renderMasterSlider(ctx, this.panels);
},

  toggleAll() {
    this.masterEnabled = !this.masterEnabled;
    console.log('[DebugRouter] Master enabled:', this.masterEnabled);
    try { window.InAims?.onDebugToggle(this.masterEnabled); } catch (_) {}
  },

  resetAll() {
    DrawCallCounter.reset();
    PhysicsCounter.reset();
  }
};