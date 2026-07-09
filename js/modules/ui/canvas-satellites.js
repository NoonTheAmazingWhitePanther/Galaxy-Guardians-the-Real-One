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

const HOLD_MS = 600; // matches main.js's old satWireHold threshold

// ── Geometry ────────────────────────────────────────────────────────────
function _cssVars() {
  const cs = getComputedStyle(document.documentElement);
  const safe = parseFloat(cs.getPropertyValue('--safe')) || 16;
  const pad  = parseFloat(cs.getPropertyValue('--pad-size')) || 44;
  return { safe, pad };
}

// aims-sat / paint-sat — EXACT mirror of the dbg fan (the confirmed-good
// one), opening in reverse. Reverse-engineering the dbg fan's hand-tuned
// factors gives: every ray at R = 1.050×pad, at angles -32°/16°/40°/64°/
// 88° from horizontal. The 3-satellite fans use the first three rays
// (-32°, 16°, 40°) with dx NEGATED — same radius, same angles, same
// vertical drops, opening LEFT instead of right (anchors sit on the
// right screen edge, debug-btn sits on the left).
//
// FIX: the previous version had `+ r·cos(a)` here — PLUS, which pushed
// these satellites to the RIGHT of their anchor's center, i.e. clipped
// slivers at/off the right screen edge instead of a fan opening left.
// That's exactly the "placement is wrong / unseen" report. Minus is the
// mirror.
function _mirrorFan(anchorTop, angleDeg, safe, pad) {
  const R = 1.050 * pad;                 // same radius as the dbg fan
  const a = angleDeg * Math.PI / 180;
  const satW = pad / 3, satH = pad / 3;
  const cx = (window.innerWidth - safe - pad / 2) - R * Math.cos(a);
  const cy = anchorTop + pad / 2 + R * Math.sin(a);
  return { cx, cy, w: satW, h: satH };
}

// dbg-sat — original absolute CSS factors, ported verbatim (fanned RIGHT,
// debug-btn sits on the left edge). Formula: left = safe + pad*leftFactor,
// top = safe + pad*topFactor; center = left/top + satW/2 (satW = pad/3).
function _absLeft(leftFactor, topFactor, safe, pad) {
  const satW = pad / 3, satH = pad / 3;
  const cx = safe + pad * leftFactor + satW / 2;
  const cy = safe + pad * topFactor + satH / 2;
  return { cx, cy, w: satW, h: satH };
}

// ── The registry ────────────────────────────────────────────────────────
// isActive: gates BOTH visibility and touchability (visible ⟺ touchable,
// per rules.md §5). isOn: for persistent-highlight buttons (paint-sat-
// pause, paint-sat-spray) — drawn in the "active" color scheme when true,
// same visual language #painting-btn.active etc. already use.
const _sats = [
  // ── dbg-sat — debug fan, fanned right off debug-btn ──────────────────
  { id: 'dbg-closeall', family: 'dbg', icon: '▦',
    pos: (s, p) => _absLeft(1.343, 1.623, s, p),
    isActive: () => DebugRouter.masterEnabled && !DebugRouter._consoleMode,
    onTap: () => { window._TetrisFan?.toggle(DebugRouter); } },
  { id: 'dbg-reset', family: 'dbg', icon: '↶',
    pos: (s, p) => _absLeft(1.138, 2.008, s, p),
    isActive: () => DebugRouter.masterEnabled && !DebugRouter._consoleMode,
    onTap: () => DebugRouter.undo(),
    onHold: () => DebugRouter.resetAllToProfile() },
  { id: 'dbg-arrange', family: 'dbg', icon: '⊞',
    pos: (s, p) => _absLeft(0.794, 2.277, s, p),
    isActive: () => DebugRouter.masterEnabled && !DebugRouter._consoleMode,
    onTap: () => DebugRouter.toggleGridSnap() },
  { id: 'dbg-expand', family: 'dbg', icon: '⛶',
    pos: (s, p) => _absLeft(0.370, 2.383, s, p),
    isActive: () => DebugRouter.masterEnabled && !DebugRouter._consoleMode,
    onTap: () => DebugRouter.expandAll() },
  { id: 'dbg-glasses', family: 'dbg', icon: '👓',
    pos: (s, p) => _absLeft(1.224, 0.777, s, p),
    isActive: () => DebugRouter.masterEnabled && !DebugRouter._consoleMode,
    onTap: () => DebugRouter.cycleRatio() },

  // ── aims-sat — fanned left off aims-btn ──────────────────────────────
  { id: 'aims-sat-refresh', family: 'aims', icon: '↻',
    pos: (s, p) => _mirrorFan(s + p * 3 + 12, -32, s, p),
    isActive: () => window._InAims?.enabled,
    onTap: () => window._InAims?.refresh() },
  { id: 'aims-sat-showmap', family: 'aims', icon: '🗺️',
    pos: (s, p) => _mirrorFan(s + p * 3 + 12, 16, s, p),
    isActive: () => window._InAims?.enabled,
    onTap: () => window._InAims?.toggleShowMap() },
  { id: 'aims-sat-zoom', family: 'aims', icon: '🔍',
    pos: (s, p) => _mirrorFan(s + p * 3 + 12, 40, s, p),
    isActive: () => window._InAims?.enabled,
    onTap: () => ZoomEnhancer.toggle() },

  // ── paint-sat — fanned left off painting-btn ─────────────────────────
  { id: 'paint-sat-pause', family: 'paint', icon: '⏸',
    pos: (s, p) => _mirrorFan(s + p * 4 + 18, -32, s, p),
    isActive: () => PaintingState.enabled,
    isOn: () => PaintingState.pauseWhilePainting,
    onTap: () => PaintingState.togglePauseWhilePainting() },
  { id: 'paint-sat-spray', family: 'paint', icon: '💨',
    pos: (s, p) => _mirrorFan(s + p * 4 + 18, 16, s, p),
    isActive: () => PaintingState.enabled,
    isOn: () => PaintingState.spray.enabled,
    onTap: () => PaintingState.toggleSpray(),
    onHold: () => PaintingState.cycleSpread() },
  { id: 'paint-sat-size', family: 'paint', icon: '📏',
    pos: (s, p) => _mirrorFan(s + p * 4 + 18, 40, s, p),
    isActive: () => PaintingState.enabled,
    onTap: () => window.Sim?.resetBrushOverrides?.() },
];

// ── Gesture state ───────────────────────────────────────────────────────
let _downSat = null, _downAt = 0, _held = false, _holdTimer = null;

function _visibleSats() {
  const { safe, pad } = _cssVars();
  const out = [];
  for (const def of _sats) {
    if (!def.isActive()) continue;
    out.push({ def, rect: def.pos(safe, pad) });
  }
  return out;
}

function _hitTest(x, y) {
  // REVERSE order: satellites render in registry order, so later entries
  // draw ON TOP of earlier ones wherever they overlap (aims + paint fans
  // both open can overlap — see the fan-geometry note on _mirrorFan).
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
    }
    ctx.restore();
  }
};

export default CanvasSatellites;
