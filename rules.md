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
- **Draw calls only inside `shouldRender()`** — this includes
  `DebugRouter.drawAll` and `TuningLayer.drawAll` in `main.js`.
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
- **Physics claims are tagged Real / Fake / Cached**, with error bounds
  stated on anything Fake.
- **The Tween Law is locked:** longer tweens are better at identical time
  and speed. Don't relitigate this per-feature.
- **The "1000 law":** 1000 virtual cycles/second is the benchmark ideal
  for this engine. Keep it in mind when something is framed as a
  performance tradeoff.

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
offsetting the coordinates of an already-correct tap doesn't improve
it, it *breaks* it. So:

- **Never AIMS-eligible, always plain native touch, no exceptions:**
  pan-pad, the debug/selection/aims/painting toggle buttons, the zoom
  bar, the speed bar, the FPS text, the bottom bar (`#ui` — clear-btn,
  config-btn, sliders), the config menu. Generalizes to every plain
  HTML button/bar in the app. A future "virtual controller" (joystick-
  style, continuous input) is explicitly a *different* thing from
  pan-pad — pan-pad stays excluded either way.
- **AIMS-eligible, always (not HTML at all — canvas-drawn, "virtual
  space", same category as debug panels):** the satellite buttons
  (`js/modules/ui/canvas-satellites.js` — dbg-sat/aims-sat/paint-sat
  families). These used to be real `<div>` elements with an AIMS
  exception carved out for them ("HTML, but AIMS anyway") — that was
  identified as backwards and removed. There is no HTML/AIMS exception
  anymore, in either direction: satellites moved to the canvas side of
  the boundary instead of staying HTML with a special case. Each
  satellite's own `isActive()` gates both rendering and hit-testing —
  visible ⟺ touchable, same law as everywhere else in this codebase,
  just enforced in JS now instead of via a CSS `display:none` check on
  a DOM element that no longer exists.
- **AIMS-eligible, always (not an HTML button at all):** debug panels
  (canvas-drawn, not real DOM — "virtual space").

**The core idea — one ray cast, not a different input module.** A 3D
engine always casts a ray for picking; only the origin/direction/length
change per use, never the mechanism. AIMS is that, in 2D:
`AimsCast.cast(x, y, radius)` (`js/core/aims-cast.js`) is the ONE
function every AIMS resolution goes through, always. Normal touch and
AIMS-assisted touch are not two different systems — they're the same
hit-test/collision-check between a touch point and the virtual-space
objects it might be aiming at, called with different `x`, `y`, and
`radius`. `radius=0` only hits something you're exactly on top of;
`radius>0` forgives being that many px away from the nearest edge.
Deliberately NOT a spatial index or pixel bitmap — there are only ever
a handful of satellites + panels on screen, so a plain linear scan over
their LIVE bounds, re-read on every single cast, is cheap enough that a
pre-built cache buys nothing but a second thing to go stale.

**How a tap actually resolves (immediate pass, then deferred one loop
cycle later):** normal hit-testing — `InDebug` (panels) →
`CanvasSatellites` (satellites, exact point, no offset) → `InButtons` →
`InConfigMenu` → `InUI` → `InCamera` — always runs first,
unconditionally, exactly as if AIMS didn't exist. This covers every
HTML button/bar AND gives satellites/panels a normal precise-tap path of
their own, satisfying "HTML buttons are a no-go for AIMS" by
construction (HTML never appears in AIMS's resolution at all, in either
pass) rather than by a special case. Only if ALL of that misses, and
AIMS is on, does `InputModule._deferAimsRetry()`
(`js/modules/input/input.module.js`) schedule a real retry one
`requestAnimationFrame` later: apply the Aims offset, then call
`InAims.resolve(sx, sy)` — which is just `AimsCast.cast()` at the
current mode's radius, then either `CanvasSatellites.fireTap()` (calls
the matched satellite's `onTap()` directly — no DOM element in the
picture at all anymore) or a coordinate-shimmed call into
`InDebug.handleDown()` for a matched panel. If that also misses, the tap
falls through to world interaction (SelectionTool / InPlanet) one frame
late, at the raw un-offset point — world taps never use the bias, only
satellites/panels do. One cycle of deferral is cheap at real frame rates
(see the "1000 law," §5) and invisible to a human; it is not a hack,
it's the actual mechanism.

**Long-press aims-btn** (`InAims.toggleMode()`) switches 'fake'
(default, tight ~2px radius) ⇄ 'real' (full finger-size radius, reusing
the historical `AIM_RADIUS` constant). Same `cast()` call either way —
mode is a radius choice, not a different code path. Tap still toggles
AIMS on/off, unchanged.

**Superseded designs, for history — do not resurrect either:**
1. A same-frame `Proxy`-based coordinate-only retry. Failed silently:
   `InButtons`/`InUI`/`InConfigMenu` hit-test off `e.target` (the
   browser's own real hit-test result at the real touch point), which
   spoofing `clientX/clientY` alone can't touch.
2. A dual "Real bitmap map, rebuilt fresh every miss" vs "Fake
   `elementFromPoint`" split — two genuinely different algorithms
   pretending to be modes of the same thing. `AimsCast` replaced both:
   one function, one algorithm, parameterized by radius.

**Current state of `core/aims.js`:** its bitmap/registration engine
(`_items`/`_layers`/`_map`/`register()`/`registerElement()`/
`_resolve()`) is fully unused now — `AimsCast` never calls any of it.
Left in place, not deleted, because `Aims.aim.x/y/offsetX/offsetY/ex/ey`
(the position/offset/radius tracker) are still real and still updated
every pointermove — `ZoomEnhancer`'s magnifier box and `AimsCast`'s own
radius/offset both read from it. Whether to physically delete the dead
bitmap code from that file is a deliberate follow-up decision, not
something to do as a side effect of an unrelated change.

**Satellites, structurally (`js/modules/ui/canvas-satellites.js`):** one
registry array (`id`, `icon`, `pos()`, `isActive()`, `isOn()` for
persistent-highlight buttons like paint-sat-pause, `onTap`, `onHold`),
one `render(ctx)`, one hit-test + its own tap-vs-hold gesture state
(`handleDown/Move/Up`). Anchors (debug-btn/aims-btn/painting-btn) stay
real HTML — only their satellites moved; positions read `--safe`/
`--pad-size` live off `:root`, same source of truth the CSS used before.
Geometry: aims-sat/paint-sat share the clean (radius, angle) template
already established (0.70×pad+7.5px, -15°/10°/35°); dbg-sat kept its
original hand-tuned absolute factors verbatim — nobody asked for that
fan reshaped, only moved off HTML. Anything that used to anchor off a
satellite's `getBoundingClientRect()` (e.g. `tetris-fan.js`'s popup
position) now calls `CanvasSatellites.getRect(id)` instead — same
shape, live, no DOM element required. One real side effect worth
knowing: satellites now render on the canvas (`z-index: 0`) instead of
as `z-index: 55` DOM elements — harmless given the established layout
keeps them clear of other HTML, but worth remembering if a future
element ever needs to sit between them.
