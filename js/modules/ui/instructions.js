/**
 * js/modules/ui/instructions.js
 * Moddable Gaming Instructions Plugin.
 * Displays controls, tips, and the arcade physics disclaimer.
 */
export const InstructionsPlugin = {
    isVisible: false,
    panel: null,

    // Default instructions (Mods can override this object entirely)
    data: {
        title: "Galaxy Guardians: Arcade Sandbox",
        disclaimer: "⚠️ Physics Simulation is ~23% Accurate. Designed for emergent fun, not rigid science!",
        controls: [
            "🖱️ Left Click + Hold: Charge & Spawn Planet",
            "🖱️ Right/Middle Drag: Pan Camera",
            "🖱️ Scroll Wheel: Zoom In/Out",
            "⌨️ [F]: Frame all bodies to fit screen",
            "⌨️ [Space]: Pause / Resume Timeline",
            "⌨️ [+] / [-]: Adjust Simulation Speed"
        ],
        tips: [
            "💡 Drop an Ice Asteroid in the Goldilocks Zone to spark life!",
            "💡 Planets shatter into soft-body debris when they burn."
        ]
    },

    init() {
        this.panel = document.createElement('div');
        this.panel.id = 'instructions-panel';
        this.panel.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; 
            background: rgba(8, 8, 18, 0.85); backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px;
            padding: 16px; font-family: 'Space Mono', monospace; font-size: 12px;
            color: #eee; max-width: 320px; z-index: 100; display: none;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        `;
        document.body.appendChild(this.panel);
        this.render();
    },

    render() {
        if (!this.panel) return;
        const html = `
            <h3 style="margin: 0 0 8px 0; color: #ffaa00;">${this.data.title}</h3>
            <p style="color: #ff6666; font-size: 11px; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                ${this.data.disclaimer}
            </p>
            <ul style="padding-left: 16px; margin: 0 0 12px 0; line-height: 1.6;">
                ${this.data.controls.map(c => `<li>${c}</li>`).join('')}
            </ul>
            <ul style="padding-left: 16px; margin: 0; line-height: 1.6; color: #aaddff;">
                ${this.data.tips.map(t => `<li>${t}</li>`).join('')}
            </ul>
        `;
        this.panel.innerHTML = html;
    },

    toggle() {
        this.isVisible = !this.isVisible;
        this.panel.style.display = this.isVisible ? 'block' : 'none';
    },

    // Called by mods to inject custom instructions
    overrideData(newData) {
        this.data = { ...this.data, ...newData };
        this.render();
    }
};