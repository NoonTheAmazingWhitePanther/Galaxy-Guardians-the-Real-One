/**
 * js/modules/rendering/debug-renderer.js
 *
 * Offscreen canvas caching — each panel renders to an OffscreenCanvas
 * (or regular canvas for compatibility) and blits with a single drawImage.
 *
 * Two canvases per panel:
 *   panel._chromeCanvas → minimized state composite
 *   panel._dataCanvas   → expanded state composite
 *
 * Dirty flags:
 *   panel._chromeDirty  → layout/chrome changed (minimize, pin, resize)
 *   panel._dataDirty    → data values changed
 * Either flag triggers a full redraw of the relevant offscreen.
 * Every rAF: one drawImage per panel onto the main canvas.
 */
import { DEBUG_STATE } from '../debug/debug-state.js';
import { ControlRenderer } from '../debug/controls.js';
import { PanelMasterSlider } from '../debug/panel-master.js';
import { MasterSliderRenderer } from '../debug/master-slider-renderer.js';
import { headerIcons } from '../debug/panel-style.js';
import { SelectionPanelExtras } from '../debug/selection-panel-extras.js';

function makeCanvas(w, h) {
  // Use OffscreenCanvas where available, fall back to regular canvas
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement('canvas');
  c.width  = w;
  c.height = h;
  return c;
}

