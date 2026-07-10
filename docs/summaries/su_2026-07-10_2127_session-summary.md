# Session Summary — Galaxy Guardians
**Timestamp:** 2026-07-10, 21:27 (local)

## Context

One long continuous session (this file replaces an earlier partial draft
of itself, `su_2026-07-10_1247`, written mid-session before being told
to hold off on rewriting it every turn — recreated here as the single,
complete record now that the session is winding down toward doc sync).
Ten rounds, roughly: a batch of live-tested bug fixes on the AIMS/
satellite work from the prior session, then a brand-new feature (the
Selection Panel and its attached zoom box) built and iterated through
several distinct redesigns in direct response to live feedback, then a
closing pass syncing `readme.md`/`rules.md` to match everything that
shipped.

---

## What Shipped, In Order

### Round 1 — live bug-report triage (6 items, all confirmed working)
1. **`dbg-expand` (⛶)** — was expand-only, no way back; now a real
   toggle (minimizes everything if already fully expanded).
2. **Tetris Fan menu invisible** — `tetris-fan.js`'s `_blob()` depended
   on a `.dbg-sat` CSS class deleted in an earlier session when
   satellites went canvas-drawn. Restyled inline.
3. **AIMS dead inside Debug/Console/Panels** — two causes, see Real Bugs
   below (`in-debug.js`'s marquee-arm, `console-view.js`'s
   `stopPropagation`).
4. **"Glasses" ratio satellite (👓) "doesn't work at all"** —
   `panel.js`'s `computeLayout()` called `PanelStyle.apply()` *after*
   the shrunk-state early return.
5. **Selection Tool "does not work on the physical canvas"** — capture
   itself was fine; `SelectionTool.update()`/`render()` were simply
   never called anywhere in `main.js`.
6. **Pinned-panel gold title line redesigned** — one static 3px bar →
   two thin animated strands (gold ⇄ white crossfade), moved out of the
   cached chrome layer since it now animates.

Confirmed by direct testing: *"Ok good job. Everything seems to work
good for now."*

### Round 2 — snap guides + first Planet(s) Panel attempt
7. **Panel alignment guides "too many white lines"** — was drawing all
   7 candidate lines from every other visible panel, dimmed when not
   aligned (100+ lines on screen with this project's usual 15-20 open
   panels). Now only draws lines actually aligned with the dragged panel.
8. **First Planet(s) Panel build** — a standalone DOM overlay
   (`planet-inspector.js`) mirroring `zoom-enhancer.js`'s crop technique
   for a live magnifier, plus a vitals card. **Later fully superseded**
   (see Round 4) and the file deleted — noted here only for the
   through-line to what replaced it.

### Round 3 — the real "pops for one frame" bug
9. **Root-caused a genuine data-identity bug**, not a rendering issue:
   `future-cache.js`'s ghost-simulation cache-ahead system periodically
   swaps `state.bodies` to freshly-cloned objects (same `.id`, different
   identity) on every cache-hit tick. `SelectionTool` was checking
   survival by object reference — failed the instant the next cache-hit
   landed. Fixed with `SelectionTool._resolveLive()`, re-resolving
   captured bodies by `.id` every frame instead of trusting a stale
   reference. This is the fix that made the whole feature viable at all.
10. Pin/close behavior added to the (still standalone) DOM overlay —
    superseded along with it in Round 4.

### Round 4 — "make it a normal Panel" (major refactor)
11. Retired the standalone DOM overlay entirely. Built instead:
    - `js/core/selection-vitals.js` (new) — live vitals data source,
      registered in the Governor's variable registry like any other
      panel data source (`FpsCounter`, `MsProbe`, etc.).
    - `js/modules/debug/panels/selection.json` (new) — a normal panel
      config, same schema as every other panel.
    - `DebugRouter.syncSelectionPanel()` — auto-pins/shows the panel on
      a fresh (0→N) capture, auto-hides/unpins on full deselect (N→0).
      Only acts on the transition, never fights manual drag/pin/minimize
      in between — that's what makes "close it, stays closed until a
      new selection" and "drag it anywhere, it remembers" both free.

### Round 5 — zoom box attached to the panel, grouped dragging
12. New `js/modules/debug/selection-panel-extras.js` — the zoom box,
    scrolling vitals ticker, and eye show/hide toggle, all attached
    directly to the panel and drawn from inside its own transformed
    rendering (not a separate DOM element). One `layout()` function is
    the shared source of truth for both drawing and hit-testing, which
    is what makes grabbing the box or ticker move the whole assembly
    exactly like grabbing the panel's title bar — no separate tracking.

