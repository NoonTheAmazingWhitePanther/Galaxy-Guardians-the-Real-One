/**
 * js/core/nova.js — NOVA EXPLOSIONS (Noon's design, 2026-07-12)
 *
 * Explosions are a huge deal here. The law of this module:
 *
 *   PHYSICS ALWAYS, VISUALS OPTIONAL. Show / don't show is one thing —
 *   the forces MUST be applied. A nova with novaShow 0 still burns, still
 *   pushes, still spawns real debris. The visual is a garnish on truth.
 *
 * ── What a spawn does (the truth side) ─────────────────────────────────
 *   1. SUDDEN HEAT   — pushes into state.novas; BurnMap already reads that
 *                      list every tick (writeSource × life) and the burning
 *                      system attracts particles to it. Zero new wiring.
 *   2. SUDDEN FORCE  — NovaFields.explode(): energy/chaos awareness splats
 *                      + the radial ForceField ring. Ghost ticks feel it
 *                      decayed to THEIR tick (ForceField.ghostScale — law).
 *   3. REAL DEBRIS   — a handful of honest loose particles flying outward
 *                      through real physics with real trails. The animation
 *                      carries the spectacle; these carry the truth.
 *   4. CACHE: SPLICE, DON'T FLUSH (th_nova law) — never invalidate. Bodies
 *      outside the region stay valid; the frontier self-heals through the
 *      decaying field. Bounded local wrongness beats a 1000-deep rebuild.
 *   Life decays per LIVE TICK (tickLife, ghost-gated in tick.js) — heat and
 *   the animation both follow SIM speed: at ×12 the explosion plays 12× fast.
 *
 * ── The buffered animation (the spectacle side) ────────────────────────
 *   Instead of iterating thousands of explosion particles per frame, we
 *   iterate PARTICLE STEPS AT BAKE TIME: each variant is a sequence of
 *   novaFrames (8 · 16 · 30 · 60 · 120 · 240) pre-rendered trail sprites —
 *   the whole streak field drawn once per frame into an offscreen canvas.
 *   Playback = ONE drawImage per nova per frame, additive. High-end quality
 *   is one knob: more frames = silkier animation, same per-frame cost.
 *
 *   Baking is CYCLED IN MS through QueOps ('rendering' subject, chained
 *   ops, novaBakePerOp frames each) — the shared frame ledger meters it, so
 *   240-frame bakes never spike a frame. Playback starts on frame 0 while
 *   later frames still bake (play what exists).
 *
 *   MEMORY LAW: frames × px² × 4 × variants must fit novaAtlasCapMB —
 *   wanted frames are clamped to the cap and the panel shows both numbers.
 *   The POCO sees exactly what the spectacle costs.
 *
 * ── Plane + cycling ────────────────────────────────────────────────────
 *   Novas draw in their OWN pass (world space, additive) — the canvas
 *   stays clean. Each nova carries a plane; novaShowPlane filters the
 *   visual per plane (-1 = all) while physics stays universal (fields are
 *   shared space — the th_nova blend law). novaDrawBudget round-robins
 *   which novas draw each frame, QueOps-style: never too much.
 */

import { state, SUN } from './state.js';
import { ManualOverrides } from '../modules/debug/governor.js';
import { QueOps } from './que-ops.js';
import { NovaFields } from './map-rule.js';

const HOT_PAL = { hi: '#fff2c8', lo: '#ff6a22', gc: '255,160,70' };
let _idc = 0;
const _nid = () => `n_${Date.now()}_${(_idc++).toString(36)}`;

/** Deterministic per-variant PRNG — every frame of a variant shares one
 *  streak field, so the animation is coherent motion, not per-frame noise. */
const _mulberry = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const _easeOut = (t) => 1 - (1 - t) * (1 - t);

