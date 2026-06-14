/**
 * js/modules/rendering/tween-renderer.js
 * The "Projector" - Interpolates between cached physics states.
 *
 * FIX (2026-06-14):
 * - Loose particles now matched by ID instead of array index
 * - Prevents crash when tickLoose() hard-caps and shifts array indices
 * - Added stateB loose particle Map for O(1) ID lookup
 */
export const TweenRenderer = {
  lerp: (a, b, t) => a + (b - a) * t,
  _originals: { bodies: [], loose: [] },
  _bodyMap: new Map(),
  _looseMap: new Map(),

  // Build lookup maps for O(1) access
  _buildMaps(bodies, loose) {
    this._bodyMap.clear();
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.id != null) this._bodyMap.set(b.id, b);
    }
    this._looseMap.clear();
    for (let i = 0; i < loose.length; i++) {
      const p = loose[i];
      if (p.id != null) this._looseMap.set(p.id, p);
    }
  },

  // 1. OVERWRITE live objects with tweened visual positions
  applyTween(bodies, loose, interpolationData) {
    if (!interpolationData || interpolationData.alpha <= 0.001) return;
    const { stateA, stateB, alpha } = interpolationData;

    this._buildMaps(bodies, loose);
    this._originals.bodies = [];
    this._originals.loose = [];

    const lerp = this.lerp;

    // --- Bodies: match by ID (already correct) ---
    for (let i = 0; i < stateA.bodies.length; i++) {
      const a = stateA.bodies[i];
      const b = stateB.bodies[i];
      if (!b || a.dead) continue;

      const liveBody = this._bodyMap.get(a.id);
      if (!liveBody) continue;

      // Save true physics state
      this._originals.bodies.push({
        body: liveBody,
        cx: liveBody.cx,
        cy: liveBody.cy,
        rotation: liveBody.rotation || 0
      });

      // Apply tweened visual state
      liveBody.cx = lerp(a.cx, b.cx, alpha);
      liveBody.cy = lerp(a.cy, b.cy, alpha);
      liveBody.rotation = lerp(a.rotation, b.rotation, alpha);
    }

    // --- Loose particles: match by ID (FIXED) ---
    // Build lookup map for stateB loose particles
    const stateBLooseMap = new Map();
    for (let i = 0; i < stateB.loose.length; i++) {
      const p = stateB.loose[i];
      if (p.id != null) stateBLooseMap.set(p.id, p);
    }

    for (let i = 0; i < stateA.loose.length; i++) {
      const a = stateA.loose[i];

      const liveParticle = this._looseMap.get(a.id);
      if (!liveParticle) continue;

      // FIX: Match stateB particle by ID, not by array index
      const b = stateBLooseMap.get(a.id);
      if (!b) continue;

      this._originals.loose.push({
        particle: liveParticle,
        x: liveParticle.x,
        y: liveParticle.y
      });

      liveParticle.x = lerp(a.x, b.x, alpha);
      liveParticle.y = lerp(a.y, b.y, alpha);
    }
  },

  // 2. REVERT live objects back to true physics state after drawing
  revertTween() {
    for (let i = 0; i < this._originals.bodies.length; i++) {
      const orig = this._originals.bodies[i];
      orig.body.cx = orig.cx;
      orig.body.cy = orig.cy;
      orig.body.rotation = orig.rotation;
    }
    for (let i = 0; i < this._originals.loose.length; i++) {
      const orig = this._originals.loose[i];
      orig.particle.x = orig.x;
      orig.particle.y = orig.y;
    }
    this._originals.bodies = [];
    this._originals.loose = [];
  }
};
