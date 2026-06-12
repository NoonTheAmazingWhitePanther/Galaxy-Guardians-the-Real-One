/**
 * js/main.js
 * Galaxy Guardians 2.0 - Main Entry Point & Orchestrator
 * Pure ES6 Module. Clean architecture with proper module organization.
 * 
 * ARCHITECTURE:
 * - Core: Config, state, math utilities
 * - Modules: Organized by domain (camera, input, physics, rendering, ui, entities)
 * - Rendering pipeline: Pre-calc Vault → Tween Interpolation → 60Hz+ Rendering
 * - No global pollution (except strategic window.Sim bridge for legacy input)
 */

// ─────────────────────────────────────────────────────────────────────────
// 1. CORE IMPORTS (State & Configuration)
// ─────────────────────────────────────────────────────────────────────────
import { config } from './core/config.js';
// UPDATED: physSpeed and paused are now inside the state object
import { state, SUN } from './core/state.js'; 
import { StateCache } from './core/state-cache.js';
import { TweenRenderer } from './modules/rendering/tween-renderer.js';

// ─────────────────────────────────────────────────────────────────────────
// 2. PRIME MODULE IMPORTS (Domain-driven architecture)
// ─────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────
// 3. DOM REFERENCES
// ─────────────────────────────────────────────────────────────────────────
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
const cursorEl = document.getElementById("cursor");
const slider = document.getElementById("size-slider");
const pcountEl = document.getElementById("pcount");
const uiEl = document.getElementById("ui");
const gravSlider = document.getElementById("grav-slider");
const gravVal = document.getElementById("grav-val");
// ─────────────────────────────────────────────────────────────────────────
// 4. RUNTIME STATE (Canvas & Animation)// ─────────────────────────────────────────────────────────────────────────
let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;
let lastT = 0;
let rawDt = 0;

// 🔥 NEW: PREDICTIVE PHYSICS CACHE VARIABLES
// We removed the old frame-skipping counters. The Cache handles timing now!
let accumulator = 0;
const PHYSICS_STEP = 1 / 60; // Fixed physics timestep (Change to 1/15 if you want 15fps physics)
const PRE_CALC_FRAMES = 24;  // The "3, 2, 1" countdown target

let isPreCalculating = true;
let preCalcCounter = 0;

// ─────────────────────────────────────────────────────────────────────────
// 5. INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────
function init() {
    CameraModule.init(canvas, ctx, W, H);
    EffectsModule.init(W, H);
    TrailsModule.init(W, H);
    ConfigMenuModule.init();
    InputModule.init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal);

    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, W, H);

    requestAnimationFrame(mainLoop);
}

