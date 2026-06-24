/**
 * js/modules/debug/panel-master.js
 * FIXED: No double DPR scaling. Coordinates are CSS pixels only.
 */
import { DEBUG_STATE } from './debug-state.js';

const SLIDER_W = 20;
const SLIDER_PAD = 6;
const THUMB_H = 16;
const MINIMIZE_BTN_SIZE = 16;

export const PanelMasterSlider = {
  render(ctx, panel, x, y, panelW, panelH, minimized) {
    const s = DEBUG_STATE.style;
    // NO dpr multiplication — canvas transform already handles it
    const sliderX = x + panelW + SLIDER_PAD;
    const sliderY = y;
    const sliderH = minimized ? 80 : panelH;
    const value = panel.panelMasterValue ?? 1.0;

    const btnX = x + panelW - MINIMIZE_BTN_SIZE - 4;
    const btnY = y + 4;

    // Minimize button
    ctx.fillStyle = minimized ? 'rgba(130, 210, 255, 0.3)' : 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, MINIMIZE_BTN_SIZE, MINIMIZE_BTN_SIZE, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(240,245,255,0.85)';
    ctx.font = `10px ${s.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(minimized ? '▲' : '▼', btnX + MINIMIZE_BTN_SIZE / 2, btnY + MINIMIZE_BTN_SIZE / 2);

    // Slider track
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(sliderX, sliderY, SLIDER_W, sliderH, 4);
    ctx.fill();

    // Slider fill
    const thumbY = sliderY + sliderH - (value / 2.0) * sliderH;
    const fillColor = value > 1.0 ? 'rgba(255,100,80,0.6)' : value < 1.0 ? 'rgba(130,210,255,0.6)' : 'rgba(255,255,255,0.3)';
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.roundRect(sliderX, thumbY, SLIDER_W, sliderH - (thumbY - sliderY), 4);    ctx.fill();

    // Thumb
    ctx.fillStyle = panel._masterDragging ? 'rgba(255,255,255,0.95)' : 'rgba(240,245,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(sliderX + 2, thumbY - THUMB_H / 2, SLIDER_W - 4, THUMB_H, 3);
    ctx.fill();
    ctx.strokeStyle = panel._masterDragging ? 'rgba(130,210,255,0.8)' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Value label
    ctx.fillStyle = 'rgba(240,245,255,0.9)';
    ctx.font = `bold 10px ${s.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${value.toFixed(2)}x`, sliderX + SLIDER_W / 2, thumbY);

    // Summary value when minimized
    if (minimized && panel.summaryValue) {
      ctx.fillStyle = s.accent;
      ctx.font = `bold 14px ${s.font}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(panel.summaryValue, x + 8, y + 30);
      ctx.fillStyle = s.textFaint;
      ctx.font = `9px ${s.font}`;
      ctx.fillText(panel.summaryLabel || '', x + 8, y + 48);
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