/**
 * js/modules/debug/panel-arrange.js
 *
 * PANEL ARRANGE — how a dragged debug panel comes to rest.
 *
 * One tunable decides the whole behaviour: ManualOverrides.panelGridSize
 * (the PANEL GRID panel / console row). No extra button, no mode toggle.
 *
 *   grid == 0  → FREE FORM. Drop the panel where you released it. If it landed
 *                on top of another panel, push it out to keep a MIN_GAP (2px),
 *                ejecting it along the AVERAGE of the last few pointer moves so
 *                it settles next to whatever it ran into, on the side the drag
 *                came from.
 *
 *   grid  > 0  → SNAP. A dot grid of `grid`px fills the screen. The point you
 *                GRABBED becomes the panel's anchor; on release that anchor
 *                snaps to the nearest dot (nearest FREE dot if the cell is
 *                taken). Wherever you catch the panel is where it sticks to the
 *                grid — so a quick jitter near a dot may "jump" a little, which
 *                is why the move is EASED, not hard-set: the panel glides to the
 *                dot over a few frames and sticks gently.
 *
 * The glide runs on its own rAF loop and only mutates panel.x / panel.y — the
 * real drawing still happens in the normal debug render pass, which picks up the
 * new position next frame. Framerate-independent enough for arranging; the ease
 * is a fixed per-frame fraction so it feels the same on any device.
 */
import { ManualOverrides } from './governor.js';

const MIN_GAP  = 2;      // px — minimum spacing kept between panels (free-form)
const SAMPLES  = 5;      // pointer deltas kept → averaged incoming direction
const EASE     = 0.30;   // per-frame lerp toward the settle target (0..1)
const STOP_EPS = 0.4;    // px — close enough to the target to end the glide
const DEF_W    = 120;    // fallback size if a panel hasn't been rendered yet
const DEF_H    = 56;
const RING_MAX = 14;     // grid free-dot search radius (in dots)

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
      // SNAP: the grabbed anchor (screen space) → nearest free dot.
      const ax = panel.x + grab.x;
      const ay = panel.y + grab.y;
      const dot = this._nearestFreeDot(panel, others, ax, ay, g, grab);
      tx = dot.x - grab.x;
      ty = dot.y - grab.y;
    } else {
      // FREE FORM: resolve overlaps, biased along the drag trajectory.
      const res = this._eject(panel, others);
      tx = res.x; ty = res.y;
    }

    // Never let a panel leave the screen entirely.
    const W = window.innerWidth  || 9999;
    const H = window.innerHeight || 9999;
    tx = Math.max(0, Math.min(tx, W - 24));
    ty = Math.max(0, Math.min(ty, H - 24));

    this.clearTraj();
    this._glide(panel, tx, ty);
  },

  // Push `panel` out of every overlap. Rest it against what it ran into, on the
  // side the trajectory came from; fall back to least-penetration axis.
  _eject(panel, others) {
    let x = panel.x, y = panel.y;
    const dir = this._avgDir();
    const w = panel.w || DEF_W, h = panel.h || DEF_H;

    for (let pass = 0; pass < 6; pass++) {
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

  // Nearest grid dot whose resulting panel rect is free; spirals outward on the
  // dot lattice if the closest dot's cell is occupied.
  _nearestFreeDot(panel, others, ax, ay, g, grab) {
    const w = panel.w || DEF_W, h = panel.h || DEF_H;
    const baseX = Math.round(ax / g) * g;
    const baseY = Math.round(ay / g) * g;

    const fits = (dotX, dotY) => {
      const a = { x: dotX - grab.x, y: dotY - grab.y, w, h };
      for (const o of others) if (this._overlap(a, this._rect(o))) return false;
      return true;
    };

    if (fits(baseX, baseY)) return { x: baseX, y: baseY };
    for (let r = 1; r <= RING_MAX; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;  // ring shell only
          const cx = baseX + dx * g, cy = baseY + dy * g;
          if (fits(cx, cy)) return { x: cx, y: cy };
        }
      }
    }
    return { x: baseX, y: baseY };   // graceful: nearest dot even if crowded
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
