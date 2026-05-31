"use strict";

// ════════════════════════════════════════════════════════════════════
// PHYSICS.JS - Physics Engine & Body Dynamics
// ════════════════════════════════════════════════════════════════════

window.Sim.makeParticle = (x, y, mass, pal, isCore) => ({
  x, y, vx: 0, vy: 0, fx: 0, fy: 0, mass: mass || 1, pal, isCore: !!isCore, body: null, dead: false, heat: 0
});

window.Sim.makeSpring = (a, b, restLen, stiff, breakAt) => ({
  a, b, restLen, stiff: stiff || window.Sim.config.SPRING_K, breakAt: breakAt || (restLen * window.Sim.config.BREAK_MULT), broken: false
});

// ────────────────────────────────────────────────────────────────────
// Planet Construction
// ────────────────────────────────────────────────────────────────────

window.Sim.makeBody = (cx, cy, radius, pal) => {
  const particles = [], springs = [], grid = {};
  const spacing = window.Sim.config.PARTICLE_R * 1.82;
  const rows = Math.ceil(radius / spacing) * 2 + 1, cols = rows;
  const ox = cx - (cols - 1) * spacing * 0.5, oy = cy - (rows - 1) * spacing * 0.5;

  // ── Particle creation ──────────────────────────────────────────────
  const createParticleInGrid = (row, col) => {
    const px = ox + col * spacing + (row % 2) * 0.5 * spacing, py = oy + row * spacing;
    const dx = px - cx, dy = py - cy;
    if (H.hypot(dx, dy) > radius + spacing * 0.3) return;
    const p = window.Sim.makeParticle(px, py, 1, pal, H.hypot(dx, dy) < radius * 0.3);
    grid[`${col},${row}`] = particles.length;
    particles.push(p);
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      createParticleInGrid(row, col);
    }
  }

  // ── Spring connection ─────────────────────────────────────────────
  const dirs = [[1, 0], [0, 1], [1, 1], [-1, 1], [2, 0], [0, 2]];
  const seen = new Set();

  const connectSpringsFromCell = (row, col) => {
    const ai = grid[`${col},${row}`];
    if (ai === undefined) return;
    const processDir = ([dc, dr]) => {
      const bi = grid[`${col + dc},${row + dr}`];
      if (bi === undefined) return;
      const key = ai < bi ? `${ai}-${bi}` : `${bi}-${ai}`;
      if (seen.has(key)) return;
      seen.add(key);
      const pa = particles[ai], pb = particles[bi];
      const len = H.hypot(pb.x - pa.x, pb.y - pa.y);
      const isDirect = len < spacing * 1.2;
      springs.push(window.Sim.makeSpring(ai, bi, len,
        isDirect ? window.Sim.config.SPRING_K : window.Sim.config.SPRING_K * 0.6,
        isDirect ? len * window.Sim.config.BREAK_MULT : len * window.Sim.config.BREAK_MULT * 0.8));
    };
    for (const dir of dirs) {
      processDir(dir);
    }
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      connectSpringsFromCell(row, col);
    }
  }

  // ── Mass assignment ──────────────────────────────────────────────
  const assignMassToParticle = (p) => {
    p.mass = H.lerp(2.0, 0.6, H.hypot(p.x - cx, p.y - cy) / radius);
  };
  for (const p of particles) {
    assignMassToParticle(p);
  }

  // ── Build body object ────────────────────────────────────────────
  const body = { particles, springs, pal, cx, cy, mass: 0, radius, dead: false, gravMult: window.Sim.sunGravMult };
  let tm = 0;
  const assignBodyToParticle = (p) => {
    p.body = body;
    tm += p.mass;
  };
  for (const p of particles) {
    assignBodyToParticle(p);
  }
  body.mass = tm;
  return body;
};

// ────────────────────────────────────────────────────────────────────
// Physics Calculations
// ────────────────────────────────────────────────────────────────────

window.Sim.updateCOM = body => {
  let sx = 0, sy = 0, sm = 0;
  const accumulateCOM = (p) => {
    if (p.dead) return;
    sx += p.x * p.mass;
    sy += p.y * p.mass;
    sm += p.mass;
  };
  for (const p of body.particles) {
    accumulateCOM(p);
  }
  if (sm > 0) { body.cx = sx / sm; body.cy = sy / sm; body.mass = sm; }
};

