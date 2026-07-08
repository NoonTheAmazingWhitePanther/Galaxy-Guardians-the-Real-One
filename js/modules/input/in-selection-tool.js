/**
 * js/modules/input/in-selection-tool.js
 * SELECTION TOOL — selection-btn, beneath painting-btn.
 *
 * TAP   → tool on/off (existing behaviour, gold when active).
 * HOLD  → cycles the CAPTURE MODE — Box → Polygon → Pointer → Box → ...
 *         Works even while the tool itself is OFF (mode is independent of
 *         enabled — you can dial in a mode before ever turning the tool on).
 *         The button's own glyph always reflects the current mode.
 *
 * MODES:
 *   box     — drag a rectangle (original behaviour). Release captures every
 *             body whose center falls inside it.
 *   polygon — free-form/lasso: drag traces an arbitrary path; release closes
 *             it and captures every body whose center falls inside via
 *             point-in-polygon (ray casting).
 *   pointer — no drag at all: each tap toggles the single nearest body
 *             under it in/out of the capture set — singular, one at a time.
 *
 * SUN RULE (unchanged, applies in every mode):
 *   Tapping directly on the Sun toggles sunFlag — a plain on/off flag, not
 *   a capture by itself. The Sun only actually counts as "captured" when
 *   sunFlag is on AND at least one planet is already captured (sunIncluded
 *   getter enforces this — "the Sun is never captured without planets
 *   captured first").
 *
 *   compressionAllowed mirrors sunIncluded: exposed as a flag for whatever
 *   downstream physics/gameplay code wants to permit closer sun↔planet
 *   interaction for a jointly-selected group. This module only tracks and
 *   exposes the flag — it does not itself implement any compression
 *   behavior, since that mechanic isn't defined elsewhere yet.
 *
 * LIVE TRACKING:
 *   Box and Polygon both follow up with the SAME bounding-box-of-captured-
 *   bodies behaviour once a capture exists (recomputed every frame from
 *   live cx/cy — grows/shrinks/follows as bodies move). Polygon's actual
 *   traced shape is only used at the moment of capture, as the hit-test;
 *   it doesn't stay drawn or live-deform afterward — a live-morphing
 *   polygon mesh isn't implemented, only the simpler bounding-box follow.
 *   Pointer mode instead draws a small ring around EACH captured body
 *   individually, since "singular" selection is about distinct picks, not
 *   an enclosing area.
 */
import { state, SUN } from '../../core/state.js';
import { CameraModule } from '../camera/camera.module.js';

const SUN_TAP_SLOP    = 12;   // screen px beyond the Sun's own radius still counts as "tapped the Sun"
const POINTER_SLOP    = 10;   // screen px beyond a body's own radius still counts as "tapped it" (pointer mode)
const POLY_MIN_DIST   = 8;    // world units — minimum spacing between recorded lasso points

const MODES = ['box', 'polygon', 'pointer'];
const MODE_ICON = { box: '⬚', polygon: '⬠', pointer: '➤' };

