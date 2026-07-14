/**
 * js/modules/debug/panel-info.js
 * PANEL INFO — the ℹ second page of every panel.
 *
 * Tap the ℹ in a panel's header and the SAME panel flips to its second
 * page: everything leaves the rectangle and the panel's DESCRIPTION shows
 * instead — scrollable, word-wrapped. Tap ℹ again to flip back.
 *
 * THE LAZY LAW: descriptions live in every panels/*.json, but they are
 * NEGLECTED until asked for. panel-loader.js strips the field at boot, so
 * no panel object ever holds it; this module re-fetches the panel's OWN
 * json file the first time its ℹ is pressed, copies out ONLY the
 * description scope, and caches the string. No text, no memory, no parse
 * cost until the finger asks. (The browser HTTP cache makes the re-fetch
 * nearly free.) Any number of panels can show their pages at once — the
 * state is per-panel, so two or three descriptions side-by-side is normal.
 *
 * ONE DRAW: the wrapped text is rendered ONCE into the panel's own
 * offscreen canvas and blitted from then on — never re-laid-out, never
 * re-filled per frame. It only rebuilds when the font size changes or the
 * panel is resized.
 *
 * THE SECOND-PAGE ICON ROW (under the title line):
 *   📋 copy — the whole description to the system clipboard, for pasting
 *             outside the app.
 *   A− / A+ — description font size. MANUAL and GLOBAL: change it once
 *             and every description everywhere follows, now and forever
 *             (persisted).
 */

import { DEBUG_STATE } from './debug-state.js';

const FONT_KEY   = 'gg_info_font';
const BASE_URL   = './js/modules/debug/panels/';
const FALLBACK   = 'No description written for this panel yet.';
const ROW_H      = 22;      // icon row height (pre-scale)
const PAD        = 6;

