/**
 * js/modules/camera/camera.module.js
 * Prime Module: Viewport math, zoom, pan, and screen-to-world conversions.
 */
import { clamp } from '../../core/math.js';
import { state, SUN } from '../../core/state.js';

export const CameraModule = {
    // Internal state
    cam: { x: 0, y: 0, zoom: 0.08, targetZoom: 0.08, minZoom: 0.01, maxZoom: 4 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    camStart: { x: 0, y: 0 },

    init(canvas, ctx, width, height) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        this._bindEvents();
    },

    tick() {
        // Smooth zoom interpolation
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
    },

    _bindEvents() {
        // Wheel Zoom
        this.canvas.addEventListener("wheel", e => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const newZoom = clamp(this.cam.targetZoom * factor, this.cam.minZoom, this.cam.maxZoom);
            const wb = this.screenToWorld(e.clientX, e.clientY);
            
            this.cam.targetZoom = newZoom;
            this.cam.x = wb.x - (e.clientX - this.width / 2) / newZoom;
            this.cam.y = wb.y - (e.clientY - this.height / 2) / newZoom;
        }, { passive: false });

        // Mouse Panning
        this.canvas.addEventListener("mousedown", e => {
            if (e.button === 1 || e.button === 2) {
                this.isPanning = true;
                this.panStart = { x: e.clientX, y: e.clientY };
                this.camStart = { x: this.cam.x, y: this.cam.y };
                e.preventDefault();
            }
        });

        window.addEventListener("mousemove", e => {
            if (this.isPanning) {
                this.cam.x = this.camStart.x - (e.clientX - this.panStart.x) / this.cam.zoom;
                this.cam.y = this.camStart.y - (e.clientY - this.panStart.y) / this.cam.zoom;
            }
        });

        window.addEventListener("mouseup", e => {
            if (e.button === 1 || e.button === 2) this.isPanning = false;
        });

        this.canvas.addEventListener("contextmenu", e => e.preventDefault());
    }
};