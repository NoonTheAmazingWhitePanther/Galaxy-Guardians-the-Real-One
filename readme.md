<div align="center">

# 🌌 Galaxy Guardians: The Real One

### *Every webpage is a universe. Every universe has invaders. Invaders are fun to shoot at.*

**A browser-based soft-body physics engine, hand-built on a \$100 phone.**

`HTML5` · `Vanilla JavaScript` · `ES6 Modules` · `Canvas 2D` · `No WASM` · `No Web Workers` · `104 modules and counting`

> *Fun first. Education later. Explosions always.*

</div>

---

> ⚠️ **Read `rules.md` first** — the working agreement for how sessions,
> summaries, and docs are organized in this repo. *(temporary note, will
> remove once this is habitual)*

---

## 🏴‍☠️ The Short Version

Spawn planets. Break planets. Fling them at a sun. Watch soft-body blobs wobble, collide, tear apart into loose particles, and leave phosphor trails across the void — **on an entry-level Android phone.**

Then open the debug console and *tune the universe live* while it runs.

This isn't a demo that only works on a gaming rig. It's an engine that earns its frame rate by being **clever instead of expensive** — and the cleverness is the whole point.

---

## 📱 The \$100 Phone Manifesto

Galaxy Guardians is developed primarily on a **POCO C71** — 4 GB RAM, 64 GB storage, a UNISOC T7250, and a screen that costs less than a nice dinner. Coded on the device itself in **Acode**, over a mobile connection, with a **Claude Pro (Basic)** subscription as the coding partner.

**This is not an apology. This is the design spec.**

```
  The target is not powerful hardware.
  The target is good engineering.
```

### 🎯 The North-Star Target

> **Thousands of active, alive, dynamic physical objects — all at once, on a low-end phone.**

Not a thousand static sprites. Not a thousand things asleep in a pool. Thousands of bodies that are *awake* — integrating, colliding, feeling gravity, tearing apart — every one of them a full soft-body citizen of the simulation. On a UNISOC T7250. That is the number the whole architecture is built to chase.

Hit that on the C71 and it *flies* on anything newer. So the constraint became the compass: every system in here has to justify its milliseconds. A phone that can't brute-force the problem forces you to *out-think* it — and out-thinking it is where all the interesting architecture came from. The See-it / Cache-it / Predict-it stack below is not decoration; it's the machinery that makes the target reachable.

> The engine now scales **upward** too: multiple LOD (level-of-detail) tiers mean the same code that survives on the C71 can spread its wings on higher-end devices. Built at the bottom, aimed at the whole ladder.

> 🎯 **Current prime goal: 160 planets · 60 constant fps** — pure frames
> preferred, frame skipping only as the measured last resort (the Pure
> Frames Law in `rules.md`). Tracked in `docs/todo/to_todo.md`.

---

## 🪄 The Layer Above — *See It · Cache It · Predict It*

Most engines do one thing per frame: **compute the next moment, draw it, throw it away.** Galaxy Guardians runs three layers stacked on top of each other, and each one buys back time the phone doesn't have.

### 👁️ 1. See It — the render layer

A **ring-buffer trail accumulator** (`accumulator.js`) keeps N offscreen canvases rotating like a filmstrip. Each frame the oldest becomes the new stage; newer layers composite over it with a power-curve fade. Old motion dies by *natural overwrite* — no clears, no pops, no stamps.

> *"MEMORY: fixed at init. N canvases, never grows. STAMPS: impossible past trailDepth frames. POPS: impossible — no hard clears anywhere."* — straight from the source header.

The newest trail (the **prime**) is **locked to full device resolution**; older tails ramp down a resolution ladder, so the trail you're actually looking at is always crisp while the fading history gets cheaper the further back it goes.

### 🎞️ 2. Cache It — the FutureCache

Here's the trick that makes the whole thing possible. **`FutureCache` treats physics like a video buffer.**

Using spare frame-time budget, it computes physics ticks **ahead** of the live playhead, stores them, and lets the live loop *play them back* instead of recomputing:

> *"A played cached tick is NOT an approximation — it's byte-for-byte the same result live computation would have produced, including the visual side effects it triggers (collision flashes, ring spawns). Those are captured at cache time and replayed at the exact moment the tick is shown — not fired early during the silent pre-compute."*

