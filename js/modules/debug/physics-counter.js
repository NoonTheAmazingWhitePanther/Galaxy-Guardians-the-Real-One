/**
 * js/modules/debug/physics-counter.js
 * Pure data counter for physics operations.
 */
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
  
  reset() {
    for (const key in this.stats) this.stats[key] = 0;
  }
};