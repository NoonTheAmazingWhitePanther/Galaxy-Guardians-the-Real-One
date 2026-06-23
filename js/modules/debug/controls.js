/**
 * js/modules/debug/controls.js
 * ─────────────────────────────────────────────────────────────────────────
 * GENERIC CONTROL RENDERERS + HIT-TESTS
 *
 * Each control type (button, slider, knob, dropdown, checkbox, color) has:
 *   - render(ctx, control, x, y, w, h, state) → draws to canvas
 *   - hitTest(control, x, y, bounds) → returns hit info or null
 *   - getBounds(control, x, y, w) → returns bounding box
 *
 * Controls are STATELESS RENDERERS — they take a state object and draw.
 * State is managed by panel.js and persisted in panel._controls[].
 *
 * CONTROL TYPES (6 total):
 *   - BUTTON:       3-button strip (✕ = ÷ or + = −) with optional governor
 *   - SLIDER:       horizontal slider, drag to scrub
 *   - KNOB:         rotary knob, drag up/down
 *   - DROPDOWN:     tap to open list, tap option to select
 *   - CHECKBOX:     tap to toggle boolean
 *   - COLOR_PICKER: tap swatch to open palette, tap color to select
 *
 * DEPENDENCIES:
 *   - debug-state.js  (colors, fonts)
 *
 * USED BY: panel.js (renders controls, handles interactions)
 * ─────────────────────────────────────────────────────────────────────────
 */
import { DEBUG_STATE } from './debug-state.js';

// ── Control Type Enum ─────────────────────────────────────────────────────
export const ControlType = {
  BUTTON: 'button',
  SLIDER: 'slider',
  KNOB: 'knob',
  DROPDOWN: 'dropdown',
  CHECKBOX: 'checkbox',
  COLOR_PICKER: 'color'
};

// ── Control Dimensions ────────────────────────────────────────────────────
const BTN_W = 22;
const BTN_H = 18;
const BTN_GAP = 3;
const SLIDER_H = 12;
const SLIDER_THUMB_R = 6;
const KNOB_R = 14;
const DROPDOWN_H = 20;
const DROPDOWN_ITEM_H = 18;
const CHECKBOX_SIZE = 16;
const COLOR_SWATCH_W = 40;const COLOR_SWATCH_H = 18;
const COLOR_PALETTE_COLS = 6;
const COLOR_PALETTE_ITEM_SIZE = 16;