export const PanelInfo = {
  fontSize: 11,            // manual + global — one size for ALL descriptions
  _desc: new Map(),        // id → description string (the lazy cache)
  _loading: new Set(),

  init() {
    try {
      const v = parseInt(localStorage.getItem(FONT_KEY), 10);
      if (v >= 8 && v <= 24) this.fontSize = v;
    } catch (_) {}
  },

  // ── Flip a panel to/from its second page ────────────────────────────────
  toggle(panel) {
    panel.infoMode = !panel.infoMode;
    panel._infoCanvas = null;          // (re)build on next draw
    panel._chromeDirty = true;
    if (panel.infoMode) this._ensureDesc(panel);
  },

  // ── THE LAZY FETCH — only when asked, only the description scope ────────
  _ensureDesc(panel) {
    const id = panel.config?.id || panel.id;
    if (!id || this._desc.has(id) || this._loading.has(id)) return;
    this._loading.add(id);
    fetch(`${BASE_URL}${String(id).toLowerCase()}.json`, { cache: 'force-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        this._desc.set(id, (json && typeof json.description === 'string' && json.description.trim())
          ? json.description.trim() : FALLBACK);
      })
      .catch(() => this._desc.set(id, FALLBACK))
      .finally(() => {
        this._loading.delete(id);
        panel._infoCanvas = null;      // text arrived — rebuild the one draw
        panel._chromeDirty = true;
      });
  },

  descFor(panel) {
    const id = panel.config?.id || panel.id;
    return this._desc.get(id) ?? 'loading…';
  },

  // ── Geometry ─────────────────────────────────────────────────────────────
  _rowH(sc)  { return Math.round(ROW_H * sc); },
  _rowY(sc)  { const s = DEBUG_STATE.style; return Math.round((s.padY + s.lineHeight) * sc); },

  // Content height for the panel layout: title band + icon row + text.
  contentHeight(panel, pw, sc) {
    const c = this._ensureCanvas(panel, pw, sc);
    return this._rowY(sc) + this._rowH(sc) + (c ? c.height : 40) + PAD * 2 * sc;
  },

  // ── THE ONE DRAW — build the wrapped text once ──────────────────────────
  _ensureCanvas(panel, pw, sc) {
    if (panel._infoCanvas && panel._infoCanvasW === pw &&
        panel._infoCanvasF === this.fontSize) return panel._infoCanvas;
    const text = this.descFor(panel);
    const font = Math.round(this.fontSize * sc);
    const lh   = Math.round(font * 1.45);
    const maxW = pw - PAD * 2 * sc;
    if (maxW < 20) return null;

    // Wrap (word-level, hard-break for oversize words)
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = `${font}px ${DEBUG_STATE.style.font}`;
    const lines = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const trial = line ? line + ' ' + word : word;
        if (meas.measureText(trial).width <= maxW) { line = trial; continue; }
        if (line) lines.push(line);
        if (meas.measureText(word).width <= maxW) { line = word; continue; }
        let chunk = '';                                   // hard break
        for (const ch of word) {
          if (meas.measureText(chunk + ch).width > maxW) { lines.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        line = chunk;
      }
      lines.push(line || ' ');
    }

    const c = document.createElement('canvas');
    c.width  = Math.max(1, Math.round(pw));
    c.height = Math.max(1, lines.length * lh + PAD * sc);
    const ctx = c.getContext('2d');
    ctx.font = `${font}px ${DEBUG_STATE.style.font}`;
    ctx.fillStyle = 'rgba(235,240,250,0.92)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    let y = 0;
    for (const ln of lines) { ctx.fillText(ln, PAD * sc, y); y += lh; }
    panel._infoCanvas  = c;
    panel._infoCanvasW = pw;
    panel._infoCanvasF = this.fontSize;
    return c;
  },

  // ── Second-page draw (called from the chrome pass) ──────────────────────
  drawPage(ctx, panel, pw, ph, sc, s) {
    const rowY = this._rowY(sc), rowH = this._rowH(sc);
    const scroll = panel._scrollOffset || 0;

    // Icon row — pinned under the title line, never scrolls.
    const btnW = Math.round(30 * sc), gap = Math.round(6 * sc);
    const btn = (x, glyph) => {
      ctx.fillStyle = 'rgba(20,24,36,0.85)';
      ctx.beginPath();
      ctx.roundRect(x, rowY + 2, btnW, rowH - 4, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(240,245,255,0.8)';
      ctx.font = `${Math.round(11 * sc)}px ${s.font}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(glyph, x + btnW / 2, rowY + rowH / 2);
    };
    btn(PAD * sc, '📋');
    btn(PAD * sc + (btnW + gap), 'A−');
    btn(PAD * sc + (btnW + gap) * 2, 'A+');

    // The text — ONE blit of the pre-rendered canvas, clipped to the body.
    const c = this._ensureCanvas(panel, pw, sc);
    if (!c) return;
    const bodyY = rowY + rowH + Math.round(PAD * sc * 0.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bodyY, pw, ph - bodyY);
    ctx.clip();
    ctx.drawImage(c, 0, bodyY - scroll);
    ctx.restore();
  },

  // Icon-row hits (panel-local coords). Returns null for body (scroll/drag).
  hitTest(panel, lx, ly, sc) {
    const rowY = this._rowY(sc), rowH = this._rowH(sc);
    if (ly < rowY || ly > rowY + rowH) return null;
    const btnW = Math.round(30 * sc), gap = Math.round(6 * sc);
    const x0 = PAD * sc;
    if (lx >= x0 && lx <= x0 + btnW)                               return { type: 'infoCopy' };
    if (lx >= x0 + (btnW + gap) && lx <= x0 + (btnW + gap) + btnW) return { type: 'infoFontDown' };
    if (lx >= x0 + (btnW + gap) * 2 && lx <= x0 + (btnW + gap) * 2 + btnW) return { type: 'infoFontUp' };
    return null;
  },

  // ── Icon actions ─────────────────────────────────────────────────────────
  copy(panel) {
    const text = this.descFor(panel);
    try {
      if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text); return; }
    } catch (_) {}
    try {                                             // fallback path
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    } catch (_) {}
  },

  // Manual + global: one change moves EVERY description, persisted.
  fontDelta(d, allPanels = []) {
    this.fontSize = Math.max(8, Math.min(24, this.fontSize + d));
    try { localStorage.setItem(FONT_KEY, String(this.fontSize)); } catch (_) {}
    for (const p of allPanels) {
      if (p.infoMode) { p._infoCanvas = null; p._chromeDirty = true; }
    }
  },
};

PanelInfo.init();
if (typeof window !== 'undefined') window._PanelInfo = PanelInfo;

export default PanelInfo;
