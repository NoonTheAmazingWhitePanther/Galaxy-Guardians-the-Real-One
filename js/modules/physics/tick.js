/**
 * js/modules/physics/tick.js
 * Prime Module: Main physics tick orchestrator, integration, and gravity.
 *
 * FIX (2026-06-14):
 * - Added NaN/Infinity guards in updateCOM to prevent corrupt body state
 * - Added defensive check in splitDeadParticles for out-of-bounds spring indices
 * - Added null-check before accessing particle properties in collision resolution
 */
import { hypot } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state, SUN, sunGravMult } from '../../core/state.js';
import { interBodyCollisions, looseVsPlanets } from './collisions.js';
import { splitDeadParticles } from './creation.js';

export const updateCOM = (body) => {
  let sx = 0, sy = 0, sm = 0;
  const particles = body.particles;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.dead) continue;
    sx += p.x * p.mass;
    sy += p.y * p.mass;
    sm += p.mass;
  }
  if (sm > 0) {
    const newCx = sx / sm;
    const newCy = sy / sm;
    // FIX: Guard against NaN/Infinity
    if (Number.isFinite(newCx) && Number.isFinite(newCy)) {
      body.cx = newCx;
      body.cy = newCy;
      body.mass = sm;
    }
  }
  // If sm === 0, keep previous cx/cy (body will be marked dead in splitDeadParticles)
};

export const integrateParticle = (p, dt, damping) => {
  if (p.dead) return;
  p.vx = (p.vx + (p.fx / p.mass) * dt) * damping;
  p.vy = (p.vy + (p.fy / p.mass) * dt) * damping;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.fx = 0;
  p.fy = 0;
};

export const solveSprings = (body, dt) => {
  const ps = body.particles;
  const ss = body.springs;
  for (let i = 0; i < ss.length; i++) {
    const sp = ss[i];
    if (sp.broken) continue;
    // FIX: Guard against out-of-bounds indices
    if (sp.a < 0 || sp.a >= ps.length || sp.b < 0 || sp.b >= ps.length) {
      sp.broken = true;
      continue;
    }
    const pa = ps[sp.a], pb = ps[sp.b];
    if (!pa || !pb || pa.dead || pb.dead) { sp.broken = true; continue; }
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const len = hypot(dx, dy) || 0.001;
    if (len > sp.breakAt) { sp.broken = true; continue; }
    const f = sp.stiff * (len - sp.restLen);
    const nx = dx / len, ny = dy / len;
    const tm = pa.mass + pb.mass;
    const fdt = f * dt;
    pa.vx += nx * fdt * (pb.mass / tm);
    pa.vy += ny * fdt * (pb.mass / tm);
    pb.vx -= nx * fdt * (pa.mass / tm);
    pb.vy -= ny * fdt * (pa.mass / tm);
  }
};

export const applyGravity = (p, nParticles, gravConst, sunMass, sunX, sunY, bodies, sunGrav) => {
  const gm = (p.body && p.body.gravMult != null) ? p.body.gravMult : sunGrav;
  const sdx = sunX - p.x, sdy = sunY - p.y;
  const sd2 = sdx * sdx + sdy * sdy;
  const sd = Math.sqrt(sd2) + 0.1;
  const sf = (gravConst * sunMass * gm / (sd2 + 500)) / nParticles;
  p.fx += (sdx / sd) * sf * p.mass;
  p.fy += (sdy / sd) * sf * p.mass;

  for (let bi = 0; bi < bodies.length; bi++) {
    const b = bodies[bi];
    if (p.body === b) continue;
    const dx = b.cx - p.x, dy = b.cy - p.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2) + 0.1;
    const f = (gravConst * b.mass / (d2 + 300)) / nParticles;
    p.fx += (dx / d) * f * p.mass;
    p.fy += (dy / d) * f * p.mass;
  }
};