window.Sim.integrateParticle = (p, dt) => {
  if (p.dead) return;
  const damp = window.Sim.config.DAMPING;
  p.vx = (p.vx + (p.fx / p.mass) * dt) * damp;
  p.vy = (p.vy + (p.fy / p.mass) * dt) * damp;
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.fx = 0; p.fy = 0;
};

window.Sim.solveSprings = (body, dt) => {
  const { particles: ps, springs: ss } = body;
  const solveOneSpring = (sp) => {
    if (sp.broken) return;
    const pa = ps[sp.a], pb = ps[sp.b];
    if (pa.dead || pb.dead) { sp.broken = true; return; }
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const len = H.hypot(dx, dy) || 0.001;
    if (len > sp.breakAt) { sp.broken = true; return; }
    const f = sp.stiff * (len - sp.restLen), nx = dx / len, ny = dy / len;
    const tm = pa.mass + pb.mass;
    pa.vx += nx * f * (pb.mass / tm) * dt;
    pa.vy += ny * f * (pb.mass / tm) * dt;
    pb.vx -= nx * f * (pa.mass / tm) * dt;
    pb.vy -= ny * f * (pa.mass / tm) * dt;
  };
  for (const sp of ss) {
    solveOneSpring(sp);
  }
};

window.Sim.applyGravity = (p, nParticles) => {
  const gm = (p.body && p.body.gravMult != null) ? p.body.gravMult : window.Sim.sunGravMult;
  const sdx = window.Sim.SUN.x - p.x, sdy = window.Sim.SUN.y - p.y;
  const sd2 = sdx * sdx + sdy * sdy, sd = Math.sqrt(sd2) + 0.1;
  const sf = (window.Sim.config.GRAV_CONST * window.Sim.SUN.mass * gm / (sd2 + 500)) / nParticles;
  p.fx += (sdx / sd) * sf * p.mass;
  p.fy += (sdy / sd) * sf * p.mass;

  const applyBodyGravityToParticle = (b) => {
    if (p.body === b) return;
    const dx = b.cx - p.x, dy = b.cy - p.y;
    const d2 = dx * dx + dy * dy, d = Math.sqrt(d2) + 0.1;
    const f = (window.Sim.config.GRAV_CONST * b.mass / (d2 + 300)) / nParticles;
    p.fx += (dx / d) * f * p.mass;
    p.fy += (dy / d) * f * p.mass;
  };
  for (const b of window.Sim.state.bodies) {
    applyBodyGravityToParticle(b);
  }
};

// ────────────────────────────────────────────────────────────────────
// Inter-Body Collisions
// ────────────────────────────────────────────────────────────────────

