"use strict";

window.Sim.gravSlider.addEventListener("input", () => { window.Sim.sunGravMult = parseFloat(window.Sim.gravSlider.value); window.Sim.gravVal.textContent = window.Sim.sunGravMult.toFixed(2) + "×"; });

const spTrack = document.getElementById("sp-track"), spFill = document.getElementById("sp-fill"), spThumb = document.getElementById("sp-thumb"), spLabel = document.getElementById("sp-label"), spPause = document.getElementById("sp-pause");
window.Sim.updateSpeedBar = () => { const frac = window.Sim.physSpeed / window.Sim.SPEED_MAX; spFill.style.height = (frac * 100) + "%"; spThumb.style.top = ((1 - frac) * 100) + "%"; spLabel.textContent = window.Sim.physSpeed === 0 ? "0×" : window.Sim.physSpeed === 1 ? "1×" : window.Sim.physSpeed.toFixed(1) + "×"; spPause.textContent = window.Sim.paused ? "▶" : "▐▐"; spPause.className = window.Sim.paused ? "paused" : ""; };
window.Sim.setSpeed = v => { window.Sim.physSpeed = clamp(v, 0, window.Sim.SPEED_MAX); if (window.Sim.physSpeed > 0 && window.Sim.paused) window.Sim.paused = false; };
window.Sim.togglePause = () => { window.Sim.paused = !window.Sim.paused; if (!window.Sim.paused && window.Sim.physSpeed === 0) window.Sim.physSpeed = 1; window.Sim.updateSpeedBar(); };
const spTrackPos = clientY => { const rect = spTrack.getBoundingClientRect(); window.Sim.setSpeed(clamp(1 - (clientY - rect.top) / rect.height, 0, 1) * window.Sim.SPEED_MAX); };
let spDrag = false;
document.getElementById("sp-fast").addEventListener("pointerdown", e => { e.preventDefault(); window.Sim.setSpeed(window.Sim.physSpeed + 0.5); });
document.getElementById("sp-slow").addEventListener("pointerdown", e => { e.preventDefault(); window.Sim.setSpeed(window.Sim.physSpeed - 0.5); });
spPause.addEventListener("pointerdown", e => { e.preventDefault(); window.Sim.togglePause(); });
spTrack.addEventListener("pointerdown", e => { spDrag = true; spTrackPos(e.clientY); e.preventDefault(); });
window.addEventListener("pointermove", e => { if (spDrag) spTrackPos(e.clientY); });
window.addEventListener("pointerup", () => { spDrag = false; zmDrag = false; });

const zmTrack = document.getElementById("zm-track"), zmFill = document.getElementById("zm-fill"), zmThumb = document.getElementById("zm-thumb"), zmLabel = document.getElementById("zm-label");
window.Sim.updateZoomBar = () => { const logMin = Math.log(window.Sim.cam.minZoom), logMax = Math.log(window.Sim.cam.maxZoom), frac = clamp((Math.log(window.Sim.cam.targetZoom) - logMin) / (logMax - logMin), 0, 1); zmFill.style.height = (frac * 100) + "%"; zmThumb.style.top = ((1 - frac) * 100) + "%"; zmLabel.textContent = (window.Sim.cam.targetZoom * 100).toFixed(0) + "%"; };
const zmTrackPos = clientY => { const rect = zmTrack.getBoundingClientRect(), frac = clamp(1 - (clientY - rect.top) / rect.height, 0, 1), logMin = Math.log(window.Sim.cam.minZoom), logMax = Math.log(window.Sim.cam.maxZoom); window.Sim.cam.targetZoom = Math.exp(logMin + frac * (logMax - logMin)); };
let zmDrag = false;
document.getElementById("zm-in").addEventListener("pointerdown", e => { e.preventDefault(); window.Sim.cam.targetZoom = clamp(window.Sim.cam.targetZoom * 1.3, window.Sim.cam.minZoom, window.Sim.cam.maxZoom); });
document.getElementById("zm-out").addEventListener("pointerdown", e => { e.preventDefault(); window.Sim.cam.targetZoom = clamp(window.Sim.cam.targetZoom / 1.3, window.Sim.cam.minZoom, window.Sim.cam.maxZoom); });
document.getElementById("zm-fit").addEventListener("pointerdown", e => { e.preventDefault(); window.Sim.frameBodies(); });
zmTrack.addEventListener("pointerdown", e => { zmDrag = true; zmTrackPos(e.clientY); e.preventDefault(); });
window.addEventListener("pointermove", e => { if (zmDrag) zmTrackPos(e.clientY); });

