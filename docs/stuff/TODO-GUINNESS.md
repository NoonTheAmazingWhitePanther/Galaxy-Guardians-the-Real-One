# TODO-GUINNESS — The Book of Known Limitations
*Knowing the limitations is the way to beat them and override them.*

Every entry: a checkbox, the limitation, and the GG counter-move. Check a box when
the limitation is confirmed handled (or consciously declared out of scope).
Physics claims are tagged: **[REAL]** live integration · **[CACHED]** precomputed
exact · **[FAKE]** bounded-error approximation or visual interpolation.
Honesty rule: FAKE is not an insult — it is a label. Untagged fakery is the sin.

---

## 1 · BROWSERS (all major engines)

### Canvas hard caps
- [ ] **iOS Safari: per-canvas area cap 16,777,216 px (4096×4096).** One pixel
  over and the 2D context refuses to draw. Counter: the Accumulator ring buffers
  are device-res (720p–1440p) — safe. Guard rail: assert `w*h ≤ 16.7M` at buffer
  allocation, clamp with a console warning.
- [ ] **iOS Safari: TOTAL canvas memory pool ~224–384 MB** (version/device
  dependent), and Safari *hoards* released canvases. Counter: fixed-N ring
  buffer already never grows; add a `releaseCanvas()` (resize to 1×1 + clear)
  on any buffer we truly discard (theme swap, resolution change).
- [ ] **Chrome/Firefox: max canvas dimension 32,767 px per side**, with lower
  total-area caps on mobile. Counter: same allocation guard; we never approach
  this at device resolution.
- [ ] **A 4096×4096 RGBA canvas = 64 MB.** Ring depth × resolution is a memory
  equation, not a free knob. Counter: the Screen Resolution panel's planned
  memory/fill-rate estimate readout — promote from TODO to guard.

### Loop & timing
- [ ] **rAF is throttled/paused in background tabs** (timers drop to ~1 Hz).
  Counter: accumulator overload clamp (already law) + explicit "welcome back"
  cache invalidate on `visibilitychange` so ghosts never resume from stale time.
- [ ] **rAF locks to display refresh: 60/90/120/144 Hz + VRR.** At 120 Hz each
  frame drains ~half the steps — stepsFrame stats shift, benchmarks skew.
  Counter: fixed timestep 0.016 already makes motion time-true; make the
  Benchmark record refresh rate in the device profile (Mesh War input).
- [ ] **iOS Low Power Mode caps rAF at ~30–60.** Counter: same as above; the
  1000 law is measured in virtual steps, not frames — already immune, verify.
- [ ] **Long task > 50 ms = input starvation + jank flag.** Counter: QueOps
  lanes + Gates exist for exactly this; keep the hot path queue-free.
- [ ] **GC pauses.** Counter: zero closures in hot loops (law), pooling,
  MsProbe (self) rows expose any GC spikes as unexplained remainder.

### Storage / modules / input
- [ ] **localStorage ~5 MB quota; Safari private mode throws on write.**
  Counter: PrefsStore two-phase write already isolates all storage — wrap the
  single save() door in try/catch → session-only fallback (same switch the 🍪
  consent gate needs; one mechanism, two masters).
- [ ] **ES modules demand http://, never file://** — and localhost caches
  modules by URL (the restart law). Documented; keep in README quick start.
- [ ] **Autoplay audio requires a user gesture** on all mobile browsers.
  Counter: arm audio inside the first pointerdown.
- [ ] **Fractional devicePixelRatio (2.625, 1.75…).** Naïve rounding =
  shimmering hit boxes. Counter: AIMS is stamped in integer device pixels —
  audit that every DPR multiply rounds the SAME direction everywhere
  (visible ⟺ touchable is a law; DPR is where laws die quietly).
- [ ] **Touch vs Pointer events, passive listeners, `touch-action`.**
  Counter: single input path already; declare `touch-action: none` on the
  canvas and passive:false only where preventDefault is real.
- [ ] **100vh / URL-bar resize dance on mobile.** Counter: size from
  `visualViewport`, re-stamp AIMS on resize (already must call syncDebugPanels).

---

## 2 · LOW-END PHONES (POCO C71 class and equivalents)

- [ ] **4 GB RAM, shared with OS + zram; a browser tab is killed near
  ~1–1.5 GB.** Counter: ring buffers fixed at init; the memory estimate readout
  becomes a *budget*, not a display.
- [ ] **UNISOC T7250 / Mali-G57 MP1-class GPU: fill-rate bound at 720p.**
  Every full-screen composite pass is the real currency. Counter: resolution
  ramp on old trails (shipped), Gates on draw passes (shipped), LOD tiers.
- [ ] **Thermal throttling after ~5–10 min of sustained load.** A cold-device
  benchmark lies. Counter: BEST PREFERENCES should offer a "warm run" mode —
  discard the first N seconds, or re-run and keep the worse score.
- [ ] **60 Hz panels, touch sampling sometimes lower than refresh.** Counter:
  input deltas recorded with timestamps (replay object spec already demands it).
