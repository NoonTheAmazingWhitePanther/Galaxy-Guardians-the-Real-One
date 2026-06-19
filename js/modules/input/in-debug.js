/**
 * js/modules/input/in-debug.js
 * Handles Debug Panel drag & refresh rate cycling.
 *
 * FIX (2026-06-19):
 * - Store canvas reference in init() so setPointerCapture uses the right element
 * - Hard isDragging flag prevents camera from stealing events when capture fails
 * - Delta applied in raw screen space (clientX/Y) — panels live in screen space
 *   via setTransform(1,0,0,1,0,0), so camera zoom/pan never affects drag coords
 */
import { DebugRouter } from '../debug/debug-router.js';
import { DEBUG_STATE } from '../debug/debug-state.js';
import { DrawCallCounter } from '../debug/draw-call-counter.js';
import { PhysicsCounter } from '../debug/physics-counter.js';

// Must match the ctx.translate(15,15) in debug-renderer.js
const SHADOW_PAD = 15;

export const InDebug = {
  _canvas: null,       // set in init() — used for reliable setPointerCapture
  isDragging: false,   // hard flag: true while a panel is being dragged
  activePanel: null,
  pointerId: null,
  startX: 0, startY: 0,
  startPanelX: 0, startPanelY: 0,

  init(canvas) {
    this._canvas = canvas;
  },

  _getPanelSize(panel, data) {
    const s = DEBUG_STATE.style;
    const scale = DEBUG_STATE.scale;
    const pw = (s.labelW + s.valW + s.padX * 2) * scale;
    let lines = 0;
    if (panel.type === 'drawCalls') {
      lines = 1 + Object.entries(data.calls).filter(([, v]) => v > 0).length + 1;
    } else {
      lines = 1 + Object.entries(data.stats).filter(([, v]) => v > 0).length;
    }
    const ph = (s.padY * 2 + s.lineHeight * lines) * scale;
    return { w: pw, h: ph };
  },

  _release(e) {
    if (!this.activePanel) return;
    // Try to release pointer capture — ignore if it fails (e.g. already lost)
    try {
      if (this._canvas && this.pointerId != null) {
        this._canvas.releasePointerCapture(this.pointerId);
      }
    } catch (_) {}
    this.isDragging = false;
    this.activePanel = null;
    this.pointerId = null;
  },

  handleDown(e) {
    if (!DebugRouter.masterEnabled) return false;

    // Panels are drawn in screen space (setTransform identity in debug-renderer),
    // so panel.x/y are raw screen pixels — match directly against clientX/Y.
    const x = e.clientX;
    const y = e.clientY;

    for (const panel of DebugRouter.panels) {
      if (!panel.visible) continue;
      const data = panel.type === 'drawCalls' ? DrawCallCounter : PhysicsCounter;
      const { w: pw, h: ph } = this._getPanelSize(panel, data);

      // Renderer: mainCtx.drawImage(off, panel.x - SHADOW_PAD, panel.y - SHADOW_PAD)
      // Offscreen canvas size: pw + 30, ph + 30
      const hitX = panel.x - SHADOW_PAD;
      const hitY = panel.y - SHADOW_PAD;
      const hitW = pw + SHADOW_PAD * 2;
      const hitH = ph + SHADOW_PAD * 2;

      if (x >= hitX && x <= hitX + hitW && y >= hitY && y <= hitY + hitH) {

        // Tap top-right corner → cycle refresh rate, no drag
        if (x > panel.x + pw - 30 && y < panel.y + 20) {
          panel.currentRateIdx = (panel.currentRateIdx + 1) % panel.refreshRates.length;
          panel.refreshRate = panel.refreshRates[panel.currentRateIdx];
          e.preventDefault();
          e.stopImmediatePropagation();
          return true;
        }

        // Start drag
        this.activePanel = panel;
        this.pointerId   = e.pointerId;
        this.isDragging  = true;
        this.startX      = x;
        this.startY      = y;
        this.startPanelX = panel.x;
        this.startPanelY = panel.y;

        // Capture on the canvas element — most reliable across browsers/mobile
        try {
          if (this._canvas) this._canvas.setPointerCapture(this.pointerId);
        } catch (_) {}

        e.preventDefault();
        e.stopImmediatePropagation();
        return true; // consumed
      }
    }
    return false;
  },

  handleMove(e) {
    // Short-circuit immediately — don't let camera see this event
    if (!this.isDragging) return false;
    if (e.pointerId !== this.pointerId) return false;

    // Pure screen-space delta. Camera zoom/pan don't affect this at all
    // because panels are rendered with setTransform(1,0,0,1,0,0).
    this.activePanel.x = this.startPanelX + (e.clientX - this.startX);
    this.activePanel.y = this.startPanelY + (e.clientY - this.startY);

    e.preventDefault();
    return true; // consumed — camera never sees this
  },

  handleUp(e) {
    if (!this.isDragging) return false;
    if (e.pointerId !== this.pointerId) return false;
    this._release(e);
    return true;
  }
};