window.Sim.tx = window.Sim.W / 2, window.Sim.ty = window.Sim.H / 2, window.Sim.holding = false, window.Sim.holdT = 0;
window.addEventListener("mousemove", e => { window.Sim.tx = e.clientX; window.Sim.ty = e.clientY; });
window.addEventListener("mousedown", e => { if (e.button !== 0 || window.Sim.uiEl.contains(e.target) || panning) return; window.Sim.holding = true; window.Sim.holdT = performance.now(); window.Sim.cursorEl.classList.add("holding"); });
window.addEventListener("mouseup", e => {
  if (!window.Sim.holding) return; window.Sim.holding = false; window.Sim.cursorEl.classList.remove("holding");
  const charge = Math.min((performance.now() - window.Sim.holdT) / 2000, 1), size = parseFloat(window.Sim.slider.value) * (1 + charge * 4), w = window.Sim.screenToWorld(window.Sim.tx, window.Sim.ty);
  window.Sim.spawnPlanet(w.x, w.y, size);
});
document.getElementById("clear-btn").addEventListener("click", () => { window.Sim.state.bodies = []; window.Sim.state.loose = []; window.Sim.state.flashes = []; window.Sim.updateCount(); });

let pinchDist0 = 0, pinchZoom0 = 1, pinchMidX = 0, pinchMidY = 0;
window.Sim.canvas.addEventListener("touchstart", e => {
  if (e.touches.length === 2) { const a = e.touches[0], b = e.touches[1]; pinchDist0 = hypot(b.clientX - a.clientX, b.clientY - a.clientY); pinchZoom0 = window.Sim.cam.targetZoom; pinchMidX = (a.clientX + b.clientX) / 2; pinchMidY = (a.clientY + b.clientY) / 2; e.preventDefault(); }
  else if (e.touches.length === 1 && !window.Sim.holding) { const t = e.touches[0]; window.Sim.tx = t.clientX; window.Sim.ty = t.clientY; window.Sim.holding = true; window.Sim.holdT = performance.now(); window.Sim.cursorEl.classList.add("holding"); e.preventDefault(); }
}, { passive: false });
window.Sim.canvas.addEventListener("touchmove", e => {
  if (e.touches.length === 2) { const a = e.touches[0], b = e.touches[1], dist = hypot(b.clientX - a.clientX, b.clientY - a.clientY), newZoom = clamp(pinchZoom0 * dist / pinchDist0, window.Sim.cam.minZoom, window.Sim.cam.maxZoom), wb = window.Sim.screenToWorld(pinchMidX, pinchMidY); window.Sim.cam.targetZoom = newZoom; window.Sim.cam.x = wb.x - (pinchMidX - window.Sim.W / 2) / newZoom; window.Sim.cam.y = wb.y - (pinchMidY - window.Sim.H / 2) / newZoom; e.preventDefault(); }
  else if (e.touches.length === 1) { window.Sim.tx = e.touches[0].clientX; window.Sim.ty = e.touches[0].clientY; }
}, { passive: false });
window.Sim.canvas.addEventListener("touchend", e => {
  if (e.touches.length < 2 && window.Sim.holding) { window.Sim.holding = false; window.Sim.cursorEl.classList.remove("holding"); const charge = Math.min((performance.now() - window.Sim.holdT) / 2000, 1), size = parseFloat(window.Sim.slider.value) * (1 + charge * 4), w = window.Sim.screenToWorld(window.Sim.tx, window.Sim.ty); window.Sim.spawnPlanet(w.x, w.y, size); }
}, { passive: false });

window.addEventListener("keydown", e => {
  if (e.key === "=" || e.key === "+") window.Sim.cam.targetZoom = clamp(window.Sim.cam.targetZoom * 1.2, window.Sim.cam.minZoom, window.Sim.cam.maxZoom);
  if (e.key === "-") window.Sim.cam.targetZoom = clamp(window.Sim.cam.targetZoom / 1.2, window.Sim.cam.minZoom, window.Sim.cam.maxZoom);
  if (e.key === "0" || e.key === "r") { window.Sim.cam.targetZoom = 1; window.Sim.cam.x = 0; window.Sim.cam.y = 0; }
  if (e.key === "f") window.Sim.frameBodies();
  if (e.key === " " || e.key === "p") { e.preventDefault(); window.Sim.togglePause(); }
  if (e.key === "]") window.Sim.setSpeed(window.Sim.physSpeed + 0.5);
  if (e.key === "[") window.Sim.setSpeed(window.Sim.physSpeed - 0.5);
});
