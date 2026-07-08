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
    const chromeCanvas = panel._chromeCanvas;
    const chromeDirty  = panel._chromeDirty
      || !chromeCanvas
      || chromeCanvas.width  !== pw
      || chromeCanvas.height !== ph;

    if (chromeDirty) {
      const c = makeCanvas(pw, ph);
      panel._chromeCanvas = c;
      this._drawChrome(c, panel, pw, ph, sc, s, minimized);
      panel._chromeDirty = false;
    }

    // Blit chrome
    ctx.drawImage(panel._chromeCanvas, panel.x, panel.y);

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

  // Chrome = background, border, amber border, buttons — cached
  _drawChrome(canvas, panel, pw, ph, sc, s, minimized) {
    const ctx    = canvas.getContext('2d');
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

    // Golden TITLE line — the manual-edit indicator, shown INSIDE debug too.
    // Distinct from the amber whole-panel border above (which is deliberately
    // an outside-debug-only "this is pinned to the live tuning surface" cue).
    // This is the "is this panel background/auto, or has it been touched"
    // signal the amber border can't give while debug is on: a slim gold line
    // across the top of the title bar, present whenever ANY control on this
    // panel is manually overridden (panel.pinned already tracks exactly that —
    // see Panel._onManualChange, which pins on the first manual touch).
    if (panel.pinned) {
      ctx.strokeStyle = 'rgba(255,200,80,0.9)';
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.moveTo(radius, 1.5);
      ctx.lineTo(pw - radius, 1.5);
      ctx.stroke();
    }

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
