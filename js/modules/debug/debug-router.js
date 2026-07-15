/**
 * js/modules/debug/debug-router.js
 */
import { GovernorRegistry, ManualOverrides, PhysicsGov, RenderGov, InputGov, CacheGov, TrailGov, ScreenGov } from './governor.js';
import { Panel } from './panel.js';
import { MasterGovernor } from './master-governor.js';
import { DEBUG_STATE } from './debug-state.js';
import { DebugRenderer } from '../rendering/debug-renderer.js';
import { PanelSnapGuides } from './panel-snap-guides.js';
import { Accumulator } from '../rendering/accumulator.js';
import { PhysicsCounter } from './physics-counter.js';
import { DrawCallCounter } from './draw-call-counter.js';
import { QueOps } from '../../core/que-ops.js';
import { MapRule } from '../../core/map-rule.js';
import { Aims } from '../../core/aims.js';
import { config } from '../../core/config.js';
import { FpsCounter } from './fps-counter.js';
import { MsProbe } from '../../core/ms-probe.js';
import { StateCache } from '../../core/state-cache.js';
import { FutureCache } from '../../core/future-cache.js';
import { Dormancy } from '../../core/dormancy.js';
import { Nova } from '../../core/nova.js';
import { PaintingState } from '../../core/painting-state.js';
import { ColorPalette } from '../../core/color-palette.js';
import { GovernorProfiles } from './governor-profiles.js';
import { TrailProfiles } from './trail-profiles.js';
import { GuiGovernor } from './gui-governor.js';
import { GravityField } from '../physics/gravity-field.js';
import { CycleMeter } from '../../core/cycle-meter.js';
import { Gate } from '../../core/gate.js';
import { TrajectoryPreview } from '../../core/trajectory-preview.js';
import { loadPanelConfigs } from '../../core/panel-loader.js';
import { Paster } from '../../core/paster.js';
import { PanelTrail } from './panel-trail.js';
import { PanelPages } from './panel-pages.js';
import { WorkWheel } from './work-wheel.js';
import { SelectionVitals } from '../../core/selection-vitals.js';
import { SelectionTool } from '../input/in-selection-tool.js';
import { SelectionPanelExtras } from './selection-panel-extras.js';

