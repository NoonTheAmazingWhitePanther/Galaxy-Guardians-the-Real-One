/**
 * js/modules/debug/draw-call-counter.js
 * Pure data counter for Canvas 2D draw calls.
 */
export const DrawCallCounter = {
  calls: {},
  drawCalls: 0,
  pathOps: 0,
  _installed: false,
  _resetBeforeNextDraw: true,
  
  install() {
    if (this._installed) return;
    this._installed = true;
    const self = this;
    
    const drawMethods = ['fill', 'fillRect', 'stroke', 'strokeRect', 'drawImage', 'fillText', 'strokeText', 'clearRect'];
    for (const name of drawMethods) {
      const orig = CanvasRenderingContext2D.prototype[name];
      if (!orig) continue;
      CanvasRenderingContext2D.prototype[name] = function(...args) {
        if (self._resetBeforeNextDraw) {
          self._resetBeforeNextDraw = false;
          self._resetCounts();
        }
        self.calls[name] = (self.calls[name] || 0) + 1;
        self.drawCalls++;
        return orig.apply(this, args);
      };
    }
    
    const pathMethods = ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'bezierCurveTo', 'quadraticCurveTo', 'rect', 'ellipse', 'roundRect'];
    for (const name of pathMethods) {
      const orig = CanvasRenderingContext2D.prototype[name];
      if (!orig) continue;
      CanvasRenderingContext2D.prototype[name] = function(...args) {
        self.pathOps++;
        return orig.apply(this, args);
      };
    }
    console.log('[DrawCallCounter] installed');
  },
  
  reset() {
    this._resetBeforeNextDraw = true;
    this._resetCounts();
  },
  
  uninstall() {
    if (!this._installed) return;
    this._installed = false;
    this.drawCalls = 0;
    this.pathOps = 0;
    this.calls = {};
  },
  
  _resetCounts() {
    this.calls = {};
    this.drawCalls = 0;
    this.pathOps = 0;
  },
};