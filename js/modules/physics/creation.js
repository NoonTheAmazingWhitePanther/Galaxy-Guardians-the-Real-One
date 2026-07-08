/**
js/modules/physics/creation.js
Prime Module: Entity creation, ring spawning, and debris splitting.
*/
import { hypot, lerp, rnd, rndR } from '../../core/math.js';
import { QueOps } from '../../core/que-ops.js';
import { config } from '../../core/config.js';
import { state, SUN, RING_MIN_RADIUS, RING_PARTICLES } from '../../core/state.js';

// Visual burst on a discrete event (ring spawn, planet death) — a NEW EVENT
// riding on top of the ongoing simulation, not part of the deterministic
// tick itself. Queued as one atomic op (all of a burst's rings/fills/core
// together) so a cluster of simultaneous events — a burn-death chain
// reaction, several rings spawned at once — smears across a couple of
// frames like the particle trickle below already does, instead of every
// flash in the batch popping in on the exact same frame. Ghost-mode safe
// for free: QueOps._ghostCapture already redirects any .add() made during
// FutureCache's pre-compute pass and re-fires it for real at playback —
// the same guarantee spawnRing's particle loop already relies on.
const addFlash = (x, y, r, gc) => {
    const validGc = gc || '255,255,255';
    QueOps.add({
        subject: 'rendering', priority: 2, cost: 1,
        fn: () => {
            state.flashes.push({ x, y, r: r * 0.05, maxR: r * 3, gc: validGc, life: 0.55, speed: 0.14, kind: "ring" });
            state.flashes.push({ x, y, r: r * 0.1, maxR: r * 2, gc: validGc, life: 0.45, speed: 0.12, kind: "fill" });
            state.flashes.push({ x, y, r: 0, maxR: r * 0.8, gc: validGc, life: 0.60, speed: 0.10, kind: "core" });
        }
    });
};

const addNova = (x, y, r, gc) => {
    const validGc = gc || '255,255,255';
    QueOps.add({
        subject: 'rendering', priority: 2, cost: 1,
        fn: () => {
            state.flashes.push({ x, y, r: r * 0.9, maxR: r * 1.6, gc: validGc, life: 0.9, speed: 0.18, kind: "white" });
            state.flashes.push({ x, y, r: r * 0.04, maxR: r * 3.5, gc: validGc, life: 0.70, speed: 0.11, kind: "ring" });
            state.flashes.push({ x, y, r: r * 0.08, maxR: r * 2.2, gc: validGc, life: 0.55, speed: 0.10, kind: "fill" });
            state.flashes.push({ x, y, r: r * 0.15, maxR: r * 1.3, gc: validGc, life: 0.65, speed: 0.09, kind: "fill" });
            state.flashes.push({ x, y, r: 0, maxR: r * 0.9, gc: validGc, life: 0.75, speed: 0.08, kind: "core" });
        }
    });
};

let _idCounter = 0;
const nextId = () => `e_${Date.now()}_${(_idCounter++).toString(36)}_${Math.random().toString(36).slice(2, 5)}`;

export const makeParticle = (x, y, mass, pal, isCore) => ({
    id: nextId(), x, y, vx: 0, vy: 0, fx: 0, fy: 0,
    mass: mass || 1, pal, isCore: !!isCore, body: null, dead: false, heat: 0
});

export const makeSpring = (a, b, restLen, stiff, breakAt) => ({
    a, b, restLen, stiff: stiff || config.SPRING_K,
    breakAt: breakAt || (restLen * config.BREAK_MULT), broken: false
});

/**
 * How many particles makeBody(radius) WILL produce — same grid-fill geometry
 * (spacing, row/col count, the radius+spacing*0.3 cutoff), just counting
 * instead of allocating. Translation-invariant, so no cx/cy needed.
 *
 * TrajectoryPreview uses this to know the REAL nParticles divisor a
 * candidate planet will integrate with (tick.js's applyGravity divides
 * every force by nParticles) — the same single source of truth makeBody
 * itself uses, so the orbit preview and the eventual real body can never
 * silently drift out of formula-sync with each other.
 */
