/**
 * js/main.js
 * Galaxy Guardians 2.0 - Main Entry Point & Orchestrator
 */
import { config } from './core/config.js';
import { state, SUN, PALS, physSpeed, paused } from './core/state.js';
import { CameraModule } from './modules/camera/camera.module.js';
import { InputModule } from './modules/input/input.module.js';
import { OverlaysModule } from './modules/ui/overlays.js';
import { AsteroidsModule } from './modules/entities/asteroids.js';
import { EffectsModule } from './modules/rendering/effects.js';
import { SunModule } from './modules/rendering/sun.js';
import { BodiesModule } from './modules/rendering/bodies.js';
import { ParticlesModule } from './modules/rendering/particles.js';
import { TrailsModule } from './modules/rendering/trails.js';
import { tickBodies, tickLoose } from './modules/physics/tick.js';

// ── DOM References ──────────────────────────────────────────────────────
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
const cursorEl = document.getElementById("cursor");
const slider = document.getElementById("size-slider");
const pcountEl = document.getElementById("pcount");
const uiEl = document.getElementById("ui");
const gravSlider = document.getElementById("grav-slider");
const gravVal = document.getElementById("grav-val");

let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;

// ── Game State & Helpers ────────────────────────────────────────────────
let lastT = 0;
let flagdraw = 0;
const totalFrameSkipping = 4;

// ── Initialization ──────────────────────────────────────────────────────
async function init() {
    // 1. Initialize Core Modules
    CameraModule.init(canvas, ctx, W, H);
    InputModule.init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal);
    EffectsModule.init(W, H);
    TrailsModule.init(W, H);

    // 2. Bridge legacy InputModule to new OverlaysModule spawn logic
    // This allows the existing input.module.js to work seamlessly without further rewrites
    window.Sim = window.Sim || {};
    window.Sim.spawnPlanet = (x, y, size) => {
        OverlaysModule.spawnPlanet(x, y, size, pcountEl);
    };
    window.Sim.getPlanetRadius = (sliderVal, charge) => {        const raw = sliderVal * (1 + charge * 4);
        const t = Math.min(raw / 50, 1);
        const multiplier = 0.25 + 2.25 * Math.pow(t, 1.4);
        return Math.max(10, Math.min(110, Math.round(40 * multiplier)));
    };

    // 3. Initial Canvas Clear
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, W, H);

    // 4. Start Loop
    requestAnimationFrame(mainLoop);
}

// ── Main Animation Loop ─────────────────────────────────────────────────
function mainLoop(t) {
    requestAnimationFrame(mainLoop);

    const realFps = (t - lastT) / 1000;
    const rawDt = Math.min(realFps, 0.05);
    lastT = t;

    OverlaysModule.updateFPS(realFps);

    if (flagdraw === totalFrameSkipping) {
        // 1. UI & Camera Updates
        CameraModule.tick();
        
        // 2. Background Layers
        ctx.fillStyle = 'rgba(4,4,12,.28)';
        ctx.fillRect(0, 0, W, H);
        EffectsModule.drawStars(ctx, t, W, H);

        // 3. World-space Physics
        if (!paused && physSpeed > 0 && rawDt > 0) {
            const MAX_SAFE_SD = rawDt * 3.0 * config.PHYS_SCALE;
            const totalSd = rawDt * physSpeed * config.PHYS_SCALE;
            const numTicks = Math.ceil(totalSd / MAX_SAFE_SD);
            const sdPerTick = totalSd / numTicks;

            for (let tick = 0; tick < numTicks; tick++) {
                tickBodies(sdPerTick);
                tickLoose(sdPerTick);
            }
            AsteroidsModule.tick(rawDt * physSpeed * config.PHYS_SCALE);
        }

        // 4. World-space Rendering
        ctx.save();
        CameraModule.apply();
        EffectsModule.drawFlashes(ctx, CameraModule.cam.zoom);
        SunModule.drawSun(ctx, t, CameraModule.cam.zoom);
        SunModule.drawSolarTentacles(ctx, t, CameraModule.cam.zoom);
        SunModule.drawSolarRays(ctx, t, CameraModule.cam.zoom);
        ParticlesModule.drawLoose(ctx, CameraModule.cam.zoom);
        AsteroidsModule.draw(ctx, CameraModule.cam.zoom);
        OverlaysModule.drawOrbitPreview(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty);

        ctx.restore(); // End camera transform

        // 5. Trail System & Bodies
        TrailsModule.renderToBuffer(ctx, W, H, CameraModule.cam, state.bodies);
        BodiesModule.drawBodies(ctx);
        TrailsModule.drawTrail(ctx, W, H, CameraModule.cam);

        // 6. Screen-space Overlays
        OverlaysModule.drawCharge(ctx, InputModule.holding, InputModule.holdT, InputModule.tx, InputModule.ty, slider.value);
        OverlaysModule.drawFPS();
        OverlaysModule.updateCount(pcountEl);

        // Update cursor position
        cursorEl.style.left = InputModule.tx + 'px';
        cursorEl.style.top = InputModule.ty + 'px';

        flagdraw = 0;
    }
    flagdraw++;
}

// ── Event Listeners ─────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    EffectsModule.init(W, H); // Re-init stars for new dimensions
    TrailsModule.resize(W, H);
});

// ── Bootstrap ───────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}