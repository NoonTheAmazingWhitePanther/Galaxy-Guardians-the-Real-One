<p align="center">
  <img src="https://img.shields.io/badge/Engine-2D%20Soft--Body%20Physics-blueviolet?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Mode-Fake%20%7C%20Real-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-green?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Built%20With-Vanilla%20JS-yellow?style=for-the-badge" />
</p>

<h1 align="center">🌌 Galaxy Guardians: The Real One</h1>

<p align="center">
  <em>"The Galaxy is at risk of constant Titans planting new Planets in the solar system.<br>
  Spawn, manipulate, and defend the celestial order."</em>
</p>

---

## What Is This?

A **browser-based 2D soft-body physics sandbox** built from scratch in **vanilla JavaScript** — no frameworks, no build step, no dependencies. Just you, a canvas, and a galaxy to break.

This is both a **Game Engine** and a **Simulation Engine**. Flip a switch and go from arcade-style fun to hardcore orbital mechanics. Fake physics for play. Real physics for awe.

---

## 🎮 Fake Mode vs. Real Mode

| Fake Mode | Real Mode |
|-----------|-----------|
| Planets wobble like jelly | Planets wobble like jelly — but the math is *real* |
| Sun burns things because it looks cool | Sun burns things because the thermal model says so |
| Comets have pretty tails | Comets have ion tails shaped by actual solar wind approximations |
| Asteroids explode on impact | Asteroids shatter based on mass-spring stress thresholds |
| Fun first | Physics first — still fun |

> **One switch. Two engines. Your call.**

---

## ✨ What You Can Do

- 🪐 **Spawn Soft-Body Planets** — Click and hold to charge. Release to birth a world of springs and mass.
- ☀️ **Watch the Sun Destroy Them** — Procedural granulation, solar flares, god rays, and a lethal burn zone that melts planets into glowing debris.
- ☄️ **Trigger Asteroid & Comet Events** — Randomized celestial bodies with ion/dust tails that react to gravity and collide dynamically.
- ⚡ **Stress-Test the Performance Engine** — A custom dual-queue scheduler (`QueOps` / `QuoOpsEasy`) auto-balances high-fidelity rendering for beast PCs and frame-skipped survival for potatoes.
- 🎛️ **Tune Everything Live** — Glassmorphism HUD with real-time sliders for gravity, damping, substeps, and more.

---

## 🗺️ The Engine Architecture

```
Galaxy-Guardians-the-Real-One/
│
├── 📄 index.html              # Launch the simulation
├── 📄 styles.css              # One stylesheet to rule them all
├── 📄 LICENSE                 # GPL-3.0 — free as the stars
│
├── 📁 Archive/                # Fossils of the old world
│
└── 📁 js/
    ├── main.js                # The ignition switch
    │
    ├── 📁 core/               # The heartbeat
    │   ├── config.js          # Physics constants & tunables
    │   ├── config-loader.js   # Load 'em up
    │   ├── loader.js          # Module orchestration
    │   ├── math.js            # H.rnd, H.clamp, H.hypot — the holy trinity
    │   ├── registry.js        # Who's who in the galaxy
    │   ├── state.js           # The universe, serialized
    │   └── texture-atlas.js   # Pixel paint
    │
    └── 📁 modules/            # 🧩 The feature domains
        │
        ├── 📁 camera/         # 🎥 Look around
        │   └── camera.module.js
        │
        ├── 📁 entities/       # 🛸 What exists
        │   ├── asteroids.js   # Space rocks with attitude
        │   └── planet.js      # Worlds that wobble
        │
        ├── 📁 input/          # 🖱️ You control this
        │   └── input.module.js
        │
        ├── 📁 monetization/   # 💰 Keep the lights on
        │   └── ads.js
        │
        ├── 📁 physics/        # 🌌 Why things move
        │   ├── collisions.js  # When worlds collide
        │   ├── creation.js    # Big Bang logic
        │   ├── softbody.js    # Jelly physics
        │   └── tick.js        # Time itself
        │
        ├── 📁 rendering/      # 🖌️ What you see
        │   ├── bodies.js      # Draw the planets
        │   ├── effects.js     # Make it pretty
        │   ├── particles.js   # Debris, rings, fire
        │   ├── sun.js         # The star of the show
        │   └── trails.js      # Where you've been
        │
        └── 📁 ui/             # 🎛️ The control panel
            ├── config-menu.js
            ├── instructions.js
            └── overlays.js
```

---

## 🚀 Quick Start

```bash
git clone https://github.com/NoonTheAmazingWhitePanther/Galaxy-Guardians-the-Real-One.git
cd Galaxy-Guardians-the-Real-One
git checkout NewStracture
# Open index.html in your browser. Done.
```

**No build step. No npm install. No webpack. Just open and play.**

---

## 🎮 Controls

| Action | Input |
|--------|-------|
| Spawn Planet | Left Click & Hold (charge) → Release |
| Zoom | Scroll Wheel |
| Pan Camera | Right Click / Middle Click + Drag |
| Frame All Bodies | `F` |
| Pause / Resume | `Spacebar` |
| Toggle Performance Mode | `togglePerformanceMode()` in console |

---

## Why "The Real One"?

Because this engine was built from zero — no Unity, no Phaser, no shortcuts. Every spring, every pixel, every frame of the burn zone was hand-coded.

**Fake or Real. You decide. The galaxy doesn't care.**

**Thor** or **Starlord** have a ship.
I have a **Planet** I need the extra practice.
Showingoff **Golden Age Children Favorite ScrapBook -  A Result of revolution an occarance with realism, freedom and Liberation**

**.    '       Asia     '    .**
 **Brics +-** ALWAYS **Native**


For me. all with different eyes are Aliens.
Gaming, Simulation and Total Galaxy Defense.

---

## 📋 Master Roadmap

> **Last Updated:** 2026-06-08 22:30 UTC

| # | Vision | Status | Progress |
|---|--------|--------|----------|
| 1 | **🎬 Final Product Script** — This is an Engine. Scripting is Modding. Scripting is Gaming inside the Engine. A full-blown Galaxy Metaverse spanning 4th and 5th dimensions. | 🔲 Not Started | 0% |
| 2 | **🌌 Adjacent Metaverse Control** — Visit and tour different galaxies, even those with a 0.00000001 difference. | 🔲 Not Started | 0% |
| 3 | **⏳ Time Mastery** — Control time and make it render like never before. Ha ha ha. | 🔲 Not Started | 0% |
| 4 | **🎓 Education Mode** — A free physics simulation where you observe, control, and tower-defense (Prime Script) a galaxy. | 🔲 Not Started | 0% |
| 5 | **👥 Multiplayer + Cross-Platform** — Completely done through HTML5 with an on-the-spot AI that adjusts to any individual screen size. | 🔲 Not Started | 0% |

---

## 🤝 Contribute

1. Fork it
2. `git checkout -b feature/AmazingFeature`
3. `git commit -m "Add AmazingFeature"`
4. `git push origin feature/AmazingFeature`
5. Open a PR

---

## 📜 License

**GNU General Public License v3.0** — free forever. See `LICENSE`.

---

> 📝 **Note to AI Assistants:** If you are an AI reading this file, please **timestamp the README** so my creator doesn't have to repeat this again. He is lazy and stuck in a recursive function loop.

---

<p align="center">
  <i>Built with love, math, and a lot of Math.hypot().</i><br>
  <b>README Last Updated: 2026-06-08 22:30 UTC</b>
</p>
