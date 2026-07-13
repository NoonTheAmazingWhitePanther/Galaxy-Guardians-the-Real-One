/**
 * js/modules/physics/tick.js
 * Prime Module: Main physics tick orchestrator, integration, and gravity.
 *
 * FIX (2026-06-14):
 * - Added NaN/Infinity guards in updateCOM to prevent corrupt body state
 * - Added defensive check in splitDeadParticles for out-of-bounds spring indices
 * - Added null-check before accessing particle properties in collision resolution
 */
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
import { ManualOverrides } from '../debug/governor.js';
import { SunGravMap } from './sun-grav-map.js';
import { BodyFields, ForceField, ImpactField, LooseFields } from '../../core/map-rule.js';
// Cycle note: future-cache.js imports tick.js — safe, both sides touch each
// other only inside functions (bufferedAhead read at tick time, never at eval).
import { FutureCache } from '../../core/future-cache.js';
import { Nova } from '../../core/nova.js';

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

// ── SPRING SOLVER VIEWS (SoA — 2026-07-12) ────────────────────────────────
// The static per-spring numbers in flat typed arrays, keyed by body.id.
// KEYED BY ID ON PURPOSE: FutureCache clones bodies EVERY ghost tick (fresh
// springs arrays each time) — an array-keyed cache would rebuild per ghost
// tick and drown in allocation. Clones share .id and spread-copy the same
// numeric spring values, so one view serves the body's whole lifetime,
// live and ghost. `broken` is deliberately NOT in the view — it evolves,
// and every other consumer (splitDeadParticles, renderers) reads it off the
// object, so the object stays the single truth and the view stays static.
// Index-aligned with body.springs → semantics byte-identical to the object
// loop. Splits/merges create NEW bodies with new ids; the length checks are
// the belt. Views sweep by touch stamp so dead bodies don't accumulate.
const _svMap = new Map();
let _svStamp = 0;

const _springView = (body) => {
  const ss = body.springs, ps = body.particles;
  let v = _svMap.get(body.id);
  if (v && v.slen === ss.length && v.plen === ps.length) { v.touch = _svStamp; return v; }
  const n = ss.length;
  v = {
    slen: n, plen: ps.length, touch: _svStamp,
    a: new Int32Array(n), b: new Int32Array(n),
    // values in Float64 ON PURPOSE — byte-identical math to the object path
    // (Float32 rounding of stiff/weights diverges chaotic runs); indices
    // stay Int32. ~6KB per 120-spring body — nothing.
    stiff: new Float64Array(n), rest: new Float64Array(n), rest2: new Float64Array(n),
    break2: new Float64Array(n), wA: new Float64Array(n), wB: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const sp = ss[i];
    if (sp.a < 0 || sp.a >= ps.length || sp.b < 0 || sp.b >= ps.length) { sp.broken = true; continue; }
    const pa = ps[sp.a], pb = ps[sp.b];
    const ma = (pa && pa.mass) || 1, mb = (pb && pb.mass) || 1;
    const tm = ma + mb;
    v.a[i] = sp.a; v.b[i] = sp.b;
    v.stiff[i] = sp.stiff;
    v.rest[i] = sp.restLen; v.rest2[i] = sp.restLen * sp.restLen;
    v.break2[i] = sp.breakAt * sp.breakAt;
    v.wA[i] = mb / tm; v.wB[i] = ma / tm;
  }
  _svMap.set(body.id, v);
  if (_svMap.size > 512) {                 // sweep views whose bodies are long gone
    const cut = _svStamp - 4096;
    for (const [k, x] of _svMap) if (x.touch < cut) _svMap.delete(k);
  }
  return v;
};

