/**
 * js/main.js
 * Entry point: Sets up canvas, camera, input, and the main render loop.
 */
import { config } from './core/config.js';
import { state, SUN } from './core/state.js';
import { StateCache } from './core/state-cache.js';
import { InputModule } from './modules/input/input.module.js';
import { CameraModule } from './modules/camera/camera.module.js';
import { DrawAll } from './modules/rendering/renderer.js';
import { tickBodies, tickLoose } from './modules/physics/tick.js';
import { AsteroidsModule } from './modules/entities/asteroids.js';
import { TrailsModule } from './modules/rendering/trails.js';
import { EffectsModule } from './modules/rendering/effects.js';
import { OverlaysModule } from './modules/ui/overlays.js';
import { ConfigMenuModule } from './modules/ui/config-menu.js';

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false });

// ═══════════════════════════════════════════════════════════════
// FIXED PHYSICS CONSTANTS
// ═══════════════════════════════════════════════════════════════
const PHYSICS_HZ = 60;
const PHYSICS_STEP = 1 / PHYSICS_HZ;
const MAX_CATCHUP_STEPS = 16;

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let physicsAccumulator = 0;
let lastPhysicsTime = performance.now();
let isPreCalculating = true;
let preCalcCounter = 0;
const VAULT_SIZE = 48;

let frameCount = 0;
let lastFpsTime = 0;
let lastFrameTime = 0;
const fpsEl = document.getElementById("fpsCounter");

// ═══════════════════════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════════════════════
const cursorEl = document.getElementById("cursor");
const uiEl = document.getElementById("ui");
const slider = document.getElementById("size-slider");
const pcountEl = document.getElementById("pcount");
const gravSlider = document.getElementById("grav-slider");
const gravVal = document.getElementById("grav-val");

// ═══════════════════════════════════════════════════════════════
// RESIZE — only canvas sizing, no module init
// ═══════════════════════════════════════════════════════════════
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

// ═══════════════════════════════════════════════════════════════
// INIT — strict order: canvas → camera → effects → trails → input
// ═══════════════════════════════════════════════════════════════
function init() {
  console.log("[init] starting...");

  resize();
  console.log("[init] resize done. size:", CameraModule.width, "x", CameraModule.height);

  // Camera FIRST — everything else depends on it
  CameraModule.init(canvas, ctx, CameraModule.width, CameraModule.height);
  console.log("[init] CameraModule ready. ctx:", !!CameraModule.ctx, "cam:", CameraModule.cam);

  // Effects next
  if (EffectsModule.init) {
    EffectsModule.init(CameraModule.width, CameraModule.height);
    console.log("[init] EffectsModule ready");
  }

  // Trails
  if (TrailsModule.init) {
    TrailsModule.init(CameraModule.width, CameraModule.height);
    console.log("[init] TrailsModule ready");
  }

  // UI modules
  if (ConfigMenuModule.init) {
    ConfigMenuModule.init();
  }
  InputModule.init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal);
  console.log("[init] InputModule ready");

  // Initial clear
  ctx.fillStyle = '#04040c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  console.log("[init] complete — starting loop");

  requestAnimationFrame(mainLoop);
}

// ═══════════════════════════════════════════════════════════════
// PHYSICS TICK
// ═══════════════════════════════════════════════════════════════
function physicsTick() {
  StateCache.push(StateCache.captureSnapshot(state.bodies, state.loose));
  tickBodies(PHYSICS_STEP);
  tickLoose(PHYSICS_STEP);
  AsteroidsModule.tick(PHYSICS_STEP);
}

// ═══════════════════════════════════════════════════════════════
// PRE-CALCULATION
// ═══════════════════════════════════════════════════════════════
function runPreCalc() {
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    physicsTick();
  }
  preCalcCounter += steps;
  return preCalcCounter >= VAULT_SIZE;
}

// ═══════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════
function mainLoop(t) {
  requestAnimationFrame(mainLoop);

  // ── Frame timing ──
  const rawDt = Math.min((t - lastFrameTime) / 1000, 0.1);
  lastFrameTime = t;

  // ── FPS Counter (main.js own counter) ──
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

  // ── Smoothed FPS for overlays ──
  OverlaysModule.updateFPS(rawDt);

  // ── Advance physics ──
  const now = performance.now();
  const realDt = (now - lastPhysicsTime) / 1000;
  lastPhysicsTime = now;

  let didPhysicsTick = false;

  if (!state.paused && state.physSpeed > 0) {
    physicsAccumulator += realDt * state.physSpeed;

    let stepsThisFrame = 0;
    while (physicsAccumulator >= PHYSICS_STEP && stepsThisFrame < MAX_CATCHUP_STEPS) {
      if (isPreCalculating) {
        if (runPreCalc()) {
          isPreCalculating = false;
          StateCache.isReady = true;
          console.log("🚀 VAULT FULL! ENGAGING SMOOTH PLAYBACK!");
        }
      } else {
        physicsTick();
      }
      physicsAccumulator -= PHYSICS_STEP;
      stepsThisFrame++;
      didPhysicsTick = true;
    }

    if (physicsAccumulator >= PHYSICS_STEP) {
      physicsAccumulator = physicsAccumulator % PHYSICS_STEP;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════

  // 1. Camera update (zoom interpolation)
  CameraModule.tick();
  if (typeof window.Sim !== 'undefined' && typeof window.Sim.updatePanPad === 'function') {
    window.Sim.updatePanPad();
  }

  const alpha = Math.min(1, physicsAccumulator / PHYSICS_STEP);

  // 2. Draw everything — renderer handles camera transform internally
  //    Orbit preview is injected via callback so it draws in WORLD space
  DrawAll(ctx, t, alpha, didPhysicsTick, (drawCtx) => {
    OverlaysModule.drawOrbitPreview(
      drawCtx,
      InputModule.holding,
      InputModule.holdT,
      InputModule.tx,
      InputModule.ty
    );
  });

  // 3. Screen-space overlays (after renderer restores camera)
  OverlaysModule.drawCharge(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty, slider.value);
  OverlaysModule.drawFPS();
  OverlaysModule.updateCount(pcountEl);

  // 4. Cursor
  if (cursorEl) {
    cursorEl.style.left = InputModule.tx + "px";
    cursorEl.style.top = InputModule.ty + "px";
  }
}

// ═══════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ═══════════════════════════════════════════════════════════════
// DEV EXPOSE
// ═══════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  window.__GG = {
    state, config, cache: StateCache,
    modules: {
      Camera: CameraModule,
      Input: InputModule,
      Physics: { tickBodies, tickLoose },
      Rendering: { DrawAll },
      Overlays: OverlaysModule
    }
  };
}
