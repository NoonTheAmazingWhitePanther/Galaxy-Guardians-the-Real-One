/**
 * js/modules/ui/config-menu.js
 * Handles the physics tuning menu interactions and real-time config updates.
 * UPDATED: Now reads/writes to the global CONFIG router.
 */
import { CONFIG } from '../../config/config-index.js';

export const ConfigMenuModule = {
    isOpen: false,
    init: () => {
        const menu = document.getElementById('config-menu');
        const toggleBtn = document.getElementById('config-btn');
        const resetBtn = document.getElementById('cfg-reset-btn');
        if (!menu || !toggleBtn) return;

        ConfigMenuModule.loadSettings();

        toggleBtn.addEventListener('click', () => {
            ConfigMenuModule.isOpen = !ConfigMenuModule.isOpen;
            menu.style.display = ConfigMenuModule.isOpen ? 'block' : 'none';
        });

        const tabs = menu.querySelectorAll('.cfg-tab');
        const contents = menu.querySelectorAll('.cfg-content');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                contents.forEach(c => {
                    c.classList.remove('active');
                    if (c.id === `cfg-content-${target}`) c.classList.add('active');
                });
                if (target === 'performance') ConfigMenuModule.updateMetrics();
            });
        });

        menu.addEventListener('input', () => ConfigMenuModule.saveSettings());
        menu.addEventListener('change', () => ConfigMenuModule.saveSettings());
        // Setup sliders mapped to new CONFIG structure
        const sliders = [
            { id: 'cfg-grav', key: 'GRAVITY_CONSTANT', category: 'physics', valId: 'cfg-grav-val' },
            { id: 'cfg-spring', key: 'SPRING_K', category: 'physics', valId: 'cfg-spring-val' },
            { id: 'cfg-damp', key: 'DAMPING', category: 'physics', valId: 'cfg-damp-val' },
            { id: 'cfg-substeps', key: 'SUBSTEPS', category: 'physics', valId: 'cfg-substeps-val' },
            { id: 'cfg-collr', key: 'COLLISION_R_BASE_MULT', category: 'physics', valId: 'cfg-collr-val' },
            { id: 'cfg-pr', key: 'PARTICLE_R', category: 'physics', valId: 'cfg-pr-val' },
            { id: 'cfg-bloom', key: 'BLOOM_INTENSITY', category: 'render' },
            { id: 'cfg-trail-fade', key: 'TRAIL_FADE', category: 'render' },
            { id: 'cfg-glow', key: 'GLOW_INTENSITY', category: 'render' },
            { id: 'cfg-ui-alpha', key: 'UI_OPACITY', category: 'overlay' },
            { id: 'cfg-vol-master', key: 'VOL_MASTER', category: 'audio' },
            { id: 'cfg-vol-sfx', key: 'VOL_SFX', category: 'audio' },
            { id: 'cfg-vol-music', key: 'VOL_MUSIC', category: 'audio' }
        ];

        sliders.forEach(s => {
            const el = document.getElementById(s.id);
            const valEl = document.getElementById(s.valId);
            if (!el) return;

            el.value = CONFIG[s.category][s.key];
            if (valEl) valEl.textContent = el.value;

            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (valEl) valEl.textContent = val;
                CONFIG[s.category][s.key] = val;
                if (s.key === 'UI_OPACITY') {
                    document.documentElement.style.setProperty('--ui-bg', `rgba(8, 8, 18, ${val})`);
                }
            });
        });
        // Setup checkboxes
        const checkboxes = [
            { id: 'cfg-daynight', key: 'DAY_NIGHT_CYCLE', category: 'render' },
            { id: 'cfg-stars', key: 'SHOW_STARS', category: 'render' },
            { id: 'cfg-corona', key: 'SHOW_CORONA', category: 'render' },
            { id: 'cfg-orbits', key: 'SHOW_ORBITS', category: 'render' },
            { id: 'cfg-sfx-coll', key: 'SFX_COLLISION', category: 'audio' },
            { id: 'cfg-sfx-ambient', key: 'SFX_AMBIENT', category: 'audio' }
        ];

        checkboxes.forEach(c => {
            const el = document.getElementById(c.id);
            if (!el) return;
            el.checked = CONFIG[c.category][c.key];
            el.addEventListener('change', (e) => { CONFIG[c.category][c.key] = e.target.checked; });
        });

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const defaults = { 'cfg-grav': 120, 'cfg-spring': 0.40, 'cfg-damp': 1.0, 'cfg-substeps': 8, 'cfg-collr': 1.15, 'cfg-pr': 9, 'cfg-bloom': 1.0, 'cfg-trail-fade': 0.5, 'cfg-glow': 1.0, 'cfg-ui-alpha': 0.88, 'cfg-vol-master': 0.5, 'cfg-vol-sfx': 0.7, 'cfg-vol-music': 0.3 };
                const checkDefaults = { 'cfg-daynight': false, 'cfg-stars': true, 'cfg-corona': true, 'cfg-orbits': false, 'cfg-sfx-coll': true, 'cfg-sfx-ambient': true };
                Object.keys(defaults).forEach(id => { const el = document.getElementById(id); if (el) { el.value = defaults[id]; el.dispatchEvent(new Event('input')); } });
                Object.keys(checkDefaults).forEach(id => { const el = document.getElementById(id); if (el) { el.checked = checkDefaults[id]; el.dispatchEvent(new Event('change')); } });
            });
        }
    },
    saveSettings: () => {
        const settings = {};
        ['cfg-grav','cfg-spring','cfg-damp','cfg-substeps','cfg-collr','cfg-pr','cfg-bloom','cfg-trail-fade','cfg-glow','cfg-ui-alpha','cfg-vol-master','cfg-vol-sfx','cfg-vol-music'].forEach(id => { const el = document.getElementById(id); if (el) settings[id] = el.value; });
        ['cfg-daynight','cfg-stars','cfg-corona','cfg-orbits','cfg-sfx-coll','cfg-sfx-ambient'].forEach(id => { const el = document.getElementById(id); if (el) settings[id] = el.checked; });
        localStorage.setItem('gg_settings', JSON.stringify(settings));
    },
    loadSettings: () => {
        const saved = localStorage.getItem('gg_settings'); if (!saved) return;
        try {
            const settings = JSON.parse(saved);
            Object.keys(settings).forEach(id => {
                const el = document.getElementById(id);
                if (el) { if (el.type === 'checkbox') el.checked = settings[id]; else el.value = settings[id]; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            });
        } catch (e) { console.warn("Failed to load settings", e); }
    },
    updateMetrics: () => {
        const ua = navigator.userAgent;
        let os = "Unknown", browser = "Unknown";
        if (ua.indexOf("Win") !== -1) os = "Windows"; if (ua.indexOf("Mac") !== -1) os = "macOS"; if (ua.indexOf("Linux") !== -1) os = "Linux"; if (ua.indexOf("Android") !== -1) os = "Android"; if (ua.indexOf("like Mac") !== -1) os = "iOS";
        if (ua.indexOf("Chrome") !== -1) browser = "Chrome"; else if (ua.indexOf("Firefox") !== -1) browser = "Firefox"; else if (ua.indexOf("Safari") !== -1) browser = "Safari"; else if (ua.indexOf("Edge") !== -1) browser = "Edge";
        const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        setTxt('sys-os', os); setTxt('sys-browser', browser); setTxt('sys-cores', navigator.hardwareConcurrency || "N/A"); setTxt('sys-mem', navigator.deviceMemory ? `~${navigator.deviceMemory} GB` : "N/A"); setTxt('sys-batt', "N/A");
        if (navigator.getBattery) { navigator.getBattery().then(b => { const u = () => setTxt('sys-batt', `${Math.round(b.level*100)}% ${b.charging?"(Charging)":""}`); b.addEventListener('levelchange', u); b.addEventListener('chargingchange', u); u(); }).catch(() => setTxt('sys-batt', "N/A")); }
    }
};