// ── Shared Drawing Helpers ────────────────────────────────────────────────
function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Button Control ────────────────────────────────────────────────────────
export const ButtonControl = {
  render(ctx, control, x, y, w, h, state) {
    const s = DEBUG_STATE.style;
    const labels = control.labels || ['✕', '=', '÷'];

    for (let i = 0; i < 3; i++) {
      const bx = x + i * (BTN_W + BTN_GAP);
      const isActive = state.pressIdx === i;
      const isHover = state.hoverIdx === i;

      ctx.fillStyle = isActive
        ? 'rgba(130, 210, 255, 0.5)'
        : isHover
          ? 'rgba(130, 210, 255, 0.2)'
          : 'rgba(255,255,255,0.08)';
      drawRoundedRect(ctx, bx, y, BTN_W, BTN_H, 4);
      ctx.fill();

      ctx.strokeStyle = isActive
        ? 'rgba(130, 210, 255, 0.6)'
        : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, bx + 0.5, y + 0.5, BTN_W - 1, BTN_H - 1, 4);
      ctx.stroke();

      ctx.fillStyle = 'rgba(240,245,255,0.85)';
      ctx.font = `11px ${s.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], bx + BTN_W / 2, y + BTN_H / 2);    }
  },

  hitTest(control, x, y, bounds) {
    const { x: bx, y: by } = bounds;
    for (let i = 0; i < 3; i++) {
      const btnX = bx + i * (BTN_W + BTN_GAP);
      if (x >= btnX && x <= btnX + BTN_W && y >= by && y <= by + BTN_H) {
        return { btnIdx: i };
      }
    }
    return null;
  },

  getBounds(control, x, y) {
    const totalW = 3 * BTN_W + 2 * BTN_GAP;
    return { x, y, w: totalW, h: BTN_H };
  }
};

// ── Slider Control ────────────────────────────────────────────────────────
export const SliderControl = {
  render(ctx, control, x, y, w, h, state) {
    const s = DEBUG_STATE.style;
    const { min, max } = control;
    const value = state.value ?? min;
    const frac = (max - min) !== 0 ? (value - min) / (max - min) : 0;
    const trackY = y + h / 2;
    const thumbX = x + frac * w;

    // Track background
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    drawRoundedRect(ctx, x, trackY - SLIDER_H / 2, w, SLIDER_H, 3);
    ctx.fill();

    // Track fill (left of thumb)
    ctx.fillStyle = state.dragging
      ? 'rgba(130, 210, 255, 0.6)'
      : 'rgba(130, 210, 255, 0.4)';
    drawRoundedRect(ctx, x, trackY - SLIDER_H / 2, frac * w, SLIDER_H, 3);
    ctx.fill();

    // Thumb
    ctx.fillStyle = state.dragging
      ? 'rgba(130, 210, 255, 1)'
      : state.hover
        ? 'rgba(240,245,255,0.95)'
        : 'rgba(240,245,255,0.85)';
    ctx.beginPath();
    ctx.arc(thumbX, trackY, SLIDER_THUMB_R, 0, Math.PI * 2);    ctx.fill();

    ctx.strokeStyle = state.dragging
      ? 'rgba(130, 210, 255, 0.8)'
      : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Value label
    ctx.fillStyle = s.textDim;
    ctx.font = `10px ${s.font}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const displayVal = Number.isInteger(value) ? value : value.toFixed(2);
    ctx.fillText(String(displayVal), x + w, y - 2);
  },

  hitTest(control, x, y, bounds) {
    const { x: bx, y: by, w: bw, h: bh } = bounds;
    const trackY = by + bh / 2;

    const { min, max } = control;
    const value = control._state?.value ?? min;
    const frac = (max - min) !== 0 ? (value - min) / (max - min) : 0.5;
    const thumbX = bx + frac * bw;
    const thumbDist = Math.hypot(x - thumbX, y - trackY);
    if (thumbDist <= SLIDER_THUMB_R + 2) {
      return { hit: true, frac: (x - bx) / bw };
    }

    if (x >= bx && x <= bx + bw && y >= trackY - SLIDER_H / 2 && y <= trackY + SLIDER_H / 2) {
      return { hit: true, frac: (x - bx) / bw };
    }

    return null;
  },

  getBounds(control, x, y, w) {
    return { x, y, w, h: SLIDER_H + 4 };
  }
};
// ── Knob Control ──────────────────────────────────────────────────────────
export const KnobControl = {
  render(ctx, control, x, y, w, h, state) {
    const s = DEBUG_STATE.style;
    const { min, max } = control;
    const value = state.value ?? min;
    const frac = (max - min) !== 0 ? (value - min) / (max - min) : 0;
    const cx = x + KNOB_R;
    const cy = y + KNOB_R;

    ctx.fillStyle = state.dragging
      ? 'rgba(130, 210, 255, 0.3)'
      : state.hover
        ? 'rgba(255,255,255,0.15)'
        : 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(cx, cy, KNOB_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = state.dragging
      ? 'rgba(130, 210, 255, 0.6)'
      : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const angle = -Math.PI / 2 + frac * Math.PI * 1.5;
    const indicatorLen = KNOB_R * 0.7;
    const ix = cx + Math.cos(angle) * indicatorLen;
    const iy = cy + Math.sin(angle) * indicatorLen;

    ctx.strokeStyle = state.dragging
      ? 'rgba(130, 210, 255, 1)'
      : 'rgba(240,245,255,0.85)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ix, iy);
    ctx.stroke();

    ctx.fillStyle = s.textDim;
    ctx.font = `10px ${s.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const displayVal = Number.isInteger(value) ? value : value.toFixed(2);
    ctx.fillText(String(displayVal), cx, cy + KNOB_R + 2);
  },

  hitTest(control, x, y, bounds) {
    const { x: bx, y: by } = bounds;    const cx = bx + KNOB_R;
    const cy = by + KNOB_R;
    const dist = Math.hypot(x - cx, y - cy);
    if (dist <= KNOB_R + 2) {
      return { hit: true };
    }
    return null;
  },

  getBounds(control, x, y) {
    return { x, y, w: KNOB_R * 2, h: KNOB_R * 2 + 16 };
  }
};

// ── Dropdown Control ──────────────────────────────────────────────────────
export const DropdownControl = {
  render(ctx, control, x, y, w, h, state) {
    const s = DEBUG_STATE.style;
    const options = control.options || [];
    const currentValue = state.value;
    const currentLabel = this._getLabel(options, currentValue);

    ctx.fillStyle = state.open
      ? 'rgba(130, 210, 255, 0.2)'
      : state.hover
        ? 'rgba(255,255,255,0.12)'
        : 'rgba(255,255,255,0.08)';
    drawRoundedRect(ctx, x, y, w, DROPDOWN_H, 4);
    ctx.fill();

    ctx.strokeStyle = state.open
      ? 'rgba(130, 210, 255, 0.6)'
      : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x + 0.5, y + 0.5, w - 1, DROPDOWN_H - 1, 4);
    ctx.stroke();

    ctx.fillStyle = 'rgba(240,245,255,0.85)';
    ctx.font = `10px ${s.font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentLabel, x + 6, y + DROPDOWN_H / 2);

    ctx.fillStyle = 'rgba(240,245,255,0.6)';
    ctx.font = `10px ${s.font}`;
    ctx.textAlign = 'right';
    ctx.fillText(state.open ? '▲' : '▼', x + w - 6, y + DROPDOWN_H / 2);

    if (state.open && options.length > 0) {
      const listY = y + DROPDOWN_H + 2;      const listH = options.length * DROPDOWN_ITEM_H;

      ctx.fillStyle = 'rgba(20, 20, 40, 0.95)';
      drawRoundedRect(ctx, x, listY, w, listH, 4);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, x + 0.5, listY + 0.5, w - 1, listH - 1, 4);
      ctx.stroke();

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const optY = listY + i * DROPDOWN_ITEM_H;
        const isHover = state.hoverIdx === i;
        const isSelected = this._getValue(opt) === currentValue;

        if (isHover) {
          ctx.fillStyle = 'rgba(130, 210, 255, 0.2)';
          ctx.fillRect(x + 2, optY, w - 4, DROPDOWN_ITEM_H);
        }

        ctx.fillStyle = isSelected
          ? 'rgba(130, 210, 255, 0.9)'
          : 'rgba(240,245,255,0.85)';
        ctx.font = `10px ${s.font}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(this._getLabel(options, this._getValue(opt)), x + 6, optY + DROPDOWN_ITEM_H / 2);
      }
    }
  },

  hitTest(control, x, y, bounds) {
    const { x: bx, y: by, w: bw } = bounds;
    const options = control.options || [];

    if (x >= bx && x <= bx + bw && y >= by && y <= by + DROPDOWN_H) {
      return { type: 'button' };
    }

    if (bounds._state?.open && options.length > 0) {
      const listY = by + DROPDOWN_H + 2;
      for (let i = 0; i < options.length; i++) {
        const optY = listY + i * DROPDOWN_ITEM_H;
        if (x >= bx && x <= bx + bw && y >= optY && y <= optY + DROPDOWN_ITEM_H) {
          return { type: 'option', idx: i };
        }
      }
    }
    return null;
  },

  getBounds(control, x, y, w) {
    const options = control.options || [];
    const openH = options.length * DROPDOWN_ITEM_H + 2;
    return { x, y, w, h: DROPDOWN_H + openH };
  },

  _getLabel(options, value) {
    const opt = options.find(o => this._getValue(o) === value);
    if (!opt) return String(value ?? '—');
    return typeof opt === 'object' ? (opt.label ?? String(opt.value)) : String(opt);
  },

  _getValue(opt) {
    return typeof opt === 'object' ? opt.value : opt;
  }
};

// ── Checkbox Control ──────────────────────────────────────────────────────
export const CheckboxControl = {
  render(ctx, control, x, y, w, h, state) {
    const checked = state.value ?? false;

    ctx.fillStyle = state.hover
      ? 'rgba(130, 210, 255, 0.15)'
      : 'rgba(255,255,255,0.08)';
    drawRoundedRect(ctx, x, y, CHECKBOX_SIZE, CHECKBOX_SIZE, 3);
    ctx.fill();

    ctx.strokeStyle = checked
      ? 'rgba(130, 210, 255, 0.8)'
      : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x + 0.5, y + 0.5, CHECKBOX_SIZE - 1, CHECKBOX_SIZE - 1, 3);
    ctx.stroke();

    if (checked) {
      ctx.strokeStyle = 'rgba(130, 210, 255, 1)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 4, y + CHECKBOX_SIZE / 2);
      ctx.lineTo(x + CHECKBOX_SIZE / 2 - 1, y + CHECKBOX_SIZE - 5);
      ctx.lineTo(x + CHECKBOX_SIZE - 4, y + 5);
      ctx.stroke();
    }  },

  hitTest(control, x, y, bounds) {
    const { x: bx, y: by } = bounds;
    if (x >= bx && x <= bx + CHECKBOX_SIZE && y >= by && y <= by + CHECKBOX_SIZE) {
      return { hit: true };
    }
    return null;
  },

  getBounds(control, x, y) {
    return { x, y, w: CHECKBOX_SIZE, h: CHECKBOX_SIZE };
  }
};
// ── Color Picker Control ──────────────────────────────────────────────────
export const ColorPickerControl = {
  render(ctx, control, x, y, w, h, state) {
    const s = DEBUG_STATE.style;
    const currentColor = state.value || '#ffffff';
    const palette = control.palette || this._defaultPalette();

    ctx.fillStyle = currentColor;
    drawRoundedRect(ctx, x, y, COLOR_SWATCH_W, COLOR_SWATCH_H, 3);
    ctx.fill();

    ctx.strokeStyle = state.hover || state.open
      ? 'rgba(130, 210, 255, 0.6)'
      : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x + 0.5, y + 0.5, COLOR_SWATCH_W - 1, COLOR_SWATCH_H - 1, 3);
    ctx.stroke();

    ctx.fillStyle = 'rgba(240,245,255,0.85)';
    ctx.font = `10px ${s.font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentColor, x + COLOR_SWATCH_W + 6, y + COLOR_SWATCH_H / 2);

    if (state.open && palette.length > 0) {
      const paletteY = y + COLOR_SWATCH_H + 4;
      const cols = COLOR_PALETTE_COLS;
      const rows = Math.ceil(palette.length / cols);
      const paletteW = cols * COLOR_PALETTE_ITEM_SIZE;
      const paletteH = rows * COLOR_PALETTE_ITEM_SIZE;

      ctx.fillStyle = 'rgba(20, 20, 40, 0.95)';
      drawRoundedRect(ctx, x, paletteY, paletteW + 4, paletteH + 4, 4);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, x + 0.5, paletteY + 0.5, paletteW + 3, paletteH + 3, 4);
      ctx.stroke();

      for (let i = 0; i < palette.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const sx = x + 2 + col * COLOR_PALETTE_ITEM_SIZE;
        const sy = paletteY + 2 + row * COLOR_PALETTE_ITEM_SIZE;
        const isHover = state.hoverIdx === i;

        ctx.fillStyle = palette[i];
        ctx.fillRect(sx, sy, COLOR_PALETTE_ITEM_SIZE - 1, COLOR_PALETTE_ITEM_SIZE - 1);
        if (isHover) {
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx, sy, COLOR_PALETTE_ITEM_SIZE - 1, COLOR_PALETTE_ITEM_SIZE - 1);
        }
      }
    }
  },

  hitTest(control, x, y, bounds) {
    const { x: bx, y: by } = bounds;
    const palette = control.palette || this._defaultPalette();

    if (x >= bx && x <= bx + COLOR_SWATCH_W && y >= by && y <= by + COLOR_SWATCH_H) {
      return { type: 'swatch' };
    }

    if (bounds._state?.open && palette.length > 0) {
      const paletteY = by + COLOR_SWATCH_H + 4;
      const cols = COLOR_PALETTE_COLS;
      for (let i = 0; i < palette.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const sx = bx + 2 + col * COLOR_PALETTE_ITEM_SIZE;
        const sy = paletteY + 2 + row * COLOR_PALETTE_ITEM_SIZE;
        if (x >= sx && x <= sx + COLOR_PALETTE_ITEM_SIZE - 1 &&
            y >= sy && y <= sy + COLOR_PALETTE_ITEM_SIZE - 1) {
          return { type: 'color', idx: i };
        }
      }
    }

    return null;
  },

  getBounds(control, x, y) {
    const palette = control.palette || this._defaultPalette();
    const cols = COLOR_PALETTE_COLS;
    const rows = Math.ceil(palette.length / cols);
    const paletteH = rows * COLOR_PALETTE_ITEM_SIZE + 4;
    return { x, y, w: COLOR_SWATCH_W + 80, h: COLOR_SWATCH_H + paletteH };
  },

  _defaultPalette() {
    return [
      '#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80',
      '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080',
      '#ffffff', '#cccccc', '#888888', '#444444', '#000000', '#804020'
    ];
  }};

