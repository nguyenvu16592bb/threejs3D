'use strict';
/* WaterEditor — Nhóm TERRAIN + TILESET + ENVIRONMENT
 * Nước + thác nước: plane xanh trong suốt có sóng động, thác là plane đứng
 * trong suốt + bọt ở chân thác. Đăng ký qua SceneManager.addObject
 * (fallback: tự push GameObject vào state.objects nếu Core chưa sẵn).
 * Vanilla JS, không import/export.
 */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    var _uidCounter = 0;
    function _uid(prefix) {
        _uidCounter += 1;
        return prefix + '-' + Date.now().toString(36) + '-' + _uidCounter + '-' +
            Math.floor(Math.random() * 10000).toString(36);
    }

    function _emit(event, data) {
        if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
            PE.EventBus.emit(event, data);
        }
    }

    function _getScene() {
        return (PE.state && PE.state.scene) ? PE.state.scene : null;
    }

    var _waters = [];    // { id, mesh, baseY, waveSpeed, waveAmp }
    var _waterfalls = []; // { id, node }

    function _registerObject(def, node) {
        var obj = null;
        if (PE.SceneManager && typeof PE.SceneManager.addObject === 'function') {
            try { obj = PE.SceneManager.addObject(def); } catch (e) {
                console.warn('[WaterEditor] SceneManager.addObject lỗi, dùng fallback:', e);
                obj = null;
            }
        }
        if (!obj) {
            obj = {
                id: def.id || _uid('obj'),
                name: def.name,
                type: def.type,
                parentId: def.parentId || null,
                children: [],
                transform: def.transform || {
                    position: { x: 0, y: 0, z: 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    scale: { x: 1, y: 1, z: 1 }
                },
                babylonNode: node || null,
                components: def.components || [],
                visible: true,
                active: true,
                userData: {}
            };
            if (PE.state) {
                PE.state.objects = PE.state.objects || [];
                PE.state.objects.push(obj);
            }
        }
        return obj;
    }

    function _hexToColor3(hex) {
        var h = String(hex || '#3a7bd5').replace('#', '');
        var num = parseInt(h, 16);
        if (isNaN(num) || typeof BABYLON === 'undefined') { return null; }
        return new BABYLON.Color3(
            ((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
    }

    /* Sóng: dao động position.y nhẹ theo thời gian trong registerBeforeRender.
     * Ghi 1 lần duy nhất cho mọi mặt nước (tránh đăng ký nhiều callback). */
    var _animRegistered = false;
    function _ensureWaveAnimation(scene) {
        if (_animRegistered || !scene || typeof scene.registerBeforeRender !== 'function') { return; }
        _animRegistered = true;
        scene.registerBeforeRender(function () {
            var t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
            for (var i = 0; i < _waters.length; i++) {
                var w = _waters[i];
                if (!w.mesh || w.waveSpeed <= 0) { continue; }
                w.mesh.position.y = w.baseY + Math.sin(t * w.waveSpeed) * w.waveAmp;
            }
        });
    }

    var WaterEditor = {
        /* Tạo mặt nước: plane xanh trong suốt. opts: {size=64, color='#3a7bd5',
         * opacity=0.7, y=0.5, waveSpeed=1, waveAmp=0.15, name='Nước'} */
        createWater: function (opts) {
            opts = opts || {};
            var scene = _getScene();
            if (!scene || typeof BABYLON === 'undefined') {
                console.warn('[WaterEditor] Chưa có scene Babylon — không tạo được nước.');
                return null;
            }
            var size = (typeof opts.size === 'number' && opts.size > 0) ? opts.size : 64;
            var y = (typeof opts.y === 'number') ? opts.y : 0.5;
            var opacity = (typeof opts.opacity === 'number')
                ? Math.max(0, Math.min(1, opts.opacity)) : 0.7;
            var name = opts.name || 'Nước';

            var mesh = BABYLON.MeshBuilder.CreateGround(name, {
                width: size, height: size, subdivisions: 1, updatable: false
            }, scene);
            mesh.position = new BABYLON.Vector3(0, y, 0);

            var mat = new BABYLON.StandardMaterial(name + '-mat', scene);
            mat.diffuseColor = _hexToColor3(opts.color || '#3a7bd5') || new BABYLON.Color3(0.23, 0.48, 0.84);
            mat.specularColor = new BABYLON.Color3(0.9, 0.9, 0.9);
            mat.specularPower = 64;
            mat.alpha = opacity;
            mesh.material = mat;
            mesh.isPickable = false;

            var water = {
                id: _uid('water'),
                mesh: mesh,
                baseY: y,
                waveSpeed: (typeof opts.waveSpeed === 'number') ? opts.waveSpeed : 1,
                waveAmp: (typeof opts.waveAmp === 'number') ? opts.waveAmp : 0.15
            };
            _waters.push(water);
            _ensureWaveAnimation(scene);

            var obj = _registerObject({
                id: water.id,
                name: name,
                type: 'water',
                transform: {
                    position: { x: 0, y: y, z: 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    scale: { x: 1, y: 1, z: 1 }
                },
                build: function () { return mesh; },
                components: [{ type: 'water', waterData: water }]
            }, mesh);
            obj.userData = obj.userData || {};
            obj.userData.waterData = water;
            if (!obj.babylonNode) { obj.babylonNode = mesh; }
            _emit('object-added', { id: obj.id, type: 'water', name: name });
            _emit('hierarchy-changed', { id: obj.id });
            return obj;
        },

        /* Tạo thác nước tại position, cao height: plane đứng trong suốt
         * (nước chảy) + box bọt trắng ở chân thác. */
        createWaterfall: function (position, height) {
            var scene = _getScene();
            if (!scene || typeof BABYLON === 'undefined') {
                console.warn('[WaterEditor] Chưa có scene Babylon — không tạo được thác.');
                return null;
            }
            var pos = position || { x: 0, y: 0, z: 0 };
            var h = (typeof height === 'number' && height > 0) ? height : 6;
            var y = (typeof pos.y === 'number') ? pos.y : h / 2;

            var root = new BABYLON.TransformNode('waterfall', scene);
            root.position = new BABYLON.Vector3(pos.x || 0, 0, pos.z || 0);

            var fallMat = new BABYLON.StandardMaterial('waterfall-mat', scene);
            fallMat.diffuseColor = new BABYLON.Color3(0.65, 0.85, 1);
            fallMat.specularColor = new BABYLON.Color3(1, 1, 1);
            fallMat.alpha = 0.75;

            var fall = BABYLON.MeshBuilder.CreatePlane('waterfall-plane', {
                width: 2, height: h
            }, scene);
            fall.position = new BABYLON.Vector3(0, y, 0);
            fall.material = fallMat;
            fall.parent = root;

            // Bọt trắng ở chân thác: box dẹt trong suốt.
            var foamMat = new BABYLON.StandardMaterial('waterfall-foam-mat', scene);
            foamMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
            foamMat.alpha = 0.6;
            var foam = BABYLON.MeshBuilder.CreateBox('waterfall-foam', {
                width: 2.4, height: 0.35, depth: 1.2
            }, scene);
            foam.position = new BABYLON.Vector3(0, 0.18, 0.5);
            foam.material = foamMat;
            foam.parent = root;

            var entry = { id: _uid('waterfall'), node: root, height: h };
            _waterfalls.push(entry);

            var obj = _registerObject({
                id: entry.id,
                name: 'Thác nước',
                type: 'waterfall',
                transform: {
                    position: { x: pos.x || 0, y: 0, z: pos.z || 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    scale: { x: 1, y: 1, z: 1 }
                },
                build: function () { return root; },
                components: [{ type: 'waterfall', height: h }]
            }, root);
            obj.userData = obj.userData || {};
            obj.userData.waterfallData = entry;
            if (!obj.babylonNode) { obj.babylonNode = root; }
            _emit('object-added', { id: obj.id, type: 'waterfall', name: 'Thác nước' });
            _emit('hierarchy-changed', { id: obj.id });
            return obj;
        },

        /* Đổi mực nước (y) cho mọi mặt nước đã tạo. */
        setWaterLevel: function (y) {
            if (typeof y !== 'number') { return false; }
            for (var i = 0; i < _waters.length; i++) {
                _waters[i].baseY = y;
                if (_waters[i].mesh) { _waters[i].mesh.position.y = y; }
            }
            return true;
        },

        /* Đổi tốc độ sóng (0 = đứng yên) cho mọi mặt nước. */
        setWaveSpeed: function (s) {
            if (typeof s !== 'number') { return false; }
            for (var i = 0; i < _waters.length; i++) {
                _waters[i].waveSpeed = Math.max(0, s);
            }
            return true;
        },

        getWaters: function () { return _waters.slice(); },
        getWaterfalls: function () { return _waterfalls.slice(); }
    };

    PE.WaterEditor = WaterEditor;
})();
