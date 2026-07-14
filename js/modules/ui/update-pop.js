/**
 * js/modules/ui/update-pop.js
 * UPDATE POP v2 — the jolly one, now grown by physics.
 *
 * Every card is a BLOB: its grey body is not a CSS rectangle but a closed
 * mesh of outline points, each one a spring particle chasing its target
 * position from a left-edge anchor. Left points inflate first, the mesh
 * stretches rightward, overshoots, and jelly-settles into the rounded
 * card shape — grown from the left, pixel by pixel, on the card's own
 * canvas. Collapse runs the same springs in reverse with the same delays,
 * so cards build and let go with one identical motion, mirrored.
 *
 * Same Gandalf grey as v1 (silver rim, soft glow, --ui-radius family) —
 * fill alpha is a touch higher since a canvas body can't backdrop-blur.
 *
 * THREE VOICES now:
 *
 *   UpdatePop.pop('Benchmark complete ✨')
 *     → announcement blob. Grows in, holds by length, lets go.
 *
 *   UpdatePop.ask('Warm up?', ['Yes','No'], {timeoutMs})
 *     → question blob with buttons. Optional self-dismissal (resolves null).
 *
 *   UpdatePop.choose(['Wakeup · 1 min','Moderation · 3 min','Full · 5 min'],
 *                    {countdownSec: 5})
 *     → THE STACK. All cards together from the left, entrance staggered
 *       (they build one after another), a live counter beside each ticking
 *       5.0 → 0.0. Tap one: it resolves that index and every card lets go
 *       in the same staggered rhythm it arrived with. Counter hits 0.0:
 *       resolves null, same collapse. One choice, three depths, moderated.
 *
 * The card canvases run on their own small rAF loop that exists only while
 * cards are alive — nothing added to the sim's render path, nothing drawn
 * on the main canvas.
 */

const GREY_FILL   = 'rgba(96, 96, 110, 0.55)';
const GREY_STROKE = 'rgba(235, 235, 245, 0.30)';
const GREY_GLOW   = 'rgba(210, 210, 230, 0.28)';
const TEXT_CSS    = 'color:rgba(240,242,250,0.95);font:12px "Space Mono",monospace;' +
                    'letter-spacing:.04em;line-height:1.5;text-shadow:0 0 8px rgba(220,220,240,0.35);';

const HOLD_MS       = 1800;
const HOLD_PER_CHAR = 28;
const HOLD_MAX      = 7000;
const STAGGER_MS    = 160;   // between stacked cards — build AND collapse
const PAD           = 24;    // canvas margin for spring overshoot

// Spring constants — the jelly. Overshoots ~8%, settles in ~450ms.
const K = 160, D = 13;
const MESH_POINTS = 36;      // outline particles per blob

