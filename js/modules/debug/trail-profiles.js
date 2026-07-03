/**
 * js/modules/debug/trail-profiles.js
 *
 * DREAMY TRAILS — presets for the phosphor trail knobs.
 *
 * Same shape as GovernorProfiles, but scoped to the trail family so it can be
 * driven by its own profileButtons row on the TRAILS panel. Each preset sets
 * every trail key via ManualOverrides.set() (marking them manual), so applying
 * one restores a whole look in a single tap.
 *
 * The dreaminess dial is mostly: trailMax (length), trailGlowDepth (phosphor
 * persistence), and trailGlowFade (LOWER = the tail lingers longer), lifted by
 * trailBloom (glow) and shaped by trailShrink (comet taper).
 *
 *   LONG    — full dreamscape: long, deep, glowing, slow-fading phosphor
 *   NORMAL  — a balanced trail with a soft tail
 *   SHORT   — tight, crisp, barely-there
 *   EASE    — "Ease Out": the smallest hint of dreamy — short, but the tail
 *             tapers and fades gently rather than cutting off
 */
import { ManualOverrides } from './governor.js';

const TRAIL_PROFILES = {
  LONG: {
    trailEnabled: 1, trailMax: 130, trailDensity: 64, trailAlpha: 0.5,
    trailSpeedScale: 0.5, trailSkip: 1, trailShrink: 0.4, trailBloom: 0.5,
    trailDownscale: 0, trailGlowDepth: 16, trailGlowFade: 0.12,
  },
  NORMAL: {
    trailEnabled: 1, trailMax: 48, trailDensity: 24, trailAlpha: 0.55,
    trailSpeedScale: 0.25, trailSkip: 1, trailShrink: 0.25, trailBloom: 0.25,
    trailDownscale: 0, trailGlowDepth: 10, trailGlowFade: 0.4,
  },
  SHORT: {
    trailEnabled: 1, trailMax: 16, trailDensity: 12, trailAlpha: 0.6,
    trailSpeedScale: 0, trailSkip: 1, trailShrink: 0.15, trailBloom: 0.1,
    trailDownscale: 0, trailGlowDepth: 6, trailGlowFade: 0.6,
  },
  EASE: {
    trailEnabled: 1, trailMax: 10, trailDensity: 10, trailAlpha: 0.4,
    trailSpeedScale: 0, trailSkip: 1, trailShrink: 0.6, trailBloom: 0.15,
    trailDownscale: 0, trailGlowDepth: 8, trailGlowFade: 0.3,
  },
};

const KEYS = Object.keys(TRAIL_PROFILES.LONG);

export const TrailProfiles = {
  _active: null,

  applyProfile(name) {
    const profile = TRAIL_PROFILES[name];
    if (!profile) { console.warn(`[TrailProfiles] Unknown profile: ${name}`); return; }
    for (const [key, value] of Object.entries(profile)) ManualOverrides.set(key, value);
    this._active = name;
    console.log(`[TrailProfiles] Applied: ${name}`);
  },

  resetAll() {
    for (const key of KEYS) ManualOverrides.reset(key);
    this._active = null;
    console.log('[TrailProfiles] Reset to AUTO');
  },

  // Active profile name — null if any trail key has diverged since it was set.
  get activeProfile() {
    if (!this._active) return null;
    const profile = TRAIL_PROFILES[this._active];
    for (const [key, value] of Object.entries(profile)) {
      if (!ManualOverrides.isManual(key)) return null;
      if (Math.abs(ManualOverrides.get(key, value) - value) > 1e-6) return null;
    }
    return this._active;
  },

  get profiles() { return Object.keys(TRAIL_PROFILES); },
};

export default TrailProfiles;
