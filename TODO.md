# Galaxy Guardians — TODO

## 🎯 THE MISSION — 160 planets · 60 FPS · POCO C71
Current: ~80 planets fluid with Gravity Grid + Weight Grid live. Target:
double it. The path is not more force cleverness — it's *doing nothing,
beautifully*: cold planets must stop paying integration AND stop paying
per-frame tween bookkeeping. Longer tweens, fewer decisions, exact wakes.

## ⏩ SPEED-AWARE TWEEN (×1–×5) — the Stark resolution  ⟵ TOP PRIORITY
The cold-body tween must be planned in *steps*, played in *time*, and scaled
by the speed bar — because the future is already cached, we know everything
in advance, including the wake.

**The contract:**
- At speed ×S, one render loop drains S physics steps. A tween spanning L
  cached steps therefore lasts `L/(60·S)` wall seconds. The tween parameter
  advances by steps drained (from the accumulator), NEVER by frames:
  `u += stepsDrained / L`. Speed change mid-tween = u keeps its value and the
  denominator stays L — **re-parameterize, never restart.** (Restart is the
  jitter.)
- If one loop ticks 10 steps, the tween animates the planet 10 steps of its
  cached path that loop — unless `wakeTick` lands inside it, in which case it
  animates exactly up to the wake.
- **Ease-out into wake [CACHED→REAL handoff]:** wakeTick is known in advance
  (the oracle). Over the last W steps before wake, blend tween position →
  live-integration position so velocity is continuous at the seam. W default
  ≈ 8 steps; velocity-aware (bigger W for faster bodies).

**📏 THE TWEEN LAW (rule, locked): the longer the planet-movement tween, the
better — at identical time and speed.** Playing one L-step tween must land
the planet at the same place, at the same wall time, as playing five
(L/5)-step tweens back-to-back. Guaranteed by construction when u is
step-driven (above). What longer buys: fewer keyframe fetches, fewer
retarget decisions, fewer seams (each seam is a jitter opportunity).

**The honest bound (Fake Physics, labeled):** a linear tween replaces the
true curved arc with a chord. Max deviation (sagitta):
`err ≈ a · (L·Δt)² / 8`, a = body acceleration, Δt = 0.016.
So the maximum earned tween length is `L_max = (1/Δt)·√(8ε/a)` for error
budget ε (default 0.5 px world). Low acceleration EARNS long tweens; a body
skimming the sun earns short ones. `a` is free — read it from the cached
window. Endpoints are **[CACHED]** (exact); in-betweens are **[FAKE
(bounded)]**; the moment of wake is **[REAL]**. Write this taxonomy on every
tween-touching module header.

**Freeze the cold state:** while cold, the body pays zero integration
(Dormancy Stage 2) and zero per-frame tween math beyond one lerp — no field
sampling, no neighbor checks, no cache reads except at knots. Cold = one
multiply-add per frame, full stop.

**Jitter / gap / constancy checklist (quality gates before ship):**
- [ ] No tween restart on speed change (u preserved — test ×1→×5→×1 mid-glide)
- [ ] No tween restart on cache top-up (knots extend; only invalidate() resets)
- [ ] DPR rounding identical in tween draw vs live draw (no ½-px pop at wake)
- [ ] Wake seam velocity-continuous (ease-out W steps, no direction snap)
- [ ] Strided-sampling gap closed by velocity-aware wake margin
- [ ] MsProbe: `render.drawAll.tween` flat-lines as cold% rises (the proof)
- [ ] A/B: 160 bodies, grid ON, Stage 2 ON, ×1 and ×5 — 60 FPS or the item stays open

## 📖 TODO-GUINNESS — the Book of Known Limitations  ⟵ NEW FILE
See **TODO-GUINNESS.md**: browsers (canvas caps, rAF throttling, storage),
low-end phones (C71 class), Snapdragon/MediaTek/UNISOC old & new, RISC-V,
mini-PCs / TV boxes / Roku-class, screens (e-paper, car, watch, glasses),
cross-platform rendering limits, multiplayer/server limits (including the
cross-engine float-determinism landmine under replay sharing), and
legitimation (🍪 consent, ratings, COPPA stance, GPL hygiene). Every entry
has a checkbox and a counter-move. It ends with the **Physics Truth Table**:
Real vs Fake vs Cached, engine-wide, with error bounds on every FAKE.

