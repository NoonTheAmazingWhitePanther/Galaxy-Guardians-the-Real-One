/**
 * js/modules/ui/overlays.js
 * Prime Module: Charge indicator, orbit preview, FPS, and spawn helpers.
 */
import { hypot, clamp, lerp, PI2 } from '../../core/math.js';
import { config } from '../../core/config.js';
import { CONFIG } from '../../../js/config/config-index.js';
import { state, SUN, sunGravMult, physSpeed, PALS } from '../../core/state.js';
import { makeBody } from '../physics/creation.js';
import { CameraModule } from '../camera/camera.module.js';
import { FutureCache } from '../../core/future-cache.js';

export const OverlaysModule = {
  fpsSamples: [],
  fpsDisplay: 0,

  // ── FPS Counter ──
  updateFPS: (rawDt) => {
    if (rawDt > 0) {
      OverlaysModule.fpsSamples.push(1 / rawDt);
      if (OverlaysModule.fpsSamples.length > 30) OverlaysModule.fpsSamples.shift();
    }
    if (OverlaysModule.fpsSamples.length > 0) {
      OverlaysModule.fpsDisplay = Math.round(
        OverlaysModule.fpsSamples.reduce((a, b) => a + b) / OverlaysModule.fpsSamples.length
      );
    }
  },

  drawFPS: () => {
    const fpsElem = document.getElementById('fpsCounter');
    if (fpsElem) fpsElem.textContent = `${OverlaysModule.fpsDisplay || 0} FPS`;
  },

  // ── Body Count ──
  updateCount: (pcountEl) => {
    let n = 0;
    for (const b of state.bodies) if (!b.dead) n++;
    if (pcountEl) pcountEl.textContent = n === 0 ? "—" : `${n} 🌕${n !== 1 ? "" : ""}`;
  },

  // ── Spawn Planet ──
  spawnPlanet: (x, y, size, pcountEl) => {
    if (state.bodies.length >= CONFIG.physics.MAX_BODIES) return;
    const radius = clamp(size * 8, 16, 110);
    const pal = PALS[Math.floor(Math.random() * PALS.length)];
    const body = makeBody(x, y, radius, pal);
    const nP = body.particles.length;
    body.gravMult = sunGravMult;

    const dist = hypot(x - SUN.x, y - SUN.y) || 1;
    const v = Math.sqrt(config.GRAV_CONST * SUN.mass * sunGravMult / Math.max(nP, 1) / Math.max(dist, 1));
    const vx = -(y - SUN.y) / dist * v;
    const vy = (x - SUN.x) / dist * v;

    for (const p of body.particles) { p.vx = vx; p.vy = vy; }
    state.bodies.push(body);

    // A newly-planted body isn't in anything already cached ahead. Without this,
    // stale future ticks (computed before this planet existed) replay and
    // overwrite state.bodies via playNext(), wiping the new planet — which is
    // why only the first planet (planted while the cache was still empty) stuck.
    FutureCache.invalidate();

    state.flashes.push({
      x, y, r: radius * 0.1, maxR: radius * 2, gc: pal.gc,
      life: 0.45, speed: 0.12, kind: "fill"
    });
    OverlaysModule.updateCount(pcountEl);
  },

  // ── Charge Ring ──
  drawCharge: (ctx, holding, holdT, tx, ty, sliderVal) => {
    if (!holding) return;
    const charge = Math.min((performance.now() - holdT) / 2000, 1);
    const r = clamp(parseFloat(sliderVal) * (1 + charge * 4) * 8, 16, 110) * charge;

    ctx.beginPath();
    ctx.arc(tx, ty, r, 0, PI2);
    ctx.strokeStyle = `rgba(255,190,50,${0.15 + charge * 0.3})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(tx, ty, 14, -Math.PI / 2, -Math.PI / 2 + PI2 * charge);
    ctx.strokeStyle = `rgba(255,190,50,${0.5 + charge * 0.4})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(tx, ty, 3, 0, PI2);
    ctx.fillStyle = `rgba(255,210,80,${0.7 + charge * 0.3})`;
    ctx.fill();
  },

  // ── Orbital Mechanics Helpers ──
  getOrbitalSpeed: (dist, nP, grav = sunGravMult) => {
    return Math.sqrt(config.GRAV_CONST * SUN.mass * grav / Math.max(nP, 1) / Math.max(dist, 1));
  },

  getOrbitalPeriod: (dist, nP, grav = sunGravMult) => {
    const v = OverlaysModule.getOrbitalSpeed(dist, nP, grav);
    return v > 0 ? (2 * Math.PI * dist / v) : 99999;
  },

  getSpawnVelocity: (x, y, nP, grav = sunGravMult) => {
    const dist = hypot(x - SUN.x, y - SUN.y) || 1;
    const v = OverlaysModule.getOrbitalSpeed(dist, nP, grav);
    return { vx: -(y - SUN.y) / dist * v, vy: (x - SUN.x) / dist * v, dist };
  },

  computePreviewDamping: (periodSub) => Math.pow(0.88, 1 / Math.max(periodSub, 1)),

  // ── Orbit Prediction ──
  predictOrbit: (spawnX, spawnY, vx0, vy0, nP, steps, dtPerStep, recordEvery = 40, grav = sunGravMult) => {
    const pts = [];
    let px = spawnX, py = spawnY, vx = vx0, vy = vy0;
    const gm = config.GRAV_CONST * SUN.mass * grav / Math.max(nP, 1);
    const burnR2 = SUN.burnRadius * SUN.burnRadius;
    const periodSub = OverlaysModule.getOrbitalPeriod(hypot(spawnX - SUN.x, spawnY - SUN.y) || 1, nP, grav) / dtPerStep;
    const vDamp = OverlaysModule.computePreviewDamping(periodSub);

    for (let i = 0; i < steps; i++) {
      const sdx = SUN.x - px, sdy = SUN.y - py;
      const sd2 = sdx * sdx + sdy * sdy;
      if (sd2 < burnR2) break;
      const sd = Math.sqrt(sd2) + 0.1;
      const f = gm / (sd2 + 500);
      vx = (vx + (sdx / sd) * f * dtPerStep) * vDamp;
      vy = (vy + (sdy / sd) * f * dtPerStep) * vDamp;
      px += vx * dtPerStep;
      py += vy * dtPerStep;
      if (i % recordEvery === 0) pts.push({ x: px, y: py });
    }
    return pts;
  },

  _previewCache: null,

  getPreviewPath: (wx, wy) => {
    if (OverlaysModule._previewCache &&
        Math.abs(OverlaysModule._previewCache.wx - wx) < 2 &&
        Math.abs(OverlaysModule._previewCache.wy - wy) < 2 &&
        OverlaysModule._previewCache.mult === sunGravMult) {
      return OverlaysModule._previewCache.pts;
    }

    const dist = hypot(wx - SUN.x, wy - SUN.y) || 1;
    const dtPerStep = 1 / config.SUBSTEPS;
    const periodSub = OverlaysModule.getOrbitalPeriod(dist, 100, sunGravMult) / dtPerStep;
    const totalSteps = Math.min(Math.ceil(periodSub * 7), 40000);
    const { vx, vy } = OverlaysModule.getSpawnVelocity(wx, wy, 100, sunGravMult);
    const pts = OverlaysModule.predictOrbit(wx, wy, vx, vy, 100, totalSteps, dtPerStep, 40, sunGravMult);

    OverlaysModule._previewCache = { wx, wy, pts, mult: sunGravMult };
    return pts;
  },

  // ── Draw Orbit Preview (WORLD SPACE — called inside camera transform) ──
  drawOrbitPreview: (ctx, holding, holdT, tx, ty) => {
    if (!holding) return;
    const charge = Math.min((performance.now() - holdT) / 2000, 1);
    const alpha = clamp(charge * 1.6, 0, 0.9);
    const w = CameraModule.screenToWorld(tx, ty);
    const dx = w.x - SUN.x, dy = w.y - SUN.y;
    const dist = hypot(dx, dy) || 1;
    const pts = OverlaysModule.getPreviewPath(w.x, w.y);
    if (pts.length < 4) return;

    const total = pts.length;
    const lw = 1.8 / CameraModule.cam.zoom;
    const BURN_ZONE_R = SUN.burnRadius * 4;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const SEG = Math.max(2, Math.floor(total / 100));

    for (let i = 0; i < total - SEG; i += SEG) {
      const f0 = i / total, f1 = (i + SEG) / total, fc = (f0 + f1) / 2;
      const r = Math.floor(lerp(160, 255, Math.min(fc * 1.8, 1)));
      const g = Math.floor(lerp(220, 120, fc));
      const b = Math.floor(lerp(255, 20, Math.min(fc * 1.5, 1)));
      const a = alpha * (1 - fc * 0.5) * (f0 < 0.12 ? f0 / 0.12 : 1);
      const w2 = lw * (1.4 - fc * 0.9);

      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      for (let j = i + 1; j <= i + SEG && j < total; j++) ctx.lineTo(pts[j].x, pts[j].y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
      ctx.lineWidth = Math.max(0.3 / CameraModule.cam.zoom, w2);
      ctx.stroke();
    }

    const animFrac = (performance.now() * 0.00035) % 1;
    const DOT_COUNT = 1;
    for (let d = 0; d < DOT_COUNT; d++) {
      const f = ((d / DOT_COUNT) + animFrac) % 1;
      const idx = Math.floor(f * (total - 1));
      const pt = pts[idx];
      const r2 = Math.floor(lerp(160, 255, Math.min(f * 1.8, 1)));
      const g2 = Math.floor(lerp(220, 120, f));
      const b2 = Math.floor(lerp(255, 20, Math.min(f * 1.5, 1)));
      const dotR = Math.max(0.8 / CameraModule.cam.zoom, (3 - f * 1.5) / CameraModule.cam.zoom);
      const da = alpha * (1 - f * 0.4) * 0.95;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, dotR, 0, PI2);
      ctx.fillStyle = `rgba(${r2},${g2},${b2},${da})`;
      ctx.fill();
    }
    ctx.restore();

    // helper lines: sun connection
    ctx.save();
    ctx.globalAlpha = alpha * 0.28;
    ctx.setLineDash([3 / CameraModule.cam.zoom, 4 / CameraModule.cam.zoom]);
    ctx.beginPath();
    ctx.moveTo(SUN.x, SUN.y);
    ctx.lineTo(w.x, w.y);
    ctx.strokeStyle = "rgba(255,200,80,1)";
    ctx.lineWidth = 0.6 / CameraModule.cam.zoom;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // velocity arrow
    const tx_ = -dy / dist, ty_ = dx / dist;
    const alen = Math.min(dist * 0.13, 240 / CameraModule.cam.zoom);
    const ax = w.x + tx_ * alen, ay = w.y + ty_ * alen;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(160,225,255,1)";
    ctx.fillStyle = "rgba(160,225,255,1)";
    ctx.lineWidth = lw * 0.85;
    ctx.beginPath();
    ctx.moveTo(w.x, w.y);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    const ha = Math.atan2(ty_, tx_);
    const hl = alen * 0.3;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - Math.cos(ha - 0.38) * hl, ay - Math.sin(ha - 0.38) * hl);
    ctx.lineTo(ax - Math.cos(ha + 0.38) * hl, ay - Math.sin(ha + 0.38) * hl);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // spawn point marker
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(w.x, w.y, 3.5 / CameraModule.cam.zoom, 0, PI2);
    ctx.fillStyle = "rgba(160,225,255,1)";
    ctx.fill();
    ctx.restore();

    // burn zone
    ctx.save();
    ctx.beginPath();
    ctx.arc(SUN.x, SUN.y, BURN_ZONE_R, 0, PI2);
    ctx.strokeStyle = `rgba(255,60,30,${alpha * 0.4})`;
    ctx.lineWidth = 1.5 / CameraModule.cam.zoom;
    ctx.setLineDash([8 / CameraModule.cam.zoom, 5 / CameraModule.cam.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,40,20,${alpha * 0.05})`;
    ctx.fill();
    ctx.restore();

    // text info — FIX: use ctx.save()/ctx.restore() instead of getTransform()/setTransform(m)
    const isBurnZone = dist < BURN_ZONE_R;
    const period_frames = Math.round(OverlaysModule.getOrbitalPeriod(dist, 100, sunGravMult) / physSpeed);
    const midSX = ((SUN.x - CameraModule.cam.x) * CameraModule.cam.zoom + CameraModule.width / 2 +
                   (w.x - CameraModule.cam.x) * CameraModule.cam.zoom + CameraModule.width / 2) / 2;
    const midSY = ((SUN.y - CameraModule.cam.y) * CameraModule.cam.zoom + CameraModule.height / 2 +
                   (w.y - CameraModule.cam.y) * CameraModule.cam.zoom + CameraModule.height / 2) / 2;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);  // reset to screen-space identity
    ctx.font = '8px "Space Mono",monospace';
    if (isBurnZone) {
      ctx.fillStyle = `rgba(255,80,50,${alpha})`;
      ctx.fillText(`🔥 BURN ZONE — Will disintegrate`, midSX + 8, midSY - 4);
    } else {
      ctx.fillStyle = `rgba(180,215,255,${alpha * 0.65})`;
      ctx.fillText(`r${Math.round(dist)} ~${period_frames}f`, midSX + 8, midSY - 4);
    }
    ctx.restore();  // restores world-space camera transform
  }
};
