"use strict";

// ── Helper: create a single rock for an asteroid cluster ──
function createRock(clusterR) {
  const ra = H.rnd() * H.PI2, rd = H.rnd() * clusterR, rr = H.rndR(2, 6);
  return {
    ox: Math.cos(ra) * rd,
    oy: Math.sin(ra) * rd,
    dvx: (H.rnd() - 0.5) * 0.015,
    dvy: (H.rnd() - 0.5) * 0.015,
    r: rr,
    pts: H.makeRockShape(rr),
    angle: 0
  };
}

// ── Comet spawning ────────────────────────────────────
window.Sim.spawnAsteroid = () => {
  if (H.state.asteroids.length >= H.AST_MAX) return;
  
  const spawnR = 10000 + H.rndR(4000, 10000);
  const fromA = H.rnd() * H.PI2;
  const sx = H.SUN.x + Math.cos(fromA) * spawnR;
  const sy = H.SUN.y + Math.sin(fromA) * spawnR;
  
  const exitR = spawnR * H.rndR(0.7, 1.2);
  const exitA = fromA + Math.PI + H.rndR(-1.4, 1.4);
  const ex = H.SUN.x + Math.cos(exitA) * exitR;
  const ey = H.SUN.y + Math.sin(exitA) * exitR;
  const aimA = Math.atan2(ey - sy, ex - sx);
  
  // Faster comets: shoot in straight lines
  const speed = H.rndR(25.0, 55.0);
  const cvx = Math.cos(aimA) * speed;
  const cvy = Math.sin(aimA) * speed;
  
  const pal = H.AST_PALETTE[Math.floor(H.rnd() * H.AST_PALETTE.length)];
  const nRocks = Math.floor(H.rndR(3, 9));
  const clusterR = H.rndR(8, 28);
  
  const rocks = Array.from({ length: nRocks }, () => createRock(clusterR));
  
  const mass = rocks.reduce((s, r) => s + r.r * r.r, 0) * 0.2;
  
  // Lock trail direction to initial launch vector (points straight backwards)
  const trailDirX = -Math.cos(aimA);
  const trailDirY = -Math.sin(aimA);

  H.state.asteroids.push({
    id: H.IdRegistry.next('asteroid'),
    x: sx, y: sy, vx: cvx, vy: cvy,
    rocks, clusterR, mass, pal,
    trail: [], trailLen: 180, age: 0,
    spawnAngle: aimA,      // Locked visual angle
    trailDirX: trailDirX,  // Locked trail direction
    trailDirY: trailDirY,
  });
};

// ═════════════════════════════════════════════════════════
//  Per‑iteration helpers for tickAsteroids
// ═════════════════════════════════════════════════════════

// Update one particle during a comet–planet collision
function updateParticleInCollision(p, a, b, spd, nx, ny) {
  if (!p.dead && H.hypot(p.x - a.x, p.y - a.y) < b.radius * 0.7) {
    p.heat = Math.min(1, p.heat + spd * 0.05);
    p.vx += nx * spd * a.mass / b.mass * 0.1;
    p.vy += ny * spd * a.mass / b.mass * 0.1;
  }
}

// Create one loose particle when a comet rock hits a planet
function addLooseFromRock(rock, a, spd) {
  const ra = H.rnd() * H.PI2, rs = H.rndR(0.3, spd * 0.4);
  H.state.loose.push({
    x: a.x + rock.ox, y: a.y + rock.oy,
    vx: a.vx + Math.cos(ra) * rs, vy: a.vy + Math.sin(ra) * rs,
    mass: rock.r * 0.3, pal: { gc: "180,160,140" }, heat: 0.5,
    life: H.rndR(0.6, 1), decay: H.rndR(0.003, 0.008)
  });
}

