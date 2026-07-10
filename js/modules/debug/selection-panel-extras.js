/**
 * js/modules/debug/selection-panel-extras.js
 *
 * The zoom box (with pan/zoom controls), eye show/hide toggle, and
 * scrolling vitals ticker attached to the "selection" debug Panel
 * (panels/selection.json).
 *
 * Lives outside panel.js/debug-renderer.js's generic line-type system on
 * purpose — this is a one-off custom widget for exactly one panel, not a
 * new reusable line type. Geometry computed here (layout()) is the SINGLE
 * SOURCE OF TRUTH for both drawing (debug-renderer.js calls draw()) and
 * hit-testing (in-debug.js calls hitTest()) — visible ⟺ touchable, same
 * principle used everywhere else in this project.
 *
 * All geometry here is PANEL-SPACE (same coordinate space as panel.x/y/
 * w/h) — draw() is called from inside debug-renderer.js while the ctx is
 * already under the ambient debug-view pan/zoom transform, and
 * in-debug.js already converts real pointer coordinates into panel-space
 * (_toPanel) before ever calling hitTest(). Neither caller has to know
 * screen pixels, dpr, or the debug view transform exist — that's what
 * makes "grouped for dragging" work for free: the box/ticker positions
 * are computed FROM panel.x/panel.y every single call, so the instant the
 * panel moves, they move with it, no separate tracking needed.
 *
 * Stacking (per direction — box "on top of" the panel, ticker "beneath
 * the zoom box"): with the eye ON, top→bottom on screen is
 * [box] → [ticker] → [panel]. With the eye OFF (box hidden), the ticker
 * drops to sit directly beneath the panel instead: [panel] → [ticker].
 * The panel itself (panel.x/panel.y) is always the anchor either way.
 *
 * PAN / ZOOM: the box's crop center is the selection's live centroid PLUS
 * a manually-adjustable world-space offset. Four transparent edge buttons
 * and +/- TAP-TOGGLE continuous movement toward that control's extreme —
 * a tap starts it moving on its own every frame (strength × real delta
 * time, not frame count) until it reaches that extreme or a second tap on
 * the SAME control stops it early; wherever it stops IS the new offset/
 * zoom, no snap-back. The offset is re-clamped to the selection's own
 * live bounding rect every frame — you can look anywhere inside the
 * selection, never outside it. Zoom ranges from the original fixed crop
 * (ZOOM_MIN — "current is good as minimum", i.e. always at least a
 * little magnified) up to ZOOM_MAX, computed live each frame so that the
 * selection's own bounding box exactly fills the square box — "a planet
 * will fill the zoom screen" at full zoom. A 5th corner button, Fit,
 * jumps straight to centered + ZOOM_MAX in one tap.
 */
import { SelectionVitals } from '../../core/selection-vitals.js';
import { SelectionTool } from '../input/in-selection-tool.js';
import { CameraModule } from '../camera/camera.module.js';
import { DEBUG_STATE } from './debug-state.js';
import { clamp } from '../../core/math.js';
import { ManualOverrides } from './governor.js';

const GAP        = 6;    // panel-space px between stacked pieces
const TICKER_H   = 20;
const EYE_SIZE   = 22;    // matches EDGE/CORNER_BTN — one consistent button size everywhere
const ZOOM_MIN   = 3;     // magnification floor — the original fixed crop, "always a bit zoomed"
const EDGE       = 22;    // pan-button strip thickness — bigger touch target, matches the others
const INSET      = 26;    // how far each edge strip stays clear of the corners
const CORNER_BTN = 22;    // zoom +/- button size — matches EDGE/EYE_SIZE

const PAN_FRACTION_PER_SEC  = 0.5;  // fraction of the selection rect's width/height crossed per second while held
const ZOOM_UNITS_PER_SEC    = 0.6;  // fraction of the 0..1 zoom range crossed per second while held

const HELD_KEY = {
  'pan-up': 'up', 'pan-down': 'down', 'pan-left': 'left', 'pan-right': 'right',
  'zoom-in': 'zoomIn', 'zoom-out': 'zoomOut'
};

