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

  try {
    // 3. Starfield (world-space) — drawn into stage
    EffectsModule.drawStars(sCtx, t, w, h);

    // 4. Camera transform on stage
    sCtx.save();
    sCtx.translate(w / 2, h / 2);
    sCtx.scale(cam.zoom, cam.zoom);
    sCtx.translate(-cam.x, -cam.y);

    // 5. Solar rays
    SunModule.drawSolarRays(sCtx, t, cam.zoom);

    // 6. Solar tentacles
    SunModule.drawSolarTentacles(sCtx, t, cam.zoom);

    // 7. Sun
    SunModule.drawSun(sCtx, t, cam.zoom);

    // 8. Bodies
    BodiesModule.drawBodies(sCtx);

    // 9. Loose particles
    ParticlesModule.drawLoose(sCtx, cam.zoom);

    // 10. Flashes
    EffectsModule.drawFlashes(sCtx, cam.zoom);

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
}
