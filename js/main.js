/**
 * js/main.js
 * Galaxy Guardians 2.0 - Main Entry Point & Orchestrator
 * Pure ES6 Module. Clean architecture with proper module organization.
 * 
 * ARCHITECTURE:
 * - Core: Config, state, math utilities
 * - Modules: Organized by domain (camera, input, physics, rendering, ui, entities)
 * - Rendering pipeline: Physics → Rendering (every frame, physics skips optimized)
 * - No global pollution (except strategic window.Sim bridge for legacy input)
 */

// ─────────────────────────────────────────────────────────────────────────
// 1. CORE IMPORTS (State & Configuration)
// ─────────────────────────────────────────────────────────────────────────
import { config } from './core/config.js';
import { state, SUN, physSpeed, paused, sunGravMult } from './core/state.js';

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
// 4. RUNTIME STATE (Canvas & Animation)
// ─────────────────────────────────────────────────────────────────────────
let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;
let lastT = 0;

// 🔧 OPTIMIZED: Physics skipping (not rendering!)
// Rendering happens EVERY frame for smooth visuals.
// Physics ticks are skipped to reduce CPU load.
let physicsFrameCounter = 0;
const PHYSICS_FRAME_SKIP = 4; // Physics runs every Nth frame
let renderFrameCounter = 0;
const RENDER_FRAME_SKIP = 4;

// ─────────────────────────────────────────────────────────────────────────
// 5. INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────
/**
 * Initialize all prime modules and set up event bridges.
 * Called on DOMContentLoaded or immediately if document is ready.
 */
function init() {
    // Initialize all prime modules in dependency order
    CameraModule.init(canvas, ctx, W, H);
    EffectsModule.init(W, H);
    TrailsModule.init(W, H);
    ConfigMenuModule.init();
    InputModule.init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal);

    // Bridge: Connect InputModule's spawn trigger to OverlaysModule
    // This allows input handling to trigger planet spawning
    InputModule._spawnPlanet = handlePlanetSpawn;

    // Initial canvas clear
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, W, H);

    // Start animation loop
    requestAnimationFrame(mainLoop);
}

/**
 * Handle planet spawning from input.
 * Calculates spawn parameters based on charge and slider value.
 */
function handlePlanetSpawn() {
    const charge = Math.min((performance.now() - InputModule.holdT) / 2000, 1);
    const sliderVal = parseFloat(slider.value);
    const raw = sliderVal * (1 + charge * 4);
    const t = Math.min(raw / 50, 1);
    const multiplier = 0.25 + 2.25 * Math.pow(t, 1.4);
    const radius = Math.max(10, Math.min(110, Math.round(40 * multiplier)));
    
    const w = CameraModule.screenToWorld(InputModule.tx, InputModule.ty);
    OverlaysModule.spawnPlanet(w.x, w.y, radius / 8, pcountEl);
}

// ─────────────────────────────────────────────────────────────────────────
// 6. MAIN ANIMATION LOOP
// ─────────────────────────────────────────────────────────────────────────
/**
 * Main rendering & physics loop.
 * Runs every frame for rendering, but physics is skipped for performance.
 * 
 * Flow:
 * 1. Calculate frame timing (dt)
 * 2. RENDER: Always (smooth visuals every frame)
 * 3. PHYSICS: Every Nth frame (reduces CPU load)
 * 4. Update UI overlays
 * 
 * @param {number} t - High-resolution timestamp from requestAnimationFrame
 */
