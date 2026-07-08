/**
 * js/core/prefs-store.js
 *
 * USER PREFERENCES — a custom, always-readable record of the person's live
 * customizations, saved in REAL TIME and loaded at startup.
 *
 * What's saved:
 *   - every ManualOverrides knob the user actually touched (isManual === true)
 *   - per-panel geometry + state: position, minimized, orientation, pin,
 *     user sizes, contentScale, keepTuningRatio
 *   - the debug view (zoom + pan)
 *
 * Where:
 *   - localStorage['gg-user-prefs'] — plain readable JSON, autosaved every 2s
 *     whenever anything changed (cheap diff of the serialized string).
 *   - window.GGPrefs.export() — downloads the same JSON as a real file
 *     (gg-user-prefs.json) you can keep, read, edit, and re-import.
 *   - window.GGPrefs.import(jsonText) — applies an edited file's content.
 *   - window.GGPrefs.clear() — forget everything (then reload).
 *
 * A browser page can't silently write to disk — localStorage IS the real-time
 * file (readable via GGPrefs.export or devtools); export gives the portable copy.
 */
import { ManualOverrides } from '../modules/debug/governor.js';
import { DEBUG_STATE } from '../modules/debug/debug-state.js';
import { GovernorProfiles } from '../modules/debug/governor-profiles.js';

const KEY     = 'gg-user-prefs';
const KEY_TMP = 'gg-user-prefs.tmp';   // always-duplicated fail-safe copy
const SAVE_MS = 800;

const PANEL_FIELDS = [
  'x', 'y', 'minimized', 'shrunk', 'pinned', '_minVertical',
  '_userW', '_userH', '_userMinW', '_userMinH',
  'contentScale', 'keepTuningRatio',
];

// Build {overrideKey → {min,max}} from the live panel configs (every knob row
// declares its governor range) so loaded values can be range-validated.
function _rangeMap() {
  const map = {};
  for (const p of (window._DebugRouter?.panels || [])) {
    const rows = [...(p.config?.lines || [])];
    if (p.config?.minimizedKnob) rows.push({ ...p.config.minimizedKnob, governor: p.config.minimizedKnob });
    for (const ln of rows) {
      const v = ln.variable;
      const g = ln.governor;
      if (!v || !g) continue;
      const mtc = /^ManualOverrides\.([A-Za-z0-9_]+)\.value$/.exec(v);
      if (mtc && Number.isFinite(g.min) && Number.isFinite(g.max)) {
        map[mtc[1]] = { min: g.min, max: g.max };
      }
    }
  }
  return map;
}

// Some ManualOverrides entries are DERIVED — defined with getter-only
// properties. They can be read but never assigned; saving/loading must skip
// them or the whole load throws.
function _canSet(obj, prop) {
  try {
    const d = Object.getOwnPropertyDescriptor(obj, prop);
    if (!d) return Object.isExtensible(obj);
    if (d.get && !d.set) return false;     // getter-only → hands off
    if (d.set) return true;
    return d.writable !== false;
  } catch (_) { return false; }
}
function _isWritableOverride(o) {
  return o && typeof o === 'object' && _canSet(o, 'value') && _canSet(o, 'isManual');
}

