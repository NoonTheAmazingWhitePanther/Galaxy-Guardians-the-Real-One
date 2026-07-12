# su_2026-07-12_session-summary — conveyor · sun map · console · ×12 fix · THE MAP RULE

**Baseline confirmed by Noon: 80 planets clean at 60fps. Prime goal 160p@60 = a 2×.**
Noon deleted trails.js locally; declined a 160 benchmark tier (any number works).

## FutureCache — the conveyor (pump)

`topUp` replaced by `pump(consumed, msBudget, targetAhead)` — **THE CONVEYOR LAW
(Noon):** one tick produced per tick consumed; every logical tick computed once,
ever; depth = pure lookahead. Misses never pump (miss already paid live — no
double-pay). At ×12: 12 out, 12 in.
**THE VALVE (post-6fps-spiral):** 1:1 is a ceiling, not an obligation. One ms
budget over ALL ghost work; `_ghostMsEma` cost estimate checked BEFORE each tick
(never start an unaffordable tick; decays 0.98 when priced out so it retries).
Growth = **×1 law**: max ONE step deeper per frame. Replacement shortfall drains
the buffer gracefully → plain live grid physics, never a locked 6fps.
CacheGov `reportFill(starved)`: only genuine starvation halves AUTO target;
"not full yet" is normal fill state (old misread collapsed 1000→1 every boot).
main.js counts `cacheHitsThisFrame` in the drain loop; label stays 'cache.topUp'.

## Ghost far-cluster gravity (tick.js)

