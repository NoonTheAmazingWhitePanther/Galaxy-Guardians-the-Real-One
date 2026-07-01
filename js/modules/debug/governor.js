/**
 * js/modules/debug/governor.js
 * UNIFIED GOVERNOR — Single source of truth for ALL auto/manual control.
 * Replaces PhysicsGovernor, RenderGovernor, and QueOps governor methods.
 * Fully restored — no logic removed.
 */

// ── Variable Registry ─────────────────────────────────────────────────────
const _registry = new Map();

export const GovernorRegistry = {
  register(name, module) {
    _registry.set(name, module);
    console.log(`[Governor] Registered: ${name}`);
  },
  get(name) {
    return _registry.get(name);
  },
  has(name) {
    return _registry.has(name);
  },
  clear() {
    _registry.clear();
  }
};

export function resolveVariable(path) {
  if (!path || typeof path !== 'string') {
    console.warn('[Governor] resolveVariable: invalid path', path);
    return null;
  }

  const parts = path.split('.');
  if (parts.length < 2) {
    console.warn('[Governor] resolveVariable: path must be "Module.prop"', path);
    return null;
  }

  const moduleName = parts[0];
  const propPath   = parts.slice(1);

  const module = _registry.get(moduleName);
  if (!module) {
    console.warn(`[Governor] resolveVariable: unknown module "${moduleName}"`, path);
    return null;
  }

  // Special case: ManualOverrides.<key>.value
  // Writing must go through ManualOverrides.set() so isManual is updated.
  // The Governor '=' button calls variable.set(autoValue) but we want reset —
  // Governor.idle() handles that separately via the 'manualKey' hint below.
  if (moduleName === 'ManualOverrides' && propPath.length === 2 && propPath[1] === 'value') {
    const key = propPath[0];
    return {
      get:       ()  => module[key]?.value,
      set:       (v) => module.set(key, v),
      reset:     ()  => module.reset(key),
      manualKey: key,           // hint for Governor.idle()
    };
  }

  return {
    get: () => {
      let obj = module;
      for (const p of propPath) {
        if (obj == null) return undefined;
        obj = obj[p];
      }
      return obj;
    },
    set: (v) => {
      let obj = module;
      for (let i = 0; i < propPath.length - 1; i++) {
        if (obj == null) return;
        obj = obj[propPath[i]];
      }
      if (obj != null) {
        const last   = propPath[propPath.length - 1];
        const oldVal = obj[last];
        obj[last]    = v;
        console.log(`[Governor] ${path}: ${oldVal} → ${v}`);
      }
    }
  };
}

// ── Unified Manual Override State ─────────────────────────────────────────
export const ManualOverrides = {
  // Physics
  physicsSubsteps:          { isManual: false, value: 4 },
  physicsTimeScale:         { isManual: false, value: 1.0 },
  physicsFrameSkip:         { isManual: false, value: 0 },
  physicsSkipBase:          { isManual: false, value: 60 },  // 60/120/240/480/960 — independent from render's
  // Render
  renderFrameSkip:          { isManual: false, value: 0 },
  renderSkipBase:           { isManual: false, value: 60 },  // 60/120/240/480/960
  // Input
  inputFrameSkip:           { isManual: false, value: 0 },
  inputSkipBase:            { isManual: false, value: 60 },  // 30/60/120 — pointermove events, not rAF frames
  // QueOps
  queOpsBudget:             { isManual: false, value: 128 },
  queOpsDelay:              { isManual: false, value: 0.2 },
  queOpsDeferredThreshold:  { isManual: false, value: 50 },
  queOpsSkippedThreshold:   { isManual: false, value: 20 },
  // StateCache (old interpolation vault)
  cacheVaultSize:           { isManual: false, value: 120 },
  cacheSnapshotInterval:    { isManual: false, value: 1 },
  // FutureCache (new ahead-of-time tick cache)
  cacheEnabled:             { isManual: false, value: 1 },
  cacheTargetAhead:         { isManual: false, value: 100 },  // "amount of future steps to cache"
  cacheMsBudget:            { isManual: false, value: 2.0 },  // spare ms/frame spent caching ahead

  // set() — marks as manual and updates value. Used by Governor buttons.
  set(key, value) {
    if (this[key] !== undefined) {
      this[key].isManual = true;
      this[key].value    = value;
      console.log(`[Gov] MANUAL → ${key}=${value}`);
    }
  },

  // reset() — back to AUTO. Called when user presses '=' button.
  reset(key) {
    if (this[key] !== undefined) {
      this[key].isManual = false;
      console.log(`[Gov] AUTO → ${key}`);
    }
  },

  get(key, autoValue) {
    return (this[key]?.isManual) ? this[key].value : autoValue;
  },

  isManual(key) {
    return this[key]?.isManual ?? false;
  },

  // resolveVariable-compatible accessors keyed by override name.
  // Path "ManualOverrides.renderFrameSkip.value" calls set() on write,
  // ensuring isManual is flipped automatically.
  _proxy(key) {
    const self = this;
    return {
      get value()    { return self[key].value; },
      set value(v)   { self.set(key, v); },
      get isManual() { return self[key].isManual; },
    };
  },

  // Expose named proxies so resolveVariable('ManualOverrides.renderFrameSkip.value') works
  get renderFrameSkipProxy() { return this._proxy('renderFrameSkip'); },
};

