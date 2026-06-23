import { DEBUG_STATE } from '../debug/debug-state.js';
import { ControlRenderer } from '../debug/controls.js';
import { PanelMasterSlider } from '../debug/panel-master.js';
import { MasterSliderRenderer } from '../debug/master-slider-renderer.js';

const SHADOW_PAD = 15;

export const DebugRenderer = {
  drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  renderPanel(mainCtx, panel, data) {
    if (!panel.visible) return;

    const s = DEBUG_STATE.style;
    const sc = DEBUG_STATE.scale;
    const dpr = DEBUG_STATE.dpr;
    const fontSize = s.fontSize * sc;
    const padX = s.padX * sc;
    const padY = s.padY * sc;
    const radius = s.radius * sc;
    const lineHeight = s.lineHeight * sc;

    const layout = panel.computeLayout(data);
    const pw = Math.floor(layout.w);
    const ph = Math.floor(layout.h);
    const { lines, controls, minimized } = layout;

    if (panel._lastW !== pw || panel._lastH !== ph) {
      panel._chromeDirty = true;
      panel._lastW = pw;
      panel._lastH = ph;
      const sw = Math.ceil((pw + SHADOW_PAD * 2) * dpr);
      const sh = Math.ceil((ph + SHADOW_PAD * 2) * dpr);
      panel._chromeCanvas.width = sw;
      panel._chromeCanvas.height = sh;
      panel._dataCanvas.width = sw;
      panel._dataCanvas.height = sh;
    }
    if (panel._chromeDirty) {
      const ctx = panel._chromeCanvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, panel._chromeCanvas.width, panel._chromeCanvas.height);
      ctx.scale(dpr, dpr);
      ctx.translate(SHADOW_PAD, SHADOW_PAD);

      ctx.shadowColor = s.shadowColor;
      ctx.shadowBlur = s.shadowBlur * sc;
      ctx.shadowOffsetY = s.shadowOffsetY * sc;
      ctx.fillStyle = s.bg;
      this.drawRoundedRect(ctx, 0, 0, pw, ph, radius);
      ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      ctx.strokeStyle = s.border;
      ctx.lineWidth = 1;
      this.drawRoundedRect(ctx, 0.5, 0.5, pw - 1, ph - 1, radius);
      ctx.stroke();

      if (minimized) {
        ctx.font = `bold ${fontSize}px ${s.font}`;
        ctx.fillStyle = s.accent;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(panel.title, padX, padY + lineHeight / 2);
      } else {
        ctx.textBaseline = 'middle';
        let ly = padY + lineHeight / 2;
        for (const ln of lines) {
          const fs = ln.small ? fontSize - 1 : fontSize;
          ctx.font = `${ln.bold ? 'bold ' : ''}${fs}px ${s.font}`;
          ctx.fillStyle = ln.color || s.textDim;
          ctx.textAlign = 'left';
          ctx.fillText(ln.label || '', padX, ly);
          ly += lineHeight;
        }
        for (const ctrl of controls) {
          const { bounds, state } = ctrl;
          ControlRenderer.render(ctx, ctrl, bounds.x, bounds.y, bounds.w, bounds.h, state);
        }
        const minBtnSize = 16;
        const minBtnX = pw - minBtnSize - 6;
        const minBtnY = 6;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        this.drawRoundedRect(ctx, minBtnX, minBtnY, minBtnSize, minBtnSize, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(240,245,255,0.85)';
        ctx.font = `10px ${s.font}`;        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('▼', minBtnX + minBtnSize / 2, minBtnY + minBtnSize / 2);
      }
      panel._chromeDirty = false;
    }

    if (panel.shouldRender(performance.now())) {
      const ctx = panel._dataCanvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, panel._dataCanvas.width, panel._dataCanvas.height);
      ctx.scale(dpr, dpr);
      ctx.translate(SHADOW_PAD, SHADOW_PAD);

      if (minimized) {
        ctx.font = `bold ${fontSize * 1.8}px ${s.font}`;
        ctx.fillStyle = s.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(panel.summaryValue || '0', pw / 2, padY + lineHeight * 1.5);
      } else {
        ctx.textBaseline = 'middle';
        let ly = padY + lineHeight / 2;
        for (const ln of lines) {
          const fs = ln.small ? fontSize - 1 : fontSize;
          ctx.font = `${ln.bold ? 'bold ' : ''}${fs}px ${s.font}`;
          ctx.fillStyle = ln.color || s.textDim;
          ctx.textAlign = 'right';
          ctx.fillText(ln.value || '', pw - padX, ly);
          ly += lineHeight;
        }
      }
    }

    // Draw at CSS pixel coordinates (context is already scaled by dpr)
    // Draw at physical pixel coordinates
const drawX = Math.floor((panel.x - SHADOW_PAD) * dpr);
const drawY = Math.floor((panel.y - SHADOW_PAD) * dpr);

mainCtx.drawImage(panel._chromeCanvas, drawX, drawY);
mainCtx.drawImage(panel._dataCanvas, drawX, drawY);

    PanelMasterSlider.render(mainCtx, panel, panel.x, panel.y, pw, ph, minimized);
    panel.w = pw;
    panel.h = ph;
  },

  renderMasterSlider(ctx, panels) {
    MasterSliderRenderer.render(ctx, panels);
  }
};