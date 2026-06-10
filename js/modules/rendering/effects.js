/**
 * js/modules/rendering/effects.js
 * Prime Module: Stars, flashes, novas, and nebula rendering.
 */
import { rnd, rndR, clamp, PI2 } from '../../core/math.js';
import { state, SUN } from '../../core/state.js';

/**
 * js/modules/rendering/effects.js
 */

export const EffectsModule = {
    stars: [],
    starSprite: null, // Holds our pre-rendered bloom image
    
    // ─── 1. INITIALIZATION ─────────────────────────────────────────────────
    init(width, height) {
        // Generate the stars
        this.stars = Array.from({ length: 90 }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            r: Math.random() * 1.2 + 0.2,
            bri: Math.random() * 0.5 + 0.5,
            ts: Math.random() * 0.012 + 0.003,
            to: Math.random() * Math.PI * 2,
            hue: 200 + Math.random() * 60
        }));
        
        // PRE-RENDER THE BLOOM SPRITE (Done ONLY ONCE for max performance)
        this.starSprite = document.createElement('canvas');
        this.starSprite.width = 5;
        this.starSprite.height =5;
        const sctx = this.starSprite.getContext('2d');
        
        // Create a soft, vivid radial gradient for the bloom
        const grad = sctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, 'rgba(255, 255, 255, 255)'); // Bright white center
        grad.addColorStop(0.1, 'rgba(255, 255, 255, 0.7)'); // Soft blueish glow
        grad.addColorStop(1.0, 'rgba(100, 100, 100, 0)'); // Fade to transparent
        
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, this.starSprite.width, this.starSprite.height);
    },
    
    // ─── 2. DRAW STARS (The new optimized version) ─────────────────────────
    drawStars(ctx, t, width, height) {
        const maxW = this.starSprite.width;
        const maxH = this.starSprite.height;
        const maxW2 = this.starSprite.width/2;
        const maxH2 = this.starSprite.height/2;
        
        
        for (const s of this.stars) {
            // Twinkle math
            const a = s.bri * (1 * Math.sin(t * s.ts + s.to));
            ctx.globalAlpha = a;
            
            // Stamp the glowing sprite centered on the star's coordinates
            ctx.drawImage(this.starSprite, s.x - maxW, s.y - maxH2, maxW, maxH);
        }
        ctx.globalAlpha = 1; // Reset alpha for the rest of the game
    },
    

    
    addFlash: (x, y, r, gc) => {
        state.flashes.push({ x, y, r: r * 0.05, maxR: r * 3, gc, life: 0.55, speed: 0.14, kind: "ring" });
        state.flashes.push({ x, y, r: r * 0.1, maxR: r * 2, gc, life: 0.45, speed: 0.12, kind: "fill" });
        state.flashes.push({ x, y, r: 0, maxR: r * 0.8, gc, life: 0.60, speed: 0.10, kind: "core" });
    },

    addNova: (x, y, r, gc) => {
        state.flashes.push({ x, y, r: r * 0.9, maxR: r * 1.6, gc, life: 0.9, speed: 0.18, kind: "white" });
        state.flashes.push({ x, y, r: r * 0.04, maxR: r * 3.5, gc, life: 0.70, speed: 0.11, kind: "ring" });
        state.flashes.push({ x, y, r: r * 0.08, maxR: r * 2.2, gc, life: 0.55, speed: 0.10, kind: "fill" });
        state.flashes.push({ x, y, r: r * 0.15, maxR: r * 1.3, gc, life: 0.65, speed: 0.09, kind: "fill" });
        state.flashes.push({ x, y, r: 0, maxR: r * 0.9, gc, life: 0.75, speed: 0.08, kind: "core" });
    },

    drawFlashes: (ctx, camZoom) => {        for (let i = state.flashes.length - 1; i >= 0; i--) {
            const f = state.flashes[i];
            if (f.life <= 0) { state.flashes.splice(i, 1); continue; }
            
            const r = Math.max(0.1, f.r), a = clamp(f.life, 0, 1);
            
            if (f.kind === "white") {
                const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
                gr.addColorStop(0, `rgba(255,255,255,${a * 0.30})`);
                gr.addColorStop(0.5, `rgba(255,250,240,${a * 0.16})`);
                gr.addColorStop(0.85, `rgba(255,240,200,${a * 0.06})`);
                gr.addColorStop(1, "rgba(255,255,255,0)");
                ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, PI2); ctx.fill();
                ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, PI2);
                ctx.strokeStyle = `rgba(255,255,255,${a * 0.22})`;
                ctx.lineWidth = Math.max(0.3, r * 0.04 / camZoom);
                ctx.stroke();
            } else if (f.kind === "ring") {
                ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, PI2);
                ctx.strokeStyle = `rgba(${f.gc},${a * 0.22})`;
                ctx.lineWidth = Math.max(0.3, (f.maxR * 0.025) / camZoom) * a;
                ctx.stroke();
                const gr = ctx.createRadialGradient(f.x, f.y, Math.max(0, r * 0.75), f.x, f.y, r * 1.35); 
                gr.addColorStop(0, `rgba(${f.gc},${a * 0.08})`);
                gr.addColorStop(1, `rgba(${f.gc},0)`);
                ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r * 1.35, 0, PI2); ctx.fill();
            } else if (f.kind === "fill") {
                const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
                gr.addColorStop(0, `rgba(255,240,200,${a * 0.13})`);
                gr.addColorStop(0.4, `rgba(${f.gc},${a * 0.09})`);
                gr.addColorStop(0.8, `rgba(${f.gc},${a * 0.03})`);
                gr.addColorStop(1, `rgba(${f.gc},0)`);
                ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, PI2); ctx.fill();
            } else {
                const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
                gr.addColorStop(0, `rgba(255,255,255,${a * 0.40})`);
                gr.addColorStop(0.35, `rgba(255,230,150,${a * 0.20})`);
                gr.addColorStop(0.7, `rgba(${f.gc},${a * 0.08})`);
                gr.addColorStop(1, `rgba(${f.gc},0)`);
                ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, PI2); ctx.fill();
            }
            f.r += (f.maxR - f.r) * f.speed;
            f.life -= 0.010;
        }
    },

    drawNebula: (ctx, t, width, height) => {
        const blobs = [
            [width * 0.2, height * 0.3, Math.max(width, height) * 0.7, 8, 6, 38, 0.04],
            [width * 0.78, height * 0.7, Math.max(width, height) * 0.6, 28, 4, 18, 0.035],            [width * 0.5, height * 0.15, Math.max(width, height) * 0.5, 4, 12, 40, 0.03],
            [width * 0.85, height * 0.4, Math.max(width, height) * 0.45, 12, 3, 30, 0.025],
            [width * 0.1, height * 0.75, Math.max(width, height) * 0.5, 6, 20, 12, 0.02]
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