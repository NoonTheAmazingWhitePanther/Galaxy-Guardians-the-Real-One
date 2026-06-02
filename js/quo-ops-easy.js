"use strict";

/**
 * QuoOpsEasy (Lower Resolution / Performance Mode)
 * 
 * A performance-optimized variant of the operation queue system.
 * Trades visual/physics fidelity (via frame skipping, lower budgets, and aggressive staggering) 
 * for significantly better performance on lower-end devices.
 * 
 * API is 100% identical to the original for easy drop-in replacement.
 */
window.QuoOpsEasy = (function() {
  // ────────────────────────────────────────────────────────────────────
  // CONFIG & COOLING STATES (Tuned for lower-end performance)
  // ────────────────────────────────────────────────────────────────────
  const COOLING_STATES = [8, 16, 32, 64, 128]; 
  const DEFAULT_CONFIG = {
    maxOpsPerFrame: 32,          // Strict budget to prevent main-thread blocking
    fpsSampleSize: 60,
    lowFpsThreshold: 45,         // Trigger cooldown sooner
    highFpsThreshold: 58,
    stableFramesToAdjust: 60,    // React faster to performance drops (was 120)
    autoBatch: true,
    strictBudget: true,
    enableStagger: true,
    maxFrameTimeMs: 8,           // Stricter time limit (was 14ms)
    staggerPrecisionMs: 1.0      // Coarser staggering for less overhead
  };

  // ────────────────────────────────────────────────────────────────────
  // SUBJECT REGISTRY (Frame skipping applied via cycleEvery)
  // ────────────────────────────────────────────────────────────────────
  const SUBJECTS = {
    physics:      { maxPerFrame: 20, cycleEvery: 2, costMult: 1.5, delayMs: 0.02, desc: "Gravity, integration, springs (Every 2nd frame)" },
    rendering:    { maxPerFrame: 64, cycleEvery: 1, costMult: 2.0, delayMs: 0.4,  desc: "Canvas draw calls (Delayed to end of frame)" },
    particles:    { maxPerFrame: 15, cycleEvery: 3, costMult: 1.0, delayMs: 0.5,  desc: "Debris, sparks, trails (Every 3rd frame)" },
    logic:        { maxPerFrame: 10, cycleEvery: 1, costMult: 1.0, delayMs: 0.0,  desc: "Game state, scoring, events" },
    ai:           { maxPerFrame: 8,  cycleEvery: 3, costMult: 1.8, delayMs: 0.6,  desc: "NPC behavior (Every 3rd frame)" },
    audio:        { maxPerFrame: 5,  cycleEvery: 2, costMult: 0.8, delayMs: 0.2,  desc: "WebAudio updates (Every 2nd frame)" },
    ui:           { maxPerFrame: 12, cycleEvery: 2, costMult: 1.2, delayMs: 0.5,  desc: "DOM updates, HUD (Every 2nd frame)" },
    gc_management:{ maxPerFrame: 3,  cycleEvery: 6, costMult: 0.5, delayMs: 0.8,  desc: "Memory cleanup (Every 6th frame)" },
    custom:       { maxPerFrame: 10, cycleEvery: 2, costMult: 1.0, delayMs: 0.1,  desc: "User-defined systems (Every 2nd frame)" }
  };

  // ────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ────────────────────────────────────────────────────────────────────
  const state = {
    config: { ...DEFAULT_CONFIG },
    queue: [],    stats: {
      fps: 60,
      frameCount: 0,
      opsProcessed: 0,
      opsDeferred: 0,
      opsSkipped: 0,
      opsStaggered: 0,
      budgetUsed: 0,
      subjectBreakdown: {},
      coolingStateIndex: 2, // Start at 32 (index 2 of COOLING_STATES)
      framesAtThreshold: 0,
      lastFpsUpdate: performance.now()
    },
    initialized: false
  };

  // ────────────────────────────────────────────────────────────────────
  // CORE METHODS
  // ────────────────────────────────────────────────────────────────────

  function init(userConfig = {}) {
    Object.assign(state.config, userConfig);
    const idx = COOLING_STATES.indexOf(state.config.maxOpsPerFrame);
    state.config.coolingStateIndex = idx !== -1 ? idx : 2;
    state.initialized = true;
    _resetStats();
    console.log(`[QuoOpsEasy] Initialized | Budget: ${state.config.maxOpsPerFrame} ops/frame | Stagger: ${state.config.enableStagger ? 'ON' : 'OFF'}`);
  }

  function add(op) {
    if (!state.initialized) init();

    const defaultOp = {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).slice(2, 9),
      subject: 'custom',
      type: 'single',
      fn: null,
      args: [],
      priority: 2,
      cost: 1,
      cycleEvery: 1,
      delayMs: 0,
      lastRunFrame: 0,
      isBatch: false,
      batchItems: null,
      batchProcessor: null
    };

    const merged = { ...defaultOp, ...op };
    merged.subject = merged.subject.toLowerCase();
    // Inherit delay from subject if not explicitly provided
    const subj = SUBJECTS[merged.subject];
    if (subj && merged.delayMs === 0 && !op.hasOwnProperty('delayMs')) {
      merged.delayMs = subj.delayMs || 0;
    }
    // Round delay to precision step
    if (merged.delayMs > 0) {
      merged.delayMs = Math.round(merged.delayMs / state.config.staggerPrecisionMs) * state.config.staggerPrecisionMs;
    }

    if (!SUBJECTS[merged.subject]) {
      console.warn(`[QuoOpsEasy] Unknown subject "${merged.subject}". Falling back to 'custom'.`);
      merged.subject = 'custom';
    }

    state.queue.push(merged);
    _maintainQueueSize();
  }

  /** Main tick: Time-sliced execution with stagger delays and frame skipping */
  function tick(dt) {
    _updateFPS();
    _adaptCoolingState();

    state.stats.opsProcessed = 0;
    state.stats.opsDeferred = 0;
    state.stats.opsSkipped = 0;
    state.stats.opsStaggered = 0;
    state.stats.budgetUsed = 0;
    state.stats.subjectBreakdown = {};

    const budget = state.config.maxOpsPerFrame;
    const maxTime = state.config.maxFrameTimeMs;
    const frameStart = performance.now();
    const currentFrame = state.stats.frameCount++;

    // Sort by priority, then delay, then cycle frequency
    state.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.delayMs !== b.delayMs) return a.delayMs - b.delayMs;
      return a.cycleEvery - b.cycleEvery;
    });

    const deferred = [];
    let remainingBudget = budget;

    // ── Process each operation ──
    const processOp = (op) => {
      const elapsedTime = performance.now() - frameStart;      
      // Time / budget guard
      if (elapsedTime >= maxTime || remainingBudget <= 0) {
        deferred.push(op);
        state.stats.opsDeferred++;
        return;
      }

      // Frame skipping check (The core "lower resolution" mechanic)
      if (currentFrame % op.cycleEvery !== 0) {
        deferred.push(op);
        return;
      }

      // Stagger delay check
      if (state.config.enableStagger && op.delayMs > 0) {
        if (elapsedTime < op.delayMs) {
          deferred.push(op);
          state.stats.opsStaggered++;
          return;
        }
      }

      // Per-subject cap check
      const subjectCfg = SUBJECTS[op.subject];
      const subjectMax = subjectCfg ? subjectCfg.maxPerFrame : 20;
      if (!state.stats.subjectBreakdown[op.subject]) {
        state.stats.subjectBreakdown[op.subject] = { processed: 0, cost: 0, skipped: 0, staggered: 0 };
      }
      const subjStats = state.stats.subjectBreakdown[op.subject];

      if (subjStats.processed >= subjectMax) {
        subjStats.skipped++;
        state.stats.opsSkipped++;
        deferred.push(op);
        return;
      }

      // Execute operation
      let opCost = op.isBatch ? (op.cost * (op.batchItems?.length || 1)) : op.cost;
      try {
        const t0 = performance.now();
        if (op.isBatch && op.batchProcessor) {
          op.batchProcessor(op.batchItems, op.args);
        } else if (typeof op.fn === 'function') {
          op.fn.apply(null, op.args);
        }
        const execTime = performance.now() - t0;

        op.lastRunFrame = currentFrame;        subjStats.processed++;
        subjStats.cost += opCost + (execTime * 0.1);
        state.stats.opsProcessed++;
        state.stats.budgetUsed += opCost;
        remainingBudget -= opCost;
      } catch (err) {
        console.error(`[QuoOpsEasy] Op failed [${op.id}]:`, err);
        subjStats.skipped++;
        state.stats.opsSkipped++;
      }
    };

    for (const op of state.queue) {
      processOp(op);
    }

    // Rebuild queue with deferred items
    state.queue = deferred;
    if (state.queue.length > 500) {
      state.queue.sort((a, b) => a.priority - b.priority);
      state.queue = state.queue.slice(-450); // Hard cap to prevent memory bloat
    }

    return {
      budget,
      used: state.stats.budgetUsed,
      processed: state.stats.opsProcessed,
      deferred: state.stats.opsDeferred,
      skipped: state.stats.opsSkipped,
      staggered: state.stats.opsStaggered,
      fps: state.stats.fps,
      cooling: COOLING_STATES[state.config.coolingStateIndex],
      frameTimeMs: (performance.now() - frameStart).toFixed(2)
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // RUNTIME CONFIG & DEBUG API
  // ────────────────────────────────────────────────────────────────────

  function updateConfig(subjectOrKey, value) {
    if (typeof subjectOrKey === 'string' && SUBJECTS[subjectOrKey]) {
      if (typeof value === 'object') {
        Object.assign(SUBJECTS[subjectOrKey], value);
        console.log(`[QuoOpsEasy] Subject "${subjectOrKey}" updated:`, value);
      } else {
        console.warn(`[QuoOpsEasy] Use updateConfig('subject', { maxPerFrame: N, delayMs: 0.3 })`);
      }
    } else if (typeof subjectOrKey === 'object') {
      Object.assign(state.config, subjectOrKey);      const idx = COOLING_STATES.indexOf(state.config.maxOpsPerFrame);
      if (idx !== -1) state.config.coolingStateIndex = idx;
      console.log(`[QuoOpsEasy] Global config updated:`, state.config);
    }
  }

  function getDebugInfo() {
    const mapSubjectEntry = ([k, v]) => [k, { maxPerFrame: v.maxPerFrame, delayMs: v.delayMs }];

    return {
      fps: state.stats.fps,
      coolingState: COOLING_STATES[state.config.coolingStateIndex],
      maxOpsPerFrame: state.config.maxOpsPerFrame,
      maxFrameTimeMs: state.config.maxFrameTimeMs,
      enableStagger: state.config.enableStagger,
      queueSize: state.queue.length,
      budgetUsed: state.stats.budgetUsed,
      opsProcessed: state.stats.opsProcessed,
      opsDeferred: state.stats.opsDeferred,
      opsSkipped: state.stats.opsSkipped,
      opsStaggered: state.stats.opsStaggered,
      subjectBreakdown: { ...state.stats.subjectBreakdown },
      config: { ...state.config },
      subjects: Object.fromEntries(Object.entries(SUBJECTS).map(mapSubjectEntry))
    };
  }

  function flush(priorityLevelToKeep = 0) {
    const shouldKeepOp = (op) => op.priority <= priorityLevelToKeep;
    state.queue = state.queue.filter(shouldKeepOp);
    console.warn(`[QuoOpsEasy] Queue flushed. Remaining: ${state.queue.length}`);
  }

  function registerSubject(name, cfg = {}) {
    name = name.toLowerCase();
    if (SUBJECTS[name]) return console.warn(`[QuoOpsEasy] Subject "${name}" already exists.`);
    SUBJECTS[name] = { maxPerFrame: 20, cycleEvery: 1, costMult: 1.0, delayMs: 0, desc: cfg.desc || 'Custom', ...cfg };
  }

  // ────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ────────────────────────────────────────────────────────────────────

  function _updateFPS() {
    state.stats.frameCount++;
    const now = performance.now();
    if (now - state.stats.lastFpsUpdate >= 1000) {
      state.stats.fps = Math.round(state.stats.frameCount * 1000 / (now - state.stats.lastFpsUpdate));
      state.stats.frameCount = 0;
      state.stats.lastFpsUpdate = now;    }
  }

  function _adaptCoolingState() {
    const { fps, coolingStateIndex, framesAtThreshold } = state.stats;
    const { lowFpsThreshold, highFpsThreshold, stableFramesToAdjust } = state.config;
    let newStateIndex = coolingStateIndex;

    if (fps < lowFpsThreshold) {
      state.stats.framesAtThreshold++;
      if (state.stats.framesAtThreshold >= stableFramesToAdjust) {
        if (coolingStateIndex > 0) newStateIndex = coolingStateIndex - 1;
        state.stats.framesAtThreshold = 0;
      }
    } else if (fps > highFpsThreshold) {
      state.stats.framesAtThreshold++;
      if (state.stats.framesAtThreshold >= stableFramesToAdjust) {
        if (coolingStateIndex < COOLING_STATES.length - 1) newStateIndex = coolingStateIndex + 1;
        state.stats.framesAtThreshold = 0;
      }
    } else {
      state.stats.framesAtThreshold = 0;
    }

    if (newStateIndex !== coolingStateIndex) {
      state.config.coolingStateIndex = newStateIndex;
      state.config.maxOpsPerFrame = COOLING_STATES[newStateIndex];
    }
  }

  function _maintainQueueSize() {
    if (state.queue.length > 500) {
      state.queue.sort((a, b) => a.priority - b.priority);
      state.queue.splice(0, state.queue.length - 500);
    }
  }

  function _resetStats() {
    state.stats = {
      fps: 60, frameCount: 0, opsProcessed: 0, opsDeferred: 0, opsSkipped: 0, opsStaggered: 0,
      budgetUsed: 0, subjectBreakdown: {}, coolingStateIndex: state.config.coolingStateIndex,
      framesAtThreshold: 0, lastFpsUpdate: performance.now()
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────────────────

  return {    init, 
    add, 
    tick, 
    updateConfig, 
    getDebugInfo, 
    flush, 
    registerSubject,
    clearSubject: (subject) => {
      state.queue = state.queue.filter(op => op.subject !== subject);
    },
    removeById: (id) => {
      state.queue = state.queue.filter(op => op.id !== id);
    },
    coolingStates: COOLING_STATES,
    subjects: SUBJECTS,
    config: state.config
  };
})();