export const estimateParticleCount = (radius) => {
    const spacing = config.PARTICLE_R * 1.82;
    const rows = Math.ceil(radius / spacing) * 2 + 1, cols = rows;
    const ox = -(cols - 1) * spacing * 0.5, oy = -(rows - 1) * spacing * 0.5;
    let n = 0;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const px = ox + col * spacing + (row % 2) * 0.5 * spacing, py = oy + row * spacing;
            if (hypot(px, py) > radius + spacing * 0.3) continue;
            n++;
        }
    }
    return Math.max(1, n);
};export const makeBody = (cx, cy, radius, pal, plane = 0) => {
    const particles = [], springs = [], grid = {};
    const spacing = config.PARTICLE_R * 1.82;
    const rows = Math.ceil(radius / spacing) * 2 + 1, cols = rows;
    const ox = cx - (cols - 1) * spacing * 0.5, oy = cy - (rows - 1) * spacing * 0.5;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const px = ox + col * spacing + (row % 2) * 0.5 * spacing, py = oy + row * spacing;
            const dx = px - cx, dy = py - cy;
            if (hypot(dx, dy) > radius + spacing * 0.3) continue;
            const p = makeParticle(px, py, 1, pal, hypot(dx, dy) < radius * 0.3);
            grid[`${col},${row}`] = particles.length;
            particles.push(p);
        }
    }
    const dirs = [[1, 0], [0, 1], [1, 1], [-1, 1], [2, 0], [0, 2]];
    const seen = new Set();
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const ai = grid[`${col},${row}`];
            if (ai === undefined) continue;
            for (const [dc, dr] of dirs) {
                const bi = grid[`${col + dc},${row + dr}`];
                if (bi === undefined) continue;
                const key = ai < bi ? `${ai}-${bi}` : `${bi}-${ai}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const pa = particles[ai], pb = particles[bi];
                const len = hypot(pb.x - pa.x, pb.y - pa.y);
                const isDirect = len < spacing * 1.2;
                springs.push(makeSpring(ai, bi, len, isDirect ? config.SPRING_K : config.SPRING_K * 0.6,
                    isDirect ? len * config.BREAK_MULT : len * config.BREAK_MULT * 0.8));
            }
        }
    }
    let tm = 0;
    for (const p of particles) {
        p.mass = lerp(2.0, 0.6, hypot(p.x - cx, p.y - cy) / radius);
        p.plane = plane | 0;      // particles inherit the body's plane (loose debris keeps it)
        tm += p.mass;
    }
    // Plane-merge state: brush planets (plane ≠ 0) wait GRACE ticks, then
    // interpolate home to plane 0. mergeSoft eases their first collisions.
    const shineIntensity = 0.3 + Math.random() * 0.7;  // 0.3-1.0 per planet
    const shineCount = Math.floor(3 + shineIntensity * 4);  // 3-7 specular points
    return {
        id: nextId(), particles, springs, pal, cx, cy, mass: tm, radius,
        dead: false, gravMult: 1.0, plane: plane | 0,
        mergeDelay: (plane | 0) !== 0 ? (config.PLANE_MERGE_GRACE | 0) : 0,
        mergeSoft: 0, mergeTries: 0,
        shine: {
            intensity: shineIntensity,
            count: shineCount,
            points: Array.from({ length: shineCount }, () => ({
                angle: Math.random() * Math.PI * 2,
                distance: Math.random() * radius * 0.8,
                brightness: 0.4 + Math.random() * 0.6
            }))
        }
    };
};

export const spawnRing = (body) => {
    const rx = body.cx, ry = body.cy;
    const dist = hypot(rx - SUN.x, ry - SUN.y) || 1;
    const ringW = body.radius * 0.6;
    // SAFETY: Ensure body.pal.gc exists
    const gc = (body.pal && body.pal.gc) ? body.pal.gc : '255,255,255';    addFlash(rx, ry, body.radius * 4, gc);
    addNova(rx, ry, body.radius * 3, gc);
    // Queue ring particles through QueOps — metered at 30/frame so a big
    // ring spawn doesn't spike a single frame. With the accumulator trail
    // system, deferred particles smear in visually rather than popping.
    for (let i = 0; i < RING_PARTICLES; i++) {
        const angle = (Math.PI * 2 / RING_PARTICLES) * i + rndR(-0.05, 0.05);
        const r     = dist + rndR(-ringW, ringW);
        const gmLocal = config.GRAV_CONST * SUN.mass * (body.gravMult || 1.0);
        const vLocal  = Math.sqrt(gmLocal / Math.max(r, 1));
        const scatter = rndR(0.96, 1.04);
        const pal     = body.pal;
        const gMult   = body.gravMult || 1.0;
        QueOps.add({
            subject:  'particles',
            priority: 2,
            cost:     1,
            fn: () => {
                if (state.loose.length >= 300) return;
                const px = SUN.x + Math.cos(angle) * r;
                const py = SUN.y + Math.sin(angle) * r;
                state.loose.push({
                    id: nextId(), x: px, y: py,
                    vx: -Math.sin(angle) * vLocal * scatter,
                    vy:  Math.cos(angle) * vLocal * scatter,
                    mass: rndR(0.4, 1.2), pal, heat: rndR(0.3, 0.8),
                    life: rndR(4, 8), decay: rndR(0.003, 0.006),
                    isRing: true, isBurnt: false, burnedAt: 0,
                    meltRate: rndR(0.003, 0.008), detachSpeed: rndR(8, 16),
                    birthTime: performance.now()
                });
            }
        });
    }
};

export const splitDeadParticles = (body) => {
    const { particles: ps, springs: ss } = body;
    const n = ps.length; if (!n) return;
    const adj = Array.from({ length: n }, () => []);
    for (const sp of ss) {
        if (!sp.broken && !ps[sp.a].dead && !ps[sp.b].dead) {
            adj[sp.a].push(sp.b); adj[sp.b].push(sp.a);
        }
    }
    const vis = new Uint8Array(n);
    let seed = -1;
    for (let i = 0; i < n; i++) { if (!ps[i].dead) { seed = i; break; } }
    if (seed === -1) return;
    const q = [seed]; vis[seed] = 1;
    while (q.length) {
        const c = q.shift();
        for (const nb of adj[c]) { if (!vis[nb]) { vis[nb] = 1; q.push(nb); } }
    }
    let alive = 0, debrisCount = 0;
    const MAX_DEBRIS = 5;
    for (let i = 0; i < n; i++) {
        const p = ps[i];
        if (p.dead) continue;
        if (!vis[i]) {
            if (debrisCount < MAX_DEBRIS && state.loose.length < 280) {
                const _p = p;
                QueOps.add({
                    subject: 'particles', priority: 2, cost: 1,
                    fn: () => {
                        if (state.loose.length >= 280) return;
                        state.loose.push({
                            id: nextId(), x: _p.x, y: _p.y, vx: _p.vx, vy: _p.vy,
                            mass: _p.mass, pal: _p.pal, heat: _p.heat, life: 1,
                            plane: _p.plane | 0,
                            decay: rndR(0.004, 0.008), isBurnt: false, burnedAt: 0,
                            meltRate: rndR(0.003, 0.008), detachSpeed: rndR(8, 16),
                            birthTime: performance.now()
                        });
                    }
                });
                debrisCount++;
            }
            p.dead = true;
        } else { alive++; }
    }
    if (alive < Math.max(3, n * 0.08)) {
        const remaining = n - debrisCount;
        if (remaining > 0 && state.loose.length < 295) {
            const burst = Math.min(MAX_DEBRIS - debrisCount, remaining);
            for (let i = 0; i < burst; i++) {
                const _pi = ps[i];
                QueOps.add({
                    subject: 'particles', priority: 3, cost: 1,
                    fn: () => {
                        if (state.loose.length >= 295) return;
                        state.loose.push({
                            id: nextId(), x: _pi.x, y: _pi.y, vx: _pi.vx, vy: _pi.vy,
                            mass: _pi.mass, pal: _pi.pal, heat: 1, life: 0.6,
                            decay: rndR(0.005, 0.01), isBurnt: false, burnedAt: 0,
                            meltRate: rndR(0.005, 0.012), detachSpeed: rndR(12, 22),
                            birthTime: performance.now()
                        });
                    }
                });
            }
        }
        if (body.radius >= RING_MIN_RADIUS) spawnRing(body);
        body.dead = true;
    }
};