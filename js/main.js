"use strict";

// ── At the TOP of each file (after "use strict") ─────
// Cache helpers from window.Sim for performance
let flagdraw = 0;
let totalFrameSkipping = 4;
// ── Helper: apply a single physics substep ───────────
function tickPhysicsSubstep(sdPerTick) {
  window.Sim.tickBodies(sdPerTick);
  window.Sim.tickLoose(sdPerTick);
}

window.Sim.init = () => {
  
  // production like values Staggering needs to ve on
  
  /*window.QueOpsEasy.updateConfig({ 
  maxOpsPerFrame: 128,    // enough for all objects
  maxFrameTimeMs: 14,     // normal frame protection
  enableStagger: false    // keep stagger off until we adjust delays
});*/
  
  // ── Initialize Core Systems ──────────────────────
  window.Sim.initStars();
  window.Sim.initTrailBuffers();
  window.Sim.updateSpeedBar();
  window.Sim.updateZoomBar();
  //window.Sim.renderer = window.Sim.getRenderer()
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
    const realFps = (t - lastT) / 1000
      const rawDt = Math.min(realFps, 0.05);
      lastT = t;
      window.Sim.updateFPS(realFps);
      requestAnimationFrame(loop);
      
    if (flagdraw === totalFrameSkipping ) {
     
      //console.log("On");
      
      
      // UI & Camera updates
      
      window.Sim.tickCam();
      window.Sim.updatePanPad();
      window.Sim.updateSpeedBar();
      window.Sim.updateZoomBar();
      
      // Background layers
      window.Sim.ctx.fillStyle = 'rgba(4,4,12,.28)';
      window.Sim.ctx.fillRect(0, 0, window.Sim.W, window.Sim.H);
      
      window.Sim.drawStars(t);
            // World-space rendering & physics
      window.Sim.ctx.save();
      window.Sim.applyCam();
      
      //window.Sim.queueNebula(t);
      
     // window.QueOps.tick();
      
      
      if (!window.Sim.paused && window.Sim.physSpeed > 0 && rawDt > 0) {
        const MAX_SAFE_SD = rawDt * 3.0 * window.Sim.config.PHYS_SCALE;
        const totalSd = rawDt * window.Sim.physSpeed * window.Sim.config.PHYS_SCALE;
        const numTicks = Math.ceil(totalSd / MAX_SAFE_SD);
        const sdPerTick = totalSd / numTicks;
        
        // 🔁 Loop now only calls the extracted function
        for (let tick = 0; tick < numTicks; tick++) {
          tickPhysicsSubstep(sdPerTick);
        }
        window.Sim.tickAsteroids(rawDt * window.Sim.physSpeed * window.Sim.config.PHYS_SCALE);
      }
      
      
      window.Sim.drawFlashes();
      window.Sim.queueSun(t);
      window.Sim.queueTentacles(t);
      window.Sim.queueRays(t);
      window.Sim.queueLoose();
      window.Sim.drawAsteroids();
      window.Sim.queueOrbitPreview(t);
      
      window.QueOpsEasy.tick();
      window.Sim.ctx.restore(); // End camera transform
      
      // Trail system (buffer → composite → advance)
      //window.Sim.renderPlanetsToBufferFastPath();
      window.Sim.drawBodies();   // now only enqueues ops, doesn't draw
      window.Sim.drawTrail();
      window.Sim.drawFPS();
      window.Sim.trailHead = (window.Sim.trailHead + 1) % window.Sim.trailBufs.length;
      
      // Screen-space overlays
      window.Sim.drawCharge();
      /*
      window.Sim.ctx.fillStyle = 'rgba(180,210,255,.15)';
      window.Sim.ctx.font = '8px "Space Mono",monospace';
      window.Sim.ctx.letterSpacing = '.18em';
      window.Sim.ctx.fillText(
        `${(window.Sim.cam.zoom * 100).toFixed(0)}% SCROLL·ZOOM RIGHT-DRAG·PAN F·FIT SPACE·PAUSE`,
        16, window.Sim.H - 16 
      );
        */
      // Update cursor & planet counter
      window.Sim.cursorEl.style.left = window.Sim.tx + 'px';
      window.Sim.cursorEl.style.top = window.Sim.ty + 'px';
      window.Sim.updateCount();
     flagdraw = 0;
    } else {
    
      //console.log("Off");
   }
   
   ++flagdraw;
   //requestAnimationFrame(loop);
  }
// if (flagdraw === totalFrameSkipping ){
//   flagdraw = 0;
    requestAnimationFrame(loop);
//  }
};

// ── Bootstrap ──────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.Sim.init);
} else {
  window.Sim.init();
}