- [ ] **Slow eMMC storage → module load waterfall on first visit.** 89 modules,
  89 requests. Counter: HTTP/2 or a single-file concat build *for shipping
  only* (dev stays no-build). Low priority until public.

---

## 3 · CHIPSETS — Snapdragon / MediaTek / UNISOC, new and old

- [ ] **Old (Snapdragon 4xx/6xx, 32-bit era): JS single-core bound.** The
  main thread IS the engine. Counter: the 1000 law's whole architecture; SMALL
  mode below 80 bodies is the graceful floor.
- [ ] **big.LITTLE scheduling: the main thread can migrate to a LITTLE core
  mid-session** and halve throughput with no warning. Counter: CycleMeter
  already measures actual drained steps — a sustained lawPct drop with no body
  count change is the fingerprint; log it in the device profile.
- [ ] **Canvas2D GPU acceleration varies by driver** — some devices raster on
  CPU. Counter: benchmark scores it implicitly; never assume a pass is cheap
  because it was cheap on the C71.
- [ ] **New flagships (8-Elite class): fast, but same browser caps apply** —
  canvas memory and area limits do not scale with the chipset. Counter: LOD
  ladder up, caps still guarded.

---

## 4 · RISC-V

- [ ] **JS JIT support on RISC-V is still maturing** (V8/JSC baseline or
  interpreter tiers on many boards) → JS can run several times slower than
  the same clock on ARM. Counter: SMALL mode + Governors already degrade
  gracefully; treat RISC-V as "runs, low law."
- [ ] **GPU drivers (e.g. IMG BXE on JH7110-class boards) are weak or
  missing on Linux → software-raster canvas.** Counter: fill-rate governor +
  resolution ramp are the survival kit. Populated-device rule: only VisionFive
  2 / Milk-V class boards are worth a checkbox today; revisit yearly.

---

## 5 · MINI PCs, TV BOXES, ROKU-CLASS, DIGITAL-TV DEVICES

*Populated-ones-only rule applied.*

- [ ] **Roku: no user-facing web browser exists.** GG cannot run natively.
  Path: casting/screen-mirroring from a phone (the phone does the work).
  Declare out of scope for direct play; in scope as a *display* target.
- [ ] **Android TV / Google TV boxes: browsers exist but are not TV-optimized;
  input is a D-pad.** AIMS has no focus-navigation concept. Counter: a D-pad
  → virtual-pointer mode (move a cursor with arrows) is the cheap unlock;
  full focus graph is not worth it yet.
- [ ] **Raspberry Pi 4/5 as kiosk/digital-TV:** Chromium runs well IF GPU
  compositing is enabled; Pi Zero class = software raster, SMALL mode only.
  Counter: document the flag; benchmark handles the rest.
- [ ] **Fire TV Silk / Tizen / webOS browsers: aging engine forks, tight
  memory, remote input.** Same D-pad problem + stricter canvas memory.
  Counter: same virtual-pointer mode; treat as low tier in the Mesh War.
- [ ] **TV overscan: edges of the canvas may be cut off.** Counter: safe-area
  margin knob (also solves phone notches — one mechanism, two masters).

---

## 6 · SCREENS, DISPLAYS, EXOTIC SURFACES

- [ ] **Notches / cutouts / rounded corners:** `env(safe-area-inset-*)` —
  debug satellites and the bottom bar must respect it.
- [ ] **OLED burn-in from static debug chrome.** Counter: panels are
  user-movable already; optional auto-dim of idle panels (GUI Governor SLOW
  is 90% of this feature already).
- [ ] **HDR canvas: not broadly available — assume SDR.**
- [ ] **e-paper / ink displays: 1–15 Hz effective refresh, ghosting,
  16-gray.** Smooth animation is physically impossible. Counter — and this is
  a gift: **Keyframe Mode.** Physics runs full-speed internally [REAL/CACHED],
  the display shows 1 fps stills. FutureCache means the still can be *chosen*
  (most interesting upcoming tick). Palette must survive luminance-only —
  named colors need a grayscale audit.
- [ ] **Car screens: browsers are locked out while driving (CarPlay /
  Android Auto forbid arbitrary web); parked-mode browsers (Tesla-class,
  Chromium) work but cap at 60 Hz with high touch latency.** Declare:
  parked-mode = a normal desktop-class target; driving-mode = out of scope
  (legal, not technical).
- [ ] **Watches: no real canvas-app browser surface (Apple Watch/WearOS).**
  Out of scope for play; possible *companion* display someday (stats via
  the replay/share object).
- [ ] **Glasses / XR: WebXR is a separate render path** (not Canvas2D).
  Out of scope until an Invaders-Layer-style overlay story exists for XR
  browsers. Checkbox parked, not deleted.

---

## 7 · RENDERING LIMITATIONS — cross-platform general

- [ ] **Canvas2D is CPU-path on more devices than anyone admits.**
  Fill-rate is the universal currency. Counter: everything in the See-it
  layer; keep composite passes countable and gateable (they are).
