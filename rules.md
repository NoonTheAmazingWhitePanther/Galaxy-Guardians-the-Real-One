# rules.md — Galaxy Guardians Working Agreement

**Read this file first.** This exists so a **new Claude conversation,
starting cold from an uploaded zip, can get up to speed correctly** — and
so nothing important depends on being remembered rather than written down.

This file lives at the **repo root**, not inside `docs/`. It doesn't
change from session to session the way the folders below do, and it needs
to be the first thing found — not one file among many.

If you're a new conversation reading this first: go to
`docs/summaries/`, read the newest timestamped file. That's the real
history of what's actually happened.

---

## 1. Naming Conventions

Two rules, applied everywhere in `docs/` (see §2 for why root files like
`index.html` and the codebase in `js/` are exempt):

- **Lowercase only.** Every folder and every filename — no exceptions
  within `docs/`. `Docs` → `docs`, `Summaries` → `summaries`, etc.
- **Fixed two-letter prefix.** Every file *inside* a `docs/` subfolder
  starts with that subfolder's two-letter code, then an underscore, then
  the rest of the name — e.g. `su_2026-07-08_1958_session-summary.md`.
  The codes are fixed, not improvised per file:

  | Folder         | Prefix | Example                              |
  |----------------|--------|---------------------------------------|
  | `summaries/`   | `su_`  | `su_2026-07-08_1958_session-summary.md` |
  | `stuff/`       | `st_`  | `st_burn_map_architecture.md`        |
  | `wiki/`        | `wi_`  | `wi_tree.md`                         |
  | `todo/`        | `td_`  | `td_todo.md`                         |
  | `thoughts/`    | `th_`  | `th_readme.md`                       |

  This keeps every file identifiable by folder-of-origin even if it's
  ever flattened, searched, or referenced outside its folder — the prefix
  travels with the name, not just the path.

**Root files** (`readme.md`, `rules.md`, `license`) follow the lowercase
rule too — applied here literally per direction. Flagging this
explicitly: lowercasing `readme.md`/`license` departs from the near-
universal GitHub/tooling convention of uppercase `README.md`/`LICENSE`.
GitHub itself is case-insensitive for special rendering, so nothing
breaks there — but if this repo is ever pushed somewhere with a script or
person expecting the exact canonical casing, that's the tradeoff. Easy to
revert those two specifically if it causes friction; said so once here
rather than silently deciding either way.

**`index.html`, `styles.css`, and everything in `js/`** are exempt from
the two-letter-prefix rule — `js/` has its own deep, working internal
convention already, cross-referenced by real `import` statements across
~90 files, and `index.html` has a hard technical naming requirement (the
browser/server auto-serves that exact name). Renaming any of that is a
different, much higher-risk operation than reorganizing docs, and isn't
what this rule is for. Both were already lowercase anyway, so no conflict
in practice — just scoping the rule honestly.

---

## 2. Folder Structure

```
/                    ← readme.md, rules.md, license, and the actual codebase (js/, index.html, styles.css)
docs/
  stuff/             ← unorganized content — architecture notes, diagnostics,
                       implementation writeups. Working documents, not polish.
  wiki/              ← the FUTURE — a properly documented production key
                       index and assets. Placeholder today (seeded with
                       wi_tree.md, the module index); this is what stuff/
                       graduates into once it's finished and correct.
  summaries/         ← AI session summaries. See §3. Nothing else goes here.
  todo/              ← backlog, known limitations, mission targets.
  thoughts/          ← personal notes. Claude doesn't write here unless
                       explicitly asked — this folder is outside the
                       session-summary cycle entirely.
```

**Rule of thumb for where a new file goes:** if it's an AI-written
end-of-session handoff → `summaries/`. If it's a working/unpolished doc
(diagnostics, architecture-in-progress, implementation notes) →
`stuff/`. If it's finished, polished, reference-quality documentation →
`wiki/`. If it's a backlog item → `todo/`. If it's a personal note not
meant for the AI cycle at all → `thoughts/`. When in doubt, `stuff/` is
the default catch-all — better there than invented as a new top-level
folder. Whatever the destination, name it per §1 before it lands.

---

## 3. The Session Cycle

Work on this repo happens in bursts across many separate conversations.
Each burst follows the same loop:

1. **Work happens live** — code changes discussed and made in-conversation.
2. **At a natural stopping point**, Claude writes a session summary (see
   §4) covering what shipped, what's confirmed vs. unconfirmed, and any
   open bugs.
3. **The summary is saved into `docs/summaries/`** with a timestamped,
   `su_`-prefixed filename — never overwriting a previous one. History
   accumulates; it doesn't erase.