Cache ahead, play, keep caching while playing — the frontier never falls behind or overlaps itself. And the buffer no longer hoards object graphs: each cached tick is **packed into flat typed arrays** (five floats per particle, one bit-ish byte per spring), with a full keyframe only when the world's *structure* changes — ~8× smaller, so a 1024-deep future is something the machine can actually hold. Playback writes the floats straight back into the living particles: byte-for-byte, zero allocation. A time-budget governor (`CacheGov`) decides how far to look ahead (1 → **4096** ticks), and any event that would break determinism — spawning a planet, changing gravity, clearing the field — calls `invalidate()` and the buffer rebuilds. **Free, exact physics, amortised across quiet frames.**

### 🔮 3. Predict It — the Dormancy classifier

If we already hold a real, fully-coupled future for every body… that future is a **free oracle.**

`dormancy.js` scans the cached window and asks a single question per body: *"Is anything about to happen to you?"* A close approach to another body, a brush past the sun — anything the body can strongly feel. Bodies with a predicted event get tagged **hot**; bodies just coasting untouched get tagged **cold**, with a `wakeTick` telling us exactly when to wake them up (with margin to spare).

> A cold body replaying its cached path isn't fake physics — it's **real, already-computed, fully-coupled physics** that we simply don't need to recompute. The only error is a mis-predicted event, so we wake *before* the event, never after.

Stage 1 (measure-only) is validated. Stage 2 — letting cold bodies actually *skip integration* and coast — is armed and waiting on real on-device cold-percentage numbers before it flips the switch. **Honest engineering: measure, then act.**

```
   See it  ───▶  the trails you watch     (render layer, always crisp at the head)
   Cache it ───▶  the future you buffer    (exact physics, computed in spare time)
   Predict it ──▶  the work you skip        (cold bodies coast on their own oracle)
```

---

## 🎛️ Viewed by Our Tuners & Debugs

Every number in the engine is a **knob**, and every knob is live.

### 🧊 The Live Text Debug Console
A single **frosted-glass DOM overlay** (`console-view.js`) — real `backdrop-filter` blur, a native input line with a real mobile keyboard, native scrolling — listing every tunable attribute with `+ = −` buttons and a pressure bar. It boots **on by default**, so the engine opens straight into its own control room. Nothing is reinvented: every row wraps the same `Governor` the visual panels use, so AUTO/MANUAL state, live ranges, and dynamic maxes all stay in perfect sync.

### ⚙️ The Governors — Bresenham for time
Physics, Render, Input, Cache, and Trails each get a **governor** that decides how often to run using Bresenham-style tick-skipping — the same integer line-drawing math, applied to *time* instead of pixels. Dial the pressure and the system gracefully sheds or adds work. There's even a **GUI Governor** that lets you *starve the simulation on purpose* (SLOW / PAUSE / HALT) so the frame budget goes to the interface when you're tuning — because sometimes you want the controls to feel perfect and the physics to just… wait.

### 📊 Benchmark — "BEST PREFERENCES" & the 1000 Law
An iterative coordinate-ascent benchmark sweeps the knobs on *your* device, scores the result 0–1000 (richness × smoothness), and saves the winning profile. The goal is simple and absolute: **chase the 1000.**

### 🔬 MsProbe
A profiler wired straight into the physics / queue-ops / render hot paths, so every millisecond has a name and nothing hides.

| Layer | Module | What it buys you |
|---|---|---|
| 👁️ See | `accumulator.js`, `trails.js`, `renderer.js` | Crisp head trail, cheap history, zero pops |
| 🎞️ Cache | `future-cache.js`, `que-ops.js` | Exact physics computed in spare time |
| 🔮 Predict | `dormancy.js` | Skip work on bodies that are just coasting |
| 🎛️ Tune | `console-view.js`, `governor.js`, `gui-governor.js` | Change any number, live, on a phone |
| 📊 Prove | `benchmark.js`, `ms-probe.js`, `fps-counter.js` | Measure before you believe |

---

## 🧬 Under The Hood

**Soft bodies, not rigid dots.** Every planet is a blob of particles held together by springs (`makeBody(cx, cy, radius, palette)`). Gravity pulls toward the center of mass; collisions resolve at the particle level; push hard enough and the springs snap — the planet *tears*, shedding loose particles into the field.

**A fixed-timestep heartbeat.** The main loop integrates at a rock-steady `1/60s`. An accumulator banks real wall-clock time and never discards it except on true overload — so motion is a function of *time*, never of frame rate. Speed it up to **12×** and it runs 12 honest ticks back-to-back per frame; it never cheats by taking bigger steps.

