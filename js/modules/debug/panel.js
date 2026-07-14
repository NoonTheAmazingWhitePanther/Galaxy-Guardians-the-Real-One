/**
 * js/modules/debug/panel.js
 * FIXED: Added _cachedData. Safe value resolution.
 */
import { DEBUG_STATE } from './debug-state.js';
import { headerIcons } from './panel-style.js';
import { PanelInfo } from './panel-info.js';
import { PanelStyle } from './panel-style.js';
import { GovernorRegistry, resolveVariable, Governor } from './governor.js';
import { ControlRenderer, ControlType } from './controls.js';

export class Panel {
  constructor(config, x, y) {
    this.id = config.id;
    this.type = config.id;
    this.title = config.title || config.id.toUpperCase();
    this.x = x ?? config.position?.x ?? 16;
    this.y = y ?? config.position?.y ?? 80;
    this.visible = true;
    this.config = config;

    this.minimized = config.minimized ?? false;
    this._summaryVariable = null;
    if (config.summaryVariable) {
      this._summaryVariable = resolveVariable(config.summaryVariable);
    }

    this.panelMasterValue   = 1.0;
    this.pinned             = false;
    this._minVertical       = false;
    this._ratioBaseline     = null;   // captured on first ratio-knob drag   // minimized orientation: false=horizontal, true=vertical
    this._userW             = null;
    this._userH             = null;
    this._userMinW          = null;
    this._userMinH          = null;
    this.shrunk             = false;  // shrink-to-bar: one-line title bar docked above the bottom bar
    this.contentScale       = 1;      // per-panel CONTENT size (fonts/knobs/rows), separate from the rectangle
    this.keepTuningRatio    = true;   // Equal-Scale blob: keep tuning proportions (uniform) vs per-axis
    this._collapsedSections = new Set(
      (config.collapsedByDefault || [])
    );
    this._scrollOffset      = 0;   // pixels scrolled down
    this._masterDragging = false;

    this.refreshRates   = DEBUG_STATE.refreshRates;
    this.refreshRate    = config.refreshRate ?? 100;   // use exact config value
    this.currentRateIdx = this.refreshRates.reduce((best, r, i) =>
      Math.abs(r - this.refreshRate) < Math.abs(this.refreshRates[best] - this.refreshRate) ? i : best, 0);
    this._lastRender    = 0;
    
    // ✅ FIX: Cache for stable rendering
    this._cachedData = {};

    this._chromeCanvas = document.createElement('canvas');
    this._dataCanvas = document.createElement('canvas');
    this._chromeDirty = true;
    this._lastW = 0;
    this._lastH = 0;

    this._controls = [];
    this._parseLines(config.lines || []);
  }

  _parseLines(lines) {
    for (const line of lines) {
      if (line.type === 'buttons') {
        const variable = resolveVariable(line.variable);
        if (!variable) {
          console.warn(`[Panel ${this.id}] Variable not found: ${line.variable}`);
          continue;
        }
        const governor = new Governor(variable, line.governor || {});
        this._controls.push({
          type: ControlType.BUTTON,
          config: line,
          labels: line.buttons || ['✕', '=', '÷'],
          governor,
          variable,
          state: { hoverIdx: -1, pressIdx: -1 }
        });
      } else if (line.type === 'resetButton') {
        const variable = resolveVariable(line.variable);
        this._controls.push({
          type:           ControlType.RESET_BUTTON,
          config:         line,
          variable,
          governor:       null,
          state:          { hoverIdx: -1, pressIdx: -1 }
        });
      } else if (line.type === 'profileButtons') {
        const isBaseSelector = !!line.isBaseSelector;
        const baseVar = isBaseSelector ? resolveVariable(line.variable) : null;
        const selectedIdx = isBaseSelector
          ? line.buttons.findIndex(b => Number(b.label) === baseVar?.get())
          : this._getActiveProfileIdx(line);

        this._controls.push({
          type:             ControlType.WIDE_BUTTON,
          config:           line,
          labels:           line.buttons.map(b => b.label),
          isProfileButtons: !isBaseSelector,
          isBaseSelector,
          baseVar,
          variable:         { get: () => null, set: () => {} },
          governor:         null,
          state:            { hoverIdx: -1, pressIdx: -1, selectedIdx }
        });
      } else if (line.type === 'knob') {
        const variable = resolveVariable(line.variable);
        if (!variable) continue;
        this._controls.push({
          type: ControlType.KNOB,
          config: line,
          min: line.min,
          max: line.max,
          step: line.step ?? 1,
          variable,
          state: { hover: false, dragging: false, dragStartY: 0, dragStartValue: 0, value: variable.get() }
        });
      } else if (line.type === 'dropdown') {
        const variable = resolveVariable(line.variable);
        if (!variable) continue;
        this._controls.push({
          type: ControlType.DROPDOWN,
          config: line,
          options: line.options || [],
          variable,
          state: { hover: false, open: false, hoverIdx: -1, value: variable.get() }
        });
      } else if (line.type === 'checkbox') {
        const variable = resolveVariable(line.variable);
        if (!variable) continue;
        this._controls.push({
          type: ControlType.CHECKBOX,
          config: line,
          variable,
          state: { hover: false, value: variable.get() }
        });
      } else if (line.type === 'color') {
        const variable = resolveVariable(line.variable);
        if (!variable) continue;
        this._controls.push({
          type: ControlType.COLOR_PICKER,
          config: line,
          palette: line.palette,
          variable,
          state: { hover: false, open: false, hoverIdx: -1, value: variable.get() }
        });
      }
    }
  }

