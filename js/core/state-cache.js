/**
 * js/core/state-cache.js
 * The "Vault" — Stores physics snapshots for smooth interpolation.
 *
 * CORRECTED (2026-06-13):
 * - Simplified: always reads the last 2 snapshots (most recent)
 * - No read/write index synchronization issues
 * - Works correctly at any physics speed (1x, 2x, 4x, 8x, 12x)
 * - FIFO: oldest snapshots are discarded when buffer is full
 * - Stable IDs for reliable body matching in TweenRenderer
 */
export const StateCache = {
  buffer: [],
  maxSize: 48,

  /**
   * Capture a snapshot of the current physics state.
   * Uses stable IDs (index fallback) instead of Math.random()
   * so TweenRenderer can reliably match bodies between frames.
   */
  captureSnapshot(bodies, loose) {
    // Fast path: empty universe
    if (bodies.length === 0 && loose.length === 0) {
      return { bodies: [], loose: [] };
    }

    const snapshotBodies = new Array(bodies.length);
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      snapshotBodies[i] = {
        id: b.id ?? i,        // Stable fallback: use array index
        cx: b.cx,
        cy: b.cy,
        vx: b.vx,
        vy: b.vy,
        radius: b.radius,
        rotation: b.rotation || 0,
        pal: b.pal,
        dead: b.dead
      };
    }

    const snapshotLoose = new Array(loose.length);
    for (let i = 0; i < loose.length; i++) {
      const p = loose[i];
      snapshotLoose[i] = {
        id: p.id ?? i,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        life: p.life,
        maxLife: p.maxLife,
        r: p.r,
        pal: p.pal
      };
    }

    return { bodies: snapshotBodies, loose: snapshotLoose };
  },

  /**
   * Push a new snapshot. Oldest is discarded when buffer is full (FIFO).
   */
  push(snapshot) {
    this.buffer.push(snapshot);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();  // Remove oldest — true FIFO
    }
  },

  /**
   * Get the last 2 snapshots for interpolation.
   * stateA = second most recent (the "before" state)
   * stateB = most recent (the "after" state)
   * alpha = 0..1, how far between stateA and stateB to render
   */
  getInterpolationData(alpha) {
    if (this.buffer.length < 2) return null;
    const len = this.buffer.length;
    return {
      stateA: this.buffer[len - 2],  // Second most recent
      stateB: this.buffer[len - 1],  // Most recent
      alpha: alpha
    };
  },

  /**
   * Clear all snapshots. Called on reset.
   */
  clear() {
    this.buffer = [];
  }
};