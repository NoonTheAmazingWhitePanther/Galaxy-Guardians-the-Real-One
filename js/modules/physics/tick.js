/**
 * js/modules/physics/tick.js
 * Prime Module: Main physics tick orchestrator, integration, and gravity.
 *
 * FIX (2026-06-14):
 * - Added NaN/Infinity guards in updateCOM to prevent corrupt body state
 * - Added defensive check in splitDeadParticles for out-of-bounds spring indices
 * - Added null-check before accessing particle properties in collision resolution
 */
import { hypot } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state, SUN, sunGravMult } from '../../core/state.js';
import { interBodyCollisions, looseVsPlanets } from './collisions.js';
import { splitDeadParticles } from './creation.js';
import { PhysicsCounter } from '../debug/physics-counter.js';
import { QueOps } from '../../core/que-ops.js';
import { GravityField } from './gravity-field.js';
import { MsProbe } from '../../core/ms-probe.js';
import { BurnMap } from '../../core/burn-map.js';
import { TweenGovernor } from '../../core/tween-governor.js';
import { BurningParticles } from '../../core/burning-particles.js';
import { BurningSystem } from '../../core/burning-system.js';
import { Dormancy } from '../../core/dormancy.js';

export const updateCOM = (body) => {
  let sx = 0, sy = 0, sm = 0;
  const particles = body.particles;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.dead) continue;
    sx += p.x * p.mass;
    sy += p.y * p.mass;
    sm += p.mass;
  }
  if (sm > 0) {
    const newCx = sx / sm;
    const newCy = sy / sm;
    // FIX: Guard against NaN/Infinity
    if (Number.isFinite(newCx) && Number.isFinite(newCy)) {
      body.cx = newCx;
      body.cy = newCy;
      body.mass = sm;
    }
  }
  // If sm === 0, keep previous cx/cy (body will be marked dead in splitDeadParticles)
};

export const integrateParticle = (p, dt, damping) => {
  if (p.dead) return;
  p.vx = (p.vx + (p.fx / p.mass) * dt) * damping;
  p.vy = (p.vy + (p.fy / p.mass) * dt) * damping;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.fx = 0;
  p.fy = 0;
};

export const solveSprings = (body, dt) => {
  const ps = body.particles;
  const ss = body.springs;
  for (let i = 0; i < ss.length; i++) {
    const sp = ss[i];
    if (sp.broken) continue;
    PhysicsCounter.add('springsSolved');
    // FIX: Guard against out-of-bounds indices
    if (sp.a < 0 || sp.a >= ps.length || sp.b < 0 || sp.b >= ps.length) {
      sp.broken = true;
      continue;
    }
    const pa = ps[sp.a], pb = ps[sp.b];
    if (!pa || !pb || pa.dead || pb.dead) { sp.broken = true; continue; }
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const len = hypot(dx, dy) || 0.001;
    if (len > sp.breakAt) { sp.broken = true; continue; }
    const f = sp.stiff * (len - sp.restLen);
    const nx = dx / len, ny = dy / len;
    const tm = pa.mass + pb.mass;
    const fdt = f * dt;
    pa.vx += nx * fdt * (pb.mass / tm);
    pa.vy += ny * fdt * (pb.mass / tm);
    pb.vx -= nx * fdt * (pa.mass / tm);
    pb.vy -= ny * fdt * (pa.mass / tm);
  }
};

const _gfOut = { x: 0, y: 0 };   // scratch for GravityField.sampleInto (no alloc)