// ── Physics Auto-Adaptation (moved from physics-governor.js) ──────────────
export const PhysicsGov = {
  _baseSubsteps: 4,
  _chaosLevel: 0,
  _step: 0.016,
  _autoTimeScale: 1.0,

  // AUTO tick-skip always stays 0 — physics correctness comes first, unlike
  // render where auto-skipping a draw is harmless. This is a manual-only
  // performance knob; feedChaos() never touches it.
  _autoFrameSkip: 0,
  _skipAccum:     0,    // fractional accumulator — Bresenham-style, same as RenderGov

  feedChaos(chaos, dt, didPhysicsTick) {
    this._chaosLevel = Math.max(0, Math.min(1, chaos / 100));
  },

  get step() {
    return this._step;
  },

  get substeps() {
    const base = this._baseSubsteps;
    const chaos = Math.max(0, Math.min(1, this._chaosLevel));
    const auto = Math.max(1, Math.min(16, Math.round(base + chaos * 12)));
    return ManualOverrides.get('physicsSubsteps', auto);
  },

  get timeScale() {
    return ManualOverrides.get('physicsTimeScale', this._autoTimeScale);
  },

  // Base cadence — skip count is "N out of BASE" physics ticks.
  // Independent from RenderGov.BASE — tuned separately from render.
  get BASE() {
    return ManualOverrides.get('physicsSkipBase', 60);
  },

  // Raw skip count — "skip N out of BASE physics ticks"
  get frameSkip() {
    return ManualOverrides.get('physicsFrameSkip', this._autoFrameSkip);
  },

  // Fractional, evenly-distributed tick skip — identical math to
  // RenderGov.shouldRender(). Gates ONLY the substep-consuming loop in
  // main.js; physicsAccumulator keeps banking real dt every frame
  // regardless of this, so a skipped tick never loses simulation time —
  // it just gets caught up in a bigger batch on the next allowed tick.
  shouldTick() {
    const skip = this.frameSkip;
    if (skip <= 0) return true;

    this._skipAccum += skip / this.BASE;
    if (this._skipAccum >= 1) {
      this._skipAccum -= 1;
      return false;   // this tick is the one we skip
    }
    return true;
  },

  // Label for panel display: "1/60", "0/60" (no skip), etc.
  get fractionLabel() {
    const skip = this.frameSkip;
    return `${skip}/${this.BASE}`;
  },

  // Inverse — ticks actually run out of base, e.g. skip=1 → "59/60"
  get tickedLabel() {
    const skip = this.frameSkip;
    return `${this.BASE - skip}/${this.BASE}`;
  },

  get substepLabel() {
    return `${this.substeps}x`;
  },

  get label() {
    const manual = ManualOverrides.isManual('physicsSubsteps')
      || ManualOverrides.isManual('physicsTimeScale')
      || ManualOverrides.isManual('physicsFrameSkip');
    return manual ? 'MANUAL' : 'AUTO';
  },

  update() {}
};

