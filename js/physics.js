"use strict";

// ════════════════════════════════════════════════════════════════════
// PHYSICS.JS - Physics Engine & Body Dynamics
// ════════════════════════════════════════════════════════════════════
// Purpose: Manage planet creation, spring physics, gravity, collisions, and destruction.
// ════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────
// Particle & Spring Factories
// ────────────────────────────────────────────────────────────────────

/**
 * Create a single particle with physics state.
 */
window.Sim.makeParticle = (x, y, mass, pal, isCore) => ({
  x, y, vx: 0, vy: 0, fx: 0, fy: 0, mass: mass || 1, pal, isCore: !!isCore, body: null, dead: false, heat: 0
});

/**
 * Create a spring constraint between two particles.
 */
window.Sim.makeSpring = (a, b, restLen, stiff, breakAt) => ({
  a, b, restLen, stiff: stiff || window.Sim.config.SPRING_K, breakAt: breakAt || (restLen * window.Sim.config.BREAK_MULT), broken: false
});

// ────────────────────────────────────────────────────────────────────
// Planet Construction
// ────────────────────────────────────────────────────────────────────

/**
 * Create a planet body from scratch.
 * Arranges particles in hexagonal grid, connects with springs, calculates mass.
 */
window.Sim.makeBody = (cx, cy, radius, pal) => {
  const particles = [], springs = [], grid = {};
  const spacing = window.Sim.config.PARTICLE_R * 1.82;
  const rows = Math.ceil(radius / spacing) * 2 + 1, cols = rows;
  const ox = cx - (cols - 1) * spacing * 0.5, oy = cy - (rows - 1) * spacing * 0.5;
  
  // Create particles in hexagonal pattern
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = ox + col * spacing + (row % 2) * 0.5 * spacing, py = oy + row * spacing;
      const dx = px - cx, dy = py - cy;
      if (H.hypot(dx, dy) > radius + spacing * 0.3) continue;
      const p = window.Sim.makeParticle(px, py, 1, pal, H.hypot(dx, dy) < radius * 0.3);
      grid[`${col},${row}`] = particles.length;
      particles.push(p);
    }
  }
  
  // Connect particles with springs
  const dirs = [[1, 0], [0, 1], [1, 1], [-1, 1], [2, 0], [0, 2]], seen = new Set();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ai = grid[`${col},${row}`]; if (ai === undefined) continue;
      for (const [dc, dr] of dirs) {
        const bi = grid[`${col + dc},${row + dr}`]; if (bi === undefined) continue;
        const key = ai < bi ? `${ai}-${bi}` : `${bi}-${ai}`;
        if (seen.has(key)) continue; seen.add(key);
        const pa = particles[ai], pb = particles[bi];
        const len = H.hypot(pb.x - pa.x, pb.y - pa.y);
        const isDirect = len < spacing * 1.2;
        springs.push(window.Sim.makeSpring(ai, bi, len, isDirect ? window.Sim.config.SPRING_K : window.Sim.config.SPRING_K * 0.6, isDirect ? len * window.Sim.config.BREAK_MULT : len * window.Sim.config.BREAK_MULT * 0.8));
      }
    }
  }
  
  // Mass distribution: heavier at core, lighter at edges
  for (const p of particles) p.mass = H.lerp(2.0, 0.6, H.hypot(p.x - cx, p.y - cy) / radius);
  const body = { particles, springs, pal, cx, cy, mass: 0, radius, dead: false, gravMult: window.Sim.sunGravMult };
  let tm = 0; for (const p of particles) { p.body = body; tm += p.mass; }
  body.mass = tm; return body;
};

// ────────────────────────────────────────────────────────────────────
// Physics Calculations
// ────────────────────────────────────────────────────────────────────

/**
 * Update body center of mass from particle positions.
 */
window.Sim.updateCOM = body => {
  let sx = 0, sy = 0, sm = 0;
  for (const p of body.particles) { if (p.dead) continue; sx += p.x * p.mass; sy += p.y * p.mass; sm += p.mass; }
  if (sm > 0) { body.cx = sx / sm; body.cy = sy / sm; body.mass = sm; }
};

/**
 * Apply velocity and position update to particle.
 */
