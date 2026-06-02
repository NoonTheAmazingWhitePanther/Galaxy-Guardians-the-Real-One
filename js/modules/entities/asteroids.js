/**
 * js/modules/entities/asteroids.js
 * Prime Module: Asteroid spawning, physics, and rendering.
 */
import { hypot, rnd, rndR, PI2, makeRockShape } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state, SUN, sunGravMult, physSpeed, AST_SPAWN_INTERVAL, AST_MAX, AST_PALETTE } from '../../core/state.js';


export const AsteroidsModule = {
    spawnAsteroid: () => {
        if (state.asteroids.length >= AST_MAX) return;
        const spawnR = 10000 + rndR(4000, 10000);
        const fromA = rnd() * PI2;
        const sx = SUN.x + Math.cos(fromA) * spawnR;
        const sy = SUN.y + Math.sin(fromA) * spawnR;
        const exitR = spawnR * rndR(0.7, 1.2);
        const exitA = fromA + Math.PI + rndR(-1.4, 1.4);
        const ex = SUN.x + Math.cos(exitA) * exitR;
        const ey = SUN.y + Math.sin(exitA) * exitR;
        const aimA = Math.atan2(ey - sy, ex - sx);
        
        const speed = rndR(25.0, 55.0);
        const cvx = Math.cos(aimA) * speed;
        const cvy = Math.sin(aimA) * speed;
        const pal = AST_PALETTE[Math.floor(rnd() * AST_PALETTE.length)];
        const nRocks = Math.floor(rndR(3, 9));
        const clusterR = rndR(8, 28);
        
        const rocks = Array.from({ length: nRocks }, () => {
            const ra = rnd() * PI2, rd = rnd() * clusterR, rr = rndR(2, 6);
            return {
                ox: Math.cos(ra) * rd, oy: Math.sin(ra) * rd,
                dvx: (rnd() - 0.5) * 0.015, dvy: (rnd() - 0.5) * 0.015,
                r: rr, pts: makeRockShape(rr), angle: 0
            };
        });
        const mass = rocks.reduce((s, r) => s + r.r * r.r, 0) * 0.2;
        
        state.asteroids.push({
            id: `ast_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            x: sx, y: sy, vx: cvx, vy: cvy,
            rocks, clusterR, mass, pal,
            trail: [], trailLen: 180, age: 0,
            spawnAngle: aimA,
            trailDirX: -Math.cos(aimA),
            trailDirY: -Math.sin(aimA),
        });
    },
    

// NEW:

// ... and later in the tick function:


    tick: (dt) => {        state.astTimer++;
        const spawnEvery = Math.max(120, AST_SPAWN_INTERVAL / (physSpeed || 1));
        if (state.astTimer >= spawnEvery) {
            state.astTimer = 0;
            AsteroidsModule.spawnAsteroid();
        }

        for (let ai = state.asteroids.length - 1; ai >= 0; ai--) {
            const a = state.asteroids[ai];
            a.age++;
            const sdx = SUN.x - a.x, sdy = SUN.y - a.y;
            const sd2 = sdx * sdx + sdy * sdy, sd = hypot(sdx, sdy) + 0.1;
            
            if (sd < SUN.burnRadius + a.clusterR) {
                state.flashes.push({ x: a.x, y: a.y, r: a.clusterR * 4.5, maxR: a.clusterR * 5, gc: "200,180,255", life: 0.9, speed: 0.18, kind: "white" });
                state.asteroids.splice(ai, 1);
                continue;
            }
            
            const sf = (config.GRAV_CONST * SUN.mass * sunGravMult / (sd2 + 500)) * 0.00004;
            a.vx += sdx / sd * sf * dt;
            a.vy += sdy / sd * sf * dt;
            
            let hit = false;
            for (const b of state.bodies) {
                const dx = b.cx - a.x, dy = b.cy - a.y;
                const d2 = dx * dx + dy * dy, d = hypot(dx, dy) + 0.1;
                const f = config.GRAV_CONST * b.mass * 0.005 / (d2 + 200);
                a.vx += dx / d * f * dt;
                a.vy += dy / d * f * dt;
                
                if (d < b.radius + a.clusterR * 0.65) {
                    const spd = hypot(a.vx, a.vy);
                    const nx = (b.cx - a.x) / d, ny = (b.cy - a.y) / d;
                    for (const p of b.particles) {
                        if (!p.dead && hypot(p.x - a.x, p.y - a.y) < b.radius * 0.7) {
                            p.heat = Math.min(1, p.heat + spd * 0.05);
                            p.vx += nx * spd * a.mass / b.mass * 0.1;
                            p.vy += ny * spd * a.mass / b.mass * 0.1;
                        }
                    }
                    for (const rock of a.rocks) {
                        const ra = rnd() * PI2, rs = rndR(0.3, spd * 0.4);
                        state.loose.push({
                            x: a.x + rock.ox, y: a.y + rock.oy,
                            vx: a.vx + Math.cos(ra) * rs, vy: a.vy + Math.sin(ra) * rs,
                            mass: rock.r * 0.3, pal: { gc: "180,160,140" }, heat: 0.5,
                            life: rndR(0.6, 1), decay: rndR(0.003, 0.008)
                        });
                    }                    state.flashes.push({ x: a.x, y: a.y, r: a.clusterR * 0.25, maxR: a.clusterR * 5, gc: "180,200,255", life: 0.55, speed: 0.14, kind: "ring" });
                    hit = true;
                    break;
                }
            }
            if (hit) {
                state.asteroids.splice(ai, 1);
                continue;
            }
            
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            for (const rock of a.rocks) {
                rock.ox += rock.dvx * dt;
                rock.oy += rock.dvy * dt;
            }
            a.trail.push({ x: a.x, y: a.y });
            if (a.trail.length > a.trailLen) a.trail.shift();
            
            if (hypot(a.x - SUN.x, a.y - SUN.y) > 32000) {
                state.asteroids.splice(ai, 1);
            }
        }
    },

    draw: (ctx, camZoom) => {
        for (const a of state.asteroids) {
            ctx.save();
            const tailNx = a.trailDirX, tailNy = a.trailDirY;
            const tailScreenPx = 140;
            const tailWorldLen = tailScreenPx / camZoom;
            
            // Ion tail
            const STEPS = 24;
            for (let i = 1; i <= STEPS; i++) {
                const f0 = (i - 1) / STEPS, f1 = i / STEPS;
                const tx0 = a.x + tailNx * tailWorldLen * f0, ty0 = a.y + tailNy * tailWorldLen * f0;
                const tx1 = a.x + tailNx * tailWorldLen * f1, ty1 = a.y + tailNy * tailWorldLen * f1;
                const ionW = Math.max(0.1 / camZoom, (1 - f1) * 1.8 / camZoom);
                ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(tx1, ty1);
                ctx.strokeStyle = `rgba(160,205,255,${(1 - f1) ** 2 * 0.22})`;
                ctx.lineWidth = ionW; ctx.lineCap = "round"; ctx.stroke();
            }
            
            // Dust tail
            const dustA = Math.atan2(tailNy, tailNx) + 0.13;
            const dnx = Math.cos(dustA), dny = Math.sin(dustA);
            const dustLen = tailWorldLen * 0.75;
            for (let i = 1; i <= 32; i++) {
                const f0 = (i - 1) / 32, f1 = i / 32;                const tx0 = a.x + dnx * dustLen * f0, ty0 = a.y + dny * dustLen * f0;
                const tx1 = a.x + dnx * dustLen * f1, ty1 = a.y + dny * dustLen * f1;
                const dw = Math.max(0.1 / camZoom, (1 - f1) * 3.5 / camZoom);
                ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(tx1, ty1);
                ctx.strokeStyle = `rgba(220,200,155,${(1 - f1) ** 2 * 0.14})`;
                ctx.lineWidth = dw; ctx.lineCap = "round"; ctx.stroke();
            }
            ctx.restore();
            
            // Coma
            const comaScreenR = 18;
            const comaR = comaScreenR / camZoom;
            const coma = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, comaR);
            coma.addColorStop(0, "rgba(210,228,255,0.28)");
            coma.addColorStop(0.5, "rgba(180,210,255,0.10)");
            coma.addColorStop(1, "rgba(140,180,255,0)");
            ctx.fillStyle = coma;
            ctx.beginPath(); ctx.arc(a.x, a.y, comaR, 0, PI2); ctx.fill();
            
            // Rocks
            for (const rock of a.rocks) {
                const wx = a.x + rock.ox, wy = a.y + rock.oy;
                ctx.save();
                ctx.translate(wx, wy);
                ctx.rotate(rock.angle + a.spawnAngle);
                ctx.beginPath();
                ctx.moveTo(rock.pts[0][0], rock.pts[0][1]);
                for (let i = 1; i < rock.pts.length; i++) ctx.lineTo(rock.pts[i][0], rock.pts[i][1]);
                ctx.closePath();
                ctx.fillStyle = a.pal.fill;
                ctx.strokeStyle = a.pal.outline;
                ctx.lineWidth = 0.6 / camZoom;
                ctx.fill(); ctx.stroke();
                ctx.beginPath();
                ctx.arc(-rock.r * 0.22, -rock.r * 0.22, Math.max(0.3 / camZoom, rock.r * 0.18), 0, PI2);
                ctx.fillStyle = "rgba(240,240,255,0.45)"; ctx.fill();
                ctx.restore();
            }
        }
    }
};