/**
 * js/main.js
 * Entry point: Sets up canvas, camera, input, and the main render loop.
 * UPDATED (2026-06-19): Cleaned imports, removed dead code, fixed formatting.
 */
import { CONFIG, setTheme } from './config/config-index.js';
import { state } from './core/state.js';
import { StateCache } from './core/state-cache.js';
import { InputModule, InputState, InAims } from './modules/input/input.module.js';
import { Aims } from './core/aims.js';
import { CameraModule } from './modules/camera/camera.module.js';
import { DrawAll } from './modules/rendering/renderer.js';
import { tickBodies, tickLoose } from './modules/physics/tick.js';
import { AsteroidsModule } from './modules/entities/asteroids.js';
import { Accumulator }  from './modules/rendering/accumulator.js';
import { EffectsModule } from './modules/rendering/effects.js';
import { OverlaysModule } from './modules/ui/overlays.js';
import { ConfigMenuModule } from './modules/ui/config-menu.js';
import { DebugRouter } from './modules/debug/debug-router.js';
import { DEBUG_STATE } from './modules/debug/debug-state.js';
import { PhysicsGovernor } from './core/physics-governor.js';
import { RenderGovernor }  from './core/render-governor.js';
import { PhysicsCounter }  from './modules/debug/physics-counter.js';
import { QueOps }          from './core/que-ops.js';

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false });

// ── Physics Constants (driven by active CONFIG profile) ────────────────────
let currentPhysicsStep = CONFIG.physics.TIMESTEP;
let maxCatchupSteps    = CONFIG.physics.MAX_FRAME_SKIP;

// ── Loop State ─────────────────────────────────────────────────────────────
let physicsAccumulator = 0;
let lastPhysicsTime    = performance.now();
let isPreCalculating   = true;
let preCalcCounter     = 0;
let frameCount         = 0;
let lastFpsTime        = 0;
let lastFrameTime      = 0;

// ── DOM References ─────────────────────────────────────────────────────────
const fpsEl      = document.getElementById("fpsCounter");
const cursorEl   = document.getElementById("cursor");
const uiEl       = document.getElementById("ui");
const slider     = document.getElementById("size-slider");
const pcountEl   = document.getElementById("pcount");
const gravSlider = document.getElementById("grav-slider");
const gravVal    = document.getElementById("grav-val");

// ═════════════════════════════════════════════════════════════════════════════
//  RESIZE
// ═════════════════════════════════════════════════════════════════════════════
function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.render.PIXEL_RATIO_CAP);
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    DEBUG_STATE.setDpr(dpr);

    CameraModule.width  = window.innerWidth;
    CameraModule.height = window.innerHeight;

    Accumulator.resize(CameraModule.width, CameraModule.height);
    if (typeof InAims !== 'undefined') InAims.onResize();
}
window.addEventListener("resize", resize);

// ═════════════════════════════════════════════════════════════════════════════
//  INIT  (strict order: canvas → camera → effects → trails → input)
// ═════════════════════════════════════════════════════════════════════════════
export function init() {
    console.log(`[init] starting with profile bg: ${CONFIG.render.BACKGROUND_COLOR}`);

    // 1. Sync core state with active config
    state.physicsStep = CONFIG.physics.TIMESTEP;
    state.vaultSize   = CONFIG.physics.VAULT_SIZE;
    state.maxBodies   = CONFIG.physics.MAX_BODIES;

    // Sync local loop variables
    currentPhysicsStep = CONFIG.physics.TIMESTEP;
    maxCatchupSteps    = CONFIG.physics.MAX_FRAME_SKIP;

    // 2. Canvas & environment setup
    resize();
    document.body.style.backgroundColor = CONFIG.render.BACKGROUND_COLOR;

    // 3. Initialize modules
    CameraModule.init(canvas, ctx, CameraModule.width, CameraModule.height);
    DebugRouter.init(canvas);

    if (EffectsModule.init)     EffectsModule.init(CameraModule.width, CameraModule.height);
    Accumulator.init(CameraModule.width, CameraModule.height);
    if (ConfigMenuModule.init)  ConfigMenuModule.init();

    InputModule.init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal);
    QueOps.init({ maxFrameTimeMs: 12, enableStagger: true });

    // Debug toggle button
    const debugBtn = document.getElementById('debug-btn');
    if (debugBtn) {
        if (DebugRouter.masterEnabled) debugBtn.classList.add('active');
        debugBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            DebugRouter.toggleAll();
            debugBtn.classList.toggle('active', DebugRouter.masterEnabled);
        }, { passive: false });
    }

    // AIMS toggle button
    const aimsBtn = document.getElementById('aims-btn');
    if (aimsBtn) {
        aimsBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (InAims.enabled) InAims.disable();
            else                InAims.enable();
            aimsBtn.classList.toggle('active', InAims.enabled);
        }, { passive: false });
    }

    // 4. Debug exposure (for DevTools)
    window.Sim = window.Sim || {};
    window.Sim.physicsAccumulator = physicsAccumulator;
    window.Sim.isPreCalculating   = isPreCalculating;
    window.Sim.lastPhysicsTime    = lastPhysicsTime;
    window.Sim.preCalcCounter     = preCalcCounter;

    // 5. Initial clear


    console.log("[init] complete — starting loop");
    requestAnimationFrame(mainLoop);
}