## 🕳️ PORTS: KNOBS OUT, HOLES IN — the minimized panel becomes a patchbay
The rule, locked: **outputs are KNOBS, inputs are HOLES.**
- Opened panels: remove the +/=/− button triplets — knobs only from now on.
  Every `buttons` line becomes a knob control + an AUTO/MANUAL toggle. (The
  console rows already grew sliders; panels follow.)
- AUTO/MANUAL on every variable that has a manual. AUTO = the governor drives;
  MANUAL = you (or a wire) drives.
- MINIMIZED panels, when a variable is MANUAL: show its INPUT HOLE — a socket
  drawn on the minimized face, the variable's title beneath it. Holes exist
  ONLY in minimized mode (the minimized panel is the patch face; the opened
  panel is the reading face). Plug a wire into a hole → that manual is driven
  externally: enhance, silence, or balance it back toward automatic.
- Gate labels are output-side too: a knob can emit its value, a stats field
  can emit, and the Cycle panel emits its beat.

## 🎛️ ACTION PANELS — the big list
Panels that DO instead of show, each a node in the wire graph:
- **Math Action Panel** — takes 1-2 inputs, one op (add/mul/lerp/clamp/curve),
  one output. The workhorse between any two holes.
- **Cycle Action Panel** — a skipper: input beat → Gate.declare on any label.
  "Connected to sun.drawCall, declare a new skip in real time." (Gate SHIPPED —
  this panel is its face.)
- **Color Palette Action Panel** — output: theme colors; input: any stat →
  palette shifts with the sim (heat → warmer).
- Later: Logic (compare/branch), Envelope (attack/decay on a value), Random,
  Clock dividers. Every one is just holes + knobs + one function.

## 📜 VISUAL SCRIPTING LAYER FOR MANUAL VARIABLES
Every manual variable gains an optional script slot — visual-scripting style:
a tiny chain (input → transform nodes → the variable) built by wiring Action
Panels. Stored as data (the wire map), evaluated on the `wires` QueOps lane
once per cycle, capped by a settle limit. The variable's history stays
undoable; a script is just a persistent hand on the knob.

## ✅ PIPELINE REALITY CHECK — what goes through QueOps and what must not
Decided and enforced this session:
- **Deferrable work → QueOps lanes.** Departments now: physics, rendering,
  particles, logic, ai, audio, ui, gc, custom + NEW input, debug, cache,
  theme, wires. Bigger list, per-lane budgets, cycling — connect-time ops can
  queue anywhere, be skipped, or never be used at all, at zero idle cost.
- **Synchronous hot path → GATES (SHIPPED).** Per-particle loops and draw
  passes must never pay queue overhead — the 1000 law dies there. Instead
  every probe label is now a pass point: `Gate.declare(label, {every|mute})`
  skips it live. The measurement namespace IS the control namespace.
- **Presentation → per-line refreshEvery (SHIPPED).** Any panel line (or set,
  or whole panel) declares its own repaint cadence.

## 🔌 BLUEPRINTS-STYLE LOOP ENGINEERING — the Panel Connector & Wires
The debug deck grows a node-graph soul (Unreal Blueprints, but ours):
- **Cycle Panel is the heart (SHIPPED)** — it beats at the chosen law. The
  connector makes it a CLOCK SOURCE: any panel feature wired to it CYCLES —
  no matter what it is, once connected it ticks on the Cycle's beat (pulse a
  knob, re-run a sort, refresh a stat, fire an arrange).
- **Wires**: drag from a panel's output port to another's input port; the wire
  is drawn in world/panel space (bezier, heat-colored by traffic), persisted in
  PrefsStore, torn down by cutting the wire (swipe across it).
- **Ports**: every ManualOverrides knob is implicitly an input port; every
  stats field (GravityField.stats.*, CycleMeter.stats.*, MsProbe labels) is an
  output port. The GovernorRegistry already resolves both by path — the wiring
  layer is a mapping table {fromPath → toPath, transform} evaluated per cycle.
