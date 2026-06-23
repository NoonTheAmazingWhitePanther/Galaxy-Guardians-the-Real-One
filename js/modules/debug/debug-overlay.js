/**
 * js/modules/debug/debug-overlay.js
 * Decouples debug UI from the game's frame skipping.
 */
export const DebugOverlay = {
    canvas: null,
    ctx: null,
    
    init() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'debug-overlay';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '1000';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        this.resize();
        window.addEventListener('resize', () => this.resize());
    },
    
    resize() {
        const dpr = window.devicePixelRatio || 1;
        // Make canvas high-res
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        // DO NOT scale context - we'll handle DPR in the renderer
        // this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
};