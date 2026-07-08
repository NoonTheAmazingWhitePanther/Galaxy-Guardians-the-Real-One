# SUMMARY — Session Handoff (2026-07-06, FINAL)
*For the next conversation. Read TODO.md alongside; TREE.md says 89 modules.*

## What shipped this session (all validated, staged, needs full server restart)

### 1. GRAVITY GRID — planet gravity via weight map (SHIPPED)
- `js/core/field-grid.js` — generic N-channel lattice (gravity is tenant #1;
  density maps / dormancy heat / flow fields rent the same cells later).
- `js/modules/physics/gravity-field.js` — GravityField singleton:
  - Weight map: Σm + center-of-mass per cell ("how much gravity and where").
  - ONE for the Sun (stays analytic/exact per particle) · MANY for the planets
    (cell aggregates, double-buffered force frames built in slices).
  - Smooth Ewald-style force split (R2 = near×cell, R1 = R2/2, smoothstep).
  - **gatherNear de-aliasing** — subtracts each near cell's blended aggregate
    share (same 4 corners/weights as the sample) and adds exact per-body
    forces. Took mean error 8.9% → 0.5%. More accurate than the shipped
    legacy cull (1.67% vs 2.4% mean at defaults).
  - Sleeps below `gravGridMinBodies` (80) — mode SMALL; wakes at scale.
    2× speedup @400 bodies, 6× loose. Dominant body tracked (the "sun role").
  - `ghostMode` flag: FutureCache sets it around ghost stepping — predictions
    always use the exact legacy loop (never a stale field).
- tick.js applyGravity: sun analytic → grid sample + gatherNear → legacy
  fallback (off/ghost/warmup/outside box). Truthful counters: gravityChecks
  now counts per-body evals; new gravityGridSamples counter.
- 16th panel GRAVITY GRID (knobs: gravGridOn/Cols 48/Near 2/MinBodies 80/
  Budget 512/Overlay). Overlay draws the weight map in world space.
- **Ghost Grid Phase 2 in TODO** — the real perf unlock: ghost stepper gets
  its own field rebuilt from ghost bodies every K ticks (that's where the
  1000-step lookahead spends gravity time).

### 2. MS PROBE TREE — hierarchical profiler (SHIPPED)
- `MsProbe.record(label, ms)` — raw-sample API, zero closures in hot loops.
- Probe map: physics.tick → {gravity, springs, collisions, cleanup, loose,
  (self)} — phases timed with raw perf.now, ONE record per tick, GHOST-GATED
  (ghost steps don't feed children or they'd sum past their parent).
  render.drawAll → {tween, stars, sun, trails, bodies, particles, flashes,
  overlays, flip}. Plus physics.gravField/cacheTick/snapshot, cache.topUp,
  dormancy.tick, queops.tick, debug.panels.
- New `msProbeTree` line type in panel.js: dot-path hierarchy (child = longest
  probe prefix), collapsible headers show own last·avg·max always
  (headerValue in debug-renderer), children heaviest-first, ▲/▽ markers,
  synthetic (self) row = unprobed remainder. Auto-nests any future
  'parent.child' label — no config needed.