4. **The whole repo is zipped** by the person and downloaded.
5. **A new conversation is started**, the zip is uploaded, and the most
   recent file(s) in `docs/summaries/` are what that new conversation
   reads first to reconstruct context, right after this file.

This means: **the summary file IS the handoff.** If something shipped but
isn't in the summary, the next conversation doesn't know it happened.

---

## 4. Session Summary Rules

- **Location:** `docs/summaries/`
- **Filename:** `su_YYYY-MM-DD_HHMM_session-summary.md` (local time, 24h clock)
- **Never overwrite** an existing summary file. Every session gets its own.
- **Required sections:**
  - **What shipped**, grouped by feature/system, in the order it happened
  - **Real bugs found & fixed**, named specifically enough to search for
    later (not just "fixed a bug" — say which listener, which file, which
    line of reasoning)
  - **Confirmed vs. unconfirmed** — anything not actually tested live by
    the person goes in "unconfirmed," even if the code looks correct.
    Static analysis is not confirmation.
  - **For next time** — anything the next conversation needs to know to
    avoid repeating work or re-diagnosing something already diagnosed.

---

## 5. Standing Quality Gates

These apply to every file touched in every session, no exceptions:

- **`node --check` is not enough.** Also run
  `node --input-type=module --check < file` — plain `--check` gives false
  passes on real syntax errors this project has hit before.
- **Validate every touched `.json` file** (Python `json.load` or
  equivalent) — panel configs are JSON-only, never JS tricks.
- **Verify import paths mechanically**, not by eye. A wrong relative path
  passes `node --check` (which only parses syntax, never resolves
  imports) and then breaks silently in the browser. Resolve every new
  `from '...'` path against the filesystem before calling something done.
- **Draw calls only inside `shouldRender()` — a MUST, no exceptions.**
  WHATEVER is painted — canvas draws AND DOM writes born in the main loop
  (FPS readout, custom cursor, any future overlay) — paints only inside
  the `RenderGov.shouldRender()` gate; `DebugRouter.drawAll` and
  `TuningLayer.drawAll` included. The ordering law: ALL input updates
  before the gate, ALL physics updates before the gate — constant, never
  behind `if (shouldRender)`. Measurement/counting is data and runs every
  frame; only the paint skips with the frame. Tweening between fragments
  builds on this contract.
- **Visible ⟺ touchable, always.** Hit-test geometry and draw geometry
  must agree. If a button/panel/satellite moves, whatever computes tap
  regions must move with it in the same commit.
