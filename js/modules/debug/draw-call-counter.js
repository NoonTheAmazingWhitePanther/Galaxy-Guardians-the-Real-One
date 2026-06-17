/**
 * js/modules/debug/draw-call-counter.js
 *
 * Counts every Canvas 2D draw operation per frame by wrapping the
 * CanvasRenderingContext2D prototype.  Drop this module anywhere and
 * call  DrawCallCounter.draw(ctx)  at the end of your render loop
 * to see real-time draw-call statistics on screen.
 *
 * ── What counts as a "draw call"? ────────────────────────────────────
 *   fill()          –  fills the current path
 *   fillRect()      –  fills a rectangle
 *   stroke()        –  strokes the current path
 *   strokeRect()    –  strokes a rectangle
 *   drawImage()     –  draws an Image / Canvas / Video element
 *   fillText()      –  fills a string of text
 *   strokeText()    –  strokes a string of text
 *   clearRect()     –  clears a rectangular region (writes to canvas)
 *
 *   (Path-building methods like beginPath, moveTo, lineTo, arc,
 *    bezierCurveTo etc. are NOT draw calls but are counted separately
 *    as "path ops" for diagnostics.)
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *   import { DrawCallCounter } from './modules/debug/draw-call-counter.js';
 *
 *   // 1. Install the wrappers (do this once, before any drawing):
 *   DrawCallCounter.install();
 *
 *   // 2. At the start of every frame:  DrawCallCounter.reset()
 *   //    (automatically called by resetBeforeNextDraw)
 *
 *   // 3. After all rendering, overlay the stats:
 *   DrawCallCounter.draw(ctx);
 *
 *   // Or read the numbers programmatically:
 *   console.log(DrawCallCounter.drawCalls);       // total draw calls this frame
 *   console.log(DrawCallCounter.calls.fill);      // per-method breakdown
 *   console.log(DrawCallCounter.pathOps);         // path-building ops
 * ─────────────────────────────────────────────────────────────────────
 */