**Config as data, one source of truth.** A configuration loader (`config-index.js`) with a bulletproof safe-fallback, feeding a single Base (Factory Defaults) config split cleanly into `physics / render / overlay / game / audio`. Themes/multi-profile config are out of use — live tuning (Base + your saved profile, benchmarked "best" results) is a separate system, see `governor-profiles.js` / `prefs-store.js`.

**104 ES-modules, ~300–600 lines each.** No build step. No framework. No bundler. Open `index.html` and it *is* the engine — every module a plain `import`, every system inspectable.

```
js/
├── core/        state · config · math · registry · loader
│                future-cache · dormancy · aims · que-ops · ms-probe · governors
├── modules/
│   ├── physics/     tick · softbody · collisions · creation
│   ├── rendering/   accumulator · renderer · bodies · particles · sun · trails · effects
│   ├── entities/    planet · asteroids
│   ├── input/       aims · camera · keyboard · planet · ui   (pixel-perfect input map)
│   ├── debug/       console-view · governors · benchmark · panels · profiles
│   ├── camera/ · tuning/ · ui/ · monetization/
│   └── ...
└── config/      base/   (physics·render·overlay·game·audio — the only config source)
```

---

## 🎓 The Learning Curve *is* The Feature

Galaxy Guardians is a physics classroom disguised as a toy. Play with it and you *feel* concepts most people only read about:

- **Symplectic integration & fixed timesteps** — why the accumulator matters, and what happens when you break it.
- **Broad-phase / narrow-phase collision** — watch AABB-over-trajectory catch approaches before they happen.
- **Amortised computation** — the FutureCache is a live lesson in "compute it once, use it many times."
- **Determinism** — one `invalidate()` away from understanding why reproducible physics is hard and precious.
- **Level-of-detail & the performance ladder** — see the exact moment cleverness beats brute force.

Every knob you turn is a hypothesis. Every benchmark is an experiment. **You learn naturally, because you're having too much fun to notice you're studying.**

---

## 🚀 Quick Start

```bash
git clone https://github.com/NoonTheAmazingWhitePanther/Galaxy-Guardians-the-Real-One.git
cd Galaxy-Guardians-the-Real-One
# serve it (ES modules need http://, not file://)
python3 -m http.server 8080
# open http://localhost:8080
```

**Controls**

```
HOLD · CHARGE      RELEASE · SPAWN      SCROLL · ZOOM
RIGHT-DRAG · PAN   F · FIT              SPACE · PAUSE
〰️ · DEBUG          ✒️ · AIMS INPUT       ▲▼ · SPEED (1×–12×)
```

Open the 〰️ debug console and start bending the numbers. Nothing you do is permanent — the whole thing is a sandbox.

---

## 🗺️ Roadmap

**✅ Done & validated**
- Full-fidelity FutureCache with ghost-sim swap trick, time-budget governor, invalidation hooks
- Ring-buffer trail accumulator with resolution ramp + full-res prime lock
- Dormancy classifier Stage 1 (measure-only) + locked-alpha tween witness
- Live glass debug console, per-system Bresenham governors, GUI Governor, BEST PREFERENCES benchmark
- Screen Resolution panel, Dreamy Trails presets, MsProbe profiling

**🔜 Next**
- **Dormancy Stage 2** — promote cold bodies from *drawn* coasting to *actual* integration-skipping, staggered wake-storms via QueOps, velocity-aware wake to close the strided-sampling gap
- Runtime tier-switching: auto-apply the benchmarked LOD level by live body count
- 🛡️ **Galaxy Guardians: Tower Defense** — the first real game. Protect the galaxy. Try not to destroy the planets you're defending.

**🌠 The Dream — *The Invaders Layer***
> **Render the website you see *under* the layers of Galaxy Guardians.**
> Every webpage becomes a universe. And universes always have invaders. Turn any wall of any feed into a starfield you can shoot across while you scroll your favorite Facebook wall. The page keeps working underneath; the guardians play on top. *An overlay engine for the whole web.* 🏴‍☠️👾

**🌌 Someday**
- Multiplayer · modding support · educational scenarios · community-created universes

---

## 🤝 Contributing

Ideas, bug reports, wild experiments, and "what if we…" all welcome. Galaxy Guardians grows **one experiment at a time**, and the only entry requirement is a single question:

> **«Is it fun?»**
>
> If yes, we keep building.

---

## 🐾 Credits

