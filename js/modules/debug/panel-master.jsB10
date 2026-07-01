/**
 * js/modules/debug/panel-master.js
 *
 * Expanded panel  → vertical slider on the right edge (unchanged)
 * Minimized panel → knob embedded inside the panel, right side
 *                   title top-left, summary value + label middle-left
 *
 * Knob maps 0.0–2.0 to a 270° arc (−225° to +45° from top).
 * Drag up = increase, drag down = decrease (standard knob feel).
 */
import { DEBUG_STATE } from './debug-state.js';
import { resolveVariable } from './governor.js';

// ── Expanded slider constants ─────────────────────────────────────────────
const SLIDER_W        = 20;
const SLIDER_PAD      = 6;
const THUMB_H         = 16;
const MINIMIZE_BTN_SIZE = 16;

// ── Minimized knob constants ──────────────────────────────────────────────
const KNOB_R          = 16;   // outer radius
const KNOB_PAD_RIGHT  = 10;   // gap from panel right edge to knob centre
const ARC_START       = Math.PI * 0.75;   // 135° — bottom-left
const ARC_END         = Math.PI * 2.25;   // 405° — bottom-right  (270° sweep)

function _knobAngle(value) {
  // value 0..2  →  angle ARC_START..ARC_END
  return ARC_START + (value / 2.0) * (ARC_END - ARC_START);
}

function _fillColor(value) {
  return value > 1.0 ? 'rgba(255,100,80,0.85)'
       : value < 1.0 ? 'rgba(130,210,255,0.85)'
       :                'rgba(255,255,255,0.5)';
}

