/**
 * js/core/selection-vitals.js
 *
 * Live, read-only snapshot of whatever SelectionTool currently has
 * captured. Registered with the Governor's variable registry
 * (debug-router.js) so the real debug Panel system can read it exactly
 * like any other live data source (FpsCounter, MsProbe, etc.) via dotted
 * "value" paths in panels/selection.json — same mechanism, no special
 * casing needed in panel.js/debug-renderer.js.
 *
 * Single captured body's own numbers, or the cluster average across
 * every captured body when more than one is selected. Every getter here
 * returns an already-formatted STRING (not a raw number) so the panel's
 * default `String(value)` display formatting never has to special-case
 * this data — and so "nothing selected" reads as "—" instead of the
 * literal word "null".
 */
import { SelectionTool } from '../modules/input/in-selection-tool.js';
import { SUN } from './state.js';

function compute() {
  const bodies = SelectionTool.captured;
  if (!bodies || bodies.length === 0) return null;

  const n = bodies.length;
  let mass = 0, radius = 0, heat = 0, dist = 0, cx = 0, cy = 0;
  let speedSum = 0;

  for (const b of bodies) {
    mass   += b.mass   || 0;
    radius += b.radius || 0;
    heat   += b.heat   || 0;
    dist   += Math.hypot(b.cx - SUN.x, b.cy - SUN.y);
    cx += b.cx; cy += b.cy;

    let vx = 0, vy = 0, pn = 0;
    for (const p of b.particles || []) {
      if (p.dead) continue;
      vx += p.vx; vy += p.vy; pn++;
    }
    if (pn) speedSum += Math.hypot(vx / pn, vy / pn);
  }

  return {
    count: n, cx: cx / n, cy: cy / n,
    mass: mass / n, radius: radius / n, heat: heat / n,
    speed: speedSum / n, dist: dist / n,
    sunIncluded: SelectionTool.sunIncluded
  };
}

export const SelectionVitals = {
  get count() { return SelectionTool.captured?.length || 0; },

  get label() {
    const n = this.count;
    return n > 1 ? `CLUSTER \u00d7${n}` : (n === 1 ? 'PLANET' : 'NONE SELECTED');
  },
  get mass()    { const v = compute(); return v ? String(Math.round(v.mass)) : '\u2014'; },
  get radius()  { const v = compute(); return v ? v.radius.toFixed(1) : '\u2014'; },
  get heatPct() { const v = compute(); return v ? `${Math.round(v.heat * 100)}%` : '\u2014'; },
  get speed()   { const v = compute(); return v ? v.speed.toFixed(2) : '\u2014'; },
  get sunDist() { const v = compute(); return v ? String(Math.round(v.dist)) : '\u2014'; },
  get sunTag()  { const v = compute(); return v ? (v.sunIncluded ? 'yes' : 'no') : '\u2014'; },

  // World-space centroid — read by selection-panel-extras.js for the live
  // magnifier crop. Not display-formatted (needs real numbers).
  get worldX() { return compute()?.cx ?? null; },
  get worldY() { return compute()?.cy ?? null; },
};

export default SelectionVitals;
