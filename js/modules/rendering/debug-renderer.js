/**
 * js/modules/rendering/debug-renderer.js
 * Renders debug panels in screen space with DPR correction.
 *
 * Each panel has a top-right control strip:
 *   Physics panel:  ✖️  🟰  ➗
 *   Render panel:   ➕  🟰  ➖
 *
 * Button hit rects are stored on the panel object so in-debug.js
 * can read them for tap detection without duplicating layout math.
 *
 * FIX (2026-06-19): DPR coordinate fix — draw at panel.x * dpr.
 */
import { DEBUG_STATE } from '../debug/debug-state.js';
import { PhysicsGovernor } from '../../core/physics-governor.js';
import { Accumulator }     from './accumulator.js';
import { RenderGovernor }  from '../../core/render-governor.js';

const BTN_W  = 22;
const BTN_H  = 18;
const BTN_GAP = 3;
const BTN_PAD = 6; // from right edge of panel

export const DebugRenderer = {
  offscreenCanvases: new Map(),

  getOffscreen(id, w, h) {
    let c = this.offscreenCanvases.get(id);
    if (!c) { c = document.createElement('canvas'); this.offscreenCanvases.set(id, c); }
    const sw = Math.ceil((w + 30) * DEBUG_STATE.resolutionScale);
    const sh = Math.ceil((h + 30) * DEBUG_STATE.resolutionScale);
    if (c.width !== sw || c.height !== sh) { c.width = sw; c.height = sh; }
    return c;
  },

  drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  },

  _drawBtn(ctx, label, x, y, active) {
    ctx.fillStyle = active
      ? 'rgba(130, 210, 255, 0.35)'
      : 'rgba(255,255,255,0.08)';
    this.drawRoundedRect(ctx, x, y, BTN_W, BTN_H, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    this.drawRoundedRect(ctx, x + 0.5, y + 0.5, BTN_W - 1, BTN_H - 1, 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,245,255,0.85)';
    ctx.font = `11px ${DEBUG_STATE.style.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + BTN_W / 2, y + BTN_H / 2);
  },

  renderPanel(mainCtx, panel, data) {
    if (!panel.visible) return;
    const s    = DEBUG_STATE.style;
    const sc   = DEBUG_STATE.scale;
    const dpr  = DEBUG_STATE.dpr;

    const fontSize      = s.fontSize    * sc;
    const padX          = s.padX        * sc;
    const padY          = s.padY        * sc;
    const radius        = s.radius      * sc;
    const lineHeight    = s.lineHeight  * sc;
    const labelW        = s.labelW      * sc;
    const valW          = s.valW        * sc;
    const shadowBlur    = s.shadowBlur  * sc;
    const shadowOffsetY = s.shadowOffsetY * sc;

    // ── Build lines ───────────────────────────────────────────────────────
    let lines = [];
    let gov, govLabel;

    if (panel.type === 'drawCalls') {
      gov      = RenderGovernor;
      govLabel = gov.label;
      const b  = Object.entries(data.calls).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      lines = [
        { label: `DRAW CALLS  ${govLabel}`, value: String(data.drawCalls), color: s.accent, bold: true },
        ...b.map(([m, c]) => ({ label: m, value: String(c), color: s.textDim })),
        { label: 'path ops', value: String(data.pathOps), color: s.textFaint, small: true }
      ];
    } else if (panel.type === 'queops') {
      // QueOps panel — no governor buttons, shows queue health
      gov      = null;
      govLabel = '';
      const qi = data; // getDebugInfo() snapshot
      const acc = Accumulator.debugInfo;
      lines = [
        { label: 'QUEUE OPS', value: `${qi.queueSize}q`, color: s.accent, bold: true },
        { label: 'fps',        value: String(qi.fps),           color: s.textDim },
        { label: 'cooling',    value: `${qi.coolingState}/fr`,  color: s.textDim },
        { label: 'processed',  value: String(qi.opsProcessed),  color: s.textDim },
        { label: 'deferred',   value: String(qi.opsDeferred),   color: qi.opsDeferred > 50 ? 'rgba(255,180,80,0.9)' : s.textDim },
        { label: 'skipped',    value: String(qi.opsSkipped),    color: qi.opsSkipped > 20  ? 'rgba(255,100,80,0.9)' : s.textFaint, small: true },
        { label: '── trails ──', value: '',                     color: s.textFaint, small: true },
        { label: 'depth',      value: String(acc.trailDepth),   color: s.textDim },
        { label: 'fade',       value: acc.fadeAlpha.toFixed(2), color: s.textDim },
        { label: acc.inRamp ? 'ramping…' : 'clears in', value: String(acc.nextClear), color: acc.inRamp ? 'rgba(255,200,80,0.9)' : acc.nextClear <= 4 ? 'rgba(130,210,255,0.9)' : s.textFaint, small: true },
        { label: '🛡 guardian', value: acc.guardianActive ? `α${acc.guardianAlpha}` : 'idle', color: acc.guardianActive ? 'rgba(130,255,180,0.9)' : s.textFaint, small: true },
      ];
    } else {
      gov      = PhysicsGovernor;
      govLabel = gov.label;
      const b  = Object.entries(data.stats).filter(([, v]) => v > 0);
      const total = Object.values(data.stats).reduce((a, b) => a + b, 0);
      lines = [
        { label: `PHYSICS  ${govLabel}`, value: String(total), color: s.accent, bold: true },
        ...b.map(([k, c]) => ({ label: data._labels?.[k] || k, value: String(c), color: s.textDim }))
      ];
    }

    // ── Panel dimensions ──────────────────────────────────────────────────
    const pw = labelW + valW + padX * 2;
    // Extra height for button strip
    const btnStripH = BTN_H + padY;
    const ph = padY * 2 + lineHeight * lines.length + btnStripH;

    const off = this.getOffscreen(panel.id, pw, ph);
    const ctx = off.getContext('2d');
    ctx.clearRect(0, 0, off.width, off.height);

    ctx.save();
    ctx.translate(15, 15);

    // Shadow + bg
    ctx.shadowColor   = s.shadowColor;
    ctx.shadowBlur    = shadowBlur;
    ctx.shadowOffsetY = shadowOffsetY;
    ctx.fillStyle     = s.bg;
    this.drawRoundedRect(ctx, 0, 0, pw, ph, radius);
    ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Border
    ctx.strokeStyle = s.border; ctx.lineWidth = 1;
    this.drawRoundedRect(ctx, 0.5, 0.5, pw - 1, ph - 1, radius);
    ctx.stroke();

    // ── Text lines ────────────────────────────────────────────────────────
    ctx.textBaseline = 'middle';
    let ly = padY + lineHeight / 2;
    for (const ln of lines) {
      const fs = ln.small ? fontSize - 1 : fontSize;
      ctx.font      = `${ln.bold ? 'bold ' : ''}${fs}px ${s.font}`;
      ctx.fillStyle = ln.color;
      ctx.textAlign = 'left';  ctx.fillText(ln.label, padX, ly);
      ctx.textAlign = 'right'; ctx.fillText(ln.value, pw - padX, ly);
      ly += lineHeight;
    }

    // ── Button strip ──────────────────────────────────────────────────────
    // Physics:  ✖️  🟰  ➗    Render: ➕  🟰  ➖
    // queops panel has no governor buttons
    if (panel.type === 'queops') {
      panel._btns = [];
      ctx.restore();
      mainCtx.save();
      mainCtx.setTransform(1, 0, 0, 1, 0, 0);
      mainCtx.drawImage(
        off,
        (panel.x - 15) * dpr, (panel.y - 15) * dpr,
        off.width * dpr, off.height * dpr
      );
      mainCtx.restore();
      return;
    }
    const btnLabels = panel.type === 'physics'
      ? ['✕', '=', '÷']
      : ['+', '=', '−'];

    const totalBtnsW = 3 * BTN_W + 2 * BTN_GAP;
    const bx0 = pw - BTN_PAD - totalBtnsW;
    const by  = ph - padY - BTN_H;

    // Pressure bar (left of buttons)
    const barW = bx0 - padX - 4;
    const barH = 4;
    const barY = by + (BTN_H - barH) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(padX, barY, barW, barH, 2); ctx.fill();
    const pressure = gov.pressure;
    const barColor = pressure > 0.7
      ? 'rgba(130, 210, 255, 0.8)'
      : pressure > 0.4
        ? 'rgba(255, 200, 80, 0.8)'
        : 'rgba(255, 100, 80, 0.8)';
    ctx.fillStyle = barColor;
    ctx.beginPath(); ctx.roundRect(padX, barY, barW * pressure, barH, 2); ctx.fill();

    // Buttons
    const isIdle = !gov.isManual;
    for (let i = 0; i < 3; i++) {
      const bx = bx0 + i * (BTN_W + BTN_GAP);
      this._drawBtn(ctx, btnLabels[i], bx, by, i === 1 && isIdle);
    }

    // Store button screen rects on panel (in CSS px, relative to panel.x/y)
    // Used by in-debug.js for hit detection
    panel._btns = btnLabels.map((lbl, i) => ({
      label: lbl,
      // +15 for the shadow pad translate
      x: (bx0 + i * (BTN_W + BTN_GAP)) + 15,
      y: by + 15,
      w: BTN_W,
      h: BTN_H
    }));

    ctx.restore();

    // ── DPR-corrected blit to main canvas ────────────────────────────────
    mainCtx.save();
    mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    mainCtx.drawImage(
      off,
      (panel.x - 15) * dpr, (panel.y - 15) * dpr,
      off.width * dpr, off.height * dpr
    );
    mainCtx.restore();
  }
};