export const DebugRenderer = {

  drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h + r);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  renderPanel(ctx, panel, data) {
    if (!panel.visible) return;

    const s          = DEBUG_STATE.style;
    const sc         = DEBUG_STATE.scale * (panel.contentScale || 1);   // per-panel content size
    const layout     = panel.computeLayout(data);
    const pw         = Math.floor(layout.w);
    const ph         = Math.floor(layout.h);
    const { minimized } = layout;

    // ── SHRUNK: one-line title bar (panel style) — drawn live, no cache ──
    if (layout.shrunk) {
      const x = panel.x, y = panel.y;
      ctx.save();
      ctx.fillStyle = 'rgba(8,8,18,0.85)';
      ctx.strokeStyle = panel.pinned ? 'rgba(255,200,80,0.55)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, pw, ph, 5);
      ctx.fill(); ctx.stroke();
      // Title + live value, one liner
      ctx.font = `${Math.max(7, Math.round(ph * 0.45))}px ${s.font}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(130,210,255,0.9)';
      const title = (panel.title || panel.id).slice(0, 12);
      ctx.fillText(title, x + 6, y + ph / 2);
      ctx.fillStyle = 'rgba(240,245,255,0.75)';
      let val = '';
      try { val = String(panel.summaryValue ?? ''); } catch (_) {}
      ctx.fillText(val.slice(0, 8), x + 6 + ctx.measureText(title).width + 8, y + ph / 2);
      // 📌 at the right end
      ctx.textAlign = 'center';
      ctx.fillStyle = panel.pinned ? 'rgba(255,200,80,1)' : 'rgba(240,245,255,0.4)';
      ctx.fillText('📌', x + pw - 10, y + ph / 2);
      ctx.restore();
      panel.w = pw; panel.h = ph;
      return;
    }

    // ── Chrome layer — cached offscreen (background, border, amber) ───────
    // FIX: this cache used to be built at pw×ph RAW panel-space pixels —
    // never multiplied by dpr (blurry on every phone with dpr>1, which is
    // nearly all of them) and never invalidated when the debug view's
    // zoom changed (progressively blurrier the more you zoom in, since
    // the same low-res bitmap just gets stretched larger). Cache key now
    // includes both; canvas is sized at the actual EFFECTIVE resolution
    // (dpr × current zoom) so it's crisp at whatever zoom you're looking
    // at right now, not just at the zoom level it happened to be built at.
    const dpr = DEBUG_STATE.dpr || 1;
    const vz  = DEBUG_STATE.viewZoom || 1;
    const chromeCanvas = panel._chromeCanvas;
    const chromeDirty  = panel._chromeDirty
      || !chromeCanvas
      || panel._chromeCachedW   !== pw
      || panel._chromeCachedH   !== ph
      || panel._chromeCachedDpr !== dpr
      || panel._chromeCachedVz  !== vz;

    if (chromeDirty) {
      const scale = dpr * vz;
      const cw = Math.max(1, Math.ceil(pw * scale));
      const ch = Math.max(1, Math.ceil(ph * scale));
      const c = makeCanvas(cw, ch);
      this._drawChrome(c, panel, pw, ph, sc, s, minimized, scale);
      panel._chromeCanvas    = c;
      panel._chromeCachedW   = pw;
      panel._chromeCachedH   = ph;
      panel._chromeCachedDpr = dpr;
      panel._chromeCachedVz  = vz;
      panel._chromeDirty     = false;
    }

    // Blit chrome
    // Explicit destination size (pw,ph, panel-space units) — the source
    // canvas is now built at dpr×zoom resolution (see above), not pw×ph
    // raw pixels, so drawImage needs telling what size to map it to
    // rather than using its native pixel dimensions directly.
    ctx.drawImage(panel._chromeCanvas, panel.x, panel.y, pw, ph);

    // Golden TITLE line — the manual-edit indicator, shown INSIDE debug
    // too. Distinct from the amber whole-panel border (cached, above —
    // deliberately an outside-debug-only "pinned to the live tuning
    // surface" cue). This is the "is this panel background/auto, or has
    // it been touched" signal the amber border can't give while debug is
    // on, present whenever ANY control on this panel is manually
    // overridden (panel.pinned already tracks exactly that — see
    // Panel._onManualChange, which pins on the first manual touch).
    // Drawn live every frame (not part of the cached chrome above) because
    // it animates. Applies to minimized panels too, same as the old cached
    // version did, so it's drawn before the minimized early-return below.
    if (panel.pinned) {
      this._drawPinnedTitleLine(ctx, panel, pw, s.radius * sc);
    }

    // Selection panel's zoom box / ticker / eye toggle — "on top of" and
    // "beneath" the panel per direction, sized to match it exactly. Live
    // every frame, same reasoning as the gold title line just above: this
    // animates (scrolling ticker, live crop), so it can't live in the
    // cached chrome canvas. Applies to both minimized and expanded states
    // (drawn before the minimized early-return below), not to shrunk —
    // shrunk is a different, more extreme compact mode than what "Minimized
    // Panel with a Zoom Box Attached" was describing.
    if (panel.id === 'selection') {
      SelectionPanelExtras.draw(ctx, panel, ctx.canvas, pw, ph);
    }

    if (minimized) {
      // Minimized — PanelMasterSlider draws text/knob on main ctx
      PanelMasterSlider.render(ctx, panel, panel.x, panel.y, pw, ph, minimized);
      // 🖌 edit brush — the minimized panel's OWN editor, bottom-left corner.
      ctx.fillStyle = 'rgba(240,245,255,0.5)';
      ctx.font = `9px ${s.font}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('🖌', panel.x + 3, panel.y + ph - 2);
      return;
    }

    // ── Data layer — always redrawn live, no cache ────────────────────────
    // Values come from GovernorRegistry live reads inside _resolveValue.
    // Caching would show stale numbers. Just draw every rendered frame.
    ctx.save();
    ctx.translate(panel.x, panel.y);
    this._drawData(ctx, panel, data, layout, pw, ph, sc, s);
    ctx.restore();

    // PanelMasterSlider — interactive, draws on main canvas
    PanelMasterSlider.render(ctx, panel, panel.x, panel.y, pw, ph, minimized);

    panel.w = pw;
    panel.h = ph;
  },

  /**
   * Two soft "shiny pixel" strands across the top of a pinned panel's
   * title bar — gold + white, continuously trading places with each other
   * ("flip"), round-capped, and fading softly at both horizontal ends
   * instead of cutting off hard. Replaces the old single solid 3px gold
   * bar (session note: "too big and wide").
   *
   * Lives outside the cached chrome canvas on purpose (see renderPanel) —
   * it reads performance.now() every call, so it has to actually run
   * every frame, not just when the chrome cache is rebuilt.
   */
  _drawPinnedTitleLine(ctx, panel, pw, radius) {
    const y  = panel.y + 1.5;
    const x0 = panel.x + radius, x1 = panel.x + pw - radius;
    if (x1 <= x0) return;

    // Smooth back-and-forth, not a hard snap — one full flip cycle every
    // ~2.4s. t=0: strand A gold / strand B white. t=1: the reverse. The
    // continuous crossfade through the middle IS the "flip," done as a
    // soft blend rather than an instant swap (the "soften fading" part).
    const t = (Math.sin(performance.now() / 1200) + 1) / 2;   // 0..1
    const GOLD = [255, 200, 80], WHITE = [240, 245, 255];
    const lerp3 = (f) => [0, 1, 2].map(i => Math.round(GOLD[i] + (WHITE[i] - GOLD[i]) * f));
    const rgbA = lerp3(t), rgbB = lerp3(1 - t);

    ctx.save();
    ctx.lineCap = 'round';   // soft corners
    for (const [[r, g, b], dy, a] of [[rgbA, -0.75, 0.95], [rgbB, 0.75, 0.85]]) {
      // Fade in/out at both horizontal ends — a hard-edged strand still
      // reads as "too big and wide" even at 1px, a soft one doesn't.
      const grad = ctx.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0,    `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.12, `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(0.88, `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.shadowColor = `rgba(${r},${g},${b},0.6)`;
      ctx.shadowBlur = 2.5;    // the "shiny" part
      ctx.beginPath();
      ctx.moveTo(x0, y + dy);
      ctx.lineTo(x1, y + dy);
      ctx.stroke();
    }
    ctx.restore();
  },

  // Chrome = background, border, amber border, buttons — cached
  // `scale` = dpr × current debug-view zoom (see renderPanel) — applied
  // once here so every draw call below can keep using pw/ph-relative
  // "logical" coordinates unchanged; the canvas itself was already sized
  // to cw×ch = pw×scale, ph×scale by the caller.
  _drawChrome(canvas, panel, pw, ph, sc, s, minimized, scale = 1) {
    const ctx    = canvas.getContext('2d');
    ctx.scale(scale, scale);
    const radius = s.radius * sc;

    ctx.clearRect(0, 0, pw, ph);

    // Background
    // TODO: Support custom panel backgrounds from panel.config.background.
    // Options: solid colour string, gradient descriptor, image URL.
    // Null (default) falls through to theme background.
    const bgFill = panel.config?.background ?? s.bg;
    ctx.save();
    ctx.shadowColor   = s.shadowColor;
    ctx.shadowBlur    = s.shadowBlur * sc;
    ctx.shadowOffsetY = s.shadowOffsetY * sc;
    ctx.fillStyle     = bgFill;
    ctx.beginPath();
    ctx.roundRect(0, 0, pw, ph, radius);
    ctx.fill();
    ctx.restore();

    // Border
    ctx.strokeStyle = s.border;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, pw - 1, ph - 1, radius);
    ctx.stroke();

    // Amber "tuner" border — the golden rectangle. RULE: it appears ONLY outside
    // debug (the tuning surface). Inside debug every panel uses the neutral
    // border, so nothing panel-related is gold while debug is on.
    if (panel.pinned && !(window._DebugRouter && window._DebugRouter.masterEnabled)) {
      ctx.strokeStyle = 'rgba(255,200,80,0.33)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.roundRect(1, 1, pw - 2, ph - 2, 6);
      ctx.stroke();
    }

    // Golden TITLE line moved OUT of this cached chrome layer — see
    // renderPanel's live draw call (_drawPinnedTitleLine) just after the
    // chrome blit. It now animates (gold ⇄ white flip), and this canvas is
    // only rebuilt on pin/resize/minimize changes (panel._chromeDirty), so
    // an animated element baked in here would freeze between those events.

    // Title bar — drag handle highlight + buttons (expanded only)
    if (!minimized) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath();
      ctx.roundRect(1, 1, pw - 2, Math.max(28, Math.round(28 * sc * 0.75)), [radius, radius, 0, 0]);
      ctx.fill();
      // Drag handle dots — three dots centred, subtle
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(pw / 2 + i * 5, 14, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

    }
    // Resize grip ⊿ bottom-right corner — always shown
    const gripSize = 12;
    const gripX    = pw - gripSize - 2;
    const gripY    = ph - gripSize - 2;
    ctx.fillStyle  = 'rgba(240,245,255,0.25)';
    ctx.font       = `${gripSize}px ${s.font}`;
    ctx.textAlign  = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('⊿', pw - 2, ph - 2);
  },
  _drawData(ctx, panel, data, layout, pw, ph, sc, s) {
    const { lines, controls } = layout;
    const fontSize   = s.fontSize * sc;
    const padX       = s.padX * sc;
    const padY       = s.padY * sc;
    const lineHeight = s.lineHeight * sc;
    const scrollOff  = layout.scrollOffset ?? 0;

    ctx.textBaseline = 'middle';

    // One-liner guarantee: canvas never wraps, so overflow = overlap. Clip any
    // string to its available width with an ellipsis instead.
    const _fit = (txt, maxW) => {
      if (!txt) return '';
      if (ctx.measureText(txt).width <= maxW) return txt;
      let lo = 0, hi = txt.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(txt.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
      }
      return lo > 0 ? txt.slice(0, lo) + '…' : '…';
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(padX, padY, pw - padX * 2, ph - padY);
    ctx.clip();
    ctx.translate(0, -scrollOff);

    const icons = headerIcons(pw, sc);
    let ly = padY + lineHeight / 2;
    for (const ln of lines) {
      const fs = ln.small ? fontSize - 1 : fontSize;
      if (ln.isTitleBand) {
        // ── THE HEADER BAND: title left (larger, accent), icons live to its
        // right (drawn by chrome/icon pass), separator underneath. ──
        const bandFs = Math.round(fontSize * 1.25);
        ctx.font      = `bold ${bandFs}px ${s.font}`;
        ctx.fillStyle = ln.color || s.accent;
        ctx.textAlign = 'left';
        const titleMaxW = icons.xs.edt - padX - icons.gap;   // stop before the icon row
        ctx.fillText(_fit(ln.label || '', Math.max(20, titleMaxW)), padX, ly);
        // separator — the band's shelf
        ctx.strokeStyle = 'rgba(130,210,255,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX, ly + lineHeight / 2 - 1);
        ctx.lineTo(pw - padX, ly + lineHeight / 2 - 1);
        ctx.stroke();
      } else if (ln.isSectionHeader) {
        const arrow = ln.collapsed ? '▶' : '▼';
        ctx.font      = `bold ${fs}px ${s.font}`;
        ctx.fillStyle = 'rgba(130,210,255,0.7)';
        ctx.textAlign = 'left';
        let right = '';
        let rightColor = 'rgba(240,245,255,0.5)';
        if (ln.headerValue) { right = ln.headerValue; rightColor = ln.headerColor || rightColor; }
        else if (ln.collapsed && ln.total !== null && ln.total !== undefined) right = String(ln.total);
        const rightW = right ? ctx.measureText(right).width : 0;
        ctx.fillText(_fit(`${arrow} ${ln.label}`, pw - padX * 2 - rightW - 8), padX, ly);
        if (right) {
          ctx.textAlign = 'right';
          ctx.fillStyle = rightColor;
          ctx.fillText(right, pw - padX, ly);
        }
      } else {
        ctx.font      = `${ln.bold ? 'bold ' : ''}${fs}px ${s.font}`;
        ctx.fillStyle = ln.color || s.textDim;
        // value first (right) so the label knows how much room is left
        const val = ln.value || '';
        const valW = val ? Math.min(ctx.measureText(val).width, pw - padX * 2) : 0;
        ctx.textAlign = 'right';
        if (val) ctx.fillText(_fit(val, pw - padX * 2), pw - padX, ly);
        ctx.textAlign = 'left';
        if (ln.label) ctx.fillText(_fit(ln.label, pw - padX * 2 - valW - 6), padX, ly);
      }
      ly += lineHeight;
    }

    for (const ctrl of controls) {
      const { bounds, state } = ctrl;
      ControlRenderer.render(ctx, ctrl, bounds.x, bounds.y, bounds.w, bounds.h, state);
    }

    ctx.restore();

    // 2px scroll indicator — clamped so it never exits panel bounds
    if (layout.scrollable && layout.totalContentH > 0) {
      const trackH   = ph - padY * 2;
      const progress = Math.min(1, scrollOff / Math.max(1, layout.totalContentH - ph));
      const dotH     = Math.max(6, trackH * (ph / layout.totalContentH));
      const dotY     = padY + progress * (trackH - dotH);  // clamp within track

      ctx.fillStyle  = 'rgba(130,210,255,0.35)';
      ctx.beginPath();
      ctx.roundRect(2, padY, 2, trackH, 1);
      ctx.fill();
      ctx.fillStyle  = 'rgba(130,210,255,0.8)';
      ctx.beginPath();
      ctx.roundRect(2, dotY, 2, dotH, 1);
      ctx.fill();
    }

    // ── Icons drawn LAST — always on top of all text ─────────────────────
    // Left → right: 🖌 edit · ⤓ shrink · ▼ minimize · 📌 pin · ⛶ maximize.
    // Geometry comes from headerIcons() — the SAME function panel.hitTest
    // uses, so visible ⟺ touchable by construction. Doubled + spaced.
    const _ic        = headerIcons(pw, sc);
    const minBtnSize = _ic.size;
    const minBtnY    = _ic.y;
    const maxBtnX    = _ic.xs.max;
    const pinBtnX    = _ic.xs.pin;
    const minBtnX    = _ic.xs.min;
    const shrBtnX    = _ic.xs.shr;
    const edtBtnX    = _ic.xs.edt;
    const _icFont    = Math.max(10, Math.round(minBtnSize * 0.62));

    const _iconBtn = (bx, glyph, color) => {
      ctx.fillStyle = 'rgba(20,24,36,0.85)';
      ctx.beginPath();
      ctx.roundRect(bx, minBtnY, minBtnSize, minBtnSize, Math.round(minBtnSize * 0.2));
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = `${_icFont}px ${s.font}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(glyph, bx + minBtnSize / 2, minBtnY + minBtnSize / 2);
    };
    _iconBtn(edtBtnX, '🖌', 'rgba(240,245,255,0.7)');   // edit this panel's items
    _iconBtn(shrBtnX, '⤓',  'rgba(240,245,255,0.7)');   // shrink to bar

    // Pin button
    if (window._DebugRouter?.masterEnabled) {
      ctx.fillStyle    = panel.pinned ? 'rgba(255,200,80,1)' : 'rgba(240,245,255,0.45)';
      ctx.font         = `${_icFont}px ${s.font}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📌', pinBtnX + minBtnSize / 2, minBtnY + minBtnSize / 2);
    }

    // Minimize button (left of the pin) — opaque bg so text doesn't bleed through
    ctx.fillStyle = 'rgba(20,24,36,0.85)';
    ctx.beginPath();
    ctx.roundRect(minBtnX, minBtnY, minBtnSize, minBtnSize, Math.round(minBtnSize * 0.2));
    ctx.fill();
    ctx.fillStyle    = 'rgba(240,245,255,0.85)';
    ctx.font         = `${_icFont}px ${s.font}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼', minBtnX + minBtnSize / 2, minBtnY + minBtnSize / 2);

    // Maximize button (rightmost) — grow as far as the neighbours allow
    ctx.fillStyle = 'rgba(20,24,36,0.85)';
    ctx.beginPath();
    ctx.roundRect(maxBtnX, minBtnY, minBtnSize, minBtnSize, Math.round(minBtnSize * 0.2));
    ctx.fill();
    ctx.fillStyle    = 'rgba(130,210,255,0.85)';
    ctx.font         = `${_icFont}px ${s.font}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⛶', maxBtnX + minBtnSize / 2, minBtnY + minBtnSize / 2);
  },

  renderMasterSlider(ctx, panels) {
    MasterSliderRenderer.render(ctx, panels);
  }
};