### Round 6 — bigger, bolder, consistent buttons
13. All controls (arrows, +/-, eye) unified under one shared
    `_drawButton` look (filled background + border + glyph) and bumped
    16px → 22px — the arrows used to be bare faint triangles with
    nothing behind them, easy to miss and inconsistent with the other
    controls' own solid look.

### Round 7 — satellite re-spacing, AIMS Blueprint, PrefsStore
14. **`dbg-sat` fan re-spaced evenly** — was `-32°/16°/40°/64°/88°` (a
    48° gap between the first two rays, 24° everywhere else); now
    `-32°/-2°/28°/58°/88°`, 30° apart every step. Endpoints unchanged,
    verified by script (not by eye), caught and fixed a 0.001 rounding
    slip in the process.
15. **`aims-sat` fan** re-spaced too (`-32°/-8°/16°/40°`, was
    `-32°/-7°/16°/40°` — a 1° rounding artifact, now exact).
16. **AIMS Blueprint auto-showing** — `InAims.showMap` defaulted to
    `true`, so the dashed candidate-rectangle overlay appeared the
    instant AIMS turned on. Default now `false`; 🗺️ still toggles it.
17. **Pinned panels not surviving a reload** — see Real Bugs below
    (`DebugRouter.init()` never awaited).
18. Guard added so the Selection panel's dynamic show/hide isn't
    clobbered by a stale restored `pinned` flag from before the reload.

### Round 8 — Fit button + master knob
19. **Fit** — new 4th corner button (bottom-left). Centers the offset
    and sets zoom to exactly frame the whole selection rect in one tap.
    Turned out `zoomT=1` was already exactly this target by definition
    (the box's own max-zoom is "the selection's bounding rect fills the
    box") — Fit just jumps straight to it.
20. **4-corner layout**: zoom-out (top-left), zoom-in (top-right), Fit
    (bottom-left), eye (bottom-right, repositioned to align with the
    other three) + the 4 edge pan buttons = 8 controls total.
21. **Master knob connected** — new `ManualOverrides.selectionPanSpeed`
    (0.1–2.0), wired through the same `minimizedKnob` mechanism every
    other panel's master knob already uses (e.g. Planet Brush's size
    knob) — real drag support for free. Straight multiplier on the
    original pan/zoom strength (2.0 = full original speed); ships at
    1.0 → 50%, per direction ("make it into 1.0, half of the current").

### Round 9 — tap-toggle-to-extreme + HTML button hold-gate rule
22. **Redesigned pan/zoom from hold-to-repeat to tap-toggle**: a tap on
    any of the 6 pan/zoom controls now starts continuous movement toward
    that control's extreme, running on its own every frame regardless of
    whether a pointer is still touching the screen, until it reaches the
    bound naturally OR a second tap on the SAME control stops it early —
    wherever it stops is the new offset/zoom, no snap-back. Reaching the
    actual bound auto-stops it the same way a second tap would. Starting
    one direction clears its direct opposite (running both would net to
    zero movement); pan and zoom are independent and can run together.
    Simplified `in-debug.js` considerably — these are instant taps now,
    same treatment as Eye/Fit, no more pointer-capture/hold-release
    bookkeeping.
23. **New standing rule, applied to `debug-btn`/`aims-btn`/
    `selection-btn`**: a long press can only change an ALREADY-active
    button's secondary state, never a backdoor way to also turn the
    button on. All three had their hold timer firing its secondary
    action (console mode / cycle AIMS profile / cycle capture mode)
    regardless of whether the button was even on yet. Now gated —
    documented as a standing rule in `rules.md` §9.

### Round 10 — doc sync (this round)
24. `readme.md` / `rules.md` brought back in sync with everything above
    — see the diffs themselves for specifics; summarized in "For Next
    Time" below since it's mechanical, not a design decision.

---

## Real Bugs Found & Fixed (named specifically)

1. **`DebugRouter.expandAll()`** — one-way action, no toggle-back path.
2. **`tetris-fan.js`'s `_blob()`** — depended on a CSS class deleted in
   an earlier session.
3. **`in-debug.js`'s marquee-arm** — claimed every real empty-canvas
   touch unconditionally while debug was on, structurally preventing
   AIMS from ever getting a "this touch missed everything" chance to
   engage. Fixed with `input.module.js`'s `_aimShim._isAimShim` marker.
4. **`console-view.js`'s root `pointerdown` listener** — unconditional
   `stopPropagation()` blocked the entire window-level input router for
   any tap inside the console's DOM box, AIMS included.
5. **`panel.js`'s `computeLayout()`** — `PanelStyle.apply()` positioned
   after the shrunk-state early return, so `DEBUG_STATE.scale` could go
   stale indefinitely whenever every visible panel was shrunk.
6. **`main.js`** — `SelectionTool.update()`/`render()` never called.
7. **`panel-snap-guides.js`'s draw loop** — iterated every candidate
   line instead of only the ones actually aligned (hit).