window.Sim.interBodyCollisions = () => {
  const H = window.Sim;
  const bodies = H.state.bodies;

  const processBodyPair = (bi, bj) => {
    const A = bodies[bi], B = bodies[bj];
    const cdx = A.cx - B.cx, cdy = A.cy - B.cy;
    const cd2 = cdx * cdx + cdy * cdy;
    const thresh = A.radius + B.radius + H.config.COLLISION_R * 4;
    if (cd2 > thresh * thresh) return;

    const cellSize = H.config.COLLISION_R * 2;
    const grid = new Map();

    const addParticleToGrid = (p, tag) => {
      const cx = Math.floor(p.x / cellSize), cy = Math.floor(p.y / cellSize);
      const key = cx + "," + cy;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ p, tag });
    };

    // Populate grid
    for (const p of A.particles) if (!p.dead) { addParticleToGrid(p, 0); }
    for (const p of B.particles) if (!p.dead) { addParticleToGrid(p, 1); }

    const processCollisionCell = (cell) => {
      // Check if both tags present
      let hasA = false, hasB = false;
      const checkTagPresence = (e) => {
        if (e.tag === 0) hasA = true;
        else hasB = true;
        if (hasA && hasB) return true; // signal to break
      };
      for (const e of cell) {
        if (checkTagPresence(e)) break;
      }
      if (!hasA || !hasB) return;

      const resolveParticlePair = (pa, pb) => {
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= H.config.COLLISION_R * H.config.COLLISION_R) return;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, ny = dy / d;
        const ov = H.config.COLLISION_R - d;
        const ma = pa.mass, mb = pb.mass, mt = ma + mb;
        pa.x -= nx * ov * (mb / mt); pa.y -= ny * ov * (mb / mt);
        pb.x += nx * ov * (ma / mt); pb.y += ny * ov * (ma / mt);

        const vn = (pa.vx - pb.vx) * nx + (pa.vy - pb.vy) * ny;
        if (vn < 0) {
          const j = -(1 + 0.35) * vn / (1 / ma + 1 / mb);
          pa.vx += j * nx / ma; pa.vy += j * ny / ma;
          pb.vx -= j * nx / mb; pb.vy -= j * ny / mb;
          const heatGain = Math.min(0.4, Math.abs(vn) * 0.12);
          pa.heat = H.clamp(pa.heat + heatGain, 0, 1);
          pb.heat = H.clamp(pb.heat + heatGain, 0, 1);
        }
      };

      const processEa = (ea) => {
        if (ea.tag !== 0) return;
        const pa = ea.p;
        const collideWithEb = (eb) => {
          if (eb.tag !== 1) return;
          resolveParticlePair(pa, eb.p);
        };
        for (const eb of cell) {
          collideWithEb(eb);
        }
      };

      for (const ea of cell) {
        processEa(ea);
      }
    };

    for (const cell of grid.values()) {
      processCollisionCell(cell);
    }
  };

  for (let bi = 0; bi < bodies.length; bi++) {
    for (let bj = bi + 1; bj < bodies.length; bj++) {
      processBodyPair(bi, bj);
    }
  }
};

// ────────────────────────────────────────────────────────────────────
// Spawn Ring
// ────────────────────────────────────────────────────────────────────

window.Sim.spawnRing = body => {
  const rx = body.cx, ry = body.cy;
  const dist = H.hypot(rx - window.Sim.SUN.x, ry - window.Sim.SUN.y) || 1;
  const ringW = body.radius * 0.6;
  window.Sim.addFlash(rx, ry, body.radius * 4, body.pal.gc);
  window.Sim.addNova(rx, ry, body.radius * 3, body.pal.gc);

  const spawnOneRingParticle = (i) => {
    const angle = (H.PI2 / window.Sim.RING_PARTICLES) * i + H.rndR(-0.05, 0.05);
    const r = dist + H.rndR(-ringW, ringW);
    const px = window.Sim.SUN.x + Math.cos(angle) * r, py = window.Sim.SUN.y + Math.sin(angle) * r;
    const gmLocal = window.Sim.config.GRAV_CONST * window.Sim.SUN.mass * (body.gravMult || window.Sim.sunGravMult);
    const vLocal = Math.sqrt(gmLocal / Math.max(r, 1));
    const scatter = H.rndR(0.96, 1.04);
    window.Sim.state.loose.push({ 
      x: px, y: py, 
      vx: -Math.sin(angle) * vLocal * scatter, vy: Math.cos(angle) * vLocal * scatter, 
      mass: H.rndR(0.4, 1.2), pal: body.pal, heat: H.rndR(0.3, 0.8), 
      life: H.rndR(4, 8), decay: H.rndR(0.003, 0.006), isRing: true,
      isBurnt: false, burnedAt: 0, meltRate: H.rndR(0.003, 0.008),
      detachSpeed: H.rndR(8, 16), birthTime: performance.now() 
    });
  };

  for (let i = 0; i < window.Sim.RING_PARTICLES; i++) {
    spawnOneRingParticle(i);
  }
};

// ────────────────────────────────────────────────────────────────────
// Split Dead Particles
// ────────────────────────────────────────────────────────────────────

