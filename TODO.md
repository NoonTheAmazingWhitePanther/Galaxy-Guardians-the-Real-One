# Galaxy Guardians — TODO

## Screen Resolution Panel  ⟵ NEW
A dedicated panel to control render/trail resolution across the whole engine.

- **Prime render is LOCKED to full device resolution** — the first/newest trail
  (and the live body) must never be downsized. Implemented: `Accumulator` head
  buffer is always full-res; `TrailGov.firstFullRes = true`.
- **Per-trail resolution ramp**: each older trail steps down from the one above,
  from full res → the selected last-tail buffer size. Ramp math lives in
  `TrailGov.resFraction(i, N)` (i=0 → 1.0, then `1 − i/(N+1)`, floored by the
  `Res Ramp` knob = `1/2^downscale`). Currently applied to the phosphor ring
  layers in `Accumulator.beginFrame` via scratch downsample/upsample.
- **Panel controls to add**: device resolution readout, prime-res lock toggle,
  ramp floor (last-tail size), ramp curve (linear / steeper), and a
  memory/fill-rate estimate per setting.
- **Memory note**: full-res ring buffers cost more RAM than the old uniform
  downscale. On very low-end (POCO C71, 720p) this is acceptable (~8 × ~4.6MB).
  For higher-res targets, consider storing older ring layers at their ramped
  resolution (needs de-coupling storage from the rotating head — a shift or an
  age-indexed buffer set) so the ramp also SAVES memory, not just fill-rate.

## Trails — slice 2
- Individual channel-knob drag in the minimized mixer (currently master-only).
- Wire the per-trail resolution ramp to the *stamp* trail count (maxTrails),
  not only the phosphor ring, so "19 trail length" ramps stamp-by-stamp.

## Benchmark — next
- Runtime tier-switching: auto-apply the benchmarked level by live body count.
- Second refinement pass (re-sweep knobs after the first pass) for tighter convergence.
- Pin button beside BEST PREFERENCES: benchmark pinned panels only.

## Monetization / social (later)
- Rewarded "free daily benchmark" (no credentials); score + history already saved.
- Leaderboards (score + history JSON is ready to submit).

## Effects (later)
- Speed-triggered shooting particles with their own trails.
