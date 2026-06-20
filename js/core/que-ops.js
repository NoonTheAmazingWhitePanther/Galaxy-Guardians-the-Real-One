/**
 * js/core/que-ops.js
 * QueOps — Time-sliced operation queue for Galaxy Guardians.
 *
 * Spreads expensive operations (particle creation, physics events,
 * rendering bursts) across multiple frames so no single frame spikes.
 *
 * CONVERTED: window.QueOps IIFE → ES module export.
 * Usage: import { QueOps } from '../../core/que-ops.js';
 *
 * SUBJECTS (built-in):
 *   physics      — gravity, integration, springs, collisions
 *   rendering    — canvas draw calls, path creation
 *   particles    — loose debris, sparks, trails
 *   logic        — game state, events, input
 *   ai           — NPC behavior (future)
 *   audio        — WebAudio updates (future)
 *   ui           — HUD, overlays
 *   gc_management — pooling, memory cleanup
 *   custom       — user-defined
 *
 * KEY IDEA:
 *   QueOps.add({ subject: 'particles', fn: spawnDebris, args: [x, y], priority: 2 })
 *   → gets metered out at max 30/frame, with stagger delays between batches
 *   → accumulator trail system makes deferred particles look intentional (smear-in)
 */

// ── Config & Cooling ──────────────────────────────────────────────────────
const COOLING_STATES = [16, 32, 64, 128, 256];

const DEFAULT_CONFIG = {
  maxOpsPerFrame:       128,
  fpsSampleSize:        60,
  lowFpsThreshold:      45,
  highFpsThreshold:     58,
  stableFramesToAdjust: 120,
  autoBatch:            true,
  strictBudget:         true,
  enableStagger:        true,
  maxFrameTimeMs:       14,
  staggerPrecisionMs:   0.5
};

// ── Subject Registry ──────────────────────────────────────────────────────
const SUBJECTS = {
  physics:       { maxPerFrame: 40,  cycleEvery: 1, costMult: 1.5, delayMs: 0.01, desc: 'Gravity, integration, springs, collisions' },
  rendering:     { maxPerFrame: 128, cycleEvery: 1, costMult: 2.0, delayMs: 0.2,  desc: 'Canvas draw calls, path creation, state changes' },
  particles:     { maxPerFrame: 30,  cycleEvery: 2, costMult: 1.0, delayMs: 0.2,  desc: 'Loose debris, sparks, trails, pooling' },
  logic:         { maxPerFrame: 20,  cycleEvery: 1, costMult: 1.0, delayMs: 0.0,  desc: 'Game state, scoring, events, input' },
  ai:            { maxPerFrame: 15,  cycleEvery: 3, costMult: 1.8, delayMs: 0.5,  desc: 'NPC behavior, pathfinding, decisions' },
  audio:         { maxPerFrame: 10,  cycleEvery: 1, costMult: 0.8, delayMs: 0.1,  desc: 'WebAudio updates, buffer management' },
  ui:            { maxPerFrame: 25,  cycleEvery: 1, costMult: 1.2, delayMs: 0.4,  desc: 'DOM updates, HUD, debug overlay' },
  gc_management: { maxPerFrame: 5,   cycleEvery: 4, costMult: 0.5, delayMs: 0.6,  desc: 'Object pooling, array trimming, memory cleanup' },
  custom:        { maxPerFrame: 20,  cycleEvery: 1, costMult: 1.0, delayMs: 0.0,  desc: 'User-defined systems' }
};

// ── Internal State ────────────────────────────────────────────────────────
const _state = {
  config: { ...DEFAULT_CONFIG },
  queue: [],
  stats: {
    fps: 60, frameCount: 0,
    opsProcessed: 0, opsDeferred: 0, opsSkipped: 0, opsStaggered: 0,
    budgetUsed: 0, subjectBreakdown: {},
    coolingStateIndex: 3, framesAtThreshold: 0,
    lastFpsUpdate: performance.now()
  },
  initialized: false
};

