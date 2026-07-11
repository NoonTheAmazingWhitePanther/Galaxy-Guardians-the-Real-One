/**
 * js/modules/ui/sun-spread.js
 * SUN SPREAD — the one satellite placement law.
 *
 * Every anchor button owns a 12-slot clock ring (the "Sun Satellite
 * spread"): slot 0 is straight up (90° above the button), every slot is
 * exactly 1/12 of a turn (30°) from the next. THIS IS THE ONLY SPACING.
 * A 4-satellite pack takes 4 slots of the 12, an 8-pack takes 8 — the
 * gap between neighbors is always the same 30°, never a per-fan angle
 * list again.
 *
 * Placement is a walker, per satellite, in declaration order:
 *   1. Start at slot 0 (straight above the button).
 *   2. If that slot is COLLIDED, step 1/12 of a turn and try again,
 *      until arriving back where it started (12 tries max).
 *   3. The first FREE slot wins.
 *
 * "Collided" means any of:
 *   - the slot is already taken on this anchor's ring;
 *   - the satellite's rect would not sit fully on-screen;
 *   - the rect would overlap an already-placed satellite (ANY anchor —
 *     the never-overlap guarantee is global, not per-fan);
 *   - the rect would overlap a fixed obstacle (the real HTML buttons /
 *     bars the caller passes in).
 *
 * Step direction is automatic: an anchor on the LEFT half of the screen
 * walks clockwise (up → right → down — into the screen); an anchor on
 * the RIGHT half walks counter-clockwise (up → left → down). No manual
 * dx-mirroring — the walker flows toward free space on its own.
 *
 * Because satellites are placed one after another against everything
 * placed before them, packs built in sequence can never overlap — by
 * construction, not by hand-tuned angles.
 *
 * If the walker completes a full lap with nothing free, the overflow
 * STACKS OUTWARD on the pack's own rays — 6.1 over 6, 7.1 over 7 — and
 * every ring holds ONE MORE than the ring inside it: after the stacked
 * rays, exactly one new ray opens at the END of the arc (the walk
 * continues past the last inherited ray to the next free slot — the "9"
 * with no prior button beneath it). The row-to-row spacing is the SAME
 * visible gap the button has to its first ring: edge-to-edge, an outer
 * satellite sits to its inner neighbor exactly as the first satellite
 * sits to the HTML button's closest edge.
 *
 * This module is PURE — no DOM, no window, no CSS reads. The caller
 * (canvas-satellites.js) supplies screen size, satellite size, radius,
 * anchors, and obstacle rects. That's deliberate: the exact shipping
 * algorithm runs unmodified under node for arithmetic verification
 * (rules.md §5 — geometry is checked by computation, not by eye).
 */

