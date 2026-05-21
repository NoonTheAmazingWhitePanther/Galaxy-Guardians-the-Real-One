"use strict";

// ════════════════════════════════════════════════════════════════════════════════
// INPUT-UI.JS - User Interface Controls & Input Handling
// ════════════════════════════════════════════════════════════════════════════════
// Purpose: Manage all UI interactions: sliders, buttons, keyboard, touch.
// Handles gravity control, speed/pause, zoom, mouse/touch input, pan pad.
// ════════════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────────────
// Gravity Slider Control
// ──────────────────────────────────────────────────────────────────────────────
window.Sim.gravSlider.addEventListener("input", () => {
  window.Sim.sunGravMult = parseFloat(window.Sim.gravSlider.value);
  window.Sim.gravVal.textContent = window.Sim.sunGravMult.toFixed(2) + "×";
});

// ──────────────────────────────────────────────────────────────────────────────
// Speed Bar - Physics simulation speed control
// ──────────────────────────────────────────────────────────────────────────────
const spTrack = document.getElementById("sp-track");
const spFill = document.getElementById("sp-fill");
const spThumb = document.getElementById("sp-thumb");
const spLabel = document.getElementById("sp-label");
const spPause = document.getElementById("sp-pause");

/**
 * Update speed bar visual representation.
 */
window.Sim.updateSpeedBar = () => {
  const frac = window.Sim.physSpeed / window.Sim.SPEED_MAX;
  spFill.style.height = (frac * 100) + "%";
  spThumb.style.top = ((1 - frac) * 100) + "%";
  spLabel.textContent = window.Sim.physSpeed === 0 ? "0×" : window.Sim.physSpeed === 1 ? "1×" : window.Sim.physSpeed.toFixed(1) + "×";
  spPause.textContent = window.Sim.paused ? "▶" : "▐▐";
  spPause.className = window.Sim.paused ? "paused" : "";
};

/**
 * Set physics speed with clamping and auto-unpause.
 * @param {number} v - Desired speed
 */
window.Sim.setSpeed = v => {
  window.Sim.physSpeed = H.clamp(v, 0, window.Sim.SPEED_MAX);
  if (window.Sim.physSpeed > 0 && window.Sim.paused) window.Sim.paused = false;
};

/**
 * Toggle pause state.
 */
window.Sim.togglePause = () => {
  window.Sim.paused = !window.Sim.paused;
  if (!window.Sim.paused && window.Sim.physSpeed === 0) window.Sim.physSpeed = 1;
  window.Sim.updateSpeedBar();
};

/**
 * Set speed from track click position.
 * @param {number} clientY - Mouse Y position
 */
const spTrackPos = clientY => {
  const rect = spTrack.getBoundingClientRect();
  window.Sim.setSpeed(H.clamp(1 - (clientY - rect.top) / rect.height, 0, 1) * window.Sim.SPEED_MAX);
};

let spDrag = false;
document.getElementById("sp-fast").addEventListener("pointerdown", e => {
  e.preventDefault();
  window.Sim.setSpeed(window.Sim.physSpeed + 0.5);
});
document.getElementById("sp-slow").addEventListener("pointerdown", e => {
  e.preventDefault();
  window.Sim.setSpeed(window.Sim.physSpeed - 0.5);
});
spPause.addEventListener("pointerdown", e => {
  e.preventDefault();
  window.Sim.togglePause();
});
spTrack.addEventListener("pointerdown", e => {
  spDrag = true;
  spTrackPos(e.clientY);
  e.preventDefault();
});
window.addEventListener("pointermove", e => {
  if (spDrag) spTrackPos(e.clientY);
});
window.addEventListener("pointerup", () => {
  spDrag = false;
  zmDrag = false;
});

// ──────────────────────────────────────────────────────────────────────────────
// Zoom Bar - Camera zoom control
// ──────────────────────────────────────────────────────────────────────────────
const zmTrack = document.getElementById("zm-track");
const zmFill = document.getElementById("zm-fill");
const zmThumb = document.getElementById("zm-thumb");
const zmLabel = document.getElementById("zm-label");

/**
 * Update zoom bar visual representation using logarithmic scale.
 */
window.Sim.updateZoomBar = () => {
  const logMin = Math.log(window.Sim.cam.minZoom);
  const logMax = Math.log(window.Sim.cam.maxZoom);
  const frac = H.clamp((Math.log(window.Sim.cam.targetZoom) - logMin) / (logMax - logMin), 0, 1);
  zmFill.style.height = (frac * 100) + "%";
  zmThumb.style.top = ((1 - frac) * 100) + "%";
  zmLabel.textContent = (window.Sim.cam.targetZoom * 100).toFixed(0) + "%";
};

