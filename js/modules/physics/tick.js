/**
 * js/modules/physics/tick.js
 * Prime Module: Main physics tick orchestrator, integration, and gravity.
 */
import { hypot } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state, SUN, sunGravMult } from '../../core/state.js';
import { interBodyCollisions, looseVsPlanets } from './collisions.js';
import { splitDeadParticles } from './creation.js';

export const updateCOM = (body) => {
    let sx = 0, sy = 0, sm = 0;
    for (const p of body.particles) {
        if (p.dead) continue;
        sx += p.x * p.mass; sy += p.y * p.mass; sm += p.mass;
    }
    if (sm > 0) { body.cx = sx / sm; body.cy = sy / sm; body.mass = sm; }
};

export const integrateParticle = (p, dt) => {
    if (p.dead) return;
    const damp = config.DAMPING;
    p.vx = (p.vx + (p.fx / p.mass) * dt) * damp;
    p.vy = (p.vy + (p.fy / p.mass) * dt) * damp;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.fx = 0; p.fy = 0;
};

export const solveSprings = (body, dt) => {
    const { particles: ps, springs: ss } = body;
    for (const sp of ss) {
        if (sp.broken) continue;
        const pa = ps[sp.a], pb = ps[sp.b];
        if (pa.dead || pb.dead) { sp.broken = true; continue; }
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const len = hypot(dx, dy) || 0.001;
        if (len > sp.breakAt) { sp.broken = true; continue; }
        const f = sp.stiff * (len - sp.restLen), nx = dx / len, ny = dy / len;
        const tm = pa.mass + pb.mass;
        pa.vx += nx * f * (pb.mass / tm) * dt; pa.vy += ny * f * (pb.mass / tm) * dt;
        pb.vx -= nx * f * (pa.mass / tm) * dt; pb.vy -= ny * f * (pa.mass / tm) * dt;
    }
};

export const applyGravity = (p, nParticles) => {
    const gm = (p.body && p.body.gravMult != null) ? p.body.gravMult : sunGravMult;
    const sdx = SUN.x - p.x, sdy = SUN.y - p.y;
    const sd2 = sdx * sdx + sdy * sdy, sd = Math.sqrt(sd2) + 0.1;
    const sf = (config.GRAV_CONST * SUN.mass * gm / (sd2 + 500)) / nParticles;
    p.fx += (sdx / sd) * sf * p.mass; p.fy += (sdy / sd) * sf * p.mass;    for (const b of state.bodies) {
        if (p.body === b) continue;
        const dx = b.cx - p.x, dy = b.cy - p.y;
        const d2 = dx * dx + dy * dy, d = Math.sqrt(d2) + 0.1;
        const f = (config.GRAV_CONST * b.mass / (d2 + 300)) / nParticles;
        p.fx += (dx / d) * f * p.mass; p.fy += (dy / d) * f * p.mass;
    }
};