Root cause of the 6fps-on-spawn: `planet.js:78` invalidates on spawn (correct),
and ghost ticks paid EXACT O(particles×bodies) legacy gravity (grid forced off
in ghostMode) — 5–20× a live tick; the conveyor made that cost mandatory.
Fix (Noon's cluster/offset design): `prepGhostFar()` once per ghost tick — N²
COM pass; FAR pairs (> rA+rB+`cacheFarDist` 400px) collapse to per-body force
offsets; NEAR stay per-particle exact. ~16× cut. Knob `cacheFarCluster` (ON).
Live path untouched.

## Sun Gravity Map (Noon's order — built over my measured objection)

Container benchmarks: analytic sqrt 0.104ms/frame whole-scene; grid bilinear
2.7× SLOWER; nearest-cell ties with 2.2% error. Sun bill ceiling = 0.1ms. Also
`a=a+1` loop lost to sqrt loop 67ms vs 30ms (dependency chain vs pipelining).
Noon insisted; built knob-gated: `sun-grav-map.js` (NEW, js/modules/physics/) —
256², geometry-only cells (mass/G/gm factored to apply time → mass changes and
bursts FREE, sqrt paid once per cell ever), grows outward from the sun's row
8 rows/live-tick, analytic-exact inside `sunMapNearR` 1500px and outside span.
Knobs: `sunGravMap` (ON per Noon), `sunMapNearR`, `sunMapSpan` (12000 — now
also THE ALIGNMENT LAW anchor). **A/B on device: physics.grav with knob 1 vs 0.
SUN import is from state.js NOT config.js.**

## Debug console (console-view.js)

Subjects COLLAPSIBLE, default collapsed; header badge AUTOMATED / MANUAL
(amber; any manualKey'd row with isManual). Collapse persists
(localStorage 'gg-console-collapse'). Collapsed subjects skip row repaints.
**FRAME SKIPPING** pulled from home panels, pinned top as its own subject
(regex /frameskip|skipbase/i); all other subjects alphabetical; rows
alphabetical inside. Knob audit: 76 total, 64 were exposed; 8 recovered
(4 undo internals excluded): statecache.json += Vault Size, Snap Interval,
Far Cluster, Far Dist; queops.json += Skip Thresh; gravitygrid.json += Sun Map,
Sun Near R, Sun Map Span (+ later Map Rule ×3).

## ×12 tunneling fix

Root cause: `SCAN_INTERVAL_MS=180` wall-clock — at ×12 that's ~130 sim ticks >
the 120-tick horizon; classifications expired before refresh; K×dt coast jumps
crossed bodies. Fixes: (1) dormancy rescan now TICK-based — every horizon/3
sim ticks OR 180ms, whichever first; `Dormancy.wake(id)` added. (2) **Swept
coast check** (tick.js post-COM): each catch-up jump ray-cast launch-COM →
landed-COM vs same-plane circles (quadratic, exact crossing = the /100
interpolation in closed form); on hit: clamp back to `bestT−0.02`, flag
`body.coastHit` + `body.coastHitT` (fraction inside the jump = moment of
explosion), wake, ImpactField pulse.

## THE MAP RULE (js/core/map-rule.js — NEW)

Noon's architecture, committed. Laws:
- **ALIGNMENT LAW:** one shared anchor (sun-centered, `sunMapSpan`) for every
  grid; resolution may differ, world bounds may not. Same X,Y everywhere.
- **SEPARATION RULE:** every concern gets its OWN renter; never new channels
  on someone else's grid (tuning decay can't disturb another's iteration).
- **Write laws:** (1) DEPOSIT — persistent ids, delta-tracked (+1/−1: same
  cell → value diffs only; moved → subtract old cell, add new; unchanged →
  zero writes). (2) PULSE — fire-and-forget splat, decay-retired (decay is
  MANDATORY on pulse channels). (3) PAINT — clear-and-repaint per tick,
  max-blend, no decay (BurnMap founds it).
- Decay is TICK-indexed (ghost/stream honest). Smoothing = box blur raw →
  smoothed buffer every `skip` ticks; absorb() reads SMOOTHED. Ghost guard:
  deposits refused in ghostMode. `scene()`/`watchScene()` = benchmark eyes.
- ABSORPTION LAW: fields carry awareness/styling/far influence; contact
  resolution + springs stay pairwise-exact, always.

**Renters (6, 14 channels):** bodyFields (weight·heat·momX·momY·threat·
kinetic·count — delta per body COM per live tick, threat decays 0.985),
novaFields (energy·chaos; `explode()` also implants radial ForceField ring),
collisionFields (contact; marked per colliding pair midpoint in collisions.js),
impactField (pulse; from real impulses + coast hits), forceField (fx·fy =
ACCELERATION; `implant()` = force command; hot 240 ticks after implant,
absorbed per-particle in tick loop while hot, one boolean when cold),
burnMap (heat; MIGRATED — same API/math; old private grid's negative-coords
blind spot fixed by the Alignment Law; coverage now sun±span/2).
Knobs: `mapRuleOn`, `mapRuleRes` (tessellation dial 0.25–4), `mapRuleSkip`.
FIELDS panel (fields.json + manifest) shows live census via `MapRule.stats`;
MapRule registered in debug-router.js. Console test commands:
`ForceField.implant(0,-2000,0.5,0,600)` · `NovaFields.explode(x,y,2000,900)`.

## Docs written (Noon to file)

`th_nova-gravity-maps.md`, `th_map-rule.md` → docs/thoughts/;
`to_map-rule-finish.md` → docs/todo/ (the full remaining list); this file →
docs/summaries/.

## OPEN — next session

1. **GravityField → renter** — deliberately deferred to a fresh session (585
   lines; migrate geometry/storage ONLY, the sliced far-field build must
   survive intact). Then SunGravMap read-only renter; cheap channels (loose
   density, plane mask); Dormancy absorbs threat/contact as senses.
2. **DEVICE GATES (still unrun, gating everything):** MsProbe grav/spring/
   coll/cache split at 80p; mapRuleOn 0-vs-1 frame cost; ×12 retest;
   `cacheDirtySubsteps` = half; Dormancy cold%; sun map A/B; console check.
3. Orphans pending: softbody.js, texture-atlas.js, instructions.js,
   debug-style.js, ads.js.

## Cautions for the next instance

- Noon's PrefsStore/localStorage runtime prefs can shadow new Base defaults
  (`dormancyStage2` flipped to 1 this session — verify it took).
- Panel JSONs are fetched — hard reload after config changes; full server
  restart after any module change (ES module URL cache, localhost:7700).
- `node --input-type=module --check < file.js` piped — ALWAYS.
- Container benchmark verdicts (sun map, add-vs-sqrt) are on record; the
  POCO holds the deciding vote. Don't relitigate without device numbers.
