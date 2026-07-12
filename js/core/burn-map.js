/**
 * js/core/burn-map.js
 * Spatial grid of burn heat intensity for distributed solar events.
 *
 * MIGRATED UNDER THE MAP RULE (2026-07-12) — the first outlaw brought in.
 * Same API, same falloff math, same consumers (tick.js, burning-system.js);
 * the storage is now a renter of the one lattice, obeying the Alignment Law
 * (sun-centered shared span — which also FIXES the old private grid's blind
 * spot: it started at world (0,0), so anything at negative coordinates never
 * burned).
 *
 * THE PAINT LAW — the third write law, and BurnMap is its founder:
 * clear-and-repaint every tick, MAX-blend (hottest source wins per cell),
 * no decay, no tracking. For fields where an authority rewrites the whole
 * truth each tick. (First law: deposit — persistent ids, delta-tracked.
 * Second law: pulse — fire-and-forget, decay-retired.)
 *
 * One grid, many sources (suns, novas, supernovas, flares).
 * Written once per tick, read by particles and bodies: O(1) lookups replace
 * per-particle distance checks. Reads come from the RAW grid (exact, this
 * tick's truth); the renter's smoothed buffer exists for anyone who prefers
 * to ABSORB softened heat (paint styles, dormancy senses).
 */
import { MapRule } from './map-rule.js';

export const BurnMap = {
  _renter: null,

  _r() {
    if (this._renter) return this._renter;
    this._renter = MapRule.declare('burnMap', {
      channels: ['heat'],
      cellSize: 400,           // same 400px cells as the original design
      smoothing: 1,
      skip: 4,
      decay: {},               // PAINT law: no decay — repainted every tick
    });
    return this._renter;
  },

  // Kept for any external reader that scaled by these; live values now.
  get cellSize() { return this._r().grid.cellW; },
  get gridSize() { return this._r().grid.cols; },
  get grid()     { return this._r().grid.data; },

  /** Clear all heat (call at tick start before update). */
  clear() { this._r().grid.clear(); },

  /** Write heat to a grid cell (cell coords), MAX-blend, clamped to 1. */
  set(cellX, cellY, intensity) {
    const g = this._r().grid;
    if (cellX < 0 || cellX >= g.cols || cellY < 0 || cellY >= g.rows) return;
    const idx = g.index(cellX, cellY);          // channel 0 — heat
    g.data[idx] = Math.max(g.data[idx], Math.min(intensity, 1.0));
  },

  /** Read heat from a grid cell (cell coords). */
  get(cellX, cellY) {
    const g = this._r().grid;
    if (cellX < 0 || cellX >= g.cols || cellY < 0 || cellY >= g.rows) return 0;
    return g.data[g.index(cellX, cellY)];
  },

  /** Query heat at world position — O(1), exact (raw grid, this tick). */
  queryHeat(worldX, worldY) {
    const g = this._r().grid;
    if (!g.contains(worldX, worldY)) return 0;  // outside the span → cold
    return g.data[g.index(g.colOf(worldX), g.rowOf(worldY))];
  },

  /**
   * Write one burn source with linear falloff (hot at source, cool at edge).
   * Same math as always — only the cell geometry now comes from the lattice.
   */
  writeSource(srcX, srcY, radius, intensity, lifeAlpha = 1.0) {
    const g = this._r().grid;
    const c0 = g.colOf(srcX - radius), c1 = g.colOf(srcX + radius);
    const r0 = g.rowOf(srcY - radius), r1 = g.rowOf(srcY + radius);
    for (let cy = r0; cy <= r1; cy++) {
      const wy = g.y0 + (cy + 0.5) * g.cellH;
      for (let cx = c0; cx <= c1; cx++) {
        const wx = g.x0 + (cx + 0.5) * g.cellW;
        const dist = Math.hypot(wx - srcX, wy - srcY);
        if (dist < radius) {
          const falloff = 1.0 - (dist / radius);
          this.set(cx, cy, intensity * falloff * lifeAlpha);
        }
      }
    }
  },

  /**
   * Update burn map with all active sources.
   * Call once per physics tick before particle/body heat updates.
   * @param {Object} suns - single sun {x, y, burnRadius, mass}
   * @param {Array} novas - [{x, y, life, ...}] temporary burn sources
   * @param {Array} supernovas - [{x, y, life, ...}] large temporary sources
   */
  update(suns, novas, supernovas) {
    this.clear();
    if (suns) this.writeSource(suns.x, suns.y, suns.burnRadius, 1.0, 1.0);
    if (novas && novas.length) {
      for (const nova of novas) {
        if (nova.life > 0) this.writeSource(nova.x, nova.y, 500, 0.7, nova.life);
      }
    }
    if (supernovas && supernovas.length) {
      for (const sn of supernovas) {
        if (sn.life > 0) this.writeSource(sn.x, sn.y, 1500, 0.95, sn.life);
      }
    }
  },

  /** Debug: heat intensity as red overlay — geometry from the lattice now. */
  debugDraw(ctx, offsetX = 0, offsetY = 0, alpha = 0.3) {
    const g = this._r().grid;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let cy = 0; cy < g.rows; cy++) {
      for (let cx = 0; cx < g.cols; cx++) {
        const heat = g.data[g.index(cx, cy)];
        if (heat > 0.01) {
          const r = Math.floor(30 + heat * 225);
          ctx.fillStyle = `rgba(${r}, 0, 0, ${heat * 0.5})`;
          ctx.fillRect(offsetX + g.x0 + cx * g.cellW,
                       offsetY + g.y0 + cy * g.cellH, g.cellW, g.cellH);
        }
      }
    }
    ctx.restore();
  },
};
