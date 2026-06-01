"use strict";

window.Sim = window.Sim || {};
const Sim = window.Sim;


Sim.config = {
  GRAV_CONST: 120,
  SPRING_K: 0.40,
  DAMPING: 1.0,
  SUBSTEPS: 8,
  PARTICLE_R: 9,
  BREAK_MULT: 2.8,
  PHYS_SCALE: 80,
  get COLLISION_R() { return this.PARTICLE_R * 1.15; },
  get LOOSE_HIT_R() { return this.PARTICLE_R * 3.5; }
};

// 🔥 NEW: Burnt particle configuration
Sim.burntConfig = {
  BURN_ZONE_RADIUS_MULT: 4,        // 4x burnRadius for burn zone
  BURNT_MELT_RATE_MULT: 2.5,       // 2.5x faster melt for burnt particles
  BURNT_COHESION_RANGE: 80,        // Pixel range for group attraction
  BURNT_COHESION_STRENGTH: 0.15,   // Soft influence factor
  BURNT_RED_LUMINANCE: 0.7,        // Red channel glow intensity
  BURNT_MIN_HEAT_GLOW: 0.2         // Minimum heat to show glow
};

Sim.state = {
  bodies: [],
  loose: [],
  flashes: [],
  stars: [],
  asteroids: [],
  astTimer: 0
};

// Solar prominence/tentacle animation storage
Sim.solarTentacles = [];

Sim.SUN = { x: 0, y: 0, radius: 180, burnRadius: 220, mass: 182784, coronaTime: 0 };

Sim.PALS = [
  { hi: "#ffeeaa", mid: "#ff8800", lo: "#5a1800", gc: "255,140,50" },
  { hi: "#cceeff", mid: "#0088ff", lo: "#001a44", gc: "60,180,255" },
  { hi: "#eeccff", mid: "#aa00ff", lo: "#1a0033", gc: "160,60,255" },
  { hi: "#aaffcc", mid: "#00cc66", lo: "#003322", gc: "40,200,120" },
  { hi: "#ffccee", mid: "#ff0077", lo: "#330011", gc: "255,60,140" },
  { hi: "#ffffaa", mid: "#ddcc00", lo: "#332200", gc: "220,200,60" },
];

Sim.AST_PALETTE = [
  { fill: "#9c8e7a", outline: "#6b5e50", dot: "#c4b49a" },
  { fill: "#7a8490", outline: "#505860", dot: "#a8b4bc" },
  { fill: "#9a8840", outline: "#605420", dot: "#d4c870" },
  { fill: "#6a8890", outline: "#384858", dot: "#90b8c0" }
];

Sim.sunGravMult = 1.0;
Sim.physSpeed = 1;
Sim.paused = false;
Sim.SPEED_MAX = 12;
Sim.RING_MIN_RADIUS = 10;
Sim.RING_PARTICLES = 10;
Sim.AST_SPAWN_INTERVAL = 600;
Sim.AST_MAX = 3;