  get summaryValue() {
    // Composed summary format — e.g. "12, -8, 36" for X offset, Y offset, radius
    if (this.config.summaryFormat === 'xyz3') {
      const refs = this.config.summaryFormatVars || [];
      const parts = refs.map(path => {
        const ref = resolveVariable(path);
        const v = ref?.get();
        if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
        return String(v ?? '?');
      });
      return parts.join(', ');
    }

    if (!this._summaryVariable) return '?';
    const v = this._summaryVariable.get();
    if (typeof v === 'number') {
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return String(v ?? '?');
  }

  get summaryLabel() {
    return this.config.summaryLabel || this.title;
  }

  // true if any governor control on this panel has been manually set
  get isManual() {
    return this._controls.some(c => c.governor?.isManual === true);
  }

  get manualLabel() {
    return this.isManual ? 'Man' : 'Auto';
  }

  get summaryExtra() {
    if (!this.config.summaryExtra) return null;
    const ref = resolveVariable(this.config.summaryExtra);
    if (!ref) return null;
    const v = ref.get();
    return v !== undefined && v !== null ? String(v) : null;
  }

  // Which profiles object a profileButtons row drives. profileTarget:"trails"
  // → the Dreamy Trails presets; default (unset) → the governor profiles.
  _profilesFor(config) {
    return (config && config.profileTarget === 'trails')
      ? window._TrailProfiles
      : window._GovernorProfiles;
  }

  _getActiveProfileIdx(line) {
    const GP = this._profilesFor(line);
    if (!GP) return -1;
    const active = GP.activeProfile;
    return line.buttons.findIndex(b => b.profile === active);
  }

  toggleSection(key) {
    if (this._collapsedSections.has(key)) {
      this._collapsedSections.delete(key);
    } else {
      this._collapsedSections.add(key);
    }
  }

  scroll(deltaY) {
    this._scrollOffset = Math.max(0, this._scrollOffset + deltaY);
    // (data-layer cache keys on scrollOffset — scrolling redraws itself)
  }

  pin() {
    this.pinned = true;
    this._chromeDirty = true;   // golden title line (debug-renderer._drawChrome) depends on .pinned
    if (window._TuningLayer) {
      window._TuningLayer.add(this);
    } else {
      // TuningLayer not loaded yet — queue for when it registers
      window._tuningPinQueue = window._tuningPinQueue || [];
      window._tuningPinQueue.push(this);
    }
  }

  unpin() {
    this.pinned = false;
    this._chromeDirty = true;
    if (window._TuningLayer) window._TuningLayer.remove(this);
  }

  togglePin() {
    this.pinned ? this.unpin() : this.pin();
  }

  // A manual value change (button, slider, knob, dropdown, checkbox, or
  // color pick) pins this panel and shrinks it to the compact form — the
  // tuning session narrows down to just what's actively being touched
  // instead of staying sprawled across the debug view. Reuses the real
  // pin() method so TuningLayer registration stays correct, not just the
  // flag. Deliberately NOT called for profile-switch buttons or the "="
  // reset-to-auto action — those are bigger, different-in-kind moves.
  _onManualChange() {
    if (!this.pinned) this.pin();
    this.shrunk = true;
    this._chromeDirty = true;
  }

  // ── Minimized mixer ─────────────────────────────────────────────────────
  // The adjustable controls that become mixer "channels" when the panel is
  // minimized: buttons (governor min/max), knobs and sliders. Each yields a
  // normalized {ref,min,max,step,label}. Display-only rows are skipped.
  _mixChannels() {
    if (!this._controls) return [];
    const out = [];
    for (const c of this._controls) {
      let min, max, step;
      if (c.type === ControlType.BUTTON) {
        const g = c.config?.governor; if (!g) continue;
        min = g.min; max = g.max; step = g.step ?? 1;
      } else if (c.type === ControlType.KNOB) {
        min = c.min; max = c.max; step = c.step ?? 1;
      } else if (c.type === ControlType.SLIDER) {
        min = c.config?.min; max = c.config?.max; step = c.config?.step ?? 1;
      } else continue;
      const ref = c.variable;
      if (!ref || typeof ref.get !== 'function' || typeof ref.set !== 'function') continue;
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) continue;
      out.push({ ref, min, max, step, label: String(c.config?.text ?? '').trim() });
    }
    return out;
  }

  // Does the minimized view show the full mixer? (≥2 adjustable channels and
  // no explicit single-knob config overriding it.)
  isMixer() {
    return !this.config?.minimizedKnob && this._mixChannels().length >= 2;
  }

  // ── Ratio knob — scales multiple variables together preserving ratio ────
  // Called once at drag start to snapshot current values as the 1.0x baseline
  captureRatioBaseline() {
    const cfg = this.config.minimizedKnob;
    if (cfg?.ratioVars) {
      this._ratioBaseline = cfg.ratioVars.map(v => {
        const ref = resolveVariable(v.variable);
        return { ref, base: ref?.get() ?? 0, min: v.min ?? 0, max: v.max ?? Infinity };
      });
      return;
    }
    // Mixer master: baseline = every channel's current value. base is retained
    // unclamped so scaling past a channel's max is remembered — pulling the
    // master back restores the true ratio (values "way past" 200% come back).
    this._ratioBaseline = this._mixChannels().map(ch => ({
      ref: ch.ref, base: ch.ref.get() ?? 0, min: ch.min, max: ch.max, step: ch.step
    }));
  }

  // Called continuously while dragging — factor is e.g. 1.5 = 150% of baseline.
  // Each channel is set to base×factor, clamped to its own [min,max] for display
  // while the baseline keeps the true (unclamped) intent.
  applyRatioScale(factor) {
    if (!this._ratioBaseline) return;
    for (const entry of this._ratioBaseline) {
      if (!entry.ref) continue;
      const raw   = entry.base * factor;
      const step  = entry.step || 0.1;
      let snapped = Math.round(raw / step) * step;
      snapped = Math.max(entry.min ?? -Infinity, Math.min(entry.max ?? Infinity, snapped));
      entry.ref.set(Math.round(snapped * 100) / 100);
    }
  }