window.Sim.integrateParticle = (p, dt) => {
  if (p.dead) return;
  const damp = window.Sim.config.DAMPING;
  p.vx = (p.vx + (p.fx / p.mass) * dt) * damp;
  p.vy = (p.vy + (p.fy / p.mass) * dt) * damp;
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.fx = 0; p.fy = 0;
};

/**
 * Apply spring forces between particles.
 */
window.Sim.solveSprings = (body, dt) => {
  const { particles: ps, springs: ss } = body;
  for (const sp of ss) {
    if (sp.broken) continue;
    const pa = ps[sp.a], pb = ps[sp.b];
    if (pa.dead || pb.dead) { sp.broken = true; continue; }
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const len = H.hypot(dx, dy) || 0.001;
    if (len > sp.breakAt) { sp.broken = true; continue; }
    const f = sp.stiff * (len - sp.restLen), nx = dx / len, ny = dy / len;
    const tm = pa.mass + pb.mass;
    pa.vx += nx * f * (pb.mass / tm) * dt; pa.vy += ny * f * (pb.mass / tm) * dt;
    pb.vx -= nx * f * (pa.mass / tm) * dt; pb.vy -= ny * f * (pa.mass / tm) * dt;
  }
};

/**
 * Apply gravitational forces from sun and other bodies.
 */
window.Sim.applyGravity = (p, nParticles) => {
  const gm = (p.body && p.body.gravMult != null) ? p.body.gravMult : window.Sim.sunGravMult;
  const sdx = window.Sim.SUN.x - p.x, sdy = window.Sim.SUN.y - p.y;
  const sd2 = sdx * sdx + sdy * sdy, sd = Math.sqrt(sd2) + 0.1;
  const sf = (window.Sim.config.GRAV_CONST * window.Sim.SUN.mass * gm / (sd2 + 500)) / nParticles;
  p.fx += (sdx / sd) * sf * p.mass; p.fy += (sdy / sd) * sf * p.mass;
  for (const b of window.Sim.state.bodies) {
    if (p.body === b) continue;
    const dx = b.cx - p.x, dy = b.cy - p.y;
    const d2 = dx * dx + dy * dy, d = Math.sqrt(d2) + 0.1;
    const f = (window.Sim.config.GRAV_CONST * b.mass / (d2 + 300)) / nParticles;
    p.fx += (dx / d) * f * p.mass; p.fy += (dy / d) * f * p.mass;
  }
};

// ────────────────────────────────────────────────────────────────────
// Inter-Body Collisions (Optimized with Spatial Hash)
// ────────────────────────────────────────────────────────────────────

/**
 * Detect and respond to collisions between two bodies.
 * Uses spatial hash grid for O(n) performance instead of O(n²).
 */
window.Sim.interBodyCollisions = () => {
  const H = window.Sim;
  const bodies = H.state.bodies;

  for (let bi = 0; bi < bodies.length; bi++) {
    for (let bj = bi + 1; bj < bodies.length; bj++) {
      const A = bodies[bi], B = bodies[bj];
      const cdx = A.cx - B.cx, cdy = A.cy - B.cy;
      const cd2 = cdx * cdx + cdy * cdy;
      const thresh = A.radius + B.radius + H.config.COLLISION_R * 4;
      if (cd2 > thresh * thresh) continue;

      // Fast spatial hash for collision cells
      const cellSize = H.config.COLLISION_R * 2;
      const grid = new Map();
      const addCell = (p, tag) => {
        const cx = Math.floor(p.x / cellSize), cy = Math.floor(p.y / cellSize);
        const key = cx + "," + cy;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push({ p, tag });
      };
      for (const p of A.particles) if (!p.dead) addCell(p, 0);
      for (const p of B.particles) if (!p.dead) addCell(p, 1);

      for (const cell of grid.values()) {
        let hasA = false, hasB = false;
        for (const e of cell) { if (e.tag === 0) hasA = true; else hasB = true; if (hasA && hasB) break; }
        if (!hasA || !hasB) continue;

        for (const ea of cell) {
          if (ea.tag !== 0) continue;
          const pa = ea.p;
          for (const eb of cell) {
            if (eb.tag !== 1) continue;
            const pb = eb.p;
            const dx = pb.x - pa.x, dy = pb.y - pa.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= H.config.COLLISION_R * H.config.COLLISION_R) continue;

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
              
              // 🔒 CAPPED heat gain to prevent melting chain-reactions
              const heatGain = Math.min(0.4, Math.abs(vn) * 0.12);
              pa.heat = H.clamp(pa.heat + heatGain, 0, 1);
              pb.heat = H.clamp(pb.heat + heatGain, 0, 1);
            }
          }
        }
      }
    }
  }
};

