'use strict';
/* GLBLoader — Nạp file GLB/GLTF, chuẩn hóa kích thước về cao ~2m.
 * Nhóm MODELS. Vanilla JS, không import/export.
 * URL mẫu (ghi rõ trong comment):
 *  - RobotExpressive: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb
 *  - Fox: https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    // URL mẫu public (CDN raw.githubusercontent.com)
    var SAMPLE_ROBOT_URL = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb';
    var SAMPLE_FOX_URL = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb';

    function getScene() {
        if (PE.state && PE.state.scene) return PE.state.scene;
        return null;
    }
    function emit(name, data) {
        if (PE.EventBus && typeof PE.EventBus.emit === 'function') PE.EventBus.emit(name, data);
    }
    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[GLBLoader] ' + msg);
    }
    function splitUrl(url) {
        var i = url.lastIndexOf('/');
        if (i < 0) return { rootUrl: '', fileName: url };
        return { rootUrl: url.slice(0, i + 1), fileName: url.slice(i + 1) };
    }

    /* Chuẩn hóa kích thước: nếu chiều cao bounding box lệch khỏi ~2m thì scale lại.
     * Trả về scale factor đã áp dụng. */
    function normalizeScale(root, targetHeight) {
        targetHeight = targetHeight || 2;
        if (!root || typeof root.getHierarchyBoundingVectors !== 'function') return 1;
        try {
            var bounds = root.getHierarchyBoundingVectors(true);
            var height = bounds.max.y - bounds.min.y;
            if (!isFinite(height) || height <= 0.001) return 1;
            // Chỉ scale khi quá lớn (> 4m) hoặc quá nhỏ (< 0.5m)
            if (height > 4 || height < 0.5) {
                var factor = targetHeight / height;
                root.scaling.scaleInPlace(factor);
                return factor;
            }
        } catch (e) {
            log('Không chuẩn hóa được kích thước: ' + e.message);
        }
        return 1;
    }

    function registerGameObject(root, info) {
        var obj = {
            id: 'model_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36),
            name: info.name || root.name || 'Model',
            type: 'model',
            parentId: null,
            children: [],
            transform: {
                position: { x: root.position.x, y: root.position.y, z: root.position.z },
                rotation: { x: root.rotation.x, y: root.rotation.y, z: root.rotation.z },
                scale: { x: root.scaling.x, y: root.scaling.y, z: root.scaling.z }
            },
            babylonNode: root,
            components: [],
            visible: true,
            active: true,
            userData: { modelInfo: info }
        };
        if (PE.SceneManager && typeof PE.SceneManager.addObject === 'function') {
            var added = PE.SceneManager.addObject(obj);
            if (added) obj = added;
        } else if (PE.state && Array.isArray(PE.state.objects)) {
            PE.state.objects.push(obj);
        }
        emit('object-added', { object: obj });
        emit('hierarchy-changed', { object: obj });
        return obj;
    }

    /* Nạp GLB/GLTF từ URL hoặc File. opts: { position:{x,y,z}, scale:number, name, targetHeight }.
     * Trả về Promise<GameObject>. */
    function load(urlOrFile, opts) {
        opts = opts || {};
        var scene = getScene();
        if (!scene) return Promise.reject(new Error('Chưa có scene (engine chưa sẵn sàng).'));
        if (typeof BABYLON === 'undefined' || !BABYLON.SceneLoader) {
            return Promise.reject(new Error('Babylon.js chưa được nạp.'));
        }
        var isFile = (typeof File !== 'undefined' && urlOrFile instanceof File) ||
                     (urlOrFile && typeof urlOrFile === 'object' && typeof urlOrFile.name === 'string' && typeof urlOrFile.size === 'number');
        var displayName = opts.name || (isFile ? urlOrFile.name : String(urlOrFile).split('/').pop()) || 'Model';
        var promise;
        if (isFile) {
            promise = BABYLON.SceneLoader.ImportMeshAsync(null, '', urlOrFile, scene).catch(function () {
                var blobUrl = URL.createObjectURL(urlOrFile);
                return BABYLON.SceneLoader.ImportMeshAsync(null, '', blobUrl, scene)
                    .then(function (r) { URL.revokeObjectURL(blobUrl); return r; });
            });
        } else {
            var parts = splitUrl(String(urlOrFile));
            promise = BABYLON.SceneLoader.ImportMeshAsync(null, parts.rootUrl, parts.fileName, scene);
        }
        return promise.then(function (result) {
            var root = null;
            if (result.meshes && result.meshes.length) {
                root = result.meshes[0];
                for (var i = 0; i < result.meshes.length; i++) {
                    if (result.meshes[i].name === '__root__') { root = result.meshes[i]; break; }
                }
            }
            if (!root) throw new Error('Không tìm thấy mesh nào trong file.');
            // Đặt vị trí
            var pos = opts.position || { x: 0, y: 0, z: 0 };
            root.position.set(pos.x || 0, pos.y || 0, pos.z || 0);
            // Scale tay (nếu có) rồi chuẩn hóa theo bounding box
            if (opts.scale && isFinite(opts.scale) && opts.scale > 0) root.scaling.scaleInPlace(opts.scale);
            var factor = normalizeScale(root, opts.targetHeight || 2);
            // Đặt chân model chạm đất (y=0) nếu bounding box chìm dưới đất
            try {
                var b = root.getHierarchyBoundingVectors(true);
                if (b.min.y < 0) root.position.y -= b.min.y;
            } catch (e) {}
            var totalVertices = 0, totalIndices = 0;
            (result.meshes || []).forEach(function (m) {
                try { totalVertices += m.getTotalVertices(); } catch (e) {}
                try { totalIndices += m.getTotalIndices(); } catch (e) {}
            });
            var info = {
                name: displayName,
                source: isFile ? 'file' : 'url',
                url: isFile ? null : String(urlOrFile),
                meshCount: (result.meshes || []).length,
                vertices: totalVertices,
                triangles: Math.floor(totalIndices / 3),
                animationGroups: (result.animationGroups || []).map(function (g) { return g.name; }),
                skeletons: (result.skeletons || []).length,
                normalizedScale: factor,
                importedAt: new Date().toISOString()
            };
            var obj = registerGameObject(root, info);
            log('Đã nạp ' + displayName + ' (scale x' + factor.toFixed(2) + ', ' + info.triangles + ' triangles)');
            return obj;
        });
    }

    /* Thử nạp 2 GLB mẫu public. Mạng lỗi -> catch, trả về null, KHÔNG crash. */
    function loadSampleModels() {
        var results = { robot: null, fox: null };
        var pRobot = load(SAMPLE_ROBOT_URL, { name: 'RobotExpressive', position: { x: -2, y: 0, z: 0 } })
            .then(function (obj) { results.robot = obj; return obj; })
            .catch(function (err) {
                log('GLB mẫu không tải được, dùng procedural fallback (RobotExpressive): ' + (err && err.message || err));
                return null;
            });
        var pFox = load(SAMPLE_FOX_URL, { name: 'Fox', position: { x: 2, y: 0, z: 0 } })
            .then(function (obj) { results.fox = obj; return obj; })
            .catch(function (err) {
                log('GLB mẫu không tải được, dùng procedural fallback (Fox): ' + (err && err.message || err));
                return null;
            });
        return Promise.all([pRobot, pFox]).then(function () { return results; });
    }

    var GLBLoader = {
        sampleRobotUrl: SAMPLE_ROBOT_URL,
        sampleFoxUrl: SAMPLE_FOX_URL,
        load: load,
        loadSampleModels: loadSampleModels,
        normalizeScale: normalizeScale
    };
    PE.GLBLoader = GLBLoader;
})();
