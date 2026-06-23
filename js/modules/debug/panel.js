/**
 * js/modules/debug/panel.js
 * Enhanced with better control handling and logging.
 */
import { DEBUG_STATE } from './debug-state.js';
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

    this.minimized = false;
    this._summaryVariable = null;
    if (config.summaryVariable) {
      this._summaryVariable = resolveVariable(config.summaryVariable);
    }

    this.panelMasterValue = 1.0;
    this._masterDragging = false;

    this.refreshRates = DEBUG_STATE.refreshRates;
    this.currentRateIdx = this.refreshRates.indexOf(config.refreshRate ?? 100);
    if (this.currentRateIdx === -1) this.currentRateIdx = 2;
    this.refreshRate = this.refreshRates[this.currentRateIdx];
    this._lastRender = 0;

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
          console.warn(`[Panel ${this.id}] Could not resolve variable: ${line.variable}`);
          continue;        }
        const governor = new Governor(variable, line.governor || {});
        this._controls.push({
          type: ControlType.BUTTON,
          config: line,
          labels: line.buttons || ['✕', '=', '÷'],
          governor,
          variable,
          state: { hoverIdx: -1, pressIdx: -1 }
        });
        console.log(`[Panel ${this.id}] Created button control for ${line.variable}`);
      } else if (line.type === 'slider') {
        const variable = resolveVariable(line.variable);
        if (!variable) continue;
        this._controls.push({
          type: ControlType.SLIDER,
          config: line,
          min: line.min,
          max: line.max,
          step: line.step ?? 1,
          variable,
          state: { hover: false, dragging: false, value: variable.get() }
        });
        console.log(`[Panel ${this.id}] Created slider control for ${line.variable}`);
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
        this._controls.push({          type: ControlType.CHECKBOX,
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

  toggleMinimize() {
    this.minimized = !this.minimized;
    this._chromeDirty = true;
    console.log(`[Panel ${this.id}] ${this.minimized ? 'minimized' : 'maximized'}`);
  }

  getData() {
    if (this._summaryVariable) return this._summaryVariable.get();
    return {};
  }

  buildLines(data) {
    const s = DEBUG_STATE.style;
    const lines = [];

    for (const line of this.config.lines || []) {
      switch (line.type) {
        case 'header': {          const value = this._resolveValue(line.value, data);
          const suffix = line.suffix ? this._resolveValue(line.suffix, data) : '';
          const label = `${line.text}${suffix ? '  ' + suffix : ''}`;
          lines.push({
            label,
            value: line.valueSuffix ? `${value}${line.valueSuffix}` : String(value),
            color: s[line.color] || s.accent,
            bold: line.bold ?? true
          });
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

        case 'divider': {
          lines.push({
            label: line.text || '──',
            value: '',
            color: s.textFaint,
            small: true
          });
          break;
        }

        case 'displayMap': {
          const source = this._resolveValue(line.source, data);          if (!source || typeof source !== 'object') break;
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
    }

    return lines;
  }
  _resolveValue(pathOrValue, data) {
    if (typeof pathOrValue !== 'string') return pathOrValue;
    if (pathOrValue.includes('.')) {
      const variable = resolveVariable(pathOrValue);
      if (variable) return variable.get();
    }
    if (data && pathOrValue in data) return data[pathOrValue];
    return pathOrValue;
  }

  computeLayout(data) {
  const s = DEBUG_STATE.style;
  const sc = DEBUG_STATE.scale;
  
  if (this.minimized) {
    let pw = Math.max(180, (s.labelW + s.valW + s.padX * 2) * sc);
    pw = Math.floor(pw * 0.85); // 75% width
    const ph = (s.padY * 2 * sc) + (s.lineHeight * sc * 2);
    return { w: pw, h: ph, lines: [], controls: [], minimized: true };
  }
  
  const lines = this.buildLines(data);
  let pw = Math.max(180, (s.labelW + s.valW + s.padX * 2) * sc);
  pw = Math.floor(pw * 0.85); // 75% width
  
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
  
  return { w: pw, h: cy, lines, controls: layoutControls, minimized: false };
}

  hitTest(x, y, layout) {
    if (layout.minimized) {
      if (x >= this.x && x <= this.x + layout.w && y >= this.y && y <= this.y + layout.h) {
        return { type: 'panel' };
      }
      return null;
    }

    for (const ctrl of layout.controls) {
      const hit = ControlRenderer.hitTest(ctrl, x - this.x, y - this.y, ctrl.bounds);      if (hit) {
        if (ctrl.type === ControlType.BUTTON) return { type: 'button', control: ctrl, btnIdx: hit.btnIdx };
        else if (ctrl.type === ControlType.SLIDER) return { type: 'slider', control: ctrl, frac: hit.frac };
        else if (ctrl.type === ControlType.KNOB) return { type: 'knob', control: ctrl };
        else if (ctrl.type === ControlType.DROPDOWN) return { type: 'dropdown', control: ctrl, hitType: hit.type, idx: hit.idx };
        else if (ctrl.type === ControlType.CHECKBOX) return { type: 'checkbox', control: ctrl };
        else if (ctrl.type === ControlType.COLOR_PICKER) return { type: 'color', control: ctrl, hitType: hit.type, idx: hit.idx };
      }
    }

    if (x >= this.x && x <= this.x + layout.w && y >= this.y && y <= this.y + layout.h) {
      return { type: 'panel' };
    }
    return null;
  }

  handlePointerDown(x, y, layout) {
    const hit = this.hitTest(x, y, layout);
    if (!hit) return false;

    this._chromeDirty = true;

    if (hit.type === 'button') {
      const ctrl = hit.control;
      ctrl.state.pressIdx = hit.btnIdx;
      console.log(`[Panel ${this.id}] Button ${hit.btnIdx} clicked on ${ctrl.config.text}`);
      
      if (hit.btnIdx === 0) {
        ctrl.governor.multiply();
        console.log(`[Panel ${this.id}] multiply() called`);
      } else if (hit.btnIdx === 1) {
        ctrl.governor.idle();
        console.log(`[Panel ${this.id}] idle() called`);
      } else if (hit.btnIdx === 2) {
        ctrl.governor.divide();
        console.log(`[Panel ${this.id}] divide() called`);
      }
      return true;
    }

    if (hit.type === 'slider') {
      const ctrl = hit.control;
      ctrl.state.dragging = true;
      this._updateSlider(ctrl, hit.frac);
      console.log(`[Panel ${this.id}] Slider dragged to ${ctrl.variable.get()}`);
      return true;
    }

    if (hit.type === 'knob') {
      const ctrl = hit.control;      ctrl.state.dragging = true;
      ctrl.state.dragStartY = y;
      ctrl.state.dragStartValue = ctrl.variable.get();
      return true;
    }

    if (hit.type === 'dropdown') {
      const ctrl = hit.control;
      if (hit.hitType === 'button') {
        ctrl.state.open = !ctrl.state.open;
      } else if (hit.hitType === 'option') {
        const opt = ctrl.config.options[hit.idx];
        const value = typeof opt === 'object' ? opt.value : opt;
        ctrl.variable.set(value);
        ctrl.state.value = value;
        ctrl.state.open = false;
        console.log(`[Panel ${this.id}] Dropdown set to ${value}`);
      }
      return true;
    }

    if (hit.type === 'checkbox') {
      const ctrl = hit.control;
      const newValue = !ctrl.variable.get();
      ctrl.variable.set(newValue);
      ctrl.state.value = newValue;
      console.log(`[Panel ${this.id}] Checkbox toggled to ${newValue}`);
      return true;
    }

    if (hit.type === 'color') {
      const ctrl = hit.control;
      if (hit.hitType === 'swatch') {
        ctrl.state.open = !ctrl.state.open;
      } else if (hit.hitType === 'color') {
        const palette = ctrl.config.palette || ['#ffffff', '#000000', '#ff0000'];
        const color = palette[hit.idx];
        ctrl.variable.set(color);
        ctrl.state.value = color;
        ctrl.state.open = false;
        console.log(`[Panel ${this.id}] Color set to ${color}`);
      }
      return true;
    }

    return false;
  }

  handlePointerMove(x, y, layout) {
    let changed = false;    for (const ctrl of layout.controls) {
      if (ctrl.type === ControlType.BUTTON) {
        const hit = ControlRenderer.hitTest(ctrl, x - this.x, y - this.y, ctrl.bounds);
        if (ctrl.state.hoverIdx !== (hit ? hit.btnIdx : -1)) {
          ctrl.state.hoverIdx = hit ? hit.btnIdx : -1;
          changed = true;
        }
      } else if (ctrl.type === ControlType.DROPDOWN) {
        const hit = ControlRenderer.hitTest(ctrl, x - this.x, y - this.y, ctrl.bounds);
        const newHover = !!hit;
        const newIdx = hit?.type === 'option' ? hit.idx : -1;
        if (ctrl.state.hover !== newHover || ctrl.state.hoverIdx !== newIdx) {
          ctrl.state.hover = newHover;
          ctrl.state.hoverIdx = newIdx;
          changed = true;
        }
      } else if (ctrl.type === ControlType.COLOR_PICKER) {
        const hit = ControlRenderer.hitTest(ctrl, x - this.x, y - this.y, ctrl.bounds);
        const newHover = !!hit;
        const newIdx = hit?.type === 'color' ? hit.idx : -1;
        if (ctrl.state.hover !== newHover || ctrl.state.hoverIdx !== newIdx) {
          ctrl.state.hover = newHover;
          ctrl.state.hoverIdx = newIdx;
          changed = true;
        }
      } else {
        const hit = ControlRenderer.hitTest(ctrl, x - this.x, y - this.y, ctrl.bounds);
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
        const snapped = Math.round(newValue / step) * step;        ctrl.variable.set(Math.max(ctrl.config.min, Math.min(ctrl.config.max, snapped)));
        this._chromeDirty = true;
        return true;
      }
    }

    return false;
  }

  handlePointerUp(x, y, layout) {
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
  }

  cycleRefreshRate() {
    this.currentRateIdx = (this.currentRateIdx + 1) % this.refreshRates.length;
    this.refreshRate = this.refreshRates[this.currentRateIdx];
    return this.refreshRate;
  }

  shouldRender(now) {
    if (now - this._lastRender >= this.refreshRate) {
      this._lastRender = now;
      return true;
    }
    return false;
  }
}

export default Panel;