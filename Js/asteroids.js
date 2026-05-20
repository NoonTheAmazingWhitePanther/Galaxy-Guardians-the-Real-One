"use strict";

window.Sim.spawnAsteroid = () => {
  if (window.Sim.state.asteroids.length >= window.Sim.AST_MAX) return;
  const spawnR = 10000 + rndR(4000, 10000);
  const fromA = rnd() * PI2;
  const sx = window.Sim.SUN.x + Math.cos(fromA) * spawnR, sy = window.Sim.SUN.y + Math.sin(fromA) * spawnR;
  const exitR = spawnR * rndR(0.7, 1.2);
  const exitA = fromA + Math.PI + rndR(-1.4, 1.4);
  const ex = window.Sim.SUN.x + Math.cos(exitA) * exitR, ey = window.Sim.SUN.y + Math.sin(exitA) * exitR;
  const aimA = Math.atan2(ey - sy, ex - sx);
  const speed = rndR(3.5, 7.0);
  const cvx = Math.cos(aimA) * speed, cvy = Math.sin(aimA) * speed;
  const pal = window.Sim.AST_PALETTE[Math.floor(rnd() * window.Sim.AST_PALETTE.length)];
  const nRocks = Math.floor(rndR(3, 9)), clusterR = rndR(8, 28);
  const rocks = Array.from({ length: nRocks }, () => {
    const ra = rnd() * PI2, rd = rnd() * clusterR, rr = rndR(2, 6);
    return { ox: Math.cos(ra) * rd, oy: Math.sin(ra) * rd, dvx: (rnd() - 0.5) * 0.015, dvy: (rnd() - 0.5) * 0.015, r: rr, pts: window.Sim.makeRockShape(rr), angle: rnd() * PI2 };
  });
  window.Sim.state.asteroids.push({ x: sx, y: sy, vx: cvx, vy: cvy, rocks, clusterR, mass: rocks.reduce((s, r) => s + r.r * r.r, 0) * 0.2, pal, trail: [], tailLen: 180, age: 0 });
};

window.Sim.tickAsteroids = dt => {
  window.Sim.state.astTimer++;
  const spawnEvery = Math.max(120, window.Sim.AST_SPAWN_INTERVAL / window.Sim.physSpeed);
  if (window.Sim.state.astTimer >= spawnEvery) { window.Sim.state.astTimer = 0; window.Sim.spawnAsteroid(); }
  for (let ai = window.Sim.state.asteroids.length - 1; ai >= 0; ai--) {
    const a = window.Sim.state.asteroids[ai]; a.age++;
    const sdx = window.Sim.SUN.x - a.x, sdy = window.Sim.SUN.y - a.y;
    const sd2 = sdx * sdx + sdy * sdy, sd = Math.sqrt(sd2) + 0.1;
    if (sd < window.Sim.SUN.burnRadius + a.clusterR) { window.Sim.addNova(a.x, a.y, a.clusterR * 5, "200,180,255"); window.Sim.state.asteroids.splice(ai, 1); continue; }
    const sf = (window.Sim.config.GRAV_CONST * window.Sim.SUN.mass * window.Sim.sunGravMult / (sd2 + 500)) * 0.0015;
    a.vx += (sdx / sd) * sf * dt; a.vy += (sdy / sd) * sf * dt;
    let hit = false;
    for (const b of window.Sim.state.bodies) {
      const dx = b.cx - a.x, dy = b.cy - a.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2) + 0.1;
      const f = window.Sim.config.GRAV_CONST * b.mass * 0.5 / (d2 + 200);
      a.vx += (dx / d) * f * dt; a.vy += (dy / d) * f * dt;
      if (d < b.radius + a.clusterR * 0.65) {
        const spd = hypot(a.vx, a.vy), nx = (b.cx - a.x) / d, ny = (b.cy - a.y) / d;
        for (const p of b.particles) { if (!p.dead && hypot(p.x - a.x, p.y - a.y) < b.radius * 0.7) { p.heat = Math.min(1, p.heat + spd * 0.05); p.vx += nx * spd * a.mass / b.mass * 0.1; p.vy += ny * spd * a.mass / b.mass * 0.1; } }
        for (const rock of a.rocks) { const ra = rnd() * PI2, rs = rndR(0.3, spd * 0.4); window.Sim.state.loose.push({ x: a.x + rock.ox, y: a.y + rock.oy, vx: a.vx + Math.cos(ra) * rs, vy: a.vy + Math.sin(ra) * rs, mass: rock.r * 0.3, pal: { gc: "180,160,140" }, heat: 0.5, life: rndR(0.6, 1), decay: rndR(0.003, 0.008) }); }
        window.Sim.addFlash(a.x, a.y, a.clusterR * 5, "180,200,255"); window.Sim.state.asteroids.splice(ai, 1); hit = true; break;
      }
    }
    if (hit) continue;
    a.x += a.vx * dt; a.y += a.vy * dt;
    for (const rock of a.rocks) { rock.ox += rock.dvx * dt; rock.oy += rock.dvy * dt; }
    a.trail.push({ x: a.x, y: a.y });
    if (a.trail.length > a.tailLen) a.trail.shift();
    if (hypot(a.x - window.Sim.SUN.x, a.y - window.Sim.SUN.y) > 32000) window.Sim.state.asteroids.splice(ai, 1);
  }
};

