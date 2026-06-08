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

A **browser-based 2D soft-body physics sandbox** built in **vanilla JavaScript** — no frameworks, no build step, no dependencies. Just a canvas, some math, and a galaxy to break.

This is both a **Game Engine** and a **Simulation Engine**. Flip a switch and go from arcade-style fun to hardcore orbital mechanics. Fake physics for play. Real physics for awe.

---

## 🎮 Fake Mode vs. Real Mode

| Fake Mode | Real Mode |
|-----------|-----------|
| Planets wobble like jelly | Planets wobble like jelly — but the math is *real* |
| Sun burns things because it looks cool | Sun burns things because the thermal model says so |
| Comets have pretty tails | Comets have ion tails shaped by solar wind approximations |
| Asteroids explode on impact | Asteroids shatter based on mass-spring stress thresholds |
| Fun first | Physics first — still fun |

> **One switch. Two engines. Your call.**

---

## ✨ What You Can Do

- 🪐 **Spawn Soft-Body Planets** — Click and hold to charge. Release to birth a world of springs and mass.
- ☀️ **Watch the Sun Destroy Them** — Procedural granulation, solar flares, god rays, and a lethal burn zone that melts planets into glowing debris.
- ☄️ **Trigger Asteroid & Comet Events** — Randomized celestial bodies with ion/dust tails that react to gravity and collide dynamically.
- ⚡ **Stress-Test the Performance Engine** — A custom dual-queue scheduler auto-balances high-fidelity rendering for beast PCs and frame‑skipped survival for low-end devices.
- 🎛️ **Tune Everything Live** — Glassmorphism HUD with real-time sliders for gravity, damping, substeps, and more.

---

## 📖 Educational JavaScript Traits (Just by Watching)

This repository is a **living textbook** of vanilla JS patterns. Open the code and you'll see:

- **Modular architecture** — ES6 modules split into tiny, single‑purpose files.
- **RequestAnimationFrame + fixed timestep** — decoupled render and physics loops.
- **Frame skipping** — when rendering falls behind, frames are dropped to catch up.
- **Physics skipping** — substeps adapt to maintain stability without killing performance.
- **Refresh rate skipping** — respects the browser's vsync but can uncap for high‑Hz displays.
- **SSD skipping** — not a typo: asset loading uses `requestIdleCallback` to avoid stuttering on slow drives.
- **Average‑of‑two smoothing** — every transform (position, rotation, spring force) averages the last two computed results, killing jitter naturally.
- **Fog & blur as smoothing** — visual noise is hidden by real‑time atmospheric fog and motion blur, making low‑frame‑rate moments feel cinematic.
- **Simulated A‑chip automation** — the engine mimics on‑device AI scheduling, ensuring continuous graphics even at **60 FPS** (the physical tick target).

All of this runs in **pure JS** — no WebGL, no WASM, just canvas 2D context and math.

---

## ⚙️ Performance Architecture — Why the Swiss Clock Looks Like a Solar Watch

> *"Makes the Swiss clock look like a solar watch."*

### The magic numbers

- **Physics tick rate** – locked at **60 Hz** (stable, deterministic)
- **Render frame rate** – **uncapped** (up to 3000+ FPS on fast hardware)
- **Frame skipping** – automatic when render > physics
- **Physics skipping** – automatic substeps when physics > render (rare)
- **Refresh rate skipping** – renders at monitor's max, but physics stays at 60
- **SSD skipping** – non‑blocking asset streaming

### The averaging trick

Every visual transform (position, scale, rotation, spring offset) is passed through a **two‑frame moving average**:

```js
// Simplified example from the codebase
let smoothed = (current + previous) / 2;