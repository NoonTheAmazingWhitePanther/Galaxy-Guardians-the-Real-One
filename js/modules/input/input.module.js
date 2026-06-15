import { clamp, hypot } from '../../core/math.js';
import { state, setPhysSpeed, setSunGravMult, togglePause, SPEED_MAX, solarTentacles, SUN } from '../../core/state.js';
import { CameraModule } from '../camera/camera.module.js';
import { StateCache } from '../../core/state-cache.js';
import { TrailsModule } from '../rendering/trails.js';

export const InputModule = {
    holding: false, holdT: 0, tx: 0, ty: 0, spDrag: false, zmDrag: false,
    panPadActive: false, panPadDir: { x: 0, y: 0 }, panPadPower: 0,
    spLabel: null, spPause: null, zmLabel: null,

    init: function(canvas, uiEl, cursorEl, slider, pcountEl, gravSlider, gravVal) {
        this.canvas = canvas; this.uiEl = uiEl; this.cursorEl = cursorEl;
        this.slider = slider; this.pcountEl = pcountEl;
        this.gravSlider = gravSlider; this.gravVal = gravVal;
        this.tx = window.innerWidth / 2; this.ty = window.innerHeight / 2;
        this._bindUI(); this._bindInput(); this._bindKeyboard(); this._bindPanPad();
        this._updateSpeedUI();
    },_bindUI: function() {
        var self = this;
        if (this.gravSlider) {
            this.gravSlider.addEventListener("input", function() {
                setSunGravMult(parseFloat(self.gravSlider.value));
                if (self.gravVal) self.gravVal.textContent = parseFloat(self.gravSlider.value).toFixed(2) + "x";
            });
        }
        var spTrack = document.getElementById("sp-track");
        this.spLabel = document.getElementById("sp-label");
        this.spPause = document.getElementById("sp-pause");

        if (this.spPause) {
            var fastBtn = document.getElementById("sp-fast");
            if (fastBtn) fastBtn.addEventListener("pointerdown", function(e) {
                e.preventDefault(); setPhysSpeed(parseFloat((state.physSpeed + 0.5).toFixed(1))); self._updateSpeedUI();
            });
            var slowBtn = document.getElementById("sp-slow");
            if (slowBtn) slowBtn.addEventListener("pointerdown", function(e) {
                e.preventDefault(); setPhysSpeed(parseFloat((state.physSpeed - 0.5).toFixed(1))); self._updateSpeedUI();
            });
            this.spPause.addEventListener("pointerdown", function(e) {
                e.preventDefault(); togglePause(); self._updateSpeedUI();
            });
        }

        if (spTrack) {
            var spTrackPos = function(clientY) {
                var rect = spTrack.getBoundingClientRect();
                var newSpeed = parseFloat((clamp(1 - (clientY - rect.top) / rect.height, 0, 1) * SPEED_MAX).toFixed(1));
                setPhysSpeed(newSpeed); self._updateSpeedUI();
            };
            spTrack.addEventListener("pointerdown", function(e) { self.spDrag = true; spTrackPos(e.clientY); e.preventDefault(); });
            window.addEventListener("pointermove", function(e) { if (self.spDrag) spTrackPos(e.clientY); });
        }var zmTrack = document.getElementById("zm-track");
        this.zmLabel = document.getElementById("zm-label");
        var zmIn = document.getElementById("zm-in");
        if (zmIn) zmIn.addEventListener("pointerdown", function(e) {
            e.preventDefault();
            CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom * 1.3, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
            if (self.zmLabel) self.zmLabel.textContent = (CameraModule.cam.targetZoom * 100).toFixed(0) + "%";
        });
        var zmOut = document.getElementById("zm-out");
        if (zmOut) zmOut.addEventListener("pointerdown", function(e) {
            e.preventDefault();
            CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom / 1.3, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
            if (self.zmLabel) self.zmLabel.textContent = (CameraModule.cam.targetZoom * 100).toFixed(0) + "%";
        });
        var zmFit = document.getElementById("zm-fit");
        if (zmFit) zmFit.addEventListener("pointerdown", function(e) { e.preventDefault(); CameraModule.frameBodies(); });

        if (zmTrack) {
            var zmTrackPos = function(clientY) {
                var rect = zmTrack.getBoundingClientRect();
                var frac = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
                var logMin = Math.log(CameraModule.cam.minZoom);
                var logMax = Math.log(CameraModule.cam.maxZoom);
                CameraModule.cam.targetZoom = Math.exp(logMin + frac * (logMax - logMin));
                if (self.zmLabel) self.zmLabel.textContent = (CameraModule.cam.targetZoom * 100).toFixed(0) + "%";
            };
            zmTrack.addEventListener("pointerdown", function(e) { self.zmDrag = true; zmTrackPos(e.clientY); e.preventDefault(); });
            window.addEventListener("pointermove", function(e) { if (self.zmDrag) zmTrackPos(e.clientY); });
        }
        window.addEventListener("pointerup", function() { self.spDrag = false; self.zmDrag = false; });

        var clearBtn = document.getElementById("clear-btn");
        if (clearBtn) clearBtn.addEventListener("click", function() {
            state.bodies = []; state.loose = []; state.flashes = [];
            StateCache.clear(); solarTentacles.length = 0; SUN.coronaTime = 0;
            for (var i = 0; i < TrailsModule.trailBufs.length; i++) TrailsModule.trailBufs[i].used = false;
            if (window.Sim) { window.Sim.physicsAccumulator = 0; window.Sim.isPreCalculating = true; window.Sim.lastPhysicsTime = performance.now(); }
            if (self.pcountEl) self.pcountEl.textContent = "-";
        });
    },_updateSpeedUI: function() {
        if (this.spLabel) {
            this.spLabel.textContent = state.physSpeed === 0 ? "0x " : state.physSpeed === 1 ? "1x " : state.physSpeed.toFixed(1) + "x ";
        }
        if (this.spPause) {
            this.spPause.textContent = state.paused ? "▶ " : "▐▐ ";
            this.spPause.className = state.paused ? "paused " : " ";
        }
        var spFill = document.getElementById("sp-fill");
        var spThumb = document.getElementById("sp-thumb");
        if (spFill && spThumb) {
            var frac = state.physSpeed / SPEED_MAX;
            spFill.style.height = (frac * 100) + "%";
            spThumb.style.top = ((1 - frac) * 100) + "%";
        }
    },

    _bindInput: function() {
        var self = this;
        window.addEventListener("mousemove", function(e) { self.tx = e.clientX; self.ty = e.clientY; });
        window.addEventListener("mousedown", function(e) {
            if (e.button !== 0 || (self.uiEl && self.uiEl.contains(e.target)) || CameraModule.isPanning) return;
            e.preventDefault();
            self.holding = true; self.holdT = performance.now();
            self.tx = e.clientX; self.ty = e.clientY;
            if (self.cursorEl) self.cursorEl.classList.add("holding");
        });
        window.addEventListener("mouseup", function(e) {
            if (e.button !== 0 || !self.holding) return;
            self.holding = false;
            if (self.cursorEl) self.cursorEl.classList.remove("holding");
            self._spawnPlanet();
        });

        var pinchDist0 = 0, pinchZoom0 = 1, pinchMidX = 0, pinchMidY = 0;
        this.canvas.addEventListener("touchstart", function(e) {
            if (e.touches.length === 2) {
                var a = e.touches[0], b = e.touches[1];
                pinchDist0 = hypot(b.clientX - a.clientX, b.clientY - a.clientY);
                pinchZoom0 = CameraModule.cam.targetZoom;
                pinchMidX = (a.clientX + b.clientX) / 2; pinchMidY = (a.clientY + b.clientY) / 2;
                e.preventDefault();
            } else if (e.touches.length === 1 && !self.holding) {
                e.preventDefault();
                self.tx = e.touches[0].clientX; self.ty = e.touches[0].clientY;
                self.holding = true; self.holdT = performance.now();
                if (self.cursorEl) self.cursorEl.classList.add("holding");
            }
        }, { passive: false });
        this.canvas.addEventListener("touchmove", function(e) {
            if (e.touches.length === 2) {
                var a = e.touches[0], b = e.touches[1];
                var dist = hypot(b.clientX - a.clientX, b.clientY - a.clientY);
                var newZoom = clamp(pinchZoom0 * dist / pinchDist0, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
                var wb = CameraModule.screenToWorld(pinchMidX, pinchMidY);
                CameraModule.cam.targetZoom = newZoom;
                CameraModule.cam.x = wb.x - (pinchMidX - CameraModule.width / 2) / newZoom;
                CameraModule.cam.y = wb.y - (pinchMidY - CameraModule.height / 2) / newZoom;
                e.preventDefault();
            } else if (e.touches.length === 1 && self.holding) {
                e.preventDefault();
                self.tx = e.touches[0].clientX;
                self.ty = e.touches[0].clientY;
            }
        }, { passive: false });

        this.canvas.addEventListener("touchend", function(e) {
            if (e.touches.length < 2 && self.holding) {
                e.preventDefault(); self.holding = false;
                if (self.cursorEl) self.cursorEl.classList.remove("holding");
                self._spawnPlanet();
            }
        }, { passive: false });
    },

    _bindKeyboard: function() {
        var self = this;
        window.addEventListener("keydown", function(e) {
            if (e.key === "=" || e.key === "+") CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom * 1.2, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
            if (e.key === "-") CameraModule.cam.targetZoom = clamp(CameraModule.cam.targetZoom / 1.2, CameraModule.cam.minZoom, CameraModule.cam.maxZoom);
            if (e.key === "0" || e.key === "r") { CameraModule.cam.targetZoom = 1; CameraModule.cam.x = 0; CameraModule.cam.y = 0; }
            if (e.key === "f") CameraModule.frameBodies();
            if (e.key === " " || e.key === "p") { e.preventDefault(); togglePause(); self._updateSpeedUI(); }
            if (e.key === "]") { setPhysSpeed(parseFloat((state.physSpeed + 0.5).toFixed(1))); self._updateSpeedUI(); }
            if (e.key === "[") { setPhysSpeed(parseFloat((state.physSpeed - 0.5).toFixed(1))); self._updateSpeedUI(); }
        });
    },

    _bindPanPad: function() {
        var self = this;
        var panPad = document.getElementById('pan-pad');
        if (!panPad) return;
        var PAN_ACCEL = 0.7; var PAN_MAX = 3;
        panPad.addEventListener('pointerdown', function(e) {
            self.panPadActive = true; self.panPadPower = 0;
            panPad.classList.add('active'); panPad.setPointerCapture(e.pointerId);
            self._updatePanDirection(e, panPad); e.preventDefault();
        });
        panPad.addEventListener('pointermove', function(e) {            if (!self.panPadActive) return;
            self._updatePanDirection(e, panPad); e.preventDefault();
        });
        panPad.addEventListener('pointerup', function(e) {
            self.panPadActive = false; self.panPadPower = 0;
            self.panPadDir = { x: 0, y: 0 }; panPad.classList.remove('active');
        });
        window.Sim = window.Sim || {};
        window.Sim.updatePanPad = function() {
            if (!self.panPadActive) return;
            self.panPadPower = Math.min(self.panPadPower + PAN_ACCEL, PAN_MAX);
            var speed = Math.min(self.panPadPower / CameraModule.cam.zoom, 100);
            CameraModule.cam.x += self.panPadDir.x * speed;
            CameraModule.cam.y += self.panPadDir.y * speed;
        };
    },

    _updatePanDirection: function(e, panPad) {
        var rect = panPad.getBoundingClientRect();
        var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        var angle = Math.atan2(e.clientY - cy, e.clientX - cx);
        var sector = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        this.panPadDir.x = Math.cos(sector); this.panPadDir.y = Math.sin(sector);
    },

    _spawnPlanet: function() {
        var self = this;
        var charge = Math.min((performance.now() - this.holdT) / 2000, 1);
        var sliderVal = parseFloat(this.slider.value);
        var raw = sliderVal * (1 + charge * 4);
        var t = Math.min(raw / 50, 1);
        var multiplier = 0.25 + 2.25 * Math.pow(t, 1.4);
        var radius = Math.max(10, Math.min(110, Math.round(40 * multiplier)));
        var w = CameraModule.screenToWorld(this.tx, this.ty);

        import('../../modules/ui/overlays.js').then(function(module) {
            module.OverlaysModule.spawnPlanet(w.x, w.y, radius / 8, self.pcountEl);
        });
    }
};