/**
 * js/core/aims.js
 * AIMS — Adaptive Input Map System
 *
 * STATUS: the pixel-bitmap engine this file originally implemented
 * (register/registerElement/rebuild/_resolve/fire/bindPointer, described
 * below) is no longer called from anywhere in the live input path — see
 * rules.md §8 for the current architecture (three profiles in
 * aims-profiles.js drive a persistent aim point, synthesized events fire
 * at the aim into the same chain a real touch uses). Left in place, not
 * deleted, because the parts still genuinely used live in the same
 * object: `_aim.x/y` (the one authoritative aim position every profile
 * writes to), `_aim.offsetX/offsetY` (Profile 3/Offset's fixed bias),
 * `_aim.radius` (the reticle's drawn size in main.js's _drawAimCursor).
 * Whether to physically delete the dead bitmap code is a deliberate
 * follow-up decision, not something to do as a side effect of an
 * unrelated change.
 *
 * The rest of this header describes the ORIGINAL, now-unused design —
 * kept for historical context on the bitmap concepts (item/layer/map),
 * not as a guide to how to use this file today. Don't call register(),
 * registerElement(), Aims.aim.moveTo/fire/down/up, or bindPointer()
 * expecting them to do anything in the live app.
 *
 * A pixel-perfect virtual input layer.
 * Maintains a spatial registry of every interactive element on screen
 * (HTML buttons, canvas regions, custom zones) indexed by x,y position.
 * An aim cursor with a configurable offset and radius resolves touches
 * through the map by layer depth, firing listeners as if real touch/click
 * events occurred — without relying on DOM hit testing at all.
 *
 * CONCEPTS:
 *
 *   ITEM — any interactive element registered in the map.
 *     { id, depth, bounds: {x,y,w,h}, color, listeners, element?, meta }
 *     color = optional RGB tag for the pixel map (future: image-based maps)
 *     element = optional DOM element to forward synthetic events to
 *
 *   LAYER — depth bucket. Lower number = higher priority (top of stack).
 *     Depth 1 = topmost (debug panels, modals)
 *     Depth 2 = mid (HUD, buttons)
 *     Depth 3 = base (canvas world, background regions)
 *     Layers are checked in order — first match wins unless passthrough=true.
 *
 *   AIM — the cursor. Has a position, an offset (finger bias), and a radius
 *     (finger size). Aim resolves hits by sampling the map within radius,
 *     weighted toward center. Returns ranked list of hit items.
 *
 *   MAP — a flat typed array of item IDs indexed by pixel position.
 *     Rebuilt on resize or when items change. Not rendered — only queried.
 *     Resolution can be downscaled (mapScale) to save memory: mapScale=2
 *     means 1 map cell = 4 screen pixels. Still pixel-accurate enough.
 *
 *   LOADING SCREEN HOOK — aims.rebuild() can be called during loading
 *     to pre-register all items before first frame. Valid items from frame 0.
 *
 * NOT-LIVE USAGE EXAMPLE (historical — see the STATUS note above):
 *   import { Aims } from '../../core/aims.js';
 *
 *   // Register items
 *   Aims.register({ id: 'btn-pause', depth: 2, bounds: {x:10,y:10,w:80,h:40},
 *     on: { tap: () => togglePause(), hold: () => {} } });
 *
 *   // Or register a DOM element directly
 *   Aims.registerElement(document.getElementById('my-btn'), { depth: 2 });
 *
 *   // Update aim position (from pointer/touch events)
 *   Aims.aim.moveTo(e.clientX, e.clientY);
 *
 *   // Fire — resolves hits and fires listeners
 *   Aims.aim.fire('tap');
 *
 *   // Or let AIMS handle all pointer events automatically
 *   Aims.bindPointer(canvas);
 */

// ── Constants ────────────────────────────────────────────────────────────
const MAX_DEPTH    = 8;
const MAP_SCALE    = 2;    // 1 map cell = MAP_SCALE screen pixels
const AIM_RADIUS   = 7;   // default finger radius in CSS px
const AIM_OFFSET_X = -20;    // finger bias X (positive = right)
const AIM_OFFSET_Y = -50;   // finger bias Y (negative = up, thumb natural lean)
const TAP_MS       = 180;
const HOLD_MS      = 400;

