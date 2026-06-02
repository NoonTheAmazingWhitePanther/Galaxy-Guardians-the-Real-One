# 🌌 Galaxy Guardians: The Real One

> *"The Galaxy is at risk of constant Titans planting new Planets in the solar system. Spawn, manipulate, and defend the celestial order."*

[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5 Canvas](https://img.shields.io/badge/HTML5_Canvas-API-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=for-the-badge)](LICENSE)

An interactive, web-based 2D soft-body physics sandbox built entirely in vanilla JavaScript. Experience emergent orbital mechanics, dynamic thermal degradation, and mass-spring planetary destruction, all rendered smoothly via a custom dual-queue task scheduler.

---

## ✨ Core Features

- 🪐 **Soft-Body Planets**: Planets are constructed from mass-spring particle networks, allowing them to deform, wobble, and shatter under gravitational stress.
- ☀️ **Dynamic Solar System**: A living Sun with procedural granulation, solar flares, god rays, and a lethal burn zone that melts planets into glowing debris.
- ☄️ **Asteroid & Comet Events**: Randomized celestial bodies with ion/dust tails that interact dynamically with planetary gravity and collisions.
- ⚡ **Dual-Queue Performance Engine**: A custom `QueOps` / `QuoOpsEasy` task scheduler that automatically balances high-fidelity rendering with low-end device compatibility via frame-skipping, batching, and time-slicing.
- 🎨 **Glassmorphism UI**: A sleek, cyberpunk-inspired HUD with real-time physics tuning (gravity, damping, substeps).

---

## 🗺️ Proposed V2.0 Architecture (Domain-Driven)

To ensure scalability, maintainability, and the addition of advanced features (like dynamic theming), the project is migrating to a **Feature-Based / Domain-Driven** folder structure. 

```text
Galaxy-Guardians-the-Real-One/
│
├── 📄 index.html                  # Main entry point (loads modules & themes)
├── 📄 README.md                   # You are here!
├── 📄 LICENSE                     # GPL-3.0 License
│
├── 📁 css/                        # 🎨 All styling and visual themes
│   ├── base.css                   # Core resets, CSS variables, layout fundamentals
│   ├── 📁 themes/                 # Dynamic HUD and aesthetic overrides
│   │   ├── hud-default.css        # Current glassmorphism sci-fi look
│   │   ├── hud-retro.css          # 8-bit / CRT monitor aesthetic (Planned)
│   │   ├── 📁 seasons/            # Seasonal event overrides
│   │   │   ├── winter.css         # Snow particles, icy UI borders, blue tints
│   │   │   └── halloween.css      # Orange/purple UI, spooky cursor trails
│   │   └── 📁 prestige/           # Bonus moments / high-score rewards
│   │       └── golden-galaxy.css  # Gold accents, glowing borders, particle confetti
│
├── 📁 js/                         # ⚙️ All JavaScript logic
│   ├── main.js                    # The "Prime" bootstrapper. Initializes everything.
│   │
│   ├── 📁 core/                   # Foundational engine systems (no game logic)
│   │   ├── config.js              # Global constants and tunable physics values
│   │   ├── utils.js               # Math helpers (H.rnd, H.clamp, H.hypot, etc.)│   │   ├── id-registry.js         # Entity ID management
│   │   ├── que-ops.js             # High-end operation queue
│   │   └── quo-ops-easy.js        # Low-end operation queue (frame-skipping optimized)
│   │
│   ├── 📁 physics/                # 🌌 Movement, forces, and collisions
│   │   ├── engine.js              # Main tick, substeps, integration
│   │   ├── collisions.js          # Inter-body and loose particle collision logic
│   │   └── gravity.js             # Sun and planetary gravity calculations
│   │
│   ├── 📁 rendering/              # 🖌️ Everything related to drawing to the Canvas
│   │   ├── engine.js              # Main draw loop orchestration
│   │   ├── camera.js              # Viewport math, panning, zooming, screen-to-world
│   │   ├── sun.js                 # Sun halos, flares, granulation, god rays
│   │   ├── particles.js           # Loose debris, burnt particles, ring spawning
│   │   └── trails.js              # Off-screen buffer trail system
│   │
│   ├── 📁 entities/               # 🛸 Game objects and their specific behaviors
│   │   ├── bodies.js              # Planet creation, spring networks, hull generation
│   │   └── asteroids.js           # Comet spawning, tail rendering, rock physics
│   │
│   └── 📁 ui/                     # 🖱️ DOM manipulation, inputs, and overlays
│       ├── input.js               # Mouse, touch, keyboard, sliders
│       ├── debug.js               # Performance metrics panel
│       └── theme-manager.js       # JS logic to swap CSS classes for seasons/prestige
│
└── 📁 assets/                     # 📦 Future-proofing
    ├── fonts/                     # Custom "Space Mono" or sci-fi fonts
    ├── audio/                     # Ambient space drones, collision sounds
    └── icons/                     # SVG icons for UI buttons
```

---

## 📋 Development Roadmap & Todo List

The journey to V2.0 is tracked here. Help is always welcome!

### 🏗️ Phase 1: Architecture & Refactoring
- [x] Implement Dual-Queue System (`QueOps` + `QuoOpsEasy`) for dynamic performance scaling.
- [x] Extract heavy loops into optimized, batched, or frame-skipped queue operations.
- [ ] Migrate from global `window.Sim` namespace to ES6 Modules (`import`/`export`).
- [ ] Restructure flat `.js` files into the new Domain-Driven `js/` subfolders.
- [ ] Create a centralized `ThemeManager` in the `ui/` domain to handle CSS class swapping.

### 🎨 Phase 2: Visuals & Theming
- [ ] Extract all hardcoded UI colors in `index.html` to CSS Variables (`--ui-bg`, `--accent-color`).
- [ ] Create `css/themes/hud-retro.css` for a CRT/Scanline aesthetic.
- [ ] Implement `css/themes/seasons/winter.css` (adds subtle snow overlay and icy UI glow).
- [ ] Add a "Prestige Mode" unlock: `css/themes/prestige/golden-galaxy.css` triggered by surviving X minutes or reaching a particle count milestone.
- [ ] Optimize Canvas `save()`/`restore()` calls in the rendering pipeline.
### ⚛️ Phase 3: Physics & Entities
- [ ] Add planetary merging mechanics (when two soft-bodies collide at low velocity).
- [ ] Implement a spatial hashing grid for $O(1)$ loose-particle-to-planet collision detection.
- [ ] Add "Black Hole" entity type with negative mass / extreme gravity well.
- [ ] Improve comet AI to occasionally orbit and become temporary moons before destabilizing.

### 🚀 Phase 4: Polish & Performance
- [ ] Offload heavy physics substepping to a Web Worker for zero main-thread jank.
- [ ] Add procedural ambient audio (Web Audio API) that reacts to collision velocity and sun proximity.
- [ ] Implement a replay/save-state system (serialize `H.state` to JSON).
- [ ] Add mobile-specific virtual joystick improvements in `ui/input.js`.

---

## 🎮 How to Play

1. Clone the repository:
```bash
   git clone https://github.com/NoonTheAmazingWhitePanther/Galaxy-Guardians-the-Real-One.git
```
2. Open `index.html` in any modern web browser. *(No build step required!)*
3. **Left Click & Hold**: Charge and spawn a new planet.
4. **Scroll Wheel**: Zoom in/out.
5. **Right Click / Middle Click + Drag**: Pan the camera.
6. **F**: Frame all bodies to fit the screen.
7. **Spacebar**: Pause/Resume the simulation.
8. **Console Command**: Type `togglePerformanceMode()` in the browser console to instantly switch between High-End and Low-End rendering queues!

---

## 🤝 Contributing

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📜 License

Distributed under the **GNU General Public License v3.0**. See `LICENSE` for more information.

---
*Built with ❤️ and a lot of Math.hypot()*