/**
 * Spawn a ring of debris from a destroyed planet.
 * 🔥 NOW: Include burnt particle tracking
 */
window.Sim.spawnRing = body => {
  const rx = body.cx, ry = body.cy;
  const dist = H.hypot(rx - window.Sim.SUN.x, ry - window.Sim.SUN.y) || 1;
  const ringW = body.radius * 0.6;
  window.Sim.addFlash(rx, ry, body.radius * 4, body.pal.gc);
  window.Sim.addNova(rx, ry, body.radius * 3, body.pal.gc);
  for (let i = 0; i < window.Sim.RING_PARTICLES; i++) {
    const angle = (H.PI2 / window.Sim.RING_PARTICLES) * i + H.rndR(-0.05, 0.05);
    const r = dist + H.rndR(-ringW, ringW);
    const px = window.Sim.SUN.x + Math.cos(angle) * r, py = window.Sim.SUN.y + Math.sin(angle) * r;
    const gmLocal = window.Sim.config.GRAV_CONST * window.Sim.SUN.mass * (body.gravMult || window.Sim.sunGravMult);
    const vLocal = Math.sqrt(gmLocal / Math.max(r, 1));
    const scatter = H.rndR(0.96, 1.04);
    window.Sim.state.loose.push({ 
      x: px, 
      y: py, 
      vx: -Math.sin(angle) * vLocal * scatter, 
      vy: Math.cos(angle) * vLocal * scatter, 
      mass: H.rndR(0.4, 1.2), 
      pal: body.pal, 
      heat: H.rndR(0.3, 0.8), 
      life: H.rndR(4, 8), 
      decay: H.rndR(0.003, 0.006), 
      isRing: true, 
      // 🔥 NEW: Burnt tracking
      isBurnt: false, 
      burnedAt: 0, 
      meltRate: H.rndR(0.003, 0.008), 
      detachSpeed: H.rndR(8, 16), 
      birthTime: performance.now() 
    });
  }
};

/**
 * Split dead particles into separate fragments or destroy the body.
 * Uses BFS to find connected components of alive particles.
 * 🔥 NOW: Include burnt particle tracking
 */
window.Sim.splitDeadParticles = body => {
  const H = window.Sim;
  const { particles: ps, springs: ss } = body;
  const n = ps.length; if (!n) return;

  // Build adjacency list of unbroken springs
  const adj = Array.from({ length: n }, () => []);
  for (const sp of ss) if (!sp.broken && !ps[sp.a].dead && !ps[sp.b].dead) { adj[sp.a].push(sp.b); adj[sp.b].push(sp.a); }

  // BFS to find connected component of alive particles
  const vis = new Uint8Array(n);
  let seed = -1;
  for (let i = 0; i < n; i++) { if (!ps[i].dead) { seed = i; break; } }
  if (seed === -1) return;

  const q = [seed]; vis[seed] = 1;
  while (q.length) { const c = q.shift(); for (const nb of adj[c]) if (!vis[nb]) { vis[nb] = 1; q.push(nb); } }

  let alive = 0;
  let debrisCount = 0;
  const MAX_DEBRIS = 15; // 🔒 Hard cap: only 15 particles max per breakup event

  // Turn disconnected particles into loose debris
  for (let i = 0; i < n; i++) {
    const p = ps[i]; if (p.dead) continue;
    if (!vis[i]) {
      // 🔒 Only spawn debris if under cap, otherwise just delete silently
      if (debrisCount < MAX_DEBRIS && H.state.loose.length < 350) {
        H.state.loose.push({ 
          x: p.x, 
          y: p.y, 
          vx: p.vx, 
          vy: p.vy, 
          mass: p.mass, 
          pal: p.pal, 
          heat: p.heat, 
          life: 1, 
          decay: H.rndR(0.004, 0.008),
          // 🔥 NEW: Burnt particle tracking
          isBurnt: false, 
          burnedAt: 0, 
          meltRate: H.rndR(0.003, 0.008),
          detachSpeed: H.rndR(8, 16),
          birthTime: performance.now()
        });
        debrisCount++;
      }
      p.dead = true; // Always remove from planet
    } else alive++;
  }

  // 🔒 Prevent full planet vaporization from dumping thousands into loose
  if (alive < Math.max(3, n * 0.08)) {
    const remaining = n - debrisCount;
    if (remaining > 0 && H.state.loose.length < 365) {
      // Spawn a small visual burst instead of the full mass
      const burst = Math.min(MAX_DEBRIS - debrisCount, remaining);
      for (let i = 0; i < burst; i++) {
        H.state.loose.push({ 
          x: ps[i].x, 
          y: ps[i].y, 
          vx: ps[i].vx, 
          vy: ps[i].vy, 
          mass: ps[i].mass, 
          pal: ps[i].pal, 
          heat: 1, 
          life: 0.6, 
          decay: H.rndR(0.005, 0.01),
          // 🔥 NEW: Burst particles are extra hot
          isBurnt: false,
          burnedAt: 0,
          meltRate: H.rndR(0.005, 0.012),
          detachSpeed: H.rndR(12, 22),
          birthTime: performance.now()
        });
      }
    }
    if (body.radius >= H.RING_MIN_RADIUS) H.spawnRing(body);
    body.dead = true;
  }
};

