'use strict';
/* ModelViewer — Xem trước model: focus camera vào model, phát clip, wireframe.
 * Nhóm MODELS. Vanilla JS, không import/export.
 * KHÔNG tạo engine thứ hai: dùng chính viewport, lưu camera cũ rồi khôi phục. */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    var currentObj = null;
    var savedCamera = null; // { target, radius, alpha, beta }
    var modalEl = null;

    function getScene() {
        if (PE.state && PE.state.scene) return PE.state.scene;
        return null;
    }
    function getCamera() {
        var scene = getScene();
        if (scene && scene.activeCamera) return scene.activeCamera;
        if (PE.state && PE.state.engine && PE.state.engine.activeCamera) return PE.state.engine.activeCamera;
        return null;
    }
    function findObj(objId) {
        if (PE.SceneManager && typeof PE.SceneManager.findById === 'function') {
            return PE.SceneManager.findById(objId);
        }
        if (PE.state && Array.isArray(PE.state.objects)) {
            for (var i = 0; i < PE.state.objects.length; i++) {
                if (PE.state.objects[i].id === objId) return PE.state.objects[i];
            }
        }
        return null;
    }
    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[ModelViewer] ' + msg);
    }
    function modelMeshes(obj) {
        if (!obj || !obj.babylonNode) return [];
        var node = obj.babylonNode;
        if (typeof node.getChildMeshes === 'function') return node.getChildMeshes();
        return [node];
    }
    function listClips(obj) {
        var scene = getScene();
        if (!scene || !scene.animationGroups) return [];
        var node = obj && obj.babylonNode;
        if (!node) return scene.animationGroups.slice();
        // Chỉ lấy group liên quan tới model (targetedAnimations chạm vào node con)
        var names = [];
        scene.animationGroups.forEach(function (g) {
            var hit = false;
            (g.targetedAnimations || []).forEach(function (ta) {
                var t = ta.target;
                if (t === node) hit = true;
                if (typeof node.getChildMeshes === 'function') {
                    var kids = node.getChildMeshes();
                    if (kids.indexOf(t) >= 0) hit = true;
                }
                // Animation của skeleton/bone cũng tính
                if (t && t.getAbsolutePosition && node.getChildMeshes) {
                    try {
                        var meshes = node.getChildMeshes();
                        for (var i = 0; i < meshes.length; i++) {
                            if (meshes[i].skeleton && meshes[i].skeleton.bones.indexOf(t) >= 0) { hit = true; break; }
                        }
                    } catch (e) {}
                }
            });
            if (hit) names.push(g);
        });
        return names.length ? names : scene.animationGroups.slice();
    }

    function ensureModal() {
        if (modalEl) return modalEl;
        if (typeof document === 'undefined') return null;
        modalEl = document.getElementById('model-viewer-modal');
        if (modalEl) return modalEl;
        modalEl = document.createElement('div');
        modalEl.id = 'model-viewer-modal';
        modalEl.className = 'model-viewer-modal';
        modalEl.style.cssText = 'position:fixed;right:12px;top:12px;z-index:50;width:260px;max-width:86vw;background:rgba(20,22,30,.95);color:#eee;border:1px solid #444;border-radius:10px;padding:12px;font-family:sans-serif;font-size:13px;';
        modalEl.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<strong id="mv-title">Xem model</strong>' +
            '<button id="mv-close" style="background:#333;color:#fff;border:1px solid #666;border-radius:6px;padding:2px 8px;cursor:pointer;">✕ Đóng</button>' +
            '</div>' +
            '<div id="mv-info" style="margin:8px 0;color:#bbb;line-height:1.5;"></div>' +
            '<label style="display:block;margin:6px 0;">Animation clip:' +
            '<select id="mv-clip" style="width:100%;margin-top:4px;background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:4px;"></select></label>' +
            '<button id="mv-play" style="width:100%;padding:6px;margin:4px 0;background:#2b6cb0;color:#fff;border:none;border-radius:6px;cursor:pointer;">▶ Phát clip</button>' +
            '<label style="display:flex;gap:6px;align-items:center;margin:6px 0;cursor:pointer;">' +
            '<input type="checkbox" id="mv-wireframe"> Hiển thị Wireframe</label>';
        document.body.appendChild(modalEl);
        document.getElementById('mv-close').addEventListener('click', function () { ModelViewer.close(); });
        document.getElementById('mv-play').addEventListener('click', function () {
            var sel = document.getElementById('mv-clip');
            if (sel && sel.value) ModelViewer.playClip(sel.value);
        });
        document.getElementById('mv-wireframe').addEventListener('change', function (e) {
            ModelViewer.setWireframe(e.target.checked);
        });
        return modalEl;
    }

    function open(objId) {
        var obj = (typeof objId === 'string') ? findObj(objId) : objId;
        if (!obj || !obj.babylonNode) {
            log('Không mở được: không tìm thấy model ' + objId);
            return false;
        }
        var scene = getScene();
        var camera = getCamera();
        currentObj = obj;
        // Lưu camera cũ
        if (camera && typeof camera.target !== 'undefined') {
            savedCamera = {
                target: camera.target.clone ? camera.target.clone() : camera.target,
                radius: camera.radius,
                alpha: camera.alpha,
                beta: camera.beta
            };
        } else {
            savedCamera = null;
        }
        // Focus camera vào model (ArcRotateCamera)
        try {
            var bounds = obj.babylonNode.getHierarchyBoundingVectors(true);
            var center = bounds.min.add(bounds.max).scale(0.5);
            var size = bounds.max.subtract(bounds.min);
            var dist = Math.max(size.x, size.y, size.z) * 2.2 + 1;
            if (camera && typeof camera.setTarget === 'function') {
                camera.setTarget(center);
                if (typeof camera.radius !== 'undefined') camera.radius = dist;
            }
        } catch (e) {
            log('Không focus được camera: ' + e.message);
        }
        // Hiện panel
        var modal = ensureModal();
        if (modal) {
            modal.style.display = 'block';
            var title = document.getElementById('mv-title');
            if (title) title.textContent = 'Xem model: ' + (obj.name || obj.id);
            var info = document.getElementById('mv-info');
            if (info) {
                var mi = (obj.userData && obj.userData.modelInfo) || {};
                var meshes = modelMeshes(obj);
                info.innerHTML = 'Mesh: ' + meshes.length +
                    '<br>Triangles: ' + (mi.triangles != null ? mi.triangles : '—') +
                    '<br>Vertices: ' + (mi.vertices != null ? mi.vertices : '—') +
                    '<br>Animations: ' + listClips(obj).length;
            }
            var sel = document.getElementById('mv-clip');
            if (sel) {
                sel.innerHTML = '';
                listClips(obj).forEach(function (g) {
                    var opt = document.createElement('option');
                    opt.value = g.name;
                    opt.textContent = g.name;
                    sel.appendChild(opt);
                });
                if (!sel.options.length) {
                    var opt2 = document.createElement('option');
                    opt2.value = '';
                    opt2.textContent = '(Không có clip)';
                    sel.appendChild(opt2);
                }
            }
            var wf = document.getElementById('mv-wireframe');
            if (wf) wf.checked = false;
        }
        if (PE.state) PE.state.selected = obj;
        if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
            PE.EventBus.emit('selection-changed', { object: obj });
        }
        log('Đang xem model: ' + (obj.name || obj.id));
        return true;
    }

    function close() {
        // Khôi phục camera cũ
        var camera = getCamera();
        if (camera && savedCamera) {
            try {
                if (typeof camera.setTarget === 'function') camera.setTarget(savedCamera.target);
                if (typeof camera.radius !== 'undefined' && savedCamera.radius != null) camera.radius = savedCamera.radius;
                if (typeof camera.alpha !== 'undefined' && savedCamera.alpha != null) camera.alpha = savedCamera.alpha;
                if (typeof camera.beta !== 'undefined' && savedCamera.beta != null) camera.beta = savedCamera.beta;
            } catch (e) {}
        }
        savedCamera = null;
        // Tắt wireframe
        setWireframe(false);
        if (modalEl) modalEl.style.display = 'none';
        currentObj = null;
        log('Đã đóng ModelViewer, khôi phục camera.');
    }

    function playClip(name) {
        var scene = getScene();
        if (!scene || !scene.animationGroups) return false;
        var found = false;
        scene.animationGroups.forEach(function (g) {
            if (g.name === name) {
                if (typeof g.stop === 'function') g.stop();
                g.play(true);
                found = true;
            } else if (typeof g.stop === 'function') {
                g.stop();
            }
        });
        if (found) log('Đang phát clip: ' + name);
        else log('Không tìm thấy clip: ' + name);
        return found;
    }

    function setWireframe(on) {
        var meshes = modelMeshes(currentObj);
        meshes.forEach(function (m) {
            if (m.material) m.material.wireframe = !!on;
        });
        log(on ? 'Bật wireframe.' : 'Tắt wireframe.');
    }

    var ModelViewer = {
        open: open,
        close: close,
        playClip: playClip,
        setWireframe: setWireframe,
        getCurrent: function () { return currentObj; }
    };
    PE.ModelViewer = ModelViewer;
})();
