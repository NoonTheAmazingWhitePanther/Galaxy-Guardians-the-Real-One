/**
 * js/modules/debug/panel-trail.js
 * THE PANEL TRAIL — every panel, one surface, ONE draw call.
 *
 * THE LAW (Noon, 2026-07-14):
 *   "A Trail System for the panels will absolute all drawings and
 *    calculations into one draw call. All updates are text only, at ms
 *    times. Unless a drag, a change, or any movement occurs."
 *
 * WHAT WAS HAPPENING
 *   DebugRenderer already caches each panel's chrome and data into its own
 *   offscreen canvas — good — but drawAll still walked all 22 panels EVERY
 *   rendered frame and paid, per panel, per frame:
 *     · computeLayout()          (PanelStyle.apply + the whole line walk)
 *     · 2× drawImage             (chrome blit + data blit, at dpr×zoom)
 *     · PanelMasterSlider.render (LIVE text + knobs, uncached)
 *     · the gold pinned title line (LIVE)
 *   That is ~44 texture blits and 22 layout passes per frame to show numbers
 *   that only CHANGE every refreshRate ms. The refresh clock was always the
 *   truth clock; the drawing never respected it at the panel-set level.
 *
 * WHAT THE TRAIL IS
 *   ONE offscreen canvas the size of the real canvas, holding the whole panel
 *   layer already composed, with the debug view transform (dpr · pan · zoom)
 *   BAKED IN. Per frame the main canvas gets exactly one blit of it.
 *
 *   A panel re-stamps into the trail ONLY when its key changes — position,
 *   size, minimized/shrunk/pinned state, scroll, scale, or _dataDirty (which
 *   the refresh clock raises every refreshRate ms). Nothing changed → nothing
 *   is drawn, at any cost, and the trail from the last frame is simply shown
 *   again. That is the trail: the layer PERSISTS, like a phosphor trail, and
 *   is only disturbed where something actually moved.
 *
 * OVERLAP IS HANDLED, NOT IGNORED
 *   Clearing one panel's rect punches a hole through whatever sits under it.
 *   So a dirty panel clears the UNION of its old and new rect, then every
 *   visible panel intersecting that union is re-stamped in z-order. In
 *   practice that is 1–2 panels, not 22.
 *
 * WHAT STAYS LIVE (deliberately NOT in the trail)
 *   Marching ants, the selection band, snap guides — they animate every frame
 *   by design and would force a full rebuild every frame if trailed. They
 *   keep drawing straight to the main canvas, on top of the blit.
 *
 * THE HONEST COST
 *   A pan or zoom changes the baked transform → full rebuild, every frame of
 *   the gesture. That is exactly what today already costs, so the gesture is
 *   no worse; everything BETWEEN gestures becomes one drawImage.
 */
