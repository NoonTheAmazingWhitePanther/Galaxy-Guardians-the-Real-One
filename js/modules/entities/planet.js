// js/modules/entities/planet.js

import { state, SUN, sunGravMult, PALS } from '../../core/state.js';
import { config } from '../../core/config.js';
import { hypot, clamp } from '../../core/math.js';
import { makeBody } from '../physics/creation.js';
//import { PALS } from '../../core/palettes.js';


export class Planet {

    static spawn(x, y, size, pcountEl) {

        // Hard guard: invalid coords or size → bail safely
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size)) {
            console.warn("Planet.spawn: invalid args", { x, y, size });
            return Planet.fallbackBody(x || 0, y || 0, 40);
        }

        if (state.bodies.length >= 8) return;

        const radius = clamp(size * 8, 16, 110);
        //const pal = Planet.randomPalette();
        const pal = PALS[Math.floor(Math.random() * PALS.length)];


        let body;

        // Try to build a real soft‑body planet
        try {
            body = makeBody(x, y, radius, pal);
        } catch (err) {
            console.error("makeBody failed, using fallback:", err);
            body = Planet.fallbackBody(x, y, radius, pal);
        }

        // Validate body structure
        if (!body || !Array.isArray(body.particles) || body.particles.length === 0) {
            console.error("Planet.spawn: makeBody returned invalid body, using fallback");
            body = Planet.fallbackBody(x, y, radius, pal);
        }

        // Gravity multiplier
        body.gravMult = sunGravMult;

        // Orbital velocity (safe)
        const dist = hypot(x - SUN.x, y - SUN.y) || 1;
        const nP = Math.max(body.particles.length, 1);

        const v = Math.sqrt(
            config.GRAV_CONST *
            SUN.mass *
            sunGravMult /
            nP /
            dist
        );

        const vx = Number.isFinite(-(y - SUN.y) / dist * v) ? (-(y - SUN.y) / dist * v) : 0;
        const vy = Number.isFinite((x - SUN.x) / dist * v) ? ((x - SUN.x) / dist * v) : 0;

        for (const p of body.particles) {
            p.vx = vx;
            p.vy = vy;
        }

        // Final safety clamps
        body.cx = Number.isFinite(body.cx) ? body.cx : x;
        body.cy = Number.isFinite(body.cy) ? body.cy : y;
        body.radius = Number.isFinite(body.radius) ? body.radius : radius;

        body.id = crypto.randomUUID();

        state.bodies.push(body);

        if (pcountEl) {
            pcountEl.textContent = state.bodies.length;
        }

        return body;
    }

    // Guaranteed non‑crashing fallback planet
    static fallbackBody(x, y, radius, pal = { gc: "255,255,255" }) {
        return {
            cx: x,
            cy: y,
            radius,
            mass: 1,
            gravMult: sunGravMult,
            pal,
            particles: [{
                x,
                y,
                vx: 0,
                vy: 0,
                dead: false
            }],
            springs: [],
            dead: false
        };
    }

    static randomPalette() {
        const r = 80 + Math.random() * 150;
        const g = 80 + Math.random() * 150;
        const b = 80 + Math.random() * 150;

        return {
            hi: `rgb(${r},${g},${b})`,
            mid: `rgb(${r * 0.8},${g * 0.8},${b * 0.8})`,
            lo: `rgb(${r * 0.5},${g * 0.5},${b * 0.5})`,
            gc: `${r|0},${g|0},${b|0}`
        };
    }
}
