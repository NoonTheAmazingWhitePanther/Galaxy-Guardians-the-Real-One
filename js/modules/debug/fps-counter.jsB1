/**
 * js/modules/debug/fps-counter.js
 *
 * Tracks real FPS, virtual FPS, and rolling averages.
 *
 * "Virtual FPS" = realFps × (frameSkip + 1)
 * The render governor skips N frames between draws, so the simulation
 * is running at a higher effective rate than what hits the screen.
 * e.g. 60 real fps with frameSkip=1 → 120 virtual fps.
 *
 * Feed every rAF tick via FpsCounter.tick(frameSkip).
 * Read .debugInfo for the panel.
 */

const RING = 120; // rolling window — 2 seconds at 60fps

export const FpsCounter = {
  // public readable state
  realFps:        0,
  virtualFps:     0,
  avgReal:        0,
  avgVirtual:     0,
  minReal:        Infinity,
  maxReal:        0,
  frameSkip:      0,
  totalFrames:    0,

  // internals
  _ring:          new Float32Array(RING),
  _ringV:         new Float32Array(RING),
  _ringIdx:       0,
  _ringFull:      false,
  _frameCount:    0,
  _lastTime:      0,
  _initialized:   false,

  /**
   * Call once per rAF, before anything else.
   * @param {number} now        — performance.now()
   * @param {number} frameSkip  — current RenderGov.frameSkip value
   */
  tick(now, frameSkip) {
    if (!this._initialized) {
      this._lastTime    = now;
      this._initialized = true;
    }

    this.frameSkip = frameSkip;
    this.totalFrames++;
    this._frameCount++;

    const elapsed = now - this._lastTime;

    // Update once per second
    if (elapsed >= 1000) {
      const real    = (this._frameCount * 1000) / elapsed;
      const virtual = real * (frameSkip + 1);

      this.realFps    = +real.toFixed(1);
      this.virtualFps = +virtual.toFixed(1);

      // min/max (real only)
      if (real < this.minReal) this.minReal = +real.toFixed(1);
      if (real > this.maxReal) this.maxReal = +real.toFixed(1);

      // rolling ring
      this._ring[this._ringIdx]  = real;
      this._ringV[this._ringIdx] = virtual;
      this._ringIdx = (this._ringIdx + 1) % RING;
      if (this._ringIdx === 0) this._ringFull = true;

      const len = this._ringFull ? RING : this._ringIdx;
      let sumR = 0, sumV = 0;
      for (let i = 0; i < len; i++) { sumR += this._ring[i]; sumV += this._ringV[i]; }
      this.avgReal    = +(sumR / len).toFixed(1);
      this.avgVirtual = +(sumV / len).toFixed(1);

      this._frameCount = 0;
      this._lastTime   = now;
    }
  },

  reset() {
    this.realFps     = 0;
    this.virtualFps  = 0;
    this.avgReal     = 0;
    this.avgVirtual  = 0;
    this.minReal     = Infinity;
    this.maxReal     = 0;
    this._frameCount = 0;
    this._ringIdx    = 0;
    this._ringFull   = false;
    this._initialized = false;
  },

  get debugInfo() {
    return {
      real:        this.realFps,
      virtual:     this.virtualFps,
      avgReal:     this.avgReal,
      avgVirtual:  this.avgVirtual,
      min:         this.minReal === Infinity ? 0 : this.minReal,
      max:         this.maxReal,
      frameSkip:   this.frameSkip,
      totalFrames: this.totalFrames,
      skipLabel:   this.frameSkip === 0 ? 'FULL' : `1 of ${this.frameSkip + 1}`,
    };
  }
};

export default FpsCounter;