window.Sim.splitDeadParticles = body => {
  const H = window.Sim;
  const { particles: ps, springs: ss } = body;
  const n = ps.length; if (!n) return;

  const adj = Array.from({ length: n }, () => []);

  const processSpringAdjacency = (sp) => {
    if (!sp.broken && !ps[sp.a].dead && !ps[sp.b].dead) {
      adj[sp.a].push(sp.b);
      adj[sp.b].push(sp.a);
    }
  };
  for (const sp of ss) {
    processSpringAdjacency(sp);
  }

  const vis = new Uint8Array(n);
  let seed = -1;
  for (let i = 0; i < n; i++) {
    if (!ps[i].dead) { seed = i; break; }
  }
  if (seed === -1) return;

  const q = [seed]; vis[seed] = 1;
  const processBFSNode = (c) => {
    const visitNeighbor = (nb) => {
      if (!vis[nb]) { vis[nb] = 1; q.push(nb); }
    };
    for (const nb of adj[c]) {
      visitNeighbor(nb);
    }
  };
  while (q.length) {
    const c = q.shift();
    processBFSNode(c);
  }

  let alive = 0, debrisCount = 0;
  const MAX_DEBRIS = 15;

  const handleDisconnectedParticle = (i) => {
    const p = ps[i];
    if (p.dead) return;
    if (!vis[i]) {
      if (debrisCount < MAX_DEBRIS && H.state.loose.length < 350) {
        H.state.loose.push({
          x: p.x, y: p.y, vx: p.vx, vy: p.vy,
          mass: p.mass, pal: p.pal, heat: p.heat,
          life: 1, decay: H.rndR(0.004, 0.008),
          isBurnt: false, burnedAt: 0,
          meltRate: H.rndR(0.003, 0.008),
          detachSpeed: H.rndR(8, 16),
          birthTime: performance.now()
        });
        debrisCount++;
      }
      p.dead = true;
    } else {
      alive++;
    }
  };

  for (let i = 0; i < n; i++) {
    handleDisconnectedParticle(i);
  }

  if (alive < Math.max(3, n * 0.08)) {
    const remaining = n - debrisCount;
    if (remaining > 0 && H.state.loose.length < 365) {
      const burst = Math.min(MAX_DEBRIS - debrisCount, remaining);
      const spawnBurstDebris = (i) => {
        H.state.loose.push({
          x: ps[i].x, y: ps[i].y,
          vx: ps[i].vx, vy: ps[i].vy,
          mass: ps[i].mass, pal: ps[i].pal,
          heat: 1, life: 0.6, decay: H.rndR(0.005, 0.01),
          isBurnt: false, burnedAt: 0,
          meltRate: H.rndR(0.005, 0.012),
          detachSpeed: H.rndR(12, 22),
          birthTime: performance.now()
        });
      };
      for (let i = 0; i < burst; i++) {
        spawnBurstDebris(i);
      }
    }
    if (body.radius >= H.RING_MIN_RADIUS) H.spawnRing(body);
    body.dead = true;
  }
};

// ────────────────────────────────────────────────────────────────────
// Loose vs Planets
// ────────────────────────────────────────────────────────────────────