export const tickLoose = (dt) => {
  const gravConst = config.GRAV_CONST;
  const sunMass = SUN.mass;
  const sunX = SUN.x;
  const sunY = SUN.y;
  const sunBurnR = SUN.burnRadius;
  const sunGrav = sunGravMult;
  const bodies = state.bodies;

  // Fuse filter into single pass: mark dead, collect survivors
  const survivors = [];
  const looseArr = state.loose;
  const maxSurvivors = 350;
  const hardCap = looseArr.length > 400;

  for (let li = looseArr.length - 1; li >= 0; li--) {
    const lp = looseArr[li];
    if (lp.life <= 0.02) continue;
    if (hardCap && survivors.length >= maxSurvivors) break;

    const sdx = sunX - lp.x, sdy = sunY - lp.y;
    const sd2 = sdx * sdx + sdy * sdy;
    const sd = Math.sqrt(sd2) + 0.1;
    const inBurnZone = sd < sunBurnR * 4;
    const inCritical = sd < sunBurnR;

    if (!lp.isBurnt && lp.heat > 0.7 && !inBurnZone) {
      lp.isBurnt = true;
      lp.burnedAt = performance.now();
    }
    if (inCritical) continue;

    if (lp.isBurnt && inBurnZone) {
      lp.life -= lp.meltRate * dt * 2.5;
      const escapeFactor = lp.detachSpeed / 15;
      lp.vx += (sdx / sd) * escapeFactor * 0.3 * dt;
      lp.vy += (sdy / sd) * escapeFactor * 0.3 * dt;
    } else if (lp.heat > 0.7) {
      lp.life -= (lp.decay + 0.012) * dt;
    } else if (lp.isBurnt) {
      lp.life -= lp.decay * dt;
    } else {
      lp.life -= lp.isRing ? lp.decay * dt : (lp.decay + 0.008) * dt;
    }

    // Cheap random repulsion for burnt particles
    if (lp.isBurnt) {
      lp.vx += (Math.random() - 0.5) * 0.1 * dt;
      lp.vy += (Math.random() - 0.5) * 0.1 * dt;
    }

    if (sd < sunBurnR) continue;

    const sf = gravConst * sunMass * sunGrav / (sd2 + 500) * 0.04;
    lp.vx += sdx / sd * sf * dt;
    lp.vy += sdy / sd * sf * dt;

    for (let bi = 0; bi < bodies.length; bi++) {
      const b = bodies[bi];
      const dx = b.cx - lp.x, dy = b.cy - lp.y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) + 0.1;
      const f = gravConst * b.mass * (lp.isRing ? 0.01 : 0.06) / (d2 + 150);
      lp.vx += dx / d * f * dt;
      lp.vy += dy / d * f * dt;
    }

    lp.vx *= 0.995;
    lp.vy *= 0.995;
    lp.x += lp.vx * dt;
    lp.y += lp.vy * dt;

    if (lp.isBurnt) {
      lp.heat = sd < sunBurnR * 3 ? Math.min(1, lp.heat + 0.015 * dt) : Math.max(0.5, lp.heat - 0.003 * dt);
    } else {
      lp.heat = sd < sunBurnR * 3 ? Math.min(1, lp.heat + 0.02 * dt) : Math.max(0, lp.heat - 0.008 * dt);
    }

    survivors.push(lp);
  }
  state.loose = survivors;
};

export const tickBodies = (scaledDt) => {
  const dt = scaledDt / config.SUBSTEPS;
  const bodies = state.bodies;
  const numBodies = bodies.length;
  if (numBodies === 0) return;

  const gravConst = config.GRAV_CONST;
  const sunMass = SUN.mass;
  const sunX = SUN.x;
  const sunY = SUN.y;
  const damping = config.DAMPING;
  const sunGrav = sunGravMult;

  const burnR = SUN.burnRadius;
  const burnZoneR = burnR * 4;
  const burnSq = burnR * burnR;
  const burnZoneSq = burnZoneR * burnZoneR;

  const nAlives = new Array(numBodies);

  for (let sub = 0; sub < config.SUBSTEPS; sub++) {
    // ── PHASE 1: Count alive (first substep only) ──
    if (sub === 0) {
      for (let bi = 0; bi < numBodies; bi++) {
        let n = 0;
        const particles = bodies[bi].particles;
        for (let pi = 0; pi < particles.length; pi++) {
          if (!particles[pi].dead) n++;
        }
        nAlives[bi] = n || 1;
      }
    }

    // ── PHASE 2: Fused gravity + integration + burn ──
    for (let bi = 0; bi < numBodies; bi++) {
      const body = bodies[bi];
      const na = nAlives[bi];
      const particles = body.particles;
      for (let pi = 0; pi < particles.length; pi++) {
        const p = particles[pi];
        if (p.dead) continue;

        // 1. Gravity
        applyGravity(p, na, gravConst, sunMass, sunX, sunY, bodies, sunGrav);

        // 2. Integration (inlined for speed)
        p.vx = (p.vx + (p.fx / p.mass) * dt) * damping;
        p.vy = (p.vy + (p.fy / p.mass) * dt) * damping;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.fx = 0;
        p.fy = 0;

        // 3. Burn zone
        const dx = sunX - p.x, dy = sunY - p.y;
        const sd2 = dx * dx + dy * dy;
        if (sd2 < burnSq) {
          p.dead = true;
          p.heat = 1;
        } else if (sd2 < burnZoneSq) {
          const dist = Math.sqrt(sd2);
          const proximity = 1 - (dist / burnZoneR);
          p.heat = Math.min(1, p.heat + (0.004 + proximity * 0.000035));
          if (p.heat >= 2.0) p.dead = true;
        } else {
          if (p.heat > 0) p.heat = Math.max(0, p.heat - 0.005);
        }
      }
    }

    // ── PHASE 3: Springs ──
    for (let bi = 0; bi < numBodies; bi++) {
      solveSprings(bodies[bi], dt);
    }

    // ── PHASE 4: Inter-body collisions (last substep only) ──
    if (sub === config.SUBSTEPS - 1) interBodyCollisions();
  }

  // ── POST-SUBSTEP: COM, split, filter ──
  for (let bi = 0; bi < numBodies; bi++) {
    updateCOM(bodies[bi]);
  }
  for (let bi = 0; bi < numBodies; bi++) {
    splitDeadParticles(bodies[bi]);
  }

  // Filter dead bodies
  let writeIdx = 0;
  for (let bi = 0; bi < numBodies; bi++) {
    if (!bodies[bi].dead) {
      bodies[writeIdx++] = bodies[bi];
    }
  }
  bodies.length = writeIdx;

  looseVsPlanets();
};
