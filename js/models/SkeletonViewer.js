'use strict';
/* SkeletonViewer — Liệt kê bone hierarchy thật + highlight bone + toggle hiển thị xương.
 * Nhóm MODELS. Vanilla JS, không import/export. */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    var debugViewer = null;   // BABYLON.Debug.SkeletonViewer (nếu có)
    var boneSpheres = [];     // sphere fallback khi không có Debug.SkeletonViewer
    var highlightSphere = null;
    var bonesVisible = false;
    var currentObj = null;

    function getScene() {
        if (PE.state && PE.state.scene) return PE.state.scene;
        return null;
    }
    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[SkeletonViewer] ' + msg);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function meshesOf(obj) {
        if (!obj || !obj.babylonNode) return [];
        var node = obj.babylonNode;
        if (typeof node.getChildMeshes === 'function') return node.getChildMeshes();
        return [node];
    }
    function skeletonsOf(obj) {
        var out = [];
        meshesOf(obj).forEach(function (m) {
            if (m.skeleton && out.indexOf(m.skeleton) < 0) out.push(m.skeleton);
        });
        return out;
    }
    function modelAnimationGroups(obj) {
        var scene = getScene();
        if (!scene || !scene.animationGroups) return [];
        var meshes = meshesOf(obj);
        var groups = [];
        scene.animationGroups.forEach(function (g) {
            var hit = false;
            (g.targetedAnimations || []).forEach(function (ta) {
                if (meshes.indexOf(ta.target) >= 0) hit = true;
                for (var i = 0; i < meshes.length; i++) {
                    if (meshes[i].skeleton && meshes[i].skeleton.bones.indexOf(ta.target) >= 0) { hit = true; break; }
                }
            });
            if (hit) groups.push(g);
        });
        return groups.length ? groups : scene.animationGroups.slice();
    }

    function boneTreeHtml(bones) {
        // Xây cây theo parentIndex
        var children = {};
        var roots = [];
        bones.forEach(function (b, i) {
            var p = (typeof b.getParent === 'function') ? b.getParent() : null;
            var pi = p ? bones.indexOf(p) : -1;
            if (pi < 0) roots.push(i);
            else {
                children[pi] = children[pi] || [];
                children[pi].push(i);
            }
        });
        function nodeHtml(i, depth) {
            var b = bones[i];
            var html = '<li style="margin-left:' + (depth * 14) + 'px;">' +
                '<button data-bone="' + i + '" style="background:none;border:none;color:#cde;text-align:left;cursor:pointer;padding:2px 4px;">🦴 ' + esc(b.name || ('Bone ' + i)) + '</button>';
            if (children[i]) {
                html += '<ul style="list-style:none;padding:0;margin:0;">';
                children[i].forEach(function (c) { html += nodeHtml(c, depth + 1); });
                html += '</ul>';
            }
            html += '</li>';
            return html;
        }
        var html = '<ul style="list-style:none;padding:0;margin:0;">';
        roots.forEach(function (r) { html += nodeHtml(r, 0); });
        html += '</ul>';
        return html;
    }

    function render(obj, containerEl) {
        currentObj = obj;
        if (!obj) {
            var empty = '<p>Chưa chọn model nào.</p>';
            if (containerEl) containerEl.innerHTML = empty;
            return empty;
        }
        var skels = skeletonsOf(obj);
        var html = '<div class="skeleton-viewer"><h3>Skeleton — ' + esc(obj.name || obj.id) + '</h3>';
        if (!skels.length) {
            html += '<p>Model này không có skeleton.</p>';
            var groups = modelAnimationGroups(obj);
            html += '<button data-act="show-clips">📋 Xem Animation Clips (' + groups.length + ')</button>';
            html += '<div class="sk-clips" style="margin-top:8px;"></div>';
        } else {
            var skel = skels[0];
            var bones = skel.bones || [];
            html += '<p>Skeleton: ' + esc(skel.name || '(không tên)') + ' — ' + bones.length + ' bones</p>';
            html += '<label style="display:flex;gap:6px;align-items:center;margin:6px 0;cursor:pointer;">' +
                '<input type="checkbox" data-act="toggle-bones"> Hiển thị xương trong viewport</label>';
            html += boneTreeHtml(bones);
            html += '<p style="color:#888;font-size:12px;">Bấm vào tên bone để highlight vị trí của nó.</p>';
        }
        html += '</div>';
        if (containerEl) {
            containerEl.innerHTML = html;
            bindEvents(containerEl, obj, skels);
        }
        return html;
    }

    function bindEvents(containerEl, obj, skels) {
        var toggle = containerEl.querySelector('[data-act="toggle-bones"]');
        if (toggle) {
            toggle.addEventListener('change', function (e) { toggleBones(e.target.checked); });
        }
        var clipsBtn = containerEl.querySelector('[data-act="show-clips"]');
        if (clipsBtn) {
            clipsBtn.addEventListener('click', function () {
                var groups = modelAnimationGroups(obj);
                var box = containerEl.querySelector('.sk-clips');
                if (box) {
                    if (!groups.length) { box.innerHTML = '<p>Không có animation clip nào.</p>'; return; }
                    box.innerHTML = '<ul>' + groups.map(function (g) {
                        return '<li>' + esc(g.name) + ' (frame ' + g.from + '–' + g.to + ')</li>';
                    }).join('') + '</ul>';
                }
            });
        }
        var boneBtns = containerEl.querySelectorAll('[data-bone]');
        boneBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var idx = parseInt(btn.getAttribute('data-bone'), 10);
                highlightBone(obj, idx);
            });
        });
    }

    /* Tạo sphere nhỏ tại vị trí tuyệt đối của bone để highlight. */
    function highlightBone(obj, boneIndex) {
        var scene = getScene();
        var skels = skeletonsOf(obj);
        if (!skels.length) return false;
        var bone = skels[0].bones[boneIndex];
        if (!bone) return false;
        if (typeof BABYLON === 'undefined' || !scene) return false;
        if (highlightSphere) { highlightSphere.dispose(); highlightSphere = null; }
        try {
            var pos = bone.getAbsolutePosition ? bone.getAbsolutePosition() : null;
            if (!pos) return false;
            highlightSphere = BABYLON.MeshBuilder.CreateSphere('bone-highlight', { diameter: 0.12 }, scene);
            highlightSphere.position.copyFrom(pos);
            var mat = new BABYLON.StandardMaterial('bone-highlight-mat', scene);
            mat.emissiveColor = new BABYLON.Color3(1, 0.8, 0);
            mat.disableLighting = true;
            highlightSphere.material = mat;
            log('Highlight bone: ' + (bone.name || boneIndex) + ' tại (' + pos.x.toFixed(2) + ', ' + pos.y.toFixed(2) + ', ' + pos.z.toFixed(2) + ')');
            return true;
        } catch (e) {
            log('Highlight bone lỗi: ' + e.message);
            return false;
        }
    }

    function clearBoneSpheres() {
        boneSpheres.forEach(function (s) { try { s.dispose(); } catch (e) {} });
        boneSpheres = [];
        if (highlightSphere) { try { highlightSphere.dispose(); } catch (e) {} highlightSphere = null; }
    }

    function toggleBones(on) {
        bonesVisible = !!on;
        var scene = getScene();
        var obj = currentObj;
        if (!obj) return false;
        var skels = skeletonsOf(obj);
        if (!skels.length) {
            log('Model này không có skeleton nên không hiển thị được xương.');
            return false;
        }
        // Dọn dẹp trạng thái cũ
        if (debugViewer) {
            try { debugViewer.dispose(); } catch (e) {}
            debugViewer = null;
        }
        clearBoneSpheres();
        if (!on) { log('Đã ẩn xương.'); return true; }
        // Ưu tiên BABYLON.Debug.SkeletonViewer
        if (typeof BABYLON !== 'undefined' && BABYLON.Debug && typeof BABYLON.Debug.SkeletonViewer === 'function') {
            try {
                var mesh = meshesOf(obj).filter(function (m) { return m.skeleton; })[0];
                debugViewer = new BABYLON.Debug.SkeletonViewer(skels[0], mesh, scene);
                debugViewer.isEnabled = true;
                log('Đang hiển thị xương bằng SkeletonViewer.');
                return true;
            } catch (e) {
                log('SkeletonViewer lỗi, dùng sphere fallback: ' + e.message);
            }
        }
        // Fallback: vẽ sphere tại mỗi bone
        if (typeof BABYLON === 'undefined' || !scene) return false;
        try {
            var bones = skels[0].bones || [];
            bones.forEach(function (bone) {
                var pos = bone.getAbsolutePosition ? bone.getAbsolutePosition() : null;
                if (!pos) return;
                var s = BABYLON.MeshBuilder.CreateSphere('bone-dot', { diameter: 0.05 }, scene);
                s.position.copyFrom(pos);
                var mat = new BABYLON.StandardMaterial('bone-dot-mat', scene);
                mat.emissiveColor = new BABYLON.Color3(0, 1, 0.6);
                mat.disableLighting = true;
                s.material = mat;
                boneSpheres.push(s);
            });
            log('Đang hiển thị ' + boneSpheres.length + ' bone bằng sphere.');
            return true;
        } catch (e) {
            log('Vẽ sphere bone lỗi: ' + e.message);
            return false;
        }
    }

    var SkeletonViewer = {
        render: render,
        toggleBones: toggleBones,
        highlightBone: highlightBone,
        isBonesVisible: function () { return bonesVisible; }
    };
    PE.SkeletonViewer = SkeletonViewer;
})();
