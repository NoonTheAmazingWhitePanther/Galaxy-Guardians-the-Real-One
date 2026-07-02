/**
 * js/main.js
 * FIXED: Imports unified governors.
 */
import { CONFIG, setTheme } from './config/config-index.js';
import { state } from './core/state.js';
import { StateCache } from './core/state-cache.js';
import { FutureCache } from './core/future-cache.js';
import { InputModule, InputState, InAims } from './modules/input/input.module.js';
import { Aims } from './core/aims.js';
import { CameraModule } from './modules/camera/camera.module.js';
import { DrawAll } from './modules/rendering/renderer.js';
import { tickBodies, tickLoose } from './modules/physics/tick.js';
import { AsteroidsModule } from './modules/entities/asteroids.js';
import { Accumulator } from './modules/rendering/accumulator.js';
import { EffectsModule } from './modules/rendering/effects.js';
import { OverlaysModule } from './modules/ui/overlays.js';
import { ConfigMenuModule } from './modules/ui/config-menu.js';
import { DebugRouter } from './modules/debug/debug-router.js';
import { TuningLayer } from './modules/tuning/tuning-layer.js';
import { MsProbe } from './core/ms-probe.js';
import { FpsCounter } from './modules/debug/fps-counter.js';
import { DEBUG_STATE } from './modules/debug/debug-state.js';
// ✅ FIX: Import from unified governor
import { PhysicsGov, RenderGov, CacheGov } from './modules/debug/governor.js';
import { PhysicsCounter } from './modules/debug/physics-counter.js';
import { Benchmark } from './modules/debug/benchmark.js';
import { QueOps } from './core/que-ops.js';

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false });

let currentPhysicsStep = CONFIG.physics.TIMESTEP;
let maxCatchupSteps = CONFIG.physics.MAX_FRAME_SKIP;
let physicsAccumulator = 0;
let ticksSinceRender = 0;   // physics ticks run since the last drawn frame — drives motion-trail gap-fill
let lastPhysicsTime = performance.now();
let isPreCalculating = true;
let preCalcCounter = 0;
let frameCount = 0;
let lastFpsTime = 0;
let lastFrameTime = 0;

const fpsEl = document.getElementById("fpsCounter");
const cursorEl = document.getElementById("cursor");
const uiEl = document.getElementById("ui");
const slider = document.getElementById("size-slider");
const pcountEl = document.getElementById("pcount");
const gravSlider = document.getElementById("grav-slider");
const gravVal = document.getElementById("grav-val");

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.render.PIXEL_RATIO_CAP);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  DEBUG_STATE.setDpr(dpr);
  CameraModule.width = window.innerWidth;
  CameraModule.height = window.innerHeight;
  Accumulator.resize(CameraModule.width, CameraModule.height);
  if (typeof InAims !== 'undefined') InAims.onResize();
}
window.addEventListener("resize", resize);

