/**
 * js/modules/rendering/bodies.js
 * Prime Module: Soft-body planet rendering (hull, springs, particles, atmosphere).
 *
 * FIX (2026-06-14):
 * - Added NaN guard before ALL createRadialGradient calls.
 *   If body.cx or body.cy is not finite, skip gradient creation entirely.
 *   This prevents IndexSizeError (DOMException) from NaN coordinates.
 */
import { hypot, lerp, clamp, convexHull, PI2 } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state, SUN } from '../../core/state.js';
import { CameraModule } from '../camera/camera.module.js';
import { renderParticles } from '../rendering/particle-management.js';
import { DotAtlasRenderer } from './dot-atlas-renderer.js';
import { HeatSparkles } from '../../core/heat-sparkles.js';

export const BodiesModule = {
  drawBodies: (ctx) => {
    for (const b of state.bodies) {
      if (b.dead) continue;
      BodiesModule.drawBody(ctx, b);
    }
  },

  drawBody: (ctx, body) => {
    const { particles: ps, springs: ss, pal } = body;
    const alive = ps.filter(p => !p.dead);
    if (alive.length < 3) return;

    const hull = convexHull(alive);
    if (hull.length < 3) return;

    if (!Number.isFinite(body.cx) || !Number.isFinite(body.cy)) return;

    // Normal rendering function (called either directly or via caching layer)
    const drawNormal = () => {
      const dxSun = SUN.x - body.cx, dySun = SUN.y - body.cy;
      const sDist = hypot(dxSun, dySun);
      const burnZoneRadius = SUN.burnRadius * 4;
      let burnFactor = 0;
      if (sDist < burnZoneRadius) {
        burnFactor = 1 - (sDist / burnZoneRadius);
        burnFactor *= (0.9 + 0.1 * Math.sin(SUN.coronaTime * 15));
        burnFactor = clamp(burnFactor, 0, 1);
      }

      // Hull fill
      ctx.beginPath();
      ctx.moveTo(hull[0].x, hull[0].y);
      for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
    ctx.closePath();
    const gr = ctx.createRadialGradient(body.cx, body.cy, 0, body.cx, body.cy, body.radius);
    gr.addColorStop(0, pal.hi + 'dd'); gr.addColorStop(0.35, pal.mid + 'cc');
    gr.addColorStop(0.75, pal.lo + 'bb'); gr.addColorStop(1, pal.lo + '44');
    ctx.fillStyle = gr; ctx.fill();

    if (burnFactor > 0.05) {
      const burnGrad = ctx.createRadialGradient(body.cx, body.cy, 0, body.cx, body.cy, body.radius * 1.1);
      burnGrad.addColorStop(0, `rgba(255,240,100,${burnFactor * 0.7})`);
      burnGrad.addColorStop(0.4, `rgba(220,60,10,${burnFactor * 0.8})`); burnGrad.addColorStop(0.8, `rgba(30,5,0,${burnFactor * 0.9})`);
      burnGrad.addColorStop(1, `rgba(0,0,0,${burnFactor * 0.95})`);
      ctx.fillStyle = burnGrad; ctx.fill();
    }

    if (burnFactor > 0.1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,120,20,${burnFactor * 0.9})`;
      ctx.lineWidth = (2 + burnFactor * 2) / CameraModule.cam.zoom;
      ctx.stroke();
      if (burnFactor > 0.2) {
        ctx.shadowBlur = 15 + burnFactor * 20;
        ctx.shadowColor = `rgba(255,80,20,${burnFactor * 0.7})`;
        ctx.strokeStyle = `rgba(255,100,30,${burnFactor * 0.5})`;
        ctx.lineWidth = (3 + burnFactor * 3) / CameraModule.cam.zoom;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    } else {
      ctx.strokeStyle = `rgba(${pal.gc},.35)`;
      ctx.lineWidth = 1.5 / CameraModule.cam.zoom;
      ctx.stroke();
    }

    // Stressed springs
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = `rgba(${pal.gc},.9)`;
    ctx.lineWidth = 0.8 / CameraModule.cam.zoom;
    ctx.beginPath();
    for (const sp of ss) {
      if (sp.broken) continue;
      const pa = ps[sp.a], pb = ps[sp.b];
      if (pa.dead || pb.dead) continue;
      if (hypot(pb.x - pa.x, pb.y - pa.y) / sp.restLen < 1.1) continue;
      ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

      renderParticles(ctx, alive, pal, burnFactor, config.PARTICLE_R, lerp);

      // ─── PLANET AURA & GLOSS ───
      const auraRadius = body.radius * 1.6;
      const auraGrad = ctx.createRadialGradient(
        body.cx, body.cy, body.radius * 0.01,
        body.cx, body.cy, auraRadius * 1.1
      );
      ctx.save();
      auraGrad.addColorStop(0, body.pal.hi + '66');
      auraGrad.addColorStop(0.5, body.pal.lo + '33');
      auraGrad.addColorStop(1, body.pal.lo + '00');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(body.cx, body.cy, auraRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ─── HEAT SPARKLES (sun-facing arc) ───
      // White noise shimmer on borders when burning
      if (body.heat && body.heat > 0.3) {
        HeatSparkles.draw(ctx, body, body.heat);
      }
    };

    // Use caching layer with stability thresholds
    DotAtlasRenderer.draw(ctx, body, drawNormal);
  }
};
