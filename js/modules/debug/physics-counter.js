/**
 * js/modules/debug/physics-counter.js
 *
 * Counts physics operations per frame.
 * All increments go through add() which is a no-op when debug is off.
 * Physics files (tick.js, collisions.js) call PhysicsCounter.add('key').
 * reset() is called once per rAF at the top of mainLoop via DebugRouter.resetAll().
 */

function _debugOn() {
  if (window._DebugRouter?.masterEnabled) return true;
  if (window._TuningLayer?._panels?.length > 0) return true;
  return false;
}

export const PhysicsCounter = {
  stats: {
    particlesIntegrated: 0,
    springsSolved:       0,
    collisionsResolved:  0,
    gravityChecks:       0,
    gravityGridSamples:  0,
    looseTicked:         0,
  },

  _labels: {
    particlesIntegrated: 'Particles',
    springsSolved:       'Springs',
    collisionsResolved:  'Collisions',
    gravityChecks:       'Gravity checks',
    gravityGridSamples:  'Grid samples',
    looseTicked:         'Loose bodies',
  },

  // BUG FIX: these two feed PhysicsGov.feedChaos() every frame (see
  // main.js — _phChaos reads them unconditionally, not just when debug is
  // open) to drive the AUTO substep count (4 → 16) that's supposed to
  // scale physics fidelity up during collision-heavy moments. Gating them
  // behind _debugOn() meant that adaptation silently never ran for any
  // real player — only while a developer happened to have the debug
  // console open. They must always count, in every game.
  _LIVE_KEYS: new Set(['collisionsResolved', 'springsSolved']),

  // add() — single increment point. Load-bearing keys (see _LIVE_KEYS)
  // always count; the rest are debug-display-only and stay gated by
  // masterEnabled so they cost nothing in a normal game.
  add(key, n = 1) {
    if (!this._LIVE_KEYS.has(key) && !_debugOn()) return;
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
