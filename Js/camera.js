"use strict";
const Sim = window.Sim;

Sim.cam = { x: 0, y: 0, zoom: 0.08, targetZoom: 0.08, minZoom: 0.01, maxZoom: 4 };

Sim.screenToWorld = (sx, sy) => ({
  x: Sim.cam.x + (sx - Sim.W / 2) / Sim.cam.zoom,
  y: Sim.cam.y + (sy - Sim.H / 2) / Sim.cam.zoom,
});

Sim.applyCam = () => {
  Sim.ctx.translate(Sim.W / 2, Sim.H / 2);
  Sim.ctx.scale(Sim.cam.zoom, Sim.cam.zoom);
  Sim.ctx.translate(-Sim.cam.x, -Sim.cam.y);
};

Sim.tickCam = () => { Sim.cam.zoom += (Sim.cam.targetZoom - Sim.cam.zoom) * 0.1; };

window.addEventListener("wheel", e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const newZoom = clamp(Sim.cam.targetZoom * factor, Sim.cam.minZoom, Sim.cam.maxZoom);
  const wb = Sim.screenToWorld(e.clientX, e.clientY);
  Sim.cam.targetZoom = newZoom;
  Sim.cam.x = wb.x - (e.clientX - Sim.W / 2) / newZoom;
  Sim.cam.y = wb.y - (e.clientY - Sim.H / 2) / newZoom;
}, { passive: false });

let panning = false, panStart = { x: 0, y: 0 }, camStart = { x: 0, y: 0 };
window.addEventListener("mousedown", e => {
  if (e.button === 1 || e.button === 2) {
    panning = true; panStart = { x: e.clientX, y: e.clientY }; camStart = { x: Sim.cam.x, y: Sim.cam.y };
    e.preventDefault();
  }
});
window.addEventListener("mousemove", e => {
  if (panning) {
    Sim.cam.x = camStart.x - (e.clientX - panStart.x) / Sim.cam.zoom;
    Sim.cam.y = camStart.y - (e.clientY - panStart.y) / Sim.cam.zoom;
  }
});
window.addEventListener("mouseup", e => { if (e.button === 1 || e.button === 2) panning = false; });
window.addEventListener("contextmenu", e => e.preventDefault());

Sim.frameBodies = () => {
  const pad = 300;
  let minX = -Sim.SUN.radius * 6, maxX = Sim.SUN.radius * 6, minY = -Sim.SUN.radius * 6, maxY = Sim.SUN.radius * 6;
  for (const b of Sim.state.bodies) {
    minX = Math.min(minX, b.cx - b.radius); maxX = Math.max(maxX, b.cx + b.radius);
    minY = Math.min(minY, b.cy - b.radius); maxY = Math.max(maxY, b.cy + b.radius);
  }
  Sim.cam.x = (minX + maxX) / 2; Sim.cam.y = (minY + maxY) / 2;
  Sim.cam.targetZoom = clamp(Math.min(Sim.W / (maxX - minX + pad * 2), Sim.H / (maxY - minY + pad * 2)), Sim.cam.minZoom, Sim.cam.maxZoom);
};
