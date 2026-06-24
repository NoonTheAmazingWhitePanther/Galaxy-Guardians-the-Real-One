/**
 * js/modules/debug/physics-counter.js
 * Pure data counter for physics operations.
 * Increments are no-ops when DebugRouter.masterEnabled is false.
 */

function _debugOn() {
  return window._DebugRouter?.masterEnabled ?? true;
}

export const PhysicsCounter = {
  stats: {
    particlesIntegrated: 0,
    springsSolved: 0,
    collisionsResolved: 0,
    gravityChecks: 0,
    looseTicked: 0,
  },

  _labels: {
    particlesIntegrated: 'Particles',
    springsSolved: 'Springs',
    collisionsResolved: 'Collisions',
    gravityChecks: 'Gravity',
    looseTicked: 'Loose',
  },

  // Convenience increment helpers — free when debug is off
  add(key, n = 1) {
    if (_debugOn()) this.stats[key] = (this.stats[key] ?? 0) + n;
  },

  reset() {
    for (const key in this.stats) this.stats[key] = 0;
  }
};