// ── Helpers ───────────────────────────────────────────────────────────────
function _resetStats() {
  _state.stats = {
    fps: _state.stats.fps,
    frameCount: 0,
    opsProcessed: 0, opsDeferred: 0, opsSkipped: 0, opsStaggered: 0,
    budgetUsed: 0, subjectBreakdown: {},
    coolingStateIndex: _state.stats.coolingStateIndex,
    framesAtThreshold: 0,
    lastFpsUpdate: performance.now()
  };
}

function _updateFPS() {
  _state.stats.frameCount++;
  const now = performance.now();
  if (now - _state.stats.lastFpsUpdate >= 1000) {
    _state.stats.fps = Math.round(
      _state.stats.frameCount * 1000 / (now - _state.stats.lastFpsUpdate)
    );
    _state.stats.frameCount   = 0;
    _state.stats.lastFpsUpdate = now;
  }
}

function _adaptCoolingState() {
  const { fps, coolingStateIndex, framesAtThreshold } = _state.stats;
  const { lowFpsThreshold, highFpsThreshold, stableFramesToAdjust } = _state.config;
  let idx = coolingStateIndex;

  if (fps < lowFpsThreshold) {
    _state.stats.framesAtThreshold++;
    if (_state.stats.framesAtThreshold >= stableFramesToAdjust) {
      if (idx > 0) idx--;
      _state.stats.framesAtThreshold = 0;
    }
  } else if (fps > highFpsThreshold) {
    _state.stats.framesAtThreshold++;
    if (_state.stats.framesAtThreshold >= stableFramesToAdjust) {
      if (idx < COOLING_STATES.length - 1) idx++;
      _state.stats.framesAtThreshold = 0;
    }
  } else {
    _state.stats.framesAtThreshold = 0;
  }

  if (idx !== coolingStateIndex) {
    _state.stats.coolingStateIndex = idx;
    _state.config.maxOpsPerFrame   = COOLING_STATES[idx];
  }
}

function _maintainQueueSize() {
  if (_state.queue.length > 600) {
    _state.queue.sort((a, b) => a.priority - b.priority);
    _state.queue.splice(0, _state.queue.length - 500);
  }
}

// ── Core ──────────────────────────────────────────────────────────────────
function _init(userConfig = {}) {
  Object.assign(_state.config, userConfig);
  const idx = COOLING_STATES.indexOf(_state.config.maxOpsPerFrame);
  _state.config.coolingStateIndex = idx !== -1 ? idx : 3;
  _state.initialized = true;
  _resetStats();
  console.log(`[QueOps] Init | Budget: ${_state.config.maxOpsPerFrame} ops/frame | Stagger: ${_state.config.enableStagger ? 'ON' : 'OFF'}`);
}

function _add(op) {
  if (!_state.initialized) _init();

  const defaults = {
    id:               Math.random().toString(36).slice(2, 9),
    subject:          'custom',
    type:             'single',
    fn:               null,
    args:             [],
    priority:         2,
    cost:             1,
    cycleEvery:       1,
    delayMs:          0,
    lastRunFrame:     0,
    isBatch:          false,
    batchItems:       null,
    batchProcessor:   null
  };

  const merged = { ...defaults, ...op };
  merged.subject = merged.subject.toLowerCase();

  if (!SUBJECTS[merged.subject]) {
    console.warn(`[QueOps] Unknown subject "${merged.subject}" — using 'custom'`);
    merged.subject = 'custom';
  }

  // Inherit subject delay if none specified
  const subj = SUBJECTS[merged.subject];
  if (subj && merged.delayMs === 0 && !Object.prototype.hasOwnProperty.call(op, 'delayMs')) {
    merged.delayMs = subj.delayMs || 0;
  }

  // Snap delay to precision grid
  if (merged.delayMs > 0) {
    merged.delayMs = Math.round(merged.delayMs / _state.config.staggerPrecisionMs)
                   * _state.config.staggerPrecisionMs;
  }

  _state.queue.push(merged);
  _maintainQueueSize();
  return merged.id;
}