// ── Render Auto-Adaptation (moved from render-governor.js) ────────────────
export const RenderGov = {
  _autoFrameSkip: 0,
  _chaosLevel:    0,
  _frameCount:    0,    // incremented every rAF
  _skipAccum:     0,    // fractional accumulator for even distribution

  // Base cadence — skip count is "N out of BASE" frames.
  // Reads live from ManualOverrides so changing it via the panel
  // takes effect immediately, no extra wiring needed.
  get BASE() {
    return ManualOverrides.get('renderSkipBase', 60);
  },

  feedChaos(camVel, dt, didPhysicsTick) {
    this._chaosLevel = Math.max(0, Math.min(1, camVel / 100));
    if (!ManualOverrides.isManual('renderFrameSkip')) {
      if (this._chaosLevel > 0.7) this._autoFrameSkip = 2;
      else if (this._chaosLevel > 0.4) this._autoFrameSkip = 1;
      else this._autoFrameSkip = 0;
    }
  },

  // Call once per rAF at the very top of the main loop
  tick() {
    this._frameCount++;
  },

  // Raw skip count — "skip N out of BASE frames"
  get frameSkip() {
    return ManualOverrides.get('renderFrameSkip', this._autoFrameSkip);
  },

  // To switch base cadence: ManualOverrides.set('renderSkipBase', 120)
  // Resets the accumulator automatically via the next tick — no burst,
  // since accum is always < 1 and the ratio simply changes smoothly.

  // Fractional, evenly-distributed skip — Bresenham-style accumulator.
  // skip=1, BASE=60  → exactly 1 frame dropped per 60, spread evenly.
  // skip=3, BASE=960 → very fine-grained, near-imperceptible skip rate,
  //                    still exactly correct even on displays under 960Hz.
  shouldRender() {
    const skip = this.frameSkip;
    if (skip <= 0) return true;

    this._skipAccum += skip / this.BASE;
    if (this._skipAccum >= 1) {
      this._skipAccum -= 1;
      return false;   // this frame is the one we skip
    }
    return true;
  },

  // Label for panel display: "1/60", "0/60" (no skip), etc.
  get fractionLabel() {
    const skip = this.frameSkip;
    return `${skip}/${this.BASE}`;
  },

  // Inverse — frames actually rendered out of base, e.g. skip=1 → "59/60"
  get renderedLabel() {
    const skip = this.frameSkip;
    return `${this.BASE - skip}/${this.BASE}`;
  },

  get label() {
    return ManualOverrides.isManual('renderFrameSkip') ? 'MANUAL' : 'AUTO';
  }
};

// ── Input Tick-Skip (pointermove throttle) ─────────────────────────────────
// Input isn't on the rAF clock like render/physics — it's raw browser
// events. pointerdown/up are discrete and must never be skipped (would drop
// taps/spawns/drag-releases). pointermove is the one continuous, high-
// frequency stream, so it's the input equivalent of a "frame" — this gates
// it with the exact same Bresenham math, just counted per move-event
// instead of per rAF frame ("skip N out of every BASE move events").
export const InputGov = {
  // AUTO always stays 0 — same conservative default as PhysicsGov. Skipping
  // move-processing mid-drag would make a dragged panel/camera visibly lag
  // behind the finger, so this is a manual-only profiling knob, never
  // auto-engaged.
  _autoFrameSkip: 0,
  _skipAccum:     0,    // fractional accumulator — Bresenham-style, same as RenderGov/PhysicsGov

  // Base cadence — skip count is "N out of BASE" pointermove events.
  // Independent from RenderGov.BASE / PhysicsGov.BASE.
  get BASE() {
    return ManualOverrides.get('inputSkipBase', 60);
  },

  // Raw skip count — "skip N out of BASE pointermove events"
  get frameSkip() {
    return ManualOverrides.get('inputFrameSkip', this._autoFrameSkip);
  },

  // Call once per pointermove event — identical math to RenderGov.shouldRender()
  // / PhysicsGov.shouldTick(), just driven by event count instead of rAF ticks.
  shouldProcess() {
    const skip = this.frameSkip;
    if (skip <= 0) return true;

    this._skipAccum += skip / this.BASE;
    if (this._skipAccum >= 1) {
      this._skipAccum -= 1;
      return false;   // this move event is the one we skip
    }
    return true;
  },

  // Label for panel display: "1/60", "0/60" (no skip), etc.
  get fractionLabel() {
    const skip = this.frameSkip;
    return `${skip}/${this.BASE}`;
  },

  // Inverse — move events actually processed out of base, e.g. skip=1 → "59/60"
  get processedLabel() {
    const skip = this.frameSkip;
    return `${this.BASE - skip}/${this.BASE}`;
  },

  get label() {
    return ManualOverrides.isManual('inputFrameSkip') ? 'MANUAL' : 'AUTO';
  }
};

// ── Cache-Ahead Governor (FutureCache adaptive scheduler) ─────────────────
// Decides how much spare time to spend pre-computing future physics ticks.
// Not a Bresenham skip gate like the other three — this one is a straight
// time budget, because "sometimes 1 step, sometimes 100" isn't a fixed
// ratio, it's just whatever fits in the leftover frame time. FutureCache
// itself does the actual work; this just holds the tunable knobs.
export const CacheGov = {
  get enabled() {
    return ManualOverrides.get('cacheEnabled', 1) !== 0;
  },

  // How many steps ahead to try to keep buffered — a ceiling, not a
  // guarantee. Caching stops the moment the time budget runs out, even if
  // this target hasn't been reached yet.
  get targetAhead() {
    return ManualOverrides.get('cacheTargetAhead', 100);
  },

  // Spare ms/frame allowed for cache-ahead work. Kept modest by default so
  // it never competes with the frame's actual required work.
  get msBudget() {
    return ManualOverrides.get('cacheMsBudget', 2.0);
  },

  get label() {
    const manual = ManualOverrides.isManual('cacheEnabled')
      || ManualOverrides.isManual('cacheTargetAhead')
      || ManualOverrides.isManual('cacheMsBudget');
    return manual ? 'MANUAL' : 'AUTO';
  }
};

