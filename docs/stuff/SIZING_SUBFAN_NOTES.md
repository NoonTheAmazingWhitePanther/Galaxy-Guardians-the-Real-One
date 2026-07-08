# Sizing Sub-Fan Refactor

## What Changed

The ⊕ (increase) and ⊖ (decrease) sizing buttons previously sat in a **straight horizontal line** on the bottom row of the Tetris Fan — side by side with all the other tool buttons (⇉ ▦ ↶ ↷ etc).

Now they **open a radial sub-fan**, matching the sun-ray spread pattern of the debug button's satellites.

## Visual Before & After

### BEFORE (straight line)
```
Tetris Fan bottom row (all horizontal):
⇉ ▦ ↶ ↷ ⊕ ⊖ ⇅ ▤
     (all at yBot, evenly spaced)
```

### AFTER (radial sub-fan)
```
Bottom row now:
⇉ ▦ ↶ ↷ ± ⇅ ▤
           ↓ (tap ± to open sub-fan)

           ⊕ (up-right at -40°)
         /
        ±
         \
           ⊖ (down-right at +40°)

Spread geometry matches debug satellites:
- Radius: BLOB × 1.2 (~28–30px)
- Angles: ±40° from vertical
- Touch-safe spacing, same visual family as .dbg-sat
```

## Implementation Details

**File:** `js/modules/debug/tetris-fan.js`

**Changes:**
1. Replaced lines 160–166 (two inline buttons) with one ± button (lines 160–163)
2. Added new `_openSizing(cx, cy)` function (after `_openSort`) that:
   - Calculates radial positions using Math.cos/sin
   - Spawns ⊕ and ⊖ blobs at ±40° angles
   - Feeds toast messages ("SIZE: INCREASE +0.25" / "SIZE: DECREASE -0.25")
   - Closes the fan after action (like SORT does)

**Geometry:**
- Center point passed from ± button position
- y-offset: `yBot - BLOB - GAP * 2` (opens upward, not downward)
- Radius: `BLOB * 1.2` (~28px at 24px blob size, matching debug satellites' ~4.5px inter-button gaps)
- Angles: `±40°` from vertical

## Touch & Spacing

- Blobs are the same 24px size as in the main fan
- Inter-blob distance: ~14–16px (touch-safe minimum)
- No overlap with the ± center button or the main fan row
- Dismiss behavior: tapping anything else closes the sub-fan (inherited from `.close()`)

## UpdateFeed Integration

Both buttons now announce via the UpdateFeed:
- `SIZE: INCREASE +0.25`
- `SIZE: DECREASE -0.25`

(Visible in the toast bar at the top-left during debug mode.)
