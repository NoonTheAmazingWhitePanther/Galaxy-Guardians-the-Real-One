"use strict";

// ── Import helpers from utils.js ─────────────────────
// ── At the TOP of each file (after "use strict") ─────
// Cache helpers from window.Sim for performance

/* 
// 🔥 Shared solar burn cycle: Yellow → Red → White → Loop (~10 sec)
H.getSolarColors = (t) => {
  const speed = 0.0005;
  const phase = (t * speed) % 1.0;
  const c1 = [255, 235, 60];  // Bright Yellow
  const c2 = [255, 85, 15];   // Deep Red-Orange
  const c3 = [255, 255, 245]; // White-Hot
  let r, g, b;
  if (phase < 0.333) { const k = phase * 3; r=c1[0]+(c2[0]-c1[0])*k; g=c1[1]+(c2[1]-c1[1])*k; b=c1[2]+(c2[2]-c1[2])*k; }
  else if (phase < 0.666) { const k = (phase-0.333)*3; r=c2[0]+(c3[0]-c2[0])*k; g=c2[1]+(c3[1]-c2[1])*k; b=c2[2]+(c3[2]-c2[2])*k; }
  else { const k = (phase-0.666)*3; r=c3[0]+(c1[0]-c3[0])*k; g=c3[1]+(c1[1]-c3[1])*k; b=c3[2]+(c1[2]-c3[2])*k; }
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
};
*/
// ── Yellow-Dominant Solar Color Cycle newer ────────────────
H.getSolarColors = (t) => {
  const speed = 0.0006; // ~10 sec full loop
  const phase = (t * speed) % 1.0;
  // Tight yellow palette: Bright → Gold → White-Yellow
  const c1 = [255, 245, 110]; // Vibrant yellow
  const c2 = [255, 220, 65];  // Warm gold
  const c3 = [255, 255, 235]; // White-yellow
  let r, g, b;
  if (phase < 0.333) {
    const k = phase * 3; r = c1[0]+(c2[0]-c1[0])*k; g = c1[1]+(c2[1]-c1[1])*k; b = c1[2]+(c2[2]-c1[2])*k;
  } else if (phase < 0.666) {
    const k = (phase-0.333)*3; r = c2[0]+(c3[0]-c2[0])*k; g = c2[1]+(c3[1]-c2[1])*k; b = c2[2]+(c3[2]-c2[2])*k;
  } else {
    const k = (phase-0.666)*3; r = c3[0]+(c1[0]-c3[0])*k; g = c3[1]+(c1[1]-c3[1])*k; b = c3[2]+(c1[2]-c3[2])*k;
  }
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
};


window.Sim.initStars = () => {
  window.Sim.state.stars = Array.from({ length: 90 }, () => ({ x: H.rnd() * window.Sim.W, y: H.rnd() * window.Sim.H, r: H.rnd() * 1.2 + 0.2, bri: H.rnd() * 0.5 + 0.5, ts: H.rnd() * 0.012 + 0.003, to: H.rnd() * H.PI2, hue: 200 + H.rnd() * 60 }));
};

window.Sim.drawStars = t => {
  for (const s of window.Sim.state.stars) {
    const a = s.bri * (0.55 + 0.45 * Math.sin(t * s.ts + s.to));
    window.Sim.ctx.beginPath(); window.Sim.ctx.arc(s.x, s.y, s.r, 0, H.PI2);
    window.Sim.ctx.fillStyle = `hsla(${s.hue},75%,95%,${a})`; window.Sim.ctx.shadowBlur = 3; window.Sim.ctx.shadowColor = `hsla(${s.hue},100%,95%,.3)`; window.Sim.ctx.fill(); window.Sim.ctx.shadowBlur = 0;
  }
};

window.Sim.addFlash = (x, y, r, gc) => {
  window.Sim.state.flashes.push({ x, y, r: r * 0.05, maxR: r * 3, gc, life: 0.55, speed: 0.14, kind: "ring" });
  window.Sim.state.flashes.push({ x, y, r: r * 0.1, maxR: r * 2, gc, life: 0.45, speed: 0.12, kind: "fill" });
  window.Sim.state.flashes.push({ x, y, r: 0, maxR: r * 0.8, gc, life: 0.60, speed: 0.10, kind: "core" });
};

window.Sim.addNova = (x, y, r, gc) => {
  window.Sim.state.flashes.push({ x, y, r: r * 0.9, maxR: r * 1.6, gc, life: 0.9, speed: 0.18, kind: "white" });
  window.Sim.state.flashes.push({ x, y, r: r * 0.04, maxR: r * 3.5, gc, life: 0.70, speed: 0.11, kind: "ring" });
  window.Sim.state.flashes.push({ x, y, r: r * 0.08, maxR: r * 2.2, gc, life: 0.55, speed: 0.10, kind: "fill" });
  window.Sim.state.flashes.push({ x, y, r: r * 0.15, maxR: r * 1.3, gc, life: 0.65, speed: 0.09, kind: "fill" });
  window.Sim.state.flashes.push({ x, y, r: 0, maxR: r * 0.9, gc, life: 0.75, speed: 0.08, kind: "core" });
};

