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

## Effects (later)
- Speed-triggered shooting particles with their own trails.
