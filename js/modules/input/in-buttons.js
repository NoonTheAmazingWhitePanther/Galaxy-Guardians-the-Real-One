/**
 * js/modules/input/in-buttons.js
 * BUTTON INPUT HANDLER — Sits in InputModule priority chain
 *
 * Handles HTML button pointerdown/pointerup events.
 * Dispatches to ButtonRegistry for tap/long-press detection.
 *
 * Flow:
 *   pointerdown → InButtons.handleDown() → ButtonRegistry.startHold()
 *   pointerup   → InButtons.handleUp()   → ButtonRegistry.endHold()
 *
 * Returns true if the event was consumed (button was hit), false otherwise.
 */

import { ButtonRegistry } from '../../core/button-registry.js';

export const InButtons = {
  _lastButtonId: null,

  /**
   * Handle pointerdown on a button.
   * Returns true if a button was hit, false otherwise.
   */
  handleDown(e) {
    // Find the button element at this pointer location
    const el = e.target?.closest('[role="button"], [id*="btn"]');
    if (!el || !el.id) return false;

    const id = el.id;
    if (!ButtonRegistry.get(id)) return false;

    // Start hold timer
    e.preventDefault();
    e.stopPropagation();

    ButtonRegistry.startHold(id);
    this._lastButtonId = id;

    // Visual feedback
    el.classList.add('btn-pressed');

    return true;  // Consumed
  },

  /**
   * Handle pointerup (button release).
   * Returns true if a button was released, false otherwise.
   */
  handleUp(e) {
    if (!this._lastButtonId) return false;

    const id = this._lastButtonId;
    const el = document.getElementById(id);

    // End hold and dispatch tap or long-press
    ButtonRegistry.endHold(id);

    // Visual feedback
    if (el) el.classList.remove('btn-pressed');

    this._lastButtonId = null;
    return true;  // Consumed
  },

  /**
   * Handle pointercancel (e.g., pointer left button area during hold).
   * Don't fire any action, just clean up.
   */
  handleCancel(id) {
    if (!id) return;
    ButtonRegistry.cancelHold(id);
    const el = document.getElementById(id);
    if (el) el.classList.remove('btn-pressed');
    this._lastButtonId = null;
  }
};

export default InButtons;