// ── Item Registry ────────────────────────────────────────────────────────
// items: Map<id, Item>
// layers: Map<depth, Set<id>>
// _map: Uint16Array — pixel→itemId (0=empty), flattened [y*mapW + x]
// _idIndex: Map<id, uint16> — id string → compact integer for map storage

const _items   = new Map();
const _layers  = new Map();
let   _map     = null;
let   _mapW    = 0;
let   _mapH    = 0;
let   _dirty   = false;  // true = map needs rebuild

let _idCounter  = 1;     // 0 = empty cell
const _idIndex  = new Map();  // id → uint16
const _idLookup = new Map();  // uint16 → id

let _screenW = window.innerWidth;
let _screenH = window.innerHeight;

// ── Aim State ─────────────────────────────────────────────────────────────
const _aim = {
  // Screen center, not (0,0) — this used to not matter (the old design
  // always jumped aim.x/y straight to the first real touch coordinate).
  // Now Trackpad/Joystick move the aim RELATIVELY from wherever it
  // already is (see aims-profiles.js), so a sensible starting point
  // actually matters the first time AIMS is ever turned on.
  x: (typeof window !== 'undefined' ? window.innerWidth  / 2 : 0),
  y: (typeof window !== 'undefined' ? window.innerHeight / 2 : 0),
  offsetX: AIM_OFFSET_X,
  offsetY: AIM_OFFSET_Y,
  radius:  AIM_RADIUS,
  _downAt: 0,
  _downItem: null,
  _holdTimer: null,
  _active: false,

  // Effective position after offset
  get ex() { return this.x + this.offsetX; },
  get ey() { return this.y + this.offsetY; },

  moveTo(x, y) { this.x = x; this.y = y; },

  /**
   * fire(eventType) — resolve hits at current position and dispatch.
   * Returns array of hit item ids in priority order.
   */
  fire(eventType) {
    return Aims._resolve(this.ex, this.ey, this.radius, eventType);
  },

  down(x, y) {
    this.moveTo(x, y);
    this._downAt   = performance.now();
    this._active   = true;
    this._downItem = this.fire('pointerdown');
    clearTimeout(this._holdTimer);
    this._holdTimer = setTimeout(() => {
      if (this._active) this.fire('hold');
    }, HOLD_MS);
    return this._downItem;
  },

  up(x, y) {
    this.moveTo(x, y);
    clearTimeout(this._holdTimer);
    const dur = performance.now() - this._downAt;
    const hits = dur < TAP_MS ? this.fire('tap') : this.fire('pointerup');
    this._active   = false;
    this._downItem = null;
    return hits;
  },

  move(x, y) {
    this.moveTo(x, y);
    return this._active ? this.fire('pointermove') : [];
  }
};

// ── Internal Helpers ──────────────────────────────────────────────────────
function _getOrCreateNumericId(id) {
  if (_idIndex.has(id)) return _idIndex.get(id);
  const n = _idCounter++;
  _idIndex.set(id, n);
  _idLookup.set(n, id);
  return n;
}

function _ensureLayer(depth) {
  if (!_layers.has(depth)) _layers.set(depth, new Set());
  return _layers.get(depth);
}

