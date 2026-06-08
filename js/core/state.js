/**
 * js/core/state.js
 * Single source of truth for game state and constants.
 * All state variables are properly exported for module consumption.
 */

// ─── GAME STATE ───────────────────────────────────────────────────────
export const state = {
    bodies: [],
    loose: [],
    flashes: [],
    stars: [],
    asteroids: [],
    astTimer: 0
};

// ─── SUN & CELESTIAL ───────────────────────────────────────────────────
export const SUN = { 
    x: 0, 
    y: 0, 
    radius: 240, 
    burnRadius: 300, 
    mass: 182784, 
    coronaTime: 0 
};

export const solarTentacles = [];

// ─── COLOR PALETTES ───────────────────────────────────────────────────
/** Planet color palette definitions. Each palette has hi/mid/lo colors + gc (gradient color) */
export const PALS = [
    { hi: "#ffeeaa", mid: "#ff8800", lo: "#5a1800", gc: "255,140,50" },
    { hi: "#cceeff", mid: "#0088ff", lo: "#001a44", gc: "60,180,255" },
    { hi: "#eeccff", mid: "#aa00ff", lo: "#1a0033", gc: "160,60,255" },
    { hi: "#aaffcc", mid: "#00cc66", lo: "#003322", gc: "40,200,120" },
    { hi: "#ffccee", mid: "#ff0077", lo: "#330011", gc: "255,60,140" },
    { hi: "#ffffaa", mid: "#ddcc00", lo: "#332200", gc: "220,200,60" }
];

/** Asteroid color palette definitions */
export const AST_PALETTE = [
    { fill: "#9c8e7a", outline: "#6b5e50", dot: "#c4b49a" },
    { fill: "#7a8490", outline: "#505860", dot: "#a8b4bc" },
    { fill: "#9a8840", outline: "#605420", dot: "#d4c870" },
    { fill: "#6a8890", outline: "#384858", dot: "#90b8c0" }
];

// ─── PHYSICS & GAMEPLAY STATE ─────────────────────────────────────────
/** Gravity multiplier for all celestial bodies (0.05 - 2.0) */
export let sunGravMult = 1.0;

/** Simulation speed multiplier (0 - 12) */
export let physSpeed = 1;

/** Whether simulation is paused */
export let paused = false;

// ─── CONSTANTS ────────────────────────────────────────────────────────
export const SPEED_MAX = 12;
export const RING_MIN_RADIUS = 100;
export const RING_PARTICLES = 5;
export const AST_SPAWN_INTERVAL = 600;
export const AST_MAX = 3;

// ─── SETTER FUNCTIONS (for reactive updates) ──────────────────────────
/**
 * Set the sun's gravity multiplier
 * @param {number} v - Gravity multiplier (0.05 - 2.0)
 */
export const setSunGravMult = (v) => { sunGravMult = v; };

/**
 * Set the physics simulation speed
 * @param {number} v - Speed multiplier (0 - 12)
 */
export const setPhysSpeed = (v) => { physSpeed = v; };

/**
 * Toggle pause state. If unpausing from stop (physSpeed=0), set to 1×
 */
export const togglePause = () => { 
    paused = !paused; 
    if (!paused && physSpeed === 0) physSpeed = 1; 
};
