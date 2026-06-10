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
    TRAIL_STEPS: 2,
    TRAIL_ALPHAS: [1.0, 0.52, 0.24, 0.09, 0.02],

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