window.Sim.drawFlashes = () => {
  const ctx = window.Sim.ctx;
  for (let i = window.Sim.state.flashes.length - 1; i >= 0; i--) {
    const f = window.Sim.state.flashes[i]; if (f.life <= 0) { window.Sim.state.flashes.splice(i, 1); continue; }
    const r = Math.max(0.1, f.r), a = H.clamp(f.life, 0, 1);
    if (f.kind === "white") { const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r); gr.addColorStop(0, `rgba(255,255,255,${a * 0.30})`); gr.addColorStop(0.5, `rgba(255,250,240,${a * 0.16})`); gr.addColorStop(0.85, `rgba(255,240,200,${a * 0.06})`); gr.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, H.PI2); ctx.fill(); ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, H.PI2); ctx.strokeStyle = `rgba(255,255,255,${a * 0.22})`; ctx.lineWidth = Math.max(0.3, r * 0.04 / window.Sim.cam.zoom); ctx.stroke(); }
    else if (f.kind === "ring") { ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, H.PI2); ctx.strokeStyle = `rgba(${f.gc},${a * 0.22})`; ctx.lineWidth = Math.max(0.3, (f.maxR * 0.025) / window.Sim.cam.zoom) * a; ctx.stroke(); const gr = ctx.createRadialGradient(f.x, f.y, Math.max(0, r * 0.75), f.x, f.y, r * 1.35); gr.addColorStop(0, `rgba(${f.gc},${a * 0.08})`); gr.addColorStop(1, `rgba(${f.gc},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r * 1.35, 0, H.PI2); ctx.fill(); }
    else if (f.kind === "fill") { const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r); gr.addColorStop(0, `rgba(255,240,200,${a * 0.13})`); gr.addColorStop(0.4, `rgba(${f.gc},${a * 0.09})`); gr.addColorStop(0.8, `rgba(${f.gc},${a * 0.03})`); gr.addColorStop(1, `rgba(${f.gc},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, H.PI2); ctx.fill(); }
    else { const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r); gr.addColorStop(0, `rgba(255,255,255,${a * 0.40})`); gr.addColorStop(0.35, `rgba(255,230,150,${a * 0.20})`); gr.addColorStop(0.7, `rgba(${f.gc},${a * 0.08})`); gr.addColorStop(1, `rgba(${f.gc},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, H.PI2); ctx.fill(); }
    f.r += (f.maxR - f.r) * f.speed; f.life -= 0.042;
  }
};

window.Sim.drawNebula = t => {
  const blobs = [[window.Sim.W * 0.2, window.Sim.H * 0.3, Math.max(window.Sim.W, window.Sim.H) * 0.7, 8, 6, 38, 0.04], [window.Sim.W * 0.78, window.Sim.H * 0.7, Math.max(window.Sim.W, window.Sim.H) * 0.6, 28, 4, 18, 0.035], [window.Sim.W * 0.5, window.Sim.H * 0.15, Math.max(window.Sim.W, window.Sim.H) * 0.5, 4, 12, 40, 0.03], [window.Sim.W * 0.85, window.Sim.H * 0.4, Math.max(window.Sim.W, window.Sim.H) * 0.45, 12, 3, 30, 0.025], [window.Sim.W * 0.1, window.Sim.H * 0.75, Math.max(window.Sim.W, window.Sim.H) * 0.5, 6, 20, 12, 0.02]];
  for (const [bx, by, br, r, g, b, a] of blobs) {
    const px = bx + Math.sin(t * 0.00007) * 30, py = by + Math.cos(t * 0.00009) * 20;
    const grd = window.Sim.ctx.createRadialGradient(px, py, 0, px, py, br); grd.addColorStop(0, `rgba(${r},${g},${b},${a})`); grd.addColorStop(1, "rgba(0,0,0,0)"); window.Sim.ctx.fillStyle = grd; window.Sim.ctx.fillRect(0, 0, window.Sim.W, window.Sim.H);
  }
};

/*
window.Sim.drawSun = t => {
  const ctx = window.Sim.ctx, { x, y, radius } = window.Sim.SUN;
  window.Sim.SUN.coronaTime += 0.008; const ct = window.Sim.SUN.coronaTime;
  for (const [r, a, sp] of [[radius * 5.5, 0.015, 0.0011], [radius * 3.8, 0.03, 0.0017], [radius * 2.5, 0.055, 0.002], [radius * 1.7, 0.09, 0.0025]]) {
    const pulse = 1 + 0.06 * Math.sin(ct * sp * 1000);
    const gr = ctx.createRadialGradient(x, y, radius * 0.6, x, y, r * pulse);
    gr.addColorStop(0, `rgba(255,200,60,${a})`); gr.addColorStop(0.4, `rgba(255,120,20,${a * 0.4})`); gr.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, H.PI2); ctx.fill();
  }
  ctx.save();
  for (let i = 0; i < 12; i++) {
    const angle = (H.PI2 / 12) * i + Math.sin(ct * 0.7 + i) * 0.15, flicker = Math.sin(ct * 1.3 + i * 2.1) * 0.5 + 0.5, len = radius * (0.35 + flicker * 0.55);
    const tipX = x + Math.cos(angle) * (radius + len), tipY = y + Math.sin(angle) * (radius + len);
    const lx = x + Math.cos(angle - Math.PI / 2) * radius * 0.12, ly = y + Math.sin(angle - Math.PI / 2) * radius * 0.12;
    const rx = x + Math.cos(angle + Math.PI / 2) * radius * 0.12, ry = y + Math.sin(angle + Math.PI / 2) * radius * 0.12;
    const fg = ctx.createLinearGradient(x, y, tipX, tipY); fg.addColorStop(0, `rgba(255,230,100,${0.25 * flicker})`); fg.addColorStop(0.5, `rgba(255,140,30,${0.15 * flicker})`); fg.addColorStop(1, "rgba(255,60,0,0)");
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(tipX + Math.cos(angle) * radius * 0.1, tipY + Math.sin(angle) * radius * 0.1, rx, ry); ctx.quadraticCurveTo(x + Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.7, lx, ly); ctx.fillStyle = fg; ctx.fill();
  }
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, H.PI2); ctx.clip();
  const bg = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.2, 0, x, y, radius);
  bg.addColorStop(0, "#fffde0"); bg.addColorStop(0.15, "#ffe066"); bg.addColorStop(0.45, "#ff9900"); bg.addColorStop(0.8, "#ff4400"); bg.addColorStop(1, "#cc1100");
  ctx.fillStyle = bg; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  for (let i = 0; i < 28; i++) { const ga = (H.PI2 / 28) * i + ct * 0.03 * (i % 2 ? 1 : -1), gd = (0.35 + 0.5 * (i % 7) / 7) * radius, gx = x + Math.cos(ga) * gd, gy = y + Math.sin(ga) * gd, gr2 = radius * (0.06 + 0.08 * ((i * 7) % 5) / 5); const granG = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr2); granG.addColorStop(0, `rgba(255,240,150,${(0.5 + 0.5 * Math.sin(ct * 2.1 + i * 1.3)) * 0.18})`); granG.addColorStop(1, "rgba(255,100,0,0)"); ctx.fillStyle = granG; ctx.beginPath(); ctx.arc(gx, gy, gr2, 0, H.PI2); ctx.fill(); }
  for (const [a, d, r, fl] of [[0.8, 0.42, 0.09, 1.1], [2.3, 0.55, 0.06, 0.9], [4.1, 0.35, 0.07, 1.2], [5.5, 0.5, 0.05, 0.8]]) { const sa = a + ct * 0.04 * (fl - 0.9), sx = x + Math.cos(sa) * d * radius, sy = y + Math.sin(sa) * d * radius, sr = r * radius; const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr); sg.addColorStop(0, "rgba(30,10,0,.65)"); sg.addColorStop(0.6, "rgba(80,20,0,.35)"); sg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, H.PI2); ctx.fill(); }
  const hl = ctx.createRadialGradient(x - radius * 0.38, y - radius * 0.42, 0, x - radius * 0.38, y - radius * 0.42, radius * 0.7); hl.addColorStop(0, "rgba(255,255,255,.22)"); hl.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = hl; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); ctx.restore();
  const rim = ctx.createRadialGradient(x, y, radius * 0.88, x, y, radius * 1.22); rim.addColorStop(0, "rgba(0,0,0,0)"); rim.addColorStop(0.4, "rgba(255,160,20,.12)"); rim.addColorStop(1, "rgba(255,40,0,0)"); ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(x, y, radius * 1.22, 0, H.PI2); ctx.fill();
  ctx.save(); ctx.globalAlpha = 0.018;
  for (let i = 0; i < 6; i++) { const sa = ct * 0.05 + (H.PI2 / 6) * i, ex = x + Math.cos(sa) * radius * 18, ey = y + Math.sin(sa) * radius * 18, lx2 = x + Math.cos(sa - Math.PI / 2) * radius * 0.8, ly2 = y + Math.sin(sa - Math.PI / 2) * radius * 0.8, rx2 = x + Math.cos(sa + Math.PI / 2) * radius * 0.8, ry2 = y + Math.sin(sa + Math.PI / 2) * radius * 0.8; const sg = ctx.createLinearGradient(x, y, ex, ey); sg.addColorStop(0, "rgba(255,220,80,1)"); sg.addColorStop(1, "rgba(255,120,0,0)"); ctx.beginPath(); ctx.moveTo(lx2, ly2); ctx.lineTo(ex, ey); ctx.lineTo(rx2, ry2); ctx.closePath(); ctx.fillStyle = sg; ctx.fill(); }
  ctx.restore();
};
*/// old version

// ── Cohesive Yellow Sun Rendering - newer ────────────────────
window.Sim.drawSun = t => {
  const ctx = H.ctx;
  const { x, y, radius } = H.SUN;
  H.SUN.coronaTime += 0.008;
  const ct = H.SUN.coronaTime;

  // Shared base color for perfect adjacency
  const sunCol = H.getSolarColors(t);
  const sunBase = `rgba(${sunCol.r},${sunCol.g},${sunCol.b}`;

  // Halos (match sunBase, fade outward)
  for (const [r, a, sp] of [[radius * 5.5, 0.015, 0.0011], [radius * 3.8, 0.03, 0.0017], [radius * 2.5, 0.055, 0.002], [radius * 1.7, 0.09, 0.0025]]) {
    const pulse = 1 + 0.05 * Math.sin(ct * sp * 1000);
    const gr = ctx.createRadialGradient(x, y, radius * 0.6, x, y, r * pulse);
    gr.addColorStop(0, `${sunBase},${a})`);
    gr.addColorStop(0.5, `${sunBase},${a * 0.4})`);
    gr.addColorStop(1, `rgba(${sunCol.r},${Math.max(0,sunCol.g-80)},0,0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, H.PI2); ctx.fill();
  }

  // Flares (synced to sunBase, subtle flicker)
  ctx.save();
  for (let i = 0; i < 12; i++) {
    const angle = (H.PI2 / 12) * i + Math.sin(ct * 0.7 + i) * 0.12;
    const flicker = Math.sin(ct * 1.3 + i * 2.1) * 0.5 + 0.5;
    const len = radius * (0.35 + flicker * 0.5);
    const tipX = x + Math.cos(angle) * (radius + len);
    const tipY = y + Math.sin(angle) * (radius + len);
    const lx = x + Math.cos(angle - Math.PI / 2) * radius * 0.1;
    const ly = y + Math.sin(angle - Math.PI / 2) * radius * 0.1;    const rx = x + Math.cos(angle + Math.PI / 2) * radius * 0.1;
    const ry = y + Math.sin(angle + Math.PI / 2) * radius * 0.1;
    const fg = ctx.createLinearGradient(x, y, tipX, tipY);
    fg.addColorStop(0, `${sunBase},${0.4 * flicker})`);
    fg.addColorStop(0.6, `${sunBase},${0.15 * flicker})`);
    fg.addColorStop(1, `rgba(${Math.max(0,sunCol.r-40)},${Math.max(0,sunCol.g-60)},0,0)`);
    ctx.beginPath(); ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(tipX + Math.cos(angle) * radius * 0.08, tipY + Math.sin(angle) * radius * 0.08, rx, ry);
    ctx.quadraticCurveTo(x + Math.cos(angle) * radius * 0.6, y + Math.sin(angle) * radius * 0.6, lx, ly);
    ctx.fillStyle = fg; ctx.fill();
  }
  ctx.restore();

  // Sphere (white-yellow core → bright yellow → gold edge)
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, radius, 0, H.PI2); ctx.clip();
  const bg = ctx.createRadialGradient(x - radius * 0.15, y - radius * 0.15, 0, x, y, radius);
  bg.addColorStop(0, `${sunBase},1)`);
  bg.addColorStop(0.35, `rgba(${Math.min(255,sunCol.r+15)},${Math.min(255,sunCol.g+10)},${sunCol.b},0.95)`);
  bg.addColorStop(0.8, `${sunBase},0.85)`);
  bg.addColorStop(1, `rgba(${Math.max(0,sunCol.r-30)},${Math.max(0,sunCol.g-50)},0,0.9)`);
  ctx.fillStyle = bg; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  // Granulation (synced to sunBase, subtle depth)
  for (let i = 0; i < 28; i++) {
    const ga = (H.PI2 / 28) * i + ct * 0.025 * (i % 2 ? 1 : -1);
    const gd = (0.35 + 0.5 * (i % 7) / 7) * radius;
    const gx = x + Math.cos(ga) * gd, gy = y + Math.sin(ga) * gd, gr2 = radius * (0.06 + 0.08 * ((i * 7) % 5) / 5);
    const granG = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr2);
    granG.addColorStop(0, `${sunBase},${(0.5 + 0.5 * Math.sin(ct * 2.1 + i * 1.3)) * 0.18})`);
    granG.addColorStop(1, `rgba(${sunCol.r},${Math.max(0,sunCol.g-40)},0,0)`);
    ctx.fillStyle = granG; ctx.beginPath(); ctx.arc(gx, gy, gr2, 0, H.PI2); ctx.fill();
  }

  // Sunspots (subtle dark-gold for contrast, not black)
  for (const [a, d, r, fl] of [[0.8, 0.42, 0.09, 1.1], [2.3, 0.55, 0.06, 0.9], [4.1, 0.35, 0.07, 1.2], [5.5, 0.5, 0.05, 0.8]]) {
    const sa = a + ct * 0.04 * (fl - 0.9);
    const sx = x + Math.cos(sa) * d * radius, sy = y + Math.sin(sa) * d * radius, sr = r * radius;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, 'rgba(140,100,20,0.45)'); sg.addColorStop(0.7, 'rgba(160,120,40,0.2)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, H.PI2); ctx.fill();
  }

  // Specular highlight (pure white-yellow blend)
  const hl = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, 0, x - radius * 0.35, y - radius * 0.35, radius * 0.65);
  hl.addColorStop(0, 'rgba(255,255,255,0.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();

  // Rim & Godrays (perfectly adjacent to sunBase)  
  const rim = ctx.createRadialGradient(x, y, radius * 0.88, x, y, radius * 1.18);
  rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(0.45, `${sunBase},0.12)`); rim.addColorStop(1, `rgba(${sunCol.r},${Math.max(0,sunCol.g-60)},0,0)`);
  ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(x, y, radius * 1.18, 0, H.PI2); ctx.fill();
  ctx.save(); ctx.globalAlpha = 0.025;
  for (let i = 0; i < 6; i++) {
    const sa = ct * 0.05 + (H.PI2 / 6) * i;
    const ex = x + Math.cos(sa) * radius * 18, ey = y + Math.sin(sa) * radius * 18;
    const lx2 = x + Math.cos(sa - Math.PI / 2) * radius * 0.7, ly2 = y + Math.sin(sa - Math.PI / 2) * radius * 0.7;
    const rx2 = x + Math.cos(sa + Math.PI / 2) * radius * 0.7, ry2 = y + Math.sin(sa + Math.PI / 2) * radius * 0.7;
    const sg = ctx.createLinearGradient(x, y, ex, ey);
    sg.addColorStop(0, `${sunBase},1)`); sg.addColorStop(1, `rgba(${Math.max(0,sunCol.r-30)},0,0,0)`);
    ctx.beginPath(); ctx.moveTo(lx2, ly2); ctx.lineTo(ex, ey); ctx.lineTo(rx2, ry2); ctx.closePath();
    ctx.fillStyle = sg; ctx.fill();
  }
  ctx.restore();
};

// ── Synced Yellow Lava Tentacles - newer ─────────────────────
window.Sim.drawSolarTentacles = (t) => {
  const ctx = H.ctx;
  const { x, y, radius } = H.SUN;
  const sunCol = H.getSolarColors(t);
  const sunBase = `rgba(${sunCol.r},${sunCol.g},${sunCol.b}`;

  // Spawn (keep limit for performance)
  if (H.rnd() < 0.25 && H.solarTentacles.length < 28) {
    H.solarTentacles.push({
      angle: H.rnd() * H.PI2, length: 50 + H.rnd() * 80, width: 4 + H.rnd() * 8,
      swaySpeed: 0.018 + H.rnd() * 0.015, phase: H.rnd() * H.PI2, life: 1.0, decay: 0.01 + H.rnd() * 0.01
    });
  }

  // Render
  for (let i = H.solarTentacles.length - 1; i >= 0; i--) {
    const tent = H.solarTentacles[i];
    tent.phase += tent.swaySpeed;
    tent.life -= tent.decay;
    if (tent.life <= 0) { H.solarTentacles.splice(i, 1); continue; }

    const a = tent.angle;
    const len = tent.length * tent.life;
    const w = tent.width * tent.life;
    const sway = Math.sin(tent.phase) * len * 0.35;

    const bx = x + Math.cos(a) * radius;
    const by = y + Math.sin(a) * radius;
    const tx = x + Math.cos(a) * (radius + len) + Math.cos(a + Math.PI/2) * sway;
    const ty = y + Math.sin(a) * (radius + len) + Math.sin(a + Math.PI/2) * sway;
    const cx = x + Math.cos(a) * (radius + len * 0.55) + Math.cos(a + Math.PI/2) * sway * 1.3;
    const cy = y + Math.sin(a) * (radius + len * 0.55) + Math.sin(a + Math.PI/2) * sway * 1.3;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = w; ctx.globalAlpha = tent.life * 0.65;

    // Gradient perfectly matches sun's current yellow phase
    const grad = ctx.createLinearGradient(bx, by, tx, ty);
    grad.addColorStop(0, 'rgba(255,255,245,0.95)');          // White-yellow core
    grad.addColorStop(0.25, `${sunBase},0.9)`);              // Synced to sun
    grad.addColorStop(0.65, `rgba(${Math.max(0,sunCol.r-20)},${Math.max(0,sunCol.g-40)},0,0.5)`);
    grad.addColorStop(1, `rgba(${Math.max(0,sunCol.r-60)},0,0,0)`);
    ctx.strokeStyle = grad;

    ctx.beginPath(); ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke(); ctx.restore();
  }
};

