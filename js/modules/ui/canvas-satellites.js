/**
 * js/modules/ui/canvas-satellites.js
 * CANVAS SATELLITES — dbg-sat / aims-sat / paint-sat.
 *
 * Per rules.md §8: satellites are NOT HTML anymore. They're "virtual
 * space" — canvas-drawn, exactly like debug panels — not real DOM
 * elements with an AIMS exception bolted onto them. This removes the
 * exception entirely: HTML = always native touch, never AIMS. Canvas =
 * always AimsCast's cast(). No special case either way.
 *
 * Chrome matches the HTML satellites they replace exactly (same colors/
 * font as DEBUG_STATE.style, which is itself the same palette --ui-bg/
 * --ui-border/--font-family already use) — this is a rendering-layer
 * migration, not a redesign. Geometry for aims-sat/paint-sat reuses the
 * clean (radius, angle) template already established; dbg-sat keeps its
 * original hand-tuned absolute positions verbatim (ported formula-for-
 * formula from the CSS it replaces), since nobody asked for that fan
 * reshaped, only moved off HTML.
 *
 * Anchors (debug-btn / aims-btn / painting-btn) STAY real HTML — only
 * their satellites move. Positions are computed from --safe/--pad-size
 * read live off :root, same source of truth the CSS used.
 */
import { DEBUG_STATE }  from '../debug/debug-state.js';
import { DebugRouter }  from '../debug/debug-router.js';
import { PaintingState } from '../../core/painting-state.js';
import { ZoomEnhancer }  from '../ui/zoom-enhancer.js';
import { AimsEdge }      from '../../core/aims-edge.js';
import { SunSpread }     from './sun-spread.js';

const HOLD_MS = 600; // matches main.js's old satWireHold threshold

// ── Geometry — THE SUN SPREAD (rules.md §8) ─────────────────────────────
// All per-satellite hand angles (_mirrorFan / _absLeft and the old
// -32°/-2°/28°/... lists) are GONE. Every anchor owns a 12-slot clock
// ring; SunSpread walks each satellite from straight-up in 30° steps to
// the first genuinely free slot. Declaration = anchor + registry order.
// See sun-spread.js for the full law.
function _cssVars() {
  const cs = getComputedStyle(document.documentElement);
  const safe = parseFloat(cs.getPropertyValue('--safe')) || 16;
  const pad  = parseFloat(cs.getPropertyValue('--pad-size')) || 44;
  return { safe, pad };
}

// Anchor button centers, derived from the same CSS the buttons use:
// debug-btn:    top: safe+pad,        left: safe    → center (safe+pad/2, safe+1.5·pad)
// aims-btn:     top: safe+3·pad+12,   right: safe   → center (W−safe−pad/2, safe+3.5·pad+12)
// painting-btn: top: safe+4·pad+18,   right: safe   → center (W−safe−pad/2, safe+4.5·pad+18)
function _anchors(safe, pad) {
  const rightX = window.innerWidth - safe - pad / 2;
  return {
    dbg:   { x: safe + pad / 2, y: safe + 1.5 * pad },
    aims:  { x: rightX,         y: safe + 3.5 * pad + 12 },
    paint: { x: rightX,         y: safe + 4.5 * pad + 18 },
  };
}

// Fixed HTML controls the spread must treat as occupied space. Read live
// off the DOM (the same source of truth the browser lays them out with) —
// zero-size rects (hidden elements) are dropped.
const _OBSTACLE_IDS = ['debug-btn', 'selection-btn', 'aims-btn', 'painting-btn',
                       'pan-pad', 'fpsCounter', 'bench-btn', 'bench-info', 'ui',
                       'zoom-bar', 'speed-bar'];
