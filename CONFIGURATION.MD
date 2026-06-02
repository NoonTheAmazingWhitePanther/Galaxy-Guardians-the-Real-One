# ⚙️ Galaxy Guardians 2.0: Architecture & Configuration

> **Status:** 🟡 Planning & Prototyping Phase  
> **Goal:** Extreme performance (Web Workers), strict modularity (Prime Functions), and zero-dependency Vanilla JS extensibility.

---

## 📜 Changelog & Evolution Tracker
*Use this section to document structural changes during planning/execution. Modularity in documentation ensures we never lose track of decisions.*

- **[2024-XX-XX] v2.0 Init**: Established baseline 2.0 architecture. Introduced "Prime Module" contract, Web Worker offloading strategy, and Entity Registry pattern.
- *(Add future changes here as we iterate...)*

---

## 🏛️ 1. Structural Comparison: Old vs. New

### ❌ The Old Structure (v1.x)
- **Flat Architecture**: All logic dumped into a few massive files (`rendering.js`, `physics.js`).
- **Global State Pollution**: Heavy reliance on `window.Sim` and `window.H`, causing tight coupling.
- **Main Thread Bottleneck**: Physics, collision detection, and rendering all fought for the same 16ms frame budget.
- **Hardcoded Entities**: Adding a new body type required modifying core loops in multiple files.

### ✅ The New Structure (v2.0)
- **Domain-Driven & Modular**: Each system is a self-contained "Prime Module" with its own lifecycle.
- **Web Worker Offloading**: Heavy math (physics, collisions, pathfinding) runs in isolated threads.
- **Message-Passing Queue**: `que-ops.js` evolves to manage *Worker Tasks*, not just main-thread functions.
- **Registry Pattern**: New entities (planets, clusters, vectors) are "dropped in" via a central registry without touching core engine code.

```text
galaxy-guardians-2.0/
│
├── 📄 configuration.md        # THIS FILE: The single source of truth
├── 📄 index.html              # Minimal entry point, loads ES6 modules
│
├── 📁 core/                   # 🧠 The Engine (Vanilla, No Game Logic)
│   ├── engine.js              # Main loop, Worker manager, Render loop
│   ├── queue.js               # Unified QueOps (handles Main Thread + Worker tasks)
│   ├── registry.js            # Entity & Asset Registry (Drop-in extensibility)
│   └── math.js                # Pure, static math utilities (Worker-safe)
│
├── 📁 workers/                # ⚡ Isolated Threads (Self-Cleaning)
│   ├── physics.worker.js      # Handles integration, springs, gravity
│   ├── collision.worker.js    # Handles spatial hashing & inter-body collisions
│   └── pathfinding.worker.js  # Handles orbit previews & asteroid trajectories
│
├── 📁 modules/                # 🧩 Prime Functions (Standalone, Customizable)
│   ├── sun/
│   │   ├── sun.module.js      # Prime: init, tick(worker), render(main)
│   ├── bodies/│   │   ├── planet.module.js   # Prime: Generates spring-mass bodies
│   │   └── cluster.module.js  # Prime: Drop-in vector/JSON cluster generator
│   └── effects/
│       ├── particles.module.js
│       └── trails.module.js
│
└── 📁 assets/                 # 📦 Drop-in Extensibility
    ├── entities/              # JSON/Vector definitions for new body types
    └── textures/              # Optional sprite overrides
```

---

## 📐 2. The "Prime Module" Contract

Every new feature or entity in 2.0 must be a **Prime Module**. This means it is standalone, customizable, and follows a strict lifecycle. It does *not* rely on global variables; it receives what it needs and returns what it produces.

A Prime Module must export the following interface:

```javascript
// Example: planet.module.js
export const PlanetModule = {
  // 1. SETUP: Called once on initialization
  init: (config, registry) => {
    // Setup internal state, register entity types
  },

  // 2. WORKER TICK (Optional): Pure logic, NO DOM/Canvas access
  // Receives state, returns mutated state or actions
  workerTick: (dt, entities, config) => {
    // Calculate physics, return updated positions/velocities
    return updatedEntities; 
  },

  // 3. MAIN THREAD TICK: Syncs worker results, handles input
  tick: (dt, state) => {
    // Apply worker results, handle local main-thread logic
  },

  // 4. RENDER: Pure Canvas drawing, NO logic calculations
  render: (ctx, state, camera) => {
    // Draw the entity based on current state
  },

  // 5. CLEANUP: Self-cleaning to prevent memory leaks
  destroy: () => {
    // Revoke URLs, clear intervals, nullify references
  }
};
```
---

## ⚡ 3. Web Worker + Queue Integration Strategy

The new `queue.js` (evolution of `que-ops.js` / `que-ops-easy.js`) will act as the **Traffic Controller** between the Main Thread and Web Workers.

Instead of just queuing a function, we queue **Tasks**:

```javascript
// Main Thread: Offload heavy physics to the worker
Queue.add({
  id: 'physics-tick-1042',
  type: 'WORKER',
  worker: 'physics.worker.js',
  priority: 1,
  payload: { dt: 0.016, entities: currentEntities, config: physicsConfig },
  onComplete: (result) => {
    // Worker finished! Sync the results back to main thread state
    state.entities = result.updatedEntities;
  },
  onError: (err) => console.error('Worker failed', err)
});
```

**Worker Self-Cleaning Rule**:  
Workers must *never* hold onto references longer than the task.  
`self.onmessage = (e) => { const result = process(e.data); self.postMessage(result); /* Let GC clean e.data */ };`

---

## 🧩 4. Extensibility: The "Drop-In" Rule

To add a new physical polygon body or spring cluster, you should **never** edit `engine.js` or `queue.js`. 

Instead, you create a new file (e.g., `modules/bodies/ice-cluster.module.js`) and register it:

```javascript
import { Registry } from '../core/registry.js';
import { IceClusterModule } from './ice-cluster.module.js';

// The engine now knows about "ice_cluster" automatically
Registry.registerEntity('ice_cluster', IceClusterModule);
```
*Future Goal: Load this dynamically from an `assets/entities/ice_cluster.json` file at runtime.*

---

## 🚀 5. Next Steps for Execution
1. **Approve this Configuration**: Review this `configuration.md`. Does the "Prime Module" contract make sense? 
2. **Build the Core**: We will write the new `core/queue.js` (with Worker support) and `core/registry.js`.
3. **Migrate One Module**: We will pick *one* system (e.g., Physics or Sun Rendering) and rewrite it as a true 2.0 Prime Module with Web Worker support to prove the concept.