'use strict';
/* TerrainBrush — Nhóm TERRAIN + TILESET + ENVIRONMENT
 * Cọ vẽ địa hình: raise / lower / smooth / flatten / noise trên heightmap
 * của terrain, kèm vòng preview tại điểm hover và vẽ bằng chuột/cảm ứng
 * (pointer events) trên canvas viewport. Mỗi stroke push 1 snapshot undo.
 * Vanilla JS, không import/export. Phòng thủ: nếu chưa có terrain trong
 * scene thì applyBrush chỉ console.warn, không crash.
 */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    var TOOLS = ['select', 'raise', 'lower', 'smooth', 'flatten', 'noise'];

    var _brush = {
        tool: 'select',     // công cụ đang chọn
        size: 5,            // bán kính cọ (đơn vị world)
        strength: 0.5,      // 0..1
        falloff: 'smooth',  // 'smooth' | 'linear' | 'hard'
        shape: 'circle'     // 'circle' (hiện chỉ hỗ trợ tròn)
    };

    var _paintMode = false;   // true khi tool != 'select' và đã bật vẽ
    var _painting = false;    // đang giữ chuột/cảm ứng kéo
    var _seed = 1337;
    var _undoStack = [];      // mỗi phần tử: { terrainId, snapshot: Float32Array }
    var _strokeSnapshot = null; // snapshot lúc bắt đầu stroke
    var _strokeTerrainId = null;
    var _previewMesh = null;
    var _canvas = null;
    var _boundHandlers = null;

    function _emit(event, data) {
        if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
            PE.EventBus.emit(event, data);
        }
    }

    function _getScene() {
        return (PE.state && PE.state.scene) ? PE.state.scene : null;
    }

    function _getTerrain() {
        // Ưu tiên terrain đang được chọn, rồi terrain đầu tiên trong scene.
        if (PE.TerrainEditor && typeof PE.TerrainEditor.findFirstTerrain === 'function') {
            var sel = (PE.state && PE.state.selected) ? PE.state.selected : null;
            if (sel && sel.type === 'terrain') { return sel; }
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

    function _falloff(dist, radius) {
        if (radius <= 0) { return 0; }
        var t = dist / radius;
        if (t >= 1) { return 0; }
        if (_brush.falloff === 'hard') { return 1; }
        if (_brush.falloff === 'linear') { return 1 - t; }
        // smooth: đường cong cos mượt ở rìa cọ
        return 0.5 + 0.5 * Math.cos(Math.PI * t);
    }

    /* Random xác định (deterministic) theo seed + tọa độ — noise ổn định
     * mỗi lần vẽ lại cùng một chỗ cho cùng một kết quả. */
    function _hashNoise(ix, iz) {
        var h = (ix * 374761393 + iz * 668265263 + _seed * 974634) | 0;
        h = (h ^ (h >> 13)) | 0;
        h = Math.imul(h, 1274126177);
        h = (h ^ (h >> 16)) >>> 0;
        return h / 4294967295; // 0..1
    }

    function _pushUndo(terrainId, snapshot) {
        _undoStack.push({ terrainId: terrainId, snapshot: snapshot });
        if (_undoStack.length > 50) { _undoStack.shift(); }
    }

    function _beginStroke(obj) {
        var td = _terrainDataOf(obj);
        if (!td) { return; }
        _strokeSnapshot = td.heightmap.slice();
        _strokeTerrainId = obj.id;
    }

    function _endStroke() {
        if (_strokeSnapshot && _strokeTerrainId) {
            _pushUndo(_strokeTerrainId, _strokeSnapshot);
        }
        _strokeSnapshot = null;
        _strokeTerrainId = null;
    }

    /* Vòng tròn preview tại điểm hover: torus mỏng nằm trên mặt terrain. */
    function _ensurePreviewMesh(scene) {
        if (_previewMesh) { return _previewMesh; }
        if (typeof BABYLON === 'undefined' || !scene) { return null; }
        try {
            _previewMesh = BABYLON.MeshBuilder.CreateTorus('brush-preview', {
                diameter: 2, thickness: 0.08, tessellation: 48
            }, scene);
            var mat = new BABYLON.StandardMaterial('brush-preview-mat', scene);
            mat.diffuseColor = new BABYLON.Color3(1, 0.85, 0.2);
            mat.emissiveColor = new BABYLON.Color3(1, 0.85, 0.2);
            mat.disableLighting = true;
            _previewMesh.material = mat;
            _previewMesh.isPickable = false;
            _previewMesh.rotation.x = Math.PI / 2; // nằm ngang trên mặt đất
            _previewMesh.setEnabled(false);
        } catch (e) {
            _previewMesh = null;
        }
        return _previewMesh;
    }

    function _updatePreview(worldX, worldZ) {
        var scene = _getScene();
        var mesh = _ensurePreviewMesh(scene);
        if (!mesh) { return; }
        var obj = _getTerrain();
        var y = 0.1;
        if (obj && PE.TerrainEditor && typeof PE.TerrainEditor.getHeightAt === 'function') {
            y = PE.TerrainEditor.getHeightAt(obj.id, worldX, worldZ) + 0.15;
        }
        mesh.position.x = worldX;
        mesh.position.z = worldZ;
        mesh.position.y = y;
        var s = Math.max(0.1, _brush.size);
        mesh.scaling.x = s;
        mesh.scaling.y = s;
        mesh.scaling.z = s;
        mesh.setEnabled(_paintMode && _brush.tool !== 'select');
    }

    function _hidePreview() {
        if (_previewMesh && typeof _previewMesh.setEnabled === 'function') {
            _previewMesh.setEnabled(false);
        }
    }

    /* Pick điểm trên terrain từ tọa độ con trỏ trên canvas. */
    function _pickTerrainPoint(ev) {
        var scene = _getScene();
        if (!scene || typeof scene.pick !== 'function') { return null; }
        var canvas = _canvas;
        var x = ev.clientX, y = ev.clientY;
        if (canvas && typeof canvas.getBoundingClientRect === 'function') {
            var rect = canvas.getBoundingClientRect();
            x = ev.clientX - rect.left;
            y = ev.clientY - rect.top;
        }
        var pick = null;
        try {
            pick = scene.pick(x, y, function (mesh) {
                return !!mesh && mesh.metadata && mesh.metadata.isTerrain;
            });
        } catch (e) { pick = null; }
        if (pick && pick.hit && pick.pickedPoint) {
            return { x: pick.pickedPoint.x, z: pick.pickedPoint.z };
        }
        return null;
    }

    function _onPointerDown(ev) {
        if (!_paintMode || _brush.tool === 'select') { return; }
        var p = _pickTerrainPoint(ev);
        if (!p) { return; }
        if (ev.preventDefault) { ev.preventDefault(); }
        var obj = _getTerrain();
        if (obj) { _beginStroke(obj); }
        _painting = true;
        TerrainBrush.applyBrush(p.x, p.z);
    }

    function _onPointerMove(ev) {
        var p = _pickTerrainPoint(ev);
        if (p) {
            _updatePreview(p.x, p.z);
            if (_painting && _paintMode && _brush.tool !== 'select') {
                TerrainBrush.applyBrush(p.x, p.z);
            }
        } else {
            _hidePreview();
        }
    }

    function _onPointerUp() {
        if (_painting) {
            _painting = false;
            _endStroke();
        }
    }

    function _attachCanvas() {
        var scene = _getScene();
        var canvas = null;
        if (PE.state && PE.state.engine && typeof PE.state.engine.getRenderingCanvas === 'function') {
            try { canvas = PE.state.engine.getRenderingCanvas(); } catch (e) { canvas = null; }
        }
        if (!canvas && typeof document !== 'undefined') {
            canvas = document.querySelector('canvas');
        }
        if (!canvas || canvas === _canvas) { return; }
        _detachCanvas();
        _canvas = canvas;
        _boundHandlers = {
            down: _onPointerDown,
            move: _onPointerMove,
            up: _onPointerUp,
            leave: _onPointerUp
        };
        canvas.addEventListener('pointerdown', _boundHandlers.down);
        canvas.addEventListener('pointermove', _boundHandlers.move);
        canvas.addEventListener('pointerup', _boundHandlers.up);
        canvas.addEventListener('pointerleave', _boundHandlers.leave);
        // Cảm ứng: pointer events đã bao gồm touch; chặn cuộn trang khi vẽ.
        try { canvas.style.touchAction = 'none'; } catch (e) { /* bỏ qua */ }
    }

    function _detachCanvas() {
        if (!_canvas || !_boundHandlers) { return; }
        try {
            _canvas.removeEventListener('pointerdown', _boundHandlers.down);
            _canvas.removeEventListener('pointermove', _boundHandlers.move);
            _canvas.removeEventListener('pointerup', _boundHandlers.up);
            _canvas.removeEventListener('pointerleave', _boundHandlers.leave);
        } catch (e) { /* bỏ qua */ }
        _canvas = null;
        _boundHandlers = null;
    }

    var TerrainBrush = {
        setBrush: function (opts) {
            opts = opts || {};
            if (opts.tool && TOOLS.indexOf(opts.tool) !== -1) { _brush.tool = opts.tool; }
            if (typeof opts.size === 'number' && opts.size > 0) { _brush.size = opts.size; }
            if (typeof opts.strength === 'number') {
                _brush.strength = Math.max(0, Math.min(1, opts.strength));
            }
            if (opts.falloff) { _brush.falloff = opts.falloff; }
            if (opts.shape) { _brush.shape = opts.shape; }
            if (typeof opts.seed === 'number') { _seed = opts.seed; }
            _paintMode = _brush.tool !== 'select';
            if (_paintMode) { _attachCanvas(); }
            _emit('brush-changed', { brush: TerrainBrush.getBrush() });
            return TerrainBrush.getBrush();
        },

        getBrush: function () {
            return {
                tool: _brush.tool,
                size: _brush.size,
                strength: _brush.strength,
                falloff: _brush.falloff,
                shape: _brush.shape
            };
        },

        setActiveTool: function (tool) {
            if (TOOLS.indexOf(tool) === -1) {
                console.warn('[TerrainBrush] Công cụ không hợp lệ:', tool);
                return TerrainBrush.getBrush();
            }
            _brush.tool = tool;
            _paintMode = tool !== 'select';
            if (_paintMode) { _attachCanvas(); } else { _hidePreview(); }
            _emit('brush-changed', { brush: TerrainBrush.getBrush() });
            return TerrainBrush.getBrush();
        },

        /* Áp cọ tại điểm world (worldX, worldZ) trên terrain đang active.
         * Trả về false (kèm console.warn) nếu không có terrain. */
        applyBrush: function (worldX, worldZ) {
            var obj = _getTerrain();
            if (!obj) {
                console.warn('[TerrainBrush] Không có terrain trong scene — bỏ qua applyBrush.');
                return false;
            }
            var td = _terrainDataOf(obj);
            if (!td) {
                console.warn('[TerrainBrush] Terrain không có heightmap.');
                return false;
            }
            var tool = _brush.tool;
            if (tool === 'select') { return false; }

            var n = td.subdivisions + 1;
            var radius = _brush.size;
            var strength = _brush.strength;
            // Chỉ xét các vertex trong hình vuông bao quanh cọ.
            var colC = (worldX + td.size / 2) / td.size * td.subdivisions;
            var rowC = (worldZ + td.length / 2) / td.length * td.subdivisions;
            var cellX = td.size / td.subdivisions;
            var cellZ = td.length / td.subdivisions;
            var spanX = Math.ceil(radius / cellX) + 1;
            var spanZ = Math.ceil(radius / cellZ) + 1;

            var centerH = 0;
            if (tool === 'flatten' && PE.TerrainEditor &&
                typeof PE.TerrainEditor.getHeightAt === 'function') {
                centerH = PE.TerrainEditor.getHeightAt(obj.id, worldX, worldZ);
            } else if (tool === 'flatten') {
                var ci = Math.round(rowC) * n + Math.round(colC);
                centerH = td.heightmap[Math.max(0, Math.min(td.heightmap.length - 1, ci))];
            }

            // smooth cần bản sao heightmap trước khi sửa (trung bình lân cận).
            var src = (tool === 'smooth') ? td.heightmap.slice() : td.heightmap;

            for (var r = Math.max(0, Math.floor(rowC) - spanZ);
                 r <= Math.min(td.subdivisions, Math.ceil(rowC) + spanZ); r++) {
                for (var c = Math.max(0, Math.floor(colC) - spanX);
                     c <= Math.min(td.subdivisions, Math.ceil(colC) + spanX); c++) {
                    var vx = (c / td.subdivisions - 0.5) * td.size;
                    var vz = (r / td.subdivisions - 0.5) * td.length;
                    var dist = Math.sqrt((vx - worldX) * (vx - worldX) + (vz - worldZ) * (vz - worldZ));
                    if (dist > radius) { continue; }
                    var f = _falloff(dist, radius);
                    if (f <= 0) { continue; }
                    var idx = r * n + c;
                    if (tool === 'raise') {
                        td.heightmap[idx] += strength * f;
                    } else if (tool === 'lower') {
                        td.heightmap[idx] -= strength * f;
                    } else if (tool === 'flatten') {
                        td.heightmap[idx] += (centerH - td.heightmap[idx]) * strength * f;
                    } else if (tool === 'noise') {
                        var rnd = _hashNoise(c, r) - 0.5; // -0.5..0.5
                        td.heightmap[idx] += rnd * 2 * strength * f;
                    } else if (tool === 'smooth') {
                        var sum = 0, cnt = 0;
                        for (var dr = -1; dr <= 1; dr++) {
                            for (var dc = -1; dc <= 1; dc++) {
                                var rr = r + dr, cc = c + dc;
                                if (rr < 0 || rr > td.subdivisions || cc < 0 || cc > td.subdivisions) { continue; }
                                sum += src[rr * n + cc];
                                cnt++;
                            }
                        }
                        var avg = cnt > 0 ? sum / cnt : src[idx];
                        td.heightmap[idx] += (avg - td.heightmap[idx]) * strength * f;
                    }
                }
            }

            if (PE.TerrainEditor && typeof PE.TerrainEditor.applyAndNotify === 'function') {
                PE.TerrainEditor.applyAndNotify(obj);
            } else if (PE.TerrainEditor && typeof PE.TerrainEditor.applyHeightmapToMesh === 'function') {
                var mesh = obj.babylonNode;
                if (mesh) { PE.TerrainEditor.applyHeightmapToMesh(mesh, td.heightmap, td.subdivisions); }
            }
            return true;
        },

        /* Bật/tắt chế độ vẽ (gắn hoặc gỡ pointer event trên canvas). */
        enablePaintMode: function (enabled) {
            _paintMode = !!enabled && _brush.tool !== 'select';
            if (_paintMode) {
                _attachCanvas();
            } else {
                _painting = false;
                _endStroke();
                _hidePreview();
                _detachCanvas();
            }
            return _paintMode;
        },

        /* Hoàn tác 1 stroke gần nhất (khôi phục snapshot heightmap). */
        undo: function () {
            var entry = _undoStack.pop();
            if (!entry) { return false; }
            var obj = null;
            if (PE.TerrainEditor && typeof PE.TerrainEditor.findTerrain === 'function') {
                obj = PE.TerrainEditor.findTerrain(entry.terrainId);
            }
            if (!obj) { return false; }
            var td = _terrainDataOf(obj);
            if (!td) { return false; }
            td.heightmap.set(entry.snapshot);
            if (PE.TerrainEditor && typeof PE.TerrainEditor.applyAndNotify === 'function') {
                PE.TerrainEditor.applyAndNotify(obj);
            }
            return true;
        },

        setSeed: function (seed) { _seed = seed | 0; },
        getTools: function () { return TOOLS.slice(); },
        isPainting: function () { return _painting; }
    };

    PE.TerrainBrush = TerrainBrush;
})();
