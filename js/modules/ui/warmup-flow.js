/**
 * js/modules/ui/warmup-flow.js
 * THE DAILY PHYSICAL — Captain's warm-up benchmark, staged and moderated.
 *
 * On boot, one jolly card:
 *   "Hi Captain. We are always updating. A benchmark to warm up the
 *    system?"  [Yes] [No]
 *
 * Yes → clean slate (every open button and its satellites off, debug off,
 * tuning suspended — the measurement sees the sim, not the UI), then THE
 * STACK: all three depths together from the left as spring-mesh blob
 * cards, entrance staggered so they build one after another, a live
 * counter beside each ticking 5.0 → 0.0:
 *
 *   "Wakeup · 1 min"     → the pulse check (time-limited).
 *   "Moderation · 3 min" → the working physical.
 *   "Full · 5 min"       → the complete inspection.
 * The deadline owns the run — sessions climb 10 → 1000 planets (the 1000
 * rule) until the clock stops them.
 *
 * Tap one card: it resolves that depth and the others let go in the same
 * staggered rhythm they arrived with. Counter hits 0.0 untouched: the
 * physical is postponed, nothing runs. Moderation: the flow never holds
 * the sim hostage, and whatever depth ran refined BEST PREFERENCES — the
 * governor standards rose exactly that far today.
 *
 * WHY MAIN THREAD, honestly: a Web Worker can't measure what matters. The
 * benchmark exists to find the settings THIS render thread sustains at the
 * screen's rate — running it anywhere else measures a thread the sim never
 * uses (and the project law is vanilla ES modules: no workers). The
 * moderation IS the isolation: staged consent, bounded tiers, self-
 * dismissing cards, benchmark's own save/restore of the scene.
 */

import { UpdatePop }   from './update-pop.js';
import { Benchmark }   from '../debug/benchmark.js';
import { DebugRouter } from '../debug/debug-router.js';
import { TuningLayer } from '../tuning/tuning-layer.js';
import { PaintingState } from '../../core/painting-state.js';
import { PaintingButton } from './painting-button.js';
import { SelectionTool } from '../input/in-selection-tool.js';

// (stage countdown lives in UpdatePop.choose — 5.0 → 0.0 beside each card)

export const WarmupFlow = {
  _ran: false,

  async start() {
    if (this._ran || Benchmark.running) return;
    this._ran = true;

    const answer = await UpdatePop.ask(
      'Hi Captain. We are always updating. A benchmark to warm up the system?',
      ['Yes', 'No']
    );
    if (answer !== 'Yes') return;

    this._cleanSlate();

    // THE STACK: all three depths together from the left, staggered build,
    // a 5.0 → 0.0 counter beside each. One tap picks the depth and the
    // rest let go in the same rhythm; silence at 0.0 postpones the physical.
    const modes = ['WAKEUP', 'MODERATION', 'FULL'];
    const pick = await UpdatePop.choose(
      ['Wakeup · 1 min', 'Moderation · 3 min', 'Full · 5 min'],
      { countdownSec: 5 }
    );

    let ranAny = false;
    try {
      if (pick !== null) {
        await Benchmark.run({ mode: modes[pick] });
        ranAny = true;
      }
    } finally {
      TuningLayer.resume();
    }

    UpdatePop.pop(ranAny
      ? '✨ Warm-up complete — governor standards raised for today.'
      : 'Physical postponed. The governors keep yesterday\u2019s standards.');
  },

  // Clean slate: every open button and its satellites off (satellites
  // follow their parents' isActive() — visible ⟺ touchable does the
  // hiding for free), debug off, tuning suspended. Idempotent; boot
  // state is mostly this already, but the flow can be re-triggered later.
  _cleanSlate() {
    try { window._InAims?.disable?.(); } catch (_) {}
    try { PaintingState.set(false); PaintingButton.update?.(); } catch (_) {}
    try { if (SelectionTool.enabled) SelectionTool.toggle?.(); SelectionTool.enabled = false; } catch (_) {}
    try { DebugRouter.masterEnabled = false; } catch (_) {}
    try { TuningLayer.suspend(); } catch (_) {}
  },
};

if (typeof window !== 'undefined') window.WarmupFlow = WarmupFlow;
