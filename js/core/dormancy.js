/**
 * js/core/dormancy.js
 *
 * DORMANCY CLASSIFIER (Stage 1 — measurement only)
 * ================================================
 * The insight: FutureCache already holds a fully-coupled, real-physics
 * trajectory for every body over the next ~100 ticks. That future is a free
 * oracle. If we scan it, we know IN ADVANCE which bodies are about to have a
 * "major event" (a close approach to another body, or to the Sun) and which
 * are just coasting untouched.
 *
 * A body with no predicted event over the whole cached window is a candidate
 * to go "cold" — Stage 2 will let it skip integration and coast/tween between
 * cached steps instead. A cold body replaying cached motion is NOT fake
 * physics: it's real, already-computed, fully-coupled physics amortised. The
 * only error is if something it can strongly feel deviates from the cache
 * (a mispredicted collision, or a spawn/drag that already invalidates the
 * cache anyway) — so we wake a body BEFORE its predicted event, with margin.
 *
 * THIS FILE CHANGES NOTHING IN THE LIVE TICK. It only reads the cache and
 * publishes per-body {cold, wakeTick} + counts, so the real cold/hot ratio
 * and any missed events can be measured on-device before Stage 2 acts on it.
 *
 * Bodies are matched by ARRAY INDEX across the window — valid because any
 * spawn/despawn invalidates the cache (FutureCache.invalidate), so within one
 * buffered window the array order is stable.
 */
import { state, SUN } from './state.js';
import { FutureCache } from './future-cache.js';
import { ManualOverrides } from '../modules/debug/governor.js';

// ── Fixed tunables (the live ones — margin / sun pad / horizon — are knobs) ──
const SCAN_INTERVAL_MS = 180;   // self-throttle — "check from time to time"
const MAX_SAMPLES      = 24;    // ticks sampled across the window (cost cap)
const MIN_HORIZON      = 8;     // need at least this many cached ticks to bother
const DEF_MARGIN       = 60;    // fallbacks if the knob module isn't there yet (additive px lead)
const DEF_SUN_PAD      = 60;
const DEF_HORIZON      = 120;

function centroid(b) {
  if (Number.isFinite(b.cx) && Number.isFinite(b.cy)) return [b.cx, b.cy];
  // fall back to computing it (very early ticks before updateCOM has run)
  let sx = 0, sy = 0, sm = 0;
  const ps = b.particles || [];
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k]; if (p.dead) continue;
    sx += p.x * p.mass; sy += p.y * p.mass; sm += p.mass;
  }
  return sm > 0 ? [sx / sm, sy / sm] : [0, 0];
}

// Declared extent. makeBody() stores each body's `radius` from the size it was
// built at — a stable "central offset (cx,cy) + declared radius, no further"
// that does NOT sprawl when the jelly deforms, sheds particles, or flings one
// outlier. That sprawl was the source of the giant-star coherence: a single
// far particle blew up a max-distance radius. Fall back to a particle-derived
// radius only if a body somehow lacks a declared one (loose-derived, etc.).
function declaredRadius(b) {
  if (Number.isFinite(b.radius) && b.radius > 0) return b.radius;
  const ps = b.particles || [];
  let r2 = 0;
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k]; if (p.dead) continue;
    const dx = p.x - (b.cx || 0), dy = p.y - (b.cy || 0);
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) r2 = d2;
  }
  return Math.sqrt(r2) || 8;
}