export const Nova = {
  _variants: [],          // [{frames[], baked, wanted, px, seed, streaks[]}]
  _bakeQueued: false,
  _drawCursor: 0,
  _cfgSig: '',

  stats: {
    active: 0, spawned: 0, drawn: 0,
    framesWanted: 0, framesBaked: 0, atlasMB: 0, capped: 0,
    mode: 'idle',
  },

  get enabled() { return ManualOverrides.get('novaOn', 1) >= 0.5; },
  get show()    { return ManualOverrides.get('novaShow', 1) >= 0.5; },

  // ═══════════════════════════════════════════════════════════════════════
  // SPAWN — the full physics, every time. Visuals ride along if shown.
  // ═══════════════════════════════════════════════════════════════════════
  spawn(x, y, opts = {}) {
    if (!this.enabled) return null;
    const energy    = opts.energy ?? ManualOverrides.get('novaEnergy', 1200);
    const radius    = opts.radius ?? ManualOverrides.get('novaRadius', 900);
    const lifeTicks = Math.max(10, ManualOverrides.get('novaLifeTicks', 90) | 0);
    const maxActive = Math.max(1, ManualOverrides.get('novaMaxActive', 6) | 0);

    this._ensureAtlas();                       // (re)bake lazily on first need

    // POOL LAW: cap simultaneous novas — oldest dies first (th_nova answer)
    while (state.novas.length >= maxActive) state.novas.shift();

    const nova = {
      x, y, life: 1, _lifeStep: 1 / lifeTicks,
      radius, energy,
      plane: opts.plane | 0,
      variant: this._variants.length ? (this.stats.spawned % this._variants.length) : 0,
    };
    state.novas.push(nova);                    // 1) HEAT — BurnMap reads this list
    NovaFields.explode(x, y, energy, radius);  // 2) FORCE + awareness (ghost-honest)
    this._debris(x, y, nova.plane);            // 3) REAL flying particles
    /* 4) cache: SPLICE, DON'T FLUSH — deliberately no invalidate */

    this.stats.spawned++;
    return nova;
  },

  /** Honest debris — real loose particles through real physics. */
  _debris(x, y, plane) {
    const n = Math.max(0, ManualOverrides.get('novaDebris', 40) | 0);
    if (!n) return;
    const room = Math.max(0, 380 - state.loose.length);   // respect the loose cap
    const count = Math.min(n, room);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 6 + Math.random() * 18;
      state.loose.push({
        id: _nid(), x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 8,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        mass: 0.4 + Math.random() * 0.8, pal: HOT_PAL,
        heat: 0.9, life: 2 + Math.random() * 3, decay: 0.004 + Math.random() * 0.004,
        plane, isRing: false, isBurnt: true, burnedAt: performance.now(),
        meltRate: 0.004 + Math.random() * 0.004, detachSpeed: 10 + Math.random() * 8,
        birthTime: performance.now(),
      });
    }
  },

  /**
   * Once per LIVE tick (ghost-gated at the call site in tick.js) — life
   * follows sim speed, so heat AND animation play at ×timeScale honestly.
   * Also hosts the panel's test-fire: + on the Test knob fires one and the
   * knob snaps back to AUTO.
   */
  tickLife() {
    const arr = state.novas;
    for (let i = arr.length - 1; i >= 0; i--) {
      const nv = arr[i];
      if (nv._lifeStep == null) continue;      // foreign nova (other spawner) — leave it
      nv.life -= nv._lifeStep;
      if (nv.life <= 0) arr.splice(i, 1);
    }
    if (ManualOverrides.get('novaTest', 0) >= 0.5) {
      ManualOverrides.reset('novaTest');
      const b = state.bodies.length
        ? state.bodies[(Math.random() * state.bodies.length) | 0] : null;
      const px = b ? b.cx + (Math.random() - 0.5) * 600 : SUN.x + 1800;
      const py = b ? b.cy + (Math.random() - 0.5) * 600 : SUN.y;
      this.spawn(px, py, { plane: b ? (b.plane | 0) : 0 });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ATLAS — the buffered animation frames, baked in ms slices via QueOps
  // ═══════════════════════════════════════════════════════════════════════
  _ensureAtlas() {
    let frames  = Math.max(2, Math.min(240, ManualOverrides.get('novaFrames', 8) | 0));
    const px    = Math.max(64, Math.min(512, ManualOverrides.get('novaSpritePx', 192) | 0));
    const nv    = Math.max(1, Math.min(4, ManualOverrides.get('novaVariants', 2) | 0));
    const capMB = Math.max(2, ManualOverrides.get('novaAtlasCapMB', 24));
    // MEMORY LAW — wanted frames clamped so the whole atlas fits the cap
    const mbPerFrame = (px * px * 4) / (1024 * 1024);
    const maxFrames = Math.max(2, Math.floor(capMB / (mbPerFrame * nv)));
    this.stats.capped = frames > maxFrames ? 1 : 0;
    frames = Math.min(frames, maxFrames);

    const sig = `${frames}x${px}x${nv}`;
    if (sig === this._cfgSig) return;
    this._cfgSig = sig;
    this._variants = [];
    for (let v = 0; v < nv; v++) {
      this._variants.push({
        frames: new Array(frames), baked: 0, wanted: frames, px,
        streaks: this._seedStreaks((v + 1) * 1237),
      });
    }
    this.stats.framesWanted = frames * nv;
    this.stats.framesBaked = 0;
    this.stats.atlasMB = +(frames * nv * mbPerFrame).toFixed(1);
    this.stats.mode = 'baking';
    this._queueBake();
  },

  _seedStreaks(seed) {
    const rnd = _mulberry(seed);
    const n = 30 + ((rnd() * 14) | 0);
    const streaks = [];
    for (let i = 0; i < n; i++) {
      streaks.push({
        a: rnd() * Math.PI * 2,           // ray angle
        k: 0.5 + rnd() * 0.5,             // speed share (how far it flies)
        w: 0.6 + rnd() * 2.2,             // width
        hue: rnd(),                        // 0 = white-yellow … 1 = deep red
        wob: (rnd() - 0.5) * 0.5,         // slight curve over time
      });
    }
    return streaks;
  },

  /** Chain of QueOps ops — novaBakePerOp frames each, metered by the shared
   *  frame ledger. Playback runs on whatever is baked so far. */
  _queueBake() {
    if (this._bakeQueued) return;
    const v = this._variants.find((x) => x.baked < x.wanted);
    if (!v) { this.stats.mode = state.novas.length ? 'live' : 'idle'; return; }
    this._bakeQueued = true;
    QueOps.add({
      subject: 'rendering', priority: 2, cost: 2,
      fn: () => {
        this._bakeQueued = false;
        if (!this._variants.includes(v)) { this._queueBake(); return; }  // config changed mid-bake
        const per = Math.max(1, ManualOverrides.get('novaBakePerOp', 4) | 0);
        for (let k = 0; k < per && v.baked < v.wanted; k++) this._bakeFrame(v, v.baked++);
        this.stats.framesBaked = this._variants.reduce((t, x) => t + x.baked, 0);
        this._queueBake();
      },
    });
  },

  /** One trail frame — the whole streak field at time t, drawn ONCE, ever. */
  _bakeFrame(v, i) {
    const px = v.px, c = px / 2, R = px * 0.48;
    const t = v.wanted > 1 ? i / (v.wanted - 1) : 0;
    const cv = document.createElement('canvas');
    cv.width = px; cv.height = px;
    const g = cv.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    const fade = Math.pow(1 - t, 1.3);

    // shock ring — fast, thin, gone early
    const ringA = Math.pow(1 - t, 2) * 0.55;
    if (ringA > 0.02) {
      g.strokeStyle = `rgba(255,240,210,${ringA})`;
      g.lineWidth = Math.max(1, px * 0.006 * (1 - t) * 3);
      g.beginPath();
      g.arc(c, c, _easeOut(t) * R * 0.98, 0, Math.PI * 2);
      g.stroke();
    }

    // core flash — the first quarter only
    if (t < 0.25) {
      const ca = 1 - t / 0.25;
      const cr = R * (0.10 + 0.10 * ca);
      const grad = g.createRadialGradient(c, c, 0, c, c, cr);
      grad.addColorStop(0, `rgba(255,255,245,${0.95 * ca})`);
      grad.addColorStop(0.5, `rgba(255,225,150,${0.6 * ca})`);
      grad.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(c, c, cr, 0, Math.PI * 2); g.fill();
    }

    // the streak field — trails: head races out, tail chases, both fade
    const grow = t < 0.3 ? t / 0.3 : 1;                 // trails lengthen early
    for (let s = 0; s < v.streaks.length; s++) {
      const st = v.streaks[s];
      const head = _easeOut(t) * st.k;
      const tail = Math.max(0, head - 0.30 * grow * st.k * (1 - t * 0.55));
      if (head <= tail) continue;
      const ang = st.a + st.wob * t;
      const ca2 = Math.cos(ang), sa2 = Math.sin(ang);
      const x0 = c + ca2 * tail * R, y0 = c + sa2 * tail * R;
      const x1 = c + ca2 * head * R, y1 = c + sa2 * head * R;
      // color ramp: white-yellow head cooling to deep red with t and hue
      const heat = Math.max(0, 1 - t * (0.7 + st.hue * 0.6));
      const rC = 255;
      const gC = Math.round(120 + 135 * heat);
      const bC = Math.round(40 + 200 * heat * heat);
      const lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, `rgba(${rC},${Math.round(gC * 0.5)},${Math.round(bC * 0.3)},0)`);
      lg.addColorStop(1, `rgba(${rC},${gC},${bC},${fade * (0.5 + 0.5 * heat)})`);
      g.strokeStyle = lg;
      g.lineWidth = Math.max(0.5, st.w * (1 - t * 0.6) * px / 192);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    v.frames[i] = cv;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DRAW — world space, own pass, additive. One drawImage per nova.
  // ═══════════════════════════════════════════════════════════════════════
  draw(ctx) {
    const arr = state.novas;
    this.stats.active = arr.length;
    if (arr.length) this._ensureAtlas();                 // foreign spawners get visuals too
    if (this.stats.mode !== 'baking') this.stats.mode = arr.length ? 'live' : 'idle';
    if (!this.show || !arr.length || !this._variants.length) { this.stats.drawn = 0; return; }

    const planeF = ManualOverrides.get('novaShowPlane', -1);
    const budget = Math.max(1, ManualOverrides.get('novaDrawBudget', 8) | 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let drawn = 0;
    const n = arr.length;
    for (let k = 0; k < n && drawn < budget; k++) {
      const nv = arr[(this._drawCursor + k) % n];        // round-robin — never too much
      if (planeF >= 0 && (nv.plane | 0) !== planeF) continue;
      const v = this._variants[(nv.variant | 0) % this._variants.length];
      if (!v.baked) continue;
      const t = 1 - Math.max(0, Math.min(1, nv.life));   // sim-honest playback
      let fi = Math.min(v.wanted - 1, (t * v.wanted) | 0);
      if (fi >= v.baked) fi = v.baked - 1;               // play what exists while baking
      const img = v.frames[fi];
      if (!img) continue;
      const r = nv.radius || 600;
      ctx.globalAlpha = Math.min(1, nv.life * 4);        // last-gasp fade
      ctx.drawImage(img, nv.x - r, nv.y - r, r * 2, r * 2);
      drawn++;
    }
    this._drawCursor = (this._drawCursor + 1) % Math.max(1, n);
    ctx.restore();
    this.stats.drawn = drawn;
  },
};