// ── Volumetric Solar Rays & Ambient Glow ────────────
window.Sim.drawSolarRays = (t) => {
  const ctx = H.ctx;
  const { x, y, radius } = H.SUN;
  // Sync with your yellow color cycle
  const sunCol = H.getSolarColors(t);
  const sunBase = `rgba(${sunCol.r},${sunCol.g},${sunCol.b}`;

  ctx.save();
  // 'screen' blend mode adds light to the background (simulates illumination)
  ctx.globalCompositeOperation = 'screen'; 
  ctx.lineCap = 'round';

  const numRays = 16;
  const rotation = t * 0.00004; // Slow organic rotation

  for (let i = 0; i < numRays; i++) {
    // Dynamic angle with subtle wobble
    const angle = (H.PI2 / numRays) * i + rotation + Math.sin(t * 0.0002 + i * 1.2) * 0.25;
    
    // Ray length pulses over time
    const pulse = 1 + Math.sin(t * 0.0005 + i * 0.9) * 0.5;
    const len = radius * (1.5 + pulse * 2.0); // Rays extend 2–4x radius
    
    // Ray width tapers
    const width = (0.06 + Math.sin(t * 0.0003 + i * 2.1) * 0.03) * radius;

    // Coordinates
    const sx = x + Math.cos(angle) * radius * 0.95;
    const sy = y + Math.sin(angle) * radius * 0.95;
    const ex = x + Math.cos(angle) * (radius + len);
    const ey = y + Math.sin(angle) * (radius + len);

    // Perpendicular vectors for width
    const px = -Math.sin(angle);
    const py = Math.cos(angle);

    // Gradient: Bright base -> Transparent tip
    const grad = ctx.createLinearGradient(sx, sy, ex, ey);
    grad.addColorStop(0, `${sunBase}, 0.55)`);       // Bright yellow core
    grad.addColorStop(0.25, `${sunBase}, 0.2)`);      // Mid glow
    grad.addColorStop(0.6, `${sunBase}, 0.05)`);      // Outer haze
    grad.addColorStop(1, `rgba(${sunCol.r},0,0,0)`);  // Fade out

    ctx.fillStyle = grad;
    ctx.beginPath();
    
    // Draw tapered ray polygon
    ctx.moveTo(sx + px * width * 0.6, sy + py * width * 0.6); // Base Left
    ctx.lineTo(ex + px * width * 0.05, ey + py * width * 0.05); // Tip Left
    ctx.lineTo(ex - px * width * 0.05, ey - py * width * 0.05); // Tip Right
    ctx.lineTo(sx - px * width * 0.6, sy - py * width * 0.6); // Base Right
    ctx.closePath();
    ctx.fill();
  }

  // ── Ambient Glow (Simulates space illumination) ──
  // This large gradient "lights up" the background near the sun
  ctx.globalCompositeOperation = 'lighter'; // Stronger blend for ambient wash
  const glowRadius = radius * 6;
  const ambientGrad = ctx.createRadialGradient(x, y, radius * 0.8, x, y, glowRadius);
  ambientGrad.addColorStop(0, `${sunBase}, 0.12)`);
  ambientGrad.addColorStop(0.4, `${sunBase}, 0.04)`);
  ambientGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ambientGrad;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, H.PI2);
  ctx.fill();
  
  ctx.restore();
};

/*
window.Sim.drawSun = t => {
  const ctx = H.ctx;
  const { x, y, radius } = H.SUN;
  H.SUN.coronaTime += 0.008;
  const ct = H.SUN.coronaTime;

  // 🔥 Dynamic burn color (synced with tentacles)
  const sunCol = H.getSolarColors(t);
  const sunBase = `rgba(${sunCol.r},${sunCol.g},${sunCol.b}`;

  // Halos
  for (const [r, a, sp] of [[radius * 5.5, 0.015, 0.0011], [radius * 3.8, 0.03, 0.0017], [radius * 2.5, 0.055, 0.002], [radius * 1.7, 0.09, 0.0025]]) {
    const pulse = 1 + 0.06 * Math.sin(ct * sp * 1000);
    const gr = ctx.createRadialGradient(x, y, radius * 0.6, x, y, r * pulse);
    gr.addColorStop(0, `${sunBase},${a})`);
    gr.addColorStop(0.4, `${sunBase},${a * 0.4})`);
    gr.addColorStop(1, `rgba(${sunCol.r},${Math.max(0,sunCol.g-100)},0,0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, H.PI2); ctx.fill();
  }

  // Flares
  ctx.save();
  for (let i = 0; i < 12; i++) {
    const angle = (H.PI2 / 12) * i + Math.sin(ct * 0.7 + i) * 0.15;
    const flicker = Math.sin(ct * 1.3 + i * 2.1) * 0.5 + 0.5;
    const len = radius * (0.35 + flicker * 0.55);
    const tipX = x + Math.cos(angle) * (radius + len);
    const tipY = y + Math.sin(angle) * (radius + len);
    const lx = x + Math.cos(angle - Math.PI / 2) * radius * 0.12;
    const ly = y + Math.sin(angle - Math.PI / 2) * radius * 0.12;
    const rx = x + Math.cos(angle + Math.PI / 2) * radius * 0.12;
    const ry = y + Math.sin(angle + Math.PI / 2) * radius * 0.12;
    const fg = ctx.createLinearGradient(x, y, tipX, tipY);
    fg.addColorStop(0, `${sunBase},${0.35 * flicker})`);
    fg.addColorStop(0.5, `${sunBase},${0.15 * flicker})`);
    fg.addColorStop(1, `rgba(${sunCol.r},40,0,0)`);
    ctx.beginPath(); ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(tipX + Math.cos(angle) * radius * 0.1, tipY + Math.sin(angle) * radius * 0.1, rx, ry);
    ctx.quadraticCurveTo(x + Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.7, lx, ly);
    ctx.fillStyle = fg; ctx.fill();
  }
  ctx.restore();

  // Sphere
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, radius, 0, H.PI2); ctx.clip();
  const bg = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.2, 0, x, y, radius);
  bg.addColorStop(0, `${sunBase},1)`);
  bg.addColorStop(0.3, `${sunBase},0.85)`);
  bg.addColorStop(0.7, `rgba(${Math.min(255,sunCol.r+15)},${Math.max(0,sunCol.g-50)},0,0.8)`);
  bg.addColorStop(1, `rgba(${Math.max(0,sunCol.r-60)},0,0,0.95)`);
  ctx.fillStyle = bg; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  // Granulation
  for (let i = 0; i < 28; i++) {
    const ga = (H.PI2 / 28) * i + ct * 0.03 * (i % 2 ? 1 : -1);
    const gd = (0.35 + 0.5 * (i % 7) / 7) * radius;
    const gx = x + Math.cos(ga) * gd, gy = y + Math.sin(ga) * gd, gr2 = radius * (0.06 + 0.08 * ((i * 7) % 5) / 5);
    const granG = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr2);
    granG.addColorStop(0, `${sunBase},${(0.5 + 0.5 * Math.sin(ct * 2.1 + i * 1.3)) * 0.22})`);
    granG.addColorStop(1, `rgba(${sunCol.r},50,0,0)`);
    ctx.fillStyle = granG; ctx.beginPath(); ctx.arc(gx, gy, gr2, 0, H.PI2); ctx.fill();
  }

  // Sunspots
  for (const [a, d, r, fl] of [[0.8, 0.42, 0.09, 1.1], [2.3, 0.55, 0.06, 0.9], [4.1, 0.35, 0.07, 1.2], [5.5, 0.5, 0.05, 0.8]]) {
    const sa = a + ct * 0.04 * (fl - 0.9);
    const sx = x + Math.cos(sa) * d * radius, sy = y + Math.sin(sa) * d * radius, sr = r * radius;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, 'rgba(15,5,0,0.7)'); sg.addColorStop(0.6, 'rgba(50,10,0,0.4)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, H.PI2); ctx.fill();
  }

  // Specular
  const hl = ctx.createRadialGradient(x - radius * 0.38, y - radius * 0.42, 0, x - radius * 0.38, y - radius * 0.42, radius * 0.7);
  hl.addColorStop(0, `rgba(255,255,255,0.28)`); hl.addColorStop(1, `rgba(255,255,255,0)`);
  ctx.fillStyle = hl; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();

  // Rim + Godrays
  const rim = ctx.createRadialGradient(x, y, radius * 0.88, x, y, radius * 1.22);
  rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(0.4, `${sunBase},0.12)`); rim.addColorStop(1, `rgba(${sunCol.r},30,0,0)`);
  ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(x, y, radius * 1.22, 0, H.PI2); ctx.fill();
  ctx.save(); ctx.globalAlpha = 0.025;
  for (let i = 0; i < 6; i++) {
    const sa = ct * 0.05 + (H.PI2 / 6) * i;
    const ex = x + Math.cos(sa) * radius * 18, ey = y + Math.sin(sa) * radius * 18;
    const lx2 = x + Math.cos(sa - Math.PI / 2) * radius * 0.8, ly2 = y + Math.sin(sa - Math.PI / 2) * radius * 0.8;
    const rx2 = x + Math.cos(sa + Math.PI / 2) * radius * 0.8, ry2 = y + Math.sin(sa + Math.PI / 2) * radius * 0.8;
    const sg = ctx.createLinearGradient(x, y, ex, ey);
    sg.addColorStop(0, `${sunBase},1)`); sg.addColorStop(1, `rgba(${sunCol.r},40,0,0)`);
    ctx.beginPath(); ctx.moveTo(lx2, ly2); ctx.lineTo(ex, ey); ctx.lineTo(rx2, ry2); ctx.closePath();
    ctx.fillStyle = sg; ctx.fill();
  }
  ctx.restore();
};

*/