- **Loop engineering**: wires may form loops ON PURPOSE — a governor built by
  the user out of wires. Guard: per-cycle evaluation order + a settle limit,
  never infinite recursion inside one tick.

## 📺 CODING VISUAL ASPECTS OF LIVE STREAMS — the adventure begins
The deck as a live-stream instrument: panels, wires, and the sim itself as
composable visual layers a streamer drives in real time. OBS-friendly
transparent output mode (The Invaders Layer is the seed), scene presets on the
Tetris fan, and wire-driven visual reactions (physics stats → bloom, trails,
camera). The replay research object doubles as the stream's rewind.

## 🌀 THE RICK AND MORTY METAVERSE — to anything
Portals between instances. The planes of existence already give us parallel
worlds in ONE sim; the metaverse step connects SEPARATE instances: a shared
replay/state object travels through a "portal" (link, file, QR) and material-
izes in another running app — planet through the portal, physics intact.
Dimension C-137 is just plane 0 somewhere else. Builds on: social sharing of
complete replays (the transport), plane isolation (the docking bay), and the
Panel Connector (wires across instances, eventually).

## 🍪 PRIME №1 — COOKIES WARNING & ACCEPTANCE
This is a website. Before anything ships publicly: the cookies/storage consent
banner. We persist prefs, layouts, benchmarks in localStorage — that requires
informed acceptance in most jurisdictions. Accept → persistence on; decline →
session-only memory (prefs live in RAM, gone on close). The two-phase
PrefsStore already isolates ALL storage writes behind one module, so the gate
is a single switch at its save() door.

## 🔬 RESEARCHABLE FULL GUI + GAME REPLAY — duplicate experiments
Record EVERYTHING needed to replay a session exactly, as a research object:
- **Pointer tracking — all of it**: timestamp, pointer x, pointer y, touch
  states (down/move/up/cancel, pressure where available), and the time DELTAS
  between events — the deltas are the researchable signal (hesitation,
  velocity, rhythm).
- **Deterministic replay**: fixed timestep (0.016) + recorded input stream +
  starting seed/state snapshot = the same experiment reruns identically. The
  FutureCache ghost machinery already proves our physics is replayable.
- **The researchable object**: one JSON — header (version, device, prefs,
  seed), input stream, and outcome markers (benchmark scores, MsProbe
  aggregates). An object that can MULTIPLY: load it, fork it mid-way, run a
  variation, save the child with lineage back to the parent.
- **Social sharing — complete replays only (for now)**: export the object,
  load it in a DIFFERENT instance of the app. No partials, no live sync yet —
  a whole experiment or nothing. Later: leaderboards attach here.

## 📊 SORT 7.2 — COMMUNITY MS AVERAGES (online half)
The ⚡ bottleneck sort currently uses the local MsProbe window. Phase 2:
known-statistics averages downloadable as ONE public JSON (file or link),
known to all users. Receiving an update prompts Accept / decline; a LONG CLICK
reverts to the previous accepted set. Schema: { probeLabel: { avg, max, n } }.
Compare local vs community to flag "your device is the outlier" bottlenecks.

## 🧷 RULE (implemented, keep honoring): PANEL MEMORY SURVIVES EVERYTHING
Unless the debug panel is explicitly reset, it remembers all previous actions —
through crashes, refreshes, system failures. PrefsStore's two-phase integrity
write is the mechanism; every new panel feature MUST route its persistent
state through PANEL_FIELDS or a prefs section, never ad-hoc storage.

## 🌌 GHOST GRID — Gravity Grid Phase 2  ⟵ NEW (the real perf unlock)
The Gravity Grid (SHIPPED) accelerates the LIVE physics path only. When
FutureCache is hot, physics is served from precomputed ghost ticks — and ghosts
are deliberately forced onto the exact legacy loop (`GravityField.ghostMode`)
so predictions never sample a field built from live positions they've already
diverged from.

