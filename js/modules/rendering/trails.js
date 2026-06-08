/**
 * js/modules/rendering/trails.js
 * Prime Module: Off-screen canvas buffer system for planet trails.
 */
import { hypot, clamp, convexHull, PI2 } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state } from '../../core/state.js';

export const TrailsModule = {
    trailBufs: [],
    trailHead: 0,
    TRAIL_STEPS: 2,
    TRAIL_ALPHAS: [1.0, 0.52, 0.24, 0.09, 0.02],

    init(width, height) {
        if (this.TRAIL_STEPS > 0) {
            this.trailBufs = Array.from({ length: this.TRAIL_STEPS }, () => {
                const c = document.createElement("canvas");
                c.width = width; c.height = height;
                return { canvas: c, ctx: c.getContext("2d"), camX: 0, camY: 0, camZoom: 1, used: false };
            });
        }
    },

    resize(width, height) {
        for (const b of this.trailBufs) {
            b.canvas.width = width; b.canvas.height = height;
            b.used = false;
        }
    },

    renderToBuffer(ctx, width, height, cam, bodies) {
        const buf = this.trailBufs[this.trailHead];
        const ox = buf.ctx;
        ox.clearRect(0, 0, width, height);
        ox.save();
        ox.translate(width / 2, height / 2);
        ox.scale(cam.zoom, cam.zoom);
        ox.translate(-cam.x, -cam.y);

        const useFastRect = (config.PARTICLE_R * cam.zoom) < 3;
        const coreScale = 1.3;

        for (const b of bodies) {
            const { particles: ps, pal } = b;
            const alive = ps.filter(p => !p.dead);
            if (alive.length < 3) continue;
            const hull = convexHull(alive);
            if (hull.length < 3) continue;
            ox.beginPath(); ox.moveTo(hull[0].x, hull[0].y);
            for (let i = 1; i < hull.length; i++) ox.lineTo(hull[i].x, hull[i].y);
            ox.closePath();

            const gr = ox.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, b.radius);
            gr.addColorStop(0, pal.hi + 'ff'); gr.addColorStop(0.35, pal.mid + 'ee');
            gr.addColorStop(0.75, pal.lo + 'cc'); gr.addColorStop(1, pal.lo + '44');
            ox.fillStyle = gr; ox.fill();
            ox.strokeStyle = `rgba(${pal.gc},.4)`; ox.lineWidth = 1.5 / cam.zoom; ox.stroke();

            // Springs
            ox.globalAlpha = 0.07; ox.strokeStyle = `rgba(${pal.gc},.9)`; ox.lineWidth = 0.8 / cam.zoom;
            ox.beginPath();
            for (const sp of b.springs) {
                if (sp.broken) continue;
                const pa = ps[sp.a], pb = ps[sp.b];
                if (pa.dead || pb.dead) continue;
                if (hypot(pb.x - pa.x, pb.y - pa.y) / sp.restLen < 1.1) continue;
                ox.moveTo(pa.x, pa.y); ox.lineTo(pb.x, pb.y);
            }
            ox.stroke();
            ox.globalAlpha = 1;

            const baseR = config.PARTICLE_R;
            if (useFastRect) {
                ox.fillStyle = `rgba(${pal.gc},.75)`;
                for (const p of alive) {
                    if (p.heat > 0.05) continue;
                    const r = p.isCore ? baseR * coreScale : baseR;
                    ox.fillRect(p.x - r, p.y - r, r * 2, r * 2);
                }
                for (const p of alive) {
                    if (p.heat <= 0.05) continue;
                    const r = p.isCore ? baseR * coreScale : baseR;
                    const g = Math.floor(60 + 160 * p.heat);
                    ox.fillStyle = `rgba(255,${g},30,${p.heat * 0.9})`;
                    ox.fillRect(p.x - r, p.y - r, r * 2, r * 2);
                }
            } else {
                ox.fillStyle = `rgba(${pal.gc},.75)`;
                ox.beginPath();
                for (const p of alive) {
                    if (p.heat > 0.05) continue;
                    const r = p.isCore ? baseR * coreScale : baseR;
                    ox.moveTo(p.x + r, p.y);
                    ox.arc(p.x, p.y, r, 0, PI2);
                }
                ox.fill();

                for (const p of alive) {                    if (p.heat <= 0.05) continue;
                    const r = p.isCore ? baseR * coreScale : baseR;
                    const g = Math.floor(60 + 160 * p.heat);
                    ox.fillStyle = `rgba(255,${g},30,${p.heat * 0.9})`;
                    ox.beginPath(); ox.arc(p.x, p.y, r, 0, PI2); ox.fill();
                }
            }

            // Atmosphere glow
            const atm = ox.createRadialGradient(b.cx, b.cy, b.radius * 0.7, b.cx, b.cy, b.radius * 1.8);
            atm.addColorStop(0, `rgba(${pal.gc},.07)`); atm.addColorStop(1, `rgba(${pal.gc},0)`);
            ox.fillStyle = atm; ox.beginPath(); ox.arc(b.cx, b.cy, b.radius * 1.8, 0, PI2); ox.fill();
        }
        ox.restore();
        buf.camX = cam.x; buf.camY = cam.y; buf.camZoom = cam.zoom;
        buf.used = true;
    },

    drawTrail(ctx, width, height, cam) {
        for (let age = this.TRAIL_STEPS - 1; age >= 0; age--) {
            const idx = ((this.trailHead - age - 1) + this.TRAIL_STEPS * 2) % this.TRAIL_STEPS;
            const buf = this.trailBufs[idx];
            if (!buf.used) continue;
            const alpha = this.TRAIL_ALPHAS[age];
            if (alpha < 0.005) continue;

            const scaleRatio = cam.zoom / buf.camZoom;
            const offX = (buf.camX - cam.x) * cam.zoom;
            const offY = (buf.camY - cam.y) * cam.zoom;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = age === 0 ? "source-over" : "lighter";
            ctx.translate(width / 2 + offX, height / 2 + offY);
            ctx.scale(scaleRatio, scaleRatio);
            ctx.translate(-width / 2, -height / 2);
            ctx.drawImage(buf.canvas, 0, 0);
            ctx.restore();
        }
        ctx.globalCompositeOperation = "source-over";
        this.trailHead = (this.trailHead + 1) % this.TRAIL_STEPS;
    }
};