/*
//* ── Solar Lava Tentacles (Purely Visual) ──────────────
window.Sim.drawSolarTentacles = (t) => {
  const ctx = window.Sim.ctx;
  const { x, y, radius } = window.Sim.SUN;
  const H = window.Sim;

  // Spawn new tentacles slowly
  if (H.rnd() < 0.15 && H.solarTentacles.length < 13) {
    H.solarTentacles.push({
      angle: H.rnd() * H.PI2,
      length: 60 + H.rnd() * 120,
      width: 8 + H.rnd() * 7,
      swaySpeed: 0.015 + H.rnd() * 0.0005,
      phase: H.rnd() * H.PI2,
      life: 1.50,
      decay: 0.008 + H.rnd() * 0.012
    });
  }

  // Update & render
  for (let i = H.solarTentacles.length - 1; i >= 0; i--) {
    const tent = H.solarTentacles[i];
    tent.phase += tent.swaySpeed;
    tent.life -= tent.decay;

    if (tent.life <= 0) { H.solarTentacles.splice(i, 1); continue; }

    const a = tent.angle;
    const len = tent.length * tent.life;
    const w = tent.width * tent.life;
    const sway = Math.sin(tent.phase) * len * 0.35;

    // Base: attached to sun surface
    const bx = x + Math.cos(a) * radius;
    const by = y + Math.sin(a) * radius;

    // Tip: extends outward + curves with sway
    const tx = x + Math.cos(a) * (radius + len) + Math.cos(a + Math.PI/2) * sway;
    const ty = y + Math.sin(a) * (radius + len) + Math.sin(a + Math.PI/2) * sway;

    // Control point for smooth curve
    const cx = x + Math.cos(a) * (radius + len * 0.6) + Math.cos(a + Math.PI/2) * sway * 1.4;
    const cy = y + Math.sin(a) * (radius + len * 0.6) + Math.sin(a + Math.PI/2) * sway * 1.4;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = w;
    ctx.globalAlpha = tent.life * 0.55;

    // Plasma gradient: hot core → glowing edge → fade out
    const grad = ctx.createLinearGradient(bx, by, tx, ty);
    grad.addColorStop(0, 'rgba(255,245,180,1)');
    grad.addColorStop(0.3, 'rgba(255,160,50,0.95)');
    grad.addColorStop(0.7, 'rgba(220,60,10,0.6)');
    grad.addColorStop(1, 'rgba(180,30,0,0)');
    ctx.strokeStyle = grad;

    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke();
    ctx.restore();
  }
};
*/// old version
/*
window.Sim.drawSolarTentacles = (t) => {
  const ctx = H.ctx;
  const { x, y, radius } = H.SUN;
  const sunCol = H.getSolarColors(t);
  const sunBase = `rgba(${sunCol.r},${sunCol.g},${sunCol.b}`;

  // Spawn
  if (H.rnd() < 0.25 && H.solarTentacles.length < 28) {
    H.solarTentacles.push({
      angle: H.rnd() * H.PI2, length: 60 + H.rnd() * 90, width: 3 + H.rnd() * 7,
      swaySpeed: 0.015 + H.rnd() * 0.02, phase: H.rnd() * H.PI2, life: 1.0, decay: 0.008 + H.rnd() * 0.012
    });
  }

  // Render
  for (let i = H.solarTentacles.length - 1; i >= 0; i--) {
    const tent = H.solarTentacles[i];
    tent.phase += tent.swaySpeed;
    tent.life -= tent.decay;
    if (tent.life <= 0) { H.solarTentacles.splice(i, 1); continue; }

    const a = tent.angle;
    const len = tent.length * tent.life;
    const w = tent.width * tent.life;
    const sway = Math.sin(tent.phase) * len * 0.35;

    const bx = x + Math.cos(a) * radius;
    const by = y + Math.sin(a) * radius;
    const tx = x + Math.cos(a) * (radius + len) + Math.cos(a + Math.PI/2) * sway;
    const ty = y + Math.sin(a) * (radius + len) + Math.sin(a + Math.PI/2) * sway;
    const cx = x + Math.cos(a) * (radius + len * 0.6) + Math.cos(a + Math.PI/2) * sway * 1.4;
    const cy = y + Math.sin(a) * (radius + len * 0.6) + Math.sin(a + Math.PI/2) * sway * 1.4;

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = w; ctx.globalAlpha = tent.life * 0.6;

    // 🔥 Gradient perfectly matches the Sun's current burn phase
    const grad = ctx.createLinearGradient(bx, by, tx, ty);
    grad.addColorStop(0, `rgba(255,255,255,0.95)`);               // White-hot core
    grad.addColorStop(0.25, `${sunBase},0.95)`);                   // Synced to sun
    grad.addColorStop(0.65, `rgba(${Math.max(0,sunCol.r-50)},${Math.max(0,sunCol.g-70)},0,0.5)`);
    grad.addColorStop(1, `rgba(${Math.max(0,sunCol.r-100)},0,0,0)`);
    ctx.strokeStyle = grad;

    ctx.beginPath(); ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke(); ctx.restore();
  }
};
*/

window.Sim.drawLoose = () => {
  const hot = [], warm = [], cool = new Map(), ring = new Map();
  for (const p of window.Sim.state.loose) {
    const life = Math.min(p.life, 1), r = Math.max(0.01, window.Sim.config.PARTICLE_R * (p.isRing ? 1.4 : 1) * life), a = life;
    if (p.isRing) { const key = p.pal.gc; if (!ring.has(key)) ring.set(key, []); ring.get(key).push([p.x, p.y, r, a * 0.85]); }
    else if (p.heat > 0.6) hot.push([p.x, p.y, r, a * 0.9]);
    else if (p.heat > 0.3) warm.push([p.x, p.y, r, a * 0.85]);
    else { const key = p.pal.gc; if (!cool.has(key)) cool.set(key, []); cool.get(key).push([p.x, p.y, r, a * 0.8]); }
  }
  const drawBatch = (style, arr) => { if (!arr.length) return; window.Sim.ctx.fillStyle = style; for (const [x, y, r, a] of arr) { window.Sim.ctx.globalAlpha = a; window.Sim.ctx.beginPath(); window.Sim.ctx.arc(x, y, r, 0, H.PI2); window.Sim.ctx.fill(); } };
  for (const [gc, pts] of ring) { window.Sim.ctx.shadowBlur = 3; window.Sim.ctx.shadowColor = `rgba(${gc},.6)`; drawBatch(`rgba(${gc},1)`, pts); window.Sim.ctx.shadowBlur = 0; }
  drawBatch("rgba(255,220,80,1)", hot); drawBatch("rgba(255,100,30,1)", warm);
  for (const [gc, pts] of cool) drawBatch(`rgba(${gc},1)`, pts);
  window.Sim.ctx.globalAlpha = 1;
};

// ── Dynamic Burn & Destruction Visuals ────────────────────
window.Sim.drawBody = body => {
  const ctx = window.Sim.ctx;
  const H = window.Sim;

  const { particles: ps, springs: ss, pal } = body;

  // 1. Collect alive particles
  const alive = [];
  for (const p of ps) if (!p.dead) alive.push(p);
  if (alive.length < 3) return;

  // 2. Compute Hull
  const hull = H.convexHull(alive);
  if (hull.length < 3) return;

  // 3. Calculate Burn Intensity based on distance to Sun
  const sdx = H.SUN.x - body.cx;
  const sdy = H.SUN.y - body.cy;
  const sDist = Math.hypot(sdx, sdy);
  
  // Burning starts at 2.5x burnRadius, intensifies closer in
  const burnZoneRadius = H.SUN.burnRadius * 2.5;
  let burnFactor = 0;
  if (sDist < burnZoneRadius) {
    burnFactor = 1 - (sDist / burnZoneRadius);
    // Pulse the burn effect for a "living fire" look
    burnFactor *= (0.9 + 0.1 * Math.sin(H.SUN.coronaTime * 15));
    burnFactor = Math.max(0, Math.min(1, burnFactor));
  }

  // 4. Draw Base Hull
  ctx.save();
  ctx.beginPath(); ctx.moveTo(hull[0].x, hull[0].y);
  for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
  ctx.closePath();

  // Base Gradient (Normal Planet Color)
  const gr = ctx.createRadialGradient(body.cx, body.cy, 0, body.cx, body.cy, body.radius);
  gr.addColorStop(0, pal.hi + 'dd');
  gr.addColorStop(0.35, pal.mid + 'cc');
  gr.addColorStop(0.75, pal.lo + 'bb');
  gr.addColorStop(1, pal.lo + '44');
  ctx.fillStyle = gr;
  ctx.fill();

  // 🔥 Burn Overlay (Charred Surface + Molten Core)
  if (burnFactor > 0.05) {
    const burnGrad = ctx.createRadialGradient(body.cx, body.cy, 0, body.cx, body.cy, body.radius * 1.1);
    // Molten Core    burnGrad.addColorStop(0, `rgba(255, 240, 100, ${burnFactor * 0.7})`);
    // Red Hot Mantle
    burnGrad.addColorStop(0.4, `rgba(220, 60, 10, ${burnFactor * 0.8})`);
    // Charred Crust
    burnGrad.addColorStop(0.8, `rgba(30, 5, 0, ${burnFactor * 0.9})`);
    // Blackened Edges
    burnGrad.addColorStop(1, `rgba(0, 0, 0, ${burnFactor * 0.95})`);

    ctx.fillStyle = burnGrad;
    ctx.fill(); // Overlays the base gradient
  }

  // 🔥 Fiery Rim Glow
  if (burnFactor > 0.1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // Additive blending for glow
    ctx.strokeStyle = `rgba(255, 120, 20, ${burnFactor * 0.9})`;
    ctx.lineWidth = (2 + burnFactor * 2) / H.cam.zoom;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.strokeStyle = `rgba(${pal.gc}, .35)`;
    ctx.lineWidth = 1.5 / H.cam.zoom;
    ctx.stroke();
  }
  ctx.restore();

  // 5. Draw Stressed Springs
  ctx.save(); ctx.globalAlpha = .08; ctx.strokeStyle = `rgba(${pal.gc}, .9)`;
  ctx.lineWidth = .8 / H.cam.zoom; ctx.beginPath();
  for (const sp of ss) {
    if (sp.broken) continue;
    const pa = ps[sp.a], pb = ps[sp.b]; if (pa.dead || pb.dead) continue;
    if (Math.hypot(pb.x - pa.x, pb.y - pa.y) / sp.restLen < 1.1) continue;
    ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
  }
  ctx.stroke(); ctx.restore();

  // 6. Draw Particles
  // Cool particles
  ctx.fillStyle = `rgba(${pal.gc}, .75)`;
  ctx.beginPath();
  for (const p of alive) {
    if (p.heat > .05) continue;
    const r = p.isCore ? H.config.PARTICLE_R * 1.3 : H.config.PARTICLE_R;
    ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, H.PI2);
    p.heat = Math.max(0, p.heat - .012);
  }
  ctx.fill();
  // Hot particles (Intensified when burning)
  for (const p of alive) {
    if (p.heat <= .05) continue;
    const r = p.isCore ? H.config.PARTICLE_R * 1.3 : H.config.PARTICLE_R;
    
    // If burning, particles become super-hot yellow/white
    const heatColor = burnFactor > 0.5 
      ? `rgba(255, ${Math.floor(H.lerp(220, 255, p.heat))}, 150, ${p.heat})` 
      : `rgba(255, ${Math.floor(H.lerp(60, 220, p.heat))}, 30, ${p.heat * .9})`;
      
    ctx.fillStyle = heatColor;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, H.PI2); ctx.fill();
    p.heat = Math.max(0, p.heat - .012);
  }

  // 7. Atmosphere Halo (Burns Orange/Red)
  ctx.save();
  const atmColor = burnFactor > 0.1 
    ? `rgba(255, 100, 20, ${0.15 + burnFactor * 0.4})` 
    : `rgba(${pal.gc}, .08)`;

  const atm = ctx.createRadialGradient(body.cx, body.cy, body.radius * .7, body.cx, body.cy, body.radius * 1.8);
  atm.addColorStop(0, atmColor);
  atm.addColorStop(1, `rgba(${pal.gc}, 0)`);
  ctx.fillStyle = atm;
  ctx.beginPath(); ctx.arc(body.cx, body.cy, body.radius * 1.8, 0, H.PI2); ctx.fill();
  ctx.restore();
};