- **The unlock**: give the ghost stepper its OWN field — rebuild from ghost
  bodies inside ghost stepping every K ticks (K≈8). Field build is
  O(cells×occupied) amortized; per-ghost-tick gravity drops from
  O(particles×bodies) to O(particles). At HARD_CAP 1000-step lookahead this is
  where nearly all gravity time actually lives.
- **Shape**: a second GravityField instance (or re-entrant frame pair) owned by
  FutureCache; deposit from ghost bodies; no overlay, no knobs beyond a master
  toggle; invalidated with the cache itself.
- **Prereq**: verify ghost grid + live grid never share `cellBodies` (ghost
  body refs must not leak into live gather).
- **Consistency rule**: cached ticks were computed under ghost-grid forces, so
  live playback (playNext) is self-consistent by construction — same reason the
  legacy-exact ghosts are consistent today.

## 🌠 THE INVADERS LAYER  ⟵ NEW (the big dream)
Render the live website *underneath* the Galaxy Guardians engine — turn any
webpage into a playable universe.

- **Concept**: the page (Facebook wall, any feed) keeps working and scrolling
  underneath; the GG canvas + guardians play on the layer *above*. Every webpage
  becomes a universe, and universes always have invaders — shoot at them as you
  scroll.
- **Delivery vehicle**: browser-extension / injected overlay. The engine already
  renders to a single full-screen `<canvas id="c">` with `alpha:false`; for the
  overlay it needs a transparent-background render path (composite over the DOM
  instead of `BACKGROUND_COLOR`) — a render-mode switch, not a rewrite.
- **Input coexistence**: pointer events must pass THROUGH to the page except when
  a guardian/invader is under the cursor. AIMS already owns a pixel-perfect hit
  map — reuse it to decide "hit test the game first, else forward to the page."
- **Perf budget**: this is the ultimate stress of the See-it / Cache-it /
  Predict-it stack — the host page is already spending frame time, so Dormancy
  Stage 2 + LOD tiers are what make this affordable. Ship gated behind an
  explicit user toggle; never steal a frame the page needs.
- **Scope guard**: prototype as a standalone "fake page behind the canvas" first
  (a static HTML wall), prove the transparent render + click-through, THEN wrap
  as an extension.

## Screen Resolution Panel
A dedicated panel to control render/trail resolution across the whole engine.

- **Prime render is LOCKED to full device resolution** — the first/newest trail
  (and the live body) must never be downsized. Implemented: `Accumulator` head
  buffer is always full-res; `TrailGov.firstFullRes = true`.
- **Per-trail resolution ramp**: each older trail steps down from the one above,
  from full res → the selected last-tail buffer size. Ramp math lives in
  `TrailGov.resFraction(i, N)` (i=0 → 1.0, then `1 − i/(N+1)`, floored by the
  `Res Ramp` knob = `1/2^downscale`). Currently applied to the phosphor ring
  layers in `Accumulator.beginFrame` via scratch downsample/upsample.
  - ⚠️ FINDING (open): the documented single-source formula `TrailGov.resFraction`
    is NOT what `Accumulator.beginFrame` actually composites
    (`1 − (step/W)(1−floor)`). Decide which is canonical and unify.
- **Panel controls to add**: device resolution readout, prime-res lock toggle,
  ramp floor (last-tail size), ramp curve (linear / steeper), and a
  memory/fill-rate estimate per setting.
- **Memory note**: full-res ring buffers cost more RAM than the old uniform
  downscale. On very low-end (POCO C71, 720p) this is acceptable (~8 × ~4.6MB).
  For higher-res targets, consider storing older ring layers at their ramped
  resolution (needs de-coupling storage from the rotating head — a shift or an
  age-indexed buffer set) so the ramp also SAVES memory, not just fill-rate.

## Dormancy — Stage 2 (the payoff)
- Promote the tween from *drawing* the glide to *being* the cold body's position:
  skip integration in `_shadowTick`/`tickBodies` for `Dormancy.isCold(i)`, wake on
  `wakeTick(i)`.
- Stagger wake-storms via QueOps so a whole cluster waking at once doesn't spike.
- **Velocity-aware wake** to close the strided-sampling gap (fast head-on
  approaches can slip between samples).
