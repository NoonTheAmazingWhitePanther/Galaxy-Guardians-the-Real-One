# to_map-rule-finish — the steps to close the Map Rule build

**Written 2026-07-12. Prime goal unchanged: 160 planets · 60 fps (baseline 80p@60).**

## CODE — migration debt, in order

1. ~~**BurnMap → renter**~~ ✅ (2026-07-12, first session)
2. ~~**GravityField weight grid → renter**~~ ✅ (2026-07-12, second session —
   geometry/storage migrated; sliced far-field build, Ewald split, gatherNear,
   double buffer all intact. Far field now builds into a lattice-aligned
   WINDOW over the cluster, so build cost still tracks the cluster, not the
   span. Collision heat = its own 'gravityCollision' renter, decay byte-same.)
3. ~~**SunGravMap → read-only renter**~~ ✅ (2026-07-12, second session —
   private anchor math dead, analytic near ring + grow-from-sun law intact,
   hot path reads cached lattice scalars.)
4. ~~**Cheap channels**~~ ✅ loose-debris density ('looseFields', PAINT law)
   + plane occupancy mask ('planeFields', PAINT with **OR-blend** — Noon
   approved 24-plane cap; maskAt / hasPlane / otherPlanesAt, never smoothed)
5. ~~**Dormancy absorbs the fields**~~ ✅ senses VETO cold, never grant it:
   `contact` at current+mid, `threat` on the FUTURE path (dodges self-trail).
   Knobs dormancySenses / SenseThreat (0.35) / SenseContact (1.0) — container
   guesses, POCO tunes.
6. ~~**Nova caller wiring**~~ ✅ the whole Nova FEATURE landed (js/core/nova.js):
   spawn = heat + force ring + real debris, splice-don't-flush; buffered
   8..240-frame trail animation baked via QueOps under a memory cap; own
   panel. OPEN: gameplay detonation triggers (Noon's design call) + whether
   BurnMap's fixed 500px nova footprint should scale with nova.radius.
7. **Render calls + drawing operations pass** (Noon: after the above is
   implanted good — still parked on the POCO numbers)

## LANDED BEYOND THE LIST (2026-07-12, second session)

- Ghost honesty pass: ForceField.ghostScale (ghost feels the field decayed
  to ITS tick) + coast-hit pulse through QueOps capture.
- Spring solver tiers 1–5: hypot→sqrt, batched counter, baked constants,
  springFastLen knob (off), springSoA typed views keyed by body.id (on).
- Ceilings lifted: QueOps AUTO→1024 / manual→4096, cache HARD_CAP→4096.
- PACKED CACHE: persistent working set + typed-array snapshots + keyframes
  on structure change + in-place playback. ~8× memory, ~180 allocs/tick
  instead of ~29k. cachePacked knob (on), legacy is the A/B control.
- NEW LAW: ghost-capturable QueOps ops carry ids/numbers, never object refs.

## DEVICE — the gates (POCO + high-end), one session

- **MsProbe split at 80p:** grav / spring / coll / cache.topUp shares — the
  number that has gated three sessions of architecture. FIRST.
- **MIGRATION GATE (new):** physics.gravField deposit/build ms vs the panel's
  pre-migration memory at the same body count; weight-map overlay sane
  (green window rect = built far-field region); FIELDS census shows
  gravityField(3) gravityCollision(2) sunGravMap(2) looseFields(1).
- **FIELDS panel:** confirm renters=9, channels=18, and what the map
  machine costs (compare frame time mapRuleOn 0 vs 1)
- **×12 retest:** tunneling gone? coastHit flashes on the impact grid?
- **cacheDirtySubsteps = half of SUBSTEPS:** fps gain vs playback drift
- **Dormancy cold%** from debugInfo with Stage 2 on
- **Sun map A/B:** physics.grav with sunGravMap 1 vs 0 (container says
  analytic wins; POCO gets the deciding vote)
- **Console:** subjects collapsed + badges, FRAME SKIPPING pinned top,
  8 recovered knobs present

## HOUSEKEEPING

- ~~Drop `th_nova-gravity-maps.md`, `th_map-rule.md` into `docs/thoughts/`,
  this file into `docs/todo/`~~ ✅ filed
- Orphan sweep still pending: softbody.js, texture-atlas.js, instructions.js,
  debug-style.js, ads.js (delete or archive)
