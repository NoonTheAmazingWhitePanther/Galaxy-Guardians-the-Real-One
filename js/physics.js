"use strict";

// ── Import helpers from utils.js ─────────────────────
// ── At the TOP of each file (after "use strict") ─────
// Cache helpers from window.Sim for performance
const H = window.Sim;

window.Sim.makeParticle = (x, y, mass, pal, isCore) => ({
  x, y, vx: 0, vy: 0, fx: 0, fy: 0, mass: mass || 1, pal, isCore: !!isCore, body: null, dead: false, heat: 0
});

window.Sim.makeSpring = (a, b, restLen, stiff, breakAt) => ({
  a, b, restLen, stiff: stiff || window.Sim.config.SPRING_K, breakAt: breakAt || (restLen * window.Sim.config.BREAK_MULT), broken: false
});

window.Sim.makeBody = (cx, cy, radius, pal) => {
  const particles = [], springs = [], grid = {};
  const spacing = window.Sim.config.PARTICLE_R * 1.82;
  const rows = Math.ceil(radius / spacing) * 2 + 1, cols = rows;
  const ox = cx - (cols - 1) * spacing * 0.5, oy = cy - (rows - 1) * spacing * 0.5;
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
        springs.push(window.Sim.makeSpring(ai, bi, len, isDirect ? window.Sim.config.SPRING_K : window.Sim.config.SPRING_K * 0.6, isDirect ? len * window.Sim.config.BREAK_MULT : len * window.Sim.config.BREAK_MULT));
      }
    }
  }
  for (const p of particles) p.mass = H.lerp(2.0, 0.6, H.hypot(p.x - cx, p.y - cy) / radius);
  const body = { particles, springs, pal, cx, cy, mass: 0, radius, dead: false, gravMult: window.Sim.sunGravMult };
  let tm = 0; for (const p of particles) { p.body = body; tm += p.mass; }
  body.mass = tm; return body;
};

window.Sim.updateCOM = body => {
  let sx = 0, sy = 0, sm = 0;
  for (const p of body.particles) { if (p.dead) continue; sx += p.x * p.mass; sy += p.y * p.mass; sm += p.mass; }
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

window.Sim.interBodyCollisions = () => {
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
    window.Sim.state.loose.push({ x: px, y: py, vx: -Math.sin(angle) * vLocal * scatter, vy: Math.cos(angle) * vLocal * scatter, mass: H.rndR(0.4, 1.2), pal: body.pal, heat: H.rndR(0.3, 0.8), life: 1, decay: H.rndR(0.006, 0.012), isRing: true });
  }
};

window.Sim.splitDeadParticles = body => {
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

window.Sim.looseVsPlanets = () => {
  const MAX = 200, step = window.Sim.state.loose.length > MAX ? Math.floor(window.Sim.state.loose.length / MAX) : 1;
  for (let li = window.Sim.state.loose.length - 1; li >= 0; li -= step) {
    const lp = window.Sim.state.loose[li]; if (lp.life <= 0) continue;
    for (const body of window.Sim.state.bodies) {
      const bdx = body.cx - lp.x, bdy = body.cy - lp.y;
      const bd2 = bdx * bdx + bdy * bdy;
      if (bd2 > (body.radius + window.Sim.config.LOOSE_HIT_R * 2) ** 2) continue;
      let nearP = null, nearD2 = Infinity;
      for (const bp of body.particles) { if (bp.dead) continue; const d2 = (bp.x - lp.x) ** 2 + (bp.y - lp.y) ** 2; if (d2 < nearD2) { nearD2 = d2; nearP = bp; } }
      const nearD = Math.sqrt(nearD2);
      if (!nearP || nearD > window.Sim.config.LOOSE_HIT_R) continue;
      const dx = nearP.x - lp.x, dy = nearP.y - lp.y, d = H.hypot(dx, dy) || 0.001;
      const nx = dx / d, ny = dy / d;
      const vn = (lp.vx - nearP.vx) * nx + (lp.vy - nearP.vy) * ny;
      if (Math.abs(vn) < 0.8) { nearP.vx += lp.vx * lp.mass / nearP.mass * 0.3; nearP.vy += lp.vy * lp.mass / nearP.mass * 0.3; nearP.heat = Math.min(1, nearP.heat + 0.25); lp.life = 0; }
      else if (vn > 0) {
        lp.x -= nx * (window.Sim.config.LOOSE_HIT_R - nearD) * 0.9; lp.y -= ny * (window.Sim.config.LOOSE_HIT_R - nearD) * 0.9;
        const ma = lp.mass, mb = nearP.mass;
        const j = -(1 + 0.55) * vn / (1 / ma + 1 / mb);
        lp.vx -= j * nx / ma; lp.vy -= j * ny / ma;
        nearP.vx += j * nx / mb; nearP.vy += j * ny / mb;
        const h = H.clamp(Math.abs(vn) * 0.12, 0, 1);
        lp.heat = Math.min(1, lp.heat + h); nearP.heat = Math.min(1, nearP.heat + h * 1.5);
        if (Math.abs(vn) > 2) {
          for (let k = 0; k < 3; k++) {
            const a = Math.atan2(-ny, -nx) + (H.rnd() - 0.5) * 1.2;
            const s = H.rnd() * Math.abs(vn) * 0.4 + 0.5;
            window.Sim.state.loose.push({ x: lp.x, y: lp.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, mass: lp.mass * 0.15, pal: lp.pal, heat: 0.8, life: 0.6, decay: H.rndR(0.02, 0.04) });
          }
        }
      }
      break;
    }
  }
};

window.Sim.tickLoose = dt => {
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

window.Sim.tickBodies = scaledDt => {
  const dt = scaledDt / window.Sim.config.SUBSTEPS;
  const nAlives = window.Sim.state.bodies.map(b => { let n = 0; for (const p of b.particles) if (!p.dead) n++; return n || 1; });
  for (let sub = 0; sub < window.Sim.config.SUBSTEPS; sub++) {
    for (let bi = 0; bi < window.Sim.state.bodies.length; bi++) { const body = window.Sim.state.bodies[bi], na = nAlives[bi]; for (const p of body.particles) if (!p.dead) window.Sim.applyGravity(p, na); }
    for (const body of window.Sim.state.bodies) for (const p of body.particles) window.Sim.integrateParticle(p, dt);
    for (const body of window.Sim.state.bodies) window.Sim.solveSprings(body, dt);
    const burnSq = window.Sim.SUN.burnRadius * window.Sim.SUN.burnRadius;
    for (const body of window.Sim.state.bodies) for (const p of body.particles) { if (p.dead) continue; const dx = window.Sim.SUN.x - p.x, dy = window.Sim.SUN.y - p.y, sd2 = dx * dx + dy * dy; if (sd2 < burnSq) { p.heat = 1; p.dead = true; window.Sim.addFlash(p.x, p.y, 15, p.pal.gc); } }
    if (sub === window.Sim.config.SUBSTEPS - 1) window.Sim.interBodyCollisions();
  }
  for (const body of window.Sim.state.bodies) window.Sim.updateCOM(body);
  for (const body of window.Sim.state.bodies) window.Sim.splitDeadParticles(body);
  window.Sim.state.bodies = window.Sim.state.bodies.filter(b => !b.dead);
  window.Sim.looseVsPlanets();
};
