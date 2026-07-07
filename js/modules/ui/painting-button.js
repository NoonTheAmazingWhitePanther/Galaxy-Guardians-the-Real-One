/**
 * js/modules/ui/painting-button.js
 * Wire PAINTING button to PaintingState toggle.
 */

import { PaintingState } from '../../core/painting-state.js';

export const PaintingButton = {
  btn: null,

  init: () => {
    PaintingButton.btn = document.getElementById('painting-btn');
    if (!PaintingButton.btn) return;

    // Initial state
    PaintingButton.update();

    // Click handler
    PaintingButton.btn.addEventListener('click', (e) => {
      e.preventDefault();
      PaintingState.toggle();
      PaintingButton.update();
    });
  },

  /**
   * Update button visual state to match PaintingState.
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
