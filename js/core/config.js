/**
 * js/core/config.js
 * Centralized configuration constants.
 *
 * FIXES (2026-06-13):
 * - PHYS_SCALE changed from 40 to 1.0 so physSpeed actually controls simulation speed
 *   (was causing accumulator to always hit MAX_STEPS cap, making speed bar a no-op)
 */
export const config = {
  GRAV_CONST: 120,
  SPRING_K: 0.40,
  DAMPING: 1.0,
  SUBSTEPS: 8,
  PARTICLE_R: 9,
  BREAK_MULT: 2.8,
  PHYS_SCALE: 1.0,  // Was 40 — caused speed bar to be a no-op due to MAX_STEPS cap
  TENTECLEMAX: 18,
  COLLISION_R_BASE_MULT: 1.15,
  get COLLISION_R() { return this.PARTICLE_R * (this.COLLISION_R_BASE_MULT || 1.15); },
  get LOOSE_HIT_R() { return this.PARTICLE_R * 3.5; },

  // Display
  RESOLUTION_MULT: 1.0,
  FPS_CAP: 60,
  FRAME_SKIPPING: 1,
  DAY_NIGHT_CYCLE: false,
  SHOW_STARS: true,
  SHOW_CORONA: true,
  SHOW_ORBITS: false,
  BLOOM_INTENSITY: 1.0,
  TRAIL_FADE: 0.5,
  GLOW_INTENSITY: 1.0,
  UI_OPACITY: 0.88,

  // Sound
  VOL_MASTER: 0.5,
  VOL_SFX: 0.7,
  VOL_MUSIC: 0.3,
  SFX_COLLISION: true,
  SFX_AMBIENT: true
};

export const burntConfig = {
  BURN_ZONE_RADIUS_MULT: 4,
  BURNT_MELT_RATE_MULT: 2.5,
  BURNT_COHESION_RANGE: 80,
  BURNT_COHESION_STRENGTH: 0.15,
  BURNT_RED_LUMINANCE: 0.7,
  BURNT_MIN_HEAT_GLOW: 0.2
};