export function init() {
  state.physicsStep = CONFIG.physics.TIMESTEP;
  state.vaultSize = CONFIG.physics.VAULT_SIZE;
  state.maxBodies = CONFIG.physics.MAX_BODIES;
  currentPhysicsStep = CONFIG.physics.TIMESTEP;
  maxCatchupSteps = CONFIG.physics.MAX_FRAME_SKIP;

  resize();
  document.body.style.backgroundColor = CONFIG.render.BACKGROUND_COLOR;

  CameraModule.init(canvas, ctx, CameraModule.width, CameraModule.height);
  DebugRouter.init(canvas);

  if (EffectsModule.init) EffectsModule.init(CameraModule.width, CameraModule.height);
  Accumulator.init(CameraModule.width, CameraModule.height);
  if (ConfigMenuModule.init) ConfigMenuModule.init();

  InputModule.init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal);
  QueOps.init({ maxFrameTimeMs: 12, enableStagger: true });

  const debugBtn = document.getElementById('debug-btn');
  const benchBtn = document.getElementById('bench-btn');
  const benchInfo = document.getElementById('bench-info');
  const renderBenchInfo = () => {
    if (!benchInfo) return;
    const info = Benchmark.info;
    if (!info) { benchInfo.classList.remove('on'); benchInfo.innerHTML = ''; return; }
    const imp = info.improvement;
    const impCls = imp > 0 ? 'up' : (imp < 0 ? 'dn' : '');
    const impStr = imp === 0 ? 'Δ0' : (imp > 0 ? `Δ+${imp}` : `Δ${imp}`);
    benchInfo.innerHTML =
      `×${info.runs} · ${info.score}/1000 · <span class="${impCls}">${impStr}</span> · ${info.avgFps}fps` +
      (info.collapsed ? ' · sat' : '');
  };
  const syncBenchVisibility = () => {
    const on = DebugRouter.masterEnabled;
    benchBtn?.classList.toggle('on', on);
    benchInfo?.classList.toggle('on', on && !!Benchmark.info);
  };
  if (debugBtn) {
    if (DebugRouter.masterEnabled) debugBtn.classList.add('active');
    syncBenchVisibility();
    debugBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      DebugRouter.toggleAll();
      debugBtn.classList.toggle('active', DebugRouter.masterEnabled);
      renderBenchInfo();
      syncBenchVisibility();
    }, { passive: false });
  }

  if (benchBtn) {
    const idleLabel = 'BEST PREFERENCES';
    Benchmark._onStatus = (status) => {
      benchBtn.textContent = Benchmark.running ? status : idleLabel;
      benchBtn.classList.toggle('busy', Benchmark.running);
    };
    benchBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (Benchmark.running) return;
      Benchmark.run().then(() => {
        benchBtn.textContent = Benchmark.status;
        renderBenchInfo();
        syncBenchVisibility();
        setTimeout(() => { benchBtn.textContent = idleLabel; benchBtn.classList.remove('busy'); }, 2500);
      });
    }, { passive: false });
  }

  // Load best preferences for this device (signature-checked); falls back to Base.
  Benchmark.load().then(() => { renderBenchInfo(); syncBenchVisibility(); });

  const satWire = (id, fn) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
      b.classList.add('active');
      setTimeout(() => b.classList.remove('active'), 120);
    }, { passive: false });
  };
  satWire('dbg-closeall', () => DebugRouter.closeAllDock());
  satWire('dbg-reset',    () => DebugRouter.resetAllToProfile());
  satWire('dbg-arrange',  () => DebugRouter.arrangeToggle());

  const aimsBtn = document.getElementById('aims-btn');
  if (aimsBtn) {
    aimsBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (InAims.enabled) InAims.disable();
      else InAims.enable();
      aimsBtn.classList.toggle('active', InAims.enabled);
    }, { passive: false });
  }

  window.Sim = window.Sim || {};
  window.Sim.physicsAccumulator = physicsAccumulator;
  window.Sim.isPreCalculating = isPreCalculating;
  window.Sim.lastPhysicsTime = lastPhysicsTime;
  window.Sim.preCalcCounter = preCalcCounter;

  requestAnimationFrame(mainLoop);
}

export function resetGame(newThemeName = null) {
  if (newThemeName) setTheme(newThemeName);
  state.physicsStep = CONFIG.physics.TIMESTEP;
  state.vaultSize = CONFIG.physics.VAULT_SIZE;
  state.maxBodies = CONFIG.physics.MAX_BODIES;
  currentPhysicsStep = CONFIG.physics.TIMESTEP;
  maxCatchupSteps = CONFIG.physics.MAX_FRAME_SKIP;
  physicsAccumulator = 0;
  ticksSinceRender = 0;
  lastPhysicsTime = performance.now();
  isPreCalculating = true;
  preCalcCounter = 0;

  if (window.Sim) {
    window.Sim.QueOps = QueOps;
    window._InAims = InAims;
    window.Sim.physicsAccumulator = 0;
    window.Sim.isPreCalculating = true;
    window.Sim.lastPhysicsTime = lastPhysicsTime;
    window.Sim.preCalcCounter = 0;
  }

  state.bodies = [];
  state.loose = [];
  state.flashes = [];
  state.asteroids = [];
  state.astTimer = 0;
  StateCache.clear();
  FutureCache.reset();
  Accumulator.clear();
  document.body.style.backgroundColor = CONFIG.render.BACKGROUND_COLOR;
}

function physicsTick() {
  StateCache.push(StateCache.captureSnapshot(state.bodies, state.loose));
  MsProbe.call('physics.tick', () => {
    tickBodies(currentPhysicsStep);
    tickLoose(currentPhysicsStep);
    AsteroidsModule.tick(currentPhysicsStep);
  });
}

function runPreCalc() {
  const steps = 8;
  for (let i = 0; i < steps; i++) physicsTick();
  preCalcCounter += steps;
  if (window.Sim) window.Sim.preCalcCounter = preCalcCounter;
  return preCalcCounter >= CONFIG.physics.VAULT_SIZE;
}