// ── One blob card ─────────────────────────────────────────────────────────
class BlobCard {
  /** kind: 'pop' | 'ask'; opts: { text, buttons?, counter?, onChoose? } */
  constructor(opts) {
    this.opts = opts;
    this.phase = 'grow';           // grow → live → collapse → dead
    this.dead = false;
    this._t = 0;

    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:relative;pointer-events:none;' +
      `margin:0 0 8px ${PAD}px;`;
    const cv = document.createElement('canvas');
    cv.style.cssText = `position:absolute;left:${-PAD}px;top:${-PAD}px;pointer-events:none;`;
    const content = document.createElement('div');
    content.style.cssText =
      'position:relative;opacity:0;' + TEXT_CSS +
      (opts.small ? 'font-size:11px;padding:8px 12px;max-width:min(60vw,240px);'
                  : 'padding:12px 18px;max-width:min(72vw,380px);');

    const line = document.createElement('div');
    line.textContent = opts.text;
    content.appendChild(line);

    if (opts.counter) {
      const c = document.createElement('span');
      c.style.cssText = 'display:inline-block;margin-left:10px;opacity:0.75;font-size:0.9em;';
      c.textContent = '';
      line.appendChild(c);
      this.counterEl = c;
    }

    if (opts.buttons?.length) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;';
      for (const label of opts.buttons) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText =
          'background:rgba(255,255,255,0.10);border:1px solid ' + GREY_STROKE + ';' +
          'color:inherit;padding:5px 12px;border-radius:var(--ui-radius,10px);' +
          'font:inherit;letter-spacing:inherit;cursor:pointer;transition:background 120ms ease;';
        b.addEventListener('pointerenter', () => { b.style.background = 'rgba(255,255,255,0.22)'; });
        b.addEventListener('pointerleave', () => { b.style.background = 'rgba(255,255,255,0.10)'; });
        b.addEventListener('click', () => opts.onChoose?.(label), { once: true });
        row.appendChild(b);
      }
      content.appendChild(row);
      this.hasButtons = true;
    }

    // Tapping the card body itself also chooses, when a whole-card choose
    // handler is wired (the stacked cards are one big button each).
    if (opts.onCardTap) {
      wrap.addEventListener('click', () => opts.onCardTap(), { once: true });
      this.hasButtons = true;
    }

    wrap.appendChild(cv);
    wrap.appendChild(content);
    this.el = wrap; this.cv = cv; this.content = content;
  }

  // Measure the DOM content, then seed the spring mesh around it.
  mount(delayMs = 0) {
    // Content must be in the document to measure — it's opacity:0 anyway.
    const r = this.content.getBoundingClientRect();
    const W = Math.max(40, Math.ceil(r.width));
    const H = Math.max(24, Math.ceil(r.height));
    this.W = W; this.H = H;
    this.cv.width  = W + PAD * 2;
    this.cv.height = H + PAD * 2;
    this.ctx = this.cv.getContext('2d');

    // Outline targets: rounded rect sampled at MESH_POINTS, radius from CSS.
    const cs = getComputedStyle(document.documentElement);
    const rad = Math.min(H / 2, (parseFloat(cs.getPropertyValue('--ui-radius')) || 10) + 4);
    this.targets = _roundedRectPoints(W, H, rad, MESH_POINTS);

    // Each particle: s = reach along (anchor → target), spring in s-space.
    // Anchor = left-edge centre: the blob grows out of the left.
    this.anchor = { x: 0, y: H / 2 };
    this.pts = this.targets.map(t => ({
      s: 0, v: 0, goal: 0,
      // per-point start delay: leftmost inflate first → rightward mesh growth
      delay: delayMs + (t.x / W) * 140,
    }));
    this._clock = 0;
    for (const p of this.pts) p.goal = 1;   // armed; delay gates the spring
  }

  collapse(delayMs = 0) {
    if (this.phase === 'collapse' || this.dead) return;
    this.phase = 'collapse';
    this.el.style.pointerEvents = 'none';
    this._clock = 0;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      p.goal = 0;
      // mirrored rhythm: same left-first wave on the way out
      p.delay = delayMs + (this.targets[i].x / this.W) * 140;
    }
  }

  step(dt) {
    if (this.dead) return;
    this._clock += dt * 1000;
    let energy = 0, sum = 0;
    for (const p of this.pts) {
      if (this._clock < p.delay) { sum += p.s; continue; }
      const a = (p.goal - p.s) * K - p.v * D;
      p.v += a * dt;
      p.s += p.v * dt;
      energy += Math.abs(p.v) + Math.abs(p.goal - p.s);
      sum += p.s;
    }
    const avg = sum / this.pts.length;

    // Content fades with growth; taps only once mostly grown.
    this.content.style.opacity = String(Math.max(0, Math.min(1, (avg - 0.35) / 0.5)));
    if (this.phase === 'grow' && avg > 0.85 && this.hasButtons) {
      this.el.style.pointerEvents = 'auto';
    }
    if (this.phase === 'grow' && energy < 0.02 && this._clock > 300) this.phase = 'live';
    if (this.phase === 'collapse' && avg < 0.02 && this._clock > 200) {
      this.dead = true;
      this.el.remove();
      return;
    }
    this._draw();
  }

  _draw() {
    const { ctx, anchor } = this;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.save();
    ctx.translate(PAD, PAD);
    ctx.beginPath();
    const P = this.pts.map((p, i) => ({
      x: anchor.x + (this.targets[i].x - anchor.x) * p.s,
      y: anchor.y + (this.targets[i].y - anchor.y) * p.s,
    }));
    // Smooth closed curve through midpoints — the mesh reads as one blob.
    const n = P.length;
    ctx.moveTo((P[0].x + P[n - 1].x) / 2, (P[0].y + P[n - 1].y) / 2);
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    ctx.closePath();
    ctx.shadowColor = GREY_GLOW;
    ctx.shadowBlur = 14;
    ctx.fillStyle = GREY_FILL;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = GREY_STROKE;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function _roundedRectPoints(W, H, r, n) {
  // Perimeter-uniform sampling of a rounded rect outline.
  const straight = 2 * (W - 2 * r) + 2 * (H - 2 * r);
  const arcs = 2 * Math.PI * r;
  const total = straight + arcs;
  const pts = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total;
    // walk: top edge → TR arc → right edge → BR arc → bottom → BL arc → left → TL arc
    const seg = [
      { len: W - 2 * r, f: t => ({ x: r + t, y: 0 }) },
      { len: arcs / 4,  f: t => { const a = -Math.PI / 2 + (t / (arcs / 4)) * (Math.PI / 2); return { x: W - r + Math.cos(a) * r, y: r + Math.sin(a) * r }; } },
      { len: H - 2 * r, f: t => ({ x: W, y: r + t }) },
      { len: arcs / 4,  f: t => { const a = 0 + (t / (arcs / 4)) * (Math.PI / 2); return { x: W - r + Math.cos(a) * r, y: H - r + Math.sin(a) * r }; } },
      { len: W - 2 * r, f: t => ({ x: W - r - t, y: H }) },
      { len: arcs / 4,  f: t => { const a = Math.PI / 2 + (t / (arcs / 4)) * (Math.PI / 2); return { x: r + Math.cos(a) * r, y: H - r + Math.sin(a) * r }; } },
      { len: H - 2 * r, f: t => ({ x: 0, y: H - r - t }) },
      { len: arcs / 4,  f: t => { const a = Math.PI + (t / (arcs / 4)) * (Math.PI / 2); return { x: r + Math.cos(a) * r, y: r + Math.sin(a) * r }; } },
    ];
    for (const s of seg) {
      if (d <= s.len) { pts.push(s.f(d)); break; }
      d -= s.len;
    }
  }
  return pts;
}