export const applyGravity = (p, nParticles, gravConst, sunMass, sunX, sunY, bodies, sunGrav) => {
  // ── ONE for the Sun: always analytic, always exact ──
  const gm = (p.body && p.body.gravMult != null) ? p.body.gravMult : sunGrav;
  const sdx = sunX - p.x, sdy = sunY - p.y;
  const sd2 = sdx * sdx + sdy * sdy;
  const sd = Math.sqrt(sd2) + 0.1;
  const sf = (gravConst * sunMass * gm / (sd2 + 500)) / nParticles;
  p.fx += (sdx / sd) * sf * p.mass;
  p.fy += (sdy / sd) * sf * p.mass;

  // ── MANY for the planets: grid far field + live near ring ──
  // Ghost stepping (FutureCache) and warmup fall through to the legacy loop
  // so predictions never learn from a stale field.
  if (GravityField.active && GravityField.sampleInto(p.x, p.y, _gfOut)) {
    const scale = p.mass / nParticles;
    p.fx += _gfOut.x * scale;
    p.fy += _gfOut.y * scale;

    // Near correction: exact per-body forces for the scan ring, MINUS the
    // blended aggregate shares the field sample just delivered for those same
    // cells (identical corner math) — de-aliases interpolation + COM error
    // exactly where they are largest. Self-skip handled inside.
    const nearChecks = GravityField.gatherNear(p.x, p.y, p.body, _gfOut);
    p.fx += _gfOut.x * scale;
    p.fy += _gfOut.y * scale;

    // Truthful counters: 1 field sample + only the near-ring body evals.
    PhysicsCounter.add('gravityGridSamples');
    if (nearChecks) PhysicsCounter.add('gravityChecks', nearChecks);
    return;
  }

  // ── LEGACY direct loop (grid off · ghost mode · warmup · outside the box) ──
  // Distance cull: skip bodies whose gravity contribution < threshold
  let checks = 0;
  for (let bi = 0; bi < bodies.length; bi++) {
    const b = bodies[bi];
    if (p.body === b) continue;
    const dx = b.cx - p.x, dy = b.cy - p.y;
    const d2 = dx * dx + dy * dy;
    // Skip if force would be negligible (b.mass / d2 < 0.0001)
    if (d2 > b.mass * 10000) continue;
    checks++;
    const d = Math.sqrt(d2) + 0.1;
    const f = (gravConst * b.mass / (d2 + 300)) / nParticles;
    p.fx += (dx / d) * f * p.mass;
    p.fy += (dy / d) * f * p.mass;
  }
  if (checks) PhysicsCounter.add('gravityChecks', checks);
};

export const tickLoose = (dt) => {
  const _probe = !GravityField.ghostMode;
  const _t0 = _probe ? performance.now() : 0;
  const gravConst = config.GRAV_CONST;
  const sunMass = SUN.mass;
  const sunX = SUN.x;
  const sunY = SUN.y;
  const sunBurnR = SUN.burnRadius;
  const sunGrav = sunGravMult;
  const bodies = state.bodies;

  // Fuse filter into single pass: mark dead, collect survivors
  const survivors = [];
  const looseArr = state.loose;
  const maxSurvivors = 350;
  const hardCap = looseArr.length > 400;

  // Update burn map before particle loop
  BurnMap.update(SUN, state.novas || [], state.supernovas || []);

  for (let li = looseArr.length - 1; li >= 0; li--) {
    const lp = looseArr[li];
    if (lp.life <= 0.02) continue;
    PhysicsCounter.add('looseTicked');
    if (hardCap && survivors.length >= maxSurvivors) break;

    // Query burn map instead of distance checks
    const mapHeat = BurnMap.queryHeat(lp.x, lp.y);
    const inBurnZone = mapHeat > 0.1;
    const inCritical = mapHeat > 0.8;

    if (!lp.isBurnt && lp.heat > 0.7 && !inBurnZone) {
      lp.isBurnt = true;
      lp.burnedAt = performance.now();
    }
    if (inCritical) continue;

    if (lp.isBurnt && inBurnZone) {
      lp.life -= lp.meltRate * dt * 2.5;
      // Repel away from sun (approximate direction from map)
      const sdx = sunX - lp.x, sdy = sunY - lp.y;
      const sd = Math.hypot(sdx, sdy) + 0.1;
      const escapeFactor = lp.detachSpeed / 15;
      lp.vx += (sdx / sd) * escapeFactor * 0.3 * dt;
      lp.vy += (sdy / sd) * escapeFactor * 0.3 * dt;
    } else if (lp.heat > 0.7) {
      lp.life -= (lp.decay + 0.012) * dt;
    } else if (lp.isBurnt) {
      lp.life -= lp.decay * dt;
    } else {
      lp.life -= lp.isRing ? lp.decay * dt : (lp.decay + 0.008) * dt;
    }

    // Cheap random repulsion for burnt particles
    if (lp.isBurnt) {
      lp.vx += (Math.random() - 0.5) * 0.1 * dt;
      lp.vy += (Math.random() - 0.5) * 0.1 * dt;
    }

    if (inCritical) continue;

    // Sun gravity (kept as is, still uses distance)
    const sdx = sunX - lp.x, sdy = sunY - lp.y;
    const sd2 = sdx * sdx + sdy * sdy;
    const sd = Math.sqrt(sd2) + 0.1;
    const sf = gravConst * sunMass * sunGrav / (sd2 + 500) * 0.04;
    lp.vx += sdx / sd * sf * dt;
    lp.vy += sdy / sd * sf * dt;

    // Distance cull for loose particles — skip bodies too far to matter
    for (let bi = 0; bi < bodies.length; bi++) {
      const b = bodies[bi];
      const dx = b.cx - lp.x, dy = b.cy - lp.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > b.mass * 8000) continue; // negligible force
      const d = Math.sqrt(d2) + 0.1;
      const f = gravConst * b.mass * (lp.isRing ? 0.01 : 0.06) / (d2 + 150);
      lp.vx += dx / d * f * dt;
      lp.vy += dy / d * f * dt;
    }

    lp.vx *= 0.995;
    lp.vy *= 0.995;
    lp.x += lp.vx * dt;
    lp.y += lp.vy * dt;

    // Heat accumulation scaled by burn map heat
    const currentHeat = BurnMap.queryHeat(lp.x, lp.y);
    if (lp.isBurnt) {
      lp.heat = currentHeat > 0.1
        ? Math.min(1, lp.heat + (0.015 * currentHeat) * dt)
        : Math.max(0.5, lp.heat - 0.003 * dt);
    } else {
      lp.heat = currentHeat > 0.1
        ? Math.min(1, lp.heat + (0.02 * currentHeat) * dt)
        : Math.max(0, lp.heat - 0.008 * dt);
    }

    survivors.push(lp);
  }
  state.loose = survivors;
  if (_probe) MsProbe.record('physics.tick.loose', performance.now() - _t0);
};

