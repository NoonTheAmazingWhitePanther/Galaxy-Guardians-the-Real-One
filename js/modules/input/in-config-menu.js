/**
 * js/modules/input/in-config-menu.js
 * Handles input blocking for the Config Menu (pointer only).
 *
 * REFACTOR (2026-06-19): Removed handleKey() — Escape binding
 * now lives in in-keyboard.js.
 */
import { ConfigMenuModule } from '../ui/config-menu.js';

export const InConfigMenu = {
  init() {
    // Config menu logic is mostly DOM-based, handled in ConfigMenuModule.init()
  },

  handleDown(e) {
    const menu = document.getElementById('config-menu');
    if (!menu || menu.style.display === 'none') return false;
    if (menu.contains(e.target)) {
      e.stopPropagation();
      return true;
    }
    return false;
  }
};