window.Sim.looseVsPlanets = () => {
  const H = window.Sim;
  const MAX_CHECKS = 250;
  const looseArr = H.state.loose;
  const step = looseArr.length > MAX_CHECKS ? Math.floor(looseArr.length / MAX_CHECKS) : 1;

  const processLooseParticle = (li) => {
    const lp = looseArr[li];
    if (lp.life <= 0.1) return;

    const collideWithBody = (body) => {
      const bdx = body.cx - lp.x, bdy = body.cy - lp.y;
      const bd2 = bdx*bdx + bdy*bdy;
      const thresh = body.radius + H.config.LOOSE_HIT_R * 2.5;
      if (bd2 > thresh*thresh) return false;

      // Find nearest surface particle
      let nearP = null, nearD2 = Infinity;
      const findNearest = (bp) => {
        if (bp.dead) return;
        const d2 = (bp.x-lp.x)**2 + (bp.y-lp.y)**2;
        if (d2 < nearD2) { nearD2 = d2; nearP = bp; }
      };
      for (const bp of body.particles) { findNearest(bp); }

      const nearD = Math.sqrt(nearD2);
      if (!nearP || nearD > H.config.LOOSE_HIT_R * 1.5) return false;

      const dx = nearP.x - lp.x, dy = nearP.y - lp.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const nx = dx/d, ny = dy/d;
      const vn = (lp.vx - nearP.vx)*nx + (lp.vy - nearP.vy)*ny;

      if (Math.abs(vn) < 1.5) {
        nearP.vx += lp.vx * lp.mass / nearP.mass * 0.5;
        nearP.vy += lp.vy * lp.mass / nearP.mass * 0.5;
        nearP.heat = Math.min(1, nearP.heat + 0.4);
        lp.life = 0;
        if (lp.heat > 0.4) H.addFlash(lp.x, lp.y, 3, '255,180,80');
        return true; // collision absorbed
      } else if (vn > 0) {
        lp.x -= nx * (H.config.LOOSE_HIT_R - nearD) * 0.95;
        lp.y -= ny * (H.config.LOOSE_HIT_R - nearD) * 0.95;
        const ma = lp.mass, mb = nearP.mass;
        const j = -(1 + 0.45) * vn / (1/ma + 1/mb);
        lp.vx -= j*nx/ma; lp.vy -= j*ny/ma;
        nearP.vx += j*nx/mb; nearP.vy += j*ny/mb;
        const h = H.clamp(Math.abs(vn)*0.12, 0, 1);
        lp.heat = Math.min(1, lp.heat + h);
        nearP.heat = Math.min(1, nearP.heat + h);
        if (Math.abs(vn) > 3 && looseArr.length < 380) {
          const spawnSpark = (k) => {
            const a = Math.atan2(-ny,-nx) + (H.rnd()-0.5)*1.0;
            const s = H.rnd() * Math.abs(vn)*0.25 + 0.2;
            looseArr.push({
              x: lp.x, y: lp.y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
              mass: lp.mass*0.08, pal: lp.pal, heat:0.9, life:0.3, decay:0.06,
              isBurnt: false, burnedAt: 0,
              meltRate: H.rndR(0.002, 0.006),
              detachSpeed: H.rndR(6, 12),
              birthTime: performance.now()
            });
          };
          for (let k = 0; k < 2; k++) { spawnSpark(k); }
        }
        return true; // collision handled
      }
      return false;
    };

    for (const body of H.state.bodies) {
      if (collideWithBody(body)) break; // one collision per loose per frame
    }
  };

  for (let li = looseArr.length - 1; li >= 0; li -= step) {
    processLooseParticle(li);
  }
};

// ────────────────────────────────────────────────────────────────────
// Tick Loose Particles
// ────────────────────────────────────────────────────────────────────

