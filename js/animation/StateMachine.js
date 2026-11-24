'use strict';
/* StateMachine — State machine thật: mỗi state map tới 1 animation clip,
 * setState thì crossfade (dừng group cũ, phát group mới).
 * Nhóm ANIMATION. Vanilla JS, không import/export. */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    var machines = {}; // objId -> sm

    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[StateMachine] ' + msg);
    }
    function emit(name, data) {
        if (PE.EventBus && typeof PE.EventBus.emit === 'function') PE.EventBus.emit(name, data);
    }
    function getScene() {
        if (PE.state && PE.state.scene) return PE.state.scene;
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
    function meshesOf(obj) {
        if (!obj || !obj.babylonNode) return [];
        var node = obj.babylonNode;
        if (typeof node.getChildMeshes === 'function') return node.getChildMeshes();
        return [node];
    }

    /* Tự map clip có sẵn vào state theo tên (tìm substring, không phân biệt hoa thường). */
    function autoMapClips(obj) {
        var map = {};
        var scene = getScene();
        if (!scene || !scene.animationGroups) return map;
        var meshes = meshesOf(obj);
        var clipNames = [];
        scene.animationGroups.forEach(function (g) {
            var hit = false;
            if (!meshes.length) hit = true;
            (g.targetedAnimations || []).forEach(function (ta) {
                if (meshes.indexOf(ta.target) >= 0) hit = true;
                for (var i = 0; i < meshes.length; i++) {
                    if (meshes[i].skeleton && meshes[i].skeleton.bones.indexOf(ta.target) >= 0) { hit = true; break; }
                }
            });
            if (hit) clipNames.push(g.name);
        });
        if (!clipNames.length) {
            scene.animationGroups.forEach(function (g) { clipNames.push(g.name); });
        }
        var patterns = {
            idle: ['idle'],
            walk: ['walk', 'walking'],
            run: ['run', 'running'],
            attack: ['attack', 'punch', 'hit', 'slash'],
            jump: ['jump'],
            death: ['death', 'die', 'dead']
        };
        Object.keys(patterns).forEach(function (state) {
            for (var i = 0; i < clipNames.length; i++) {
                var lower = clipNames[i].toLowerCase();
                var found = patterns[state].some(function (p) { return lower.indexOf(p) >= 0; });
                if (found) { map[state] = clipNames[i]; break; }
            }
        });
        return map;
    }

    function findGroupByName(name) {
        var scene = getScene();
        if (!scene || !scene.animationGroups) return null;
        for (var i = 0; i < scene.animationGroups.length; i++) {
            if (scene.animationGroups[i].name === name) return scene.animationGroups[i];
        }
        return null;
    }

    /* Procedural fallback theo state khi không có clip khớp. */
    var procState = null; // { sm, observer, baseY, t, type }
    function stopProcedural(sm) {
        if (!procState || (sm && procState.sm !== sm)) return;
        var scene = getScene();
        if (scene && procState.observer) {
            try { scene.onBeforeRenderObservable.remove(procState.observer); } catch (e) {}
            try { scene.unregisterBeforeRender(procState.observer); } catch (e) {}
        }
        if (procState.node && procState.type === 'bob') {
            try { procState.node.position.y = procState.baseY; } catch (e) {}
        }
        procState = null;
    }
    function startProcedural(sm, stateName) {
        stopProcedural(sm);
        var scene = getScene();
        var obj = findObj(sm.objId);
        var node = obj && obj.babylonNode;
        if (!scene || !node) return false;
        var type = 'bob';
        if (stateName === 'attack') type = 'spin';
        if (stateName === 'death') type = 'fall';
        if (stateName === 'idle') type = 'breathe';
        var baseY = node.position.y;
        var t = 0;
        var fn = function () {
            var dt = scene.getEngine ? scene.getEngine().getDeltaTime() / 1000 : 0.016;
            t += dt;
            if (type === 'bob') {
                node.position.y = baseY + Math.abs(Math.sin(t * 6)) * 0.12;
            } else if (type === 'breathe') {
                node.position.y = baseY + Math.sin(t * 2) * 0.02;
            } else if (type === 'spin') {
                node.rotation.y += dt * 3;
            } else if (type === 'fall') {
                node.rotation.x = Math.min(node.rotation.x + dt * 2, Math.PI / 2);
            }
        };
        var observer = null;
        if (scene.onBeforeRenderObservable && typeof scene.onBeforeRenderObservable.add === 'function') {
            observer = scene.onBeforeRenderObservable.add(fn);
        } else if (typeof scene.registerBeforeRender === 'function') {
            scene.registerBeforeRender(fn);
            observer = fn;
        }
        procState = { sm: sm, observer: observer, baseY: baseY, t: t, type: type, node: node };
        log('State "' + stateName + '" không có clip khớp — dùng procedural ' + type + '.');
        return true;
    }

    /* Tạo state machine cho object. states: { idle:'Idle', walk:'Walk', ... } (tên clip).
     * Nếu không truyền states thì tự map từ clip có sẵn (autoMapClips). */
    function create(objId, states) {
        var obj = (typeof objId === 'string') ? findObj(objId) : objId;
        if (!obj) {
            log('Không tạo được StateMachine: không tìm thấy object ' + objId);
            return null;
        }
        var map = states || autoMapClips(obj);
        // Chuẩn hóa key về lowercase
        var norm = {};
        Object.keys(map).forEach(function (k) { norm[k.toLowerCase()] = map[k]; });
        var sm = {
            objId: obj.id,
            states: norm,
            current: null,
            currentGroup: null,
            createdAt: Date.now()
        };
        machines[obj.id] = sm;
        obj.userData = obj.userData || {};
        obj.userData.stateMachine = sm;
        // Gắn clip đã map vào graph (nếu có)
        if (PE.AnimationGraph && typeof PE.AnimationGraph.getGraph === 'function') {
            var graph = PE.AnimationGraph.getGraph(obj);
            graph.states.forEach(function (s) {
                if (norm[s.id]) s.clip = norm[s.id];
            });
            obj.userData.animGraph = graph;
        }
        log('Đã tạo StateMachine cho ' + (obj.name || obj.id) + ' — states: ' + JSON.stringify(norm));
        return sm;
    }

    /* Crossfade: dừng group cũ, phát group mới (loop). */
    function setState(sm, name) {
        if (!sm) return false;
        if (typeof sm === 'string') sm = machines[sm];
        if (!sm) return false;
        var key = String(name).toLowerCase();
        if (sm.current === key) return true;
        var prev = sm.current;
        sm.current = key;
        // Dừng procedural cũ
        stopProcedural(sm);
        // Dừng group cũ
        if (sm.currentGroup && typeof sm.currentGroup.stop === 'function') {
            try { sm.currentGroup.stop(); } catch (e) {}
        }
        sm.currentGroup = null;
        var clipName = sm.states[key];
        if (clipName) {
            var group = findGroupByName(clipName);
            if (group) {
                group.speedRatio = 1;
                group.play(true);
                sm.currentGroup = group;
                log('State: ' + (prev || '—') + ' → ' + key + ' (clip: ' + clipName + ')');
            } else {
                log('State "' + key + '" map tới clip "' + clipName + '" nhưng không tìm thấy group — dùng procedural.');
                startProcedural(sm, key);
            }
        } else {
            log('State "' + key + '" chưa map clip nào — dùng procedural fallback.');
            startProcedural(sm, key);
        }
        emit('animation-changed', { state: key, prev: prev, object: findObj(sm.objId) });
        return true;
    }

    /* update(dt): kiểm tra điều kiện chuyển đổi từ graph (nếu có params).
     * params: { speed, attack, jump, grounded, health } */
    function update(dt, params) {
        params = params || {};
        Object.keys(machines).forEach(function (objId) {
            var sm = machines[objId];
            var obj = findObj(objId);
            if (!obj || !obj.userData || !obj.userData.animGraph) return;
            var graph = obj.userData.animGraph;
            var current = sm.current || 'idle';
            var edges = graph.edges.filter(function (e) { return e.from === current; });
            for (var i = 0; i < edges.length; i++) {
                if (evalCondition(edges[i].condition, params)) {
                    setState(sm, edges[i].to);
                    break;
                }
            }
        });
    }

    /* Đánh giá điều kiện đơn giản dạng 'speed>0.5', 'attack==true', 'health<=0'. */
    function evalCondition(cond, params) {
        if (!cond) return false;
        var c = String(cond).trim();
        if (c === 'true') return true;
        if (c === 'false') return false;
        var m = c.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
        if (!m) return false;
        var key = m[1], op = m[2], raw = m[3].trim();
        var val = params[key];
        if (val === undefined) return false;
        var rhs;
        if (raw === 'true') rhs = true;
        else if (raw === 'false') rhs = false;
        else rhs = parseFloat(raw);
        if (op === '==') return val == rhs;
        if (op === '!=') return val != rhs;
        if (op === '>') return val > rhs;
        if (op === '<') return val < rhs;
        if (op === '>=') return val >= rhs;
        if (op === '<=') return val <= rhs;
        return false;
    }

    function getCurrentState(sm) {
        if (typeof sm === 'string') sm = machines[sm];
        if (!sm) return null;
        return sm.current;
    }
    function getMachine(objId) {
        return machines[objId] || null;
    }

    var StateMachine = {
        create: create,
        setState: setState,
        update: update,
        getCurrentState: getCurrentState,
        getMachine: getMachine,
        autoMapClips: autoMapClips
    };
    PE.StateMachine = StateMachine;
})();
