/**
 * js/core/gate.js
 * GATE — real-time pass/skip declarations on the synchronous pipeline.
 *
 * THE REALITY CHECK, honored in code:
 * QueOps is a queue — it defers work. But the frame's hot path (draw passes,
 * subsystem updates) is SYNCHRONOUS: pushing it through a queue would add
 * scheduling overhead to exactly the code the 1000 law lives in. So the
 * pipeline gets TWO instruments:
 *
 *   · QueOps LANES (subjects: physics / rendering / particles / ui / …) for
 *     deferrable work — bigger lists, budgets, cycling. Already in place.
 *   · GATES for the synchronous path — a label-keyed pass/skip decision that
 *     costs one Map lookup and one counter increment. Skipping is free;
 *     passing is free; declaring is live.
 *
 * THE NAMESPACE UNIFICATION: gates use the SAME dot-labels as MsProbe.
 * Anything you can measure, you can now skip — the measurement namespace IS
 * the control namespace. Connect the Cycle panel (a "skipper") to
 * render.drawAll.sun and declare `Gate.declare('render.drawAll.sun',
 * { every: 2 })` in real time: the sun draws every 2nd pass. Declare
 * { mute: true } and it's silenced entirely. Undeclared labels always pass —
 * zero cost for the untouched.
 *
 * This is the actuator of the coming Panel Connector: wires will write gate
 * declarations; today they can be written from the console or any module.
 */

const _gates = new Map();   // label → { every, mute, n, skipped, passed }

export const Gate = {
  /**
   * declare(label, { every?, mute? })
   * every: 2 → pass every 2nd call · every: 1 → always pass.
   * mute: true → never pass. Redeclaring updates live; counters keep running.
   */
  declare(label, opts = {}) {
    const g = _gates.get(label) || { every: 1, mute: false, n: 0, skipped: 0, passed: 0 };
    if (Number.isFinite(opts.every)) g.every = Math.max(1, opts.every | 0);
    if (opts.mute !== undefined) g.mute = !!opts.mute;
    _gates.set(label, g);
    try { window.UpdateFeed?.push(`GATE ${label} ${g.mute ? 'MUTE' : '1/' + g.every}`); } catch (_) {}
    return g;
  },

  /** Remove a declaration — the label passes freely again. */
  clear(label) { _gates.delete(label); },
  clearAll()   { _gates.clear(); },

  /**
   * pass(label) — the hot-path check. Undeclared → true immediately.
   * Declared → mute/every logic. Call it AT the pass point:
   *   if (Gate.pass('render.drawAll.sun')) { ...draw the sun... }
   */
  pass(label) {
    const g = _gates.get(label);
    if (!g) return true;
    if (g.mute) { g.skipped++; return false; }
    g.n++;
    if (g.n % g.every === 0) { g.passed++; return true; }
    g.skipped++;
    return false;
  },

  /** Everything declared, for panels / the wire inspector. */
  list() {
    const out = [];
    for (const [label, g] of _gates) out.push({ label, every: g.every, mute: g.mute, skipped: g.skipped, passed: g.passed });
    return out;
  },

  get stats() {
    let skipped = 0, passed = 0;
    for (const g of _gates.values()) { skipped += g.skipped; passed += g.passed; }
    return { declared: _gates.size, skipped, passed };
  },
};

// console-reachable — declare skips live before the wire UI exists
if (typeof window !== 'undefined') window.Gate = Gate;

export default Gate;