// Process a single body (planet) interaction for one asteroid.
// Returns true if a collision happened (asteroid is destroyed).
function processBodyForAsteroid(a, b, dt) {
  const dx = b.cx - a.x, dy = b.cy - a.y;
  const d2 = dx * dx + dy * dy, d = H.hypot(dx, dy) + 0.1;

  // Reduced planet gravity
  const f = H.config.GRAV_CONST * b.mass * 0.005 / (d2 + 200);
  a.vx += dx / d * f * dt;
  a.vy += dy / d * f * dt;

  if (d < b.radius + a.clusterR * 0.65) {
    const spd = H.hypot(a.vx, a.vy);
    const nx = (b.cx - a.x) / d, ny = (b.cy - a.y) / d;

    // Loop over planet particles → calls function per particle
    for (const p of b.particles) {
      updateParticleInCollision(p, a, b, spd, nx, ny);
    }

    // Loop over asteroid rocks → calls function per rock
    for (const rock of a.rocks) {
      addLooseFromRock(rock, a, spd);
    }

    H.addFlash(a.x, a.y, a.clusterR * 5, "180,200,255");
    return true; // collision happened
  }
  return false;
}

// Apply a single tick of rock offset drift
function updateRockOffset(rock, dt) {
  rock.ox += rock.dvx * dt;
  rock.oy += rock.dvy * dt;
}

// Entire processing of one asteroid within the main tick loop.
function processAsteroidIteration(ai, dt) {
  const a = H.state.asteroids[ai];
  a.age++;

  const sdx = H.SUN.x - a.x, sdy = H.SUN.y - a.y;
  const sd2 = sdx * sdx + sdy * sdy, sd = H.hypot(sdx, sdy) + 0.1;

  if (sd < H.SUN.burnRadius + a.clusterR) {
    H.addNova(a.x, a.y, a.clusterR * 5, "200,180,255");
    H.state.asteroids.splice(ai, 1);
    return; // asteroid destroyed, nothing more to do
  }

  // Sun gravity
  const sf = (H.config.GRAV_CONST * H.SUN.mass * H.sunGravMult / (sd2 + 500)) * 0.00004;
  a.vx += sdx / sd * sf * dt;
  a.vy += sdy / sd * sf * dt;

  // Body interactions – loop calls a function for each body
  for (const b of H.state.bodies) {
    const hit = processBodyForAsteroid(a, b, dt);
    if (hit) {
      // The function already added flash & loose rocks; now remove asteroid
      H.state.asteroids.splice(ai, 1);
      return; // skip rest of this asteroid's update
    }
  }

  // Movement
  a.x += a.vx * dt;
  a.y += a.vy * dt;

  // Update rock offsets – loop calls function per rock
  for (const rock of a.rocks) {
    updateRockOffset(rock, dt);
  }

  // Trail
  a.trail.push({ x: a.x, y: a.y });
  if (a.trail.length > a.trailLen) a.trail.shift();

  // Too far from sun
  if (H.hypot(a.x - H.SUN.x, a.y - H.SUN.y) > 32000) {
    H.state.asteroids.splice(ai, 1);
  }
}

// ── Comet physics tick ────────────────────────────────
window.Sim.tickAsteroids = dt => {
  H.state.astTimer++;
  const spawnEvery = Math.max(120, H.AST_SPAWN_INTERVAL / H.physSpeed);
  if (H.state.astTimer >= spawnEvery) {
    H.state.astTimer = 0;
    H.spawnAsteroid();
  }

  // Main asteroid loop – only calls one function per asteroid
  for (let ai = H.state.asteroids.length - 1; ai >= 0; ai--) {
    processAsteroidIteration(ai, dt);
  }
};

// ═════════════════════════════════════════════════════════
//  Per‑step helpers for drawAsteroids
// ═════════════════════════════════════════════════════════

// Draw one segment of the ion tail
function drawIonTailStep(i, STEPS, a, tailNx, tailNy, tailWorldLen) {
  const f0 = (i - 1) / STEPS, f1 = i / STEPS;
  const tx0 = a.x + tailNx * tailWorldLen * f0, ty0 = a.y + tailNy * tailWorldLen * f0;
  const tx1 = a.x + tailNx * tailWorldLen * f1, ty1 = a.y + tailNy * tailWorldLen * f1;
  const ionW = Math.max(0.1 / H.cam.zoom, (1 - f1) * 1.8 / H.cam.zoom);
  H.ctx.beginPath(); H.ctx.moveTo(tx0, ty0); H.ctx.lineTo(tx1, ty1);
  H.ctx.strokeStyle = `rgba(160,205,255,${(1 - f1) ** 2 * 0.22})`;
  H.ctx.lineWidth = ionW; H.ctx.lineCap = "round"; H.ctx.stroke();
}

