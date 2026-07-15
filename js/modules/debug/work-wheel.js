/**
 * js/modules/debug/work-wheel.js
 * THE WORK WHEEL — see one wheel, the pipeline is clean. See two, it isn't.
 *
 * THE IDEA (Noon, 2026-07-14):
 *   Bake a wheel into a 60-frame atlas. Draw it twice, same size, same place.
 *   Wheel A steps ONE atlas frame per RENDERED FRAME.
 *   Wheel B steps by WALL-CLOCK TIME, at hz (60) frames per second.
 *   If the engine is truly presenting 60 clean frames a second, A and B are
 *   the same wheel and you see ONE. The instant a frame is late, dropped, or
 *   doubled, A falls behind B and the marker splits.
 *
 *     Seeing one = one.
 *     Seeing two = wrong.
 *
 *   No numbers, no averaging, no smoothing window that can lie to you. The
 *   frame counter and the clock are two independent witnesses and the wheel
 *   is just their disagreement, drawn. An FPS readout tells you the average
 *   of the last second; this tells you, right now, whether the pipeline is
 *   actually delivering the frames it claims.
 *
 * PHASE — THE PART THAT HAS TO BE EXACT
 *   Both wheels must be born from the SAME instant and the SAME `now`. On
 *   sync: t0 = now, frames = 0. Then on that very frame A = 0 and
 *   B = round((now - t0) / period) = 0. They start on frame ZERO, together —
 *   not on the second frame. One rAF later at now = t0 + 16.67: A = 1,
 *   B = round(16.67/16.67) = 1. Still together.
 *
 *   B uses round(), not floor(): floor biases B a half-frame LATE and would
 *   show a permanent hairline split on a perfectly healthy engine. round()
 *   puts the boundary where the eye puts it.
 *
 *   B reads the SAME `now` the frame is being rendered with — never a fresh
 *   performance.now(), which would fold this module's own draw cost into the
 *   measurement and slander a clean pipeline.
 *
 * DEBT vs FORGIVING (resyncSec)
 *   resyncSec = 0 → DEBT. The wheels never resync. Every frame ever dropped
 *     stays owed, and the split is the CUMULATIVE debt since the last reset.
 *     Brutal, and the honest one: a 60fps engine that hiccups once is a 60fps
 *     engine that hiccupped once, forever.
 *   resyncSec > 0 → FORGIVING (default 1s). B is quietly pulled back onto A
 *     each window, so the split you see is only the health of the last second.
 *     Resync does NOT jump A — t0 is moved so B lands exactly on A's current
 *     unwrapped position. Nothing snaps; the split just closes.
 *
 * THE ATLAS
 *   60 frames on one row, baked once. Deliberately ASYMMETRIC — one bold
 *   spoke and a hub dot, no rotational symmetry — so 60 frames is a full,
 *   unambiguous 360°. A symmetric 6-spoke wheel would alias every 10 frames
 *   and read as "in sync" when it is 10 frames behind.
 *
 *   Baked at boot THROUGH THE PASTER (it enqueues as a birth), so the cost of
 *   baking it lands in the same cost ledger as everything else. Cached to
 *   localStorage keyed by version+size+frames — load it if it's there, bake it
 *   if it isn't, and it is small enough that either path is cheap.
 */
import { DEBUG_STATE } from './debug-state.js';

const LS_KEY = 'gg.workwheel.v1';