/**
 * Check if loose particles collide with planets and get absorbed.
 * 🔥 NOW: Include burnt particle tracking in spark generation
 */
window.Sim.looseVsPlanets = () => {
  const H = window.Sim;
  const MAX_CHECKS = 250;
  const looseArr = H.state.loose;
  const step = looseArr.length > MAX_CHECKS ? Math.floor(looseArr.length / MAX_CHECKS) : 1;

  for(let li = looseArr.length - 1; li >= 0; li -= step){
    const lp = looseArr[li];
    if(lp.life <= 0.1) continue;

    for(const body of H.state.bodies){
      const bdx = body.cx - lp.x, bdy = body.cy - lp.y;
      const bd2 = bdx*bdx + bdy*bdy;
      const thresh = body.radius + H.config.LOOSE_HIT_R * 2.5;
      if(bd2 > thresh*thresh) continue;

      // Find nearest surface particle
      let nearP = null, nearD2 = Infinity;
      for(const bp of body.particles){
        if(bp.dead) continue;
        const d2 = (bp.x-lp.x)**2 + (bp.y-lp.y)**2;
        if(d2 < nearD2) { nearD2 = d2; nearP = bp; }
      }
      const nearD = Math.sqrt(nearD2);
      if(!nearP || nearD > H.config.LOOSE_HIT_R * 1.5) continue;

      const dx = nearP.x - lp.x, dy = nearP.y - lp.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const nx = dx/d, ny = dy/d;
      const vn = (lp.vx - nearP.vx)*nx + (lp.vy - nearP.vy)*ny;

      // 🟢 MORE COLLECTABLE: Raised absorption threshold
      if(Math.abs(vn) < 1.5){
        nearP.vx += lp.vx * lp.mass / nearP.mass * 0.5;
        nearP.vy += lp.vy * lp.mass / nearP.mass * 0.5;
        nearP.heat = Math.min(1, nearP.heat + 0.4);
        lp.life = 0; // Mark for removal
        if(lp.heat > 0.4) H.addFlash(lp.x, lp.y, 3, '255,180,80');
      } else if(vn > 0){
        lp.x -= nx * (H.config.LOOSE_HIT_R - nearD) * 0.95;
        lp.y -= ny * (H.config.LOOSE_HIT_R - nearD) * 0.95;
        const ma = lp.mass, mb = nearP.mass;
        const j = -(1 + 0.45) * vn / (1/ma + 1/mb);
        lp.vx -= j*nx/ma; lp.vy -= j*ny/ma;
        nearP.vx += j*nx/mb; nearP.vy += j*ny/mb;
        
        const h = H.clamp(Math.abs(vn)*0.12, 0, 1);
        lp.heat = Math.min(1, lp.heat + h);
        nearP.heat = Math.min(1, nearP.heat + h);        
        // Limited high-impact sparks (prevents lag explosions)
        if(Math.abs(vn) > 3 && looseArr.length < 380){
          for(let k=0; k<2; k++){
            const a = Math.atan2(-ny,-nx) + (H.rnd()-0.5)*1.0;
            const s = H.rnd() * Math.abs(vn)*0.25 + 0.2;
            looseArr.push({
              x:lp.x, 
              y:lp.y, 
              vx:Math.cos(a)*s, 
              vy:Math.sin(a)*s,
              mass: lp.mass*0.08, 
              pal: lp.pal, 
              heat:0.9, 
              life:0.3, 
              decay:0.06,
              // 🔥 NEW: Spark debris tracking
              isBurnt: false,
              burnedAt: 0,
              meltRate: H.rndR(0.002, 0.006),
              detachSpeed: H.rndR(6, 12),
              birthTime: performance.now()
            });
          }
        }
      }
      break; // One collision per loose particle per frame
    }
  }
};

