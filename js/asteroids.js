"use strict";

// ════════════════════════════════════════════════════════════════════════════════
// ASTEROIDS.JS - Asteroid/Comet System
// ════════════════════════════════════════════════════════════════════════════════
// Purpose: Spawn, simulate, and render incoming asteroids.
// Asteroids consist of rock clusters with ionic and dust tails that can collide
// with the sun or planets, creating visual effects and loose debris.
// ════════════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────────────
// Asteroid Spawning
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Spawn a new asteroid/comet approaching the sun.
 * Asteroids are clusters of rocks with physics-based motion.
 */
window.Sim.spawnAsteroid = () => {
  if (H.state.asteroids.length >= H.AST_MAX) return;
  
  // Random spawn position at distance 10-14k from sun
  const spawnR = 10000 + H.rndR(4000, 10000);
  const fromA = H.rnd() * H.PI2;
  const sx = H.SUN.x + Math.cos(fromA) * spawnR;
  const sy = H.SUN.y + Math.sin(fromA) * spawnR;
  
  // Exit point: sun's opposite side (varies to create angled approaches)
  const exitR = spawnR * H.rndR(0.7, 1.2);
  const exitA = fromA + Math.PI + H.rndR(-1.4, 1.4);
  const ex = H.SUN.x + Math.cos(exitA) * exitR;
  const ey = H.SUN.y + Math.sin(exitA) * exitR;
  const aimA = Math.atan2(ey - sy, ex - sx);
  
  // Velocity: straight line toward target
  const speed = H.rndR(25.0, 55.0);
  const cvx = Math.cos(aimA) * speed;
  const cvy = Math.sin(aimA) * speed;
  
  // Visual appearance: random color palette
  const pal = H.AST_PALETTE[Math.floor(H.rnd() * H.AST_PALETTE.length)];
  
  // Rock cluster: 3-9 rocks forming the nucleus
  const nRocks = Math.floor(H.rndR(3, 9));
  const clusterR = H.rndR(8, 28);
  
  const rocks = Array.from({ length: nRocks }, () => {
    const ra = H.rnd() * H.PI2;
    const rd = H.rnd() * clusterR;
    const rr = H.rndR(2, 6);
    return {
      ox: Math.cos(ra) * rd,           // Offset X from cluster center
      oy: Math.sin(ra) * rd,           // Offset Y from cluster center
      dvx: (H.rnd() - 0.5) * 0.015,    // Slow rotation velocity
      dvy: (H.rnd() - 0.5) * 0.015,
      r: rr,                           // Rock radius
      pts: H.makeRockShape(rr),        // Rock shape polygon
      angle: 0                         // Rotation (locked to launch direction)
    };
  });
  
  const mass = rocks.reduce((s, r) => s + r.r * r.r, 0) * 0.2;
  
  // Trail direction: locked opposite to launch vector (never recalculates)
  const trailDirX = -Math.cos(aimA);
  const trailDirY = -Math.sin(aimA);
  
  H.state.asteroids.push({
    x: sx, y: sy,
    vx: cvx, vy: cvy,
    rocks, clusterR, mass, pal,
    trail: [],
    trailLen: 180,
    age: 0,
    spawnAngle: aimA,        // Locked visual angle
    trailDirX: trailDirX,    // Locked trail direction
    trailDirY: trailDirY
  });
};

// ──────────────────────────────────────────────────────────────────────────────
// Asteroid Physics Update
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Update all asteroids: spawn new ones, apply gravity, check collisions.
 * @param {number} dt - Delta time (frame time in seconds)
 */
window.Sim.tickAsteroids = dt => {
  H.state.astTimer++;
  const spawnEvery = Math.max(120, H.AST_SPAWN_INTERVAL / H.physSpeed);
  if (H.state.astTimer >= spawnEvery) {
    H.state.astTimer = 0;
    H.spawnAsteroid();
  }
  
  // Update each asteroid
  for (let ai = H.state.asteroids.length - 1; ai >= 0; ai--) {
    const a = H.state.asteroids[ai];
    a.age++;
    
    // Sun gravity (reduced for near-straight trajectories)
    const sdx = H.SUN.x - a.x, sdy = H.SUN.y - a.y;
    const sd2 = sdx * sdx + sdy * sdy, sd = H.hypot(sdx, sdy) + 0.1;
    
    // Check sun collision (burn)
    if (sd < H.SUN.burnRadius + a.clusterR) {
      H.addNova(a.x, a.y, a.clusterR * 5, "200,180,255");
      H.state.asteroids.splice(ai, 1);
      continue;
    }
    
    const sf = (H.config.GRAV_CONST * H.SUN.mass * H.sunGravMult / (sd2 + 500)) * 0.00004;
    a.vx += sdx / sd * sf * dt;
    a.vy += sdy / sd * sf * dt;
    
    // Check planet collisions
    let hit = false;
    for (const b of H.state.bodies) {
      const dx = b.cx - a.x, dy = b.cy - a.y;
      const d2 = dx * dx + dy * dy, d = H.hypot(dx, dy) + 0.1;
      
      // Planet gravity (minimal deflection)
      const f = H.config.GRAV_CONST * b.mass * 0.005 / (d2 + 200);
      a.vx += dx / d * f * dt;
      a.vy += dy / d * f * dt;
      
      // Collision impact
      if (d < b.radius + a.clusterR * 0.65) {
        const spd = H.hypot(a.vx, a.vy);
        const nx = (b.cx - a.x) / d, ny = (b.cy - a.y) / d;
        
        // Heat and knock back planet particles
        for (const p of b.particles) {
          if (!p.dead && H.hypot(p.x - a.x, p.y - a.y) < b.radius * 0.7) {
            p.heat = Math.min(1, p.heat + spd * 0.05);
            p.vx += nx * spd * a.mass / b.mass * 0.1;
            p.vy += ny * spd * a.mass / b.mass * 0.1;
          }
        }
        
        // Create loose debris from asteroid rocks
        for (const rock of a.rocks) {
          const ra = H.rnd() * H.PI2, rs = H.rndR(0.3, spd * 0.4);
          H.state.loose.push({
            x: a.x + rock.ox, y: a.y + rock.oy,
            vx: a.vx + Math.cos(ra) * rs, vy: a.vy + Math.sin(ra) * rs,
            mass: rock.r * 0.3, pal: { gc: "180,160,140" }, heat: 0.5,
            life: H.rndR(0.6, 1), decay: H.rndR(0.003, 0.008)
          });
        }
        H.addFlash(a.x, a.y, a.clusterR * 5, "180,200,255");
        H.state.asteroids.splice(ai, 1);
        hit = true;
        break;
      }
    }
    if (hit) continue;
    
    // Update position and cluster rotation
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    for (const rock of a.rocks) {
      rock.ox += rock.dvx * dt;
      rock.oy += rock.dvy * dt;
    }
    
    // Trail points
    a.trail.push({ x: a.x, y: a.y });
    if (a.trail.length > a.trailLen) a.trail.shift();
    
    // Remove if too far away
    if (H.hypot(a.x - H.SUN.x, a.y - H.SUN.y) > 32000) {
      H.state.asteroids.splice(ai, 1);
    }
  }
};

