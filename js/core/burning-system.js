/**
 * js/core/burning-system.js
 * Unified burning system using BurnMap as source of truth.
 * 
 * DESIGN (2026-07-07):
 * - BurnMap is the authority on heat at every world position
 * - Bodies query BurnMap to determine burn state
 * - Burn state = continuous animation, not discrete stages
 * - Color shifts HSL saturation/lightness based on burn intensity
 * - Particle emission & melting driven by heat intensity
 * 
 * BURN STATES (continuous, based on BurnMap heat):
 * - heat = 0.0: Cold, normal colors, cacheable
 * - heat = 0.1-0.5: Warm, color saturation increases, slight glow
 * - heat = 0.5-0.8: Hot, color shifts orange/red, particles emit
 * - heat = 0.8-1.0: Burning, dark red/black core, heavy emission, melting
 * - heat >= 1.0: Critical, fully burnt, disintegrating into heat source
 */

import { BurnMap } from './burn-map.js';
import { state, SUN } from './state.js';
import { hypot } from './math.js';

export const BurningSystem = {
  /**
   * Get the heat intensity at a body's center.
   * Query is O(1) grid lookup.
   */
  getBodyHeat: (body) => {
    if (!body) return 0;
    return BurnMap.queryHeat(body.cx, body.cy);
  },

  /**
   * Update body heat from BurnMap (call once per tick).
   */
  updateBodyHeat: (body) => {
    const mapHeat = BurnMap.queryHeat(body.cx, body.cy);
    
    // Smooth transition: lerp toward map heat
    const heatLerpSpeed = 0.15;  // 15% per tick
    body.heat = body.heat || 0;
    body.heat += (mapHeat - body.heat) * heatLerpSpeed;
    
    // Clamp [0, 1]
    body.heat = Math.max(0, Math.min(body.heat, 1.0));
  },

  /**
   * Get animated burn color for particles.
   * Shifts from normal pal color toward red/black based on heat.
   */
  getBurnColor: (body, basePal) => {
    const heat = body.heat || 0;
    if (heat < 0.1) return basePal;  // Normal color
    
    // Heat color: interpolate from base → orange → red → dark red → black
    const hueShift = heat * 30;  // Shift hue toward red/orange
    const saturation = 100 + heat * 40;  // Increase saturation when hot
    const lightness = 50 - heat * 40;  // Darken when hot (50% → 10% at full heat)
    
    return {
      h: Math.max(0, basePal.h - hueShift),
      s: Math.min(100, saturation),
      l: Math.max(10, lightness)
    };
  },

  /**
   * Determine if body should emit melting particles.
   * Emission threshold = heat > 0.3
   */
  shouldEmitMelt: (body) => {
    return (body.heat || 0) > 0.3;
  },

  /**
   * Get emission rate (particles/tick) based on heat.
   * Linear: 0 at heat=0.3, peaks at heat=1.0
   */
  getEmissionRate: (body) => {
    const heat = Math.max(0, (body.heat || 0) - 0.3) / 0.7;  // Normalize [0, 1]
    return heat * 12;  // 0-12 particles per tick
  },

  /**
   * Get melt target: middle point between planet and heat source.
   * At low heat: target is sun/nova
   * At high heat: target is the center of heat (heat source)
   */
  getMeltTarget: (body) => {
    const heat = body.heat || 0;
    
    // Find nearest heat source
    let nearestHeat = SUN;
    let nearestDist = hypot(SUN.x - body.cx, SUN.y - body.cy);
    
    // Check novas
    if (state.novas) {
      for (const nova of state.novas) {
        const dist = hypot(nova.x - body.cx, nova.y - body.cy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestHeat = nova;
        }
      }
    }
    
    // Melt target interpolates between planet center and heat source
    // Low heat: closer to heat source
    // High heat: farther (spreads melting around planet)
    const blend = 0.3 + heat * 0.7;  // 0.3-1.0
    
    return {
      x: body.cx + (nearestHeat.x - body.cx) * blend,
      y: body.cy + (nearestHeat.y - body.cy) * blend,
      source: nearestHeat
    };
  },

  /**
   * Check if body is dead/fully burnt (heat >= 1.0 for long enough).
   * Bodies don't instantly disappear, they fade over time.
   */
  isBurntDead: (body) => {
    return (body.heat || 0) >= 0.95 && body.burnTime && (Date.now() - body.burnTime) > 2000;
  },

  /**
   * Mark body as starting to burn (once heat > 0.5).
   */
  onBurnStart: (body) => {
    if (!body.burnTime && (body.heat || 0) > 0.5) {
      body.burnTime = Date.now();
      // Wake up any nearby bodies (collision detection reset)
      BurningSystem.wakeNearbyBodies(body, 200);  // 200px radius
    }
  },

  /**
   * Wake nearby bodies (reset collision & physics state).
   * Used when a body starts burning or collides.
   */
  wakeNearbyBodies: (body, radius = 200) => {
    for (const other of state.bodies) {
      if (other.id === body.id) continue;
      if (other.dead) continue;
      
      const dist = hypot(other.cx - body.cx, other.cy - body.cy);
      if (dist < radius) {
        other.mergeDelay = 0;  // Reset merge delay
        other.mergeTries = 0;  // Reset merge tries
        // Force collision check next frame
      }
    }
  },

  /**
   * Debug info for panel.
   */
  debugInfo: {
    get burningBodies() {
      return state.bodies.filter(b => (b.heat || 0) > 0.1).length;
    },
    get hotBodies() {
      return state.bodies.filter(b => (b.heat || 0) > 0.5).length;
    },
    get criticalBodies() {
      return state.bodies.filter(b => (b.heat || 0) >= 0.95).length;
    }
  }
};