  clearRatioBaseline() {
    this._ratioBaseline = null;
  }

  toggleMinOrientation() {
    this._minVertical = !this._minVertical;
    // Reset user size when switching orientation so it auto-fits
    this._userMinW = null;
    this._userMinH = null;
    this._chromeDirty = true;
  }

  toggleMinimize() {
    this.minimized = !this.minimized;
    this._chromeDirty = true;
  }

  getData() {
    if (this._summaryVariable) return this._summaryVariable.get();
    return {};
  }

  buildLines(data) {
    const s = DEBUG_STATE.style;
    const lines = [];
    let currentSection = null;   // key of the active section
    let sectionSkipping = false; // true when inside a collapsed section

    // PER-LINE PRESENTATION DELAY: any config line may declare
    // `refreshEvery: N` — its produced rows are memoized and only re-resolved
    // every Nth layout pass. Works per line, per set (give the same value to
    // several lines), or effectively per panel (set it on every line). Change
    // the config value live and the cadence follows — the panel's own
    // refreshRate stays the outer clock, this divides it.
    if (!this._lineMemo) this._lineMemo = new Map();
    let _cfgIdx = -1;

    for (const line of this.config.lines || []) {
      _cfgIdx++;

      const _rev = line.refreshEvery | 0;
      if (_rev > 1) {
        const memo = this._lineMemo.get(_cfgIdx) || { tick: -1, rows: null };
        memo.tick++;
        if (memo.rows && memo.tick % _rev !== 0) {   // stale on purpose
          for (const r of memo.rows) lines.push(r);
          this._lineMemo.set(_cfgIdx, memo);
          continue;
        }
        memo._captureFrom = lines.length;             // record fresh rows below
        this._lineMemo.set(_cfgIdx, memo);
      }

      // sectionHeader — collapsible group header
      if (line.type === 'sectionHeader') {
        const key       = line.key || line.text;
        const collapsed = this._collapsedSections.has(key);
        currentSection  = key;
        sectionSkipping = collapsed;

        // Compute section total if collapsed
        let sectionTotal = null;
        if (collapsed && line.totalSource) {
          const src = this._resolveValue(line.totalSource, data);
          if (typeof src === 'object' && src !== null) {
            sectionTotal = Object.values(src).reduce((a, b) => a + (Number(b) || 0), 0);
          } else if (typeof src === 'number') {
            sectionTotal = src;
          }
        }

        lines.push({
          isSectionHeader: true,
          key,
          label:     line.text,
          collapsed,
          total:     sectionTotal,
          color:     s.textDim,
          bold:      false,
        });
        continue;
      }

      // Skip lines inside a collapsed section
      if (sectionSkipping) continue;

      switch (line.type) {
        case 'header': {
          // NEW HEADER: the title lives in a dedicated band (drawn with the
          // icons, larger + separator). The summary value that used to share
          // the headline moves one row BELOW, right-aligned — its own line.
          const value = this._resolveValue(line.value, data);
          const suffix = line.suffix ? this._resolveValue(line.suffix, data) : '';
          lines.push({
            isTitleBand: true,
            label: line.text,
            color: s[line.color] || s.accent,
            bold: true,
          });
          const valStr = line.valueSuffix ? `${value}${line.valueSuffix}` : String(value ?? '');
          if (valStr !== '' && valStr !== 'undefined') {
            lines.push({
              label: suffix ? String(suffix) : '',
              value: valStr,
              color: s[line.color] || s.accent,
              bold: line.bold ?? true,
            });
          }
          break;
        }

        case 'display': {
          let value = this._resolveValue(line.value, data);
          if (line.format === 'ms') value = `${Number(value).toFixed(1)}ms`;
          else if (line.format === 'fixed2') value = Number(value).toFixed(2);
          else if (line.format === 'onoff') value = value ? 'ON' : 'OFF';
          else if (line.format === 'ratio') value = `1:${value}`;
          else if (line.format === 'guardian') value = value ? `α${data?.guardianAlpha || '0.00'}` : 'idle';
          else if (line.format === 'dirty') value = value ? 'dirty' : 'clean';
          else value = String(value);

          let color = s[line.color] || s.textDim;
          if (line.warn) {
            const threshold = this._resolveValue(line.warn.threshold, data);
            const rawValue = this._resolveValue(line.value, data);
            if (rawValue > threshold) color = line.warn.color;
          }

          lines.push({
            label: line.text,
            value,
            color,
            small: line.small ?? false
          });
          break;
        }

        case 'msProbeRow': {
          // data is MsProbe.allAsMap() — keyed by probe label
          const row = data?.[line.label];
          if (!row) {
            lines.push({ label: line.label, value: 'no data', color: s.textFaint, small: true });
          } else {
            lines.push({
              label: line.label,
              value: `${row.last}  ${row.avg}  ${row.max}`,
              color: row.avg > 8 ? 'rgba(255,100,80,0.9)' : row.avg > 4 ? 'rgba(255,200,80,0.9)' : s.textDim,
              small: true
            });
          }
          break;
        }

        case 'msProbeTree': {
          // data is MsProbe.allAsMap(). Builds a probe hierarchy from dot
          // paths: a probe is the CHILD of the longest other probe whose
          // label + '.' prefixes it (render.drawAll.trails → render.drawAll).
          // Parents with children render as collapsible headers showing their
          // OWN measured ms; expand to see the mini functions inside, sorted
          // heaviest-first, with ▲ heaviest / ▽ cheapest and a synthetic
          // (self) row for the unprobed remainder.
          if (!data || typeof data !== 'object') break;
          const labels = Object.keys(data);
          if (labels.length === 0) break;
          const labelSet = new Set(labels);
          const kidsOf = new Map();          // parent label -> [child labels]
          const roots  = [];
          for (const l of labels) {
            let parent = null;
            let cut = l.lastIndexOf('.');
            while (cut > 0) {
              const pre = l.slice(0, cut);
              if (labelSet.has(pre)) { parent = pre; break; }
              cut = pre.lastIndexOf('.');
            }
            if (parent) {
              if (!kidsOf.has(parent)) kidsOf.set(parent, []);
              kidsOf.get(parent).push(l);
            } else {
              roots.push(l);
            }
          }
          const heat = (avg) =>
            avg > 8 ? 'rgba(255,100,80,0.9)' : avg > 4 ? 'rgba(255,200,80,0.9)' : s.textDim;
          const fmt = (r) => `${r.last}  ${r.avg}  ${r.max}`;

          roots.sort((a, b) => (data[b]?.avg || 0) - (data[a]?.avg || 0));
          if (!this._seenGroupKeys) this._seenGroupKeys = new Set();

          const emit = (label, depth) => {
            const row  = data[label];
            const kids = kidsOf.get(label);
            const short = depth === 0 ? label : label.slice(label.lastIndexOf('.') + 1);
            const indent = '  '.repeat(depth);

            if (kids && kids.length > 0) {
              const key = `probe:${label}`;
              if (!this._seenGroupKeys.has(key)) {
                this._seenGroupKeys.add(key);
                if (line.collapsedByDefault !== false) this._collapsedSections.add(key);
              }
              const collapsed = this._collapsedSections.has(key);
              lines.push({
                isSectionHeader: true,
                key,
                label: indent + short,
                collapsed,
                total: null,
                headerValue: row ? fmt(row) : '',
                headerColor: row ? heat(row.avg) : s.textFaint,
                color: s.textDim,
                bold: false,
              });
              if (collapsed) return;

              kids.sort((a, b) => (data[b]?.avg || 0) - (data[a]?.avg || 0));
              // heaviest / cheapest markers only when the ranking means something
              const mark = kids.length >= 2;
              // synthetic (self): parent's time not covered by any child probe
              let childSum = 0;
              for (const k of kids) childSum += data[k]?.avg || 0;
              const self = row ? +(row.avg - childSum).toFixed(3) : 0;

              kids.forEach((k, i) => {
                const kr = data[k];
                const kShort = k.slice(label.length + 1);
                const pre = mark && i === 0 ? '▲ ' : (mark && i === kids.length - 1 && !(kidsOf.get(k)?.length) ? '▽ ' : '');
                if (kidsOf.get(k)?.length) {
                  emit(k, depth + 1);            // nested parent — recurse
                } else {
                  lines.push({
                    label: '  '.repeat(depth + 1) + pre + kShort,
                    value: kr ? fmt(kr) : '—',
                    color: kr ? heat(kr.avg) : s.textFaint,
                    small: true,
                  });
                }
              });
              if (self > 0.05) {
                lines.push({
                  label: '  '.repeat(depth + 1) + '(self)',
                  value: `${self} avg`,
                  color: s.textFaint,
                  small: true,
                });
              }
            } else {
              lines.push({
                label: indent + short,
                value: row ? fmt(row) : '—',
                color: row ? heat(row.avg) : s.textFaint,
                small: true,
              });
            }
          };

          for (const r of roots) emit(r, 0);
          break;
        }

        case 'divider': {
          lines.push({
            label: line.text || '──',
            value: '',
            color: s.textFaint,
            small: true
          });
          break;
        }

        case 'groupedDisplayMap': {
          // Splits flat keys like "stars ∙ draws" into groups by prefix.
          // Each group becomes its own collapsible sectionHeader automatically —
          // no need to predeclare section names in config, works with any pass set.
          const source = this._resolveValue(line.source, data);
          if (!source || typeof source !== 'object') break;
          const sep = line.separator || ' ∙ ';

          // Group entries by prefix
          const groups = new Map();   // prefix -> [{ subKey, value }]
          for (const [k, v] of Object.entries(source)) {
            if (line.filter === 'positive' && !(v > 0)) continue;
            const idx = k.indexOf(sep);
            const prefix  = idx === -1 ? k : k.slice(0, idx);
            const subKey  = idx === -1 ? '' : k.slice(idx + sep.length);
            if (!groups.has(prefix)) groups.set(prefix, []);
            groups.get(prefix).push({ subKey, value: v });
          }

          // Sort groups by their own total descending if requested
          let groupEntries = [...groups.entries()];
          if (line.sortGroups === 'desc') {
            groupEntries.sort((a, b) => {
              const totalA = a[1].reduce((s, r) => s + (Number(r.value) || 0), 0);
              const totalB = b[1].reduce((s, r) => s + (Number(r.value) || 0), 0);
              return totalB - totalA;
            });
          }

          for (const [prefix, rows] of groupEntries) {
            const key = `${line.key || 'group'}:${prefix}`;
            // Dynamic groups default to collapsed on first sight —
            // mark as seen so toggling works normally afterward
            if (!this._seenGroupKeys) this._seenGroupKeys = new Set();
            if (!this._seenGroupKeys.has(key)) {
              this._seenGroupKeys.add(key);
              if (line.collapsedByDefault !== false) this._collapsedSections.add(key);
            }
            const collapsed = this._collapsedSections.has(key);
            const total     = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

            lines.push({
              isSectionHeader: true,
              key,
              label: prefix,
              collapsed,
              total,
              color: s.textDim,
              bold: false,
            });

            if (!collapsed) {
              for (const row of rows) {
                lines.push({
                  label: row.subKey || prefix,
                  value: String(row.value),
                  color: s.textDim,
                  small: true,
                });
              }
            }
          }
          break;
        }

        case 'displayMap': {
          const source = this._resolveValue(line.source, data);
          if (!source || typeof source !== 'object') break;
          const labels = line.labels ? this._resolveValue(line.labels, data) : null;
          let entries = Object.entries(source);
          if (line.filter === 'positive') entries = entries.filter(([, v]) => v > 0);
          if (line.sort === 'desc') entries.sort((a, b) => b[1] - a[1]);
          for (const [k, v] of entries) {
            lines.push({
              label: labels?.[k] || k,
              value: String(v),
              color: s.textDim
            });
          }
          break;
        }

        case 'buttons':
        case 'slider':
        case 'knob':
        case 'dropdown':
        case 'checkbox':
        case 'color': {
          const ctrl = this._controls.find(c => c.config === line);
          if (!ctrl) break;
          const value = ctrl.variable.get();
          // Keep the dial/slider in sync with its variable when the user isn't
          // actively dragging it, so external changes (undo, reset-to-profile,
          // profile apply) move the control visibly — not just its number.
          if (ctrl.state && !ctrl.state.dragging &&
              (ctrl.type === ControlType.KNOB || ctrl.type === ControlType.SLIDER)) {
            ctrl.state.value = value;
          }
          let displayVal;
          if (ctrl.governor) {
            displayVal = ctrl.governor.label;
          } else if (ctrl.type === ControlType.CHECKBOX) {
            displayVal = value ? '✓' : '✗';
          } else if (ctrl.type === ControlType.DROPDOWN) {
            const opt = ctrl.config.options?.find(o => (typeof o === 'object' ? o.value : o) === value);
            displayVal = opt ? (typeof opt === 'object' ? opt.label : opt) : String(value);
          } else if (ctrl.type === ControlType.COLOR_PICKER) {
            displayVal = String(value);
          } else {
            displayVal = Number.isFinite(value) ? (Number.isInteger(value) ? value : value.toFixed(2)) : '?';
          }
          lines.push({
            label: line.text,
            value: displayVal,
            color: s.textDim
          });
          break;
        }
      }
      const _rev2 = line.refreshEvery | 0;
      if (_rev2 > 1) {
        const memo = this._lineMemo.get(_cfgIdx);
        if (memo && memo._captureFrom !== undefined) {
          memo.rows = lines.slice(memo._captureFrom);
          delete memo._captureFrom;
        }
      }
    }

    return lines;
  }

