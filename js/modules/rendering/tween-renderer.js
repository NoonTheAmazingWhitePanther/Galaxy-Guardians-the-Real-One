/**
 * js/modules/rendering/tween-renderer.js
 * The "Projector" - Interpolates between cached physics states.
 * CORRECTED: Splits apply and revert so drawing happens at the tweened positions.
 */
export const TweenRenderer = {
    lerp: (a, b, t) => a + (b - a) * t,
    _originals: { bodies: [], loose: [] }, // Stores true physics state temporarily

    // 1. OVERWRITE live objects with tweened visual positions
    applyTween(bodies, loose, interpolationData) {
        if (!interpolationData) return;
        const { stateA, stateB, alpha } = interpolationData;

        this._originals.bodies = [];
        for (let i = 0; i < stateA.bodies.length; i++) {
            const a = stateA.bodies[i];
            const b = stateB.bodies[i];
            if (!b || a.dead) continue;

            const liveBody = bodies.find(lb => lb.id === a.id);
            if (!liveBody) continue;

            // Save true physics state
            this._originals.bodies.push({
                body: liveBody, cx: liveBody.cx, cy: liveBody.cy, rotation: liveBody.rotation || 0
            });

            // Apply tweened visual state
            liveBody.cx = this.lerp(a.cx, b.cx, alpha);
            liveBody.cy = this.lerp(a.cy, b.cy, alpha);
            liveBody.rotation = this.lerp(a.rotation, b.rotation, alpha);
        }

        this._originals.loose = [];
        for (let i = 0; i < stateA.loose.length; i++) {
            const a = stateA.loose[i];
            const b = stateB.loose[i];
            if (!b) continue;

            const liveParticle = loose.find(lp => lp.id === a.id);
            if (!liveParticle) continue;

            this._originals.loose.push({
                particle: liveParticle, x: liveParticle.x, y: liveParticle.y
            });

            liveParticle.x = this.lerp(a.x, b.x, alpha);
            liveParticle.y = this.lerp(a.y, b.y, alpha);
        }
    },

    // 2. REVERT live objects back to true physics state after drawing
    revertTween() {
        for (const orig of this._originals.bodies) {
            orig.body.cx = orig.cx;
            orig.body.cy = orig.cy;
            orig.body.rotation = orig.rotation;
        }
        for (const orig of this._originals.loose) {
            orig.particle.x = orig.x;
            orig.particle.y = orig.y;
        }
        this._originals.bodies = [];
        this._originals.loose = [];
    }
};