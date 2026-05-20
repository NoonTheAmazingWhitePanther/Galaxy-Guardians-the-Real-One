"use strict";
const Sim = window.Sim;

Sim.gravSlider.addEventListener("input", () => { Sim.sunGravMult = parseFloat(Sim.gravSlider.value); Sim.gravVal.textContent = Sim.sunGravMult.toFixed(2) + "×"; });

const spTrack = document.getElementById("sp-track"), spFill = document.getElementById("sp-fill"), spThumb = document.getElementById("sp-thumb"), spLabel = document.getElementById("sp-label"), spPause = document.getElementById("sp-pause");
Sim.updateSpeedBar = () => { const frac = Sim.physSpeed / Sim.SPEED_MAX; spFill.style.height = (frac * 100) + "%"; spThumb.style.top = ((1 - frac) * 100) + "%"; spLabel.textContent = Sim.physSpeed === 0 ? "0×" : Sim.physSpeed === 1 ? "1×" : Sim.physSpeed.toFixed(1) + "×"; spPause.textContent = Sim.paused ? "▶" : "▐▐"; spPause.className = Sim.paused ? "paused" : ""; };
Sim.setSpeed = v => { Sim.physSpeed = clamp(v, 0, Sim.SPEED_MAX); if (Sim.physSpeed > 0 && Sim.paused) Sim.paused = false; };
Sim.togglePause = () => { Sim.paused = !Sim.paused; if (!Sim.paused && Sim.physSpeed === 0) Sim.physSpeed = 1; Sim.updateSpeedBar(); };
const spTrackPos = clientY => { const rect = spTrack.getBoundingClientRect(); Sim.setSpeed(clamp(1 - (clientY - rect.top) / rect.height, 0, 1) * Sim.SPEED_MAX); };
let spDrag = false;
document.getElementById("sp-fast").addEventListener("pointerdown", e => { e.preventDefault(); Sim.setSpeed(Sim.physSpeed + 0.5); });
document.getElementById("sp-slow").addEventListener("pointerdown", e => { e.preventDefault(); Sim.setSpeed(Sim.physSpeed - 0.5); });
spPause.addEventListener("pointerdown", e => { e.preventDefault(); Sim.togglePause(); });
spTrack.addEventListener("pointerdown", e => { spDrag = true; spTrackPos(e.clientY); e.preventDefault(); });
window.addEventListener("pointermove", e => { if (spDrag) spTrackPos(e.clientY); });
window.addEventListener("pointerup", () => { spDrag = false; zmDrag = false; });

const zmTrack = document.getElementById("zm-track"), zmFill = document.getElementById("zm-fill"), zmThumb = document.getElementById("zm-thumb"), zmLabel = document.getElementById("zm-label");
Sim.updateZoomBar = () => { const logMin = Math.log(Sim.cam.minZoom), logMax = Math.log(Sim.cam.maxZoom), frac = clamp((Math.log(Sim.cam.targetZoom) - logMin) / (logMax - logMin), 0, 1); zmFill.style.height = (frac * 100) + "%"; zmThumb.style.top = ((1 - frac) * 100) + "%"; zmLabel.textContent = (Sim.cam.targetZoom * 100).toFixed(0) + "%"; };
const zmTrackPos = clientY => { const rect = zmTrack.getBoundingClientRect(), frac = clamp(1 - (clientY - rect.top) / rect.height, 0, 1), logMin = Math.log(Sim.cam.minZoom), logMax = Math.log(Sim.cam.maxZoom); Sim.cam.targetZoom = Math.exp(logMin + frac * (logMax - logMin)); };
let zmDrag = false;
document.getElementById("zm-in").addEventListener("pointerdown", e => { e.preventDefault(); Sim.cam.targetZoom = clamp(Sim.cam.targetZoom * 1.3, Sim.cam.minZoom, Sim.cam.maxZoom); });
document.getElementById("zm-out").addEventListener("pointerdown", e => { e.preventDefault(); Sim.cam.targetZoom = clamp(Sim.cam.targetZoom / 1.3, Sim.cam.minZoom, Sim.cam.maxZoom); });
document.getElementById("zm-fit").addEventListener("pointerdown", e => { e.preventDefault(); Sim.frameBodies(); });
zmTrack.addEventListener("pointerdown", e => { zmDrag = true; zmTrackPos(e.clientY); e.preventDefault(); });
window.addEventListener("pointermove", e => { if (zmDrag) zmTrackPos(e.clientY); });

