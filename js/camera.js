"use strict";

// ── Import helpers ───────────────────────────────────
// We need 'clamp' from utils.js to handle zoom limits
const { clamp } = window.Sim;

// ── Shared State ─────────────────────────────────────
// Expose 'panning' so input-ui.js can check if we are dragging
window.Sim.panning = false; 

// ── Camera Definition ────────────────────────────────
window.Sim.cam = { x: 0, y: 0, zoom: 0.08, targetZoom: 0.08, minZoom: 0.01, maxZoom: 4 };

window.Sim.screenToWorld = (sx, sy) => ({
  x: window.Sim.cam.x + (sx - window.Sim.W / 2) / window.Sim.cam.zoom,
  y: window.Sim.cam.y + (sy - window.Sim.H / 2) / window.Sim.cam.zoom,
});

window.Sim.applyCam = () => {
  window.Sim.ctx.translate(window.Sim.W / 2, window.Sim.H / 2);
  window.Sim.ctx.scale(window.Sim.cam.zoom, window.Sim.cam.zoom);
  window.Sim.ctx.translate(-window.Sim.cam.x, -window.Sim.cam.y);
};

window.Sim.tickCam = () => { window.Sim.cam.zoom += (window.Sim.cam.targetZoom - window.Sim.cam.zoom) * 0.1; };

// ── Event Listeners ──────────────────────────────────
window.addEventListener("wheel", e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const newZoom = clamp(window.Sim.cam.targetZoom * factor, window.Sim.cam.minZoom, window.Sim.cam.maxZoom);
  const wb = window.Sim.screenToWorld(e.clientX, e.clientY);
  window.Sim.cam.targetZoom = newZoom;
  window.Sim.cam.x = wb.x - (e.clientX - window.Sim.W / 2) / newZoom;
  window.Sim.cam.y = wb.y - (e.clientY - window.Sim.H / 2) / newZoom;
}, { passive: false });

// Local variables for drag math
let panStart = { x: 0, y: 0 }, camStart = { x: 0, y: 0 };

window.addEventListener("mousedown", e => {
  // Middle or Right click starts panning
  if (e.button === 1 || e.button === 2) {
    window.Sim.panning = true; // Set global flag
    panStart = { x: e.clientX, y: e.clientY }; 
    camStart = { x: window.Sim.cam.x, y: window.Sim.cam.y };
    e.preventDefault();
  }
});

window.addEventListener("mousemove", e => {
  // Only move camera if global panning flag is true
  if (window.Sim.panning) {
    window.Sim.cam.x = camStart.x - (e.clientX - panStart.x) / window.Sim.cam.zoom;
    window.Sim.cam.y = camStart.y - (e.clientY - panStart.y) / window.Sim.cam.zoom;
  }
});

window.addEventListener("mouseup", e => { 
  if (e.button === 1 || e.button === 2) window.Sim.panning = false; // Reset global flag
});

window.addEventListener("contextmenu", e => e.preventDefault());

window.Sim.frameBodies = () => {
  const pad = 300;
  let minX = -window.Sim.SUN.radius * 6, maxX = window.Sim.SUN.radius * 6, minY = -window.Sim.SUN.radius * 6, maxY = window.Sim.SUN.radius * 6;
  for (const b of window.Sim.state.bodies) {
    minX = Math.min(minX, b.cx - b.radius); maxX = Math.max(maxX, b.cx + b.radius);
    minY = Math.min(minY, b.cy - b.radius); maxY = Math.max(maxY, b.cy + b.radius);
  }
  window.Sim.cam.x = (minX + maxX) / 2; 
  window.Sim.cam.y = (minY + maxY) / 2;
  window.Sim.cam.targetZoom = clamp(Math.min(window.Sim.W / (maxX - minX + pad * 2), window.Sim.H / (maxY - minY + pad * 2)), window.Sim.cam.minZoom, window.Sim.cam.maxZoom);
};    window.Sim.cam.x = camStart.x - (e.clientX - panStart.x) / window.Sim.cam.zoom;
    window.Sim.cam.y = camStart.y - (e.clientY - panStart.y) / window.Sim.cam.zoom;
  }
});
window.addEventListener("mouseup", e => { if (e.button === 1 || e.button === 2) panning = false; });
window.addEventListener("contextmenu", e => e.preventDefault());

window.Sim.frameBodies = () => {
  const pad = 300;
  let minX = -window.Sim.SUN.radius * 6, maxX = window.Sim.SUN.radius * 6, minY = -window.Sim.SUN.radius * 6, maxY = window.Sim.SUN.radius * 6;
  for (const b of window.Sim.state.bodies) {
    minX = Math.min(minX, b.cx - b.radius); maxX = Math.max(maxX, b.cx + b.radius);
    minY = Math.min(minY, b.cy - b.radius); maxY = Math.max(maxY, b.cy + b.radius);
  }
  window.Sim.cam.x = (minX + maxX) / 2; window.Sim.cam.y = (minY + maxY) / 2;
  window.Sim.cam.targetZoom = clamp(Math.min(window.Sim.W / (maxX - minX + pad * 2), window.Sim.H / (maxY - minY + pad * 2)), window.Sim.cam.minZoom, window.Sim.cam.maxZoom);
};