/**
 * PLANE MERGE — bodies born on brush planes (1..N-1) come home to plane 0.
 * Per tick: tick down mergeSoft ramps, tick down mergeDelay counters, and
 * for due bodies check clearance against the prime plane. Clear (or out of
 * patience) → plane 0, particles follow, mergeSoft arms the soft landing.
 * O(offPlane × bodies) and offPlane drains to zero — effectively free.
 */
export const mergePlanes = (bodies) => {
  const n = bodies.length;
  const margin = config.COLLISION_R * 4;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (b.mergeSoft > 0) b.mergeSoft--;              // collision ease ramp
    if ((b.plane | 0) === 0) continue;
    if (b.mergeDelay === undefined) b.mergeDelay = config.PLANE_MERGE_GRACE | 0; // legacy bodies
    if (b.mergeDelay > 0) { b.mergeDelay--; continue; }

    // Clearance vs the prime plane: no plane-0 body inside touch + margin.
    // Bodies merged earlier in this same pass already read as plane 0 here,
    // so two overlapping brush planets never merge on the same tick.
    let clear = true;
    for (let j = 0; j < n; j++) {
      const o = bodies[j];
      if ((o.plane | 0) !== 0) continue;
      const dx = o.cx - b.cx, dy = o.cy - b.cy;
      const need = o.radius + b.radius + margin;
      if (dx * dx + dy * dy < need * need) { clear = false; break; }
    }

    b.mergeTries = (b.mergeTries | 0) + 1;
    if (clear || b.mergeTries >= (config.PLANE_MERGE_FORCE | 0)) {
      b.plane = 0;
      b.mergeSoft = config.PLANE_MERGE_SOFT | 0;     // ease into prime collisions
      const ps = b.particles;
      for (let k = 0; k < ps.length; k++) ps[k].plane = 0;  // future debris is prime too
    } else {
      b.mergeDelay = config.PLANE_MERGE_RETRY | 0;   // ask again later
    }
  }
};

