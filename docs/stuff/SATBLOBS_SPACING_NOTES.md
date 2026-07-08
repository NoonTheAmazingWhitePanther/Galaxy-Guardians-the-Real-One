# SatBlobs Corner Buttons — Updated Spacing & Direction

## Changes

The corner resize buttons now:
- **Open OUTWARD** (away from the panel, into the corner space — not inward)
- **Larger radius:** 60px (was 15px) — much further from the corner
- **Wider spread:** ±75° (was ±45°) — more comfortable spacing between buttons
- **Safe distance:** ~60px from corner + button size = safe clearance

## Geometry

**Per corner (e.g., bottom-right):**
```
                          [btn]  (−75°)
                        /
Corner ─────── [btn]    (0° outward)
  |               \
  |                [btn]  (+75°)
```

**Distance between buttons:** ~110–130px (at 60px radius with ±75° spread)

**Fitting logic:** Checks if all 3 buttons fit on screen at the preferred corner. If not, walks clockwise to the next corner (BR → BL → TL → TR). Only falls back to inside-panel (straight horizontal) if NO corner fits.

## Implementation Changes

**File:** `js/modules/debug/sat-blobs.js`

1. **Direction:** Changed from inward (`-dy, -dx`) to **outward** (`dy, dx`)
2. **Radius:** Increased from `PAD + BLOB / 2` (~15px) to **60px**
3. **Spread:** Widened from **±45°** to **±75°**

## Result

- Buttons now open well OUTSIDE the panel corner
- Comfortable, spacious sun-fan pattern
- No crowding, good visual hierarchy
- Safe distance from the corner itself and surrounding UI
- Fitting check still works: if a corner is too tight, moves to next corner

## Touch & UX

- All buttons remain 22×22px
- Spacing is now much more generous
- Still responsive and tap-safe
- The inside fallback (if no corner fits) remains unchanged
