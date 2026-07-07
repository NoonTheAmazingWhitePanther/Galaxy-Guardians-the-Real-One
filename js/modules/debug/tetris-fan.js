/**
 * js/modules/debug/tetris-fan.js
 *
 * THE TETRIS FAN — tapping the ▦ Tetris satellite no longer packs
 * immediately: it opens TWO straight lines of little satellites to its right
 * (same .dbg-sat look, transient like SatBlobs).
 *
 * TOP LINE — PROFILES:  User · every profile in the PROFILES folder · Bench.
 * BOTTOM LINE — the 8 layout tools:
 *   1 ⇉  arrange one-after-one — tap: horizontal-major (X,Y);
 *        tap again: vertical-major (Y,X). Keeps each panel's style.
 *   2 ▦  arrange, keep style — user-preference shelf pack (the classic
 *        Tetris). LONG PRESS: the last known BAKED layout (config defaults).
 *   3 ↶  layout undo (panels arrangement ONLY). LONG PRESS: session start.
 *   4 ↷  layout redo. LONG PRESS: first recorded step of this session.
 *   5 ⊕  increase ALL panels + buttons — ratio locked, every state included.
 *   6 ⊖  decrease — same, opposite.
 *   7 ⇅  SORT — opens its own sun-like text blobs beneath:
 *        7.1 Ms  — heavy → cheap by each panel's subsystem probe avg.
 *        7.2 ⚡  — sudden spikes / bottlenecks (max ÷ avg pressure).
 *        7.3 1k  — the 1000 deal: panels ordered by distance from the law.
 *   8 ▤  CATEGORIZED — Rendering · Physics · Input · Debugging · Theme · Else,
 *        arranged in category rows, announced through the UpdateFeed.
 *
 * Dismissal: any tap that is not a fan blob closes everything.
 */
import { GovernorProfiles } from './governor-profiles.js';
import { ManualOverrides } from './governor.js';
import { MsProbe } from '../../core/ms-probe.js';
import { CycleMeter } from '../../core/cycle-meter.js';

const BLOB = 24, GAP = 6;

// panel id → category for button 8 (unlisted ids fall to Else)
const CATEGORY = {
  fps: 'Rendering', drawCalls: 'Rendering', trails: 'Rendering', accumulator: 'Rendering',
  screenRes: 'Rendering', physics: 'Physics', gravityGrid: 'Physics', cache: 'Physics',
  dormancy: 'Physics', planes: 'Physics', queops: 'Physics', trajectory: 'Physics',
  input: 'Input', aims: 'Input',
  msProbe: 'Debugging', governors: 'Debugging', benchmark: 'Debugging',
  panelSettings: 'Theme', mixer: 'Theme',
};
const CAT_ORDER = ['Rendering', 'Physics', 'Input', 'Debugging', 'Theme', 'Else'];

// panel id → the MsProbe label whose numbers speak for it (sort 7.1/7.2)
const PROBE_OF = {
  physics: 'physics.tick', gravityGrid: 'physics.gravField', cache: 'physics.cacheTick',
  dormancy: 'dormancy.tick', queops: 'queops.tick', fps: 'render.drawAll',
  drawCalls: 'render.drawAll', trails: 'render.drawAll.trails',
  accumulator: 'render.drawAll.flip', msProbe: 'debug.panels',
  trajectory: 'physics.trajectory',
};

