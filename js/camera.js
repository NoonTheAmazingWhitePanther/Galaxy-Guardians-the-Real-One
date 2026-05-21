"use strict";

// ════════════════════════════════════════════════════════════════════════════════
// CAMERA.JS - Camera Control & Pan/Zoom
// ══════════════════════════════════════════��═════════════════════════════════════
// Purpose: Manage camera position, zoom, and coordinate transformations.
// Handles mouse/touch panning, keyboard controls, and smooth zoom transitions.
// ════════════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────────────
// Camera State
// ──────────────────────────────────────────────────────────────────────────────
window.Sim.panning = false;  // Global flag: true when user is dragging to pan

window.Sim.cam = {
  x: 0,                       // Camera center X position (world space)
  y: 0,                       // Camera center Y position (world space)
  zoom: 0.08,                 // Current zoom level
  targetZoom: 0.08,           // Target zoom (for smooth transitions)
  minZoom: 0.01,              // Minimum zoom (zoomed way out)
  maxZoom: 4                  // Maximum zoom (zoomed way in)
};

// ──────────────────────────────────────────────────────────────────────────────
// Screen ↔ World Coordinate Transformation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Convert screen coordinates to world coordinates.
 * @param {number} sx - Screen X position (pixels)
 * @param {number} sy - Screen Y position (pixels)
 * @returns {Object} {x, y} world coordinates
 */
window.Sim.screenToWorld = (sx, sy) => ({
  x: window.Sim.cam.x + (sx - window.Sim.W / 2) / window.Sim.cam.zoom,
  y: window.Sim.cam.y + (sy - window.Sim.H / 2) / window.Sim.cam.zoom
});

/**
 * Apply camera transform to canvas context.
 * Translates and scales for world-space rendering.
 */
window.Sim.applyCam = () => {
  window.Sim.ctx.translate(window.Sim.W / 2, window.Sim.H / 2);
  window.Sim.ctx.scale(window.Sim.cam.zoom, window.Sim.cam.zoom);
  window.Sim.ctx.translate(-window.Sim.cam.x, -window.Sim.cam.y);
};

/**
 * Smoothly interpolate zoom toward target each frame.
 */
window.Sim.tickCam = () => {
  window.Sim.cam.zoom += (window.Sim.cam.targetZoom - window.Sim.cam.zoom) * 0.1;
};

// ──────────────────────────────────────────────────────────────────────────────
// Scroll Wheel Zoom
// ──────────────────────────────────────────────────────────────────────────────
window.addEventListener("wheel", e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;  // Zoom in/out factor
  const newZoom = H.clamp(
    window.Sim.cam.targetZoom * factor,
    window.Sim.cam.minZoom,
    window.Sim.cam.maxZoom
  );
  
  // Maintain position under cursor during zoom
  const wb = window.Sim.screenToWorld(e.clientX, e.clientY);
  window.Sim.cam.targetZoom = newZoom;
  window.Sim.cam.x = wb.x - (e.clientX - window.Sim.W / 2) / newZoom;
  window.Sim.cam.y = wb.y - (e.clientY - window.Sim.H / 2) / newZoom;
}, { passive: false });

// ──────────────────────────────────────────────────────────────────────────────
// Mouse Panning (Middle or Right Click)
// ──────────────────────────────────────────────────────────────────────────────
let panStart = { x: 0, y: 0 };
let camStart = { x: 0, y: 0 };

window.addEventListener("mousedown", e => {
  if (e.button === 1 || e.button === 2) {  // Middle (1) or Right (2) button
    window.Sim.panning = true;
    panStart = { x: e.clientX, y: e.clientY };
    camStart = { x: window.Sim.cam.x, y: window.Sim.cam.y };
    e.preventDefault();
  }
});

window.addEventListener("mousemove", e => {
  if (window.Sim.panning) {
    window.Sim.cam.x = camStart.x - (e.clientX - panStart.x) / window.Sim.cam.zoom;
    window.Sim.cam.y = camStart.y - (e.clientY - panStart.y) / window.Sim.cam.zoom;
  }
});

window.addEventListener("mouseup", e => {
  if (e.button === 1 || e.button === 2) {
    window.Sim.panning = false;
  }
});

window.addEventListener("contextmenu", e => e.preventDefault());

// ──────────────────────────────────────────────────────────────────────────────
// Frame All Bodies
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Auto-zoom to fit all planets in view with padding.
 */
window.Sim.frameBodies = () => {
  const pad = 300;  // Padding around objects
  let minX = -window.Sim.SUN.radius * 6;
  let maxX = window.Sim.SUN.radius * 6;
  let minY = -window.Sim.SUN.radius * 6;
  let maxY = window.Sim.SUN.radius * 6;
  
  for (const b of window.Sim.state.bodies) {
    minX = Math.min(minX, b.cx - b.radius);
    maxX = Math.max(maxX, b.cx + b.radius);
    minY = Math.min(minY, b.cy - b.radius);
    maxY = Math.max(maxY, b.cy + b.radius);
  }
  
  window.Sim.cam.x = (minX + maxX) / 2;
  window.Sim.cam.y = (minY + maxY) / 2;
  window.Sim.cam.targetZoom = H.clamp(
    Math.min(
      window.Sim.W / (maxX - minX + pad * 2),
      window.Sim.H / (maxY - minY + pad * 2)
    ),
    window.Sim.cam.minZoom,
    window.Sim.cam.maxZoom
  );
};
