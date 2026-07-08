/**
 * js/core/button-registry.js
 * BUTTON REGISTRY — Tap/Long-Press Logic (No Input Binding)
 *
 * Pure data structure + gesture recognition.
 * Input binding happens separately in js/modules/input/in-buttons.js
 *
 * Each button has:
 *   - id: unique identifier
 *   - onTap(): short press action (< 500ms)
 *   - onLongPress(): long press action (hold 500ms+)
 *   - hotkey?: keyboard key (optional)
 */

export const ButtonRegistry = {
  _buttons: {},
  _holds: {},  // track which buttons are currently held: { id: { startTime, timer, longFired } }

  /**
   * Register a button with tap and long-press handlers.
   * @param {string} id - unique button identifier (matches HTML id attribute)
   * @param {Object} config - { onTap, onLongPress, hotkey? }
   */
  register(id, { onTap, onLongPress, hotkey }) {
    if (!onTap || !onLongPress) {
      console.warn(`[ButtonRegistry] ${id}: both onTap and onLongPress required`);
      return false;
    }
    this._buttons[id] = { id, onTap, onLongPress, hotkey };
    return true;
  },

  /**
   * Start tracking a button hold (called on pointerdown).
   * After 500ms, fires onLongPress automatically.
   */
  startHold(id) {
    const btn = this._buttons[id];
    if (!btn) return;

    if (this._holds[id]) clearTimeout(this._holds[id].timer);

    this._holds[id] = {
      startTime: performance.now(),
      timer: setTimeout(() => {
        btn.onLongPress?.();
        if (this._holds[id]) this._holds[id].longFired = true;
      }, 500),
      longFired: false
    };
  },

  /**
   * End a button hold (called on pointerup/pointercancel).
   * If 500ms hasn't passed, fires onTap instead.
   */
  endHold(id) {
    const hold = this._holds[id];
    if (!hold) return;

    clearTimeout(hold.timer);
    const btn = this._buttons[id];

    // If long-press hasn't fired yet, fire tap
    if (!hold.longFired) {
      btn?.onTap?.();
    }

    delete this._holds[id];
  },

  /**
   * Cancel a hold without firing anything (e.g., pointer left button area).
   */
  cancelHold(id) {
    const hold = this._holds[id];
    if (!hold) return;
    clearTimeout(hold.timer);
    delete this._holds[id];
  },

  /**
   * Dispatch a keyboard hotkey (always fires onTap, no long-press for keyboard).
   */
  dispatchHotkey(key) {
    for (const id in this._buttons) {
      const btn = this._buttons[id];
      if (btn.hotkey === key) {
        btn.onTap?.();
        return true;  // Consumed
      }
    }
    return false;  // Not consumed
  },

  /**
   * Query methods.
   */
  get(id) { return this._buttons[id]; },
  list() { return Object.values(this._buttons); },
  isHeld(id) { return id in this._holds; },
  allHeld() { return Object.keys(this._holds); },
};

export default ButtonRegistry;
