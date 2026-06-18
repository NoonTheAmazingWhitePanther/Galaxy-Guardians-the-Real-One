/**
 * js/modules/debug/debug-style.js
 * Pure visual dictionary mirroring styles.css and CONFIG.overlay.
 */
export const DEBUG_STYLE = {
  // Colors
  bg: 'rgba(8, 8, 18, 0.88)',
  border: 'rgba(255, 255, 255, 0.18)',
  text: 'rgba(240, 245, 255, 0.92)',
  textDim: 'rgba(240, 245, 255, 0.6)',
  textFaint: 'rgba(240, 245, 255, 0.4)',
  accent: 'rgba(130, 210, 255, 0.9)',
  
  // Typography
  font: '"Space Mono", ui-monospace, monospace',
  fontSize: 11,
  
  // Spacing & Layout
  padX: 10,
  padY: 6,
  radius: 10,
  lineHeight: 15, // fontSize + 4
  labelW: 95,
  valW: 45,
  
  // Effects
  shadowBlur: 12,
  shadowOffsetY: 4,
  shadowColor: 'rgba(0, 0, 0, 0.4)',
  
  // UI Controls (for drag/resize handles)
  handleSize: 12,
  headerHeight: 24,
};

// Resolution selector for the offscreen canvas (1.0 = native, 0.5 = half res for performance)
export const DEBUG_RESOLUTION_SCALE = 1.0;