/*
function drawBody(body){
    const {particles:ps, springs:ss, pal} = body;
    
    // 1. Collect alive particles
    const alive = [];
    for(const p of ps) if(!p.dead) alive.push(p);
    if(alive.length < 3) return;
    
    // 2. Calculate Hull
    const hull = convexHull(alive);

    // ── BASE FILL ──
    if(hull.length > 2){
        ctx.save();
        ctx.beginPath(); ctx.moveTo(hull[0].x, hull[0].y);
        for(let i=1; i<hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
        ctx.closePath();
        
        const gr = ctx.createRadialGradient(body.cx, body.cy, 0, body.cx, body.cy, body.radius);
        gr.addColorStop(0, pal.hi+'dd'); gr.addColorStop(0.35, pal.mid+'cc');
        gr.addColorStop(0.75, pal.lo+'bb'); gr.addColorStop(1, pal.lo+'44');
        ctx.fillStyle = gr; ctx.fill();
        ctx.strokeStyle = `rgba(${pal.gc},.35)`;
        ctx.lineWidth = 1.5/cam.zoom; ctx.stroke();
        ctx.restore();
    }

    // ── STRESSED SPRINGS ──
    ctx.save(); ctx.globalAlpha = .08; ctx.strokeStyle = `rgba(${pal.gc},.9)`;
    ctx.lineWidth = .8/cam.zoom; ctx.beginPath();
    for(const sp of ss){
        if(sp.broken) continue;
        const pa=ps[sp.a], pb=ps[sp.b]; if(pa.dead||pb.dead) continue;
        if(Math.hypot(pb.x-pa.x, pb.y-pa.y)/sp.restLen < 1.1) continue;
        ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke(); ctx.restore();

    // ── PARTICLES (Cool & Hot) ──
    ctx.fillStyle = `rgba(${pal.gc},.75)`;
    ctx.beginPath();
    for(const p of alive){
        if(p.heat > .05) continue;
        const r = p.isCore ? PARTICLE_R*1.3 : PARTICLE_R;
        ctx.moveTo(p.x+r, p.y); ctx.arc(p.x, p.y, r, 0, PI2);
        p.heat = Math.max(0, p.heat - .012);
    }
    ctx.fill();
    
    for(const p of alive){        if(p.heat <= .05) continue;
        const r = p.isCore ? PARTICLE_R*1.3 : PARTICLE_R;
        ctx.fillStyle = `rgba(255,${Math.floor(lerp(60,220,p.heat))},30,${p.heat*.9})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, PI2); ctx.fill();
        p.heat = Math.max(0, p.heat - .012);
    }

    // ── NEW: REAL-TIME DAY/NIGHT CYCLE (Hard Terminator) ──
    // Calculates the exact angle to the Sun and draws a sharp shadow on the dark side.
    const sunDx = SUN.x - body.cx;
    const sunDy = SUN.y - body.cy;
    const sunDist = Math.hypot(sunDx, sunDy) || 1;
    
    // Normalized vector pointing TO the Sun
    const nx = sunDx / sunDist;
    const ny = sunDy / sunDist;

    ctx.save();
    // Clip the shadow strictly to the planet's hull shape
    ctx.beginPath();
    ctx.moveTo(hull[0].x, hull[0].y);
    for(let i=1; i<hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
    ctx.closePath();
    ctx.clip();

    // Define gradient bounds: from Deep Night side to Deep Day side
    // We extend far beyond the radius to ensure full coverage
    const lx = body.cx + nx * body.radius * 4; // Light side point
    const ly = body.cy + ny * body.radius * 4;
    const dx = body.cx - nx * body.radius * 4; // Dark side point
    const dy = body.cy - ny * body.radius * 4;

    // Create a Linear Gradient that goes from Day -> Night
    const shadow = ctx.createLinearGradient(lx, ly, dx, dy);
    
    // STOPS: 0.0 to 0.48 are Day (Transparent)
    //        0.48 to 0.52 is the TERMINATOR (Sharp line)
    //        0.52 to 1.0 is Night (Dark)
    shadow.addColorStop(0.00, 'rgba(0,0,0,0)');
    shadow.addColorStop(0.48, 'rgba(0,0,0,0)');      // Day limit
    shadow.addColorStop(0.52, 'rgba(0,0,0,0.92)');   // Hard Night start
    shadow.addColorStop(1.00, 'rgba(0,0,0,0.98)');   // Deep Night
    
    ctx.fillStyle = shadow;
    ctx.fillRect(dx - body.radius*2, dy - body.radius*2, body.radius*8, body.radius*8);
    ctx.restore();

    // ── ATMOSPHERE HALO ──
    // Drawn after shadow so it glows around the edges (even on night side)
    const atm = ctx.createRadialGradient(body.cx, body.cy, body.radius*.7, body.cx, body.cy, body.radius*1.8);    atm.addColorStop(0, `rgba(${pal.gc},.08)`); 
    atm.addColorStop(1, `rgba(${pal.gc},0)`);
    ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(body.cx, body.cy, body.radius*1.8, 0, PI2); ctx.fill();
}
*/
/*
window.Sim.drawBody = body => {
  const { particles: ps, springs: ss, pal } = body;
  const alive = []; for (const p of ps) if (!p.dead) alive.push(p); if (alive.length < 3) return;
  const hull = window.Sim.convexHull(alive); if (hull.length < 3) return;
  window.Sim.ctx.save(); window.Sim.ctx.beginPath(); window.Sim.ctx.moveTo(hull[0].x, hull[0].y); for (let i = 1; i < hull.length; i++) window.Sim.ctx.lineTo(hull[i].x, hull[i].y); window.Sim.ctx.closePath();
  const gr = window.Sim.ctx.createRadialGradient(body.cx, body.cy, 0, body.cx, body.cy, body.radius); gr.addColorStop(0, pal.hi + "dd"); gr.addColorStop(0.35, pal.mid + "cc"); gr.addColorStop(0.75, pal.lo + "bb"); gr.addColorStop(1, pal.lo + "44"); window.Sim.ctx.fillStyle = gr; window.Sim.ctx.fill(); window.Sim.ctx.strokeStyle = `rgba(${pal.gc},.35)`; window.Sim.ctx.lineWidth = 1.5 / window.Sim.cam.zoom; window.Sim.ctx.stroke(); window.Sim.ctx.restore();
  window.Sim.ctx.save(); window.Sim.ctx.globalAlpha = 0.08; window.Sim.ctx.strokeStyle = `rgba(${pal.gc},.9)`; window.Sim.ctx.lineWidth = 0.8 / window.Sim.cam.zoom; window.Sim.ctx.beginPath();
  for (const sp of ss) { if (sp.broken) continue; const pa = ps[sp.a], pb = ps[sp.b]; if (pa.dead || pb.dead) continue; if (H.hypot(pb.x - pa.x, pb.y - pa.y) / sp.restLen < 1.1) continue; window.Sim.ctx.moveTo(pa.x, pa.y); window.Sim.ctx.lineTo(pb.x, pb.y); }
  window.Sim.ctx.stroke(); window.Sim.ctx.restore();
  window.Sim.ctx.fillStyle = `rgba(${pal.gc},.75)`; window.Sim.ctx.beginPath(); for (const p of alive) { if (p.heat > 0.05) continue; const r = p.isCore ? window.Sim.config.PARTICLE_R * 1.3 : window.Sim.config.PARTICLE_R; window.Sim.ctx.moveTo(p.x + r, p.y); window.Sim.ctx.arc(p.x, p.y, r, 0, H.PI2); p.heat = Math.max(0, p.heat - 0.012); } window.Sim.ctx.fill();
  for (const p of alive) { if (p.heat <= 0.05) continue; const r = p.isCore ? window.Sim.config.PARTICLE_R * 1.3 : window.Sim.config.PARTICLE_R; window.Sim.ctx.fillStyle = `rgba(255,${Math.floor(H.lerp(60, 220, p.heat))},30,${p.heat * 0.9})`; window.Sim.ctx.beginPath(); window.Sim.ctx.arc(p.x, p.y, r, 0, H.PI2); window.Sim.ctx.fill(); p.heat = Math.max(0, p.heat - 0.012); }
  const atm = window.Sim.ctx.createRadialGradient(body.cx, body.cy, body.radius * 0.7, body.cx, body.cy, body.radius * 1.8); atm.addColorStop(0, `rgba(${pal.gc},.08)`); atm.addColorStop(1, `rgba(${pal.gc},0)`); window.Sim.ctx.fillStyle = atm; window.Sim.ctx.beginPath(); window.Sim.ctx.arc(body.cx, body.cy, body.radius * 1.8, 0, H.PI2); window.Sim.ctx.fill();
};
*/ //old version
/*
function drawBody(body){
  const {particles:ps,springs:ss,pal}=body;
  const alive=[]; for(const p of ps) if(!p.dead) alive.push(p);
  if(alive.length<3) return;
  const hull=convexHull(alive);
  
  // ── BASE FILL & OUTLINE ──
  if(hull.length>2){
    ctx.save();
    ctx.beginPath(); ctx.moveTo(hull[0].x,hull[0].y);
    for(let i=1;i<hull.length;i++) ctx.lineTo(hull[i].x,hull[i].y);
    ctx.closePath();
    const gr=ctx.createRadialGradient(body.cx,body.cy,0,body.cx,body.cy,body.radius);
    gr.addColorStop(0,pal.hi+'dd'); gr.addColorStop(0.35,pal.mid+'cc');
    gr.addColorStop(0.75,pal.lo+'bb'); gr.addColorStop(1,pal.lo+'44');
    ctx.fillStyle=gr; ctx.fill();
    ctx.strokeStyle=`rgba(${pal.gc},.35)`;
    ctx.lineWidth=1.5/cam.zoom; ctx.stroke();
    ctx.restore();
  }

  // ── REAL-TIME SUN LIGHTING & SHADING ──
  const dx = SUN.x - body.cx, dy = SUN.y - body.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx/dist, ny = dy/dist;
  
  // Contrast fades with distance (strong when close, soft when far)
  const intensity = Math.max(0.1, 1 - dist / (SUN.radius * 25));
  
  // Gradient spans across planet: shadow side → sunlit side
  const sx = body.cx - nx * body.radius * 1.5;
  const sy = body.cy - ny * body.radius * 1.5;
  const ex = body.cx + nx * body.radius * 1.5;
  const ey = body.cy + ny * body.radius * 1.5;
  
  const lightGrad = ctx.createLinearGradient(sx, sy, ex, ey);
  lightGrad.addColorStop(0, `rgba(0,0,0,${0.75 * intensity})`);        // Deep shadow
  lightGrad.addColorStop(0.35, `rgba(0,0,0,${0.35 * intensity})`);      // Mid shadow
  lightGrad.addColorStop(0.65, `rgba(255,255,240,${0.05 * intensity})`); // Transition zone
  lightGrad.addColorStop(1, `rgba(255,245,200,${0.35 * intensity})`);   // Sunlit edge
  
  ctx.save();
  ctx.beginPath(); ctx.moveTo(hull[0].x,hull[0].y);
  for(let i=1;i<hull.length;i++) ctx.lineTo(hull[i].x,hull[i].y);
  ctx.closePath();
  ctx.clip(); // Restrict lighting to planet hull
  ctx.fillStyle = lightGrad;
  ctx.fillRect(sx - body.radius, sy - body.radius, body.radius*3, body.radius*3);
  ctx.restore();
  // ──────────────────────────────────────

  // Stressed springs — single batched path
  ctx.save(); ctx.globalAlpha=.08; ctx.strokeStyle=`rgba(${pal.gc},.9)`;
  ctx.lineWidth=.8/cam.zoom; ctx.beginPath();
  for(const sp of ss){
    if(sp.broken) continue;
    const pa=ps[sp.a],pb=ps[sp.b]; if(pa.dead||pb.dead) continue;
    if(Math.hypot(pb.x-pa.x,pb.y-pa.y)/sp.restLen<1.1) continue;
    ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y);
  }
  ctx.stroke(); ctx.restore();
  
  // Cool particles — one big batched path
  ctx.fillStyle=`rgba(${pal.gc},.75)`;
  ctx.beginPath();
  for(const p of alive){
    if(p.heat>.05) continue;
    const r=p.isCore?PARTICLE_R*1.3:PARTICLE_R;
    ctx.moveTo(p.x+r,p.y); ctx.arc(p.x,p.y,r,0,PI2);
    p.heat=Math.max(0,p.heat-.012);
  }
  ctx.fill();
  
  // Hot particles — small batch, individual draws
  for(const p of alive){
    if(p.heat<=.05) continue;
    const r=p.isCore?PARTICLE_R*1.3:PARTICLE_R;
    ctx.fillStyle=`rgba(255,${Math.floor(lerp(60,220,p.heat))},30,${p.heat*.9})`;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,PI2); ctx.fill();
    p.heat=Math.max(0,p.heat-.012);
  }
  
  // Atmosphere halo
  const atm=ctx.createRadialGradient(body.cx,body.cy,body.radius*.7,body.cx,body.cy,body.radius*1.8);
  atm.addColorStop(0,`rgba(${pal.gc},.08)`); atm.addColorStop(1,`rgba(${pal.gc},0)`);
  ctx.fillStyle=atm; ctx.beginPath(); ctx.arc(body.cx,body.cy,body.radius*1.8,0,PI2); ctx.fill();
}
*/
/*
function drawBody(body){
  const {particles:ps,springs:ss,pal}=body;
  const alive=[]; for(const p of ps) if(!p.dead) alive.push(p);
  if(alive.length<3) return;
  const hull=convexHull(alive);

  // 1. Draw the Base Planet (Lit side colors)
  if(hull.length>2){
    ctx.save();
    ctx.beginPath(); ctx.moveTo(hull[0].x,hull[0].y);
    for(let i=1;i<hull.length;i++) ctx.lineTo(hull[i].x,hull[i].y);
    ctx.closePath();
    
    // Base texture
    const gr=ctx.createRadialGradient(body.cx,body.cy,0,body.cx,body.cy,body.radius);
    gr.addColorStop(0,pal.hi+'dd'); gr.addColorStop(0.35,pal.mid+'cc');
    gr.addColorStop(0.75,pal.lo+'bb'); gr.addColorStop(1,pal.lo+'44');
    ctx.fillStyle=gr; ctx.fill();
    ctx.strokeStyle=`rgba(${pal.gc},.35)`;
    ctx.lineWidth=1.5/cam.zoom; ctx.stroke();
    ctx.restore();
  }

  // 2. Draw Internal Details (Springs & Particles)
  // Stressed springs
  ctx.save(); ctx.globalAlpha=.08; ctx.strokeStyle=`rgba(${pal.gc},.9)`;
  ctx.lineWidth=.8/cam.zoom; ctx.beginPath();
  for(const sp of ss){
    if(sp.broken) continue;
    const pa=ps[sp.a],pb=ps[sp.b]; if(pa.dead||pb.dead) continue;
    if(Math.hypot(pb.x-pa.x,pb.y-pa.y)/sp.restLen<1.1) continue;
    ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y);
  }
  ctx.stroke(); ctx.restore();

  // Particles
  ctx.fillStyle=`rgba(${pal.gc},.75)`;
  ctx.beginPath();
  for(const p of alive){
    if(p.heat>.05) continue;
    const r=p.isCore?PARTICLE_R*1.3:PARTICLE_R;
    ctx.moveTo(p.x+r,p.y); ctx.arc(p.x,p.y,r,0,PI2);
    p.heat=Math.max(0,p.heat-.012);
  }
  ctx.fill();
  for(const p of alive){
    if(p.heat<=.05) continue;
    const r=p.isCore?PARTICLE_R*1.3:PARTICLE_R;
    ctx.fillStyle=`rgba(255,${Math.floor(lerp(60,220,p.heat))},30,${p.heat*.9})`;
    ctx.beginPath(); ctx.arc(p.x,p.y,r,0,PI2); ctx.fill();
    p.heat=Math.max(0,p.heat-.012);
  }
  
  // 3. Draw Earth-like Day/Night Shadow
  // Calculates angle to sun and clips a dark gradient over the dark side
  // Note: Uses the global SUN object defined in your script
  const dx = SUN.x - body.cx;
  const dy = SUN.y - body.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx/dist; // Normalized vector pointing TO sun
  const ny = dy/dist;

  // Gradient bounds: Extend past the planet radius to ensure full coverage
  const lx = body.cx + nx * body.radius * 3; // Light source side
  const ly = body.cy + ny * body.radius * 3;
  const dx2 = body.cx - nx * body.radius * 3; // Dark side
  const dy2 = body.cy - ny * body.radius * 3;

  ctx.save();
  // Clip strictly to the planet's hull
  if(hull.length>2){
    ctx.beginPath(); ctx.moveTo(hull[0].x,hull[0].y);
    for(let i=1;i<hull.length;i++) ctx.lineTo(hull[i].x,hull[i].y);
    ctx.closePath();
    ctx.clip();
  } else {
     ctx.beginPath(); ctx.arc(body.cx, body.cy, body.radius, 0, PI2); ctx.clip();
  }

  // The Shadow Gradient (Soft terminator for atmospheric feel)
  const shadow = ctx.createLinearGradient(lx, ly, dx2, dy2);
  shadow.addColorStop(0.0, 'rgba(0,0,0,0)');    // Fully lit
  shadow.addColorStop(0.4, 'rgba(0,0,0,0)');    // Start of terminator
  shadow.addColorStop(0.55, 'rgba(0,0,0,0.15)');// Twilight
  shadow.addColorStop(0.7,  'rgba(0,0,0,0.75)');// Dark side
  shadow.addColorStop(1.0,  'rgba(0,0,0,0.95)');// Deep night
  ctx.fillStyle = shadow;
  ctx.fillRect(dx2 - body.radius*2, dy2 - body.radius*2, body.radius*8, body.radius*8);
  ctx.restore();

  // 4. Atmosphere Halo (Unshadowed rim glow)
  const atm=ctx.createRadialGradient(body.cx,body.cy,body.radius*.7,body.cx,body.cy,body.radius*1.8);
  atm.addColorStop(0,`rgba(${pal.gc},.08)`); atm.addColorStop(1,`rgba(${pal.gc},0)`);
  ctx.fillStyle=atm; ctx.beginPath(); ctx.arc(body.cx,body.cy,body.radius*1.8,0,PI2); ctx.fill();
}
*/

