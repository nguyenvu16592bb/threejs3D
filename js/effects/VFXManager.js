'use strict';
/* VFXManager — Quản lý danh sách hiệu ứng hạt (VFX) đang chạy trong scene.
 * Nhóm EFFECTS/PARTICLES. Vanilla JS, không import/export.
 * Mỗi effect là GameObject type 'particle': babylonNode = emitter mesh ẩn,
 * particleSystem lưu trong userData. */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    var effects = {}; // id -> { obj, ps }

    function getScene() {
        if (PE.state && PE.state.scene) return PE.state.scene;
        return null;
    }
    function emit(name, data) {
        if (PE.EventBus && typeof PE.EventBus.emit === 'function') PE.EventBus.emit(name, data);
    }
    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[VFXManager] ' + msg);
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

    /* Thêm hiệu ứng theo tên preset (fire/smoke/snow/rain/magic/explosion) tại position.
     * Trả về GameObject (type 'particle') hoặc null. */
    function addEffect(presetName, position) {
        if (PE.ParticleEditor && typeof PE.ParticleEditor.createPreset === 'function') {
            var obj = PE.ParticleEditor.createPreset(presetName, position);
            if (!obj) return null;
            var ps = obj.userData && obj.userData.particleSystem;
            if (ps) effects[obj.id] = { obj: obj, ps: ps };
            emit('object-added', { object: obj });
            log('VFXManager: đã thêm effect "' + presetName + '" (' + obj.id + ')');
            return obj;
        }
        log('VFXManager: ParticleEditor chưa sẵn sàng, không tạo được effect.');
        return null;
    }

    /* Xóa effect: stop + dispose đúng cách + gỡ khỏi SceneManager/state. */
    function removeEffect(id) {
        var entry = effects[id];
        var obj = entry ? entry.obj : findObj(id);
        if (entry) {
            try { entry.ps.stop(); } catch (e) {}
            try { entry.ps.dispose(); } catch (e) {}
            delete effects[id];
        } else if (obj && obj.userData && obj.userData.particleSystem) {
            try { obj.userData.particleSystem.stop(); } catch (e) {}
            try { obj.userData.particleSystem.dispose(); } catch (e) {}
        }
        if (obj) {
            if (obj.babylonNode) {
                try { obj.babylonNode.dispose(); } catch (e) {}
            }
            if (PE.SceneManager && typeof PE.SceneManager.removeObject === 'function') {
                PE.SceneManager.removeObject(obj.id);
            } else if (PE.state && Array.isArray(PE.state.objects)) {
                var idx = PE.state.objects.indexOf(obj);
                if (idx >= 0) PE.state.objects.splice(idx, 1);
            }
            if (PE.ParticleEditor && typeof PE.ParticleEditor.disposeSystem === 'function') {
                PE.ParticleEditor.disposeSystem(obj.id);
            }
            emit('hierarchy-changed', { removed: obj.id });
            log('VFXManager: đã xóa effect ' + obj.id);
            return true;
        }
        log('VFXManager: không tìm thấy effect ' + id);
        return false;
    }

    function playAll() {
        var count = 0;
        Object.keys(effects).forEach(function (id) {
            try {
                effects[id].ps.start();
                count++;
            } catch (e) {}
        });
        // Quét thêm các particle object trong state chưa đăng ký
        if (PE.state && Array.isArray(PE.state.objects)) {
            PE.state.objects.forEach(function (obj) {
                if (obj.type === 'particle' && obj.userData && obj.userData.particleSystem && !effects[obj.id]) {
                    effects[obj.id] = { obj: obj, ps: obj.userData.particleSystem };
                    try { obj.userData.particleSystem.start(); count++; } catch (e) {}
                }
            });
        }
        log('VFXManager: đã phát ' + count + ' effect.');
        return count;
    }

    function stopAll() {
        var count = 0;
        Object.keys(effects).forEach(function (id) {
            try {
                effects[id].ps.stop();
                count++;
            } catch (e) {}
        });
        log('VFXManager: đã dừng ' + count + ' effect.');
        return count;
    }

    /* update(dt): đồng bộ registry với state (gom effect mới, dọn effect đã xóa),
     * và xoay emitter của preset 'magic' quanh trục Y cho đẹp. */
    function update(dt) {
        if (PE.state && Array.isArray(PE.state.objects)) {
            PE.state.objects.forEach(function (obj) {
                if (obj.type === 'particle' && obj.userData && obj.userData.particleSystem && !effects[obj.id]) {
                    effects[obj.id] = { obj: obj, ps: obj.userData.particleSystem };
                }
            });
        }
        Object.keys(effects).forEach(function (id) {
            var entry = effects[id];
            // Dọn entry mà object đã biến mất khỏi state
            if (PE.state && Array.isArray(PE.state.objects) && PE.state.objects.indexOf(entry.obj) < 0) {
                delete effects[id];
                return;
            }
            // Magic: xoay emitter chậm quanh Y
            if (entry.obj && entry.obj.userData && entry.obj.userData.preset === 'magic' && entry.obj.babylonNode) {
                try { entry.obj.babylonNode.rotation.y += (dt || 0.016) * 0.6; } catch (e) {}
            }
        });
    }

    function listEffects() {
        return Object.keys(effects).map(function (id) {
            var e = effects[id];
            return {
                id: id,
                name: e.obj ? e.obj.name : id,
                preset: e.obj && e.obj.userData ? e.obj.userData.preset : null,
                isPlaying: !!(e.ps && e.ps.isStarted && e.ps.isStarted())
            };
        });
    }

    function getEffect(id) { return effects[id] || null; }

    var VFXManager = {
        addEffect: addEffect,
        removeEffect: removeEffect,
        playAll: playAll,
        stopAll: stopAll,
        update: update,
        listEffects: listEffects,
        getEffect: getEffect
    };
    PE.VFXManager = VFXManager;
})();
