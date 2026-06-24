import { DEBUG_STATE } from './debug-state.js';
import { MasterGovernor } from './master-governor.js';

const SLIDER_W = 24;
const SLIDER_PAD = 8;
const THUMB_H = 20;

export const MasterSliderRenderer = {
  _bounds: null,
  _dragging: false,
  _dragStartY: 0,
  
  computeBounds(panels) {
    if (!panels || panels.length === 0) {
      return { x: 300, y: 80, w: SLIDER_W, h: 400 };
    }
    
    let maxX = 0;
    let minY = Infinity;
    let maxY = 0;
    
    for (const panel of panels) {
      if (!panel.visible) continue;
      const panelRight = panel.x + (panel.w || 220) + 30;
      if (panelRight > maxX) maxX = panelRight;
      if (panel.y < minY) minY = panel.y;
      if (panel.y + (panel.h || 100) > maxY) maxY = panel.y + (panel.h || 100);
    }
    
    const x = maxX + SLIDER_PAD;
    const y = minY;
    const h = Math.max(200, maxY - minY);
    
    this._bounds = { x, y, w: SLIDER_W, h };
    return this._bounds;
  },
  
  render(mainCtx, panels) {
    if (!MasterGovernor._panels || MasterGovernor._panels.length === 0) return;
    
    const bounds = this.computeBounds(panels);
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
    
    // Tick marks
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
    
    // Title
    mainCtx.fillStyle = 'rgba(240,245,255,0.7)';
    mainCtx.font = `bold 9px ${s.font}`;
    mainCtx.textAlign = 'center';
    mainCtx.textBaseline = 'top';
    mainCtx.fillText('MASTER', bounds.x + bounds.w / 2, bounds.y - 14);
    
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