// Draw one segment of the dust tail
function drawDustTailStep(i, a, dnx, dny, dustLen) {
  const f0 = (i - 1) / 32, f1 = i / 32;
  const tx0 = a.x + dnx * dustLen * f0, ty0 = a.y + dny * dustLen * f0;
  const tx1 = a.x + dnx * dustLen * f1, ty1 = a.y + dny * dustLen * f1;
  const dw = Math.max(0.1 / H.cam.zoom, (1 - f1) * 3.5 / H.cam.zoom);
  H.ctx.beginPath(); H.ctx.moveTo(tx0, ty0); H.ctx.lineTo(tx1, ty1);
  H.ctx.strokeStyle = `rgba(220,200,155,${(1 - f1) ** 2 * 0.14})`;
  H.ctx.lineWidth = dw; H.ctx.lineCap = "round"; H.ctx.stroke();
}

// Draw one line segment of a rock's outline
function rockOutlineLineTo(point) {
  H.ctx.lineTo(point[0], point[1]);
}

// Draw a single nucleus rock
function drawRock(rock, a) {
  const wx = a.x + rock.ox, wy = a.y + rock.oy;
  H.ctx.save();
  H.ctx.translate(wx, wy);
  H.ctx.rotate(rock.angle + a.spawnAngle);
  H.ctx.beginPath();
  H.ctx.moveTo(rock.pts[0][0], rock.pts[0][1]);

  // Outline loop – calls function for each point
  for (let i = 1; i < rock.pts.length; i++) {
    rockOutlineLineTo(rock.pts[i]);
  }

  H.ctx.closePath();
  H.ctx.fillStyle = a.pal.fill;
  H.ctx.strokeStyle = a.pal.outline;
  H.ctx.lineWidth = 0.6 / H.cam.zoom;
  H.ctx.fill(); H.ctx.stroke();
  H.ctx.beginPath();
  H.ctx.arc(-rock.r * 0.22, -rock.r * 0.22, Math.max(0.3 / H.cam.zoom, rock.r * 0.18), 0, H.PI2);
  H.ctx.fillStyle = "rgba(240,240,255,0.45)"; H.ctx.fill();
  H.ctx.restore();
}

// Entire drawing of a single asteroid
function drawAsteroid(a) {
  const tailNx = a.trailDirX;
  const tailNy = a.trailDirY;
  const tailScreenPx = 140;
  const tailWorldLen = tailScreenPx / H.cam.zoom;

  H.ctx.save();

  // Ion tail – loop calls function per step
  const STEPS = 24;
  for (let i = 1; i <= STEPS; i++) {
    drawIonTailStep(i, STEPS, a, tailNx, tailNy, tailWorldLen);
  }

  // Dust tail
  const dustA = Math.atan2(tailNy, tailNx) + 0.13;
  const dnx = Math.cos(dustA), dny = Math.sin(dustA);
  const dustLen = tailWorldLen * 0.75;
  for (let i = 1; i <= 32; i++) {
    drawDustTailStep(i, a, dnx, dny, dustLen);
  }

  H.ctx.restore();

  // Coma
  const comaScreenR = 18;
  const comaR = comaScreenR / H.cam.zoom;
  const coma = H.ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, comaR);
  coma.addColorStop(0, "rgba(210,228,255,0.28)");
  coma.addColorStop(0.5, "rgba(180,210,255,0.10)");
  coma.addColorStop(1, "rgba(140,180,255,0)");
  H.ctx.fillStyle = coma;
  H.ctx.beginPath(); H.ctx.arc(a.x, a.y, comaR, 0, H.PI2); H.ctx.fill();

  // Nucleus rocks – loop calls function per rock
  for (const rock of a.rocks) {
    drawRock(rock, a);
  }
}

// ── Comet rendering (via QueOps) ──────────────────────
window.Sim.drawAsteroids = () => {
  for (const a of H.state.asteroids) {
    // Assign a permanent ID if missing (safety – should not happen)
    if (!a.id) a.id = H.IdRegistry.next('asteroid');

    window.QueOps.removeById(a.id);
    window.QueOps.add({
      id: a.id,
      subject: 'rendering',
      fn: drawAsteroid,
      args: [a],
      cost: 1,
      priority: 30,
      delayMs: 0
    });
  }
};