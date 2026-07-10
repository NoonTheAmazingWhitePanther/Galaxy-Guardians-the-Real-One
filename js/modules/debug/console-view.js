/**
 * js/modules/debug/console-view.js
 *
 * LIVE TEXT DEBUG — a single frosted-glass console that replaces the floating
 * panels with one dense, scrollable list of every tunable knob.
 *
 * It is a DOM overlay (not canvas) on purpose: the glass "material" is a real
 * backdrop-filter blur, the first line is a native <input> (mobile keyboard +
 * copy/paste/select-all), and the list scrolls natively — none of which the
 * canvas panel path can do.
 *
 * Nothing here reinvents control logic. Every row wraps the SAME Governor the
 * panels build from debug-config.json's `buttons` lines, so ranges, AUTO/MANUAL
 * state, dynamic maxes and .pressure all match the panels exactly and stay in
 * sync. + = − dispatch to governor.multiply() / idle() / divide() — identical
 * to panel.js. The master box scales every row from a captured baseline, the
 * same base×factor math as Panel.applyRatioScale.
 *
 * Visibility rides DebugRouter.masterEnabled (the 〰️ toggle). The mode button
 * flips between console and the existing canvas panels via
 * DebugRouter.setConsoleMode(), which hides the panels (and, because the AIMS
 * hit-map is built from visible panels, drops their tap regions too).
 */
import { resolveVariable, Governor, ManualOverrides } from './governor.js';

