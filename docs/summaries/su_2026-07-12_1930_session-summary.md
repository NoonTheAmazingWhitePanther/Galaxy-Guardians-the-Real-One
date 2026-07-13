# su_2026-07-12_1930_session-summary — NOVA · SPRINGS · THE PACKED CACHE

**Continuation of su_2026-07-12_1650 (physics grids under the Map Rule).
This half: the Map Rule finish list CLOSED (except the parked render pass),
the Nova feature born, the spring solver rebuilt in five tiers, every
QueOps/cache ceiling lifted, and the FutureCache repacked for depth 1024.
All container-verified; the POCO session is now the gate for EVERYTHING.**

## Map Rule — finish list closed

- **PlaneFields** — PAINT law with OR-blend (the third blend): BodyFields
  ORs 1<<plane over each body's footprint per live tick. 24-plane cap
  (float32 exact-int limit). Never smoothed. maskAt / hasPlane /
  otherPlanesAt (merge-clearance sense, waiting for mergePlanes).
- **Dormancy senses** — fields VETO cold, never grant it. contact at
  current+mid; threat absorbed on the FUTURE path (own trail is behind,
  path is ahead — self-trail dodged); barely-movers skip. Knobs
  dormancySenses(1) / SenseThreat(0.35) / SenseContact(1.0) — POCO tunes.
  debugInfo shows `senses: T{n} C{m}`.
- **Ghost honesty** (th_nova law enforced): ForceField.ghostScale — a ghost
  tick feels the force ring decayed to ITS tick (0.96^ahead, one pow per
  substep, <1% reads as cold and skips). Coast-hit ImpactField pulse now
  rides QueOps → ghost-captured, replayed when the tick actually plays.

## NOVA (js/core/nova.js + panel) — Noon's design

PHYSICS ALWAYS, VISUALS OPTIONAL. spawn(x,y,{energy,radius,plane}):
state.novas push (BurnMap heat — zero new wiring) + NovaFields.explode
(awareness + force ring, ghost-honest) + real loose debris + splice-don't-
flush. Life decays per SIM tick (ghost-gated next to coolOne) — at ×12
everything plays 12× fast, honestly. Pool law: novaMaxActive, oldest first.

THE BUFFERED ANIMATION: novaFrames (8..240) pre-baked trail sprites per
variant — seeded coherent streak field, shock ring, core flash. Playback =
one additive drawImage per nova; frames are the high-end dial at constant
per-frame cost. Baked in QueOps ms slices (novaBakePerOp); memory law
clamps frames×px²×4×variants to novaAtlasCapMB (panel shows capped flag).
novaShow / novaShowPlane filter visuals only; novaDrawBudget round-robins.
Test Fire knob fires one and snaps back to AUTO.
OPEN (Noon): gameplay detonation triggers; BurnMap 500px footprint vs
nova.radius.

## Spring solver — five tiers

1–3 (always on): Math.sqrt not Math.hypot (the overflow-scaling tax is out
of the hottest loop — tick.js is now hypot-free), counter batched per body,
lazy-baked wA/wB/breakAt²/rest² → ONE division, break test in d².
Twin-run vs old solver: 1e-9 divergence, identical breaks.
4 (springFastLen, OFF): s = stiff·dt·(d²−r²)/(d²+r²) — exact value+slope at
rest, sqrt-free. Quality dial; POCO votes.
5 (springSoA, ON): typed views keyed by body.id — FutureCache clones fresh
spring arrays EVERY ghost tick, so array-keyed caches would rebuild per
tick; id-keyed views serve the body's lifetime, live and ghost. Values in
Float64 ON PURPOSE (f32 rounding diverged chaotic runs) → byte-equal to
legacy (0.00e+0). `broken` stays on the object (single truth).
HONEST BENCH (hrtime, interleaved, warm): legacy ×1.00 · +fast ×1.12 ·
SoA ×1.16 · SoA+fast ×1.36 container x86. Earlier "×2" claims were 1ms-
clock artifacts — the real big win vs the ORIGINAL solver is the hypot kill.

## Ceilings lifted (Noon: "1024 at least")

- QueOps: COOLING_STATES → …512, 1024 (AUTO); panel Budget ladder → 4096;
  queue trim 600/500 → 3000/2560 (queue smaller than budget starves it).
  NOTE: queops.json exists TWICE (core/ + panels/) — both synced.
- Cache: HARD_CAP 1000→4096, AUTO_MAX synced, panel max 4096; Target Ahead
  became a mult ladder (1·60·250·512·1024·2048·4096) — was 400 presses.

## THE PACKED CACHE (future-cache.js) — the 1024 enabler

Object clones cost ~3MB/tick at 160p (≈3GB at 1024) + ~29k allocs/ghost
tick. Now: shallow body DESCRIPTORS (Dormancy/TrajectoryPreview/splice all
read them unchanged) + Float64Array 5/particle (x y vx vy heat; fx/fy zero
at tick start, never stored) + Uint8 dead/broken. ~8×, ~180 allocs/tick.

PERSISTENT WORKING SET: the ghost stops cloning per tick — one graph lives
at the frontier and keeps stepping. Seeded from LIVE only, only when null;
null ⟺ empty buffer (invalidate/wrap/reset enforce it). Structure change
(split/merge/death) → full-clone KEYFRAME + generation bump.

PLAYBACK: packed entries materialize IN PLACE into the live particle
objects — zero alloc, identity stable across played ticks (kinder to
selection/trails). Any pairing surprise (id/gen) → honest miss +
invalidate. Splice enters entries AND the working set (self-heal preserved);
unsplice removes from both. cachePacked knob (ON), legacy = A/B control.
Panel shows buffer MB (byte ledger).
VERIFIED: 120 conveyor ticks packed vs legacy, played state |Δ|=0.00e+0;
0.4MB vs 2.8MB at 2 small bodies; splice→keyframe→arrival; bail drains.

NEW STANDING LAW (in rules.md): ghost-capturable QueOps ops capture
ids/numbers, NEVER object refs (split op converted to id-resolution).

## Files touched (this half)

map-rule.js (PlaneFields, ghostScale) · dormancy.js (senses) · tick.js
(springs, hypot purge, split-op id, nova life, loose paint, ffScale) ·
nova.js (NEW) · future-cache.js (packed) · que-ops.js (ladder, trim) ·
governor.js (knobs, AUTO_MAX) · main.js + debug-router.js (Nova wiring) ·
panels: nova.json (NEW), manifest, physics, statecache, queops (×2 copies)
· rules.md (new laws) · readme.md (packed cache + nova, 4096) ·
to_map-rule-finish.md (closed).

## OPEN — next session

1. **THE POCO SESSION — everything gates on it now.** MsProbe grav/spring/
   coll/cache split at 80p; migration gate (gravField ms, overlay window
   rect, FIELDS census 10 renters/22 ch); sun map A/B; sense thresholds;
   springFastLen A/B; cachePacked deep-fill (watch buffer MB); QueOps 1024.
2. Collision broad-phase — FIRST verify interBodyCollisions culling; if
   O(n²), reuse GravityField.cellBodies. Then particle SoA / loose pooling
   only if the probe points there.
3. Noon's calls: nova detonation triggers · nova burn footprint · render
   pass scope (step 7) · StateCache (trail history) packing — same trick,
   untouched.

## Cautions

- rules.md prefix table says todo files are `td_` but live practice is
  `to_` — left as practice, flagged here.
- Full server restart after all this (ES module cache).
- `node --input-type=module --check < file.js` — ALWAYS.
