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
  // THE RENDER PULSE (render-pulse.js) — the fixed heartbeat of the frame.
  // 60 by default (16.6ms grid), raisable on the ladder 120/240/360/480.
  // TIME AUTHORITY: excluded from benchmark rotation and the live AutoTuner.
  pulseHz:                   { isManual: false, value: 60 },
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
  cacheDirtySubsteps:       { isManual: false, value: 0 },    // ghost-sim substeps for the FUTURE cache; 0 = exact (same as live). >0 = dirty/cheaper future.
  cacheFarCluster:          { isManual: false, value: 1 },    // 0/1 — ghost gravity: FAR planets collapse to COM offsets (cluster map), NEAR stay exact. The affordable-future law (Noon, 2026-07-11).
  cacheFarDist:             { isManual: false, value: 400 },  // px beyond rA+rB where a ghost pair goes far/clustered. Lower = cheaper + dirtier; raise if predicted collisions drift.
  sunGravMap:               { isManual: false, value: 1 },    // 0/1 — Noon's Sun Gravity Map: precomputed geometry field (mass factored out — bursts free). 0 = pure analytic. A/B via physics.grav.
  sunMapNearR:              { isManual: false, value: 1500 }, // px — inside this ring of the sun, gravity stays analytic-exact (gradient too steep for cells; keeps tight orbits smooth).
  sunMapSpan:               { isManual: false, value: 12000 },// px — world span the sun map covers, centered on the sun. Outside → analytic fallback. Change triggers rebuild.
  mapRuleOn:                { isManual: false, value: 1 },    // 0/1 — the Singular Map Rule: BodyFields renter (weight/heat/momentum/threat) on the one lattice.
  mapRuleRes:               { isManual: false, value: 1 },    // 0.25..4 — tessellation dial: resolution multiplier for Map Rule renters. Governor's hand on accuracy vs cost.
  mapRuleSkip:              { isManual: false, value: 4 },    // ticks between smoothing passes (registered skip — visible to Skip Action Panels).

  // TrajectoryPreview — the orbit-preview line IS the Future Cache: it
  // walks FutureCache's already-computed future (peekAt) instead of a
  // separate toy integrator, then folds straight into the buffer on spawn.
  trajPreviewOn:            { isManual: false, value: 1 },    // 1 = FutureCache-driven preview · 0 = line hidden
  trajPreviewMsBudget:      { isManual: false, value: 1.5 },  // ms/frame spent walking the candidate forward

  // Trails (position-history stamp trail + phosphor glow ring)
  trailEnabled:             { isManual: false, value: 1 },
  trailMax:                 { isManual: false, value: 8 },    // # of past tick-positions stamped (0..1000)
  trailDensity:             { isManual: false, value: 8 },    // stamps drawn along the trail (8..1000, interpolated)
  trailAlpha:               { isManual: false, value: 0.6 },  // base stamp opacity
  trailSpeedScale:          { isManual: false, value: 0 },    // 0 = length constant vs speed; >0 = grows with speed
  trailSkip:                { isManual: false, value: 1 },    // stamp every Kth past position
  trailShrink:              { isManual: false, value: 0 },    // 0..1 tail shrink (older = smaller)
  trailBloom:               { isManual: false, value: 0 },    // 0..1 additive glow on stamps
  trailGlowDepth:           { isManual: false, value: 8 },    // phosphor ring depth (persistence/soft tail)
  trailGlowFade:            { isManual: false, value: 0.55 }, // phosphor fade strength

  // Dormancy classifier (Stage 1) — live tuning of "how hot"
  dormancyMargin:           { isManual: false, value: 60 },   // wake LEAD in px: wake when centres within (r_i+r_j)+lead. Additive, NOT ×size — a huge body must not create a huge keep-out zone.
  dormancySunPad:           { isManual: false, value: 60 },   // extra px beyond the Sun's burn radius
  dormancyHorizon:          { isManual: false, value: 120 },  // ticks scanned ahead (cap, independent of cache depth)
  dormancyTween:            { isManual: false, value: 0 },    // 0/1 — witness the locked cold-body tween overlay
  dormancyTweenLock:        { isManual: false, value: 8 },    // frames per keyframe span (LOCKED Δ; higher = slower, smoother glide)
  dormancyRadiusK:          { isManual: false, value: 1.0 },   // ×declared body.radius for the wake extent (central offset + declared radius; 1.0 = as-built, no sprawl)
  dormancyStage2:           { isManual: false, value: 1 },     // 0/1 — LIVE physics cadence for coasting bodies, not just the witness overlay. ON by default (2026-07-11, Noon's call) — the prime-goal lever.
  dormancyCoastK:           { isManual: false, value: 4 },     // Stage 2: coasting bodies take 1 real step per K ticks, sized K× (folds in the skipped ticks). 1 = same as off.
  dormancySenses:           { isManual: false, value: 1 },     // 0/1 — field senses join the oracle: threat/contact can VETO cold (never grant it)
  dormancySenseThreat:      { isManual: false, value: 0.35 },  // smoothed `threat` on the FUTURE path above this → stay hot
  dormancySenseContact:     { isManual: false, value: 1.0 },   // smoothed `contact` at current/mid position above this → stay hot

  // ── NOVA EXPLOSIONS (2026-07-12, Noon's design) — physics always, visuals optional ──
  novaOn:                   { isManual: false, value: 1 },     // master — spawn() refuses at 0 (nothing burns, nothing pushes)
  novaShow:                 { isManual: false, value: 1 },     // VISUAL gate only — forces/heat/debris apply regardless
  novaShowPlane:            { isManual: false, value: -1 },    // visual plane filter: -1 = all planes
  novaFrames:               { isManual: false, value: 8 },     // animation frames per variant: 8 fast … 240 silky (high-end dial)
  novaSpritePx:             { isManual: false, value: 192 },   // sprite resolution per frame
  novaVariants:             { isManual: false, value: 2 },     // distinct streak fields; explosions cycle through them
  novaAtlasCapMB:           { isManual: false, value: 24 },    // memory law — wanted frames clamp to fit; panel shows capped flag
  novaBakePerOp:            { isManual: false, value: 4 },     // frames baked per QueOps op (ms-cycled by the shared ledger)
  novaLifeTicks:            { isManual: false, value: 90 },    // explosion duration in SIM ticks — heat + animation follow timeScale
  novaEnergy:               { isManual: false, value: 1200 },  // NovaFields pulse energy (force ring scales with it)
  novaRadius:               { isManual: false, value: 900 },   // world radius of field pulse AND the drawn sprite
  novaDebris:               { isManual: false, value: 40 },    // REAL loose particles per spawn (respects the 380 loose cap)
  novaMaxActive:            { isManual: false, value: 6 },     // pool law — oldest dies first
  novaDrawBudget:           { isManual: false, value: 8 },     // sprite draws per frame, round-robin cycled — never too much
  novaTest:                 { isManual: false, value: 0 },     // press + to fire one near the action; snaps back to AUTO

  // ── SPRING SOLVER (2026-07-12) ──
  springSoA:                { isManual: false, value: 1 },     // typed-array spring views (keyed by body.id, clone-proof) — 0 = legacy object loop for A/B
  springFastLen:            { isManual: false, value: 0 },     // sqrt-free near-rest length law — exact at rest, degrades under big strain; the POCO votes
  cachePacked:              { isManual: false, value: 1 },     // packed ghost snapshots (typed arrays, ~8× smaller, persistent working set) — 0 = legacy clone-per-tick

  // GUI Governor — starve the sim to reserve the frame for the interface
  guiGovMode:               { isManual: false, value: 0 },     // 0 OFF · 1 SLOW · 2 PAUSE · 3 HALT
  guiGovSlowFactor:         { isManual: false, value: 0.15 },  // sim-time rate in SLOW mode

  // Panel arrange grid — dot-grid pitch for snapping dragged debug panels.
  // 0 = FREE-FORM (no grid: drop where released, only pushed apart to keep a
  // 2px min gap along the drag trajectory). >0 = SNAP: released panels glide to
  // the nearest dot of a pitch-px dot grid. Default 48px. Tunable in PANEL GRID.
  panelGridSize:            { isManual: false, value: 8 },

  // PANEL SETTINGS — live restyle of every panel (all panels inherit these).
  // psOverall drives DEBUG_STATE.scale (the overall ratio — the ONLY sizing
  // surface; the zoom bar is a pure view transform via DEBUG_STATE.viewZoom
  // and never resizes panels). psLock is the "keep ratio" tick (1 = uniform scale, per-item knobs
  // ignored; 0 = distort each item freely). The rest are SCALE multipliers
  // (1.00 = 100% of the base pixel value), applied on top of the overall ratio.
  psOverall:                { isManual: false, value: 2.00 },  // overall ratio (→ DEBUG_STATE.scale) — ships at ×2
  psLock:                   { isManual: false, value: 1 },     // 1 = keep ratio · 0 = free
  psFont:                   { isManual: false, value: 1.00 },  // text size
  psPad:                    { isManual: false, value: 1.00 },  // inner padding
  psLine:                   { isManual: false, value: 1.00 },  // line height
  psLabelW:                 { isManual: false, value: 1.00 },  // label column width
  psValW:                   { isManual: false, value: 1.00 },  // value column width
  psRadius:                 { isManual: false, value: 1.00 },  // corner radius
  psKnob:                   { isManual: false, value: 1.00 },  // knob size (+ its touch box)
  // Minimized-panel attributes — SEPARATE from the opened panel's, so both
  // states can possess different looks (mixer channel/master knob size + font).
  psMinKnob:                { isManual: false, value: 1.00 },  // minimized mixer knob size
  psMinFont:                { isManual: false, value: 1.00 },  // minimized label font size

  // ── PLANET BRUSH (the metaverse planting tool) ──
  brushSizeMin:             { isManual: false, value: 24 },    // starting (smallest) radius
  brushSizeMax:             { isManual: false, value: 60 },    // maximum radius
  brushDensity:             { isManual: false, value: 4 },     // ms of delay between paints — 4 = rapid
  brushSpacing:             { isManual: false, value: 20 },    // px of stroke between stamps — the brush's tooth
  brushRandom:              { isManual: false, value: 1.0 },   // 0 = midpoint · 1 = full min..max spread
  brushPlane:               { isManual: false, value: -1 },    // -1 = CPU picks (round-robin) · 0..3 fixed group
  brushColor:               { isManual: false, value: -1 },    // -1 = Random · 0..5 named palette

  // ── SELECTION PANEL — master knob drives the zoom box's pan/zoom speed ──
  // Range 0.1..2.0, where 2.0 is the ORIGINAL fixed pan/zoom strength
  // (PAN_FRACTION_PER_SEC/ZOOM_UNITS_PER_SEC in selection-panel-extras.js
  // as originally shipped — "extra play" above the default). Ships at
  // 1.0, i.e. half of that — "make it into 1.0 (half of the current)".
  selectionPanSpeed:        { isManual: false, value: 1.0 },

  // ── GRAVITY GRID (the weight map — one for the Sun, many for the planets) ──
  gravGridOn:               { isManual: false, value: 1 },     // 1 = grid far field · 0 = legacy direct loop
  gravGridCols:             { isManual: false, value: 48 },    // lattice resolution (N×N over the cluster box)
  gravGridNear:             { isManual: false, value: 2 },     // near ring (cells) kept exact per-body
  gravGridMinBodies:        { isManual: false, value: 80 },    // grid sleeps below this body count (legacy loop is cheaper there)
  gravGridBudget:           { isManual: false, value: 512 },   // field-build slice: cells refreshed per frame
  gravGridOverlay:          { isManual: false, value: 0 },     // 1 = draw the weight map in world space

  // ── CYCLE PANEL — the chosen law ──────────────────────────────────────────
  cycleTarget:              { isManual: false, value: 1000 },  // how many cycles you want

  // ── UNDO (Ctrl+Z) ─────────────────────────────────────────────────────────
  // Every knob edit flows through set()/reset(), so recording the prior state
  // here captures the full history with one hook. Bulk operations (profile
  // apply / reset) set _suppressUndo so they land as nothing to step back into.
  _undoStack: [],
  _undoCap: 1000,  // the 1000 standard — same ceiling as every other stored-state list
  _suppressUndo: false,
  _undoTs: 0,
  _recordUndo(key) {
    if (this._suppressUndo) return;
    const e = this[key];
    if (!e || typeof e !== 'object') return;
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const top = this._undoStack[this._undoStack.length - 1];
    // Coalesce a continuous edit of the SAME key (a knob drag fires set() every
    // frame; a held +/- button ramps) into ONE entry that keeps the value from
    // before the burst began. Otherwise one undo would revert one micro-step.
    if (top && top.key === key && (now - this._undoTs) < 600) {
      this._undoTs = now;
      return;
    }
    this._undoStack.push({ key, value: e.value, isManual: e.isManual });
    this._undoTs = now;
    if (this._undoStack.length > this._undoCap) this._undoStack.shift();
  },
  undo() {
    const last = this._undoStack.pop();
    if (!last) return false;
    const e = this[last.key];
    if (e && typeof e === 'object') { e.value = last.value; e.isManual = last.isManual; }
    return true;
  },
  clearUndo() { this._undoStack.length = 0; },

  // set() — marks as manual and updates value. Used by Governor buttons.
  set(key, value) {
    if (this[key] !== undefined) {
      this._recordUndo(key);
      this[key].isManual = true;
      this[key].value    = value;
    }
  },

  // reset() — back to AUTO. Called when user presses '=' button.
  reset(key) {
    if (this[key] !== undefined) {
      this._recordUndo(key);
      this[key].isManual = false;
    }
  },

  // resetAllVariables() — flip EVERY data entry back to AUTO in one shot.
  // Skips methods and accessor/proxy keys (e.g. renderFrameSkipProxy) so it
  // only ever touches the real { isManual, value } records and can't throw.
  resetAllVariables() {
    for (const key of Object.keys(this)) {
      const desc = Object.getOwnPropertyDescriptor(this, key);
      if (!desc || typeof desc.get === 'function') continue;   // skip getters/proxies
      const entry = desc.value;
      if (entry && typeof entry === 'object' && typeof entry.isManual === 'boolean') {
        entry.isManual = false;
      }
    }
    console.log('[Gov] ALL variables → AUTO');
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

// ── Trails ────────────────────────────────────────────────────────────────
// Governs the position-history stamp trail (main trail shape) and the phosphor
// glow ring (soft persistence). All knobs are plain user settings read live
// from ManualOverrides — no AUTO/MANUAL adaptation, just direct control.
export const TrailGov = {
  get enabled()    { return ManualOverrides.get('trailEnabled', 1) !== 0; },
  get maxTrails()  { return Math.max(0, Math.min(1000, Math.round(ManualOverrides.get('trailMax', 8)))); },
  get density()    { return Math.max(8, Math.min(1000, Math.round(ManualOverrides.get('trailDensity', 8)))); },
  get alpha()      { return Math.max(0.02, Math.min(1, ManualOverrides.get('trailAlpha', 0.6))); },
  get speedScale() { return Math.max(0, Math.min(4, ManualOverrides.get('trailSpeedScale', 0))); },
  get skip()       { return Math.max(1, Math.min(16, Math.round(ManualOverrides.get('trailSkip', 1)))); },
  get shrink()     { return Math.max(0, Math.min(1, ManualOverrides.get('trailShrink', 0))); },
  get bloom()      { return Math.max(0, Math.min(1, ManualOverrides.get('trailBloom', 0))); },
  get glowDepth()  { return Math.max(2, Math.min(16, Math.round(ManualOverrides.get('trailGlowDepth', 8)))); },
  get glowFade()   { return Math.max(0.04, Math.min(0.95, ManualOverrides.get('trailGlowFade', 0.55))); },

  // Resolution ramp removed — every trail layer is the real full-res frame,
  // same quality as the prime render, always. (This also retires the earlier
  // flagged mismatch: TrailGov.resFraction never matched what Accumulator
  // actually composited — both are gone now, nothing left to reconcile.)
  firstFullRes: true,   // still true; trivially, since there's no ramp at all

  // Effective # of past positions to stamp this frame. Constant vs speed when
  // speedScale is 0; grows with the speed multiplier as speedScale rises.
  effectiveCount(physSpeed = 1) {
    const s = this.speedScale;
    const n = s > 0 ? this.maxTrails * (1 + (physSpeed - 1) * s) : this.maxTrails;
    return Math.max(0, Math.min(1000, Math.round(n)));
  },

  get label() { return this.enabled ? `${this.maxTrails}·${this.density}${this.skip > 1 ? '/' + this.skip : ''}` : 'off'; },

  get debugInfo() {
    return {
      enabled:    this.enabled,
      maxTrails:  this.maxTrails,
      count:      this.effectiveCount(),
      density:    this.density,
      skip:       this.skip,
      alpha:      this.alpha.toFixed(2),
      speedScale: this.speedScale.toFixed(2),
      shrink:     this.shrink.toFixed(2),
      bloom:      this.bloom.toFixed(2),
      glowDepth:  this.glowDepth,
      glowFade:   this.glowFade.toFixed(2),
    };
  }
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
// ── Screen Refresh Governor ─────────────────────────────────────────────────
// THE target. Detects the display's actual refresh rate instead of assuming
// 60 — a 90/120/144Hz screen deserves its full rate, and every adaptive
// governor should hold THAT, not a hardcoded number. Quality-first doctrine:
// adaptive controllers start at their ceiling and decrease until the frame
// rate is stable at the screen's real maximum ("perfect the visual to the
// maximum a screen can do").
//
// Detection: rAF deltas are collected every frame; under load a delta
// reflects the LOAD, not the screen — but the FASTEST sustained frames
// always reveal the true refresh interval. So: 10th-percentile of the
// recent delta window → Hz → snapped to the nearest common rate when
// it's within 15%, else the raw rounded value. Re-evaluated every ~2s,
// so plugging into an external monitor or a phone dropping to battery-
// saver 60Hz gets picked up live.
export const ScreenGov = {
  COMMON: [60, 75, 90, 120, 144, 165, 240],
  _deltas:   [],
  _hz:       60,     // best current estimate (snapped)
  _rawHz:    60,     // unsnapped, for the panel readout
  _lastT:    0,
  _lastEval: 0,

  // Call once per rAF, top of the main loop (next to RenderGov.tick()).
  tick(now) {
    if (this._lastT > 0) {
      const d = now - this._lastT;
      // 1ms..100ms sanity window: throw away tab-switch stalls and
      // duplicate-timestamp zeros so they can't poison the percentile.
      if (d > 1 && d < 100) {
        this._deltas.push(d);
        if (this._deltas.length > 240) this._deltas.shift();
      }
    }
    this._lastT = now;
    if (now - this._lastEval > 2000 && this._deltas.length >= 60) {
      this._eval();
      this._lastEval = now;
    }
  },

  _eval() {
    const s = [...this._deltas].sort((a, b) => a - b);
    const p10 = s[Math.floor(s.length * 0.1)];
    if (!(p10 > 0)) return;
    const raw = 1000 / p10;
    this._rawHz = raw;
    // ASYMMETRIC SNAP: the 10th-percentile estimate can read HIGH (timer
    // jitter makes some deltas shorter than the true vsync interval) but
    // essentially never LOW (load makes deltas longer, and p10 ignores
    // those). So: raw sitting up to 12% ABOVE a common rate is jitter —
    // snap down to it; raw sitting more than ~3% BELOW a common rate is
    // just a screen that genuinely isn't that rate — don't inflate the
    // target to something the display can't physically show.
    let best = null, bd = Infinity;
    for (const c of this.COMMON) {
      const ok = raw >= c ? (raw - c) / c <= 0.12
                          : (c - raw) / c <= 0.03;
      if (!ok) continue;
      const d = Math.abs(c - raw);
      if (d < bd) { bd = d; best = c; }
    }
    this._hz = best ?? Math.max(24, Math.round(raw));
  },

  // Detected screen refresh (Hz). This is what "stable max" means.
  get hz() { return this._hz; },

  // The FPS every adaptive governor should hold. Manual override respected
  // like every other knob; AUTO = the detected screen rate.
  get targetFps() {
    return ManualOverrides.get('screenTargetFps', this._hz);
  },

  get label() {
    return ManualOverrides.isManual('screenTargetFps')
      ? `${this.targetFps}fps MANUAL` : `${this._hz}Hz`;
  },

  get debugInfo() {
    return {
      hz:        this._hz,
      raw:       this._rawHz.toFixed(1),
      target:    this.targetFps,
      samples:   this._deltas.length,
      mode:      ManualOverrides.isManual('screenTargetFps') ? 'MANUAL' : 'AUTO',
    };
  }
};

export const RenderGov = {
  _autoFrameSkip: 0,
  _chaosLevel:    0,
  _frameCount:    0,    // incremented every rAF
  _skipAccum:     0,    // fractional accumulator for even distribution

  // Base cadence — skip count is "N out of BASE" frames.
  // Reads live from ManualOverrides so changing it via the panel
  // takes effect immediately, no extra wiring needed.
  // AUTO default is the DETECTED SCREEN RATE (ScreenGov), not a hardcoded
  // 60 — on a 120Hz display the skip fractions are per-120-frames, so the
  // cadence math is aligned to what the screen actually shows.
  get BASE() {
    return ManualOverrides.get('renderSkipBase', ScreenGov.hz);
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

  // ── Automated cache-ahead depth ─────────────────────────────────────────
  // In AUTO the target isn't a fixed number — it walks itself between a floor
  // of 1 and a ceiling of 1000. FutureCache.pump() calls reportFill() once a
  // frame; under the CONVEYOR LAW (one produced per consumed, see pump) the
  // pressure signal is STARVATION ONLY — the shared frame ledger ran dry
  // mid-replacement. "Buffer not full yet" is the normal state of a fill and
  // no longer reads as overload (that misread used to collapse 1000→1 on
  // every boot). Depth is pure lookahead under the conveyor — halving it
  // relieves ledger pressure from growth, not steady-state cost. High end
  // settles near 1000, low end near 1 — same per-frame price either way.
  // Mirrors HARD_CAP in future-cache.js — keep the two 1000s in sync.
  AUTO_MIN: 1,
  AUTO_MAX: 4096,   // mirrors HARD_CAP in future-cache.js — keep the two in sync
  // QUALITY-FIRST START: begins at the CEILING, not a modest 60 — the
  // doctrine is "start at maximum, decrease to what the machine holds
  // stable". The AIMD below halves within a few pressured frames on a
  // weak device (1000→500→250→…, budget-capped at msBudget the whole
  // way, so the descent itself can't hurt a frame), while a strong
  // machine simply keeps what it was given from second one.
  _autoTarget: 1000,

  reportFill(budgetLimited) {
    // Only self-tune in AUTO — a manual target is the user's explicit choice.
    if (ManualOverrides.isManual('cacheTargetAhead')) return;
    if (budgetLimited) {
      // Fell behind this frame → back off hard (multiplicative decrease).
      this._autoTarget = Math.max(this.AUTO_MIN, Math.floor(this._autoTarget / 2));
    } else {
      // Kept up with room to spare → reach a little deeper (additive increase).
      this._autoTarget = Math.min(this.AUTO_MAX, this._autoTarget + 16);
    }
  },

  // How many steps ahead to try to keep buffered — a ceiling, not a
  // guarantee. Caching stops the moment the time budget runs out, even if
  // this target hasn't been reached yet. MANUAL: the dialed-in value.
  // AUTO: the self-adapting depth above.
  get targetAhead() {
    if (ManualOverrides.isManual('cacheTargetAhead')) {
      return ManualOverrides.get('cacheTargetAhead', this._autoTarget);
    }
    return this._autoTarget;
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