const CSS = `
#gg-console{ position:fixed; z-index:24; display:none; flex-direction:column;
  left:var(--safe,16px);
  /* Fallback only — _layout() overrides top/height live. This keeps the
     console clear of the top-left debug buttons (safe + two 44px buttons +
     a safe-gap) even in the first frame before JS measures. */
  top:calc(var(--safe,16px)*2 + var(--pad-size,44px)*2);
  width:min(420px, calc(100vw - var(--safe,16px)*2));
  max-height:calc(100vh - var(--safe,16px)*4 - var(--pad-size,44px)*2);
  border-radius:16px; overflow:hidden;
  font-family:var(--ui-font,"Space Mono",ui-monospace,monospace);
  color:rgba(240,245,255,0.94);
  background:linear-gradient(158deg, rgba(30,40,66,0.42), rgba(10,12,24,0.30));
  backdrop-filter:blur(18px) saturate(1.35); -webkit-backdrop-filter:blur(18px) saturate(1.35);
  border:1px solid rgba(255,255,255,0.16);
  box-shadow:0 12px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.22),
             inset 0 0 70px rgba(130,210,255,0.05); }
#gg-console.show{ display:flex; }
#gg-console::before{ content:""; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(125deg, rgba(255,255,255,0.12), rgba(255,255,255,0) 34%,
            rgba(255,255,255,0) 70%, rgba(255,255,255,0.05)); mix-blend-mode:screen; }

#gg-console .firstline{ position:relative; z-index:2; display:flex; align-items:center; gap:8px;
  padding:9px 12px; border-bottom:1px solid rgba(255,255,255,0.09);
  background:linear-gradient(rgba(130,210,255,0.06), transparent); }
#gg-console .firstline .caret{ color:rgba(130,210,255,0.9); font-weight:700; font-size:13px; }
#gg-console .firstline input{ flex:1; min-width:0; border:0; outline:0; background:transparent;
  color:rgba(240,245,255,0.94); font-family:inherit; font-size:12.5px;
  caret-color:rgba(130,210,255,0.9); user-select:text; -webkit-user-select:text; }
#gg-console .firstline input::placeholder{ color:rgba(160,190,230,0.5); }

#gg-console .list{ position:relative; z-index:1; flex:1; overflow-y:auto; overscroll-behavior:contain;
  touch-action:pan-y; padding:2px 0; scrollbar-width:thin;
  scrollbar-color:rgba(130,210,255,0.35) transparent; }
#gg-console .list::-webkit-scrollbar{ width:5px; }
#gg-console .list::-webkit-scrollbar-thumb{ background:rgba(130,210,255,0.32); border-radius:3px; }
#gg-console .grp{ padding:5px 12px 2px; font-size:9px; font-weight:700; letter-spacing:.16em;
  color:rgba(130,210,255,0.34); }

#gg-console .row{ position:relative; display:flex; align-items:center; gap:6px;
  height:22px; padding:0 12px; font-size:11.5px; line-height:1; }
#gg-console .row .lab{ flex:1; color:rgba(198,214,240,0.55); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#gg-console .row .val{ min-width:52px; text-align:right; font-weight:700; font-variant-numeric:tabular-nums; }
#gg-console .row.auto .val{ color:rgba(130,210,255,0.34); font-weight:400; }
#gg-console .row .btns{ display:flex; }
#gg-console .row .btns b{ width:26px; height:22px; display:flex; align-items:center; justify-content:center;
  font-weight:700; font-size:14px; color:rgba(255,255,255,0.7); cursor:pointer; user-select:none; }
#gg-console .row .btns b.eq{ color:rgba(198,214,240,0.55); font-size:13px; }
#gg-console .row.auto .btns b.eq{ color:rgba(130,210,255,0.9); }
#gg-console .row .btns b:active{ color:#fff; transform:scale(0.85); }
#gg-console .row .bar{ position:absolute; left:12px; bottom:0; height:2px; width:calc(100% - 24px);
  background:rgba(255,255,255,0.09); border-radius:2px; overflow:hidden; }
#gg-console .row .bar i{ position:absolute; left:0; top:0; height:100%; width:0%;
  background:rgba(130,210,255,0.9); border-radius:2px; transition:width .12s ease, background .2s; }
#gg-console .row.warm .bar i{ background:#ffd77f; box-shadow:0 0 6px rgba(255,215,127,0.7); }
#gg-console .row.warm .val{ color:#ffd77f; }
#gg-console .row.hot .bar i{ background:#ff7f7f; box-shadow:0 0 8px rgba(255,127,127,0.85);
  animation:gg-redline 1.1s ease-in-out infinite; }
#gg-console .row.hot .val{ color:#ff7f7f; }
@keyframes gg-redline{ 0%,100%{ box-shadow:0 0 6px rgba(255,127,127,0.6);} 50%{ box-shadow:0 0 14px rgba(255,127,127,1);} }

#gg-console .master{ position:relative; z-index:2; margin:8px 12px 12px; height:56px; border-radius:10px;
  border:1px solid rgba(130,210,255,0.9); overflow:hidden; display:flex; align-items:center;
  transition:border-color .2s, box-shadow .2s; background:linear-gradient(transparent, rgba(255,255,255,0.02)); }
#gg-console .master .fill{ position:absolute; left:0; bottom:0; width:100%; height:50%;
  background:rgba(130,210,255,0.16); transition:height .12s ease, background .2s; }
#gg-console .master .mtxt{ position:relative; z-index:1; padding-left:14px; }
#gg-console .master .mlab{ font-size:10px; font-weight:700; letter-spacing:.14em; color:rgba(130,210,255,0.9); }
#gg-console .master .mval{ font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; }
#gg-console .master .mbtns{ position:relative; z-index:1; margin-left:auto; display:flex; padding-right:4px; }
#gg-console .master .mbtns b{ width:32px; height:56px; display:flex; align-items:center; justify-content:center;
  font-size:17px; font-weight:700; color:rgba(255,255,255,0.75); cursor:pointer; }
#gg-console .master .mbtns b:active{ transform:scale(0.85); }
#gg-console .master.warm{ border-color:rgba(255,255,255,0.16); }
#gg-console .master.warm .fill{ background:rgba(255,215,127,0.18); }
#gg-console .master.warm .mval{ color:#ffd77f; }
#gg-console .master.over{ border-color:#ff7f7f; border-width:2px;
  box-shadow:0 0 22px rgba(255,127,127,0.55), inset 0 0 24px rgba(255,127,127,0.18);
  animation:gg-overdrive 1.4s ease-in-out infinite; }
#gg-console .master.over .fill{ background:rgba(255,127,127,0.22); }
#gg-console .master.over .mval{ color:#ff7f7f; }
@keyframes gg-overdrive{ 0%,100%{ box-shadow:0 0 16px rgba(255,127,127,0.4), inset 0 0 20px rgba(255,127,127,0.12);}
  50%{ box-shadow:0 0 30px rgba(255,127,127,0.8), inset 0 0 30px rgba(255,127,127,0.25);} }
`;