export const solveSprings = (body, dt) => {
  const ps = body.particles;
  const ss = body.springs;
  const n = ss.length;
  if (!n) return;
  _svStamp++;
  // THE FAST-LENGTH LAW (knob springFastLen, default OFF — the POCO votes):
  // springs live near rest, so  s = stiff·dt·(d²−rest²)/(d²+rest²)  — exact
  // value AND first derivative at rest, sqrt-free, one division. Degrades
  // under big strain (where force matters) — a quality dial, not a free win.
  const fast = ManualOverrides.get('springFastLen', 0) >= 0.5;

  if (ManualOverrides.get('springSoA', 1) >= 0.5 && body.id != null) {
    // ── SoA path: numbers stream from typed arrays, cache-linear ──
    const v = _springView(body);
    const va = v.a, vb = v.b, vs = v.stiff, vr = v.rest, vr2 = v.rest2,
          vk2 = v.break2, vwa = v.wA, vwb = v.wB;
    let solved = 0;
    for (let i = 0; i < n; i++) {
      const sp = ss[i];
      if (sp.broken) continue;
      const pa = ps[va[i]], pb = ps[vb[i]];
      if (!pa || !pb || pa.dead || pb.dead) { sp.broken = true; continue; }
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > vk2[i]) { sp.broken = true; continue; }   // break test in d² — breakers never pay the sqrt
      solved++;
      let s;
      if (fast) {
        s = vs[i] * dt * (d2 - vr2[i]) / (d2 + vr2[i]);
      } else {
        const len = Math.sqrt(d2) || 0.001;
        s = vs[i] * (len - vr[i]) * dt / len;
      }
      const sx = dx * s, sy = dy * s;
      pa.vx += sx * vwa[i];
      pa.vy += sy * vwa[i];
      pb.vx -= sx * vwb[i];
      pb.vy -= sy * vwb[i];
    }
    if (solved) PhysicsCounter.add('springsSolved', solved);
    return;
  }

  // ── legacy object path (springSoA 0 — the A/B control) ──
  let solved = 0;
  for (let i = 0; i < n; i++) {
    const sp = ss[i];
    if (sp.broken) continue;
    // FIX: Guard against out-of-bounds indices
    if (sp.a < 0 || sp.a >= ps.length || sp.b < 0 || sp.b >= ps.length) {
      sp.broken = true;
      continue;
    }
    const pa = ps[sp.a], pb = ps[sp.b];
    if (!pa || !pb || pa.dead || pb.dead) { sp.broken = true; continue; }
    // Lazy-baked per-spring constants — particle masses are set once at
    // creation and never change, so the mass split and breakAt² are
    // constants that were being recomputed (2 divisions!) every substep.
    // Lazy (not at creation) so clones and legacy springs self-heal.
    if (sp.wA === undefined) {
      const tm = pa.mass + pb.mass;
      sp.wA = pb.mass / tm;
      sp.wB = pa.mass / tm;
      sp.breakAt2 = sp.breakAt * sp.breakAt;
      sp.rest2 = sp.restLen * sp.restLen;
    }
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > sp.breakAt2) { sp.broken = true; continue; }  // break test in d² — breakers never pay the sqrt
    solved++;
    let s;
    if (fast) {
      s = sp.stiff * dt * (d2 - sp.rest2) / (d2 + sp.rest2);
    } else {
      // Math.sqrt, NOT Math.hypot — hypot pays overflow-safe scaling for
      // magnitudes this sim can never reach; in the hottest loop in the
      // engine that tax was per spring per substep.
      const len = Math.sqrt(d2) || 0.001;
      // force·dt with the normalization folded in — ONE division per spring
      // (was four: dx/len, dy/len, pb.mass/tm, pa.mass/tm)
      s = sp.stiff * (len - sp.restLen) * dt / len;
    }
    const sx = dx * s, sy = dy * s;
    pa.vx += sx * sp.wA;
    pa.vy += sy * sp.wA;
    pb.vx -= sx * sp.wB;
    pb.vy -= sy * sp.wB;
  }
  // counter hoisted out of the loop — one call per body, not per spring
  if (solved) PhysicsCounter.add('springsSolved', solved);
};

