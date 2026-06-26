/**
 * js/modules/rendering/trails.js
 * Prime Module: Off-screen canvas buffer system for planet trails.
 */
import { hypot, clamp, PI2 } from '../../core/math.js';
import { config } from '../../core/config.js';
import { state } from '../../core/state.js';

export const TrailsModule = {
    trailBufs: [],
    trailHead: 0,
    trailSkipper: 0,
    TRAIL_SKIPS: 3, // new governor
    TRAIL_STEPS: 120,
    TRAIL_ALPHAS: [
        1.000, 0.992, 0.983, 0.975, 0.966, 0.958, 0.950, 0.941, 0.933, 0.924,
        0.916, 0.908, 0.899, 0.891, 0.882, 0.874, 0.866, 0.857, 0.849, 0.840,
        0.832, 0.824, 0.815, 0.807, 0.798, 0.790, 0.782, 0.773, 0.765, 0.756,
        0.748, 0.740, 0.731, 0.723, 0.714, 0.706, 0.698, 0.689, 0.681, 0.672,
        0.664, 0.656, 0.647, 0.639, 0.630, 0.622, 0.614, 0.605, 0.597, 0.588,
        0.580, 0.572, 0.563, 0.555, 0.546, 0.538, 0.530, 0.521, 0.513, 0.504,
        0.496, 0.488, 0.479, 0.471, 0.462, 0.454, 0.446, 0.437, 0.429, 0.420,
        0.412, 0.404, 0.395, 0.387, 0.378, 0.370, 0.362, 0.353, 0.345, 0.336,
        0.328, 0.320, 0.311, 0.303, 0.294, 0.286, 0.278, 0.269, 0.261, 0.252,
        0.244, 0.236, 0.227, 0.219, 0.210, 0.202, 0.194, 0.185, 0.177, 0.168,
        0.160, 0.152, 0.143, 0.135, 0.126, 0.118, 0.110, 0.101, 0.093, 0.084,
        0.076, 0.068, 0.059, 0.051, 0.042, 0.034, 0.026, 0.017, 0.009, 0.001],

    init(width, height) {
        if (this.TRAIL_STEPS > 0) {
            this.trailBufs = Array.from({ length: this.TRAIL_STEPS }, () => {
                const c = document.createElement("canvas");
                c.width = width; c.height = height;
                return { canvas: c, ctx: c.getContext("2d"), camX: 0, camY: 0, camZoom: 1, used: false };
            });
        }
    },

    resize(width, height) {
        for (const b of this.trailBufs) {
            b.canvas.width = width; b.canvas.height = height;
            b.used = false;
        }
    },

    renderToBuffer(ctx, width, height, cam, bodies) {
      const buf = this.trailBufs[this.trailHead];
      const bctx = buf.ctx;
      if (!bctx) {console.log("No Canvas");
        return;}
      
      bctx.clearRect(0, 0, width, height);
      bctx.save();
      bctx.translate(width / 2, height / 2);
      bctx.scale(cam.zoom, cam.zoom);
      bctx.translate(-cam.x, -cam.y);
      
      // SIMPLIFIED TRAIL: hull only, no springs, no particles, no atmosphere
      for (const b of bodies) {
        if (b.dead) continue;
                
        // Initialize previous position if it doesn't exist
        if (!b.prevCx) { b.prevCx = b.cx; b.prevCy = b.cy; }
        
        bctx.beginPath();
        bctx.moveTo(b.prevCx, b.prevCy); // Start at last frame's position
        bctx.lineTo(b.cx, b.cy);         // Draw a line to the current position
        
        // Use a lower alpha ('44' is ~25% opacity) so it doesn't stack into a bulb at 60fps
        bctx.strokeStyle = b.pal.lo + '44'; 
        bctx.lineWidth = Math.max(1, b.radius * 0.3);
        bctx.lineCap = 'round';
        bctx.stroke();
        
        // Update previous position for the next frame
        b.prevCx = b.cx;
        b.prevCy = b.cy;
              }
      
      bctx.restore();
      buf.camX = cam.x;
      buf.camY = cam.y;
      buf.camZoom = cam.zoom;
      buf.used = true;
    },

    drawTrail(ctx, width, height, cam) {
        for (let age = this.TRAIL_STEPS - 1; age >= 0; age--) {
            const idx = ((this.trailHead - age - 1) + this.TRAIL_STEPS * 2) % this.TRAIL_STEPS;
            const buf = this.trailBufs[idx];
            if (!buf.used) continue;
            const alpha = this.TRAIL_ALPHAS[age];
            if (alpha < 0.005) continue;

            const scaleRatio = cam.zoom / buf.camZoom;
            const offX = (buf.camX - cam.x) * cam.zoom;
            const offY = (buf.camY - cam.y) * cam.zoom;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = age === 0 ? "source-over" : "lighter";
            ctx.translate(width / 2 + offX, height / 2 + offY);
            ctx.scale(scaleRatio, scaleRatio);
            ctx.translate(-width / 2, -height / 2);
            ctx.drawImage(buf.canvas, 0, 0);
            ctx.restore();
        }
        ctx.globalCompositeOperation = "source-over";
        this.trailHead = (this.trailHead + 1) % this.TRAIL_STEPS;
    }
};