  _resolveValue(pathOrValue, data) {
    if (typeof pathOrValue !== 'string') return pathOrValue ?? '';
    if (pathOrValue.includes('.')) {
      const variable = resolveVariable(pathOrValue);
      if (!variable) return ''; // ✅ FIX: Return empty string if module not found
      const val = variable.get();
      return val ?? ''; // ✅ FIX: Never return undefined
    }
    if (data && typeof data === 'object' && pathOrValue in data) return data[pathOrValue] ?? '';
    return pathOrValue;
  }

  computeLayout(data) {
    // FIX ("Glasses ratio satellite doesn't work at all"): PanelStyle.apply()
    // used to run AFTER the shrunk early-return below — DEBUG_STATE.scale
    // (which the shrunk-size math immediately below also reads) never got
    // refreshed at all whenever EVERY visible panel happened to be shrunk,
    // since none of them ever reached the line that used to call apply().
    // cycleRatio() (dbg-glasses satellite) would update the underlying
    // ManualOverrides.psOverall value correctly, but nothing ever folded it
    // into DEBUG_STATE.scale, so no panel's size ever visibly changed.
    // apply() is documented as idempotent/cheap and safe at the top of
    // every computeLayout — this just actually puts it there.
    PanelStyle.apply();   // fold the user's PANEL SETTINGS scales into the style

    // SHRUNK: the lowest size — a one-line header bar in panel style.
    if (this.shrunk) {
      const sc = DEBUG_STATE.scale * (this.contentScale || 1);
      const h = Math.max(18, Math.round(20 * sc));
      const w = Math.max(110, Math.round(150 * sc));
      this.w = w; this.h = h;
      return { w, h, minimized: true, shrunk: true, lines: [], controls: [], scrollOffset: 0 };
    }
    const s = DEBUG_STATE.style;
    const sc = DEBUG_STATE.scale * (this.contentScale || 1);   // per-panel content size

    const MIN_W      = 52;
    const MIN_H      = 48;
    const MIN_VERT_H = 109;
    // Horizontal minimized minimum width — precisely calculated:
    // left_pad(8) + min_text(30) + gap(4) + knob_zone(46) = 88px
    const MIN_HORIZ_W = 88;

    if (this.minimized) {
      // Mixer: size to fit the GRID — channels wrap 3 per line (3·3·3 = 9 knobs
      // in three lines) with the master at the end. Radii come from the
      // minimized attributes (PANEL SETTINGS → psMinKnob).
      if (this.isMixer()) {
        const N     = this._mixChannels().length;
        const cs    = this.contentScale || 1;
        const chR   = (s.minChR || 9) * cs, mR = (s.minMasterR || 14) * cs, gap = 6 * cs, pad = 8;
        const COLS  = 3;
        const pitch = chR * 2 + gap;
        const lines = Math.max(1, Math.ceil(N / COLS));
        const perLn = Math.min(N, COLS);
        let mw, mh;
        if (this._minVertical) {
          // Columns of 3 (vertical rows), wrapping right; master at the bottom.
          mw = Math.max(pad * 2 + lines * pitch, mR * 2 + pad * 2, 52);
          mh = 20 + perLn * pitch + gap + mR * 2 + 14;
        } else {
          // Rows of 3, wrapping down; master on the right.
          mw = pad + perLn * pitch + gap + mR * 2 + pad;
          mh = Math.max(50, 20 + lines * pitch + 8, mR * 2 + 22);
        }
        const fw = this._userMinW ? Math.max(mw, this._userMinW) : mw;
        const fh = this._userMinH ? Math.max(mh, this._userMinH) : mh;
        return { w: fw, h: fh, lines: [], controls: [], minimized: true, mixer: true };
      }

      let pw, ph;
      if (this._minVertical) {
        pw = 52;
        ph = 109;
      } else {
        pw = Math.max(180, (s.labelW + s.valW + s.padX * 2) * sc);
        pw = Math.floor(pw * 0.75);
        ph = (s.padY * 2 * sc) + (s.lineHeight * sc * 2);
      }
      const fw = this._userMinW
        ? Math.max(this._minVertical ? MIN_W : MIN_HORIZ_W, this._userMinW)
        : pw;
      const fh = this._userMinH
        ? Math.max(this._minVertical ? MIN_VERT_H : MIN_H, this._userMinH)
        : ph;
      return { w: fw, h: fh, lines: [], controls: [], minimized: true };
    }

    // ── SECOND PAGE — the description owns the rectangle ──────────────
    // Same width rules as page one; lines and controls all leave; height
    // and scroll come from the pre-rendered description canvas.
    if (this.infoMode) {
      let ipw = Math.max(180, (s.labelW + s.valW + s.padX * 2) * sc);
      ipw = Math.floor(ipw * 0.75);
      if (this._userW) ipw = Math.max(MIN_W, this._userW);
      const totalContentH = PanelInfo.contentHeight(this, ipw, sc);
      let clampedH = Math.min(totalContentH, this.config.maxHeight ?? 260 * sc);
      if (this._userH) clampedH = Math.max(MIN_H, this._userH);
      if (this._scrollOffset > totalContentH - clampedH) {
        this._scrollOffset = Math.max(0, totalContentH - clampedH);
      }
      return {
        w: ipw, h: clampedH, totalContentH,
        scrollOffset: this._scrollOffset,
        scrollable: totalContentH > clampedH,
        lines: [], controls: [], infoMode: true,
      };
    }

    const lines = this.buildLines(data);
    let pw = Math.max(180, (s.labelW + s.valW + s.padX * 2) * sc);
    pw = Math.floor(pw * 0.75);
    if (this._userW) pw = Math.max(MIN_W, this._userW);

    let cy = s.padY * sc;
    cy += s.lineHeight * sc * lines.length;
    cy += 8 * sc;

    const layoutControls = [];
    for (const ctrl of this._controls) {
      const controlW = pw - s.padX * 2 * sc;
      const bounds = ControlRenderer.getBounds(ctrl, s.padX * sc, cy, controlW);
      layoutControls.push({ ...ctrl, bounds });
      cy += bounds.h + 6 * sc;
    }

    cy += s.padY * sc;

    const totalContentH = cy;
    const maxH          = this.config.maxHeight ?? Infinity;
    const keepMax       = this.config.keepMaxHeight ?? false;
    let clampedH        = keepMax
      ? (this.config.maxHeight ?? cy)
      : Math.min(cy, maxH);
    if (this._userH) clampedH = Math.max(MIN_H, this._userH);

    // Clamp scroll so we never go past the bottom
    if (this._scrollOffset > totalContentH - clampedH) {
      this._scrollOffset = Math.max(0, totalContentH - clampedH);
    }

    return {
      w:             pw,
      h:             clampedH,
      totalContentH,
      scrollOffset:  this._scrollOffset,
      scrollable:    totalContentH > clampedH,
      lines,
      controls:      layoutControls,
      minimized:     false
    };
  }