function _paintItem(item) {
  if (!_map) return;
  const nid = _getOrCreateNumericId(item.id);
  const { x, y, w, h } = item.bounds;
  const x0 = Math.max(0, Math.floor(x / MAP_SCALE));
  const y0 = Math.max(0, Math.floor(y / MAP_SCALE));
  const x1 = Math.min(_mapW - 1, Math.ceil((x + w) / MAP_SCALE));
  const y1 = Math.min(_mapH - 1, Math.ceil((y + h) / MAP_SCALE));
  // Higher depth = lower priority = overwritten by lower depth
  // Paint lower numbers (higher priority) last so they win
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const idx    = py * _mapW + px;
      const existing = _map[idx];
      if (existing === 0) {
        _map[idx] = nid;
      } else {
        // Keep whichever has lower depth (higher priority)
        const existId   = _idLookup.get(existing);
        const existItem = _items.get(existId);
        if (existItem && item.depth < existItem.depth) {
          _map[idx] = nid;
        }
      }
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────
export const Aims = {

  // ── Config ────────────────────────────────────────────────────────────
  mapScale: MAP_SCALE,
  aim: _aim,

  // ── Registration ─────────────────────────────────────────────────────

  /**
   * Register an interactive item.
   * @param {object} cfg
   * @param {string}  cfg.id       — unique identifier
   * @param {number}  cfg.depth    — layer depth (1=top, higher=deeper)
   * @param {object}  cfg.bounds   — { x, y, w, h } in CSS pixels
   * @param {object}  cfg.on       — event listeners: { tap, hold, pointerdown, pointermove, pointerup }
   * @param {string}  cfg.color    — optional RGB tag '#rrggbb' for color-map queries
   * @param {Element} cfg.element  — optional DOM element to also dispatch synthetic events to
   * @param {boolean} cfg.passthrough — if true, hit doesn't block deeper layers
   * @param {object}  cfg.meta     — arbitrary metadata
   */
  register(cfg) {
    if (!cfg.id || !cfg.bounds) {
      console.warn('[Aims] register() requires id and bounds');
      return;
    }
    const item = {
      id:          cfg.id,
      depth:       cfg.depth ?? 2,
      bounds:      { ...cfg.bounds },
      on:          cfg.on        ?? {},
      color:       cfg.color     ?? null,
      element:     cfg.element   ?? null,
      passthrough: cfg.passthrough ?? false,
      meta:        cfg.meta      ?? {},
      enabled:     true
    };
    _items.set(item.id, item);
    _ensureLayer(item.depth).add(item.id);
    _paintItem(item);
    return item.id;
  },

  /**
   * Register a DOM element automatically.
   * Reads getBoundingClientRect() for bounds.
   * Forwards synthetic events via element.dispatchEvent().
   */
  registerElement(el, cfg = {}) {
    if (!el) return;
    const r  = el.getBoundingClientRect();
    // Skip elements not yet in layout (zero size = not painted)
    if (r.width === 0 && r.height === 0) {
      console.warn(`[Aims] skipping zero-rect element: ${cfg.id ?? el.id ?? el.tagName}`);
      return;
    }
    const id = cfg.id ?? (el.id || el.tagName + '_' + Math.random().toString(36).slice(2, 6));
    return this.register({
      id,
      depth:   cfg.depth ?? 2,
      bounds:  { x: r.left, y: r.top, w: r.width, h: r.height },
      element: el,
      color:   cfg.color,
      passthrough: cfg.passthrough ?? false,
      on: cfg.on ?? {
        tap: () => {
          // Synthetic click — bypasses DOM hit testing entirely
          el.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true,
            clientX: r.left + r.width / 2,
            clientY: r.top  + r.height / 2
          }));
        }
      },
      meta: { el }
    });
  },

  /** Update an item's bounds (e.g. after layout change) */
  updateBounds(id, bounds) {
    const item = _items.get(id);
    if (!item) return;
    item.bounds = { ...bounds };
    _dirty = true; // need full rebuild — old cells may linger
  },

  /** Remove an item */
  unregister(id) {
    const item = _items.get(id);
    if (!item) return;
    _layers.get(item.depth)?.delete(id);
    _items.delete(id);
    _dirty = true;
  },

  /** Enable/disable an item without unregistering */
  setEnabled(id, enabled) {
    const item = _items.get(id);
    if (item) item.enabled = enabled;
  },

  // ── Map Management ────────────────────────────────────────────────────

  /**
   * Build or rebuild the pixel map.
   * Call on init, resize, or when items change.
   * Safe to call during loading screen.
   */
  rebuild(w, h) {
    _screenW = w ?? _screenW;
    _screenH = h ?? _screenH;
    _mapW    = Math.ceil(_screenW / MAP_SCALE);
    _mapH    = Math.ceil(_screenH / MAP_SCALE);
    _map     = new Uint16Array(_mapW * _mapH); // 0 = empty
    _dirty   = false;

    // Paint items sorted by depth descending (low priority first)
    // so high priority items paint last and win overlaps
    const sorted = [..._items.values()].sort((a, b) => b.depth - a.depth);
    for (const item of sorted) {
      if (item.enabled) _paintItem(item);
    }

    console.log(`[Aims] Map rebuilt: ${_mapW}×${_mapH} (${(_map.length * 2 / 1024).toFixed(1)}KB) | ${_items.size} items`);
  },

  /** Rebuild only if dirty — call from main loop if needed */
  flushIfDirty() {
    if (_dirty) this.rebuild();
  },

  // ── Hit Resolution ────────────────────────────────────────────────────

  /**
   * _resolve(x, y, radius, eventType)
   * Sample the map within radius of (x,y).
   * Returns ordered list of hit item ids (by depth, highest priority first).
   * Fires listeners and dispatches synthetic events.
   */
  _resolve(x, y, radius, eventType) {
    // Self-heal: if the map was invalidated (a panel moved / minimized / was
    // unregistered), repaint it NOW before sampling. unregister() only marks
    // _dirty and register() paints new pixels without clearing old ones, so
    // without this the map keeps stale stamps — old positions still "hit" and
    // moved buttons become untouchable. This is the tap path, so it's the one
    // place we must guarantee a fresh map.
    if (_dirty) this.rebuild();
    if (!_map) return [];

    // Sample a grid within the aim radius
    // Use a step of MAP_SCALE to avoid redundant cells
    const hits = new Map(); // id → weight (center proximity)
    const r    = radius;
    const step = Math.max(1, MAP_SCALE);

    for (let dy = -r; dy <= r; dy += step) {
      for (let dx = -r; dx <= r; dx += step) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) continue;

        const sx   = Math.floor((x + dx) / MAP_SCALE);
        const sy   = Math.floor((y + dy) / MAP_SCALE);
        if (sx < 0 || sy < 0 || sx >= _mapW || sy >= _mapH) continue;

        const nid  = _map[sy * _mapW + sx];
        if (nid === 0) continue;

        const id   = _idLookup.get(nid);
        if (!id) continue;

        // Weight: closer to center = higher weight
        const weight = 1 - (dist / r);
        if (!hits.has(id) || hits.get(id) < weight) {
          hits.set(id, weight);
        }
      }
    }

    if (hits.size === 0) return [];

    // Sort: depth ascending (1 first), then weight descending
    const ranked = [...hits.keys()]
      .map(id => ({ id, item: _items.get(id), weight: hits.get(id) }))
      .filter(h => h.item && h.item.enabled)
      .sort((a, b) => {
        if (a.item.depth !== b.item.depth) return a.item.depth - b.item.depth;
        return b.weight - a.weight;
      });

    // Fire listeners in priority order
    // Stop at first non-passthrough item
    const fired = [];
    for (const { id, item } of ranked) {
      // Fire item listener
      const listener = item.on?.[eventType];
      if (listener) {
        try { listener({ id, item, eventType, aim: _aim }); }
        catch (e) { console.error(`[Aims] listener error on ${id}:`, e); }
      }

      // Forward synthetic event to DOM element
      if (item.element && eventType === 'tap') {
        const r = item.element.getBoundingClientRect();
        item.element.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true,
          clientX: r.left + r.width / 2,
          clientY: r.top  + r.height / 2
        }));
      }

      fired.push(id);
      if (!item.passthrough) break; // stop at first solid hit
    }

    return fired;
  },

  // ── Layer Switching ────────────────────────────────────────────────────

  /**
   * activeLayers: which depths participate in resolution.
   * Default: all. Switch instantly to isolate layers.
   * e.g. setActiveLayers([1]) = only debug panels respond
   *      setActiveLayers([1,2,3]) = all layers
   */
  _activeLayers: null, // null = all

  setActiveLayers(depths) {
    this._activeLayers = depths ? new Set(depths) : null;
    _dirty = true;
  },

  /**
   * Blend two layer sets — items from both participate,
   * but layer 1 items get a depth bonus (resolve first).
   * Useful for smooth transitions between UI states.
   */
  blendLayers(depthsA, depthsB) {
    this.setActiveLayers([...new Set([...depthsA, ...depthsB])]);
  },

  // ── Pointer Binding ────────────────────────────────────────────────────

  /**
   * Bind AIMS to pointer events on a canvas or element.
   * AIMS resolves hits independently — does NOT stop propagation
   * so InputModule still works in parallel.
   */
  bindPointer(el) {
    el.addEventListener('pointerdown', e => {
      _aim.down(e.clientX, e.clientY);
    }, { passive: true });

    el.addEventListener('pointermove', e => {
      if (_aim._active) _aim.move(e.clientX, e.clientY);
    }, { passive: true });

    el.addEventListener('pointerup', e => {
      _aim.up(e.clientX, e.clientY);
    }, { passive: true });

    el.addEventListener('pointercancel', () => {
      clearTimeout(_aim._holdTimer);
      _aim._active = false;
    }, { passive: true });
  },

  // ── Debug ─────────────────────────────────────────────────────────────

  /**
   * Render the aim cursor and hit zones to a canvas (debug mode).
   * Call from renderer when debug is active.
   */
  debugDraw(ctx, showMap = false) {
    const aim = _aim;
    const dpr = (typeof DEBUG_STATE !== 'undefined' && DEBUG_STATE.dpr) || window.devicePixelRatio || 1;

    // Aim circle — already in CSS px logic, scale to device px to match canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.arc(aim.ex * dpr, aim.ey * dpr, aim.radius * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(130,210,255,0.6)';
    ctx.lineWidth   = 1.5 * dpr;
    ctx.stroke();

    // Offset line from raw touch to effective aim
    if (aim.offsetX !== 0 || aim.offsetY !== 0) {
      ctx.beginPath();
      ctx.moveTo(aim.x * dpr, aim.y * dpr);
      ctx.lineTo(aim.ex * dpr, aim.ey * dpr);
      ctx.strokeStyle = 'rgba(255,200,80,0.5)';
      ctx.lineWidth   = 1 * dpr;
      ctx.stroke();
      // Raw touch dot
      ctx.beginPath();
      ctx.arc(aim.x * dpr, aim.y * dpr, 3 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,200,80,0.7)';
      ctx.fill();
    }

    // Item bounds overlay — bounds are CSS px (getBoundingClientRect),
    // canvas backing store is device px. Must scale by dpr to align.
    if (showMap) {
      const depths = [..._layers.keys()].sort();
      const colors = ['rgba(255,80,80,0.3)', 'rgba(80,200,255,0.3)', 'rgba(80,255,130,0.3)',
                      'rgba(255,255,80,0.3)', 'rgba(200,80,255,0.3)'];
      for (const depth of depths) {
        const col = colors[(depth - 1) % colors.length];
        for (const id of (_layers.get(depth) ?? [])) {
          const item = _items.get(id);
          if (!item || !item.enabled) continue;
          const { x, y, w, h } = item.bounds;
          const sx = x * dpr, sy = y * dpr, sw = w * dpr, sh = h * dpr;
          ctx.fillStyle   = col;
          ctx.strokeStyle = col.replace('0.3', '0.8');
          ctx.lineWidth   = 1;
          ctx.fillRect(sx, sy, sw, sh);
          ctx.strokeRect(sx, sy, sw, sh);
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font      = `${9 * dpr}px monospace`;
          ctx.textAlign = 'left';
          ctx.fillText(`[${depth}] ${id}`, sx + 2 * dpr, sy + 10 * dpr);
        }
      }
    }

    ctx.restore();
  },

  /**
   * Test a point — returns what would be hit at x,y with current radius.
   * Call from console: Aims.test(150, 300)
   */
  test(x, y, radius) {
    const r = radius ?? this.aim.radius;
    const hits = this._resolve(x, y, r, '__test__');
    console.log(`[Aims] test(${x},${y}) r=${r} → hits:`, hits);
    return hits;
  },

  get debugInfo() {
    return {
      items:      _items.size,
      layers:     [..._layers.keys()].sort(),
      mapSize:    _map ? `${_mapW}×${_mapH}` : 'unbuilt',
      mapKB:      _map ? (_map.length * 2 / 1024).toFixed(1) : 0,
      dirty:      _dirty,
      aimPos:     `${Math.round(_aim.x)},${Math.round(_aim.y)}`,
      aimEff:     `${Math.round(_aim.ex)},${Math.round(_aim.ey)}`,
      aimRadius:  _aim.radius,
      activeLayers: this._activeLayers ? [...this._activeLayers] : 'all'
    };
  }
};
