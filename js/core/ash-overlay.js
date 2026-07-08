/**
 * js/core/ash-overlay.js
 * Fire/ash decal overlay for burning bodies — texture-based, not per-particle.
 *
 * WHY THIS EXISTS:
 * The old "hot" particle color in particle-management.js computes a unique
 * fillStyle per particle every frame and draws each with its own arc call —
 * no batching possible (color varies per particle). That's real FPS cost at
 * scale, and it still reads flat/uniform ("cardboard") because it's just a
 * color lerp, not a texture.
 *
 * THIS SYSTEM instead:
 * - Pre-renders a small set of ember (hot) and ash (burnt) blob sprites ONCE,
 *   via radial gradients — no getImageData, no per-pixel work, no hot-path cost.
 * - Gives each body a FIXED set of decal slots (angle/distance/size), computed
 *   once and cached on the body. No per-frame randomness in layout — decals
 *   travel with the body for free, no jitter.
 * - Per frame: position + alpha only (cheap math), drawImage the pre-rendered
 *   sprites. No masking, no source-atop, no offscreen compositing — small
 *   decals drawn directly on the shared canvas can't bleed onto neighbors.
 * - Ash uses normal blend (it darkens/chars the surface); embers use additive
 *   'lighter' blend (they glow). Crossfades smoothly by heat — no popping,
 *   no per-frame sprite-swap flicker.
 *
 * COST: ~24 drawImage calls per burning body (12 decals × ash+ember pass),
 * flat regardless of particle count. Cheaper than the old system on any body
 * with more than ~25 hot particles, and gets relatively cheaper as bodies
 * get bigger/denser.
 *
 * Physics honesty: this is [FAKE (visual)] — cosmetic, no physics claim,
 * same category as trail bloom/phosphor. Driven by body.heat, which IS the
 * real BurnMap-sourced value.
 */

import { PI2 } from './math.js';
import { SUN } from './state.js';

const DECAL_COUNT = 12;
const SPRITE_SIZE = 28; // px, pre-rendered blob canvas size

// Fire palette — ember (hot) blob core colors, alpha filled in per-stop
const EMBER_COLORS = [
  'rgba(255,90,40,',   // red
  'rgba(255,170,40,',  // gold
  'rgba(255,225,90,',  // yellow
  'rgba(255,130,30,',  // orange
];
// Burnt/ash blob core colors — dark char, faint red ember undertone
const ASH_COLORS = [
  'rgba(35,15,12,',
  'rgba(20,10,8,',
];

export const AshOverlay = {
  emberSprites: null,
  ashSprites: null,

  /** Pre-render blob sprites once. Radial gradients only — no pixel loops. */
  init: () => {
    if (AshOverlay.emberSprites) return;

    const makeBlob = (coreColorPrefix) => {
      const c = document.createElement('canvas');
      c.width = SPRITE_SIZE;
      c.height = SPRITE_SIZE;
      const bctx = c.getContext('2d');
      const r = SPRITE_SIZE / 2;
      const grad = bctx.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, coreColorPrefix + '1)');
      grad.addColorStop(0.5, coreColorPrefix + '0.55)');
      grad.addColorStop(1, coreColorPrefix + '0)');
      bctx.fillStyle = grad;
      bctx.beginPath();
      bctx.arc(r, r, r, 0, PI2);
      bctx.fill();
      return c;
    };

    AshOverlay.emberSprites = EMBER_COLORS.map(makeBlob);
    AshOverlay.ashSprites = ASH_COLORS.map(makeBlob);
  },

  /** Lazily assign a fixed decal layout to a body — once, ever. No re-roll. */
  ensureDecals: (body) => {
    if (body.ashDecals) return;
    const decals = [];
    for (let i = 0; i < DECAL_COUNT; i++) {
      decals.push({
        angle: (i / DECAL_COUNT) * PI2 + (i * 0.37 % 1) * 0.5,   // spread + stable jitter
        distFactor: 0.35 + ((i * 37) % 100) / 100 * 0.55,        // 0.35–0.9 of radius
        sizeFactor: 0.5 + ((i * 53) % 100) / 100 * 0.7,          // 0.5–1.2 of sprite scale
        phase: (i * 91) % 1000,                                  // flicker phase offset
        spriteIdx: i % EMBER_COLORS.length,
      });
    }
    body.ashDecals = decals;
  },

  /** Shared per-decal geometry/alpha math (used by both passes). */
  _decalGeometry: (body, d, sunAngle, heat, timeSeed) => {
    let diff = Math.abs(d.angle - sunAngle) % PI2;
    if (diff > Math.PI) diff = PI2 - diff;
    const facing = 1 - diff / Math.PI;              // 1 facing sun, 0 opposite
    const baseAlpha = 0.35 + facing * 0.45;

    const s = Math.sin((timeSeed + d.phase) * 12.9898) * 43758.5453;
    const flicker = 0.7 + (s - Math.floor(s)) * 0.5; // deterministic, ~11fps cadence

    const alpha = Math.min(1, baseAlpha * flicker * Math.min(1, heat * 1.8));
    const dist = body.radius * d.distFactor;

    return {
      alpha,
      x: body.cx + Math.cos(d.angle) * dist,
      y: body.cy + Math.sin(d.angle) * dist,
      size: Math.max(4, body.radius * 0.28 * d.sizeFactor)
    };
  },

  /**
   * Draw fire/ash decals on a body. heat in [0,1] — this is body.heat,
   * the real BurnMap-sourced value, not the per-particle p.heat.
   * Starts at 0.1 (eases in ahead of melt-particle emission at 0.3).
   */
  draw: (ctx, body, heat) => {
    if (!heat || heat < 0.1) return;
    if (!AshOverlay.emberSprites) AshOverlay.init();
    AshOverlay.ensureDecals(body);

    const sunAngle = Math.atan2(SUN.y - body.cy, SUN.x - body.cx);
    // 0 below heat 0.5 (pure ember), ramps to 1 approaching critical (charred)
    const ashMix = Math.max(0, (heat - 0.5) / 0.5);
    const emberMix = 1 - ashMix * 0.7; // embers never fully vanish, even charred
    const timeSeed = Math.floor(performance.now() / 90);

    ctx.save();

    // Pass 1 — charred ash marks (normal blend: darkens the surface)
    if (ashMix > 0.02) {
      ctx.globalCompositeOperation = 'source-over';
      for (const d of body.ashDecals) {
        const g = AshOverlay._decalGeometry(body, d, sunAngle, heat, timeSeed);
        const a = g.alpha * ashMix;
        if (a < 0.03) continue;
        ctx.globalAlpha = a;
        const sprite = AshOverlay.ashSprites[d.spriteIdx % AshOverlay.ashSprites.length];
        ctx.drawImage(sprite, g.x - g.size / 2, g.y - g.size / 2, g.size, g.size);
      }
    }

    // Pass 2 — glowing embers (additive: hot highlights on top)
    ctx.globalCompositeOperation = 'lighter';
    for (const d of body.ashDecals) {
      const g = AshOverlay._decalGeometry(body, d, sunAngle, heat, timeSeed);
      const a = g.alpha * emberMix;
      if (a < 0.03) continue;
      ctx.globalAlpha = a;
      const sprite = AshOverlay.emberSprites[d.spriteIdx];
      ctx.drawImage(sprite, g.x - g.size / 2, g.y - g.size / 2, g.size, g.size);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }
};
