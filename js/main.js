/**
 * js/main.js
 * FIXED: Imports unified governors.
 */
import { CONFIG } from './config/config-index.js';
import { state } from './core/state.js';
import { StateCache } from './core/state-cache.js';
import { FutureCache } from './core/future-cache.js';
import { Dormancy } from './core/dormancy.js';
import { InputModule, InputState, InAims } from './modules/input/input.module.js';
import { Aims } from './core/aims.js';
import { CameraModule } from './modules/camera/camera.module.js';
import { DrawAll } from './modules/rendering/renderer.js';
import { tickBodies, tickLoose } from './modules/physics/tick.js';
import { GravityField } from './modules/physics/gravity-field.js';
import { CycleMeter } from './core/cycle-meter.js';
import { Gate } from './core/gate.js';
import { TetrisFan } from './modules/debug/tetris-fan.js';
window._TetrisFan = TetrisFan;
import { AsteroidsModule } from './modules/entities/asteroids.js';
import { Accumulator } from './modules/rendering/accumulator.js';
import { EffectsModule } from './modules/rendering/effects.js';
import { OverlaysModule } from './modules/ui/overlays.js';
import { ConfigMenuModule } from './modules/ui/config-menu.js';
import { PrefsStore } from './core/prefs-store.js';
import { UpdateFeed } from './core/update-feed.js';
import { DebugRouter } from './modules/debug/debug-router.js';
import { ConsoleView } from './modules/debug/console-view.js';
import { GuiGovernor } from './modules/debug/gui-governor.js';
import { TuningLayer } from './modules/tuning/tuning-layer.js';
import { MsProbe } from './core/ms-probe.js';
import { FpsCounter } from './modules/debug/fps-counter.js';
import { DEBUG_STATE } from './modules/debug/debug-state.js';
import { PhysicsGov, RenderGov, CacheGov, ManualOverrides } from './modules/debug/governor.js';
import { PhysicsCounter } from './modules/debug/physics-counter.js';
import { Benchmark } from './modules/debug/benchmark.js';
import { QueOps } from './core/que-ops.js';