- Ship behind a default-off `dormancyDrive` switch. Go/no-go = Stage-1 on-device
  cold-% at low Wake Lead + zero missed incidents.
- `cacheDirtySubsteps` is currently GLOBAL — could be scoped to cold bodies only.

## Trails — slice 2
- Individual channel-knob drag in the minimized mixer (currently master-only).
- Wire the per-trail resolution ramp to the *stamp* trail count (maxTrails),
  not only the phosphor ring, so "19 trail length" ramps stamp-by-stamp.
- Add the Dreamy Trails presets as a console row (currently TRAILS panel only).
  Note: `LONG` runs full-res buffers (heaviest on the C71) — could set its
  downscale to 1.

## Benchmark — next
- Runtime tier-switching: auto-apply the benchmarked level by live body count.
- Second refinement pass (re-sweep knobs after the first pass) for tighter convergence.
- Pin button beside BEST PREFERENCES: benchmark pinned panels only.

## GUI Governor — follow-ups
- HALT throttles the *whole* canvas block; a surgical "sim-only freeze, panels
  full speed" split is available if wanted.
- The "next stage" the GUI Governor was declared *mandatory* for — define it.

## Monetization / social (later)
- Rewarded "free daily benchmark" (no credentials); score + history already saved.
- Leaderboards (score + history JSON is ready to submit).

