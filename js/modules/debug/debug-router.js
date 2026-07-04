/**
 * js/modules/debug/debug-router.js
 */
import { GovernorRegistry, ManualOverrides, PhysicsGov, RenderGov, InputGov, CacheGov, TrailGov } from './governor.js';
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
import { Dormancy } from '../../core/dormancy.js';
import { GovernorProfiles } from './governor-profiles.js';
import { TrailProfiles } from './trail-profiles.js';
import { GuiGovernor } from './gui-governor.js';

export const DebugRouter = {
  panels: [],
  masterEnabled: false,         // debug starts OFF — tap 〰️ to open (into console mode)
  _consoleMode: false,          // when true the Live Text Debug console owns the UI
  _preConsoleVisible: null,     // panel visibility snapshot, restored on exit
  _canvas: null,
  _config: null,
  _initialized: false,

  async init(canvas) {
    this._canvas = canvas;

    GovernorRegistry.register('PhysicsGov',      PhysicsGov);
    GovernorRegistry.register('RenderGov',        RenderGov);
    GovernorRegistry.register('InputGov',         InputGov);
    GovernorRegistry.register('CacheGov',         CacheGov);
    GovernorRegistry.register('TrailGov',         TrailGov);
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
    GovernorRegistry.register('Dormancy',         Dormancy);
    GovernorRegistry.register('GuiGovernor',      GuiGovernor);
    GovernorRegistry.register('GovernorProfiles', GovernorProfiles);

    window._DebugRouter = this;
    window._GovernorProfiles = GovernorProfiles;
    window._TrailProfiles = TrailProfiles;
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
    if (this._consoleMode) return;   // Live Text Debug console draws its own DOM overlay instead

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
    // NOTE: do NOT clear the master hit-box here. Debug-off with >=2 pinned is a
    // VALID active state (the tuning surface) — MasterSliderRenderer.isActive()
    // and the tuning-layer render path handle visibility/touch consistently.
    try { window._InAims?.syncDebugPanels(); } catch (_) {}
  },

  // Enter/exit Live Text Debug console mode. Hiding panels also drops their
  // AIMS hit regions (the hit-map is built from visible panels), so taps fall
  // through to the sim behind the glass. Visibility is snapshotted so the exact
  // prior mix is restored on exit.
  setConsoleMode(on) {
    on = !!on;
    if (on === this._consoleMode) return;
    this._consoleMode = on;
    if (on) {
      this._preConsoleVisible = this.panels.map(p => ({ id: p.id, v: p.visible }));
      for (const p of this.panels) { p.visible = false; p._chromeDirty = true; }
      // Console owns the UI now — the canvas master slider is illegal here.
      // Null its hit-box immediately (render won't run in console mode to do it).
      try { window._MasterSlider._bounds = null; } catch (_) {}
    } else {
      const snap = this._preConsoleVisible;
      for (const p of this.panels) {
        const rec = snap?.find(s => s.id === p.id);
        p.visible = rec ? rec.v : true;
        p._chromeDirty = true;
      }
      this._preConsoleVisible = null;
    }
    try { window._InAims?.syncDebugPanels(); } catch (_) {}
  },

  resetAll() {
    PhysicsCounter.reset();
  },

  // ── Satellite-button actions ────────────────────────────────────────────
  // Rebuild the AIMS hit-map after panels change. The real, working call is
  // window._InAims.syncDebugPanels() — NOT the onDebugToggle() used elsewhere,
  // which doesn't exist on InAims and silently no-ops.
  _rebuildAimsMap() {
    try { window._InAims?.syncDebugPanels(); } catch (_) {}
  },

  // Shared packer: minimize every visible panel to its true minimum size and
  // lay them out with uniform spacing. Starts below the top-left toolbar/ray
  // cluster and keeps clear of the right-edge button column, so panels never
  // land under the controls.
  //   vertical  — minimized orientation (false = horizontal, true = vertical)
  //   rowMajor  — true: fill left→right then wrap down (rows)
  //               false: fill top→bottom then wrap right (columns / left-dock)
  _packMinimized({ vertical, rowMajor }) {
    const LEFT   = 16;
    const TOP    = 120;                       // clears speed-bar + debug rays
    const GAP    = 8;
    const RIGHT  = Math.max(LEFT + 60, window.innerWidth  - 70);  // dodge pan-pad/aims column
    const BOTTOM = Math.max(TOP  + 60, window.innerHeight - 16);

    const panels = this.panels.filter(p => p.visible);
    for (const p of panels) {
      p.minimized    = true;
      p._minVertical = vertical;
      p._userMinW    = null;   // drop any user resize so it collapses to minimum
      p._userMinH    = null;
      p._chromeDirty = true;
    }

    let cx = LEFT, cy = TOP, band = 0;
    for (const p of panels) {
      const { w, h } = p.computeLayout(p._cachedData ?? {});
      if (rowMajor) {
        if (cx + w > RIGHT && cx > LEFT) { cx = LEFT; cy += band + GAP; band = 0; }
        p.x = cx; p.y = cy;
        cx  += w + GAP;
        band = Math.max(band, h);
      } else {
        if (cy + h > BOTTOM && cy > TOP) { cy = TOP; cx += band + GAP; band = 0; }
        p.x = cx; p.y = cy;
        cy  += h + GAP;
        band = Math.max(band, w);
      }
    }
    this._rebuildAimsMap();
  },

  // BUTTON 1 — "Close all": every panel → minimized minimum, docked down the
  // left edge one after another, wrapping into a new column when it runs out
  // of vertical room. Same spacing throughout, filling the screen.
  closeAllDock() {
    this._packMinimized({ vertical: false, rowMajor: false });
  },

  // BUTTON 2 — "Reset all": every ManualOverrides value → the selected startup
  // profile (or engine defaults as fallback if no profile is active).
  // Variables only — panels are NOT touched or re-arranged.
  // Tap the ⟳ button → step back one knob change. Long-press → resetAllToProfile.
  undo() {
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (now - (this._lastUndo || 0) < 150) return;   // swallow DOM+AIMS double-fire
    this._lastUndo = now;
    if (ManualOverrides.undo()) {
      for (const panel of this.panels) panel._chromeDirty = true;
    }
  },

  resetAllToProfile() {
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (now - (this._lastReset || 0) < 200) return;
    this._lastReset = now;
    ManualOverrides._suppressUndo = true;            // a bulk reset is not undo history
    try {
      ManualOverrides.resetAllVariables();           // everything → AUTO first
      const p = GovernorProfiles.activeProfile;       // the loaded startup profile
      if (p) GovernorProfiles.applyProfile(p);        // re-apply it cleanly
      // else: no profile → leave at AUTO (the failsafe defaults)
    } finally {
      ManualOverrides._suppressUndo = false;
      ManualOverrides.clearUndo();                    // full reset = clean slate
    }
    for (const panel of this.panels) panel._chromeDirty = true;
  },

  // Free Roam ⇄ Snap to Grid (⊞ button). Toggles the dot-grid pitch between 0
  // (free-form) and the last non-zero pitch (default 48). PANEL GRID still tunes
  // the exact pitch; this is the quick on/off.
  toggleGridSnap() {
    const g = ManualOverrides.panelGridSize;
    if (!g) return;
    if (g.value > 0) { this._lastGrid = g.value; g.value = 0; }
    else             { g.value = this._lastGrid || 48; }
    g.isManual = true;
  },

  // Tetris arrange (⊟ button). Shuffles the visible panels and shelf-packs them
  // into the region [LEFT+gap .. master-slider-gap] × [top-buttons .. bottom-bar],
  // minimizing (horizontal/vertical) any panel that won't fit — different every
  // press. Everything always lands inside the region.
  arrangeTetris() {
    const GAP  = 8;
    const LEFT = 16;
    const TOP  = 120;                                  // clear the top-left buttons
    let RIGHT  = window.innerWidth - 70;               // fallback: dodge the right column
    try { const mb = window._MasterSlider?._bounds; if (mb && mb.x) RIGHT = mb.x - GAP; } catch (_) {}
    let BOTTOM = window.innerHeight - 16;
    const ui = (typeof document !== 'undefined') ? document.getElementById('ui') : null;
    if (ui) { const r = ui.getBoundingClientRect(); if (r.top > 0) BOTTOM = r.top - GAP; }

    const panels = this.panels.filter(p => p.visible);
    for (let i = panels.length - 1; i > 0; i--) {      // shuffle → different each time
      const j = (Math.random() * (i + 1)) | 0;
      [panels[i], panels[j]] = [panels[j], panels[i]];
    }

    const size = (p) => { const l = p.computeLayout(p._cachedData ?? {}); return { w: l.w, h: l.h }; };
    const regionW = Math.max(60, RIGHT - LEFT);
    const regionH = Math.max(60, BOTTOM - TOP);

    let cx = LEFT, cy = TOP, shelfH = 0;
    for (const p of panels) {
      let { w, h } = size(p);

      // Too big for the region in either axis → minimize it (Tetris compaction).
      if (w > regionW || h > regionH) {
        p.minimized = true; p._userMinW = null; p._userMinH = null;
        p._minVertical = (Math.random() < 0.5);
        p._chromeDirty = true;
        ({ w, h } = size(p));
      }

      // Wrap to the next shelf if it won't fit on the current row.
      if (cx + w > RIGHT && cx > LEFT) { cx = LEFT; cy += shelfH + GAP; shelfH = 0; }

      // Ran past the bottom → minimize (horizontal = short rows) to reclaim room.
      if (cy + h > BOTTOM) {
        p.minimized = true; p._userMinW = null; p._userMinH = null;
        p._minVertical = false;
        p._chromeDirty = true;
        ({ w, h } = size(p));
        if (cx + w > RIGHT && cx > LEFT) { cx = LEFT; cy += shelfH + GAP; shelfH = 0; }
      }

      p.x = Math.min(cx, Math.max(LEFT, RIGHT - w));
      p.y = Math.min(cy, Math.max(TOP,  BOTTOM - h));
      cx += w + GAP;
      shelfH = Math.max(shelfH, h);
    }
    this._rebuildAimsMap();
  },

  // BUTTON 3 — "Flip": minimize every panel and flip EACH ONE's own
  // horizontal/vertical orientation individually, in place. No repositioning,
  // no forced global orientation — wherever a panel sits it stays, and each
  // just toggles its own state, so you can end up with a free mix.
  arrangeToggle() {
    for (const p of this.panels) {
      if (!p.visible) continue;
      p.minimized = true;             // ensure it's in minimized form
      p.toggleMinOrientation();       // flip THIS panel's own orientation
    }
    this._rebuildAimsMap();           // w/h swapped, refresh the hit-map
  }
};
