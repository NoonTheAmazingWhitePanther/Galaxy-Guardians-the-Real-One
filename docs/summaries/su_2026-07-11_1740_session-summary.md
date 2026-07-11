# Session Summary — 2026-07-11 (≈12:00–17:40)

## Headline
Sun Spread satellite law · trails fixed for real (streaks, head-gap, sun
jumping, fog) · the 1000 standard everywhere · ScreenGov + quality-first
governors · UpdatePop blob cards + Captain's warm-up flow · Pure Frames
Law locked into the benchmark · shouldRender law enforced in main loop.

**PRIME GOAL declared: 160 planets · 60 constant fps** (pure frames
preferred, skip as last resort). Fresh TODO started at `docs/todo/to_todo.md`
— old `docs/stuff/TODO.md` is superseded (delete or archive locally).

---

## 1. Sun Spread — the satellite placement law (`js/modules/ui/sun-spread.js`, NEW)
- Every anchor button owns a 12-slot clock ring; 30° (1/12) is the ONLY
  spacing. Slot 0 = straight above the button.
- Walker per satellite in declaration order: start top, step 1/12 to the
  first genuinely FREE slot. Free = slot unoccupied + fully on-screen + no
  overlap with any placed satellite (global, cross-anchor) + no overlap
  with fixed HTML controls (live DOM rects, 4px gap; sat-sat gap 1px —
  adjacent 30° slots are genuinely clear, a fat gap false-collides them).
- Walk direction automatic: left-half anchors clockwise, right-half
  counter-clockwise. Manual dx-mirroring is dead.
- OVERFLOW: rings grow outward. Row spacing = the VISIBLE gap (button edge
  → first satellite, edge-to-edge), repeated row to row. Ring n holds ring
  n−1's count +1: stacked rays first (6.1 over 6, 7.1 over 7…), then ONE
  new ray at the END of the arc, at that row's radius.
- `canvas-satellites.js`: all `pos()`/hand angles deleted; registry
  declares family only; layout cached on (safe|pad|W|H); added
  `familyBottom(family)`. `master-slider-renderer.js` queries it live
  (fixed `FAN_CLEARANCE_PAST_BTN=16` hardcode). `main.js` exposes
  `window._CanvasSatellites`.
- Verified by arithmetic at 360×800 (safe 10/pad 38) and 1280×800
  (16/44): zero overlaps, all on-grid, identical slot pattern both scales.
  paint-sat's old uneven fan is gone by construction.

## 2. Trails — the real bugs (TODO's ⚠️ FINDING was stale)
- The resFraction↔beginFrame formula mismatch was already moot (ramp
  removed entirely) — struck in the old TODO.
- **Cross-body streaks** (`renderer.js _drawTrailStamps`): bodies were
  paired across vault frames BY ARRAY INDEX → death/merge/spawn connected
  strangers. Now paired by snapshot id; pairs built once per segment.
- **Head detach**: skip subsample walked from the oldest end, newest frame
  survived only when (len−1)%skip==0. Now anchored to the newest frame,
  walking backward — head always glued to the body.
- **`b_${i}` id landmine** (`state-cache.js`): index-shaped fallback ids
  cross-pair after splices. Replaced with WeakMap synthetic ids stable per
  body object.
- **TrailsModule retired for real**: dead import + empty-loop removed from
  `in-ui.js`. → **DELETE `js/modules/rendering/trails.js` locally** (zero
  live references).

## 3. Sun jumping / fog / dirt (`accumulator.js`, `renderer.js`)
- **Camera-compensated compositing**: each glow-ring layer now records the
  camera it was drawn with; `beginFrame` reprojects every prior layer by
  the camera delta (k = z/z0; translation per the in-code derivation,
  verified exact by arithmetic). Phosphor is glued to WORLD space — the
  sun no longer jumps under pan/zoom, and all body glow is correct under
  camera motion. Identity fast-path when the camera is still.
- **Sun clean zone**: the sun's animated halos/flares/tentacles ghosted as
  fog that lingered (trailGlowDepth ring — why trailMax=8 didn't help).
  After compositing priors, the accumulator softly repaints bg over the
  sun's neighborhood (6R, past the 5.5R halo; 18R god rays ghost at 0.025
  alpha = invisible). Full clean core, soft skirt so body trails fade
  instead of hitting a circle.

## 4. The 1000 standard — caching routes inventory
At 1000: FutureCache HARD_CAP · CacheGov AUTO_MAX (now STARTS at 1000) ·
StateCache vault (raised 130→1002; Max Trails knob honest across 0–1000;
memory opt-in) · TrailGov maxTrails/density/effectiveCount · QueOps queue
(already 1000/keep-900) · trajectory preview (bounded by FutureCache) ·
ManualOverrides undo (raised 300→1000).
NOT raised (not caching lists): accumulator canvas ring ≤16 (gigabytes
otherwise), QueOps per-frame throttles (drain valves), BurnMap grid,
DotAtlas per-body billboards, FpsCounter/MsProbe stat windows.

