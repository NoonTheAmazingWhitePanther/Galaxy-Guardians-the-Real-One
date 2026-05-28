// debug.js – Adds a debug panel with real-time metrics
(function() {
    // Wait for the DOM and the main Sim object
    function initDebug() {
        if (!window.Sim) {
            console.warn("Debug: window.Sim not ready, retrying...");
            setTimeout(initDebug, 100);
            return;
        }

        // ------------------- Create UI elements -------------------
        const uiBar = document.querySelector('#ui .ui-buttons');
        if (!uiBar) {
            console.error("Debug: Could not find #ui .ui-buttons");
            return;
        }

        // Create debug container
        const dbgContainer = document.createElement('div');
        dbgContainer.className = 'dbg-container';
        dbgContainer.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-left: 8px;
            padding-left: 8px;
            border-left: 1px solid var(--ui-border, rgba(255,255,255,0.2));
        `;

        // Debug toggle button (~)
        const dbgBtn = document.createElement('button');
        dbgBtn.className = 'dbg-btn';
        dbgBtn.textContent = '~';
        dbgBtn.title = 'Debug Panel (~)';
        dbgBtn.style.cssText = `
            background: rgba(255,255,255,0.08);
            border: 1px solid var(--ui-border, rgba(255,255,255,0.3));
            color: var(--ui-accent, #0ff);
            padding: 4px 8px;
            border-radius: 6px;
            font-family: inherit;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
        `;
        dbgBtn.onmouseenter = () => dbgBtn.style.background = 'rgba(255,255,255,0.18)';
        dbgBtn.onmouseleave = () => dbgBtn.style.background = 'rgba(255,255,255,0.08)';

        // Metrics panel (initially hidden)
        const metricsPanel = document.createElement('div');
        metricsPanel.className = 'dbg-metrics';
        metricsPanel.style.cssText = `
            position: absolute;
            bottom: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--ui-bg, rgba(0,0,0,0.8));
            backdrop-filter: blur(12px);
            border: 1px solid var(--ui-border, rgba(255,255,255,0.2));
            border-radius: 8px;
            padding: 8px 14px;
            font-family: var(--ui-font, monospace);
            font-size: 11px;
            white-space: nowrap;
            display: flex;
            flex-direction: row;
            gap: 12px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            pointer-events: none;
        `;
        metricsPanel.innerHTML = `
            <div>🧬 PARTICLES: <span id="dbg-particles">0</span></div>
            <div>⏱️ DRAW TIME: <span id="dbg-draw-time">0.00</span> ms</div>
            <div>💾 RAM (JS): <span id="dbg-ram">0.00</span> MB</div>
            <div>🎮 DRAW CALLS: <span id="dbg-draw-calls">0</span></div>
            <div>🔺 TRIANGLES: <span id="dbg-triangles">0</span></div>
        `;
        metricsPanel.style.display = 'none';

        dbgContainer.appendChild(dbgBtn);
        uiBar.appendChild(dbgContainer);
        document.body.appendChild(metricsPanel);

        // State
        let enabled = false;

        // ------------------- Helper functions -------------------
        function countParticles() {
            let count = 0;
            const state = window.Sim.state;
            if (!state) return 0;
            if (state.loose) count += state.loose.length;
            if (state.asteroids) {
                for (let a of state.asteroids) {
                    count += (a.children ? a.children.length : 1);
                }
            }
            if (state.flashes) count += state.flashes.length;
            if (state.particles) count += state.particles.length; // if exists
            return count;
        }

        function getRAM() {
            if (performance.memory) {
                return performance.memory.usedJSHeapSize / (1024 * 1024);
            }
            return 0;
        }

        function getRenderStats() {
            const renderer = window.Sim.renderer;
            if (renderer && renderer.info) {
                return {
                    calls: renderer.info.render.calls,
                    triangles: renderer.info.render.triangles
                };
            }
            return { calls: 0, triangles: 0 };
        }

        let lastDrawTime = 0;

        function updateMetrics() {
            if (!enabled) return;

            // Measure draw time for current frame (approximate)
            const start = performance.now();
            // The main loop already did drawing, but we can measure between frames.
            // For simplicity, we assume the previous frame's draw duration is stored.
            // We'll update draw time from the animation loop itself.
            // Better: Measure inside the loop. We'll patch Sim.loop later.

            const particleCount = countParticles();
            const ramUsed = getRAM();
            const stats = getRenderStats();

            document.getElementById('dbg-particles').innerText = particleCount.toLocaleString();
            document.getElementById('dbg-ram').innerText = ramUsed.toFixed(2);
            document.getElementById('dbg-draw-calls').innerText = stats.calls;
            document.getElementById('dbg-triangles').innerText = stats.triangles;

            // Draw time is set by the patched loop
            const drawTimeSpan = document.getElementById('dbg-draw-time');
            if (drawTimeSpan && window.__debugDrawTime !== undefined) {
                drawTimeSpan.innerText = window.__debugDrawTime.toFixed(2);
            }
        }

        // ------------------- Hook into the animation loop -------------------
        // Save original loop function
        const originalLoop = window.Sim.loop;
        if (originalLoop) {
            window.Sim.loop = function(t) {
                const drawStart = performance.now();
                originalLoop.call(window.Sim, t);
                const drawEnd = performance.now();
                window.__debugDrawTime = drawEnd - drawStart;
                if (enabled) updateMetrics();
            };
        } else {
            // Fallback: periodically update metrics
            setInterval(() => {
                if (enabled) updateMetrics();
            }, 100);
        }

        // ------------------- Toggle function -------------------
        function toggleDebug() {
            enabled = !enabled;
            metricsPanel.style.display = enabled ? 'flex' : 'none';
            if (enabled) updateMetrics();
        }

        // ------------------- Event listeners -------------------
        dbgBtn.addEventListener('click', toggleDebug);
        window.addEventListener('keydown', (e) => {
            if (e.key === '`' || e.key === '~') {
                e.preventDefault();
                toggleDebug();
            }
        });

        console.log("Debug module loaded. Press ~ to toggle debug panel.");
    }

    // Start after DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDebug);
    } else {
        initDebug();
    }
})();
