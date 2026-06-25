/**
 * js/modules/debug/draw-call-counter.js
 *
 * Direct instrumentation counter — NO prototype patching.
 *
 * renderer.js calls:
 *   DrawCallCounter.beginFrame()        — start of DrawAll
 *   DrawCallCounter.countPass(name, probe)  — after each named pass
 *   DrawCallCounter.endFrame()          — end of DrawAll
 *
 * The panel reads:
 *   .total        — total draw calls this frame
 *   .pathOps      — total path ops this frame
 *   .passes       — { passName: { draws, paths, methods: {...} } }
 *   .passRows     — flat object for displayMap: { 'stars ∙ fill': 3, ... }
 *   .methodTotals — { fill: N, stroke: N, arc: N, ... } across all passes
 *
 * Zero overhead when DebugRouter.masterEnabled is false.
 */

function _debugOn() {
  return window._DebugRouter?.masterEnabled ?? true;
}

export const DrawCallCounter = {
  total:        0,
  pathOps:      0,
  passes:       {},
  passRows:     {},   // flat — for displayMap per-row
  methodTotals: {},   // sum across all passes per method name

  _total:   0,
  _pathOps: 0,
  _passes:  {},

  beginFrame() {
    if (!_debugOn()) return;
    this._total   = 0;
    this._pathOps = 0;
    this._passes  = {};
  },

  /**
   * @param {string}    name   — pass label e.g. 'bodies'
   * @param {PassProbe} probe  — probe instance after the pass ran
   */
  countPass(name, probe) {
    if (!_debugOn()) return;
    this._total   += probe.draws;
    this._pathOps += probe.paths;
    this._passes[name] = {
      draws:   probe.draws,
      paths:   probe.paths,
      methods: { ...probe.methodCounts },
    };
  },

  endFrame() {
    if (!_debugOn()) return;
    this.total   = this._total;
    this.pathOps = this._pathOps;
    this.passes  = { ...this._passes };

    // Build flat passRows for displayMap
    const rows    = {};
    const totals  = {};

    for (const [pass, data] of Object.entries(this._passes)) {
      // Per-pass draw / path summary
      rows[`${pass} ∙ draws`] = data.draws;
      rows[`${pass} ∙ paths`] = data.paths;

      // Per-pass individual method counts (only non-zero)
      for (const [method, count] of Object.entries(data.methods)) {
        if (count > 0) {
          rows[`${pass} ∙ ${method}`] = count;
          totals[method] = (totals[method] || 0) + count;
        }
      }
    }

    this.passRows     = rows;
    this.methodTotals = totals;
  },

  reset() {
    this.total        = 0;
    this.pathOps      = 0;
    this.passes       = {};
    this.passRows     = {};
    this.methodTotals = {};
    this._total       = 0;
    this._pathOps     = 0;
    this._passes      = {};
  },
};

// ── PassProbe ─────────────────────────────────────────────────────────────
// Wraps a canvas context to count every draw and path method call
// for one render pass. No prototype patching — this is a Proxy on ONE ctx.

const DRAW_METHODS = [
  'fill', 'fillRect', 'stroke', 'strokeRect',
  'drawImage', 'fillText', 'strokeText', 'clearRect',
];
const PATH_METHODS = [
  'beginPath', 'closePath', 'moveTo', 'lineTo',
  'arc', 'arcTo', 'bezierCurveTo', 'quadraticCurveTo',
  'rect', 'ellipse', 'roundRect',
];
const ALL_TRACKED = new Set([...DRAW_METHODS, ...PATH_METHODS]);

export class PassProbe {
  constructor(ctx) {
    this.draws        = 0;
    this.paths        = 0;
    this.methodCounts = {};   // { fill: 3, arc: 41, ... }

    // Initialise all counters at zero so displayMap shows them even if unused
    for (const m of ALL_TRACKED) this.methodCounts[m] = 0;

    const self = this;
    const handler = {
      get(target, prop) {
        if (ALL_TRACKED.has(prop)) {
          const isDraw = DRAW_METHODS.includes(prop);
          return function(...args) {
            self.methodCounts[prop]++;
            if (isDraw) self.draws++;
            else        self.paths++;
            return target[prop].apply(target, args);
          };
        }
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    };

    this.ctx = new Proxy(ctx, handler);
  }
}

export default DrawCallCounter;
