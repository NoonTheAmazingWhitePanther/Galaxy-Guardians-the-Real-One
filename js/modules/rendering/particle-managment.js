/**
 * js/modules/rendering/particle-management.js
 * 
 * PARTICLE RENDERING CONTRACT:
 * 1. Loop the particle array exactly ONCE.
 * 2. During that loop, decide visual fate and queue for draw.
 * 3. Draw in batches (same style = one batch).
 * 4. Never mutate particle state. Never loop again.
 * 5. Physics owns all state mutation. Render is read-only.
 */

import { PI2 } from '../../core/math.js';

/** Draw many arcs with one fill call. Caller sets fillStyle. */
export const batchArcs = (ctx, items) => {
  if (!items.length) return;
  ctx.beginPath();
  for (const { x, y, r } of items) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, PI2);
  }
  ctx.fill();
};

/**
 * Single-pass body particle renderer.
 * 
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} alive - particles (not dead)
 * @param {Object} pal - palette with .gc string "r,g,b"
 * @param {number} burnFactor - current sun burn intensity
 * @param {number} baseR - config.PARTICLE_R
 * @param {Function} lerp - math lerp
 */
export const renderParticles = (ctx, alive, pal, burnFactor, baseR, lerp) => {
  const coreR = baseR * 1.3;
  
  // Batched by draw style. One classification loop.
  const normal = [];
  const burnt = [];
  const hot = [];      // {x, y, r, style}
  const hotGlow = [];  // {x, y, r} for glow overlay
  
  for (const p of alive) {
    const r = p.isCore ? coreR : baseR;
    
    if (p.heat > 0.05) {
      const g = burnFactor > 0.5
        ? Math.floor(lerp(220, 255, p.heat))
        : Math.floor(lerp(60, 220, p.heat));
      const a = burnFactor > 0.5 ? p.heat : p.heat * 0.9;
      hot.push({ x: p.x, y: p.y, r, style: `rgba(255,${g},30,${a})` });
      
      if (burnFactor > 0.2 && p.heat > 0.5) {
        hotGlow.push({ x: p.x, y: p.y, r: r * 1.3 });
      }
    } else if (p.isBurnt) {
      burnt.push({ x: p.x, y: p.y, r });
    } else {
      normal.push({ x: p.x, y: p.y, r });
    }
  }
  
  // Draw batches — minimal state changes
  if (normal.length) {
    ctx.fillStyle = `rgba(${pal.gc},0.75)`;
    batchArcs(ctx, normal);
  }
  
  if (burnt.length) {
    ctx.fillStyle = "rgba(40,20,15,0.85)";
    batchArcs(ctx, burnt);
  }
  
  for (const { x, y, r, style } of hot) {
    ctx.fillStyle = style;
    ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
  }
  
  if (hotGlow.length && burnFactor > 0.2) {
    ctx.save();
    ctx.globalAlpha = burnFactor * 0.5;
    ctx.shadowBlur = baseR * (3 + burnFactor * 4);
    ctx.shadowColor = `rgba(255,100,30,${burnFactor * 0.7})`;
    ctx.fillStyle = `rgba(255,140,50,${burnFactor * 0.6})`;
    batchArcs(ctx, hotGlow);
    ctx.restore();
  }
};
