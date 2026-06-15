/**
 * js/Config/config-index.js
 * CONFIGURATION ROUTER & FAILSAFE
 * Rewritten with 100% standard syntax to prevent clipboard/parser errors.
 */

// 1. THE ULTIMATE SAFE FALLBACK
var SAFE_FALLBACK = {
    physics: { 
        TIMESTEP: 1 / 60, MAX_FRAME_SKIP: 16, VAULT_SIZE: 48, 
        GRAVITY_CONSTANT: 120, SPRING_K: 0.40, DAMPING: 1.0, SUBSTEPS: 8, 
        PARTICLE_R: 9, BREAK_MULT: 2.8, COLLISION_R_BASE_MULT: 1.15, 
        MAX_BODIES: 8, MAX_LOOSE_PARTICLES: 400 
    },
    render: { 
        TARGET_FPS: 60, BACKGROUND_COLOR: '#04040c', PIXEL_RATIO_CAP: 2, 
        TRAIL_STEPS: 2, TRAIL_ALPHAS: [1.0, 0.52, 0.24, 0.09, 0.02], 
        BLOOM_INTENSITY: 1.0, GLOW_INTENSITY: 1.0, TRAIL_FADE: 0.5, 
        SHOW_STARS: true, SHOW_CORONA: true, SHOW_ORBITS: false, DAY_NIGHT_CYCLE: false 
    },
    overlay: { 
        GLASS_BLUR_PX: 10, GLASS_BG_COLOR: 'rgba(8, 8, 18, 0.88)', 
        GLASS_BORDER_COLOR: 'rgba(255, 255, 255, 0.18)', UI_OPACITY: 0.88, 
        SIDE_PANEL_WIDTH: 320, SLIDER_HEIGHT: 32, SLIDER_WIDTH: 124, 
        FONT_FAMILY: '"Space Mono", ui-monospace, monospace', FONT_SIZE_BASE: 11, 
        TEXT_COLOR: 'rgba(240, 245, 255, 0.92)', ACCENT_COLOR: 'rgba(130, 210, 255, 0.9)', 
        AUTO_HIDE_HUD: false, TOOLTIP_DELAY_MS: 500 
    },
    game: { 
        SUN_MASS: 182784, SUN_RADIUS: 240, SUN_BURN_RADIUS: 300, SPEED_MAX: 12, 
        AST_SPAWN_INTERVAL: 600, AST_MAX: 3, TENTACLE_MAX: 18, 
        RING_MIN_RADIUS: 16, RING_PARTICLES: 12, 
        INSTRUCTIONS: { title: "Galaxy Guardians", disclaimer: "Safe Mode Active", controls: [], tips: [] } 
    },
    audio: { 
        VOL_MASTER: 0.5, VOL_SFX: 0.7, VOL_MUSIC: 0.3, SFX_COLLISION: true, SFX_AMBIENT: true 
    }
};

// 2. TOAST NOTIFICATION SYSTEM (Standard JS, no template literals)
function showConfigErrorToast(profileName, errorMsg) {
    if (typeof document === 'undefined') return;
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);background:rgba(220,50,50,0.95);color:#fff;padding:14px 28px;border-radius:8px;font-family:monospace;font-size:13px;font-weight:bold;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:99999;text-align:center;border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(8px);';
    toast.innerHTML = '⚠️ CONFIG ERROR: Failed to load "' + profileName + '".<br><span style="font-weight:normal;font-size:11px;opacity:0.9;">Engine reverted to safe defaults. (' + errorMsg + ')</span>';
    document.body.appendChild(toast);
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease-out';
        setTimeout(function() { toast.remove(); }, 500);    }, 6000);
}

// 3. DEEP MERGE HELPER (Uses Object.assign, no optional chaining)
function getSafeProfile(profile) {
    var p = profile || {};
    return {
        physics: Object.assign({}, SAFE_FALLBACK.physics, p.physics || {}),
        render: Object.assign({}, SAFE_FALLBACK.render, p.render || {}),
        overlay: Object.assign({}, SAFE_FALLBACK.overlay, p.overlay || {}),
        game: Object.assign({}, SAFE_FALLBACK.game, p.game || {}),
        audio: Object.assign({}, SAFE_FALLBACK.audio, p.audio || {})
    };
}

