/**
 * js/core/button-definitions.js
 * BUTTON DEFINITIONS — All GUI Buttons
 *
 * This file centralizes all button registrations.
 * Individual modules call ButtonRegistry.register() when they load.
 *
 * Pattern:
 *   - TAP (< 500ms) = primary action (toggle, open, cycle)
 *   - LONG PRESS (>= 500ms) = alternative action (reset, undo, clear)
 *
 * Call registerAllButtons() at startup in main.js:
 *   import registerAllButtons from './core/button-definitions.js';
 *   registerAllButtons();
 */

import { ButtonRegistry } from './button-registry.js';

export function registerAllButtons() {
  // ─── DEBUG MODE ───
  ButtonRegistry.register('debug-btn', {
    onTap() {
      const R = window._DebugRouter;
      if (R?.masterEnabled) R.masterDisable();
      else R?.masterEnable?.();
    },
    onLongPress() {
      // Reset all panels to factory defaults
      try { window.GGPrefs?.resetToBase?.(); } catch (_) {}
    },
    hotkey: 'd'
  });

  // ─── BENCHMARK ───
  ButtonRegistry.register('bench-btn', {
    onTap() {
      try { window._Benchmark?.start?.(); } catch (_) {}
    },
    onLongPress() {
      try { window._Benchmark?.clear?.(); } catch (_) {}
    },
    hotkey: 'b'
  });

  // ─── ARRANGE / TETRIS ───
  ButtonRegistry.register('dbg-closeall', {
    onTap() {
      try { window._TetrisFan?.open?.(); } catch (_) {}
    },
    onLongPress() {
      // Restore baked default layout
      try { window._DebugRouter?.restoreBakedLayout?.(); } catch (_) {}
    },
    hotkey: 'a'
  });

  // ─── UNDO ───
  ButtonRegistry.register('dbg-reset', {
    onTap() {
      try { window._DebugRouter?.undoLayout?.(false); } catch (_) {}
    },
    onLongPress() {
      try { window._DebugRouter?.undoLayout?.(true); } catch (_) {}
    },
    hotkey: 'z'
  });

  // ─── GRID / FREE ───
  ButtonRegistry.register('dbg-arrange', {
    onTap() {
      try { window._DebugRouter?.toggleSnapGrid?.(); } catch (_) {}
    },
    onLongPress() {
      try { window._DebugRouter?.cycleGridDensity?.(); } catch (_) {}
    },
    hotkey: 'g'
  });

  // ─── EXPAND ───
  ButtonRegistry.register('dbg-expand', {
    onTap() {
      try { window._DebugRouter?.expandAll?.(); } catch (_) {}
    },
    onLongPress() {
      try { window._DebugRouter?.minimizeAll?.(); } catch (_) {}
    },
    hotkey: 'e'
  });

  // ─── GLASSES / RATIO ───
  ButtonRegistry.register('dbg-glasses', {
    onTap() {
      try { window._DebugRouter?.cycleRatio?.(); } catch (_) {}
    },
    onLongPress() {
      try { window._DebugRouter?.resetRatio?.(); } catch (_) {}
    },
    hotkey: 'r'
  });

  // ─── AIMS ───
  // TAP-only, same as painting-btn: the real production handler lives in
  // main.js (direct pointerdown, stopPropagation). This entry is the
  // hotkey path — fixed to call the actual InAims API (there was no
  // toggleViz() method; that was a stale reference) and keep the button's
  // .active class in sync. Satellite visibility (aims-sat) no longer
  // depends on this class at all — canvas-satellites.js checks
  // InAims.enabled directly (canvas-drawn now, see rules.md §8) — this
  // class only affects the button's own visual highlight.
  ButtonRegistry.register('aims-btn', {
    onTap() {
      try {
        const ia = window._InAims;
        if (!ia) return;
        if (ia.enabled) ia.disable(); else ia.enable();
        document.getElementById('aims-btn')?.classList.toggle('active', ia.enabled);
      } catch (_) {}
    },
    onLongPress() {
      // Deliberately no-op for now — mirrors painting-btn's long-press.
    },
    hotkey: 'i'
  });

  // ─── PAINTING ───
  // TAP-only by direction: painting-btn's real production tap handler lives
  // in main.js (direct pointerdown listener, stopPropagation — it wins over
  // this registry for actual touches; this entry only matters for the 'p'
  // hotkey path). Long-press is intentionally a no-op for now.
  ButtonRegistry.register('painting-btn', {
    onTap() {
      try {
        window.Sim?.PaintingState?.toggle?.();
        window.Sim?.PaintingButton?.update?.();   // keeps .active in sync (paint-sat visibility is InAims-independent — canvas-satellites.js checks PaintingState.enabled directly)
      } catch (_) {}
    },
    onLongPress() {
      // Deliberately no-op for now.
    },
    hotkey: 'p'
  });

  // ─── SELECTION TOOL ───
  // TAP-only by direction, same pattern as aims-btn/painting-btn: the real
  // production tap-vs-hold handler lives in main.js (direct pointerdown/up,
  // stopPropagation — it wins over this registry for actual touches). This
  // entry only matters for the 'v' hotkey path (tap-equivalent: toggle only,
  // no long-press over keyboard — see button-registry.js's dispatchHotkey).
  // NOTE: before this session, selection-btn had NO wiring anywhere at all
  // — not here, not in main.js — so tapping it did nothing.
  ButtonRegistry.register('selection-btn', {
    onTap() {
      try {
        const st = window.Sim?.SelectionTool;
        if (!st) return;
        st.toggle();
        const btn = document.getElementById('selection-btn');
        if (btn) { btn.classList.toggle('active', st.enabled); btn.textContent = st.icon; }
      } catch (_) {}
    },
    onLongPress() {
      // Deliberately no-op over keyboard — mode-cycling is a touch/hold
      // gesture (main.js), matching aims/painting's no-op long-press.
    },
    hotkey: 'v'
  });

  // ─── CONFIG ───
  ButtonRegistry.register('config-btn', {
    onTap() {
      try { window._ConfigMenu?.toggle?.(); } catch (_) {}
    },
    onLongPress() {
      try { window._ConfigMenu?.save?.(); } catch (_) {}
    },
    hotkey: 'c'
  });

  // ─── CLEAR ───
  ButtonRegistry.register('clear-btn', {
    onTap() {
      try { window.Sim?.clear?.(); } catch (_) {}
    },
    onLongPress() {
      try { window.Sim?.reset?.(); } catch (_) {}
    },
    hotkey: 'Delete'
  });

  console.log(`[ButtonRegistry] Registered ${ButtonRegistry.list().length} buttons`);
}

export default registerAllButtons;
