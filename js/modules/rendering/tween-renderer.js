/**
 * js/modules/rendering/tween-renderer.js
 * The "Projector" - Interpolates between cached physics states.
 *
 * FIX (2026-06-14):
 * - Loose particles matched by ID via stateBLooseMap (not blind index)
 * - NaN-proof lerp: if any input is NaN, skip the tween for that object
 * - This prevents NaN from poisoning live state and causing DOMException
 *   in createRadialGradient during drawBody()
 */
export const TweenRenderer = {
  lerp: (a, b, t) => a + (b - a) * t,
  _originals: { bodies: [], loose: [] },
  _bodyMap: new Map(),
  _looseMap: new Map(),

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

  /**
   * NaN-safe lerp: returns null if any input is not finite.
   * The caller must check for null and skip the tween.
   */
  _safeLerp(a, b, t) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(t)) return null;
    return a + (b - a) * t;
  },

  applyTween(bodies, loose, interpolationData) {
    if (!interpolationData || interpolationData.alpha <= 0.001) return;
    const { stateA, stateB, alpha } = interpolationData;

    this._buildMaps(bodies, loose);
    this._originals.bodies = [];
    this._originals.loose = [];

    // --- Bodies: match by ID, NaN-safe lerp ---
    for (let i = 0; i < stateA.bodies.length; i++) {
      const a = stateA.bodies[i];
      const b = stateB.bodies[i];
      if (!b || a.dead) continue;

      const liveBody = this._bodyMap.get(a.id);
      if (!liveBody) continue;

      const cx = this._safeLerp(a.cx, b.cx, alpha);
      const cy = this._safeLerp(a.cy, b.cy, alpha);
      const rot = this._safeLerp(a.rotation, b.rotation, alpha);
      if (cx === null || cy === null || rot === null) continue; // NaN guard

      this._originals.bodies.push({
        body: liveBody,
        cx: liveBody.cx,
        cy: liveBody.cy,
        rotation: liveBody.rotation || 0
      });

      liveBody.cx = cx;
      liveBody.cy = cy;
      liveBody.rotation = rot;
    }

    // --- Loose particles: match by ID via stateBLooseMap, NaN-safe lerp ---
    const stateBLooseMap = new Map();
    for (let i = 0; i < stateB.loose.length; i++) {
      const p = stateB.loose[i];
      if (p.id != null) stateBLooseMap.set(p.id, p);
    }

    for (let i = 0; i < stateA.loose.length; i++) {
      const a = stateA.loose[i];
      const liveParticle = this._looseMap.get(a.id);
      if (!liveParticle) continue;

      const b = stateBLooseMap.get(a.id);
      if (!b) continue;

      const x = this._safeLerp(a.x, b.x, alpha);
      const y = this._safeLerp(a.y, b.y, alpha);
      if (x === null || y === null) continue; // NaN guard

      this._originals.loose.push({
        particle: liveParticle,
        x: liveParticle.x,
        y: liveParticle.y
      });

      liveParticle.x = x;
      liveParticle.y = y;
    }
  },

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
