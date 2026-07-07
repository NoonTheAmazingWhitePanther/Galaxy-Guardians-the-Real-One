/**
 * js/core/tween-governor.js
 * Pause heavy calculations during tweens (physics, collisions, dot atlas checks).
 * 
 * DESIGN:
 * - When tween starts: calculate pause duration based on tween.duration / physSpeed
 * - During pause: skip physics ticks, collision checks, dot atlas stability checks
 * - When pause ends: resume normal calculations
 * - Accounts for speed multiplier (×0.1 to ×12)
 * 
 * SAVINGS:
 * - 1 sec tween @ 1× speed = 60 skipped physics ticks
 * - 1 sec tween @ 12× speed = 5 ticks (tween completes faster)
 * - Collision checks, gravity recalc, burn map updates all paused
 */

export const TweenGovernor = {
  pausedBodies: new Map(),  // body.id -> { pauseUntil, tweenDuration, physSpeed }

  /**
   * Register a tween start. Calculate pause duration based on tween speed.
   * Call this when body.tween is set.
   */
  registerTween: (body, physSpeed = 1) => {
    if (!body.tween || !body.tween.duration) return;

    const tweenDurationMs = body.tween.duration;
    const effectiveSpeed = Math.max(0.1, Math.min(12, physSpeed || 1));
    
    // Pause for: tweenDuration / effectiveSpeed
    // At 1× speed: full tween duration
    // At 12× speed: 1/12th of duration (tween is 12× faster)
    const pauseDurationMs = tweenDurationMs / effectiveSpeed;
    const pauseUntil = performance.now() + pauseDurationMs;

    TweenGovernor.pausedBodies.set(body.id, {
      pauseUntil,
      tweenDuration: tweenDurationMs,
      physSpeed: effectiveSpeed,
      startTime: performance.now()
    });
  },

  /**
   * Check if a body should skip physics/collisions/checks.
   */
  shouldPause: (bodyId) => {
    const pause = TweenGovernor.pausedBodies.get(bodyId);
    if (!pause) return false;

    const now = performance.now();
    if (now >= pause.pauseUntil) {
      TweenGovernor.pausedBodies.delete(bodyId);
      return false;
    }
    return true;
  },

  /**
   * Get all paused body IDs (for debugging).
   */
  getPausedBodies: () => {
    const now = performance.now();
    const paused = [];
    for (const [id, data] of TweenGovernor.pausedBodies) {
      if (now < data.pauseUntil) {
        const remaining = Math.round(data.pauseUntil - now);
        paused.push({ id: id.slice(0, 8), remaining, physSpeed: data.physSpeed });
      } else {
        TweenGovernor.pausedBodies.delete(id);
      }
    }
    return paused;
  },

  /**
   * Clear all pauses (on reset/new session).
   */
  clearAll: () => {
    TweenGovernor.pausedBodies.clear();
  },

  /**
   * Debug info for panel.
   */
  debugInfo: {
    get pausedCount() {
      return TweenGovernor.pausedBodies.size;
    },
    get paused() {
      return TweenGovernor.getPausedBodies();
    }
  }
};
