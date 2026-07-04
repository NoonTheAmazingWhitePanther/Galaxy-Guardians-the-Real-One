/**
 * js/modules/debug/panel-arrange.js
 *
 * PANEL ARRANGE — how a dragged debug panel comes to rest.
 *
 * One tunable decides the whole behaviour: ManualOverrides.panelGridSize
 * (the PANEL GRID panel / console row). No extra button, no mode toggle.
 *
 *   grid == 0  → FREE ROAM. Drop the panel exactly where you released it.
 *                No ejection, no overlap resolution — overlaps are ALLOWED.
 *                Only rule: it may not leave the screen entirely.
 *
 *   grid  > 0  → SNAP (default 8px). The point you GRABBED becomes the panel's
 *                anchor; on release that anchor snaps to the nearest dot. If the
 *                snapped rect COLLIDES with another panel, the panel plays its
 *                own little Tetris match: it is pushed to the closest exit of
 *                the panel below it with a 2px gap, biased toward the side the
 *                LAST POINTER MOVEMENT ANGLE came from, then re-checked against
 *                every other panel — iterating until it rests at the nearest
 *                spot that overlaps nothing. The move is EASED, not hard-set:
 *                the panel glides to its resting place over a few frames.
 *
 * The glide runs on its own rAF loop and only mutates panel.x / panel.y — the
 * real drawing still happens in the normal debug render pass, which picks up the
 * new position next frame. Framerate-independent enough for arranging; the ease
 * is a fixed per-frame fraction so it feels the same on any device.
 */
import { ManualOverrides } from './governor.js';
import { DEBUG_STATE } from './debug-state.js';

const MIN_GAP  = 2;      // px — spacing kept to the collided panel's exit (SNAP mode)
const SAMPLES  = 5;      // pointer deltas kept → averaged incoming direction
const EASE     = 0.30;   // per-frame lerp toward the settle target (0..1)
const STOP_EPS = 0.4;    // px — close enough to the target to end the glide
const DEF_W    = 120;    // fallback size if a panel hasn't been rendered yet
const DEF_H    = 56;
const EJECT_PASSES = 16; // max resolve iterations vs ALL panels (breaks when stable)

