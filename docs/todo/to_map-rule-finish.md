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
4. **Cheap channels:** ~~loose-debris density~~ ✅ ('looseFields', PAINT law,
   repainted in tickLoose) · plane occupancy mask — OPEN DECISION first:
   bitmask-per-cell breaks under summation (16 plane-0 bodies read as bit 4);
   per-plane count channels need a fixed plane cap. Noon's call.
5. **Dormancy absorbs the fields:** `threat` + `contact` around a body as
   classifier senses alongside the FutureCache oracle — the last mile of
   "smoothed results over and over until need to change"
6. **Nova caller wiring** when the Nova feature lands (`NovaFields.explode`
   is ready and waiting)
7. **Render calls + drawing operations pass** (Noon: after the above is
   implanted good)

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
