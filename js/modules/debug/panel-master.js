import { DEBUG_STATE } from './debug-state.js';

const SLIDER_W = 10;
const SLIDER_PAD = 6;
const THUMB_H = 16;
const MINIMIZE_BTN_SIZE = 16;

export const PanelMasterSlider = {
  render(mainCtx, panel, x, y, panelW, panelH, minimized) {
    const s = DEBUG_STATE.style;
    const dpr = DEBUG_STATE.dpr;
    
    // Scale all coordinates and sizes for high-res canvas
    const sx = x * dpr;
    const sy = y * dpr;
    const sw = panelW * dpr;
    const sh = panelH * dpr;
    const sliderW = SLIDER_W * dpr;
    const sliderPad = SLIDER_PAD * dpr;
    const thumbH = THUMB_H * dpr;
    const minBtnSize = MINIMIZE_BTN_SIZE * dpr;
    
    const sliderX = sx + sw + sliderPad;
    const sliderY = sy;
    const sliderH = minimized ? 80 * dpr : sh;
    const value = panel.panelMasterValue ?? 1.0;
    
    // Minimize button
    const btnX = sx + sw - minBtnSize - 4 * dpr;
    const btnY = sy + 4 * dpr;
    
    mainCtx.fillStyle = minimized ? 'rgba(130, 210, 255, 0.3)' : 'rgba(255,255,255,0.08)';
    mainCtx.beginPath();
    mainCtx.roundRect(btnX, btnY, minBtnSize, minBtnSize, 3 * dpr);
    mainCtx.fill();
    mainCtx.strokeStyle = 'rgba(255,255,255,0.2)';
    mainCtx.lineWidth = 1 * dpr;
    mainCtx.stroke();
    
    mainCtx.fillStyle = 'rgba(240,245,255,0.85)';
    mainCtx.font = `${10 * dpr}px ${s.font}`;
    mainCtx.textAlign = 'center';
    mainCtx.textBaseline = 'middle';
    mainCtx.fillText(minimized ? '▲' : '▼', btnX + minBtnSize / 2, btnY + minBtnSize / 2);
    
    // Slider track
    mainCtx.fillStyle = 'rgba(255,255,255,0.08)';
    mainCtx.beginPath();
    mainCtx.roundRect(sliderX, sliderY, sliderW, sliderH, 4 * dpr);
    mainCtx.fill();
    // Slider fill
    const thumbY = sliderY + sliderH - (value / 2.0) * sliderH;
    const fillColor = value > 1.0 ? 'rgba(255,100,80,0.6)' : value < 1.0 ? 'rgba(130,210,255,0.6)' : 'rgba(255,255,255,0.3)';
    mainCtx.fillStyle = fillColor;
    mainCtx.beginPath();
    mainCtx.roundRect(sliderX, thumbY, sliderW, sliderH - (thumbY - sliderY), 4 * dpr);
    mainCtx.fill();
    
    // Thumb
    mainCtx.fillStyle = panel._masterDragging ? 'rgba(255,255,255,0.95)' : 'rgba(240,245,255,0.85)';
    mainCtx.beginPath();
    mainCtx.roundRect(sliderX + 2 * dpr, thumbY - thumbH / 2, sliderW - 4 * dpr, thumbH, 3 * dpr);
    mainCtx.fill();
    mainCtx.strokeStyle = panel._masterDragging ? 'rgba(130,210,255,0.8)' : 'rgba(255,255,255,0.3)';
    mainCtx.lineWidth = 1 * dpr;
    mainCtx.stroke();
    
    // Value label
    mainCtx.fillStyle = 'rgba(240,245,255,0.9)';
    mainCtx.font = `bold ${10 * dpr}px ${s.font}`;
    mainCtx.textAlign = 'center';
    mainCtx.textBaseline = 'middle';
    mainCtx.fillText(`${value.toFixed(2)}x`, sliderX + sliderW / 2, thumbY);
    
    // Summary value (minimized)
    if (minimized && panel.summaryValue) {
      mainCtx.fillStyle = s.accent;
      mainCtx.font = `bold ${14 * dpr}px ${s.font}`;
      mainCtx.textAlign = 'left';
      mainCtx.textBaseline = 'top';
      mainCtx.fillText(panel.summaryValue, sx + 8 * dpr, sy + 30 * dpr);
      mainCtx.fillStyle = s.textFaint;
      mainCtx.font = `${9 * dpr}px ${s.font}`;
      mainCtx.fillText(panel.summaryLabel || '', sx + 8 * dpr, sy + 48 * dpr);
    }
  },
  
  hitTest(panel, x, y, panelX, panelY, panelW, panelH, minimized) {
    const sliderX = panelX + panelW + SLIDER_PAD;
    const sliderY = panelY;
    const sliderH = minimized ? 80 : panelH;
    
    const btnX = panelX + panelW - MINIMIZE_BTN_SIZE - 4;
    const btnY = panelY + 4;
    if (x >= btnX && x <= btnX + MINIMIZE_BTN_SIZE &&
      y >= btnY && y <= btnY + MINIMIZE_BTN_SIZE) {
      return { type: 'minimize' };
    }
    if (x >= sliderX && x <= sliderX + SLIDER_W &&
      y >= sliderY && y <= sliderY + sliderH) {
      const frac = 1.0 - (y - sliderY) / sliderH;
      const value = Math.max(0, Math.min(2.0, frac * 2.0));
      return { type: 'slider', value };
    }
    
    return null;
  },
  
  getBounds(panelX, panelY, panelW, panelH, minimized) {
    const sliderX = panelX + panelW + SLIDER_PAD;
    const sliderY = panelY;
    const sliderH = minimized ? 80 : panelH;
    return { x: sliderX, y: sliderY, w: SLIDER_W, h: sliderH };
  }
};

export default PanelMasterSlider;