// ── Shared dynamic-max resolver ────────────────────────────────────────────
// Used anywhere a knob/slider/control needs to track a governor's live BASE
// (e.g. a frame-skip knob must always cap at the currently selected base).
// cfg.dynamicMaxSource picks which governor: 'render' (default), 'physics', or 'input'.
function _govBase(source) {
  if (source === 'physics') return PhysicsGov.BASE;
  if (source === 'input')   return InputGov.BASE;
  return RenderGov.BASE;
}

export function resolveDynamicMax(cfg, fallback) {
  if (!cfg?.dynamicMaxFromBase) return cfg?.max ?? fallback;
  return _govBase(cfg.dynamicMaxSource);
}

// ── Governor Class (for debug panel buttons/sliders) ──────────────────────
export class Governor {
  constructor(variable, config = {}) {
    if (!variable || typeof variable.get !== 'function' || typeof variable.set !== 'function') {
      throw new Error('[Governor] variable must have get() and set() methods');
    }

    this.variable = variable;
    this.mode = config.mode || 'add';
    this.step = config.step ?? 1;
    this.min = config.min ?? -Infinity;
    this._maxConfig = config.max ?? Infinity;
    // When true, .max always tracks a governor's BASE live — so the skip
    // slider/buttons can never exceed the currently selected base (60/120/...)
    // dynamicMaxSource picks which one: 'render' (default), 'physics', or 'input'.
    this.dynamicMaxFromBase = !!config.dynamicMaxFromBase;
    this.dynamicMaxSource = config.dynamicMaxSource || 'render';
    this.steps = config.steps || null;
    this.isManual = false;
  }

  // Live max — tracks the configured governor's BASE when dynamicMaxFromBase
  // is set, otherwise uses the static config value.
  get max() {
    if (this.dynamicMaxFromBase) {
      return _govBase(this.dynamicMaxSource);
    }
    return this._maxConfig;
  }

  set max(v) {
    this._maxConfig = v;
  }

  multiply() {
    this._step(1);
    this.isManual = true;
    // Clamp current value to new max immediately — e.g. switching base
    // from 960 to 60 while skip=500 should clamp to 60, not stay at 500
    this._clampToRange();
  }

  divide() {
    this._step(-1);
    this.isManual = true;
    this._clampToRange();
  }
  add() {
    this.multiply();
  }

  subtract() {
    this.divide();
  }

  idle() {
    // For ManualOverrides paths, reset() sets isManual=false → engine returns to AUTO
    if (typeof this.variable.reset === 'function') {
      this.variable.reset();
    }
    this.isManual = false;
    console.log(`[Governor] IDLE → value=${this.variable.get()}`);
  }

  // Reset to zero — used by the red "Reset Frame Skip" button
  resetToZero() {
    this.variable.set(0);
    this.isManual = true;
    console.log(`[Governor] RESET → value=0`);
  }

  _clampToRange() {
    const v = this.variable.get();
    if (typeof v !== 'number') return;
    const clamped = Math.max(this.min, Math.min(this.max, v));
    if (clamped !== v) this.variable.set(clamped);
  }

  _step(direction) {
    const current = this.variable.get();
    if (current == null || !Number.isFinite(current)) {
      console.warn('[Governor] current value is not finite:', current);
      return;
    }

    let next;

    if (this.steps) {
      const idx = this.steps.indexOf(current);
      if (idx === -1) {
        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < this.steps.length; i++) {
          const dist = Math.abs(this.steps[i] - current);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        }
        next = this.steps[nearestIdx];
      } else {
        const newIdx = Math.max(0, Math.min(this.steps.length - 1, idx + direction));
        next = this.steps[newIdx];
      }
    } else {
      if (this.mode === 'mult') {
        next = direction > 0 ? current * 2 : current / 2;
      } else {
        next = current + this.step * direction;
      }
      next = Math.max(this.min, Math.min(this.max, next));
    }

    this.variable.set(next);  }

  get value() {
    return this.variable.get();
  }

  get label() {
    if (this.isManual) {
      const v = this.variable.get();
      const display = Number.isFinite(v) ? v.toFixed(2) : '?';
      return `MANUAL:${display}`;
    }
    return 'AUTO';
  }

  get pressure() {
    if (!Number.isFinite(this.max)) return 0;
    const v = this.variable.get();
    if (!Number.isFinite(v)) return 0;
    return Math.min(1, Math.max(0, (v - this.min) / (this.max - this.min)));
  }
}

export default Governor;