/**
 * js/modules/input/in-debug.js
 * ─────────────────────────────────────────────────────────────────────────
 * DEBUG INPUT HANDLER — routes pointer events to panels + master sliders.
 *
 * REFACTOR (2026-06-23):
 *   - Uses Panel class for hit-testing (no panel-type branching)
 *   - Handles per-panel master sliders (vertical, to right of each panel)
 *   - Handles global master slider (vertical, to right of all panels)
 *   - Handles minimize button (top-right of each panel)
 *   - Handles all control types: buttons, sliders, knobs, dropdowns,
 *     checkboxes, color pickers
 *   - Delegates control interactions to panel.handlePointerDown/Move/Up
 *   - No +15 offset hack — coordinates are panel-relative everywhere
 *
 * PRIORITY ORDER (hit-test):
 *   1. Global master slider (rightmost, check first)
 *   2. Per-panel master slider (to right of each panel)
 *   3. Panel controls (buttons, sliders, minimize button, etc.)
 *   4. Panel body (for dragging)
 *
 * DEPENDENCIES:
 *   - debug-router.js             (panels array)
 *   - panel.js                    (Panel class — hit-test + control handling)
 *   - panel-master.js             (PanelMasterSlider — per-panel master hit-test)
 *   - master-slider-renderer.js   (MasterSliderRenderer — global master)
 *
 * USED BY:
 *   - input.module.js             (calls handleDown/Move/Up in priority chain)
 * ─────────────────────────────────────────────────────────────────────────
 */
import { DebugRouter } from '../debug/debug-router.js';
import { TuningLayer } from '../tuning/tuning-layer.js';
import { PanelMasterSlider } from '../debug/panel-master.js';
import { MasterSliderRenderer } from '../debug/master-slider-renderer.js';
import { PanelArrange } from '../debug/panel-arrange.js';
import { resolveVariable, resolveDynamicMax } from '../debug/governor.js';
import { DEBUG_STATE } from '../debug/debug-state.js';
import { InputState } from './input.module.js';

// "Know-it-all" marquee: HOLD-press on EMPTY space (no panel, no slider) in
// debug+panel mode → a selection rectangle. On release, every panel it caught
// is COLLECTED — shelf-packed together into the drawn rectangle. Quick taps
// and early movement cancel it (empty-space presses are otherwise dead in
// debug: planet planting is off, one-finger camera drag doesn't exist).
const MARQUEE_HOLD_MS = 350;   // hold this long, still, to activate
const MARQUEE_SLOP    = 8;     // screen px of movement allowed before activation