window.Sim.drawAsteroids = () => {
  const ctx = window.Sim.ctx;
  for (const a of window.Sim.state.asteroids) {
    const sunDx = window.Sim.SUN.x - a.x, sunDy = window.Sim.SUN.y - a.y, sunD = hypot(sunDx, sunDy) || 1;
    const tailNx = -sunDx / sunD, tailNy = -sunDy / sunD;
    const tailScreenPx = 280, tailWorldLen = tailScreenPx / window.Sim.cam.zoom;
    ctx.save();
    for (let i = 1; i <= 48; i++) {
      const f0 = (i - 1) / 48, f1 = i / 48;
      const tx0 = a.x + tailNx * tailWorldLen * f0, ty0 = a.y + tailNy * tailWorldLen * f0;
      const tx1 = a.x + tailNx * tailWorldLen * f1, ty1 = a.y + tailNy * tailWorldLen * f1;
      ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(tx1, ty1);
      ctx.strokeStyle = `rgba(160,205,255,${(1 - f1) ** 2 * 0.22})`; ctx.lineWidth = Math.max(0.1 / window.Sim.cam.zoom, (1 - f1) * 1.8 / window.Sim.cam.zoom); ctx.lineCap = "round"; ctx.stroke();
    }
    const dustA = Math.atan2(tailNy, tailNx) + 0.13, dnx = Math.cos(dustA), dny = Math.sin(dustA);
    const dustLen = tailWorldLen * 0.75;
    for (let i = 1; i <= 32; i++) {
      const f0 = (i - 1) / 32, f1 = i / 32;
      const tx0 = a.x + dnx * dustLen * f0, ty0 = a.y + dny * dustLen * f0;
      const tx1 = a.x + dnx * dustLen * f1, ty1 = a.y + dny * dustLen * f1;
      ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(tx1, ty1);
      ctx.strokeStyle = `rgba(220,200,155,${(1 - f1) ** 2 * 0.14})`; ctx.lineWidth = Math.max(0.1 / window.Sim.cam.zoom, (1 - f1) * 3.5 / window.Sim.cam.zoom); ctx.lineCap = "round"; ctx.stroke();
    }
    ctx.restore();
    const comaScreenR = 18, comaR = comaScreenR / window.Sim.cam.zoom;
    const coma = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, comaR);
    coma.addColorStop(0, "rgba(210,228,255,0.28)"); coma.addColorStop(0.5, "rgba(180,210,255,0.10)"); coma.addColorStop(1, "rgba(140,180,255,0)");
    ctx.fillStyle = coma; ctx.beginPath(); ctx.arc(a.x, a.y, comaR, 0, PI2); ctx.fill();
    for (const rock of a.rocks) {
      const wx = a.x + rock.ox, wy = a.y + rock.oy;
      ctx.save(); ctx.translate(wx, wy); ctx.rotate(rock.angle);
      ctx.beginPath(); ctx.moveTo(rock.pts[0][0], rock.pts[0][1]);
      for (let i = 1; i < rock.pts.length; i++) ctx.lineTo(rock.pts[i][0], rock.pts[i][1]);
      ctx.closePath(); ctx.fillStyle = a.pal.fill; ctx.strokeStyle = a.pal.outline;
      ctx.lineWidth = 0.6 / window.Sim.cam.zoom; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-rock.r * 0.22, -rock.r * 0.22, Math.max(0.3 / window.Sim.cam.zoom, rock.r * 0.18), 0, PI2);
      ctx.fillStyle = "rgba(240,240,255,0.45)"; ctx.fill(); ctx.restore();
    }
  }
};