// ─────────────────────────────────────────────────────────────────────────
// 6. MAIN ANIMATION LOOP
// ─────────────────────────────────────────────────────────────────────────
function mainLoop(t) {
    requestAnimationFrame(mainLoop);
    
    const realFps = (t - lastT) / 1000;
    const rawDt = Math.min(realFps, 0.1); // Cap dt to prevent spiral of death
    lastT = t;
    
    OverlaysModule.updateFPS(realFps);
    
    // =========================================================================
    // PHASE 1: THE "3, 2, 1" PRE-CALCULATION (FILLING THE VAULT)
    // =========================================================================
    if (isPreCalculating) {
        // Calculate 8 physics steps instantly per frame to fill the cache fast
        for (let i = 0; i < 8; i++) { 
            StateCache.push(StateCache.captureSnapshot(state.bodies, state.loose));
            if (!state.paused && state.physSpeed > 0) {                tickBodies(PHYSICS_STEP);
                tickLoose(PHYSICS_STEP);
            }
        }
        preCalcCounter += 8;
        
        if (preCalcCounter >= PRE_CALC_FRAMES) {
            isPreCalculating = false;
            StateCache.isReady = true;
            console.log("🚀 VAULT FULL! ENGAGING SMOOTH PLAYBACK!");
        }
        return; // STOP HERE. Do not render until pre-calc is done.
    }

    // =========================================================================
    // PHASE 2: PHYSICS ACCUMULATION (KEEPING THE VAULT FULL)
    // =========================================================================
    if (!state.paused && state.physSpeed > 0) {
        // Add elapsed time to the accumulator (scaled by physics speed and config)
        accumulator += rawDt * state.physSpeed * config.PHYS_SCALE;
        
        let stepsThisFrame = 0;
        const MAX_STEPS_PER_FRAME = 8; // Prevent freezing if we fall behind
        
        // Run fixed-step physics to keep the cache full
        while (accumulator >= PHYSICS_STEP && stepsThisFrame < MAX_STEPS_PER_FRAME) {
            StateCache.push(StateCache.captureSnapshot(state.bodies, state.loose));
            tickBodies(PHYSICS_STEP);
            tickLoose(PHYSICS_STEP);
            AsteroidsModule.tick(PHYSICS_STEP); 
            accumulator -= PHYSICS_STEP;
            stepsThisFrame++;
        }
        
        // If we hit the max steps, reset accumulator to prevent "spiral of death"
        if (stepsThisFrame >= MAX_STEPS_PER_FRAME) {
            accumulator = 0; 
        }
    }

    // =========================================================================
    // PHASE 3: TWEEN INTERPOLATION (THE MAGIC)
    // =========================================================================
    // Calculate how far we are between the last physics step and the next (0.0 to 1.0)
    const alpha = accumulator / PHYSICS_STEP;
    const interpolationData = StateCache.getInterpolationData(alpha);
    
    // Overwrite live object coordinates with smooth, tweened visual coordinates
    TweenRenderer.applyTween(state.bodies, state.loose, interpolationData);
    // =========================================================================
    // PHASE 4: RENDERING (EVERY SINGLE FRAME FOR MAXIMUM SMOOTHNESS)
    // =========================================================================
    
    // 1. Update camera
    CameraModule.tick();
    if (typeof window.Sim !== 'undefined' && typeof window.Sim.updatePanPad === 'function') {
        window.Sim.updatePanPad();
    }


    ctx.fillStyle = 'rgba(4, 4, 12, 0.28)'; 
    ctx.fillRect(0, 0, W, H);
  
    EffectsModule.drawStars(ctx, t, W, H);
    
    // 3. World-space rendering (inside camera transform)
    ctx.save();
    CameraModule.apply(); 
    
    EffectsModule.drawFlashes(ctx, CameraModule.cam.zoom);
    SunModule.drawSun(ctx, t, CameraModule.cam.zoom);
    SunModule.drawSolarTentacles(ctx, t, CameraModule.cam.zoom);
    SunModule.drawSolarRays(ctx, t, CameraModule.cam.zoom);
    
    // These now draw the TWEENED positions!
    ParticlesModule.drawLoose(ctx, CameraModule.cam.zoom);
    AsteroidsModule.draw(ctx, CameraModule.cam.zoom);
    BodiesModule.drawBodies(ctx); 
    
    OverlaysModule.drawOrbitPreview(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty);
    ctx.restore(); 
    
    // 4. Trail system
    TrailsModule.renderToBuffer(ctx, W, H, CameraModule.cam, state.bodies);
    TrailsModule.drawTrail(ctx, W, H, CameraModule.cam);
    
    // 5. Screen-space overlays
    OverlaysModule.drawCharge(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty, slider.value);
    OverlaysModule.drawFPS();
    OverlaysModule.updateCount(pcountEl);

    // 6. Update cursor
    cursorEl.style.left = InputModule.tx + 'px';
    cursorEl.style.top = InputModule.ty + 'px';

    // =========================================================================
    // PHASE 5: REVERT TWEENING (CRITICAL FOR PHYSICS INTEGRITY)
    // =========================================================================
    // Restore the live objects to their TRUE physics coordinates so the next 
    // physics calculation isn't messed up by the visual tweening.    
    TweenRenderer.revertTween();
}

// ─────────────────────────────────────────────────────────────────────────
// 7. EVENT LISTENERS (Window resize, etc)
// ─────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    
    CameraModule.width = W;
    CameraModule.height = H;
    
    EffectsModule.init(W, H); 
    TrailsModule.resize(W, H); 
});

// ─────────────────────────────────────────────────────────────────────────
// 8. BOOTSTRAP (Start the app)
// ─────────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ─────────────────────────────────────────────────────────────────────────
// DEVELOPMENT: Expose utilities to console for debugging
// ─────────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.__GG = {
        state,
        config,
        cache: StateCache, // Added cache to debug tools
        modules: {
            Camera: CameraModule,
            Input: InputModule,
            Physics: { tickBodies, tickLoose },
            Rendering: { Sun: SunModule, Bodies: BodiesModule, Particles: ParticlesModule }
        }
    };
}