"use strict";

// ════════════════════════════════════════════════════════════════════════════════
// CONFIG.JS - Central Configuration & State Management
// ════════════════════════════════════════════════════════════════════════════════
// Purpose: Define all game constants, initial state, and game object definitions.
// All files reference Sim.config and Sim.state through the window.Sim namespace.
// ════════════════════════════════��═══════════════════════════════════════════════

window.Sim = window.Sim || {};
const Sim = window.Sim;

// ──────────────────────────────────────────────────────────────────────────────
// Physics Configuration - Controls simulation behavior
// ──────────────────────────────────────────────────────────────────────────────
Sim.config = {
  GRAV_CONST: 120,                          // Gravitational constant multiplier
  SPRING_K: 0.40,                           // Spring stiffness for planet structure
  DAMPING: 1.0,                             // Velocity damping factor
  SUBSTEPS: 8,                              // Physics substeps per frame for accuracy
  PARTICLE_R: 2.8,                          // Particle radius size
  BREAK_MULT: 2.8,                          // Spring break threshold multiplier
  PHYS_SCALE: 60,                           // Physics time scale factor
  get COLLISION_R() { return this.PARTICLE_R * 1.15; },        // Collision radius (derived)
  get LOOSE_HIT_R() { return this.PARTICLE_R * 3.5; }          // Loose particle hit radius (derived)
};

// ──────────────────────────────────────────────────────────────────────────────
// Game State - Dynamic runtime data
// ──────────────────────────────────────────────────────────────────────────────
Sim.state = {
  bodies: [],              // Array of planet/body objects with particles and springs
  loose: [],               // Array of debris/loose particles flying through space
  flashes: [],             // Visual flash effects (explosions, impacts)
  stars: [],               // Background star data
  asteroids: [],           // Incoming asteroids/comets
  astTimer: 0              // Counter for asteroid spawn timing
};

// ──────────────────────────────────────────────────────────────────────────────
// Visual Assets - Color palettes for planets and asteroids
// ──────────────────────────────────────────────────────────────────────────────
Sim.PALS = [
  { hi: "#ffeeaa", mid: "#ff8800", lo: "#5a1800", gc: "255,140,50" },   // Orange
  { hi: "#cceeff", mid: "#0088ff", lo: "#001a44", gc: "60,180,255" },   // Blue
  { hi: "#eeccff", mid: "#aa00ff", lo: "#1a0033", gc: "160,60,255" },   // Purple
  { hi: "#aaffcc", mid: "#00cc66", lo: "#003322", gc: "40,200,120" },   // Green
  { hi: "#ffccee", mid: "#ff0077", lo: "#330011", gc: "255,60,140" },   // Pink
  { hi: "#ffffaa", mid: "#ddcc00", lo: "#332200", gc: "220,200,60" }    // Yellow
];

Sim.AST_PALETTE = [
  { fill: "#9c8e7a", outline: "#6b5e50", dot: "#c4b49a" },   // Rock brown
  { fill: "#7a8490", outline: "#505860", dot: "#a8b4bc" },   // Steel gray
  { fill: "#9a8840", outline: "#605420", dot: "#d4c870" },   // Dust gold
  { fill: "#6a8890", outline: "#384858", dot: "#90b8c0" }    // Ice blue
];

// ──────────────────────────────────────────────────────────────────────────────
// Solar System & Gameplay Parameters
// ──────────────────────────────────────────────────────────────────────────────
Sim.solarTentacles = [];                    // Solar prominence animation data

Sim.SUN = {
  x: 0, y: 0,                               // Center of the solar system
  radius: 180,                              // Visual radius
  burnRadius: 220,                          // Destruction radius
  mass: 182784,                             // Gravitational mass
  coronaTime: 0                             // Animation timer for corona effects
};

Sim.sunGravMult = 1.0;                      // Gravity multiplier (user-adjustable)
Sim.physSpeed = 1;                          // Physics time scale (1.0 = normal speed)
Sim.paused = false;                         // Simulation paused flag
Sim.SPEED_MAX = 8;                          // Maximum physics speed multiplier

Sim.RING_MIN_RADIUS = 40;                   // Minimum planet radius to spawn ring on destruction
Sim.RING_PARTICLES = 80;                    // Number of particles in destruction ring

Sim.AST_SPAWN_INTERVAL = 600;               // Ticks between asteroid spawns
Sim.AST_MAX = 6;                            // Maximum concurrent asteroids