export const TetrisFan = {
  _els: [],
  _dismiss: null,
  _router: null,
  _rowMajor: 'h',            // button 1 toggle memory

  get isOpen() { return this._els.length > 0; },

  close() {
    for (const el of this._els) el.remove();
    this._els = [];
    if (this._dismiss) {
      window.removeEventListener('pointerdown', this._dismiss, true);
      this._dismiss = null;
    }
  },

  toggle(router) {
    if (this.isOpen) { this.close(); return; }
    this._router = router;
    this.open();
  },

  _blob(x, y, label, title, onTap, onHold) {
    const el = document.createElement('div');
    el.className = 'dbg-sat tetris-fan-blob';
    el.textContent = label;
    el.title = title;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = el.style.height = BLOB + 'px';
    el.style.display = 'flex';
    el.style.fontSize = '10px';
    el.style.zIndex = 60;
    let holdT = 0, held = false;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      held = false;
      if (onHold) holdT = setTimeout(() => { held = true; onHold(); }, 600);
    }, { passive: false });
    el.addEventListener('pointerup', (e) => {
      e.preventDefault(); e.stopPropagation();
      clearTimeout(holdT);
      if (!held) onTap();
    }, { passive: false });
    el.addEventListener('pointercancel', () => clearTimeout(holdT));
    document.body.appendChild(el);
    this._els.push(el);
    return el;
  },

  open() {
    const anchor = document.getElementById('dbg-closeall');
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const x0 = r.right + GAP, yTop = r.top - (BLOB + GAP) / 2, yBot = r.top + r.height / 2 + GAP / 2;
    const R = this._router;
    const feed = (m) => { try { window.UpdateFeed?.push(m); } catch (_) {} };

    // ── TOP LINE — PROFILES: User · folder list · Bench best ──
    let tx = x0;
    this._blob(tx, yTop, '👤', 'User profile — your saved preferences', () => {
      try { window.GGPrefs?.load?.(); } catch (_) {}
      feed('PROFILE: USER'); this.close();
    });
    tx += BLOB + GAP;
    const names = Object.keys(GovernorProfiles.profiles || {});
    for (const name of names) {
      const short = name.slice(0, 3);
      this._blob(tx, yTop, short, `Profile: ${name}`, () => {
        GovernorProfiles.applyProfile(name);
        feed(`PROFILE: ${name}`); this.close();
      });
      tx += BLOB + GAP;
    }
    this._blob(tx, yTop, '🏆', 'Benchmark best — fold BEST PREFERENCES into Base', () => {
      try {
        const bp = window.Benchmark?.lastPrefs || window._Benchmark?.lastPrefs;
        if (bp) GovernorProfiles.setBase(bp);
        GovernorProfiles.applyProfile('BALANCE');
      } catch (_) {}
      feed('PROFILE: BENCHMARK BEST'); this.close();
    });

    // ── BOTTOM LINE — the 8 tools ──
    let bx = x0;
    const step = () => { bx += BLOB + GAP; };

    this._blob(bx, yBot, '⇉', 'One after one — tap: X,Y horizontal · tap again: Y,X vertical', () => {
      this._arrangeSequential(this._rowMajor);
      feed(this._rowMajor === 'h' ? 'ARRANGE ⇉ HORIZONTAL' : 'ARRANGE ⇊ VERTICAL');
      this._rowMajor = this._rowMajor === 'h' ? 'v' : 'h';
    }); step();

    this._blob(bx, yBot, '▦', 'Arrange, keep style (Tetris) · hold: last known baked layout', () => {
      R.arrangeTetris(); feed('ARRANGE ▦ TETRIS');
    }, () => { this._bakedLayout(); feed('ARRANGE: BAKED DEFAULTS'); }); step();

    this._blob(bx, yBot, '↶', 'Layout undo (panels only) · hold: session start', () => {
      R.undoLayout(false);
    }, () => R.undoLayout(true)); step();

    this._blob(bx, yBot, '↷', 'Layout redo · hold: first recorded step', () => {
      R.redoLayout(false);
    }, () => R.redoLayout(true)); step();

    this._blob(bx, yBot, '⊕', 'Increase ALL panels + buttons — ratio locked', () => {
      this._ratioStep(+0.25);
    }); step();

    this._blob(bx, yBot, '⊖', 'Decrease ALL — ratio locked', () => {
      this._ratioStep(-0.25);
    }); step();

    const sortX = bx;
    this._blob(bx, yBot, '⇅', 'Sort panels — opens Ms / ⚡ spikes / 1k', () => {
      this._openSort(sortX, yBot + BLOB + GAP);
    }); step();

    this._blob(bx, yBot, '▤', 'Categorized — Rendering · Physics · Input · Debugging · Theme · Else', () => {
      this._arrangeCategorized(); this.close();
    });

    // dismiss on any outside tap
    this._dismiss = (e) => {
      if (!(e.target?.classList?.contains('tetris-fan-blob')) && e.target !== anchor) this.close();
    };
    window.addEventListener('pointerdown', this._dismiss, true);
  },

  // ── sort sub-fan (7.1 / 7.2 / 7.3) — sun-like text blobs beneath ⇅ ──
  _openSort(x, y) {
    const mk = (dx, label, title, keyFn, name) => {
      this._blob(x + dx, y, label, title, () => {
        this._arrangeSorted(keyFn);
        try { window.UpdateFeed?.push(`SORT: ${name}`); } catch (_) {}
        this.close();
      });
    };
    mk(0, 'Ms', 'Heavy → cheap by probe avg ms',
      (p) => -(MsProbe.stats(PROBE_OF[p.id] || '__none').avg || 0), 'HEAVY LIFTING');
    mk(BLOB + GAP, '⚡', 'Sudden spikes / bottlenecks (max ÷ avg)',
      (p) => { const s = MsProbe.stats(PROBE_OF[p.id] || '__none'); return -(s.avg > 0 ? s.max / s.avg : 0); },
      'BOTTLENECKS');
    mk((BLOB + GAP) * 2, '1k', 'The 1000 deal — panels whose probes eat the law first',
      (p) => {
        // The deal: lawPct says how close the sim is; the sort answers WHO is
        // spending it — heaviest probe first when under the law, lightest
        // first when the law is met (celebrate the cheap ones).
        const ms = MsProbe.stats(PROBE_OF[p.id] || '__none').avg || 0;
        return CycleMeter.stats.lawPct < 100 ? -ms : ms;
      }, `THE 1000 DEAL (${CycleMeter.stats.physSec}/${CycleMeter.stats.target} c/s · ${CycleMeter.stats.lawPct}%)`);
  },

  // ── arrangers ──
  _visible() { return this._router.panels.filter(p => p.visible); },

  _shelfPack(list) {
    const GAPP = 8, W = (window.innerWidth / (1 || 1)) - 20;
    let cx = 16, cy = 16, shelfH = 0;
    for (const p of list) {
      const w = p.w || 140, h = p.h || 60;
      if (cx + w > W && cx > 16) { cx = 16; cy += shelfH + GAPP; shelfH = 0; }
      p.x = cx; p.y = cy;
      cx += w + GAPP; shelfH = Math.max(shelfH, h);
      p._chromeDirty = true;
    }
    this._router._rebuildAimsMap();
    this._router.snapshotLayout();
  },

  _arrangeSequential(major) {
    const list = this._visible();
    if (major === 'h') { this._shelfPack(list); return; }
    // vertical-major: columns top→bottom, wrap right
    const GAPP = 8, H = window.innerHeight - 20;
    let cx = 16, cy = 16, colW = 0;
    for (const p of list) {
      const w = p.w || 140, h = p.h || 60;
      if (cy + h > H && cy > 16) { cy = 16; cx += colW + GAPP; colW = 0; }
      p.x = cx; p.y = cy;
      cy += h + GAPP; colW = Math.max(colW, w);
      p._chromeDirty = true;
    }
    this._router._rebuildAimsMap();
    this._router.snapshotLayout();
  },

  _bakedLayout() {
    // back to the positions baked into debug-config.json
    const cfg = this._router._config?.panels || [];
    for (const p of this._router.panels) {
      const c = cfg.find(k => k.id === p.id);
      if (c?.position) { p.x = c.position.x; p.y = c.position.y; p._chromeDirty = true; }
    }
    this._router._rebuildAimsMap();
    this._router.snapshotLayout();
  },

  _arrangeSorted(keyFn) {
    const list = this._visible().slice().sort((a, b) => keyFn(a) - keyFn(b));
    this._shelfPack(list);
  },

  _arrangeCategorized() {
    const GAPP = 8;
    const groups = new Map(CAT_ORDER.map(c => [c, []]));
    for (const p of this._visible()) {
      (groups.get(CATEGORY[p.id] || 'Else')).push(p);
    }
    let cy = 16;
    const parts = [];
    for (const cat of CAT_ORDER) {
      const list = groups.get(cat);
      if (!list.length) continue;
      parts.push(`${cat} ${list.length}`);
      let cx = 16, shelfH = 0;
      for (const p of list) {
        const w = p.w || 140, h = p.h || 60;
        if (cx + w > window.innerWidth - 20 && cx > 16) { cx = 16; cy += shelfH + GAPP; shelfH = 0; }
        p.x = cx; p.y = cy;
        cx += w + GAPP; shelfH = Math.max(shelfH, h);
        p._chromeDirty = true;
      }
      cy += shelfH + GAPP * 3;   // category gap — the visual section break
    }
    this._router._rebuildAimsMap();
    this._router.snapshotLayout();
    try { window.UpdateFeed?.push('CATEGORIZED: ' + parts.join(' · ')); } catch (_) {}
  },

  _ratioStep(d) {
    const cur = ManualOverrides.psOverall?.value ?? 2;
    const next = Math.max(0.45, Math.min(3, +(cur + d).toFixed(2)));
    ManualOverrides.set('psOverall', next);
    for (const p of this._router.panels) p._chromeDirty = true;
    try { window._ConsoleView?.setScale(Math.round(next)); } catch (_) {}
    try { window.UpdateFeed?.push(`RATIO ×${next}`); } catch (_) {}
    this._router._rebuildAimsMap();
  },
};

export default TetrisFan;