- [ ] **`shadowBlur` and large-radius filters are performance grenades**
  on mobile. Counter: bloom/glow must stay the TrailGov way (pre-rendered /
  composite tricks), never per-shape shadowBlur in a loop.
- [ ] **`getImageData` stalls the GPU pipeline.** Never in a hot path.
  Audit: overlay/debug code only, never per-frame.
- [ ] **Old GPU texture cap 4096 px:** oversized offscreen buffers can fall
  off the fast path silently. Counter: same allocation guard as §1.
- [ ] **`alpha:false` main canvas wins compositing** — shipped. The Invaders
  Layer needs the opposite (transparent) — that render-mode switch must be a
  *mode*, not a constant, so both stay fast.
- [ ] **DPR scaling blur:** draw at integer device pixels, scale with CSS —
  already the design; keep it a law when LOD tiers change buffer sizes.

---

## 8 · MULTIPLAYER / SERVER — the honest list

- [ ] **Latency 30–150 ms typical, mobile jitter worse.** No architecture
  hides it; pick a model that budgets it.
- [ ] **WebSocket is the only transport that works everywhere;** WebRTC
  DataChannel (unordered/unreliable, lower latency) needs STUN and often a
  paid TURN relay behind carrier NAT. Counter: start WebSocket; DataChannel
  is an optimization, not a foundation.
- [ ] **⚠️ CROSS-ENGINE FLOAT DETERMINISM: `Math.sin/cos/pow` results can
  differ between V8, JSC, and SpiderMonkey.** Same-engine replay is exact
  [CACHED]; cross-engine lockstep can desync silently. This is THE landmine
  under "load the replay in a different instance." Counter: (a) verify with a
  cross-browser trig fingerprint test, (b) if it bites: fixed-point or
  polyfilled deterministic math for the sim core, or (c) periodic state
  snapshots as sync anchors — snapshots are FutureCache's native food anyway.
- [ ] **Rollback netcode is FutureCache's cousin** — predict, then correct.
  The ghost machinery is 70% of a rollback engine already. Note it, smile,
  build later.
- [ ] **Clock drift between peers.** Counter: server-authoritative time or
  periodic re-sync; the accumulator's banked-time discipline extends
  naturally.
- [ ] **Leaderboards need a backend + abuse protection.** Counter: the replay
  object IS the anti-cheat — a score without a deterministic replay that
  reproduces it is rejected. (Same-engine caveat above applies.)
- [ ] **Server cost scales with sync model:** relay (cheap) vs authoritative
  simulation (expensive). Complete-replay sharing (already spec'd) is
  serverless — hold that line as long as possible.

---

## 9 · LEGITIMATION — legal, consent, ratings

- [ ] **🍪 Cookies/localStorage consent = PRIME №1** (already in TODO.md).
  Gate at PrefsStore.save(); decline → RAM-only prefs. GDPR/ePrivacy note:
  purely functional storage may qualify for the strictly-necessary
  exemption, but the banner is the safe harbor — ship it regardless.
- [ ] **Ratings — make us easy to rate:**
  - Web: a visible "★ Rate / Star on GitHub" link (zero infra).
  - If ever wrapped for Play Store: IARC content questionnaire (GG is
    violence-cartoon-level at most; expect Everyone/PEGI 3–7).
  - In-app: the Update Bar can carry a one-line "enjoying it? ★" toast,
    rate-limited, dismiss-forever respected in prefs.
- [ ] **COPPA/child-directed check:** GG is a general-audience physics toy,
  not child-directed — document that stance before any account/analytics
  feature exists.
- [ ] **GPL v3 hygiene:** license + source link must travel with any
  wrapped/extension distribution (Invaders Layer especially).

---

## 10 · PHYSICS TRUTH TABLE — Real vs Fake vs Cached (engine-wide audit)

| System | Tag | Notes |
|---|---|---|
| Live integration (tick.js) | **REAL** | fixed 0.016, symplectic |
| Sun gravity (analytic per particle) | **REAL** | exact, even in grid mode |
| FutureCache played ticks | **CACHED** | byte-for-byte = live |
| Dormancy cold-body coasting | **CACHED** | replaying real computed future |
| Gravity Grid planet forces | **FAKE (bounded)** | ~0.5% mean error after gatherNear de-aliasing; label it, prove the bound in MsProbe A/B |
| Tween positions *between* cached samples | **FAKE (bounded)** | chord vs arc, sagitta ≈ a·(LΔt)²/8 — see Tween Law in TODO.md |
| Tween endpoints | **CACHED** | exact samples |
| Trail fade / bloom / phosphor | **FAKE (visual)** | honest cosmetics, no physics claim |

Rule: any new interpolation, approximation, or precompute gets a row here
before it ships. If it is FAKE, its error bound gets written next to it.

---

*This ledger is designed to be re-phrased alone into an execution plan:
each checked box is a closed risk; each open box is a task with a known enemy.*