window.Sim.drawCharge = () => {
  if (!window.Sim.holding) return;
  const charge = Math.min((performance.now() - window.Sim.holdT) / 2000, 1);
  const r = H.clamp(parseFloat(window.Sim.slider.value) * (1 + charge * 4) * 8, 16, 110) * charge;
  window.Sim.ctx.beginPath(); window.Sim.ctx.arc(window.Sim.tx, window.Sim.ty, r, 0, H.PI2); window.Sim.ctx.strokeStyle = `rgba(255,190,50,${0.15 + charge * 0.3})`; window.Sim.ctx.lineWidth = 1; window.Sim.ctx.setLineDash([4, 4]); window.Sim.ctx.stroke(); window.Sim.ctx.setLineDash([]);
  window.Sim.ctx.beginPath(); window.Sim.ctx.arc(window.Sim.tx, window.Sim.ty, 14, -Math.PI / 2, -Math.PI / 2 + H.PI2 * charge); window.Sim.ctx.strokeStyle = `rgba(255,190,50,${0.5 + charge * 0.4})`; window.Sim.ctx.lineWidth = 2.5; window.Sim.ctx.stroke();
  window.Sim.ctx.beginPath(); window.Sim.ctx.arc(window.Sim.tx, window.Sim.ty, 3, 0, H.PI2); window.Sim.ctx.fillStyle = `rgba(255,210,80,${0.7 + charge * 0.3})`; window.Sim.ctx.fill();
};

window.Sim.orbitalSpeed = (dist, nP, grav) => { const g = (grav != null) ? grav : window.Sim.sunGravMult; return Math.sqrt(window.Sim.config.GRAV_CONST * window.Sim.SUN.mass * g / Math.max(nP, 1) / Math.max(dist, 1)); };
window.Sim.orbitalPeriod = (dist, nP, grav) => { const v = window.Sim.orbitalSpeed(dist, nP, grav); return v > 0 ? (2 * Math.PI * dist / v) : 99999; };
window.Sim.getSpawnVelocity = (x, y, nP, grav) => { const g = (grav != null) ? grav : window.Sim.sunGravMult; const dx = x - window.Sim.SUN.x, dy = y - window.Sim.SUN.y, dist = H.hypot(dx, dy) || 1; const v = window.Sim.orbitalSpeed(dist, nP, g); return { vx: -dy / dist * v, vy: dx / dist * v, dist }; };
window.Sim.computePreviewDamping = periodSub => Math.pow(0.88, 1 / Math.max(periodSub, 1));

window.Sim.predictOrbit = (spawnX, spawnY, vx0, vy0, nP, steps, dtPerStep, recordEvery, grav) => {
  const pts = []; let px = spawnX, py = spawnY, vx = vx0, vy = vy0;
  const g = (grav != null) ? grav : window.Sim.sunGravMult, gm = window.Sim.config.GRAV_CONST * window.Sim.SUN.mass * g / Math.max(nP, 1);
  const burnR2 = window.Sim.SUN.burnRadius * window.Sim.SUN.burnRadius; recordEvery = recordEvery || 1;
  const periodSub = window.Sim.orbitalPeriod(H.hypot(spawnX - window.Sim.SUN.x, spawnY - window.Sim.SUN.y) || 1, nP, g) / dtPerStep;
  const vDamp = window.Sim.computePreviewDamping(periodSub);
  for (let i = 0; i < steps; i++) {
    const sdx = window.Sim.SUN.x - px, sdy = window.Sim.SUN.y - py; const sd2 = sdx * sdx + sdy * sdy; if (sd2 < burnR2) break;
    const sd = Math.sqrt(sd2) + 0.1, f = gm / (sd2 + 500);
    vx = (vx + (sdx / sd) * f * dtPerStep) * vDamp; vy = (vy + (sdy / sd) * f * dtPerStep) * vDamp;
    px += vx * dtPerStep; py += vy * dtPerStep;
    if (i % recordEvery === 0) pts.push({ x: px, y: py });
  }
  return pts;
};