// ──────────────────────────────────────────────────���───────────────────────────
// Asteroid Rendering
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Draw all asteroids with ion tail, dust tail, coma, and nucleus.
 */
window.Sim.drawAsteroids = () => {
  const ctx = H.ctx;
  
  for (const a of H.state.asteroids) {
    // Use locked trail direction (never swings or recalculates)
    const tailNx = a.trailDirX;
    const tailNy = a.trailDirY;
    const tailScreenPx = 280;
    const tailWorldLen = tailScreenPx / H.cam.zoom;
    
    ctx.save();
    
    // Ion tail: thin, bright, straight blue-white
    const STEPS = 48;
    for (let i = 1; i <= STEPS; i++) {
      const f0 = (i - 1) / STEPS, f1 = i / STEPS;
      const tx0 = a.x + tailNx * tailWorldLen * f0, ty0 = a.y + tailNy * tailWorldLen * f0;
      const tx1 = a.x + tailNx * tailWorldLen * f1, ty1 = a.y + tailNy * tailWorldLen * f1;
      const ionW = Math.max(0.1 / H.cam.zoom, (1 - f1) * 1.8 / H.cam.zoom);
      ctx.beginPath();
      ctx.moveTo(tx0, ty0);
      ctx.lineTo(tx1, ty1);
      ctx.strokeStyle = `rgba(160,205,255,${(1 - f1) ** 2 * 0.22})`;
      ctx.lineWidth = ionW;
      ctx.lineCap = "round";
      ctx.stroke();
    }
    
    // Dust tail: wider, warm, slight angular offset
    const dustA = Math.atan2(tailNy, tailNx) + 0.13;
    const dnx = Math.cos(dustA), dny = Math.sin(dustA);
    const dustLen = tailWorldLen * 0.75;
    for (let i = 1; i <= 32; i++) {
      const f0 = (i - 1) / 32, f1 = i / 32;
      const tx0 = a.x + dnx * dustLen * f0, ty0 = a.y + dny * dustLen * f0;
      const tx1 = a.x + dnx * dustLen * f1, ty1 = a.y + dny * dustLen * f1;
      const dw = Math.max(0.1 / H.cam.zoom, (1 - f1) * 3.5 / H.cam.zoom);
      ctx.beginPath();
      ctx.moveTo(tx0, ty0);
      ctx.lineTo(tx1, ty1);
      ctx.strokeStyle = `rgba(220,200,155,${(1 - f1) ** 2 * 0.14})`;
      ctx.lineWidth = dw;
      ctx.lineCap = "round";
      ctx.stroke();
    }
    ctx.restore();
    
    // Coma: fuzzy envelope around nucleus
    const comaScreenR = 18;
    const comaR = comaScreenR / H.cam.zoom;
    const coma = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, comaR);
    coma.addColorStop(0, "rgba(210,228,255,0.28)");
    coma.addColorStop(0.5, "rgba(180,210,255,0.10)");
    coma.addColorStop(1, "rgba(140,180,255,0)");
    ctx.fillStyle = coma;
    ctx.beginPath();
    ctx.arc(a.x, a.y, comaR, 0, H.PI2);
    ctx.fill();
    
    // Nucleus rocks: locked visual rotation based on spawn angle
    for (const rock of a.rocks) {
      const wx = a.x + rock.ox, wy = a.y + rock.oy;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(rock.angle + a.spawnAngle);
      ctx.beginPath();
      ctx.moveTo(rock.pts[0][0], rock.pts[0][1]);
      for (let i = 1; i < rock.pts.length; i++) ctx.lineTo(rock.pts[i][0], rock.pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = a.pal.fill;
      ctx.strokeStyle = a.pal.outline;
      ctx.lineWidth = 0.6 / H.cam.zoom;
      ctx.fill();
      ctx.stroke();
      // Highlight dot
      ctx.beginPath();
      ctx.arc(-rock.r * 0.22, -rock.r * 0.22, Math.max(0.3 / H.cam.zoom, rock.r * 0.18), 0, H.PI2);
      ctx.fillStyle = "rgba(240,240,255,0.45)";
      ctx.fill();
      ctx.restore();
    }
  }
};