function _tick() {
  if (!_state.initialized) _init();
  _updateFPS();
  _adaptCoolingState();

  const frameStats = {
    opsProcessed: 0, opsDeferred: 0,
    opsSkipped: 0,   opsStaggered: 0,
    budgetUsed: 0,   subjectBreakdown: {}
  };

  const budget      = _state.config.maxOpsPerFrame;
  const maxTime     = _state.config.maxFrameTimeMs;
  const frameStart  = performance.now();
  const currentFrame = _state.stats.frameCount;

  // Priority sort — low number = high priority
  _state.queue.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.delayMs  !== b.delayMs)  return a.delayMs  - b.delayMs;
    return a.cycleEvery - b.cycleEvery;
  });

  const deferred = [];
  let remaining  = budget;

  for (const op of _state.queue) {
    const elapsed = performance.now() - frameStart;

    // Time / budget exhausted → defer everything remaining
    if (elapsed >= maxTime || remaining <= 0) {
      deferred.push(op);
      frameStats.opsDeferred++;
      continue;
    }

    // Cycle gate — only run every N frames
    if (currentFrame % op.cycleEvery !== 0) {
      deferred.push(op);
      continue;
    }

    // Stagger gate — wait until elapsed >= delayMs
    if (_state.config.enableStagger && op.delayMs > 0 && elapsed < op.delayMs) {
      deferred.push(op);
      frameStats.opsStaggered++;
      continue;
    }

    // Per-subject cap
    const subCfg = SUBJECTS[op.subject];
    const subMax = subCfg ? subCfg.maxPerFrame : 20;
    if (!frameStats.subjectBreakdown[op.subject]) {
      frameStats.subjectBreakdown[op.subject] = { processed: 0, cost: 0, skipped: 0 };
    }
    const sb = frameStats.subjectBreakdown[op.subject];

    if (sb.processed >= subMax) {
      sb.skipped++;
      frameStats.opsSkipped++;
      deferred.push(op);
      continue;
    }

    // Execute
    const opCost = op.isBatch
      ? op.cost * (op.batchItems?.length || 1)
      : op.cost;

    try {
      if (op.isBatch && op.batchProcessor) {
        op.batchProcessor(op.batchItems, op.args);
      } else if (typeof op.fn === 'function') {
        op.fn(...op.args);
      }
      op.lastRunFrame = currentFrame;
      sb.processed++;
      sb.cost += opCost;
      frameStats.opsProcessed++;
      frameStats.budgetUsed += opCost;
      remaining -= opCost;
    } catch (err) {
      console.error(`[QueOps] Op failed [${op.id}]:`, err);
      sb.skipped++;
      frameStats.opsSkipped++;
    }
  }

  // Rebuild queue — keep deferred, trim if overgrown
  _state.queue = deferred;
  if (_state.queue.length > 500) {
    _state.queue.sort((a, b) => a.priority - b.priority);
    _state.queue = _state.queue.slice(-450);
  }

  // Merge frame stats into persistent stats
  Object.assign(_state.stats, frameStats);

  return {
    budget,
    used:        frameStats.budgetUsed,
    processed:   frameStats.opsProcessed,
    deferred:    frameStats.opsDeferred,
    skipped:     frameStats.opsSkipped,
    staggered:   frameStats.opsStaggered,
    fps:         _state.stats.fps,
    cooling:     COOLING_STATES[_state.stats.coolingStateIndex],
    queueSize:   _state.queue.length,
    frameTimeMs: (performance.now() - frameStart).toFixed(2)
  };
}

