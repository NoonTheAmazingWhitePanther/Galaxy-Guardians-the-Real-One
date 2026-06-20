/**
js/modules/rendering/effects.js
Prime Module: Stars, flashes, novas, and nebula rendering.
FIX (2026-06-14): Added safety checks for undefined gc values
*/
import { rnd, rndR, clamp, PI2 } from '../../core/math.js';
import { state, SUN } from '../../core/state.js';

export const EffectsModule = {
stars: [],
starSprite: null,

init(width, height) {
    // ── Star field — 3 layers, varied types ───────────────────────────────
    const COUNTS = [55, 28, 12];
    const SIZES  = [[0.2, 0.6], [0.6, 1.2], [1.1, 2.2]];
    const BRIS   = [[0.15, 0.4], [0.3, 0.65], [0.55, 1.0]];
    const TYPES  = ['dot', 'dot', 'dot', 'glow', 'glow', 'cross'];

    this.stars = [];
    for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < COUNTS[layer]; i++) {
            const [rMin, rMax] = SIZES[layer];
            const [bMin, bMax] = BRIS[layer];
            this.stars.push({
                x:    Math.random() * width,
                y:    Math.random() * height,
                r:    rMin + Math.random() * (rMax - rMin),
                bri:  bMin + Math.random() * (bMax - bMin),
                ts:   Math.random() * 0.008 + 0.001,
                to:   Math.random() * Math.PI * 2,
                type: TYPES[Math.floor(Math.random() * TYPES.length)],
                layer
            });
        }
    }

    this._sprites = {
        dot:   this._makeSpriteDot(14),
        glow:  this._makeSpriteGlow(22),
        cross: this._makeSpriteCross(28)
    };
},

_makeSpriteDot(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0,    'rgba(255, 255, 255, 1)');
    g.addColorStop(0.18, 'rgba(220, 235, 255, 0.85)');
    g.addColorStop(0.45, 'rgba(180, 210, 255, 0.3)');
    g.addColorStop(1,    'rgba(140, 180, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
},

_makeSpriteGlow(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0,    'rgba(255, 255, 255, 1)');
    g.addColorStop(0.08, 'rgba(240, 248, 255, 0.95)');
    g.addColorStop(0.2,  'rgba(200, 225, 255, 0.55)');
    g.addColorStop(0.5,  'rgba(160, 200, 255, 0.15)');
    g.addColorStop(0.75, 'rgba(120, 160, 255, 0.05)');
    g.addColorStop(1,    'rgba(100, 140, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(cx, cx, cx * 0.55, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180, 220, 255, 0.12)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    return c;
},

_makeSpriteCross(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.4);
    g.addColorStop(0,   'rgba(255, 255, 255, 1)');
    g.addColorStop(0.3, 'rgba(220, 240, 255, 0.8)');
    g.addColorStop(1,   'rgba(180, 220, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const drawSpike = (angle) => {
        ctx.save();
        ctx.translate(cx, cx);
        ctx.rotate(angle);
        const sg = ctx.createLinearGradient(-cx, 0, cx, 0);
        sg.addColorStop(0,   'rgba(200, 230, 255, 0)');
        sg.addColorStop(0.4, 'rgba(220, 240, 255, 0.18)');
        sg.addColorStop(0.5, 'rgba(255, 255, 255, 0.55)');
        sg.addColorStop(0.6, 'rgba(220, 240, 255, 0.18)');
        sg.addColorStop(1,   'rgba(200, 230, 255, 0)');
        ctx.fillStyle = sg;
        ctx.fillRect(-cx, -0.8, size, 1.6);
        ctx.restore();
    };
    drawSpike(0);
    drawSpike(Math.PI / 2);
    drawSpike(Math.PI / 4);
    drawSpike(-Math.PI / 4);
    return c;
},