let _previewCache = null;
window.Sim.getPreviewPath = (wx, wy) => {
  if (_previewCache && Math.abs(_previewCache.wx - wx) < 2 && Math.abs(_previewCache.wy - wy) < 2 && _previewCache.mult === window.Sim.sunGravMult) return _previewCache.pts;
  const dist = H.hypot(wx - window.Sim.SUN.x, wy - window.Sim.SUN.y) || 1, dtPerStep = 1 / window.Sim.config.SUBSTEPS;
  const periodSub = window.Sim.orbitalPeriod(dist, 100, window.Sim.sunGravMult) / dtPerStep;
  const totalSteps = Math.min(Math.ceil(periodSub * (5 + 2)), 120000);
  const { vx, vy } = window.Sim.getSpawnVelocity(wx, wy, 100, window.Sim.sunGravMult);
  const pts = window.Sim.predictOrbit(wx, wy, vx, vy, 100, totalSteps, dtPerStep, 20, window.Sim.sunGravMult);
  _previewCache = { wx, wy, pts, mult: window.Sim.sunGravMult }; return pts;
};

/* older version
window.Sim.drawOrbitPreview = t => {
  if (!window.Sim.holding) return;
  const charge = Math.min((performance.now() - window.Sim.holdT) / 2000, 1), alpha = H.clamp(charge * 1.6, 0, 0.9);
  const w = window.Sim.screenToWorld(window.Sim.tx, window.Sim.ty), dx = w.x - window.Sim.SUN.x, dy = w.y - window.Sim.SUN.y, dist = H.hypot(dx, dy) || 1;
  const pts = window.Sim.getPreviewPath(w.x, w.y); if (pts.length < 4) return;
  const total = pts.length, lw = 1.8 / window.Sim.cam.zoom;
  window.Sim.ctx.save(); window.Sim.ctx.lineCap = "round"; window.Sim.ctx.lineJoin = "round";
  const SEG = Math.max(2, Math.floor(total / 60));
  for (let i = 0; i < total - SEG; i += SEG) {
    const f0 = i / total, f1 = (i + SEG) / total, fc = (f0 + f1) / 2;
    const r = Math.floor(H.lerp(160, 255, Math.min(fc * 1.8, 1))), g = Math.floor(H.lerp(220, 120, fc)), b = Math.floor(H.lerp(255, 20, Math.min(fc * 1.5, 1)));
    const a = alpha * (1 - fc * 0.5) * (f0 < 0.12 ? f0 / 0.12 : 1), w2 = lw * (1.4 - fc * 0.9);
    window.Sim.ctx.beginPath(); window.Sim.ctx.moveTo(pts[i].x, pts[i].y); for (let j = i + 1; j <= i + SEG && j < total; j++) window.Sim.ctx.lineTo(pts[j].x, pts[j].y);
    window.Sim.ctx.strokeStyle = `rgba(${r},${g},${b},${a})`; window.Sim.ctx.lineWidth = Math.max(0.3 / window.Sim.cam.zoom, w2); window.Sim.ctx.stroke();
  }
  const animFrac = (t * 0.00035) % 1, DOT_COUNT = 7;
  for (let d = 0; d < DOT_COUNT; d++) {
    const f = ((d / DOT_COUNT) + animFrac) % 1, idx = Math.floor(f * (total - 1)), pt = pts[idx];
    const r2 = Math.floor(H.lerp(160, 255, Math.min(f * 1.8, 1))), g2 = Math.floor(H.lerp(220, 120, f)), b2 = Math.floor(H.lerp(255, 20, Math.min(f * 1.5, 1)));
    const dotR = Math.max(0.8 / window.Sim.cam.zoom, (3 - f * 1.5) / window.Sim.cam.zoom), da = alpha * (1 - f * 0.4) * 0.95;
    window.Sim.ctx.beginPath(); window.Sim.ctx.arc(pt.x, pt.y, dotR, 0, H.PI2); window.Sim.ctx.fillStyle = `rgba(${r2},${g2},${b2},${da})`; window.Sim.ctx.fill();
  }
  window.Sim.ctx.restore();
  window.Sim.ctx.save(); window.Sim.ctx.globalAlpha = alpha * 0.28; window.Sim.ctx.setLineDash([3 / window.Sim.cam.zoom, 4 / window.Sim.cam.zoom]); window.Sim.ctx.beginPath(); window.Sim.ctx.moveTo(window.Sim.SUN.x, window.Sim.SUN.y); window.Sim.ctx.lineTo(w.x, w.y); window.Sim.ctx.strokeStyle = "rgba(255,200,80,1)"; window.Sim.ctx.lineWidth = 0.6 / window.Sim.cam.zoom; window.Sim.ctx.stroke(); window.Sim.ctx.setLineDash([]); window.Sim.ctx.restore();
  const tx_ = -dy / dist, ty_ = dx / dist, alen = Math.min(dist * 0.13, 240 / window.Sim.cam.zoom), ax = w.x + tx_ * alen, ay = w.y + ty_ * alen;
  window.Sim.ctx.save(); window.Sim.ctx.globalAlpha = alpha; window.Sim.ctx.strokeStyle = "rgba(160,225,255,1)"; window.Sim.ctx.fillStyle = "rgba(160,225,255,1)"; window.Sim.ctx.lineWidth = lw * 0.85; window.Sim.ctx.beginPath(); window.Sim.ctx.moveTo(w.x, w.y); window.Sim.ctx.lineTo(ax, ay); window.Sim.ctx.stroke(); const ha = Math.atan2(ty_, tx_), hl = alen * 0.3; window.Sim.ctx.beginPath(); window.Sim.ctx.moveTo(ax, ay); window.Sim.ctx.lineTo(ax - Math.cos(ha - 0.38) * hl, ay - Math.sin(ha - 0.38) * hl); window.Sim.ctx.lineTo(ax - Math.cos(ha + 0.38) * hl, ay - Math.sin(ha + 0.38) * hl); window.Sim.ctx.closePath(); window.Sim.ctx.fill(); window.Sim.ctx.restore();
  window.Sim.ctx.save(); window.Sim.ctx.globalAlpha = alpha; window.Sim.ctx.beginPath(); window.Sim.ctx.arc(w.x, w.y, 3.5 / window.Sim.cam.zoom, 0, H.PI2); window.Sim.ctx.fillStyle = "rgba(160,225,255,1)"; window.Sim.ctx.fill(); window.Sim.ctx.restore();
  const m = window.Sim.ctx.getTransform(); window.Sim.ctx.setTransform(1, 0, 0, 1, 0, 0); window.Sim.ctx.save(); window.Sim.ctx.font = '8px "Space Mono",monospace'; const period_frames = Math.round(window.Sim.orbitalPeriod(dist, 100, window.Sim.sunGravMult) / window.Sim.physSpeed); const midSX = ((window.Sim.SUN.x - window.Sim.cam.x) * window.Sim.cam.zoom + window.Sim.W / 2 + (w.x - window.Sim.cam.x) * window.Sim.cam.zoom + window.Sim.W / 2) / 2, midSY = ((window.Sim.SUN.y - window.Sim.cam.y) * window.Sim.cam.zoom + window.Sim.H / 2 + (w.y - window.Sim.cam.y) * window.Sim.cam.zoom + window.Sim.H / 2) / 2; window.Sim.ctx.fillStyle = `rgba(180,215,255,${alpha * 0.65})`; window.Sim.ctx.fillText(`r${Math.round(dist)} ~${period_frames}f`, midSX + 8, midSY - 4); window.Sim.ctx.restore(); window.Sim.ctx.setTransform(m);
};

*/
// New DrawOrbitPreview plus warning prozimity to the sun
window.Sim.drawOrbitPreview = t => {
  if (!window.Sim.holding) return;
  const H = window.Sim;
  
  const charge = Math.min((performance.now() - H.holdT) / 2000, 1);
  const alpha = H.clamp(charge * 1.6, 0, 0.9);
  const w = H.screenToWorld(H.tx, H.ty);
  const dx = w.x - H.SUN.x, dy = w.y - H.SUN.y;
  const dist = H.hypot(dx, dy) || 1;
  const pts = H.getPreviewPath(w.x, w.y);
  if (pts.length < 4) return;

  const total = pts.length;
  const lw = 1.8 / H.cam.zoom;

  // 🔥 Shared Burn Zone Radius (Matches drawBody exactly)
  const BURN_ZONE_R = H.SUN.burnRadius * 4;

  H.ctx.save();
  H.ctx.lineCap = 'round'; H.ctx.lineJoin = 'round';
  const SEG = Math.max(2, Math.floor(total / 60));

  // ── Spiral path segments ──
  for (let i = 0; i < total - SEG; i += SEG) {
    const f0 = i / total, f1 = (i + SEG) / total, fc = (f0 + f1) / 2;
    const r = Math.floor(H.lerp(160, 255, Math.min(fc * 1.8, 1)));
    const g = Math.floor(H.lerp(220, 120, fc)), b = Math.floor(H.lerp(255, 20, Math.min(fc * 1.5, 1)));
    const a = alpha * (1 - fc * 0.5) * (f0 < 0.12 ? f0 / 0.12 : 1);
    const w2 = lw * (1.4 - fc * 0.9);
    H.ctx.beginPath(); H.ctx.moveTo(pts[i].x, pts[i].y);
    for (let j = i + 1; j <= i + SEG && j < total; j++) H.ctx.lineTo(pts[j].x, pts[j].y);
    H.ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
    H.ctx.lineWidth = Math.max(0.3 / H.cam.zoom, w2); H.ctx.stroke();
  }

  // ── Flowing travel dots ──
  const animFrac = (t * 0.00035) % 1, DOT_COUNT = 7;
  for (let d = 0; d < DOT_COUNT; d++) {
    const f = ((d / DOT_COUNT) + animFrac) % 1, idx = Math.floor(f * (total - 1)), pt = pts[idx];
    const r2 = Math.floor(H.lerp(160, 255, Math.min(f * 1.8, 1)));
    const g2 = Math.floor(H.lerp(220, 120, f)), b2 = Math.floor(H.lerp(255, 20, Math.min(f * 1.5, 1)));
    const dotR = Math.max(0.8 / H.cam.zoom, (3 - f * 1.5) / H.cam.zoom);
    const da = alpha * (1 - f * 0.4) * 0.95;
    H.ctx.beginPath(); H.ctx.arc(pt.x, pt.y, dotR, 0, H.PI2);
    H.ctx.fillStyle = `rgba(${r2},${g2},${b2},${da})`; H.ctx.fill();
  }
  H.ctx.restore();

  // ── Radial line: sun → spawn ──
  H.ctx.save(); H.ctx.globalAlpha = alpha * 0.28; H.ctx.setLineDash([3 / H.cam.zoom, 4 / H.cam.zoom]);
  H.ctx.beginPath(); H.ctx.moveTo(H.SUN.x, H.SUN.y); H.ctx.lineTo(w.x, w.y);
  H.ctx.strokeStyle = "rgba(255,200,80,1)"; H.ctx.lineWidth = 0.6 / H.cam.zoom; H.ctx.stroke(); H.ctx.setLineDash([]); H.ctx.restore();

  // ── Velocity arrow ──
  const tx_ = -dy / dist, ty_ = dx / dist, alen = Math.min(dist * 0.13, 240 / H.cam.zoom);
  const ax = w.x + tx_ * alen, ay = w.y + ty_ * alen;
  H.ctx.save(); H.ctx.globalAlpha = alpha; H.ctx.strokeStyle = "rgba(160,225,255,1)"; H.ctx.fillStyle = "rgba(160,225,255,1)"; H.ctx.lineWidth = lw * 0.85;
  H.ctx.beginPath(); H.ctx.moveTo(w.x, w.y); H.ctx.lineTo(ax, ay); H.ctx.stroke();
  const ha = Math.atan2(ty_, tx_), hl = alen * 0.3;
  H.ctx.beginPath(); H.ctx.moveTo(ax, ay); H.ctx.lineTo(ax - Math.cos(ha - 0.38) * hl, ay - Math.sin(ha - 0.38) * hl);
  H.ctx.lineTo(ax - Math.cos(ha + 0.38) * hl, ay - Math.sin(ha + 0.38) * hl); H.ctx.closePath(); H.ctx.fill(); H.ctx.restore();

  // ── Spawn dot ──
  H.ctx.save(); H.ctx.globalAlpha = alpha; H.ctx.beginPath(); H.ctx.arc(w.x, w.y, 3.5 / H.cam.zoom, 0, H.PI2);
  H.ctx.fillStyle = "rgba(160,225,255,1)"; H.ctx.fill(); H.ctx.restore();

  // 🔥 BURN ZONE RING (Visual warning)
  H.ctx.save();
  H.ctx.beginPath(); H.ctx.arc(H.SUN.x, H.SUN.y, BURN_ZONE_R, 0, H.PI2);
  H.ctx.strokeStyle = `rgba(255, 60, 30, ${alpha * 0.4})`;
  H.ctx.lineWidth = 1.5 / H.cam.zoom;
  H.ctx.setLineDash([8 / H.cam.zoom, 5 / H.cam.zoom]);
  H.ctx.stroke();
  H.ctx.setLineDash([]);
  // Subtle warning fill
  H.ctx.fillStyle = `rgba(255, 40, 20, ${alpha * 0.05})`;
  H.ctx.fill();
  H.ctx.restore();

  // 🔥 BURN STATUS LABEL
  const isBurnZone = dist < BURN_ZONE_R;
  const m = H.ctx.getTransform();
  H.ctx.setTransform(1, 0, 0, 1, 0, 0);
  H.ctx.save();
  H.ctx.font = '8px "Space Mono",monospace';
  const period_frames = Math.round(H.orbitalPeriod(dist, 100, H.sunGravMult) / H.physSpeed);
  const midSX = ((H.SUN.x - H.cam.x) * H.cam.zoom + H.W / 2 + (w.x - H.cam.x) * H.cam.zoom + H.W / 2) / 2;
  const midSY = ((H.SUN.y - H.cam.y) * H.cam.zoom + H.H / 2 + (w.y - H.cam.y) * H.cam.zoom + H.H / 2) / 2;

  if (isBurnZone) {
    H.ctx.fillStyle = `rgba(255, 80, 50, ${alpha})`;
    H.ctx.fillText(`🔥 BURN ZONE — Will disintegrate`, midSX + 8, midSY - 4);
  } else {
    H.ctx.fillStyle = `rgba(180,215,255,${alpha * 0.65})`;
    H.ctx.fillText(`r${Math.round(dist)} ~${period_frames}f`, midSX + 8, midSY - 4);
  }
  H.ctx.restore();
  H.ctx.setTransform(m);
};