export const Dormancy = {
  _states: [],          // index-aligned: { cold, wakeTick, reason }
  _lastScan: 0,
  _rad: [],             // per-index bounding radius (for the witness overlay)
  _coldIdx: [],         // indices currently classified cold
  _tweenA: 0,           // locked tween phase (advances a fixed step per frame)
  _info: { bodies: 0, cold: 0, hot: 0, coldPct: 0, horizon: 0, scanMs: 0, reason: 'idle' },

  // Stage-2 hooks (unused for now, ready for the live tick to consult):
  isCold(i)   { return this._states[i]?.cold === true; },
  wakeTick(i) { return this._states[i]?.wakeTick ?? 0; },

  // Called once per frame from main.js; self-throttles.
  tick() {
    const now = performance.now();
    if (now - this._lastScan < SCAN_INTERVAL_MS) return;
    this._lastScan = now;
    this.classify();
  },

  classify() {
    const t0 = performance.now();
    const N = state.bodies.length;
    if (N === 0) { this._reset(0, 'no bodies'); return; }

    // Live knobs — dial these at runtime to trade "too hot" vs "too cold".
    const LEAD        = ManualOverrides.get('dormancyMargin', DEF_MARGIN);   // additive px lead
    const SUN_MARGIN  = ManualOverrides.get('dormancySunPad', DEF_SUN_PAD);
    const RAD_K       = ManualOverrides.get('dormancyRadiusK', 1.0);         // ×declared radius
    const H_CAP       = Math.max(MIN_HORIZON, Math.round(ManualOverrides.get('dormancyHorizon', DEF_HORIZON)));

    const range = FutureCache.bufferedRange;
    const from  = range.from;
    // Cap how far ahead we classify, INDEPENDENT of how deep the cache runs.
    // Scanning the full 1000-deep buffer flags almost everything hot, because
    // over a long enough horizon every body eventually drifts near another.
    const to = Math.min(range.to, from + H_CAP - 1);
    const horizon = to - from + 1;
    if (horizon < MIN_HORIZON) { this._reset(N, 'cache warming'); return; }

    // Collect the sampled window ticks that actually exist in the buffer.
    const stride = Math.max(1, Math.ceil(horizon / MAX_SAMPLES));
    const snaps = [];
    for (let t = from; t <= to; t += stride) {
      const snap = FutureCache.peekAt(t);
      if (snap && snap.bodies && snap.bodies.length === N) snaps.push(snap);
    }
    if (snaps.length < 2) { this._reset(N, 'window unusable'); return; }

    // Per-body: bounding radius (from first snap) + trajectory of centroids
    // + an inflated window-AABB for broad-phase.
    const rad = new Array(N);
    const traj = new Array(N);      // traj[i] = [ [x,y], ... ] over snaps
    const box = new Array(N);       // {minX,minY,maxX,maxY} inflated by r
    for (let i = 0; i < N; i++) {
      const path = new Array(snaps.length);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let s = 0; s < snaps.length; s++) {
        const b = snaps[s].bodies[i];
        const [x, y] = centroid(b);
        path[s] = [x, y];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const [c0x, c0y] = path[0];
      const r = declaredRadius(snaps[0].bodies[i]) * RAD_K;
      rad[i] = r; traj[i] = path;
      const pad = r + LEAD;   // additive — a giant body no longer inflates its own keep-out zone by its size
      box[i] = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }

    // Fresh state — everyone cold until a predicted event proves otherwise.
    const states = new Array(N);
    for (let i = 0; i < N; i++) states[i] = { cold: true, wakeTick: to, reason: 'coast' };

    const markHot = (i, tick, reason) => {
      const st = states[i];
      if (st.cold || tick < st.wakeTick) { st.cold = false; st.wakeTick = Math.min(st.wakeTick, tick); st.reason = reason; }
    };

    // ── Sun proximity (per body) ──
    for (let i = 0; i < N; i++) {
      const thr = SUN.burnRadius + rad[i] + SUN_MARGIN, thr2 = thr * thr;
      for (let s = 0; s < snaps.length; s++) {
        const dx = traj[i][s][0] - SUN.x, dy = traj[i][s][1] - SUN.y;
        if (dx * dx + dy * dy < thr2) { markHot(i, from + s * stride, 'sun'); break; }
      }
    }

    // ── Body-body close approach (broad-phase AABB → narrow min-distance) ──
    // Same law as the live collision pass: radius/proximity checking is
    // SELF-PLANE ONLY — cross-plane bodies can't collide, so they must never
    // wake each other. Plane is stable across the window (spawn invalidates).
    const planeOf = new Array(N);
    for (let i = 0; i < N; i++) planeOf[i] = snaps[0].bodies[i]?.plane | 0;
    let pairTests = 0;
    for (let i = 0; i < N; i++) {
      const bi = box[i];
      for (let j = i + 1; j < N; j++) {
        if (planeOf[i] !== planeOf[j]) continue;
        const bj = box[j];
        if (bi.maxX < bj.minX || bj.maxX < bi.minX || bi.maxY < bj.minY || bj.maxY < bi.minY) continue;
        pairTests++;
        const wake = (rad[i] + rad[j]) + LEAD, wake2 = wake * wake;
        for (let s = 0; s < snaps.length; s++) {
          const dx = traj[i][s][0] - traj[j][s][0];
          const dy = traj[i][s][1] - traj[j][s][1];
          if (dx * dx + dy * dy < wake2) {
            const tick = from + s * stride;
            markHot(i, tick, 'pair'); markHot(j, tick, 'pair');
            break;
          }
        }
      }
    }

    let cold = 0;
    const coldIdx = [];
    for (let i = 0; i < N; i++) if (states[i].cold) { cold++; coldIdx.push(i); }

    this._states = states;
    this._rad = rad;
    this._coldIdx = coldIdx;
    this._info = {
      bodies: N, cold, hot: N - cold,
      coldPct: Math.round((cold / N) * 100),
      horizon, pairTests, margin: LEAD,
      scanMs: +(performance.now() - t0).toFixed(2),
      reason: 'ok',
    };
  },

  _reset(n, reason) {
    this._states = [];
    this._coldIdx = [];
    this._info = { bodies: n, cold: 0, hot: n, coldPct: 0, horizon: FutureCache.bufferedAhead, pairTests: 0, scanMs: 0, reason };
  },

  // ── Witness overlay (Stage 2 front-half) ────────────────────────────────
  // Draws each COLD body gliding between its two nearest cached keyframes at a
  // LOCKED alpha — a fixed step per frame, not scaled by real dt or sim speed,
  // so the tween always looks the same (the engine's fixed-timestep discipline,
  // applied to the visual). Pure overlay: reads cached COMs, never writes sim
  // state, so it can't fight cache playback. Called in world space from the
  // renderer's onBeforeRestore hook. This is the visual proof-of-motion before
  // Stage 2 lets the tween actually DRIVE (and skip integration for) cold bodies.
  drawWitness(sCtx) {
    if (ManualOverrides.get('dormancyTween', 0) === 0) return;
    const idx = this._coldIdx;
    if (!idx || !idx.length) return;

    const from = FutureCache.bufferedRange.from;
    const kfA = FutureCache.peekAt(from);        // nearest cached cold-frame
    const kfB = FutureCache.peekAt(from + 1);    // the next one
    if (!kfA || !kfB) return;
    const N = state.bodies.length;
    if (kfA.bodies.length !== N || kfB.bodies.length !== N) return;

    // Locked advance — constant per frame. Higher lock = slower, smoother glide.
    const lock = Math.max(2, Math.round(ManualOverrides.get('dormancyTweenLock', 8)));
    this._tweenA += 1 / lock;
    if (this._tweenA >= 1) this._tweenA -= 1;
    const e = this._tweenA;   // LINEAR — constant velocity across keyframes (a resting body
                              // coasts smoothly; easing here would pulse slow-fast-slow)

    sCtx.save();
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      const bA = kfA.bodies[i], bB = kfB.bodies[i];
      if (!bA || !bB) continue;
      const ca = centroid(bA), cb = centroid(bB);
      const x = ca[0] + (cb[0] - ca[0]) * e;
      const y = ca[1] + (cb[1] - ca[1]) * e;
      const r = this._rad[i] || 12;
      const lw = Math.max(1, r * 0.06);          // world-unit width; scales with body

      // the keyframe-to-keyframe segment (faint) — the path being interpolated
      sCtx.strokeStyle = 'rgba(130,210,255,0.22)';
      sCtx.lineWidth = lw;
      sCtx.beginPath(); sCtx.moveTo(ca[0], ca[1]); sCtx.lineTo(cb[0], cb[1]); sCtx.stroke();

      // the gliding marker at the locked-tween position
      sCtx.strokeStyle = 'rgba(130,210,255,0.9)';
      sCtx.lineWidth = lw * 1.5;
      sCtx.beginPath(); sCtx.arc(x, y, r, 0, Math.PI * 2); sCtx.stroke();
      sCtx.fillStyle = 'rgba(190,235,255,0.95)';
      sCtx.beginPath(); sCtx.arc(x, y, Math.max(1.5, r * 0.14), 0, Math.PI * 2); sCtx.fill();
    }
    sCtx.restore();
  },

  get debugInfo() {
    const i = this._info;
    return {
      cold:    `${i.cold}/${i.bodies}`,
      coldPct: `${i.coldPct}%`,
      hot:     i.hot,
      horizon: i.horizon,
      margin:  Math.round(i.margin ?? 0) + 'px',
      scanMs:  `${i.scanMs}ms`,
      status:  i.reason,
    };
  },
};

export default Dormancy;