function mainLoop(t) {
    // Request next frame early (better performance)
    requestAnimationFrame(mainLoop);
    
    // Calculate frame timing
    const realFps = (t - lastT) / 1000;
    const rawDt = Math.min(realFps, 0.05); // Cap dt to prevent spiral of death on lag
    lastT = t;
    
    // Update FPS display
    OverlaysModule.updateFPS(realFps);
    
    // skip render anyway and do not clean rhe screen render
    if (renderFrameCounter++ >= RENDER_FRAME_SKIP){
        renderFrameCounter = 0;
        // ────────────────────────────────────────────────────────────
        // RENDER: Every frame for smooth 60 FPS visuals
        // ────────────────────────────────────────────────────────────
        
        // 1. Update camera (for smooth zoom/pan interpolation)
        CameraModule.tick();
        
        // 2. Pan Pad update (legacy bridge - TODO: Refactor to pure imports)
        if (typeof window.Sim !== 'undefined' && typeof window.Sim.updatePanPad === 'function') {
            window.Sim.updatePanPad();
        }
        
        // 3. Background layers
        ctx.fillStyle = 'rgba(4,4,12,.28)';
        ctx.fillRect(0, 0, W, H);
        EffectsModule.drawStars(ctx, t, W, H);
        
        // 4. World-space rendering (inside camera transform)
        ctx.save();
        CameraModule.apply(); // 🔥 APPLY CAMERA TRANSFORM
        
        EffectsModule.drawFlashes(ctx, CameraModule.cam.zoom);
        SunModule.drawSun(ctx, t, CameraModule.cam.zoom);
        SunModule.drawSolarTentacles(ctx, t, CameraModule.cam.zoom);
        SunModule.drawSolarRays(ctx, t, CameraModule.cam.zoom);
        ParticlesModule.drawLoose(ctx, CameraModule.cam.zoom);
        AsteroidsModule.draw(ctx, CameraModule.cam.zoom);
        
        // 🔥 CRITICAL: Bodies MUST be drawn inside camera transform!
        // If drawn outside, world coordinates don't map correctly to screen space,
        // causing the "popping bigger planet" visual bug.
        BodiesModule.drawBodies(ctx);
        
        // Orbit prediction preview
        OverlaysModule.drawOrbitPreview(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty);
        
        ctx.restore(); // 🔥 END CAMERA TRANSFORM
        
        // 5. Trail system (manages its own internal transforms)
        TrailsModule.renderToBuffer(ctx, W, H, CameraModule.cam, state.bodies);
        TrailsModule.drawTrail(ctx, W, H, CameraModule.cam);
        
        // 6. Screen-space overlays (UI, charge indicator, etc)
        OverlaysModule.drawCharge(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty, slider.value);
        OverlaysModule.drawFPS();
        OverlaysModule.updateCount(pcountEl);
    }   
    // 7. Update cursor position
    cursorEl.style.left = InputModule.tx + 'px';
    cursorEl.style.top = InputModule.ty + 'px';
    
    // ────────────────────────────────────────────────────────────
    // PHYSICS: Every Nth frame for performance optimization
    // ────────────────────────────────────────────────────────────
    if (physicsFrameCounter++ >= PHYSICS_FRAME_SKIP) {
        physicsFrameCounter = 0;
        
        // Only run physics if simulation is active
        if (!paused && physSpeed > 0 && rawDt > 0) {
            // Adaptive substeps: Break large timesteps into smaller chunks
            // for stability on slow frames
            const MAX_SAFE_DT = rawDt * 3.0 * config.PHYS_SCALE;
            const totalDt = rawDt * physSpeed * config.PHYS_SCALE;
            const numTicks = Math.ceil(totalDt / MAX_SAFE_DT);
            const dtPerTick = totalDt / numTicks;
            
            // Run physics ticks
            for (let tick = 0; tick < numTicks; tick++) {
                tickBodies(dtPerTick);
                tickLoose(dtPerTick);
            }
            
            // Update asteroids
            AsteroidsModule.tick(rawDt * physSpeed * config.PHYS_SCALE);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
// 7. EVENT LISTENERS (Window resize, etc)
// ─────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    
    // Update camera dimensions to prevent "popping" on resize
    CameraModule.width = W;
    CameraModule.height = H;
    
    // Reinitialize canvas-dependent modules
    EffectsModule.init(W, H); // Regenerate stars for new viewport
    TrailsModule.resize(W, H); // Resize trail buffers
});

// ─────────────────────────────────────────────────────────────────────────
// 8. BOOTSTRAP (Start the app)
// ─────────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM already loaded
    init();
}

// ─────────────────────────────────────────────────────────────────────────
// DEVELOPMENT: Expose utilities to console for debugging
// ─────────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.__GG = {
        state,
        config,
        modules: {
            Camera: CameraModule,
            Input: InputModule,
            Physics: { tickBodies, tickLoose },
            Rendering: { Sun: SunModule, Bodies: BodiesModule, Particles: ParticlesModule }
        },
        togglePhysicsSkip() {
            console.log(`Physics frame skip: ${PHYSICS_FRAME_SKIP} (change via config)`);
        }
    };
}
