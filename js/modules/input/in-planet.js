/**
 * js/modules/input/in-planet.js
 * Handles Planet Spawning (Hold to charge, release to spawn).
 */
import { CameraModule } from '../camera/camera.module.js';
import { InputState } from './input.module.js';

export const InPlanet = {
  cursorEl: null,
  slider: null,
  pcountEl: null,
  
  init(canvas, cursorEl, slider, pcountEl) {
    this.cursorEl = cursorEl;
    this.slider = slider;
    this.pcountEl = pcountEl;
  },
  
  handleDown(e) {
    // Only left click (button 0) or touch
    if (e.button !== 0 && e.pointerType !== 'touch') return false;
    
    InputState.isHolding = true;
    InputState.holdTime = performance.now();
    InputState.mouseX = e.clientX;
    InputState.mouseY = e.clientY;
    
    // CRITICAL: Prevent browser from intercepting touch as scroll gesture
    if (e.cancelable) e.preventDefault();
    
    if (this.cursorEl) this.cursorEl.classList.add('holding');
    return true; // CONSUMED
  },
  
  handleMove(e) {
    if (!InputState.isHolding) return false;
    
    // Update coordinates so charge ring follows finger/cursor
    InputState.mouseX = e.clientX;
    InputState.mouseY = e.clientY;
    
    // Keep preventing default to ensure drag isn't interrupted
    if (e.cancelable) e.preventDefault();
    return true; // CONSUMED
  },
  
  handleUp(e) {
    // If we were holding, ALWAYS release regardless of button type
    if (!InputState.isHolding) return false;
    
    InputState.isHolding = false;
    if (this.cursorEl) this.cursorEl.classList.remove('holding');
    
    this._spawnPlanet();
    return true; // CONSUMED
  },
  
  _spawnPlanet() {
    const charge = Math.min((performance.now() - InputState.holdTime) / 2000, 1);
    const sliderVal = parseFloat(this.slider.value);
    const raw = sliderVal * (1 + charge * 4);
    const t = Math.min(raw / 50, 1);
    const multiplier = 0.25 + 2.25 * Math.pow(t, 1.4);
    const radius = Math.max(10, Math.min(110, Math.round(40 * multiplier)));
    
    const w = CameraModule.screenToWorld(InputState.mouseX, InputState.mouseY);
    
    import('../ui/overlays.js').then((module) => {
      module.OverlaysModule.spawnPlanet(w.x, w.y, radius / 8, this.pcountEl);
    });
  }
};