// ✅ NEW SYSTEMS (2026-07-07)
import { DotAtlasRenderer } from './modules/rendering/dot-atlas-renderer.js';
import { TweenGovernor } from './core/tween-governor.js';
import { PaintingState } from './core/painting-state.js';
import { PaintingButton } from './modules/ui/painting-button.js';
import { SelectionTool } from './modules/input/in-selection-tool.js';
import { ZoomEnhancer } from './modules/ui/zoom-enhancer.js';
import { CanvasSatellites } from './modules/ui/canvas-satellites.js';
import { BurnMap } from './core/burn-map.js';

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
  Accumulator.resize(CameraModule.width, CameraModule.height, dpr);
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
  ConsoleView.init(DebugRouter);   // Live Text Debug — DOM glass console (rides the 〰️ toggle)

  if (EffectsModule.init) EffectsModule.init(CameraModule.width, CameraModule.height);
  Accumulator.init(CameraModule.width, CameraModule.height, DEBUG_STATE.dpr);
  if (ConfigMenuModule.init) ConfigMenuModule.init();
  ZoomEnhancer.init(canvas);

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
    document.body.classList.toggle('dbg-on', DebugRouter.masterEnabled);   // vestigial — see debug-router.js's toggleAll() comment
    syncBenchVisibility();

    // TAP = toggle debug on/off (unchanged). HOLD = toggle console/panel
    // mode — this used to be its own separate button (#gg-console-mode, a
    // real DOM element sitting in the dbg-sat fan's own screen region,
    // z-index 55, visible whenever debug was on). Removed; its job folds
    // into this button's long-press instead, same tap/hold pattern
    // aims-btn already uses. One fewer real DOM element sitting in front
    // of the canvas-drawn satellites in that area.
    let dbgTimer = null, dbgHeld = false;
    const dbgClearTimer = () => { if (dbgTimer) { clearTimeout(dbgTimer); dbgTimer = null; } };
    debugBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dbgHeld = false;
      dbgTimer = setTimeout(() => {
        dbgHeld = true;
        ConsoleView.toggleMode();
        debugBtn.classList.add('mode-flash');
        setTimeout(() => debugBtn.classList.remove('mode-flash'), 200);
      }, 600);
    }, { passive: false });
    debugBtn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      dbgClearTimer();
      if (!dbgHeld) {
        DebugRouter.toggleAll();
        debugBtn.classList.toggle('active', DebugRouter.masterEnabled);
        ConsoleView.sync();
        renderBenchInfo();
        syncBenchVisibility();
      }
      dbgHeld = false;
    }, { passive: false });
    debugBtn.addEventListener('pointerleave', () => { dbgClearTimer(); dbgHeld = false; });
    debugBtn.addEventListener('pointercancel', () => { dbgClearTimer(); dbgHeld = false; });
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

  // ✅ Satellite buttons (dbg-sat / aims-sat / paint-sat) are no longer
  // HTML — they're canvas-drawn now (js/modules/ui/canvas-satellites.js),
  // per rules.md §8. All their wiring (tap/hold actions, including the
  // Pause-While-Painting redesign — PaintingState.isBlockingPhysics(),
  // never a one-shot pause) lives in that module's registry instead of
  // here. resetBrushOverrides is exposed on window.Sim below so that
  // registry's paint-sat-size entry has something real to call.

  // User preferences — load the saved customizations now that the panels
  // exist, then autosave every change in real time (GGPrefs.export() for the
  // readable file copy).
  PrefsStore.init();
  UpdateFeed.push('UPDATE BAR ONLINE');

  // BUG FIX ("InAims does not work"): window._InAims was ONLY ever set
  // inside resetGame() — which nothing calls at startup (it's exposed for
  // manual use only). So in a normal session this global stayed undefined
  // forever: every aims-sat isActive gate in canvas-satellites.js read
  // `window._InAims?.enabled` → always false → the aims satellites never
  // rendered and never responded, no matter what AIMS itself was doing.
  // (The global exists instead of a direct import because in-aims.js
  // imports canvas-satellites.js — importing back would be a circular
  // import, a bug class this project has hit before.)
  window._InAims = InAims;

  const aimsBtn = document.getElementById('aims-btn');
  if (aimsBtn) {
    // TAP = on/off (unchanged). HOLD = cycle profile — Trackpad → Joystick
    // → Offset → Trackpad. See aims-profiles.js and rules.md §8.
    let aimsTimer = null, aimsHeld = false;
    const aimsClearTimer = () => { if (aimsTimer) { clearTimeout(aimsTimer); aimsTimer = null; } };
    const aimsSyncTitle = () => {
      const state = InAims.enabled ? 'ON' : 'OFF';
      aimsBtn.title = `Toggle AIMS Input — ${state}, profile: ${InAims.mode.toUpperCase()} (hold to cycle profile)`;
    };
    aimsBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      aimsHeld = false;
      aimsTimer = setTimeout(() => {
        aimsHeld = true;
        InAims.cycleProfile();
        aimsSyncTitle();
        aimsBtn.classList.add('mode-flash');
        setTimeout(() => aimsBtn.classList.remove('mode-flash'), 200);
      }, 600);
    }, { passive: false });
    aimsBtn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      aimsClearTimer();
      if (!aimsHeld) {
        if (InAims.enabled) InAims.disable();
        else InAims.enable();
        aimsBtn.classList.toggle('active', InAims.enabled);
        aimsSyncTitle();
      }
      aimsHeld = false;
    }, { passive: false });
    aimsBtn.addEventListener('pointerleave', () => { aimsClearTimer(); aimsHeld = false; });
    aimsBtn.addEventListener('pointercancel', () => { aimsClearTimer(); aimsHeld = false; });
    aimsSyncTitle();
  }

  // ✅ PAINTING BUTTON — wire to PaintingState toggle
  PaintingButton.init();
  const paintingBtn = document.getElementById('painting-btn');
  if (paintingBtn) {
    paintingBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      PaintingState.toggle();
      PaintingButton.update();
    }, { passive: false });
  }

  // ✅ SELECTION TOOL BUTTON — previously had NO wiring anywhere (not here,
  // not in button-definitions.js): tapping it did nothing at all. Tap
  // toggles on/off (gold when active — CSS already had #selection-btn.active
  // styled, just nothing ever set the class). Hold cycles capture mode
  // (Box → Polygon → Pointer) and updates the glyph, per in-selection-tool.js's
  // own doc header. Same tap-vs-hold shape as satWireHold, but that helper
  // always flashes `.active` for 120ms rather than syncing it to persistent
  // state, so this needs its own small handler.
  const selectionBtn = document.getElementById('selection-btn');
  if (selectionBtn) {
    let selTimer = null, selHeld = false;
    const selClearTimer = () => { if (selTimer) { clearTimeout(selTimer); selTimer = null; } };
    const selSync = () => {
      selectionBtn.classList.toggle('active', SelectionTool.enabled);
      selectionBtn.textContent = SelectionTool.icon;
    };
    selectionBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      selHeld = false;
      selTimer = setTimeout(() => {
        selHeld = true;
        SelectionTool.cycleMode();
        selSync();
      }, 600);
    }, { passive: false });
    selectionBtn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      selClearTimer();
      if (!selHeld) { SelectionTool.toggle(); selSync(); }
      selHeld = false;
    }, { passive: false });
    selectionBtn.addEventListener('pointerleave', () => { selClearTimer(); selHeld = false; });
    selectionBtn.addEventListener('pointercancel', () => { selClearTimer(); selHeld = false; });
    selSync(); // initial glyph/state on load
  }

  window.Sim = window.Sim || {};
  window.Sim.physicsAccumulator = physicsAccumulator;
  window.Sim.isPreCalculating = isPreCalculating;
  window.Sim.lastPhysicsTime = lastPhysicsTime;
  window.Sim.preCalcCounter = preCalcCounter;
  
  // ✅ NEW SYSTEMS — export to window for debugging
  window.Sim.DotAtlasRenderer = DotAtlasRenderer;
  window.Sim.TweenGovernor = TweenGovernor;
  window.Sim.PaintingState = PaintingState;
  window.Sim.BurnMap = BurnMap;
  window.Sim.SelectionTool = SelectionTool;
  // finalPointerX/Y (InputState) — the one canonical "where the effective
  // click/drag is right now" value: the aim while AIMS is on, the real
  // pointer while it's off. Exposed globally so nothing has to reach into
  // input.module.js's internals to read it. See rules.md §8.
  window.Sim.InputState = InputState;
  window.Sim.ZoomEnhancer = ZoomEnhancer;
  // 📏 paint-sat-size (canvas-satellites.js) — reset brush size/spacing/
  // density overrides to Auto defaults. HOLD (density/spacing alternation
  // + computed "safe spacing") was described in an earlier session
  // summary but was never actually implemented anywhere in the codebase
  // — no function exists to wire it to. Left as a plain reset-only tap
  // rather than inventing that logic here; flagging it instead of
  // silently faking it.
  window.Sim.resetBrushOverrides = () => {
    ManualOverrides.reset('brushSizeMin');
    ManualOverrides.reset('brushSizeMax');
    ManualOverrides.reset('brushSpacing');
    ManualOverrides.reset('brushDensity');
  };

  requestAnimationFrame(mainLoop);
}

