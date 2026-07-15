/**
 * js/modules/debug/panel-pages.js
 * THE PAGES — the panel surface is not one table, it is a book.
 *
 * THE DECLARATION (Noon, 2026-07-14):
 *   RENDERING · PHYSICS · INPUT · UPDATES · CYCLES · CONFIGURATIONS · PANELS
 *
 * Swipe left/right turns the page. Only the panels of the current page are
 * visible, which means only they are laid out, stamped into the Panel Trail,
 * hit-tested, or fed data — a page of 4 panels costs a page of 4 panels, not
 * a book of 23.
 *
 * PINNED PANELS BEHAVE THE SAME (Noon's rule, exactly as stated):
 *   Inside debug, a pinned panel obeys the page like everything else — turn
 *   away from its category and it goes with the page. It does NOT float above
 *   the book.
 *   Outside debug, the TuningLayer draws it regardless — pinning was always
 *   "keep this on the glass when debug is off", and that is untouched. So a
 *   pinned panel is page-bound in the book and page-free on the glass, which
 *   is the whole point of having pinned them.
 *
 * THE SELECTION PANEL is exempt: SelectionTool owns its visibility (it appears
 * on capture, on any page, and leaves when the capture clears).
 *
 * A panel declares its page in its own json — `"page": "physics"` — keeping
 * the Prime Ideal intact (one file per panel, no central list to fight over).
 * A panel with no page declared falls to CONFIGURATIONS rather than vanishing.
 */

export const PAGES = [
  { id: 'rendering', title: 'RENDERING' },
  { id: 'physics',   title: 'PHYSICS'    },
  { id: 'input',     title: 'INPUT'      },
  { id: 'updates',   title: 'UPDATES'    },
  { id: 'cycles',    title: 'CYCLES'     },
  { id: 'config',    title: 'CONFIGURATIONS' },
  { id: 'panels',    title: 'PANEL SETTINGS' },
];

export const PanelPages = {
  on:      1,          // 0 = the whole book at once (legacy; the 5fps state)
  wrap:    1,          // 0/1 — swipe past the last page returns to the first
  _index:  0,

  // `index` is an ACCESSOR, not a field: the panel's ▶/◀ buttons bind straight
  // to it through the governor's generic dot-path setter (`obj[last] = v`), so
  // a plain field would move the page number without ever telling anyone the
  // page had turned — panels would stay on the old page's visibility. Writing
  // it here goes through the same door a swipe does.
  get index()  { return this._index; },
  set index(v) { this.goto(v); },

  get count()    { return PAGES.length; },
  get page()     { return PAGES[this._index] || PAGES[0]; },
  get pageId()   { return this.page.id; },
  get pageName() { return this.on ? this.page.title : 'ALL'; },
  get pageNum()  { return this.on ? `${this._index + 1}/${PAGES.length}` : '—'; },

  /** A panel's declared page — its own json owns this, not a central list. */
  pageOf(p) {
    const declared = p?.config?.page;
    return PAGES.some(pg => pg.id === declared) ? declared : 'config';
  },

  /** Should this panel be on the surface right now? */
  shows(p) {
    if (!this.on) return true;
    return this.pageOf(p) === this.pageId;
  },

  /** How many panels live on a given page — the page bar's dots read this. */
  countOn(pageId, panels) {
    return (panels || []).filter(p => p.id !== 'selection' && this.pageOf(p) === pageId).length;
  },

  /** Turn the page. dir +1 = next (swipe LEFT), -1 = previous (swipe RIGHT). */
  turn(dir) {
    if (!this.on) return false;
    const n = PAGES.length;
    let i = this._index + (dir > 0 ? 1 : -1);
    if (this.wrap) i = (i % n + n) % n;
    else i = Math.max(0, Math.min(n - 1, i));
    if (i === this._index) return false;
    this._index = i;
    this._announce();
    try { window._DebugRouter?.onPageChange(); } catch (_) {}
    return true;
  },

  goto(i) {
    const n = PAGES.length;
    let idx = i | 0;
    if (this.wrap) idx = (idx % n + n) % n;        // ▶ off the end wraps, same as a swipe
    else idx = Math.max(0, Math.min(n - 1, idx));
    if (idx === this._index) return false;
    this._index = idx;
    this._announce();
    try { window._DebugRouter?.onPageChange(); } catch (_) {}
    return true;
  },

  _announce() {
    try { window.UpdateFeed?.push(`PAGE ${this.pageNum} · ${this.pageName}`); } catch (_) {}
  },

  // ── action variables (the novaTest idiom — a button binds to a variable) ──
  get doNext()  { return 0; },
  set doNext(v) { if (v) this.turn(1); },
  get doPrev()  { return 0; },
  set doPrev(v) { if (v) this.turn(-1); },
};

export default PanelPages;