// ── Control Dispatcher ────────────────────────────────────────────────────
export const ControlRenderer = {
  render(ctx, control, x, y, w, h, state) {
    switch (control.type) {
      case ControlType.BUTTON: ButtonControl.render(ctx, control, x, y, w, h, state); break;
      case ControlType.SLIDER: SliderControl.render(ctx, control, x, y, w, h, state); break;
      case ControlType.KNOB: KnobControl.render(ctx, control, x, y, w, h, state); break;
      case ControlType.DROPDOWN: DropdownControl.render(ctx, control, x, y, w, h, state); break;
      case ControlType.CHECKBOX: CheckboxControl.render(ctx, control, x, y, w, h, state); break;
      case ControlType.COLOR_PICKER: ColorPickerControl.render(ctx, control, x, y, w, h, state); break;
      default: console.warn('[ControlRenderer] Unknown control type:', control.type);
    }
  },

  hitTest(control, x, y, bounds) {
    switch (control.type) {
      case ControlType.BUTTON: return ButtonControl.hitTest(control, x, y, bounds);
      case ControlType.SLIDER: return SliderControl.hitTest(control, x, y, bounds);
      case ControlType.KNOB: return KnobControl.hitTest(control, x, y, bounds);
      case ControlType.DROPDOWN: return DropdownControl.hitTest(control, x, y, bounds);
      case ControlType.CHECKBOX: return CheckboxControl.hitTest(control, x, y, bounds);
      case ControlType.COLOR_PICKER: return ColorPickerControl.hitTest(control, x, y, bounds);
      default: return null;
    }
  },

  getBounds(control, x, y, w) {
    switch (control.type) {
      case ControlType.BUTTON: return ButtonControl.getBounds(control, x, y);
      case ControlType.SLIDER: return SliderControl.getBounds(control, x, y, w);
      case ControlType.KNOB: return KnobControl.getBounds(control, x, y);
      case ControlType.DROPDOWN: return DropdownControl.getBounds(control, x, y, w);
      case ControlType.CHECKBOX: return CheckboxControl.getBounds(control, x, y);
      case ControlType.COLOR_PICKER: return ColorPickerControl.getBounds(control, x, y);
      default: return { x, y, w: 0, h: 0 };
    }
  }
};

export default ControlRenderer;