const _gfOut = { x: 0, y: 0 };   // scratch for GravityField.sampleInto (no alloc)
const _sunOut = { x: 0, y: 0 };  // scratch for SunGravMap.sampleInto (no alloc)
const _ffOut  = { x: 0, y: 0 };  // scratch for ForceField.absorbInto (no alloc)

// ── GHOST FAR-CLUSTER MAP (Noon, 2026-07-11) ──────────────────────────────
// The grid's own far/near law, applied to the ghost sim. Ghost mode can't
// ride the live grid (stale-field rule), so its legacy loop paid exact
// O(particles × bodies) gravity — 5–20× a live tick, which is what detonated
// frames whenever the conveyor produced. Instead: once per ghost tick,
// collapse every FAR planet pair to a COM-level force ("their offset like a
// gravity map" — a cluster map, N² body pairs, trivial at any sane N) and
// keep only NEAR planets (rA + rB + cacheFarDist px) in the exact
// per-particle loop — collisions and wakes stay byte-honest exactly where
// Dormancy's classifier watches them. Bounded approximation, same premise
// as cacheDirtySubsteps, knob-gated (cacheFarCluster, default ON).
let _ghostFarOn = false;
const _farNear = [];   // per body index: NEAR body refs → exact per-particle loop
const _farFx = [];     // per body index: aggregated far force per (mass/nParticles)
const _farFy = [];

const prepGhostFar = (bodies, gravConst) => {
  _ghostFarOn = false;
  if (!GravityField.ghostMode) return;                          // live rides the grid; this is ghost-only
  if (ManualOverrides.get('cacheFarCluster', 1) === 0) return;  // knob: 0 = exact legacy loop (old behavior)
  const N = bodies.length;
  if (N < 3) return;                                            // nothing worth clustering
  const pad = ManualOverrides.get('cacheFarDist', 400);
  for (let i = 0; i < N; i++) {
    bodies[i]._farIdx = i;
    (_farNear[i] || (_farNear[i] = [])).length = 0;
    _farFx[i] = 0; _farFy[i] = 0;
  }
  for (let i = 0; i < N; i++) {
    const A = bodies[i];
    const rA = (Number.isFinite(A.radius) && A.radius > 0) ? A.radius : 8;
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      const B = bodies[j];
      const dx = B.cx - A.cx, dy = B.cy - A.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > B.mass * 10000) continue;            // same negligible-force cull as the exact loop
      const rB = (Number.isFinite(B.radius) && B.radius > 0) ? B.radius : 8;
      const thr = rA + rB + pad;
      if (d2 < thr * thr) { _farNear[i].push(B); continue; }   // near → stays exact
      const d = Math.sqrt(d2) + 0.1;
      const f = (gravConst * B.mass) / (d2 + 300); // per (mass/nParticles) unit, COM-to-COM
      _farFx[i] += (dx / d) * f;
      _farFy[i] += (dy / d) * f;
    }
  }
  _ghostFarOn = true;
};

