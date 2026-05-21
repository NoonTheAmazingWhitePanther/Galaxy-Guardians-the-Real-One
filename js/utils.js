"use strict";

// ════════════════════════════════════════════════════════════════════════════════
// UTILS.JS - Shared Utilities & DOM Setup
// ════════════════════════════════════════════════════════════════════════════════
// Purpose: Export math helpers, manage DOM references, and provide utility functions.
// All functions are exported to window.Sim namespace for use across all modules.
// ════════════════════════════════════════════════════════════════════════════════

// ─────────���────────────────────────────────────────────────────────────────────
// Math Helpers - Core utilities for physics and game logic
// ──────────────────────────────────────────────────────────────────────────────
const PI2 = Math.PI * 2;                    // Full circle (2π)
const rnd = Math.random.bind(Math);         // Random [0, 1)
const rndR = (a, b) => a + (b - a) * rnd(); // Random range [a, b)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);  // Clamp value to range
const lerp = (a, b, t) => a + (b - a) * t;  // Linear interpolation
const hypot = Math.hypot;                   // Euclidean distance (native JS)

// Export math helpers to global namespace for use in all other files
window.Sim.PI2 = PI2;
window.Sim.rnd = rnd;
window.Sim.rndR = rndR;
window.Sim.clamp = clamp;
window.Sim.lerp = lerp;
window.Sim.hypot = hypot;

const H = window.Sim;  // Local alias for convenience

// ───────────────────────────────────���──────────────────────────────────────────
// DOM References - Canvas and UI elements
// ──────────────────────────────────────────────────────────────────────────────
H.canvas = document.getElementById("c");
H.ctx = H.canvas.getContext("2d", { alpha: false, desynchronized: true });
H.cursorEl = document.getElementById("cursor");
H.slider = document.getElementById("size-slider");
H.pcountEl = document.getElementById("pcount");
H.uiEl = document.getElementById("ui");
H.gravSlider = document.getElementById("grav-slider");
H.gravVal = document.getElementById("grav-val");

// ──────────────────────────────────────────────────────────────────────────────
// Canvas Dimensions - Initialize and track window size
// ───────────────────────────────────────────────────────────��──────────────────
H.W = H.canvas.width = window.innerWidth;
H.H = H.canvas.height = window.innerHeight;

// ──────────────────────────────────────────────────────────────────────────────
// Geometry Utilities - Generate and compute shapes
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Generate a random jagged rock shape for asteroid rendering.
 * Creates n-sided polygon with randomized vertex distances.
 * @param {number} r - Base radius of the rock
 * @returns {Array<Array<number>>} Array of [x, y] points defining the shape
 */
H.makeRockShape = function(r) {
  const n = Math.floor(rndR(5, 9));  // 5-9 sided polygon
  return Array.from({ length: n }, (_, i) => {
    const baseA = (PI2 / n) * i + (rnd() - 0.5) * (PI2 / n) * 0.55;  // Angle with jitter
    const rv = r * (0.55 + rnd() * 0.55);                           // Radius variation 0.55r-1.1r
    return [Math.cos(baseA) * rv, Math.sin(baseA) * rv];
  });
};

/**
 * Compute convex hull of points using Graham scan algorithm.
 * Used for structural analysis and collision detection optimization.
 * @param {Array<Object>} pts - Array of points with {x, y} properties
 * @returns {Array<Object>} Points forming the convex hull
 */
H.convexHull = function(pts) {
  if (pts.length < 3) return pts;
  
  // Find lowest point (lowest y, then leftmost x)
  let lo = pts[0];
  for (const p of pts) {
    if (p.y > lo.y || (p.y === lo.y && p.x < lo.x)) lo = p;
  }
  
  // Build hull by counter-clockwise traversal
  const hull = [lo];
  let cur = lo;
  while (true) {
    let next = pts[0];
    for (const p of pts) {
      if (p === cur) continue;
      // Cross product determines turn direction; we want leftmost (most negative)
      const cross = (next.x - cur.x) * (p.y - cur.y) - (next.y - cur.y) * (p.x - cur.x);
      if (cross < 0 || (cross === 0 && hypot(p.x - cur.x, p.y - cur.y) > hypot(next.x - cur.x, next.y - cur.y))) {
        next = p;
      }
    }
    if (next === lo) break;  // Closed loop
    hull.push(next);
    cur = next;
    if (hull.length > pts.length) break;  // Safety check
  }
  return hull;
};

/**
 * Calculate planet radius from slider value and charge (hold time).
 * Uses power curve for intuitive fine control at small sizes, exponential growth at large.
 * Slider range: 1-10, Charge range: 0-1, Output radius: 10-110 pixels
 * @param {number} sliderVal - Slider value (1-10)
 * @param {number} charge - Charge amount from holding (0-1)
 * @returns {number} Computed planet radius in pixels
 */
H.getPlanetRadius = (sliderVal, charge = 0) => {
  const raw = sliderVal * (1 + charge * 4);  // Combined input scales 1..10 → 1..50
  const t = Math.min(raw / 50, 1);           // Normalize to 0..1
  
  // Power curve: gentle at low end, accelerates at high end for dramatic expansion
  const multiplier = 0.25 + 2.25 * Math.pow(t, 1.4);
  const baseRadius = 40;  // Default planet size
  
  return Math.max(10, Math.min(110, Math.round(baseRadius * multiplier)));
};
