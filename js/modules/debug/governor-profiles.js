/**
 * js/modules/debug/governor-profiles.js
 *
 * Profiles for ManualOverrides — MAX / BALANCE / MIN.
 * Each profile sets every known ManualOverrides key via ManualOverrides.set(),
 * marking them all as manual so the engine uses the profile values.
 *
 * applyProfile(name)  — apply a named profile
 * resetAll()          — reset all keys to AUTO
 * activeProfile       — current profile name or null if any key diverged (MANUAL)
 * label               — what the panel header shows
 */
import { ManualOverrides } from './governor.js';

const PROFILES = {
  MAX: {
    physicsSubsteps:         16,
    physicsTimeScale:        1.0,
    renderFrameSkip:         0,
    queOpsBudget:            256,
    queOpsDelay:             0.1,
    queOpsDeferredThreshold: 100,
    queOpsSkippedThreshold:  40,
    cacheVaultSize:          480,
    cacheSnapshotInterval:   1,
  },
  BALANCE: {
    physicsSubsteps:         6,
    physicsTimeScale:        1.0,
    renderFrameSkip:         0,
    queOpsBudget:            128,
    queOpsDelay:             0.2,
    queOpsDeferredThreshold: 50,
    queOpsSkippedThreshold:  20,
    cacheVaultSize:          240,
    cacheSnapshotInterval:   1,
  },
  MIN: {
    physicsSubsteps:         2,
    physicsTimeScale:        1.0,
    renderFrameSkip:         6,
    queOpsBudget:            32,
    queOpsDelay:             0.5,
    queOpsDeferredThreshold: 20,
    queOpsSkippedThreshold:  8,
    cacheVaultSize:          60,
    cacheSnapshotInterval:   2,
  },
};

export const GovernorProfiles = {
  _active: 'BALANCE',   // start on BALANCE

  /**
   * Apply a named profile. Sets all keys via ManualOverrides.set().
   * @param {'MAX'|'BALANCE'|'MIN'} name
   */
  applyProfile(name) {
    const profile = PROFILES[name];
    if (!profile) {
      console.warn(`[GovernorProfiles] Unknown profile: ${name}`);
      return;
    }
    for (const [key, value] of Object.entries(profile)) {
      ManualOverrides.set(key, value);
    }
    this._active = name;
    console.log(`[GovernorProfiles] Applied: ${name}`);
  },

  /**
   * Reset all keys to AUTO — engine governs everything.
   */
  resetAll() {
    for (const key of Object.keys(PROFILES.MAX)) {
      ManualOverrides.reset(key);
    }
    this._active = null;
    console.log('[GovernorProfiles] All keys → AUTO');
  },

  /**
   * Check if any key has been manually changed since the profile was applied.
   * If yes, the profile is considered dirty.
   */
  get isDirty() {
    if (!this._active) return false;
    const profile = PROFILES[this._active];
    for (const [key, value] of Object.entries(profile)) {
      if (ManualOverrides[key]?.value !== value) return true;
    }
    return false;
  },

  /**
   * Active profile name — null if no profile applied.
   */
  get activeProfile() {
    return this._active;
  },

  /**
   * Label shown in the panel header and summary.
   * Shows "MAX + MANUAL", "BALANCE", "AUTO", etc.
   */
  get label() {
    const anyManual = Object.keys(PROFILES.MAX)
      .some(k => ManualOverrides[k]?.isManual);

    if (!anyManual) return 'AUTO';
    if (!this._active) return 'MANUAL';
    if (this.isDirty) return `${this._active} + MANUAL`;
    return this._active;
  },

  /**
   * Expose profile key list for future use (adding new keys).
   */
  get keys() {
    return Object.keys(PROFILES.MAX);
  },

  /**
   * Profiles object — for panel display.
   */
  get profiles() {
    return PROFILES;
  },

  /**
   * Fold benchmarked best preferences into the Base (BALANCE) profile — the one
   * all others and future user profiles inherit from. Only overwrites keys the
   * profile already owns, so unknown keys can't corrupt the profile shape.
   */
  setBase(baseMap) {
    if (!baseMap || typeof baseMap !== 'object') return;
    for (const key of Object.keys(PROFILES.BALANCE)) {
      if (key in baseMap && Number.isFinite(+baseMap[key])) {
        PROFILES.BALANCE[key] = +baseMap[key];
      }
    }
    console.log('[GovernorProfiles] Base (BALANCE) updated from benchmark');
  },
};

export default GovernorProfiles;

// Apply BALANCE on startup — all governors start at balanced settings
GovernorProfiles.applyProfile('BALANCE');
