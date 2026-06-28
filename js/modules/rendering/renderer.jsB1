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
import { state }          from '../../core/state.js';
import { DrawCallCounter, PassProbe } from '../debug/draw-call-counter.js';

export function DrawAll(ctx, t, alpha, didPhysicsTick = false, onBeforeRestore = null) {
  const w   = CameraModule.width;
  const h   = CameraModule.height;
  const cam = CameraModule.cam;

  // 1. Interpolate (Tween)
  const interpData = StateCache.getInterpolationData(alpha);
  TweenRenderer.applyTween(state.bodies, state.loose, interpData);

  // 2. Prepare the accumulator stage — fades ghost, ready for new scene
  Accumulator.beginFrame();
  const sCtx = Accumulator.stageCtx;

  // Begin draw call counting for this frame
  DrawCallCounter.beginFrame();

  try {
    // 3. Starfield
    { const p = new PassProbe(sCtx);
      EffectsModule.drawStars(p.ctx, t, w, h);
      DrawCallCounter.countPass('stars', p); }

    // 4. Camera transform
    sCtx.save();
    sCtx.translate(w / 2, h / 2);
    sCtx.scale(cam.zoom, cam.zoom);
    sCtx.translate(-cam.x, -cam.y);

    // 5. Solar rays
    { const p = new PassProbe(sCtx);
      SunModule.drawSolarRays(p.ctx, t, cam.zoom);
      DrawCallCounter.countPass('solarRays', p); }

    // 6. Solar tentacles
    { const p = new PassProbe(sCtx);
      SunModule.drawSolarTentacles(p.ctx, t, cam.zoom);
      DrawCallCounter.countPass('tentacles', p); }

    // 7. Sun
    { const p = new PassProbe(sCtx);
      SunModule.drawSun(p.ctx, t, cam.zoom);
      DrawCallCounter.countPass('sun', p); }

    // 8. Bodies
    { const p = new PassProbe(sCtx);
      BodiesModule.drawBodies(p.ctx);
      DrawCallCounter.countPass('bodies', p); }

    // 9. Loose particles
    { const p = new PassProbe(sCtx);
      ParticlesModule.drawLoose(p.ctx, cam.zoom);
      DrawCallCounter.countPass('particles', p); }

    // 10. Flashes
    { const p = new PassProbe(sCtx);
      EffectsModule.drawFlashes(p.ctx, cam.zoom);
      DrawCallCounter.countPass('flashes', p); }

    // 11. Orbit preview (injected — world-space)
    if (onBeforeRestore) onBeforeRestore(sCtx);

    // 12. Restore camera
    sCtx.restore();

  } finally {
    // 13. ALWAYS revert tween — even if DOMException was thrown
    TweenRenderer.revertTween();
  }

  // 14. Flip: blit finished stage to main canvas, swap buffers
  Accumulator.flip(ctx);

  // 15. Commit draw call counts for this frame
  DrawCallCounter.endFrame();
}