Built by **Noon — The Panther Pirate** (`NoonTheAmazingWhitePanther`): visionary, architect, and captain of the ship. A ~25-year journey from tweened trails and normalized angular math in **Pascal on DOS** to soft-body universes in the browser.

Code expression by **Claude (Anthropic)** — the Basic Pro subscription that helped turn a \$100 phone, an internet connection, and a very stubborn imagination into a physics engine. Every line `node --check`-clean, JSON-validated, and config-audited before it ever touched the repo.

*Proof that the marvelous doesn't require the expensive — just relentless cleverness and a refusal to accept that the phone can't do it.*

---

## 📜 License

**GNU General Public License v3.0** — free as in freedom. Copy it, run it, study it, change it, share it. Just keep it open.

---

<div align="center">

*Most engines are built to make games.*
**Galaxy Guardians is built to make experiments fun.** 🌌💥

</div>


## The Debug Deck (latest wave)

The tuning surface grew into a small operating system:

- **NOVA EXPLOSIONS** — physics always, visuals optional. A spawn burns
  (BurnMap), pushes (a decaying force ring the *ghost future feels at its
  own tick*, honestly decayed), and throws real debris — then the
  spectacle plays as **pre-baked trail frames**: 8 on a $100 phone, 240 on
  a monster, same one-drawImage cost either way. Baked in ms slices
  through QueOps, capped by a memory law the panel shows you.
- **The Map Rule, finished** — every physics grid (weight map, sun map,
  collision heat, loose density, plane masks) now rents cells on ONE
  sun-anchored lattice. Same X,Y, same cell, every map, forever.

- **The Sun Spread** — satellite buttons place THEMSELVES: every anchor
  owns a 12-slot clock ring (one universal 30° spacing), a walker finds
  the first free slot, and crowded fans grow outward rings one-wider each
  row. No hand angles anywhere; overlap is impossible by construction.
- **ScreenGov** — the engine detects the display's real refresh rate and
  every adaptive governor holds *that*, not an assumed 60. Quality-first:
  controllers start at their ceiling and decay to stable.
- **The Pure-Frames Benchmark** — the whole refinement runs with frame
  skipping pinned to zero; skip is appended once at the end, walked from
  0 to the provable minimum. Plus a random exploration poke per playable
  tier so the hill-climb can't get stuck on a local ridge.
- **Blob cards & the Captain's warm-up** — updates and questions arrive
  as spring-mesh grey blobs grown from the left edge (a tiny per-vertex
  physics system, naturally); boot offers a staged benchmark physical
  with a ticking countdown.
- **World-glued phosphor** — the trail glow ring now camera-compensates
  every layer, so trails and the sun stay put under pan/zoom, and the
  sun's neighborhood self-cleans every frame.

- **View transform** — zoom (0.15–2.5×) and pan the whole panel layer; FIT
  frames every visible panel. The world and the deck have separate cameras.
- **The know-it-all rectangle** — hold empty space, draw, and the caught
  panels become a living selection: a fully transparent panel whose chrome is
  a marching-LED border, carrying group actions (📌 pin · ⛶ maximize ·
  ▼ minimize · ⤓ shrink) for everything inside it.
- **Shrink to bar** — a panel's lowest form: one line of title + live value +
  pin, cascaded above the bottom bar. Pull it up and it wakes as a minimized
  mixer mid-drag.
- **Planet Brush** — hold-drag paints planets across four planes of existence
  (self-plane collisions only: four parallel physics strings for free), with
  its own panel for size range, randomness, group, and named colors.
- **The Update Bar** — in-game one-line toasts beneath the FPS counter,
  queued, self-measuring, scrolling only when they must.
- **Preferences that survive anything** — every knob and panel state saved in
  real time, duplicated to a temp copy, integrity-checked and range-validated
  on load, announced Matrix-style. Kill the app; the deck remembers.
- **The Mesh War** — Auto (device) and Manual (user) preferences saved side
  by side, competing for the user's ideal from a $100 phone to a workstation.
- **Selection Panel** — capture one planet or a whole cluster and a real,
  draggable, pinnable debug panel pops up on its own: live vitals (mass,
  radius, heat, speed, sun distance) scrolling in a ticker beneath an
  attached zoom box. The box has its own pan/zoom controls — tap a
  direction and it glides there on its own, all the way to the edge of
  the selection, until it gets there or you tap it again to stop; a Fit
  button frames the whole selection in one tap; a master knob dials the
  glide speed. Closes itself when the selection clears, remembers where
  you dragged it for next time.
