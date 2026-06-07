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

        // Load saved settings
        ConfigMenuModule.loadSettings();

        // Toggle menu visibility
        toggleBtn.addEventListener('click', () => {
            ConfigMenuModule.isOpen = !ConfigMenuModule.isOpen;
            menu.style.display = ConfigMenuModule.isOpen ? 'block' : 'none';
        });

        // Tab Switching Logic
        const tabs = menu.querySelectorAll('.cfg-tab');
        const contents = menu.querySelectorAll('.cfg-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');
                
                // Update tabs
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update content
                contents.forEach(c => {
                    c.classList.remove('active');
                    if (c.id === `cfg-content-${target}`) {
                        c.classList.add('active');
                    }
                });

                if (target === 'performance') {
                    ConfigMenuModule.updateMetrics();
                }
            });
        });

        // Auto-save settings on change
        menu.addEventListener('input', () => ConfigMenuModule.saveSettings());
        menu.addEventListener('change', () => ConfigMenuModule.saveSettings());

        // Setup sliders
        const sliders = [
            { id: 'cfg-grav', key: 'GRAV_CONST', valId: 'cfg-grav-val' },
            { id: 'cfg-spring', key: 'SPRING_K', valId: 'cfg-spring-val' },
            { id: 'cfg-damp', key: 'DAMPING', valId: 'cfg-damp-val' },
            { id: 'cfg-substeps', key: 'SUBSTEPS', valId: 'cfg-substeps-val' },
            { id: 'cfg-collr', key: 'COLLISION_R_MULT', valId: 'cfg-collr-val' },
            { id: 'cfg-pr', key: 'PARTICLE_R', valId: 'cfg-pr-val' },
            
            // Display
            { id: 'cfg-res', key: 'RESOLUTION_MULT', valId: 'cfg-res-val' },
            { id: 'cfg-fps-cap', key: 'FPS_CAP', valId: 'cfg-fps-cap-val' },
            { id: 'cfg-skip', key: 'FRAME_SKIPPING', valId: 'cfg-skip-val' },
            { id: 'cfg-bloom', key: 'BLOOM_INTENSITY' },
            { id: 'cfg-trail-fade', key: 'TRAIL_FADE' },
            { id: 'cfg-glow', key: 'GLOW_INTENSITY' },
            { id: 'cfg-ui-alpha', key: 'UI_OPACITY' },

            // Sound
            { id: 'cfg-vol-master', key: 'VOL_MASTER' },
            { id: 'cfg-vol-sfx', key: 'VOL_SFX' },
            { id: 'cfg-vol-music', key: 'VOL_MUSIC' }
        ];

        sliders.forEach(s => {
            const el = document.getElementById(s.id);
            const valEl = document.getElementById(s.valId);
            if (!el) return;

            // Initialize slider value from config
            if (s.key === 'COLLISION_R_MULT') {
                el.value = config.COLLISION_R_BASE_MULT || 1.15;
            } else {
                el.value = config[s.key];
            }
            if (valEl) valEl.textContent = el.value;

            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (valEl) valEl.textContent = val;
                
                if (s.key === 'COLLISION_R_MULT') {
                    config.COLLISION_R_BASE_MULT = val;
                } else {
                    config[s.key] = val;
                }

                if (s.key === 'UI_OPACITY') {
                    document.documentElement.style.setProperty('--ui-bg', `rgba(8, 8, 18, ${val})`);
                }
            });
        });

        // Setup checkboxes
        const checkboxes = [
            { id: 'cfg-daynight', key: 'DAY_NIGHT_CYCLE' },
            { id: 'cfg-stars', key: 'SHOW_STARS' },
            { id: 'cfg-corona', key: 'SHOW_CORONA' },
            { id: 'cfg-orbits', key: 'SHOW_ORBITS' },
            { id: 'cfg-sfx-coll', key: 'SFX_COLLISION' },
            { id: 'cfg-sfx-ambient', key: 'SFX_AMBIENT' }
        ];

        checkboxes.forEach(c => {
            const el = document.getElementById(c.id);
            if (!el) return;
            el.checked = config[c.key];
            el.addEventListener('change', (e) => {
                config[c.key] = e.target.checked;
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
                    'cfg-pr': 2.8,
                    'cfg-res': 1.0,
                    'cfg-fps-cap': 60,
                    'cfg-skip': 1,
                    'cfg-bloom': 1.0,
                    'cfg-trail-fade': 0.5,
                    'cfg-glow': 1.0,
                    'cfg-ui-alpha': 0.88,
                    'cfg-vol-master': 0.5,
                    'cfg-vol-sfx': 0.7,
                    'cfg-vol-music': 0.3
                };
                const checkDefaults = {
                    'cfg-daynight': false,
                    'cfg-stars': true,
                    'cfg-corona': true,
                    'cfg-orbits': false,
                    'cfg-sfx-coll': true,
                    'cfg-sfx-ambient': true
                };

                Object.keys(defaults).forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.value = defaults[id];
                        el.dispatchEvent(new Event('input'));
                    }
                });
                Object.keys(checkDefaults).forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.checked = checkDefaults[id];
                        el.dispatchEvent(new Event('change'));
                    }
                });
            });
        }
    },

    saveSettings: () => {
        const settings = {};
        // Save sliders
        const sliders = [
            'cfg-grav', 'cfg-spring', 'cfg-damp', 'cfg-substeps', 'cfg-collr', 'cfg-pr',
            'cfg-res', 'cfg-fps-cap', 'cfg-skip', 'cfg-bloom', 'cfg-ui-alpha',
            'cfg-vol-master', 'cfg-vol-sfx', 'cfg-vol-music'
        ];
        sliders.forEach(id => {
            const el = document.getElementById(id);
            if (el) settings[id] = el.value;
        });

        // Save checkboxes
        const checks = [
            'cfg-daynight', 'cfg-stars', 'cfg-corona', 'cfg-orbits', 'cfg-sfx-coll', 'cfg-sfx-ambient'
        ];
        checks.forEach(id => {
            const el = document.getElementById(id);
            if (el) settings[id] = el.checked;
        });

        localStorage.setItem('gg_settings', JSON.stringify(settings));
    },

    loadSettings: () => {
        const saved = localStorage.getItem('gg_settings');
        if (!saved) return;
        try {
            const settings = JSON.parse(saved);
            Object.keys(settings).forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') el.checked = settings[id];
                    else el.value = settings[id];
                    el.dispatchEvent(new Event('input'));
                    el.dispatchEvent(new Event('change'));
                }
            });
        } catch (e) { console.warn("Failed to load settings", e); }
    },

    updateMetrics: () => {
        // OS & Browser detection
        const ua = navigator.userAgent;
        let os = "Unknown OS";
        if (ua.indexOf("Win") !== -1) os = "Windows";
        if (ua.indexOf("Mac") !== -1) os = "macOS";
        if (ua.indexOf("Linux") !== -1) os = "Linux";
        if (ua.indexOf("Android") !== -1) os = "Android";
        if (ua.indexOf("like Mac") !== -1) os = "iOS";

        let browser = "Unknown Browser";
        if (ua.indexOf("Chrome") !== -1) browser = "Chrome";
        else if (ua.indexOf("Firefox") !== -1) browser = "Firefox";
        else if (ua.indexOf("Safari") !== -1) browser = "Safari";
        else if (ua.indexOf("Edge") !== -1) browser = "Edge";

        document.getElementById('sys-os').textContent = os;
        document.getElementById('sys-browser').textContent = browser;
        document.getElementById('sys-cores').textContent = navigator.hardwareConcurrency || "N/A";
        
        if (navigator.deviceMemory) {
            document.getElementById('sys-mem').textContent = `~${navigator.deviceMemory} GB`;
        } else {
            document.getElementById('sys-mem').textContent = "N/A";
        }

        // Battery Info
        if (navigator.getBattery) {
            navigator.getBattery().then(battery => {
                const updateBatt = () => {
                    document.getElementById('sys-batt').textContent = `${Math.round(battery.level * 100)}% ${battery.charging ? "(Charging)" : ""}`;
                };
                battery.addEventListener('levelchange', updateBatt);
                battery.addEventListener('chargingchange', updateBatt);
                updateBatt();
            }).catch(() => {
                document.getElementById('sys-batt').textContent = "N/A";
            });
        } else {
            document.getElementById('sys-batt').textContent = "N/A";
        }
    }
};