drawStars(ctx, t, width, height) {
    if (!this._sprites) return;
    for (const s of this.stars) {
        const twinkle = 0.55 + 0.45 * Math.sin(t * s.ts + s.to);
        const a = s.bri * twinkle;
        if (a < 0.02) continue;
        const sprite = this._sprites[s.type];
        const drawR  = s.r * (sprite.width / 8);
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, s.x - drawR, s.y - drawR, drawR * 2, drawR * 2);
    }
    ctx.globalAlpha = 1;
},addFlash: (x, y, r, gc) => {
    state.flashes.push({ x, y, r: r * 0.05, maxR: r * 3, gc: gc || '255,255,255', life: 0.55, speed: 0.14, kind: "ring" });
    state.flashes.push({ x, y, r: r * 0.1, maxR: r * 2, gc: gc || '255,255,255', life: 0.45, speed: 0.12, kind: "fill" });
    state.flashes.push({ x, y, r: 0, maxR: r * 0.8, gc: gc || '255,255,255', life: 0.60, speed: 0.10, kind: "core" });
},

addNova: (x, y, r, gc) => {
    state.flashes.push({ x, y, r: r * 0.9, maxR: r * 1.6, gc: gc || '255,255,255', life: 0.9, speed: 0.18, kind: "white" });
    state.flashes.push({ x, y, r: r * 0.04, maxR: r * 3.5, gc: gc || '255,255,255', life: 0.70, speed: 0.11, kind: "ring" });
    state.flashes.push({ x, y, r: r * 0.08, maxR: r * 2.2, gc: gc || '255,255,255', life: 0.55, speed: 0.10, kind: "fill" });
    state.flashes.push({ x, y, r: r * 0.15, maxR: r * 1.3, gc: gc || '255,255,255', life: 0.65, speed: 0.09, kind: "fill" });
    state.flashes.push({ x, y, r: 0, maxR: r * 0.9, gc: gc || '255,255,255', life: 0.75, speed: 0.08, kind: "core" });
},

drawFlashes: (ctx, camZoom) => {
    for (let i = state.flashes.length - 1; i >= 0; i--) {
        const f = state.flashes[i];
        if (f.life <= 0) { state.flashes.splice(i, 1); continue; }
        const r = Math.max(0.1, f.r), a = clamp(f.life, 0, 1);
        // SAFETY: Ensure gc exists and is valid
        const gc = f.gc || '255,255,255';
        
        if (f.kind === "white") {
            const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
            gr.addColorStop(0, `rgba(255,255,255,${a * 0.30})`);
            gr.addColorStop(0.5, `rgba(255,250,240,${a * 0.16})`);
            gr.addColorStop(0.85, `rgba(255,240,200,${a * 0.06})`);
            gr.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, PI2); ctx.fill();
        } else if (f.kind === "ring") {
            ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, PI2);
            ctx.strokeStyle = `rgba(${gc},${a * 0.22})`;
            ctx.lineWidth = Math.max(0.3, (f.maxR * 0.025) / camZoom) * a;
            ctx.stroke();
        } else if (f.kind === "fill") {
            const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
            gr.addColorStop(0, `rgba(255,240,200,${a * 0.13})`);
            gr.addColorStop(0.4, `rgba(${gc},${a * 0.09})`);
            gr.addColorStop(0.8, `rgba(${gc},${a * 0.03})`);
            gr.addColorStop(1, `rgba(${gc},0)`);
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, PI2); ctx.fill();
        }
        f.r += (f.maxR - f.r) * f.speed;
        f.life -= 0.010;
    }
},

drawNebula: (ctx, t, width, height) => {
    const blobs = [
        [width * 0.2, height * 0.3, Math.max(width, height) * 0.7, 8, 6, 38, 0.04],
        [width * 0.78, height * 0.7, Math.max(width, height) * 0.6, 28, 4, 18, 0.035]
    ];
    for (const [bx, by, br, r, g, b, a] of blobs) {
        const px = bx + Math.sin(t * 0.00007) * 30;
        const py = by + Math.cos(t * 0.00009) * 20;
        const grd = ctx.createRadialGradient(px, py, 0, px, py, br);
        grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, width, height);
    }
}
};