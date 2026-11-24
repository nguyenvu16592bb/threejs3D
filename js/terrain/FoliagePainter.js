'use strict';
/* FoliagePainter + PixiEngine.Prefabs — Nhóm TERRAIN + TILESET + ENVIRONMENT
 *
 * FILE NÀY CHỨA PixiEngine.Prefabs (tileset builders).
 * Mỗi builder nhận (scene) và trả về BABYLON.TransformNode đã build xong
 * bằng MeshBuilder + StandardMaterial màu — KHÔNG cần file ngoài.
 * Prefabs.place() là tileset placement THẬT qua SceneManager.addObject;
 * nhóm Editor gọi place() / handleViewportPlace() khi click viewport với
 * palette item đang chọn. FoliagePainter dùng chính Prefabs để rải cây/cỏ/hoa.
 * Vanilla JS, không import/export. Tiếng Việt cho UI text.
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

    function _hasBabylon() { return typeof BABYLON !== 'undefined'; }

    /* ---------- Material helpers (cache theo scene để khỏi tạo trùng) ---------- */
    function _mat(scene, hex, name) {
        if (!_hasBabylon()) { return null; }
        scene.__prefabMatCache = scene.__prefabMatCache || {};
        var key = (name || 'm') + ':' + hex;
        if (scene.__prefabMatCache[key]) { return scene.__prefabMatCache[key]; }
        var h = String(hex).replace('#', '');
        var num = parseInt(h, 16);
        var mat = new BABYLON.StandardMaterial(name || ('prefab-mat-' + hex), scene);
        mat.diffuseColor = new BABYLON.Color3(
            ((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
        mat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
        scene.__prefabMatCache[key] = mat;
        return mat;
    }

    function _vec3(x, y, z) {
        return _hasBabylon() ? new BABYLON.Vector3(x, y, z) : { x: x, y: y, z: z };
    }

    function _node(scene, name) {
        return new BABYLON.TransformNode(name, scene);
    }

    function _box(scene, parent, name, w, h, d, x, y, z, hex) {
        var m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
        m.position = _vec3(x, y, z);
        m.material = _mat(scene, hex, name + '-mat');
        m.parent = parent;
        return m;
    }

    function _cyl(scene, parent, name, h, diaTop, diaBottom, x, y, z, hex, tess) {
        var m = BABYLON.MeshBuilder.CreateCylinder(name, {
            height: h, diameterTop: diaTop, diameterBottom: diaBottom,
            tessellation: tess || 12
        }, scene);
        m.position = _vec3(x, y, z);
        m.material = _mat(scene, hex, name + '-mat');
        m.parent = parent;
        return m;
    }

    function _sphere(scene, parent, name, dia, x, y, z, hex) {
        var m = BABYLON.MeshBuilder.CreateSphere(name, { diameter: dia, segments: 12 }, scene);
        m.position = _vec3(x, y, z);
        m.material = _mat(scene, hex, name + '-mat');
        m.parent = parent;
        return m;
    }

    /* Cone = cylinder có đỉnh nhọn (diameterTop = 0). */
    function _cone(scene, parent, name, h, dia, x, y, z, hex) {
        return _cyl(scene, parent, name, h, 0.02, dia, x, y, z, hex, 16);
    }

    /* ============================ PREFAB BUILDERS ============================ */

    var BLOCK_COLORS = {
        grass: { base: '#8a5a33', top: '#58b368' },
        dirt: { base: '#6b4423', top: '#8a5a33' },
        stone: { base: '#6e6e6e', top: '#8d8d8d' },
        sand: { base: '#c9b078', top: '#e0c98a' },
        snow: { base: '#8d8d8d', top: '#ffffff' }
    };

    /* Khối đất: box đất + lớp mặt mỏng màu tương ứng (như ảnh mẫu). */
    function buildBlock(scene, kind) {
        if (!_hasBabylon() || !scene) { return null; }
        var c = BLOCK_COLORS[kind] || BLOCK_COLORS.grass;
        var root = _node(scene, 'block-' + kind);
        _box(scene, root, 'block-base', 1, 0.8, 1, 0, 0.4, 0, c.base);
        _box(scene, root, 'block-top', 1.02, 0.22, 1.02, 0, 0.9, 0, c.top);
        return root;
    }

    /* Cây thông: thân trụ + 3 tầng nón xanh xếp chồng. */
    function buildPineTree(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'pine-tree');
        _cyl(scene, root, 'trunk', 1.2, 0.32, 0.42, 0, 0.6, 0, '#7a4a21');
        _cone(scene, root, 'cone1', 1.3, 1.7, 0, 1.6, 0, '#2e7d32');
        _cone(scene, root, 'cone2', 1.1, 1.25, 0, 2.4, 0, '#388e3c');
        _cone(scene, root, 'cone3', 0.9, 0.8, 0, 3.1, 0, '#43a047');
        return root;
    }

    /* Cây thường: thân trụ + 2-3 tán cầu xanh. */
    function buildTree(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'tree');
        _cyl(scene, root, 'trunk', 1.6, 0.3, 0.45, 0, 0.8, 0, '#7a4a21');
        _sphere(scene, root, 'leaf1', 1.7, 0, 2.2, 0, '#4caf50');
        _sphere(scene, root, 'leaf2', 1.2, 0.55, 1.7, 0.25, '#66bb6a');
        _sphere(scene, root, 'leaf3', 1.0, -0.5, 1.8, -0.2, '#388e3c');
        return root;
    }

    function buildRock(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'rock');
        var rock = _sphere(scene, root, 'rock-body', 1.1, 0, 0.3, 0, '#8d8d8d');
        rock.scaling = _vec3(1.2, 0.65, 1);
        _sphere(scene, root, 'rock-small', 0.55, 0.55, 0.15, 0.3, '#757575');
        return root;
    }

    function buildChest(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'chest');
        _box(scene, root, 'chest-body', 1, 0.6, 0.7, 0, 0.3, 0, '#8d5a2b');
        _box(scene, root, 'chest-lid', 1.02, 0.28, 0.72, 0, 0.72, 0, '#a06a35');
        _box(scene, root, 'chest-lock', 0.18, 0.24, 0.08, 0, 0.55, 0.38, '#ffd54f');
        _box(scene, root, 'chest-band', 1.04, 0.08, 0.74, 0, 0.45, 0, '#ffd54f');
        return root;
    }

    function buildCoin(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'coin');
        var coin = _cyl(scene, root, 'coin-body', 0.1, 0.8, 0.8, 0, 0.55, 0, '#ffd54f', 24);
        coin.rotation.z = Math.PI / 2; // xoay đứng
        _cyl(scene, root, 'coin-inner', 0.12, 0.5, 0.5, 0, 0.55, 0, '#ffca28', 24)
            .rotation.z = Math.PI / 2;
        return root;
    }

    function buildSign(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'sign');
        _cyl(scene, root, 'sign-post', 1.4, 0.14, 0.14, 0, 0.7, 0, '#7a4a21');
        _box(scene, root, 'sign-board', 1.1, 0.55, 0.08, 0, 1.5, 0, '#a06a35');
        _box(scene, root, 'sign-roof', 1.25, 0.08, 0.2, 0, 1.82, 0, '#8d5a2b');
        return root;
    }

    function buildFence(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'fence');
        _box(scene, root, 'post1', 0.16, 1.1, 0.16, -0.9, 0.55, 0, '#a06a35');
        _box(scene, root, 'post2', 0.16, 1.1, 0.16, 0.9, 0.55, 0, '#a06a35');
        _box(scene, root, 'bar-top', 2.0, 0.12, 0.1, 0, 0.85, 0, '#c08a4a');
        _box(scene, root, 'bar-bottom', 2.0, 0.12, 0.1, 0, 0.45, 0, '#c08a4a');
        return root;
    }

    function buildBridge(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'bridge');
        for (var i = 0; i < 5; i++) {
            _box(scene, root, 'plank' + i, 0.75, 0.12, 1.4, -1.6 + i * 0.8, 0.55, 0, '#a06a35');
        }
        // Lan can 2 bên: cọc + thanh dọc.
        [-0.65, 0.65].forEach(function (z) {
            for (var j = 0; j < 3; j++) {
                _box(scene, root, 'rail-post', 0.12, 0.6, 0.12, -1.6 + j * 1.6, 0.9, z, '#7a4a21');
            }
            _box(scene, root, 'rail-top', 3.6, 0.1, 0.1, 0, 1.2, z, '#8d5a2b');
        });
        return root;
    }

    function buildPlatform(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'platform');
        _box(scene, root, 'platform-top', 3, 0.3, 3, 0, 0.75, 0, '#a06a35');
        [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].forEach(function (p) {
            _box(scene, root, 'leg', 0.25, 0.6, 0.25, p[0], 0.3, p[1], '#7a4a21');
        });
        return root;
    }

    function buildFlower(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'flower');
        _cyl(scene, root, 'stem', 0.7, 0.08, 0.08, 0, 0.35, 0, '#43a047');
        _sphere(scene, root, 'center', 0.28, 0, 0.85, 0, '#ffca28');
        var petals = [[0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]];
        for (var i = 0; i < petals.length; i++) {
            _sphere(scene, root, 'petal' + i, 0.2, petals[i][0], 0.85, petals[i][1], '#ef5350');
        }
        return root;
    }

    function buildHouse(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'house');
        _box(scene, root, 'walls', 2.2, 1.6, 2, 0, 0.8, 0, '#e8dcc3');
        // Mái 2 dốc: 2 box xoay ±45°.
        var r1 = _box(scene, root, 'roof-left', 1.5, 0.14, 2.3, -0.55, 1.95, 0, '#b71c1c');
        r1.rotation.z = Math.PI / 4;
        var r2 = _box(scene, root, 'roof-right', 1.5, 0.14, 2.3, 0.55, 1.95, 0, '#b71c1c');
        r2.rotation.z = -Math.PI / 4;
        _box(scene, root, 'door', 0.6, 1.0, 0.08, 0, 0.5, 1.02, '#6d4c41');
        _box(scene, root, 'window', 0.5, 0.5, 0.08, -0.65, 1.0, 1.02, '#90caf9');
        return root;
    }

    function buildTemple(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'temple');
        _box(scene, root, 'base', 3.2, 0.35, 2.4, 0, 0.18, 0, '#9e9e9e');
        _cyl(scene, root, 'col-left', 1.8, 0.3, 0.34, -1.1, 1.25, 0.6, '#c62828', 12);
        _cyl(scene, root, 'col-right', 1.8, 0.3, 0.34, 1.1, 1.25, 0.6, '#c62828', 12);
        _box(scene, root, 'hall', 2.2, 1.5, 1.6, 0, 1.1, -0.3, '#e8dcc3');
        _box(scene, root, 'roof', 3.4, 0.22, 2.6, 0, 2.35, 0, '#b71c1c');
        // Góc mái cong lên: 2 box nhỏ nghiêng ở 2 đầu.
        var c1 = _box(scene, root, 'roof-tip-left', 0.5, 0.12, 0.5, -1.75, 2.55, 0, '#b71c1c');
        c1.rotation.z = 0.5;
        var c2 = _box(scene, root, 'roof-tip-right', 0.5, 0.12, 0.5, 1.75, 2.55, 0, '#b71c1c');
        c2.rotation.z = -0.5;
        return root;
    }

    function buildLantern(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'lantern');
        _box(scene, root, 'frame', 0.55, 0.7, 0.55, 0, 0.55, 0, '#c62828');
        _sphere(scene, root, 'glow', 0.4, 0, 0.55, 0, '#ffd54f');
        _cyl(scene, root, 'top', 0.12, 0.2, 0.2, 0, 0.95, 0, '#ffd54f');
        _cyl(scene, root, 'tassel', 0.3, 0.08, 0.08, 0, 0.05, 0, '#ffd54f');
        return root;
    }

    function buildGate(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'gate');
        _cyl(scene, root, 'post-left', 2.6, 0.32, 0.36, -1.2, 1.3, 0, '#c62828', 12);
        _cyl(scene, root, 'post-right', 2.6, 0.32, 0.36, 1.2, 1.3, 0, '#c62828', 12);
        _box(scene, root, 'beam-top', 3.2, 0.28, 0.3, 0, 2.7, 0, '#8d5a2b');
        _box(scene, root, 'beam-mid', 2.7, 0.2, 0.22, 0, 2.2, 0, '#a06a35');
        _sphere(scene, root, 'ball-left', 0.4, -1.2, 2.8, 0, '#ffd54f');
        _sphere(scene, root, 'ball-right', 0.4, 1.2, 2.8, 0, '#ffd54f');
        return root;
    }

    function buildBush(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'bush');
        _sphere(scene, root, 'bush1', 0.9, 0, 0.4, 0, '#43a047');
        _sphere(scene, root, 'bush2', 0.65, 0.4, 0.3, 0.2, '#4caf50');
        _sphere(scene, root, 'bush3', 0.6, -0.38, 0.28, -0.15, '#388e3c');
        return root;
    }

    function buildMushroom(scene) {
        if (!_hasBabylon() || !scene) { return null; }
        var root = _node(scene, 'mushroom');
        _cyl(scene, root, 'stem', 0.5, 0.22, 0.3, 0, 0.25, 0, '#fff8e1');
        var cap = _sphere(scene, root, 'cap', 0.7, 0, 0.55, 0, '#e53935');
        cap.scaling = _vec3(1, 0.6, 1);
        _sphere(scene, root, 'dot1', 0.12, 0.18, 0.72, 0.1, '#ffffff');
        _sphere(scene, root, 'dot2', 0.1, -0.15, 0.7, -0.12, '#ffffff');
        return root;
    }

    /* ============================ Prefabs API ============================ */

    var LIST = [
        { id: 'grass-block', name: 'Khối Cỏ', category: 'Terrain', color: '#58b368',
          build: function (s) { return buildBlock(s, 'grass'); } },
        { id: 'dirt-block', name: 'Khối Đất', category: 'Terrain', color: '#8a5a33',
          build: function (s) { return buildBlock(s, 'dirt'); } },
        { id: 'stone-block', name: 'Khối Đá', category: 'Terrain', color: '#8d8d8d',
          build: function (s) { return buildBlock(s, 'stone'); } },
        { id: 'sand-block', name: 'Khối Cát', category: 'Terrain', color: '#e0c98a',
          build: function (s) { return buildBlock(s, 'sand'); } },
        { id: 'snow-block', name: 'Khối Tuyết', category: 'Terrain', color: '#ffffff',
          build: function (s) { return buildBlock(s, 'snow'); } },
        { id: 'pine-tree', name: 'Cây Thông', category: 'Nature', color: '#2e7d32', build: buildPineTree },
        { id: 'tree', name: 'Cây Xanh', category: 'Nature', color: '#4caf50', build: buildTree },
        { id: 'bush', name: 'Bụi Cây', category: 'Nature', color: '#43a047', build: buildBush },
        { id: 'flower', name: 'Bông Hoa', category: 'Nature', color: '#ef5350', build: buildFlower },
        { id: 'mushroom', name: 'Cây Nấm', category: 'Nature', color: '#e53935', build: buildMushroom },
        { id: 'rock', name: 'Tảng Đá', category: 'Nature', color: '#8d8d8d', build: buildRock },
        { id: 'house', name: 'Ngôi Nhà', category: 'Buildings', color: '#e8dcc3', build: buildHouse },
        { id: 'temple', name: 'Đền Thờ', category: 'Buildings', color: '#c62828', build: buildTemple },
        { id: 'gate', name: 'Cổng Lớn', category: 'Buildings', color: '#c62828', build: buildGate },
        { id: 'bridge', name: 'Cây Cầu', category: 'Environment', color: '#a06a35', build: buildBridge },
        { id: 'platform', name: 'Sàn Gỗ', category: 'Environment', color: '#a06a35', build: buildPlatform },
        { id: 'fence', name: 'Hàng Rào', category: 'Environment', color: '#c08a4a', build: buildFence },
        { id: 'lantern', name: 'Đèn Lồng', category: 'Environment', color: '#c62828', build: buildLantern },
        { id: 'sign', name: 'Biển Chỉ', category: 'Environment', color: '#a06a35', build: buildSign },
        { id: 'chest', name: 'Rương Báu', category: 'Props', color: '#8d5a2b', build: buildChest },
        { id: 'coin', name: 'Đồng Xu', category: 'Props', color: '#ffd54f', build: buildCoin }
    ];

    function _findPrefab(id) {
        for (var i = 0; i < LIST.length; i++) {
            if (LIST[i].id === id) { return LIST[i]; }
        }
        return null;
    }

    function _registerObject(def, node) {
        var obj = null;
        if (PE.SceneManager && typeof PE.SceneManager.addObject === 'function') {
            try { obj = PE.SceneManager.addObject(def); } catch (e) {
                console.warn('[Prefabs] SceneManager.addObject lỗi, dùng fallback:', e);
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

    var Prefabs = {
        list: LIST,
        selectedId: null,

        buildBlock: buildBlock,
        buildPineTree: buildPineTree,
        buildTree: buildTree,
        buildRock: buildRock,
        buildChest: buildChest,
        buildCoin: buildCoin,
        buildSign: buildSign,
        buildFence: buildFence,
        buildBridge: buildBridge,
        buildPlatform: buildPlatform,
        buildFlower: buildFlower,
        buildHouse: buildHouse,
        buildTemple: buildTemple,
        buildLantern: buildLantern,
        buildGate: buildGate,
        buildBush: buildBush,
        buildMushroom: buildMushroom,

        getById: _findPrefab,

        selectPrefab: function (id) {
            if (!_findPrefab(id)) {
                console.warn('[Prefabs] Không có prefab:', id);
                return null;
            }
            Prefabs.selectedId = id;
            _emit('prefab-selected', { id: id });
            return id;
        },

        /* Đặt 1 prefab tại vị trí world. opts: {randomRotation, randomScale,
         * snapToGrid}. snap: làm tròn x/z về 1.0; random rotation Y 0-360°;
         * random scale 0.9-1.1. Trả về GameObject qua SceneManager. */
        place: function (prefabId, position, opts) {
            var prefab = _findPrefab(prefabId);
            if (!prefab) {
                console.warn('[Prefabs] Không có prefab:', prefabId);
                return null;
            }
            var scene = _getScene();
            if (!scene || !_hasBabylon()) {
                console.warn('[Prefabs] Chưa có scene Babylon — không đặt được prefab.');
                return null;
            }
            opts = opts || {};
            var pos = {
                x: (position && typeof position.x === 'number') ? position.x : 0,
                y: (position && typeof position.y === 'number') ? position.y : 0,
                z: (position && typeof position.z === 'number') ? position.z : 0
            };
            if (opts.snapToGrid) {
                pos.x = Math.round(pos.x);
                pos.z = Math.round(pos.z);
            }
            var rotY = opts.randomRotation ? Math.random() * Math.PI * 2 : 0;
            var scale = opts.randomScale ? 0.9 + Math.random() * 0.2 : 1;

            var node = prefab.build(scene);
            if (!node) { return null; }
            node.position = _vec3(pos.x, pos.y, pos.z);
            node.rotation = _vec3(0, rotY, 0);
            node.scaling = _vec3(scale, scale, scale);

            var obj = _registerObject({
                id: _uid('prefab'),
                name: prefab.name,
                type: 'prefab',
                parentId: (opts && opts.parentId) || null,
                transform: {
                    position: { x: pos.x, y: pos.y, z: pos.z },
                    rotation: { x: 0, y: rotY, z: 0 },
                    scale: { x: scale, y: scale, z: scale }
                },
                build: function () { return node; },
                components: [{ type: 'prefab', prefabId: prefabId }]
            }, node);
            obj.userData = obj.userData || {};
            obj.userData.prefabId = prefabId;
            if (!obj.babylonNode) { obj.babylonNode = node; }
            _emit('object-added', { id: obj.id, type: 'prefab', prefabId: prefabId });
            _emit('hierarchy-changed', { id: obj.id });
            return obj;
        },

        /* Toolbar/AssetBrowser gọi khi click viewport với palette item đang chọn. */
        handleViewportPlace: function (worldPos) {
            if (!Prefabs.selectedId) { return null; }
            return Prefabs.place(Prefabs.selectedId, worldPos, {
                randomRotation: true, randomScale: false, snapToGrid: true
            });
        },

        /* Vẽ grid palette vào container (mặc định id 'tile-palette').
         * Nếu container chưa có thì bỏ qua, không crash. */
        renderPalette: function (containerId) {
            if (typeof document === 'undefined') { return false; }
            var container = document.getElementById(containerId || 'tile-palette');
            if (!container) { return false; }
            var categories = ['Tất cả'];
            LIST.forEach(function (p) {
                if (categories.indexOf(p.category) === -1) { categories.push(p.category); }
            });
            var activeCat = container.getAttribute('data-category') || 'Tất cả';

            var html = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">';
            categories.forEach(function (cat) {
                var on = cat === activeCat;
                html += '<button data-cat="' + cat + '" style="padding:4px 10px;border-radius:12px;' +
                    'border:1px solid ' + (on ? '#1976d2' : '#ccc') + ';background:' +
                    (on ? '#1976d2' : 'transparent') + ';color:' + (on ? '#fff' : 'inherit') +
                    ';cursor:pointer;font-size:12px;">' + cat + '</button>';
            });
            html += '</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:8px;">';
            LIST.forEach(function (p) {
                if (activeCat !== 'Tất cả' && p.category !== activeCat) { return; }
                var sel = p.id === Prefabs.selectedId;
                html += '<button data-prefab="' + p.id + '" title="' + p.name + '" style="padding:6px 4px;' +
                    'border:2px solid ' + (sel ? '#1976d2' : '#ddd') + ';border-radius:8px;' +
                    'background:transparent;cursor:pointer;text-align:center;">' +
                    '<div style="width:100%;height:34px;border-radius:6px;background:' + p.color +
                    ';margin-bottom:4px;"></div>' +
                    '<div style="font-size:11px;line-height:1.2;">' + p.name + '</div>' +
                    '<div style="font-size:10px;opacity:0.6;">' + p.category + '</div></button>';
            });
            html += '</div>';
            container.innerHTML = html;

            var catBtns = container.querySelectorAll('[data-cat]');
            for (var i = 0; i < catBtns.length; i++) {
                catBtns[i].addEventListener('click', function (ev) {
                    container.setAttribute('data-category', ev.currentTarget.getAttribute('data-cat'));
                    Prefabs.renderPalette(containerId || 'tile-palette');
                });
            }
            var itemBtns = container.querySelectorAll('[data-prefab]');
            for (var j = 0; j < itemBtns.length; j++) {
                itemBtns[j].addEventListener('click', function (ev) {
                    Prefabs.selectPrefab(ev.currentTarget.getAttribute('data-prefab'));
                    Prefabs.renderPalette(containerId || 'tile-palette');
                });
            }
            return true;
        }
    };

    PE.Prefabs = Prefabs;

    /* ============================ FoliagePainter ============================ */

    var FOLIAGE_MAP = {
        tree: 'tree',
        pine: 'pine-tree',
        flower: 'flower',
        bush: 'bush',
        mushroom: 'mushroom',
        rock: 'rock',
        grass: 'bush' // cỏ: dùng bụi cây thu nhỏ (scale 0.4) làm cụm cỏ
    };

    var _density = 1;        // 0..1 — nhân với count khi rải
    var _paintedIds = [];    // id các GameObject foliage đã rải

    function _groundHeight(x, z) {
        if (PE.SceneManager && typeof PE.SceneManager.getGroundHeight === 'function') {
            try {
                var h = PE.SceneManager.getGroundHeight(x, z);
                if (typeof h === 'number') { return h; }
            } catch (e) { /* rơi xuống TerrainEditor */ }
        }
        if (PE.TerrainEditor && typeof PE.TerrainEditor.getHeightAt === 'function') {
            var t = PE.TerrainEditor.findFirstTerrain();
            if (t) { return PE.TerrainEditor.getHeightAt(t.id, x, z); }
        }
        return 0;
    }

    function _findObject(id) {
        if (PE.SceneManager && typeof PE.SceneManager.findById === 'function') {
            try {
                var f = PE.SceneManager.findById(id);
                if (f) { return f; }
            } catch (e) { /* bỏ qua */ }
        }
        if (PE.state && PE.state.objects) {
            for (var i = 0; i < PE.state.objects.length; i++) {
                if (PE.state.objects[i].id === id) { return PE.state.objects[i]; }
            }
        }
        return null;
    }

    function _removeObject(obj) {
        if (PE.SceneManager && typeof PE.SceneManager.removeObject === 'function') {
            try { PE.SceneManager.removeObject(obj.id); return; } catch (e) { /* fallback */ }
        }
        if (obj.babylonNode && typeof obj.babylonNode.dispose === 'function') {
            try { obj.babylonNode.dispose(); } catch (e) { /* bỏ qua */ }
        }
        if (PE.state && PE.state.objects) {
            var idx = PE.state.objects.indexOf(obj);
            if (idx !== -1) { PE.state.objects.splice(idx, 1); }
        }
    }

    var FoliagePainter = {
        /* Rải foliage quanh điểm world. type: 'tree'|'pine'|'flower'|'bush'|
         * 'mushroom'|'rock'|'grass'. count: số lượng (nhân với density).
         * Trả về mảng GameObject đã tạo. */
        paintFoliage: function (worldX, worldZ, type, count) {
            var prefabId = FOLIAGE_MAP[type] || FOLIAGE_MAP.tree;
            var n = Math.max(0, Math.round((typeof count === 'number' ? count : 1) * _density));
            var out = [];
            var radius = 2.5;
            for (var i = 0; i < n; i++) {
                var ang = Math.random() * Math.PI * 2;
                var dist = Math.sqrt(Math.random()) * radius; // phân bố đều trong đĩa
                var x = worldX + Math.cos(ang) * dist;
                var z = worldZ + Math.sin(ang) * dist;
                var y = _groundHeight(x, z);
                var obj = Prefabs.place(prefabId, { x: x, y: y, z: z }, {
                    randomRotation: true,
                    randomScale: true,
                    snapToGrid: false
                });
                if (!obj) { continue; }
                if (type === 'grass' && obj.babylonNode) {
                    obj.babylonNode.scaling = _vec3(0.4, 0.4, 0.4);
                    obj.transform.scale = { x: 0.4, y: 0.4, z: 0.4 };
                }
                obj.userData = obj.userData || {};
                obj.userData.isFoliage = true;
                obj.userData.foliageType = type;
                _paintedIds.push(obj.id);
                out.push(obj);
            }
            return out;
        },

        /* Xóa foliage trong bán kính radius quanh (x,z). Trả về số đã xóa. */
        eraseFoliage: function (x, z, radius) {
            var r = (typeof radius === 'number' && radius > 0) ? radius : 3;
            var removed = 0;
            var keep = [];
            for (var i = 0; i < _paintedIds.length; i++) {
                var obj = _findObject(_paintedIds[i]);
                if (!obj) { continue; }
                var p = (obj.transform && obj.transform.position) || { x: 0, z: 0 };
                var d = Math.sqrt((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z));
                if (d <= r) {
                    _removeObject(obj);
                    removed++;
                } else {
                    keep.push(_paintedIds[i]);
                }
            }
            _paintedIds = keep;
            if (removed > 0) { _emit('hierarchy-changed', { removed: removed }); }
            return removed;
        },

        /* Mật độ rải 0..1 (áp cho lần paint sau). */
        setDensity: function (n) {
            _density = Math.max(0, Math.min(1, (typeof n === 'number') ? n : 1));
            return _density;
        },

        getDensity: function () { return _density; },
        getPaintedIds: function () { return _paintedIds.slice(); },
        getFoliageTypes: function () { return Object.keys(FOLIAGE_MAP); }
    };

    PE.FoliagePainter = FoliagePainter;
})();