export const SelectionTool = {
  enabled: false,
  mode: 'box',
  dragging: false,
  captured: [],       // live body references — read .cx/.cy/.radius/.dead each frame
  sunFlag: false,

  // Box/Polygon: world-space rect while tracking captured bodies.
  _rect: null,            // { x0, y0, x1, y1 }
  _dragStartWorld: null,
  // Polygon only: the traced path, world-space points, while dragging.
  _polyPoints: [],

  get sunIncluded() {
    return this.sunFlag && this.captured.length > 0;
  },
  get compressionAllowed() {
    return this.sunIncluded;
  },
  get icon() {
    return MODE_ICON[this.mode];
  },

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this._clearCapture();
    return this.enabled;
  },

  /**
   * Cycle Box → Polygon → Pointer → Box. Works regardless of `enabled`.
   * Switching modes always starts fresh — no mixed-mode capture state.
   */
  cycleMode() {
    const i = MODES.indexOf(this.mode);
    this.mode = MODES[(i + 1) % MODES.length];
    this._clearCapture();
    return this.mode;
  },

  _clearCapture() {
    this.dragging = false;
    this.captured = [];
    this.sunFlag = false;
    this._rect = null;
    this._dragStartWorld = null;
    this._polyPoints = [];
  },

  // ── Input (mirrors InPlanet's handleDown/Move/Up shape) ──────────────
  handleDown(e) {
    if (!this.enabled) return false;
    if (e.button !== 0 && e.pointerType !== 'touch') return false;

    // Sun tap — same rule in every mode, checked first.
    const sunScreen = CameraModule.worldToScreen(SUN.x, SUN.y);
    const sunScreenR = SUN.radius * CameraModule.cam.zoom;
    const distToSun = Math.hypot(e.clientX - sunScreen.x, e.clientY - sunScreen.y);
    if (distToSun <= sunScreenR + SUN_TAP_SLOP) {
      this.sunFlag = !this.sunFlag;
      if (e.cancelable) e.preventDefault();
      return true;
    }

    if (this.mode === 'pointer') {
      this._pointerPick(e);
      if (e.cancelable) e.preventDefault();
      return true;
    }

    // box / polygon — start a fresh drag, clears any previous capture.
    this.captured = [];
    this.dragging = true;
    this._dragStartWorld = CameraModule.screenToWorld(e.clientX, e.clientY);

    if (this.mode === 'box') {
      this._rect = { x0: this._dragStartWorld.x, y0: this._dragStartWorld.y,
                      x1: this._dragStartWorld.x, y1: this._dragStartWorld.y };
    } else {
      this._polyPoints = [{ x: this._dragStartWorld.x, y: this._dragStartWorld.y }];
    }

    if (e.cancelable) e.preventDefault();
    return true;
  },

  handleMove(e) {
    if (!this.enabled || !this.dragging) return false;
    if (this.mode === 'pointer') return false;   // no drag phase in pointer mode

    const w = CameraModule.screenToWorld(e.clientX, e.clientY);

    if (this.mode === 'box') {
      this._rect = {
        x0: Math.min(this._dragStartWorld.x, w.x), y0: Math.min(this._dragStartWorld.y, w.y),
        x1: Math.max(this._dragStartWorld.x, w.x), y1: Math.max(this._dragStartWorld.y, w.y)
      };
    } else {
      // polygon — append a point only if we've moved far enough (avoids an
      // enormous path from every single pointermove, same spirit as the
      // brush's own spacing knob).
      const last = this._polyPoints[this._polyPoints.length - 1];
      if (!last || Math.hypot(w.x - last.x, w.y - last.y) >= POLY_MIN_DIST) {
        this._polyPoints.push({ x: w.x, y: w.y });
      }
    }

    if (e.cancelable) e.preventDefault();
    return true;
  },

  handleUp(e) {
    if (!this.enabled || !this.dragging) return false;
    this.dragging = false;

    if (this.mode === 'box' && this._rect) {
      const { x0, y0, x1, y1 } = this._rect;
      this.captured = state.bodies.filter(b =>
        !b.dead && b.cx >= x0 && b.cx <= x1 && b.cy >= y0 && b.cy <= y1
      );
    } else if (this.mode === 'polygon' && this._polyPoints.length >= 3) {
      this.captured = state.bodies.filter(b => !b.dead && this._pointInPolygon(b.cx, b.cy, this._polyPoints));
      // The traced path was only the hit-test instrument — from here on,
      // tracking follows the same bounding-box behaviour as box mode.
      this._rect = this._boundsOf(this.captured);
      this._polyPoints = [];
    }
    return true;
  },

  // Pointer mode — single tap toggles the nearest body under it.
  _pointerPick(e) {
    const w = CameraModule.screenToWorld(e.clientX, e.clientY);
    let best = null, bestDist = Infinity;
    for (const b of state.bodies) {
      if (b.dead) continue;
      const d = Math.hypot(w.x - b.cx, w.y - b.cy);
      const slopWorld = POINTER_SLOP / CameraModule.cam.zoom;
      if (d <= b.radius + slopWorld && d < bestDist) { best = b; bestDist = d; }
    }
    if (!best) return;
    const idx = this.captured.indexOf(best);
    if (idx >= 0) this.captured.splice(idx, 1);
    else this.captured.push(best);
  },

  _pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      const hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  },

  _boundsOf(bodies) {
    if (bodies.length === 0) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of bodies) {
      x0 = Math.min(x0, b.cx - b.radius); y0 = Math.min(y0, b.cy - b.radius);
      x1 = Math.max(x1, b.cx + b.radius); y1 = Math.max(y1, b.cy + b.radius);
    }
    return { x0, y0, x1, y1 };
  },

  /**
   * Call once per rendered frame (before drawing). Drops dead/removed
   * bodies from the capture set and, for box/polygon, recomputes the
   * tracking rectangle live from the survivors.
   */
  update() {
    if (!this.enabled) return;
    if (this.dragging) return;   // the drag itself already updates state live
    if (this.mode === 'pointer') {
      this.captured = this.captured.filter(b => !b.dead && state.bodies.includes(b));
      return;
    }
    if (this.captured.length === 0) { this._rect = null; return; }
    this.captured = this.captured.filter(b => !b.dead && state.bodies.includes(b));
    this._rect = this._boundsOf(this.captured);
  },

  /**
   * Draw in SCREEN space — dashed "marching ants" for box/polygon (same
   * visual language as the debug marquee), individual rings for pointer.
   */
  render(ctx) {
    if (!this.enabled) return;

    if (this.mode === 'polygon' && this.dragging && this._polyPoints.length >= 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(130, 210, 255, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -((performance.now() / 40) % 10);
      ctx.beginPath();
      const p0 = CameraModule.worldToScreen(this._polyPoints[0].x, this._polyPoints[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < this._polyPoints.length; i++) {
        const p = CameraModule.worldToScreen(this._polyPoints[i].x, this._polyPoints[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (this.mode === 'pointer') {
      if (this.captured.length === 0) return;
      ctx.save();
      ctx.strokeStyle = this.sunIncluded ? 'rgba(255, 200, 80, 0.9)' : 'rgba(130, 210, 255, 0.9)';
      ctx.lineWidth = 2;
      for (const b of this.captured) {
        const p = CameraModule.worldToScreen(b.cx, b.cy);
        const r = (b.radius + 6) * CameraModule.cam.zoom;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // box / polygon-after-release — bounding rectangle.
    if (!this._rect) return;
    const p0 = CameraModule.worldToScreen(this._rect.x0, this._rect.y0);
    const p1 = CameraModule.worldToScreen(this._rect.x1, this._rect.y1);
    const x = p0.x, y = p0.y, w = p1.x - p0.x, h = p1.y - p0.y;

    ctx.save();
    ctx.fillStyle = this.sunIncluded ? 'rgba(255, 200, 80, 0.10)' : 'rgba(130, 210, 255, 0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = this.sunIncluded ? 'rgba(255, 200, 80, 0.85)' : 'rgba(130, 210, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -((performance.now() / 40) % 10);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
};

export default SelectionTool;
