'use strict';
/* TerrainEditor — Nhóm TERRAIN + TILESET + ENVIRONMENT
 * Quản lý địa hình (terrain) dạng ground mesh thật của Babylon.js,
 * heightmap lưu dạng Float32Array (subdivisions+1)^2 trong obj.terrainData
 * (đồng thời mirror vào obj.userData.terrainData để TerrainBrush dùng).
 * Vanilla JS, không import/export. Phòng thủ: mọi lệnh gọi SceneManager /
 * EventBus đều kiểm tra typeof trước; nếu Core chưa sẵn thì tự tạo mesh
 * trực tiếp vào PixiEngine.state.scene và push GameObject vào state.objects.
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

    function _getScene() {
        if (PE.state && PE.state.scene) { return PE.state.scene; }
        return null;
    }

    function _emit(event, data) {
        if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
            PE.EventBus.emit(event, data);
        }
    }

    function _newHeightmap(subdivisions) {
        var n = subdivisions + 1;
        return new Float32Array(n * n); // khởi tạo toàn 0 (mặt phẳng)
    }

    function _makeTerrainData(opts) {
        return {
            size: opts.size,            // chiều rộng (X) của terrain (m)
            length: opts.length,        // chiều dài (Z), mặc định = size
            subdivisions: opts.subdivisions,
            height: opts.height,        // biên độ cao tối đa dùng khi gen noise
            heightmap: _newHeightmap(opts.subdivisions),
            splat: null,                // mảng layer index theo vertex (TexturePainter dùng)
            minHeight: 0,
            maxHeight: 0
        };
    }

    /* Cập nhật vertex Y của ground mesh theo heightmap + tính lại normal.
     * Thứ tự vertex của BABYLON CreateGround: row-major theo Z rồi X,
     * index = row * (subdivisions+1) + col — getHeightAt/setHeightAt dùng
     * cùng một quy ước nên luôn nhất quán. */
    function applyHeightmapToMesh(mesh, heightmap, subdivisions) {
        if (!mesh || !heightmap) { return false; }
        if (typeof BABYLON === 'undefined') { return false; }
        var positions = null;
        try {
            if (typeof mesh.getVerticesData === 'function') {
                positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            }
        } catch (e) { positions = null; }
        if (!positions) { return false; }
        var n = subdivisions + 1;
        var count = Math.min(positions.length / 3, heightmap.length);
        for (var i = 0; i < count; i++) {
            positions[i * 3 + 1] = heightmap[i]; // Y là trục cao trong Babylon
        }
        try {
            mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions, true);
            if (typeof BABYLON.VertexData !== 'undefined' &&
                BABYLON.VertexData.ComputeNormals) {
                var indices = (typeof mesh.getIndices === 'function') ? mesh.getIndices() : null;
                var normals = [];
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
                mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals, true);
            } else if (typeof mesh.refreshBoundingInfo === 'function') {
                mesh.refreshBoundingInfo();
            }
        } catch (e) { /* mesh stub / chưa sẵn: bỏ qua, heightmap vẫn đúng */ }
        if (typeof mesh.refreshBoundingInfo === 'function') {
            try { mesh.refreshBoundingInfo(); } catch (e) { /* bỏ qua */ }
        }
        return true;
    }

    function _createGroundMesh(scene, terrainData, name) {
        if (typeof BABYLON === 'undefined' || !scene) { return null; }
        var mesh = BABYLON.MeshBuilder.CreateGround(name, {
            width: terrainData.size,
            height: terrainData.length,
            subdivisions: terrainData.subdivisions,
            updatable: true
        }, scene);
        applyHeightmapToMesh(mesh, terrainData.heightmap, terrainData.subdivisions);
        return mesh;
    }

    /* Đăng ký GameObject: ưu tiên SceneManager.addObject, nếu chưa có thì
     * tự tạo mesh trực tiếp vào state.scene và push vào state.objects. */
    function _registerObject(def, mesh) {
        var obj = null;
        if (PE.SceneManager && typeof PE.SceneManager.addObject === 'function') {
            try {
                obj = PE.SceneManager.addObject(def);
            } catch (e) {
                console.warn('[TerrainEditor] SceneManager.addObject lỗi, dùng fallback:', e);
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
                babylonNode: mesh || null,
                components: def.components || [],
                visible: true,
                active: true,
                userData: {}
            };
            if (PE.state) {
                PE.state.objects = PE.state.objects || [];
                PE.state.objects.push(obj);
                if (mesh && PE.state.scene && typeof mesh.setParent !== 'function') {
                    /* mesh đã được tạo trực tiếp trong scene rồi */
                }
            }
        }
        return obj;
    }

    function _findTerrain(id) {
        if (PE.SceneManager && typeof PE.SceneManager.findById === 'function') {
            try {
                var found = PE.SceneManager.findById(id);
                if (found) { return found; }
            } catch (e) { /* rơi xuống tìm trong state.objects */ }
        }
        if (PE.state && PE.state.objects) {
            for (var i = 0; i < PE.state.objects.length; i++) {
                if (PE.state.objects[i].id === id) { return PE.state.objects[i]; }
            }
        }
        return null;
    }

    function _findFirstTerrain() {
        if (PE.state && PE.state.objects) {
            for (var i = 0; i < PE.state.objects.length; i++) {
                var o = PE.state.objects[i];
                if (o.type === 'terrain' && (o.terrainData || (o.userData && o.userData.terrainData))) {
                    return o;
                }
            }
        }
        return null;
    }

    function _terrainDataOf(obj) {
        if (!obj) { return null; }
        return obj.terrainData || (obj.userData && obj.userData.terrainData) || null;
    }

    function _meshOf(obj) {
        if (!obj) { return null; }
        return obj.babylonNode || null;
    }

    function _updateMinMax(td) {
        var min = Infinity, max = -Infinity;
        for (var i = 0; i < td.heightmap.length; i++) {
            var v = td.heightmap[i];
            if (v < min) { min = v; }
            if (v > max) { max = v; }
        }
        td.minHeight = (min === Infinity) ? 0 : min;
        td.maxHeight = (max === -Infinity) ? 0 : max;
    }

    function _applyAndNotify(obj) {
        var td = _terrainDataOf(obj);
        var mesh = _meshOf(obj);
        if (td && mesh) { applyHeightmapToMesh(mesh, td.heightmap, td.subdivisions); }
        if (td) { _updateMinMax(td); }
        _emit('transform-changed', { id: obj.id, type: 'terrain' });
    }

    /* Đổi world (x,z) -> chỉ số hàng/cột trong heightmap (bilinear dùng sau). */
    function _worldToGrid(td, x, z) {
        var n = td.subdivisions + 1;
        var gx = (x + td.size / 2) / td.size * td.subdivisions;
        var gz = (z + td.length / 2) / td.length * td.subdivisions;
        gx = Math.max(0, Math.min(td.subdivisions, gx));
        gz = Math.max(0, Math.min(td.subdivisions, gz));
        return { gx: gx, gz: gz, n: n };
    }

    var TerrainEditor = {
        /* Tạo terrain mới. opts: {size=64, length=size, subdivisions=64,
         * height=10, name='Terrain', position={x,y,z}} */
        createTerrain: function (opts) {
            opts = opts || {};
            var scene = _getScene();
            var td = _makeTerrainData({
                size: (typeof opts.size === 'number' && opts.size > 0) ? opts.size : 64,
                length: (typeof opts.length === 'number' && opts.length > 0) ? opts.length
                    : ((typeof opts.size === 'number' && opts.size > 0) ? opts.size : 64),
                subdivisions: (typeof opts.subdivisions === 'number' && opts.subdivisions > 0)
                    ? Math.floor(opts.subdivisions) : 64,
                height: (typeof opts.height === 'number') ? opts.height : 10
            });
            var name = opts.name || 'Terrain';
            var pos = opts.position || { x: 0, y: 0, z: 0 };

            var mesh = _createGroundMesh(scene, td, name);
            if (mesh) {
                mesh.position = mesh.position || { x: 0, y: 0, z: 0 };
                if (typeof BABYLON !== 'undefined' && BABYLON.Vector3) {
                    mesh.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);
                } else {
                    mesh.position = { x: pos.x, y: pos.y, z: pos.z };
                }
                mesh.metadata = mesh.metadata || {};
                mesh.metadata.terrainData = td;
                mesh.metadata.isTerrain = true;
            }

            var obj = _registerObject({
                id: _uid('terrain'),
                name: name,
                type: 'terrain',
                parentId: opts.parentId || null,
                transform: {
                    position: { x: pos.x, y: pos.y, z: pos.z },
                    rotation: { x: 0, y: 0, z: 0 },
                    scale: { x: 1, y: 1, z: 1 }
                },
                build: function (sc) { return mesh || _createGroundMesh(sc, td, name); },
                components: [{ type: 'terrain', terrainData: td }]
            }, mesh);

            obj.terrainData = td;
            obj.userData = obj.userData || {};
            obj.userData.terrainData = td;
            if (mesh && !obj.babylonNode) { obj.babylonNode = mesh; }
            _updateMinMax(td);
            _emit('object-added', { id: obj.id, type: 'terrain', name: name });
            _emit('hierarchy-changed', { id: obj.id });
            return obj;
        },

        /* Đổi kích thước terrain (giữ nguyên hình dáng: resample heightmap cũ). */
        resizeTerrain: function (id, w, h) {
            var obj = _findTerrain(id);
            if (!obj) { console.warn('[TerrainEditor] Không tìm thấy terrain:', id); return null; }
            var td = _terrainDataOf(obj);
            if (!td) { return null; }
            var oldMap = td.heightmap.slice();
            var oldSize = td.size, oldLength = td.length, n = td.subdivisions + 1;
            td.size = (typeof w === 'number' && w > 0) ? w : td.size;
            td.length = (typeof h === 'number' && h > 0) ? h : td.length;
            // Resample: mỗi vertex mới lấy mẫu bilinear từ heightmap cũ.
            for (var r = 0; r < n; r++) {
                for (var c = 0; c < n; c++) {
                    var wx = (c / td.subdivisions - 0.5) * td.size;
                    var wz = (r / td.subdivisions - 0.5) * td.length;
                    var gx = (wx + oldSize / 2) / oldSize * td.subdivisions;
                    var gz = (wz + oldLength / 2) / oldLength * td.subdivisions;
                    gx = Math.max(0, Math.min(td.subdivisions - 0.001, gx));
                    gz = Math.max(0, Math.min(td.subdivisions - 0.001, gz));
                    var x0 = Math.floor(gx), z0 = Math.floor(gz);
                    var fx = gx - x0, fz = gz - z0;
                    var v00 = oldMap[z0 * n + x0], v10 = oldMap[z0 * n + x0 + 1];
                    var v01 = oldMap[(z0 + 1) * n + x0], v11 = oldMap[(z0 + 1) * n + x0 + 1];
                    td.heightmap[r * n + c] =
                        v00 * (1 - fx) * (1 - fz) + v10 * fx * (1 - fz) +
                        v01 * (1 - fx) * fz + v11 * fx * fz;
                }
            }
            // Tạo lại mesh với kích thước mới (mesh cũ dispose).
            var scene = _getScene();
            var oldMesh = _meshOf(obj);
            if (oldMesh && typeof oldMesh.dispose === 'function') {
                try { oldMesh.dispose(); } catch (e) { /* bỏ qua */ }
            }
            var mesh = _createGroundMesh(scene, td, obj.name || 'Terrain');
            if (mesh) {
                mesh.metadata = mesh.metadata || {};
                mesh.metadata.terrainData = td;
                mesh.metadata.isTerrain = true;
                obj.babylonNode = mesh;
            }
            _applyAndNotify(obj);
            return obj;
        },

        /* Co/giãn toàn bộ heightmap về khoảng [min,max] (remap tuyến tính). */
        setHeightRange: function (id, min, max) {
            var obj = _findTerrain(id);
            if (!obj) { console.warn('[TerrainEditor] Không tìm thấy terrain:', id); return null; }
            var td = _terrainDataOf(obj);
            if (!td) { return null; }
            min = (typeof min === 'number') ? min : 0;
            max = (typeof max === 'number') ? max : td.height;
            if (max < min) { var t = min; min = max; max = t; }
            _updateMinMax(td);
            var curMin = td.minHeight, curMax = td.maxHeight;
            var range = curMax - curMin;
            for (var i = 0; i < td.heightmap.length; i++) {
                if (range > 0.000001) {
                    td.heightmap[i] = min + (td.heightmap[i] - curMin) / range * (max - min);
                } else {
                    td.heightmap[i] = min;
                }
            }
            td.height = max - min;
            _applyAndNotify(obj);
            return obj;
        },

        /* Trả về heightmap dạng mảng 2D [row][col] (row = Z, col = X). */
        getHeightmap: function (id) {
            var obj = _findTerrain(id);
            if (!obj) { console.warn('[TerrainEditor] Không tìm thấy terrain:', id); return null; }
            var td = _terrainDataOf(obj);
            if (!td) { return null; }
            var n = td.subdivisions + 1;
            var out = [];
            for (var r = 0; r < n; r++) {
                var row = [];
                for (var c = 0; c < n; c++) { row.push(td.heightmap[r * n + c]); }
                out.push(row);
            }
            return out;
        },

        /* Gán chiều cao tại điểm world (x,z): cập nhật vertex gần nhất. */
        setHeightAt: function (id, x, z, h) {
            var obj = _findTerrain(id);
            if (!obj) { console.warn('[TerrainEditor] Không tìm thấy terrain:', id); return false; }
            var td = _terrainDataOf(obj);
            if (!td) { return false; }
            var g = _worldToGrid(td, x, z);
            var col = Math.round(g.gx), row = Math.round(g.gz);
            td.heightmap[row * g.n + col] = h;
            _applyAndNotify(obj);
            return true;
        },

        /* Lấy chiều cao tại điểm world (x,z) bằng nội suy bilinear. */
        getHeightAt: function (id, x, z) {
            var obj = _findTerrain(id);
            if (!obj) { return 0; }
            var td = _terrainDataOf(obj);
            if (!td) { return 0; }
            var g = _worldToGrid(td, x, z);
            var x0 = Math.floor(g.gx), z0 = Math.floor(g.gz);
            var x1 = Math.min(td.subdivisions, x0 + 1), z1 = Math.min(td.subdivisions, z0 + 1);
            var fx = g.gx - x0, fz = g.gz - z0;
            var n = g.n;
            var v00 = td.heightmap[z0 * n + x0], v10 = td.heightmap[z0 * n + x1];
            var v01 = td.heightmap[z1 * n + x0], v11 = td.heightmap[z1 * n + x1];
            return v00 * (1 - fx) * (1 - fz) + v10 * fx * (1 - fz) +
                v01 * (1 - fx) * fz + v11 * fx * fz;
        },

        /* --- Hàm nội bộ dùng chung cho các module terrain khác --- */
        applyHeightmapToMesh: applyHeightmapToMesh,
        findTerrain: _findTerrain,
        findFirstTerrain: _findFirstTerrain,
        getTerrainData: _terrainDataOf,
        getMesh: _meshOf,
        applyAndNotify: _applyAndNotify,
        worldToGrid: _worldToGrid
    };

    PE.TerrainEditor = TerrainEditor;
})();
