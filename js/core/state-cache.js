/**
 * js/core/state-cache.js
 * The "Vault" — Stores physics snapshots for smooth interpolation.
 * 
 * UPDATE (2026-06-14):
 * - maxSize is now dynamically linked to CONFIG.physics.VAULT_SIZE
 * - clear() now also resets isReady to false for clean session restarts
 */
import { CONFIG } from '../Config/config-index.js';

export const StateCache = {
    buffer: [],
    isReady: false,
    
    // Dynamically get maxSize from the active config profile
    get maxSize() {
        return CONFIG.physics.VAULT_SIZE;
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

    clear() {
        this.buffer = [];
        this.isReady = false; // Crucial for triggering pre-calculation on a fresh start
    }
};