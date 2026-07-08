# SatBlobs Corner Buttons — Radial Sun-Fan Spread

## What Changed

When you **grab a panel's corner to resize** it, 3 action buttons appear (📍 panel button, ⊞ grid toggle, ⛶ expand). They were appearing in a **straight line** along one direction.

Now they **spread radially around the corner** in a sun-fan pattern, like the debug button satellites.

## Before

```
Corner (BR):
    
    [btn][btn][btn]  ← straight line pointing outward
```

## After

```
Corner (BR):
    
    [btn]
      / \
   [btn] [btn]  ← radial spread ±45° around inward direction
```

## Implementation

**File:** `js/modules/debug/sat-blobs.js`

**Changes to `place(corner)` function:**

1. Calculate the **inward direction** (from corner toward panel center)
2. Spread 3 buttons **radially ±45°** around that inward direction using `Math.atan2()` and `Math.cos/sin()`
3. Keep radius at `PAD + BLOB / 2` (~22px), the same touch-safe distance

**Angle calculation:**
- Base angle = direction pointing inward (from corner to panel center)
- Button 0: base angle − 45°
- Button 1: base angle (straight inward)
- Button 2: base angle + 45°

**Per corner:**
- **BR (bottom-right):** buttons fan up-left toward the panel
- **BL (bottom-left):** buttons fan up-right toward the panel
- **TL (top-left):** buttons fan down-right toward the panel
- **TR (top-right):** buttons fan down-left toward the panel

## Fallback Behavior

- If no corner has room for the radial spread, buttons still fall back to **inside the panel along the bottom edge** (straight horizontal line) — this case is unchanged
- The corner-fitting check (all 4 corners, clockwise) still works identically

## Touch & UX

- All buttons remain 22×22px
- Radius: ~22px from corner
- Still tap-responsive, works exactly as before
- The radial spread only applies when opening at a corner — the inside fallback is untouched