  hitTest(x, y, layout) {
    if (layout.shrunk) {
      const lx = x - this.x, ly = y - this.y;
      if (lx >= 0 && ly >= 0 && lx <= layout.w && ly <= layout.h) {
        if (lx >= layout.w - 18) return { type: 'pin' };   // 📌 lives at the right end
        return { type: 'panel' };
      }
      return null;
    }
    if (layout.minimized) {
      if (x >= this.x && x <= this.x + layout.w && y >= this.y && y <= this.y + layout.h) {
        const lx = x - this.x, ly = y - this.y;
        // 🖌 edit brush — bottom-left corner of the minimized panel (its own).
        if (lx <= 15 && ly >= layout.h - 15) return { type: 'edit' };
        return { type: 'panel' };
      }
      return null;
    }

    const s       = DEBUG_STATE.style;
    const sc      = DEBUG_STATE.scale * (this.contentScale || 1);
    const lh      = s.lineHeight * sc;
    const px      = s.padX * sc;
    const py      = s.padY * sc;
    const pw      = layout.w;

    // Hit test minimize and pin buttons (top-right of panel, in panel-local coords)
    // Header icons, left → right: 🖌 edit · ⤓ shrink · ▼ minimize · 📌 pin · ⛶ maximize.
    // Geometry from headerIcons() — the SAME source the renderer draws with:
    // visible ⟺ touchable by construction, at every scale.
    const _ic        = headerIcons(pw, sc);
    const minBtnSize = _ic.size;
    const maxBtnX    = _ic.xs.max;
    const pinBtnX    = _ic.xs.pin;
    const minBtnX    = _ic.xs.min;
    const shrBtnX    = _ic.xs.shr;
    const edtBtnX    = _ic.xs.edt;
    const btnY       = _ic.y;
    const lx = x - this.x;
    const ly = y - this.y;

    if (ly >= btnY && ly <= btnY + minBtnSize) {
      if (lx >= maxBtnX && lx <= maxBtnX + minBtnSize) return { type: 'maximize' };
      if (lx >= pinBtnX && lx <= pinBtnX + minBtnSize) return { type: 'pin' };
      if (lx >= minBtnX && lx <= minBtnX + minBtnSize) return { type: 'minimize' };
      if (lx >= shrBtnX && lx <= shrBtnX + minBtnSize) return { type: 'shrink' };
      if (lx >= edtBtnX && lx <= edtBtnX + minBtnSize) return { type: 'edit' };
      if (lx >= _ic.xs.nfo && lx <= _ic.xs.nfo + minBtnSize) return { type: 'info' };
    }

    // SECOND PAGE — the info icon row eats its own taps; the body stays
    // 'panel' so the existing drag/scroll path moves the description.
    if (this.infoMode) {
      const ih = PanelInfo.hitTest(this, lx, ly, sc);
      if (ih) return ih;
      return { type: 'panel' };
    }

    // Hit test section headers
    const scrollY = layout.scrollOffset ?? 0;
    const tapLX   = x - this.x;
    const tapLY   = y - this.y;
    let lineY = py + lh / 2;
    for (const ln of layout.lines) {
      const linePY = lineY - scrollY;
      if (ln.isSectionHeader) {
        if (tapLX >= px && tapLX <= pw - px &&
            tapLY >= linePY - lh / 2 && tapLY <= linePY + lh / 2) {
          return { type: 'sectionHeader', key: ln.key };
        }
      }
      lineY += lh;
    }

    for (const ctrl of layout.controls) {
      // ctrl.bounds live in unscrolled content space, but the controls are DRAWN
      // shifted up by scrollY. Map the tap into content space (+scrollY) so a
      // scrolled panel hits the button that's actually under the finger.
      const hit = ControlRenderer.hitTest(ctrl, x - this.x, (y - this.y) + scrollY, ctrl.bounds);
      if (hit) {
        if (ctrl.type === ControlType.BUTTON)       return { type: 'button',   control: ctrl, btnIdx: hit.btnIdx };
        if (ctrl.type === ControlType.WIDE_BUTTON)  return { type: 'button',   control: ctrl, btnIdx: hit.btnIdx };
        if (ctrl.type === ControlType.RESET_BUTTON) return { type: 'button',   control: ctrl, btnIdx: hit.btnIdx };
        if (ctrl.type === ControlType.SLIDER)       return { type: 'slider',   control: ctrl, frac: hit.frac };
        if (ctrl.type === ControlType.KNOB)         return { type: 'knob',     control: ctrl };
        if (ctrl.type === ControlType.DROPDOWN)     return { type: 'dropdown', control: ctrl, hitType: hit.type, idx: hit.idx };
        if (ctrl.type === ControlType.CHECKBOX)     return { type: 'checkbox', control: ctrl };
        if (ctrl.type === ControlType.COLOR_PICKER) return { type: 'color',    control: ctrl, hitType: hit.type, idx: hit.idx };
      }
    }

    if (x >= this.x && x <= this.x + layout.w && y >= this.y && y <= this.y + layout.h) {
      return { type: 'panel' };
    }
    return null;
  }

