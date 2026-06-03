/**
 * js/modules/ui/config-menu.js
 * Handles the physics tuning menu interactions and real-time config updates.
 */
import { config } from '../../core/config.js';

export const ConfigMenuModule = {
    isOpen: false,
    
    init: () => {
        const menu = document.getElementById('config-menu');
        const toggleBtn = document.getElementById('config-btn');
        const resetBtn = document.getElementById('cfg-reset-btn');
        
        if (!menu || !toggleBtn) return;

        // Toggle menu visibility
        toggleBtn.addEventListener('click', () => {
            ConfigMenuModule.isOpen = !ConfigMenuModule.isOpen;
            menu.style.display = ConfigMenuModule.isOpen ? 'block' : 'none';
        });

        // Setup sliders
        const sliders = [
            { id: 'cfg-grav', key: 'GRAV_CONST', valId: 'cfg-grav-val' },
            { id: 'cfg-spring', key: 'SPRING_K', valId: 'cfg-spring-val' },
            { id: 'cfg-damp', key: 'DAMPING', valId: 'cfg-damp-val' },
            { id: 'cfg-substeps', key: 'SUBSTEPS', valId: 'cfg-substeps-val' },
            { id: 'cfg-collr', key: 'COLLISION_R_MULT', valId: 'cfg-collr-val' },
            { id: 'cfg-pr', key: 'PARTICLE_R', valId: 'cfg-pr-val' }
        ];

        sliders.forEach(s => {
            const el = document.getElementById(s.id);
            const valEl = document.getElementById(s.valId);
            if (!el) return;

            // Initialize slider value from config
            if (s.key === 'COLLISION_R_MULT') {
                el.value = 1.15; // Default mult
            } else {
                el.value = config[s.key];
            }
            if (valEl) valEl.textContent = el.value;

            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (valEl) valEl.textContent = val;
                
                if (s.key === 'COLLISION_R_MULT') {
                    // Update the getter logic or value
                    config.COLLISION_R_BASE_MULT = val;
                } else {
                    config[s.key] = val;
                }
            });
        });

        // Reset to defaults
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const defaults = {
                    'cfg-grav': 120,
                    'cfg-spring': 0.40,
                    'cfg-damp': 1.0,
                    'cfg-substeps': 8,
                    'cfg-collr': 1.15,
                    'cfg-pr': 9
                };
                Object.keys(defaults).forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.value = defaults[id];
                        el.dispatchEvent(new Event('input'));
                    }
                });
            });
        }
    }
};
