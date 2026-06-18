/**
 * js/modules/debug/physics-counter.js
 * Now reads from DEBUG_CONFIG.
 */

import { DEBUG_CONFIG, scaled } from './debug-state.js';

export const PhysicsCounter = {
  stats: {
    particlesIntegrated: 0,
    springsSolved: 0,
    collisionsResolved: 0,
    gravityChecks: 0,
    looseTicked: 0,
  },
  
  _labels: {
    particlesIntegrated: 'Particles',
    springsSolved: 'Springs',
    collisionsResolved: 'Collisions',
    gravityChecks: 'Gravity',
    looseTicked: 'Loose',
  },

  reset() {
    for (const key in this.stats) this.stats[key] = 0;
  },

  draw(ctx, opts = {}) {
    const scale = opts.scale !== undefined ? opts.scale : DEBUG_CONFIG.SCALE;
    const offsetY = opts.offsetY || 0;

    const {
      color = DEBUG_CONFIG.COLOR,
      accent = DEBUG_CONFIG.ACCENT,
      bg = DEBUG_CONFIG.BG,
      border = DEBUG_CONFIG.BORDER,
      fontSize = scaled(DEBUG_CONFIG.FONT_SIZE, scale),
      fontFamily = DEBUG_CONFIG.FONT_FAMILY,
      padX = scaled(DEBUG_CONFIG.PAD_X, scale),
      padY = scaled(DEBUG_CONFIG.PAD_Y, scale),
      radius = scaled(DEBUG_CONFIG.RADIUS, scale),
      safeMargin = scaled(DEBUG_CONFIG.SAFE_MARGIN, scale),
    } = opts;

    const breakdown = Object.entries(this.stats).filter(([, v]) => v > 0);
    const totalOps = Object.values(this.stats).reduce((a, b) => a + b, 0);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const drawRoundedRect = (x, y, w, h, r) => {
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
    };

    const lineH = fontSize + scaled(DEBUG_CONFIG.LINE_HEIGHT_EXTRA, scale);
    const labelW = scaled(DEBUG_CONFIG.LABEL_WIDTH, scale);
    const valW = scaled(DEBUG_CONFIG.VALUE_WIDTH, scale);
    const panelW = labelW + valW + padX * 2;
    const totalLines = 1 + breakdown.length;
    const panelH = padY * 2 + lineH * totalLines;

    const x = safeMargin;
    const y = (ctx.canvas.height / 2) - (panelH / 2) + offsetY;

    ctx.shadowColor = DEBUG_CONFIG.SHADOW_COLOR;
    ctx.shadowBlur = scaled(DEBUG_CONFIG.SHADOW_BLUR, scale);
    ctx.shadowOffsetY = scaled(DEBUG_CONFIG.SHADOW_OFFSET_Y, scale);

    ctx.fillStyle = bg;
    drawRoundedRect(x, y, panelW, panelH, radius);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    drawRoundedRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1, radius);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    let ly = y + padY + lineH / 2;

    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = accent;
    ctx.textAlign = 'left';
    ctx.fillText(opts.label || 'PHYSICS OPS', x + padX, ly);
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.fillText(String(totalOps), x + panelW - padX, ly);
    ctx.textAlign = 'left';    ly += lineH;

    ctx.font = `${fontSize}px ${fontFamily}`;
    for (const [key, count] of breakdown) {
      ctx.fillStyle = 'rgba(240, 245, 255, 0.6)';
      ctx.fillText(this._labels[key] || key, x + padX, ly);
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(String(count), x + panelW - padX, ly);
      ctx.textAlign = 'left';
      ly += lineH;
    }

    ctx.restore();
  }
};