  handlePointerDown(x, y, layout) {
    this._dataDirty = true;   // finger on a control → data layer goes live
    const hit = this.hitTest(x, y, layout);
    if (!hit) return false;

    this._chromeDirty = true;

    if (hit.type === 'sectionHeader') {
      this.toggleSection(hit.key);
      return true;
    }

    if (hit.type === 'button') {
      const ctrl = hit.control;
      ctrl.state.pressIdx = hit.btnIdx;

      if (ctrl.type === ControlType.RESET_BUTTON) {
        if (ctrl.variable?.set) ctrl.variable.set(0);
        console.log(`[Panel] Reset ${ctrl.config?.text || 'value'} → 0`);
        this._onManualChange();
      } else if (ctrl.isBaseSelector) {
        const btn = ctrl.config.buttons[hit.btnIdx];
        if (btn && ctrl.baseVar) {
          const newBase = Number(btn.label);
          ctrl.baseVar.set(newBase);
          ctrl.state.selectedIdx = hit.btnIdx;
          // Clamp the matching frameSkip key to the new base so skip never
          // exceeds it. Which key depends on this control's config —
          // defaults to renderFrameSkip for backward compat.
          const clampKey = ctrl.config.clampVariable || 'renderFrameSkip';
          const ManualOverridesRef = window._ManualOverrides;
          if (ManualOverridesRef) {
            const current = ManualOverridesRef[clampKey]?.value ?? 0;
            if (current > newBase) {
              ManualOverridesRef.set(clampKey, newBase);
            }
          }
          this._onManualChange();
        }
      } else if (ctrl.isProfileButtons) {
        const btn = ctrl.config.buttons[hit.btnIdx];
        if (btn) {
          const GP = this._profilesFor(ctrl.config);
          if (GP) {
            if (btn.profile === null) GP.resetAll();
            else GP.applyProfile(btn.profile);
            ctrl.state.selectedIdx = hit.btnIdx;
          }
        }
      } else {
        if (hit.btnIdx === 0) { ctrl.governor.multiply(); this._onManualChange(); }
        else if (hit.btnIdx === 1) ctrl.governor.idle();   // "=" → reset to auto, not a manual change
        else if (hit.btnIdx === 2) { ctrl.governor.divide(); this._onManualChange(); }
      }
      return true;
    }

    if (hit.type === 'slider') {
      const ctrl = hit.control;
      ctrl.state.dragging = true;
      this._updateSlider(ctrl, hit.frac);
      return true;
    }

    if (hit.type === 'knob') {
      const ctrl = hit.control;
      ctrl.state.dragging = true;
      ctrl.state.dragStartY = y;
      ctrl.state.dragStartValue = ctrl.variable.get();
      return true;
    }

    if (hit.type === 'dropdown') {
      const ctrl = hit.control;
      if (hit.hitType === 'button') ctrl.state.open = !ctrl.state.open;
      else if (hit.hitType === 'option') {
        const opt = ctrl.config.options[hit.idx];
        const value = typeof opt === 'object' ? opt.value : opt;
        ctrl.variable.set(value);
        ctrl.state.value = value;
        ctrl.state.open = false;
        this._onManualChange();
      }
      return true;
    }

    if (hit.type === 'checkbox') {
      const ctrl = hit.control;
      const newValue = !ctrl.variable.get();
      ctrl.variable.set(newValue);
      ctrl.state.value = newValue;
      this._onManualChange();
      return true;
    }

    if (hit.type === 'color') {
      const ctrl = hit.control;
      if (hit.hitType === 'swatch') ctrl.state.open = !ctrl.state.open;
      else if (hit.hitType === 'color') {
        const palette = ctrl.config.palette || ['#ffffff', '#000000', '#ff0000'];
        const color = palette[hit.idx];
        ctrl.variable.set(color);
        ctrl.state.value = color;
        ctrl.state.open = false;
        this._onManualChange();
      }
      return true;
    }

    return false;
  }

