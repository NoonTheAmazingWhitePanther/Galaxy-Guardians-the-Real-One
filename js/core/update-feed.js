/**
 * js/core/update-feed.js
 *
 * THE UPDATE BAR — in-game update toasts, same family as the green
 * "preferences loaded" line. Lives just BENEATH the FPS top bar; in console
 * mode the same line docks into the console's upper greeting position and
 * dresses like a console line.
 *
 * UpdateFeed.push(anything) — a QUEUE. Any input or output is accepted with
 * normal syntax (strings, numbers, objects, errors, arrays) and normalized to
 * ONE line. Messages play one at a time:
 *   fade IN from 0 alpha → full, hold, fade OUT gently — slower than the rise.
 *
 * Responsive rule (the responsible way): every message MEASURES itself
 * against the box width. If it's bigger, it SCROLLS (marquee) for exactly as
 * long as it needs; if it fits, it sits still. The measurement runs per
 * message per device — Device + User preferences meshing, competing for the
 * user's ideal, low-end to high-end.
 */

const FADE_IN  = 300;    // ms — 0 → full alpha
const HOLD     = 1600;   // ms — readable beat (scrolling extends this)
const FADE_OUT = 900;    // ms — gently, slower than the rise
const MAX_W    = 0.6;    // box width as a fraction of the viewport
const SCROLL_PXS = 45;   // px/s marquee speed

function _oneLine(x) {
  let t;
  if (x == null) t = String(x);
  else if (typeof x === 'string') t = x;
  else if (x instanceof Error) t = `${x.name}: ${x.message}`;
  else if (typeof x === 'object') { try { t = JSON.stringify(x); } catch (_) { t = String(x); } }
  else t = String(x);
  return t.replace(/\s+/g, ' ').trim();   // whatever came in — one line out
}

export const UpdateFeed = {
  _q: [],
  _busy: false,
  _el: null,
  _inner: null,

  push(...parts) {
    this._q.push(parts.map(_oneLine).join(' '));
    if (!this._busy) this._next();
  },

  _consoleMode() {
    const R = window._DebugRouter;
    return !!(R?.masterEnabled && R?._consoleMode);
  },

  _ensure() {
    if (this._el) return;
    const el = document.createElement('div');
    el.id = 'gg-update-bar';
    const inner = document.createElement('div');
    inner.style.cssText = 'display:inline-block;white-space:pre;will-change:transform;';
    el.appendChild(inner);
    document.body.appendChild(el);
    this._el = el;
    this._inner = inner;
  },

  _style() {
    const cons = this._consoleMode();
    // Beneath the FPS top bar (top-centre) — or the console's upper greeting
    // line, dressed as console text, when the Live Text console owns the screen.
    this._el.style.cssText =
      'position:fixed;z-index:70;pointer-events:none;overflow:hidden;' +
      'opacity:0;transition:none;' +
      `max-width:${Math.round(window.innerWidth * MAX_W)}px;` +
      (cons
        ? 'left:16px;top:calc(var(--safe,16px) + 40px);text-align:left;' +
          'font:10px "Space Mono",monospace;letter-spacing:.08em;' +
          'color:rgba(80,255,140,0.95);text-shadow:0 0 6px currentColor;'
        : 'left:50%;transform:translateX(-50%);top:calc(var(--safe,16px) + 36px);text-align:center;' +
          'font:10px "Space Mono",monospace;letter-spacing:.06em;' +
          'color:rgba(130,210,255,0.95);text-shadow:0 0 6px rgba(130,210,255,0.6);');
  },

  _next() {
    const msg = this._q.shift();
    if (msg === undefined) { this._busy = false; return; }
    this._busy = true;
    this._ensure();
    this._style();
    const el = this._el, inner = this._inner;
    inner.style.transform = 'translateX(0)';
    inner.style.transition = 'none';
    inner.textContent = msg;

    // Responsive check: does THIS text need to scroll in THIS box on THIS
    // device? Measure, decide, and size the hold time to the scroll.
    const boxW  = el.getBoundingClientRect().width || Math.round(window.innerWidth * MAX_W);
    const textW = inner.getBoundingClientRect().width;
    const over  = Math.max(0, textW - boxW);
    const scrollMs = over > 0 ? (over / SCROLL_PXS) * 1000 : 0;
    const hold = HOLD + scrollMs;

    // Fade in 0 → full…
    el.style.transition = `opacity ${FADE_IN}ms ease-out`;
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    // …scroll if it's bigger than the box…
    if (over > 0) {
      setTimeout(() => {
        inner.style.transition = `transform ${scrollMs}ms linear`;
        inner.style.transform = `translateX(${-over}px)`;
      }, FADE_IN + 400);
    }
    // …then out, gently, slower.
    setTimeout(() => {
      el.style.transition = `opacity ${FADE_OUT}ms ease-in`;
      el.style.opacity = '0';
      setTimeout(() => this._next(), FADE_OUT + 80);
    }, FADE_IN + hold);
  },
};

if (typeof window !== 'undefined') window.UpdateFeed = UpdateFeed;