export const InDebug = {
  _canvas: null,

  // Map screen coords → panel-space through the debug view transform
  // (translate(viewPanX, viewPanY) → scale(viewZoom)). The transform applies
  // in debug+panel mode AND to the pinned tuning layer (debug off) — panels
  // hold the locked view. Identity ONLY in console mode. The global master
  // slider (drawn unscaled, untranslated) always uses raw coords.
  _toPanel(cx, cy) {
    const R = DebugRouter;
    if (R.masterEnabled && R._consoleMode) return { x: cx, y: cy };
    const vz = DEBUG_STATE.viewZoom || 1;
    return {
      x: (cx - (DEBUG_STATE.viewPanX || 0)) / vz,
      y: (cy - (DEBUG_STATE.viewPanY || 0)) / vz
    };
  },

  isDragging: false,
  _scrollingPanel:  null,
  _scrollStartY:    0,
  _scrollStartOff:  0,
  _resizingPanel:   null,
  _resizeStartX:    0,
  _resizeStartY:    0,
  _resizeStartW:    0,
  _resizeStartH:    0,
  activePanel: null,
  pointerId: null,
  startX: 0,
  startY: 0,
  startPanelX: 0,
  startPanelY: 0,
  _dragStarted: false,
  _grabX: 0,          // pointer offset inside the panel at grab (arrange anchor)
  _grabY: 0,
  _prevMoveX: 0,      // last pointer pos — for per-move trajectory deltas
  _prevMoveY: 0,

  // ── Master slider state ───────────────────────────────────────────────
  _globalMasterDragging: false,
  _panelMasterDragging: false,
  _panelMasterKnob: false,      // true when dragging knob vs slider
  _panelMasterKnobStartY: 0,
  _panelMasterKnobStartValue: 0,
  _activePanelMaster: null,
  /**
   * init(canvas)
   * Initialize with the main canvas for pointer capture.
   */
  init(canvas) {
    this._canvas = canvas;

    canvas.addEventListener('lostpointercapture', () => {
      this._releaseAll();
    });

    // Scroll panels with mouse wheel / trackpad
    canvas.addEventListener('wheel', (e) => {
      this._handleWheel(e);
    }, { passive: true });
  },

  // Returns all panels that should receive pointer input.
  // Debug panels when debug is on, plus tuning (pinned) panels always.
  _activePanels() {
    const debugPanels  = DebugRouter.masterEnabled ? DebugRouter.panels : [];
    const tuningPanels = TuningLayer._panels.filter(p => !debugPanels.includes(p));
    return [...debugPanels, ...tuningPanels];
  },

  _handleWheel(e) {
    const x = e.offsetX;
    const y = e.offsetY;
    for (const panel of this._activePanels()) {
      if (!panel.visible || panel.minimized) continue;
      if (x >= panel.x && x <= panel.x + panel.w &&
          y >= panel.y && y <= panel.y + panel.h) {
        panel.scroll(e.deltaY * 0.5);
        return;
      }
    }
  },

  /**
   * _releaseAll()
   * Clean up all drag state and release pointer capture.
   */
  _releaseAll() {
    try {
      if (this._canvas && this.pointerId != null) {
        this._canvas.releasePointerCapture(this.pointerId);
      }
    } catch (_) {}

    this.isDragging = false;
    this.activePanel = null;
    this.pointerId = null;
    this.startX = 0;
    this.startY = 0;
    this.startPanelX = 0;
    this.startPanelY = 0;
    this._dragStarted = false;

    this._globalMasterDragging = false;
    this._panelMasterDragging = false;
    this._panelMasterKnob = false;
    this._activePanelMaster = null;
    this._scrollingPanel  = null;
    this._resizingPanel   = null;
  },

  /**
   * handleDown(e)
   * Handle pointer down.
   *
   * Priority:
   *   1. Global master slider
   *   2. Per-panel master slider
   *   3. Panel controls (buttons, sliders, minimize, etc.)
   *   4. Panel body (drag)
   *
   * Returns: true if consumed, false otherwise   */
  handleDown(e) {
    // When debug is off, only process input if tuning panels exist
    if (!DebugRouter.masterEnabled && TuningLayer._panels.length === 0) {
      return false;
    }

    // ── 1. Check global master slider first ───────────────────────────
    // Touch is gated on the SAME predicate the renderer draws from
    // (MasterSliderRenderer.isActive): debug ON + panel mode + >=2 pinned.
    // Visible ⟺ touchable, always — no ghost, no dead pixel.
    // The global master is drawn OUTSIDE the view-zoom transform → RAW coords.
    const masterActive = MasterSliderRenderer.isActive();
    if (masterActive && MasterSliderRenderer.handlePointerDown(e.clientX, e.clientY)) {
      this._globalMasterDragging = true;
      this.pointerId = e.pointerId;
      try {
        if (this._canvas) this._canvas.setPointerCapture(this.pointerId);
      } catch (_) {}
      e.preventDefault();
      e.stopImmediatePropagation();
      return true;
    }

    // ── 2-4. Check panels ─────────────────────────────────────────────
    // Panels are drawn under the view transform → map pointer to panel-space.
    const pt = this._toPanel(e.clientX, e.clientY);
    const x = pt.x;
    const y = pt.y;

    for (const panel of this._activePanels()) {
      if (!panel.visible) continue;

      // Get layout for this panel (needed for hit-testing)
      const data = panel.getData();
      const layout = panel.computeLayout(data);
      const pw = layout.w;
      const ph = layout.h;

      // ── Resize grip — bottom-right, checked FIRST before knob/master
      const GRIP  = 36;
      const gripX = panel.x + pw - GRIP;
      const gripY = panel.y + ph - GRIP;

      if (x >= gripX && x <= gripX + GRIP && y >= gripY && y <= gripY + GRIP) {
        this._resizingPanel = panel;
        this._resizeStartX  = x;
        this._resizeStartY  = y;
        this._resizeStartW  = pw;
        this._resizeStartH  = ph;
        this.pointerId = e.pointerId;
        try { if (this._canvas) this._canvas.setPointerCapture(this.pointerId); } catch (_) {}
        e.preventDefault();
        e.stopImmediatePropagation();
        return true;
      }

      // ── 2. Check per-panel master slider ────────────────────────────
      const masterHit = PanelMasterSlider.hitTest(
        panel, x, y,
        panel.x, panel.y,
        layout.w, layout.h,
        panel.minimized
      );

      if (masterHit) {
        if (masterHit.type === 'minimize') {
          panel.toggleMinimize();
          try { window._InAims?.syncDebugPanels(); } catch (_) {}
          e.preventDefault();
          e.stopImmediatePropagation();
          return true;
        } else if (masterHit.type === 'pin') {
          panel.togglePin();
          try { window._InAims?.syncDebugPanels(); } catch (_) {}
          e.preventDefault();
          e.stopImmediatePropagation();
          return true;
        } else if (masterHit.type === 'orientToggle') {
          panel.toggleMinOrientation();
          try { window._InAims?.syncDebugPanels(); } catch (_) {}
          e.preventDefault();
          e.stopImmediatePropagation();
          return true;
        } else if (masterHit.type === 'slider') {
          if (masterHit.isBound) {
            const kCfg = panel.config?.minimizedKnob;
            const boundVar = resolveVariable(kCfg.variable);
            boundVar?.set(masterHit.value);
            panel.panelMasterValue = masterHit.value / resolveDynamicMax(kCfg, 2);
          } else {
            panel.panelMasterValue = masterHit.value;
          }
          this._panelMasterDragging = true;
          this._panelMasterKnob = false;
          this._activePanelMaster = panel;
          this.pointerId = e.pointerId;
          try {
            if (this._canvas) this._canvas.setPointerCapture(this.pointerId);
          } catch (_) {}
          e.preventDefault();
          e.stopImmediatePropagation();
          return true;
        } else if (masterHit.type === 'mixChannel') {
          // Slice 1: channel knobs are visual — consume the tap so it doesn't
          // start a panel drag. (Individual channel drag comes next.)
          e.preventDefault();
          e.stopImmediatePropagation();
          return true;
        } else if (masterHit.type === 'knob') {
          const kCfg = panel.config?.minimizedKnob;
          this._panelMasterDragging    = true;
          this._panelMasterKnob        = true;
          this._panelMasterKnobStartY  = y;
          this._panelMasterKnobIsVar   = !!kCfg && !kCfg.ratioVars;
          this._panelMasterKnobIsRatio = !!kCfg?.ratioVars || !!masterHit.ratio;

          if (this._panelMasterKnobIsRatio) {
            // Ratio knob — scales all channels together, preserving ratio.
            // Baseline is captured now so scaling past a channel's max is
            // remembered and restored when the master comes back down.
            panel.captureRatioBaseline();
            this._panelMasterKnobMin        = kCfg?.min ?? 0.1;
            this._panelMasterKnobMax        = kCfg?.max ?? 3.0;
            this._panelMasterKnobStartValue = 1.0;  // factor starts at 100%
          } else if (kCfg) {
            this._panelMasterKnobVar        = resolveVariable(kCfg.variable);
            this._panelMasterKnobMin        = kCfg.min  ?? 0;
            this._panelMasterKnobDynMax     = !!kCfg.dynamicMaxFromBase;
            this._panelMasterKnobDynSource  = kCfg.dynamicMaxSource || 'render';
            this._panelMasterKnobMax        = resolveDynamicMax(kCfg, 10);
            this._panelMasterKnobStep       = kCfg.step ?? 1;
            this._panelMasterKnobInteger    = !!kCfg.integer;
            this._panelMasterKnobStartValue = this._panelMasterKnobVar?.get() ?? 0;
          } else {
            this._panelMasterKnobStartValue = panel.panelMasterValue ?? 1.0;
            this._panelMasterKnobMin        = 0;
            this._panelMasterKnobMax        = 2;
          }
          this._activePanelMaster = panel;
          this.pointerId = e.pointerId;
          try {
            if (this._canvas) this._canvas.setPointerCapture(this.pointerId);
          } catch (_) {}
          e.preventDefault();
          e.stopImmediatePropagation();
          return true;
        }
      }

      // ── 3. Check panel controls ─────────────────────────────────────
      const hit = panel.hitTest(x, y, layout);

      if (!hit) continue;

      // ── Minimize button ──────────────────────────────────────────────
      if (hit.type === 'minimize' || (hit.type === 'button' && hit.control?.config?.__minimize__)) {
        panel.toggleMinimize();
        try { window._InAims?.syncDebugPanels(); } catch (_) {}
        e.preventDefault();
        e.stopImmediatePropagation();
        return true;
      }

      // ── Pin button ───────────────────────────────────────────────────
      if (hit.type === 'pin') {
        panel.togglePin();
        try { window._InAims?.syncDebugPanels(); } catch (_) {}
        e.preventDefault();
        e.stopImmediatePropagation();
        return true;
      }

      // ── Section header tap — collapse/expand ─────────────────────────
      if (hit.type === 'sectionHeader') {
        panel.toggleSection(hit.key);
        panel._chromeDirty = true;
        e.preventDefault();
        e.stopImmediatePropagation();
        return true;
      }

      // ── Control hit → delegate to panel ─────────────────────────────
      if (hit.type === 'button' || hit.type === 'slider' || hit.type === 'knob' ||
          hit.type === 'dropdown' || hit.type === 'checkbox' || hit.type === 'color') {
        const consumed = panel.handlePointerDown(x, y, layout);
        if (consumed) {
          this.activePanel = panel;
          this.pointerId = e.pointerId;
          try {
            if (this._canvas) this._canvas.setPointerCapture(this.pointerId);
          } catch (_) {}
          e.preventDefault();
          e.stopImmediatePropagation();
          return true;
        }
      }

      // ── 4. Panel body hit → title bar drags, body scrolls ──────────────
      if (hit.type === 'panel') {
        const TITLE_BAR_H = 28;  // px — header row height (padY + lineHeight + padding)

        // Minimized panels: entire panel is title bar — always draggable
        // Expanded panels: only the top TITLE_BAR_H px is the drag handle
        const inTitleBar = panel.minimized || (y - panel.y) <= TITLE_BAR_H;

        if (inTitleBar) {
          // Drag to move
          this.activePanel = panel;
          this.pointerId = e.pointerId;
          this.isDragging = true;
          this._dragStarted = false;
          this.startX = x;
          this.startY = y;
          this.startPanelX = panel.x;
          this.startPanelY = panel.y;
          // Arrange: the grab point becomes the panel's anchor. Record the
          // offset inside the panel, cancel any in-flight glide on it, and start
          // a fresh trajectory sample buffer for the free-form eject direction.
          this._grabX = x - panel.x;
          this._grabY = y - panel.y;
          this._prevMoveX = x;
          this._prevMoveY = y;
          PanelArrange.cancel(panel);
          PanelArrange.clearTraj();
          try { if (this._canvas) this._canvas.setPointerCapture(this.pointerId); } catch (_) {}
          e.preventDefault();
          e.stopImmediatePropagation();
          return true;
        }

        // Body area — always scroll (even if not currently scrollable, safe no-op)
        this._scrollingPanel  = panel;
        this._scrollStartY    = y;
        this._scrollStartOff  = panel._scrollOffset;
        this.pointerId = e.pointerId;
        try { if (this._canvas) this._canvas.setPointerCapture(this.pointerId); } catch (_) {}
        e.preventDefault();
        e.stopImmediatePropagation();
        return true;
      }
    }

    // ── 5. Empty space (debug + panel mode): arm the marquee ──────────
    // Nothing was hit. Claim primary-button presses for the hold-to-select
    // rectangle. Sticky pan lock keeps its meaning — never steal from it.
    if (DebugRouter.masterEnabled && !DebugRouter._consoleMode &&
        (e.button === 0 || e.button === undefined) && !InputState.panLocked) {
      const pt = this._toPanel(e.clientX, e.clientY);
      const m = {
        armed: true, active: false,
        scx: e.clientX, scy: e.clientY,         // screen anchor (slop check)
        x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, // panel-space rect
        timer: null
      };
      m.timer = setTimeout(() => {
        if (this._marquee !== m || !m.armed) return;
        if (!DebugRouter.masterEnabled || DebugRouter._consoleMode) { this._marqueeClear(); return; }
        m.active = true;
        DEBUG_STATE.marquee = { active: true, x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 };
      }, MARQUEE_HOLD_MS);
      this._marquee = m;
      this.pointerId = e.pointerId;
      try { if (this._canvas) this._canvas.setPointerCapture(this.pointerId); } catch (_) {}
      e.preventDefault();
      return true;
    }

    return false;
  },

  _marqueeClear() {
    const m = this._marquee;
    if (m?.timer) { clearTimeout(m.timer); m.timer = null; }
    this._marquee = null;
    DEBUG_STATE.marquee = null;
  },

  /**
   * handleMove(e)
   * Handle pointer move.
   *
   * Returns: true if consumed, false otherwise
   */
  handleMove(e) {
    if (e.pointerId !== this.pointerId) return false;

    // ── Marquee (hold-to-select rectangle) ────────────────────────────
    if (this._marquee) {
      const m = this._marquee;
      if (!m.active) {
        // Moved before the hold fired → not a hold-press. Cancel; the gesture
        // is dead (empty-space drags do nothing else in panel mode anyway).
        if (Math.hypot(e.clientX - m.scx, e.clientY - m.scy) > MARQUEE_SLOP) {
          this._marqueeClear();
          this._releaseAll();
          return false;
        }
        return true;               // still holding still — keep the claim
      }
      const pt = this._toPanel(e.clientX, e.clientY);
      m.x1 = pt.x; m.y1 = pt.y;
      DEBUG_STATE.marquee = { active: true, x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 };
      e.preventDefault();
      return true;
    }

    // If debug is off, only continue if there's an active tuning panel interaction
    if (!DebugRouter.masterEnabled) {
      const hasTuning = this._scrollingPanel?.pinned
        || this._activePanelMaster?.pinned
        || this.activePanel?.pinned
        || this._resizingPanel?.pinned
        || this._panelMasterDragging;
      if (!hasTuning) {
        this._releaseAll();
        return false;
      }
    }

    // Panel-space coords (global master below uses RAW — drawn unscaled).
    const pt = this._toPanel(e.clientX, e.clientY);
    const x = pt.x;
    const y = pt.y;

    // ── Panel resize drag ─────────────────────────────────────────────
    if (this._resizingPanel) {
      const panel = this._resizingPanel;
      const MIN_W = panel.minimized && !panel._minVertical ? 88 : 52;
      const MIN_H = panel.minimized && panel._minVertical ? 109 : 52;
      const newW  = Math.max(MIN_W, this._resizeStartW + (x - this._resizeStartX));
      const newH  = Math.max(MIN_H, this._resizeStartH + (y - this._resizeStartY));
      if (panel.minimized) {
        panel._userMinW = newW;
        panel._userMinH = newH;
      } else {
        panel._userW = newW;
        panel._userH = newH;
      }
      panel._chromeDirty = true;
      e.preventDefault();
      return true;
    }

    // ── Panel scroll drag ─────────────────────────────────────────────
    if (this._scrollingPanel) {
      const dy = this._scrollStartY - y;
      this._scrollingPanel._scrollOffset = Math.max(0, this._scrollStartOff + dy);
      return true;
    }

    // ── Global master slider drag ─────────────────────────────────────
    if (this._globalMasterDragging) {
      MasterSliderRenderer.handlePointerMove(e.clientX, e.clientY);
      e.preventDefault();
      return true;
    }

    // ── Per-panel master slider/knob drag ─────────────────────────────
    if (this._panelMasterDragging && this._activePanelMaster) {
      const panel = this._activePanelMaster;

      if (this._panelMasterKnob) {
        // Refresh max live if it tracks base — base can change mid-drag
        if (this._panelMasterKnobDynMax) {
          this._panelMasterKnobMax = resolveDynamicMax(
            { dynamicMaxFromBase: true, dynamicMaxSource: this._panelMasterKnobDynSource },
            this._panelMasterKnobMax
          );
        }
        const range = this._panelMasterKnobMax - this._panelMasterKnobMin;
        const dy    = this._panelMasterKnobStartY - y;
        // 150px = full range travel
        const delta = (dy / 150) * range;
        let next    = this._panelMasterKnobStartValue + delta;
        next = Math.max(this._panelMasterKnobMin, Math.min(this._panelMasterKnobMax, next));
        if (this._panelMasterKnobInteger) next = Math.round(next);

        if (this._panelMasterKnobIsRatio) {
          panel.applyRatioScale(next);
          panel.panelMasterValue = next;   // also drives the visual knob arc
        } else if (this._panelMasterKnobIsVar && this._panelMasterKnobVar) {
          this._panelMasterKnobVar.set(next);
        } else {
          panel.panelMasterValue = next;
        }
      } else {
        const data   = panel.getData();
        const layout = panel.computeLayout(data);
        const masterHit = PanelMasterSlider.hitTest(
          panel, x, y,
          panel.x, panel.y,
          layout.w, layout.h,
          panel.minimized
        );
        if (masterHit?.type === 'slider') {
          if (masterHit.isBound) {
            const kCfg = panel.config?.minimizedKnob;
            const boundVar = resolveVariable(kCfg.variable);
            boundVar?.set(masterHit.value);
            panel.panelMasterValue = masterHit.value / resolveDynamicMax(kCfg, 2);
          } else {
            panel.panelMasterValue = masterHit.value;
          }
        }
      }

      e.preventDefault();
      return true;
    }

    // ── Panel drag ────────────────────────────────────────────────────
    if (this.isDragging && this.activePanel) {
      const dx = x - this.startX;
      const dy = y - this.startY;

      // Only count as drag after 4px movement (prevents accidental drag on tap)
      if (!this._dragStarted && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        this._dragStarted = true;
      }

      if (this._dragStarted) {
        this.activePanel.x = this.startPanelX + dx;
        this.activePanel.y = this.startPanelY + dy;
        // Feed the incremental move into the trajectory buffer (last 5 averaged)
        // so a free-form drop can eject along the direction the drag came from.
        PanelArrange.sample(x - this._prevMoveX, y - this._prevMoveY);
        this._prevMoveX = x;
        this._prevMoveY = y;
        e.preventDefault();
        return true;
      }
    }

    // ── Control drag (slider/knob) + hover updates ────────────────────
    if (this.activePanel) {
      const data = this.activePanel.getData();
      const layout = this.activePanel.computeLayout(data);
      const consumed = this.activePanel.handlePointerMove(x, y, layout);
      if (consumed) {
        e.preventDefault();
        return true;
      }
    }

    return false;
  },

  /**
   * handleUp(e)
   * Handle pointer up.
   *
   * Returns: true if consumed, false otherwise
   */
  handleUp(e) {
    if (e.pointerId !== this.pointerId) return false;

    // ── Marquee release: COLLECT everything the rectangle caught ──────
    if (this._marquee) {
      const m = this._marquee;
      m.armed = false;
      const wasActive = m.active;
      this._marqueeClear();
      if (wasActive) {
        const rect = {
          x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1),
          w: Math.abs(m.x1 - m.x0), h: Math.abs(m.y1 - m.y0)
        };
        if (rect.w > 4 && rect.h > 4) DebugRouter.collectInto(rect);
      }
      this._releaseAll();
      return true;
    }

    // ── Global master slider release ──────────────────────────────────
    if (this._globalMasterDragging) {
      MasterSliderRenderer.handlePointerUp(e.clientX, e.clientY);
      this._globalMasterDragging = false;      this._releaseAll();
      return true;
    }

    // ── Per-panel master slider release ───────────────────────────────
    if (this._panelMasterDragging) {
      if (this._panelMasterKnobIsRatio && this._activePanelMaster) {
        this._activePanelMaster.clearRatioBaseline();
      }
      this._panelMasterDragging = false;
      this._panelMasterKnob = false;
      this._panelMasterKnobIsRatio = false;
      this._activePanelMaster = null;
      this._releaseAll();
      return true;
    }

    // ── Release control interactions ──────────────────────────────────
    if (this.activePanel && !this.isDragging) {
      const pt = this._toPanel(e.clientX, e.clientY);
      const data = this.activePanel.getData();
      const layout = this.activePanel.computeLayout(data);
      this.activePanel.handlePointerUp(pt.x, pt.y, layout);
    }

    // ── Stop panel drag ───────────────────────────────────────────────
    if (this.isDragging) {
      const dropped = this.activePanel;
      const didMove = this._dragStarted;
      this._releaseAll();

      // Settle: grid-snap or free-form min-spacing eject, then an eased glide.
      // Only when an actual drag happened — a tap must never nudge a panel.
      if (dropped && didMove) {
        PanelArrange.settle(dropped, this._activePanels(), { x: this._grabX, y: this._grabY });
      }

      // Rebuild the AIMS hit-map with the panel's new position (the real,
      // working call — the old onDebugToggle() was a dead no-op).
      try { window._InAims?.syncDebugPanels(); } catch (_) {}

      return true;
    }

    this._releaseAll();
    return false;
  }
};