## Gravity Grid (new)
- Precomputed GRID OF GRAVITY for the sun pull: bake the sun's gravitational
  acceleration field into a coarse spatial grid once (it's static — the sun
  doesn't move), then per-particle gravity becomes a grid lookup + bilinear
  interp instead of per-substep sqrt/normalize for every particle. No more
  "checking all the time". Needs: grid resolution vs accuracy sweep near the
  sun (field changes fastest there — maybe log-radial cells), invalidation on
  GRAV_CONST / sunGravMult knob changes, and a MsProbe A/B to prove the win.

## Planes of Existence — follow-ups (shipped: 4 planes, brush round-robin)
- Per-plane visual identity (tint / phase shimmer) so overlapping non-colliding
  planets read as different planes, not as a bug.
- Plane knob in debug-config (PLANE_COUNT is a config constant for now; 8–16
  plane stress test on the C71).
- Decide ring-dust plane policy (currently plane 0 — sun dust only touches
  base-reality planets).

## Selection Panel (SHIPPED as the transparent group panel)
- Marquee selects; the LED box IS the panel — fully transparent, ant-border
  chrome, group icons 📌 ⛶ ▼ ⤓ acting on all selected at once.
- Still open: **Collect** icon (collectInto is built and waiting), group-drag
  the whole selection as one, deselect gestures beyond tap-on-empty.

## Update Bar (SHIPPED) — follow-ups
- Route more systems into UpdateFeed.push (benchmark results, governor mode
  flips, FutureCache invalidations).
- True console "Hello Captain" line integration (currently the bar re-dresses
  as a console line at the console's top).

## The Mesh War (direction)
- Auto (Device) preferences + Manual (User) preferences compete for the
  user's ideal: device metrics now saved beside manual prefs; next, let
  BEST PREFERENCES weigh both when proposing tunings. Cross-platform,
  low-end (POCO C71) to high-end, one save file.

## Planet Panels (new)
- **Planet Panel** — configuration surface for GENERATING new planets: size,
  mass, velocity, spawn pattern, count. Debug-mode planting is currently off
  ("tuning, not playing") — this panel becomes the sanctioned way to spawn
  while tuning.
- **Planet Statistics Panel** — tap-select a planet (or the sun) in the world
  to open its live statistics: velocity, mass, trail count, hot/cold dormancy
  tag, FutureCache close-approach data, plus global counts. Needs a
  world-object select mode that coexists with the panel marquee.

## Effects (later)
- Speed-triggered shooting particles with their own trails.

---

## 💰 TOKEN BUDGET — approx Claude output tokens to implement each item

Estimates are **Claude output tokens** (code + edits + explanation) for a
clean single pass on the current 89-module codebase. Reading context is not
counted (it's input, and it's large — every session pays a fixed ~10–20k
input overhead re-establishing the relevant modules).

| Item | Est. tokens | Confidence |
|---|---|---|
| ⏩ Speed-Aware Tween ×1–×5 + Tween Law + ease-out wake | ~14k | Med — touches dormancy, tween, accumulator, speed UI |
| Dormancy Stage 2 (skip integration, staggered wakes) | ~15k | Med — hot-path surgery, needs on-device validation loops |
| 🌌 Ghost Grid Phase 2 (FutureCache's own field) | ~12k | High — pattern already proven by live grid |
| 🕳️ PORTS knobs/holes (panel UI rework) | ~25k | Low — UI needs Noon's live eye = iteration rounds |
| 🎛️ Action Panels (Math + Cycle + Palette) | ~18k | Med — each panel ~6k once the first lands |
| 📜 Visual scripting layer (wire map on wires lane) | ~12k | Med — plumbing exists (registry, gates, lanes) |
| 🔌 Blueprints wires (ports, bezier draw, persistence, loops) | ~30k | Low — new interaction model, hit-testing, cut gesture |
| 📺 Live-stream visual coding (OBS mode, scene presets) | ~15k | Low — depends on Invaders render switch |
| 🌀 Metaverse portals (cross-instance transport) | ~40k | Very low — spec-first item, estimate is for prototype |
| 🍪 Cookies consent gate | ~4k | High — one switch at PrefsStore.save() + banner |
| ⭐ Ratings (link + Update Bar toast + prefs flag) | ~3k | High |
| 🔬 Replay research object (record, rerun, fork, share) | ~25k | Med — determinism same-engine is proven; serializer is the bulk |
| 📊 Sort 7.2 community averages (fetch, accept, revert) | ~8k | High |
| 🌠 Invaders Layer prototype (fake page + transparent + click-through) | ~20k | Med — render-mode switch + AIMS forward path |
| Screen Resolution panel follow-ups + formula unification | ~8k | High — the ⚠️ FINDING is a decide-then-edit |
| Trails slice 2 (channel knobs, stamp ramp, presets row) | ~6k | High |
| Benchmark next (tier auto-switch, 2nd pass, pin scope) | ~8k | Med |
| GUI Governor follow-ups (surgical freeze split) | ~3k | High |
| Planes follow-ups (tints, plane knob, dust policy) | ~5k | High |
| Selection panel opens (Collect, group-drag, deselect) | ~4k | High |
| Update Bar routing + console hello line | ~2k | High |
| Mesh War weighting in BEST PREFERENCES | ~6k | Med |
| Planet Panel + Planet Statistics Panel (tap-select) | ~12k | Med — world-select mode vs marquee coexistence |
| Effects: speed-triggered shooting particles | ~5k | High |
| Leaderboards / rewarded daily benchmark | ~10k | Low — backend-shaped, spec incomplete |
| **Total open book** | **~310k** | |

**Deviation, explained honestly:** expect **±40–60%** per item, skewed high.
Why estimates drift: (1) each debug round after first ship adds ~30–50% of
the item's cost — UI items average two rounds, hot-path items average one but
each round is on-device; (2) the restart law means every fix cycle has a
human-verification gap that tempts scope creep ("while we're in there…") —
that's where budgets die; (3) items marked Low confidence hide unknown
interaction models — their true cost is discovered, not estimated; (4) the
fixed input overhead per session favors batching 2–3 small items per sitting
(Trails slice 2 + Update Bar + Selection opens = one session, one overhead).

---

## 🔁 STANDING QUALITY GATES (apply to every item above)
- English pass: docs and UI strings read clean (this file counts).
- Math pass: every formula written down and unit-checked (Tween Law above is
  the template).
- Physics honesty pass: tag REAL / FAKE / CACHED, and every FAKE ships with
  its error bound (see TODO-GUINNESS Physics Truth Table).
- Physics ⟷ Tween matching: cached knots are the single source of truth;
  tween draw and live draw share coordinate/DPR code paths.
- node --check all JS · Python-validate all JSON · full server restart · AIMS
  sync on any panel move — the locked rules, unchanged.
