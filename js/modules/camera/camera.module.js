/**
 * js/modules/camera/camera.module.js
 * Prime Module: Viewport math, zoom, pan, and screen-to-world conversions.
 *
 * REFACTOR (2026-06-19): Removed _bindEvents() entirely.
 * All input listeners now live in in-camera.js inside the InputModule priority chain.
 * CameraModule is pure state + math — no event listeners whatsoever.
 */
import { clamp } from '../../core/math.js';
import { state, SUN } from '../../core/state.js';

export const CameraModule = {
    cam: { x: 0, y: 0, zoom: 0.08, targetZoom: 0.08, minZoom: 0.01, maxZoom: 4 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    camStart: { x: 0, y: 0 },

    init(canvas, ctx, width, height) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        // No _bindEvents() call — input is handled by in-camera.js
    },

    tick() {
        this.cam.zoom += (this.cam.targetZoom - this.cam.zoom) * 0.1;
    },

    apply() {
        this.ctx.translate(this.width / 2, this.height / 2);
        this.ctx.scale(this.cam.zoom, this.cam.zoom);
        this.ctx.translate(-this.cam.x, -this.cam.y);
    },

    screenToWorld(sx, sy) {
        return {
            x: this.cam.x + (sx - this.width / 2) / this.cam.zoom,
            y: this.cam.y + (sy - this.height / 2) / this.cam.zoom
        };
    },

    // Inverse of screenToWorld — needed by anything drawing a screen-space
    // overlay (rectangle, marker) at a WORLD position, e.g. the selection tool.
    worldToScreen(wx, wy) {
        return {
            x: (wx - this.cam.x) * this.cam.zoom + this.width / 2,
            y: (wy - this.cam.y) * this.cam.zoom + this.height / 2
        };
    },

    frameBodies() {
        const pad = 300;
        let minX = -SUN.radius * 6, maxX = SUN.radius * 6;
        let minY = -SUN.radius * 6, maxY = SUN.radius * 6;

        for (const b of state.bodies) {
            if (b.dead) continue;
            minX = Math.min(minX, b.cx - b.radius);
            maxX = Math.max(maxX, b.cx + b.radius);
            minY = Math.min(minY, b.cy - b.radius);
            maxY = Math.max(maxY, b.cy + b.radius);
        }

        this.cam.x = (minX + maxX) / 2;
        this.cam.y = (minY + maxY) / 2;
        this.cam.targetZoom = clamp(
            Math.min(this.width / (maxX - minX + pad * 2), this.height / (maxY - minY + pad * 2)),
            this.cam.minZoom,
            this.cam.maxZoom
        );
    }
};