import { DEBUG_STATE } from './debug-state.js';
import { DebugRenderer } from '../rendering/debug-renderer.js';

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export const PanelTrail = {
  on:        1,     // 0 = legacy per-frame loop (A/B against the ledger)
  _c:        null,  // the trail surface
  _ctx:      null,
  _key:      '',    // baked transform key — a change means full rebuild
  _w: 0, _h: 0,

  // live readout (bound by surface.json)
  stamps:    0,     // panels re-stamped THIS frame  — 0 is the resting state
  rebuilds:  0,     // full rebuilds since load (pan/zoom/resize)
  restamps:  0,     // total panel stamps since load
  blits:     0,     // draw calls onto the main canvas per frame — should be 1

  /**
   * Everything that decides what a panel LOOKS like. Change it → re-stamp.
   *
   * The key is read BEFORE a stamp (to detect dirt) and stored AFTER one
   * (when the flags have been consumed) — so a stamped panel's stored key
   * always has the dirty bits at 0, and the next frame compares clean
   * against clean. Reading _dataDirty here must therefore be side-effect
   * free; it is.
   */
  _panelKey(p) {
    return `${p.visible ? 1 : 0}|${p.x}|${p.y}|${p.w}|${p.h}|` +
           `${p.minimized ? 1 : 0}|${p.shrunk ? 1 : 0}|${p.pinned ? 1 : 0}|` +
           `${p.contentScale}|${p._scrollOffset}|${p.panelMasterValue}|` +
           `${p._dataDirty ? 1 : 0}|${p._chromeDirty ? 1 : 0}`;
  },

  /** The baked transform. Any change here invalidates the ENTIRE surface. */
  _transformKey(ctx) {
    const d = DEBUG_STATE;
    return `${ctx.canvas.width}x${ctx.canvas.height}|${d.dpr || 1}|` +
           `${d.viewZoom || 1}|${d.viewPanX || 0}|${d.viewPanY || 0}|${d.scale || 1}`;
  },

  _ensure(ctx) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (!this._c || this._w !== W || this._h !== H) {
      this._c = makeCanvas(Math.max(1, W), Math.max(1, H));
      this._ctx = this._c.getContext('2d');
      this._w = W; this._h = H;
      return true;   // forced full rebuild
    }
    return false;
  },

  /** Put the trail context into the SAME panel-space the main ctx uses. */
  _applyTransform() {
    const d   = DEBUG_STATE;
    const dpr = d.dpr || 1;
    const vz  = d.viewZoom || 1;
    const px  = d.viewPanX || 0;
    const py  = d.viewPanY || 0;
    const t = this._ctx;
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.scale(dpr, dpr);
    if (px || py) t.translate(px, py);
    if (vz !== 1) t.scale(vz, vz);
  },

  /** Stamp one panel into the trail. This is the ONLY place panels rasterize. */
  _stamp(p, data) {
    if (!p.visible) return;
    DebugRenderer.renderPanel(this._ctx, p, data);
    // renderPanel only clears _dataDirty on the EXPANDED path — a minimized
    // or shrunk panel returns early and leaves the flag lit forever, which
    // would keep it permanently dirty and re-stamped every frame (i.e. most
    // panels, since minimized is the default). The trail consumes both flags
    // here: the pixels for this state are now on the surface, so the dirt is
    // by definition paid for.
    p._dataDirty   = false;
    p._chromeDirty = false;
    p._trailRect = { x: p.x, y: p.y, w: p.w || 0, h: p.h || 0 };
    this.restamps++;
  },

  _rect(p) {
    // renderPanel writes p.w/p.h; before the first stamp fall back to layout.
    if (p.w && p.h) return { x: p.x, y: p.y, w: p.w, h: p.h };
    try {
      const L = p.computeLayout(p._cachedData ?? {});
      return { x: p.x, y: p.y, w: L.w, h: L.h };
    } catch (_) { return { x: p.x, y: p.y, w: 120, h: 56 }; }
  },

  _hits(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x ||
             a.y + a.h < b.y || b.y + b.h < a.y);
  },

  /**
   * The whole panel layer, composed and blitted once.
   * @param panels  z-ordered list (later = on top), same order drawAll used
   * @param getData (panel) => its cached data object
   */
  draw(ctx, panels, getData) {
    this.stamps = 0;
    this.blits  = 0;

    const forced = this._ensure(ctx);
    const tkey   = this._transformKey(ctx);
    const full   = forced || tkey !== this._key;

    if (full) {
      // Pan / zoom / resize / global scale moved — the baked geometry is
      // wrong everywhere. Nothing to salvage; redraw the whole surface.
      this._ctx.setTransform(1, 0, 0, 1, 0, 0);
      this._ctx.clearRect(0, 0, this._w, this._h);
      this._applyTransform();
      for (const p of panels) {
        if (!p.visible) { p._trailRect = null; p._trailKey = null; continue; }
        this._stamp(p, getData(p));
        p._trailKey = this._panelKey(p);
        this.stamps++;
      }
      this._key = tkey;
      this.rebuilds++;
    } else {
      // ── The resting path. Find what actually moved. Usually: nothing. ──
      let union = null;
      const dirty = [];
      for (const p of panels) {
        const k = this._panelKey(p);
        if (k === p._trailKey) continue;
        dirty.push(p);
        const old = p._trailRect;
        const now = p.visible ? this._rect(p) : null;
        for (const r of [old, now]) {
          if (!r) continue;
          union = union
            ? {
                x: Math.min(union.x, r.x), y: Math.min(union.y, r.y),
                w: 0, h: 0,
                x2: Math.max(union.x2, r.x + r.w), y2: Math.max(union.y2, r.y + r.h),
              }
            : { x: r.x, y: r.y, w: 0, h: 0, x2: r.x + r.w, y2: r.y + r.h };
        }
      }

      if (union) {
        union.w = union.x2 - union.x;
        union.h = union.y2 - union.y;
        const PAD = 2;   // borders/glow bleed a hair outside the rect
        union.x -= PAD; union.y -= PAD; union.w += PAD * 2; union.h += PAD * 2;

        this._applyTransform();
        this._ctx.clearRect(union.x, union.y, union.w, union.h);

        // Everything the hole touched must come back, in z-order — otherwise
        // a panel sitting under the dirty one loses a bite out of itself.
        this._ctx.save();
        this._ctx.beginPath();
        this._ctx.rect(union.x, union.y, union.w, union.h);
        this._ctx.clip();
        for (const p of panels) {
          if (!p.visible) continue;
          if (!this._hits(this._rect(p), union)) continue;
          this._stamp(p, getData(p));
          this.stamps++;
        }
        this._ctx.restore();

        for (const p of dirty) p._trailKey = this._panelKey(p);
        // clipped stamps may have re-set _trailRect for neighbours — fine,
        // their geometry didn't change, only their pixels were restored.
      }
    }

    // ── ONE DRAW CALL ──────────────────────────────────────────────────────
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this._c, 0, 0);
    ctx.restore();
    this.blits = 1;
  },

  /** Force the whole surface back from cold (page turn, panel admitted, theme). */
  invalidate() {
    this._key = '';
  },
};

export default PanelTrail;