/**
 * Update all loose particles: apply gravity, decay, remove dead ones.
 * 🔥 NEW: Handle burnt particle state, variable melt rates, and group cohesion
 */
window.Sim.tickLoose = dt => {
  const H = window.Sim;
  const looseArr = H.state.loose;
  
  // 🟢 SMART CAP: Remove dying particles first, then hard-trim oldest if still over
  H.state.loose = looseArr.filter(p => p.life > 0.02);
  if(H.state.loose.length > 400) {
    H.state.loose.splice(0, H.state.loose.length - 350); // Keep only the 350 longest-lived
  }

  for(const p of H.state.loose){
    const sdx = H.SUN.x - p.x, sdy = H.SUN.y - p.y;
    const sd2 = sdx*sdx + sdy*sdy, sd = Math.sqrt(sd2) + 0.1;
    
    // 🔥 NEW: Track burnt state when escaping burn zone
    const inBurnZone = sd < H.SUN.burnRadius * 4; // 4x radius burn zone
    const inCritical = sd < H.SUN.burnRadius;     // Core instant vaporize zone
    
    // Mark as burnt when exiting the zone with high heat
    if (!p.isBurnt && p.heat > 0.7 && inBurnZone === false) {
      p.isBurnt = true;
      p.burnedAt = performance.now();
    }
    
    // If in critical zone, accelerate vaporization
    if (inCritical) {
      p.life = 0;
      continue;
    }
    
    // 🔥 NEW: Variable melt rate for burnt particles
    if (p.isBurnt && inBurnZone) {
      // Burnt particles melt faster while still in burn zone, at variable rates
      p.life -= p.meltRate * dt * 2.5; // 2.5x faster melt for burnt particles
      
      // Variable detach: some particles escape faster, creating fluid motion
      const escapeFactor = p.detachSpeed / 15; // normalize to ~1.0
      p.vx += (sdx / sd) * escapeFactor * 0.3 * dt;
      p.vy += (sdy / sd) * escapeFactor * 0.3 * dt;
    } else if (p.heat > 0.7) {
      // Hot particles (not yet burnt) decay faster
      p.life -= (p.decay + 0.012) * dt;
    } else if (p.isBurnt) {
      // Burnt particles that escaped: normal decay
      p.life -= p.decay * dt;
    } else {
      // Cool particles: standard decay
      if(p.isRing){
        p.life -= p.decay * dt; // Rings live long
      } else {
        p.life -= (p.decay + 0.008) * dt; // Debris/sparks vanish quickly
      }
    }
    
    // 🔥 NEW: Group cohesion for burnt debris (fluid absorption effect)
    // Burnt particles attract each other slightly to stay grouped
    if (p.isBurnt) {
      let nearbyX = 0, nearbyY = 0, nearbyCount = 0;
      const cohesionRange = 80; // pixels
      
      for (const other of H.state.loose) {
        if (other === p || !other.isBurnt) continue;
        const dx = other.x - p.x, dy = other.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < cohesionRange && d > 0.1) {
          const influence = (1 - d / cohesionRange) * 0.15; // soft influence
          nearbyX += (dx / d) * influence;
          nearbyY += (dy / d) * influence;
          nearbyCount++;
        }
      }
      
      if (nearbyCount > 0) {
        p.vx += (nearbyX / nearbyCount) * dt * 2;
        p.vy += (nearbyY / nearbyCount) * dt * 2;
      }
    }

    // Apply sun gravity
    if(sd < H.SUN.burnRadius){ 
      p.life = 0; 
      continue; 
    }

    const sf = H.config.GRAV_CONST * H.SUN.mass * H.sunGravMult / (sd2 + 500) * 0.04;
    p.vx += sdx/sd * sf * dt; 
    p.vy += sdy/sd * sf * dt;

    // Planet gravity (reduced for debris)
    for(const b of H.state.bodies){
      const dx = b.cx - p.x, dy = b.cy - p.y;
      const d2 = dx*dx + dy*dy, d = Math.sqrt(d2) + 0.1;
      const f = H.config.GRAV_CONST * b.mass * (p.isRing ? 0.01 : 0.06) / (d2 + 150);
      p.vx += dx/d * f * dt; 
      p.vy += dy/d * f * dt;
    }

    p.vx *= 0.995; p.vy *= 0.995;
    p.x += p.vx * dt; p.y += p.vy * dt;
    
    // 🔥 NEW: Heat dynamics for burnt vs. normal particles
    if (p.isBurnt) {
      // Burnt particles stay hot longer in burn zone
      p.heat = sd < H.SUN.burnRadius * 3 ? Math.min(1, p.heat + 0.015 * dt) : Math.max(0.5, p.heat - 0.003 * dt);
    } else {
      // Normal heat decay
      p.heat = sd < H.SUN.burnRadius * 3 ? Math.min(1, p.heat + 0.02 * dt) : Math.max(0, p.heat - 0.008 * dt);
    }
  }
};