export const SelectionPanelExtras = {
  eyeOn: true,          // "video" (the zoom box) shown by default
  offsetX: 0, offsetY: 0,   // world-space, re-clamped to the live selection rect every frame
  zoomT: 0,              // 0 = ZOOM_MIN (most zoomed out), 1 = ZOOM_MAX ("fill the planet")
  // Tap-toggle, NOT hold: a tap starts continuous movement toward that
  // direction's extreme (runs on its own every frame from here on,
  // independent of any pointer still touching the screen); tapping the
  // SAME control again stops it wherever it currently is. See
  // toggleDirection() / update().
  _running: { up: false, down: false, left: false, right: false, zoomIn: false, zoomOut: false },

  toggleEye() { this.eyeOn = !this.eyeOn; },

  /** "Fit" — center the offset back to the selection's true middle and
   *  zoom to exactly frame the whole selection rect ("zoom out to fit
   *  all the planets without leaving the rectangle... once the rectangle
   *  is visible, [that's] fit"). zoomT=1 is already defined (_zoomRange)
   *  as "the selection's bounding rect exactly fills the box" — the same
   *  target either way, so Fit is just jumping straight to it. For a
   *  selection too large to fully frame even at the zoomed-out floor,
   *  _zoomRange's own max-vs-min clamp already caps this at ZOOM_MIN
   *  (the closest achievable fit without breaking "always a bit zoomed").
   *  One-shot, not a hold — same treatment as toggleEye. */
  fit() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoomT = 1;
    this._clearRunning();
  },

  /** New selection started — back to centered/baseline so the view
   *  doesn't inherit wherever the LAST selection's pan/zoom was left.
   *  Called from DebugRouter.syncSelectionPanel's 0→N transition. */
  resetView() {
    this.offsetX = 0; this.offsetY = 0; this.zoomT = 0;
    this._clearRunning();
  },

  _clearRunning() { for (const k in this._running) this._running[k] = false; },

  /** Tap-toggle for one control (see HELD_KEY for the kind→key map). A
   *  tap on a control that isn't currently running starts it moving
   *  toward its extreme every frame from here on (update() below), until
   *  it either reaches that extreme naturally or a second tap on the
   *  SAME control stops it early — "offset remains as new center until
   *  declared different," no snap-back either way. Starting one
   *  direction clears its direct opposite (running both at once would
   *  just cancel to zero net movement) — everything else (e.g. panning
   *  AND zooming at once) is free to run together. */
  toggleDirection(kind) {
    const key = HELD_KEY[kind];
    if (!key) return;
    const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left', zoomIn: 'zoomOut', zoomOut: 'zoomIn' };
    if (this._running[key]) {
      this._running[key] = false;
    } else {
      this._running[key] = true;
      this._running[OPPOSITE[key]] = false;
    }
  },

  /** Live bounding rect of the current selection, WORLD-space, including
   *  each body's own radius. Computed independently here (not read off
   *  SelectionTool._rect) because _rect is never set for pointer-mode
   *  captures (single-tap picks) — this always works regardless of
   *  capture mode. This is the hard boundary the pan offset is clamped
   *  to, and the box ZOOM_MAX is computed from ("a planet will fill the
   *  zoom screen" — for one body this rect IS exactly that body's own
   *  bounding square). */
  _selectionWorldRect() {
    const bodies = SelectionTool.captured;
    if (!bodies || bodies.length === 0) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of bodies) {
      x0 = Math.min(x0, b.cx - b.radius); y0 = Math.min(y0, b.cy - b.radius);
      x1 = Math.max(x1, b.cx + b.radius); y1 = Math.max(y1, b.cy + b.radius);
    }
    return { x0, y0, x1, y1 };
  },

  /** Call once per rendered frame with REAL elapsed seconds (not the
   *  fixed physics timestep) — pan/zoom speed is a feel, not tied to
   *  simulation rate. Drives whichever directions are currently
   *  "running" (see toggleDirection) every frame regardless of pointer
   *  state — this is a toggle, not a hold. Auto-stops a direction exactly
   *  at its bound ("move all the way to maximum or minimum") since
   *  there's nothing left to animate toward once it's there. */
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const running = this._running;
    const rect = this._selectionWorldRect();

    if (rect) {
      const cx = SelectionVitals.worldX, cy = SelectionVitals.worldY;
      const haveCentroid = cx != null && cy != null;
      const minX = haveCentroid ? rect.x0 - cx : 0, maxX = haveCentroid ? rect.x1 - cx : 0;
      const minY = haveCentroid ? rect.y0 - cy : 0, maxY = haveCentroid ? rect.y1 - cy : 0;

      const runningAny = running.up || running.down || running.left || running.right || running.zoomIn || running.zoomOut;
      if (runningAny) {
        // Master knob (ManualOverrides.selectionPanSpeed, 0.1..2.0) —
        // 2.0 is the ORIGINAL fixed strength these two constants shipped
        // at, so the knob is a straight multiplier of that: /2.0 turns
        // the knob's own 0.1..2.0 range into a 0.05..1.0 multiplier.
        // Ships at 1.0 → 0.5× ("make it into 1.0, half of the current").
        const knobMul = (ManualOverrides.selectionPanSpeed?.value ?? 2.0) / 2.0;
        const w = Math.max(1, rect.x1 - rect.x0), h = Math.max(1, rect.y1 - rect.y0);

        if (running.left)  { this.offsetX -= w * PAN_FRACTION_PER_SEC * knobMul * dt; if (this.offsetX <= minX) { this.offsetX = minX; running.left = false; } }
        if (running.right) { this.offsetX += w * PAN_FRACTION_PER_SEC * knobMul * dt; if (this.offsetX >= maxX) { this.offsetX = maxX; running.right = false; } }
        if (running.up)    { this.offsetY -= h * PAN_FRACTION_PER_SEC * knobMul * dt; if (this.offsetY <= minY) { this.offsetY = minY; running.up = false; } }
        if (running.down)  { this.offsetY += h * PAN_FRACTION_PER_SEC * knobMul * dt; if (this.offsetY >= maxY) { this.offsetY = maxY; running.down = false; } }
        if (running.zoomIn)  { this.zoomT = Math.min(1, this.zoomT + ZOOM_UNITS_PER_SEC * knobMul * dt); if (this.zoomT >= 1) running.zoomIn = false; }
        if (running.zoomOut) { this.zoomT = Math.max(0, this.zoomT - ZOOM_UNITS_PER_SEC * knobMul * dt); if (this.zoomT <= 0) running.zoomOut = false; }
      }
      // "The offset can move only inside the selection rectangle by
      // proportions" — minimum x is always rect x start, maximum x is
      // rect x end (same for y). Re-clamped every frame regardless of
      // whether anything is currently running, since the centroid itself
      // drifts as bodies orbit — "offset remains as new center until
      // declared different" still has to stay inside the rect even once
      // stopped.
      if (haveCentroid) {
        this.offsetX = clamp(this.offsetX, minX, maxX);
        this.offsetY = clamp(this.offsetY, minY, maxY);
      }
    } else {
      this.offsetX = 0; this.offsetY = 0;
    }
  },

  /** Live layout, all in PANEL-SPACE. w/h are the panel's CURRENT
   *  computed dimensions for this call (callers already have these on
   *  hand — pw/ph from computeLayout() — passing them explicitly avoids
   *  any ordering dependency on panel.w/panel.h being freshly set).
   *  Box width/height both equal the panel's own current width ("sizing
   *  be the same" / "keep ratio" — square, tracks the panel's width
   *  through drag-resize AND the Glasses ratio scale alike, since both
   *  just change w). */
  layout(panel, w, h) {
    w = w || panel.w || 120;
    h = h ?? panel.h ?? 0;
    const boxH = w;

    const box = this.eyeOn
      ? { x: panel.x, y: panel.y - boxH - GAP, w, h: boxH }
      : null;

    const tickerY = this.eyeOn
      ? panel.y - boxH - GAP - TICKER_H - GAP   // beneath the box, above the panel
      : panel.y + h + GAP;                      // box hidden -> beneath the panel instead
    const ticker = { x: panel.x, y: tickerY, w, h: TICKER_H };

    // Eye icon — when the box is showing, it's the 4th corner button
    // (bottom-right — see controls below: zoomOut TL, zoomIn TR, fit BL,
    // eye BR, "4 buttons to the zoom corners"), box-relative like the
    // other three so it lines up exactly. With the box hidden (eyeOn
    // false) there IS no box to anchor to, so it falls back to a fixed
    // spot off the panel's own top-right corner — always reachable to
    // toggle back on either way.
    const eye = box
      ? { x: box.x + box.w - CORNER_BTN - 2, y: box.y + box.h - CORNER_BTN - 2, w: CORNER_BTN, h: CORNER_BTN }
      : { x: panel.x + w - EYE_SIZE - 4, y: panel.y - EYE_SIZE - 4, w: EYE_SIZE, h: EYE_SIZE };

    // Pan/zoom/fit controls — only meaningful (and only hit-testable)
    // while the box itself is showing; no video, nothing to pan/zoom/fit.
    let controls = null;
    if (box) {
      controls = {
        up:    { x: box.x + INSET, y: box.y, w: box.w - INSET * 2, h: EDGE },
        down:  { x: box.x + INSET, y: box.y + box.h - EDGE, w: box.w - INSET * 2, h: EDGE },
        left:  { x: box.x, y: box.y + INSET, w: EDGE, h: box.h - INSET * 2 },
        right: { x: box.x + box.w - EDGE, y: box.y + INSET, w: EDGE, h: box.h - INSET * 2 },
        // 4 corners: zoomOut top-left, zoomIn top-right, fit bottom-left,
        // eye bottom-right (eye computed above, not in this object, but
        // same corner grid).
        zoomOut: { x: box.x + 2, y: box.y + 2, w: CORNER_BTN, h: CORNER_BTN },
        zoomIn:  { x: box.x + box.w - CORNER_BTN - 2, y: box.y + 2, w: CORNER_BTN, h: CORNER_BTN },
        fit:     { x: box.x + 2, y: box.y + box.h - CORNER_BTN - 2, w: CORNER_BTN, h: CORNER_BTN },
      };
    }

    return { box, ticker, eye, controls };
  },

  /** x, y already panel-space (caller's job, see in-debug.js's _toPanel).
   *  w/h: the panel's current pw/ph (caller already has these on hand
   *  from computeLayout()). Returns 'eye' | 'fit' | 'drag' | 'pan-up' |
   *  'pan-down' | 'pan-left' | 'pan-right' | 'zoom-in' | 'zoom-out' |
   *  null. 'drag' covers whatever's left of the box and the ticker -
   *  grabbing either moves the whole assembly, same as grabbing the
   *  panel's own title bar. */
  hitTest(panel, x, y, w, h) {
    const { box, ticker, eye, controls } = this.layout(panel, w, h);
    const inRect = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    if (inRect(eye)) return 'eye';
    if (controls) {
      if (inRect(controls.zoomIn))  return 'zoom-in';
      if (inRect(controls.zoomOut)) return 'zoom-out';
      if (inRect(controls.fit))     return 'fit';
      if (inRect(controls.up))    return 'pan-up';
      if (inRect(controls.down))  return 'pan-down';
      if (inRect(controls.left))  return 'pan-left';
      if (inRect(controls.right)) return 'pan-right';
    }
    if (inRect(box)) return 'drag';
    if (inRect(ticker)) return 'drag';
    return null;
  },

  _tickerText() {
    const v = SelectionVitals;
    if (v.count === 0) return 'NOTHING SELECTED     ';
    return `${v.label}   MASS ${v.mass}   RADIUS ${v.radius}   HEAT ${v.heatPct}   ` +
           `SPEED ${v.speed}   SUN DIST ${v.sunDist}   SUN INCL. ${v.sunTag}     `;
  },

  /** Current zoom factor and its live max, given the box's current
   *  panel-space width. ZOOM_MAX is recomputed every call (not cached) —
   *  it depends on the selection's current world size AND the camera's
   *  current zoom, both of which can change independently frame to
   *  frame. Falls back to [ZOOM_MIN, ZOOM_MIN] with no selection. */
  _zoomRange(boxW) {
    const rect = this._selectionWorldRect();
    if (!rect) return { min: ZOOM_MIN, max: ZOOM_MIN };
    const worldDiameter = Math.max(rect.x1 - rect.x0, rect.y1 - rect.y0, 1);
    const screenDiameter = worldDiameter * (CameraModule.cam.zoom || 1);
    // "*1.0 to the planet, meaning a planet will fill the zoom screen" —
    // the crop span (box.w / zoom) should equal the selection's own
    // screen diameter exactly at max zoom. Never allowed to end up BELOW
    // ZOOM_MIN (a very large cluster could otherwise compute a "max" that
    // zooms out further than the floor) — "current is good as minimum".
    const max = Math.max(ZOOM_MIN, boxW / Math.max(1, screenDiameter));
    return { min: ZOOM_MIN, max };
  },

  /** Draw everything - called from debug-renderer.js's renderPanel, live
   *  every frame (never cached in the chrome canvas - the crop and the
   *  ticker both animate). ctx is already under the ambient debug-view
   *  transform. sourceCanvas is ctx.canvas itself (the main game canvas,
   *  already painted with the world this frame) - a same-canvas
   *  drawImage is well-defined (the whole source rect is read before any
   *  pixel is written), so no separate offscreen canvas is needed here. */
  draw(ctx, panel, sourceCanvas, w, h) {
    const { box, ticker, eye, controls } = this.layout(panel, w, h);
    const s = DEBUG_STATE.style;

    if (box) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, 8);
      ctx.clip();
      ctx.fillStyle = 'rgba(8,8,18,0.85)';
      ctx.fillRect(box.x, box.y, box.w, box.h);

      const wx0 = SelectionVitals.worldX, wy0 = SelectionVitals.worldY;
      if (wx0 != null && wy0 != null && sourceCanvas) {
        const wx = wx0 + this.offsetX, wy = wy0 + this.offsetY;
        const screen = CameraModule.worldToScreen(wx, wy);
        const dpr = DEBUG_STATE.dpr || window.devicePixelRatio || 1;

        const { min, max } = this._zoomRange(box.w);
        const zoomFactor = min + (max - min) * this.zoomT;

        const sourceSize = box.w / zoomFactor;
        const srcCx = screen.x * dpr, srcCy = screen.y * dpr;
        const srcHalf = (sourceSize / 2) * dpr;
        try {
          ctx.drawImage(
            sourceCanvas,
            srcCx - srcHalf, srcCy - srcHalf, srcHalf * 2, srcHalf * 2,
            box.x, box.y, box.w, box.h
          );
        } catch (_) { /* source not painted yet - skip this frame */ }

        // Centroid ring drawn at the SELECTION's actual position, not the
        // (possibly offset) crop center — stays meaningful as a "this is
        // where the selection center really is" reference even while
        // panned away from it. The screen-space gap between the two has
        // to be scaled by zoomFactor (same scale the crop itself is
        // stretched by) to land at the right spot inside the box, not
        // just added raw.
        const centroidScreen = CameraModule.worldToScreen(wx0, wy0);
        const cxBox = box.x + box.w / 2 + (centroidScreen.x - screen.x) * zoomFactor;
        const cyBox = box.y + box.h / 2 + (centroidScreen.y - screen.y) * zoomFactor;
        ctx.strokeStyle = SelectionTool.sunIncluded ? 'rgba(255,200,80,0.9)' : 'rgba(130,210,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cxBox, cyBox, 6, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(240,245,255,0.35)';
        ctx.font = `10px ${s.font}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('no selection', box.x + box.w / 2, box.y + box.h / 2);
      }

      // Drawn while still clipped to the box's rounded shape, so a
      // corner button's sharp square corner can't poke past the box's
      // own rounded corner radius.
      if (controls) this._drawControls(ctx, controls);
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 8);
      ctx.stroke();
    }

    // Ticker - clipped scrolling text, loops seamlessly (draws the text
    // twice back-to-back, offset by its own measured width, same trick
    // as any infinite marquee).
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ticker.x, ticker.y, ticker.w, ticker.h, 5);
    ctx.clip();
    ctx.fillStyle = 'rgba(8,8,18,0.85)';
    ctx.fillRect(ticker.x, ticker.y, ticker.w, ticker.h);

    const text = this._tickerText();
    ctx.font = `10px ${s.font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(130,210,255,0.9)';
    const textW = Math.max(1, ctx.measureText(text).width + 40);
    const scroll = (performance.now() / 30) % textW;
    let tx = ticker.x - scroll;
    while (tx < ticker.x + ticker.w) {
      ctx.fillText(text, tx, ticker.y + ticker.h / 2 + 0.5);
      tx += textW;
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(ticker.x + 0.5, ticker.y + 0.5, ticker.w - 1, ticker.h - 1, 5);
    ctx.stroke();

    // Eye icon — same shared button look as the pan/zoom controls (see
    // _drawButton) for full visual consistency across every control here.
    this._drawButton(ctx, eye, false, (color) => {
      ctx.fillStyle = color;
      ctx.font = `${Math.round(EYE_SIZE * 0.6)}px ${s.font}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.eyeOn ? '\u{1F441}' : '\u{1F648}', eye.x + eye.w / 2, eye.y + eye.h / 2 + 0.5);
    });
  },

  /** One shared button look used for EVERY control here (4 arrows, +/-,
   *  and the eye) — filled background + border + glyph, brightening when
   *  held/active. "Match all other buttons... bolder, hard to touch" —
   *  a bare glyph with no background reads as decoration, not a button;
   *  this makes all six read the same way at a glance and gives each one
   *  a real hit-target-sized backing shape, not just its visible glyph. */
  _drawButton(ctx, r, on, drawGlyph) {
    const DIM = 'rgba(255,255,255,0.30)';
    const LIT = 'rgba(140,210,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 4);
    ctx.fillStyle = on ? 'rgba(140,210,255,0.30)' : 'rgba(8,8,18,0.65)';
    ctx.fill();
    ctx.strokeStyle = on ? LIT : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    drawGlyph(on ? LIT : DIM);
  },

  /** The 4 transparent pan strips + 3 zoom-corner buttons (zoom out, zoom
   *  in, fit — the eye is drawn separately in draw(), but shares this
   *  same corner grid as the 4th). Bigger and filled (see _drawButton) —
   *  was a bare faint triangle before, easy to miss and inconsistent
   *  with the eye/zoom buttons' own solid look; whichever one is
   *  currently RUNNING (tap-toggled on, not held) stays lit until it's
   *  tapped again or reaches its extreme (fit is a one-shot tap, never
   *  shows a running state). */
  _drawControls(ctx, controls) {
    const running = this._running;

    const arrow = (r, dir, on) => {
      this._drawButton(ctx, r, on, (color) => {
        ctx.fillStyle = color;
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const s = 6;   // bigger triangle to match the bigger button
        ctx.beginPath();
        if (dir === 'up')    { ctx.moveTo(cx, cy - s); ctx.lineTo(cx - s, cy + s); ctx.lineTo(cx + s, cy + s); }
        if (dir === 'down')  { ctx.moveTo(cx, cy + s); ctx.lineTo(cx - s, cy - s); ctx.lineTo(cx + s, cy - s); }
        if (dir === 'left')  { ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy - s); ctx.lineTo(cx + s, cy + s); }
        if (dir === 'right') { ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s, cy - s); ctx.lineTo(cx - s, cy + s); }
        ctx.closePath();
        ctx.fill();
      });
    };
    arrow(controls.up,    'up',    running.up);
    arrow(controls.down,  'down',  running.down);
    arrow(controls.left,  'left',  running.left);
    arrow(controls.right, 'right', running.right);

    const zoomBtn = (r, glyph, on, fontSize) => {
      this._drawButton(ctx, r, on, (color) => {
        ctx.fillStyle = color;
        ctx.font = `bold ${fontSize}px ${DEBUG_STATE.style.font}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(glyph, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
      });
    };
    zoomBtn(controls.zoomOut, '\u2212', running.zoomOut, 13);   // −
    zoomBtn(controls.zoomIn,  '+',      running.zoomIn,  13);
    zoomBtn(controls.fit,     'FIT',    false,             8);   // one-shot, never "running"
  }
};

export default SelectionPanelExtras;
