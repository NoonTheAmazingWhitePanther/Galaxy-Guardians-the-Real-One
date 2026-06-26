/**
 * js/modules/rendering/debug-renderer.js
 * FIXED: Proper save/restore around shadows. No DPR double-scaling.
 */
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

  renderPanel(ctx, panel, data) {
    if (!panel.visible) return;

    const s = DEBUG_STATE.style;
    const sc = DEBUG_STATE.scale;
    const fontSize = s.fontSize * sc;
    const padX = s.padX * sc;
    const padY = s.padY * sc;
    const radius = s.radius * sc;
    const lineHeight = s.lineHeight * sc;

    const layout = panel.computeLayout(data);
    const pw = Math.floor(layout.w);
    const ph = Math.floor(layout.h);
    const { lines, controls, minimized } = layout;

    ctx.save();
    ctx.translate(panel.x, panel.y);

    // ✅ Shadow isolated in its own save/restore block
    ctx.save();
    ctx.shadowColor = s.shadowColor;
    ctx.shadowBlur = s.shadowBlur * sc;
    ctx.shadowOffsetY = s.shadowOffsetY * sc;    ctx.fillStyle = s.bg;
    this.drawRoundedRect(ctx, 0, 0, pw, ph, radius);
    ctx.fill();
    ctx.restore(); // ✅ Shadow state fully cleaned up

    // Border (no shadow)
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
        ctx.textAlign = 'left';
        ctx.fillText(ln.label || '', padX, ly);
        ctx.textAlign = 'right';
        ctx.fillText(ln.value || '', pw - padX, ly);
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
      ctx.font = `10px ${s.font}`;      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▼', minBtnX + minBtnSize / 2, minBtnY + minBtnSize / 2);
    }

    ctx.restore();

    // Per-panel master slider (already uses save/restore internally)
    PanelMasterSlider.render(ctx, panel, panel.x, panel.y, pw, ph, minimized);
    panel.w = pw;
    panel.h = ph;
  },

  renderMasterSlider(ctx, panels) {
    MasterSliderRenderer.render(ctx, panels);
  }
};