export const ConsoleView = {
  _router: null,
  _root: null, _listEl: null, _master: null,
  _rows: [],            // { key, gov, variable, el, valEl, barEl, manualKey }
  _consoleMode: false,   // PANELS are the default on debug-on; the console stays hidden until debug-btn is long-pressed
  _timer: null,

  // Master: global ratio over every row. Range 0..2, unity 1.0 (matches
  // MasterGovernor). Baseline captured from live values, scaled base×factor —
  // same intent as Panel.applyRatioScale. Flares at 0.75 (warm) / 1.75 (over).
  _masterVal: 1.0, _masterStep: 0.05, _baseline: null,

  init(router) {
    if (this._root) return;
    this._router = router;

    const style = document.createElement('style');
    style.id = 'gg-console-css'; style.textContent = CSS;
    document.head.appendChild(style);

    // glass slab
    const root = document.createElement('div');
    root.id = 'gg-console';
    root.innerHTML =
      '<div class="firstline"><span class="caret">&#8250;</span>' +
      '<input type="text" spellcheck="false" autocomplete="off" ' +
      'placeholder="Welcome to the Spaceship my friend. Write something here to keep coherence."></div>' +
      '<div class="list"></div>' +
      '<div class="master"><div class="fill"></div>' +
      '<div class="mtxt"><div class="mlab">MASTER</div><div class="mval">1.00&#215;</div></div>' +
      '<div class="mbtns"><b data-d="1">+</b><b data-d="0" class="eq">=</b><b data-d="-1">&#8722;</b></div></div>';
    document.body.appendChild(root);
    this._root   = root;
    window._ConsoleView = this;          // glasses satellite reaches us here
    this._listEl = root.querySelector('.list');
    this._master = { el: root.querySelector('.master'),
                     val: root.querySelector('.mval'),
                     fill: root.querySelector('.fill') };

    // Stop taps inside the glass from reaching the canvas (pan/zoom/spawn)
    // — but only while AIMS is off. FIX ("InAims does not work inside ...
    // Console"): this used to stop propagation unconditionally, which also
    // silently killed the window-level input router for EVERY tap in this
    // box, including ones meant to become an AIMS charge gesture — nothing
    // downstream (canvas satellites, AIMS itself) could ever see them.
    // While AIMS is on, let the tap bubble to the window listener like
    // everywhere else does; masterEnabled already being true while console
    // shows means InPlanet/world-spawn stay excluded regardless (see
    // input.module.js), so this doesn't reopen the original leak-to-canvas
    // concern for the one thing that mattered (planet spawning).
    root.addEventListener('pointerdown', (e) => {
      if (!window._InAims?.enabled) e.stopPropagation();
    }, { passive: true });

    // Re-fit whenever the viewport changes (rotation, keyboard, resize).
    window.addEventListener('resize', () => this._layout());

    root.querySelectorAll('.master .mbtns b').forEach(b =>
      b.addEventListener('click', () => this._masterStepBy(+b.dataset.d)));

    // Build rows once the router has fetched + parsed the config.
    this._waitForConfig(() => {
      this._buildRows();
      this._captureBaseline();
      // Panel mode is the default (this._consoleMode starts false) — debug
      // itself still starts OFF; this only decides which face shows once
      // it's turned on, or once debug-btn is long-pressed into console mode.
      if (this._consoleMode) {
        this._router.setConsoleMode?.(true);
      }
      this._layout();
      this.sync();
    });
  },

  // ── Layout — fit between the debug buttons and the bottom bar ─────────────
  // Three gaps, all equal to GAP (the screen's --safe rhythm), measured live
  // so the console + its master always fit, at any screen size / rotation:
  //   1. debug toggle button  →  console top      (never overlaps the buttons)
  //   2. scrolling list       →  console master   (.master margin-top)
  //   3. console master       →  bottom bar (#ui)  (never overlaps the bar)
  // 👓 ratio — the console follows the same ×1/×2/×3 scale as the panels.
  // Implemented with CSS zoom (scales every px style at once); _layout divides
  // the JS-owned top/height by the zoom so the box still fits the viewport.
  setScale(r) {
    this._scale = Math.max(1, Math.min(3, r || 1));
    if (this._root) this._root.style.zoom = this._scale;
    this._layout();
  },

  _layout() {
    const root = this._root;
    if (!root) return;
    const Z = this._scale || 1;

    const cs  = getComputedStyle(document.documentElement);
    const GAP = parseFloat(cs.getPropertyValue('--safe')) || 16;

    // TOP: clear debug-btn (the 〰️ toggle — the only top-left button left,
    // now that the mode button is gone and its job moved to a long-press on
    // this one), by GAP. Falls back to the CSS stack height if it isn't laid
    // out yet.
    let topY = GAP + 44;
    let lowest = 0;
    const dbgBtnEl = document.getElementById('debug-btn');
    if (dbgBtnEl) {
      const r = dbgBtnEl.getBoundingClientRect();
      if (r.height > 0) lowest = r.bottom;
    }
    if (lowest > 0) topY = lowest + GAP;

    // BOTTOM: keep GAP above the bottom bar (#ui). Measured live, so the bar's
    // real height / wrapping / safe-area never lets it overlap the master.
    let bottomLimit = window.innerHeight - GAP;
    const ui = document.getElementById('ui');
    if (ui) {
      const r = ui.getBoundingClientRect();
      if (r.top > 0) bottomLimit = r.top - GAP;
    }

    const h = Math.max(140, bottomLimit - topY);
    // zoom multiplies rendered size — divide the JS geometry so the zoomed
    // box lands exactly between the buttons and the bottom bar.
    root.style.top       = (topY / Z) + 'px';
    root.style.height    = (h / Z) + 'px';
    root.style.maxHeight = 'none';   // JS owns the height now; drop the CSS cap

    // MIDDLE gap: same GAP between the scrolling list and the master box.
    if (this._master && this._master.el) this._master.el.style.marginTop = GAP + 'px';
  },

  _waitForConfig(done) {
    const r = this._router;
    if (r && r._initialized && r._config?.panels) { done(); return; }
    let tries = 0;
    const iv = setInterval(() => {
      if ((r._initialized && r._config?.panels) || ++tries > 200) { clearInterval(iv); done(); }
    }, 50);
  },

  // Walk every panel's `buttons` lines → one row each, deduped, grouped by
  // panel title. Same Governor the panels use.
  _buildRows() {
    const panels = this._router._config?.panels || [];
    const seen = new Set();
    for (const p of panels) {
      const lines = (p.lines || []).filter(l => l.type === 'buttons' && l.variable);
      if (!lines.length) continue;
      let headerDrawn = false;
      for (const line of lines) {
        if (seen.has(line.variable)) continue;
        const variable = resolveVariable(line.variable);
        if (!variable) continue;
        seen.add(line.variable);

        if (!headerDrawn) {
          const g = document.createElement('div');
          g.className = 'grp'; g.textContent = (p.title || p.id || '').toUpperCase();
          this._listEl.appendChild(g); headerDrawn = true;
        }

        const gov = new Governor(variable, line.governor || {});
        const el = document.createElement('div');
        el.className = 'row';
        el.innerHTML =
          '<span class="lab">' + (line.text || line.variable) + '</span>' +
          '<span class="val"></span>' +
          '<span class="btns"><b data-d="1">+</b><b data-d="0" class="eq">=</b><b data-d="-1">&#8722;</b></span>' +
          '<span class="bar"><i></i></span>';
        const rec = { key: line.variable, gov, variable,
          manualKey: variable.manualKey || null,
          el, valEl: el.querySelector('.val'), barEl: el.querySelector('.bar i'),
          step: (line.governor && line.governor.step) || 1 };
        el.querySelectorAll('.btns b').forEach(b =>
          b.addEventListener('click', () => this._tune(rec, +b.dataset.d)));
        // LAZY SLIDER: pressing the row (label/value area, not the ± buttons)
        // builds this variable's slider on first touch — zero DOM cost until
        // then. Range is precomputed once so drags are pure math.
        el.querySelector('.lab').addEventListener('click', () => this._toggleSlider(rec));
        el.querySelector('.val').addEventListener('click', () => this._toggleSlider(rec));
        this._listEl.appendChild(el);
        this._rows.push(rec);
        this._paintRow(rec);
      }
    }
  },

  // ── Lazy tweened slider ──────────────────────────────────────────────────
  // Built ONLY when the row is pressed. The range (min/max/step) is frozen at
  // creation so every drag frame is one multiply; the fill/thumb TWEENS toward
  // the finger (rAF lerp) and the value writes through on each animated step —
  // the same eased-glide feel as the mixer knobs.
  _toggleSlider(rec) {
    if (rec.sliderEl) {                       // built before → just show/hide
      const hide = rec.sliderEl.style.display !== 'none';
      rec.sliderEl.style.display = hide ? 'none' : 'block';
      if (!hide) this._syncSlider(rec);
      return;
    }
    // precompute the range once — smooth fluid drag is pure math afterwards
    const gv = rec.gov.value;
    let min = Number.isFinite(rec.gov.min) ? rec.gov.min : 0;
    let max = Number.isFinite(rec.gov.max) ? rec.gov.max : (Number.isFinite(gv) && gv !== 0 ? Math.abs(gv) * 4 : 1);
    if (max <= min) max = min + 1;
    const step = rec.step || 0.01;
    rec.sl = { min, max, span: max - min, step,
               dp: (step < 1) ? (String(step).split('.')[1] || '').length : 0,
               frac: 0, target: 0, anim: 0, dragging: false };

    const sl = document.createElement('div');
    sl.className = 'cslider';
    sl.innerHTML = '<div class="track"><div class="sfill"></div><div class="thumb"></div></div>';
    rec.el.after(sl);
    rec.sliderEl = sl;
    rec.slFill   = sl.querySelector('.sfill');
    rec.slThumb  = sl.querySelector('.thumb');

    const track = sl.querySelector('.track');
    const setTarget = (clientX) => {
      const r = track.getBoundingClientRect();
      const z = this._scale || 1;               // zoom affects client rects
      rec.sl.target = Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1)));
      this._animSlider(rec);
    };
    track.addEventListener('pointerdown', (e) => {
      rec.sl.dragging = true;
      try { track.setPointerCapture(e.pointerId); } catch (_) {}
      setTarget(e.clientX);
      e.stopPropagation(); e.preventDefault();
    });
    track.addEventListener('pointermove', (e) => { if (rec.sl.dragging) setTarget(e.clientX); });
    const drop = () => { rec.sl.dragging = false; };
    track.addEventListener('pointerup', drop);
    track.addEventListener('pointercancel', drop);

    this._syncSlider(rec);
  },

  _syncSlider(rec) {
    const v = rec.gov.value;
    if (Number.isFinite(v)) {
      rec.sl.frac = rec.sl.target = Math.max(0, Math.min(1, (v - rec.sl.min) / rec.sl.span));
    }
    this._paintSlider(rec);
  },

  _animSlider(rec) {
    if (rec.sl.anim) return;                    // one rAF loop per slider
    const tick = () => {
      const d = rec.sl.target - rec.sl.frac;
      if (Math.abs(d) < 0.0015 && !rec.sl.dragging) {
        rec.sl.frac = rec.sl.target;
        rec.sl.anim = 0;
        this._commitSlider(rec);
        return;
      }
      rec.sl.frac += d * 0.28;                  // the tween — eased knob glide
      this._commitSlider(rec);
      rec.sl.anim = requestAnimationFrame(tick);
    };
    rec.sl.anim = requestAnimationFrame(tick);
  },

  _commitSlider(rec) {
    const { min, span, step, dp } = rec.sl;
    let v = min + rec.sl.frac * span;
    v = Math.round(v / step) * step;
    v = +v.toFixed(Math.min(6, dp + 2));
    rec.variable.set(v);
    this._paintSlider(rec);
    this._paintRow(rec);
  },

  _paintSlider(rec) {
    const pct = (rec.sl.frac * 100).toFixed(2) + '%';
    rec.slFill.style.width = pct;
    rec.slThumb.style.left = pct;
  },

  _isManual(rec) {
    return rec.manualKey ? ManualOverrides.isManual(rec.manualKey) : true;
  },
  _fmt(rec) {
    if (!this._isManual(rec)) return 'AUTO';
    const v = rec.gov.value;
    if (!Number.isFinite(v)) return '—';
    const dp = (rec.step < 1) ? (String(rec.step).split('.')[1] || '').length : 0;
    return dp ? v.toFixed(dp) : String(Math.round(v));
  },
  _paintRow(rec) {
    const auto = !this._isManual(rec);
    rec.el.classList.toggle('auto', auto);
    rec.valEl.textContent = this._fmt(rec);
    const r = Math.max(0, Math.min(1, rec.gov.pressure || 0));
    rec.barEl.style.width = (r * 100).toFixed(1) + '%';
    rec.el.classList.toggle('warm', !auto && r >= 0.75 && r < 0.98);
    rec.el.classList.toggle('hot',  !auto && r >= 0.98);
  },

  _tune(rec, dir) {
    if (dir === 0) rec.gov.idle();          // '=' → AUTO
    else if (dir > 0) rec.gov.multiply();   // '+'
    else rec.gov.divide();                  // '−'
    this._paintRow(rec);
    this._captureBaseline();                // manual edits reset the master baseline
  },

  // ── Master ────────────────────────────────────────────────────────────────
  _captureBaseline() {
    this._masterVal = 1.0;
    this._baseline = this._rows.map(r => (Number.isFinite(r.gov.value) ? r.gov.value : 0));
    this._paintMaster();
  },
  _masterStepBy(dir) {
    if (dir === 0) { this._captureBaseline(); this._applyMaster(); return; }  // '=' → unity
    this._masterVal = Math.max(0, Math.min(2, +(this._masterVal + dir * this._masterStep).toFixed(3)));
    this._applyMaster();
  },
  _applyMaster() {
    if (this._baseline) {
      const f = this._masterVal;
      this._rows.forEach((rec, i) => {
        const base = this._baseline[i];
        if (!Number.isFinite(base)) return;
        const step = rec.step || 0.1;
        let v = Math.round((base * f) / step) * step;
        v = Math.max(rec.gov.min ?? -Infinity, Math.min(rec.gov.max ?? Infinity, v));
        rec.variable.set(Math.round(v * 100) / 100);
        this._paintRow(rec);
      });
    }
    this._paintMaster();
  },
  _paintMaster() {
    const r = this._masterVal;
    this._master.val.innerHTML = r.toFixed(2) + '&#215;';
    this._master.fill.style.height = (Math.min(1, r / 2) * 100).toFixed(1) + '%';
    this._master.el.classList.toggle('warm', r >= 0.75 && r < 1.75);
    this._master.el.classList.toggle('over', r >= 1.75);
  },

  // ── Visibility / mode ───────────────────────────────────────────────────
  // Public (no leading underscore) — called from main.js's debug-btn
  // long-press now that the separate mode button is gone; see rules.md §8.
  toggleMode() {
    this._consoleMode = !this._consoleMode;
    this._router.setConsoleMode?.(this._consoleMode);
    this.sync();
  },

  // Called by the 〰️ debug toggle and by toggleMode().
  sync() {
    const debugOn = !!this._router?.masterEnabled;
    const showConsole = debugOn && this._consoleMode;
    if (this._root) this._root.classList.toggle('show', showConsole);

    if (showConsole) {
      this._layout();          // buttons + bar are visible now → fit to them
      this._refreshOnce();
      if (!this._timer) this._timer = setInterval(() => this._refreshOnce(), 150);
    } else if (this._timer) {
      clearInterval(this._timer); this._timer = null;
    }
    // debug turned off while in console mode → drop console mode on the router
    if (!debugOn && this._consoleMode) this._router.setConsoleMode?.(false);
  },

  _refreshOnce() { for (const rec of this._rows) this._paintRow(rec); },
};

export default ConsoleView;
