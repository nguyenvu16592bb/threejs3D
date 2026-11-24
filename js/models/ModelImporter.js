'use strict';
/* ModelImporter — Nhập model 3D (GLB/GLTF/OBJ/STL) vào scene Babylon.js.
 * Nhóm MODELS. Vanilla JS, không import/export.
 * FBX KHÔNG hỗ trợ trong browser (Babylon.js không có FBX loader).
 * Cách dùng: PixiEngine.ModelImporter.importFiles(fileList)
 *            PixiEngine.ModelImporter.importFromURL(url, name) */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    function getScene() {
        if (PE.state && PE.state.scene) return PE.state.scene;
        return null;
    }
    function emit(name, data) {
        if (PE.EventBus && typeof PE.EventBus.emit === 'function') PE.EventBus.emit(name, data);
    }
    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[ModelImporter] ' + msg);
        var panel = (typeof document !== 'undefined') ? document.getElementById('console-panel') : null;
        if (panel) {
            var line = document.createElement('div');
            line.textContent = '[Import] ' + msg;
            panel.appendChild(line);
            panel.scrollTop = panel.scrollHeight;
        }
    }
    function getExt(name) {
        var i = (name || '').lastIndexOf('.');
        return i >= 0 ? (name.slice(i)).toLowerCase() : '';
    }
    function splitUrl(url) {
        var i = url.lastIndexOf('/');
        if (i < 0) return { rootUrl: '', fileName: url };
        return { rootUrl: url.slice(0, i + 1), fileName: url.slice(i + 1) };
    }

    /* Tạo GameObject type 'model' sau khi import xong. Trả về obj hoặc null. */
    function registerGameObject(rootMesh, info) {
        if (!rootMesh) return null;
        var obj = {
            id: 'model_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36),
            name: info.name || rootMesh.name || 'Model',
            type: 'model',
            parentId: null,
            children: [],
            transform: {
                position: { x: rootMesh.position.x, y: rootMesh.position.y, z: rootMesh.position.z },
                rotation: { x: rootMesh.rotation.x, y: rootMesh.rotation.y, z: rootMesh.rotation.z },
                scale: { x: rootMesh.scaling.x, y: rootMesh.scaling.y, z: rootMesh.scaling.z }
            },
            babylonNode: rootMesh,
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

    function collectInfo(result, sourceName, sourceKind) {
        var meshes = (result && result.meshes) || [];
        var totalVertices = 0, totalIndices = 0;
        meshes.forEach(function (m) {
            try { totalVertices += m.getTotalVertices(); } catch (e) {}
            try { totalIndices += m.getTotalIndices(); } catch (e) {}
        });
        var materials = [];
        meshes.forEach(function (m) {
            if (m.material && materials.indexOf(m.material.name) < 0) materials.push(m.material.name);
        });
        return {
            name: sourceName,
            source: sourceKind, // 'file' | 'url'
            meshCount: meshes.length,
            vertices: totalVertices,
            triangles: Math.floor(totalIndices / 3),
            materials: materials,
            animationGroups: (result && result.animationGroups) ? result.animationGroups.map(function (g) { return g.name; }) : [],
            skeletons: (result && result.skeletons) ? result.skeletons.length : 0,
            importedAt: new Date().toISOString()
        };
    }

    /* Import 1 File object. Thử File trực tiếp, lỗi thì fallback URL.createObjectURL. */
    function importFile(file) {
        var scene = getScene();
        if (!scene) return Promise.reject(new Error('Chưa có scene (engine chưa sẵn sàng).'));
        if (typeof BABYLON === 'undefined' || !BABYLON.SceneLoader) {
            return Promise.reject(new Error('Babylon.js chưa được nạp.'));
        }
        var ext = getExt(file.name);
        if (ext === '.fbx') {
            return Promise.reject(new Error('FBX chưa hỗ trợ, hãy convert sang GLB.'));
        }
        if (ModelImporter.supportedExtensions.indexOf(ext) < 0) {
            return Promise.reject(new Error('Định dạng chưa hỗ trợ: ' + ext + '. Hỗ trợ: ' + ModelImporter.supportedExtensions.join(', ')));
        }
        emit('import-progress', { file: file.name, progress: 0, status: 'start' });
        log('Đang import ' + file.name + ' ...');
        var done = function (result) {
            var root = null;
            if (result.meshes && result.meshes.length) {
                root = result.meshes[0];
                // Ưu tiên mesh __root__ nếu có
                for (var i = 0; i < result.meshes.length; i++) {
                    if (result.meshes[i].name === '__root__') { root = result.meshes[i]; break; }
                }
            }
            var info = collectInfo(result, file.name, 'file');
            var obj = registerGameObject(root, info);
            emit('import-progress', { file: file.name, progress: 100, status: 'done', object: obj });
            log('Import xong: ' + file.name + ' (' + info.meshCount + ' mesh, ' + info.triangles + ' triangles)');
            return obj;
        };
        return BABYLON.SceneLoader.ImportMeshAsync(null, '', file, scene)
            .then(done)
            .catch(function (err) {
                // Fallback: object URL
                log('Import trực tiếp thất bại, thử lại bằng object URL...');
                var blobUrl = URL.createObjectURL(file);
                return BABYLON.SceneLoader.ImportMeshAsync(null, '', blobUrl, scene)
                    .then(function (result) {
                        URL.revokeObjectURL(blobUrl);
                        return done(result);
                    })
                    .catch(function (err2) {
                        URL.revokeObjectURL(blobUrl);
                        emit('import-progress', { file: file.name, progress: 0, status: 'error', error: String(err2 && err2.message || err2) });
                        log('Import lỗi: ' + file.name + ' — ' + (err2 && err2.message || err2));
                        throw err2;
                    });
            });
    }

    /* Import từ URL (http/https). */
    function importFromURL(url, name) {
        var scene = getScene();
        if (!scene) return Promise.reject(new Error('Chưa có scene (engine chưa sẵn sàng).'));
        if (typeof BABYLON === 'undefined' || !BABYLON.SceneLoader) {
            return Promise.reject(new Error('Babylon.js chưa được nạp.'));
        }
        var ext = getExt(url.split('?')[0].split('#')[0]);
        if (ext === '.fbx') {
            return Promise.reject(new Error('FBX chưa hỗ trợ, hãy convert sang GLB.'));
        }
        var displayName = name || url.split('/').pop() || 'Model';
        emit('import-progress', { file: displayName, progress: 0, status: 'start' });
        log('Đang tải model từ URL: ' + url);
        var parts = splitUrl(url);
        return BABYLON.SceneLoader.ImportMeshAsync(null, parts.rootUrl, parts.fileName, scene)
            .then(function (result) {
                var root = null;
                if (result.meshes && result.meshes.length) {
                    root = result.meshes[0];
                    for (var i = 0; i < result.meshes.length; i++) {
                        if (result.meshes[i].name === '__root__') { root = result.meshes[i]; break; }
                    }
                }
                var info = collectInfo(result, displayName, 'url');
                info.url = url;
                var obj = registerGameObject(root, info);
                emit('import-progress', { file: displayName, progress: 100, status: 'done', object: obj });
                log('Tải xong: ' + displayName);
                return obj;
            })
            .catch(function (err) {
                emit('import-progress', { file: displayName, progress: 0, status: 'error', error: String(err && err.message || err) });
                log('Tải lỗi: ' + displayName + ' — ' + (err && err.message || err));
                throw err;
            });
    }

    /* Import nhiều file (input[type=file] hoặc drag-drop). Trả về Promise<{ok, errors}>. */
    function importFiles(fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        if (!files.length) return Promise.resolve({ ok: [], errors: [] });
        var ok = [], errors = [];
        var chain = Promise.resolve();
        files.forEach(function (file) {
            chain = chain.then(function () {
                return importFile(file).then(function (obj) {
                    if (obj) ok.push(obj);
                }).catch(function (err) {
                    errors.push({ file: file.name, error: err && err.message || String(err) });
                });
            });
        });
        return chain.then(function () { return { ok: ok, errors: errors }; });
    }

    /* Kéo-thả file vào viewport (#viewport-wrap). Gọi 1 lần khi khởi tạo. */
    var dropBound = false;
    function bindDropZone() {
        if (dropBound) return;
        if (typeof document === 'undefined') return;
        var wrap = document.getElementById('viewport-wrap');
        if (!wrap) return;
        dropBound = true;
        wrap.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            wrap.classList.add('drop-active');
        });
        wrap.addEventListener('dragleave', function () {
            wrap.classList.remove('drop-active');
        });
        wrap.addEventListener('drop', function (e) {
            e.preventDefault();
            wrap.classList.remove('drop-active');
            var files = e.dataTransfer && e.dataTransfer.files;
            if (files && files.length) {
                importFiles(files).then(function (res) {
                    if (res.errors.length) {
                        res.errors.forEach(function (er) { log('Lỗi import ' + er.file + ': ' + er.error); });
                    }
                });
            }
        });
        log('Đã bật kéo-thả model vào viewport.');
    }

    function init() { bindDropZone(); }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindDropZone);
        } else {
            bindDropZone();
        }
    }

    var ModelImporter = {
        supportedExtensions: ['.glb', '.gltf', '.obj', '.stl'],
        importFiles: importFiles,
        importFromURL: importFromURL,
        importFile: importFile,
        bindDropZone: bindDropZone,
        init: init
    };
    PE.ModelImporter = ModelImporter;
})();