// ── Public API ────────────────────────────────────────────────────────────
export const QueOps = {
  /** Initialize with optional config overrides */
  init: _init,

  /**
   * Add an operation to the queue.
   * Returns the op id (string).
   *
   * @param {object} op
   * @param {string}   op.subject      — 'particles' | 'physics' | 'rendering' | ...
   * @param {Function} op.fn           — function to call
   * @param {Array}    op.args         — arguments array
   * @param {number}   op.priority     — 0=urgent, 1=high, 2=normal, 3=low
   * @param {number}   op.cost         — budget units (default 1)
   * @param {number}   op.cycleEvery   — run every N frames (default 1)
   * @param {number}   op.delayMs      — stagger: min ms into frame before running
   * @param {boolean}  op.isBatch      — true if batchItems + batchProcessor used
   * @param {Array}    op.batchItems   — items to pass to batchProcessor
   * @param {Function} op.batchProcessor — fn(items, args)
   */
  add: _add,

  /**
   * Call once per frame from mainLoop.
   * Returns a report object with budget, fps, queueSize etc.
   */
  tick: _tick,

  /** Update global config or a subject config at runtime */
  updateConfig(subjectOrKey, value) {
    if (typeof subjectOrKey === 'string' && SUBJECTS[subjectOrKey]) {
      if (typeof value === 'object') Object.assign(SUBJECTS[subjectOrKey], value);
      else console.warn(`[QueOps] Pass an object: updateConfig('particles', { maxPerFrame: 50 })`);
    } else if (typeof subjectOrKey === 'object') {
      Object.assign(_state.config, subjectOrKey);
      const idx = COOLING_STATES.indexOf(_state.config.maxOpsPerFrame);
      if (idx !== -1) _state.stats.coolingStateIndex = idx;
    }
  },

  /** Full debug snapshot */
  getDebugInfo() {
    return {
      fps:            _state.stats.fps,
      coolingState:   COOLING_STATES[_state.stats.coolingStateIndex],
      maxOpsPerFrame: _state.config.maxOpsPerFrame,
      maxFrameTimeMs: _state.config.maxFrameTimeMs,
      enableStagger:  _state.config.enableStagger,
      queueSize:      _state.queue.length,
      budgetUsed:     _state.stats.budgetUsed,
      opsProcessed:   _state.stats.opsProcessed,
      opsDeferred:    _state.stats.opsDeferred,
      opsSkipped:     _state.stats.opsSkipped,
      opsStaggered:   _state.stats.opsStaggered,
      subjectBreakdown: { ..._state.stats.subjectBreakdown },
      config:         { ..._state.config },
      subjects:       Object.fromEntries(
        Object.entries(SUBJECTS).map(([k, v]) => [k, { maxPerFrame: v.maxPerFrame, delayMs: v.delayMs }])
      )
    };
  },

  /** Drop everything below priorityLevelToKeep */
  flush(priorityLevelToKeep = 0) {
    _state.queue = _state.queue.filter(op => op.priority <= priorityLevelToKeep);
    console.warn(`[QueOps] Flushed. Remaining: ${_state.queue.length}`);
  },

  /** Remove all ops for a subject */
  clearSubject(subject) {
    _state.queue = _state.queue.filter(op => op.subject !== subject);
  },

  /** Remove a specific op by id */
  removeById(id) {
    _state.queue = _state.queue.filter(op => op.id !== id);
  },

  /** Register a new subject type at runtime */
  registerSubject(name, cfg = {}) {
    name = name.toLowerCase();
    if (SUBJECTS[name]) return console.warn(`[QueOps] Subject "${name}" already exists`);
    SUBJECTS[name] = {
      maxPerFrame: 20, cycleEvery: 1, costMult: 1.0,
      delayMs: 0, desc: cfg.desc || 'Custom', ...cfg
    };
  },

  get queueSize()     { return _state.queue.length; },
  get fps()           { return _state.stats.fps; },
  get coolingState()  { return COOLING_STATES[_state.stats.coolingStateIndex]; },
  get stats()         { return { ..._state.stats }; },
  SUBJECTS,
  COOLING_STATES
};
