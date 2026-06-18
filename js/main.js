/**
 * js/main.js
 * Entry point: Sets up canvas, camera, input, and the main render loop.
 * UPDATED (2026-06-14): Data-Driven Config, resetGame(), no magic numbers.
 */
import { CONFIG, setTheme } from './config/config-index.js';
import { state, SUN } from './core/state.js';
import { StateCache } from './core/state-cache.js';
import { InputModule, InputState } from './modules/input/input.module.js';
import { CameraModule } from './modules/camera/camera.module.js';
import { DrawAll } from './modules/rendering/renderer.js';
import { tickBodies, tickLoose } from './modules/physics/tick.js';
import { AsteroidsModule } from './modules/entities/asteroids.js';
import { TrailsModule } from './modules/rendering/trails.js';
import { EffectsModule } from './modules/rendering/effects.js';
import { OverlaysModule } from './modules/ui/overlays.js';
import { ConfigMenuModule } from './modules/ui/config-menu.js';
import { DebugRouter } from './modules/debug/debug-router.js';

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false });

// Dynamic Physics Constants (Driven by Active CONFIG Profile)
let currentPhysicsStep = CONFIG.physics.TIMESTEP;
let maxCatchupSteps = CONFIG.physics.MAX_FRAME_SKIP;

// State
let physicsAccumulator = 0;
let lastPhysicsTime = performance.now();
let isPreCalculating = true;
let preCalcCounter = 0;
let frameCount = 0;
let lastFpsTime = 0;
let lastFrameTime = 0;
const fpsEl = document.getElementById("fpsCounter");
// DOM References
const cursorEl = document.getElementById("cursor");
const uiEl = document.getElementById("ui");
const slider = document.getElementById("size-slider");
const pcountEl = document.getElementById("pcount");
const gravSlider = document.getElementById("grav-slider");
const gravVal = document.getElementById("grav-val");
const debugCounters = {
      DebugdrawCalls: DebugRouter.DrawCallCounter,
  physics: DebugRouter.PhysicsCounter,
};

// RESIZE — only canvas sizing, no module init
function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.render.PIXEL_RATIO_CAP);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    CameraModule.width = window.innerWidth;
    CameraModule.height = window.innerHeight;
    
    if (TrailsModule.resize) {
        TrailsModule.resize(CameraModule.width, CameraModule.height);
    }
}
window.addEventListener("resize", resize);

// INIT — strict order: canvas → camera → effects → trails → input
export function init() {
    console.log(`[init] starting with profile bg: ${CONFIG.render.BACKGROUND_COLOR}`);
    
    // 1. SYNC CORE STATE WITH ACTIVE CONFIG
    state.physicsStep = CONFIG.physics.TIMESTEP;
    state.vaultSize = CONFIG.physics.VAULT_SIZE;
    state.maxBodies = CONFIG.physics.MAX_BODIES;
    
    // Sync local loop variables
    currentPhysicsStep = CONFIG.physics.TIMESTEP;
    maxCatchupSteps = CONFIG.physics.MAX_FRAME_SKIP;

    // 2. CANVAS & ENVIRONMENT SETUP
    resize();
    document.body.style.backgroundColor = CONFIG.render.BACKGROUND_COLOR;
    // 3. INITIALIZE MODULES
    CameraModule.init(canvas, ctx, CameraModule.width, CameraModule.height);
    DebugRouter.init(canvas);
    if (EffectsModule.init) EffectsModule.init(CameraModule.width, CameraModule.height);
    if (TrailsModule.init) TrailsModule.init(CameraModule.width, CameraModule.height);
    if (ConfigMenuModule.init) ConfigMenuModule.init();
    InputModule.init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal);

    // 4. DEBUG EXPOSURE (For Clear button / Dev Tools)
    window.Sim = window.Sim || {};
    window.Sim.physicsAccumulator = physicsAccumulator;
    window.Sim.isPreCalculating = isPreCalculating;
    window.Sim.lastPhysicsTime = lastPhysicsTime;
    window.Sim.preCalcCounter = preCalcCounter;

    // 5. INITIAL CLEAR
    ctx.fillStyle = CONFIG.render.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    //DrawCallCounter.install();

    console.log("[init] complete — starting loop");
    requestAnimationFrame(mainLoop);
}

// SESSION RESET (New Feature)
// Call this to start a fresh simulation, optionally with a new theme.
export function resetGame(newThemeName = null) {
    console.log("[Main] Resetting game session...");
    
    // 1. Switch theme if requested (updates CONFIG object and CSS instantly)
    if (newThemeName) {
        setTheme(newThemeName);
    }

    // 2. Re-sync state and loop variables with the (potentially new) config
    state.physicsStep = CONFIG.physics.TIMESTEP;
    state.vaultSize = CONFIG.physics.VAULT_SIZE;
    state.maxBodies = CONFIG.physics.MAX_BODIES;
    
    currentPhysicsStep = CONFIG.physics.TIMESTEP;
    maxCatchupSteps = CONFIG.physics.MAX_FRAME_SKIP;
    // 3. Reset simulation variables
    physicsAccumulator = 0;
    lastPhysicsTime = performance.now();
    isPreCalculating = true;
    preCalcCounter = 0;
    
    if (window.Sim) {
        window.Sim.physicsAccumulator = 0;
        window.Sim.isPreCalculating = true;
        window.Sim.lastPhysicsTime = lastPhysicsTime;
        window.Sim.preCalcCounter = 0;
    }

    // 4. Clear existing entities
    state.bodies = [];
    state.loose = [];
    state.flashes = [];
    state.asteroids = [];
    state.astTimer = 0;
    
    // 5. Clear the Vault and mark trails unused
    StateCache.clear();
    if (TrailsModule.trailBufs) {
        for (const buf of TrailsModule.trailBufs) buf.used = false;
    }

    // 6. Update background
    document.body.style.backgroundColor = CONFIG.render.BACKGROUND_COLOR;
    ctx.fillStyle = CONFIG.render.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    console.log(`[Main] Session reset complete. Running with ${CONFIG.physics.MAX_BODIES} max bodies.`);
}

