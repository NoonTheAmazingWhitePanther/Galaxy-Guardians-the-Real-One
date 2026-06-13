/**
 * js/main.js
 * Entry point: Sets up canvas, camera, input, and the main render loop.
 *
 * UNIFIED SERVER/CLIENT ARCHITECTURE
 * Physics runs at a FIXED timestep (60Hz, 8 substeps), independent of render FPS.
 * Render interpolates between physics states for smooth visuals at any framerate.
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
// FIXED PHYSICS CONSTANTS — NEVER CHANGE (server dictates these)
// ═══════════════════════════════════════════════════════════════
const PHYSICS_HZ = 60;
const PHYSICS_STEP = 1 / PHYSICS_HZ;        // 0.01667s — fixed forever
const SUBSTEPS = 8;                          // Fixed forever
const MAX_CATCHUP_STEPS = 16;                // Emergency cap to prevent spiral of death

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
// RESIZE
// ═══════════════════════════════════════════════════════════════
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  CameraModule.width = window.innerWidth;
  CameraModule.height = window.innerHeight;
  TrailsModule.resize(CameraModule.width, CameraModule.height);
  EffectsModule.init(CameraModule.width, CameraModule.height);
}
window.addEventListener("resize", resize);

// ═══════════════════════════════════════════════════════════════
// INIT — Called once on DOM ready, before the loop starts
// ═══════════════════════════════════════════════════════════════
function init() {
  resize();

  CameraModule.init(canvas, ctx, CameraModule.width, CameraModule.height);
  EffectsModule.init(CameraModule.width, CameraModule.height);
  TrailsModule.init(CameraModule.width, CameraModule.height);
  ConfigMenuModule.init();
  InputModule.init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal);

  ctx.fillStyle = '#04040c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  requestAnimationFrame(mainLoop);
}

// ═══════════════════════════════════════════════════════════════
// PHYSICS TICK — IDENTICAL on server and client
// ═══════════════════════════════════════════════════════════════
function physicsTick() {
  StateCache.push(StateCache.captureSnapshot(state.bodies, state.loose));
  tickBodies(PHYSICS_STEP);
  tickLoose(PHYSICS_STEP);
  AsteroidsModule.tick(PHYSICS_STEP);
}

// ═══════════════════════════════════════════════════════════════
// PRE-CALCULATION — Warm up the vault before rendering
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
// MAIN LOOP — Render FPS is independent of physics rate
// ═══════════════════════════════════════════════════════════════
function mainLoop(t) {
  requestAnimationFrame(mainLoop);

  // ── FPS Counter ──
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

  // ── Advance physics by real elapsed time ──
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

  // ── Render with interpolation ──
  const alpha = Math.min(1, physicsAccumulator / PHYSICS_STEP);
  DrawAll(ctx, t, alpha, didPhysicsTick);  // ← pass didPhysicsTick for trail optimization

  // ── OVERLAYS (drawn in screen space, after renderer) ──
  OverlaysModule.drawOrbitPreview(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty);
  OverlaysModule.drawCharge(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty, slider.value);
  OverlaysModule.drawFPS();
  OverlaysModule.updateCount(pcountEl);

  // ── Cursor ──
  if (cursorEl) {
    cursorEl.style.left = InputModule.tx + "px";
    cursorEl.style.top = InputModule.ty + "px";
  }
}

// ═══════════════════════════════════════════════════════════════
// BOOTSTRAP — Start the app when DOM is ready
// ═══════════════════════════════════════════════════════════════
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ═══════════════════════════════════════════════════════════════
// DEVELOPMENT: Expose utilities to console for debugging
// ═══════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  window.__GG = {
    state,
    config,
    cache: StateCache,
    modules: {
      Camera: CameraModule,
      Input: InputModule,
      Physics: { tickBodies, tickLoose },
      Rendering: { DrawAll },
      Overlays: OverlaysModule
    }
  };
}
