/**
 * js/core/state.js
 * Single source of truth for game state and constants.
 */
export const state = {
    bodies: [],
    loose: [],
    flashes: [],
    stars: [],
    asteroids: [],
    astTimer: 0
};

export const SUN = { x: 0, y: 0, radius: 240, burnRadius: 300, mass: 182784, coronaTime: 0 };
export const solarTentacles = [];

export const PALS = [
    { hi: "#ffeeaa", mid: "#ff8800", lo: "#5a1800", gc: "255,140,50" },
    { hi: "#cceeff", mid: "#0088ff", lo: "#001a44", gc: "60,180,255" },
    { hi: "#eeccff", mid: "#aa00ff", lo: "#1a0033", gc: "160,60,255" },
    { hi: "#aaffcc", mid: "#00cc66", lo: "#003322", gc: "40,200,120" },
    { hi: "#ffccee", mid: "#ff0077", lo: "#330011", gc: "255,60,140" },
    { hi: "#ffffaa", mid: "#ddcc00", lo: "#332200", gc: "220,200,60" }
];

export const AST_PALETTE = [
    { fill: "#9c8e7a", outline: "#6b5e50", dot: "#c4b49a" },
    { fill: "#7a8490", outline: "#505860", dot: "#a8b4bc" },
    { fill: "#9a8840", outline: "#605420", dot: "#d4c870" },
    { fill: "#6a8890", outline: "#384858", dot: "#90b8c0" }
];

export let sunGravMult = 1.0;
export let physSpeed = 1;
export let paused = false;

export const SPEED_MAX = 12;
export const RING_MIN_RADIUS = 10;
export const RING_PARTICLES = 10;
export const AST_SPAWN_INTERVAL = 600;
export const AST_MAX = 3;

export const setSunGravMult = (v) => { sunGravMult = v; };
export const setPhysSpeed = (v) => { physSpeed = v; };
export const togglePause = () => { 
    paused = !paused; 
    if (!paused && physSpeed === 0) physSpeed = 1; 
};