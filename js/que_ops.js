// que_ops.js v2 - Staggered Time-Sliced Operation Queue
// Adds: Custom delay offsets, frame-internal staggering, time-sliced execution
// Prevents: CPU/GPU spikes, GC bursts, canvas pipeline stalls

"use strict";

window.QueOps = (function() {
  // ────────────────────────────────────────────────────────────────────
  // CONFIG & COOLING STATES
  // ────────────────────────────────────────────────────────────────────
  const COOLING_STATES = [16, 32, 64, 128, 256];
  const DEFAULT_CONFIG = {
    maxOpsPerFrame: 128,
    fpsSampleSize: 60,
    lowFpsThreshold: 45,
    highFpsThreshold: 58,
    stableFramesToAdjust: 120,
    autoBatch: true,
    strictBudget: true,
    enableStagger: true,           // NEW: Enable delay-based staggering
    maxFrameTimeMs: 14,            // NEW: Hard cap per rAF (leave ~2.6ms for browser)
    staggerPrecisionMs: 0.5        // NEW: Minimum delay step for staggering
  };

  // ────────────────────────────────────────────────────────────────────
  // SUBJECT REGISTRY (Now includes stagger delays)
  // ────────────────────────────────────────────────────────────────────
  const SUBJECTS = {
    physics:      { maxPerFrame: 40, cycleEvery: 1, costMult: 1.5, delayMs: 0.1, desc: "Gravity, integration, springs, collisions" },
    rendering:    { maxPerFrame: 35, cycleEvery: 1, costMult: 2.0, delayMs: 0.3, desc: "Canvas draw calls, path creation, state changes" },
    particles:    { maxPerFrame: 30, cycleEvery: 2, costMult: 1.0, delayMs: 0.2, desc: "Loose debris, sparks, trails, pooling" },
    logic:        { maxPerFrame: 20, cycleEvery: 1, costMult: 1.0, delayMs: 0.0, desc: "Game state, scoring, events, input" },
    ai:           { maxPerFrame: 15, cycleEvery: 3, costMult: 1.8, delayMs: 0.5, desc: "NPC behavior, pathfinding, decisions" },
    audio:        { maxPerFrame: 10, cycleEvery: 1, costMult: 0.8, delayMs: 0.1, desc: "WebAudio updates, buffer management" },
    ui:           { maxPerFrame: 25, cycleEvery: 1, costMult: 1.2, delayMs: 0.4, desc: "DOM updates, HUD, debug overlay" },
    gc_management:{ maxPerFrame: 5,  cycleEvery: 4, costMult: 0.5, delayMs: 0.6, desc: "Object pooling, array trimming, memory cleanup" },
    custom:       { maxPerFrame: 20, cycleEvery: 1, costMult: 1.0, delayMs: 0.0, desc: "User-defined systems" }
  };

  // ────────────────────────────────────────────────────────────────────
  // INTERNAL STATE
  // ────────────────────────────────────────────────────────────────────
  const state = {
    config: { ...DEFAULT_CONFIG },
    queue: [],
    stats: {
      fps: 60,
      frameCount: 0,
      opsProcessed: 0,
      opsDeferred: 0,      opsSkipped: 0,
      opsStaggered: 0,
      budgetUsed: 0,
      subjectBreakdown: {},
      coolingStateIndex: 3,
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
    state.config.coolingStateIndex = COOLING_STATES.indexOf(state.config.maxOpsPerFrame) || 3;
    state.initialized = true;
    _resetStats();
    console.log(`[QueOps v2] Initialized | Budget: ${state.config.maxOpsPerFrame} ops/frame | Stagger: ${state.config.enableStagger ? 'ON' : 'OFF'}`);
  }

  function add(op) {
    if (!state.initialized) init();
    
    const defaultOp = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 9),
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
    
    // Inherit delay from subject if not specified
    const subj = SUBJECTS[merged.subject];
    if (subj && merged.delayMs === 0 && !op.hasOwnProperty('delayMs')) {
      merged.delayMs = subj.delayMs || 0;
    }    
    // Round delay to precision step
    if (merged.delayMs > 0) {
      merged.delayMs = Math.round(merged.delayMs / state.config.staggerPrecisionMs) * state.config.staggerPrecisionMs;
    }
    
    if (!SUBJECTS[merged.subject]) {
      console.warn(`[QueOps] Unknown subject "${merged.subject}". Falling back to 'custom'.`);
      merged.subject = 'custom';
    }
    
    state.queue.push(merged);
    _maintainQueueSize();
  }

  /** Main tick: Time-sliced execution with stagger delays */
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
    
    // Sort: Priority → Stagger Delay → Cycle Frequency
    state.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.delayMs !== b.delayMs) return a.delayMs - b.delayMs;
      return a.cycleEvery - b.cycleEvery;
    });

    const deferred = [];
    let remainingBudget = budget;
    let elapsedTime = 0;

    for (const op of state.queue) {
      // Time & budget guard
      elapsedTime = performance.now() - frameStart;
      if (elapsedTime >= maxTime || remainingBudget <= 0) {
        deferred.push(op);
        state.stats.opsDeferred++;
        continue;      }

      // Cycle check
      if (currentFrame % op.cycleEvery !== 0) {
        deferred.push(op);
        continue;
      }

      // Stagger delay check
      if (state.config.enableStagger && op.delayMs > 0) {
        if (elapsedTime < op.delayMs) {
          deferred.push(op);
          state.stats.opsStaggered++;
          continue;
        }
      }

      // Per-subject cap
      const subjectCfg = SUBJECTS[op.subject];
      const subjectMax = subjectCfg ? subjectCfg.maxPerFrame : 20;
      if (!state.stats.subjectBreakdown[op.subject]) state.stats.subjectBreakdown[op.subject] = { processed: 0, cost: 0, skipped: 0, staggered: 0 };
      const subjStats = state.stats.subjectBreakdown[op.subject];
      
      if (subjStats.processed >= subjectMax) {
        subjStats.skipped++;
        state.stats.opsSkipped++;
        deferred.push(op);
        continue;
      }

      // Execute
      let opCost = op.isBatch ? (op.cost * (op.batchItems?.length || 1)) : op.cost;
      try {
        const t0 = performance.now();
        if (op.isBatch && op.batchProcessor) {
          op.batchProcessor(op.batchItems, op.args);
        } else if (typeof op.fn === 'function') {
          op.fn.apply(null, op.args);
        }
        const execTime = performance.now() - t0;
        
        op.lastRunFrame = currentFrame;
        subjStats.processed++;
        subjStats.cost += opCost + (execTime * 0.1); // Weight execution time into cost
        state.stats.opsProcessed++;
        state.stats.budgetUsed += opCost;
        remainingBudget -= opCost;
      } catch (err) {
        console.error(`[QueOps] Op failed [${op.id}]:`, err);
        subjStats.skipped++;        state.stats.opsSkipped++;
      }
    }

    // Rebuild queue
    state.queue = deferred;
    if (state.queue.length > 500) {
      state.queue.sort((a,b) => a.priority - b.priority);
      state.queue = state.queue.slice(-450);
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
        console.log(`[QueOps] Subject "${subjectOrKey}" updated:`, value);
      } else {
        console.warn(`[QueOps] Use updateConfig('subject', { maxPerFrame: N, delayMs: 0.3 })`);
      }
    } else if (typeof subjectOrKey === 'object') {
      Object.assign(state.config, subjectOrKey);
      const idx = COOLING_STATES.indexOf(state.config.maxOpsPerFrame);
      if (idx !== -1) state.config.coolingStateIndex = idx;
      console.log(`[QueOps] Global config updated:`, state.config);
    }
  }

  function getDebugInfo() {
    return {
      fps: state.stats.fps,
      coolingState: COOLING_STATES[state.config.coolingStateIndex],
      maxOpsPerFrame: state.config.maxOpsPerFrame,
      maxFrameTimeMs: state.config.maxFrameTimeMs,      enableStagger: state.config.enableStagger,
      queueSize: state.queue.length,
      budgetUsed: state.stats.budgetUsed,
      opsProcessed: state.stats.opsProcessed,
      opsDeferred: state.stats.opsDeferred,
      opsSkipped: state.stats.opsSkipped,
      opsStaggered: state.stats.opsStaggered,
      subjectBreakdown: { ...state.stats.subjectBreakdown },
      config: { ...state.config },
      subjects: Object.fromEntries(Object.entries(SUBJECTS).map(([k,v]) => [k, { maxPerFrame: v.maxPerFrame, delayMs: v.delayMs }]))
    };
  }

  function flush(priorityLevelToKeep = 0) {
    state.queue = state.queue.filter(op => op.priority <= priorityLevelToKeep);
    console.warn(`[QueOps] Queue flushed. Remaining: ${state.queue.length}`);
  }

  function registerSubject(name, cfg = {}) {
    name = name.toLowerCase();
    if (SUBJECTS[name]) return console.warn(`[QueOps] Subject "${name}" exists.`);
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
      state.stats.lastFpsUpdate = now;
    }
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
    } else if (fps > highFpsThreshold) {      state.stats.framesAtThreshold++;
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
    if (state.queue.length > 600) {
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
  return {
    init, add, tick, updateConfig, getDebugInfo, flush, registerSubject,
    coolingStates: COOLING_STATES,
    subjects: SUBJECTS,
    config: state.config
  };
})();

// ────────────────────────────────────────────────────────────────────
// USAGE EXAMPLES
// ────────────────────────────────────────────────────────────────────
/*
// 1. INIT
QueOps.init({ enableStagger: true, maxFrameTimeMs: 14 });

// 2. ADD STAGGERED OPS
QueOps.add({  subject: 'physics',
  fn: Sim.tickBodies,
  args: [dt],
  priority: 0,
  delayMs: 0.1,    // Runs 0.1ms after frame start
  cost: 3
});

QueOps.add({
  subject: 'rendering',
  isBatch: true,
  batchItems: stars,
  batchProcessor: drawStarBatch,
  priority: 3,
  delayMs: 0.3,    // Runs 0.3ms after frame start (staggered cool-down)
  cost: 2
});

// 3. MAIN LOOP
function frame() {
  const report = QueOps.tick();
  requestAnimationFrame(frame);
}

// 4. LIVE CONFIG (from settings menu)
// Spread rendering further to reduce GPU spikes
QueOps.updateConfig('rendering', { delayMs: 0.5 });
// Lower frame budget for low-end
QueOps.updateConfig({ maxOpsPerFrame: 64, maxFrameTimeMs: 12 });
*/