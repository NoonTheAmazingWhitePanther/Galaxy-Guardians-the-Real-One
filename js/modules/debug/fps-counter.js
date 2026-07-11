/**
 * js/modules/debug/fps-counter.js
 *
 * Tracks real FPS, virtual FPS, and rolling averages.
 *
 * Frame skip is now expressed as "N out of BASE" — e.g. skip=1, base=60
 * means roughly 1 in every 60 frames is dropped, evenly distributed
 * (see RenderGov.shouldRender's accumulator). This is finer-grained
 * than the old "skip N consecutive" model and works smoothly even
 * with bases beyond the display's actual Hz (480, 960).
 *
 * "Virtual FPS" = realFps × BASE / (BASE - skip)
 * e.g. 60 real fps, skip=1, base=60 → 60 × 60/59 ≈ 61 virtual fps
 *      60 real fps, skip=30, base=60 → 60 × 60/30 = 120 virtual fps
 *
 * Feed every rAF tick via FpsCounter.tick(now, frameSkip, base).
 * Read .debugInfo for the panel.
 */

const RING = 120; // rolling window — one entry per SECOND (ring is fed inside the
                  // 1000ms update gate below), so this is a ~2-MINUTE average.
                  // The old comment claimed "2 seconds at 60fps" — that was the
                  // per-frame-feed assumption, never the behavior. Kept at 120:
                  // it is a display smoothing window, not a caching route — the
                  // benchmark no longer reads it (measures directly, isolated).

export const FpsCounter = {
  // public readable state
  realFps:        0,
  virtualFps:     0,
  avgReal:        0,
  avgVirtual:     0,
  minReal:        Infinity,
  maxReal:        0,
  frameSkip:      0,
  skipBase:       60,
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
   * @param {number} frameSkip  — current RenderGov.frameSkip value (N out of base)
   * @param {number} base       — current RenderGov.BASE (60/120/240/480/960)
   */
  tick(now, frameSkip, base = 60) {
    if (!this._initialized) {
      this._lastTime    = now;
      this._initialized = true;
    }

    this.frameSkip = frameSkip;
    this.skipBase  = base;
    this.totalFrames++;
    this._frameCount++;

    const elapsed = now - this._lastTime;

    // Update once per second
    if (elapsed >= 1000) {
      const real    = (this._frameCount * 1000) / elapsed;
      const denom   = Math.max(1, base - frameSkip);
      const virtual = real * base / denom;

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
      skipBase:    this.skipBase,
      totalFrames: this.totalFrames,
      // "1/60" = skip 1 out of every 60 frames
      skipFraction:   `${this.frameSkip}/${this.skipBase}`,
      // "59/60" = 59 actually rendered out of every 60
      renderedFraction: `${Math.max(0, this.skipBase - this.frameSkip)}/${this.skipBase}`,
      skipLabel:   this.frameSkip === 0 ? 'FULL' : `${this.frameSkip}/${this.skipBase}`,
    };
  }
};

export default FpsCounter;
