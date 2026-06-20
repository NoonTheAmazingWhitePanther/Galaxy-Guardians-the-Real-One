/**
 * js/modules/input/in-debug.js
 * Handles Debug Panel drag, refresh rate cycling, and governor button taps.
 *
 * Button strip (top-right of each panel):
 *   Physics:  ✕ (multiply)   = (idle/reset)   ÷ (divide)
 *   Render:   + (add skip)   = (idle/reset)   − (subtract skip)
 *
 * All coordinates in CSS pixels. DPR handled in debug-renderer only.
 */
import { DebugRouter }      from '../debug/debug-router.js';
import { DEBUG_STATE }      from '../debug/debug-state.js';
import { DrawCallCounter }  from '../debug/draw-call-counter.js';
import { PhysicsCounter }   from '../debug/physics-counter.js';
import { PhysicsGovernor }  from '../../core/physics-governor.js';
import { RenderGovernor }   from '../../core/render-governor.js';

const SHADOW_PAD = 15;

export const InDebug = {
  _canvas: null,
  isDragging: false,
  activePanel: null,
  pointerId: null,
  startX: 0, startY: 0,
  startPanelX: 0, startPanelY: 0,

  init(canvas) {
    this._canvas = canvas;
  },

  _getPanelSize(panel, data) {
    const s  = DEBUG_STATE.style;
    const sc = DEBUG_STATE.scale;
    const pw = (s.labelW + s.valW + s.padX * 2) * sc;
    let lines = 0;
    if (panel.type === 'drawCalls') {
      lines = 1 + Object.entries(data.calls).filter(([, v]) => v > 0).length + 1;
    } else {
      lines = 1 + Object.entries(data.stats).filter(([, v]) => v > 0).length;
    }
    const btnStripH = 18 + s.padY * sc;
    const ph = (s.padY * 2 * sc) + (s.lineHeight * sc * lines) + btnStripH;
    return { w: pw, h: ph };
  },

  _getGov(panel) {
    return panel.type === 'physics' ? PhysicsGovernor : RenderGovernor;
  },

  _fireBtn(panel, label) {
    const gov = this._getGov(panel);
    if (panel.type === 'physics') {
      // Timestep row: ✕ = ÷
      if      (label === '✕') gov.multiply();
      else if (label === '=') gov.idle();
      else if (label === '÷') gov.divide();
      // Substep row: sub:+ sub:= sub:−
      else if (label === 'sub:+') gov.subAdd();
      else if (label === 'sub:=') gov.subIdle();
      else if (label === 'sub:−') gov.subSubtract();
    } else {
      if      (label === '+') gov.add();
      else if (label === '=') gov.idle();
      else if (label === '−') gov.subtract();
    }
  },

  _release() {
    try {
      if (this._canvas && this.pointerId != null)
        this._canvas.releasePointerCapture(this.pointerId);
    } catch (_) {}
    this.isDragging  = false;
    this.activePanel = null;
    this.pointerId   = null;
  },

  handleDown(e) {
    if (!DebugRouter.masterEnabled) return false;

    const x = e.clientX;
    const y = e.clientY;

    for (const panel of DebugRouter.panels) {
      if (!panel.visible) continue;
      const data = panel.type === 'drawCalls' ? DrawCallCounter : PhysicsCounter;
      const { w: pw, h: ph } = this._getPanelSize(panel, data);

      const hitX = panel.x - SHADOW_PAD;
      const hitY = panel.y - SHADOW_PAD;
      const hitW = pw + SHADOW_PAD * 2;
      const hitH = ph + SHADOW_PAD * 2;

      if (x < hitX || x > hitX + hitW || y < hitY || y > hitY + hitH) continue;

      // ── Check governor buttons first ────────────────────────────────
      if (panel._btns) {
        for (const btn of panel._btns) {
          const bx = panel.x + btn.x - SHADOW_PAD;
          const by = panel.y + btn.y - SHADOW_PAD;
          if (x >= bx && x <= bx + btn.w && y >= by && y <= by + btn.h) {
            this._fireBtn(panel, btn.label);
            e.preventDefault();
            e.stopImmediatePropagation();
            return true;
          }
        }
      }

      // ── Tap top-right corner → cycle refresh rate ───────────────────
      if (x > panel.x + pw - 30 && y < panel.y + 20) {
        panel.currentRateIdx = (panel.currentRateIdx + 1) % panel.refreshRates.length;
        panel.refreshRate    = panel.refreshRates[panel.currentRateIdx];
        e.preventDefault();
        e.stopImmediatePropagation();
        return true;
      }

      // ── Start drag ──────────────────────────────────────────────────
      this.activePanel  = panel;
      this.pointerId    = e.pointerId;
      this.isDragging   = true;
      this.startX       = x;
      this.startY       = y;
      this.startPanelX  = panel.x;
      this.startPanelY  = panel.y;

      try {
        if (this._canvas) this._canvas.setPointerCapture(this.pointerId);
      } catch (_) {}

      e.preventDefault();
      e.stopImmediatePropagation();
      return true;
    }
    return false;
  },

  handleMove(e) {
    if (!this.isDragging) return false;
    if (e.pointerId !== this.pointerId) return false;
    this.activePanel.x = this.startPanelX + (e.clientX - this.startX);
    this.activePanel.y = this.startPanelY + (e.clientY - this.startY);
    e.preventDefault();
    return true;
  },

  handleUp(e) {
    if (!this.isDragging) return false;
    if (e.pointerId !== this.pointerId) return false;
    this._release();
    return true;
  }
};