- **Check UI element geometry with arithmetic, not by eye.** This project
  has shipped real overlap bugs (buttons rendering on top of each other)
  that were only caught by actually computing every element's pixel range
  and checking for intersections. If you're placing anything with `top:
  calc(...)` / `right: calc(...)`, verify it against its neighbors before
  calling it done.
- **Full server restart required after any config or module file
  change** — ES module URL caching at localhost:7700 means edits can
  silently not take effect otherwise. If something "doesn't work" after a
  change, confirm a restart happened before diagnosing further.
- **Async init order matters — check what actually gets awaited.**
  `DebugRouter.init(canvas)` is `async` (it fetches every panel's JSON
  config) but was called without `await` in `main.js` for a long time.
  Everything after it in `init()`, including `PrefsStore.init()` — which
  restores each panel's saved position/pin state by looking it up in
  `DebugRouter.panels` by id — ran before the fetch had any chance to
  finish, so `DebugRouter.panels` was still `[]` and the restore loop had
  nothing to iterate. Saving was working fine the whole time; nothing was
  ever coming back. The bug hid completely from static reading — the code
  looked sequential — and only showed up as "pinned panels don't survive
  a reload," several files and a UI feature away from the actual cause.
  When anything depends on an async init's side effects (a populated
  array, a loaded config), verify the `await` is actually there, not just
  that the call is — don't assume JS source order means execution order.
- **Physics claims are tagged Real / Fake / Cached**, with error bounds
  stated on anything Fake.
- **The Tween Law is locked:** longer tweens are better at identical time
  and speed. Don't relitigate this per-feature.
- **The "1000 law":** 1000 virtual cycles/second is the benchmark ideal
  for this engine. Keep it in mind when something is framed as a
  performance tradeoff.
- **The Pure Frames Law (locked, strengthened):** frame skipping is the
  LAST RESORT, never the preference — pure frames always. The benchmark's
  ENTIRE refinement runs with skip pinned to ZERO: every quality knob
  finds its honest level on pure frames only. Skip enters exactly once,
  at the end of the bench (`_minSkipPass`), and only if the pure-frames
  config cannot hold the screen-rate target — it then walks from 0
  upward (render frames sacrificed before physics frames) and stops at
  the FIRST level that stables on target: the minimum skip needed, never
  more. Good engineering over frame theft.
- **The Sun Spread law (satellites):** every anchor button owns a 12-slot
  clock ring; 30° (1/12) is the ONLY satellite spacing. Placement is the
  walker (start straight-up, step 1/12 to the first genuinely free slot;
  free = unoccupied + on-screen + no overlap with any satellite or fixed
  HTML). Rings overflow OUTWARD on their own rays at the visible edge-gap
  spacing, each ring one wider than the last. No hand angles, ever —
  declaration is anchor + registry order (`sun-spread.js`).
- **Governors target the SCREEN, not 60:** every fps target derives from
  `ScreenGov.hz` (detected display refresh), never a hardcoded number.
  Adaptive quality controllers start at their CEILING and decrease to
  what holds stable at the screen's rate — quality-first, always.
- **The 1000 standard:** caching routes (stored-state lists) cap at 1000
  — FutureCache steps, CacheGov target, StateCache vault, TrailGov
  counts, QueOps queue, undo stack. Physical limits (canvas rings,
  per-frame drain valves, stat windows) are NOT caching routes and stay
  engineered, not inflated.
- **The benchmark exploration rule:** every playable tier gets at least
  one configuration change the greedy ascent did NOT choose — a random
  knob to a random legal value, kept only if it measures better
  (`_explorePass`). Hill climbing finds edges; the poke finds ridges the
  climb walked past. Skip knobs are exempt (their direction belongs to
  the Pure Frames Law).

---

## 6. Before Calling a Session Done

- [ ] Every touched `.js` file passes both `node --check` and
      `node --input-type=module --check`
- [ ] Every new/changed import path verified to resolve on disk
- [ ] Every new HTML element has both CSS positioning and JS wiring —
      cross-check with grep, not memory
- [ ] Any new UI element's geometry checked against its neighbors for
      overlap
- [ ] Any new file placed in the correct `docs/` subfolder, lowercase,
      correctly prefixed (see §1–2)
- [ ] Session summary written to `docs/summaries/` with a fresh timestamp
- [ ] Summary explicitly separates confirmed-working from
      unconfirmed/needs-live-testing

---

## 7. Reporting Back ("it doesn't work")

The single biggest time-sink this project has hit is vague bug reports
leading to full re-audits of working code. When something's wrong, the
fastest fix comes from reporting:

- **What you actually observed** — nothing visible at all vs. visible but
  unresponsive vs. visible, responds, wrong behavior/color — these are
  different bugs with different fixes.
- **Whether you restarted the server** after the last change (see §5).
- **Any console errors**, if you can see them.

"It doesn't work" sends the next session back to re-reading everything.
One sentence of what you actually saw turns that into a five-minute fix.

---

## 8. AIMS — Scope Boundary & Architecture

**HTML buttons are a no-go for AIMS.** AIMS is for actions inside the
virtual space. HTML buttons are real browser space.

Native touch already lands correctly on a normal-sized (44px) HTML
button, bar, or control — that's just how touchscreens work. AIMS
routing a touch away from an already-correct tap doesn't improve it, it
*breaks* it. So:

- **Never AIMS-eligible, always plain native touch, no exceptions:**
  pan-pad, the debug/selection/aims/painting toggle buttons, the zoom
  bar, the speed bar, the FPS text, the bottom bar (`#ui` — clear-btn,
  config-btn, sliders), the config menu. Generalizes to every plain
  HTML button/bar in the app. These have their own direct element
  listeners, which fire independently of the window-level input chain —
  so even while AIMS is on and consuming every canvas touch, these stay
  reachable by a plain thumb tap, unaffected. A future "virtual
  controller" (joystick-style, continuous input) is explicitly a
  *different* thing from pan-pad — pan-pad stays excluded either way.
- **AIMS-eligible, always (canvas-drawn, "virtual space", never real
  DOM):** the satellite buttons (`js/modules/ui/canvas-satellites.js`)
  and debug panels. Each satellite's own `isActive()` gates both
  rendering and hit-testing — visible ⟺ touchable.
- **AIMS-eligible, always:** world/canvas interaction — planet
  charging, brush painting, selection-box dragging.

**The core idea — real touch always gets first try; AIMS only ever
engages for a touch that misses everything.** CORRECTED (this was a real
bug, not just a design choice that changed): AIMS is NOT "every touch,
always, routed through the profile." That version existed briefly and
broke exactly what it shouldn't have — a real, precise tap on a
satellite or a debug panel would get swallowed into the charge timer
instead of ever reaching the thing it was aimed at, because AIMS was
checked *before* the normal chain instead of after it. "AIMS is a
preference of choice of what pointer the user wants to use" — it's an
option for the ambiguous case (open canvas/world), never something that
can block a real, unambiguous hit on a real, fixed-position thing.

