/**
 * js/main.js
 * Galaxy Guardians 2.0 - Main Entry Point & Orchestrator
 * Pure ES6 Module. No global window.Sim pollution.
 */

// ── 1. Core Imports ──────────────────────────────────────────────────────
import { config } from './core/config.js';
import { state, SUN, physSpeed, paused } from './core/state.js';

// ── 2. Module Imports ────────────────────────────────────────────────────
import { CameraModule } from './modules/camera/camera.module.js';
import { InputModule } from './modules/input/input.module.js';
import { OverlaysModule } from './modules/ui/overlays.js';
import { ConfigMenuModule } from './modules/ui/config-menu.js';
import { AsteroidsModule } from './modules/entities/asteroids.js';
import { EffectsModule } from './modules/rendering/effects.js';
import { SunModule } from './modules/rendering/sun.js';
import { BodiesModule } from './modules/rendering/bodies.js';
import { ParticlesModule } from './modules/rendering/particles.js';
import { TrailsModule } from './modules/rendering/trails.js';
import { tickBodies, tickLoose } from './modules/physics/tick.js';

// ── 3. DOM References ────────────────────────────────────────────────────
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
const cursorEl = document.getElementById("cursor");
const slider = document.getElementById("size-slider");
const pcountEl = document.getElementById("pcount");
const uiEl = document.getElementById("ui");
const gravSlider = document.getElementById("grav-slider");
const gravVal = document.getElementById("grav-val");

let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;
let lastT = 0;

// Frame-skipping to maintain high FPS (only run heavy logic every N frames)
let flagdraw = 0;
const totalFrameSkipping = 4;

const restFullCycles = 10; // counting loop cycles
const restFullCyclesMs = 10;
let restCycle = 0;
let restCycleMs = 0;

// ── 4. Initialization ────────────────────────────────────────────────────
function init() {
    // Initialize Prime Modules
    CameraModule.init(canvas, ctx, W, H);
    InputModule.init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal);
    ConfigMenuModule.init();
    EffectsModule.init(W, H);
    TrailsModule.init(W, H);

    // Bridge: Connect InputModule's spawn trigger to OverlaysModule's logic
    InputModule._spawnPlanet = () => {        const charge = Math.min((performance.now() - InputModule.holdT) / 2000, 1);
        const sliderVal = parseFloat(slider.value);
        const raw = sliderVal * (1 + charge * 4);
        const t = Math.min(raw / 50, 1);
        const multiplier = 0.25 + 2.25 * Math.pow(t, 1.4);
        const radius = Math.max(10, Math.min(110, Math.round(40 * multiplier)));
        
        const w = CameraModule.screenToWorld(InputModule.tx, InputModule.ty);
        OverlaysModule.spawnPlanet(w.x, w.y, radius / 8, pcountEl);
    };

    // Initial Canvas Clear
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, W, H);

    //reset cycles
    restCycle = restFullCycles; // adding the right maximum for first rebder to complete
    restCycleMs = restFullCyclesMs;
    // Start Loop
    requestAnimationFrame(mainLoop);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
// ── 5. Main Animation Loop ───────────────────────────────────────────────
function mainLoop(t) {
    /*
    if (restCycle === restFullCycles){
        restCycle = 0;
        // go to sleep between frames. to reduce total overload.
        // Mandatory in most applications. keeping the green vibe on.
        await sleep(restFullCyclesMs);
        console.log("Delayed")
    }*/
    //restCycle++;
        requestAnimationFrame(mainLoop);
    
        const realFps = (t - lastT) / 1000;
        const rawDt = Math.min(realFps, 0.05); // Cap dt to prevent spiral of death on lag
        lastT = t;
    
        OverlaysModule.updateFPS(realFps);
    
        // 🔥 FRAME SKIP: Only run heavy logic every 4th frame to preserve FPS
        if (flagdraw === totalFrameSkipping) {
            
            // 1. UI & Camera Updates (Run every frame for smoothness)
            CameraModule.tick();
            
            // Temporary bridge for Pan Pad (set by InputModule)
            if (typeof window.Sim !== 'undefined' && typeof window.Sim.updatePanPad === 'function') {
                window.Sim.updatePanPad();
            }
    
            // 2. Background Layers
            ctx.fillStyle = 'rgba(4,4,12,.28)';
            ctx.fillRect(0, 0, W, H);
            EffectsModule.drawStars(ctx, t, W, H);
    
            // 3. World-Space Physics
            if (!paused && physSpeed > 0 && rawDt > 0) {
                const MAX_SAFE_SD = rawDt * 3.0 * config.PHYS_SCALE;
                const totalSd = rawDt * physSpeed * config.PHYS_SCALE;
                const numTicks = Math.ceil(totalSd / MAX_SAFE_SD);            const sdPerTick = totalSd / numTicks;
    
                for (let tick = 0; tick < numTicks; tick++) {
                    tickBodies(sdPerTick);
                    tickLoose(sdPerTick);
                }
                AsteroidsModule.tick(rawDt * physSpeed * config.PHYS_SCALE);
            }
    
            // 4. World-Space Rendering
            ctx.save();
            CameraModule.apply(); // 🔥 APPLY CAMERA TRANSFORM HERE
    
            EffectsModule.drawFlashes(ctx, CameraModule.cam.zoom);
            SunModule.drawSun(ctx, t, CameraModule.cam.zoom);
            SunModule.drawSolarTentacles(ctx, t, CameraModule.cam.zoom);
            SunModule.drawSolarRays(ctx, t, CameraModule.cam.zoom);
            ParticlesModule.drawLoose(ctx, CameraModule.cam.zoom);
            AsteroidsModule.draw(ctx, CameraModule.cam.zoom);
            
            // 🔥 CRITICAL FIX: Bodies MUST be drawn inside the camera transform!
            // If drawn outside, world coordinates (e.g., 0,0) map to screen top-left (0,0) 
            // at scale 1.0, causing the "popping bigger planet" bug.
            BodiesModule.drawBodies(ctx);
            
            OverlaysModule.drawOrbitPreview(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty);
    
            ctx.restore(); // 🔥 END CAMERA TRANSFORM HERE
    
            // 5. Trail System (Handles its own internal transforms)
            TrailsModule.renderToBuffer(ctx, W, H, CameraModule.cam, state.bodies);
            TrailsModule.drawTrail(ctx, W, H, CameraModule.cam);
    
            // 6. Screen-Space Overlays
            OverlaysModule.drawCharge(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty, slider.value);
            OverlaysModule.drawFPS();
            OverlaysModule.updateCount(pcountEl);
    
            // Update cursor position
            cursorEl.style.left = InputModule.tx + 'px';
            cursorEl.style.top = InputModule.ty + 'px';
    
            flagdraw = 0; // Reset counter
        }
        
        flagdraw++; // Increment counter
    
    
}

// ── 6. Event Listeners ───────────────────────────────────────────────────
window.addEventListener('resize', () => {    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    
    // 🔥 CRITICAL FIX: Update camera dimensions to prevent "popping" on resize
    CameraModule.width = W;
    CameraModule.height = H;
    
    EffectsModule.init(W, H); // Re-init stars for new dimensions
    TrailsModule.resize(W, H);
});

// ── 7. Bootstrap ─────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}