function _drawAimCursor(ctx) {
  if (!InputState.isPointerDown && !Aims.aim._active) return;
  const ax = Aims.aim.x;
  const ay = Aims.aim.y;
  const ex = Aims.aim.ex;
  const ey = Aims.aim.ey;
  const r = Aims.aim.radius;
  const dpr = DEBUG_STATE.dpr || 1;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const sx = ax * dpr, sy = ay * dpr;
  const sex = ex * dpr, sey = ey * dpr;
  const sr = r * dpr;

  if (ax !== ex || ay !== ey) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sex, sey);
    ctx.strokeStyle = 'rgba(255, 200, 80, 0.7)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(sx, sy, 5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 160, 40, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(sex, sey, sr, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.75)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(sex, sey, sr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(100, 200, 255, 0.06)';
  ctx.fill();

  const cs = 6 * dpr;
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.9)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(sex - cs, sey); ctx.lineTo(sex + cs, sey);
  ctx.moveTo(sex, sey - cs); ctx.lineTo(sex, sey + cs);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(sex, sey, 2.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fill();
  ctx.restore();
}

function mainLoop(t) {
  DebugRouter.resetAll();
  MsProbe.call('queops.tick', () => QueOps.tick());
  requestAnimationFrame(mainLoop);

  // Feed FPS counter every frame — before any frame-skip logic
  FpsCounter.tick(t, RenderGov.frameSkip, RenderGov.BASE);
  RenderGov.tick();

  const rawDt = Math.min((t - lastFrameTime) / 1000, 0.1);
  lastFrameTime = t;

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

  const now = performance.now();
  const realDt = (now - lastPhysicsTime) / 1000;
  lastPhysicsTime = now;
  if (window.Sim) window.Sim.lastPhysicsTime = lastPhysicsTime;

  // ✅ FIX: Use PhysicsGov from unified governor
  const _phChaos = (PhysicsCounter?.stats?.collisionsResolved ?? 0)
                 + (PhysicsCounter?.stats?.springsSolved ?? 0) * 0.1;
  PhysicsGov.feedChaos(_phChaos, 0, 0);
  currentPhysicsStep = PhysicsGov.step;

  let didPhysicsTick = false;

  if (!state.paused && state.physSpeed > 0) {
    // Bank real elapsed time, scaled by the speed multiplier. Clamp the frame
    // delta first so a long stall (tab switch, GC hitch) can't inject a huge
    // backlog — only pathological frames are affected; normal frames bank their
    // exact real time. physSpeed scales the banking RATE, so simulation speed is
    // a function of real wall-clock time only, never of frame rate.
    const bankedDt = Math.min(realDt, 0.1);
    physicsAccumulator += bankedDt * state.physSpeed;
    if (window.Sim) window.Sim.physicsAccumulator = physicsAccumulator;

    // Physics tick-skip governor — Bresenham-style, same math as RenderGov.
    // Skipping here only means "don't drain the accumulator this frame":
    // realDt keeps banking above regardless, so no simulation time is ever
    // lost — it's caught up in a bigger batch on the next allowed tick.
    if (PhysicsGov.shouldTick()) {
      // Fixed-timestep drain. Each tick advances the sim by exactly
      // currentPhysicsStep (a constant), so how far the sim moves this frame is
      // decided ONLY by how much real time the accumulator banked above — the
      // frame rate is irrelevant. 30fps runs more catch-up ticks per frame,
      // 144fps runs fewer, but ticks-per-real-second (and therefore speed) is
      // identical, and physics frame-skip just banks time for a bigger batch
      // here. The remainder (< one step) is ALWAYS carried to the next frame.
      //
      // The cap below is a pure spiral-of-death guard — NOT a speed knob. It's
      // large enough that any sane fps/speed drains fully beneath it; only a
      // genuine overload or multi-second stall can ever reach it.
      const MAX_STEPS_PER_FRAME = 300;

      let stepsThisFrame = 0;
      while (physicsAccumulator >= currentPhysicsStep && stepsThisFrame < MAX_STEPS_PER_FRAME) {
        if (isPreCalculating) {
          if (runPreCalc()) {
            isPreCalculating = false;
            StateCache.isReady = true;
            if (window.Sim) window.Sim.isPreCalculating = isPreCalculating;
          }
        } else if (CacheGov.enabled && FutureCache.hasNext) {
          // Cache hit — this tick's state was pre-computed ahead of time and
          // is byte-for-byte identical to a live tick. Snapshot BEFORE the
          // swap, same convention physicsTick() uses (pre-tick state, so
          // StateCache's interpolation buffer stays consistent either way).
          StateCache.push(StateCache.captureSnapshot(state.bodies, state.loose));
          FutureCache.playNext();
        } else {
          physicsTick();
          FutureCache.recordLiveTick();
        }
        physicsAccumulator -= currentPhysicsStep;
        if (window.Sim) window.Sim.physicsAccumulator = physicsAccumulator;
        stepsThisFrame++;
        didPhysicsTick = true;
      }

      // Normal exit leaves the accumulator below one step — that remainder is
      // KEPT for next frame, which is exactly what makes speed frame-rate
      // independent. The ONLY time we drop banked time is a true overload: if
      // we actually slammed the safety cap and are still a full step behind,
      // shed the unrecoverable backlog (cap at one step) so playback resumes
      // cleanly instead of erupting into a catch-up burst. No modulo, no silent
      // per-frame time loss — which is what previously made higher fps run the
      // sim faster and lower fps / frame-skip run it slower.
      if (stepsThisFrame >= MAX_STEPS_PER_FRAME && physicsAccumulator > currentPhysicsStep) {
        physicsAccumulator = currentPhysicsStep;
      }
      if (window.Sim) window.Sim.physicsAccumulator = physicsAccumulator;

      // Remember how many fixed ticks actually ran — the renderer stamps the
      // body at each of these intermediate positions so fast motion (many
      // ticks between two draws) leaves a continuous phosphor streak instead
      // of gapped blobs. Independent of frame rate: it's a tick count, not a
      // frame count.
      ticksSinceRender += stepsThisFrame;

      // Adaptive cache-ahead top-up — spend whatever spare ms CacheGov
      // allows pre-computing more future ticks, right now, while there's
      // still budget left in this frame. Some frames that's 1 step, some
      // frames it's 100 — purely a function of how much time is actually
      // available, never a fixed count.
      if (CacheGov.enabled && !isPreCalculating) {
        FutureCache.topUp(CacheGov.msBudget, CacheGov.targetAhead);
      }
    }
  }

  CameraModule.tick();
  if (window.Sim?.updatePanPad) window.Sim.updatePanPad();

  // ✅ FIX: Use RenderGov from unified governor
  const _camVel = Math.abs(CameraModule.cam.zoom - CameraModule.cam.targetZoom) * 100
                + (CameraModule.isPanning ? 30 : 0);
  RenderGov.feedChaos(_camVel, 0, didPhysicsTick);

  // Data update — every rAF, unconditionally, before any drawing
  DebugRouter.updateData();

  // Debug panels — inside shouldRender per your architecture rule
  if (RenderGov.shouldRender()) {
    const alpha = Math.min(1, physicsAccumulator / currentPhysicsStep);

    MsProbe.call('render.drawAll', () => DrawAll(ctx, t, alpha, didPhysicsTick, (drawCtx) => {
      OverlaysModule.drawOrbitPreview(
        drawCtx,
        InputState.isHolding,
        InputState.holdTime,
        InputState.mouseX,
        InputState.mouseY
      );
    }, ticksSinceRender));

    // Ticks up to this draw are now represented on screen — start a fresh count.
    ticksSinceRender = 0;

    OverlaysModule.drawCharge(
      ctx,
      InputState.isHolding,
      InputState.holdTime,
      InputState.mouseX,
      InputState.mouseY,
      slider.value
    );

    OverlaysModule.updateCount(pcountEl);

    // AIMS map visualization — only relevant when debug or tuning is active.
    // Draws BEFORE debug/tuning panels so it never overlaps them (z-order).
    if (DebugRouter.masterEnabled || TuningLayer.count > 0) {
      InAims.debugDraw(ctx, true);
    }

    DebugRouter.drawAll(ctx);
    TuningLayer.drawAll(ctx);
    _drawAimCursor(ctx);
  }

  if (cursorEl) {
    cursorEl.style.left = InputState.mouseX + "px";
    cursorEl.style.top = InputState.mouseY + "px";
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

if (typeof window !== 'undefined') {
  window.__GG = {
    state,
    config: CONFIG,
    cache: StateCache,
    resetGame,
    modules: {
      Camera: CameraModule,
      Input: InputModule,
      Physics: { tickBodies, tickLoose },
      Rendering: { DrawAll },
      Overlays: OverlaysModule
    }
  };
}