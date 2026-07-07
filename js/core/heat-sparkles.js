/**
 * js/core/heat-sparkles.js
 * White noise sparkles on planet borders when burning.
 * Only on sun-facing arc, one draw call per planet.
 * 
 * DESIGN:
 * - Sparkles appear at heat >= 0.3
 * - Arc width: sun-facing hemisphere only
 * - Pattern: white noise + perlin-like randomness
 * - One drawImage call + particle positions
 */

import { hypot, PI2 } from './math.js';
import { SUN } from './state.js';

export const HeatSparkles = {
  sparkleCanvas: null,
  sparkleSize: 256,  // 256×256 texture

  /**
   * Initialize sparkle texture (one-time).
   */
  init: () => {
    if (HeatSparkles.sparkleCanvas) return;
    
    HeatSparkles.sparkleCanvas = document.createElement('canvas');
    HeatSparkles.sparkleCanvas.width = HeatSparkles.sparkleSize;
    HeatSparkles.sparkleCanvas.height = HeatSparkles.sparkleSize;
    
    const ctx = HeatSparkles.sparkleCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, HeatSparkles.sparkleSize, HeatSparkles.sparkleSize);
    
    // White noise sparkles
    const imageData = ctx.getImageData(0, 0, HeatSparkles.sparkleSize, HeatSparkles.sparkleSize);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const rand = Math.random();
      if (rand > 0.95) {  // 5% chance per pixel
        data[i]     = 255;  // R
        data[i + 1] = 255;  // G
        data[i + 2] = 255;  // B
        data[i + 3] = Math.floor(rand * 255);  // A
      }
    }
    ctx.putImageData(imageData, 0, 0);
  },

  /**
   * Draw heat sparkles on planet border arc.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} body - planet
   * @param {number} heat - [0, 1]
   */
  draw: (ctx, body, heat) => {
    if (heat < 0.3) return;  // No sparkles until warm
    if (!HeatSparkles.sparkleCanvas) HeatSparkles.init();

    const sunDx = SUN.x - body.cx;
    const sunDy = SUN.y - body.cy;
    const sunDist = hypot(sunDx, sunDy);
    const sunAngle = Math.atan2(sunDy, sunDx);

    // Arc bounds: ±90° from sun direction (sun-facing hemisphere)
    const arcStart = sunAngle - Math.PI / 2;
    const arcEnd = sunAngle + Math.PI / 2;

    const radius = body.radius * 1.1;  // Just outside hull
    const sparkleSize = Math.max(8, body.radius * 0.15);
    const sparkleCount = Math.ceil(heat * 20);  // 6-20 sparkles based on heat
    const opacity = 0.3 + heat * 0.7;  // 0.3-1.0 opacity

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = 'screen';  // Additive blend

    // Random seed for consistent-ish per-frame sparkle positions
    const timeSeed = Math.floor(performance.now() / 50) % 1000;

    for (let i = 0; i < sparkleCount; i++) {
      // Deterministic randomness (same seed = same positions, changes per 50ms)
      const seed = (timeSeed + i * 137) % 1000;
      const seedRand1 = Math.sin(seed * 12.9898) * 43758.5453;
      const seedRand2 = Math.sin((seed + 1) * 78.233) * 43758.5453;

      const randAngle = (seedRand1 - Math.floor(seedRand1)) * Math.PI - Math.PI / 2;
      const angle = sunAngle + randAngle;

      // Only draw sparkles in sun-facing arc
      const isInArc = angle > arcStart && angle < arcEnd;
      if (!isInArc) continue;

      const sx = body.cx + Math.cos(angle) * radius;
      const sy = body.cy + Math.sin(angle) * radius;

      // Slight radial variation
      const variance = (seedRand2 - Math.floor(seedRand2)) * 0.2 - 0.1;
      const sx2 = body.cx + Math.cos(angle) * (radius + variance * body.radius);
      const sy2 = body.cy + Math.sin(angle) * (radius + variance * body.radius);

      // Draw sparkle as small white circle (one-call per, but batched in loop)
      ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.arc(sx2, sy2, sparkleSize * 0.5, 0, PI2);
      ctx.fill();
    }

    ctx.restore();
  }
};
