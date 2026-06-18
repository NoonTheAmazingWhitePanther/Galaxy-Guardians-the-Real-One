/**
 * js/modules/input/in-config-menu.js
 * Handles input blocking for the Config Menu.
 */
import { ConfigMenuModule } from '../ui/config-menu.js';

export const InConfigMenu = {
  init: function() {
    // Config menu logic is mostly DOM-based, handled in ConfigMenuModule.init()
  },

  handleDown: function(e) {
    const menu = document.getElementById('config-menu');
    if (!menu || menu.style.display === 'none') return false;

    // If menu is open and we click inside it, consume the event.
    if (menu.contains(e.target)) {
      e.stopPropagation();
      return true; 
    }
    return false;
  },

  handleKey: function(e) {
    // Optional: Press 'Escape' to close config menu
    const menu = document.getElementById('config-menu');
    if (e.key === 'Escape' && menu && menu.style.display !== 'none') {
      ConfigMenuModule.isOpen = false;
      menu.style.display = 'none';
      return true;
    }
    return false;
  }
};