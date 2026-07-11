/**
 * js/modules/rendering/renderer.js
 * The "Stage" — Orchestrates all rendering passes.
 *
 * REFACTOR (2026-06-19): Accumulator system.
 * All scene drawing now goes into Accumulator.stageCtx (offscreen).
 * main.js calls Accumulator.flip(mainCtx) to blit to screen.
 * TrailsModule.renderToBuffer/drawTrail are retired —
 * trails emerge naturally from the ghost canvas fade.
 *
 * FIX (2026-06-14): try/finally ensures TweenRenderer.revertTween()
 * ALWAYS runs even if a Canvas operation throws DOMException.
 */
import { TweenRenderer }  from './tween-renderer.js';
import { EffectsModule }  from './effects.js';
import { SunModule }      from './sun.js';
import { BodiesModule }   from './bodies.js';
import { ParticlesModule } from './particles.js';
import { Accumulator }    from './accumulator.js';
import { CameraModule }   from '../camera/camera.module.js';
import { StateCache }     from '../../core/state-cache.js';
import { state, SUN }     from '../../core/state.js';
import { DrawCallCounter, PassProbe } from '../debug/draw-call-counter.js';
import { MsProbe } from '../../core/ms-probe.js';
import { Gate } from '../../core/gate.js';
import { TrailGov } from '../debug/governor.js';

// Draw the trail. `framesBodies` are the stored keyframe positions (oldest→
// newest); `density` stamps are drawn along the interpolated path between them
// so the trail is smooth even from few keyframes. Age-faded so it self-cleans
// toward the tail; skip subsamples keyframes; shrink tapers the tail; bloom adds
// additive glow. Flat discs (mobile-cheap); the live jelly is drawn on top.
function _drawTrailStamps(ctx, framesBodies, opts) {
  const { skip, alpha, shrink, bloom, density } = opts;

  // Subsample keyframes by skip — ANCHORED TO THE NEWEST FRAME.
  // FIX (trail detaches from the planet): the old subsample walked from
  // the oldest end (f = 0, 8, 16…), so the newest frame only survived
  // when (len−1) happened to be divisible by skip — otherwise the trail's
  // head stopped up to skip−1 ticks short of the body, a gap that pulsed
  // as the buffer length changed. Walking from the newest end backwards
  // pins the head to the body always; the cut lands at the oldest tail
  // where nothing connects to it.
  let keys = framesBodies;
  if (skip > 1) {
    keys = [];
    for (let f = framesBodies.length - 1; f >= 0; f -= skip) keys.push(framesBodies[f]);
    keys.reverse();  // back to oldest→newest order
  }
  const K = keys.length;
  if (K === 0) return;
  if (K === 1) { _stampFrame(ctx, keys[0], 1, alpha, shrink, bloom); return; }

  const segs      = K - 1;
  const perSeg    = Math.max(1, Math.round(density / segs));  // stamps per keyframe pair
  const prevOp    = ctx.globalCompositeOperation;
  if (bloom > 0) ctx.globalCompositeOperation = 'lighter';

  for (let s = 0; s < segs; s++) {
    const A = keys[s], B = keys[s + 1];
    if (!A || !B) continue;

    // FIX (cross-body streaks): bodies were paired across frames by ARRAY
    // INDEX (A[i] ↔ B[i]). Any death/merge/spawn between the two frames
    // shifts indices, and the interpolation then connects two DIFFERENT
    // bodies — a trail streak flying across the screen every time
    // something dies. Snapshots carry stable ids (state-cache.js), so
    // pair by id: a body missing from B simply ends its trail (no stamp),
    // a body new in B has no past yet (no stamp) — both correct, neither
    // draws a line between strangers. Pairs are built ONCE per segment
    // (they don't change per interpolation step — the old code re-indexed
    // inside the step loop for nothing).
    const byId = new Map();
    for (let i = 0; i < B.length; i++) { const bb = B[i]; if (bb) byId.set(bb.id, bb); }
    const pairs = [];
    for (let i = 0; i < A.length; i++) {
      const ba = A[i];
      if (!ba) continue;
      const bb = byId.get(ba.id);
      if (bb) pairs.push(ba, bb);   // flat [a0,b0,a1,b1,…] — no per-pair objects
    }
    const m2 = pairs.length;
    if (m2 === 0) continue;

    for (let step = 0; step < perSeg; step++) {
      const tt  = step / perSeg;                       // 0..1 within segment
      const age = (s + tt) / segs;                     // 0 oldest → 1 newest
      const a   = Math.pow(age, 1.4) * alpha * (bloom > 0 ? 0.7 : 1);
      if (a < 0.004) continue;
      const rScale = (1 - shrink * (1 - age)) * (1 + bloom * 0.8);
      if (rScale <= 0) continue;
      const aStr = a.toFixed(3);
      for (let i = 0; i < m2; i += 2) {
        const ba = pairs[i], bb = pairs[i + 1];
        const cx = ba.cx + (bb.cx - ba.cx) * tt;
        const cy = ba.cy + (bb.cy - ba.cy) * tt;
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
        const baseR = ba.radius + ((bb.radius ?? ba.radius) - ba.radius) * tt;
        const r = (Number.isFinite(baseR) ? baseR : 8) * rScale;
        if (r <= 0.5) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ba.pal?.gc ?? '255,255,255'},${aStr})`;
        ctx.fill();
      }
    }
  }
  ctx.globalCompositeOperation = prevOp;
}

// Single-keyframe fallback (only one position available).
function _stampFrame(ctx, bodies, age, alpha, shrink, bloom) {
  if (!bodies) return;
  const a = Math.pow(age, 1.4) * alpha;
  if (a < 0.004) return;
  const rScale = (1 - shrink * (1 - age)) * (1 + bloom * 0.8);
  const aStr = a.toFixed(3);
  const prevOp = ctx.globalCompositeOperation;
  if (bloom > 0) ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b || !Number.isFinite(b.cx) || !Number.isFinite(b.cy)) continue;
    const r = (Number.isFinite(b.radius) ? b.radius : 8) * rScale;
    if (r <= 0.5) continue;
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${b.pal?.gc ?? '255,255,255'},${aStr})`;
    ctx.fill();
  }
  ctx.globalCompositeOperation = prevOp;
}