The actual model, `js/modules/input/input.module.js`'s pointerdown:

1. The bulb is checked first (its own thing, see below).
2. Real touch, real coordinates, ALWAYS tries the full normal chain —
   `CanvasSatellites → InDebug → InButtons → InConfigMenu → InUI →
   InCamera` — regardless of `InAims.enabled`. If anything here claims
   it (`_gestureMode = 'normal'`), that's the whole gesture; AIMS never
   gets involved, not on this down, not on the moves/up that follow it.
   `CanvasSatellites` is checked *before* `InDebug` specifically because
   `InDebug`'s own "empty space, arm the marquee" catch-all has no
   knowledge of satellite positions at all — a tap landing exactly on a
   `dbg-sat` satellite used to get swallowed as "empty space" before
   `CanvasSatellites` ever saw it. This order also matches the render
   z-order (satellites draw on top of panels) — hit-testing top-down is
   the same principle already used for satellite-vs-satellite overlaps.
3. Only if ALL of that misses — nothing but open canvas/world under the
   touch — does `InAims.enabled` matter at all: off, it's a plain
   `SelectionTool`/`InPlanet` tap (`_gestureMode = 'world'`), exactly as
   if AIMS didn't exist; on, THIS is where AIMS actually changes
   anything — the touch becomes a charge→profile→aim gesture instead
   (`_gestureMode = 'aims'`), and only now does the active profile
   (`js/modules/input/aims-profiles.js`) start updating the persistent
   aim point `Aims.aim.x/y`, firing a synthesized event at the aim into
   `CanvasSatellites → InDebug → SelectionTool → InPlanet`
   (`_aimChainDown/Move/Up`) instead of at the real finger. Never into
   `InButtons`/`InConfigMenu`/`InUI`/`InCamera` — HTML-DOM/camera-drag
   specific, excluded from the aim chain on purpose, same reasoning as
   step 2 (a fixed-position HTML thing is never ambiguous, so AIMS never
   gets a say over it, at any stage).

`_gestureMode` (`'none' | 'normal' | 'aims' | 'world'`) is set explicitly
once on pointerdown and consulted on every subsequent move/up for that
same gesture — not re-decided per event, and not inferred from which
handlers happen to self-gate true/false. That ambiguity is exactly what
let the bug through the first time; explicit tracking closes it for good.

Downstream code (panels, satellites, brush painting, planet charging)
still cannot tell an aim-driven event from a real one once AIMS *does*
engage — same coordinate shape, same down/move/up sequence, same
tap-vs-hold timers already built into each of those systems. "Just a
different configuration of what's firing" remains true for the one case
where AIMS actually applies; it was never true for satellites/panels/
buttons, and no longer pretends to be.

**The three profiles** (long-press aims-btn cycles Trackpad → Joystick →
Offset → Trackpad; tap still toggles on/off):

1. **Trackpad** (default) — relative delta. The aim moves by exactly the
   distance your finger moves, regardless of where the gesture starts.
   Precise, laptop-trackpad feel.
2. **Joystick** — "the entire screen is a joystick window." Verbatim
   reuse of Pan Pad's own rate model (`in-ui.js`'s `_handlePanPadMove`/
   `updatePanPad`: 8-way direction snap, `PAN_ACCEL=0.7`/`PAN_MAX=3`
   power ramping over TIME while held), just anchored at the touch-down
   point instead of a fixed pad center. Needs a per-frame tick
   (`InputModule.aimsTick()`, called from main.js's loop exactly where
   `updatePanPad()` already is) to keep moving the aim between pointer
   events — hold-and-lean, not just react-to-drag.
3. **Offset** — the original "finger bias" idea. The aim tracks the real
   finger 1:1, shifted by a fixed correction (`Aims.aim.offsetX/offsetY`
   — the historical `AIM_OFFSET_X/Y` constants). Direct, immediate, no
   ramp or delta.

`Aims.aim.x/y` is the ONE authoritative position for all three — no
separate "effective position" layer anymore (the old `aim.ex/ey`
getters, `= x + offsetX`, are retired from live use; applying Offset's
bias a second time on top of a profile that already applied it, or
applying it to Trackpad/Joystick where it never meant anything, was the
problem). `ZoomEnhancer` and `_drawAimCursor` (main.js) both read
`aim.x/y` directly now.