export const PanelMasterSlider = {

  // ── render ───────────────────────────────────────────────────────────────
  render(ctx, panel, x, y, panelW, panelH, minimized) {
    const s = DEBUG_STATE.style;

    if (minimized) {
      // ── KNOB VALUE SOURCE ───────────────────────────────────────────────
      const kCfg    = panel.config?.minimizedKnob;
      const isVar   = !!kCfg;
      let knobValue, knobMin, knobMax, knobLabel;
      if (isVar) {
        const varRef = resolveVariable(kCfg.variable);
        knobValue = varRef?.get() ?? 0;
        knobMin   = kCfg.min   ?? 0;
        knobMax   = kCfg.max   ?? 10;
        knobLabel = kCfg.label ?? '';
      } else {
        knobValue = panel.panelMasterValue ?? 1.0;
        knobMin   = 0;
        knobMax   = 2;
        knobLabel = 'x';
      }
      const frac  = knobMax > knobMin
        ? Math.max(0, Math.min(1, (knobValue - knobMin) / (knobMax - knobMin))) : 0;
      const angle    = ARC_START + frac * (ARC_END - ARC_START);
      const arcColor = isVar
        ? (knobValue > 0 ? 'rgba(130,210,255,0.85)' : 'rgba(255,255,255,0.3)')
        : _fillColor(knobValue);
      const valStr = isVar
        ? `${Math.round(knobValue)}${knobLabel}` : `${knobValue.toFixed(2)}x`;
      const sv          = panel.summaryValue;
      const manualLabel = panel.manualLabel ?? 'AUTO';
      const isVert      = panel._minVertical;

      const _drawKnob = (kx, ky) => {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(kx, ky, KNOB_R, ARC_START, ARC_END); ctx.stroke();
        ctx.strokeStyle = arcColor; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(kx, ky, KNOB_R, ARC_START, angle); ctx.stroke();
        const grad = ctx.createRadialGradient(kx-3, ky-3, 2, kx, ky, KNOB_R-2);
        grad.addColorStop(0, 'rgba(80,90,110,0.95)');
        grad.addColorStop(1, 'rgba(20,22,32,0.95)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(kx, ky, KNOB_R-5, 0, Math.PI*2); ctx.fill();
        const px = kx + Math.cos(angle)*(KNOB_R-8);
        const py = ky + Math.sin(angle)*(KNOB_R-8);
        ctx.strokeStyle = 'rgba(240,245,255,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(px, py); ctx.stroke();
        ctx.restore();
      };

      const _drawIcons = (btnX, btnY, btnSize, orientIcon, orientX, orientY) => {
        // Orientation toggle
        ctx.fillStyle    = 'rgba(130,210,255,0.7)';
        ctx.font         = `9px ${s.font}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(orientIcon, orientX, orientY);
        // Pin
        if (window._DebugRouter?.masterEnabled) {
          ctx.fillStyle    = panel.pinned ? 'rgba(255,200,80,1)' : 'rgba(240,245,255,0.35)';
          ctx.font         = `8px ${s.font}`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('📌', btnX - btnSize - 2 + btnSize/2, btnY + btnSize/2);
        }
        // Expand ▲
        ctx.fillStyle = 'rgba(130,210,255,0.25)';
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnSize, btnSize, 2);
        ctx.fill();
        ctx.fillStyle    = 'rgba(240,245,255,0.7)';
        ctx.font         = `8px ${s.font}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('▲', btnX + btnSize/2, btnY + btnSize/2);
        // Resize ⊿
        ctx.fillStyle    = 'rgba(240,245,255,0.25)';
        ctx.font         = `10px ${s.font}`;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('⊿', x + panelW - 2, y + panelH - 2);
      };

      if (isVert) {
        // ── VERTICAL ──────────────────────────────────────────────────────
        const kx = x + panelW / 2;
        const ky = y + 20 + 14 + 18 + KNOB_R;
        const btnSize = 12;
        const btnX    = x + panelW - btnSize - 2;
        const btnY    = y + 2;

        // Title
        ctx.fillStyle = 'rgba(240,245,255,0.35)';
        ctx.font      = `7px ${s.font}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(panel.title, x + panelW/2, y + 20);
        // Summary value
        if (sv !== undefined && sv !== null) {
          ctx.fillStyle = s.accent;
          ctx.font      = `bold 11px ${s.font}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText(String(sv), x + panelW/2, y + 32);
        }
        // Knob
        _drawKnob(kx, ky);
        // Value label
        ctx.fillStyle = 'rgba(240,245,255,0.7)';
        ctx.font      = `bold 7px ${s.font}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(valStr, kx, ky + KNOB_R + 3);
        // Manual label
        ctx.fillStyle = manualLabel === 'MANUAL' ? 'rgba(255,180,80,0.9)' : 'rgba(130,210,255,0.55)';
        ctx.font      = `bold 7px ${s.font}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(manualLabel, x + panelW/2, ky + KNOB_R + 14);
        // Icons
        _drawIcons(btnX, btnY, btnSize, '⇔', x + 8, btnY + btnSize/2);

      } else {
        // ── HORIZONTAL ────────────────────────────────────────────────────
        const kx = x + panelW - KNOB_PAD_RIGHT - KNOB_R;
        const ky = y + panelH / 2;
        const btnSize = 12;
        const btnX    = x + panelW - btnSize - 2;
        const btnY    = y + 2;

        // Knob
        _drawKnob(kx, ky);
        // Value label below knob
        ctx.fillStyle = 'rgba(240,245,255,0.7)';
        ctx.font      = `bold 8px ${s.font}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(valStr, kx, y + panelH - 11);
        // Title top-left
        ctx.fillStyle = 'rgba(240,245,255,0.35)';
        ctx.font      = `7px ${s.font}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(panel.title, x + 6, y + 4);
        // Summary value centre
        if (sv !== undefined && sv !== null) {
          ctx.fillStyle = s.accent;
          ctx.font      = `bold 15px ${s.font}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(sv), x + panelW/2, y + panelH/2);
        }
        // Manual label bottom-left clipped
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 4, y, panelW/2 - 8, panelH);
        ctx.clip();
        ctx.fillStyle = manualLabel === 'MANUAL' ? 'rgba(255,180,80,0.9)' : 'rgba(130,210,255,0.55)';
        ctx.font      = `bold 7px ${s.font}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(manualLabel, x + 6, y + panelH - 4);
        ctx.restore();
        // Icons
        _drawIcons(btnX, btnY, btnSize, '⇕', x + 8, y + panelH - 6);
      }

    } else {
      // ── EXPANDED — vertical slider on right edge ──────────────────────
      const value   = panel.panelMasterValue ?? 1.0;
      const sliderX = x + panelW + SLIDER_PAD;
      const sliderY = y;
      const sliderH = panelH;

      // Minimize button ▼
      const btnX = x + panelW - MINIMIZE_BTN_SIZE - 4;
      const btnY = y + 4;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect(btnX, btnY, MINIMIZE_BTN_SIZE, MINIMIZE_BTN_SIZE, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.fillStyle    = 'rgba(240,245,255,0.85)';
      ctx.font         = `10px ${s.font}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▼', btnX + MINIMIZE_BTN_SIZE/2, btnY + MINIMIZE_BTN_SIZE/2);

      // Track
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect(sliderX, sliderY, SLIDER_W, sliderH, 4);
      ctx.fill();

      // Fill
      const thumbY  = sliderY + sliderH - (value / 2.0) * sliderH;
      ctx.fillStyle = _fillColor(value);
      ctx.beginPath();
      ctx.roundRect(sliderX, thumbY, SLIDER_W, sliderH - (thumbY - sliderY), 4);
      ctx.fill();

      // Thumb
      ctx.fillStyle   = panel._masterDragging
        ? 'rgba(255,255,255,0.95)' : 'rgba(240,245,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(sliderX + 2, thumbY - THUMB_H/2, SLIDER_W - 4, THUMB_H, 3);
      ctx.fill();
      ctx.strokeStyle = panel._masterDragging
        ? 'rgba(130,210,255,0.8)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Value label
      ctx.fillStyle    = 'rgba(240,245,255,0.9)';
      ctx.font         = `bold 10px ${s.font}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${value.toFixed(2)}x`, sliderX + SLIDER_W/2, thumbY);
    }
  },

  hitTest(panel, x, y, panelX, panelY, panelW, panelH, minimized) {
    if (minimized) {
      const btnSize = 12;
      const btnX    = panelX + panelW - btnSize - 2;
      const btnY    = panelY + 2;
      const pinBtnX = btnX - btnSize - 2;

      // Pin button only hittable when debug is on
      if (window._DebugRouter?.masterEnabled) {
        if (x >= pinBtnX && x <= pinBtnX + btnSize && y >= btnY && y <= btnY + btnSize) {
          return { type: 'pin' };
        }
      }
      // Expand button
      if (x >= btnX && x <= btnX + btnSize && y >= btnY && y <= btnY + btnSize) {
        return { type: 'minimize' };
      }

      // Orientation toggle — top-left 18×18 area
      if (x >= panelX && x <= panelX + 18 && y >= panelY && y <= panelY + 18) {
        return { type: 'orientToggle' };
      }

      // Knob hit area — exclude bottom-right corner (resize grip)
      const kx   = panelX + panelW - KNOB_PAD_RIGHT - KNOB_R;
      const ky   = panel._minVertical
        ? panelY + 20 + 14 + 18 + KNOB_R
        : panelY + panelH / 2;
      const dist = Math.hypot(x - kx, y - ky);
      const inResizeCorner = x >= panelX + panelW - 36 && y >= panelY + panelH - 36;
      if (dist <= KNOB_R + 4 && !inResizeCorner) {
        return { type: 'knob', kx, ky };
      }
      return null;
    }

    // Expanded — minimize button
    const btnX = panelX + panelW - MINIMIZE_BTN_SIZE - 4;
    const btnY = panelY + 4;
    if (x >= btnX && x <= btnX + MINIMIZE_BTN_SIZE &&
        y >= btnY && y <= btnY + MINIMIZE_BTN_SIZE) {
      return { type: 'minimize' };
    }

    // Expanded — slider track
    const sliderX = panelX + panelW + SLIDER_PAD;
    const sliderY = panelY;
    if (x >= sliderX && x <= sliderX + SLIDER_W &&
        y >= sliderY && y <= sliderY + panelH) {
      const frac  = 1.0 - (y - sliderY) / panelH;
      const value = Math.max(0, Math.min(2.0, frac * 2.0));
      return { type: 'slider', value };
    }
    return null;
  },

  getBounds(panelX, panelY, panelW, panelH, minimized) {
    if (minimized) {
      // Knob is inside the panel — no external bounds needed
      return { x: panelX, y: panelY, w: panelW, h: panelH };
    }
    return {
      x: panelX + panelW + SLIDER_PAD,
      y: panelY,
      w: SLIDER_W,
      h: panelH
    };
  }
};

export default PanelMasterSlider;