window.Sim.spawnPlanet = (x, y, size) => {
  if (window.Sim.state.bodies.length >= 8) return;
  const radius = H.clamp(size * 8, 16, 110), pal = window.Sim.PALS[Math.floor(H.rnd() * window.Sim.PALS.length)];
  const body = window.Sim.makeBody(x, y, radius, pal), nP = body.particles.length;
  body.gravMult = window.Sim.sunGravMult;
  const { vx, vy } = window.Sim.getSpawnVelocity(x, y, nP, window.Sim.sunGravMult);
  for (const p of body.particles) { p.vx = vx; p.vy = vy; }
  window.Sim.state.bodies.push(body); window.Sim.addFlash(x, y, radius * 2, pal.gc); window.Sim.updateCount();
};

window.Sim.updateCount = () => { let n = 0; for (const b of window.Sim.state.bodies) if (!b.dead) n++; window.Sim.pcountEl.textContent = n === 0 ? "—" : `${n} 🌕$ {n !== 1 ? "" : ""}`; };

const TRAIL_STEPS = 1;
window.Sim.trailBufs = [], window.Sim.trailHead = 0;
window.Sim.initTrailBuffers = () => { window.Sim.trailBufs = Array.from({ length: TRAIL_STEPS }, () => { const c = document.createElement("canvas"); c.width = window.Sim.W; c.height = window.Sim.H; return { canvas: c, ctx: c.getContext("2d"), camX: 0, camY: 0, camZoom: 1, used: false }; }); };
window.Sim.resizeTrailBuffers = () => { for (const b of window.Sim.trailBufs) { b.canvas.width = window.Sim.W; b.canvas.height = window.Sim.H; b.used = false; } };
window.Sim.renderPlanetsToBuffer = () => {
  const buf = window.Sim.trailBufs[window.Sim.trailHead], ox = buf.ctx; ox.clearRect(0, 0, window.Sim.W, window.Sim.H); ox.save(); ox.translate(window.Sim.W / 2, window.Sim.H / 2); ox.scale(window.Sim.cam.zoom, window.Sim.cam.zoom); ox.translate(-window.Sim.cam.x, -window.Sim.cam.y);
  for (const b of window.Sim.state.bodies) {
    const { particles: ps, pal } = b; const alive = []; for (const p of ps) if (!p.dead) alive.push(p); if (alive.length < 3) continue; const hull = window.Sim.convexHull(alive); if (hull.length < 3) continue;
    ox.save(); ox.beginPath(); ox.moveTo(hull[0].x, hull[0].y); for (let i = 1; i < hull.length; i++) ox.lineTo(hull[i].x, hull[i].y); ox.closePath(); const gr = ox.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, b.radius); gr.addColorStop(0, pal.hi + "ff"); gr.addColorStop(0.35, pal.mid + "ee"); gr.addColorStop(0.75, pal.lo + "cc"); gr.addColorStop(1, pal.lo + "44"); ox.fillStyle = gr; ox.fill(); ox.strokeStyle = `rgba(${pal.gc},.4)`; ox.lineWidth = 1.5 / window.Sim.cam.zoom; ox.stroke(); ox.restore();
    ox.save(); ox.globalAlpha = 0.07; ox.strokeStyle = `rgba(${pal.gc},.9)`; ox.lineWidth = 0.8 / window.Sim.cam.zoom; ox.beginPath(); for (const sp of b.springs) { if (sp.broken) continue; const pa = ps[sp.a], pb = ps[sp.b]; if (pa.dead || pb.dead) continue; if (H.hypot(pb.x - pa.x, pb.y - pa.y) / sp.restLen < 1.1) continue; ox.moveTo(pa.x, pa.y); ox.lineTo(pb.x, pb.y); } ox.stroke(); ox.restore();
    ox.fillStyle = `rgba(${pal.gc},.75)`; ox.beginPath(); for (const p of alive) { if (p.heat > 0.05) continue; const r = p.isCore ? window.Sim.config.PARTICLE_R * 1.3 : window.Sim.config.PARTICLE_R; ox.moveTo(p.x + r, p.y); ox.arc(p.x, p.y, r, 0, H.PI2); } ox.fill(); for (const p of alive) { if (p.heat <= 0.05) continue; const r = p.isCore ? window.Sim.config.PARTICLE_R * 1.3 : window.Sim.config.PARTICLE_R; ox.fillStyle = `rgba(255,${Math.floor(H.lerp(60, 220, p.heat))},30,${p.heat * 0.9})`; ox.beginPath(); ox.arc(p.x, p.y, r, 0, H.PI2); ox.fill(); }
    const atm = ox.createRadialGradient(b.cx, b.cy, b.radius * 0.7, b.cx, b.cy, b.radius * 1.8); atm.addColorStop(0, `rgba(${pal.gc},.07)`); atm.addColorStop(1, `rgba(${pal.gc},0)`); ox.fillStyle = atm; ox.beginPath(); ox.arc(b.cx, b.cy, b.radius * 1.8, 0, H.PI2); ox.fill();
  }
  ox.restore(); buf.camX = window.Sim.cam.x; buf.camY = window.Sim.cam.y; buf.camZoom = window.Sim.cam.zoom; buf.used = true;
};
const TRAIL_ALPHAS = [1.0, 0.52, 0.24, 0.09, 0.02];
window.Sim.drawTrail = () => {
  for (let age = TRAIL_STEPS - 1; age >= 0; age--) {
    const idx = ((window.Sim.trailHead - age - 1) + TRAIL_STEPS * 2) % TRAIL_STEPS, buf = window.Sim.trailBufs[idx]; if (!buf.used) continue;
    const alpha = TRAIL_ALPHAS[age]; if (alpha < 0.005) continue;
    const scaleRatio = window.Sim.cam.zoom / buf.camZoom, offX = (buf.camX - window.Sim.cam.x) * window.Sim.cam.zoom, offY = (buf.camY - window.Sim.cam.y) * window.Sim.cam.zoom;
    window.Sim.ctx.save(); window.Sim.ctx.globalAlpha = alpha; window.Sim.ctx.globalCompositeOperation = age === 0 ? "source-over" : "lighter"; window.Sim.ctx.translate(window.Sim.W / 2 + offX, window.Sim.H / 2 + offY); window.Sim.ctx.scale(scaleRatio, scaleRatio); window.Sim.ctx.translate(-window.Sim.W / 2, -window.Sim.H / 2); window.Sim.ctx.drawImage(buf.canvas, 0, 0); window.Sim.ctx.restore();
  }
  window.Sim.ctx.globalCompositeOperation = "source-over";
};

// ============================================================================
// SPAWN & UI HELPERS (Missing from your current file)
// ============================================================================

window.Sim.spawnPlanet = (x, y, size) => {
  if (window.Sim.state.bodies.length >= 8) return;
  const radius = H.clamp(size * 8, 16, 110);
  const pal = window.Sim.PALS[Math.floor(H.rnd() * window.Sim.PALS.length)];
  const body = window.Sim.makeBody(x, y, radius, pal);
  const nP = body.particles.length;
  body.gravMult = window.Sim.sunGravMult;
  const { vx, vy } = window.Sim.getSpawnVelocity(x, y, nP, window.Sim.sunGravMult);
  for (const p of body.particles) { p.vx = vx; p.vy = vy; }
  window.Sim.state.bodies.push(body);
  window.Sim.addFlash(x, y, radius * 2, pal.gc);
  window.Sim.updateCount();
};

window.Sim.updateCount = () => { 
  let n = 0; 
  for (const b of window.Sim.state.bodies) if (!b.dead) n++; 
  window.Sim.pcountEl.textContent = n === 0 ? "—" : `${n} 🌕${n !== 1 ? "" : ""}`; 
};

// ── FPS Counter (called from main.js) ─────────────────
window.Sim.updateFPS = (rawDt) => {
  if (!window.Sim.fpsSamples) window.Sim.fpsSamples = [];
  if (!window.Sim.fpsDisplay) window.Sim.fpsDisplay = 0;
  
  if (rawDt > 0) {
    window.Sim.fpsSamples.push(1 / rawDt);
    if (window.Sim.fpsSamples.length > 30) window.Sim.fpsSamples.shift();
  }
  if (window.Sim.fpsSamples.length > 0) {
    window.Sim.fpsDisplay = Math.round(
      window.Sim.fpsSamples.reduce((a, b) => a + b) / window.Sim.fpsSamples.length
    );
  }
};

window.Sim.drawFPS = () => {
  window.Sim.ctx.save();
  window.Sim.ctx.font = '10px "Space Mono",monospace';
  window.Sim.ctx.fillStyle = 'rgba(100,255,160,0.55)';
  window.Sim.ctx.letterSpacing = '.05em';
  window.Sim.ctx.fillText(`${window.Sim.fpsDisplay || 0} FPS`, 16, 20);
  window.Sim.ctx.restore();
};
