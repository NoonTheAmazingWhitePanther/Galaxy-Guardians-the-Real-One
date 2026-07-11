# TODO — Galaxy Guardians: The Real One
*(fresh start 2026-07-11 — supersedes docs/stuff/TODO.md)*

---

## 🎯 PRIME GOAL

> **160 planets · 60 constant fps.**
> Pure frames preferred; frame skipping only as the measured last resort
> (Pure Frames Law, rules.md). Every item below either serves this or
> keeps the ship honest while we chase it. Every session starts by asking
> what moves this number.

### First moves toward it
- [ ] **Add a 160-planet tier to the benchmark ladder** (TIERS currently
      jumps 120→240; 160 is the prime goal and deserves its own canonical
      rung so BEST PREFERENCES optimizes it directly).
- [ ] **Baseline run**: full Pure-Frames benchmark on the POCO C71 and one
      higher-end device — record where 160p sits today (fps at pure
      frames, minimum skip needed if any). This is the number we beat.
- [ ] **Dormancy Stage 2**: act on the hot/cold classification (Stage 1
      measures only). Cold bodies are the biggest untapped budget at 160p.
- [ ] **Scope `cacheDirtySubsteps` to cold bodies only** (currently
      global — pure perf win, no behavior change).
- [ ] Profile the 160p frame with MsProbe on-device: identify the top 3
      ms consumers before optimizing anything blind.

---

## 🔬 Live-test checklist (built, unconfirmed on device)

*This session:*
- [ ] Sun Spread fans — dbg/aims/paint positions, taps land, Tetris fan
      still anchors off dbg-closeall, master slider top edge, rotation/
      resize recompute.
- [ ] WarmupFlow boot — greeting card, Yes → 3-card stack from the left,
      5.0→0.0 counters, tap runs the right depth, 0.0 postpones.
- [ ] Blob cards — grow-from-left jelly feel, mirrored collapse, buttons
      tappable only once grown, announcements transparent to touch.
- [ ] ScreenGov — hz readout correct on the POCO (bind a panel line to
      ScreenGov.debugInfo); check on a 90/120Hz device if available.
- [ ] **Re-run BEST PREFERENCES** — old ones were tuned on contaminated
      measurements; expect renderFrameSkip 0 on most tiers now.
- [ ] Trails — kill a planet mid-flight (no streak); Skip 3–4 (head glued
      to the body).
- [ ] Sun — hard pan/zoom (no jump/double), idle corona (no fog buildup),
      close flyby (trail fades into the clean zone, no hard circle).

*Carried from previous session:*
- [ ] PrefsStore reload survival (pin → drag → reload).
- [ ] Fit button.
- [ ] Master knob at 1.0 = half speed.
- [ ] Tap-toggle-to-extreme (run to bound / stop mid-flight /
      opposite-cancel).
- [ ] Hold-gate on all three HTML buttons while OFF.
- [ ] Centroid ring under pan.

---

## 🧹 Housekeeping
- [ ] Delete `js/modules/rendering/trails.js` (retired, zero references).
- [ ] Delete or archive `docs/stuff/TODO.md` (superseded by this file).

---

## ⚖️ Open decisions (need Noon's call, not code)
- [ ] Ring-dust plane policy — currently plane 0 only; decide whether dust
      paints on all planes or stays plane-0-only by design.
- [ ] Selection group panel — Collect icon, group-drag, deselect gestures
      are stubs; decide scope or cut.