export const DebugRouter = {
  panels: [],
  masterEnabled: false,         // debug starts OFF — tap 〰️ to open (into console mode)
  _consoleMode: false,          // when true the Live Text Debug console owns the UI
  _preConsoleVisible: null,     // panel visibility snapshot, restored on exit
  _canvas: null,
  _config: null,
  _initialized: false,
  _prevSelCount: 0,   // last frame's SelectionTool.captured.length — for syncSelectionPanel()

  async init(canvas) {
    this._canvas = canvas;

    GovernorRegistry.register('PhysicsGov',      PhysicsGov);
    GovernorRegistry.register('RenderGov',        RenderGov);
    GovernorRegistry.register('ScreenGov',        ScreenGov);
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
    GovernorRegistry.register('MapRule',          MapRule);
    GovernorRegistry.register('MsProbe',          MsProbe);
    GovernorRegistry.register('StateCache',       StateCache);
    GovernorRegistry.register('FutureCache',      FutureCache);
    GovernorRegistry.register('Dormancy',         Dormancy);
    GovernorRegistry.register('Nova',             Nova);
    GovernorRegistry.register('GuiGovernor',      GuiGovernor);
    GovernorRegistry.register('GovernorProfiles', GovernorProfiles);
    GovernorRegistry.register('GravityField',     GravityField);
    GovernorRegistry.register('CycleMeter',       CycleMeter);
    GovernorRegistry.register('Gate',             Gate);
    GovernorRegistry.register('TrajectoryPreview', TrajectoryPreview);
    GovernorRegistry.register('SelectionVitals',   SelectionVitals);
    // THE PASTER — the Paste of Existence. Bound directly (not through
    // ManualOverrides) ON PURPOSE: loading knobs are boot-time authority and
    // must never be rotated by the benchmark or the live AutoTuner mid-run,
    // same exclusion pulseHz gets. See core/paster.js.
    GovernorRegistry.register('Paster',            Paster);
    GovernorRegistry.register('PanelTrail',        PanelTrail);
    GovernorRegistry.register('PanelPages',        PanelPages);
    GovernorRegistry.register('WorkWheel',         WorkWheel);
    // FIX: both were referenced by planetbrush.json ("PaintingState.enabled",
    // "ColorPalette.current") but never registered — every read/write against
    // either logged "[Governor] resolveVariable: unknown module". PaintingState
    // is real and live (the module this whole session's painting work runs on)
    // — this is a clean, complete fix for that half.
    // ColorPalette is a DIFFERENT situation: it's a fully-built module (6 named
    // HSL palettes, hex conversion) that nothing else in the entire codebase
    // reads from — actual brush color comes from ManualOverrides.brushColor
    // (the "Color" row directly below "Palette" in this same panel, indexing
    // into PALS/PAL_NAMES in core/state.js). Registering it here only silences
    // the console warning; the "Palette" buttons will read/write a real value
    // on a real object, but that object is disconnected from what planets
    // actually get painted. Left as-is rather than repointing the panel's
    // binding myself — whether these two color systems should be merged is a
    // real design question, not mine to decide silently.
    GovernorRegistry.register('PaintingState',    PaintingState);
    GovernorRegistry.register('ColorPalette',     ColorPalette);

    window._DebugRouter = this;
    window._GovernorProfiles = GovernorProfiles;
    window._TrailProfiles = TrailProfiles;
    window._ManualOverrides = ManualOverrides;

    try {
      // PRIME IDEAL: one JSON file per panel (js/modules/debug/panels/*.json),
      // assembled from panels/manifest.json in manifest order. Replaces the
      // old single debug-config.json monolith — adding, removing, or handing
      // a panel to someone else is now a one-file change, not a diff inside
      // a 1000-line array. See js/core/panel-loader.js.
      this._config = await loadPanelConfigs('./js/modules/debug/panels/');
    } catch (err) {
      console.warn('[DebugRouter] Panel config load failed:', err);
      this._config = { panels: [] };
    }

    // ── BOOT PHASE (THE PASTER) ───────────────────────────────────────────
    // `new Panel()` is not free: it allocates TWO canvases and parses the
    // whole control tree. ×22 in one synchronous loop is a long block on the
    // main thread with nothing painted behind it — the browser's punishment
    // for building all of existence in a single frame. Paster.build() spreads
    // the exact same construction one-per-frame (bootMode FRAMED) and YIELDS
    // in between, so the canvas keeps painting through boot. Still awaited:
    // PrefsStore.init() downstream needs every panel to exist by id.
    this.panels = (await Paster.build(
      this._config.panels,
      (cfg) => new Panel(cfg, cfg.position?.x, cfg.position?.y),
      'panels',
    )).filter(Boolean);

    // Un-admitted until the Paster reveals them. Panel's constructor defaults
    // visible=true (there's no JSON field for it) — that default is what made
    // "turn debug on" a 22-panels-in-one-frame cliff. Existence is pasted now:
    // panel mode admits them ONE AT A TIME, measuring the frame cost of each.
    // visible=false already excludes a panel from drawAll, updateData, the
    // AIMS hit-map and the pointer path — no other call site needs changing.
    for (const p of this.panels) { p.visible = false; p._admitted = false; }

    // EXCEPTIONS — two kinds of panel are never part of the experiment:
    //   selection — owned entirely by syncSelectionPanel(), appears only when
    //     SelectionTool has a live capture.
    //   pinned    — the user's restored tuning surface, which must exist with
    //     debug OFF. Pasted immediately, not queued.
    //   paster    — the control surface of the experiment itself. If it were
    //     staged, MANUAL mode would deadlock: nothing is admitted until you
    //     press ▶, and ▶ lives on the panel that hasn't been admitted.
    for (const p of this.panels) {
      if (p.id === 'selection') { p._admitted = true; continue; }   // stays visible=false
      if (p.id === 'paster')    { p._admitted = true; continue; }
      if (p.pinned)             { p._admitted = true; }
    }
    // Admitted ≠ visible: PAGES decides what's actually on the surface.
    // The paster panel lives on the UPDATES page, so it is on-screen exactly
    // when you're looking at the page that measures things — which is where
    // you want it. (It is never STAGED, though: MANUAL mode would deadlock,
    // since ▶ lives on the panel that hasn't been admitted.)
    this._applyPage();

    for (const panel of this.panels) {
      MasterGovernor.register(panel);
    }
    MasterGovernor.lockRatios();

    this._armReveal();
    this._initialized = true;
  },

  /**
   * Load the reveal conveyor: one birth per un-admitted panel ON THE CURRENT
   * PAGE, in manifest order. Nothing moves until Panel Mode arms it — and
   * every admission gets a measured row in Paster.ledger:
   *
   *     frame ms BEFORE this panel existed → frame ms AFTER → its price.
   *
   * That ledger is the whole reason for the staging. Staged loading does not
   * make 22 drawn panels cheaper than 22 drawn panels; it makes the 3 panels
   * that are actually eating the frame IMPOSSIBLE TO HIDE. Read it with the
   * LEDGER button in the PASTER panel (console.table, sorted by cost).
   *
   * With PAGES ON this becomes seven short ladders instead of one long one —
   * each page prices only its own panels, which is a cleaner measurement
   * anyway (fewer panels sharing the frame while any one of them is scored).
   */
  _armReveal() {
    Paster.clear('reveal');
    for (const p of this.panels) {
      if (p._admitted) continue;
      if (!PanelPages.shows(p)) continue;   // not on this page — not this ladder
      Paster.enqueue('reveal', p.id, () => {
        p._admitted    = true;
        p._chromeDirty = true;
        this._applyPage();
        PanelTrail.invalidate();
        try { window._InAims?.syncDebugPanels(); } catch (_) {}
      });
    }

    // THE WORK WHEEL's atlas rides the tail of the same conveyor — admitted
    // LAST, on purpose, exactly like the reserved WASM/Workers slots. Its
    // bake cost therefore lands in the same ledger as every panel. (Loading
    // it from the localStorage cache instead of baking scores ~0ms, which is
    // not the ledger lying — that IS what a cached atlas costs.)
    if (!WorkWheel._ready) {
      Paster.enqueue('reveal', 'workWheel:atlas', () => { WorkWheel.prepare(); });
    }
  },

  /**
   * Visibility is a product of TWO gates, never one:
   *   admitted (the Paster has pasted it into existence) AND
   *   on-page  (PanelPages says this category is what you're looking at)
   *
   * The selection panel is exempt from both — SelectionTool owns it.
   */
  _applyPage() {
    for (const p of this.panels) {
      if (p.id === 'selection') continue;
      const want = !!p._admitted && PanelPages.shows(p);
      if (p.visible !== want) { p.visible = want; p._chromeDirty = true; }
    }
  },

  /** PanelPages calls this on every turn. */
  onPageChange() {
    this._applyPage();
    PanelTrail.invalidate();
    // A page that has never been opened has never been pasted — arm its own
    // ladder now. A page already fully admitted arms to an empty queue and
    // completes instantly, which costs nothing.
    Paster.clear('reveal');
    this._armReveal();
    Paster._armed = null;                    // let updateData re-arm on the new page
    try { window._InAims?.syncDebugPanels(); } catch (_) {}
  },

  /** Re-run the whole experiment from cold — the PASTER panel's REPASTE button. */
  repaste() {
    for (const p of this.panels) {
      if (p.id === 'selection' || p.id === 'paster') continue;
      p._admitted    = false;
      p.visible      = false;
      p._chromeDirty = true;
    }
    Paster.ledger = Paster.ledger.filter(r => r.group !== 'reveal');
    Paster._armed = null;
    this._armReveal();
    PanelTrail.invalidate();
    try { window._InAims?.syncDebugPanels(); } catch (_) {}
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
      case 'pulse':      return window.RenderPulse?.debugInfo ?? {};
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

    // ── THE PASTER ────────────────────────────────────────────────────────
    // PANEL MODE ONLY — "Always check for now" (Noon). Console mode draws a
    // DOM overlay and no panels at all, so admitting them there would paste
    // existence nobody can see and poison every ledger row with a cost that
    // was never paid.
    //
    // tick() is ALSO the frame-period sampler (true rAF deltas, no smoothing),
    // so it must run on EVERY frame the panels are live — never behind an
    // isDue() gate. It is a subtraction and a compare; it costs nothing.
    if (debugOn && !this._consoleMode) {
      if (Paster._armed !== 'reveal') Paster.arm('reveal');
      Paster.tick(now);
    }

    for (const panel of this.panels) {
      // Un-admitted (not yet pasted) or closed → not drawn, so not computed.
      // This is the other half of the win: a panel that isn't on screen was
      // still paying full _getDataForPanel() every refresh tick before.
      if (!panel.visible && !panel.pinned) continue;

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

  /**
   * Auto show/hide the "selection" panel to match SelectionTool having a
   * live capture — makes the real Panel (drag/pin/minimize/etc., see
   * panels/selection.json) pop up the same way the old standalone
   * overlay used to, in or out of debug mode, without the user having to
   * find and manually toggle it on first.
   *
   * MUST be called unconditionally every rAF, NOT from updateData() —
   * updateData() early-returns whenever debug is off AND nothing is
   * pinned yet (`!debugOn && !tuningOn`), which is exactly the state this
   * needs to escape FROM on the very first capture (nothing pinned yet,
   * debug possibly off). Called from main.js right after
   * SelectionTool.update(), same spot SelectionTool's own render() call
   * lives relative to it.
   *
   * Only acts ON THE TRANSITION (0→N pins+shows, N→0 unpins+hides) — it
   * never fights the user's own manual pin/minimize/drag on a frame where
   * the count doesn't change, which is what makes "close it, stays closed
   * until a new selection" and "drag it wherever, it remembers" both true
   * for free, just from the normal Panel machinery.
   */
  syncSelectionPanel() {
    if (!this._initialized) return;
    const panel = this.panels.find(p => p.id === 'selection');
    if (!panel) return;

    const n = SelectionTool.captured?.length || 0;
    if (this._prevSelCount === 0 && n > 0) {
      panel.visible = true;
      panel.pin();
      // Fresh selection — start the zoom box centered/at baseline zoom
      // rather than inheriting wherever the LAST selection's pan/zoom
      // was left.
      SelectionPanelExtras.resetView();
    } else if (this._prevSelCount > 0 && n === 0) {
      panel.visible = false;
      panel.unpin();
    }
    this._prevSelCount = n;
  },

  drawAll(ctx) {
    if (!this.masterEnabled || !this._initialized) return;

    // THE WORK WHEEL — the pipeline truth meter. Drawn in BOTH debug modes
    // (before the console-mode return): it is not a panel, it is the witness
    // that says whether the frames we think we're presenting are real. Raw
    // device space, anchored under the debug button — never inside the panel
    // view transform.
    WorkWheel.render(ctx);

    if (this._consoleMode) return;   // Live Text Debug console draws its own DOM overlay instead

    // Data already updated by updateData() — just draw.
    // viewZoom is a pure view transform (zoom OUT from the panel layer,
    // anchored top-left). Panel layout/chrome caches are untouched — only the
    // blit is scaled. Hit-testing divides pointer coords by the same factor
    // (in-debug.js + in-aims.js), so visible ⟺ touchable at every zoom.
    const vz = DEBUG_STATE.viewZoom || 1;
    const px = DEBUG_STATE.viewPanX || 0;
    const py = DEBUG_STATE.viewPanY || 0;

    // ── THE PANEL TRAIL ───────────────────────────────────────────────────
    // One composite surface, one draw call. Panels re-stamp only when they
    // actually change — which, since the refreshRate clock is the only thing
    // that changes their numbers, means text is redrawn at ms times and not
    // at frame times. See panel-trail.js. Knob it to 0 to A/B against the old
    // per-frame loop below, which is the state that costs 5fps.
    if (PanelTrail.on) {
      PanelTrail.draw(ctx, this.panels, (p) => p._cachedData ?? {});
    } else {
      ctx.save();
      if (px || py) ctx.translate(px, py);
      if (vz !== 1) ctx.scale(vz, vz);
      for (const panel of this.panels) {
        if (!panel.visible) continue;
        DebugRenderer.renderPanel(ctx, panel, panel._cachedData ?? {});
      }
      ctx.restore();
    }

    // Everything below is LIVE by design — it animates every frame (marching
    // ants, the selection band, snap guides) and would force a full trail
    // rebuild per frame if it were stamped. It draws straight onto the main
    // canvas, on top of the one blit.
    ctx.save();
    if (px || py) ctx.translate(px, py);
    if (vz !== 1) ctx.scale(vz, vz);

    // Snap guides — visual-only alignment lines while a panel title-bar
    // drag is active. FIX: this used to pass window.innerWidth/Height
    // (CSS pixels, not dpr-multiplied like the main canvas) and rely on
    // the ambient pan/zoom/dpr transform to place the blit correctly —
    // which only worked at default zoom=1/pan=0, since the offscreen
    // buffer itself was never built large enough (or transformed) to
    // cover whatever panel-space region is ACTUALLY visible at other
    // pan/zoom states. The offscreen image now bakes the real pan/zoom/
    // dpr transform in at build time (see PanelSnapGuides.getImage), so
    // it has to be blitted in RAW device-pixel space here — going
    // through the ambient transform AGAIN would double-apply it. Real
    // snapping still happens entirely in PanelArrange.settle() on release.
    if (DEBUG_STATE.dragGuide) {
      const dpr = DEBUG_STATE.dpr || 1;
      const guideImg = PanelSnapGuides.getImage(
        DEBUG_STATE.dragGuide.panel,
        ctx.canvas.width, ctx.canvas.height,
        px, py, vz, dpr
      );
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(guideImg, 0, 0);
      ctx.restore();
    }

    // Marquee + selection share one look: the dashed cyan rectangle, with the
    // dashes MARCHING like chasing LEDs (time-driven lineDashOffset — drawAll
    // runs every rendered frame, so it animates for free). Constant screen
    // thickness/dash length at any zoom.
    const _ants = (x, y, w, h) => {
      ctx.save();
      ctx.fillStyle = 'rgba(130, 210, 255, 0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(130, 210, 255, 0.85)';
      ctx.lineWidth = 1.5 / vz;
      ctx.setLineDash([6 / vz, 4 / vz]);
      ctx.lineDashOffset = -((performance.now() / 40) % 10) / vz;   // the LED chase
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    };

    // Live marquee while dragging — drawn in panel-space so it hugs exactly
    // the panels it will catch, at any zoom/pan.
    const mq = DEBUG_STATE.marquee;
    if (mq?.active) {
      _ants(Math.min(mq.x0, mq.x1), Math.min(mq.y0, mq.y1),
            Math.abs(mq.x1 - mq.x0), Math.abs(mq.y1 - mq.y0));
    }

    // Persistent selection — ONE rectangle through all the panels it got,
    // re-fitted live to their bounding box (lowest X → farthest, both axes).
    const sb = this.selectionBBox();
    if (sb) {
      const PAD = 4;
      _ants(sb.x - PAD, sb.y - PAD, sb.w + PAD * 2, sb.h + PAD * 2);
      // The selection IS a panel: headline band above the ants rectangle with
      // title + the full icon set, drag anywhere on the band moves the whole
      // group, and the BR grip scales every member proportionally.
      const band = this.selectionBand(sb);
      ctx.save();
      ctx.fillStyle = 'rgba(8,8,18,0.82)';
      ctx.strokeStyle = 'rgba(130,210,255,0.35)';
      ctx.lineWidth = 1 / vz;
      ctx.beginPath();
      ctx.roundRect(band.x, band.y, band.w, band.h, 5 / vz);
      ctx.fill(); ctx.stroke();
      ctx.font = `bold ${11 / vz}px ${DEBUG_STATE.style.font}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(130,210,255,0.95)';
      ctx.fillText('SELECTION BOX', band.x + 8 / vz, band.y + band.h / 2);

      const icons = this._selectionIcons(sb);
      ctx.font = `${10 / vz}px ${DEBUG_STATE.style.font}`;
      ctx.textAlign = 'center';
      for (const ic of icons) {
        ctx.fillStyle = 'rgba(20,24,36,0.9)';
        ctx.beginPath();
        ctx.roundRect(ic.x, ic.y, ic.s, ic.s, 3 / vz);
        ctx.fill();
        ctx.fillStyle = 'rgba(130,210,255,0.9)';
        ctx.fillText(ic.glyph, ic.x + ic.s / 2, ic.y + ic.s / 2);
      }
      // BR scale grip — ⊿ like every panel's sizing corner
      const gr = this.selectionGrip(sb);
      ctx.fillStyle = 'rgba(130,210,255,0.6)';
      ctx.font = `${14 / vz}px ${DEBUG_STATE.style.font}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText('⊿', gr.x + gr.w, gr.y + gr.h);
      ctx.restore();
    }
    ctx.restore();

    // Global master slider stays OUTSIDE the transform — measured off DOM
    // buttons, fixed size forever (locked rule). It never zooms, never scales.
    DebugRenderer.renderMasterSlider(ctx, this.panels);
  },

  toggleAll() {
    this.masterEnabled = !this.masterEnabled;
    // body.dbg-on / body.dbg-console used to gate .dbg-sat's CSS
    // display:none — satellites are canvas-drawn now (canvas-satellites.js
    // checks DebugRouter.masterEnabled/._consoleMode directly, no CSS
    // class involved), so these two toggles are vestigial as far as
    // satellites go. Left in place — harmless, and other code may still
    // read them — but not what visibility actually runs on anymore.
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('dbg-on', this.masterEnabled);
      document.body.classList.toggle('dbg-console', this.masterEnabled && this._consoleMode);
    }
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
    // The 4 action satellites (arrange/undo/grid/expand) are PANEL-mode tools —
    // hidden in console mode via body.dbg-console. Only the console/panel ray
    // stays visible in both debug modes.
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('dbg-console', this.masterEnabled && on);
    }
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
        // Fallback is NOT `true` anymore: a panel the Paster has not admitted
        // yet must stay un-pasted through a console-mode round trip, or the
        // reveal would silently complete itself behind the console.
        p.visible = rec ? rec.v : (!!p._admitted && p.id !== 'selection');
        p._chromeDirty = true;
      }
      this._preConsoleVisible = null;
    }
    try { window._InAims?.syncDebugPanels(); } catch (_) {}
  },

  // A panel's current on-screen rect in panel-space (actual drawn size).
  _panelRect(p) {
    let w = p.w || 120, h = p.h || 56;
    try {
      const L = p.computeLayout(p._cachedData ?? {});
      if (L && Number.isFinite(L.w) && Number.isFinite(L.h)) { w = L.w; h = L.h; }
    } catch (_) {}
    return { x: p.x, y: p.y, w, h };
  },

  // Marquee release → the ids of every visible panel the rect touched.
  // Returns null when nothing was caught (no selection).
  selectInRect(rect) {
    const ids = [];
    for (const p of this.panels) {
      if (!p.visible) continue;
      const r = this._panelRect(p);
      if (r.x < rect.x + rect.w && r.x + r.w > rect.x &&
          r.y < rect.y + rect.h && r.y + r.h > rect.y) ids.push(p.id);
    }
    return ids.length ? { ids } : null;
  },

  // The SELECTION BOX headline band — a real panel title bar floating above
  // the ants rectangle: title left, full icon set right. Panel-space rect.
  selectionBand(sb) {
    const vz = DEBUG_STATE.viewZoom || 1;
    const h = 22 / vz, PAD = 4;
    return { x: sb.x - PAD, y: sb.y - PAD - h - 2 / vz, w: sb.w + PAD * 2, h };
  },

  // Group icons in the band — panel-space rects, ~16 SCREEN px at any zoom.
  // Order (right→left): 📌 pin · ⛶ max · ▼ min · ⤓ shrink · ⇆ row · ⇅ column.
  _selectionIcons(sb) {
    const vz = DEBUG_STATE.viewZoom || 1;
    const band = this.selectionBand(sb);
    const s = 16 / vz, g = 4 / vz;
    const y = band.y + (band.h - s) / 2;
    const right = band.x + band.w - g;
    const glyphs = [
      { glyph: '⇅', act: 'col' },      // vertical switch — stack Y,X
      { glyph: '⇆', act: 'row' },      // horizontal switch — line up X,Y
      { glyph: '⤓', act: 'shrink' },
      { glyph: '▼', act: 'min' },
      { glyph: '⛶', act: 'max' },
      { glyph: '📌', act: 'pin' },
    ];
    return glyphs.map((it, i) => ({ ...it, s, x: right - (i + 1) * (s + g), y }));
  },

  // BR resize grip of the selection box — dragging it scales EVERY selected
  // panel proportionally (positions relative to the box origin + contentScale).
  selectionGrip(sb) {
    const vz = DEBUG_STATE.viewZoom || 1;
    const s = 22 / vz, PAD = 4;
    return { x: sb.x + sb.w + PAD - s, y: sb.y + sb.h + PAD - s, w: s, h: s };
  },

  selectedPanels() {
    const sel = DEBUG_STATE.selection;
    if (!sel?.ids?.length) return [];
    return this.panels.filter(p => p.visible && sel.ids.includes(p.id));
  },

  // Group action from a selection icon — applied to EVERY selected panel.
  selectionAction(act) {
    const list = this.selectedPanels();
    if (!list.length) return;
    const sb0 = this.selectionBBox();
    if (act === 'row' || act === 'col') {
      // ⇆ / ⇅ — line the selected panels up from the box's top-left:
      // horizontal first (X,Y) or vertical first (Y,X).
      const GAP = 8;
      let cx = sb0.x, cy = sb0.y;
      for (const p of list) {
        const r = this._panelRect(p);
        p.x = cx; p.y = cy;
        if (act === 'row') cx += r.w + GAP; else cy += r.h + GAP;
        p._chromeDirty = true;
      }
      this.snapshotLayout();
      this._rebuildAimsMap();
      try { window.UpdateFeed?.push(`SELECTION ${act === 'row' ? 'ROW ⇆' : 'COLUMN ⇅'} × ${list.length}`); } catch (_) {}
      return;
    }
    // 📌 group pin must go through Panel.pin()/unpin() — those are what
    // register the panel with the TuningLayer (the pinned-outside-debug
    // surface). Writing p.pinned directly leaves the flag lit but the panel
    // invisible in tuning mode. Unified semantics: if ANY selected panel is
    // still unpinned, this pins ALL of them; only a fully-pinned selection
    // unpins — one tap always leaves the group in one coherent state.
    const pinAll = act === 'pin' && list.some(p => !p.pinned);
    for (const p of list) {
      if (act === 'pin')    { pinAll ? p.pin() : p.unpin(); }
      if (act === 'max')    { p.shrunk = false; this.maximizePanel(p); }
      if (act === 'min')    { p.shrunk = false; p.minimized = true; }
      if (act === 'shrink') p.shrunk = true;
      p._chromeDirty = true;
    }
    if (act === 'shrink') this._dockShrunk();
    this._rebuildAimsMap();
    try { window.UpdateFeed?.push(`SELECTION ${act.toUpperCase()} × ${list.length}`); } catch (_) {}
  },

  // LIVE bounding box of the current selection: lowest X to farthest X+w,
  // same for Y — recomputed from wherever the panels are NOW, so the
  // rectangle keeps hugging them through drags, packs, and resizes.
  selectionBBox() {
    const sel = DEBUG_STATE.selection;
    if (!sel?.ids?.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
    for (const p of this.panels) {
      if (!p.visible || !sel.ids.includes(p.id)) continue;
      const r = this._panelRect(p);
      minX = Math.min(minX, r.x);       minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
      n++;
    }
    if (!n) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  },

  // ⤓ SHRINK TO BAR — the panel becomes a one-line title bar docked in a
  // proportion of the screen just above the bottom bar, CASCADED left→right
  // (wrapping upward into more rows). Dragging a bar OUT (up past the pull
  // threshold, handled in in-debug) turns it minimized mid-drag; until it's
  // grabbed out it stays shrunk and re-docks on release.
  shrinkToBar(p) {
    p.shrunk = true;
    p._chromeDirty = true;
    this._dockShrunk();
    this._rebuildAimsMap();
  },

  _dockShrunk() {
    const vz = DEBUG_STATE.viewZoom || 1;
    const ox = DEBUG_STATE.viewPanX || 0;
    const oy = DEBUG_STATE.viewPanY || 0;
    let sBottom = window.innerHeight - 12;
    const ui = (typeof document !== 'undefined') ? document.getElementById('ui') : null;
    if (ui) { const r = ui.getBoundingClientRect(); if (r.top > 0) sBottom = r.top - 6; }
    const L = (8 - ox) / vz;
    const R = ((window.innerWidth - 70) - ox) / vz;
    const B = (sBottom - oy) / vz;
    const GAP = 4;
    let cx = L, row = 0, rowH = 0;
    for (const p of this.panels) {
      if (!p.visible || !p.shrunk) continue;
      const Lay = p.computeLayout({});
      if (cx + Lay.w > R && cx > L) { cx = L; row++; }
      rowH = Math.max(rowH, Lay.h);
      p.x = cx;
      p.y = B - Lay.h - row * (rowH + GAP);
      cx += Lay.w + GAP;
    }
  },

  // ⛶ header icon: grow the panel as much as possible WITHOUT overlapping
  // others — width first (nearest blocker to the right within the panel's
  // y-range), then height (nearest blocker below within the new x-range),
  // clamped to the visible view. Content overflow scrolls — that's wanted.
  maximizePanel(p) {
    const vz = DEBUG_STATE.viewZoom || 1;
    const ox = DEBUG_STATE.viewPanX || 0;
    const oy = DEBUG_STATE.viewPanY || 0;
    const M = 8, GAP = 2;
    const R = this._panelRect(p);
    let limR = ((window.innerWidth  || 0) - M - ox) / vz;
    let limB = ((window.innerHeight || 0) - M - oy) / vz;

    for (const o of this.panels) {                    // nearest blocker right
      if (o === p || !o.visible) continue;
      const r = this._panelRect(o);
      if (r.y < R.y + R.h && r.y + r.h > R.y && r.x >= R.x + R.w) limR = Math.min(limR, r.x - GAP);
    }
    const newW = Math.max(60, limR - R.x);

    for (const o of this.panels) {                    // nearest blocker below (vs new width)
      if (o === p || !o.visible) continue;
      const r = this._panelRect(o);
      if (r.x < R.x + newW && r.x + r.w > R.x && r.y >= R.y + R.h) limB = Math.min(limB, r.y - GAP);
    }
    const newH = Math.max(60, limB - R.y);

    if (p.minimized) { p._userMinW = newW; p._userMinH = newH; }
    else             { p._userW    = newW; p._userH    = newH; }
    p._chromeDirty = true;
    this._rebuildAimsMap();
    this.snapshotLayout();
  },

  // Know-it-all rectangle: shelf-pack every visible panel the marquee caught
  // into the drawn rect (top-left anchored, GAP apart, wrapping at the rect's
  // right edge, overflowing DOWNWARD past its bottom if they don't all fit —
  // same never-overlap shelf geometry as arrangeTetris). Coords: panel-space.
  collectInto(rect) {
    const GAP = 8;
    const caught = this.panels.filter(p => {
      if (!p.visible) return false;
      let w = p.w || 120, h = p.h || 56;
      try {
        const L = p.computeLayout(p._cachedData ?? {});
        if (L && Number.isFinite(L.w) && Number.isFinite(L.h)) { w = L.w; h = L.h; }
      } catch (_) {}
      return p.x < rect.x + rect.w && p.x + w > rect.x &&
             p.y < rect.y + rect.h && p.y + h > rect.y;
    });
    if (!caught.length) return;

    const right = rect.x + Math.max(60, rect.w);
    let cx = rect.x, cy = rect.y, shelfH = 0;
    for (const p of caught) {
      let w = p.w || 120, h = p.h || 56;
      try {
        const L = p.computeLayout(p._cachedData ?? {});
        if (L && Number.isFinite(L.w) && Number.isFinite(L.h)) { w = L.w; h = L.h; }
      } catch (_) {}
      if (cx + w > right && cx > rect.x) { cx = rect.x; cy += shelfH + GAP; shelfH = 0; }
      p.x = cx;
      p.y = cy;
      cx += w + GAP;
      shelfH = Math.max(shelfH, h);
    }
    this._rebuildAimsMap();
    this.snapshotLayout();
  },

  // ── LAYOUT HISTORY — panel-arrangement-only undo/redo (Ctrl-Z satellites).
  // A ring of snapshots {id → x,y,minimized,shrunk,contentScale}; recorded on
  // every arrange / drag-end / group action. Position 0 = session start.
  _layHist: [],
  _layPtr: -1,

  snapshotLayout() {
    const snap = {};
    for (const p of this.panels) {
      snap[p.id] = { x: p.x, y: p.y, minimized: !!p.minimized, shrunk: !!p.shrunk,
                     contentScale: p.contentScale || 1 };
    }
    // truncate redo tail, push, cap at 60
    this._layHist.length = this._layPtr + 1;
    this._layHist.push(snap);
    if (this._layHist.length > 60) this._layHist.shift();
    this._layPtr = this._layHist.length - 1;
  },

  _applyLayout(snap) {
    if (!snap) return;
    for (const p of this.panels) {
      const r = snap[p.id];
      if (!r) continue;
      p.x = r.x; p.y = r.y;
      p.minimized = r.minimized; p.shrunk = r.shrunk;
      p.contentScale = r.contentScale;
      p._chromeDirty = true;
    }
    this._dockShrunk();
    this._rebuildAimsMap();
  },

  undoLayout(toStart = false) {
    if (this._layHist.length === 0) return;
    this._layPtr = toStart ? 0 : Math.max(0, this._layPtr - 1);
    this._applyLayout(this._layHist[this._layPtr]);
    try { window.UpdateFeed?.push(toStart ? 'LAYOUT → SESSION START' : 'LAYOUT UNDO'); } catch (_) {}
  },

  redoLayout(toFirstRecorded = false) {
    if (this._layHist.length === 0) return;
    this._layPtr = toFirstRecorded ? 0 : Math.min(this._layHist.length - 1, this._layPtr + 1);
    this._applyLayout(this._layHist[this._layPtr]);
    try { window.UpdateFeed?.push(toFirstRecorded ? 'LAYOUT → FIRST RECORDED' : 'LAYOUT REDO'); } catch (_) {}
  },

  // 👓 satellite: THREE different clicks — the full ratio scale of panels AND
  // console cycles ×1 → ×2 → ×3 → ×1. Panels resize through psOverall (the
  // one sizing surface); the console follows via ConsoleView.setScale.
  cycleRatio() {
    const cur = ManualOverrides.psOverall?.value ?? 2;
    const next = cur < 1.5 ? 2 : (cur < 2.5 ? 3 : 1);
    ManualOverrides.set('psOverall', next);
    for (const p of this.panels) p._chromeDirty = true;
    try { window._ConsoleView?.setScale(next); } catch (_) {}
    try { window.UpdateFeed?.push(`GLASSES ×${next}`); } catch (_) {}
    this._rebuildAimsMap();
  },

  // ⛶ satellite: open every visible panel to its MAXIMUM size — un-minimize,
  // clear any grip-shrunk user sizes (back to natural full layout), and open
  // all collapsed sections. A REAL TOGGLE: if everything visible is already
  // expanded (nothing minimized/shrunk), the same tap instead minimizes
  // every visible panel back down. FIX ("does not minimize on the second
  // tap"): this used to be one-way — expand-only, no matter how many times
  // you tapped it. Checked fresh each call (not a stored flag) so a manual
  // change to one panel in between doesn't leave the toggle out of sync.
  expandAll() {
    const allAlreadyExpanded = this.panels.every(p =>
      !p.visible || (!p.minimized && !p.shrunk));
    for (const p of this.panels) {
      if (!p.visible) continue;
      if (allAlreadyExpanded) {
        p.minimized = true;
      } else {
        p.minimized = false;
        p.shrunk = false;
        p._userW = null;    p._userH = null;
        p._userMinW = null; p._userMinH = null;
        p._collapsedSections?.clear?.();
      }
      p._chromeDirty = true;
    }
    this._rebuildAimsMap();
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
    else             { g.value = this._lastGrid || 8; }
    g.isManual = true;
  },

  // Tetris arrange (▦ button). Shuffles the visible panels and shelf-packs them
  // into the visible region converted through the debug view transform — so a
  // zoomed-out view gives the packer MORE panel-space real estate to work with.
  // Panels that won't fit are minimized (Tetris compaction); if a shelf still
  // can't hold one, it overflows DOWNWARD past the bottom edge instead of being
  // clamped back onto an already-placed panel (overflow is reachable with the
  // pan pad). NOTHING ever overlaps: placement is pure shelf geometry — each
  // panel starts after the previous one + GAP, each shelf below the tallest of
  // the shelf above + GAP.
  arrangeTetris() {
    const GAP  = 8;
    const vz = DEBUG_STATE.viewZoom || 1;
    const ox = DEBUG_STATE.viewPanX || 0;
    const oy = DEBUG_STATE.viewPanY || 0;
    const toPanelX = (sx) => (sx - ox) / vz;
    const toPanelY = (sy) => (sy - oy) / vz;

    // Region in SCREEN space first (buttons, master slider, bottom bar are all
    // screen-fixed), then converted to panel space through the view transform.
    let sRight  = window.innerWidth - 70;              // fallback: dodge the right column
    try { const mb = window._MasterSlider?._bounds; if (mb && mb.x) sRight = mb.x - GAP; } catch (_) {}
    let sBottom = window.innerHeight - 16;
    const ui = (typeof document !== 'undefined') ? document.getElementById('ui') : null;
    if (ui) { const r = ui.getBoundingClientRect(); if (r.top > 0) sBottom = r.top - GAP; }

    const LEFT   = toPanelX(16);
    const TOP    = toPanelY(120);                      // clear the top-left buttons
    const RIGHT  = toPanelX(sRight);
    const BOTTOM = toPanelY(sBottom);

    const panels = this.panels.filter(p => p.visible && !p.shrunk);   // docked bars stay docked
    for (let i = panels.length - 1; i > 0; i--) {      // shuffle → different each time
      const j = (Math.random() * (i + 1)) | 0;
      [panels[i], panels[j]] = [panels[j], panels[i]];
    }

    const size = (p) => { const l = p.computeLayout(p._cachedData ?? {}); return { w: l.w, h: l.h }; };
    const regionW = Math.max(60, RIGHT - LEFT);

    let cx = LEFT, cy = TOP, shelfH = 0;
    for (const p of panels) {
      let { w, h } = size(p);

      // Too wide for the region → minimize it (Tetris compaction).
      if (w > regionW) {
        p.minimized = true; p._userMinW = null; p._userMinH = null;
        p._minVertical = (Math.random() < 0.5);
        p._chromeDirty = true;
        ({ w, h } = size(p));
      }

      // Wrap to the next shelf if it won't fit on the current row.
      if (cx + w > RIGHT && cx > LEFT) { cx = LEFT; cy += shelfH + GAP; shelfH = 0; }

      // Running past the bottom → minimize (horizontal = short rows) to reclaim
      // room. If it STILL doesn't fit, it just overflows below — never clamped
      // back onto placed panels.
      if (cy + h > BOTTOM && !p.minimized) {
        p.minimized = true; p._userMinW = null; p._userMinH = null;
        p._minVertical = false;
        p._chromeDirty = true;
        ({ w, h } = size(p));
        if (cx + w > RIGHT && cx > LEFT) { cx = LEFT; cy += shelfH + GAP; shelfH = 0; }
      }

      p.x = cx;
      p.y = cy;
      cx += w + GAP;
      shelfH = Math.max(shelfH, h);
    }
    this._rebuildAimsMap();
    this.snapshotLayout();
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