// ────────────────────────────────────────────────────────────────────
// Main Body Physics Tick
// ───────────────────

/**
/**
 * Main physics loop: apply gravity, integrate, solve springs, handle collisions, burn detection.
 * ✅ COMPLETE: No changes needed for burnt particles (they work at loose particle level)
 */
window.Sim.tickBodies = scaledDt => {
  const H = window.Sim;
  const dt = scaledDt / H.config.SUBSTEPS;
  const bodies = H.state.bodies;

  // 🔥 Pre-calculate Burn Thresholds
  const burnR = H.SUN.burnRadius;
  const burnZoneR = burnR * 4; // 4x radius for burn zone (matches rendering & loose physics)
  const burnSq = burnR * burnR;
  const burnZoneSq = burnZoneR * burnZoneR;

  // Helper: get alive count for gravity normalization (constant for this frame)
  const nAlives = bodies.map(b => { 
    let n = 0; 
    for (const p of b.particles) if (!p.dead) n++; 
    return n || 1; 
  });

  // ── SUBSTEPS LOOP ──────────────────────────────────────────────────
  for (let sub = 0; sub < H.config.SUBSTEPS; sub++) {
    
    // 1. GRAVITY: Apply forces from sun & other bodies
    for (let bi = 0; bi < bodies.length; bi++) {
      const body = bodies[bi];
      const na = nAlives[bi];
      for (const p of body.particles) if (!p.dead) H.applyGravity(p, na);
    }
    
    // 2. INTEGRATE: Update velocity & position
    for (const body of bodies) {
      for (const p of body.particles) {
        H.integrateParticle(p, dt);
      }
    }
    
    // 3. SOLVE SPRINGS: Apply spring constraints between particles
    for (const body of bodies) {
      H.solveSprings(body, dt);
    }

    // 🔥 4. BURN LOGIC: Sun Proximity & Destruction
    // This marks planet particles as dead when they:
    //   - Enter core burn radius → instant vaporization
    //   - Enter burn zone (4x) → rapid overheating & melting
    // These dead particles are later converted to loose debris in splitDeadParticles()
    for (const body of bodies) {
      for (const p of body.particles) {
        if (p.dead) continue;
        
        const dx = H.SUN.x - p.x, dy = H.SUN.y - p.y;
        const sd2 = dx * dx + dy * dy;

        if (sd2 < burnSq) {
          // 🔥 CORE BURN: Instant vaporization
          p.dead = true; 
          p.heat = 1;
          
        } else if (sd2 < burnZoneSq) {
          // 🔥 BURN ZONE (4x radius): Rapid overheating & melting
          // Closer to sun = faster burn rate (proximity gradient)
          const dist = Math.sqrt(sd2);
          const proximity = 1 - (dist / burnZoneR); // 0.0 at edge, 1.0 at inner core
          
          // Heat accumulates rapidly. If it hits 2.0+, particle dies/breaks off.
          const burnRate = 0.004 + (proximity * 0.000035); 
          p.heat = Math.min(1, p.heat + burnRate);
          
          if (p.heat >= 2.0) {
            p.dead = true;
          }
          
        } else {
          // Cool down if safe distance from burn zone
          if (p.heat > 0) {
            p.heat = Math.max(0, p.heat - 0.005);
          }
        }
      }
    }

    // 5. INTER-BODY COLLISIONS: Handle planet-to-planet collisions (only once per frame)
    if (sub === H.config.SUBSTEPS - 1) {
      H.interBodyCollisions();
    }
  }

  // ── POST-SUBSTEP UPDATES ────────────────────────────────────────────
  
  // Update body center of mass from all alive particles
  for (const body of bodies) {
    H.updateCOM(body);
  }
  
  // Split dead particles from planets into loose debris
  // 🔥 This is where dead planet particles become burnt loose particles
  for (const body of bodies) {
    H.splitDeadParticles(body);
  }
  
  // Remove fully destroyed bodies
  H.state.bodies = bodies.filter(b => !b.dead);
  
  // Handle collisions between loose particles and planets
  H.looseVsPlanets();
};


// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ARCHIVE - Old implementations (kept for reference, not used)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/*
// OLD: interBodyCollisions without spatial hashing (O(n²))
window.Sim.interBodyCollisions_OLD = () => {
  for (let bi = 0; bi < window.Sim.state.bodies.length; bi++) {
    for (let bj = bi + 1; bj < window.Sim.state.bodies.length; bj++) {
      const A = window.Sim.state.bodies[bi], B = window.Sim.state.bodies[bj];
      const cdx = A.cx - B.cx, cdy = A.cy - B.cy;
      const cd2 = cdx * cdx + cdy * cdy;
      const thresh = A.radius + B.radius + window.Sim.config.COLLISION_R * 4;
      if (cd2 > thresh * thresh) continue;
      const cellSize = window.Sim.config.COLLISION_R * 2;
      const grid = new Map();
      const addCell = (p, tag) => {
        const cx = Math.floor(p.x / cellSize), cy = Math.floor(p.y / cellSize);
        const key = cx + "," + cy;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push({ p, tag });
      };
      for (const p of A.particles) if (!p.dead) addCell(p, 0);
      for (const p of B.particles) if (!p.dead) addCell(p, 1);
      for (const cell of grid.values()) {
        let hasA = false, hasB = false;
        for (const e of cell) { if (e.tag === 0) hasA = true; else hasB = true; if (hasA && hasB) break; }
        if (!hasA || !hasB) continue;
        for (const ea of cell) {
          if (ea.tag !== 0) continue;
          const pa = ea.p;
          for (const eb of cell) {
            if (eb.tag !== 1) continue;
            const pb = eb.p;
            const dx = pb.x - pa.x, dy = pb.y - pa.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= window.Sim.config.COLLISION_R * window.Sim.config.COLLISION_R) continue;
            const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
            const ov = window.Sim.config.COLLISION_R - d, ma = pa.mass, mb = pb.mass, mt = ma + mb;
            pa.x -= nx * ov * (mb / mt); pa.y -= ny * ov * (mb / mt);
            pb.x += nx * ov * (ma / mt); pb.y += ny * ov * (ma / mt);
            const vn = (pa.vx - pb.vx) * nx + (pa.vy - pb.vy) * ny;
            if (vn < 0) {
              const j = -(1 + 0.45) * vn / (1 / ma + 1 / mb);
              pa.vx += j * nx / ma; pa.vy += j * ny / ma;
              pb.vx -= j * nx / mb; pb.vy -= j * ny / mb;
              pa.heat = H.clamp(pa.heat + Math.abs(vn) * 0.15, 0, 1);
              pb.heat = H.clamp(pb.heat + Math.abs(vn) * 0.15, 0, 1);
            }
          }
        }
      }
    }
  }
};