window.Sim.tickLoose = dt => {
  const H = window.Sim;
  const looseArr = H.state.loose;

  H.state.loose = looseArr.filter(p => p.life > 0.02);
  if (H.state.loose.length > 400) {
    H.state.loose.splice(0, H.state.loose.length - 350);
  }

  const tickOneLoose = (p) => {
    const sdx = H.SUN.x - p.x, sdy = H.SUN.y - p.y;
    const sd2 = sdx*sdx + sdy*sdy, sd = Math.sqrt(sd2) + 0.1;
    const inBurnZone = sd < H.SUN.burnRadius * 4;
    const inCritical = sd < H.SUN.burnRadius;

    if (!p.isBurnt && p.heat > 0.7 && !inBurnZone) {
      p.isBurnt = true;
      p.burnedAt = performance.now();
    }
    if (inCritical) { p.life = 0; return; }

    if (p.isBurnt && inBurnZone) {
      p.life -= p.meltRate * dt * 2.5;
      const escapeFactor = p.detachSpeed / 15;
      p.vx += (sdx / sd) * escapeFactor * 0.3 * dt;
      p.vy += (sdy / sd) * escapeFactor * 0.3 * dt;
    } else if (p.heat > 0.7) {
      p.life -= (p.decay + 0.012) * dt;
    } else if (p.isBurnt) {
      p.life -= p.decay * dt;
    } else {
      p.life -= p.isRing ? p.decay * dt : (p.decay + 0.008) * dt;
    }

    // Burnt cohesion
    if (p.isBurnt) {
      let nearbyX = 0, nearbyY = 0, nearbyCount = 0;
      const cohesionRange = 80;
      const applyCohesionFromOther = (other) => {
        if (other === p || !other.isBurnt) return;
        const dx = other.x - p.x, dy = other.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < cohesionRange && d > 0.1) {
          const influence = (1 - d / cohesionRange) * 0.15;
          nearbyX += (dx / d) * influence;
          nearbyY += (dy / d) * influence;
          nearbyCount++;
        }
      };
      for (const other of H.state.loose) {
        applyCohesionFromOther(other);
      }
      if (nearbyCount > 0) {
        p.vx += (nearbyX / nearbyCount) * dt * 2;
        p.vy += (nearbyY / nearbyCount) * dt * 2;
      }
    }

    if (sd < H.SUN.burnRadius) { p.life = 0; return; }

    const sf = H.config.GRAV_CONST * H.SUN.mass * H.sunGravMult / (sd2 + 500) * 0.04;
    p.vx += sdx/sd * sf * dt;
    p.vy += sdy/sd * sf * dt;

    const applyBodyGravityToLoose = (b) => {
      const dx = b.cx - p.x, dy = b.cy - p.y;
      const d2 = dx*dx + dy*dy, d = Math.sqrt(d2) + 0.1;
      const f = H.config.GRAV_CONST * b.mass * (p.isRing ? 0.01 : 0.06) / (d2 + 150);
      p.vx += dx/d * f * dt;
      p.vy += dy/d * f * dt;
    };
    for (const b of H.state.bodies) {
      applyBodyGravityToLoose(b);
    }

    p.vx *= 0.995; p.vy *= 0.995;
    p.x += p.vx * dt; p.y += p.vy * dt;

    if (p.isBurnt) {
      p.heat = sd < H.SUN.burnRadius * 3 ? Math.min(1, p.heat + 0.015 * dt) : Math.max(0.5, p.heat - 0.003 * dt);
    } else {
      p.heat = sd < H.SUN.burnRadius * 3 ? Math.min(1, p.heat + 0.02 * dt) : Math.max(0, p.heat - 0.008 * dt);
    }
  };

  for (const p of H.state.loose) {
    tickOneLoose(p);
  }
};

// ────────────────────────────────────────────────────────────────────
// Main Physics Tick
// ────────────────────────────────────────────────────────────────────

window.Sim.tickBodies = scaledDt => {
  const H = window.Sim;
  const dt = scaledDt / H.config.SUBSTEPS;
  const bodies = H.state.bodies;
  const burnR = H.SUN.burnRadius;
  const burnZoneR = burnR * 4;
  const burnSq = burnR * burnR;
  const burnZoneSq = burnZoneR * burnZoneR;

  const countAlive = (b) => {
    let n = 0;
    const countIfAlive = (p) => { if (!p.dead) n++; };
    for (const p of b.particles) { countIfAlive(p); }
    return n || 1;
  };
  const nAlives = bodies.map(b => countAlive(b));

  const runSubstep = (sub) => {
    // Gravity
    for (let bi = 0; bi < bodies.length; bi++) {
      const body = bodies[bi];
      const na = nAlives[bi];
      const applyGravityIfAlive = (p) => { if (!p.dead) H.applyGravity(p, na); };
      for (const p of body.particles) { applyGravityIfAlive(p); }
    }

    // Integrate
    for (const body of bodies) {
      for (const p of body.particles) {
        H.integrateParticle(p, dt);
      }
    }

    // Springs
    for (const body of bodies) {
      H.solveSprings(body, dt);
    }

    // Burn
    for (const body of bodies) {
      const processBurn = (p) => {
        if (p.dead) return;
        const dx = H.SUN.x - p.x, dy = H.SUN.y - p.y;
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
      };
      for (const p of body.particles) { processBurn(p); }
    }

    if (sub === H.config.SUBSTEPS - 1) {
      H.interBodyCollisions();
    }
  };

  for (let sub = 0; sub < H.config.SUBSTEPS; sub++) {
    runSubstep(sub);
  }

  // Post-substep updates
  for (const body of bodies) { H.updateCOM(body); }
  for (const body of bodies) { H.splitDeadParticles(body); }
  H.state.bodies = bodies.filter(b => !b.dead);
  H.looseVsPlanets();
};