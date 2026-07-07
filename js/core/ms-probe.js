/**
 * js/core/ms-probe.js
 * ─────────────────────────────────────────────────────────────────────────
 * Millisecond function profiler.
 *
 * Wraps any function — sync or async — and records how long it took.
 * Results accumulate in a ring buffer per probe label.
 * Read stats at any time. Zero dependencies. Drop into any project.
 *
 * USAGE:
 *   import { MsProbe } from './core/ms-probe.js';
 *
 *   // Wrap once at call site:
 *   const result = MsProbe.call('physics.tick', () => tickBodies(dt));
 *
 *   // Async functions work identically:
 *   const data = await MsProbe.callAsync('fetch.config', () => fetch(url));
 *
 *   // Or wrap a function permanently (returns a new function):
 *   const timedTick = MsProbe.wrap('physics.tick', tickBodies);
 *   timedTick(dt); // measured every call
 *
 *   // Read results:
 *   MsProbe.stats('physics.tick');
 *   // → { label, calls, last, avg, min, max, total }
 *
 *   MsProbe.all();
 *   // → array of stats for every registered label
 *
 *   MsProbe.reset('physics.tick'); // clear one
 *   MsProbe.resetAll();            // clear all
 * ─────────────────────────────────────────────────────────────────────────
 */

const RING_SIZE = 60; // rolling window — last N samples for avg/min/max

function _makeEntry() {
  return {
    calls:   0,
    last:    0,
    total:   0,
    min:     Infinity,
    max:     0,
    _ring:   new Float32Array(RING_SIZE),
    _ringIdx: 0,
    _ringFull: false,
  };
}

function _record(entry, ms) {
  entry.calls++;
  entry.last  = ms;
  entry.total += ms;
  if (ms < entry.min) entry.min = ms;
  if (ms > entry.max) entry.max = ms;

  entry._ring[entry._ringIdx] = ms;
  entry._ringIdx = (entry._ringIdx + 1) % RING_SIZE;
  if (entry._ringIdx === 0) entry._ringFull = true;
}

function _avg(entry) {
  const len = entry._ringFull ? RING_SIZE : entry._ringIdx;
  if (len === 0) return 0;
  let sum = 0;
  for (let i = 0; i < len; i++) sum += entry._ring[i];
  return sum / len;
}

const _probes = new Map();

function _get(label) {
  let e = _probes.get(label);
  if (!e) { e = _makeEntry(); _probes.set(label, e); }
  return e;
}

export const MsProbe = {

  /**
   * call(label, fn, ...args)
   * Run fn(...args) synchronously, record its duration, return its result.
   */
  call(label, fn, ...args) {
    const entry = _get(label);
    const t0 = performance.now();
    const result = fn(...args);
    _record(entry, performance.now() - t0);
    return result;
  },

  /**
   * callAsync(label, fn, ...args)
   * Await fn(...args), record its duration, return its result.
   */
  async callAsync(label, fn, ...args) {
    const entry = _get(label);
    const t0 = performance.now();
    const result = await fn(...args);
    _record(entry, performance.now() - t0);
    return result;
  },

  /**
   * wrap(label, fn)
   * Returns a new function that measures fn every time it is called.
   * The wrapper passes all arguments through and returns the result.
   */
  wrap(label, fn) {
    return (...args) => this.call(label, fn, ...args);
  },

  /**
   * wrapAsync(label, fn)
   * Same as wrap() but for async functions.
   */
  wrapAsync(label, fn) {
    return (...args) => this.callAsync(label, fn, ...args);
  },

  /**
   * record(label, ms)
   * Record an externally measured duration. For hot loops that accumulate
   * phase time with raw performance.now() and commit ONE sample per call —
   * zero closure allocation inside the loop.
   */
  record(label, ms) {
    _record(_get(label), ms);
  },

  /**
   * stats(label)
   * Returns a plain object with timing stats for one label.
   * avg is the rolling average of the last 60 samples.
   */
  stats(label) {
    const e = _probes.get(label);
    if (!e) return { label, calls: 0, last: 0, avg: 0, min: 0, max: 0, total: 0 };
    return {
      label,
      calls: e.calls,
      last:  +e.last.toFixed(3),
      avg:   +_avg(e).toFixed(3),
      min:   e.min === Infinity ? 0 : +e.min.toFixed(3),
      max:   +e.max.toFixed(3),
      total: +e.total.toFixed(2),
    };
  },

  /**
   * all()
   * Returns stats for every registered label, sorted by avg descending.
   * Handy for a single glance at where time is going.
   */
  all() {
    const out = [];
    for (const label of _probes.keys()) out.push(this.stats(label));
    out.sort((a, b) => b.avg - a.avg);
    return out;
  },

  /**
   * reset(label)
   * Clear accumulated data for one label.
   */
  reset(label) {
    _probes.delete(label);
  },

  /**
   * resetAll()
   * Clear everything.
   */
  resetAll() {
    _probes.clear();
  },

  /**
   * allAsMap()
   * Returns a flat object keyed by probe label.
   * Used by DebugRouter to feed the msProbe panel data.
   * Each value is { last, avg, max, calls }.
   */
  allAsMap() {
    const out = {};
    for (const label of _probes.keys()) {
      const s = this.stats(label);
      out[label] = s;
    }
    return out;
  },

  /**
   * topAvg  — avg ms of the slowest probe (for panel header/summary)
   * topLabel — label of the slowest probe
   */
  get topAvg() {
    let best = null;
    for (const label of _probes.keys()) {
      const e = _probes.get(label);
      const a = _avg(e);
      if (!best || a > best.avg) best = { avg: a, label };
    }
    return best ? +best.avg.toFixed(2) : 0;
  },

  get topLabel() {
    let best = null;
    for (const label of _probes.keys()) {
      const e = _probes.get(label);
      const a = _avg(e);
      if (!best || a > best.avg) best = { avg: a, label };
    }
    return best ? best.label : '—';
  },

  /**
   * dotAtlasMetrics()
   * Get dot atlas specific metrics for debug panel.
   * Returns: { initBodyCalls, drawCalls, captureSpriteCalls, drawAvgMs, captureAvgMs, fadeAvgMs, totalMs }
   */
  dotAtlasMetrics() {
    const cacheInit = this.stats('dotatlas.initBody');
    const cacheDraw = this.stats('dotatlas.draw');
    const cacheCapture = this.stats('dotatlas.captureSprite');
    const fadeCycles = this.stats('dotatlas.fade');

    return {
      initBodyCalls: cacheInit.calls,
      drawCalls: cacheDraw.calls,
      captureSpriteCalls: cacheCapture.calls,
      drawAvgMs: cacheDraw.avg,
      captureAvgMs: cacheCapture.avg,
      fadeAvgMs: fadeCycles.avg,
      totalMs: cacheDraw.total + cacheCapture.total
    };
  },

  /**
   * log()
   * console.table() all current stats. Dev convenience.
   */
  log() {
    console.table(this.all());
  }
};

export default MsProbe;
