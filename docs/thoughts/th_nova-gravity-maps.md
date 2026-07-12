# th_nova-gravity-maps — transient chaotic gravity as field-grid renters

**Status:** design note (Noon, 2026-07-12). Parked until the frame budget is solved
(see: cacheDirtySubsteps test + MsProbe three-way physics split).

## The idea

Nova explosions (and future transient forces) get their own gravity maps —
additional renters in the generic `core/field-grid.js` lattice, alongside the
weight map and collision map. Each Nova map:

- is born at the explosion point, covering a local region only;
- holds a chaotic push/pull field (random per-cell signed forces, coherent
  enough per-cell to feel like a shockwave, not noise);
- has a **lifetime**: decays over seconds, then unrents and dies;
- acts in real time on planets, loose debris, and burning particles inside
  its region — pushing and pulling, changing the live simulation.

The sun stays out of all grids — it is analytic and exact in `applyGravity`
(one evaluation per particle, cheaper than any lookup). Grids are for the
*many* and the *transient*, never for the one stationary dominant source.

## Cache policy: splice, don't flush

An explosion must NOT `FutureCache.invalidate()`. The precedent is
`overlays.js` commit(): mutate the frontier honestly and let the future
self-heal, falling back to invalidate only when commit is impossible.

Rationale: we smooth everything anyway (far-cluster ghost gravity,
dirty substeps). A Nova is a *bounded local* force — cached ticks for bodies
outside its region stay valid; bodies inside it diverge and get corrected as
the frontier re-simulates through the decaying field. Bounded wrongness for
a few hundred ms beats a full 1000-deep rebuild at every explosion.

Ghost ticks must see Nova maps too (sample the same decayed-by-tick values),
or predicted futures drift systematically. The map's decay must therefore be
a pure function of tick index, not wall-clock — ghost ticks live in the
future and need to evaluate the field *at their tick*.

## Blend law

Total gravity on a particle = analytic sun + planet field (grid far +
near-exact ring, or ghost far-cluster) + Σ active Nova maps sampled at the
particle's cell. Straight sum — no special casing. A Nova map is just one
more `+=`.

## Open questions

- Cell size: reuse weight-grid geometry or coarser (chaos doesn't need
  resolution)?
- Cap on simultaneous Nova maps (pool them; oldest dies first)?
- Does BurnMap heat interact (hot cells amplify the push)?
- Multiplayer note (Noon): per-session smoothing so all participants see
  the same softened field — server-authoritative decay seed.