// ═════════════════════════════════════════════════════════════════════════════
//  SESSION RESET
// ═════════════════════════════════════════════════════════════════════════════
export function resetGame(newThemeName = null) {
    console.log("[Main] Resetting game session...");

    // 1. Switch theme if requested
    if (newThemeName) {
        setTheme(newThemeName);
    }

    // 2. Re-sync state and loop variables with the (potentially new) config
    state.physicsStep = CONFIG.physics.TIMESTEP;
    state.vaultSize   = CONFIG.physics.VAULT_SIZE;
    state.maxBodies   = CONFIG.physics.MAX_BODIES;

    currentPhysicsStep = CONFIG.physics.TIMESTEP;
    maxCatchupSteps    = CONFIG.physics.MAX_FRAME_SKIP;

    // 3. Reset simulation variables
    physicsAccumulator = 0;
    lastPhysicsTime    = performance.now();
    isPreCalculating   = true;
    preCalcCounter     = 0;

    if (window.Sim) {
        window.Sim.QueOps = QueOps;
        window._InAims = InAims;
        window.Sim.physicsAccumulator = 0;
        window.Sim.isPreCalculating   = true;
        window.Sim.lastPhysicsTime    = lastPhysicsTime;
        window.Sim.preCalcCounter     = 0;
    }

    // 4. Clear existing entities
    state.bodies    = [];
    state.loose     = [];
    state.flashes   = [];
    state.asteroids = [];
    state.astTimer  = 0;

    // 5. Clear the vault and mark trails unused
    StateCache.clear();
    Accumulator.clear();

    // 6. Update background
    document.body.style.backgroundColor = CONFIG.render.BACKGROUND_COLOR;


    console.log(`[Main] Session reset complete. Running with ${CONFIG.physics.MAX_BODIES} max bodies.`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  PHYSICS
// ═════════════════════════════════════════════════════════════════════════════
function physicsTick() {
    StateCache.push(StateCache.captureSnapshot(state.bodies, state.loose));
    tickBodies(currentPhysicsStep);
    tickLoose(currentPhysicsStep);
    AsteroidsModule.tick(currentPhysicsStep);
}

// ── Pre-calculation (vault fill) ───────────────────────────────────────────
function runPreCalc() {
    const steps = 8;
    for (let i = 0; i < steps; i++) {
        physicsTick();
    }
    preCalcCounter += steps;

    if (window.Sim) window.Sim.preCalcCounter = preCalcCounter;
    return preCalcCounter >= CONFIG.physics.VAULT_SIZE;
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═════════════════════════════════════════════════════════════════════════════
// ── Aim Cursor Visual ─────────────────────────────────────────────────────
// Draws on the MAIN canvas (screen space) after everything else.
// Always shows when pointer is down — regardless of AIMS enabled state.
// Shows: raw touch point (orange dot) + offset line + effective aim (blue circle + crosshair)
function _drawAimCursor(ctx) {
  if (!InputState.isPointerDown && !Aims.aim._active) return;

  const ax = Aims.aim.x;   // raw pointer position
  const ay = Aims.aim.y;
  const ex = Aims.aim.ex;  // effective aim after offset
  const ey = Aims.aim.ey;
  const r  = Aims.aim.radius;
  const dpr = DEBUG_STATE.dpr || 1;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // screen space

  // Scale all coords by dpr since we're in physical pixel space
  const sx = ax * dpr, sy = ay * dpr;
  const sex = ex * dpr, sey = ey * dpr;
  const sr  = r  * dpr;

  // ── Offset line: raw → effective ──────────────────────────────────────
  if (ax !== ex || ay !== ey) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sex, sey);
    ctx.strokeStyle = 'rgba(255, 200, 80, 0.7)';
    ctx.lineWidth   = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Raw touch dot (orange)
    ctx.beginPath();
    ctx.arc(sx, sy, 5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 160, 40, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
  }

  // ── Effective aim circle (blue) ────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(sex, sey, sr, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.75)';
  ctx.lineWidth   = 1.5 * dpr;
  ctx.stroke();

  // Inner fill — very faint
  ctx.beginPath();
  ctx.arc(sex, sey, sr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(100, 200, 255, 0.06)';
  ctx.fill();

  // ── Crosshair at effective aim center ─────────────────────────────────
  const cs = 6 * dpr; // crosshair arm length
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.9)';
  ctx.lineWidth   = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(sex - cs, sey); ctx.lineTo(sex + cs, sey); // horizontal
  ctx.moveTo(sex, sey - cs); ctx.lineTo(sex, sey + cs); // vertical
  ctx.stroke();

  // ── Center dot ────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(sex, sey, 2.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fill();

  ctx.restore();
}

function mainLoop(t) {
    // 1. Reset debug counters
    DebugRouter.resetAll();
    QueOps.tick();
    requestAnimationFrame(mainLoop);

    // 2. Frame timing
    const rawDt = Math.min((t - lastFrameTime) / 1000, 0.1);
    lastFrameTime = t;

    // 3. FPS counter
    frameCount++;
    if (t - lastFpsTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (t - lastFpsTime));
        if (fpsEl) {
            fpsEl.textContent = fps + " FPS";
            fpsEl.className = "fps-counter " + (fps >= 55 ? "good" : fps >= 30 ? "okay" : "low");
        }
        frameCount  = 0;
        lastFpsTime = t;
    }
    OverlaysModule.updateFPS(rawDt);

    // 4. Advance physics — governed by PhysicsGovernor
    const now    = performance.now();
    const realDt = (now - lastPhysicsTime) / 1000;
    lastPhysicsTime = now;

    if (window.Sim) window.Sim.lastPhysicsTime = lastPhysicsTime;

    // Feed chaos signal to governor (collisions + breaks from last frame)
    const _phChaos = (PhysicsCounter?.stats?.collisionsResolved ?? 0)
                   + (PhysicsCounter?.stats?.springsSolved ?? 0) * 0.1;
    PhysicsGovernor.feedChaos(_phChaos, 0, 0);
    currentPhysicsStep = PhysicsGovernor.step;

    let didPhysicsTick = false;

    if (!state.paused && state.physSpeed > 0) {
        physicsAccumulator += realDt * state.physSpeed;
        if (window.Sim) window.Sim.physicsAccumulator = physicsAccumulator;

        let stepsThisFrame = 0;
        while (physicsAccumulator >= currentPhysicsStep && stepsThisFrame < PhysicsGovernor.substeps) {
            if (isPreCalculating) {
                if (runPreCalc()) {
                    isPreCalculating = false;
                    StateCache.isReady = true;
                    if (window.Sim) window.Sim.isPreCalculating = isPreCalculating;
                    console.log("🚀 VAULT FULL! ENGAGING SMOOTH PLAYBACK!");
                }
            } else {
                physicsTick();
            }
            physicsAccumulator -= currentPhysicsStep;
            if (window.Sim) window.Sim.physicsAccumulator = physicsAccumulator;
            stepsThisFrame++;
            didPhysicsTick = true;
        }

        if (physicsAccumulator >= currentPhysicsStep) {
            physicsAccumulator = physicsAccumulator % currentPhysicsStep;
            if (window.Sim) window.Sim.physicsAccumulator = physicsAccumulator;
        }
    }

    // 5. Rendering — governed by RenderGovernor
    CameraModule.tick();
    if (window.Sim?.updatePanPad) window.Sim.updatePanPad();

    // Feed render chaos signal
    const _camVel = Math.abs(CameraModule.cam.zoom - CameraModule.cam.targetZoom) * 100
                  + (CameraModule.isPanning ? 30 : 0);
    RenderGovernor.feedChaos(_camVel, 0, didPhysicsTick);

    if (RenderGovernor.shouldRender()) {
        const alpha = Math.min(1, physicsAccumulator / currentPhysicsStep);

        DrawAll(ctx, t, alpha, didPhysicsTick, (drawCtx) => {
            OverlaysModule.drawOrbitPreview(
                drawCtx,
                InputState.isHolding,
                InputState.holdTime,
                InputState.mouseX,
                InputState.mouseY
            );
        });

        OverlaysModule.drawCharge(
            ctx,
            InputState.isHolding,
            InputState.holdTime,
            InputState.mouseX,
            InputState.mouseY,
            slider.value
        );

        OverlaysModule.drawFPS();
        OverlaysModule.updateCount(pcountEl);
        DebugRouter.drawAll(ctx);
        _drawAimCursor(ctx);
    }

    // 6. Cursor position
    if (cursorEl) {
        cursorEl.style.left = InputState.mouseX + "px";
        cursorEl.style.top  = InputState.mouseY + "px";
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═════════════════════════════════════════════════════════════════════════════
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ═════════════════════════════════════════════════════════════════════════════
//  DEV EXPOSE
// ═════════════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
    window.__GG = {
        state,
        config: CONFIG,
        cache: StateCache,
        resetGame,
        modules: {
            Camera:    CameraModule,
            Input:     InputModule,
            Physics:   { tickBodies, tickLoose },
            Rendering: { DrawAll },
            Overlays:  OverlaysModule
        }
    };
}
