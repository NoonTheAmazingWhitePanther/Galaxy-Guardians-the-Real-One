# Session Summary — Galaxy Guardians
**Timestamp:** 2026-07-10, 12:07 (local)

## Context

This session built out a full alternative-pointer system (AIMS: profiles, charge delay, edge/corner correction, a confirm-tap "bulb") over many iterative passes, then spent the back half chasing a real regression — the debug satellite buttons stopped responding to taps. Several fixes shipped this session were themselves corrections of earlier fixes *from this same session* — flagged explicitly below rather than smoothed over, since that pattern is exactly what the previous session's summary warned about repeating.

**Filename note:** the one prior summary in this folder (`2026-07-08_1958_session-summary.md`) is missing the `su_` prefix this file's own naming convention (rules.md §1/§4) requires. Following the documented rule for this file rather than matching the inconsistency — worth fixing the old filename at some point, not done here since it's out of this session's scope.

---

## What Shipped, In Order

### 1. AIMS Profile System (replaces the old deferred-cast model)
- `js/modules/input/aims-profiles.js` (new) — three profiles behind one shared interface (`onDown/onMove/onUp/tick`):
  - **Trackpad** (default) — relative delta, laptop-style
  - **Joystick** — verbatim reuse of Pan Pad's own rate model (`in-ui.js`'s `_handlePanPadMove`/`updatePanPad`, 8-way direction snap, `PAN_ACCEL`/`PAN_MAX`), anchored at touch-down instead of a fixed pad center
  - **Offset** — the original finger-bias idea, now edge-aware (see AimsEdge below)
