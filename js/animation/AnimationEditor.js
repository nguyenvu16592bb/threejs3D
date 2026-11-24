'use strict';
/* AnimationEditor — Phát/dừng/tua animation clip thật từ scene.animationGroups.
 * Nhóm ANIMATION. Vanilla JS, không import/export.
 * Nếu object không có clip: procedural fallback (bob / xoay nhẹ) qua
 * scene.registerBeforeRender, ghi rõ 'Procedural preview (không có clip GLB)'. */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    var container = null;
    var currentObj = null;
    var currentGroup = null;
    var speed = 1;
    var playing = false;
    var procedural = null; // { type:'bob'|'spin', node, baseY, t, observer }

    function getScene() {
        if (PE.state && PE.state.scene) return PE.state.scene;
        return null;
    }
    function emit(name, data) {
        if (PE.EventBus && typeof PE.EventBus.emit === 'function') PE.EventBus.emit(name, data);
    }
    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[AnimationEditor] ' + msg);
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

    /* Liệt kê clip thật của object: [{name, duration, group}]. */
    function listClips(obj) {
        var scene = getScene();
        if (!scene || !scene.animationGroups) return [];
        var target = obj || currentObj;
        var meshes = target ? meshesOf(target) : [];
        var out = [];
        scene.animationGroups.forEach(function (g) {
            if (!target) { out.push({ name: g.name, duration: groupDuration(g), group: g }); return; }
            var hit = false;
            (g.targetedAnimations || []).forEach(function (ta) {
                if (meshes.indexOf(ta.target) >= 0) hit = true;
                for (var i = 0; i < meshes.length; i++) {
                    if (meshes[i].skeleton && meshes[i].skeleton.bones.indexOf(ta.target) >= 0) { hit = true; break; }
                }
            });
            if (hit) out.push({ name: g.name, duration: groupDuration(g), group: g });
        });
        // Nếu không group nào chạm trực tiếp vào model, trả toàn bộ group của scene
        if (target && !out.length) {
            scene.animationGroups.forEach(function (g) {
                out.push({ name: g.name, duration: groupDuration(g), group: g });
            });
        }
        return out;
    }
    function groupDuration(g) {
        try {
            var fps = (g.targetedAnimations && g.targetedAnimations[0] && g.targetedAnimations[0].animation)
                ? g.targetedAnimations[0].animation.framePerSecond : 30;
            if (fps && g.to > g.from) return (g.to - g.from) / fps;
        } catch (e) {}
        return 0;
    }

    function stopProcedural() {
        if (!procedural) return;
        var scene = getScene();
        if (scene && procedural.observer) {
            try { scene.unregisterBeforeRender(procedural.observer); } catch (e) {}
            if (scene.onBeforeRenderObservable && procedural.observer) {
                try { scene.onBeforeRenderObservable.remove(procedural.observer); } catch (e) {}
            }
        }
        if (procedural.node && procedural.type === 'bob') {
            try { procedural.node.position.y = procedural.baseY; } catch (e) {}
        }
        procedural = null;
    }

    function startProcedural(type) {
        stopProcedural();
        var scene = getScene();
        var node = currentObj && currentObj.babylonNode;
        if (!scene || !node) return false;
        var baseY = node.position.y;
        var t = 0;
        var fn = function () {
            var dt = scene.getEngine ? scene.getEngine().getDeltaTime() / 1000 : 0.016;
            t += dt * speed;
            if (type === 'bob') {
                node.position.y = baseY + Math.abs(Math.sin(t * 3)) * 0.15;
            } else { // spin
                node.rotation.y += dt * speed * 0.8;
            }
        };
        var observer = null;
        if (scene.onBeforeRenderObservable && typeof scene.onBeforeRenderObservable.add === 'function') {
            observer = scene.onBeforeRenderObservable.add(fn);
        } else if (typeof scene.registerBeforeRender === 'function') {
            scene.registerBeforeRender(fn);
            observer = fn;
        }
        procedural = { type: type, node: node, baseY: baseY, t: t, observer: observer };
        playing = true;
        log('Procedural preview (không có clip GLB) — đang chạy kiểu: ' + type);
        return true;
    }

    function playClip(name) {
        var scene = getScene();
        if (!scene) return false;
        stopProcedural();
        var clips = listClips(currentObj);
        var clip = null;
        for (var i = 0; i < clips.length; i++) {
            if (clips[i].name === name) { clip = clips[i]; break; }
        }
        if (!clip) {
            // Không có clip khớp -> procedural fallback
            log('Không tìm thấy clip "' + name + '" — Procedural preview (không có clip GLB).');
            var type = /walk|run/i.test(name || '') ? 'bob' : 'spin';
            return startProcedural(type);
        }
        // Dừng các group khác của cùng object
        clips.forEach(function (c) {
            if (c.group !== clip.group && typeof c.group.stop === 'function') c.group.stop();
        });
        if (typeof clip.group.stop === 'function') clip.group.stop();
        clip.group.speedRatio = speed;
        clip.group.play(true);
        currentGroup = clip.group;
        playing = true;
        emit('animation-changed', { clip: clip.name, state: 'playing', object: currentObj });
        log('Đang phát clip: ' + clip.name);
        refreshPanel();
        return true;
    }

    function pause() {
        if (currentGroup && typeof currentGroup.pause === 'function') {
            currentGroup.pause();
            playing = false;
            emit('animation-changed', { clip: currentGroup.name, state: 'paused' });
            log('Đã tạm dừng clip: ' + currentGroup.name);
            refreshPanel();
            return true;
        }
        if (procedural) {
            stopProcedural();
            playing = false;
            log('Đã dừng procedural preview.');
            refreshPanel();
            return true;
        }
        return false;
    }

    function stop() {
        if (currentGroup && typeof currentGroup.stop === 'function') currentGroup.stop();
        stopProcedural();
        currentGroup = null;
        playing = false;
        emit('animation-changed', { clip: null, state: 'stopped' });
        log('Đã dừng animation.');
        refreshPanel();
    }

    function setSpeed(v) {
        speed = Math.max(0.1, Math.min(4, Number(v) || 1));
        if (currentGroup) currentGroup.speedRatio = speed;
        log('Tốc độ animation: x' + speed);
        refreshPanel();
    }

    /* Tua tới thời gian t (giây) trong clip đang chạy. */
    function scrub(t) {
        if (currentGroup && typeof currentGroup.goToFrame === 'function') {
            var fps = 30;
            try {
                var ta = currentGroup.targetedAnimations && currentGroup.targetedAnimations[0];
                if (ta && ta.animation) fps = ta.animation.framePerSecond || 30;
            } catch (e) {}
            var frame = currentGroup.from + Math.max(0, t) * fps;
            frame = Math.min(frame, currentGroup.to);
            currentGroup.goToFrame(frame);
            return true;
        }
        return false;
    }

    function setObject(obj) {
        currentObj = obj;
        currentGroup = null;
        stopProcedural();
        playing = false;
        refreshPanel();
    }

    function refreshPanel() {
        if (!container) return;
        var listEl = container.querySelector('[data-anim-list]');
        if (listEl) {
            var clips = listClips(currentObj);
            if (!clips.length) {
                listEl.innerHTML = '<p style="color:#aaa;">Không có clip GLB — sẽ dùng Procedural preview (bob/xoay) khi bấm Phát.</p>';
            } else {
                listEl.innerHTML = clips.map(function (c) {
                    var active = currentGroup && currentGroup.name === c.name;
                    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #333;">' +
                        '<span>' + esc(c.name) + ' <span style="color:#888;">(' + c.duration.toFixed(2) + 's)</span></span>' +
                        '<button data-clip="' + esc(c.name) + '" style="background:' + (active ? '#2b6cb0' : '#333') + ';color:#fff;border:1px solid #555;border-radius:6px;padding:2px 10px;cursor:pointer;">' + (active && playing ? '⏸ Đang phát' : '▶ Phát') + '</button></div>';
                }).join('');
                listEl.querySelectorAll('[data-clip]').forEach(function (btn) {
                    btn.addEventListener('click', function () { playClip(btn.getAttribute('data-clip')); });
                });
            }
        }
        var statusEl = container.querySelector('[data-anim-status]');
        if (statusEl) {
            statusEl.textContent = currentGroup
                ? ('Clip: ' + currentGroup.name + ' — ' + (playing ? 'Đang phát' : 'Tạm dừng') + ' — Tốc độ x' + speed)
                : (procedural ? ('Procedural preview (' + procedural.type + ') — Đang phát — Tốc độ x' + speed)
                              : 'Chưa phát clip nào.');
        }
        var speedEl = container.querySelector('[data-anim-speed]');
        if (speedEl && Number(speedEl.value) !== speed) speedEl.value = String(speed);
        var speedVal = container.querySelector('[data-anim-speed-val]');
        if (speedVal) speedVal.textContent = 'x' + speed;
    }

    function init(containerId) {
        containerId = containerId || 'animation-panel';
        if (typeof document === 'undefined') return false;
        container = document.getElementById(containerId);
        if (!container) {
            log('Không tìm thấy container #' + containerId + ' — AnimationEditor chưa gắn UI.');
            return false;
        }
        container.innerHTML =
            '<h3 style="margin:0 0 8px;">🎬 Animation</h3>' +
            '<div data-anim-list></div>' +
            '<div style="display:flex;gap:6px;margin:10px 0;">' +
            '<button data-act="pause" style="flex:1;padding:6px;background:#333;color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer;">⏸ Tạm dừng</button>' +
            '<button data-act="stop" style="flex:1;padding:6px;background:#333;color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer;">⏹ Dừng</button>' +
            '</div>' +
            '<label style="display:block;font-size:13px;">Tốc độ: <span data-anim-speed-val>x1</span>' +
            '<input type="range" data-anim-speed min="0.1" max="4" step="0.1" value="1" style="width:100%;"></label>' +
            '<p data-anim-status style="color:#aaa;font-size:12px;margin:8px 0 0;">Chưa phát clip nào.</p>';
        container.querySelector('[data-act="pause"]').addEventListener('click', pause);
        container.querySelector('[data-act="stop"]').addEventListener('click', stop);
        container.querySelector('[data-anim-speed]').addEventListener('input', function (e) {
            setSpeed(parseFloat(e.target.value));
        });
        // Theo dõi object được chọn
        if (PE.EventBus && typeof PE.EventBus.on === 'function') {
            PE.EventBus.on('selection-changed', function (data) {
                if (data && data.object) setObject(data.object);
            });
        }
        if (PE.state && PE.state.selected) setObject(PE.state.selected);
        refreshPanel();
        log('AnimationEditor đã khởi tạo (#' + containerId + ').');
        return true;
    }

    var AnimationEditor = {
        init: init,
        listClips: listClips,
        playClip: playClip,
        pause: pause,
        stop: stop,
        setSpeed: setSpeed,
        scrub: scrub,
        setObject: setObject,
        isPlaying: function () { return playing; },
        getCurrentGroup: function () { return currentGroup; }
    };
    PE.AnimationEditor = AnimationEditor;
})();
