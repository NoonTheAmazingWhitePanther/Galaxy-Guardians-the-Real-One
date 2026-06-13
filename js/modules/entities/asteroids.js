/**
 * js/modules/entities/asteroids.js
 * Asteroid spawner + physics. Asteroids drift toward the sun and damage planets.
 *
 * FIXES (2026-06-13):
 * - astTimer now increments by physSpeed per tick for linear spawn scaling
 * - Asteroid physics uses the passed dt (already scaled by physSpeed from main.js)
 */
import { state, SUN, sunGravMult, physSpeed, AST_SPAWN_INTERVAL, AST_MAX, AST_PALETTE } from '../../core/state.js';
import { hypot, clamp } from '../../core/math.js';

export const AsteroidsModule = {
  tick: (dt) => {
    // Increment timer by physSpeed for linear spawn scaling
    // (tick() is called once per physics step, so we scale by physSpeed)
    state.astTimer += physSpeed;
    const spawnEvery = Math.max(120, AST_SPAWN_INTERVAL / (physSpeed || 1));
    if (state.astTimer >= spawnEvery) {
      state.astTimer = 0;
      AsteroidsModule.spawnAsteroid();
    }

    const G = 0.8;
    const sunR = SUN.radius;
    const burnR = sunR * 1.8;

    for (let i = state.asteroids.length - 1; i >= 0; i--) {
      const a = state.asteroids[i];
      const sdx = -a.x, sdy = -a.y;
      const sd = hypot(sdx, sdy);

      // Sun gravity
      if (sd > sunR) {
        const sf = (G * SUN.mass * sunGravMult) / (sd * sd);
        a.vx += sdx / sd * sf * dt;
        a.vy += sdy / sd * sf * dt;
      }

      // Burn zone
      if (sd < burnR) {
        a.health -= 0.015 * (burnR / Math.max(sd, sunR));
      }

      // Move
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.angle += a.rotSpeed * dt;

      // Planet collision
      for (const body of state.bodies) {
        for (const p of body.particles) {
          if (p.dead) continue;
          const ddx = a.x - p.x, ddy = a.y - p.y;
          const d = hypot(ddx, ddy);
          if (d < a.radius + p.radius) {
            p.dead = true;
            a.health -= 25;
            state.flashes.push({ x: a.x, y: a.y, r: a.radius * 2, t: 0, life: 10, color: AST_PALETTE[a.type] });
          }
        }
      }

      // Sun collision or death
      if (sd < sunR || a.health <= 0) {
        state.flashes.push({ x: a.x, y: a.y, r: a.radius * 3, t: 0, life: 15, color: AST_PALETTE[a.type] });
        state.asteroids.splice(i, 1);
      }
    }
  },

  spawnAsteroid: () => {
    if (state.asteroids.length >= AST_MAX) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = 900 + Math.random() * 600;
    const type = Math.floor(Math.random() * 3);
    const baseR = [5, 8, 12][type];
    const radius = baseR + Math.random() * 4;
    const speed = 0.3 + Math.random() * 0.6;
    const vx = -Math.cos(angle) * speed;
    const vy = -Math.sin(angle) * speed;

    state.asteroids.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      vx, vy,
      radius,
      health: radius * 6,
      type,
      angle: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.04,
      id: `ast_${Date.now()}_${Math.random().toString(36).slice(2)}`
    });
  }
};