# th_map-rule — the Singular Map Rule (design, not yet a refactor)

**Status:** design note (Noon + Claude, 2026-07-12). The ×12 tunneling bug is
fixed in code (tick-based dormancy rescan + swept coast check); THIS document
is the map unification, parked until MsProbe numbers justify the surgery.

## One law for every map

Every spatial map in the engine is a **renter of the one FieldGrid lattice**.
No map may own private grid geometry, private cell math, or a private skip
policy. A renter declares only:

| contract field | meaning |
|---|---|
| `cellSize`      | px per cell (may differ per renter; lattice does the math) |
| `buffer`        | extra rows/cols beyond the active region (Noon: "buffer size") |
| `smoothing`     | 0 = raw cells (pixel-perfect), 1..n = neighbor-averaged reads |
| `factor`        | multiplication factor applied at read time (mass, decay, speed ×) |
| `skip`          | self-skip cadence — rebuild every N ticks; MUST register with the Skip Action Panels so skipping is always visible and overridable |
| `lifetime`      | ∞ (weight, burn) or decaying (nova) — decay indexed by TICK, never wall-clock, so ghost ticks sample honestly |

Current renters and where they land under the law: WeightGrid (planets only —
sun stays analytic, settled 2026-07-12), CollisionMap, BurnMap, SunGravMap
(read-only geometry renter, factor = live mass), future NovaMaps.

## Per-planet self grids — the honest cost sheet

Proposed: each planet owns a small grid for "easier collision checking and
awareness threat" beyond the declared radius.

Costs: N grids rebuilt as bodies deform every tick; memory × N; two-grid
intersection tests replace circle tests. Benefits over what we now have:
collision awareness is already covered by (a) declared-radius circle checks,
(b) the swept coast ray (new, catches everything between ticks), (c) the
Dormancy oracle reading the actual cached future — a *perfect* awareness map,
better than any grid heuristic.

**Verdict: parked.** The swept check + oracle give the same awareness for ~0
cost. Revisit only if MsProbe shows interBodyCollisions() as a top consumer
AND body counts grow past what circle broad-phase handles.

## Smoothed high-speed collision (the /100 interpolation)

Noon's instinct — interpolate collision checking across the jump — is
implemented as the **swept coast check**: the K×dt jump segment is ray-cast
against every same-plane body, the impact fraction `coastHitT` (0..1 inside
the jump) is the measured sub-tick moment of explosion, and the body is
clamped back to it before normal collision physics detonates. This IS the
interpolation, in closed form — no /100 sampling loop needed (the quadratic
finds the exact crossing that 100 samples would approximate).

If visible high-speed impacts still look late: raise coast wake margin, or
scale it by the live speed multiplier (knob candidate: `dormancyWakeMargin ×
timeScale`).

## Refactor order (when numbers justify it)

1. MsProbe 160p: grav / spring / coll / cache split — the gate for all of this.
2. Extract the renter contract (table above) into field-grid.js as data.
3. Migrate WeightGrid, CollisionMap, BurnMap to declared contracts (no
   behavior change — pure de-duplication).
4. SunGravMap becomes a read-only renter (drops its private cell math).
5. Nova maps arrive as the first born-under-the-law renter.