export const tickLoose = (dt) => {
    state.loose = state.loose.filter(p => p.life > 0.02);
    if (state.loose.length > 400) state.loose.splice(0, state.loose.length - 350);
    
    for (const p of state.loose) {
        const sdx = SUN.x - p.x, sdy = SUN.y - p.y;
        const sd2 = sdx * sdx + sdy * sdy, sd = Math.sqrt(sd2) + 0.1;
        const inBurnZone = sd < SUN.burnRadius * 4;
        const inCritical = sd < SUN.burnRadius;
        
        if (!p.isBurnt && p.heat > 0.7 && !inBurnZone) { p.isBurnt = true; p.burnedAt = performance.now(); }
        if (inCritical) { p.life = 0; continue; }
        
        if (p.isBurnt && inBurnZone) {
            p.life -= p.meltRate * dt * 2.5;
            const escapeFactor = p.detachSpeed / 15;
            p.vx += (sdx / sd) * escapeFactor * 0.3 * dt; p.vy += (sdy / sd) * escapeFactor * 0.3 * dt;
        } else if (p.heat > 0.7) {
            p.life -= (p.decay + 0.012) * dt;
        } else if (p.isBurnt) {
            p.life -= p.decay * dt;
        } else {
            p.life -= p.isRing ? p.decay * dt : (p.decay + 0.008) * dt;
        }

        if (p.isBurnt) {
            let nearbyX = 0, nearbyY = 0, nearbyCount = 0;
            for (const other of state.loose) {
                if (other === p || !other.isBurnt) continue;
                const dx = other.x - p.x, dy = other.y - p.y;
                const d = hypot(dx, dy);
                if (d < 80 && d > 0.1) {
                    const influence = (1 - d / 80) * 0.15;
                    nearbyX += (dx / d) * influence; nearbyY += (dy / d) * influence; nearbyCount++;
                }
            }
            if (nearbyCount > 0) { p.vx += (nearbyX / nearbyCount) * dt * 2; p.vy += (nearbyY / nearbyCount) * dt * 2; }
        }

        if (sd < SUN.burnRadius) { p.life = 0; continue; }
        const sf = config.GRAV_CONST * SUN.mass * sunGravMult / (sd2 + 500) * 0.04;        p.vx += sdx / sd * sf * dt; p.vy += sdy / sd * sf * dt;
        for (const b of state.bodies) {
            const dx = b.cx - p.x, dy = b.cy - p.y;
            const d2 = dx * dx + dy * dy, d = Math.sqrt(d2) + 0.1;
            const f = config.GRAV_CONST * b.mass * (p.isRing ? 0.01 : 0.06) / (d2 + 150);
            p.vx += dx / d * f * dt; p.vy += dy / d * f * dt;
        }
        p.vx *= 0.995; p.vy *= 0.995; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.isBurnt) {
            p.heat = sd < SUN.burnRadius * 3 ? Math.min(1, p.heat + 0.015 * dt) : Math.max(0.5, p.heat - 0.003 * dt);
        } else {
            p.heat = sd < SUN.burnRadius * 3 ? Math.min(1, p.heat + 0.02 * dt) : Math.max(0, p.heat - 0.008 * dt);
        }
    }
};

export const tickBodies = (scaledDt) => {
    const dt = scaledDt / config.SUBSTEPS;
    const bodies = state.bodies;
    const burnR = SUN.burnRadius, burnZoneR = burnR * 4;
    const burnSq = burnR * burnR, burnZoneSq = burnZoneR * burnZoneR;
    
    const countAlive = (b) => { let n = 0; for (const p of b.particles) if (!p.dead) n++; return n || 1; };
    const nAlives = bodies.map(b => countAlive(b));

    for (let sub = 0; sub < config.SUBSTEPS; sub++) {
        for (let bi = 0; bi < bodies.length; bi++) {
            const na = nAlives[bi];
            for (const p of bodies[bi].particles) if (!p.dead) applyGravity(p, na);
        }
        for (const body of bodies) for (const p of body.particles) integrateParticle(p, dt);
        for (const body of bodies) solveSprings(body, dt);
        
        for (const body of bodies) {
            for (const p of body.particles) {
                if (p.dead) continue;
                const dx = SUN.x - p.x, dy = SUN.y - p.y;
                const sd2 = dx * dx + dy * dy;
                if (sd2 < burnSq) { p.dead = true; p.heat = 1; }
                else if (sd2 < burnZoneSq) {
                    const dist = Math.sqrt(sd2);
                    const proximity = 1 - (dist / burnZoneR);
                    p.heat = Math.min(1, p.heat + (0.004 + proximity * 0.000035));
                    if (p.heat >= 2.0) p.dead = true;
                } else { if (p.heat > 0) p.heat = Math.max(0, p.heat - 0.005); }
            }
        }
        if (sub === config.SUBSTEPS - 1) interBodyCollisions();
    }
        for (const body of bodies) updateCOM(body);
    for (const body of bodies) splitDeadParticles(body);
    state.bodies = bodies.filter(b => !b.dead);
    looseVsPlanets();
};