// 1. Add import at the top:
import { PhysicsCounter } from '../debug/physics-counter.js';

// 2. Inside tickBodies -> PHASE 2 (Fused gravity + integration):
for (let pi = 0; pi < particles.length; pi++) {
  const p = particles[pi];
  if (p.dead) continue;
  PhysicsCounter.stats.particlesIntegrated++; // <-- ADD THIS

// 3. Inside solveSprings:
for (let i = 0; i < ss.length; i++) {
  const sp = ss[i];
  if (sp.broken) continue;
  PhysicsCounter.stats.springsSolved++; // <-- ADD THIS

// 4. Inside applyGravity (right at the start of the function):
export const applyGravity = (p, nParticles, gravConst, sunMass, sunX, sunY, bodies, sunGrav) => {
  PhysicsCounter.stats.gravityChecks++; // <-- ADD THIS

// 5. Inside tickLoose (right after the life check):
for (let li = looseArr.length - 1; li >= 0; li--) {
  const lp = looseArr[li];
  if (lp.life <= 0.02) continue;
  PhysicsCounter.stats.looseTicked++; // <-- ADD THIS
  
  // 1. Add import at the top:
import { PhysicsCounter } from '../debug/physics-counter.js';

// 2. Inside interBodyCollisions (when impulse is applied):
const jVal = -(1.35) * vn / denom;
PhysicsCounter.stats.collisionsResolved++; // <-- ADD THIS

// 3. Inside looseVsPlanets (when impulse is applied):
const j = -(1 + 0.45) * vn / denom;
PhysicsCounter.stats.collisionsResolved++; // <-- ADD THIS

// ... (Keep all your existing install/reset/uninstall code exactly the same) ...

  draw(ctx, opts = {}) {
    const scale = opts.scale !== undefined ? opts.scale : 1.25;
    const offsetY = opts.offsetY || 0; // <-- NEW: Allows vertical stacking

    // ... (Keep all your CSS variable mappings exactly the same) ...

    // Position: Middle Left + Offset
    const x = safeMargin;
    const y = (ctx.canvas.height / 2) - (panelH / 2) + offsetY; // <-- UPDATED

    // ... (Keep all the drawing logic exactly the same) ...
    
    import { DrawCallCounter } from './modules/debug/draw-call-counter.js';
import { PhysicsCounter } from './modules/debug/physics-counter.js';

function render() {
  // 1. Reset counters at the start of the frame
  DrawCallCounter.reset();
  PhysicsCounter.reset();

  // ... run your physics tick and rendering ...

  // 2. Draw overlays at the end of the frame
  // Shift Draw Calls UP by 90px, shift Physics DOWN by 90px
  DrawCallCounter.draw(ctx, { offsetY: -90 });
  PhysicsCounter.draw(ctx, { offsetY: 90 });
}

import { DrawCallCounter } from './modules/debug/draw-call-counter.js';
import { PhysicsCounter } from './modules/debug/physics-counter.js';
import { DebugRouter } from './modules/debug/debug-router.js';

// Install once at startup
DrawCallCounter.install();

// Create counter instances object
const debugCounters = {
  drawCalls: DrawCallCounter,
  physics: PhysicsCounter,
};

function render() {
  // Reset all counters
  DebugRouter.resetAll(debugCounters);

  // ... run physics and rendering ...

  // Draw all enabled debug panels
  DebugRouter.drawAll(ctx, debugCounters);
}

// Toggle panels with keyboard or UI
document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') {
    DebugRouter.toggleAll();
  }
  if (e.key === '1') {
    DebugRouter.togglePanel('drawCalls');
  }
  if (e.key === '2') {
    DebugRouter.togglePanel('physics');
  }
});

// ... inside mainLoop(t) ...

// 1. REPOSITION (Tweak these numbers to move them above/below the UI bars)
DebugRouter.panels.drawCalls.offsetY = -120; // Moves Draw Calls UP
DebugRouter.panels.physics.offsetY = 80;     // Moves Physics DOWN

// 2. DRAW (The normal command handles the rest)
DebugRouter.drawAll(ctx, debugCounters);

// ... rest of your loop ...

// 1. Update the import at the top of main.js
import { InputModule, InputState } from './modules/input/input.module.js';

// 2. Update the DrawAll and drawCharge calls (around line 250)
DrawAll(ctx, t, alpha, didPhysicsTick, (drawCtx) => {
    // Changed from InputModule.holding to InputState.isHolding
    OverlaysModule.drawOrbitPreview(drawCtx, InputState.isHolding, InputState.holdTime, InputState.mouseX, InputState.mouseY);
});

// Changed from InputModule.holding to InputState.isHolding
OverlaysModule.drawCharge(ctx, InputState.isHolding, InputState.holdTime, InputState.mouseX, InputState.mouseY, slider.value);

// 3. Update the cursor position at the very bottom of mainLoop
if (cursorEl) { 
    cursorEl.style.left = InputState.mouseX + "px"; 
    cursorEl.style.top = InputState.mouseY + "px"; 
}

// CHANGE FROM:
DrawAll(ctx, t, alpha, didPhysicsTick, (drawCtx) => {
    OverlaysModule.drawOrbitPreview(drawCtx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty);
});
OverlaysModule.drawCharge(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty, slider.value);

// CHANGE TO:
DrawAll(ctx, t, alpha, didPhysicsTick, (drawCtx) => {
    OverlaysModule.drawOrbitPreview(drawCtx, InputState.isHolding, InputState.holdTime, InputState.mouseX, InputState.mouseY);
});
OverlaysModule.drawCharge(ctx, InputState.isHolding, InputState.holdTime, InputState.mouseX, InputState.mouseY, slider.value);