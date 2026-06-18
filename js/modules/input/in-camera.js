/**
 * js/modules/input/in-camera.js
 * Handles Camera Panning, Wheel Zoom, and Pinch Zoom.
 */
import { clamp } from '../../core/math.js';
import { CameraModule } from '../camera/camera.module.js';
import { InputState } from './input.module.js';

export const InCamera = {
  pinchDist0: 0, pinchZoom0: 1, pinchMidX: 0, pinchMidY: 0,

  init: function(canvas) {
    // Touch Pinch Zoom Setup
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const a = e.touches[0], b = e.touches[1];
        this.pinchDist0 = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        this.pinchZoom0 = CameraModule.cam.targetZoom;
        this.pinchMidX = (a.clientX + b.clientX) / 2; 
        this.pinchMidY = (a.clientY + b.clientY) / 2;
        e.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const a = e.touches[0], b = e.touches[1];
        const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        const newZoom = clamp(this.pinchZoom0 * dist / this.pinchDist0, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
        const wb = CameraModule.screenToWorld(this.pinchMidX, this.pinchMidY);
        
        CameraModule.cam.targetZoom = newZoom;
        CameraModule.cam.x = wb.x - (this.pinchMidX - CameraModule.width / 2) / newZoom;
        CameraModule.cam.y = wb.y - (this.pinchMidY - CameraModule.height / 2) / newZoom;
        e.preventDefault();
      }
    }, { passive: false });
  },

  handleDown: function(e) {
    // Middle or Right click to pan
    if (e.button === 1 || e.button === 2) {
      CameraModule.isPanning = true;
      CameraModule.panStart = { x: InputState.mouseX, y: InputState.mouseY };
      CameraModule.camStart = { x: CameraModule.cam.x, y: CameraModule.cam.y };
      e.preventDefault();
      return true; // CONSUMED
    }
    return false;
  },

  handleMove: function() {
    if (CameraModule.isPanning) {
      CameraModule.cam.x = CameraModule.camStart.x - (InputState.mouseX - CameraModule.panStart.x) / CameraModule.cam.zoom;
      CameraModule.cam.y = CameraModule.camStart.y - (InputState.mouseY - CameraModule.panStart.y) / CameraModule.cam.zoom;
      return true; // CONSUMED
    }
    return false;
  },

  handleUp: function(e) {
    if (e.button === 1 || e.button === 2) {
      CameraModule.isPanning = false;
      return true;
    }
    return false;
  },

  handleWheel: function(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = clamp(CameraModule.cam.targetZoom * factor, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
    const wb = CameraModule.screenToWorld(e.clientX, e.clientY); 
    
    CameraModule.cam.targetZoom = newZoom;
    CameraModule.cam.x = wb.x - (e.clientX - CameraModule.width / 2) / newZoom;
    CameraModule.cam.y = wb.y - (e.clientY - CameraModule.height / 2) / newZoom;
    return true; // CONSUMED
  },

  handleKey: function(e) {
    if (e.key === '=' || e.key === '+') CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom * 1.2, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
    if (e.key === '-') CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom / 1.2, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
    if (e.key === '0' || e.key === 'r') { CameraModule.cam.targetZoom = 1; CameraModule.cam.x = 0; CameraModule.cam.y = 0; }
    if (e.key === 'f') CameraModule.frameBodies();
  }
};