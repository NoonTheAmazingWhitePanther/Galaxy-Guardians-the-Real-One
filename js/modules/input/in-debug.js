/**
 * js/modules/input/in-debug.js
 * Handles Debug Panel interactions (Drag & Refresh Rate).
 * FIXED: Exact coordinate matching with debug-renderer.js
 */
import { DebugRouter } from '../debug/debug-router.js';
import { DEBUG_STATE } from '../debug/debug-state.js';
import { DrawCallCounter } from '../debug/draw-call-counter.js';
import { PhysicsCounter } from '../debug/physics-counter.js';

// MUST match the translate(15,15) in debug-renderer.js
const SHADOW_PAD = 15;

export const InDebug = {
  activePanel: null,
  pointerId: null,
  startX: 0, startY: 0,
  startPanelX: 0, startPanelY: 0,

  init(canvas) {},

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

  _forceRelease(e) {
    if (this.activePanel) {
      try {
        if (e && e.target) e.target.releasePointerCapture(this.pointerId);
      } catch (err) {}
      this.activePanel = null;
      this.pointerId = null;
    }
  },

  handleDown(e) {
    if (!DebugRouter.masterEnabled) return false;

    // RAW viewport coordinates — identical to renderer's drawImage x/y
    const x = e.clientX;    const y = e.clientY;

    for (const p of DebugRouter.panels) {
      if (!p.visible) continue;
      const data = p.type === 'drawCalls' ? DrawCallCounter : PhysicsCounter;
      const { w: pw, h: ph } = this._getPanelSize(p, data);

      // Renderer draws at: mainCtx.drawImage(off, panel.x - 15, panel.y - 15)
      // Offscreen canvas size is: pw + 30, ph + 30
      // So the VISIBLE clickable area is exactly:
      const visX = p.x - SHADOW_PAD;
      const visY = p.y - SHADOW_PAD;
      const visW = pw + SHADOW_PAD * 2;
      const visH = ph + SHADOW_PAD * 2;

      if (x >= visX && x <= visX + visW && y >= visY && y <= visY + visH) {
        this.activePanel = p;
        this.pointerId = e.pointerId;
        this.startX = x;
        this.startY = y;
        this.startPanelX = p.x;
        this.startPanelY = p.y;

        // Cycle refresh rate if clicking top-right corner of CONTENT (not shadow)
        if (x > p.x + pw - 30 && y < p.y + 20) {
          p.currentRateIdx = (p.currentRateIdx + 1) % p.refreshRates.length;
          p.refreshRate = p.refreshRates[p.currentRateIdx];
          this.activePanel = null;
        } else {
          try { e.target.setPointerCapture(this.pointerId); } catch (err) {}
        }

        e.preventDefault();
        e.stopImmediatePropagation();
        return true; // CONSUMED
      }
    }
    return false;
  },

  handleMove(e) {
    if (!this.activePanel || e.pointerId !== this.pointerId) return false;

    // Delta is calculated in RAW viewport space, applied directly to panel.x/y
    // This guarantees 1:1 movement with zero drift or multiplication
    this.activePanel.x = this.startPanelX + (e.clientX - this.startX);
    this.activePanel.y = this.startPanelY + (e.clientY - this.startY);

    e.preventDefault();
    return true; // CONSUME
    },

  handleUp(e) {
    if (this.activePanel && e.pointerId === this.pointerId) {
      this._forceRelease(e);
      return true;
    }
    return false;
  }
};