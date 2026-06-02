/**
 * js/modules/rendering/bodies.js
 * Prime Module: Soft-body planet rendering (hull, springs, particles, atmosphere).
 */
import { hypot, lerp, clamp, convexHull, PI2 } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state, SUN } from '../../core/state.js';
import { CameraModule } from '../camera/camera.module.js';

export const BodiesModule = {
    drawBodies: (ctx) => {
        for (const b of state.bodies) {
            if (b.dead) continue;
            BodiesModule.drawBody(ctx, b);
        }
    },

    drawBody: (ctx, body) => {
        const { particles: ps, springs: ss, pal } = body;
        const alive = ps.filter(p => !p.dead);
        if (alive.length < 3) return;
        
        const hull = convexHull(alive);
        if (hull.length < 3) return;

        // Burn factor calculation
        const dxSun = SUN.x - body.cx, dySun = SUN.y - body.cy;
        const sDist = hypot(dxSun, dySun);
        const burnZoneRadius = SUN.burnRadius * 4;
        let burnFactor = 0;
        if (sDist < burnZoneRadius) {
            burnFactor = 1 - (sDist / burnZoneRadius);
            burnFactor *= (0.9 + 0.1 * Math.sin(SUN.coronaTime * 15));
            burnFactor = clamp(burnFactor, 0, 1);
        }

        // Hull fill
        ctx.beginPath();
        ctx.moveTo(hull[0].x, hull[0].y);
        for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
        ctx.closePath();
        const gr = ctx.createRadialGradient(body.cx, body.cy, 0, body.cx, body.cy, body.radius);
        gr.addColorStop(0, pal.hi + 'dd'); gr.addColorStop(0.35, pal.mid + 'cc');
        gr.addColorStop(0.75, pal.lo + 'bb'); gr.addColorStop(1, pal.lo + '44');
        ctx.fillStyle = gr; ctx.fill();

        if (burnFactor > 0.05) {
            const burnGrad = ctx.createRadialGradient(body.cx, body.cy, 0, body.cx, body.cy, body.radius * 1.1);
            burnGrad.addColorStop(0, `rgba(255,240,100,${burnFactor * 0.7})`);
            burnGrad.addColorStop(0.4, `rgba(220,60,10,${burnFactor * 0.8})`);            burnGrad.addColorStop(0.8, `rgba(30,5,0,${burnFactor * 0.9})`);
            burnGrad.addColorStop(1, `rgba(0,0,0,${burnFactor * 0.95})`);
            ctx.fillStyle = burnGrad; ctx.fill();
        }

        if (burnFactor > 0.1) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(255,120,20,${burnFactor * 0.9})`;
            ctx.lineWidth = (2 + burnFactor * 2) / CameraModule.cam.zoom;
            ctx.stroke();
            if (burnFactor > 0.2) {
                ctx.shadowBlur = 15 + burnFactor * 20;
                ctx.shadowColor = `rgba(255,80,20,${burnFactor * 0.7})`;
                ctx.strokeStyle = `rgba(255,100,30,${burnFactor * 0.5})`;
                ctx.lineWidth = (3 + burnFactor * 3) / CameraModule.cam.zoom;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            ctx.restore();
        } else {
            ctx.strokeStyle = `rgba(${pal.gc},.35)`;
            ctx.lineWidth = 1.5 / CameraModule.cam.zoom;
            ctx.stroke();
        }

        // Stressed springs
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = `rgba(${pal.gc},.9)`;
        ctx.lineWidth = 0.8 / CameraModule.cam.zoom;
        ctx.beginPath();
        for (const sp of ss) {
            if (sp.broken) continue;
            const pa = ps[sp.a], pb = ps[sp.b];
            if (pa.dead || pb.dead) continue;
            if (hypot(pb.x - pa.x, pb.y - pa.y) / sp.restLen < 1.1) continue;
            ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Particles classification
        const coolNormal = [], coolBurnt = [], hotParticles = [];
        for (const p of alive) {
            if (p.heat > 0.05) hotParticles.push(p);
            else {
                if (p.isBurnt) coolBurnt.push(p);
                else coolNormal.push(p);
            }
        }
        // Cool normal
        ctx.fillStyle = `rgba(${pal.gc},.75)`;
        for (const p of coolNormal) {
            const r = p.isCore ? config.PARTICLE_R * 1.3 : config.PARTICLE_R;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, PI2); ctx.fill();
            p.heat = Math.max(0, p.heat - 0.012);
        }

        // Cool burnt
        ctx.fillStyle = "rgba(40,20,15,0.85)";
        for (const p of coolBurnt) {
            const r = p.isCore ? config.PARTICLE_R * 1.3 : config.PARTICLE_R;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, PI2); ctx.fill();
            p.heat = Math.max(0, p.heat - 0.012);
        }

        // Hot particles
        for (const p of hotParticles) {
            const r = p.isCore ? config.PARTICLE_R * 1.3 : config.PARTICLE_R;
            const heatColor = burnFactor > 0.5
                ? `rgba(255,${Math.floor(lerp(220, 255, p.heat))},150,${p.heat})`
                : `rgba(255,${Math.floor(lerp(60, 220, p.heat))},30,${p.heat * 0.9})`;
            ctx.fillStyle = heatColor;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, PI2); ctx.fill();
            
            if (burnFactor > 0.2 && p.heat > 0.5) {
                ctx.save();
                ctx.globalAlpha = p.heat * burnFactor * 0.5;
                ctx.shadowBlur = r * (3 + burnFactor * 4);
                ctx.shadowColor = `rgba(255,100,30,${burnFactor * 0.7})`;
                ctx.fillStyle = `rgba(255,140,50,${burnFactor * 0.6})`;
                ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.3, 0, PI2); ctx.fill();
                ctx.restore();
            }
            p.heat = Math.max(0, p.heat - 0.012);
        }

        // Atmosphere halo
        ctx.save();
        const atmColor = burnFactor > 0.1 ? `rgba(255,100,20,${0.15 + burnFactor * 0.4})` : `rgba(${pal.gc},.08)`;
        const atm = ctx.createRadialGradient(body.cx, body.cy, body.radius * 0.7, body.cx, body.cy, body.radius * 1.8);
        atm.addColorStop(0, atmColor);
        atm.addColorStop(1, `rgba(${pal.gc},0)`);
        ctx.fillStyle = atm;
        ctx.beginPath(); ctx.arc(body.cx, body.cy, body.radius * 1.8, 0, PI2); ctx.fill();
        
        if (burnFactor > 0.3) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = burnFactor * 0.3;            ctx.shadowBlur = 25 + burnFactor * 15;
            ctx.shadowColor = `rgba(255,80,20,${burnFactor * 0.8})`;
            const glowAtm = ctx.createRadialGradient(body.cx, body.cy, body.radius * 0.5, body.cx, body.cy, body.radius * 2.2);
            glowAtm.addColorStop(0, `rgba(255,120,40,${burnFactor * 0.5})`);
            glowAtm.addColorStop(1, `rgba(255,60,20,0)`);
            ctx.fillStyle = glowAtm;
            ctx.beginPath(); ctx.arc(body.cx, body.cy, body.radius * 2.2, 0, PI2); ctx.fill();
        }
        ctx.restore();
    }
};