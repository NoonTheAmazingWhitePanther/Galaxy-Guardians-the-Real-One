/**
 * js/modules/rendering/renderer.js
 * The "Stage" — Orchestrates all rendering passes.
 *
 * FIX (2026-06-14):
 * - Wrapped entire draw in try/finally so TweenRenderer.revertTween()
 *   ALWAYS runs even if a Canvas operation throws DOMException.
 *   This prevents NaN from permanently poisoning the physics state.
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

export function DrawAll(ctx, t, alpha, didPhysicsTick = false, onBeforeRestore = null) {
  const w = CameraModule.width;
  const h = CameraModule.height;
  const cam = CameraModule.cam;

  // 1. Interpolate (Tween)
  const interpData = StateCache.getInterpolationData(alpha);
  TweenRenderer.applyTween(state.bodies, state.loose, interpData);

  // 2. Trails Buffer — ONLY when physics actually ticked
  if (didPhysicsTick) {
    TrailsModule.renderToBuffer(ctx, w, h, cam, state.bodies);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: try/finally ensures revertTween ALWAYS runs,
  // even if a Canvas operation throws DOMException (e.g., NaN in
  // createRadialGradient). Without this, a single crash permanently
  // corrupts the physics state by leaving tweened NaN values in place.
  // ═══════════════════════════════════════════════════════════════════════
  try {
    // 3. Camera transform (save/restore handled by CameraModule)
    ctx.save();
    CameraModule.apply(ctx, w, h);

    // 4. Draw starfield
    EffectsModule.drawStarfield(ctx, w, h, cam);

    // 5. Draw trails (world-space)
    TrailsModule.drawTrail(ctx, w, h, cam);

    // 6. Draw solar rays (world-space)
    SunModule.drawSolarRays(ctx, t, cam.zoom);

    // 7. Draw solar tentacles (world-space)
    SunModule.drawSolarTentacles(ctx, t, cam.zoom);

    // 8. Draw sun (world-space)
    SunModule.drawSun(ctx, t, cam.zoom);

    // 9. Draw bodies (world-space)
    BodiesModule.drawBodies(ctx);

    // 10. Draw loose particles (world-space)
    ParticlesModule.drawLoose(ctx, cam.zoom);

    // 11. Draw flashes (world-space)
    EffectsModule.drawFlashes(ctx, cam.zoom);

    // 12. Draw orbit preview (injected via callback so it draws in WORLD space)
    if (onBeforeRestore) onBeforeRestore(ctx);

    // 13. Restore camera transform
    ctx.restore();
  } finally {
    // 14. ALWAYS revert tweened values back to true physics state
    // This runs even if the try block threw a DOMException
    TweenRenderer.revertTween();
  }

  // 15. Screen-space overlays (after camera restore)
  EffectsModule.drawNova(ctx, t, cam.zoom);
}
