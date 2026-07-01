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
  // Render
  renderFrameSkip:          { isManual: false, value: 0 },
  // QueOps
  queOpsBudget:             { isManual: false, value: 128 },
  queOpsDelay:              { isManual: false, value: 0.2 },
  queOpsDeferredThreshold:  { isManual: false, value: 50 },
  queOpsSkippedThreshold:   { isManual: false, value: 20 },
  // StateCache
  cacheVaultSize:           { isManual: false, value: 120 },
  cacheSnapshotInterval:    { isManual: false, value: 1 },

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

  get substepLabel() {
    return `${this.substeps}x`;
  },

  get label() {
    const manual = ManualOverrides.isManual('physicsSubsteps') || ManualOverrides.isManual('physicsTimeScale');
    return manual ? 'MANUAL' : 'AUTO';
  },

  update() {}
};

// ── Render Auto-Adaptation (moved from render-governor.js) ────────────────
export const RenderGov = {
  _autoFrameSkip: 0,
  _chaosLevel:    0,
  _frameCount:    0,   // incremented every rAF — drives clean frame-skip cadence

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

  get frameSkip() {
    return ManualOverrides.get('renderFrameSkip', this._autoFrameSkip);
  },

  // Clean cadence: renders on frame 0, skips N, renders again — no clock drift
  shouldRender() {
    const skip = this.frameSkip;
    if (skip <= 0) return true;
    return this._frameCount % (skip + 1) === 0;
  },

  get label() {
    return ManualOverrides.isManual('renderFrameSkip') ? 'MANUAL' : 'AUTO';
  }
};

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
    this.max = config.max ?? Infinity;
    this.steps = config.steps || null;
    this.isManual = false;
  }

  multiply() {
    this._step(1);
    this.isManual = true;
  }

  divide() {
    this._step(-1);
    this.isManual = true;
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