// ── The conductor ─────────────────────────────────────────────────────────
export const UpdatePop = {
  _q: [],
  _busy: false,
  _host: null,
  _cards: [],
  _raf: 0,
  _lastT: 0,

  pop(...parts) {
    this._q.push({ kind: 'pop', text: parts.map(_oneLine).join(' ') });
    if (!this._busy) this._next();
  },

  /** Question blob. Resolves the tapped label; timeoutMs → resolves null. */
  ask(question, options = ['OK'], opts = {}) {
    return new Promise(resolve => {
      this._q.push({ kind: 'ask', text: _oneLine(question), options, resolve, timeoutMs: opts.timeoutMs });
      if (!this._busy) this._next();
    });
  },

  /** THE STACK — all choices together from the left, staggered build,
   *  countdown beside each, one tap resolves the index, everything else
   *  lets go in the same rhythm. Counter at 0.0 → resolves null. */
  choose(texts, opts = {}) {
    return new Promise(resolve => {
      this._q.push({ kind: 'choose', texts: texts.map(_oneLine), resolve,
                     countdownSec: opts.countdownSec ?? 5 });
      if (!this._busy) this._next();
    });
  },

  _ensureHost() {
    if (this._host) return this._host;
    const h = document.createElement('div');
    h.id = 'gg-update-pop';
    h.style.cssText =
      'position:fixed;z-index:80;left:calc(var(--safe,16px));' +
      'top:calc(var(--safe,16px) + 64px);pointer-events:none;';
    document.body.appendChild(h);
    this._host = h;
    return h;
  },

  _spawn(card, delayMs) {
    this._ensureHost().appendChild(card.el);
    card.mount(delayMs);
    this._cards.push(card);
    this._run();
  },

  _run() {
    if (this._raf) return;
    this._lastT = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.05, (t - this._lastT) / 1000);
      this._lastT = t;
      for (const c of this._cards) c.step(dt);
      this._tickCountdown?.(t);
      this._cards = this._cards.filter(c => !c.dead);
      if (this._cards.length > 0) { this._raf = requestAnimationFrame(loop); }
      else { this._raf = 0; this._tickCountdown = null; }
    };
    this._raf = requestAnimationFrame(loop);
  },

  _next() {
    const msg = this._q.shift();
    if (!msg) { this._busy = false; return; }
    this._busy = true;

    if (msg.kind === 'pop') {
      const card = new BlobCard({ text: msg.text });
      this._spawn(card, 0);
      const hold = Math.min(HOLD_MAX, HOLD_MS + msg.text.length * HOLD_PER_CHAR);
      setTimeout(() => { card.collapse(0); setTimeout(() => this._next(), 600); }, hold + 500);
      return;
    }

    if (msg.kind === 'ask') {
      let timer = null;
      const card = new BlobCard({
        text: msg.text,
        buttons: msg.options,
        onChoose: (label) => settle(label),
      });
      const settle = (value) => {
        if (timer) clearTimeout(timer);
        card.collapse(0);
        setTimeout(() => { msg.resolve(value); this._next(); }, 600);
      };
      this._spawn(card, 0);
      if (msg.timeoutMs > 0) timer = setTimeout(() => settle(null), msg.timeoutMs);
      return;
    }

    if (msg.kind === 'choose') {
      const cards = msg.texts.map((text, i) =>
        new BlobCard({
          text, small: true, counter: true,
          onCardTap: () => settle(i),
        })
      );
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        // let go in the SAME staggered rhythm they arrived with
        cards.forEach((c, i) => c.collapse(i * STAGGER_MS));
        const tail = cards.length * STAGGER_MS + 700;
        setTimeout(() => { msg.resolve(value); this._next(); }, tail);
      };

      cards.forEach((c, i) => this._spawn(c, i * STAGGER_MS));

      // Countdown starts once the LAST card has had time to land, ticks
      // 5.0 → 0.0 beside every card, dies with the choice.
      const total = msg.countdownSec * 1000;
      const start = performance.now() + cards.length * STAGGER_MS + 450;
      this._tickCountdown = (t) => {
        if (settled) return;
        const left = Math.max(0, total - Math.max(0, t - start));
        const txt = (left / 1000).toFixed(1);
        for (const c of cards) if (c.counterEl) c.counterEl.textContent = txt;
        if (left <= 0) settle(null);
      };
      return;
    }
  },
};

function _oneLine(x) {
  let t;
  if (x == null) t = String(x);
  else if (typeof x === 'string') t = x;
  else if (x instanceof Error) t = `${x.name}: ${x.message}`;
  else if (typeof x === 'object') { try { t = JSON.stringify(x); } catch (_) { t = String(x); } }
  else t = String(x);
  return t.replace(/\s+/g, ' ').trim();
}

if (typeof window !== 'undefined') window.UpdatePop = UpdatePop;
