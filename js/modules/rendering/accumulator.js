/**
 * js/modules/rendering/accumulator.js
 * Persistent Frame Accumulation — Ring Buffer Trail System.
 *
 * N offscreen canvases in a ring. Each frame the oldest becomes
 * the new stage, composited over by all newer layers with a
 * power-curve alpha fade. Renderer draws fresh scene on top.
 * Old content dies by natural overwrite — no clears, no pops.
 *
 * MEMORY: fixed at init. N+0 canvases, never grows.
 * STAMPS: impossible past trailDepth frames — ring rotation kills them.
 * POPS:   impossible — no hard clears anywhere.
 */

import { CONFIG } from '../../config/config-index.js';

const _make = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { canvas: c, ctx: c.getContext('2d', { alpha: false }) };
};

export const Accumulator = {
  trailDepth: 5,    // ring size — trail length in frames
  fadeAlpha:  0.33, // 0.04=dreamy long, 0.5=short crisp

  _bufs:  [],
  _head:  0,
  _count: 0,        // total flips — caps valid layers during ring fill
  _ready: false,
  _w: 0, _h: 0,

  init(w, h) {
    this._w = w; this._h = h;
    this._bufs = [];
    for (let i = 0; i < this.trailDepth; i++) {
      const buf = _make(w, h);
      this._bg(buf.ctx);
      this._bufs.push(buf);
    }
    this._head  = 0;
    this._count = 0;
    this._ready = true;
  },

  resize(w, h) {
    if (!this._ready) return this.init(w, h);
    this._w = w; this._h = h;
    for (const buf of this._bufs) {
      buf.canvas.width = w; buf.canvas.height = h;
      this._bg(buf.ctx);
    }
    this._count = 0;
  },

  _bg(ctx) {
    ctx.fillStyle = CONFIG.render.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, this._w, this._h);
  },

  get stageCtx()    { return this._bufs[this._head]?.ctx ?? null; },
  get stageCanvas() { return this._bufs[this._head]?.canvas ?? null; },

  beginFrame() {
    if (!this._ready) return;
    const n   = this._bufs.length;
    const ctx = this._bufs[this._head].ctx;

    // Paint bg as base — not a clear, just the bottom of the composite stack
    this._bg(ctx);

    // Composite ring layers oldest → newest with power-curve fade
    const layers = Math.min(this._count, n - 1);
    for (let step = layers; step >= 1; step--) {
      const bufIdx = (this._head - step + n) % n;
      const age    = 1 - (step / n);           // 0=oldest, 1=newest
      const alpha  = Math.pow(age, 1.4) * (1 - this.fadeAlpha);
      if (alpha < 0.005) continue;
      ctx.globalAlpha              = alpha;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this._bufs[bufIdx].canvas, 0, 0);
    }

    ctx.globalAlpha              = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Renderer draws fresh scene here
  },

  flip(mainCtx) {
    if (!this._ready) return;
    mainCtx.globalAlpha              = 1;
    mainCtx.globalCompositeOperation = 'source-over';
    mainCtx.drawImage(this._bufs[this._head].canvas, 0, 0);
    this._head  = (this._head + 1) % this._bufs.length;
    this._count++;
  },

  // Scene reset — just reset the count so ring treats itself as freshly init'd
  // Old content dies naturally as ring rotates over the next trailDepth frames
  clear() {
    this._count = 0;
  },

  setFade(v)       { this.fadeAlpha  = Math.max(0.04, Math.min(0.95, v)); },
  setClearCycle()  { /* no-op */ },

  setTrailDepth(n) {
    this.trailDepth = Math.max(2, Math.min(16, n));
    this.init(this._w, this._h);
  },

  get debugInfo() {
    return {
      trailDepth: this.trailDepth,
      fadeAlpha:  this.fadeAlpha,
      flipCount:  this._count,
      layers:     Math.min(this._count, this.trailDepth - 1),
      clearEvery: '∞',
      nextClear:  '∞',
      inRamp:     false,
      guardianActive: false,
      guardianAlpha:  '0.00'
    };
  }
};