export const tickBodies = (scaledDt) => {
  const dt = scaledDt / config.SUBSTEPS;
  const bodies = state.bodies;
  const numBodies = bodies.length;
  if (numBodies === 0) return;

  // ✅ NEW: Update burning particle physics (real-time sun attraction)
  BurningParticles.updateBurningPhysics(scaledDt);

  // ✅ NEW: Update body heat from BurnMap (continuous heat state)
  for (const body of bodies) {
    if (!body.dead) {
      BurningSystem.updateBodyHeat(body);
      BurningSystem.onBurnStart(body);
    }
  }

  // Phase probes: accumulate raw ms across substeps, commit ONE sample per
  // tick. Live path only — ghost stepping (FutureCache) is measured as a
  // whole by physics.cacheTick; letting ghosts feed these children would make
  // them sum past their physics.tick parent.
  const _probe = !GravityField.ghostMode;
  let _msGrav = 0, _msSpring = 0, _msColl = 0, _t0 = 0;

  const gravConst = config.GRAV_CONST;
  const sunMass = SUN.mass;
  const sunX = SUN.x;
  const sunY = SUN.y;
  const damping = config.DAMPING;
  const sunGrav = sunGravMult;

  // Instant-vaporize boundary: touching the sun's actual visible surface.
  // Gradual heat zone: the full burn radius — now the single source of
  // truth, same value BurnMap uses for body.heat. No more *4 hack; this
  // WAS silently 4x smaller than the visual glow, which is why bodies
  // barely ever heated up despite sitting inside the glow.
  const sunSurfaceR = SUN.radius;
  const burnZoneR = SUN.burnRadius;
  const sunSurfaceSq = sunSurfaceR * sunSurfaceR;
  const burnZoneSq = burnZoneR * burnZoneR;

  const nAlives = new Array(numBodies);

  for (let sub = 0; sub < config.SUBSTEPS; sub++) {
    // ── PHASE 1: Count alive (first substep only) ──
    if (sub === 0) {
      for (let bi = 0; bi < numBodies; bi++) {
        let n = 0;
        const particles = bodies[bi].particles;
        for (let pi = 0; pi < particles.length; pi++) {
          if (!particles[pi].dead) n++;
        }
        nAlives[bi] = n || 1;
      }
    }

    // ── PHASE 2: Fused gravity + integration + burn ──
    if (_probe) _t0 = performance.now();
    for (let bi = 0; bi < numBodies; bi++) {
      const body = bodies[bi];
      
      // OPTIMIZATION: Skip tweening bodies entirely
      if (TweenGovernor.shouldPause(body.id)) continue;

      // Dormancy Stage 2 (off by default — see coastMultiplier's doc):
      // 0 = this body sits out this tick entirely (no force, no motion).
      // >1 = this is its catch-up tick — integrate with coastMult × dt,
      // folding in the ticks it sat out since the last real step. Called
      // exactly once per body per tick, here only — see the "computed
      // once" guarantee in the doc comment on coastMultiplier itself.
      const coastMult = Dormancy.coastMultiplier(body);
      if (coastMult === 0) continue;
      const bodyDt = coastMult === 1 ? dt : dt * coastMult;

      const na = nAlives[bi];
      const particles = body.particles;
      for (let pi = 0; pi < particles.length; pi++) {
        const p = particles[pi];
        if (p.dead) continue;
        PhysicsCounter.add('particlesIntegrated');

        // 1. Gravity
        applyGravity(p, na, gravConst, sunMass, sunX, sunY, bodies, sunGrav);

        // 2. Integration (inlined for speed)
        p.vx = (p.vx + (p.fx / p.mass) * bodyDt) * damping;
        p.vy = (p.vy + (p.fy / p.mass) * bodyDt) * damping;
        p.x += p.vx * bodyDt;
        p.y += p.vy * bodyDt;
        p.fx = 0;
        p.fy = 0;

        // 3. Burn zone
        const dx = sunX - p.x, dy = sunY - p.y;
        const sd2 = dx * dx + dy * dy;
        if (sd2 < sunSurfaceSq) {
          p.dead = true;
          p.heat = 1;
          body._burnDied = true;  // triggers splitDeadParticles below
        } else if (sd2 < burnZoneSq) {
          const dist = Math.sqrt(sd2);
          const proximity = 1 - (dist / burnZoneR);
          // BUG FIX: was capped at min(1, ...) — two lines above a death
          // check of >= 2.0, which made that threshold unreachable. Heat
          // climbed to 1.0 and sat there forever; particles never melted
          // via this path. Cap raised past the new threshold, and the
          // rate is ~3x faster (hurry up): reaches 1.75 in well under a
          // second instead of never.
          p.heat = Math.min(2, p.heat + (0.012 + proximity * 0.0001));
          if (p.heat >= 1.75) {
            p.dead = true;
            body._burnDied = true;  // triggers splitDeadParticles below
          }
        } else {
          if (p.heat > 0) p.heat = Math.max(0, p.heat - 0.005);
        }
      }
    }

    // ── PHASE 3: Springs ──
    if (_probe) { const t = performance.now(); _msGrav += t - _t0; _t0 = t; }
    for (let bi = 0; bi < numBodies; bi++) {
      const body = bodies[bi];
      // OPTIMIZATION: Skip tweening bodies (no shape changes during tween)
      if (TweenGovernor.shouldPause(body.id)) continue;
      solveSprings(body, dt);
    }

    // ── PHASE 3B: Burning particles emission ──
    // Emit loose particles from hot bodies (they're melting into the sun)
    for (let bi = 0; bi < numBodies; bi++) {
      const body = bodies[bi];
      if (body.heat && body.heat > 0.5) {
        BurningParticles.emit(body, dt);
      }
    }

    // ── PHASE 4: Inter-body collisions (last substep only) ──
    if (_probe) { const t = performance.now(); _msSpring += t - _t0; _t0 = t; }
    if (sub === config.SUBSTEPS - 1) interBodyCollisions();
    if (_probe) _msColl += performance.now() - _t0;
  }

  // ── POST-SUBSTEP: COM, split, filter ──
  if (_probe) _t0 = performance.now();
  for (let bi = 0; bi < numBodies; bi++) {
    // OPTIMIZATION: Skip tweening bodies (position/rotation fixed)
    if (TweenGovernor.shouldPause(bodies[bi].id)) continue;
    updateCOM(bodies[bi]);
  }
  // Queue splitDeadParticles for bodies that had spring breaks OR burn
  // deaths this tick. Stable bodies with neither skip this entirely —
  // big win at scale.
  for (let bi = 0; bi < numBodies; bi++) {
    const body = bodies[bi];
    const ss = body.springs;
    if (!ss) continue; // body not yet fully initialized
    let hasActivity = !!body._burnDied;
    body._burnDied = false;  // consumed — splitDeadParticles rescans fresh
    if (!hasActivity) {
      for (let si = 0; si < ss.length; si++) {
        if (ss[si].broken) { hasActivity = true; break; }
      }
    }
    if (hasActivity) {
      // Run immediately — split must happen before filter
      splitDeadParticles(body);
    } else {
      // Defer — queue at low priority, runs next frame if budget allows
      const _body = body;
      QueOps.add({
        subject: 'physics', priority: 1, cost: 2,
        fn: () => { if (_body && !_body.dead && _body.springs) splitDeadParticles(_body); }
      });
    }
  }

  // Filter dead bodies
  let writeIdx = 0;
  for (let bi = 0; bi < numBodies; bi++) {
    if (!bodies[bi].dead) {
      bodies[writeIdx++] = bodies[bi];
    }
  }
  bodies.length = writeIdx;

  // ── PLANE MERGE: interpolation into the prime meta plane ──
  // Brush planets land on planes 1..N-1 so dense strokes don't explode on
  // contact. The planes are a landing pad, not a home: after GRACE ticks a
  // body asks plane 0 for clearance; granted (or FORCE tries exhausted) it
  // merges home, and mergeSoft eases its first collisions in (0 → 1
  // smoothstep in collisions.js) so even a forced overlap separates gently.
  // Everything counts in TICKS off body state — fully deterministic, so
  // ghost stepping (FutureCache) reproduces every merge byte-for-byte.
  mergePlanes(bodies);

  // Skip looseVsPlanets when there's almost nothing loose — saves a full O(n*m) loop
  if (state.loose.length >= 5) {
    looseVsPlanets();
  }

  if (_probe) {
    MsProbe.record('physics.tick.gravity',    _msGrav);
    MsProbe.record('physics.tick.springs',    _msSpring);
    MsProbe.record('physics.tick.collisions', _msColl);
    MsProbe.record('physics.tick.cleanup',    performance.now() - _t0);
  }
};