export const SunSpread = {
  SLOTS: 12,
  STEP_DEG: 360 / 12,   // 30° — the one universal spacing
  START_DEG: -90,       // slot 0: straight above the anchor

  /** Angle (radians) for a slot index. Screen coords: +y is down, so
   *  -90° is up and increasing angle sweeps clockwise visually. */
  slotAngle(slot) {
    return (this.START_DEG + slot * this.STEP_DEG) * Math.PI / 180;
  },

  /**
   * place(anchors, sats, env) → Map(id → {cx, cy, w, h, slot, angle, family})
   *
   * anchors : { family: { x, y } }           anchor button centers
   * sats    : [ { id, family } ]             declaration order = priority
   * env     : {
   *   screenW, screenH,                      viewport (CSS px)
   *   size,                                  satellite square side (pad/3)
   *   radius,                                ring radius (1.050 × pad)
   *   gap,                                   min clearance around rects
   *   obstacles: [ {left,top,right,bottom} ] fixed UI rects to avoid
   * }
   */
  MAX_LAPS: 3,   // full 12-slot walks before giving up (each lap one ring further out)

  place(anchors, sats, env) {
    const placed = new Map();
    const taken = {};                       // `${family}:${lap}` → Set(slot)
    const half = env.size / 2;
    const obGap  = env.gap ?? 4;            // clearance vs fixed HTML obstacles
    const satGap = env.satGap ?? 1;         // clearance vs other satellites —
    // deliberately smaller: adjacent 30° slots on one ring sit 2R·sin(15°)
    // apart (≈20.7px at pad=38, sats 12.7px) — genuinely clear, but an
    // obstacle-sized gap inflates their AABBs into false collisions and
    // starves the ring. 1px keeps "never touching" true without lying
    // about the grid's own guaranteed spacing.

    // ROW SPACING — the visible gap is the law. The gap the user SEES
    // between the HTML button's closest edge and its first-ring
    // satellite is: edgeGap = R − anchorHalf − size/2. Every further row
    // repeats exactly that visible gap edge-to-edge, so center-to-center
    // the rows step by size + edgeGap. 6.1 sits past 6 the same way 6
    // sits past the button.
    const anchorHalf = env.anchorHalf ?? env.size * 1.5; // pad/2 when size = pad/3
    const edgeGap = Math.max(0, env.radius - anchorHalf - env.size / 2);
    const rowStep = env.size + edgeGap;

    const collides = (a, b, g) =>
      a.left - g < b.right && a.right + g > b.left &&
      a.top - g < b.bottom && a.bottom + g > b.top;

    for (const sat of sats) {
      const anchor = anchors[sat.family];
      if (!anchor) { console.warn(`[SunSpread] no anchor for family "${sat.family}" (${sat.id})`); continue; }

      // Automatic walk direction: toward the screen, away from the edge.
      const dir = anchor.x < env.screenW / 2 ? 1 : -1;
      const slotAt = k => ((k * dir) % this.SLOTS + this.SLOTS) % this.SLOTS;

      let chosen = null;
      for (let lap = 0; lap < this.MAX_LAPS && !chosen; lap++) {
        const key = `${sat.family}:${lap}`;
        if (!taken[key]) taken[key] = new Set();
        const R = env.radius + lap * rowStep;

        const tryPlace = (slot) => {
          if (taken[key].has(slot)) return false;
          const a = this.slotAngle(slot);
          const cx = anchor.x + R * Math.cos(a);
          const cy = anchor.y + R * Math.sin(a);
          const rect = { left: cx - half, top: cy - half, right: cx + half, bottom: cy + half };
          // Fully on-screen or it doesn't count as free space.
          if (rect.left < 0 || rect.top < 0 || rect.right > env.screenW || rect.bottom > env.screenH) return false;
          // Fixed UI obstacles.
          if (env.obstacles?.some(o => collides(rect, o, obGap))) return false;
          // Every satellite already placed, any anchor, any lap — the
          // never-overlap guarantee is global. (Occupancy alone isn't
          // enough: rects on DIFFERENT laps of a family aren't
          // grid-separated from each other.)
          for (const p of placed.values()) {
            if (collides(rect, { left: p.cx - p.w / 2, top: p.cy - p.h / 2, right: p.cx + p.w / 2, bottom: p.cy + p.h / 2 }, satGap)) return false;
          }
          chosen = { cx, cy, slot, lap, key };
          return true;
        };

        if (lap === 0) {
          // First ring: the whole clock, walk order, first free slot.
          for (let k = 0; k < this.SLOTS && !chosen; k++) tryPlace(slotAt(k));
        } else {
          // RING GROWTH LAW: ring n holds (ring n−1's count) + 1.
          //   1. Stack on the rays the family already occupies one row
          //      in, in walk order — 6.1 over 6, 7.1 over 7, 8.1 over 8.
          //   2. Then exactly ONE new ray, opened at the END of the arc:
          //      the walk continues past the last inherited ray to the
          //      next free slot (the "9" with no prior button beneath
          //      it), sitting at this row's radius with the rest.
          const inner = taken[`${sat.family}:${lap - 1}`] ?? new Set();
          let lastInnerK = -1;
          for (let k = 0; k < this.SLOTS; k++) if (inner.has(slotAt(k))) lastInnerK = k;
          // Pass 1 — inherited rays.
          for (let k = 0; k < this.SLOTS && !chosen; k++) {
            const slot = slotAt(k);
            if (inner.has(slot)) tryPlace(slot);
          }
          // Pass 2 — the one new ray (only if this lap hasn't opened one).
          if (!chosen) {
            let newRayUsed = false;
            for (const s of taken[key]) if (!inner.has(s)) { newRayUsed = true; break; }
            if (!newRayUsed) {
              for (let k = lastInnerK + 1; k < this.SLOTS && !chosen; k++) {
                const slot = slotAt(k);
                if (!inner.has(slot)) tryPlace(slot);
              }
            }
          }
        }
      }

      if (!chosen) {
        // Walked every lap, nothing free — place at lap-0 slot 0 anyway so
        // the satellite EXISTS (visible ⟺ touchable still holds; it just
        // overlaps), and say so loudly instead of vanishing silently.
        console.warn(`[SunSpread] "${sat.id}": no free slot on "${sat.family}" ring after ${this.MAX_LAPS} laps — forced to slot 0`);
        const a = this.slotAngle(0);
        chosen = { cx: anchor.x + env.radius * Math.cos(a), cy: anchor.y + env.radius * Math.sin(a), slot: 0, lap: 0, key: `${sat.family}:0` };
        if (!taken[chosen.key]) taken[chosen.key] = new Set();
      }

      taken[chosen.key].add(chosen.slot);
      placed.set(sat.id, {
        cx: chosen.cx, cy: chosen.cy,
        w: env.size, h: env.size,
        slot: chosen.slot, lap: chosen.lap,
        angle: this.START_DEG + chosen.slot * this.STEP_DEG,
        family: sat.family
      });
    }
    return placed;
  }
};

export default SunSpread;
