# to_map-rule-finish — the steps to close the Map Rule build

**Written 2026-07-12. Prime goal unchanged: 160 planets · 60 fps (baseline 80p@60).**

## CODE — migration debt, in order

1. **BurnMap → renter** (smallest outlaw, proves no-behavior-change migration)
2. **GravityField weight grid → renter** (biggest; sliced far-field build must
   survive intact — migrate geometry/storage only, keep its build logic)
3. **SunGravMap → read-only renter** (drops its private cell math, keeps the
   analytic near ring + growth law)
4. **Cheap channels:** loose-debris density (one deposit per loose particle),
   plane occupancy mask
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
- **FIELDS panel:** confirm renters=5+, channels=13+, and what the map
  machine costs (compare frame time mapRuleOn 0 vs 1)
- **×12 retest:** tunneling gone? coastHit flashes on the impact grid?
- **cacheDirtySubsteps = half of SUBSTEPS:** fps gain vs playback drift
- **Dormancy cold%** from debugInfo with Stage 2 on
- **Sun map A/B:** physics.grav with sunGravMap 1 vs 0 (container says
  analytic wins; POCO gets the deciding vote)
- **Console:** subjects collapsed + badges, FRAME SKIPPING pinned top,
  8 recovered knobs present

## HOUSEKEEPING

- Drop `th_nova-gravity-maps.md`, `th_map-rule.md` into `docs/thoughts/`,
  this file into `docs/todo/`
- Orphan sweep still pending: softbody.js, texture-atlas.js, instructions.js,
  debug-style.js, ads.js (delete or archive)