/**
 * Set zoom from track click position using logarithmic scale.
 * @param {number} clientY - Mouse Y position
 */
const zmTrackPos = clientY => {
  const rect = zmTrack.getBoundingClientRect();
  const frac = H.clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
  const logMin = Math.log(window.Sim.cam.minZoom);
  const logMax = Math.log(window.Sim.cam.maxZoom);
  window.Sim.cam.targetZoom = Math.exp(logMin + frac * (logMax - logMin));
};

let zmDrag = false;
document.getElementById("zm-in").addEventListener("pointerdown", e => {
  e.preventDefault();
  window.Sim.cam.targetZoom = H.clamp(window.Sim.cam.targetZoom * 1.3, window.Sim.cam.minZoom, window.Sim.cam.maxZoom);
});
document.getElementById("zm-out").addEventListener("pointerdown", e => {
  e.preventDefault();
  window.Sim.cam.targetZoom = H.clamp(window.Sim.cam.targetZoom / 1.3, window.Sim.cam.minZoom, window.Sim.cam.maxZoom);
});
document.getElementById("zm-fit").addEventListener("pointerdown", e => {
  e.preventDefault();
  window.Sim.frameBodies();
});
zmTrack.addEventListener("pointerdown", e => {
  zmDrag = true;
  zmTrackPos(e.clientY);
  e.preventDefault();
});
window.addEventListener("pointermove", e => {
  if (zmDrag) zmTrackPos(e.clientY);
});

// ──────────────────────────────────────────────────────────────────────────────
// Mouse Input - Cursor tracking and planet creation
// ──────────────────────────────────────────────────────────────────────────────
window.Sim.tx = window.Sim.W / 2;        // Cursor X
window.Sim.ty = window.Sim.H / 2;        // Cursor Y
window.Sim.holding = false;               // User holding down to charge
window.Sim.holdT = 0;                     // Charge start time

window.addEventListener("mousemove", e => {
  window.Sim.tx = e.clientX;
  window.Sim.ty = e.clientY;
});

window.addEventListener("mousedown", e => {
  // Only left click, not over UI, not while panning camera
  if (e.button !== 0 || window.Sim.uiEl.contains(e.target) || window.Sim.panning) return;
  window.Sim.holding = true;
  window.Sim.holdT = performance.now();
  window.Sim.cursorEl.classList.add("holding");
});

window.addEventListener("mouseup", e => {
  if (!window.Sim.holding) return;
  window.Sim.holding = false;
  window.Sim.cursorEl.classList.remove("holding");
  
  // Calculate charge from hold duration
  const charge = Math.min((performance.now() - window.Sim.holdT) / 2000, 1);
  const sliderVal = parseFloat(window.Sim.slider.value);
  const radius = window.Sim.getPlanetRadius(sliderVal, charge);
  const w = window.Sim.screenToWorld(window.Sim.tx, window.Sim.ty);
  window.Sim.spawnPlanet(w.x, w.y, radius);
});

// ──────────────────────────────────────────────────────────────────────────────
// Touch Input - Touch panning and pinch zoom
// ──────────────────────────────────────────────────────────────────────────────
let pinchDist0 = 0, pinchZoom0 = 1, pinchMidX = 0, pinchMidY = 0;

window.Sim.canvas.addEventListener("touchstart", e => {
  if (e.touches.length === 2) {
    // Pinch zoom
    const a = e.touches[0], b = e.touches[1];
    pinchDist0 = H.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    pinchZoom0 = window.Sim.cam.targetZoom;
    pinchMidX = (a.clientX + b.clientX) / 2;
    pinchMidY = (a.clientY + b.clientY) / 2;
    e.preventDefault();
  } else if (e.touches.length === 1 && !window.Sim.holding) {
    // Single touch: start planet charging
    const t = e.touches[0];
    window.Sim.tx = t.clientX;
    window.Sim.ty = t.clientY;
    window.Sim.holding = true;
    window.Sim.holdT = performance.now();
    window.Sim.cursorEl.classList.add("holding");
    e.preventDefault();
  }
}, { passive: false });

window.Sim.canvas.addEventListener("touchmove", e => {
  if (e.touches.length === 2) {
    // Pinch zoom movement
    const a = e.touches[0], b = e.touches[1];
    const dist = H.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const newZoom = H.clamp(pinchZoom0 * dist / pinchDist0, window.Sim.cam.minZoom, window.Sim.cam.maxZoom);
    const wb = window.Sim.screenToWorld(pinchMidX, pinchMidY);
    window.Sim.cam.targetZoom = newZoom;
    window.Sim.cam.x = wb.x - (pinchMidX - window.Sim.W / 2) / newZoom;
    window.Sim.cam.y = wb.y - (pinchMidY - window.Sim.H / 2) / newZoom;
    e.preventDefault();
  } else if (e.touches.length === 1) {
    // Single touch: update cursor
    window.Sim.tx = e.touches[0].clientX;
    window.Sim.ty = e.touches[0].clientY;
  }
}, { passive: false });

