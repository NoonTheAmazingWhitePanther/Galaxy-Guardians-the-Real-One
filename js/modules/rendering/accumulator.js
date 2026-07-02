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
  trailDepth: 8,    // ring size — trail length in frames
  fadeAlpha:  0.55, // 0.04=dreamy long, 0.5=short crisp

  _bufs:  [],
  _head:  0,
  _count: 0,        // total flips — caps valid layers during ring fill
  _ready: false,
  _w: 0, _h: 0,
  _dpow: 0,         // buffer downscale power (0 = full res, 1 = /2, 2 = /4, …)
  _bw: 0, _bh: 0,   // actual buffer dims (screen dims >> downscale, floored at 64)

  // Compute the downscaled buffer dimensions for the current power, never
  // letting either axis drop below 64px (matches "…all the way to 64x64").
  _computeDims() {
    const d = Math.pow(2, this._dpow);
    this._bw = Math.max(64, Math.round(this._w / d));
    this._bh = Math.max(64, Math.round(this._h / d));
  },

  init(w, h) {
    this._w = w; this._h = h;
    this._computeDims();
    this._bufs = [];
    for (let i = 0; i < this.trailDepth; i++) {
      const buf = _make(this._bw, this._bh);
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
    this._computeDims();
    for (const buf of this._bufs) {
      buf.canvas.width = this._bw; buf.canvas.height = this._bh;
      this._bg(buf.ctx);
    }
    this._count = 0;
  },

  _bg(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = CONFIG.render.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, this._bw, this._bh);
  },

  get stageCtx()    { return this._bufs[this._head]?.ctx ?? null; },
  get stageCanvas() { return this._bufs[this._head]?.canvas ?? null; },

  beginFrame(ticksThisFrame = 1) {
    if (!this._ready) return;
    const n   = this._bufs.length;
    const ctx = this._bufs[this._head].ctx;

    // Identity while we lay the base + composite the ring (all buffers share the
    // same downscaled size, so layer blits are 1:1).
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Paint bg as base — not a clear, just the bottom of the composite stack
    this._bg(ctx);

    // Tick-normalized trail window. Each rendered frame holds ~ticksThisFrame
    // ticks of motion, so to keep the trail a CONSTANT ~trailDepth ticks long
    // (independent of speed and frame rate) we composite trailDepth/ticksThisFrame
    // ring frames. At 1x/60fps that's the full ring; at high speed or low fps it
    // collapses toward a single frame — whose in-frame stamp streak already
    // carries those ticks — so the trail stops growing with speed and stops
    // stretching at low fps. Fade curve spans the shown window so it still
    // self-cleans smoothly.
    const avail  = Math.min(this._count, n - 1);
    const tpf    = Math.max(1, ticksThisFrame);
    const window = Math.max(1, Math.min(avail, Math.round(this.trailDepth / tpf)));

    for (let step = window; step >= 1; step--) {
      const bufIdx = (this._head - step + n) % n;
      const age    = 1 - (step / (window + 1));   // 0=oldest shown, →1 newest
      const alpha  = Math.pow(age, 1.4) * (1 - this.fadeAlpha);
      if (alpha < 0.005) continue;
      ctx.globalAlpha              = alpha;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this._bufs[bufIdx].canvas, 0, 0);
    }

    ctx.globalAlpha              = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Base transform: the renderer authors the scene in screen pixels, so scale
    // it down into the (possibly smaller) buffer. flip() scales back up. All the
    // renderer's own save/translate/scale for the camera composes on top of this.
    ctx.setTransform(this._bw / this._w, 0, 0, this._bh / this._h, 0, 0);
    // Renderer draws fresh scene here
  },

  flip(mainCtx) {
    if (!this._ready) return;
    mainCtx.globalAlpha              = 1;
    mainCtx.globalCompositeOperation = 'source-over';
    // Upscale the downscaled buffer to full screen size.
    mainCtx.drawImage(this._bufs[this._head].canvas, 0, 0, this._w, this._h);
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

  // Buffer downscale — power of two, clamped so neither axis drops below 64px.
  // 0 = full res (highest available), 1 = half, 2 = quarter, … Re-inits the ring.
  setDownscale(power) {
    this._dpow = Math.max(0, Math.min(8, Math.round(power)));
    this.init(this._w, this._h);
  },
  get downscalePow() { return this._dpow; },

  get debugInfo() {
    return {
      trailDepth: this.trailDepth,
      fadeAlpha:  this.fadeAlpha,
      flipCount:  this._count,
      layers:     Math.min(this._count, this.trailDepth - 1),
      downscale:  `1/${Math.pow(2, this._dpow)}`,
      bufferDims: `${this._bw}×${this._bh}`,
      clearEvery: '∞',
      nextClear:  '∞',
      inRamp:     false,
      guardianActive: false,
      guardianAlpha:  '0.00'
    };
  }
};