  handlePointerMove(x, y, layout) {
    this._dataDirty = true;   // dragging a slider/knob → follow the finger
    let changed = false;
    // Match hitTest: map the tap into unscrolled content space so hover/drag
    // tracking stays aligned with the drawn controls when the panel is scrolled.
    const scrollY = layout.scrollOffset ?? 0;
    const lx = x - this.x;
    const ly = (y - this.y) + scrollY;
    for (const ctrl of layout.controls) {
      if (ctrl.type === ControlType.BUTTON) {
        const hit = ControlRenderer.hitTest(ctrl, lx, ly, ctrl.bounds);
        if (ctrl.state.hoverIdx !== (hit ? hit.btnIdx : -1)) {
          ctrl.state.hoverIdx = hit ? hit.btnIdx : -1;
          changed = true;
        }
      } else if (ctrl.type === ControlType.DROPDOWN) {
        const hit = ControlRenderer.hitTest(ctrl, lx, ly, ctrl.bounds);
        const newHover = !!hit;
        const newIdx = hit?.type === 'option' ? hit.idx : -1;
        if (ctrl.state.hover !== newHover || ctrl.state.hoverIdx !== newIdx) {
          ctrl.state.hover = newHover;
          ctrl.state.hoverIdx = newIdx;
          changed = true;
        }
      } else if (ctrl.type === ControlType.COLOR_PICKER) {
        const hit = ControlRenderer.hitTest(ctrl, lx, ly, ctrl.bounds);
        const newHover = !!hit;
        const newIdx = hit?.type === 'color' ? hit.idx : -1;
        if (ctrl.state.hover !== newHover || ctrl.state.hoverIdx !== newIdx) {
          ctrl.state.hover = newHover;
          ctrl.state.hoverIdx = newIdx;
          changed = true;
        }
      } else {
        const hit = ControlRenderer.hitTest(ctrl, lx, ly, ctrl.bounds);
        if (ctrl.state.hover !== !!hit) {
          ctrl.state.hover = !!hit;
          changed = true;
        }
      }
    }

    if (changed) this._chromeDirty = true;

    for (const ctrl of layout.controls) {
      if (ctrl.type === ControlType.SLIDER && ctrl.state.dragging) {
        const frac = (x - this.x - ctrl.bounds.x) / ctrl.bounds.w;
        this._updateSlider(ctrl, Math.max(0, Math.min(1, frac)));
        this._chromeDirty = true;
        return true;
      }
      if (ctrl.type === ControlType.KNOB && ctrl.state.dragging) {
        const dy = ctrl.state.dragStartY - y;
        const range = ctrl.config.max - ctrl.config.min;
        const step = ctrl.config.step || 1;
        const delta = (dy / 100) * range;
        const newValue = ctrl.state.dragStartValue + delta;
        const snapped = Math.round(newValue / step) * step;
        ctrl.variable.set(Math.max(ctrl.config.min, Math.min(ctrl.config.max, snapped)));
        this._onManualChange();
        this._chromeDirty = true;
        return true;
      }
    }

    return false;
  }