function _obstacles() {
  const out = [];
  for (const id of _OBSTACLE_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  return out;
}

// Layout cache — recomputed only when the inputs that can move anything
// actually change (safe/pad/viewport). getBoundingClientRect every frame
// would be layout thrash for rects that only move on those same changes.
let _layoutKey = '';
let _layout = new Map();
function _resolveLayout(safe, pad) {
  const key = `${safe}|${pad}|${window.innerWidth}|${window.innerHeight}`;
  if (key === _layoutKey) return _layout;
  _layout = SunSpread.place(
    _anchors(safe, pad),
    _sats.map(d => ({ id: d.id, family: d.family })),
    {
      screenW: window.innerWidth,
      screenH: window.innerHeight,
      size: pad / 3,
      radius: 1.050 * pad,
      anchorHalf: pad / 2,
      gap: 4,
      obstacles: _obstacles(),
    }
  );
  _layoutKey = key;
  return _layout;
}

// ── The registry ────────────────────────────────────────────────────────
// isActive: gates BOTH visibility and touchability (visible ⟺ touchable,
// per rules.md §5). isOn: for persistent-highlight buttons (paint-sat-
// pause, paint-sat-spray) — drawn in the "active" color scheme when true,
// same visual language #painting-btn.active etc. already use.
//
// NO POSITIONS DECLARED — a satellite declares only its family (which
// anchor's ring it belongs to). Position comes from SunSpread: this
// registry's ORDER is the walk priority — the first satellite of a
// family gets the slot nearest straight-up, the next gets the next free
// slot, 30° at a time. Add a new satellite by appending it; it can never
// overlap anything by construction.
const _sats = [
  // ── dbg — debug-btn's ring (left edge, walks clockwise) ──────────────
  { id: 'dbg-closeall', family: 'dbg', icon: '▦',
    isActive: () => DebugRouter.masterEnabled && !DebugRouter._consoleMode,
    onTap: () => { window._TetrisFan?.toggle(DebugRouter); } },
  { id: 'dbg-reset', family: 'dbg', icon: '↶',
    isActive: () => DebugRouter.masterEnabled && !DebugRouter._consoleMode,
    onTap: () => DebugRouter.undo(),
    onHold: () => DebugRouter.resetAllToProfile() },
  { id: 'dbg-arrange', family: 'dbg', icon: '⊞',
    isActive: () => DebugRouter.masterEnabled && !DebugRouter._consoleMode,
    onTap: () => DebugRouter.toggleGridSnap() },
  { id: 'dbg-expand', family: 'dbg', icon: '⛶',
    isActive: () => DebugRouter.masterEnabled && !DebugRouter._consoleMode,
    onTap: () => DebugRouter.expandAll() },
  { id: 'dbg-glasses', family: 'dbg', icon: '👓',
    isActive: () => DebugRouter.masterEnabled && !DebugRouter._consoleMode,
    onTap: () => DebugRouter.cycleRatio() },

  // ── aims — aims-btn's ring (right edge, walks counter-clockwise) ─────
  { id: 'aims-sat-refresh', family: 'aims', icon: '↻',
    isActive: () => window._InAims?.enabled,
    onTap: () => window._InAims?.refresh() },
  { id: 'aims-sat-showmap', family: 'aims', icon: '🗺️',
    isActive: () => window._InAims?.enabled,
    onTap: () => window._InAims?.toggleShowMap() },
  { id: 'aims-sat-zoom', family: 'aims', icon: '🔍',
    isActive: () => window._InAims?.enabled,
    onTap: () => ZoomEnhancer.toggle() },
  { id: 'aims-sat-mirror', family: 'aims', icon: '⇄',
    isActive: () => window._InAims?.enabled,
    isOn: () => AimsEdge.automate || AimsEdge.mode !== 'normal',
    onTap: () => AimsEdge.cycleMode(),
    onHold: () => AimsEdge.toggleAutomate() },

  // ── paint — painting-btn's ring (right edge, walks counter-clockwise) ─
  { id: 'paint-sat-pause', family: 'paint', icon: '⏸',
    isActive: () => PaintingState.enabled,
    isOn: () => PaintingState.pauseWhilePainting,
    onTap: () => PaintingState.togglePauseWhilePainting() },
  { id: 'paint-sat-spray', family: 'paint', icon: '💨',
    isActive: () => PaintingState.enabled,
    isOn: () => PaintingState.spray.enabled,
    onTap: () => PaintingState.toggleSpray(),
    onHold: () => PaintingState.cycleSpread() },
  { id: 'paint-sat-size', family: 'paint', icon: '📏',
    isActive: () => PaintingState.enabled,
    onTap: () => window.Sim?.resetBrushOverrides?.() },
];

// ── Gesture state ───────────────────────────────────────────────────────
let _downSat = null, _downAt = 0, _held = false, _holdTimer = null;

function _visibleSats() {
  const { safe, pad } = _cssVars();
  const layout = _resolveLayout(safe, pad);
  const out = [];
  for (const def of _sats) {
    // Defensive isolation: _visibleSats() backs BOTH render() and
    // _hitTest() — one satellite's isActive()/pos() throwing here used
    // to be uncaught, which would abort the WHOLE loop partway through,
    // silently taking every other satellite down with it (none render,
    // none respond to taps) while leaving everything else in the app
    // (panels, HTML buttons) completely unaffected, since they don't
    // route through this function at all. That fully explains "only
    // console/panels work." Logged clearly instead of swallowed, so if
    // this is what's actually happening, the next console screenshot
    // will show exactly which satellite and why.
    try {
      if (!def.isActive()) continue;
      const rect = layout.get(def.id);
      if (rect) out.push({ def, rect });
    } catch (err) {
      console.error(`[CanvasSatellites] "${def.id}" isActive()/layout threw — skipped, not blocking the rest:`, err);
    }
  }
  return out;
}

function _hitTest(x, y) {
  // REVERSE order: satellites render in registry order, so later entries
  // draw ON TOP of earlier ones wherever they overlap (aims + paint fans
  // could historically overlap; SunSpread makes overlap impossible by
  // construction, but back-to-front stays correct and costs nothing).
  // The tap must go to whatever is visibly on top, so hit-test iterates
  // back-to-front. Visible ⟺ touchable, even in overlaps.
  const vis = _visibleSats();
  for (let i = vis.length - 1; i >= 0; i--) {
    const { def, rect } = vis[i];
    const dx = x - rect.cx, dy = y - rect.cy;
    if (Math.abs(dx) <= rect.w / 2 && Math.abs(dy) <= rect.h / 2) return def;
  }
  return null;
}

export const CanvasSatellites = {
  /** Live rect for one satellite by id, or null if not currently visible.
   *  Needed by anything that used to anchor off the old DOM element's
   *  getBoundingClientRect() (e.g. tetris-fan.js off dbg-closeall). */
  getRect(id) {
    for (const { def, rect } of _visibleSats()) {
      if (def.id === id) return { left: rect.cx - rect.w / 2, top: rect.cy - rect.h / 2, right: rect.cx + rect.w / 2, bottom: rect.cy + rect.h / 2, width: rect.w, height: rect.h };
    }
    return null;
  },

  /** Lowest bottom edge (screen px) of a family's satellites, from the
   *  SunSpread layout — visibility-INDEPENDENT, since consumers like the
   *  master slider reserve the space whether or not the fan is currently
   *  shown (same contract the old fixed clearance constant had). Null if
   *  the family has no satellites. */
  familyBottom(family) {
    const { safe, pad } = _cssVars();
    let max = null;
    for (const r of _resolveLayout(safe, pad).values()) {
      if (r.family !== family) continue;
      const b = r.cy + r.h / 2;
      if (max === null || b > max) max = b;
    }
    return max;
  },

  /** Live list of visible satellites, in AimsCast's candidate shape. */
  candidates() {
    return _visibleSats().map(({ def, rect }) => ({
      type: 'satellite',
      satellite: def,
      rect: { left: rect.cx - rect.w / 2, top: rect.cy - rect.h / 2, width: rect.w, height: rect.h },
      depth: 2
    }));
  },

  /** Fire a satellite's tap action directly — no DOM element involved. */
  fireTap(def) {
    try { def.onTap?.(); } catch (e) { console.error(`[CanvasSatellites] ${def.id} onTap error:`, e); }
  },

  handleDown(e) {
    const hit = _hitTest(e.clientX, e.clientY);
    if (!hit) return false;
    _downSat = hit; _downAt = performance.now(); _held = false;
    clearTimeout(_holdTimer);
    if (hit.onHold) {
      _holdTimer = setTimeout(() => {
        _held = true;
        try { hit.onHold(); } catch (err) { console.error(`[CanvasSatellites] ${hit.id} onHold error:`, err); }
      }, HOLD_MS);
    }
    if (e.cancelable) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    return true;
  },

  handleMove(e) {
    // No drag behaviour on satellites — just claim the event while a
    // satellite is held, so it doesn't fall through to camera/world.
    return !!_downSat;
  },

  handleUp(e) {
    if (!_downSat) return false;
    clearTimeout(_holdTimer);
    if (!_held) this.fireTap(_downSat);
    _downSat = null; _held = false;
    return true;
  },

  /**
   * render(ctx) — called every frame inside shouldRender(), raw screen
   * space (not the view-zoom transform panels use — satellites live
   * beside real HTML buttons, which are also raw screen space).
   *
   * FIX: setTransform(1,0,0,1,0,0) resets to raw DEVICE pixels — every
   * CSS-pixel coordinate (which is what --safe/--pad-size and this
   * module's whole geometry are expressed in) has to be multiplied by
   * devicePixelRatio afterward, or everything draws squished toward the
   * top-left corner on any screen with dpr > 1 (i.e. nearly all phones).
   * This file skipped that multiplication entirely — exactly what
   * "displaced or unseen" was describing. main.js's _drawAimCursor
   * already does this correctly for the same setTransform pattern
   * (`const sx = ax * dpr` etc.) — same fix, applied here.
   */
  render(ctx) {
    const s = DEBUG_STATE.style;
    const dpr = DEBUG_STATE.dpr || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${9 * dpr}px ${s.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const { def, rect } of _visibleSats()) {
      try {
        const on = def.isOn?.();
        const w = rect.w * dpr, h = rect.h * dpr;
        const cx = rect.cx * dpr, cy = rect.cy * dpr;
        const x = cx - w / 2, y = cy - h / 2;

        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 6 * dpr);
        ctx.fillStyle = on ? 'rgba(30, 80, 50, 0.9)' : s.bg;
        ctx.fill();
        ctx.strokeStyle = on ? 'rgba(130, 255, 160, 0.5)' : s.border;
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();

        ctx.fillStyle = on ? 'rgba(130, 255, 160, 0.95)' : s.textDim;
        ctx.fillText(def.icon, cx, cy + 0.5 * dpr);
      } catch (err) {
        console.error(`[CanvasSatellites] "${def.id}" failed to draw — skipped, not blocking the rest:`, err);
      }
    }
    ctx.restore();
  }
};

export default CanvasSatellites;
