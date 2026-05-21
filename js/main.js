"use strict";

// ════════════════════════════════════════════════════════════════════════════════
// MAIN.JS - Game Initialization & Main Loop
// ════════════════════════════════════════════════════════════════════════════════
// Purpose: Initialize the game and run the main animation loop.
// Coordinates all systems: physics, rendering, UI, and camera.
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Initialize game systems and start the main loop.
 * Called once when the document is ready.
 */
window.Sim.init = () => {
  // ── Initialize Core Systems ──────────────────────────────────────────
  window.Sim.initStars();                 // Background stars
  window.Sim.initTrailBuffers();          // Planet motion trails
  window.Sim.updateSpeedBar();            // UI speed display
  window.Sim.updateZoomBar();             // UI zoom display
  
  // ── Initial Canvas Clear ────────────────────────────────────────────���
  window.Sim.ctx.fillStyle = '#04040c';
  window.Sim.ctx.fillRect(0, 0, window.Sim.W, window.Sim.H);
  
  // ── Window Resize Handler ────────────────────────────────────────────
  window.addEventListener('resize', () => {
    window.Sim.W = window.Sim.canvas.width = window.innerWidth;
    window.Sim.H = window.Sim.canvas.height = window.innerHeight;
    window.Sim.initStars();
    window.Sim.resizeTrailBuffers();
  });
  
  // ── Main Animation Loop ──────────────────────────────────────────────
  let lastT = 0;
  const loop = (t) => {
    requestAnimationFrame(loop);
    const rawDt = Math.min((t - lastT) / 1000, 0.05);  // Delta time, capped at 50ms
    lastT = t;
    
    // Update UI & Camera
    window.Sim.updateFPS(rawDt);
    window.Sim.tickCam();
    window.Sim.updatePanPad();
    window.Sim.updateSpeedBar();
    window.Sim.updateZoomBar();
    
    // Draw background layers (screen-space, no camera transform)
    window.Sim.ctx.fillStyle = 'rgba(4,4,12,.28)';
    window.Sim.ctx.fillRect(0, 0, window.Sim.W, window.Sim.H);
    window.Sim.drawNebula(t);
    window.Sim.drawStars(t);
    
    // World-space rendering & physics (apply camera transform)
    window.Sim.ctx.save();
    window.Sim.applyCam();
    
    // Physics simulation (if not paused)
    if (!window.Sim.paused && window.Sim.physSpeed > 0 && rawDt > 0) {
      // Adaptive substeps to prevent instability with large dt
      const MAX_SAFE_SD = rawDt * 3.0 * window.Sim.config.PHYS_SCALE;
      const totalSd = rawDt * window.Sim.physSpeed * window.Sim.config.PHYS_SCALE;
      const numTicks = Math.ceil(totalSd / MAX_SAFE_SD);
      const sdPerTick = totalSd / numTicks;
      
      for (let tick = 0; tick < numTicks; tick++) {
        window.Sim.tickBodies(sdPerTick);
        window.Sim.tickLoose(sdPerTick);
      }
      window.Sim.tickAsteroids(rawDt * window.Sim.physSpeed * window.Sim.config.PHYS_SCALE);
    }
    
    // Draw world objects
    window.Sim.drawFlashes();
    window.Sim.drawSun(t);
    window.Sim.drawSolarTentacles(t);
    window.Sim.drawSolarRays(t);
    window.Sim.drawLoose();
    window.Sim.drawAsteroids();
    window.Sim.drawOrbitPreview(t);
    window.Sim.ctx.restore();  // End camera transform
    
    // Trail system: render planets to buffer, composite, advance frame
    window.Sim.renderPlanetsToBuffer();
    window.Sim.drawTrail();
    window.Sim.trailHead = (window.Sim.trailHead + 1) % window.Sim.trailBufs.length;
    
    // Screen-space overlays (no camera transform)
    window.Sim.drawCharge();
    window.Sim.drawFPS();
    window.Sim.ctx.fillStyle = 'rgba(180,210,255,.15)';
    window.Sim.ctx.font = '8px "Space Mono",monospace';
    window.Sim.ctx.letterSpacing = '.18em';
    window.Sim.ctx.fillText(
      `${(window.Sim.cam.zoom * 100).toFixed(0)}% SCROLL·ZOOM RIGHT-DRAG·PAN F·FIT SPACE·PAUSE`,
      16, window.Sim.H - 16
    );
    
    // Update cursor position & planet counter
    window.Sim.cursorEl.style.left = window.Sim.tx + 'px';
    window.Sim.cursorEl.style.top = window.Sim.ty + 'px';
    window.Sim.updateCount();
  };
  
  requestAnimationFrame(loop);
};

// ──────────────────────────────────────────────────────────────────────────────
// Bootstrap - Start when document is ready
// ──────────────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.Sim.init);
} else {
  window.Sim.init();
}