// PHYSICS TICK
function physicsTick() {
    StateCache.push(StateCache.captureSnapshot(state.bodies, state.loose));
    tickBodies(currentPhysicsStep);
    tickLoose(currentPhysicsStep);
    AsteroidsModule.tick(currentPhysicsStep);
}// PRE-CALCULATION
function runPreCalc() {
    const steps = 8;
    for (let i = 0; i < steps; i++) {
        physicsTick();
    }
    preCalcCounter += steps;
    
    if (window.Sim) window.Sim.preCalcCounter = preCalcCounter;
    return preCalcCounter >= CONFIG.physics.VAULT_SIZE;
}

// MAIN LOOP
function mainLoop(t) {
    // Resetting stuff.
    DebugRouter.resetAll();
    
    requestAnimationFrame(mainLoop);
    
    // Frame timing
    const rawDt = Math.min((t - lastFrameTime) / 1000, 0.1);
    lastFrameTime = t;
    
    // FPS Counter
    frameCount++;
    if (t - lastFpsTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (t - lastFpsTime));
        if (fpsEl) {
            fpsEl.textContent = fps + " FPS";
            fpsEl.className = "fps-counter " + (fps >= 55 ? "good" : fps >= 30 ? "okay" : "low");
        }
        frameCount = 0;
        lastFpsTime = t;
    }
    
    OverlaysModule.updateFPS(rawDt);
    
    // Advance physics
    const now = performance.now();
    const realDt = (now - lastPhysicsTime) / 1000;
    lastPhysicsTime = now;
    
    if (window.Sim) window.Sim.lastPhysicsTime = lastPhysicsTime;
    
    let didPhysicsTick = false;if (!state.paused && state.physSpeed > 0) {
        physicsAccumulator += realDt * state.physSpeed;
        if (window.Sim) window.Sim.physicsAccumulator = physicsAccumulator;
        let stepsThisFrame = 0;
        while (physicsAccumulator >= currentPhysicsStep && stepsThisFrame < maxCatchupSteps) {
            if (isPreCalculating) {
                if (runPreCalc()) {
                    isPreCalculating = false;
                    StateCache.isReady = true;
                    if (window.Sim) window.Sim.isPreCalculating = isPreCalculating;
                    console.log("🚀 VAULT FULL! ENGAGING SMOOTH PLAYBACK!");
                }
            } else { physicsTick(); }
            physicsAccumulator -= currentPhysicsStep;
            if (window.Sim) window.Sim.physicsAccumulator = physicsAccumulator;
            stepsThisFrame++; didPhysicsTick = true;
        }
        if (physicsAccumulator >= currentPhysicsStep) {
            physicsAccumulator = physicsAccumulator % currentPhysicsStep;
            if (window.Sim) window.Sim.physicsAccumulator = physicsAccumulator;
        }
    }
    
    // RENDERING
    CameraModule.tick();
    if (window.Sim?.updatePanPad) window.Sim.updatePanPad();
    const alpha = Math.min(1, physicsAccumulator / currentPhysicsStep);
    
    ctx.fillStyle = CONFIG.render.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    DrawAll(ctx, t, alpha, didPhysicsTick, (drawCtx) => {
    OverlaysModule.drawOrbitPreview(drawCtx, InputState.isHolding, InputState.holdTime, InputState.mouseX, InputState.mouseY);
});
    OverlaysModule.drawCharge(ctx, InputState.isHolding, InputState.holdTime, InputState.mouseX, InputState.mouseY, slider.value);
    OverlaysModule.drawFPS();
    OverlaysModule.updateCount(pcountEl);
    
    // Individual debug overlays
    //DrawCallCounter.draw(ctx, { offsetY: -90 });
    //PhysicsCounter.draw(ctx, { offsetY: 90 });

    DebugRouter.drawAll(ctx);
    
    if (cursorEl) {
    cursorEl.style.left = InputState.mouseX + "px";
    cursorEl.style.top = InputState.mouseY + "px";
}
    
}

// BOOTSTRAP
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// DEV EXPOSE
if (typeof window !== 'undefined') {
    window.__GG = { state, config: CONFIG, cache: StateCache, resetGame, modules: { Camera: CameraModule, Input: InputModule, Physics: { tickBodies, tickLoose }, Rendering: { DrawAll }, Overlays: OverlaysModule } };
}