export const WorkWheel = {
  on:        1,      // 0/1 — draw it
  hz:        60,     // the law being tested: frames per second
  frames:    60,     // atlas length — one full turn
  size:      36,     // CSS px, drawn diameter
  resyncSec: 1,      // 0 = DEBT mode (never forgives), >0 = forgiving window

  _atlas:  null,     // Image or canvas, frames*fw wide
  _fw:     0,        // atlas frame width (device px)
  _t0:     0,        // phase origin — the instant both wheels were born
  _n:      0,        // rendered frames since t0 (wheel A, unwrapped)
  _lastSync: 0,
  _ready:  false,

  // readout (bound by surface.json)
  get period()  { return 1000 / (this.hz || 60); },
  get driftF()  { return this._driftF; },          // frames of debt (A behind B)
  get driftDeg(){ return Math.round(this._driftF * (360 / this.frames)); },
  get verdict() { const d = Math.abs(this._driftF); return d < 0.5 ? 'ONE' : (d < 2 ? 'BLUR' : 'TWO'); },
  get modeName(){ return this.resyncSec > 0 ? `FORGIVE ${this.resyncSec}s` : 'DEBT'; },
  _driftF: 0,

  // ── the atlas ───────────────────────────────────────────────────────────
  /** Bake (or load) the wheel. Enqueued into the Paster as a birth. */
  async prepare() {
    const dpr = DEBUG_STATE.dpr || 1;
    const fw  = Math.max(16, Math.round(this.size * dpr));
    const key = `${LS_KEY}.${fw}.${this.frames}`;

    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = saved; });
        this._atlas = img; this._fw = fw; this._ready = true;
        console.log(`[WorkWheel] atlas loaded from cache (${this.frames}×${fw}px)`);
        this.sync();
        return;
      }
    } catch (_) { /* cache miss or quota — bake instead, never fatal */ }

    const c = document.createElement('canvas');
    c.width = fw * this.frames;
    c.height = fw;
    const x = c.getContext('2d');
    for (let i = 0; i < this.frames; i++) {
      this._bakeFrame(x, i * fw, fw, (i / this.frames) * Math.PI * 2);
    }
    this._atlas = c; this._fw = fw; this._ready = true;

    try { localStorage.setItem(key, c.toDataURL('image/png')); } catch (_) { /* quota — fine, we have it in memory */ }
    console.log(`[WorkWheel] atlas baked (${this.frames}×${fw}px)`);
    this.sync();
  },

  /** One frame of the wheel, rotated by `a`. Asymmetric BY DESIGN — see header. */
  _bakeFrame(x, ox, fw, a) {
    const r = fw / 2, cx = ox + r, cy = r;
    x.save();
    x.translate(cx, cy);
    x.rotate(a);
    const R = r * 0.86;

    // rim
    x.beginPath();
    x.arc(0, 0, R, 0, Math.PI * 2);
    x.strokeStyle = 'rgba(255,255,255,0.30)';
    x.lineWidth = Math.max(1, fw * 0.04);
    x.stroke();

    // faint spokes — texture only, they carry no phase information
    x.strokeStyle = 'rgba(255,255,255,0.16)';
    x.lineWidth = Math.max(1, fw * 0.03);
    for (let k = 1; k < 6; k++) {
      const t = (k / 6) * Math.PI * 2;
      x.beginPath();
      x.moveTo(Math.cos(t) * R * 0.25, Math.sin(t) * R * 0.25);
      x.lineTo(Math.cos(t) * R * 0.92, Math.sin(t) * R * 0.92);
      x.stroke();
    }

    // THE MARKER — the one bold spoke. This is the whole instrument. One per
    // wheel, so a full turn is 360° with no repeat and no aliasing.
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.lineWidth = Math.max(2, fw * 0.09);
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(0, -R * 0.95);
    x.stroke();

    // marker head — makes the split readable at a glance even when small
    x.beginPath();
    x.arc(0, -R * 0.95, Math.max(1.5, fw * 0.07), 0, Math.PI * 2);
    x.fillStyle = 'rgba(255,255,255,0.95)';
    x.fill();

    // hub
    x.beginPath();
    x.arc(0, 0, Math.max(1.5, fw * 0.07), 0, Math.PI * 2);
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.fill();
    x.restore();
  },

  // ── phase ───────────────────────────────────────────────────────────────
  /** Born together, on the same instant, on frame ZERO. */
  sync(now = performance.now()) {
    this._t0 = now;
    this._n  = 0;
    this._lastSync = now;
    this._driftF = 0;
  },

  get doSync()  { return 0; },
  set doSync(v) { if (v) this.sync(); },

  // ── the draw ────────────────────────────────────────────────────────────
  /**
   * Called ONCE per RENDERED frame, from the render path — not from the rAF
   * path. Wheel A counts frames the user actually saw; a frame that was
   * computed and then skipped is a frame that did not happen, and A is right
   * not to count it.
   *
   * Anchored under the debug button, in raw device space (same convention as
   * canvas-satellites.js), so it never inherits the panel view transform.
   */
  render(ctx) {
    if (!this.on || !this._ready) return;

    const now = performance.now();
    if (!this._t0) this.sync(now);

    // The wheel only draws while debug is on. A gap in the render path is
    // NOT lag — it's the instrument having been put away. Waking up owing
    // three minutes of frames would be a lie, so re-birth both wheels
    // together on any gap longer than a few frames.
    if (this._lastAt && (now - this._lastAt) > 200) this.sync(now);
    this._lastAt = now;

    // WHEEL A — one atlas frame per rendered frame.
    const A = this._n++;

    // WHEEL B — the clock. Same `now`, round() not floor(). See header.
    const B = Math.round((now - this._t0) / this.period);

    this._driftF = A - B;          // negative = A behind = frames were lost

    // FORGIVING: slide t0 so B lands exactly on A. A never jumps.
    if (this.resyncSec > 0 && (now - this._lastSync) >= this.resyncSec * 1000) {
      this._t0 = now - A * this.period;
      this._lastSync = now;
    }

    const N   = this.frames;
    const ai  = ((A % N) + N) % N;
    const bi  = ((B % N) + N) % N;

    const dpr = DEBUG_STATE.dpr || 1;
    const at  = this._anchor(dpr);
    if (!at) return;

    const fw = this._fw;
    const d  = this.size * dpr;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // dial
    ctx.beginPath();
    ctx.arc(at.x, at.y, d * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,8,18,0.72)';
    ctx.fill();

    // The two wheels, SAME size, SAME place. Additive so that when they
    // coincide they resolve into one bright marker, and when they don't you
    // get two dim ones — which is exactly the read Noon asked for.
    ctx.globalCompositeOperation = 'lighter';

    ctx.globalAlpha = 0.72;                       // B — the clock (amber)
    this._blit(ctx, bi, at, d, fw, 'rgba(255,190,90,1)');

    ctx.globalAlpha = 0.72;                       // A — the frames (cyan)
    this._blit(ctx, ai, at, d, fw, 'rgba(120,220,255,1)');

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // ring goes red the moment the two disagree by more than half a frame
    const split = Math.abs(this._driftF) >= 0.5;
    ctx.beginPath();
    ctx.arc(at.x, at.y, d * 0.58, 0, Math.PI * 2);
    ctx.strokeStyle = split ? 'rgba(255,90,90,0.9)' : 'rgba(120,255,160,0.5)';
    ctx.lineWidth = Math.max(1, 1.5 * dpr);
    ctx.stroke();

    ctx.restore();
  },

  /** Tint the atlas frame without baking two atlases: draw, then multiply in. */
  _blit(ctx, idx, at, d, fw, tint) {
    const x = at.x - d / 2, y = at.y - d / 2;
    if (!this._tintC || this._tintC.width !== fw) {
      this._tintC = document.createElement('canvas');
      this._tintC.width = fw; this._tintC.height = fw;
    }
    const t = this._tintC.getContext('2d');
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, fw, fw);
    t.drawImage(this._atlas, idx * fw, 0, fw, fw, 0, 0, fw, fw);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = tint;
    t.fillRect(0, 0, fw, fw);
    ctx.drawImage(this._tintC, x, y, d, d);
  },

  /** Under the debug button. Read live but cached — the button doesn't move. */
  _anchor(dpr) {
    const el = document.getElementById('debug-btn');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    return {
      x: (r.left + r.width / 2) * dpr,
      y: (r.bottom + this.size * 0.75) * dpr,
    };
  },
};

export default WorkWheel;
