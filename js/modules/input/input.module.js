/**
 * js/modules/input/input.module.js
 * Prime Module: Mouse, touch, keyboard, UI sliders, and Pan Pad.
 */
import { clamp, hypot } from '../../core/math.js';
import { state, physSpeed, paused, setSunGravMult, setPhysSpeed, togglePause, SPEED_MAX } from '../../core/state.js';
import { CameraModule } from '../camera/camera.module.js';

export const InputModule = {
    holding: false,
    holdT: 0,
    tx: 0,
    ty: 0,
    spDrag: false,
    zmDrag: false,
    panPadActive: false,
    panPadDir: { x: 0, y: 0 },
    panPadPower: 0,

    init(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal) {
        this.canvas = canvas;
        this.uiEl = uiEl;
        this.cursorEl = cursorEl;
        this.slider = slider;
        this.pcountEl = pcountEl;
        this.gravSlider = gravSlider;
        this.gravVal = gravVal;
        this.tx = window.innerWidth / 2;
        this.ty = window.innerHeight / 2;
        
        this._bindUI();
        this._bindInput();
        this._bindKeyboard();
        this._bindPanPad();
    },

    _bindUI() {
        if (this.gravSlider) {
            this.gravSlider.addEventListener("input", () => {
                const val = parseFloat(this.gravSlider.value);
                setSunGravMult(val);
                if (this.gravVal) this.gravVal.textContent = val.toFixed(2) + "×";
            });
        }

        const spTrack = document.getElementById("sp-track");
        const spLabel = document.getElementById("sp-label");
        const spPause = document.getElementById("sp-pause");
        
        if (spPause) {            document.getElementById("sp-fast")?.addEventListener("pointerdown", e => {
                e.preventDefault();
                setPhysSpeed(parseFloat((physSpeed + 0.5).toFixed(1)));
                this._updateSpeedUI(spLabel, spPause);
            });
            document.getElementById("sp-slow")?.addEventListener("pointerdown", e => {
                e.preventDefault();
                setPhysSpeed(parseFloat((physSpeed - 0.5).toFixed(1)));
                this._updateSpeedUI(spLabel, spPause);
            });
            spPause.addEventListener("pointerdown", e => { 
                e.preventDefault(); 
                togglePause(); 
                this._updateSpeedUI(spLabel, spPause);
            });
        }

        if (spTrack) {
            const spTrackPos = clientY => {
                const rect = spTrack.getBoundingClientRect();
                const newSpeed = parseFloat((clamp(1 - (clientY - rect.top) / rect.height, 0, 1) * SPEED_MAX).toFixed(1));
                setPhysSpeed(newSpeed);
                this._updateSpeedUI(spLabel, spPause);
            };
            spTrack.addEventListener("pointerdown", e => { this.spDrag = true; spTrackPos(e.clientY); e.preventDefault(); });
            window.addEventListener("pointermove", e => { if (this.spDrag) spTrackPos(e.clientY); });
        }

        const zmTrack = document.getElementById("zm-track");
        const zmLabel = document.getElementById("zm-label");
        
        document.getElementById("zm-in")?.addEventListener("pointerdown", e => {
            e.preventDefault(); 
            CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom * 1.3, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
            if (zmLabel) zmLabel.textContent = (CameraModule.cam.targetZoom * 100).toFixed(0) + "%";
        });
        document.getElementById("zm-out")?.addEventListener("pointerdown", e => {
            e.preventDefault(); 
            CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom / 1.3, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
            if (zmLabel) zmLabel.textContent = (CameraModule.cam.targetZoom * 100).toFixed(0) + "%";
        });
        document.getElementById("zm-fit")?.addEventListener("pointerdown", e => {
            e.preventDefault(); 
            CameraModule.frameBodies();
        });

        if (zmTrack) {
            const zmTrackPos = clientY => {
                const rect = zmTrack.getBoundingClientRect();
                const frac = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);                const logMin = Math.log(CameraModule.cam.minZoom);
                const logMax = Math.log(CameraModule.cam.maxZoom);
                CameraModule.cam.targetZoom = Math.exp(logMin + frac * (logMax - logMin));
                if (zmLabel) zmLabel.textContent = (CameraModule.cam.targetZoom * 100).toFixed(0) + "%";
            };
            zmTrack.addEventListener("pointerdown", e => { this.zmDrag = true; zmTrackPos(e.clientY); e.preventDefault(); });
            window.addEventListener("pointermove", e => { if (this.zmDrag) zmTrackPos(e.clientY); });
        }

        window.addEventListener("pointerup", () => { this.spDrag = false; this.zmDrag = false; });
        
        document.getElementById("clear-btn")?.addEventListener("click", () => {
            state.bodies = []; state.loose = []; state.flashes = [];
            if (this.pcountEl) this.pcountEl.textContent = "—";
        });
    },

    _updateSpeedUI(spLabel, spPause) {
        if (spLabel) {
            spLabel.textContent = physSpeed === 0 ? "0×" : physSpeed === 1 ? "1×" : physSpeed.toFixed(1) + "×";
        }
        if (spPause) {
            spPause.textContent = paused ? "▶" : "▐▐";
            spPause.className = paused ? "paused" : "";
        }
        const spFill = document.getElementById("sp-fill");
        const spThumb = document.getElementById("sp-thumb");
        if (spFill && spThumb) {
            const frac = physSpeed / SPEED_MAX;
            spFill.style.height = (frac * 100) + "%";
            spThumb.style.top = ((1 - frac) * 100) + "%";
        }
    },

    _bindInput() {
        window.addEventListener("mousemove", e => { this.tx = e.clientX; this.ty = e.clientY; });
        
        window.addEventListener("mousedown", e => {
            if (e.button !== 0 || this.uiEl.contains(e.target) || CameraModule.isPanning) return;
            this.holding = true;
            this.holdT = performance.now();
            this.cursorEl.classList.add("holding");
        });

        window.addEventListener("mouseup", e => {
            if (!this.holding) return;
            this.holding = false;
            this.cursorEl.classList.remove("holding");
            this._spawnPlanet();
        });
        let pinchDist0 = 0, pinchZoom0 = 1, pinchMidX = 0, pinchMidY = 0;
        this.canvas.addEventListener("touchstart", e => {
            if (e.touches.length === 2) {
                const a = e.touches[0], b = e.touches[1];
                pinchDist0 = hypot(b.clientX - a.clientX, b.clientY - a.clientY);
                pinchZoom0 = CameraModule.cam.targetZoom;
                pinchMidX = (a.clientX + b.clientX) / 2;
                pinchMidY = (a.clientY + b.clientY) / 2;
                e.preventDefault();
            } else if (e.touches.length === 1 && !this.holding) {
                this.tx = e.touches[0].clientX;
                this.ty = e.touches[0].clientY;
                this.holding = true;
                this.holdT = performance.now();
                this.cursorEl.classList.add("holding");
                e.preventDefault();
            }
        }, { passive: false });

        this.canvas.addEventListener("touchmove", e => {
            if (e.touches.length === 2) {
                const a = e.touches[0], b = e.touches[1];
                const dist = hypot(b.clientX - a.clientX, b.clientY - a.clientY);
                const newZoom = clamp(pinchZoom0 * dist / pinchDist0, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
                const wb = CameraModule.screenToWorld(pinchMidX, pinchMidY);
                CameraModule.cam.targetZoom = newZoom;
                CameraModule.cam.x = wb.x - (pinchMidX - CameraModule.width / 2) / newZoom;
                CameraModule.cam.y = wb.y - (pinchMidY - CameraModule.height / 2) / newZoom;
                e.preventDefault();
            } else if (e.touches.length === 1) {
                this.tx = e.touches[0].clientX;
                this.ty = e.touches[0].clientY;
            }
        }, { passive: false });

        this.canvas.addEventListener("touchend", e => {
            if (e.touches.length < 2 && this.holding) {
                this.holding = false;
                this.cursorEl.classList.remove("holding");
                this._spawnPlanet();
            }
        }, { passive: false });
    },

    _bindKeyboard() {
        window.addEventListener("keydown", e => {
            if (e.key === "=" || e.key === "+") CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom * 1.2, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
            if (e.key === "-") CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom / 1.2, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
            if (e.key === "0" || e.key === "r") { CameraModule.cam.targetZoom = 1; CameraModule.cam.x = 0; CameraModule.cam.y = 0; }            if (e.key === "f") CameraModule.frameBodies();
            if (e.key === " " || e.key === "p") { e.preventDefault(); togglePause(); }
            if (e.key === "]") setPhysSpeed(parseFloat((physSpeed + 0.5).toFixed(1)));
            if (e.key === "[") setPhysSpeed(parseFloat((physSpeed - 0.5).toFixed(1)));
        });
    },

    _bindPanPad() {
        const panPad = document.getElementById('pan-pad');
        if (!panPad) return;

        const PAN_ACCEL = 0.7;
        const PAN_MAX = 3;

        panPad.addEventListener('pointerdown', e => {
            this.panPadActive = true;
            this.panPadPower = 0;
            panPad.classList.add('active');
            panPad.setPointerCapture(e.pointerId);
            this._updatePanDirection(e, panPad);
            e.preventDefault();
        });

        panPad.addEventListener('pointermove', e => {
            if (!this.panPadActive) return;
            this._updatePanDirection(e, panPad);
            e.preventDefault();
        });

        panPad.addEventListener('pointerup', e => {
            this.panPadActive = false;
            this.panPadPower = 0;
            this.panPadDir = { x: 0, y: 0 };
            panPad.classList.remove('active');
        });

        window.Sim = window.Sim || {};
        window.Sim.updatePanPad = () => {
            if (!this.panPadActive) return;
            this.panPadPower = Math.min(this.panPadPower + PAN_ACCEL, PAN_MAX);
            const speed = Math.min(this.panPadPower / CameraModule.cam.zoom, 100);
            CameraModule.cam.x += this.panPadDir.x * speed;
            CameraModule.cam.y += this.panPadDir.y * speed;
        };
    },

    _updatePanDirection(e, panPad) {
        const rect = panPad.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const angle = Math.atan2(dy, dx);
        const sector = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        this.panPadDir.x = Math.cos(sector);
        this.panPadDir.y = Math.sin(sector);
    },

    _spawnPlanet() {
        if (typeof window.Sim.spawnPlanet === 'function') {
            const charge = Math.min((performance.now() - this.holdT) / 2000, 1);
            const sliderVal = parseFloat(this.slider.value);
            const radius = typeof window.Sim.getPlanetRadius === 'function' 
                ? window.Sim.getPlanetRadius(sliderVal, charge) 
                : clamp(sliderVal * (1 + charge * 4) * 8, 16, 110);
            
            const w = CameraModule.screenToWorld(this.tx, this.ty);
            window.Sim.spawnPlanet(w.x, w.y, radius);
        }
    }
};