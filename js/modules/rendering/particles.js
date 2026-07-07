/**
 * js/modules/rendering/particles.js
 * Prime Module: Loose particles, debris, rings, and burnt particle rendering.
 * 
 * OPTIMIZATION (2026-07-07):
 * - Removed shadowBlur from burntWarm rendering (expensive per-particle filter)
 * - Added LOD gate: skip burntWarm rendering when camZoom < 0.15 (planetary view)
 * - Uses particle-management.js batchArcs for batched rendering where possible
 * Rule: classify once, batch where possible, minimize per-particle state changes.
 */
import { hypot, lerp, clamp, PI2 } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state, SUN } from '../../core/state.js';
import { batchArcs } from './particle-management.js';

export const ParticlesModule = {
  drawLoose: (ctx, camZoom) => {
    // LOD: skip when zoomed out too far
    if (camZoom < 0.05) return;

    // ── SINGLE CLASSIFY PASS ──
    // All particles classified into draw buckets in one loop
    const ring = new Map();     // key: gc → [{x,y,r}]
    const hot = [];             // [{x,y,r}]
    const warm = [];            // [{x,y,r}]
    const cool = new Map();     // key: gc → [{x,y,r}]
    const burnt = [];           // [{x,y,r}]
    const burntWarm = [];       // [{x,y,r,heat}]

    for (const p of state.loose) {
      const life = Math.min(p.life, 1);
      const r = Math.max(0.01, config.PARTICLE_R * (p.isRing ? 1.4 : 1) * life);

      if (p.isBurnt) {
        if (p.heat > 0.5) burntWarm.push({ x: p.x, y: p.y, r, heat: p.heat });
        else burnt.push({ x: p.x, y: p.y, r });
      } else if (p.isRing) {
        const key = p.pal.gc;
        if (!ring.has(key)) ring.set(key, []);
        ring.get(key).push({ x: p.x, y: p.y, r });
      } else if (p.heat > 0.6) {
        hot.push({ x: p.x, y: p.y, r });
      } else if (p.heat > 0.3) {
        warm.push({ x: p.x, y: p.y, r });
      } else {
        const key = p.pal.gc;
        if (!cool.has(key)) cool.set(key, []);
        cool.get(key).push({ x: p.x, y: p.y, r });
      }
    }

    // ── BATCH DRAW: one beginPath per style ──

    // Ring particles (with shadow glow)
    if (ring.size) {
      ctx.save();
      ctx.shadowBlur = 3;
      for (const [gc, items] of ring) {
        if (!items.length) continue;
        ctx.shadowColor = `rgba(${gc},.6)`;
        ctx.fillStyle = `rgba(${gc},1)`;
        ctx.globalAlpha = 0.85;
        batchArcs(ctx, items);
      }
      ctx.restore();
    }

    // Hot particles (yellow-white)
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255,220,80,1)";
    batchArcs(ctx, hot);

    // Warm particles (orange)
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(255,100,30,1)";
    batchArcs(ctx, warm);

    // Cool particles (by palette color)
    ctx.globalAlpha = 0.8;
    for (const [gc, items] of cool) {
      if (!items.length) continue;
      ctx.fillStyle = `rgba(${gc},1)`;
      batchArcs(ctx, items);
    }

    // Burnt charcoal core
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(30,15,8,1)";
    batchArcs(ctx, burnt);

    // Burnt warm (OPTIMIZATION: skip if zoomed out, no shadow blur)
    // These are individual-color particles, so per-particle draw.
    // Removed shadowBlur which was expensive per-particle filter.
    if (camZoom >= 0.15 && burntWarm.length) {
      for (const { x, y, r, heat } of burntWarm) {
        const intensity = Math.min(heat, 1);
        const red = Math.floor(lerp(80, 180, intensity));
        const green = Math.floor(lerp(20, 60, intensity));
        
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = `rgba(${red},${green},15,1)`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
        // NOTE: Removed shadow glow. Restored with future glow layer if needed.
      }
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
};
