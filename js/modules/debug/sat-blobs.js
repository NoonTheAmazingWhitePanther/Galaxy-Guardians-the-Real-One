/**
 * js/modules/debug/sat-blobs.js
 *
 * SATELLITE BLOBS — the reusable pocket version of the debug button's sun-ray
 * fan, for spawning small transient action buttons around ANY panel corner.
 * Built once here so every future blob set is a duplicate-and-fill job, same
 * as the .dbg-sat satellites.
 *
 * Behaviour:
 *   open(panel, items)  → 3 (or N) DOM blobs fanned OUTWARD from the chosen
 *                          corner, along the direction from the panel's centre
 *                          through that corner (the "appropriate direction").
 *   Corner choice        → prefer the BOTTOM-RIGHT corner (it's the resize
 *                          region, where the gesture just ended); if the fan
 *                          doesn't fit on screen there, walk CLOCKWISE
 *                          (BR → BL → TL → TR); if NO corner fits, open the
 *                          blobs INSIDE the panel along its bottom edge.
 *   Dismissal            → touching anything that is not a blob closes them
 *                          (capture-phase pointerdown), as does open()/close().
 *
 * Items: [{ glyph, title, onTap(panel), toggle?: () => bool }]
 *   toggle-items re-render their active state after every tap.
 */
import { DEBUG_STATE } from './debug-state.js';

const BLOB = 22;       // px — blob size (touch-safe minimum for a transient control)
const GAP  = 6;        // px between blobs
const PAD  = 4;        // px off the corner

function _view() {
  const R = window._DebugRouter;
  const on = !(R?.masterEnabled && R?._consoleMode);
  return {
    vz: on ? (DEBUG_STATE.viewZoom || 1) : 1,
    px: on ? (DEBUG_STATE.viewPanX || 0) : 0,
    py: on ? (DEBUG_STATE.viewPanY || 0) : 0,
  };
}

export const SatBlobs = {
  _els: [],
  _dismiss: null,
  _panel: null,

  isOpenFor(panel) { return this._panel === panel && this._els.length > 0; },

  close() {
    for (const el of this._els) el.remove();
    this._els = [];
    this._panel = null;
    if (this._dismiss) {
      window.removeEventListener('pointerdown', this._dismiss, true);
      this._dismiss = null;
    }
  },

  // panel: needs x, y and a current layout size (w/h in panel-space).
  open(panel, sizeW, sizeH, items) {
    this.close();
    this._panel = panel;
    const { vz, px, py } = _view();

    // Panel rect in SCREEN space.
    const sx = panel.x * vz + px, sy = panel.y * vz + py;
    const sw = sizeW * vz,        sh = sizeH * vz;
    const cx = sx + sw / 2,       cy = sy + sh / 2;

    const W = window.innerWidth, H = window.innerHeight;
    const need = items.length * BLOB + (items.length - 1) * GAP;

    // Corners, CLOCKWISE starting at bottom-right (the sizing region).
    const corners = [
      { x: sx + sw, y: sy + sh },   // BR
      { x: sx,      y: sy + sh },   // BL
      { x: sx,      y: sy      },   // TL
      { x: sx + sw, y: sy      },   // TR
    ];

    // For a corner: blobs spread RADIALLY around it (sun-fan pattern).
    // Direction points OUTWARD (away from panel, into the safe corner space).
    // Radius matches debug satellites' tight pattern: 1.05× button size (pulled in close).
    const place = (corner) => {
      let dx = corner.x - cx, dy = corner.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      
      // Base angle pointing OUTWARD (from center through corner, away from panel)
      const baseAngle = Math.atan2(dy, dx);
      
      // Spread 3 buttons at ±75° around the base angle — wider fan for good spacing
      const spread = 75 * Math.PI / 180;  // ±75° radial spread
      const radius = BLOB * 1.05;  // Pulled in close, like debug satellites (1.05× button size)
      
      const pts = [];
      for (let i = 0; i < items.length; i++) {
        // Angles: center ± spread (3 buttons at -75°, 0°, +75° relative to outward direction)
        const relAngle = (i - 1) * spread;
        const angle = baseAngle + relAngle;
        const px = corner.x + radius * Math.cos(angle) - BLOB / 2;
        const py = corner.y + radius * Math.sin(angle) - BLOB / 2;
        pts.push({ x: px, y: py });
      }
      return pts;
    };
    const fits = (pts) =>
      pts.every(p => p.x >= 0 && p.y >= 0 && p.x + BLOB <= W && p.y + BLOB <= H);

    let pts = null;
    for (const c of corners) {
      const cand = place(c);
      if (fits(cand)) { pts = cand; break; }
    }
    if (!pts) {
      // No corner has room → open INSIDE the panel along its bottom edge.
      pts = [];
      const iy = Math.min(H - BLOB - 2, sy + sh - BLOB - PAD);
      let ix = Math.max(2, Math.min(sx + sw - need - PAD, W - need - 2));
      for (let i = 0; i < items.length; i++) {
        pts.push({ x: ix, y: iy });
        ix += BLOB + GAP;
      }
    }

    // Build the DOM blobs — same visual family as .dbg-sat.
    items.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'panel-blob';
      el.title = item.title || '';
      el.style.cssText =
        `position:fixed;left:${pts[i].x}px;top:${pts[i].y}px;width:${BLOB}px;height:${BLOB}px;` +
        `z-index:60;display:flex;align-items:center;justify-content:center;border-radius:6px;` +
        `font-size:11px;line-height:1;cursor:pointer;user-select:none;` +
        `background:rgba(8,8,18,0.85);border:1px solid rgba(255,255,255,0.18);` +
        `color:rgba(255,255,255,0.95);box-shadow:0 3px 8px rgba(0,0,0,0.4);`;
      const paint = () => {
        const on = item.toggle ? !!item.toggle() : false;
        el.textContent = item.glyph;
        el.style.color = item.toggle
          ? (on ? 'rgba(255,200,80,1)' : 'rgba(240,245,255,0.55)')
          : 'rgba(255,255,255,0.95)';
      };
      paint();
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.onTap(panel);
        if (item.toggle) paint();       // toggles stay open and repaint
        else this.close();              // actions close the fan
      });
      document.body.appendChild(el);
      this._els.push(el);
    });

    // Touch anything else → the blobs are gone.
    this._dismiss = (e) => {
      if (e.target?.classList?.contains('panel-blob')) return;
      this.close();
    };
    window.addEventListener('pointerdown', this._dismiss, true);
  },
};