Sim.tx = Sim.W / 2, Sim.ty = Sim.H / 2, Sim.holding = false, Sim.holdT = 0;
window.addEventListener("mousemove", e => { Sim.tx = e.clientX; Sim.ty = e.clientY; });
window.addEventListener("mousedown", e => { if (e.button !== 0 || Sim.uiEl.contains(e.target) || panning) return; Sim.holding = true; Sim.holdT = performance.now(); Sim.cursorEl.classList.add("holding"); });
window.addEventListener("mouseup", e => {
  if (!Sim.holding) return; Sim.holding = false; Sim.cursorEl.classList.remove("holding");
  const charge = Math.min((performance.now() - Sim.holdT) / 2000, 1), size = parseFloat(Sim.slider.value) * (1 + charge * 4), w = Sim.screenToWorld(Sim.tx, Sim.ty);
  Sim.spawnPlanet(w.x, w.y, size);
});
document.getElementById("clear-btn").addEventListener("click", () => { Sim.state.bodies = []; Sim.state.loose = []; Sim.state.flashes = []; Sim.updateCount(); });

let pinchDist0 = 0, pinchZoom0 = 1, pinchMidX = 0, pinchMidY = 0;
Sim.canvas.addEventListener("touchstart", e => {
  if (e.touches.length === 2) { const a = e.touches[0], b = e.touches[1]; pinchDist0 = hypot(b.clientX - a.clientX, b.clientY - a.clientY); pinchZoom0 = Sim.cam.targetZoom; pinchMidX = (a.clientX + b.clientX) / 2; pinchMidY = (a.clientY + b.clientY) / 2; e.preventDefault(); }
  else if (e.touches.length === 1 && !Sim.holding) { const t = e.touches[0]; Sim.tx = t.clientX; Sim.ty = t.clientY; Sim.holding = true; Sim.holdT = performance.now(); Sim.cursorEl.classList.add("holding"); e.preventDefault(); }
}, { passive: false });
Sim.canvas.addEventListener("touchmove", e => {
  if (e.touches.length === 2) { const a = e.touches[0], b = e.touches[1], dist = hypot(b.clientX - a.clientX, b.clientY - a.clientY), newZoom = clamp(pinchZoom0 * dist / pinchDist0, Sim.cam.minZoom, Sim.cam.maxZoom), wb = Sim.screenToWorld(pinchMidX, pinchMidY); Sim.cam.targetZoom = newZoom; Sim.cam.x = wb.x - (pinchMidX - Sim.W / 2) / newZoom; Sim.cam.y = wb.y - (pinchMidY - Sim.H / 2) / newZoom; e.preventDefault(); }
  else if (e.touches.length === 1) { Sim.tx = e.touches[0].clientX; Sim.ty = e.touches[0].clientY; }
}, { passive: false });
Sim.canvas.addEventListener("touchend", e => {
  if (e.touches.length < 2 && Sim.holding) { Sim.holding = false; Sim.cursorEl.classList.remove("holding"); const charge = Math.min((performance.now() - Sim.holdT) / 2000, 1), size = parseFloat(Sim.slider.value) * (1 + charge * 4), w = Sim.screenToWorld(Sim.tx, Sim.ty); Sim.spawnPlanet(w.x, w.y, size); }
}, { passive: false });

window.addEventListener("keydown", e => {
  if (e.key === "=" || e.key === "+") Sim.cam.targetZoom = clamp(Sim.cam.targetZoom * 1.2, Sim.cam.minZoom, Sim.cam.maxZoom);
  if (e.key === "-") Sim.cam.targetZoom = clamp(Sim.cam.targetZoom / 1.2, Sim.cam.minZoom, Sim.cam.maxZoom);
  if (e.key === "0" || e.key === "r") { Sim.cam.targetZoom = 1; Sim.cam.x = 0; Sim.cam.y = 0; }
  if (e.key === "f") Sim.frameBodies();
  if (e.key === " " || e.key === "p") { e.preventDefault(); Sim.togglePause(); }
  if (e.key === "]") Sim.setSpeed(Sim.physSpeed + 0.5);
  if (e.key === "[") Sim.setSpeed(Sim.physSpeed - 0.5);
});