**`Aims.aim.x/y` is never touched while AIMS is off** — profiles are the
only thing that write to it, and profiles only run while enabled. This
is deliberate: turning AIMS back on resumes exactly where the aim was
left, never wherever the finger currently is ("always have a last point
recollected, always continue from there," per direction). Defaults to
screen center on first load, not `(0,0)` — it used to not matter (the
old design always snapped `aim.x/y` straight to the first real touch),
but Trackpad/Joystick now move the aim RELATIVELY from wherever it
already is, so a sensible starting point matters.

**The aim is always visible while enabled, never while disabled.**
`_drawAimCursor` (main.js) used to hide itself unless a pointer was
actively down — the opposite of "always show the last position so the
user knows." It now draws unconditionally whenever called; the caller
gates entirely on `InAims.enabled`. No more offset/bias line either —
that only meant something for the old single-behavior design; with
three profiles the aim IS the one honest position to show, nothing to
draw a bias line back to.

**Superseded designs, for history — do not resurrect any of them:**
1. A same-frame `Proxy`-based coordinate-only retry. Failed silently:
   `InButtons`/`InUI`/`InConfigMenu` hit-test off `e.target` (the
   browser's own real hit-test result at the real touch point), which
   spoofing `clientX/clientY` alone can't touch.
2. A dual "Real bitmap map, rebuilt fresh every miss" vs "Fake
   `elementFromPoint`" split — two genuinely different algorithms
   pretending to be modes of the same thing.
3. `AimsCast.cast(x, y, radius)` + a ONE-FRAME-DEFERRED retry
   (`InputModule._deferAimsRetry`) that only engaged after normal touch
   missed everything. Conceptually cleaner than 1/2, and `AimsCast`
   itself is still used today (satellite/panel candidate geometry, and
   the "Show Map" debug visualization — see `InAims.debugDraw`) — but
   the retry-on-miss SHAPE was still wrong: it meant "a different input
   module taking over" for exactly one frame, on a miss, rather than
   "just different coordinates, always." The always-on profile model
   replaced it: no miss detection, no defer, AIMS is a strict on/off,
   never a fallback.

**Current state of `core/aims.js`:** its bitmap/registration engine
(`_items`/`_layers`/`_map`/`register()`/`registerElement()`/`_resolve()`/
`fire()`/`down()`/`up()`/`bindPointer()`) has been unused for a while now
and stays that way — nothing in the live input path calls any of it.
`Aims.debugDraw()` (the old bitmap-visualization renderer, which still
reads the now-retired `ex/ey`) is ALSO unreachable — `InAims.debugDraw`
draws its own thing via `AimsCast.allCandidates()` instead. Left in
place, not deleted, because `_aim.x/y/offsetX/offsetY/radius` (the part
that's genuinely live) shares the same object. Whether to physically
delete the dead code is a deliberate follow-up decision, not something
to do as a side effect of an unrelated change.

**Satellites, structurally (`js/modules/ui/canvas-satellites.js`):** one
registry array (`id`, `icon`, `pos()`, `isActive()`, `isOn()` for
persistent-highlight buttons like paint-sat-pause, `onTap`, `onHold`),
one `render(ctx)`, one hit-test + its own tap-vs-hold gesture state
(`handleDown/Move/Up`). Anchors (debug-btn/aims-btn/painting-btn) stay
real HTML — only their satellites moved; positions read `--safe`/
`--pad-size` live off `:root`, same source of truth the CSS used before.
Geometry, UPDATED (was uneven, fixed by evenly re-spacing each fan across
its own existing span using `(N-1)` equal gaps — literally averaging by
one fewer than the button count, not eyeballed): **dbg-sat** (5 rays,
radius `1.050×pad`) is `-32°/-2°/28°/58°/88°`, 30° apart every step — was
`-32°/16°/40°/64°/88°`, a 48° gap between the first two rays and 24°
everywhere else, i.e. one ray's worth of dead space sitting in the fan.
Endpoints (glasses at -32°, expand at 88°) land on the exact same spot as
before; only the three middle rays (closeall/reset/arrange) shifted to
close the gap. **aims-sat** (4 rays, same radius, mirrored: `dx`
negated, since dbg-sat opens right off the left-edge debug-btn and
aims-sat opens left off the right-edge anchor) is its own independent
even split, `-32°/-8°/16°/40°`, 24° apart every step — was already close
(`-32°/-7°/16°/40°`, a 1° rounding artifact from being hand-placed rather
than computed) but now exact. **paint-sat** (3 rays: `-32°/16°/40°`) was
NOT touched this session and still has the same uneven-gap pattern
dbg-sat used to (48°/24°) — a known pending item if it's ever reported,
not yet asked for. Every angle→position conversion for this fan (both
dbg-sat and aims-sat) is `leftFactor = 1/3 + 1.050·cos(a)`,
`topFactor = 4/3 + 1.050·sin(a)` for `_absLeft`, reverse-engineered from
dbg-sat's own original hand-tuned factors and verified by script, not by
eye — recompute this way for any future ray, don't hand-place a new one.
`_hitTest` and `AimsCast`'s tie-break both iterate/prefer back-to-front
(later registry entries win on overlap), matching render order, so a
tap always goes to whatever's visibly on top even where fans overlap.
Anything that used to anchor off a satellite's `getBoundingClientRect()`
(e.g. `tetris-fan.js`'s popup position) calls `CanvasSatellites.getRect(id)`
instead — same shape, live, no DOM element required. One real side
effect worth knowing: satellites render on the canvas (`z-index: 0`)
instead of as `z-index: 55` DOM elements — harmless given the
established layout keeps them clear of other HTML, but worth
remembering if a future element ever needs to sit between them.

**Correction — AIMS was structurally dead inside Debug/Panel mode and
inside Console mode, for two separate reasons, both now fixed.** This
is the same class of bug as the "real touch always tries first"
correction above, found later: the normal chain trying first is only
correct if every handler IN that chain is willing to say "not mine" when
it should.

1. **`InDebug`'s marquee-arm** (`in-debug.js`, "empty space → arm the
   hold-to-select rectangle" catch-all) used to claim *every* real
   empty-canvas touch unconditionally whenever `DebugRouter.masterEnabled`
   was true, with no regard for `InAims.enabled` at all. Since `InDebug`
   sits in the real, first-try chain (checked *before* AIMS is ever
   consulted, per the model above), a real touch that should have "missed
   everything" and handed off to AIMS was instead always swallowed here
   first — AIMS could never engage at all while debug was on, full stop.
   Fixed with a marker on the synthesized aim event
   (`input.module.js`'s `_aimShim`, `_isAimShim: true`): the marquee now
   only arms on the REAL first pass if AIMS is off; once AIMS captures
   and routes its own event back through `InDebug` (`_isAimShim: true`
   on that shim), the marquee is still fully armable — debug panels stay
   AIMS-eligible per the table above, so the marquee should be reachable
   via a placed aim too, just not by short-circuiting AIMS out of the
   picture entirely.
2. **`console-view.js`'s `#gg-console` root** called
   `e.stopPropagation()` on *every* pointerdown inside its own DOM box
   unconditionally — meant to keep taps on the console's own real
   controls from leaking through to camera pan/zoom/planet-spawn behind
   it, but it also killed the window-level input router entirely for any
   tap landing in that box, AIMS included, regardless of AIMS state. Now
   only stops propagation while AIMS is off. `masterEnabled` being true
   while console shows already keeps `InPlanet` excluded regardless (see
   the normal chain's own world-fallback check), so the one thing the
   original guard actually needed to prevent stays prevented either way.

Same underlying lesson both times: a catch-all "claim empty space"
handler sitting in the REAL first-try chain has to explicitly know about
AIMS's existence and defer to it, or AIMS is dead in that catch-all's
territory no matter how correct the rest of the chain is.

**Standing rule — AIMS always has a charge delay.** A real touch must
be held for `AIMS_CHARGE_MS` (`js/modules/input/input.module.js`,
currently 99ms) before AIMS captures it at all. Below that threshold, a
touch that releases early never fires anything into the aim chain — no
profile `onDown`, no downstream event — as if it never happened. This
gives the user a moment to "chill" before a touch commits, and a moment
to bail on an accidental graze before it does anything; it is not
tunable-away per feature, it's how AIMS accepts a touch, period. Every
future profile or AIMS-driven interaction goes through this same delay
— don't build a new touch-start path that skips it.

Visual confirmation: the aim reticle is BLUE and full-opacity ("sharp")
for exactly as long as a touch is actively captured and driving it right
now (`InputModule.aimsCaptured`); RED and dimmer otherwise — whether
AIMS is idle (on, nothing touching) or a touch is still mid-charge,
hasn't cleared the delay yet. Red → blue is the user's confirmation that
capture actually happened, not just that they touched the screen.

**The Tap Bulb — the one deliberate exception to "every touch is aim-
routed."** When a captured gesture releases, a large (`BULB_RADIUS`,
45 screen px vs. the aim's own ~7px) gold/amber circle appears at the
REAL release position — not the aim's position, which a profile like
Trackpad may have moved somewhere else entirely. Tapping the bulb fires
one fresh tap at the aim's current position, checked with a plain,
real, normal hit-test (real finger x/y against the bulb's real x/y) —
overriding AIMS entirely for exactly that one tap, no charge delay, no
profile involved. This exists because "placing the cursor" via a
profile can strand your actual finger somewhere comfortable while the
aim ends up somewhere far away or awkward to reach — the bulb lets you
confirm/re-fire that placement with an easy, nearby, ordinary tap
instead of reaching back to wherever the aim visually sits. It clears
itself when tapped, when a new AIMS gesture starts elsewhere (a fresh
placement retires the old one), or when AIMS is turned off.

**AimsEdge — reaching every corner, not just the ones the base offset
favors (`js/core/aims-edge.js`).** `Aims.aim.offsetX/offsetY` always
pushes up-and-left (the historical finger-bias constants). That's fine
in the middle of the screen; it actively fights you near the left/top
edges (pushes further off-screen) while being free help near the
right/bottom edges (pulls away from them). The 4th aims-sat satellite
(`aims-sat-mirror`, ⇄) exists to fix that, and ONLY matters for Profile
3/Offset — Trackpad and Joystick never read `offsetX/offsetY` at all.

The real hardware input is always the thumb (x, y). The offset is what
gets added on top of it. Two guarantees hold always, in every mode:

1. **The cursor (thumb + offset) is never drawn outside the screen.**
   `AimsEdge.clamp()` is unconditional — no mode check, no exception.
   Clamps to `[AUTOMATE_CLAMP_INSET, extent - AUTOMATE_CLAMP_INSET]` —
   "push it back to where it needs to be, which is the last pixels of
   the map." `ZoomEnhancer`'s box has its own box-aware version of the
   same unconditional clamp (accounts for `BOX_SIZE`, since the whole
   box has to stay on-screen, not just its corner).
2. **Inside the last 5% of width/height near an edge, the offset
   automatically shrinks and, if pushed further, reverses.** A "quick
   camera-like fix" — the same idea a 3rd-person game camera uses to
   pull in and reorient so nothing behind it hides the character.
   `EDGE_MARGIN_PCT = 0.05` — 5% of the relevant screen dimension, not
   a fixed pixel count.

**What's tested for edge-proximity is the CURSOR (thumb + offset), not
the raw thumb position.** A thumb sitting comfortably in the screen
center can still have its offset-displaced cursor sitting right at an
edge — that displaced position is what's actually at risk, not the
thumb. `computeSign()` adds the offset internally before ever measuring
distance to an edge. It also takes an optional `(elemW, elemH)` — 0 for
a point (the crosshair), `BOX_SIZE` for `ZoomEnhancer`'s box — since a
box's leading edge in the direction it's pushed is offset from its own
anchor by its own size, where a point's isn't. This only changes WHICH
edge gets measured from; the 5% margin itself never scales with element
size ("don't spread its distance too much, spacing always needs to be
kept").

**Manual and automate differ in shape, not in these two guarantees:**

- **Tap** cycles 4 states: normal → x-eligible → y-eligible →
  both-eligible → normal. "Eligible," not "reversed" — x/y/both SELECT
  which axis is *allowed* to shrink/reverse when its own edge is caught;
  the axis not selected stays flat +1 regardless of position. A
  deliberate HARD threshold, independent per axis — fully reversed
  inside the 5% margin, fully normal outside it, no blend. Manual is a
  yes/no, on purpose.
- **Hold** toggles `automate`, overriding the manual cycle while on.
  Both axes are always eligible together, and — this is the part that
  needed real correcting, twice — they shrink and reverse by ONE SHARED
  SCALE, not two independent per-axis values. `computeSign()` computes
  a "trouble" fraction per axis (0 = safe, 1 = a full margin past the
  edge, 0.5 = exactly at it — offset scaled to zero there), takes the
  WORSE of the two axes, and applies that single resulting scale to
  *both* `offsetX` and `offsetY` equally. Scaling the axes independently
  could point the offset in a different direction than it started;
  scaling both by the same factor only ever changes its length — "keep
  the ratio so the feeling be the same." Verified: with a base offset of
  (-20,-50) (ratio 2.5), the effective offset shrinks smoothly through
  (-16,-40) → (-4,-10) → (+6,+15) as the thumb approaches and then
  passes an edge — the 2.5 ratio holds at every single step, including
  through the zero-crossing into reversal. This is also the "tween
  slide": no timer, no animation state machine — the scale is a pure
  function of a position that's already moving smoothly, recomputed
  fresh every call, same "always live, never cached" principle as
  everything else here.
- **`ZoomEnhancer` reuses the exact same `computeSign()`** for its own
  magnifier box placement (`BOX_OFFSET_X/Y`) — the identical problem,
  just for a 100×100 box instead of a point. One shared function, two
  callers, not two parallel implementations of the same idea.
- **Geometry note, UPDATED:** `aims-sat-mirror` sits at -8°, one of
  aims-sat's own 4 evenly-spaced rays now (`-32°/-8°/16°/40°`, see the
  satellite geometry paragraph above) — it used to sit at -7° specifically
  because that was "the real 48°-wide gap" in dbg-sat's OLD uneven
  spacing, a gap that no longer exists now that dbg-sat itself was fixed
  to be even. aims-sat was re-spaced independently (its own 4-ray split,
  not derived from dbg-sat's rays at all), and -8° is where that split
  happens to land — a coincidence of the math, not a re-application of
  the old "fill the gap" reasoning, which no longer applies to anything.

**Standing rule — Canvas play and Panel play are separate domains, not
two gestures competing for one tap.** A canvas-space touch means one of
two genuinely different things depending on which STATE the app is
currently in — Simulation (`!DebugRouter.masterEnabled`) or Debug/Panel
(`DebugRouter.masterEnabled`) — and `DebugRouter.masterEnabled` is
already the one clean, existing boundary between them:

- **Simulation state:** canvas touch → `SelectionTool` (planet capture,
  if on) or `InPlanet` (world spawn/charge). "Canvas play."
- **Debug/Panel state:** canvas touch → debug's own marquee/Selection
  Box (grouping/moving multiple PANELS, `in-debug.js`). "Panel play."

These do NOT take turns based on which tool the user happens to have
toggled on — `SelectionTool.enabled` being true does not, and should
never, make the debug marquee defer to it, and vice versa. A fix that
made one "win" over the other via a shared conditional (`!SelectionTool
.enabled` gating the marquee) shipped once and was wrong — it silently
broke the debug's own Selection Box the instant SelectionTool was
turned on, which is a real bug, not a tradeoff. `DebugRouter
.masterEnabled` is checked explicitly everywhere this boundary matters
(`in-debug.js`'s marquee-arming, `input.module.js`'s `SelectionTool
.handleDown/Move/Up` in both the normal 'world' gesture and the
AIMS-routed chain) rather than inferred from which handler happened to
claim the touch first.

This generalizes past just these two systems: **any HTML button, tool,
or gesture can legitimately have a different job — or no job at all —
depending on whether the app is currently in Simulation or Debug/Panel
state**, and that's a real design shape to build with on purpose, not
an edge case to special-case around after the fact. When adding a new
canvas-space interaction, ask which state(s) it belongs to before
wiring it in, the same way `InPlanet`'s world-spawn already explicitly
excludes itself during Debug/Panel state.

---

## 9. HTML Button Tap/Hold Rule

Standing rule, applies to every real HTML button with a tap/hold dual
action (currently `debug-btn`, `aims-btn`, `selection-btn` — all wired
directly in `main.js`, each with its own `pointerdown` timer):

**A long press can only change an ALREADY-active button's secondary
state. It can never be a backdoor way to also turn the button on.**

- Button currently OFF (not toggled on) → holding it does nothing beyond
  what releasing it normally would (a plain tap-equivalent, which turns
  it on). The hold-specific action does not fire.
- Button currently ON (already toggled active) → holding it works
  exactly as designed (cycles console mode / AIMS profile / selection
  capture mode).

Implementation shape, the same in all three: check the button's own
active flag (`DebugRouter.masterEnabled` / `InAims.enabled` /
`SelectionTool.enabled`) *inside* the `setTimeout` callback, right
before performing the hold action — not at `pointerdown` time, since the
callback firing 600ms later is the moment that actually matters. If
inactive, `return` before doing anything; the held-flag (`dbgHeld` /
`aimsHeld` / `selHeld`) stays `false`, so the subsequent `pointerup` still
runs the normal tap action. Apply this same shape to any future
HTML button that grows a hold behavior — check active-state inside the
timer callback, not before starting the timer.

---

## 10. One-Off Custom Panel Widgets

Not every piece of panel UI belongs in `panel.js`/`debug-renderer.js`'s
generic line-type system. `js/modules/debug/selection-panel-extras.js`
(the "selection" panel's attached zoom box, pan/zoom controls, and
scrolling ticker) is the established pattern for something that's
genuinely custom to exactly ONE panel, not a new reusable line type:

- A single module, gated everywhere it's called by `panel.id === 'xxx'`
  — `debug-renderer.js` calls its `draw()`, `in-debug.js` calls its
  `hitTest()`, both only for that one panel id.
- One `layout()` method is the SINGLE SOURCE OF TRUTH for geometry,
  called by both the draw path and the hit-test path — visible ⟺
  touchable, same principle as everywhere else, just enforced by
  sharing one function instead of duplicating the math.
- Everything drawn this way is PANEL-SPACE (same coordinates as
  `panel.x/y/w/h`) and drawn from inside the ambient debug-view
  transform `debug-renderer.js` already sets up — never re-derive
  screen-space/pan/zoom transforms by hand for something attached to a
  panel; ride the transform that's already there.
- Anything that animates (a live crop, a scrolling ticker) has to be
  drawn OUTSIDE the panel's cached chrome canvas (`_drawChrome`,
  rebuilt only on pin/resize/minimize) — live, every frame, same
  reasoning as the pinned-panel gold title line before it.
