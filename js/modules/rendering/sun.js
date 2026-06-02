/**
 * js/modules/rendering/sun.js
 * Prime Module: Sun, Solar Tentacles, and Solar Rays rendering.
 */
import { PI2 } from '../../core/math.js';
import { config } from '../../core/config.js'; // 🔥 FIXED: Imported from config.js
import { SUN, solarTentacles } from '../../core/state.js';

export const SunModule = {
    getSolarColors: (t) => {
        const speed = 0.0006;
        const phase = (t * speed) % 1.0;
        const c1 = [255, 245, 110], c2 = [255, 220, 65], c3 = [255, 255, 235];
        let r, g, b;
        if (phase < 0.333) {
            const k = phase * 3; r = c1[0] + (c2[0] - c1[0]) * k; g = c1[1] + (c2[1] - c1[1]) * k; b = c1[2] + (c2[2] - c1[2]) * k;
        } else if (phase < 0.666) {
            const k = (phase - 0.333) * 3; r = c2[0] + (c3[0] - c2[0]) * k; g = c2[1] + (c3[1] - c2[1]) * k; b = c2[2] + (c3[2] - c2[2]) * k;
        } else {
            const k = (phase - 0.666) * 3; r = c3[0] + (c1[0] - c3[0]) * k; g = c3[1] + (c1[1] - c3[1]) * k; b = c3[2] + (c1[2] - c3[2]) * k;
        }
        return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
    },

    drawSun: (ctx, t, camZoom) => {
        const { x, y, radius } = SUN;
        SUN.coronaTime += 0.008;
        const ct = SUN.coronaTime;
        const sunCol = SunModule.getSolarColors(t);
        const sunBase = `rgba(${sunCol.r},${sunCol.g},${sunCol.b}`;

        // Halos
        const drawHalo = ([r, a, sp]) => {
            const pulse = 1 + 0.05 * Math.sin(ct * sp * 1000);
            const gr = ctx.createRadialGradient(x, y, radius * 0.6, x, y, r * pulse);
            gr.addColorStop(0, `${sunBase},${a})`);
            gr.addColorStop(0.5, `${sunBase},${a * 0.4})`);
            gr.addColorStop(1, `rgba(${sunCol.r},${Math.max(0, sunCol.g - 80)},0,0)`);
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, PI2); ctx.fill();
        };
        for (const halo of [[radius * 5.5, 0.015, 0.0011], [radius * 3.8, 0.03, 0.0017], [radius * 2.5, 0.055, 0.002], [radius * 1.7, 0.09, 0.0025]]) {
            drawHalo(halo);
        }

        // Flares
        const drawFlare = (i) => {
            const angle = (PI2 / 12) * i + Math.sin(ct * 0.7 + i) * 0.12;
            const flicker = Math.sin(ct * 1.3 + i * 2.1) * 0.5 + 0.5;
            const len = radius * (0.35 + flicker * 0.5);
            const tipX = x + Math.cos(angle) * (radius + len);            const tipY = y + Math.sin(angle) * (radius + len);
            const lx = x + Math.cos(angle - Math.PI / 2) * radius * 0.1;
            const ly = y + Math.sin(angle - Math.PI / 2) * radius * 0.1;
            const rx = x + Math.cos(angle + Math.PI / 2) * radius * 0.1;
            const ry = y + Math.sin(angle + Math.PI / 2) * radius * 0.1;
            const fg = ctx.createLinearGradient(x, y, tipX, tipY);
            fg.addColorStop(0, `${sunBase},${0.4 * flicker})`);
            fg.addColorStop(0.6, `${sunBase},${0.15 * flicker})`);
            fg.addColorStop(1, `rgba(${Math.max(0, sunCol.r - 40)},${Math.max(0, sunCol.g - 60)},0,0)`);
            ctx.beginPath(); ctx.moveTo(lx, ly);
            ctx.quadraticCurveTo(tipX + Math.cos(angle) * radius * 0.08, tipY + Math.sin(angle) * radius * 0.08, rx, ry);
            ctx.quadraticCurveTo(x + Math.cos(angle) * radius * 0.6, y + Math.sin(angle) * radius * 0.6, lx, ly);
            ctx.fillStyle = fg; ctx.fill();
        };
        for (let i = 0; i < 12; i++) drawFlare(i);

        // Sun sphere with clipping
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, radius, 0, PI2); ctx.clip();
        const bg = ctx.createRadialGradient(x - radius * 0.15, y - radius * 0.15, 0, x, y, radius);
        bg.addColorStop(0, `${sunBase},1)`);
        bg.addColorStop(0.35, `rgba(${Math.min(255, sunCol.r + 15)},${Math.min(255, sunCol.g + 10)},${sunCol.b},0.95)`);
        bg.addColorStop(0.8, `${sunBase},0.85)`);
        bg.addColorStop(1, `rgba(${Math.max(0, sunCol.r - 30)},${Math.max(0, sunCol.g - 50)},0,0.9)`);
        ctx.fillStyle = bg; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

        // Granulation
        const drawGranule = (i) => {
            const ga = (PI2 / 28) * i + ct * 0.025 * (i % 2 ? 1 : -1);
            const gd = (0.35 + 0.5 * (i % 7) / 7) * radius;
            const gx = x + Math.cos(ga) * gd, gy = y + Math.sin(ga) * gd;
            const gr2 = radius * (0.06 + 0.08 * ((i * 7) % 5) / 5);
            const granG = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr2);
            granG.addColorStop(0, `${sunBase},${(0.5 + 0.5 * Math.sin(ct * 2.1 + i * 1.3)) * 0.18})`);
            granG.addColorStop(1, `rgba(${sunCol.r},${Math.max(0, sunCol.g - 40)},0,0)`);
            ctx.fillStyle = granG; ctx.beginPath(); ctx.arc(gx, gy, gr2, 0, PI2); ctx.fill();
        };
        for (let i = 0; i < 28; i++) drawGranule(i);
        ctx.restore();

        // Sunspots
        const drawSunspot = ([a, d, r, fl]) => {
            const sa = a + ct * 0.04 * (fl - 0.9);
            const sx = x + Math.cos(sa) * d * radius, sy = y + Math.sin(sa) * d * radius, sr = r * radius;
            const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
            sg.addColorStop(0, 'rgba(140,100,20,0.45)');
            sg.addColorStop(0.7, 'rgba(160,120,40,0.2)');
            sg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, PI2); ctx.fill();
        };        for (const spot of [[0.8, 0.42, 0.09, 1.1], [2.3, 0.55, 0.06, 0.9], [4.1, 0.35, 0.07, 1.2], [5.5, 0.5, 0.05, 0.8]]) {
            drawSunspot(spot);
        }

        // Specular highlight & Rim glow
        const hl = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, 0, x - radius * 0.35, y - radius * 0.35, radius * 0.65);
        hl.addColorStop(0, 'rgba(255,255,255,0.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        const rim = ctx.createRadialGradient(x, y, radius * 0.88, x, y, radius * 1.18);
        rim.addColorStop(0, 'rgba(0,0,0,0)');
        rim.addColorStop(0.45, `${sunBase},0.12)`);
        rim.addColorStop(1, `rgba(${sunCol.r},${Math.max(0, sunCol.g - 60)},0,0)`);
        ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(x, y, radius * 1.18, 0, PI2); ctx.fill();

        // God rays
        ctx.save();
        ctx.globalAlpha = 0.025;
        const drawGodRay = (i) => {
            const sa = ct * 0.05 + (PI2 / 6) * i;
            const ex = x + Math.cos(sa) * radius * 18, ey = y + Math.sin(sa) * radius * 18;
            const lx2 = x + Math.cos(sa - Math.PI / 2) * radius * 0.7, ly2 = y + Math.sin(sa - Math.PI / 2) * radius * 0.7;
            const rx2 = x + Math.cos(sa + Math.PI / 2) * radius * 0.7, ry2 = y + Math.sin(sa + Math.PI / 2) * radius * 0.7;
            const sg = ctx.createLinearGradient(x, y, ex, ey);
            sg.addColorStop(0, `${sunBase},1)`);
            sg.addColorStop(1, `rgba(${Math.max(0, sunCol.r - 30)},0,0,0)`);
            ctx.beginPath(); ctx.moveTo(lx2, ly2); ctx.lineTo(ex, ey); ctx.lineTo(rx2, ry2); ctx.closePath();
            ctx.fillStyle = sg; ctx.fill();
        };
        for (let i = 0; i < 6; i++) drawGodRay(i);
        ctx.restore();
    },

    drawSolarTentacles: (ctx, t, camZoom) => {
        const { x, y, radius } = SUN;
        const sunCol = SunModule.getSolarColors(t);
        const sunBase = `rgba(${sunCol.r},${sunCol.g},${sunCol.b}`;

        if (Math.random() < 0.25 && solarTentacles.length < config.TENTECLEMAX) {
            solarTentacles.push({
                angle: Math.random() * PI2, length: 50 + Math.random() * 80, width: 6 + Math.random() * 8,
                swaySpeed: 0.018 + Math.random() * 0.015, phase: Math.random() * PI2,
                life: 1.5, decay: 0.01 + Math.random() * 0.01
            });
        }

        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const drawTentacle = (i) => {
            const tent = solarTentacles[i];
            tent.phase += tent.swaySpeed;
            tent.life -= tent.decay;            if (tent.life <= 0) { solarTentacles.splice(i, 1); return; }
            const a = tent.angle;
            const len = tent.length * tent.life;
            const w = tent.width * tent.life;
            const sway = Math.sin(tent.phase) * len * 0.35;
            const bx = x + Math.cos(a) * radius;
            const by = y + Math.sin(a) * radius;
            const tx = x + Math.cos(a) * (radius + len) + Math.cos(a + Math.PI / 2) * sway;
            const ty = y + Math.sin(a) * (radius + len) + Math.sin(a + Math.PI / 2) * sway;
            const cx = x + Math.cos(a) * (radius + len * 0.55) + Math.cos(a + Math.PI / 2) * sway * 1.3;
            const cy = y + Math.sin(a) * (radius + len * 0.55) + Math.sin(a + Math.PI / 2) * sway * 1.3;

            ctx.lineWidth = w;
            ctx.globalAlpha = tent.life * 0.65;
            const grad = ctx.createLinearGradient(bx, by, tx, ty);
            grad.addColorStop(0, 'rgba(255,255,245,0.95)');
            grad.addColorStop(0.25, `${sunBase},0.9)`);
            grad.addColorStop(0.65, `rgba(${Math.max(0, sunCol.r - 20)},${Math.max(0, sunCol.g - 40)},0,0.5)`);
            grad.addColorStop(1, `rgba(${Math.max(0, sunCol.r - 60)},0,0,0)`);
            ctx.strokeStyle = grad;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke();
        };
        for (let i = solarTentacles.length - 1; i >= 0; i--) drawTentacle(i);
        ctx.globalAlpha = 1;
    },

    drawSolarRays: (ctx, t, camZoom) => {
        const { x, y, radius } = SUN;
        const sunCol = SunModule.getSolarColors(t);
        const sunBase = `rgba(${sunCol.r},${sunCol.g},${sunCol.b}`;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.lineCap = 'round';
        const numRays = 16;
        const rotation = t * 0.00004;
        const drawRay = (i) => {
            const angle = (PI2 / numRays) * i + rotation + Math.sin(t * 0.0002 + i * 1.2) * 0.25;
            const pulse = 1 + Math.sin(t * 0.0005 + i * 0.9) * 0.5;
            const len = radius * (1.5 + pulse * 2.0);
            const width = (0.06 + Math.sin(t * 0.0003 + i * 2.1) * 0.03) * radius;
            const sx = x + Math.cos(angle) * radius * 0.95;
            const sy = y + Math.sin(angle) * radius * 0.95;
            const ex = x + Math.cos(angle) * (radius + len);
            const ey = y + Math.sin(angle) * (radius + len);
            const px = -Math.sin(angle);
            const py = Math.cos(angle);
            const grad = ctx.createLinearGradient(sx, sy, ex, ey);
            grad.addColorStop(0, `${sunBase},0.55)`);
            grad.addColorStop(0.25, `${sunBase},0.2)`);
            grad.addColorStop(0.6, `${sunBase},0.05)`);            grad.addColorStop(1, `rgba(${sunCol.r},0,0,0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(sx + px * width * 0.6, sy + py * width * 0.6);
            ctx.lineTo(ex + px * width * 0.05, ey + py * width * 0.05);
            ctx.lineTo(ex - px * width * 0.05, ey - py * width * 0.05);
            ctx.lineTo(sx - px * width * 0.6, sy - py * width * 0.6);
            ctx.closePath();
            ctx.fill();
        };
        for (let i = 0; i < numRays; i++) drawRay(i);
        ctx.globalCompositeOperation = 'lighter';
        const glowRadius = radius * 6;
        const ambientGrad = ctx.createRadialGradient(x, y, radius * 0.8, x, y, glowRadius);
        ambientGrad.addColorStop(0, `${sunBase},0.12)`);
        ambientGrad.addColorStop(0.4, `${sunBase},0.04)`);
        ambientGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ambientGrad;
        ctx.beginPath(); ctx.arc(x, y, glowRadius, 0, PI2); ctx.fill();
        ctx.restore();
    }
};