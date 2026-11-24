'use strict';
/* ParticleEditor — Preset hiệu ứng hạt THẬT bằng BABYLON.ParticleSystem.
 * Nhóm EFFECTS/PARTICLES. Vanilla JS, không import/export.
 * Texture flare tự tạo bằng DynamicTexture (radial gradient) — không dùng URL ngoài. */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    var systems = {}; // id -> { obj, ps, preset }
    var flareTexture = null;

    function getScene() {
        if (PE.state && PE.state.scene) return PE.state.scene;
        return null;
    }
    function emit(name, data) {
        if (PE.EventBus && typeof PE.EventBus.emit === 'function') PE.EventBus.emit(name, data);
    }
    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[ParticleEditor] ' + msg);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* Texture flare: DynamicTexture vẽ radial gradient trắng -> trong suốt. */
    function getFlareTexture(scene) {
        if (flareTexture) return flareTexture;
        if (typeof BABYLON === 'undefined' || !BABYLON.DynamicTexture) return null;
        var size = 64;
        var tex = new BABYLON.DynamicTexture('flare-texture', { width: size, height: size }, scene, false);
        var ctx = tex.getContext();
        var grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        tex.update();
        tex.hasAlpha = true;
        flareTexture = tex;
        return tex;
    }

    /* Định nghĩa preset: emitRate, min/maxLife, min/maxSize, gravity, direction, màu. */
    var PRESETS = {
        fire: {
            label: '🔥 Lửa', capacity: 500, emitRate: 120,
            minLife: 0.4, maxLife: 1.0, minSize: 0.2, maxSize: 0.6,
            gravity: { x: 0, y: 2, z: 0 }, // bay lên
            direction1: { x: -0.3, y: 1, z: -0.3 }, direction2: { x: 0.3, y: 2, z: 0.3 },
            color1: [1, 0.55, 0.1, 1], color2: [1, 0.15, 0.05, 1], colorDead: [0.2, 0.05, 0, 0],
            blendMode: 'ADD', emitterSize: { x: 0.6, y: 0.2, z: 0.6 }
        },
        smoke: {
            label: '💨 Khói', capacity: 300, emitRate: 40,
            minLife: 1.5, maxLife: 3.0, minSize: 0.5, maxSize: 1.4,
            gravity: { x: 0, y: 1.2, z: 0 },
            direction1: { x: -0.4, y: 1, z: -0.4 }, direction2: { x: 0.4, y: 1.6, z: 0.4 },
            color1: [0.55, 0.55, 0.55, 0.5], color2: [0.35, 0.35, 0.35, 0.4], colorDead: [0.2, 0.2, 0.2, 0],
            blendMode: 'STANDARD', emitterSize: { x: 0.4, y: 0.2, z: 0.4 }
        },
        snow: {
            label: '❄ Tuyết', capacity: 1000, emitRate: 150,
            minLife: 3.0, maxLife: 6.0, minSize: 0.05, maxSize: 0.15,
            gravity: { x: 0, y: -0.8, z: 0 },
            direction1: { x: -0.2, y: -1, z: -0.2 }, direction2: { x: 0.2, y: -1, z: 0.2 },
            color1: [1, 1, 1, 0.95], color2: [0.9, 0.95, 1, 0.9], colorDead: [1, 1, 1, 0],
            blendMode: 'STANDARD', emitterSize: { x: 20, y: 0.5, z: 20 }
        },
        rain: {
            label: '🌧 Mưa', capacity: 1500, emitRate: 400,
            minLife: 0.5, maxLife: 1.0, minSize: 0.03, maxSize: 0.06,
            gravity: { x: 0, y: -18, z: 0 },
            direction1: { x: 0, y: -1, z: 0 }, direction2: { x: 0, y: -1, z: 0 },
            color1: [0.6, 0.75, 1, 0.7], color2: [0.5, 0.65, 0.95, 0.6], colorDead: [0.5, 0.65, 0.95, 0],
            blendMode: 'STANDARD', emitterSize: { x: 15, y: 0.5, z: 15 }
        },
        magic: {
            label: '✨ Phép thuật', capacity: 400, emitRate: 80,
            minLife: 0.8, maxLife: 2.0, minSize: 0.08, maxSize: 0.25,
            gravity: { x: 0, y: 0.5, z: 0 },
            direction1: { x: -1, y: 0.5, z: -1 }, direction2: { x: 1, y: 1.5, z: 1 },
            color1: [0.75, 0.4, 1, 1], color2: [0.4, 0.2, 0.9, 1], colorDead: [0.2, 0, 0.4, 0],
            blendMode: 'ADD', emitterSize: { x: 0.5, y: 0.5, z: 0.5 }, angular: true
        },
        explosion: {
            label: '💥 Nổ', capacity: 800, emitRate: 800,
            minLife: 0.4, maxLife: 1.2, minSize: 0.2, maxSize: 0.8,
            gravity: { x: 0, y: -4, z: 0 },
            direction1: { x: -1, y: -1, z: -1 }, direction2: { x: 1, y: 1, z: 1 },
            color1: [1, 0.85, 0.2, 1], color2: [1, 0.4, 0.05, 1], colorDead: [0.3, 0.05, 0, 0],
            blendMode: 'ADD', emitterSize: { x: 0.2, y: 0.2, z: 0.2 }, burst: true
        }
    };

    function listPresets() {
        return Object.keys(PRESETS).map(function (key) {
            return { name: key, label: PRESETS[key].label };
        });
    }

    function buildParticleSystem(name, preset, position, scene) {
        var ps = new BABYLON.ParticleSystem(name, preset.capacity, scene);
        ps.particleTexture = getFlareTexture(scene);
        // Emitter: box vô hình tại position
        var emitter = BABYLON.MeshBuilder.CreateBox(name + '-emitter', { size: 0.01 }, scene);
        emitter.position.set(position.x || 0, position.y || 0, position.z || 0);
        emitter.isVisible = false;
        ps.emitter = emitter;
        ps.minEmitBox = new BABYLON.Vector3(-preset.emitterSize.x / 2, -preset.emitterSize.y / 2, -preset.emitterSize.z / 2);
        ps.maxEmitBox = new BABYLON.Vector3(preset.emitterSize.x / 2, preset.emitterSize.y / 2, preset.emitterSize.z / 2);
        ps.emitRate = preset.emitRate;
        ps.minLifeTime = preset.minLife;
        ps.maxLifeTime = preset.maxLife;
        ps.minSize = preset.minSize;
        ps.maxSize = preset.maxSize;
        ps.gravity = new BABYLON.Vector3(preset.gravity.x, preset.gravity.y, preset.gravity.z);
        ps.direction1 = new BABYLON.Vector3(preset.direction1.x, preset.direction1.y, preset.direction1.z);
        ps.direction2 = new BABYLON.Vector3(preset.direction2.x, preset.direction2.y, preset.direction2.z);
        ps.color1 = new BABYLON.Color4(preset.color1[0], preset.color1[1], preset.color1[2], preset.color1[3]);
        ps.color2 = new BABYLON.Color4(preset.color2[0], preset.color2[1], preset.color2[2], preset.color2[3]);
        ps.colorDead = new BABYLON.Color4(preset.colorDead[0], preset.colorDead[1], preset.colorDead[2], preset.colorDead[3]);
        ps.blendMode = (preset.blendMode === 'ADD') ? BABYLON.ParticleSystem.BLENDMODE_ADD : BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        if (preset.angular) {
            ps.minAngularSpeed = -2;
            ps.maxAngularSpeed = 2;
            ps.minEmitPower = 1;
            ps.maxEmitPower = 2;
        }
        return { ps: ps, emitter: emitter };
    }

    /* Tạo preset tại position. Trả về GameObject type 'particle'. */
    function createPreset(name, position) {
        var scene = getScene();
        if (!scene) { log('Chưa có scene (engine chưa sẵn sàng).'); return null; }
        if (typeof BABYLON === 'undefined' || !BABYLON.ParticleSystem) {
            log('Babylon.js chưa được nạp.');
            return null;
        }
        var key = String(name || '').toLowerCase();
        var preset = PRESETS[key];
        if (!preset) {
            log('Preset không tồn tại: ' + name + '. Có: ' + Object.keys(PRESETS).join(', '));
            return null;
        }
        position = position || { x: 0, y: 1, z: 0 };
        var id = 'particle_' + key + '_' + Date.now().toString(36);
        var built = buildParticleSystem(id, preset, position, scene);
        var ps = built.ps;
        var emitter = built.emitter;
        var obj = {
            id: id,
            name: preset.label + ' (' + key + ')',
            type: 'particle',
            parentId: null,
            children: [],
            transform: {
                position: { x: position.x || 0, y: position.y || 0, z: position.z || 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 }
            },
            babylonNode: emitter,
            components: [],
            visible: true,
            active: true,
            userData: { preset: key, particleSystem: ps }
        };
        if (PE.SceneManager && typeof PE.SceneManager.addObject === 'function') {
            var added = PE.SceneManager.addObject(obj);
            if (added) obj = added;
        } else if (PE.state && Array.isArray(PE.state.objects)) {
            PE.state.objects.push(obj);
        }
        systems[obj.id] = { obj: obj, ps: ps, preset: key };
        if (preset.burst) {
            // Burst một lần: phát rồi tự dừng sau ~1.5s
            ps.start();
            setTimeout(function () { try { ps.stop(); } catch (e) {} }, 1500);
        } else {
            ps.start();
        }
        emit('object-added', { object: obj });
        emit('hierarchy-changed', { object: obj });
        log('Đã tạo hiệu ứng: ' + preset.label + ' tại (' + position.x + ', ' + position.y + ', ' + position.z + ')');
        return obj;
    }

    /* Chỉnh particle system thật trực tiếp.
     * props: { emitRate, minLife, maxLife, minSize, maxSize, gravity:{x,y,z}, color1:[r,g,b,a], ... } */
    function editSystem(id, props) {
        var entry = systems[id];
        if (!entry) {
            // Thử tìm qua state.objects
            var obj = null;
            if (PE.state && Array.isArray(PE.state.objects)) {
                for (var i = 0; i < PE.state.objects.length; i++) {
                    if (PE.state.objects[i].id === id) { obj = PE.state.objects[i]; break; }
                }
            }
            if (obj && obj.userData && obj.userData.particleSystem) {
                entry = { obj: obj, ps: obj.userData.particleSystem, preset: obj.userData.preset };
                systems[id] = entry;
            } else {
                log('Không tìm thấy particle system: ' + id);
                return false;
            }
        }
        var ps = entry.ps;
        props = props || {};
        if (props.emitRate != null) ps.emitRate = Number(props.emitRate);
        if (props.minLife != null) ps.minLifeTime = Number(props.minLife);
        if (props.maxLife != null) ps.maxLifeTime = Number(props.maxLife);
        if (props.minSize != null) ps.minSize = Number(props.minSize);
        if (props.maxSize != null) ps.maxSize = Number(props.maxSize);
        if (props.gravity) {
            ps.gravity = new BABYLON.Vector3(props.gravity.x || 0, props.gravity.y || 0, props.gravity.z || 0);
        }
        if (props.color1) ps.color1 = new BABYLON.Color4(props.color1[0], props.color1[1], props.color1[2], props.color1[3] == null ? 1 : props.color1[3]);
        if (props.color2) ps.color2 = new BABYLON.Color4(props.color2[0], props.color2[1], props.color2[2], props.color2[3] == null ? 1 : props.color2[3]);
        if (props.updateSpeed != null) ps.updateSpeed = Number(props.updateSpeed);
        log('Đã cập nhật particle system ' + id + ': ' + JSON.stringify(props));
        return true;
    }

    /* Panel chỉnh: sliders emission rate, lifetime, size, gravity. */
    function renderPanel(containerEl, systemId) {
        var entry = systems[systemId];
        if (!entry) {
            if (containerEl) containerEl.innerHTML = '<p>Chưa chọn hiệu ứng hạt nào.</p>';
            return '';
        }
        var ps = entry.ps;
        var html = '<div class="particle-editor"><h3>✨ Chỉnh hiệu ứng: ' + esc(entry.obj.name || systemId) + '</h3>';
        function sliderRow(key, label, min, max, step, val) {
            return '<label style="display:block;font-size:13px;margin:6px 0;">' + label + ': <span data-pe-val="' + key + '">' + val + '</span>' +
                '<input type="range" data-pe="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" style="width:100%;"></label>';
        }
        html += sliderRow('emitRate', 'Tốc độ phát (hạt/giây)', 0, 1000, 10, ps.emitRate);
        html += sliderRow('minLife', 'Tuổi thọ tối thiểu (giây)', 0.1, 5, 0.1, ps.minLifeTime);
        html += sliderRow('maxLife', 'Tuổi thọ tối đa (giây)', 0.1, 8, 0.1, ps.maxLifeTime);
        html += sliderRow('minSize', 'Kích thước tối thiểu', 0.01, 1, 0.01, ps.minSize);
        html += sliderRow('maxSize', 'Kích thước tối đa', 0.01, 2, 0.01, ps.maxSize);
        html += sliderRow('gravityY', 'Trọng lực Y', -20, 5, 0.5, ps.gravity ? ps.gravity.y : 0);
        html += '<div style="display:flex;gap:6px;margin-top:8px;">' +
            '<button data-act="stop" style="flex:1;padding:6px;background:#333;color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer;">⏹ Dừng</button>' +
            '<button data-act="start" style="flex:1;padding:6px;background:#2b6cb0;color:#fff;border:none;border-radius:6px;cursor:pointer;">▶ Phát lại</button>' +
            '</div></div>';
        if (containerEl) {
            containerEl.innerHTML = html;
            containerEl.querySelectorAll('[data-pe]').forEach(function (input) {
                input.addEventListener('input', function () {
                    var key = input.getAttribute('data-pe');
                    var val = parseFloat(input.value);
                    var valEl = containerEl.querySelector('[data-pe-val="' + key + '"]');
                    if (valEl) valEl.textContent = String(val);
                    var props = {};
                    if (key === 'gravityY') props.gravity = { x: ps.gravity.x, y: val, z: ps.gravity.z };
                    else props[key] = val;
                    editSystem(systemId, props);
                });
            });
            var stopBtn = containerEl.querySelector('[data-act="stop"]');
            if (stopBtn) stopBtn.addEventListener('click', function () { try { ps.stop(); } catch (e) {} });
            var startBtn = containerEl.querySelector('[data-act="start"]');
            if (startBtn) startBtn.addEventListener('click', function () { try { ps.start(); } catch (e) {} });
        }
        return html;
    }

    function getSystem(id) { return systems[id] || null; }

    function disposeSystem(id) {
        var entry = systems[id];
        if (!entry) return false;
        try { entry.ps.stop(); } catch (e) {}
        try { entry.ps.dispose(); } catch (e) {}
        if (entry.obj && entry.obj.babylonNode) {
            try { entry.obj.babylonNode.dispose(); } catch (e) {}
        }
        delete systems[id];
        log('Đã dispose particle system: ' + id);
        return true;
    }

    var ParticleEditor = {
        presets: PRESETS,
        listPresets: listPresets,
        createPreset: createPreset,
        editSystem: editSystem,
        renderPanel: renderPanel,
        getSystem: getSystem,
        disposeSystem: disposeSystem
    };
    PE.ParticleEditor = ParticleEditor;
})();
