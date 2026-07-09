/**
 * js/modules/ui/painting-button.js
 * Wire PAINTING button to PaintingState toggle.
 *
 * FIX: this used to attach its OWN 'click' listener on top of main.js's
 * direct 'pointerdown' listener on the same element. On mouse/desktop input,
 * preventDefault() on pointerdown does not reliably suppress the following
 * 'click' event, so both fired — two toggles per tap, net no-op. Tapping
 * looked broken. init() now only sets up the visual sync (update()); the
 * actual toggle lives in exactly one place, main.js's pointerdown handler.
 */

import { PaintingState } from '../../core/painting-state.js';

export const PaintingButton = {
  btn: null,

  init: () => {
    PaintingButton.btn = document.getElementById('painting-btn');
    if (!PaintingButton.btn) return;

    // Initial state
    PaintingButton.update();
  },

  /**
   * Update button visual state to match PaintingState. Used to also
   * drive paint-sat visibility via a CSS sibling selector — satellites
   * are canvas-drawn now (canvas-satellites.js checks PaintingState.enabled
   * directly, see rules.md §8), so this only affects the button's own
   * visual highlight now. Still call this after any PaintingState.toggle()/
   * set(), from any code path (pointerdown, hotkey).
   */
  update: () => {
    if (!PaintingButton.btn) return;

    if (PaintingState.enabled) {
      PaintingButton.btn.classList.add('active');
      PaintingButton.btn.setAttribute('title', 'Painting: ON (click to disable)');
    } else {
      PaintingButton.btn.classList.remove('active');
      PaintingButton.btn.setAttribute('title', 'Painting: OFF (click to enable)');
    }
  }
};