- `input.module.js` fully rewritten around this: `InAims.enabled` off = normal touch, on = every touch (that reaches this point — see architecture correction, #6) drives the active profile
- Long-press aims-btn cycles profiles; tap toggles on/off

### 2. `finalPointerX/Y` — one canonical pointer value
- `InputState.finalPointerX/Y`: the aim while AIMS is on, the real pointer while it's off
- Synced via `_syncFinalPointer()`, called inside `try/finally` in every pointer handler so it can never go stale regardless of which early-return path fired — same pattern already established in `renderer.js`
- Exposed on `window.Sim.InputState` for genuine global reachability

### 3. AIMS Charge Delay + capture state
- A real touch must hold `AIMS_CHARGE_MS` (99ms) before AIMS captures it — release earlier and nothing fires, as if it never happened
- Visual: the aim reticle is blue+full-opacity while captured, red+dimmer otherwise (idle or mid-charge) — `InputModule.aimsCaptured`/`aimsPhase`

### 4. AIMS Tap Bulb
- Appears at the **real** release position after a captured gesture (not the aim's position, which Trackpad especially can leave far from the actual finger)
- Full 6-state machine: `hidden/idle/held/cancelling/confirmed/cancelled` — includes real "slide off to cancel" behavior (drag off the bulb before releasing = doesn't fire), not just show/hide
- Tapping it fires one fresh tap at the aim's *current* position via a plain, real hit-test — the one deliberate exception to "AIMS routes every touch"

### 5. Live status readout
- Small text pill near the reticle: `IDLE · TRACKPAD` / `CHARGING…` / `CAPTURED · JOYSTICK` / `BULB · HELD` etc. — makes the internal state machine visible without needing devtools

### 6. Architecture correction — real touch always tries first
- **This was a real bug, not a design iteration.** AIMS previously intercepted *every* touch when enabled, before the normal chain ever ran — meaning a precise real tap on a satellite got swallowed into the charge timer instead of ever reaching it.
- Corrected: real touch always tries the full normal chain first (`CanvasSatellites → InDebug → InButtons → InConfigMenu → InUI → InCamera`), regardless of `InAims.enabled`. AIMS only ever engages for a touch that misses everything — i.e. lands on open canvas.
- Replaced implicit "whichever handler happened to return true" inference with explicit `_gestureMode` (`'none'|'normal'|'aims'|'world'`), set once on down, consulted on every subsequent move/up for that gesture.
- `CanvasSatellites` checked *before* `InDebug` specifically — `InDebug`'s own "empty space, arm the marquee" catch-all has no knowledge of satellite positions, so a tap landing exactly on a `dbg-sat` satellite was being swallowed as "empty space" first. Applied to both the normal chain and the AIMS-routed chain (`_aimChainDown/Move/Up`).

### 7. Simulation vs Panel domain separation
- `SelectionTool` (Canvas play) and the debug marquee/Selection Box (Panel play) are separate domains, not two gestures competing for one tap — `DebugRouter.masterEnabled` is the boundary, checked explicitly everywhere `SelectionTool` gets called rather than inferred from which handler claimed the touch first.
- Documented as a standing principle in rules.md §8: any button/tool can have a different job, or no job, depending on Simulation vs Debug state — design for that on purpose going forward.

### 8. AimsEdge — corner/edge correction (`js/core/aims-edge.js`, new)
Went through three real corrections in this session before landing right — see Real Bugs below for the specifics. Final, current design:
- `EDGE_MARGIN_PCT = 0.05` — 5% of screen width/height, not a fixed pixel count
- Tests the **cursor** (anchor + offset already applied), not the raw anchor — a real finger safely in the center can still have its offset-displaced cursor at risk
- Optional `(elemW, elemH)` — 0 for the point-like crosshair, `BOX_SIZE` for `ZoomEnhancer`'s magnifier box, since a box's leading edge isn't at its own anchor point the way a point's is
- **Manual** (tap-cycled `normal→x→y→both`): per-axis hard threshold, independent — the axis not selected stays flat +1 always
- **Automate** (long-press): ONE shared scale factor, driven by whichever axis is in the most trouble, applied equally to both `offsetX`/`offsetY` — preserves the offset's direction/ratio while shrinking, verified numerically (ratio held exactly constant across a full shrink-and-reverse sweep)
- Hard clamp (`AimsEdge.clamp`) is unconditional in every mode — the cursor can never actually render off-screen
- New 4th aims-sat satellite, `aims-sat-mirror` (⇄) at -7° — not one of `dbg-sat`'s five rays, since the standard radius has no room at 64°/88° in this column (`painting-btn` sits directly below `aims-btn`, unlike `debug-btn`'s open space) — verified collision-free by script

### 9. Console/Panel mode button removed
- `#gg-console-mode` — a real DOM element (not part of the `canvas-satellites.js` registry) that sat in the same fan region as `dbg-sat`, `z-index:55`, visible whenever debug was on — removed entirely (CSS, DOM creation, listener)
- Its function (`ConsoleView._toggleMode()`, now public `toggleMode()`) moved to a long-press on `debug-btn`, mirroring `aims-btn`'s existing tap/hold pattern exactly
- `.mode-flash` generalized from an `#aims-btn`-only CSS rule to a shared class, since `debug-btn` needed the identical long-press feedback

---

## Real Bugs Found & Fixed (named specifically)

1. **`InAims.debugDraw`** (`in-aims.js`) — `const dpr = 1;` hardcoded instead of reading `DEBUG_STATE.dpr`. Same bug class fixed repeatedly in earlier sessions, this time in the "Show Map" overlay itself. The reported symptom ("blue rectangle near debug-btn") was every candidate rect drawing squished toward the top-left corner.

2. **`InDebug`'s marquee vs. satellites** — chain ordering had `InDebug.handleDown` before `CanvasSatellites.handleDown`; `InDebug`'s catch-all "arm the marquee on empty space" step has no concept of satellite geometry, so it claimed taps meant for `dbg-sat` buttons. Fixed by reordering (see item 6 above).

3. **`tetris-fan.js`'s `_dismiss`** — a global, capture-phase `pointerdown` listener on `window` (fires before *everything* else, every tap, app-wide) referenced `anchor`, a variable removed in an earlier session's `getRect()` refactor but never cleaned out of this one later reference. Threw `ReferenceError` on every single pointerdown once the Tetris Fan had been opened once — and because the throw happened before `close()` could run (which is what removes the listener), it never even cleaned itself up. Fixed with a real coordinate check against `CanvasSatellites.getRect('dbg-closeall')` instead of the stale DOM-identity check.

4. **SelectionTool vs. debug marquee — wrong lens, self-inflicted** — an earlier fix this session made the debug marquee defer to `!SelectionTool.enabled`, on the theory that SelectionTool should "win." Silently broke the debug's own Selection Box the instant SelectionTool was turned on. Corrected per §7 above: they're separate domains, not competing gestures.

5. **AimsEdge tested the raw anchor, not the cursor** — `computeSign()` originally tested the real finger's raw position for edge-proximity, missing that a finger safely in the center can still have its offset-displaced cursor at risk. Verified with a concrete number: finger at 90px from an edge (outside an 80px-then-margin) with a -15 offset lands its cursor at 75px — genuinely at risk, and the old code never caught it.

6. **AimsEdge automate scaled axes independently** — corrected twice; the actual fix was computing ONE shared scale from the worse-off axis and applying it to both `offsetX`/`offsetY` equally, preserving direction/ratio instead of letting the two axes drift independently.

7. **`canvas-satellites.js` had no error isolation** — `_visibleSats()` backs both `render()` and hit-testing; one satellite's `isActive()`/`pos()`/`isOn()` throwing had no boundary and could silently abort the whole loop partway through, taking every other satellite down in both directions while leaving the rest of the app (panels, HTML buttons) completely unaffected. Added try/catch per-satellite in both paths with clear `console.error` logging. **This was defensive hardening in response to the "satellites visible but not responding" report — not a confirmed root cause.**

8. **`#gg-console-mode`** — see item 9 above. A real DOM element sitting in front of the canvas in the exact region satellites occupy, visible whenever debug was on. Removed as both an explicit feature request and a plausible (not confirmed) contributor to the "not responding" symptom.

---

## Status: Confirmed Working vs. Unconfirmed

**Confirmed (user-tested):** nothing from this session yet. The one live report received — "satellites visible when debug is on, but not responding to taps" — came *after* items 1–7 above had already shipped, meaning none of that work is confirmed fixed. Item 8 (`#gg-console-mode` removal) was shipped in direct response but has **not been retested live yet.**

**Unconfirmed — needs live testing, in priority order:**
- Whether removing `#gg-console-mode` actually fixes satellite unresponsiveness (the leading hypothesis, not proven)
- If still broken: check the console for the new `[CanvasSatellites]` error logging (item 7) — it will now name exactly which satellite and why, if a per-item exception is the actual cause
- The entire AIMS profile system (Trackpad/Joystick/Offset) — built and reasoned through carefully, never exercised live
- The Tap Bulb's full state machine, especially the slide-off-to-cancel behavior
- AimsEdge automate's "feel" approaching a real corner — the ratio-preserving math is verified numerically, not felt live
- `debug-btn`'s new long-press → console/panel toggle
- The `aims-sat-mirror` satellite's own tap/hold cycle

---

## For Next Time

- **Full server restart, not page reload, before retesting anything above.** This project's own standing gotcha (ES module URL caching) has plausibly explained at least one "still doesn't work" report already this session after a real fix had shipped.
- **If satellites are still unresponsive after a real restart**, don't re-audit the whole chain from scratch again — check the console first. The new error logging in `canvas-satellites.js` will name the exact satellite and exception if that's the cause; if the console is clean, the bug is genuinely somewhere new and item 6's architecture correction (real-touch-first) is the next place to re-verify live, since it was the largest structural change and is the most likely to have a live-only edge case a static read wouldn't catch.
- **"Rearrange the satellite buttons"** was requested but not implemented — no concrete new layout was given. Needs specifics (which buttons, what arrangement) before it can be built.
- **Report symptoms precisely**, per the previous summary's own advice, repeated because it mattered again this session: "visible but not responding" was the single most useful sentence in the whole back half — it eliminated rendering, DPR, and geometry as suspects immediately and pointed straight at dispatch/interception. That level of specificity is worth leading with every time.
