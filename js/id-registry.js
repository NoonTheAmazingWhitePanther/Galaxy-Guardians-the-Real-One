"use strict";

// ════════════════════════════════════════════════════════════════════
// ID REGISTRY – Centralised, stable string identifiers for all objects
// ════════════════════════════════════════════════════════════════════
// HOW TO USE:
//   Call Sim.IdRegistry.next('type') to get a unique string like "body_5".
//   The prefix matches the object type for readability.
//   All IDs are strings – never numbers, never objects.
//
// NAMING CONVENTIONS:
//   'body'      – planets (bodies)
//   'ast'       – asteroids / comets
//   'loose'     – loose particles (debris, sparks)
//   'flash'     – explosions / flashes
//   'tent'      – solar tentacles
//   'ui'        – UI elements (FPS counter, planet count, etc.)
//   You can add new types below by extending the `counters` and `prefixes` objects.
// ════════════════════════════════════════════════════════════════════

window.Sim.IdRegistry = (() => {
  // ── Counters (internal) ──────────────────────────────────────────
  const counters = {
    body: 0,
    asteroid: 0,
    loose: 0,
    flash: 0,
    tentacle: 0,
    ui: 0
  };

  // ── Prefix mapping (used for readable IDs) ──────────────────────
  const prefixes = {
    body: 'body',
    asteroid: 'ast',
    loose: 'loose',
    flash: 'flash',
    tentacle: 'tent',
    ui: 'ui'
  };

  /**
   * Generate the next unique ID for a given type.
   * @param {string} type – one of the keys in `counters`
   * @returns {string} e.g. "body_3", "ast_7"
   */
  function next(type) {
    if (!(type in counters)) {
      console.warn(`[IdRegistry] Unknown type "${type}". Falling back to "ui".`);
      type = 'ui';
    }
    counters[type]++;
    // Always return a string (prefix + underscore + number)
    return `${prefixes[type]}_${counters[type]}`;
  }

  /**
   * Set a custom counter value (e.g. after loading a save).
   * @param {string} type
   * @param {number} value – will be used for the *next* ID (value + 1)
   */
  function setCounter(type, value) {
    if (type in counters) {
      counters[type] = value;
    }
  }

  /**
   * Get the current counter value for a type (for debugging/saving).
   * @param {string} type
   * @returns {number}
   */
  function getCounter(type) {
    return counters[type] || 0;
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    next,
    setCounter,
    getCounter,
    // Expose read‑only views for debugging
    prefixes: Object.freeze({ ...prefixes }),
    types: Object.keys(counters)
  };
})();