  handlePointerUp(x, y, layout) {
    this._dataDirty = true;   // final state after release
    for (const ctrl of layout.controls) {
      if (ctrl.type === ControlType.BUTTON) ctrl.state.pressIdx = -1;
      else ctrl.state.dragging = false;
    }
    this._chromeDirty = true;
    return false;
  }

  _updateSlider(ctrl, frac) {
    const { min, max, step } = ctrl.config;
    const raw = min + frac * (max - min);
    const snapped = Math.round(raw / step) * step;
    ctrl.variable.set(Math.max(min, Math.min(max, snapped)));
    this._onManualChange();
  }

  cycleRefreshRate() {
    this.currentRateIdx = (this.currentRateIdx + 1) % this.refreshRates.length;
    this.refreshRate = this.refreshRates[this.currentRateIdx];
    return this.refreshRate;
  }

  // Pure check — no side effect. Safe to call from multiple systems.
  isDue(now) {
    const rate = this.refreshRate || 100;
    return (now - this._lastRender) >= rate;
  }

  // Explicitly advance the timer. Call after data has been fetched.
  markRendered(now) {
    this._lastRender = now;
  }

  // Legacy — kept for any callers not yet updated. Pure check only, no side effect.
  shouldRender(now) {
    return this.isDue(now);
  }
}

export default Panel;