export const PrefsStore = {
  _last: '',
  _timer: null,
  _revision: 0,

  collect() {
    const overrides = {};
    for (const [k, o] of Object.entries(ManualOverrides)) {
      if (o && typeof o === 'object' && o.isManual && _isWritableOverride(o)) {
        overrides[k] = o.value;
      }
    }
    const panels = {};
    for (const p of (window._DebugRouter?.panels || [])) {
      const rec = {};
      for (const f of PANEL_FIELDS) if (p[f] !== undefined && p[f] !== null) rec[f] = p[f];
      panels[p.id] = rec;
    }
    return {
      _about: 'Galaxy Guardians user preferences — readable, editable, re-importable.',
      savedAt: new Date().toISOString(),
      // Profile identity. There is one live profile right now — "user" —
      // which always inherits from "base" (GovernorProfiles.BALANCE, the
      // production-tuned starting point). Base only ever seeds a genuinely
      // fresh session (see PrefsStore.init); once this profile exists, it
      // is the sole source of truth and is never re-stomped by Base again.
      // revision grows +1 every save — a running trail of how long this
      // profile has been continuously tuned, same idea as a chat history
      // that only ever appends. A future multi-profile picker can read
      // this shape directly: inheritsFrom is already here.
      profile: 'user',
      inheritsFrom: 'base',
      revision: ++this._revision,
      // Integrity declaration: on load, the ACTUAL counts must match these.
      // A mismatch means the save was cut short (app died mid-write) — the
      // temp duplicate is used instead.
      integrity: { overrides: Object.keys(overrides).length, panels: Object.keys(panels).length },
      overrides,
      panels,
      // AUTO preferences — the device half of the mesh. Saved beside the
      // Manual half so tuning can weigh Device + User together, competing
      // for the user's ideal across low-end → high-end hardware.
      device: {
        w: window.innerWidth, h: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        cores: navigator.hardwareConcurrency || 0,
      },
      view: {
        zoom: DEBUG_STATE.viewZoom,
        panX: DEBUG_STATE.viewPanX,
        panY: DEBUG_STATE.viewPanY,
      },
    };
  },

  // Verify a parsed prefs doc: integrity counts must match the declaration.
  _integrityOk(prefs) {
    if (!prefs || typeof prefs !== 'object') return false;
    const i = prefs.integrity;
    if (!i) return true;   // older saves: accept
    return Object.keys(prefs.overrides || {}).length === i.overrides &&
           Object.keys(prefs.panels || {}).length === i.panels;
  },

  apply(prefs) {
    if (!prefs || typeof prefs !== 'object') return false;
    // Carry the revision forward — it counts this profile's total tuning
    // history across every session, not just this one run.
    if (Number.isFinite(prefs.revision)) this._revision = prefs.revision;
    // Each and every variable checked: must exist, be finite, and sit inside
    // the range that knob can actually receive (from its config governor).
    const ranges = _rangeMap();
    this._fixed = 0;
    for (const [k, v] of Object.entries(prefs.overrides || {})) {
      const o = ManualOverrides[k];
      if (!o || typeof o !== 'object' || !Number.isFinite(v) || !_isWritableOverride(o)) {
        this._fixed++;
        continue;                                      // unknown / derived / bad → skipped, counted
      }
      let val = v;
      const r = ranges[k];
      if (r && (val < r.min || val > r.max)) {
        val = Math.min(r.max, Math.max(r.min, val));   // out of range → clamped, counted
        this._fixed++;
      }
      try { o.value = val; o.isManual = true; } catch (_) { this._fixed++; }
    }
    for (const p of (window._DebugRouter?.panels || [])) {
      const rec = prefs.panels?.[p.id];
      if (!rec) continue;
      for (const f of PANEL_FIELDS) if (rec[f] !== undefined) p[f] = rec[f];
      p._chromeDirty = true;
    }
    if (prefs.view) {
      if (Number.isFinite(prefs.view.zoom)) DEBUG_STATE.viewZoom = prefs.view.zoom;
      if (Number.isFinite(prefs.view.panX)) DEBUG_STATE.viewPanX = prefs.view.panX;
      if (Number.isFinite(prefs.view.panY)) DEBUG_STATE.viewPanY = prefs.view.panY;
    }
    // STARTUP COORDINATE FIX: the saved pan was measured on the viewport it
    // was saved in. If the debug table's centroid now lands off-screen (device
    // rotation, resize, different window), re-center it instead of restoring a
    // view of empty space.
    this._fixViewCoords();
    try { window._InAims?.syncDebugPanels(); } catch (_) {}
    return true;
  },

  _fixViewCoords() {
    const R = window._DebugRouter;
    const panels = (R?.panels || []).filter(p => p.visible);
    if (!panels.length) return;
    const vz = DEBUG_STATE.viewZoom || 1;
    let cx = 0, cy = 0;
    for (const p of panels) { cx += p.x + (p.w || 120) / 2; cy += p.y + (p.h || 60) / 2; }
    cx /= panels.length; cy /= panels.length;
    const sx = cx * vz + (DEBUG_STATE.viewPanX || 0);
    const sy = cy * vz + (DEBUG_STATE.viewPanY || 0);
    const W = window.innerWidth, H = window.innerHeight, M = 40;
    if (sx < M || sx > W - M || sy < M || sy > H - M) {
      DEBUG_STATE.viewPanX = W / 2 - cx * vz;
      DEBUG_STATE.viewPanY = H / 2 - cy * vz;
    }
  },

  save() {
    try {
      const json = JSON.stringify(this.collect(), null, 1);
      if (json === this._last) return false;
      // Two-phase, always duplicated: the TEMP copy lands first, then the
      // main file. If the app dies mid-write, at least one of them is whole.
      localStorage.setItem(KEY_TMP, json);
      localStorage.setItem(KEY, json);
      this._last = json;
      return true;
    } catch (_) { return false; }
  },

  // Load with the fail-safe: main file first; if it's missing, unparseable,
  // or its integrity counts don't match (saved undone → assured problems),
  // fall back to the temp duplicate. Returns a status for the toast.
  load() {
    const tryOne = (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const prefs = JSON.parse(raw);
        if (!this._integrityOk(prefs)) return null;
        return { prefs, raw };
      } catch (_) { return null; }
    };
    let src = 'main', got = tryOne(KEY);
    if (!got) { src = 'temp'; got = tryOne(KEY_TMP); }
    if (!got) return { ok: false, source: null, fixed: 0, count: 0 };
    const ok = this.apply(got.prefs);
    this._last = got.raw;
    return {
      ok, source: src,
      fixed: this._fixed || 0,
      count: Object.keys(got.prefs.overrides || {}).length,
    };
  },

  export() {
    const json = localStorage.getItem(KEY) || JSON.stringify(this.collect(), null, 1);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gg-user-prefs.json';
    a.click();
    URL.revokeObjectURL(a.href);
  },

  import(jsonText) {
    try {
      const prefs = JSON.parse(jsonText);
      const ok = this.apply(prefs);
      if (ok) this.save();
      return ok;
    } catch (_) { return false; }
  },

  clear() {
    try { localStorage.removeItem(KEY); localStorage.removeItem(KEY_TMP); this._last = ''; } catch (_) {}
  },

  // "LAST SESSION PREFERENCES LOADED" — a quick Matrix-style text beneath the
  // debug bar: glyphs scramble and resolve left→right, hold a beat, fade out.
  _toast(text, ok) {
    try {
      const el = document.createElement('div');
      el.style.cssText =
        'position:fixed;left:16px;top:150px;z-index:70;pointer-events:none;' +
        'font:10px "Space Mono",monospace;letter-spacing:.08em;white-space:pre;' +
        `color:${ok ? 'rgba(80,255,140,0.95)' : 'rgba(255,120,80,0.95)'};` +
        'text-shadow:0 0 6px currentColor;transition:opacity .3s;';
      document.body.appendChild(el);
      const CH = 'アイウエオ01<>*+#$%&';
      let frame = 0;
      const iv = setInterval(() => {
        frame++;
        const solved = Math.floor((frame / 14) * text.length);
        let out = '';
        for (let i = 0; i < text.length; i++) {
          out += i < solved ? text[i] : CH[(Math.random() * CH.length) | 0];
        }
        el.textContent = out;
        if (solved >= text.length) {
          clearInterval(iv);
          el.textContent = text;
          setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 350); }, 1200);
        }
      }, 40);
    } catch (_) {}
  },

  // Explicit factory reset — wipes the user profile and re-seeds fresh
  // from Base (GovernorProfiles.BALANCE). The only path back to Base
  // after the first session; nothing else ever re-applies it silently.
  resetToBase() {
    this.clear();
    GovernorProfiles.resetAll();
    GovernorProfiles.applyProfile('BALANCE');
    this._revision = 0;
    this._toast('RESET TO BASE — FACTORY DEFAULTS', true);
  },

  // Call once at startup AFTER the panels exist: load + validate, announce,
  // then autosave forever — including on sudden closure (pagehide/beforeunload
  // is the fail-safe for the app dying: the last results still land).
  init() {
    const st = this.load();
    if (st.ok) {
      const fx = st.fixed ? ` · ${st.fixed} FIXED` : '';
      const src = st.source === 'temp' ? ' [TEMP RECOVERY]' : '';
      this._toast(`LAST SESSION PREFERENCES LOADED ✓ ${st.count} VARS OK${fx}${src}`, true);
    } else {
      // Genuinely first-ever session — no user profile exists yet. Seed it
      // from Base (BALANCE) once, here, explicitly. This is the ONLY place
      // Base ever gets applied after this point: it bootstraps the user
      // profile, then gets out of the way permanently. Base itself is
      // never touched — it's what a factory reset (resetToBase) returns to.
      GovernorProfiles.applyProfile('BALANCE');
      this._toast('NO SAVED PREFERENCES — BASE PROFILE APPLIED', false);
    }
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.save(), SAVE_MS);
    window.addEventListener('pagehide',    () => this.save());
    window.addEventListener('beforeunload', () => this.save());
    window.GGPrefs = this;   // always reachable: GGPrefs.export() / import / clear
  },
};
