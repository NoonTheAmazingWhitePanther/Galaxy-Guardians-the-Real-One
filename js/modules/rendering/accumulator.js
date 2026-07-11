/**
 * js/modules/rendering/accumulator.js
 * Persistent Frame Accumulation — Ring Buffer Trail System.
 *
 * N offscreen canvases in a ring. Each frame the oldest becomes
 * the new stage, composited over by all newer layers with a
 * power-curve alpha fade. Renderer draws fresh scene on top.
 * Old content dies by natural overwrite — no clears, no pops.
 *
 * SIMPLIFIED: removed the per-layer resolution ramp (downsample older
 * trail layers into a scratch canvas, then upsample back — an extra
 * draw-call pair per ramped layer). Every layer is now exactly what it
 * is: the real full-resolution frame from N ticks ago, redrawn onto the
 * next stage as-is. Trail layers and the prime render are the same
 * quality, always. One draw call per layer, no scratch blob, no ramp
 * math. (This also resolves the earlier open finding that the ramp
 * formula documented here didn't match what beginFrame actually
 * composited — moot now, there's no ramp to document.)
 *
 * MEMORY: fixed at init. N canvases, never grows.
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
  _dpr: 1,          // device pixel ratio (set once from main.js resize) — readout only

  init(w, h, dpr) {
    this._w = w; this._h = h;
    if (dpr !== undefined) this._dpr = Math.max(0.1, Number(dpr) || 1);
    const d = this._dpr;
    this._bufs = [];
    for (let i = 0; i < this.trailDepth; i++) {
      const buf = _make(Math.max(1, Math.ceil(this._w * d)), Math.max(1, Math.ceil(this._h * d)));
      this._bg(buf.ctx);
      this._bufs.push(buf);
    }
    this._head  = 0;
    this._count = 0;
    this._ready = true;
  },

  resize(w, h, dpr) {
    if (!this._ready) return this.init(w, h, dpr);
    this._w = w; this._h = h;
    if (dpr !== undefined) this._dpr = Math.max(0.1, Number(dpr) || 1);
    const d = this._dpr;
    for (const buf of this._bufs) {
      buf.canvas.width  = Math.max(1, Math.ceil(this._w * d));
      buf.canvas.height = Math.max(1, Math.ceil(this._h * d));
      this._bg(buf.ctx);
    }
    this._count = 0;
  },

  _bg(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = CONFIG.render.BACKGROUND_COLOR;
    // FIX: used to fillRect(0,0,this._w,this._h) — this._w/h are CSS-px
    // values, but buffers are now sized at CSS-px × dpr raw pixels (see
    // init/resize above). Filling only the CSS-px-sized corner left the
    // rest of the (larger) buffer uncleared. ctx.canvas.width/height are
    // this buffer's REAL pixel dimensions, always correct regardless of
    // what this._w/h currently are.
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  },

  get stageCtx()    { return this._bufs[this._head]?.ctx ?? null; },
  get stageCanvas() { return this._bufs[this._head]?.canvas ?? null; },

  // Parse the flat background color once (hex → rgb) for the soft clean
  // zone gradient below. Falls back to black on anything unparseable.
  _bgRgb: null,
  _bgRgbFor(color) {
    if (this._bgRgb && this._bgRgb.src === color) return this._bgRgb;
    let r = 0, g = 0, b = 0;
    const m6 = /^#([0-9a-f]{6})$/i.exec(color);
    const m3 = /^#([0-9a-f]{3})$/i.exec(color);
    if (m6) { const v = parseInt(m6[1], 16); r = v >> 16 & 255; g = v >> 8 & 255; b = v & 255; }
    else if (m3) { const v = m3[1]; r = parseInt(v[0] + v[0], 16); g = parseInt(v[1] + v[1], 16); b = parseInt(v[2] + v[2], 16); }
    this._bgRgb = { src: color, r, g, b };
    return this._bgRgb;
  },

  beginFrame(ticksThisFrame = 1, cam = null, cleanZone = null) {
    if (!this._ready) return;
    const n   = this._bufs.length;
    const stage = this._bufs[this._head];
    const ctx = stage.ctx;

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

    // Redraw each prior complete frame onto the next stage, in sequence,
    // fading with age. Every layer is the real frame, full resolution —
    // exactly what it is, one drawImage call, nothing else done to it.
    const d = this._dpr;
    for (let step = window; step >= 1; step--) {
      const bufIdx = (this._head - step + n) % n;
      const buf    = this._bufs[bufIdx];
      const age    = 1 - (step / (window + 1));   // 0=oldest shown, →1 newest
      const alpha  = Math.pow(age, 1.4) * (1 - this.fadeAlpha);
      if (alpha < 0.005) continue;
      ctx.globalAlpha              = alpha;
      ctx.globalCompositeOperation = 'source-over';
      // CAMERA COMPENSATION (the "blit not 100% secure" fix): each prior
      // layer was drawn under ITS OWN camera. Compositing it raw meant its
      // content sat at STALE SCREEN positions — the sun (and every ghost)
      // visibly jumped whenever the camera panned or zoomed. Reproject each
      // layer by the camera delta instead, so phosphor stays glued to WORLD
      // positions. Derivation: a world point W lands in a layer drawn with
      // camera (c0, z0) at raw px p0 = dpr·((W−c0)·z0 + S/2); under the
      // current camera (c, z) it belongs at p = k·p0 + dpr·((c0−c)·z +
      // (S/2)(1−k)) with k = z/z0 — verified by arithmetic in the session
      // test. Identity fast-path when the camera hasn't moved.
      if (cam && buf.cam &&
          (buf.cam.x !== cam.x || buf.cam.y !== cam.y || buf.cam.zoom !== cam.zoom)) {
        const k  = cam.zoom / buf.cam.zoom;
        const tx = d * ((buf.cam.x - cam.x) * cam.zoom + (this._w / 2) * (1 - k));
        const ty = d * ((buf.cam.y - cam.y) * cam.zoom + (this._h / 2) * (1 - k));
        ctx.setTransform(k, 0, 0, k, tx, ty);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.drawImage(buf.canvas, 0, 0);
    }

    ctx.globalAlpha              = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // SUN CLEAN ZONE: the sun's rays/halos/tentacles are ANIMATED — their
    // phosphor ghosts read as fog/dirt that pops, lingers, and never looks
    // clean. Softly repaint the background over the sun's neighborhood
    // AFTER compositing the priors and BEFORE the fresh scene draws: the
    // zone starts every frame clean, the sun redraws crisp, and the soft
    // skirt keeps body trails from hitting a hard circular wall.
    if (cleanZone && cleanZone.r > 0) {
      const cx = cleanZone.x * d, cy = cleanZone.y * d, r = cleanZone.r * d;
      if (cx + r > 0 && cy + r > 0 &&
          cx - r < ctx.canvas.width && cy - r < ctx.canvas.height) {
        const { r: br, g: bg2, b: bb } = this._bgRgbFor(CONFIG.render.BACKGROUND_COLOR);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0,    `rgba(${br},${bg2},${bb},1)`);
        grad.addColorStop(0.55, `rgba(${br},${bg2},${bb},1)`);
        grad.addColorStop(1,    `rgba(${br},${bg2},${bb},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }

    // Record the camera this frame's scene is about to be drawn with —
    // it's what future compositing compensates against.
    stage.cam = cam ? { x: cam.x, y: cam.y, zoom: cam.zoom } : null;
    // Renderer draws fresh scene here
  },

  flip(mainCtx) {
    if (!this._ready) return;
    mainCtx.globalAlpha              = 1;
    mainCtx.globalCompositeOperation = 'source-over';
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

  // Device pixel ratio. FIX: this used to be "readout only" — buffers were
  // always CSS-px sized regardless of what this said. Now it's the real
  // thing buffer sizing uses (see init/resize above) — pass it there
  // directly to avoid an ordering hazard (this setter running AFTER
  // resize() would size that call's buffers off the previous/stale dpr).
  // Kept as its own method too for anything that wants to just update the
  // reading without a full resize.
  setDpr(v) { this._dpr = Math.max(0.1, Number(v) || 1); },
  get dpr() { return this._dpr; },

  // Bytes held by the whole ring right now: trailDepth stage buffers,
  // RGBA at the REAL buffer dims (CSS × dpr — see init/resize), not the
  // CSS dims alone. FIX: this used to multiply this._w*this._h directly,
  // under-reporting actual memory by dpr² now that buffers are real
  // device-pixel sized.
  get _ringBytes() {
    const perBuf = Math.ceil(this._w * this._dpr) * Math.ceil(this._h * this._dpr) * 4;
    return perBuf * this.trailDepth;
  },

  get debugInfo() {
    const bw = Math.ceil(this._w * this._dpr), bh = Math.ceil(this._h * this._dpr);
    return {
      trailDepth: this.trailDepth,
      fadeAlpha:  this.fadeAlpha,
      flipCount:  this._count,
      layers:     Math.min(this._count, this.trailDepth - 1),
      primeRes:   'full · LOCKED',
      bufferDims: `${bw}×${bh}`,
      cssRes:     `${this._w}×${this._h}`,
      deviceRes:  `${bw}×${bh}`,
      dpr:        this._dpr.toFixed(2),
      ringLayers: `${this.trailDepth}`,
      bufKB:      `${Math.round(bw * bh * 4 / 1024)} KB`,
      ringMB:     `${(this._ringBytes / 1048576).toFixed(1)} MB`,
      clearEvery: '∞',
      nextClear:  '∞',
      inRamp:     false,
      guardianActive: false,
      guardianAlpha:  '0.00'
    };
  }
};
