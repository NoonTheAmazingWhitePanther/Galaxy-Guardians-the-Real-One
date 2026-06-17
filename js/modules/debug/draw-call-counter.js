/**
 * js/modules/debug/draw-call-counter.js
 * Counts every Canvas 2D draw operation per frame by wrapping the
 * CanvasRenderingContext2D prototype.
 */
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

  uninstall() {    if (!this._installed) return;
    this._installed = false;
    this.drawCalls = 0;
    this.pathOps = 0;
    this.calls = {};
    console.log('[DrawCallCounter] uninstalled.');
  },

  /**
   * Draw the current stats onto the canvas.
   * Uses a `scale` multiplier to increase size while keeping perfect ratios.
   */
  draw(ctx, opts = {}) {
    // 🔹 SCALE FACTOR: 1.25 = 25% larger. Change to 1.5 for 50%, 2.0 for double.
    const scale = opts.scale !== undefined ? opts.scale : 1.5; 

    const {
      color = 'rgba(240, 245, 255, 0.92)',
      accent = 'rgba(130, 210, 255, 0.9)',
      bg = 'rgba(8, 8, 18, 0.88)',
      border = 'rgba(255, 255, 255, 0.18)',
      fontSize = Math.round(11 * scale),       // Base 11px
      fontFamily = '"Space Mono", ui-monospace, monospace',
      padX = Math.round(10 * scale),           // Base 10px
      padY = Math.round(6 * scale),            // Base 6px
      radius = Math.round(10 * scale),         // Base 10px
      safeMargin = Math.round(16 * scale),     // Base 16px
    } = opts;

    const total = this.drawCalls;
    const pathCount = this.pathOps;
    const breakdown = Object.entries(this.calls).filter(([, v]) => v > 0);
    breakdown.sort((a, b) => b[1] - a[1]);

    ctx.save();
    // Force screen-space identity so it ignores camera zoom/pan
    ctx.setTransform(1, 0, 0, 1, 0, 0); 

    // Helper to draw rounded rectangles
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
      ctx.quadraticCurveTo(x, y, x + r, y);      ctx.closePath();
    };

    if (opts.compact) {
      // ── Single-line display ──
      const text = `Draw Calls: ${total} | Path Ops: ${pathCount}`;
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      const m = ctx.measureText(text);
      const panelW = m.width + padX * 2;
      const panelH = fontSize + padY * 2;
      
      const x = safeMargin;
      const y = (ctx.canvas.height / 2) - (panelH / 2);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = Math.round(12 * scale);
      ctx.shadowOffsetY = Math.round(4 * scale);
      
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
      // ── Multi-line panel ──
      const lineH = fontSize + Math.round(4 * scale);
      const labelW = Math.round(95 * scale);
      const valW = Math.round(45 * scale);
      const panelW = labelW + valW + padX * 2;
      const totalLines = 1 + breakdown.length + 1; 
      const panelH = padY * 2 + lineH * totalLines;

      // Position: Middle Left (Fixed)
      const x = safeMargin;
      const y = (ctx.canvas.height / 2) - (panelH / 2);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = Math.round(12 * scale);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.round(4 * scale);
      ctx.fillStyle = bg;
      drawRoundedRect(x, y, panelW, panelH, radius);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      drawRoundedRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1, radius);
      ctx.stroke();

      // Text Rendering
      ctx.textBaseline = 'middle';
      let ly = y + padY + lineH / 2;

      // Header
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = accent;
      ctx.textAlign = 'left';
      ctx.fillText('DRAW CALLS', x + padX, ly);
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(String(total), x + panelW - padX, ly);
      ctx.textAlign = 'left';
      ly += lineH;

      // Breakdown
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

      // Path ops
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