### 3. UI MEGA-PASS (SHIPPED)
- Ships at ×2 ratio (psOverall seed 2.00, clamp→3.00), viewZoom default 0.55.
- 👓 glasses satellite (#dbg-glasses, −32° ray): 3 clicks cycle ×1→×2→×3 for
  panels (psOverall) AND console (CSS zoom, layout-compensated in _layout).
- Header band on all panels: title left (1.25× bold), doubled+spaced icons
  from shared `headerIcons(pw, sc)` in panel-style.js — renderer and hitTest
  use the SAME function (visible ⟺ touchable by construction). Summary value
  moved to its own row below-right. `_fit()` ellipsis keeps one-liners.
- Console: lazy per-variable sliders — press a row's label/value → slider
  materializes (range frozen at creation from rec.gov min/max/step); thumb
  tweens (0.28 lerp) writing through per animated frame. window._ConsoleView.
- SELECTION BOX is a real panel: headline band "SELECTION BOX", 6 icons
  (📌⛶▼⤓ + ⇆ row + ⇅ column), band-drag moves the group, ⊿ BR grip scales all
  members proportionally (positions + contentScale from box origin).
- View zoom pivots on the debug table centroid (in-ui _applyViewZoom).
  PrefsStore._fixViewCoords() recenters at startup if restored pan is
  off-screen. Panel persistence rule already held (PANEL_FIELDS, two-phase).
- Layout history: DebugRouter snapshotLayout/undoLayout/redoLayout (ring 60,
  panels-arrangement only; hooks on arranges/drag-end/group actions).
- TETRIS FAN (`js/modules/debug/tetris-fan.js`, ▦ tap toggles it):
  Top line = profiles (👤 GGPrefs.load · profile names · 🏆 Benchmark
  setBase+BALANCE). Bottom = ⇉ H/V sequential (toggles major) · ▦ tetris
  (hold: baked config positions) · ↶↷ layout undo/redo (hold: session
  start / first recorded) · ⊕⊖ ratio ±0.25 · ⇅ sort sub-fan (Ms heavy,
  ⚡ max÷avg spikes, 1k) · ▤ categorized rows (CATEGORY map by panel id).

### 4. CYCLE — ground truth of the 1000 law (SHIPPED)
- `js/core/cycle-meter.js` — counts ACTUAL steps drained from the physics
  accumulator (vs FpsCounter.avgVirtual, the derived figure — both shown).
  stats: {target, physSec, virtual, renderSec, lawPct, bankMs, stepsFrame}.
- 17th panel CYCLE: cycleTarget knob (100–4000, default 1000) — "you decide
  the law." Wired in main.js after the substep loop + paint() in render.
- Tetris 1k sort uses it: under law → heaviest probe first; met → lightest.

### 5. GATES + PIPELINE (SHIPPED) — the wire system's actuator
- `js/core/gate.js` — Gate.declare(label, {every|mute}) / Gate.pass(label).
  Undeclared = free pass. **Same dot-labels as MsProbe: the measurement
  namespace IS the control namespace.** window.Gate for console use.
  Verified: alternation/mute/clear correct.
- Pass points live at: all DrawAll passes, physics.gravField, dormancy.tick,
  cache.topUp, debug.panels. Ex: Gate.declare('render.drawAll.sun',{every:2}).
- REALITY CHECK (decided): deferrable work → QueOps lanes; synchronous hot
  path → Gates, NEVER the queue (overhead kills the 1000 law). QueOps grew
  lanes: input, debug, cache, theme, wires (+ existing nine).
- Per-line presentation delay: any debug-config line takes `refreshEvery: N`
  (memoized rows in panel._lineMemo, re-resolve every Nth layout).

## Late-session fixes (after first summary — all staged)
- **BRUSH**: new knobs in PLANET BRUSH panel — `brushDensity` (ms between
  paints, 4–500, default 4 = rapid; the FLOW) and `brushSpacing` (px of
  stroke between stamps, 4–200, default 20; the TOOTH — was hardcoded 90,
  the real slowness). Plant requires BOTH gates. 4-plane round-robin
  confirmed intact (_plantBrush cycles planes so dense strokes don't
  explode). Wires can push past knob ranges — ManualOverrides.set is never
  range-clamped (only panel governors clamp).
- **BEST PREFERENCES button removed from screen**: `#bench-btn` has
  `display:none !important` in styles.css (overlapped the UpdateFeed line).
  DOM + JS wiring intact; benchmark reachable via Tetris fan 🏆. Restore =
  delete one CSS rule. TODO "Pin beside BEST PREFERENCES" waits on redesign.
- **Opened panels**: minimum width DOUBLED (180→360, formula ×2) so the
  complete title + full icon row fit. Icon order now 🖌 ⤓ 📌 ⛶ ▼ — the
  ▼ open/close is LAST (rightmost). One edit in headerIcons(); renderer +
  hitTest share it, so visible ⟺ touchable held automatically.

## Top pending (see TODO.md for full specs)
1. **PORTS: knobs out, holes in** — opened panels drop +/=/− triplets for
   knobs + AUTO/MANUAL toggles; minimized panels show INPUT HOLES (title
   beneath) for manual variables. Minimized face = patch face. UI needs
   Noon's live eye — plumbing (registry paths, gates, wires lane) is ready.
2. **Action Panels**: Math, Cycle (Gate's face), Color Palette, then
   Logic/Envelope/Random. Visual scripting layer per manual variable
   (wire map on the `wires` lane, settle limit).
3. **Ghost Grid Phase 2** (FutureCache's own field) + msProbeTree audit of
   any new instrumented paths for ghost gating.
4. 🍪 Cookies consent = PRIME №1 before public (gate at PrefsStore.save()).
5. Replay research object (pointer stream w/ timestamps+deltas, deterministic
   rerun, forkable lineage, share complete replays cross-instance) ·
   community Ms averages JSON (accept/long-click revert) · blueprints wires ·
   live-stream visual coding · Rick & Morty metaverse portals (planes =
   docking bay, replays = transport).
6. Older carry-overs: Dormancy Stage 2, Planet/Statistics panels, plane
   tints, Invaders Layer, Pin beside BEST PREFERENCES, leaderboards,
   speed-triggered shooting particles.

## Locked rules (unchanged, in force)
node --check all JS + Python-validate JSON before staging to
/mnt/user-data/outputs preserving the js/ tree · draw only inside
shouldRender() · visible ⟺ touchable (AIMS) · full server restart after any
change (ES module URL caching, localhost:7700) · fixed timestep 0.016,
accumulator never discards banked time except true overload · panel moves
call window._InAims.syncDebugPanels() · ManualOverrides.get(key, autoValue)
returns registry value ONLY when isManual — inline fallbacks are the real
defaults · new persistent panel state goes through PANEL_FIELDS/prefs, never
ad-hoc storage.

## Key numbers
GRAV_CONST 120 · SUN mass 182784 · softening d2+300 (bodies) / d2+500 (sun) ·
legacy cull d2 > b.mass*10000 · grid defaults cols 48 / near 2 / minBodies 80
/ budget 512 · panel ratio ×2 ship, viewZoom 0.55, zoom range 0.15–2.50 ·
17 panels · 89 modules · repo GPL-v3, NoonTheAmazingWhitePanther.
