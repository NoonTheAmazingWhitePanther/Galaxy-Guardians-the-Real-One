/**
 * js/modules/input/in-keyboard.js
 * All keyboard listeners. Single source of truth for keyboard input.
 *
 * DESIGN:
 * - Tracks held keys with timestamps
 * - Throttled tick at TICK_MS for hold actions (~30fps)
 * - Tap = press+release under TAP_MS
 * - Case-aware: 'a' vs 'A' (shift or CapsLock)
 * - Combo-aware: 'ctrl+z', 'w+a', 'ctrl+shift+z'
 * - enable() / disable() cleanly bind and unbind everything
 * - Always enabled for now — input.module.js calls enable() on init
 */
import { clamp } from '../../core/math.js';
import { CameraModule } from '../camera/camera.module.js';
import { ConfigMenuModule } from '../ui/config-menu.js';
import { ButtonRegistry } from '../../core/button-registry.js';

// ── Constants ──────────────────────────────────────────────────────────────
const TICK_MS = 33;   // hold-action repeat rate (~30fps)
const TAP_MS  = 180;  // max duration to count as a tap

const MODIFIERS = new Set(['control', 'shift', 'alt', 'meta']);

// ── Internal State ─────────────────────────────────────────────────────────
const held     = new Map(); // key → { since, lastTick }
const bindings = new Map(); // comboString → { on, fn }

let _enabled   = false;
let _tickTimer = null;
let _downRef   = null;
let _upRef     = null;

// ── Helpers ────────────────────────────────────────────────────────────────
const _norm = (k) => k.toLowerCase();

const _activeCombo = () => {
  const mods = [], keys = [];
  for (const k of held.keys()) {
    if (MODIFIERS.has(k)) mods.push(k === 'control' ? 'ctrl' : k);
    else keys.push(k);
  }
  mods.sort(); keys.sort();
  return [...mods, ...keys].join('+');
};

const _caseKey = (e) => {
  if (e.key.length !== 1) return e.key.toLowerCase();
  return (e.shiftKey || e.getModifierState?.('CapsLock')) ? e.key.toUpperCase() : e.key.toLowerCase();
};

// ── Tick ───────────────────────────────────────────────────────────────────
const _tick = () => {
  if (!_enabled || held.size === 0) return;
  const now  = performance.now();
  const combo = _activeCombo();

  // Full combo match first
  if (bindings.has(combo)) {
    const b = bindings.get(combo);
    if (b.on === 'hold' || b.on === 'both') b.fn({ combo, held, tap: false });
    return;
  }

  // Individual held keys
  for (const [k, info] of held) {
    if (MODIFIERS.has(k)) continue;
    if (now - info.since < TAP_MS) continue; // still in tap window
    const entry = bindings.get(k);
    if (entry && (entry.on === 'hold' || entry.on === 'both'))
      entry.fn({ key: k, held, tap: false });
  }
};

// ── Raw Listeners ──────────────────────────────────────────────────────────
const _onDown = (e) => {
  if (!_enabled) return;
  
  // Check if this is a button hotkey first
  if (ButtonRegistry.dispatchHotkey(e.key)) {
    e.preventDefault();
    return;
  }
  
  const raw = _norm(e.key);
  if (!held.has(raw)) held.set(raw, { since: performance.now() });
  const combo = _activeCombo();
  if (bindings.has(combo)) e.preventDefault();
};

const _onUp = (e) => {
  if (!_enabled) return;
  const raw  = _norm(e.key);
  const info = held.get(raw);
  if (!info) return;

  const duration = performance.now() - info.since;
  const isTap    = duration < TAP_MS;
  const cased    = _caseKey(e);
  const combo    = _activeCombo();

  if (isTap) {
    // Priority: cased key ('A') → combo ('ctrl+z') → plain ('a')
    const match = bindings.get(cased) || bindings.get(combo) || bindings.get(raw);
    if (match && (match.on === 'tap' || match.on === 'both'))
      match.fn({ key: cased, combo, held, tap: true, duration });
  }

  held.delete(raw);
};

