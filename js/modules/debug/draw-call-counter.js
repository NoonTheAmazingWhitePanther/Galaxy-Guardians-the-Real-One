/**
 * js/modules/debug/draw-call-counter.js
 * Now reads from DEBUG_CONFIG instead of hardcoding values.
 */

import { DEBUG_CONFIG, scaled } from './debug-state.js';

export const DrawCallCounter = {
  calls: {},
  drawCalls: 0,
  pathOps: 0,
  _installed: false,
  _resetBeforeNextDraw: true,

  install() {
    if (this._installed) return;
    this._installed = true;
    const self = this;

    const drawMethods = ['fill', 'fillRect', 'stroke', 'strokeRect', 'drawImage', 'fillText', 'strokeText', 'clearRect'];
    for (const name of drawMethods) {
      const orig = CanvasRenderingContext2D.prototype[name];
      if (!orig) continue;
      CanvasRenderingContext2D.prototype[name] = function (...args) {
        if (self._resetBeforeNextDraw) {
          self._resetBeforeNextDraw = false;
          self._resetCounts();
        }
        self.calls[name] = (self.calls[name] || 0) + 1;
        self.drawCalls++;
        return orig.apply(this, args);
      };
    }

    const pathMethods = ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'bezierCurveTo', 'quadraticCurveTo', 'rect', 'ellipse', 'roundRect'];
    for (const name of pathMethods) {
      const orig = CanvasRenderingContext2D.prototype[name];
      if (!orig) continue;
      CanvasRenderingContext2D.prototype[name] = function (...args) {
        self.pathOps++;
        return orig.apply(this, args);
      };
    }
    console.log('[DrawCallCounter] installed — tracking all canvas 2D draw calls.');
  },

  reset() {
    this._resetBeforeNextDraw = true;
    this._resetCounts();
  },
  uninstall() {
    if (!this._installed) return;
    this._installed = false;
    this.drawCalls = 0;
    this.pathOps = 0;
    this.calls = {};
    console.log('[DrawCallCounter] uninstalled.');
  },

  /**
   * Draw the current stats onto the canvas.
   * Now accepts pre-computed options from DebugRouter.
   */
  draw(ctx, opts = {}) {
    // Use provided options or fall back to DEBUG_CONFIG
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

    const total = this.drawCalls;
    const pathCount = this.pathOps;
    const breakdown = Object.entries(this.calls).filter(([, v]) => v > 0);
    breakdown.sort((a, b) => b[1] - a[1]);

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
      ctx.lineTo(x, y + r);      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    if (opts.compact) {
      const text = `Draw Calls: ${total} | Path Ops: ${pathCount}`;
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      const m = ctx.measureText(text);
      const panelW = m.width + padX * 2;
      const panelH = fontSize + padY * 2;
      
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

      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(text, x + padX, y + panelH / 2);

    } else {
      const lineH = fontSize + scaled(DEBUG_CONFIG.LINE_HEIGHT_EXTRA, scale);
      const labelW = scaled(DEBUG_CONFIG.LABEL_WIDTH, scale);
      const valW = scaled(DEBUG_CONFIG.VALUE_WIDTH, scale);
      const panelW = labelW + valW + padX * 2;
      const totalLines = 1 + breakdown.length + 1;
      const panelH = padY * 2 + lineH * totalLines;

      const x = safeMargin;
      const y = (ctx.canvas.height / 2) - (panelH / 2) + offsetY;

      ctx.shadowColor = DEBUG_CONFIG.SHADOW_COLOR;
      ctx.shadowBlur = scaled(DEBUG_CONFIG.SHADOW_BLUR, scale);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = scaled(DEBUG_CONFIG.SHADOW_OFFSET_Y, scale);

      ctx.fillStyle = bg;      drawRoundedRect(x, y, panelW, panelH, radius);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      drawRoundedRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1, radius);
      ctx.stroke();

      ctx.textBaseline = 'middle';
      let ly = y + padY + lineH / 2;

      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = accent;
      ctx.textAlign = 'left';
      ctx.fillText(opts.label || 'DRAW CALLS', x + padX, ly);
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(String(total), x + panelW - padX, ly);
      ctx.textAlign = 'left';
      ly += lineH;

      ctx.font = `${fontSize}px ${fontFamily}`;
      for (const [method, count] of breakdown) {
        ctx.fillStyle = 'rgba(240, 245, 255, 0.6)';
        ctx.fillText(method, x + padX, ly);
        ctx.fillStyle = color;
        ctx.textAlign = 'right';
        ctx.fillText(String(count), x + panelW - padX, ly);
        ctx.textAlign = 'left';
        ly += lineH;
      }

      ctx.fillStyle = 'rgba(240, 245, 255, 0.4)';
      ctx.font = `${fontSize - 1}px ${fontFamily}`;
      ctx.fillText(`path ops: ${pathCount}`, x + padX, ly);
    }

    ctx.restore();
  },

  _resetCounts() {
    this.calls = {};
    this.drawCalls = 0;
    this.pathOps = 0;
  },
};