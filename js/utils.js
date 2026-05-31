"use strict";

// ============================================================================
// 1. MATH & HELPERS
// ============================================================================
const PI2 = Math.PI * 2;
const rnd = Math.random.bind(Math);
const rndR = (a, b) => a + (b - a) * rnd();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hypot = Math.hypot;

window.Sim.PI2 = PI2;
window.Sim.rnd = rnd;
window.Sim.rndR = rndR;
window.Sim.clamp = clamp;
window.Sim.lerp = lerp;
window.Sim.hypot = hypot;

const H = window.Sim;

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
  
  // Named callback for Array.from (replaces loop body)
  const createRockVertex = (i) => {
    const baseA = (PI2 / n) * i + (rnd() - 0.5) * (PI2 / n) * 0.55;
    const rv = r * (0.55 + rnd() * 0.55);
    return [Math.cos(baseA) * rv, Math.sin(baseA) * rv];
  };
  
  return Array.from({ length: n }, (_, i) => createRockVertex(i));
};

window.Sim.convexHull = function(pts) {
  if (pts.length < 3) return pts;
  
  // ---- Find lowest point (loop body extracted) ----
  const findLowestPoint = () => {
    let loRef = { lo: pts[0] };
    const checkLower = (p) => {
      if (p.y > loRef.lo.y || (p.y === loRef.lo.y && p.x < loRef.lo.x)) {
        loRef.lo = p;
      }
    };
    for (const p of pts) {
      checkLower(p);
    }
    return loRef.lo;
  };
  
  // ---- Find next hull point (inner loop body extracted) ----
  const findNextPoint = (cur) => {
    let nextRef = { next: pts[0] };
    const updateCandidate = (p) => {
      if (p === cur) return;
      const cross =
        (nextRef.next.x - cur.x) * (p.y - cur.y) -
        (nextRef.next.y - cur.y) * (p.x - cur.x);
      if (
        cross < 0 ||
        (cross === 0 &&
          hypot(p.x - cur.x, p.y - cur.y) >
          hypot(nextRef.next.x - cur.x, nextRef.next.y - cur.y))
      ) {
        nextRef.next = p;
      }
    };
    for (const p of pts) {
      updateCandidate(p);
    }
    return nextRef.next;
  };
  
  // ---- One iteration of the while loop ----
  const performHullStep = () => {
    let next = findNextPoint(cur);
    if (next === lo) return true; // signal to break
    hull.push(next);
    cur = next;
    if (hull.length > pts.length) return true; // safety break
    return false;
  };
  
  // ---- Main hull construction ----
  let lo = findLowestPoint();
  const hull = [lo];
  let cur = lo;
  
  while (true) {
    if (performHullStep()) break;
  }
  
  return hull;
};

// ── Non-Linear Planet Radius Calculator ──────────────
window.Sim.getPlanetRadius = (sliderVal, charge = 0) => {
  const raw = sliderVal * (1 + charge * 4);
  const t = Math.min(raw / 50, 1);
  const multiplier = 0.25 + 2.25 * Math.pow(t, 1.4);
  const baseRadius = 40;
  return Math.max(10, Math.min(110, Math.round(baseRadius * multiplier)));
};