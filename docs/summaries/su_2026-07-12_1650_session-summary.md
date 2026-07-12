# su_2026-07-12_1650_session-summary — PHYSICS GRIDS UNDER THE LAW

**GravityField + SunGravMap migrated under the Map Rule. Loose density added.
Container-verified; POCO gate pending. Prime goal unchanged: 160p@60 (baseline 80p).**

## GravityField → renter (the biggest outlaw, in)

Storage/geometry migrated ONLY — the sliced far-field build, Ewald smoothstep
split, gatherNear near-correction, double buffer, ghost mode, sleep threshold
all survive byte-honest. What changed:

- **Two renters** (SEPARATION RULE): `gravityField` (m·mx·my) and
  `gravityCollision` (hard·soft). Both cellSize 250 — reproduces the classic
  48×48 over the 12000 default span. `gravGridCols` knob lives on as the
  renter's **resBias** (cols/48) × the mapRuleRes dial; effective floor is 12
  cols (law clamp 0.25), panel min 8 is now cosmetic.
- **Bounds hysteresis is DEAD** — ALIGNMENT LAW anchor (sun ± span/2). No
  re-anchoring, no wandering box, no reanchor collision-wipe.
- **Mass moved PAINT → DEPOSIT law**: per-body delta deposits keyed by
  body.id (obj ref fallback), retire-by-seen-set. No O(cells) clear per rAF.
  Smoke test: mass conserved EXACTLY through move + 15 retires.
- **The far-field frame is now a WINDOW**: frozen back-frame covers occupied
  cell bbox + classic pad (15% + 600px), snapped to whole lattice cells —
  build cost tracks the cluster, not the span (smoke: 36×36 window inside the
  48×48 lattice at 120 bodies). Outside window → legacy fallback, as before.
  Overlay draws the built window as a green rect.
- **Collision heat**: renter storage, PRIVATE per-rAF decay preserved
  byte-identical (0.94, 0.05 floor) — contract decay {} on purpose; the
  tick-indexed PULSE law can claim it later if wanted.
- **Sleep now wipes** the gravity renter (census/overlay honesty); collision
  heat freezes through sleep exactly as before.
- **smoothing: 0 contract** (new law option): gravity + sun + collision
  renters never blur — their product is the RAW grid. Blur would corrupt COMs.
- occ snapshot entries slimmed to {x,y,gm} (cx,cy were write-only).

## SunGravMap → read-only renter

Private anchor math dead; analytic near ring + grow-outward-from-sun row law
intact. Cell pitch fixed at the contract's 46.875px (12000/256 heritage) —
**span/res now scale cell COUNT (cap 512), not pitch** (old: 256² always,
pitch scaled). Hot path reads scalars cached once per update() from the
lattice — zero property chains per particle. Smoke: 100% coverage in 32
ticks, 0.996% vs analytic at 3.6kpx, near ring falls back, span knob 12000→
16000 re-anchored to 341 rows and regrew.

## THE ANCHOR WATCH (map-rule.js, new law enforcement)

`MapRule.anchorWatch()` — 3 compares; on sun move or sunMapSpan change every
renter re-anchors (deposits void, `version` bumps). **Fixes a latent bug:
before this, a sunMapSpan knob change never re-anchored existing renters.**
Physics renters self-drive geometry (anchorWatch + _applyResolution in their
own updates) so gravity/sun stay honest **even with mapRuleOn 0** — the
lattice is storage; mapRuleOn gates awareness deposits only. Renters now
carry `version` (owners invalidate caches on it) and `wipe()`.

## Cheap channel: looseFields

`looseFields` (density, cellSize 192) under the PAINT law — cleared at
tickLoose top, one splat per surviving particle, ghost-gated, mapRuleOn-gated.
**Plane occupancy mask NOT built — open decision:** bitmask-per-cell breaks
under summation (16 plane-0 bodies read as bit 4); per-plane count channels
need a fixed plane cap. Noon's call, filed in to_map-rule-finish.md.

## Census after this session

10 renters / 22 channels once all are declared (declaration is lazy — FIELDS
shows only what has woken): bodyFields(7) novaFields(2) collisionFields(1)
impactField(1) forceField(2) burnMap(1) gravityField(3) gravityCollision(2)
sunGravMap(2) looseFields(1).

## Container verification (node smoke, browser-stubbed)

- Grid+near vs exact O(n²): 0.03–1% far probes; center-of-ring probe abs err
  0.018 vs typical single-body force 0.22 (relative % meaningless at net-zero).
- Ghost gates hold (noteCollision refused in ghost, lands live).
- Collision decay drains to floor; hot count 0 after 30 frames.
- ForceField implant/absorb + threat decay + smoothing all still work under
  the modified Renter; gravity's smoothed buffer stays all-zero (smoothing 0).
- All touched files pass `node --input-type=module --check < file.js`.

## Files touched

`js/core/map-rule.js` (resBias · version · smoothing:0 · anchorWatch · wipe ·
LooseFields) · `js/modules/physics/gravity-field.js` (rewritten under the law)
· `js/modules/physics/sun-grav-map.js` (rewritten under the law) ·
`js/modules/physics/tick.js` (LooseFields import + paint, 3 lines) ·
`docs/todo/to_map-rule-finish.md` (moved from thoughts/, progress marked).
gravitygrid.json untouched — every knob and stat binding preserved.

## OPEN — next session

1. **DEVICE GATES, unchanged and still first:** MsProbe grav/spring/coll/
   cache split at 80p on the POCO. Plus the new MIGRATION GATE: gravField
   deposit/build ms at same body count, overlay sane, FIELDS census.
2. Plane-mask semantics decision (bitmask vs per-plane counts).
3. Dormancy absorbs threat/contact (step 5); nova wiring (6); render pass (7).
4. Orphans: softbody.js, texture-atlas.js, instructions.js, debug-style.js,
   ads.js.

## Cautions for the next instance

- gravity-field.js ↔ map-rule.js is now an ES module CYCLE — safe because
  both touch each other only inside methods (lazy). Never add top-level
  reads of GravityField in map-rule or MapRule in gravity-field.
- If gameplay drifts beyond sun ± span/2, the weight map clamps outside
  bodies to edge cells and particles out there ride the legacy loop — raise
  sunMapSpan if that ever shows in directFalls.
- Full server restart after these module changes (ES module URL cache).
- `node --input-type=module --check < file.js` piped — ALWAYS.
