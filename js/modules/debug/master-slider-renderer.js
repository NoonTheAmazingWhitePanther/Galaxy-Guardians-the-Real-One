import { DEBUG_STATE } from './debug-state.js';
import { MasterGovernor } from './master-governor.js';

// ── FIXED anchor — the right-edge button stack (#pan-pad, #aims-btn) ──────
// #debug-btn moved to the left edge, but the vertical rhythm is unchanged
// (aims-btn shifted up to take its old slot), so measuring the gap between
// debug-btn's bottom and aims-btn's top still gives the correct value —
// getBoundingClientRect() only cares about vertical position here, so
// debug-btn's horizontal side doesn't matter for this measurement.
// #aims-btn ("Toggle AIMS Input") is the last/bottom button in that stack.
// Everything below is measured live off those real DOM elements — width,
// x position, and the gap between them — so the slider always matches them
// exactly (any breakpoint/CSS change) and is NEVER touched by any debug
// panel's position, size, minimize state, or visibility.
const THUMB_H = 16;
const FALLBACK_GAP = 6;

export const MasterSliderRenderer = {
  _bounds: null,
  _dragging: false,
  _dragStartY: 0,

  computeBounds() {
    if (typeof document === 'undefined') return this._bounds;

    const aimsBtn  = document.getElementById('aims-btn');
    const debugBtn = document.getElementById('debug-btn');
    if (!aimsBtn) return this._bounds;

    const aimsRect = aimsBtn.getBoundingClientRect();

    // Gap between the 3 buttons — measured live between debug-btn and
    // aims-btn, so it's always the exact same spacing, at any screen size.
    let gap = FALLBACK_GAP;
    if (debugBtn) {
      const debugRect = debugBtn.getBoundingClientRect();
      const measured = aimsRect.top - debugRect.bottom;
      if (measured > 0) gap = measured;
    }

    const x = aimsRect.left;
    const w = aimsRect.width;
    const y = aimsRect.bottom + gap;

    // Bottom bound — same gap kept above the bottom bar (#ui)
    let bottomLimit = window.innerHeight - gap;
    const uiBar = document.getElementById('ui');
    if (uiBar) {
      const uiRect = uiBar.getBoundingClientRect();
      if (uiRect.top > 0) bottomLimit = uiRect.top - gap;
    }

    const h = Math.max(40, bottomLimit - y);

    this._bounds = { x, y, w, h };
    return this._bounds;
  },
  
  render(mainCtx, panels) {
    if (!MasterGovernor._panels || MasterGovernor._panels.length === 0) return;
    
    const bounds = this.computeBounds();
    if (!bounds || bounds.h <= 0) return;
    
    const s = DEBUG_STATE.style;
    // ✅ FIX: NO dpr multiplication. Canvas transform handles it.
    const value = MasterGovernor.value;
    
    mainCtx.save();
    
    // Track background
    mainCtx.fillStyle = 'rgba(255,255,255,0.08)';
    mainCtx.beginPath();
    mainCtx.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, 4);
    mainCtx.fill();
    
    // Track fill
    const thumbY = bounds.y + bounds.h - (value / 2.0) * bounds.h;
    const fillColor = value > 1.0 ? 'rgba(255,100,80,0.6)' : value < 1.0 ? 'rgba(130,210,255,0.6)' : 'rgba(255,255,255,0.3)';
    mainCtx.fillStyle = fillColor;
    mainCtx.beginPath();
    mainCtx.roundRect(bounds.x, thumbY, bounds.w, bounds.h - (thumbY - bounds.y), 4);
    mainCtx.fill();
    
    // Thumb
    mainCtx.fillStyle = this._dragging ? 'rgba(255,255,255,0.95)' : 'rgba(240,245,255,0.85)';
    mainCtx.beginPath();
    mainCtx.roundRect(bounds.x + 2, thumbY - THUMB_H / 2, bounds.w - 4, THUMB_H, 3);
    mainCtx.fill();
    mainCtx.strokeStyle = this._dragging ? 'rgba(130,210,255,0.8)' : 'rgba(255,255,255,0.3)';
    mainCtx.lineWidth = 1;
    mainCtx.stroke();
    
    // Value label
    mainCtx.fillStyle = 'rgba(240,245,255,0.9)';
    mainCtx.font = `bold 11px ${s.font}`;
    mainCtx.textAlign = 'center';
    mainCtx.textBaseline = 'middle';
    mainCtx.fillText(MasterGovernor.label, bounds.x + bounds.w / 2, thumbY);
    
    // Tick marks — narrow bar near the screen's right edge, so labels go
    // on the left (open canvas space), same as the original design.
    mainCtx.strokeStyle = 'rgba(255,255,255,0.2)';
    mainCtx.lineWidth = 1;
    const ticks = [0.0, 0.5, 1.0, 1.5, 2.0];
    for (const tick of ticks) {
      const tickY = bounds.y + bounds.h - (tick / 2.0) * bounds.h;
      mainCtx.beginPath();
      mainCtx.moveTo(bounds.x, tickY);
      mainCtx.lineTo(bounds.x + 4, tickY);
      mainCtx.stroke();
      
      mainCtx.fillStyle = 'rgba(240,245,255,0.4)';
      mainCtx.font = `8px ${s.font}`;
      mainCtx.textAlign = 'right';
      mainCtx.textBaseline = 'middle';
      mainCtx.fillText(tick.toFixed(1), bounds.x - 2, tickY);
    }
    
    // Title — rotated, inside the top of the track. There's no room above
    // the bar for it anymore (the aims button sits right there with only
    // a small gap), so it lives inside the track instead.
    mainCtx.save();
    mainCtx.translate(bounds.x + bounds.w / 2, bounds.y + 18);
    mainCtx.rotate(-Math.PI / 2);
    mainCtx.fillStyle = 'rgba(240,245,255,0.5)';
    mainCtx.font = `bold 8px ${s.font}`;
    mainCtx.textAlign = 'center';
    mainCtx.textBaseline = 'middle';
    mainCtx.fillText('MASTER', 0, 0);
    mainCtx.restore();
    
    mainCtx.restore();
  },
  
  hitTest(x, y) {
    if (!this._bounds) return null;
    const { x: bx, y: by, w: bw, h: bh } = this._bounds;
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
      const frac = 1.0 - (y - by) / bh;
      const value = Math.max(0, Math.min(2.0, frac * 2.0));
      return { hit: true, value };
    }
    return null;
  },
  
  handlePointerDown(x, y) {
    const hit = this.hitTest(x, y);
    if (!hit) return false;
    this._dragging = true;
    this._dragStartY = y;
    MasterGovernor.setValue(hit.value);
    return true;
  },
  
  handlePointerMove(x, y) {
    if (!this._dragging || !this._bounds) return false;
    const { y: by, h: bh } = this._bounds;
    const frac = 1.0 - (y - by) / bh;
    const value = Math.max(0, Math.min(2.0, frac * 2.0));
    MasterGovernor.setValue(value);
    return true;
  },
  
  handlePointerUp(x, y) {
    if (!this._dragging) return false;
    this._dragging = false;
    const dragDist = Math.abs(y - this._dragStartY);
    if (dragDist < 5) {
      MasterGovernor.reset();
    }
    return true;
  },
  
  get isDragging() {
    return this._dragging;
  }
};

export default MasterSliderRenderer;