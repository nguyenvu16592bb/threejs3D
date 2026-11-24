'use strict';
/* TexturePainter — Nhóm TERRAIN + TILESET + ENVIRONMENT
 * Vẽ texture lên terrain ở mức THẬT trên geometry: mỗi vertex của terrain
 * giữ 1 layer index trong terrainData.splat (Uint8Array, 1 giá trị/vertex);
 * applySplatToMesh() chuyển splat thành vertex colors trên mesh
 * (mesh.useVertexColors = true) nên màu sơn hiện ngay trên mặt đất.
 * Chưa dùng multi-material/splat texture — ghi rõ: đây là paint thật lên
 * geometry bằng vertex colors, không phải overlay giả.
 * Vanilla JS, không import/export.
 */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    // Bảng layer: tên -> màu hex. setLayerColor() đổi được lúc chạy.
    var LAYERS = {
        Grass: '#58b368',
        Dirt: '#8a5a33',
        Stone: '#8d8d8d',
        Sand: '#e0c98a',
        Snow: '#ffffff'
    };

    var _activeLayer = 'Grass';

    function _hexToRgb(hex) {
        var h = String(hex || '#ffffff').replace('#', '');
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        var num = parseInt(h, 16);
        if (isNaN(num)) { return { r: 1, g: 1, b: 1 }; }
        return {
            r: ((num >> 16) & 255) / 255,
            g: ((num >> 8) & 255) / 255,
            b: (num & 255) / 255
        };
    }

    function _layerNames() { return Object.keys(LAYERS); }

    function _layerIndex(name) {
        var names = _layerNames();
        var idx = names.indexOf(name);
        return idx === -1 ? 0 : idx;
    }

    function _findTerrain(id) {
        if (PE.TerrainEditor && typeof PE.TerrainEditor.findTerrain === 'function') {
            var found = PE.TerrainEditor.findTerrain(id);
            if (found) { return found; }
        }
        if (PE.state && PE.state.objects) {
            for (var i = 0; i < PE.state.objects.length; i++) {
                if (PE.state.objects[i].id === id) { return PE.state.objects[i]; }
            }
        }
        return null;
    }

    function _findFirstTerrain() {
        if (PE.TerrainEditor && typeof PE.TerrainEditor.findFirstTerrain === 'function') {
            return PE.TerrainEditor.findFirstTerrain();
        }
        if (PE.state && PE.state.objects) {
            for (var i = 0; i < PE.state.objects.length; i++) {
                if (PE.state.objects[i].type === 'terrain') { return PE.state.objects[i]; }
            }
        }
        return null;
    }

    function _terrainDataOf(obj) {
        if (!obj) { return null; }
        if (PE.TerrainEditor && typeof PE.TerrainEditor.getTerrainData === 'function') {
            return PE.TerrainEditor.getTerrainData(obj);
        }
        return obj.terrainData || (obj.userData && obj.userData.terrainData) || null;
    }

    function _ensureSplat(td) {
        if (!td.splat || td.splat.length !== td.heightmap.length) {
            td.splat = new Uint8Array(td.heightmap.length); // mặc định 0 = Grass
        }
        return td.splat;
    }

    /* Chuyển splat map thành vertex colors trên mesh (paint thật lên geometry).
     * Cần 1 material trắng để vertex colors hiện đúng màu layer. */
    function applySplatToMesh(mesh, terrainData) {
        if (!mesh || !terrainData) { return false; }
        if (typeof BABYLON === 'undefined') { return false; }
        var splat = _ensureSplat(terrainData);
        var names = _layerNames();
        var colors = new Float32Array(splat.length * 4); // RGBA / vertex
        for (var i = 0; i < splat.length; i++) {
            var layerName = names[splat[i]] || names[0];
            var rgb = _hexToRgb(LAYERS[layerName]);
            colors[i * 4] = rgb.r;
            colors[i * 4 + 1] = rgb.g;
            colors[i * 4 + 2] = rgb.b;
            colors[i * 4 + 3] = 1;
        }
        try {
            if (typeof mesh.setVerticesData === 'function') {
                mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, colors, true);
            } else if (typeof mesh.updateVerticesData === 'function') {
                mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, colors, true);
            } else {
                return false;
            }
            mesh.useVertexColors = true;
            mesh.hasVertexAlpha = false;
            if (!mesh.material) {
                var mat = new BABYLON.StandardMaterial('terrain-splat-mat', mesh.getScene());
                mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
                mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
                mesh.material = mat;
            }
        } catch (e) {
            console.warn('[TexturePainter] Không cập nhật được vertex colors:', e);
            return false;
        }
        return true;
    }

    var TexturePainter = {
        /* Vẽ 1 layer lên vùng tròn quanh điểm world (worldX, worldZ).
         * radius: bán kính (đơn vị world). Trộn mềm ở rìa: vertex trong
         * nửa bán kính trong được sơn chắc, rìa ngoài sơn theo xác suất
         * giảm dần để không bị biên cứng. terrainId: tùy chọn. */
        paintTexture: function (worldX, worldZ, layerName, radius, terrainId) {
            var obj = terrainId ? _findTerrain(terrainId) : _findFirstTerrain();
            if (!obj) {
                console.warn('[TexturePainter] Không có terrain trong scene.');
                return false;
            }
            var td = _terrainDataOf(obj);
            if (!td) { return false; }
            var layer = layerName || _activeLayer;
            if (!LAYERS.hasOwnProperty(layer)) {
                console.warn('[TexturePainter] Layer không tồn tại:', layer);
                return false;
            }
            var idx = _layerIndex(layer);
            var splat = _ensureSplat(td);
            var r = (typeof radius === 'number' && radius > 0) ? radius : 3;
            var n = td.subdivisions + 1;
            var colC = (worldX + td.size / 2) / td.size * td.subdivisions;
            var rowC = (worldZ + td.length / 2) / td.length * td.subdivisions;
            var spanX = Math.ceil(r / (td.size / td.subdivisions)) + 1;
            var spanZ = Math.ceil(r / (td.length / td.subdivisions)) + 1;
            for (var row = Math.max(0, Math.floor(rowC) - spanZ);
                 row <= Math.min(td.subdivisions, Math.ceil(rowC) + spanZ); row++) {
                for (var col = Math.max(0, Math.floor(colC) - spanX);
                     col <= Math.min(td.subdivisions, Math.ceil(colC) + spanX); col++) {
                    var vx = (col / td.subdivisions - 0.5) * td.size;
                    var vz = (row / td.subdivisions - 0.5) * td.length;
                    var dist = Math.sqrt((vx - worldX) * (vx - worldX) + (vz - worldZ) * (vz - worldZ));
                    if (dist > r) { continue; }
                    // Mềm rìa: trong 60% bán kính sơn chắc, ngoài thì theo tỉ lệ.
                    if (dist > r * 0.6) {
                        var keep = 1 - (dist - r * 0.6) / (r * 0.4);
                        if (Math.random() > keep) { continue; }
                    }
                    splat[row * n + col] = idx;
                }
            }
            var mesh = obj.babylonNode || null;
            if (mesh) { applySplatToMesh(mesh, td); }
            return true;
        },

        setActiveLayer: function (name) {
            if (!LAYERS.hasOwnProperty(name)) {
                console.warn('[TexturePainter] Layer không tồn tại:', name);
                return _activeLayer;
            }
            _activeLayer = name;
            return _activeLayer;
        },

        getActiveLayer: function () { return _activeLayer; },

        getLayers: function () { return _layerNames(); },

        /* Đổi màu của 1 layer (hex '#rrggbb') rồi vẽ lại splat hiện tại. */
        setLayerColor: function (name, hex) {
            if (!LAYERS.hasOwnProperty(name)) {
                console.warn('[TexturePainter] Layer không tồn tại:', name);
                return false;
            }
            LAYERS[name] = hex;
            // Vẽ lại màu trên terrain đang active (nếu có).
            var obj = _findFirstTerrain();
            if (obj) {
                var td = _terrainDataOf(obj);
                if (td && td.splat && obj.babylonNode) {
                    applySplatToMesh(obj.babylonNode, td);
                }
            }
            return true;
        },

        getLayerColor: function (name) { return LAYERS[name] || null; },

        /* Lấy splat map (mảng layer index / vertex) của 1 terrain. */
        getSplat: function (terrainId) {
            var obj = terrainId ? _findTerrain(terrainId) : _findFirstTerrain();
            if (!obj) { return null; }
            var td = _terrainDataOf(obj);
            if (!td) { return null; }
            return _ensureSplat(td);
        },

        /* Gán toàn bộ terrain về 1 layer rồi cập nhật mesh. */
        fillLayer: function (layerName, terrainId) {
            var obj = terrainId ? _findTerrain(terrainId) : _findFirstTerrain();
            if (!obj) { return false; }
            var td = _terrainDataOf(obj);
            if (!td) { return false; }
            var idx = _layerIndex(layerName || _activeLayer);
            var splat = _ensureSplat(td);
            for (var i = 0; i < splat.length; i++) { splat[i] = idx; }
            if (obj.babylonNode) { applySplatToMesh(obj.babylonNode, td); }
            return true;
        },

        applySplatToMesh: applySplatToMesh
    };

    PE.TexturePainter = TexturePainter;
})();
