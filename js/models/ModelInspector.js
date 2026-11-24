'use strict';
/* ModelInspector — Hiện metadata thật của model + các nút thao tác.
 * Nhóm MODELS. Vanilla JS, không import/export.
 * render(obj, containerEl): trả về HTML string, đồng thời gắn DOM + sự kiện nút. */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    function getScene() {
        if (PE.state && PE.state.scene) return PE.state.scene;
        return null;
    }
    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[ModelInspector] ' + msg);
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
    function uniqueMaterials(meshes) {
        var seen = [], names = [];
        meshes.forEach(function (m) {
            if (m.material && seen.indexOf(m.material) < 0) {
                seen.push(m.material);
                names.push(m.material.name || '(không tên)');
            }
        });
        return names;
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
    function skeletonsOf(obj) {
        var out = [];
        meshesOf(obj).forEach(function (m) {
            if (m.skeleton && out.indexOf(m.skeleton) < 0) out.push(m.skeleton);
        });
        return out;
    }

    /* Tính metadata thật từ babylonNode (fallback khi userData.modelInfo thiếu). */
    function computeStats(obj) {
        var meshes = meshesOf(obj);
        var triangles = 0, vertices = 0;
        meshes.forEach(function (m) {
            try { vertices += m.getTotalVertices(); } catch (e) {}
            try { triangles += Math.floor(m.getTotalIndices() / 3); } catch (e) {}
        });
        var bbox = null;
        try {
            if (obj.babylonNode && typeof obj.babylonNode.getHierarchyBoundingVectors === 'function') {
                var b = obj.babylonNode.getHierarchyBoundingVectors(true);
                bbox = {
                    min: { x: b.min.x.toFixed(2), y: b.min.y.toFixed(2), z: b.min.z.toFixed(2) },
                    max: { x: b.max.x.toFixed(2), y: b.max.y.toFixed(2), z: b.max.z.toFixed(2) },
                    size: { x: (b.max.x - b.min.x).toFixed(2), y: (b.max.y - b.min.y).toFixed(2), z: (b.max.z - b.min.z).toFixed(2) }
                };
            }
        } catch (e) {}
        var groups = modelAnimationGroups(obj);
        var skels = skeletonsOf(obj);
        return {
            meshCount: meshes.length,
            triangles: triangles,
            vertices: vertices,
            materials: uniqueMaterials(meshes),
            animations: groups.map(function (g) { return { name: g.name, from: g.from, to: g.to }; }),
            animationGroups: groups,
            skeletons: skels.map(function (s) { return { name: s.name || '(không tên)', bones: s.bones ? s.bones.length : 0 }; }),
            bbox: bbox
        };
    }

    function render(obj, containerEl) {
        if (!obj) return '<p>Chưa chọn model nào.</p>';
        var stats = computeStats(obj);
        var mi = (obj.userData && obj.userData.modelInfo) || {};
        var html = '';
        html += '<div class="model-inspector">';
        html += '<h3>' + esc(obj.name || obj.id) + '</h3>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
        html += '<tr><td>Loại</td><td>' + esc(obj.type || 'model') + '</td></tr>';
        html += '<tr><td>Nguồn</td><td>' + esc(mi.source || '—') + (mi.url ? '<br><span style="word-break:break-all;color:#888;">' + esc(mi.url) + '</span>' : '') + '</td></tr>';
        html += '<tr><td>Mesh</td><td>' + stats.meshCount + '</td></tr>';
        html += '<tr><td>Triangles</td><td>' + stats.triangles.toLocaleString('en-US') + '</td></tr>';
        html += '<tr><td>Vertices</td><td>' + stats.vertices.toLocaleString('en-US') + '</td></tr>';
        html += '<tr><td>Materials (' + stats.materials.length + ')</td><td>' + esc(stats.materials.join(', ') || '—') + '</td></tr>';
        html += '<tr><td>Animations (' + stats.animations.length + ')</td><td>' + esc(stats.animations.map(function (a) { return a.name; }).join(', ') || '—') + '</td></tr>';
        html += '<tr><td>Skeleton</td><td>' + (stats.skeletons.length ? stats.skeletons.map(function (s) { return esc(s.name) + ' (' + s.bones + ' bones)'; }).join(', ') : 'Không có') + '</td></tr>';
        if (stats.bbox) {
            html += '<tr><td>Bounding box</td><td>Min (' + stats.bbox.min.x + ', ' + stats.bbox.min.y + ', ' + stats.bbox.min.z + ')<br>Max (' + stats.bbox.max.x + ', ' + stats.bbox.max.y + ', ' + stats.bbox.max.z + ')<br>Kích thước: ' + stats.bbox.size.x + ' × ' + stats.bbox.size.y + ' × ' + stats.bbox.size.z + ' m</td></tr>';
        }
        html += '</table>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">';
        html += '<button data-act="focus">🎯 Focus</button>';
        html += '<button data-act="play">▶ Phát animation</button>';
        html += '<button data-act="export">⬇ Export GLB</button>';
        html += '<button data-act="delete" style="background:#7a2e2e;color:#fff;">🗑 Xóa</button>';
        html += '</div>';
        html += '<div class="mi-msg" style="margin-top:8px;color:#bbb;font-size:12px;"></div>';
        html += '</div>';
        if (containerEl) {
            containerEl.innerHTML = html;
            bindButtons(containerEl, obj, stats);
        }
        return html;
    }

    function msg(containerEl, text) {
        var el = containerEl.querySelector('.mi-msg');
        if (el) el.textContent = text;
        log(text);
    }

    function bindButtons(containerEl, obj, stats) {
        var buttons = containerEl.querySelectorAll('button[data-act]');
        buttons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var act = btn.getAttribute('data-act');
                if (act === 'focus') {
                    if (PE.ModelViewer && typeof PE.ModelViewer.open === 'function') {
                        PE.ModelViewer.open(obj.id);
                        msg(containerEl, 'Đã focus camera vào model.');
                    } else {
                        msg(containerEl, 'ModelViewer chưa sẵn sàng.');
                    }
                } else if (act === 'play') {
                    if (stats.animationGroups.length) {
                        var g = stats.animationGroups[0];
                        if (typeof g.stop === 'function') g.stop();
                        g.play(true);
                        msg(containerEl, 'Đang phát animation: ' + g.name);
                    } else if (PE.AnimationEditor && typeof PE.AnimationEditor.playClip === 'function') {
                        PE.AnimationEditor.playClip(obj.name);
                        msg(containerEl, 'Không có clip GLB — dùng procedural preview.');
                    } else {
                        msg(containerEl, 'Model này không có animation clip.');
                    }
                } else if (act === 'export') {
                    exportGLB(obj, containerEl);
                } else if (act === 'delete') {
                    if (PE.SceneManager && typeof PE.SceneManager.removeObject === 'function') {
                        PE.SceneManager.removeObject(obj.id);
                        msg(containerEl, 'Đã xóa model: ' + (obj.name || obj.id));
                        if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
                            PE.EventBus.emit('hierarchy-changed', { removed: obj.id });
                        }
                    } else if (obj.babylonNode && typeof obj.babylonNode.dispose === 'function') {
                        obj.babylonNode.dispose();
                        msg(containerEl, 'Đã xóa mesh khỏi scene (SceneManager chưa có).');
                    } else {
                        msg(containerEl, 'Không xóa được: SceneManager chưa sẵn sàng.');
                    }
                }
            });
        });
    }

    function exportGLB(obj, containerEl) {
        var scene = getScene();
        if (typeof BABYLON === 'undefined' || !BABYLON.GLTF2Export || typeof BABYLON.GLTF2Export.GLBAsync !== 'function') {
            msg(containerEl, 'Export GLB: Planned — trình export GLB (BABYLON.GLTF2Export) chưa được nạp.');
            return;
        }
        if (!scene) { msg(containerEl, 'Chưa có scene để export.'); return; }
        msg(containerEl, 'Đang export GLB...');
        BABYLON.GLTF2Export.GLBAsync(scene, (obj.name || 'model'), { shouldExportNode: function (node) { return node === obj.babylonNode || (node.getAncestors && node.getAncestors().indexOf(obj.babylonNode) >= 0); } })
            .then(function (glb) {
                glb.downloadFiles();
                msg(containerEl, 'Đã export GLB: ' + (obj.name || 'model') + '.glb');
            })
            .catch(function (err) {
                msg(containerEl, 'Export GLB lỗi: ' + (err && err.message || err));
            });
    }

    var ModelInspector = {
        render: render,
        computeStats: computeStats
    };
    PE.ModelInspector = ModelInspector;
})();
