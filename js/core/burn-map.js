/**
 * js/core/burn-map.js
 * Spatial grid of burn heat intensity for distributed solar events.
 * 
 * Pattern: Like gravity-field.js and collision heatmap.
 * One grid, many sources (suns, novas, supernovas, flares).
 * 
 * Written once per tick, read by particles and bodies.
 * Replaces expensive per-particle distance checks with O(1) grid lookups.
 * 
 * DESIGN (2026-07-07):
 * - 256×256 grid, 400px cells = 102,400×102,400px world
 * - Falloff: linear from source, intensity ∝ (1 - dist/radius)
 * - Multiple sources blend (max at each cell)
 * - Novas and supernovas as temporary burn sources with life decay
 */

const CELL_SIZE = 400;    // pixels per grid cell
const GRID_CELLS = 256;   // 256×256 grid
const MAX_CELLS_SQ = GRID_CELLS * GRID_CELLS;

export const BurnMap = {
  // Heat intensity per cell [0, 1]
  grid: new Float32Array(MAX_CELLS_SQ),
  
  cellSize: CELL_SIZE,
  gridSize: GRID_CELLS,
  
  /**
   * Clear all heat (call at tick start before update).
   */
  clear: () => {
    BurnMap.grid.fill(0);
  },
  
  /**
   * Write heat to a grid cell, keep existing if higher.
   */
  set: (cellX, cellY, intensity) => {
    if (cellX < 0 || cellX >= GRID_CELLS || cellY < 0 || cellY >= GRID_CELLS) return;
    const idx = cellY * GRID_CELLS + cellX;
    BurnMap.grid[idx] = Math.max(BurnMap.grid[idx], Math.min(intensity, 1.0));
  },
  
  /**
   * Read heat from a grid cell.
   */
  get: (cellX, cellY) => {
    if (cellX < 0 || cellX >= GRID_CELLS || cellY < 0 || cellY >= GRID_CELLS) return 0;
    return BurnMap.grid[cellY * GRID_CELLS + cellX];
  },
  
  /**
   * Query heat at world position (direct lookup).
   */
  queryHeat: (worldX, worldY) => {
    const cellX = Math.floor(worldX / CELL_SIZE);
    const cellY = Math.floor(worldY / CELL_SIZE);
    return BurnMap.get(cellX, cellY);
  },
  
  /**
   * Write one burn source to grid with linear falloff.
   * 
   * @param {number} srcX - source world X
   * @param {number} srcY - source world Y
   * @param {number} radius - burn radius (pixels)
   * @param {number} intensity - peak intensity [0,1]
   * @param {number} lifeAlpha - life multiplier for fading [0,1]
   */
  writeSource: (srcX, srcY, radius, intensity, lifeAlpha = 1.0) => {
    const cx = Math.floor(srcX / CELL_SIZE);
    const cy = Math.floor(srcY / CELL_SIZE);
    const cellRadius = Math.ceil(radius / CELL_SIZE) + 1;
    
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        // Distance from source to cell center
        const cellWorldX = (cx + dx) * CELL_SIZE + CELL_SIZE / 2;
        const cellWorldY = (cy + dy) * CELL_SIZE + CELL_SIZE / 2;
        const dist = Math.hypot(cellWorldX - srcX, cellWorldY - srcY);
        
        if (dist < radius) {
          // Linear falloff: hot at source, cool at edge
          const falloff = 1.0 - (dist / radius);
          const cellHeat = intensity * falloff * lifeAlpha;
          BurnMap.set(cx + dx, cy + dy, cellHeat);
        }
      }
    }
  },
  
  /**
   * Update burn map with all active sources.
   * Call once per physics tick before particle/body heat updates.
   * 
   * @param {Object} suns - single sun {x, y, burnRadius, mass}
   * @param {Array} novas - [{x, y, life, ...}] temporary burn sources
   * @param {Array} supernovas - [{x, y, life, ...}] large temporary burn sources
   */
  update: (suns, novas, supernovas) => {
    BurnMap.clear();
    
    // Main sun (always intensity 1.0, always present)
    if (suns) {
      BurnMap.writeSource(suns.x, suns.y, suns.burnRadius, 1.0, 1.0);
    }
    
    // Novas (medium radius, fade with life)
    if (novas && novas.length) {
      for (const nova of novas) {
        if (nova.life > 0) {
          BurnMap.writeSource(nova.x, nova.y, 500, 0.7, nova.life);
        }
      }
    }
    
    // Supernovas (large radius, intense, fade with life)
    if (supernovas && supernovas.length) {
      for (const sn of supernovas) {
        if (sn.life > 0) {
          BurnMap.writeSource(sn.x, sn.y, 1500, 0.95, sn.life);
        }
      }
    }
  },
  
  /**
   * Debug: Render burn map grid (for visual validation).
   * Shows heat intensity as red overlay on canvas.
   */
  debugDraw: (ctx, offsetX = 0, offsetY = 0, alpha = 0.3) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    
    for (let cy = 0; cy < GRID_CELLS; cy++) {
      for (let cx = 0; cx < GRID_CELLS; cx++) {
        const heat = BurnMap.get(cx, cy);
        if (heat > 0.01) {
          // Red intensity scales with heat
          const r = Math.floor(30 + heat * 225);
          ctx.fillStyle = `rgba(${r}, 0, 0, ${heat * 0.5})`;
          ctx.fillRect(
            offsetX + cx * CELL_SIZE,
            offsetY + cy * CELL_SIZE,
            CELL_SIZE,
            CELL_SIZE
          );
        }
      }
    }
    
    ctx.restore();
  }
};
