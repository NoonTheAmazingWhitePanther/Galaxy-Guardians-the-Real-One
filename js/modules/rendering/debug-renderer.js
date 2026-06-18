/**
 * js/modules/rendering/debug-renderer.js
 * Pure rendering engine. Uses DEBUG_STATE.scale to keep perfect ratios.
 */
import { DEBUG_STATE } from '../debug/debug-state.js';

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

  renderPanel(mainCtx, panel, data) {
    if (!panel.visible) return;
    const s = DEBUG_STATE.style;
    const scale = DEBUG_STATE.scale; // <--- RATIO KEEPER

    // Multiply base values by scale to keep exact proportions
    const fontSize = s.fontSize * scale;
    const padX = s.padX * scale;
    const padY = s.padY * scale;
    const radius = s.radius * scale;
    const lineHeight = s.lineHeight * scale;
    const labelW = s.labelW * scale;
    const valW = s.valW * scale;
    const shadowBlur = s.shadowBlur * scale;
    const shadowOffsetY = s.shadowOffsetY * scale;

    let lines = [];
    if (panel.type === 'drawCalls') {
      const b = Object.entries(data.calls).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
      lines = [
        { label:'DRAW CALLS', value:String(data.drawCalls), color:s.accent, bold:true },
        ...b.map(([m,c])=>({label:m, value:String(c), color:s.textDim})),
        { label:'path ops', value:String(data.pathOps), color:s.textFaint, small:true }
      ];
    } else {
      const b = Object.entries(data.stats).filter(([,v])=>v>0);
      lines = [
        { label:'PHYSICS OPS', value:String(Object.values(data.stats).reduce((a,b)=>a+b,0)), color:s.accent, bold:true },
        ...b.map(([k,c])=>({label:data._labels[k]||k, value:String(c), color:s.textDim}))
      ];
    }

    const pw = labelW + valW + padX * 2;
    const ph = padY * 2 + lineHeight * lines.length;
    const off = this.getOffscreen(panel.id, pw, ph);
    const ctx = off.getContext('2d');
    ctx.clearRect(0,0,off.width,off.height);

    ctx.save(); ctx.translate(15,15);
    ctx.shadowColor = s.shadowColor; ctx.shadowBlur = shadowBlur; ctx.shadowOffsetY = shadowOffsetY;
    ctx.fillStyle = s.bg; this.drawRoundedRect(ctx,0,0,pw,ph,radius); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = s.border; ctx.lineWidth = 1;
    this.drawRoundedRect(ctx,0.5,0.5,pw-1,ph-1,radius); ctx.stroke();

    ctx.textBaseline = 'middle'; let ly = padY + lineHeight/2;
    for (const ln of lines) {
      const fs = ln.small ? fontSize - 1 : fontSize;
      ctx.font = `${ln.bold?'bold ':''}${fs}px ${s.font}`;
      ctx.fillStyle = ln.color; ctx.textAlign = 'left';
      ctx.fillText(ln.label, padX, ly);
      ctx.textAlign = 'right'; ctx.fillText(ln.value, pw-padX, ly);
      ly += lineHeight;
    }
    ctx.restore();

    mainCtx.save();
    mainCtx.setTransform(1,0,0,1,0,0);
    mainCtx.drawImage(off, panel.x-15, panel.y-15);
    mainCtx.restore();
  }
};