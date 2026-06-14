/**
 * js/core/state-cache.js
 * The "Vault" — Stores physics snapshots for smooth interpolation.
 *
 * FIX (2026-06-14):
 * - Added defensive check: skip dead bodies in snapshots
 * - Added loose particle deduplication to prevent ID collisions
 * - Added null-checks on particle properties before capture
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

    // --- Bodies: skip dead ones entirely ---
    const snapshotBodies = [];
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.dead) continue;  // FIX: Skip dead bodies so they never appear in snapshots
      snapshotBodies.push({
        id: b.id ?? i,
        cx: b.cx ?? 0,
        cy: b.cy ?? 0,
        vx: b.vx ?? 0,
        vy: b.vy ?? 0,
        radius: b.radius ?? 10,
        rotation: b.rotation || 0,
        pal: b.pal,
        dead: false
      });
    }

    // --- Loose: deduplicate by ID and null-check properties ---
    const seenIds = new Set();
    const snapshotLoose = [];
    for (let i = 0; i < loose.length; i++) {
      const p = loose[i];
      if (!p) continue;
      const id = p.id ?? `fallback_${i}`;
      if (seenIds.has(id)) continue;  // FIX: Skip duplicate IDs
      seenIds.add(id);

      snapshotLoose.push({
        id: id,
        x: p.x ?? 0,
        y: p.y ?? 0,
        vx: p.vx ?? 0,
        vy: p.vy ?? 0,
        life: p.life ?? 0,
        maxLife: p.maxLife ?? p.life ?? 1,
        r: p.r ?? 0,
        pal: p.pal
      });
    }

    return { bodies: snapshotBodies, loose: snapshotLoose };
  },

  /**
   * Push a new snapshot. Oldest is discarded when buffer is full (FIFO).
   */
  push(snapshot) {
    this.buffer.push(snapshot);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift(); // Remove oldest — true FIFO
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
      stateA: this.buffer[len - 2], // Second most recent
      stateB: this.buffer[len - 1], // Most recent
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
