"use strict";

// ============================================================================
// 1. MATH & HELPERS
// Defined locally for speed, then exported to window.Sim for other files
// ============================================================================
const PI2 = Math.PI * 2;
const rnd = Math.random.bind(Math);
const rndR = (a, b) => a + (b - a) * rnd();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hypot = Math.hypot;

// Export to global Sim namespace
window.Sim.PI2 = PI2;
window.Sim.rnd = rnd;
window.Sim.rndR = rndR;
window.Sim.clamp = clamp;
window.Sim.lerp = lerp;
window.Sim.hypot = hypot;

// ============================================================================
// 2. DOM REFERENCES
// ============================================================================
window.Sim.canvas = document.getElementById("c");
window.Sim.ctx = window.Sim.canvas.getContext("2d", { alpha: false, desynchronized: true });
window.Sim.cursorEl = document.getElementById("cursor");
window.Sim.slider = document.getElementById("size-slider");
window.Sim.pcountEl = document.getElementById("pcount");
window.Sim.uiEl = document.getElementById("ui");
window.Sim.gravSlider = document.getElementById("grav-slider");
window.Sim.gravVal = document.getElementById("grav-val");

window.Sim.W = window.Sim.canvas.width = window.innerWidth;
window.Sim.H = window.Sim.canvas.height = window.innerHeight;

// ============================================================================
// 3. UTILITY FUNCTIONS
// ============================================================================
window.Sim.makeRockShape = function(r) {
  const n = Math.floor(rndR(5, 9));
  return Array.from({ length: n }, (_, i) => {
    const baseA = (PI2 / n) * i + (rnd() - 0.5) * (PI2 / n) * 0.55;
    const rv = r * (0.55 + rnd() * 0.55);
    return [Math.cos(baseA) * rv, Math.sin(baseA) * rv];
  });
};

window.Sim.convexHull = function(pts) {
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
