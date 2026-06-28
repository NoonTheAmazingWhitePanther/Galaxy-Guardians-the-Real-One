/**
 * js/modules/debug/physics-counter.js
 *
 * Counts physics operations per frame.
 * All increments go through add() which is a no-op when debug is off.
 * Physics files (tick.js, collisions.js) call PhysicsCounter.add('key').
 * reset() is called once per rAF at the top of mainLoop via DebugRouter.resetAll().
 */

function _debugOn() {
  return window._DebugRouter?.masterEnabled ?? true;
}

export const PhysicsCounter = {
  stats: {
    particlesIntegrated: 0,
    springsSolved:       0,
    collisionsResolved:  0,
    gravityChecks:       0,
    looseTicked:         0,
  },

  _labels: {
    particlesIntegrated: 'Particles',
    springsSolved:       'Springs',
    collisionsResolved:  'Collisions',
    gravityChecks:       'Gravity checks',
    looseTicked:         'Loose bodies',
  },

  // add() — single increment point, gated by masterEnabled
  add(key, n = 1) {
    if (!_debugOn()) return;
    if (this.stats[key] !== undefined) this.stats[key] += n;
  },

  // total — sum of all stat values, used by panel header
  get total() {
    let t = 0;
    for (const v of Object.values(this.stats)) t += v;
    return t;
  },

  reset() {
    for (const key in this.stats) this.stats[key] = 0;
  }
};

export default PhysicsCounter;