8. **`in-selection-tool.js`'s `update()`** — validated captured-body
   survival by object reference against an array `future-cache.js`
   periodically replaces with cloned objects of the same `.id` but
   different identity. Fixed with id-based re-resolution.
9. **`canvas-satellites.js`'s dbg-sat/aims-sat fans** — uneven angular
   spacing (a "missing button's worth" of dead space in dbg-sat
   specifically), fixed by evenly re-distributing across each fan's own
   existing span.
10. **`in-aims.js`'s `showMap`** — defaulted to `true`, auto-showing a
    debug overlay nobody asked to see.
11. **`main.js`'s `init()`** — `DebugRouter.init(canvas)` is `async`
    (fetches every panel's JSON config) but was never `await`ed.
    `PrefsStore.init()`, over 100 lines later, restores each panel's
    saved position/pin state by looking it up in `DebugRouter.panels`
    by id — that array was still `[]` at the time, so the restore
    silently had nothing to iterate. Saving worked the whole time;
    nothing was ever coming back. Fixed by awaiting it properly.
12. **`debug-btn`/`aims-btn`/`selection-btn`'s hold timers** — fired
    their secondary action regardless of whether the button was already
    active. See Round 9 / `rules.md` §9.

## Real Features Built

- **Selection Panel** (`core/selection-vitals.js` +
  `panels/selection.json` + `DebugRouter.syncSelectionPanel`) — a real,
  full-featured debug Panel (drag/pin/minimize/master-knob, all free
  from the existing Panel system) that auto-appears whenever
  `SelectionTool` has a live capture.
- **`selection-panel-extras.js`** — the attached zoom box (live magnified
  crop, same crop-the-canvas technique as `ZoomEnhancer`), scrolling
  vitals ticker, eye show/hide toggle, 4 tap-toggle pan buttons, +/-
  zoom, Fit, and a connected master knob — all sharing one geometry
  function between drawing and hit-testing.

---

## Status: Confirmed Working vs. Unconfirmed

**Confirmed by live testing:** Round 1 only (all 6 items) — *"Everything
seems to work good for now."* Round 6 (button sizing/style) got an
implicit *"Ok keep it as is"* immediately before the Round 7 request,
which reads as confirmation of everything up through that point.

**Unconfirmed — needs live testing, roughly in the order it'd be worth
checking:**
- Round 7's satellite re-spacing (visual only — does the fan actually
  read as evenly spaced now, not just measure that way).
- Round 7's PrefsStore fix — the actual test is: pin a panel, drag it
  somewhere, reload the page, confirm it comes back pinned in the same
  spot. Nothing short of an actual reload confirms this one.
- Round 8/9 together, since they were never tested between builds: the
  Fit button, the master knob's live drag + its speed multiplier
  actually feeling like "half speed" at the default 1.0, and the full
  tap-toggle-to-extreme redesign (start it, let it run untouched to the
  bound, confirm it stops cleanly; tap again mid-flight, confirm it
  stops in place; try opposite directions canceling each other).
- Round 9's HTML button hold-gate rule on all three buttons — hold
  debug-btn/aims-btn/selection-btn while each is OFF and confirm nothing
  extra happens, then confirm hold still works normally once each is ON.
- The centroid ring's `zoomFactor` scaling fix inside the box (Round 5's
  original bug, fixed same round, never independently re-confirmed
  since) — pan away from center, confirm the ring still lands on the
  actual selection center rather than drifting.

## For Next Time

- Full server restart before retesting, as always.
- **`paint-sat`'s fan was never re-spaced** — it still has the same
  uneven 48°/24° gap pattern `dbg-sat` used to have, not touched this
  session since it wasn't asked for. Flagged in `rules.md` §8 as a known
  pending item if it's ever reported.
- `readme.md` and `rules.md` were brought back in sync with this
  session's work: module count corrected (79 → 104), a Debug Deck bullet
  added for the Selection Panel, the satellite fan geometry facts in
  `rules.md` §8 corrected to the new even spacing, a new correction
  entry added for the AIMS-dead-in-debug-mode fix, a new standing
  quality gate added to §5 (async init ordering — check what's actually
  awaited, not just what's called), and two new sections added: §9 (the
  HTML button hold-gate rule) and §10 (the one-off custom panel widget
  pattern `selection-panel-extras.js` established, for the next thing
  that needs something similar).
- If "Fit" ever gets reported as not fully framing a very large/spread-
  out cluster, that's not a bug — it's the documented tradeoff (never
  zooms out past `ZOOM_MIN`, "always a bit zoomed" wins over a perfect
  fit for a selection too big to frame at the floor zoom). Worth knowing
  before re-diagnosing it as broken.
