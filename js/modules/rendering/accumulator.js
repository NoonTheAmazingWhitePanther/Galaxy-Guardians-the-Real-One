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
  _dpr: 1,          // device pixel ratio (set once from main.js resize) — readout only

  // Compute the downscaled buffer dimensions for the current power, never
  // letting either axis drop below 64px (matches "…all the way to 64x64").
  _computeDims() {
    // Buffers are ALWAYS full device resolution. The prime (newest) render must
    // never be downsized — that's a locked decision. The downscale power now
    // drives the per-trail RESOLUTION RAMP applied to older layers at composite
    // time (see beginFrame), not the buffer size.
    this._bw = this._w;
    this._bh = this._h;
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
    this._scratch = _make(this._bw, this._bh);   // reused for ramp downsampling
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
    if (this._scratch) { this._scratch.canvas.width = this._bw; this._scratch.canvas.height = this._bh; }
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

    // Per-trail resolution ramp. The prime render (the head, drawn this frame)
    // is ALWAYS full res. Older composited layers step DOWN in resolution from
    // just-below-full toward the tail floor, so trail N is coarser than trail
    // N-1. floorFrac is the last-tail buffer size, set by the downscale power
    // (0 = flat/no ramp, 1 = /2 tail, 2 = /4 tail, …). Achieved by downsampling
    // a layer into the scratch then upsampling it back — a cheap resolution cut.
    const floorFrac = 1 / Math.pow(2, this._dpow);
    const sctx = this._scratch?.ctx;

    for (let step = window; step >= 1; step--) {
      const bufIdx = (this._head - step + n) % n;
      const age    = 1 - (step / (window + 1));   // 0=oldest shown, →1 newest
      const alpha  = Math.pow(age, 1.4) * (1 - this.fadeAlpha);
      if (alpha < 0.005) continue;
      ctx.globalAlpha              = alpha;
      ctx.globalCompositeOperation = 'source-over';

      // Resolution for this trail layer: 1.0 at the newest older-layer, ramping
      // linearly to floorFrac at the oldest. (step 1 → ~full, step window → floor)
      const res = this._dpow > 0 && sctx
        ? Math.max(floorFrac, 1 - (step / window) * (1 - floorFrac))
        : 1;

      if (res >= 0.999 || !sctx) {
        ctx.drawImage(this._bufs[bufIdx].canvas, 0, 0);          // full res
      } else {
        const sw = Math.max(8, Math.round(this._bw * res));
        const sh = Math.max(8, Math.round(this._bh * res));
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, this._bw, this._bh);
        sctx.drawImage(this._bufs[bufIdx].canvas, 0, 0, this._bw, this._bh, 0, 0, sw, sh); // down
        ctx.drawImage(this._scratch.canvas, 0, 0, sw, sh, 0, 0, this._bw, this._bh);        // up
      }
    }

    ctx.globalAlpha              = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Prime render is authored at full device resolution (buffers are full-res),
    // so the base transform is identity — the newest trail is never downsized.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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

  // Device pixel ratio — recorded once per resize from main.js. Buffers are sized
  // in CSS px (_bw×_bh); the device canvas is _dpr× larger. Readout only; never
  // changes buffer allocation. Kept here so the Screen-Res panel can show the
  // true device resolution alongside the CSS-res the ring actually stores.
  setDpr(v) { this._dpr = Math.max(0.1, Number(v) || 1); },
  get dpr() { return this._dpr; },

  // Bytes held by the whole ring right now: trailDepth stage buffers + 1 scratch,
  // RGBA at the real (CSS) buffer dims. This is the true allocated cost — the
  // "full-res ring buffers cost more RAM" note in TODO.md, measured live.
  get _ringBytes() {
    const perBuf = this._bw * this._bh * 4;
    return perBuf * (this.trailDepth + 1);   // +1 scratch
  },

  // The ACTUAL per-layer resolution the composite loop uses this ramp setting,
  // sampled across a full window (newest older-layer → oldest). Truthful to
  // beginFrame's inline curve: res(step) = max(floor, 1 − (step/W)(1 − floor)).
  // Flat when the ramp power is 0. Capped to 8 samples for a phone-width panel.
  resLadder() {
    if (this._dpow <= 0) return 'flat · full res';
    const floor = 1 / Math.pow(2, this._dpow);
    const W = Math.max(1, this.trailDepth);
    const N = Math.min(8, W);
    const out = [];
    for (let k = 1; k <= N; k++) {
      const step = Math.round((k / N) * W);
      const res  = Math.max(floor, 1 - (step / W) * (1 - floor));
      out.push(res.toFixed(2).replace(/^0/, ''));
    }
    return out.join(' ');
  },

  get debugInfo() {
    return {
      trailDepth: this.trailDepth,
      fadeAlpha:  this.fadeAlpha,
      flipCount:  this._count,
      layers:     Math.min(this._count, this.trailDepth - 1),
      rampFloor:  `1/${Math.pow(2, this._dpow)}`,   // last-tail resolution
      primeRes:   'full · LOCKED',                   // newest render — locked full res
      bufferDims: `${this._bw}×${this._bh}`,
      // ── Screen-Res panel readouts (additive, no behaviour change) ──────────
      cssRes:     `${this._bw}×${this._bh}`,                                  // what the ring stores
      deviceRes:  `${Math.round(this._bw * this._dpr)}×${Math.round(this._bh * this._dpr)}`, // real device px
      dpr:        this._dpr.toFixed(2),
      ringLayers: `${this.trailDepth}+1`,            // stage buffers + scratch
      bufKB:      `${Math.round(this._bw * this._bh * 4 / 1024)} KB`,
      ringMB:     `${(this._ringBytes / 1048576).toFixed(1)} MB`,
      resLadder:  this.resLadder(),
      clearEvery: '∞',
      nextClear:  '∞',
      inRamp:     false,
      guardianActive: false,
      guardianAlpha:  '0.00'
    };
  }
};
