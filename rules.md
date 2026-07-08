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