window.Sim.canvas.addEventListener("touchend", e => {
  if (e.touches.length < 2 && window.Sim.holding) {
    window.Sim.holding = false;
    window.Sim.cursorEl.classList.remove("holding");
    
    // Spawn planet from charge
    const charge = Math.min((performance.now() - window.Sim.holdT) / 2000, 1);
    const sliderVal = parseFloat(window.Sim.slider.value);
    const radius = window.Sim.getPlanetRadius(sliderVal, charge);
    const w = window.Sim.screenToWorld(window.Sim.tx, window.Sim.ty);
    window.Sim.spawnPlanet(w.x, w.y, radius);
  }
}, { passive: false });

// ──────────────────────────────────────────────────────────────────────────────
// Keyboard Shortcuts
// ──────────────────────────────────────────────────────────────────────────────
window.addEventListener("keydown", e => {
  if (e.key === "=" || e.key === "+") {
    window.Sim.cam.targetZoom = H.clamp(window.Sim.cam.targetZoom * 1.2, window.Sim.cam.minZoom, window.Sim.cam.maxZoom);
  }
  if (e.key === "-") {
    window.Sim.cam.targetZoom = H.clamp(window.Sim.cam.targetZoom / 1.2, window.Sim.cam.minZoom, window.Sim.cam.maxZoom);
  }
  if (e.key === "0" || e.key === "r") {
    window.Sim.cam.targetZoom = 1;
    window.Sim.cam.x = 0;
    window.Sim.cam.y = 0;
  }
  if (e.key === "f") window.Sim.frameBodies();
  if (e.key === " " || e.key === "p") {
    e.preventDefault();
    window.Sim.togglePause();
  }
  if (e.key === "]") window.Sim.setSpeed(window.Sim.physSpeed + 0.5);
  if (e.key === "[") window.Sim.setSpeed(window.Sim.physSpeed - 0.5);
});

// ──────────────────────────────────────────────────────────────────────────────
// Directional Pan Pad - Touch-friendly camera navigation
// ──────────────────────────────────────────────────────────────────────────────
const panPad = document.getElementById('pan-pad');
if (panPad) {
  window.Sim.panPadActive = false;        // Is user actively using pad
  window.Sim.panPadDir = { x: 0, y: 0 };  // Direction vector (8-snapped)
  window.Sim.panPadPower = 0;             // Current pan speed
  const PAN_ACCEL = 0.7;                  // Acceleration per frame
  const PAN_MAX = 3;                      // Maximum pan speed
  
  panPad.addEventListener('pointerdown', e => {
    window.Sim.panPadActive = true;
    window.Sim.panPadPower = 0;
    panPad.classList.add('active');
    panPad.setPointerCapture(e.pointerId);
    updateDirection(e);
    e.preventDefault();
  });
  
  panPad.addEventListener('pointermove', e => {
    if (!window.Sim.panPadActive) return;
    updateDirection(e);
    e.preventDefault();
  });
  
  panPad.addEventListener('pointerup', e => {
    window.Sim.panPadActive = false;
    window.Sim.panPadPower = 0;
    window.Sim.panPadDir = { x: 0, y: 0 };
    panPad.classList.remove('active');
  });
  
  /**
   * Update pan direction based on pointer position relative to pad center.
   * Snaps to 8 cardinal/diagonal directions.
   */
  function updateDirection(e) {
    const rect = panPad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    
    // Snap to nearest 45° angle
    const angle = Math.atan2(dy, dx);
    const sector = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    window.Sim.panPadDir.x = Math.cos(sector);
    window.Sim.panPadDir.y = Math.sin(sector);
  }
  
  /**
   * Apply pan pad movement to camera each frame.
   */
  window.Sim.updatePanPad = () => {
    if (!window.Sim.panPadActive) return;
    window.Sim.panPadPower = Math.min(window.Sim.panPadPower + PAN_ACCEL, PAN_MAX);
    const speed = Math.min(window.Sim.panPadPower / window.Sim.cam.zoom, 100);
    window.Sim.cam.x += window.Sim.panPadDir.x * speed;
    window.Sim.cam.y += window.Sim.panPadDir.y * speed;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Clear Button
// ──────────────────────────────────────────────────────────────────────────────
document.getElementById("clear-btn").addEventListener("click", () => {
  window.Sim.state.bodies = [];
  window.Sim.state.loose = [];
  window.Sim.state.flashes = [];
  window.Sim.updateCount();
});