export const applyGravity = (p, nParticles, gravConst, sunMass, sunX, sunY, bodies, sunGrav) => {
  // ── ONE for the Sun ──
  // MAP path (Noon, 2026-07-12): the sun's geometry is a constant — read the
  // precomputed direction×falloff cell and multiply in the LIVE mass/G/mults.
  // Mass changes and bursts are free; sqrt was paid once at build.
  // Falls back to analytic when the cell isn't built yet, inside the
  // near-exact ring, or outside the span — never wrong, only unbuilt.
  const gm = (p.body && p.body.gravMult != null) ? p.body.gravMult : sunGrav;
  if (SunGravMap.enabled && SunGravMap.sampleInto(p.x, p.y, _sunOut)) {
    const k = (gravConst * sunMass * gm / nParticles) * p.mass;
    p.fx += _sunOut.x * k;
    p.fy += _sunOut.y * k;
  } else {
    // analytic: always exact, always available
    const sdx = sunX - p.x, sdy = sunY - p.y;
    const sd2 = sdx * sdx + sdy * sdy;
    const sd = Math.sqrt(sd2) + 0.1;
    const sf = (gravConst * sunMass * gm / (sd2 + 500)) / nParticles;
    p.fx += (sdx / sd) * sf * p.mass;
    p.fy += (sdy / sd) * sf * p.mass;
  }

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

  // ── GHOST FAR-CLUSTER path: far planets pre-collapsed to COM offsets;
  // only the prepped NEAR list runs the exact per-particle math ──
  if (_ghostFarOn && p.body && p.body._farIdx != null) {
    const idx = p.body._farIdx;
    p.fx += _farFx[idx] * (p.mass / nParticles);
    p.fy += _farFy[idx] * (p.mass / nParticles);
    const near = _farNear[idx];
    let nChecks = 0;
    for (let ni = 0; ni < near.length; ni++) {
      const b = near[ni];
      const dx = b.cx - p.x, dy = b.cy - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > b.mass * 10000) continue;
      nChecks++;
      const d = Math.sqrt(d2) + 0.1;
      const f = (gravConst * b.mass / (d2 + 300)) / nParticles;
      p.fx += (dx / d) * f * p.mass;
      p.fy += (dy / d) * f * p.mass;
    }
    if (nChecks) PhysicsCounter.add('gravityChecks', nChecks);
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

  // LOOSE DENSITY — THE PAINT LAW: clear-and-repaint per live tick; one
  // splat per surviving particle below. Ghost ticks never paint the census.
  const _loosePaint = LooseFields.enabled && !GravityField.ghostMode;
  if (_loosePaint) LooseFields.clear();

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
      const sd = Math.sqrt(sdx * sdx + sdy * sdy) + 0.1;
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
    if (_loosePaint) LooseFields.mark(lp.x, lp.y, 1);
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
    // Force grid: one read; cold field costs the loop nothing. GHOST HONESTY
    // (th_nova law): a ghost tick feels the field decayed to ITS tick —
    // bufferedAhead+1 ticks past the live decay state. One pow per substep;
    // fields decayed to nothing (deep ghosts) read as cold and skip the
    // absorb entirely.
    let forceHot = ForceField.hot;
    let ffScale = 1;
    if (forceHot && GravityField.ghostMode) {
      ffScale = ForceField.ghostScale(FutureCache.bufferedAhead + 1);
      if (ffScale < 0.01) forceHot = false;
    }
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
      // Ghost far-cluster map — refreshed once per tick from the COMs the
      // previous tick left behind (fresher than any round-robin, and the N²
      // COM pass is trivial). No-op + flag-off on the live path.
      prepGhostFar(bodies, gravConst);
      // Sun map growth — live ticks only; ghosts read whatever is built.
      if (_probe) SunGravMap.update();
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
      // Swept-collision arming (×12 tunneling fix): a catch-up step moves
      // K ticks of distance in one integration — record the launch COM so
      // the post-substep sweep can ray-check the jump it just made.
      if (coastMult > 1 && sub === 0) {
        body._coastFromX = body.cx;
        body._coastFromY = body.cy;
        body._coastJump = true;
      }

      const na = nAlives[bi];
      const particles = body.particles;
      for (let pi = 0; pi < particles.length; pi++) {
        const p = particles[pi];
        if (p.dead) continue;
        PhysicsCounter.add('particlesIntegrated');

        // 1. Gravity
        applyGravity(p, na, gravConst, sunMass, sunX, sunY, bodies, sunGrav);

        // 1b. Force grid absorption (Map Rule command grid) — only while hot
        if (forceHot && ForceField.absorbInto(p.x, p.y, _ffOut)) {
          p.fx += _ffOut.x * p.mass * ffScale;
          p.fy += _ffOut.y * p.mass * ffScale;
        }

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

  // Map Rule: one delta-deposit per body per live tick (ghost ticks refused
  // inside — clones must never write the live maps).
  BodyFields.tick(bodies);
  if (!GravityField.ghostMode) { ForceField.coolOne(); Nova.tickLife(); }

  // ── SWEPT COAST CHECK — the "Collided?" flag (Noon, 2026-07-12) ──────────
  // A K×dt catch-up jump can cross a body without either endpoint ever
  // overlapping it — classic tunneling, which showed at ×12 when stale
  // classifications let bodies coast through events. Here the jump itself is
  // ray-cast: the segment launch-COM → landed-COM against every same-plane
  // body's circle. On a crossing: the body is pulled BACK along its own jump
  // to the impact fraction (the measured "moment of explosion" inside the
  // jump), flagged `coastHit` with that fraction in `coastHitT`, and force-
  // woken — next tick, normal exact collision physics detonates at the true
  // point instead of never. Runs only for bodies that jumped this tick.
  for (let bi = 0; bi < numBodies; bi++) {
    const A = bodies[bi];
    if (!A._coastJump) continue;
    A._coastJump = false;
    const x0 = A._coastFromX, y0 = A._coastFromY;
    const dxJ = A.cx - x0, dyJ = A.cy - y0;
    const jump2 = dxJ * dxJ + dyJ * dyJ;
    if (jump2 < 1) continue;                                  // barely moved
    const rA = (Number.isFinite(A.radius) && A.radius > 0) ? A.radius : 8;
    let bestT = Infinity;
    for (let bj = 0; bj < numBodies; bj++) {
      if (bj === bi) continue;
      const B = bodies[bj];
      if ((B.plane | 0) !== (A.plane | 0)) continue;          // self-plane law
      const rB = (Number.isFinite(B.radius) && B.radius > 0) ? B.radius : 8;
      const R = rA + rB;
      // segment (x0,y0)+t·J vs circle(B.cx,B.cy,R), t ∈ [0,1] — smaller root
      const mx = x0 - B.cx, my = y0 - B.cy;
      const b2 = mx * dxJ + my * dyJ;
      const c2 = mx * mx + my * my - R * R;
      if (c2 <= 0) { bestT = 0; break; }                      // launched overlapping
      const disc = b2 * b2 - jump2 * c2;
      if (disc <= 0) continue;                                // never crosses
      const t = (-b2 - Math.sqrt(disc)) / jump2;
      if (t >= 0 && t <= 1 && t < bestT) bestT = t;
    }
    if (bestT <= 1) {
      // pull the whole body back to just before the impact fraction
      const back = Math.max(0, bestT - 0.02);
      const cx = x0 + dxJ * back, cy = y0 + dyJ * back;
      const ddx = cx - A.cx, ddy = cy - A.cy;
      const ps = A.particles;
      for (let pi = 0; pi < ps.length; pi++) { ps[pi].x += ddx; ps[pi].y += ddy; }
      A.cx = cx; A.cy = cy;
      A.coastHit = true;                                      // the Collided? flag
      A.coastHitT = bestT;                                    // the tick-inside-the-jump measure
      Dormancy.wake(A.id);
      // The flash on the impact grid — through QueOps, so a ghost-computed
      // hit is CAPTURED and replayed when its tick actually plays (the
      // "computed once, replayed exact" law), instead of painting the live
      // map with a predicted future. Live path: fires next QueOps pass.
      const _hx = A.cx, _hy = A.cy;
      QueOps.add({ subject: 'physics', priority: 1, cost: 1,
                   fn: () => ImpactField.pulse(_hx, _hy, 1) });
    } else if (A.coastHit) {
      A.coastHit = false;                                     // clean jump → clear
    }
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
      // Defer — queue at low priority, runs next frame if budget allows.
      // Captured BY ID, not object ref: under the packed cache a ghost-
      // captured ref would point into the frontier working set, not the
      // graph that's live when this replays. Id resolves against whatever
      // state.bodies is at fire time — the only honest target.
      const _bid = body.id;
      QueOps.add({
        subject: 'physics', priority: 1, cost: 2,
        fn: () => {
          const b = state.bodies.find((x) => x.id === _bid);
          if (b && !b.dead && b.springs) splitDeadParticles(b);
        }
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
