/**
 * js/core/state-cache.js
 * The "Vault" — Stores physics snapshots for smooth interpolation.
 * 
 * UPDATE (2026-06-14):
 * - maxSize is now dynamically linked to CONFIG.physics.VAULT_SIZE
 * - clear() now also resets isReady to false for clean session restarts
 */
import { CONFIG } from '../config/config-index.js';
import { TrailGov } from '../modules/debug/governor.js';

export const StateCache = {
    buffer: [],
    isReady: false,
    
    // Vault size = max of the interpolation vault and the trail's keyframe need,
    // but capped at 130 so a high Max Trails can't balloon per-tick snapshot
    // memory (each snapshot also stores loose particles). The trail's Density
    // knob interpolates BETWEEN these keyframes, so length/smoothness beyond the
    // stored keyframes comes for free without more memory.
    get maxSize() {
        return Math.max(CONFIG.physics.VAULT_SIZE, Math.min(130, TrailGov.maxTrails + 2));
    },

    /** Helper: return value if finite, else fallback */
    _f(v, fallback = 0) {
        return Number.isFinite(v) ? v : fallback;
    },

    captureSnapshot(bodies, loose) {
        if (bodies.length === 0 && loose.length === 0) {
            return { bodies: [], loose: [] };
        }

        // --- Bodies: skip dead, NaN-proof all properties ---
        const snapshotBodies = [];
        for (let i = 0; i < bodies.length; i++) {
            const b = bodies[i];
            if (b.dead) continue;
            snapshotBodies.push({
                id: (b.id != null) ? b.id : `b_${i}`,
                cx: this._f(b.cx, 0),
                cy: this._f(b.cy, 0),
                vx: this._f(b.vx, 0),
                vy: this._f(b.vy, 0),
                radius: this._f(b.radius, 10),
                rotation: this._f(b.rotation, 0),
                pal: b.pal,
                dead: false
            });
        }

        // --- Loose: dedupe by ID, NaN-proof all properties ---
        const seenIds = new Set();
        const snapshotLoose = [];
        for (let i = 0; i < loose.length; i++) {
            const p = loose[i];
            if (!p) continue;
            const id = (p.id != null) ? p.id : `l_${i}`;
            if (seenIds.has(id)) continue;
            seenIds.add(id);

            snapshotLoose.push({
                id: id,
                x: this._f(p.x, 0),
                y: this._f(p.y, 0),
                vx: this._f(p.vx, 0),
                vy: this._f(p.vy, 0),
                life: this._f(p.life, 0),
                maxLife: this._f(p.maxLife, p.life),
                r: this._f(p.r, 0),
                pal: p.pal
            });
        }

        return { bodies: snapshotBodies, loose: snapshotLoose };
    },

    push(snapshot) {
        this.buffer.push(snapshot);
        // Use the dynamic getter for maxSize
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift();
        }
    },

    getInterpolationData(alpha) {
        if (this.buffer.length < 2) return null;
        const len = this.buffer.length;
        return {
            stateA: this.buffer[len - 2],
            stateB: this.buffer[len - 1],
            alpha: alpha
        };
    },

    // Body snapshots for the intermediate ticks that ran since the last draw,
    // oldest→newest, EXCLUDING the very latest (that one is already shown at
    // its interpolated position by the tween). Used to stamp a continuous
    // motion trail when many ticks pass between two rendered frames. Returns
    // an array of body-arrays (each = one past tick's bodies).
    getRecentBodies(n) {
        const len = this.buffer.length;
        if (len < 2 || n < 1) return [];
        const count = Math.min(n, len - 1);
        const out = [];
        for (let i = len - 1 - count; i < len - 1; i++) {
            out.push(this.buffer[i].bodies);
        }
        return out;
    },

    clear() {
        this.buffer = [];
        this.isReady = false; // Crucial for triggering pre-calculation on a fresh start
    },

    get debugInfo() {
        const used = this.buffer.length;
        const max  = this.maxSize;
        return {
            ready:  this.isReady,
            used,
            max,
            fill:   max > 0 ? ((used / max) * 100).toFixed(0) + '%' : '0%',
            bodies: used > 0 ? (this.buffer[used - 1]?.bodies?.length ?? 0) : 0,
            loose:  used > 0 ? (this.buffer[used - 1]?.loose?.length  ?? 0) : 0,
        };
    }
};