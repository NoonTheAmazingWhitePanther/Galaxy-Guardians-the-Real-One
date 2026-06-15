/**
 * js/modules/ui/instructions.js
 * Moddable Gaming Instructions Plugin.
 * UPDATED: Now pulls text dynamically from CONFIG.game.INSTRUCTIONS
 */
import { CONFIG } from '../../Config/config-index.js';

export const InstructionsPlugin = {
    isVisible: false,
    panel: null,
    
    init() {
        this.panel = document.createElement('div');
        this.panel.id = 'instructions-panel';
        this.panel.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: var(--ui-bg); backdrop-filter: blur(var(--glass-blur)); border: 1px solid var(--ui-border); border-radius: 8px; padding: 16px; font-family: var(--ui-font); font-size: 12px; color: var(--ui-text); max-width: 320px; z-index: 100; display: none; box-shadow: 0 8px 32px rgba(0,0,0,0.5);`;
        document.body.appendChild(this.panel);
        this.render();
    },
    
    render() {
        if (!this.panel) return;
        const data = CONFIG.game.INSTRUCTIONS;
        
        const html = `
            <h3 style="margin: 0 0 8px 0; color: var(--ui-accent);">${data.title}</h3>
            <p style="color: #ff6666; font-size: 11px; margin-bottom: 12px; border-bottom: 1px solid var(--ui-border); padding-bottom: 8px;">${data.disclaimer}</p>
            <ul style="padding-left: 16px; margin: 0 0 12px 0; line-height: 1.6;">
                ${data.controls.map(c => `<li>${c}</li>`).join('')}
            </ul>
            <ul style="padding-left: 16px; margin: 0; line-height: 1.6; color: var(--ui-accent);">
                ${data.tips.map(t => `<li>${t}</li>`).join('')}
            </ul>
        `;
        this.panel.innerHTML = html;
    },
    
    toggle() {
        this.isVisible = !this.isVisible;
        this.panel.style.display = this.isVisible ? 'block' : 'none';
    }
};