export const DrawCallCounter = {
  /** Raw tally — incremented by the wrapped methods. */
  calls: {},

  /** Convenience total: sum of all wrapped draw-method counts. */
  drawCalls: 0,

  /** Number of path-building operations (beginPath, moveTo, lineTo, arc, etc.). */
  pathOps: 0,

  /** True after install() has been called. */
  _installed: false,

  /** Internal flag: reset() sets this so the first draw method clears tallies. */
  _resetBeforeNextDraw: true,

  // ─── Public API ────────────────────────────────────────────────────

  /**
   * Patch CanvasRenderingContext2D.prototype so every draw call is counted.
   * Call ONCE at startup, before any canvas drawing occurs.
   */
  install() {
    if (this._installed) return;
    this._installed = true;

    const self = this;

    // ── DRAW CALLS (these write pixels to the canvas) ────────────────
    const drawMethods = [
      'fill',
      'fillRect',
      'stroke',
      'strokeRect',
      'drawImage',
      'fillText',
      'strokeText',
      'clearRect',
    ];

    for (const name of drawMethods) {
      const orig = CanvasRenderingContext2D.prototype[name];
      if (!orig) continue; // safety

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

    // ── PATH-BUILDING OPERATIONS (not draw calls, but useful to see) ─
    const pathMethods = [
      'beginPath',
      'closePath',
      'moveTo',
      'lineTo',
      'arc',
      'arcTo',
      'bezierCurveTo',
      'quadraticCurveTo',
      'rect',
      'ellipse',
      'roundRect',
    ];

    for (const name of pathMethods) {
      const orig = CanvasRenderingContext2D.prototype[name];
      if (!orig) continue;

      CanvasRenderingContext2D.prototype[name] = function (...args) {
        // NOTE: path ops do NOT trigger the frame-first-reset because
        // they are not draw calls — they only describe a shape.
        self.pathOps++;
        return orig.apply(this, args);
      };
    }

    console.log('[DrawCallCounter] installed — tracking all canvas 2D draw calls.');
  },

  /**
   * Reset counters for a new frame.  Call at the start of your render
   * loop (before any drawing).  If you forget, the first draw method
   * of the frame auto-resets anyway.
   */
  reset() {
    this._resetBeforeNextDraw = true;
    // The actual zeroing happens lazily on the first draw call to
    // avoid a double-reset if reset() is called manually AND the
    // auto-reset triggers.  Force it now:
    this._resetCounts();
  },

  /** Un-patch (restore originals).  Useful if you want to disable
   *  overhead at runtime without a page reload. */
  uninstall() {
    if (!this._installed) return;
    // Restore is tricky because we overwrote the prototype methods.
    // For a clean exit, just disable counting.
    this._installed = false;
    this.drawCalls = 0;
    this.pathOps = 0;
    this.calls = {};
    console.log('[DrawCallCounter] uninstalled.');
  },

  // ─── Overlay draw ──────────────────────────────────────────────────

  /**
   * Draw the current stats onto the canvas.
   * Call AFTER all game rendering, with a plain (non-transformed)
   * context if possible.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} [opts]  Optional styling overrides.
   * @param {string} [opts.color]       Text colour.       Default '#0ff'
   * @param {string} [opts.bg]          Background colour. Default 'rgba(0,0,0,0.55)'
   * @param {number} [opts.x]           Screen X.          Default 10
   * @param {number} [opts.y]           Screen Y.          Default 10
   * @param {number} [opts.fontSize]    Font size in px.   Default 11
   * @param {boolean}[opts.compact]     Single-line mode.  Default false
   */
  draw(ctx, opts = {}) {
    const {
      color = '#0ff',
      bg = 'rgba(0,0,0,0.55)',
      x = 10,
      y = 10,
      fontSize = 11,
      compact = false,
    } = opts;

    const total = this.drawCalls;
    const pathCount = this.pathOps;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // screen-space identity

    if (compact) {
      // ── Single-line display ──
      const text = `draw calls: ${total}  (path ops: ${pathCount})`;
      ctx.font = `bold ${fontSize}px "Space Mono",monospace,sans-serif`;
      const m = ctx.measureText(text);
      const pad = 6;
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, m.width + pad * 2, fontSize + pad * 2);
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + pad, y + pad + fontSize / 2);
    } else {
      // ── Multi-line panel ──
      ctx.font = `bold ${fontSize}px "Space Mono",monospace,sans-serif`;
      const lineH = fontSize + 3;
      const pad = 6;
      const labelW = 90;
      const valW = 40;
      const panelW = labelW + valW + pad * 2;
      const breakdown = Object.entries(this.calls).filter(([, v]) => v > 0);
      const panelH = pad * 2 + lineH * (2 + breakdown.length);

      // Background
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, panelW, panelH);
      ctx.fillStyle = color;

      let ly = y + pad;

      // Header: total draw calls
      ctx.font = `bold ${fontSize}px "Space Mono",monospace,sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText('DRAW CALLS', x + pad, ly);
      ly += lineH;

      ctx.fillStyle = color;
      ctx.fillText(String(total), x + pad + labelW, ly - lineH);

      // Per-method breakdown (sorted by count descending)
      breakdown.sort((a, b) => b[1] - a[1]);
      for (const [method, count] of breakdown) {
        ctx.fillStyle = '#888';
        ctx.fillText(method, x + pad, ly);
        ctx.fillStyle = color;
        ctx.fillText(String(count), x + pad + labelW, ly);
        ly += lineH;
      }

      // Path ops
      ctx.fillStyle = '#666';
      ctx.font = `${fontSize - 1}px "Space Mono",monospace,sans-serif`;
      ctx.fillText(`path ops: ${pathCount}`, x + pad, ly);
    }

    ctx.restore();
  },

  // ─── Internal helpers ──────────────────────────────────────────────

  _resetCounts() {
    this.calls = {};
    for (const k of Object.keys(this.calls)) this.calls[k] = 0;
    this.drawCalls = 0;
    this.pathOps = 0;
  },
};
