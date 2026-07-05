# Galaxy Guardians — TODO

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
