"use strict";
const Sim = window.Sim;

const PI2 = Math.PI * 2;
const rnd = Math.random.bind(Math);
const rndR = (a, b) => a + (b - a) * rnd();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hypot = Math.hypot;

Sim.canvas = document.getElementById("c");
Sim.ctx = Sim.canvas.getContext("2d", { alpha: false, desynchronized: true });
Sim.cursorEl = document.getElementById("cursor");
Sim.slider = document.getElementById("size-slider");
Sim.pcountEl = document.getElementById("pcount");
Sim.uiEl = document.getElementById("ui");
Sim.gravSlider = document.getElementById("grav-slider");
Sim.gravVal = document.getElementById("grav-val");

Sim.W = Sim.canvas.width = window.innerWidth;
Sim.H = Sim.canvas.height = window.innerHeight;

Sim.makeRockShape = function(r) {
  const n = Math.floor(rndR(5, 9));
  return Array.from({ length: n }, (_, i) => {
    const baseA = (PI2 / n) * i + (rnd() - 0.5) * (PI2 / n) * 0.55;
    const rv = r * (0.55 + rnd() * 0.55);
    return [Math.cos(baseA) * rv, Math.sin(baseA) * rv];
  });
};

Sim.convexHull = function(pts) {
  if (pts.length < 3) return pts;
  let lo = pts[0];
  for (const p of pts) if (p.y > lo.y || (p.y === lo.y && p.x < lo.x)) lo = p;
  const hull = [lo]; let cur = lo;
  while (true) {
    let next = pts[0];
    for (const p of pts) {
      if (p === cur) continue;
      const cross = (next.x - cur.x) * (p.y - cur.y) - (next.y - cur.y) * (p.x - cur.x);
      if (cross < 0 || (cross === 0 && hypot(p.x - cur.x, p.y - cur.y) > hypot(next.x - cur.x, next.y - cur.y))) next = p;
    }
    if (next === lo) break;
    hull.push(next); cur = next;
    if (hull.length > pts.length) break;
  }
  return hull;
};
