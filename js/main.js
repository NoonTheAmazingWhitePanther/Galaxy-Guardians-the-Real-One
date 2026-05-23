"use strict";


// ── At the TOP of each file (after "use strict") ─────
// Cache helpers from window.Sim for performance

window.Sim.init = () => {
  // ── Initialize Core Systems ──────────────────────
  window.Sim.initStars();
  window.Sim.initTrailBuffers();
  window.Sim.updateSpeedBar();
  window.Sim.updateZoomBar();

  // ── Initial Canvas Clear ─────────────────────────
  window.Sim.ctx.fillStyle = '#04040c';
  window.Sim.ctx.fillRect(0, 0, window.Sim.W, window.Sim.H);

  // ── Window Resize Handler ────────────────────────
  window.addEventListener('resize', () => {
    window.Sim.W = window.Sim.canvas.width = window.innerWidth;
    window.Sim.H = window.Sim.canvas.height = window.innerHeight;
    window.Sim.initStars();
    window.Sim.resizeTrailBuffers();
  });

  // ── Main Animation Loop ───────────────────────
  
  let lastT = 0;
  const loop = (t) => {
    requestAnimationFrame(loop);
    const rawDt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;

    // UI & Camera updates
    window.Sim.updateFPS(rawDt);
    window.Sim.tickCam();
    window.Sim.updatePanPad();
    window.Sim.updateSpeedBar();
    window.Sim.updateZoomBar();

    // Background layers
    window.Sim.ctx.fillStyle = 'rgba(4,4,12,.28)';
    window.Sim.ctx.fillRect(0, 0, window.Sim.W, window.Sim.H);
    window.Sim.drawNebula(t);
    window.Sim.drawStars(t);

    // World-space rendering & physics
    window.Sim.ctx.save();
    window.Sim.applyCam();

    if (!window.Sim.paused && window.Sim.physSpeed > 0 && rawDt > 0) {
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

    
    window.Sim.drawFlashes();
    window.Sim.drawSun(t);
    window.Sim.drawSolarTentacles(t);
    window.Sim.drawSolarRays(t);
    window.Sim.drawLoose();
    window.Sim.drawAsteroids();
    window.Sim.drawOrbitPreview(t);
    window.Sim.ctx.restore(); // End camera transform

    // Trail system (buffer → composite → advance)
    window.Sim.renderPlanetsToBuffer();
    window.Sim.drawTrail();
    window.Sim.trailHead = (window.Sim.trailHead + 1) % window.Sim.trailBufs.length;

    // Screen-space overlays
    window.Sim.drawCharge();
    window.Sim.drawFPS();
    window.Sim.ctx.fillStyle = 'rgba(180,210,255,.15)';
    window.Sim.ctx.font = '8px "Space Mono",monospace';
    window.Sim.ctx.letterSpacing = '.18em';
    window.Sim.ctx.fillText(
      `${(window.Sim.cam.zoom * 100).toFixed(0)}% SCROLL·ZOOM RIGHT-DRAG·PAN F·FIT SPACE·PAUSE`,
      16, window.Sim.H - 16
    );

    // Update cursor & planet counter
    window.Sim.cursorEl.style.left = window.Sim.tx + 'px';
    window.Sim.cursorEl.style.top = window.Sim.ty + 'px';
    window.Sim.updateCount();


  // 🔹 FPS CALCULATION (add this near start of tick)
  /*
  Sim.frameCount++;
  if (now - Sim.fpsUpdateTime >= 500) { // Update every 500ms
    Sim.fps = Math.round((Sim.frameCount * 1000) / (now - Sim.fpsUpdateTime));
    Sim.frameCount = 0;
    Sim.fpsUpdateTime = now;
    
    // Update DOM (with color coding)
    const fpsEl = document.getElementById('fps-value');
    const fpsDisplay = document.getElementById('fps-display');
    if (fpsEl) fpsEl.textContent = Sim.fps;
    if (fpsDisplay) {
      fpsDisplay.classList.remove('healthy', 'warning', 'critical');
      if (Sim.fps >= 50) fpsDisplay.classList.add('healthy');
      else if (Sim.fps >= 30) fpsDisplay.classList.add('warning');
      else fpsDisplay.classList.add('critical');
    }
  }

  // ... rest of your existing tick logic ...
  requestAnimationFrame(tick);
}
*/
  }

  requestAnimationFrame(loop);
};

// ── Bootstrap ──────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.Sim.init);
} else {
  window.Sim.init();
  }
