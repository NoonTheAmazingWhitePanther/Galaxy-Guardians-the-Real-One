/**
 * js/core/state-cache.js
 * The "Vault" - Stores pre-calculated physics snapshots for smooth interpolation.
 */
export const StateCache = {
    buffer: [],
    maxSize: 64,      // Keep 64 frames in memory (plenty for smooth playback)
    readIndex: 0,
    writeIndex: 0,
    isReady: false,

    // Capture the exact state of the universe right now
    captureSnapshot(bodies, loose) {
        return {
            bodies: bodies.map(b => ({
                id: b.id || Math.random(), // Fallback ID if none exists
                cx: b.cx, cy: b.cy,
                vx: b.vx, vy: b.vy,
                radius: b.radius,
                rotation: b.rotation || 0,
                pal: b.pal,
                dead: b.dead
            })),
            loose: loose.map(p => ({
                id: p.id || Math.random(),
                x: p.x, y: p.y,
                vx: p.vx, vy: p.vy,
                life: p.life,
                maxLife: p.maxLife,
                r: p.r,
                pal: p.pal
            }))
        };
    },

    push(snapshot) {
        if (this.buffer.length < this.maxSize) {
            this.buffer.push(snapshot);
        } else {
            this.buffer[this.writeIndex % this.maxSize] = snapshot;
        }
        this.writeIndex++;
    },

    getInterpolationData(alpha) {
        if (this.buffer.length < 2) return null;
        const idxA = this.readIndex % this.buffer.length;
        const idxB = (this.readIndex + 1) % this.buffer.length;
        return { stateA: this.buffer[idxA], stateB: this.buffer[idxB], alpha: alpha };
    },

    advanceReadHead() {
        this.readIndex++;
    },
    
    clear() {
        this.buffer = [];
        this.readIndex = 0;
        this.writeIndex = 0;
        this.isReady = false;
    }
};