// debug.js – Uses existing HTML button (id="debug-toggle-btn")
(function() {
    let enabled = false;
    let metricsPanel = null;

    function createMetricsPanel() {
        metricsPanel = document.createElement('div');
        metricsPanel.id = 'debug-metrics-panel';
        metricsPanel.style.cssText = `
            position: fixed;
            top: calc(var(--safe, 16px) + 44px + 50px);
            left: var(--safe, 16px);
            background: var(--ui-bg, rgba(8,8,18,0.88));
            backdrop-filter: blur(10px);
            border: 1px solid var(--ui-border, rgba(255,255,255,0.18));
            border-radius: 10px;
            padding: 8px 12px;
            font-family: var(--ui-font, monospace);
            font-size: 11px;
            color: var(--ui-text, #eee);
            display: flex;
            flex-direction: column;
            gap: 6px;
            z-index: 54;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            min-width: 170px;
        `;
        // Inside createMetricsPanel() – replace innerHTML
metricsPanel.innerHTML = `
    <div>🧬 TOTAL PARTICLES: <span id="dbg-total">0</span></div>
    <div>🔥 WARM: <span id="dbg-warm">0</span></div>
    <div>❄️ COOL: <span id="dbg-cool">0</span></div>
    <div>⚫ BURNT: <span id="dbg-burnt">0</span></div>
    <div>🌿 NORMAL: <span id="dbg-normal">0</span></div>
    <div>⏱️ DRAW TIME: <span id="dbg-draw-time">0.00</span> ms</div>
    <div>💾 RAM: <span id="dbg-ram">0.00</span> MB</div>
`;
        metricsPanel.style.display = 'none';
        document.body.appendChild(metricsPanel);
    }

    // Particle count – override via window.DebugConfig.getParticleCount
    function getParticleCount() {
        if (window.DebugConfig && typeof window.DebugConfig.getParticleCount === 'function') {
            return window.DebugConfig.getParticleCount();
        }
        // Fallback: scan common arrays
        const s = window.Sim?.state;
        if (s) {
            if (Array.isArray(s.particles)) return s.particles.length;
            if (Array.isArray(s.loose)) return s.loose.length;
        }
        return 0;
    }

    function getDrawTime() {
        if (window.DebugConfig?.getDrawTime) return window.DebugConfig.getDrawTime();
        return window.__lastDrawTime || 0;
    }

    function getRAM() {
        if (performance.memory) {
            return performance.memory.usedJSHeapSize / (1024 * 1024);
        }
        return 0;
    }

    function updateMetrics() {
    if (!enabled) return;
    const stats = window.DebugConfig?.getParticleStats?.() || { total:0, warm:0, cool:0, burnt:0, normal:0 };
    document.getElementById('dbg-total').innerText = stats.total;
    document.getElementById('dbg-warm').innerText = stats.warm;
    document.getElementById('dbg-cool').innerText = stats.cool;
    document.getElementById('dbg-burnt').innerText = stats.burnt;
    document.getElementById('dbg-normal').innerText = stats.normal;
    document.getElementById('dbg-draw-time').innerText = (window.__lastDrawTime || 0).toFixed(2);
    document.getElementById('dbg-ram').innerText = (performance.memory ? performance.memory.usedJSHeapSize / (1024*1024) : 0).toFixed(2);
}

    function toggleDebug() {
        enabled = !enabled;
        if (metricsPanel) {
            metricsPanel.style.display = enabled ? 'flex' : 'none';
            if (enabled) updateMetrics();
        }
    }

    // Capture frame time using requestAnimationFrame (fallback)
    let lastTimestamp = 0;
    function captureFrameTime(now) {
        if (lastTimestamp !== 0) {
            window.__lastDrawTime = now - lastTimestamp;
        }
        lastTimestamp = now;
        requestAnimationFrame(captureFrameTime);
    }
    requestAnimationFrame(captureFrameTime);

    // Also try to hook into Sim.loop if it exists (more accurate)
    function hookSimLoop() {
        if (window.Sim && typeof window.Sim.loop === 'function') {
            const originalLoop = window.Sim.loop;
            window.Sim.loop = function(t) {
                const start = performance.now();
                originalLoop.call(window.Sim, t);
                const end = performance.now();
                window.__lastDrawTime = end - start;
                if (enabled) updateMetrics();
            };
        }
    }

    // Periodically update metrics while panel is open
    setInterval(() => {
        if (enabled) updateMetrics();
    }, 100);

    function init() {
        createMetricsPanel();
        const btn = document.getElementById('debug-toggle-btn');
        if (btn) {
            btn.addEventListener('click', toggleDebug);
        } else {
            console.warn("Debug button (#debug-toggle-btn) not found in HTML.");
        }
        window.addEventListener('keydown', (e) => {
            if (e.key === '`' || e.key === '~') {
                e.preventDefault();
                toggleDebug();
            }
        });
        hookSimLoop();
        console.log("Debug panel ready. Press ~ or click the top-left button.");
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();