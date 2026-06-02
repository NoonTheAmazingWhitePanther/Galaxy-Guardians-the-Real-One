/**
 * js/modules/rendering/particles.js
 * Prime Module: Loose particles, debris, rings, and burnt particle rendering.
 */
import { hypot, lerp, clamp, PI2 } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state, SUN } from '../../core/state.js';

export const ParticlesModule = {
    drawLoose: (ctx, camZoom) => {
        const hot = [], warm = [], cool = new Map(), ring = new Map();
        const burnt = [], burntWarm = [];

        // 1. Bin a single loose particle by state
        const binLooseParticle = (p) => {
            const life = Math.min(p.life, 1);
            const r = Math.max(0.01, config.PARTICLE_R * (p.isRing ? 1.4 : 1) * life);
            const a = life;
            if (p.isBurnt) {
                if (p.heat > 0.5) burntWarm.push([p.x, p.y, r, a * 0.95, p.heat]);
                else burnt.push([p.x, p.y, r, a * 0.9, p.heat]);
            } else if (p.isRing) {
                const key = p.pal.gc;
                if (!ring.has(key)) ring.set(key, []);
                ring.get(key).push([p.x, p.y, r, a * 0.85]);
            } else if (p.heat > 0.6) {
                hot.push([p.x, p.y, r, a * 0.9]);
            } else if (p.heat > 0.3) {
                warm.push([p.x, p.y, r, a * 0.85]);
            } else {
                const key = p.pal.gc;
                if (!cool.has(key)) cool.set(key, []);
                cool.get(key).push([p.x, p.y, r, a * 0.8]);
            }
        };

        for (const p of state.loose) binLooseParticle(p);

        // 2. Draw a batch of particles (same style)
        const drawBatchParticle = ([x, y, r, a]) => {
            ctx.globalAlpha = a;
            ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
        };
        const drawBatch = (style, arr) => {
            if (!arr.length) return;
            ctx.fillStyle = style;
            for (const entry of arr) drawBatchParticle(entry);
        };

        // 3. Execute batches
        ctx.shadowBlur = 3;
        for (const [gc, pts] of ring) {
            ctx.shadowColor = `rgba(${gc},.6)`;
            drawBatch(`rgba(${gc},1)`, pts);
        }
        ctx.shadowBlur = 0;

        drawBatch("rgba(255,220,80,1)", hot);
        drawBatch("rgba(255,100,30,1)", warm);
        for (const [gc, pts] of cool) drawBatch(`rgba(${gc},1)`, pts);

        // Burnt – charcoal core
        ctx.fillStyle = "rgba(30,15,8,1)";
        for (const [x, y, r, a] of burnt) {
            ctx.globalAlpha = a * 0.85;
            ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
        }

        // Warm burnt – red glow
        for (const [x, y, r, a, heat] of burntWarm) {
            const intensity = Math.min(heat, 1);
            const red = lerp(80, 180, intensity);
            const green = lerp(20, 60, intensity);
            ctx.globalAlpha = a * 0.9;
            ctx.fillStyle = `rgba(${Math.floor(red)},${Math.floor(green)},15,1)`;
            ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
            
            if (intensity > 0.2) {
                ctx.globalAlpha = a * (intensity * 0.6);
                ctx.shadowBlur = r * (4 + intensity * 3);
                ctx.shadowColor = `rgba(255,100,20,${intensity * 0.8})`;
                ctx.fillStyle = `rgba(255,120,40,${intensity * 0.5})`;
                ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, PI2); ctx.fill();
                ctx.shadowBlur = 0;
            }
        }
        ctx.globalAlpha = 1;
    }
};