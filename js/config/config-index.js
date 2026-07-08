/**
 * js/config/config-index.js
 * CONFIGURATION LOADER & FAILSAFE
 *
 * Themes/multi-profile config are OUT OF USE. There is exactly one config
 * source now — Base (Factory Defaults) — merged against a hard-coded
 * SAFE_FALLBACK so a corrupted or incomplete Base file can never crash boot.
 *
 * This is NOT where user tuning lives. Live performance/tuning profiles
 * (Base/BALANCE, MAX, MIN, the user's saved profile, benchmarked "best"
 * results) are a separate system — see js/modules/debug/governor-profiles.js
 * and js/core/prefs-store.js. That system already is the real two-profile
 * model: Base (Factory Defaults) + the user profile created on startup if
 * none is found. This file has nothing to do with that and never should.
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
function showConfigErrorToast(errorMsg) {
    if (typeof document === 'undefined') return;
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);background:rgba(220,50,50,0.95);color:#fff;padding:14px 28px;border-radius:8px;font-family:monospace;font-size:13px;font-weight:bold;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:99999;text-align:center;border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(8px);';
    toast.innerHTML = '⚠️ CONFIG ERROR: Failed to load Base config.<br><span style="font-weight:normal;font-size:11px;opacity:0.9;">Engine reverted to safe defaults. (' + errorMsg + ')</span>';
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

// 4. IMPORT BASE — the only config source
import BasePhysics from './base/config-physics.js';
import BaseRender from './base/config-render.js';
import BaseOverlay from './base/config-overlay.js';
import BaseGame from './base/config-game.js';
import BaseAudio from './base/config-audio.js';

var BASE = { physics: BasePhysics, render: BaseRender, overlay: BaseOverlay, game: BaseGame, audio: BaseAudio };

// 5. SAFE LOADING & EXPORT
function loadBase() {
    try {
        var safeProfile = getSafeProfile(BASE);

        if (!safeProfile.physics.TIMESTEP || !safeProfile.game.SUN_MASS) {
            throw new Error("Critical config values are missing or null after merge.");
        }

        console.log('[Config] Base loaded (Factory Defaults).');
        return safeProfile;

    } catch (error) {
        console.error('[Config] Fallback triggered:', error);
        showConfigErrorToast(error.message);
        return getSafeProfile(SAFE_FALLBACK);
    }
}

export var CONFIG = loadBase();

// 6. CSS INJECTION
function applyConfigToCSS() {
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
applyConfigToCSS();
