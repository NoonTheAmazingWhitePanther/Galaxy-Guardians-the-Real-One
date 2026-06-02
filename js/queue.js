/**
 * core/queue.js
 * Galaxy Guardians 2.0 - Unified Task & Worker Queue
 * 
 * Features:
 * - Seamless Main Thread / Web Worker routing
 * - Strict frame-time budgeting (prevents jank)
 * - Self-cleaning worker payloads (prevents memory leaks)
 * - Priority-based execution
 */

export const Queue = {
  // ── State ──────────────────────────────────────────────────────────────
  workers: new Map(),    // Registered web workers
  queue: [],             // Pending tasks
  config: {
    maxMainOpsPerFrame: 64,   // Soft limit for main thread ops
    maxFrameTimeMs: 8,        // Hard time limit per frame (prevents jank)
    enableStagger: true       // Allow deferring low-priority tasks
  },
  stats: { 
    processed: 0, 
    deferred: 0, 
    workerPending: 0 
  },

  // ── 1. INITIALIZATION ──────────────────────────────────────────────────
  init(userConfig = {}) {
    Object.assign(this.config, userConfig);
    console.log(`[Queue 2.0] Initialized | Max Time: ${this.config.maxFrameTimeMs}ms`);
  },

  // ── 2. WORKER REGISTRATION ─────────────────────────────────────────────
  /**
   * Registers a Web Worker and sets up the self-cleaning message listener.
   * @param {string} name - Identifier (e.g., 'physics', 'collision')
   * @param {Worker} workerInstance - The actual new Worker('path.js')
   */
  registerWorker(name, workerInstance) {
    this.workers.set(name, {
      instance: workerInstance,
      pendingTasks: new Map(), // Tracks in-flight tasks for callback resolution
      taskIdCounter: 0
    });

    // SELF-CLEANING MESSAGE HANDLER
    workerInstance.onmessage = (e) => this._handleWorkerMessage(name, e.data);
    workerInstance.onerror = (err) => console.error(`[Queue] Worker '${name}' error:`, err);
    
    console.log(`[Queue 2.0] Registered Worker: ${name}`);  },

  // ── 3. TASK ADDITION ───────────────────────────────────────────────────
  /**
   * Adds a task to the queue.
   * @param {Object} task 
   *   - id: string (auto-generated if missing)
   *   - type: 'main' | 'worker'
   *   - workerName: string (required if type === 'worker')
   *   - priority: number (lower = higher priority, default 5)
   *   - cost: number (estimated budget cost, default 1)
   *   - fn: Function (for 'main' type)
   *   - args: Array (for 'main' type)
   *   - payload: Any (for 'worker' type, MUST be structured cloneable)
   *   - onComplete: Function(result)
   *   - onError: Function(error)
   */
  add(task) {
    if (!task.id) task.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    if (task.priority === undefined) task.priority = 5;
    if (task.cost === undefined) task.cost = 1;
    
    this.queue.push(task);
    this._sortQueue();
  },

  // ── 4. MAIN TICK (The Engine Heartbeat) ────────────────────────────────
  tick(dt) {
    this.stats.processed = 0;
    this.stats.deferred = 0;
    const frameStart = performance.now();
    const deferred = [];

    for (const task of this.queue) {
      // 1. Hard Time Budget Check (Prevents frame drops)
      if (performance.now() - frameStart > this.config.maxFrameTimeMs) {
        deferred.push(task);
        this.stats.deferred++;
        continue;
      }

      // 2. Route Task
      if (task.type === 'worker') {
        this._dispatchWorkerTask(task);
        this.stats.processed++;
      } else {
        // Main thread execution
        try {
          if (typeof task.fn === 'function') {
            task.fn(...(task.args || []));          }
          this.stats.processed++;
          if (task.onComplete) task.onComplete();
        } catch (err) {
          console.error(`[Queue] Main task [${task.id}] failed:`, err);
          if (task.onError) task.onError(err);
        }
      }
    }

    // Rebuild queue with deferred items, sorted by priority
    this.queue = deferred
    this._sortQueue();
    
    return this.stats;
  },

  // ── 5. INTERNAL: Worker Dispatch ───────────────────────────────────────
  _dispatchWorkerTask(task) {
    const workerReg = this.workers.get(task.workerName);
    
    // Fallback: If worker isn't ready, gracefully degrade to main thread (or skip)
    if (!workerReg) {
      console.warn(`[Queue] Worker '${task.workerName}' not found. Skipping.`);
      if (task.onError) task.onError(new Error('Worker unavailable'));
      return;
    }

    const taskId = ++workerReg.taskIdCounter;
    workerReg.pendingTasks.set(taskId, task);
    
    // Send ONLY the payload to the worker (self-cleaning: main thread drops reference after this)
    workerReg.instance.postMessage({ taskId, payload: task.payload });
    this.stats.workerPending++;
  },

  // ── 6. INTERNAL: Worker Response (Self-Cleaning) ───────────────────────
  _handleWorkerMessage(workerName, data) {
    const { taskId, result, error } = data;
    const workerReg = this.workers.get(workerName);
    if (!workerReg) return;

    const task = workerReg.pendingTasks.get(taskId);
    if (task) {
      // SELF-CLEANING: Immediately remove from pending map so GC can reclaim memory
      workerReg.pendingTasks.delete(taskId);
      this.stats.workerPending--;

      if (error) {
        if (task.onError) task.onError(error);      } else {
        if (task.onComplete) task.onComplete(result);
      }
    }
  },

  // ── 7. UTILITIES ───────────────────────────────────────────────────────
  _sortQueue() {
    // Sort by priority (ascending), then by cost (descending, to do heavy stuff first if time allows)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.cost - a.cost;
7    });
  },

  flush() {
    this.queue = [];
    // Clear pending worker tasks to prevent orphaned callbacks
    for (const reg of this.workers.values()) {
      reg.pendingTasks.clear();
    }
    this.stats.workerPending = 0;
    console.log('[Queue 2.0] Flushed');
  },

  terminateAllWorkers() {
    for (const [name, reg] of this.workers.entries()) {
      reg.instance.terminate();
      console.log(`[Queue 2.0] Terminated Worker: ${name}`);
    }
    this.workers.clear();
  }
};