// 4. IMPORT ALL PROFILES
var ACTIVE_PROFILE = "base";

import BasePhysics from './base/config-physics.js';
import BaseRender from './base/config-render.js';
import BaseOverlay from './base/config-overlay.js';
import BaseGame from './base/config-game.js';
import BaseAudio from './base/config-audio.js';

import OriginPhysics from './origin/config-physics.js';
import OriginRender from './origin/config-render.js';
import OriginOverlay from './origin/config-overlay.js';
import OriginGame from './origin/config-game.js';
import OriginAudio from './origin/config-audio.js';

import WinterPhysics from './seasonal-winter/config-physics.js';
import WinterRender from './seasonal-winter/config-render.js';
import WinterOverlay from './seasonal-winter/config-overlay.js';
import WinterGame from './seasonal-winter/config-game.js';
import WinterAudio from './seasonal-winter/config-audio.js';

var PROFILES = {
    "origin": { physics: OriginPhysics, render: OriginRender, overlay: OriginOverlay, game: OriginGame, audio: OriginAudio },
    "base": { physics: BasePhysics, render: BaseRender, overlay: BaseOverlay, game: BaseGame, audio: BaseAudio },
    "seasonal-winter": { physics: WinterPhysics, render: WinterRender, overlay: WinterOverlay, game: WinterGame, audio: WinterAudio }
};

// 5. SAFE LOADING & EXPORT
function loadProfile(profileName) {
    try {
        var profile = PROFILES[profileName];
        if (!profile) {
            throw new Error('Profile "' + profileName + '" not found in registry.');
        }
                var safeProfile = getSafeProfile(profile);
        
        if (!safeProfile.physics.TIMESTEP || !safeProfile.game.SUN_MASS) {
            throw new Error("Critical config values are missing or null after merge.");
        }

        console.log('[Config Router] Successfully loaded profile: "' + profileName + '"');
        return safeProfile;
        
    } catch (error) {
        console.error('[Config Router] Fallback triggered for "' + profileName + '":', error);
        showConfigErrorToast(profileName, error.message);
        return getSafeProfile(SAFE_FALLBACK);
    }
}

export var CONFIG = loadProfile(ACTIVE_PROFILE);

// 6. CSS INJECTION
function applyThemeToCSS() {
    var root = document.documentElement;
    var ui = CONFIG.overlay;
    root.style.setProperty('--glass-blur', ui.GLASS_BLUR_PX + 'px');
    root.style.setProperty('--glass-bg', ui.GLASS_BG_COLOR);
    root.style.setProperty('--glass-border', ui.GLASS_BORDER_COLOR);
    root.style.setProperty('--text-color', ui.TEXT_COLOR);
    root.style.setProperty('--accent-color', ui.ACCENT_COLOR);
    root.style.setProperty('--font-family', ui.FONT_FAMILY);
    root.style.setProperty('--slider-width', ui.SLIDER_WIDTH + 'px');
    root.style.setProperty('--slider-height', ui.SLIDER_HEIGHT + 'px');
    root.style.setProperty('--ui-bg', ui.GLASS_BG_COLOR);
    root.style.setProperty('--ui-border', ui.GLASS_BORDER_COLOR);
    root.style.setProperty('--ui-text', ui.TEXT_COLOR);
    root.style.setProperty('--ui-accent', ui.ACCENT_COLOR);
}
applyThemeToCSS();

// 7. DYNAMIC THEME SWITCHER
export function setTheme(profileName) {
    try {
        var newConfig = loadProfile(profileName);
        Object.assign(CONFIG, newConfig);
        applyThemeToCSS();
        console.log('[Config Router] Dynamically switched to profile: "' + profileName + '"');
        return true;
    } catch (error) {
        console.error('[Config Router] Failed to switch theme to "' + profileName + '":', error);
        return false;
    }
}