export const PanelArrange = {
  _traj: [],              // ring buffer of recent { dx, dy }
  _anim: new Map(),       // panel -> { tx, ty }   (active glides)
  _raf: null,

  // ── Trajectory sampling — fed from in-debug handleMove during a drag ──────
  sample(dx, dy) {
    if (!dx && !dy) return;
    this._traj.push({ dx, dy });
    if (this._traj.length > SAMPLES) this._traj.shift();
  },
  clearTraj() { this._traj.length = 0; },

  // Unit vector of the averaged recent motion, or null if it was basically still.
  _avgDir() {
    let sx = 0, sy = 0;
    for (const s of this._traj) { sx += s.dx; sy += s.dy; }
    const m = Math.hypot(sx, sy);
    if (m < 1e-3) return null;
    return { x: sx / m, y: sy / m };
  },

  gridSize() {
    const v = ManualOverrides && ManualOverrides.panelGridSize
      ? ManualOverrides.panelGridSize.value : 48;
    return Number.isFinite(v) ? v : 48;
  },

  _rect(p) { return { x: p.x, y: p.y, w: p.w || DEF_W, h: p.h || DEF_H }; },

  // Rects overlap once inflated by MIN_GAP (so "touching" already counts).
  _overlap(a, b) {
    return !(a.x + a.w + MIN_GAP <= b.x ||
             b.x + b.w + MIN_GAP <= a.x ||
             a.y + a.h + MIN_GAP <= b.y ||
             b.y + b.h + MIN_GAP <= a.y);
  },

  // ── Settle — called once on drag release ──────────────────────────────────
  // panel : the dropped panel
  // panels: every other arrangeable panel (to avoid)
  // grab  : { x, y } pointer offset INSIDE the panel captured at grab time
  settle(panel, panels, grab) {
    const others = (panels || []).filter(p => p !== panel && p.visible !== false);
    const g = this.gridSize();
    let tx = panel.x, ty = panel.y;

    if (g > 0) {
      // SNAP: the grabbed anchor (panel space) → nearest dot, then the Tetris
      // rule: if the snapped rect collides with anyone, push it to the closest
      // exit of the panel below with a 2px gap, biased toward the side the last
      // pointer movement angle came from — iterated against ALL panels until it
      // rests overlapping nothing.
      const ax = panel.x + grab.x;
      const ay = panel.y + grab.y;
      tx = Math.round(ax / g) * g - grab.x;
      ty = Math.round(ay / g) * g - grab.y;
      const res = this._eject({ x: tx, y: ty, w: panel.w || DEF_W, h: panel.h || DEF_H }, others);
      tx = res.x; ty = res.y;
    }
    // FREE ROAM (g == 0): drop exactly where released — overlaps allowed.

    // Never let a panel leave the screen entirely. Screen edges are converted
    // to panel-space through the debug view transform (pan + zoom): when the
    // view is zoomed out or panned, the visible panel-space region shifts, and
    // a panel dropped near a zoomed/panned edge must not be yanked away.
    const R  = window._DebugRouter;
    const on = !(R?.masterEnabled && R?._consoleMode);
    const vz = on ? (DEBUG_STATE.viewZoom || 1) : 1;
    const px = on ? (DEBUG_STATE.viewPanX || 0) : 0;
    const py = on ? (DEBUG_STATE.viewPanY || 0) : 0;
    const minX = (0 - px) / vz;
    const minY = (0 - py) / vz;
    const maxX = ((window.innerWidth  || 9999) - px) / vz - 24;
    const maxY = ((window.innerHeight || 9999) - py) / vz - 24;
    tx = Math.max(minX, Math.min(tx, maxX));
    ty = Math.max(minY, Math.min(ty, maxY));

    this.clearTraj();
    this._glide(panel, tx, ty);
  },

  // The SNAP-mode Tetris rule. Push the rect out of every overlap: rest it
  // against what it ran into with a MIN_GAP (2px), on the side the trajectory
  // came from (fall back to least-penetration = closest exit), then re-check
  // against ALL panels — iterating until nothing overlaps or the pass cap hits.
  _eject(rect, others) {
    let x = rect.x, y = rect.y;
    const dir = this._avgDir();
    const w = rect.w, h = rect.h;

    for (let pass = 0; pass < EJECT_PASSES; pass++) {
      let moved = false;
      const a = { x, y, w, h };
      for (const o of others) {
        const b = this._rect(o);
        if (!this._overlap(a, b)) continue;

        const useX = dir
          ? Math.abs(dir.x) >= Math.abs(dir.y)
          : (Math.min(a.x + a.w - b.x, b.x + b.w - a.x) <=
             Math.min(a.y + a.h - b.y, b.y + b.h - a.y));

        if (useX) {
          const goLeft = dir ? dir.x > 0 : (a.x < b.x);   // moving right → rest on b's left
          x = goLeft ? (b.x - a.w - MIN_GAP) : (b.x + b.w + MIN_GAP);
        } else {
          const goUp = dir ? dir.y > 0 : (a.y < b.y);     // moving down → rest on b's top
          y = goUp ? (b.y - a.h - MIN_GAP) : (b.y + b.h + MIN_GAP);
        }
        a.x = x; a.y = y;
        moved = true;
      }
      if (!moved) break;
    }
    return { x, y };
  },

  // ── Eased glide (its own rAF) ─────────────────────────────────────────────
  _glide(panel, tx, ty) {
    this._anim.set(panel, { tx, ty });
    if (!this._raf) this._raf = requestAnimationFrame(() => this._step());
  },
  _step() {
    this._raf = null;
    let finishedAny = false;
    for (const [panel, t] of this._anim) {
      const nx = panel.x + (t.tx - panel.x) * EASE;
      const ny = panel.y + (t.ty - panel.y) * EASE;
      if (Math.abs(t.tx - nx) < STOP_EPS && Math.abs(t.ty - ny) < STOP_EPS) {
        panel.x = t.tx; panel.y = t.ty;
        panel._chromeDirty = true;
        this._anim.delete(panel);
        finishedAny = true;
      } else {
        panel.x = nx; panel.y = ny;
        panel._chromeDirty = true;
      }
    }
    // Refresh the AIMS tap-map when a panel lands (cheap, only on arrival).
    if (finishedAny) { try { window._InAims?.syncDebugPanels(); } catch (_) {} }
    if (this._anim.size) this._raf = requestAnimationFrame(() => this._step());
  },

  // If the user re-grabs a panel mid-glide, drop its tween so the drag is direct.
  cancel(panel) { if (this._anim.has(panel)) this._anim.delete(panel); },
};

export default PanelArrange;