export function resetGame() {
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
  MsProbe.call('physics.snapshot', () =>
    StateCache.push(StateCache.captureSnapshot(state.bodies, state.loose)));
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

// FIX: used to hide itself whenever the pointer wasn't currently down —
// the opposite of "always show the aim's last position so the user
// knows." The caller (below, in the render loop) already gates this
// entirely on InAims.enabled; this function just draws, unconditionally,
// every time it's called.
//
// Also simplified: used to draw a separate "effective position" (aim.ex/
// ey = aim.x/y + a fixed offset) with a bias line back to the raw touch
// point. That made sense when AIMS had exactly one behavior (apply a
// fixed offset to wherever you tapped). Now there are three profiles
// (aims-profiles.js) with three different relationships between a touch
// and the aim — Trackpad's delta, Joystick's hold-and-lean, Offset's
// fixed bias — and aim.x/y IS the final, authoritative position in every
// one of them. Drawing a second "effective" point off of it doesn't mean
// anything for Trackpad/Joystick, and would double-apply Offset's own
// bias. One reticle, at the one real position, is honest for all three.
//
// Color state, per direction: BLUE + sharp once a touch has cleared the
// charge delay and is actively driving the aim right now
// (InputModule.aimsCaptured); RED otherwise — idle (AIMS on, nothing
// touching), or mid-charge (touching, but hasn't cleared the delay yet).
// "Sharp" = full opacity / crisp, vs a dimmer, softer look while not
// captured — still fully visible either way ("always show the last
// position"), just visually distinct from "currently engaged."
function _drawAimCursor(ctx) {
  const ax = Aims.aim.x;
  const ay = Aims.aim.y;
  const r  = Aims.aim.radius;
  const dpr = DEBUG_STATE.dpr || 1;
  const captured = InputModule.aimsCaptured;

  const c = captured
    ? { ring: 'rgba(90, 170, 255, 0.95)',  fill: 'rgba(90, 170, 255, 0.10)',  cross: 'rgba(90, 170, 255, 1.0)',  dot: 'rgba(255, 255, 255, 0.95)' }
    : { ring: 'rgba(255, 80, 80, 0.55)',   fill: 'rgba(255, 80, 80, 0.04)',   cross: 'rgba(255, 80, 80, 0.65)',  dot: 'rgba(255, 190, 190, 0.7)'  };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const sx = ax * dpr, sy = ay * dpr;
  const sr = r * dpr;

  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.strokeStyle = c.ring;
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fillStyle = c.fill;
  ctx.fill();

  const cs = 6 * dpr;
  ctx.strokeStyle = c.cross;
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(sx - cs, sy); ctx.lineTo(sx + cs, sy);
  ctx.moveTo(sx, sy - cs); ctx.lineTo(sx, sy + cs);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(sx, sy, 2.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = c.dot;
  ctx.fill();
  ctx.restore();
}

// AIMS Tap Bulb — appears at the REAL release position after a captured
// gesture, big and easy to hit on purpose (InputModule's BULB_RADIUS,
// 15 screen px vs. the aim's own ~7px radius). Gold/amber family, not the
// aim's blue/red — a visually distinct control, not another aim state.
// Six states, six distinct looks (InputModule.bulbState.state):
//   hidden      — nothing drawn.
//   idle        — soft breathing gold glow, waiting to be tapped.
//   held        — bright filled gold ring, real immediate press feedback.
//   cancelling  — held but slid outside its own radius — warns by
//                 shifting toward red BEFORE anything is decided; release
//                 now and it won't fire, slide back in and it's held
//                 again.
//   confirmed   — DID fire. A bright ring expands outward and fades —
//                 the standard "success ping" motion.
//   cancelled   — did NOT fire. A red ring contracts inward and fades —
//                 deliberately the opposite motion from confirmed, so
//                 the two flashes never read as the same thing even at
//                 a glance.
function _drawAimsBulb(ctx) {
  const b = InputModule.bulbState;
  if (b.state === 'hidden') return;

  const dpr = DEBUG_STATE.dpr || 1;
  const sx = b.x * dpr, sy = b.y * dpr, sr = b.radius * dpr;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (b.state === 'held') {
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 200, 80, 0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 200, 80, 1.0)';
    ctx.lineWidth = 3 * dpr;
    ctx.stroke();

  } else if (b.state === 'cancelling') {
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 70, 60, 0.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 90, 70, 0.9)';
    ctx.lineWidth = 3 * dpr;
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);

  } else if (b.state === 'confirmed') {
    const p = 1 - b.flashRemain;   // 0 → 1 over the flash duration
    const r = sr * (1 + 0.6 * p);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 220, 140, ${(0.9 * (1 - p)).toFixed(3)})`;
    ctx.lineWidth = 3 * dpr;
    ctx.stroke();

  } else if (b.state === 'cancelled') {
    const p = 1 - b.flashRemain;   // 0 → 1 over the flash duration
    const r = sr * (1 - 0.5 * p);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 90, 70, ${(0.9 * (1 - p)).toFixed(3)})`;
    ctx.lineWidth = 3 * dpr;
    ctx.stroke();

  } else {
    // idle
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 260);
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 200, 80, ${(0.08 * pulse).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 200, 80, ${(0.55 * pulse).toFixed(3)})`;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  }

  // Center dot — the exact real touch point the bulb is anchored to.
  // Skipped during confirmed/cancelled — the expanding/contracting ring
  // alone reads more clearly as "done" without a static dot competing
  // with it.
  if (b.state !== 'confirmed' && b.state !== 'cancelled') {
    ctx.beginPath();
    ctx.arc(sx, sy, 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = b.state === 'cancelling' ? 'rgba(255, 160, 150, 0.9)' : 'rgba(255, 220, 140, 0.9)';
    ctx.fill();
  }

  ctx.restore();
}

// Live status readout, placed just below the aim reticle — "what is the
// touch event triggered" made visible as text, not just inferred from
// the reticle's color. Prioritizes the bulb's state when it's showing
// anything (it's the more specific, more immediate thing happening);
// otherwise shows the aim's own phase (idle/charging/captured) and
// which profile is active. Always anchored to the AIM's position, even
// when reporting on the bulb — the bulb has its own real position
// elsewhere on screen (that's the whole point of it), but this label
// lives with the cursor, not with whatever else is happening.
function _aimsStatusText() {
  const b = InputModule.bulbState;
  if (b.state !== 'hidden') return `BULB · ${b.state.toUpperCase()}`;

  const phase = InputModule.aimsPhase.toUpperCase();
  if (phase === 'CHARGING') return 'CHARGING…';
  return `${phase} · ${InAims.mode.toUpperCase()}`;
}

function _drawAimsStatus(ctx) {
  const dpr = DEBUG_STATE.dpr || 1;
  const s = DEBUG_STATE.style;
  const text = _aimsStatusText();

  const sx = Aims.aim.x * dpr;
  const sy = (Aims.aim.y + Aims.aim.radius + 16) * dpr;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${10 * dpr}px ${s.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padX = 6 * dpr, padY = 3 * dpr;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 14 * dpr;

  ctx.beginPath();
  ctx.roundRect(sx - w / 2, sy - h / 2, w, h, 4 * dpr);
  ctx.fillStyle = s.bg;
  ctx.fill();
  ctx.strokeStyle = s.border;
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();

  ctx.fillStyle = s.textDim;
  ctx.fillText(text, sx, sy + 0.5 * dpr);
  ctx.restore();
}

function mainLoop(t) {
  DebugRouter.resetAll();
  MsProbe.call('queops.tick', () => QueOps.tick());
  requestAnimationFrame(mainLoop);

  // Feed FPS counter every frame — before any frame-skip logic
  window._FpsCounter = FpsCounter;
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

  // GUI Governor: 0 rate = held (skip all physics work → no ticks, no cache
  // top-up, no snapshots, no dormancy), <1 = slow-motion. See gui-governor.js.
  const guiRate = GuiGovernor.simRate;

  if (!state.paused && !PaintingState.isBlockingPhysics(InputState.isHolding) && state.physSpeed > 0 && guiRate > 0) {
    // Bank real elapsed time, scaled by the speed multiplier. Clamp the frame
    // delta first so a long stall (tab switch, GC hitch) can't inject a huge
    // backlog — only pathological frames are affected; normal frames bank their
    // exact real time. physSpeed scales the banking RATE, so simulation speed is
    // a function of real wall-clock time only, never of frame rate.
    const bankedDt = Math.min(realDt, 0.1);
    physicsAccumulator += bankedDt * state.physSpeed * guiRate;
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

      // Gravity grid: deposit the weight map + advance the sliced far-field
      // build ONCE per rAF, before the substeps. Bodies move sub-cell within
      // one frame, so every substep this frame gathers from coherent geometry.
      if (Gate.pass('physics.gravField')) MsProbe.call('physics.gravField', () => GravityField.update());

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

      // Cycle meter — count what the accumulator actually drained (the 1000
      // law's ground truth) + the banked remainder still owed to physics.
      CycleMeter.frame(stepsThisFrame, physicsAccumulator, currentPhysicsStep);

      // Adaptive cache-ahead top-up — spend whatever spare ms CacheGov
      // allows pre-computing more future ticks, right now, while there's
      // still budget left in this frame. Some frames that's 1 step, some
      // frames it's 100 — purely a function of how much time is actually
      // available, never a fixed count.
      if (CacheGov.enabled && !isPreCalculating) {
        if (Gate.pass('cache.topUp')) MsProbe.call('cache.topUp', () => FutureCache.topUp(CacheGov.msBudget, CacheGov.targetAhead));
      }
      if (Gate.pass('dormancy.tick')) MsProbe.call('dormancy.tick', () => Dormancy.tick());   // Stage 1: measure hot/cold from the cached future (throttled, read-only)
    }
  }

  CameraModule.tick();
  if (window.Sim?.updatePanPad) window.Sim.updatePanPad();
  InputModule.aimsTick();

  // ✅ FIX: Use RenderGov from unified governor
  const _camVel = Math.abs(CameraModule.cam.zoom - CameraModule.cam.targetZoom) * 100
                + (CameraModule.isPanning ? 30 : 0);
  RenderGov.feedChaos(_camVel, 0, didPhysicsTick);

  // Data update — every rAF, unconditionally, before any drawing
  DebugRouter.updateData();

  // Debug panels — inside shouldRender per your architecture rule.
  // GuiGovernor.shouldRenderCanvas() throttles the whole CANVAS block in HALT
  // so the DOM console + input keep the frame; it's a no-op in every other mode.
  if (RenderGov.shouldRender() && GuiGovernor.shouldRenderCanvas()) {
    const alpha = Math.min(1, physicsAccumulator / currentPhysicsStep);

    CycleMeter.paint();
    MsProbe.call('render.drawAll', () => DrawAll(ctx, t, alpha, didPhysicsTick, (drawCtx) => {
      OverlaysModule.drawOrbitPreview(
        drawCtx,
        InputState.isHolding,
        InputState.holdTime,
        InputState.mouseX,
        InputState.mouseY,
        slider.value
      );
      Dormancy.drawWitness(drawCtx);   // locked-delta cold-body tween witness (world space)
      GravityField.drawOverlay(drawCtx); // weight map: how much gravity + where, per box
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

    // Zoom Enhancer magnifier box — was built and importable but never
    // actually init()'d or render()'d anywhere; aims-sat-zoom's toggle was
    // also unwired until this session. Only meaningful while AIMS is on
    // (matches its own doc comment); the ZoomEnhancer own `enabled` flag
    // additionally gates whether it actually draws anything.
    if (InAims.enabled) ZoomEnhancer.render();

    if (Gate.pass('debug.panels')) MsProbe.call('debug.panels', () => {
      DebugRouter.drawAll(ctx);
      TuningLayer.drawAll(ctx);
    });

    // Satellite buttons (dbg-sat / aims-sat / paint-sat) — canvas-drawn now,
    // not HTML (rules.md §8). Each gates its own visibility internally
    // (DebugRouter.masterEnabled / InAims.enabled / PaintingState.enabled),
    // so no extra condition needed here — same pattern as the panel draws
    // above. Drawn after panels so a satellite never renders under one.
    CanvasSatellites.render(ctx);

    // Persistent aim reticle — visible for exactly as long as AIMS is
    // enabled, regardless of pointer state, so the aim's last position is
    // always visible ("always show... so the user knows", per direction).
    // Never visible while disabled. See _drawAimCursor's own header for
    // why it no longer draws a separate offset/bias line.
    if (InAims.enabled) { _drawAimCursor(ctx); _drawAimsBulb(ctx); _drawAimsStatus(ctx); }
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