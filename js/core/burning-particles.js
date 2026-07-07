/**
 * js/core/burning-particles.js
 * Emit loose particles from burning planets.
 * Particles drift toward heat source (sun or nova), creating jelly melting effect.
 * 
 * DESIGN:
 * - Heat >= 0.5: start emitting
 * - Emission rate scales with heat (hotter = more particles)
 * - Particles inherit planet velocity + random direction
 * - Particles are attracted to heat source (sun/novas)
 * - Burnt particles stay behind as visual trail
 * - Real-time, per-frame, no caching (heat-dependent)
 */

import { hypot } from './math.js';
import { state, SUN } from './state.js';
import { BurnMap } from './burn-map.js';

export const BurningParticles = {
  /**
   * Emit loose particles from a burning body.
   * Call once per physics tick for hot bodies.
   */
  emit: (body, dt) => {
    if (!body || body.dead) return;
    if (!body.heat || body.heat < 0.5) return;  // Only emit when hot enough

    const heat = Math.min(body.heat, 2.0);
    const emitRate = heat * 8;  // Base: 4 particles/tick at heat=0.5, up to 16 at heat=2.0
    const toEmit = Math.floor(emitRate * dt);

    const particles = body.particles;
    if (!particles || particles.length === 0) return;

    // Find hottest spot on planet (closest to sun)
    const dxSun = SUN.x - body.cx;
    const dySun = SUN.y - body.cy;
    const sunDist = hypot(dxSun, dySun);
    const sunDirX = dxSun / (sunDist + 0.1);
    const sunDirY = dySun / (sunDist + 0.1);

    for (let i = 0; i < toEmit; i++) {
      // Pick a random particle from the planet
      const sourceP = particles[Math.floor(Math.random() * particles.length)];
      if (!sourceP || sourceP.dead) continue;

      // Create loose particle at that location
      const loosePi = state.loose.length;
      if (loosePi >= state.vault.length) break;  // Vault full

      const loose = state.vault[loosePi];
      state.loose.push(loose);

      // Jelly physics: inherit planet velocity + drift toward sun
      loose.x = sourceP.x;
      loose.y = sourceP.y;
      loose.mass = 0.3;  // Lighter than planet particles
      loose.dead = false;
      loose.isBurnt = true;  // Mark as burnt
      loose.heat = heat * 0.8;  // Inherit some heat
      loose.pal = sourceP.pal;  // Inherit color
      loose.isRing = false;

      // Velocity: planet drift + outward jelly motion + sun attraction
      const outwardAngle = Math.atan2(loose.y - body.cy, loose.x - body.cx);
      const outwardX = Math.cos(outwardAngle);
      const outwardY = Math.sin(outwardAngle);

      // Mix: planet velocity + outward push + sun drift
      loose.vx = body.vx * 0.7 + outwardX * (2 + heat * 3) + sunDirX * heat * 2;
      loose.vy = body.vy * 0.7 + outwardY * (2 + heat * 3) + sunDirY * heat * 2;

      // Slight randomness for natural jelly effect
      loose.vx += (Math.random() - 0.5) * heat * 2;
      loose.vy += (Math.random() - 0.5) * heat * 2;
    }
  },

  /**
   * Apply heat & sun attraction to burnt particles in real-time.
   * Call during gravity phase.
   */
  updateBurningPhysics: (dt) => {
    const gravConst = 120;
    const sunMass = SUN.mass;
    const sunX = SUN.x;
    const sunY = SUN.y;

    for (let i = 0; i < state.loose.length; i++) {
      const lp = state.loose[i];
      if (!lp.isBurnt) continue;
      if (lp.dead) continue;

      // Sun gravity (stronger for burnt particles — they're being pulled in)
      const dx = sunX - lp.x;
      const dy = sunY - lp.y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) + 0.1;
      const f = (gravConst * sunMass * 0.1) / (d2 + 300);  // Stronger gravity on burnt particles
      lp.vx += (dx / d) * f * dt;
      lp.vy += (dy / d) * f * dt;

      // Heat dissipation — burnt particles cool as they drift
      lp.heat = Math.max(0, lp.heat - 0.01 * dt);

      // Once cool, they're just regular loose particles
      if (lp.heat <= 0) {
        lp.isBurnt = false;
      }

      // Damping (they're melting, so friction increases)
      lp.vx *= 0.992;
      lp.vy *= 0.992;

      // Check if in sun — disintegrate
      if (d < SUN.burnRadius) {
        lp.dead = true;
      }
    }
  }
};