## 5. ScreenGov + quality-first governors (`governor.js`)
- **ScreenGov** (NEW, registered in debug-router): detects real display
  Hz via 10th-percentile rAF deltas (fastest sustained frames reveal true
  vsync under load); ASYMMETRIC snap — jitter reads high, load never reads
  low, so snap down generously (≤12%), up barely (≤3%). Verified: 60/90/
  120/144 clean+loaded+jittered+stalled, 71Hz oddball stays 71.
- CacheGov `_autoTarget` starts at 1000 (AIMD decays to sustainable —
  worst case 9 pressured frames, budget-capped).
- RenderGov BASE default = detected screen Hz (cadence aligned to display).
- Benchmark target = `ScreenGov.hz × 0.92` (the old 55/60 ratio, applied
  to whatever the screen actually is). `main.js` feeds `ScreenGov.tick(t)`.

## 6. Benchmark — honest measurement + Pure Frames + exploration
- **Measurement contamination fix**: `_measure` sampled FpsCounter's ring
  — which holds ONE ENTRY PER SECOND over 120 entries (a ~2-minute
  trailing average, never reset). Every config measurement was mostly
  history; the ascent discriminated on near-noise. Now measures directly:
  sample frames counted against the wall clock, isolated per config.
  **Old BEST PREFERENCES were tuned on contaminated data — re-run.**
- **PURE FRAMES LAW (locked, rules.md)**: the ENTIRE refinement runs with
  skip pinned to 0 (seeds stripped). Skip enters once, at the end
  (`_minSkipPass`): if pure frames hold target → zero skip; else walk skip
  up from 0 (render frames sacrificed before physics frames) and stop at
  the FIRST stable level — the minimum, capped by the lighter tier's level
  (monotonic law). Verified on device models: zero-skip when affordable,
  provably-minimal when not, honest exhaustion, cap respected.
- **Exploration rule (locked)**: every playable tier gets ≥1 random
  non-greedy change (`_explorePass`, non-skip knobs, cap-respecting), kept
  only if playable AND richer. 40-run verification: exact-once, both
  adopt/revert paths clean, skip untouched.
- `run({ toTier })` bound for staged callers; `tierCount` getter.

## 7. UpdatePop + WarmupFlow (`js/modules/ui/update-pop.js` v2, `warmup-flow.js` NEW)
- **Blob cards**: every card body is a 36-point spring mesh (k=160, d=13)
  grown from a LEFT-edge anchor — left points inflate first, mesh
  stretches right, ~8% overshoot, jelly-settles. Collapse = same springs
  reversed, same left-first wave. Gandalf grey kept (canvas fill, silver
  rim, glow, --ui-radius). Own rAF loop only while cards live; nothing on
  the sim render path.
- `pop()` announcements; `ask()` questions (optional timeout → null);
  **`choose()` THE STACK**: cards together from the left, 160ms staggered
  build, 5.0→0.0 counter beside each (synced), whole card = button, one
  tap resolves index + mirrored staggered collapse; 0.0 → null.
- **WarmupFlow** (boot, replaces hello pop): "Hi Captain. We are always
  updating. A benchmark to warm up the system?" [Yes/No] → clean slate
  (AIMS off, painting off+sync, selection cleared, debug off, TuningLayer
  suspend()/resume() NEW) → choose(Fast=tier1 / Moderate=4 / Full=7) →
  one bounded run → result pop. Verified under virtual-clock harness.
- Honest note given on the worker idea: a Worker can't measure the render
  thread the sim actually lives on; moderation is the isolation. (Project
  law stays vanilla, no workers.)

## 8. shouldRender law enforced (`main.js`, rules.md strengthened)
- Audit: world/panel/satellite/AIMS draws were already gated. TWO DOM
  paints weren't: the FPS readout (textContent/className) and the custom
  cursor (after the gate). FPS: measurement stays unconditional every
  frame, DOM write deferred as pending paint inside the gate. Cursor:
  moved inside. Rule now explicit: ALL paints (canvas + loop-born DOM)
  inside shouldRender; ALL input/physics updates before it, constant;
  measurement is data. Tweening between fragments builds on this.

## Files changed this session (destinations)
- NEW `js/modules/ui/sun-spread.js`, `js/modules/ui/warmup-flow.js`
- `js/modules/ui/canvas-satellites.js`, `js/modules/ui/update-pop.js` (v2)
- `js/modules/debug/master-slider-renderer.js`, `benchmark.js`,
  `governor.js`, `debug-router.js`, `fps-counter.js`
- `js/modules/rendering/renderer.js`, `accumulator.js`
- `js/modules/tuning/tuning-layer.js`
- `js/modules/input/in-ui.js`
- `js/core/state-cache.js`
- `js/main.js`, `rules.md`, `readme.md`
- DELETED (locally, by hand): `js/modules/rendering/trails.js`
- SUPERSEDED: `docs/stuff/TODO.md` → fresh `docs/todo/to_todo.md`

## Unconfirmed — needs live testing (full list in to_todo.md)
Sun Spread fan positions/taps · WarmupFlow boot cards + staged runs ·
blob grow/collapse feel · ScreenGov hz on POCO · Pure-Frames benchmark
re-run (expect renderFrameSkip 0 on most tiers) · trail death-streak +
skip-head checks · sun pan/zoom/idle/flyby checks · plus prior session's
list (PrefsStore reload, Fit, master knob, tap-toggle, hold-gates,
centroid ring).
