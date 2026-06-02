/**
 * js/modules/physics/collisions.js
 * Prime Module: Spatial hashing and collision resolution.
 */
import { hypot, clamp, rnd, rndR } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state } from '../../core/state.js';

export const interBodyCollisions = () => {
    const bodies = state.bodies;
    for (let bi = 0; bi < bodies.length; bi++) {
        for (let bj = bi + 1; bj < bodies.length; bj++) {
            const A = bodies[bi], B = bodies[bj];
            const cdx = A.cx - B.cx, cdy = A.cy - B.cy;
            const cd2 = cdx * cdx + cdy * cdy;
            const thresh = A.radius + B.radius + config.COLLISION_R * 4;
            if (cd2 > thresh * thresh) continue;

            const cellSize = config.COLLISION_R * 2;
            const grid = new Map();
            const addParticleToGrid = (p, tag) => {
                const key = Math.floor(p.x / cellSize) + "," + Math.floor(p.y / cellSize);
                if (!grid.has(key)) grid.set(key, []);
                grid.get(key).push({ p, tag });
            };
            for (const p of A.particles) if (!p.dead) addParticleToGrid(p, 0);
            for (const p of B.particles) if (!p.dead) addParticleToGrid(p, 1);

            for (const cell of grid.values()) {
                let hasA = false, hasB = false;
                for (const e of cell) { if (e.tag === 0) hasA = true; else hasB = true; }
                if (!hasA || !hasB) continue;

                for (const ea of cell) {
                    if (ea.tag !== 0) continue;
                    const pa = ea.p;
                    for (const eb of cell) {
                        if (eb.tag !== 1) continue;
                        const pb = eb.p;
                        const dx = pb.x - pa.x, dy = pb.y - pa.y;
                        const d2 = dx * dx + dy * dy;
                        if (d2 >= config.COLLISION_R * config.COLLISION_R) continue;
                        const d = Math.sqrt(d2) || 0.001;
                        const nx = dx / d, ny = dy / d;
                        const ov = config.COLLISION_R - d;
                        const ma = pa.mass, mb = pb.mass, mt = ma + mb;
                        pa.x -= nx * ov * (mb / mt); pa.y -= ny * ov * (mb / mt);
                        pb.x += nx * ov * (ma / mt); pb.y += ny * ov * (ma / mt);
                        const vn = (pa.vx - pb.vx) * nx + (pa.vy - pb.vy) * ny;
                        if (vn < 0) {                            const j = -(1 + 0.35) * vn / (1 / ma + 1 / mb);
                            pa.vx += j * nx / ma; pa.vy += j * ny / ma;
                            pb.vx -= j * nx / mb; pb.vy -= j * ny / mb;
                            const heatGain = Math.min(0.4, Math.abs(vn) * 0.12);
                            pa.heat = clamp(pa.heat + heatGain, 0, 1);
                            pb.heat = clamp(pb.heat + heatGain, 0, 1);
                        }
                    }
                }
            }
        }
    }
};

export const looseVsPlanets = () => {
    const MAX_CHECKS = 250;
    const looseArr = state.loose;
    const step = looseArr.length > MAX_CHECKS ? Math.floor(looseArr.length / MAX_CHECKS) : 1;
    
    for (let li = looseArr.length - 1; li >= 0; li -= step) {
        const lp = looseArr[li];
        if (lp.life <= 0.1) continue;
        
        let collided = false;
        for (const body of state.bodies) {
            const bdx = body.cx - lp.x, bdy = body.cy - lp.y;
            const bd2 = bdx * bdx + bdy * bdy;
            const thresh = body.radius + config.LOOSE_HIT_R * 2.5;
            if (bd2 > thresh * thresh) continue;

            let nearP = null, nearD2 = Infinity;
            for (const bp of body.particles) {
                if (bp.dead) continue;
                const d2 = (bp.x - lp.x) ** 2 + (bp.y - lp.y) ** 2;
                if (d2 < nearD2) { nearD2 = d2; nearP = bp; }
            }
            const nearD = Math.sqrt(nearD2);
            if (!nearP || nearD > config.LOOSE_HIT_R * 1.5) continue;

            const dx = nearP.x - lp.x, dy = nearP.y - lp.y;
            const d = hypot(dx, dy) || 0.001;
            const nx = dx / d, ny = dy / d;
            const vn = (lp.vx - nearP.vx) * nx + (lp.vy - nearP.vy) * ny;

            if (Math.abs(vn) < 1.5) {
                nearP.vx += lp.vx * lp.mass / nearP.mass * 0.5;
                nearP.vy += lp.vy * lp.mass / nearP.mass * 0.5;
                nearP.heat = Math.min(1, nearP.heat + 0.4);
                lp.life = 0;
                if (lp.heat > 0.4) state.flashes.push({ x: lp.x, y: lp.y, r: 0.15, maxR: 3, gc: '255,180,80', life: 0.6, speed: 0.1, kind: "core" });                collided = true; break;
            } else if (vn > 0) {
                lp.x -= nx * (config.LOOSE_HIT_R - nearD) * 0.95;
                lp.y -= ny * (config.LOOSE_HIT_R - nearD) * 0.95;
                const ma = lp.mass, mb = nearP.mass;
                const j = -(1 + 0.45) * vn / (1 / ma + 1 / mb);
                lp.vx -= j * nx / ma; lp.vy -= j * ny / ma;
                nearP.vx += j * nx / mb; nearP.vy += j * ny / mb;
                const h = clamp(Math.abs(vn) * 0.12, 0, 1);
                lp.heat = Math.min(1, lp.heat + h);
                nearP.heat = Math.min(1, nearP.heat + h);
                if (Math.abs(vn) > 3 && looseArr.length < 380) {
                    for (let k = 0; k < 2; k++) {
                        const a = Math.atan2(-ny, -nx) + (rnd() - 0.5) * 1.0;
                        const s = rnd() * Math.abs(vn) * 0.25 + 0.2;
                        looseArr.push({ x: lp.x, y: lp.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, mass: lp.mass * 0.08, pal: lp.pal, heat: 0.9, life: 0.3, decay: 0.06, isBurnt: false, burnedAt: 0, meltRate: rndR(0.002, 0.006), detachSpeed: rndR(6, 12), birthTime: performance.now() });
                    }
                }
                collided = true; break;
            }
        }
    }
};