// ── Public API ─────────────────────────────────────────────────────────────
export const InKeyboard = {

  bind(key, on, fn) {
    bindings.set(key, { on, fn });
  },

  unbind(key) {
    bindings.delete(key);
  },

  isHeld(key)  { return held.has(_norm(key)); },
  heldMs(key)  { const i = held.get(_norm(key)); return i ? performance.now() - i.since : 0; },
  pressure(key, maxMs = 2000) { return Math.min(this.heldMs(key) / maxMs, 1); },

  get heldKeys()   { return [...held.keys()]; },
  get activeCombo(){ return _activeCombo(); },
  get enabled()    { return _enabled; },

  enable() {
    if (_enabled) return;
    _enabled  = true;
    _downRef  = _onDown;
    _upRef    = _onUp;
    window.addEventListener('keydown', _downRef);
    window.addEventListener('keyup',   _upRef);
    _tickTimer = setInterval(_tick, TICK_MS);
    console.log('[InKeyboard] enabled');
  },

  disable() {
    if (!_enabled) return;
    _enabled = false;
    window.removeEventListener('keydown', _downRef);
    window.removeEventListener('keyup',   _upRef);
    clearInterval(_tickTimer);
    held.clear();
    console.log('[InKeyboard] disabled');
  }
};

// ── Bindings ───────────────────────────────────────────────────────────────
// Camera zoom
InKeyboard.bind('=', 'tap', () => {
  CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom * 1.2, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
});
InKeyboard.bind('+', 'tap', () => {
  CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom * 1.2, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
});
InKeyboard.bind('-', 'tap', () => {
  CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom / 1.2, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
});

// Camera reset
InKeyboard.bind('0', 'tap', () => {
  CameraModule.cam.targetZoom = 1;
  CameraModule.cam.x = 0;
  CameraModule.cam.y = 0;
});
InKeyboard.bind('r', 'tap', () => {
  CameraModule.cam.targetZoom = 1;
  CameraModule.cam.x = 0;
  CameraModule.cam.y = 0;
});

// Frame bodies
InKeyboard.bind('f', 'tap', () => {
  CameraModule.frameBodies();
});

// WASD pan — no caps = normal speed, caps/shift = fast
const PAN_SPEED      = 8;
const PAN_SPEED_FAST = 24;

InKeyboard.bind('w', 'hold', () => { CameraModule.cam.y -= PAN_SPEED / CameraModule.cam.zoom; });
InKeyboard.bind('s', 'hold', () => { CameraModule.cam.y += PAN_SPEED / CameraModule.cam.zoom; });
InKeyboard.bind('a', 'hold', () => { CameraModule.cam.x -= PAN_SPEED / CameraModule.cam.zoom; });
InKeyboard.bind('d', 'hold', () => { CameraModule.cam.x += PAN_SPEED / CameraModule.cam.zoom; });

InKeyboard.bind('W', 'hold', () => { CameraModule.cam.y -= PAN_SPEED_FAST / CameraModule.cam.zoom; });
InKeyboard.bind('S', 'hold', () => { CameraModule.cam.y += PAN_SPEED_FAST / CameraModule.cam.zoom; });
InKeyboard.bind('A', 'hold', () => { CameraModule.cam.x -= PAN_SPEED_FAST / CameraModule.cam.zoom; });
InKeyboard.bind('D', 'hold', () => { CameraModule.cam.x += PAN_SPEED_FAST / CameraModule.cam.zoom; });

// Escape — close config menu
InKeyboard.bind('escape', 'tap', () => {
  const menu = document.getElementById('config-menu');
  if (menu && menu.style.display !== 'none') {
    ConfigMenuModule.isOpen = false;
    menu.style.display = 'none';
  }
});

// Tab — toggle AIMS on/off
InKeyboard.bind('tab', 'tap', () => {
  const a = window._InAims;
  if (!a) return;
  if (a.enabled) a.disable();
  else           a.enable();
  console.log('[InKeyboard] AIMS ' + (a.enabled ? 'ON' : 'OFF'));
});
