/**
 * js/core/config.js
 * Centralized configuration constants.
 */
export const config = {
    GRAV_CONST: 120,
    SPRING_K: 0.40,
    DAMPING: 1.0,
    SUBSTEPS: 8,
    PARTICLE_R: 9,
    BREAK_MULT: 2.8,
    PHYS_SCALE: 40,
    TENTECLEMAX: 18,
    get COLLISION_R() { return this.PARTICLE_R * 1.15; },
    get LOOSE_HIT_R() { return this.PARTICLE_R * 3.5; }
};

export const burntConfig = {
    BURN_ZONE_RADIUS_MULT: 4,
    BURNT_MELT_RATE_MULT: 2.5,
    BURNT_COHESION_RANGE: 80,
    BURNT_COHESION_STRENGTH: 0.15,
    BURNT_RED_LUMINANCE: 0.7,
    BURNT_MIN_HEAT_GLOW: 0.2
};