// OLD: splitDeadParticles with full debris spawning (memory leak risk)
window.Sim.splitDeadParticles_OLD = body => {
  const { particles: ps, springs: ss } = body;
  const n = ps.length; if (!n) return;
  const adj = Array.from({ length: n }, () => []);
  for (const sp of ss) if (!sp.broken && !ps[sp.a].dead && !ps[sp.b].dead) { adj[sp.a].push(sp.b); adj[sp.b].push(sp.a); }
  const vis = new Uint8Array(n);
  let seed = -1; for (let i = 0; i < n; i++) { if (!ps[i].dead) { seed = i; break; } }
  if (seed === -1) return;
  const q = [seed]; vis[seed] = 1;
  while (q.length) { const c = q.shift(); for (const nb of adj[c]) if (!vis[nb]) { vis[nb] = 1; q.push(nb); } }
  let alive = 0;
  for (let i = 0; i < n; i++) {
    const p = ps[i]; if (p.dead) continue;
    if (!vis[i]) { window.Sim.state.loose.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, mass: p.mass, pal: p.pal, heat: p.heat, life: 1, decay: H.rndR(0.004, 0.008) }); p.dead = true; }
    else alive++;
  }
  if (alive < Math.max(3, n * 0.08)) {
    for (const p of ps) if (!p.dead) window.Sim.state.loose.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, mass: p.mass, pal: p.pal, heat: 1, life: 1, decay: H.rndR(0.005, 0.01) });
    if (body.radius >= window.Sim.RING_MIN_RADIUS) window.Sim.spawnRing(body);
    body.dead = true;
  }
};

// OLD: tickLoose with solar particle emission system (removed for simplicity)
window.Sim.tickLoose_OLD = dt => {
  if (window.Sim.state.loose.length > 400) window.Sim.state.loose = window.Sim.state.loose.slice(window.Sim.state.loose.length - 400);
  window.Sim.state.loose = window.Sim.state.loose.filter(p => p.life > 0);
  const gmScale = window.Sim.sunGravMult * 0.04;
  for (const p of window.Sim.state.loose) {
    const sdx = window.Sim.SUN.x - p.x, sdy = window.Sim.SUN.y - p.y;
    const sd2 = sdx * sdx + sdy * sdy, sd = Math.sqrt(sd2) + 0.1;
    if (sd < window.Sim.SUN.burnRadius) { p.life = 0; continue; }
    const sf = window.Sim.config.GRAV_CONST * window.Sim.SUN.mass * gmScale / (sd2 + 500);
    p.vx += (sdx / sd) * sf * dt; p.vy += (sdy / sd) * sf * dt;
    for (const b of window.Sim.state.bodies) {
      const dx = b.cx - p.x, dy = b.cy - p.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2) + 0.1;
      const f = window.Sim.config.GRAV_CONST * b.mass * (p.isRing ? 0.01 : 0.12) / (d2 + 150);
      p.vx += (dx / d) * f * dt; p.vy += (dy / d) * f * dt;
    }
    p.vx *= 0.997; p.vy *= 0.997;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.heat = sd < window.Sim.SUN.burnRadius * 3 ? Math.min(1, p.heat + 0.02 * dt) : Math.max(0, p.heat - 0.005 * dt);
    p.life -= p.decay * dt;
  }
};

// OLD: tickBodies with manual particle loop (pre-optimization)
window.Sim.tickBodies_OLD = scaledDt => {
  const dt = scaledDt / window.Sim.config.SUBSTEPS;
  const nAlives = window.Sim.state.bodies.map(b => { let n = 0; for (const p of b.particles) if (!p.dead) n++; return n || 1; });
  for (let sub = 0; sub < window.Sim.config.SUBSTEPS; sub++) {
    for (let bi = 0; bi < window.Sim.state.bodies.length; bi++) { const body = window.Sim.state.bodies[bi], na = nAlives[bi]; for (const p of body.particles) if (!p.dead) window.Sim.applyGravity(p, na); }
    for (const body of window.Sim.state.bodies) for (const p of body.particles) window.Sim.integrateParticle(p, dt);
    for (const body of window.Sim.state.bodies) window.Sim.solveSprings(body, dt);
    const burnSq = window.Sim.SUN.burnRadius * window.Sim.SUN.burnRadius;
    for (const body of window.Sim.state.bodies) for (const p of body.particles) { if (p.dead) continue; const dx = window.Sim.SUN.x - p.x, dy = window.Sim.SUN.y - p.y, sd2 = dx * dx + dy * dy; if (sd2 < burnSq) { p.dead = true; p.heat = 1; } }
    if (sub === window.Sim.config.SUBSTEPS - 1) window.Sim.interBodyCollisions();
  }
  for (const body of window.Sim.state.bodies) window.Sim.updateCOM(body);
  for (const body of window.Sim.state.bodies) window.Sim.splitDeadParticles(body);
  window.Sim.state.bodies = window.Sim.state.bodies.filter(b => !b.dead);
  window.Sim.looseVsPlanets();
};
*/
