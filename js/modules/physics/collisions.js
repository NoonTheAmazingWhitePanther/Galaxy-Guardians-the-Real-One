/**
 * js/modules/physics/collisions.js
 * Prime Module: Spatial hashing and collision resolution.
 *
 * FIX (2026-06-14):
 * - Added null/undefined guards on particle access from cell arrays
 * - Added mass validation before division
 * - Added NaN guard on collision impulse
 */
import { hypot, clamp, rnd, rndR } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state } from '../../core/state.js';
import { PhysicsCounter } from '../debug/physics-counter.js';

// Persistent objects to avoid GC pressure
const _grid = new Map();
const _cellPool = [];
const _cellPoolSize = 256;

// Pre-allocate cell pool
for (let i = 0; i < _cellPoolSize; i++) {
  _cellPool.push([]);
}

export const interBodyCollisions = () => {
  const bodies = state.bodies;
  const numBodies = bodies.length;
  if (numBodies < 2) return;

  const collisionR = config.COLLISION_R;
  const cellSize = collisionR * 2;
  const invCellSize = 1 / cellSize;
  const collisionRSq = collisionR * collisionR;

  for (let bi = 0; bi < numBodies; bi++) {
    const A = bodies[bi];
    for (let bj = bi + 1; bj < numBodies; bj++) {
      const B = bodies[bj];
      const cdx = A.cx - B.cx, cdy = A.cy - B.cy;
      const cd2 = cdx * cdx + cdy * cdy;
      const thresh = A.radius + B.radius + collisionR * 4;
      if (cd2 > thresh * thresh) continue;

      // Clear persistent grid
      _grid.clear();
      let poolIdx = 0;

      const addParticle = (p, tag) => {
        const gx = (p.x * invCellSize) | 0;
        const gy = (p.y * invCellSize) | 0;
        // Better hash: mix bits to reduce collisions
        const key = ((gx * 73856093) ^ (gy * 19349663)) | 0;

        let cell = _grid.get(key);
        if (!cell) {
          cell = _cellPool[poolIdx++];
          if (!cell) {
            cell = [];
            _cellPool.push(cell);
          }
          cell.length = 0;
          _grid.set(key, cell);
        }
        cell.push(p, tag);
      };

      const aParticles = A.particles;
      for (let i = 0; i < aParticles.length; i++) {
        const p = aParticles[i];
        if (!p.dead) addParticle(p, 0);
      }

      const bParticles = B.particles;
      for (let i = 0; i < bParticles.length; i++) {
        const p = bParticles[i];
        if (!p.dead) addParticle(p, 1);
      }

      for (const cell of _grid.values()) {
        const len = cell.length;
        if (len < 4) continue;

        for (let i = 0; i < len; i += 2) {
          const pa = cell[i];
          // FIX: Guard against undefined entries in cell
          if (!pa || cell[i + 1] !== 0) continue;

          for (let j = 0; j < len; j += 2) {
            if (cell[j + 1] !== 1) continue;
            const pb = cell[j];
            // FIX: Guard against undefined entries
            if (!pb) continue;

            const dx = pb.x - pa.x, dy = pb.y - pa.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= collisionRSq) continue;

            const d = Math.sqrt(d2) || 0.001;
            const nx = dx / d, ny = dy / d;
            const ov = collisionR - d;
            const ma = pa.mass, mb = pb.mass;
            const mt = ma + mb;

            // FIX: Guard against zero total mass
            if (mt <= 0 || !Number.isFinite(mt)) continue;

            pa.x -= nx * ov * (mb / mt); pa.y -= ny * ov * (mb / mt);
            pb.x += nx * ov * (ma / mt); pb.y += ny * ov * (ma / mt);

            const vn = (pa.vx - pb.vx) * nx + (pa.vy - pb.vy) * ny;
            if (vn < 0) {
              const denom = (1 / ma + 1 / mb);
              // FIX: Guard against division by zero in impulse
              if (denom <= 0 || !Number.isFinite(denom)) continue;
              const jVal = -(1.35) * vn / denom;
              PhysicsCounter.add('collisionsResolved');
              pa.vx += jVal * nx / ma; pa.vy += jVal * ny / ma;
              pb.vx -= jVal * nx / mb; pb.vy -= jVal * ny / mb;
              const h = Math.min(0.4, Math.abs(vn) * 0.12);
              pa.heat = clamp(pa.heat + h, 0, 1);
              pb.heat = clamp(pb.heat + h, 0, 1);
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
  const looseLen = looseArr.length;
  const step = looseLen > MAX_CHECKS ? Math.floor(looseLen / MAX_CHECKS) : 1;
  const looseHitR = config.LOOSE_HIT_R;
  const looseHitR15 = looseHitR * 1.5;
  const looseHitR25 = looseHitR * 2.5;

  for (let li = looseLen - 1; li >= 0; li -= step) {
    const lp = looseArr[li];
    if (!lp || lp.life <= 0.1) continue;

    const bodies = state.bodies;
    for (let bi = 0; bi < bodies.length; bi++) {
      const body = bodies[bi];
      const bdx = body.cx - lp.x, bdy = body.cy - lp.y;
      const bd2 = bdx * bdx + bdy * bdy;
      const thresh = body.radius + looseHitR25;
      if (bd2 > thresh * thresh) continue;

      let nearP = null, nearD2 = Infinity;
      const bpArr = body.particles;
      for (let pi = 0; pi < bpArr.length; pi++) {
        const bp = bpArr[pi];
        if (!bp || bp.dead) continue;
        const d2 = (bp.x - lp.x) ** 2 + (bp.y - lp.y) ** 2;
        if (d2 < nearD2) { nearD2 = d2; nearP = bp; }
      }

      if (!nearP) continue;
      const nearD = Math.sqrt(nearD2);
      if (nearD > looseHitR15) continue;

      const dx = nearP.x - lp.x, dy = nearP.y - lp.y;
      const d = hypot(dx, dy) || 0.001;
      const nx = dx / d, ny = dy / d;
      const vn = (lp.vx - nearP.vx) * nx + (lp.vy - nearP.vy) * ny;

      if (Math.abs(vn) < 1.5) {
        nearP.vx += lp.vx * lp.mass / nearP.mass * 0.5;
        nearP.vy += lp.vy * lp.mass / nearP.mass * 0.5;
        nearP.heat = Math.min(1, nearP.heat + 0.4);
        lp.life = 0;
        if (lp.heat > 0.4) {
          state.flashes.push({
            x: lp.x, y: lp.y, r: 0.15, maxR: 3, gc: '255,180,80',
            life: 0.6, speed: 0.1, kind: "core"
          });
        }
        break;
      } else if (vn > 0) {
        lp.x -= nx * (looseHitR - nearD) * 0.95;
        lp.y -= ny * (looseHitR - nearD) * 0.95;
        const ma = lp.mass, mb = nearP.mass;
        const denom = (1 / ma + 1 / mb);
        if (denom <= 0 || !Number.isFinite(denom)) continue;
        const j = -(1 + 0.45) * vn / denom;
        PhysicsCounter.add('collisionsResolved');
        lp.vx -= j * nx / ma; lp.vy -= j * ny / ma;
        nearP.vx += j * nx / mb; nearP.vy += j * ny / mb;
        const h = clamp(Math.abs(vn) * 0.12, 0, 1);
        lp.heat = Math.min(1, lp.heat + h);
        nearP.heat = Math.min(1, nearP.heat + h);

        if (Math.abs(vn) > 3 && looseArr.length < 380) {
          for (let k = 0; k < 2; k++) {
            const a = Math.atan2(-ny, -nx) + (rnd() - 0.5) * 1.0;
            const s = rnd() * Math.abs(vn) * 0.25 + 0.2;
            looseArr.push({
              x: lp.x, y: lp.y,
              vx: Math.cos(a) * s, vy: Math.sin(a) * s,
              mass: lp.mass * 0.08, pal: lp.pal,
              heat: 0.9, life: 0.3, decay: 0.06,
              isBurnt: false, burnedAt: 0,
              meltRate: rndR(0.002, 0.006),
              detachSpeed: rndR(6, 12),
              birthTime: performance.now()
            });
          }
        }
        break;
      }
    }
  }
};