export function DrawAll(ctx, t, alpha, didPhysicsTick = false, onBeforeRestore = null, trailTicks = 0) {
  const w   = CameraModule.width;
  const h   = CameraModule.height;
  const cam = CameraModule.cam;

  // 1. Interpolate (Tween)
  MsProbe.call('render.drawAll.tween', () => {
    const interpData = StateCache.getInterpolationData(alpha);
    TweenRenderer.applyTween(state.bodies, state.loose, interpData);
  });

  // 2. Prepare the accumulator stage — fades ghost, ready for new scene.
  // Sync the phosphor glow (soft persistence behind the trail) from TrailGov:
  // fade is a live field; depth re-inits the ring, so only touch it on change.
  // (Resolution ramp removed — every trail layer is full-res now, same as prime.)
  if (Accumulator.trailDepth !== TrailGov.glowDepth) Accumulator.setTrailDepth(TrailGov.glowDepth);
  Accumulator.fadeAlpha = TrailGov.glowFade;
  // Pass ticks-this-frame so the glow window is measured in physics ticks, not
  // rendered frames: same persistence at any speed and any frame rate.
  // Also pass: (a) the CAMERA, so the accumulator reprojects prior layers by
  // the camera delta instead of blitting them at stale screen positions (the
  // sun-jumping fix — phosphor now sticks to WORLD space); (b) the SUN CLEAN
  // ZONE in screen px, sized past the largest strong halo (5.5R → 6R), so
  // the sun's animated rays/halos never accumulate as fog — the faint 18R
  // god rays ghost at 0.025 alpha × age decay, i.e. invisibly.
  const _sunSX = (SUN.x - cam.x) * cam.zoom + w / 2;
  const _sunSY = (SUN.y - cam.y) * cam.zoom + h / 2;
  Accumulator.beginFrame(trailTicks, cam,
    { x: _sunSX, y: _sunSY, r: SUN.radius * 6 * cam.zoom });
  const sCtx = Accumulator.stageCtx;

  // FIX: the accumulator's stage buffers are now built at device-pixel
  // resolution (CSS px × dpr — see accumulator.js), not CSS-pixel
  // resolution like before. Everything drawn onto sCtx below (starfield,
  // sun, trails, bodies, particles, flashes, overlays) was written
  // assuming CSS-pixel-equivalent coordinates — same convention the main
  // canvas uses, and same fix: one dpr scale, applied once, covers all
  // of it. Balanced in the finally block below so it always restores
  // even if something in the try block throws.
  const _dpr = Accumulator.dpr || 1;
  sCtx.save();
  sCtx.scale(_dpr, _dpr);

  // Begin draw call counting for this frame
  DrawCallCounter.beginFrame();

  try {
    // 3. Starfield
    if (Gate.pass('render.drawAll.stars')) MsProbe.call('render.drawAll.stars', () => {
      const p = new PassProbe(sCtx);
      EffectsModule.drawStars(p.ctx, t, w, h);
      DrawCallCounter.countPass('stars', p);
    });

    // 4. Camera transform
    sCtx.save();
    sCtx.translate(w / 2, h / 2);
    sCtx.scale(cam.zoom, cam.zoom);
    sCtx.translate(-cam.x, -cam.y);

    // 5–7. Sun stack (rays + tentacles + core) — one ms probe, three
    // draw-call passes (the DRAW CALLS panel keeps its per-pass detail).
    if (Gate.pass('render.drawAll.sun')) MsProbe.call('render.drawAll.sun', () => {
      { const p = new PassProbe(sCtx);
        SunModule.drawSolarRays(p.ctx, t, cam.zoom);
        DrawCallCounter.countPass('solarRays', p); }
      { const p = new PassProbe(sCtx);
        SunModule.drawSolarTentacles(p.ctx, t, cam.zoom);
        DrawCallCounter.countPass('tentacles', p); }
      { const p = new PassProbe(sCtx);
        SunModule.drawSun(p.ctx, t, cam.zoom);
        DrawCallCounter.countPass('sun', p); }
    });

    // 7.5 Trails — stamp the last N past tick-positions (from the vault) as a
    // continuous, self-cleaning trail. Length is in TICKS (via getRecentBodies),
    // so it's identical at any speed and frame rate unless Speed Scale is raised.
    // All look/length knobs live on TrailGov (see the TRAILS panel).
    if (TrailGov.enabled) {
      const count  = TrailGov.effectiveCount(state.physSpeed || 1);
      const recent = count > 0 ? StateCache.getRecentBodies(count) : [];
      if (recent.length > 0) {
        if (Gate.pass('render.drawAll.trails')) MsProbe.call('render.drawAll.trails', () => {
          const p = new PassProbe(sCtx);
          _drawTrailStamps(p.ctx, recent, {
            skip:    TrailGov.skip,
            alpha:   TrailGov.alpha,
            shrink:  TrailGov.shrink,
            bloom:   TrailGov.bloom,
            density: TrailGov.density,
          });
          DrawCallCounter.countPass('trails', p);
        });
      }
    }

    // 8. Bodies
    if (Gate.pass('render.drawAll.bodies')) MsProbe.call('render.drawAll.bodies', () => {
      const p = new PassProbe(sCtx);
      BodiesModule.drawBodies(p.ctx);
      DrawCallCounter.countPass('bodies', p);
    });

    // 9. Loose particles
    if (Gate.pass('render.drawAll.particles')) MsProbe.call('render.drawAll.particles', () => {
      const p = new PassProbe(sCtx);
      ParticlesModule.drawLoose(p.ctx, cam.zoom);
      DrawCallCounter.countPass('particles', p);
    });

    // 10. Flashes
    if (Gate.pass('render.drawAll.flashes')) MsProbe.call('render.drawAll.flashes', () => {
      const p = new PassProbe(sCtx);
      EffectsModule.drawFlashes(p.ctx, cam.zoom);
      DrawCallCounter.countPass('flashes', p);
    });

    // 11. Orbit preview + world-space overlays (injected)
    if (onBeforeRestore && Gate.pass('render.drawAll.overlays')) MsProbe.call('render.drawAll.overlays', () => onBeforeRestore(sCtx));

    // 12. Restore camera
    sCtx.restore();

  } finally {
    // 13. ALWAYS revert tween — even if DOMException was thrown
    TweenRenderer.revertTween();
    // 14. ALWAYS balance the dpr-scale save from above — even on throw
    sCtx.restore();
  }

  // 15. Flip: blit finished stage to main canvas
  MsProbe.call('render.drawAll.flip', () => Accumulator.flip(ctx));

  // 15. Commit draw call counts for this frame
  DrawCallCounter.endFrame();
}
