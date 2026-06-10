/**
 * js/core/state.js
 * Single source of truth for ALL game state.
 * FULL FILE - COPY AND PASTE THIS ENTIRE BLOCK
 */

// ─── 1. THE MASTER STATE OBJECT ─────────────────────────────────────────────
export const state = {
    // Entity arrays
    bodies: [],
    loose: [],
    flashes: [],
    stars: [],
    asteroids: [],
    astTimer: 0,
    
    // Physics & Gameplay (Consolidated here for the new main.js)
    physSpeed: 1,
    paused: false,
    sunGravMult: 1.0,

    // Screen Shake Juice
    shake: { intensity: 0, decay: 0.9 } 
};

// ─── 2. THE SUN ─────────────────────────────────────────────────────────────
export const SUN = {
    x: 0, y: 0, radius: 240, burnRadius: 300, mass: 182784, coronaTime: 0
};

// ─── 3. SOLAR EFFECTS ───────────────────────────────────────────────────────
export const solarTentacles = [];

// ─── 4. COLOR PALETTES ──────────────────────────────────────────────────────
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

// ─── 5. CONSTANTS ───────────────────────────────────────────────────────────
export const SPEED_MAX = 12;
export const RING_MIN_RADIUS = 0;
export const RING_PARTICLES = 0;
export const AST_SPAWN_INTERVAL = 600;
export const AST_MAX = 3;

// ─── 6. STATE MUTATORS (Used by UI, Input, and Config modules) ──────────────
export const setSunGravMult = (v) => { 
    state.sunGravMult = v; 
    sunGravMult = v; // Sync standalone export
};

export const setPhysSpeed = (v) => { 
    state.physSpeed = v; 
    physSpeed = v; // Sync standalone export
};

export const togglePause = () => {
    state.paused = !state.paused;
    paused = state.paused; // Sync standalone export
    if (!state.paused && state.physSpeed === 0) {
        state.physSpeed = 1;
        physSpeed = 1;
    }
};

// Helper for screen shake (call this from collisions.js or creation.js)
export const triggerShake = (force) => {
    state.shake.intensity = Math.min(25, state.shake.intensity + force);
};

// ─── 7. BACKWARDS COMPATIBILITY EXPORTS ─────────────────────────────────────
// 🔥 THIS PREVENTS CRASHES! 
// These create standalone variables that sync with the 'state' object.
// If your tick.js or config-menu.js imports 'paused' directly, it will still work!
export let paused = state.paused;
export let physSpeed = state.physSpeed;
export let sunGravMult = state.sunGravMult;