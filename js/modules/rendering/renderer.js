/**
 * js/modules/rendering/renderer.js
 * Master rendering orchestrator - exports DrawAll() for the main loop.
 */
import { TweenRenderer } from './tween-renderer.js';
import { EffectsModule } from './effects.js';
import { SunModule } from './sun.js';
import { BodiesModule } from './bodies.js';
import { ParticlesModule } from './particles.js';
import { TrailsModule } from './trails.js';
import { CameraModule } from '../camera/camera.module.js';
import { StateCache } from '../../core/state-cache.js';
import { state } from '../../core/state.js';

/**
 * Draws one complete frame.
 * @param {CanvasRenderingContext2D} ctx - the canvas context
 * @param {number} t - performance.now() timestamp
 * @param {number} alpha - 0..1 interpolation between physics states
 * @param {boolean} didPhysicsTick - whether physics ran this frame
 * @param {Function} onBeforeRestore - optional callback called inside camera transform before ctx.restore()
 */
export function DrawAll(ctx, t, alpha, didPhysicsTick = false, onBeforeRestore = null) {
  const cam = CameraModule.cam;
  const w = CameraModule.width;
  const h = CameraModule.height;

  // 1. Interpolate (Tween)
  const interpData = StateCache.getInterpolationData(alpha);
  TweenRenderer.applyTween(state.bodies, state.loose, interpData);

  // 2. Trails Buffer — ONLY when physics actually ticked
  if (didPhysicsTick) {
    TrailsModule.renderToBuffer(ctx, w, h, cam, state.bodies);
  }

  // 3. Clear Canvas
  ctx.fillStyle = '#04040c';
  ctx.fillRect(0, 0, w, h);

  // 4. Screen-space effects (before camera transform)
  EffectsModule.drawNebula(ctx, t, w, h);
  EffectsModule.drawStars(ctx, t, w, h);

  // 5. Camera Transform
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // 6. Sun layers
  SunModule.drawSolarRays(ctx, t, cam.zoom);
  SunModule.drawSun(ctx, t, cam.zoom);
  SunModule.drawSolarTentacles(ctx, t, cam.zoom);

  // 7. Planets
  BodiesModule.drawBodies(ctx);

  // 8. Loose particles
  ParticlesModule.drawLoose(ctx, cam.zoom);

  // 9. Flashes
  EffectsModule.drawFlashes(ctx, cam.zoom);

  // 10. World-space overlay callback (orbit preview)
  if (typeof onBeforeRestore === 'function') {
    onBeforeRestore(ctx);
  }

  // 11. Restore camera
  ctx.restore();

  // 12. Trails (screen-space — must be after restore!)
  TrailsModule.drawTrail(ctx, w, h, cam);

  // 13. Revert tween
  TweenRenderer.revertTween();
}
