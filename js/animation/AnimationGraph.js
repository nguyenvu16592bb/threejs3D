'use strict';
/* AnimationGraph — Đồ thị trạng thái animation dạng danh sách (không canvas phức tạp).
 * Nhóm ANIMATION. Vanilla JS, không import/export.
 * Dữ liệu graph được lưu thật vào obj.userData.animGraph và StateMachine dùng. */
(function () {
    window.PixiEngine = window.PixiEngine || {};
    var PE = window.PixiEngine;

    var DEFAULT_STATES = ['Idle', 'Walk', 'Run', 'Attack', 'Jump', 'Death'];

    function log(msg) {
        if (typeof console !== 'undefined' && console.log) console.log('[AnimationGraph] ' + msg);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
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

    /* Graph mặc định: 6 state + các chuyển đổi thường gặp. */
    function defaultGraph() {
        return {
            states: DEFAULT_STATES.map(function (name, i) {
                return { id: name.toLowerCase(), name: name, clip: null, isDefault: i === 0 };
            }),
            edges: [
                { from: 'idle', to: 'walk', condition: 'speed > 0.1' },
                { from: 'walk', to: 'run', condition: 'speed > 0.5' },
                { from: 'run', to: 'walk', condition: 'speed <= 0.5' },
                { from: 'walk', to: 'idle', condition: 'speed <= 0.1' },
                { from: 'run', to: 'idle', condition: 'speed <= 0.1' },
                { from: 'idle', to: 'attack', condition: 'attack == true' },
                { from: 'walk', to: 'attack', condition: 'attack == true' },
                { from: 'attack', to: 'idle', condition: 'attack == false' },
                { from: 'idle', to: 'jump', condition: 'jump == true' },
                { from: 'jump', to: 'idle', condition: 'grounded == true' },
                { from: 'idle', to: 'death', condition: 'health <= 0' },
                { from: 'walk', to: 'death', condition: 'health <= 0' },
                { from: 'run', to: 'death', condition: 'health <= 0' }
            ]
        };
    }

    function getGraph(obj) {
        if (!obj) return defaultGraph();
        obj.userData = obj.userData || {};
        if (!obj.userData.animGraph) obj.userData.animGraph = defaultGraph();
        return obj.userData.animGraph;
    }

    /* Thêm node state. state: {id?, name, clip?} hoặc chuỗi tên. */
    function addNode(state, objId) {
        var obj = objId ? findObj(objId) : (PE.state && PE.state.selected);
        var graph = getGraph(obj);
        var node = (typeof state === 'string') ? { name: state } : (state || {});
        node.id = node.id || String(node.name || 'state').toLowerCase().replace(/\s+/g, '_');
        node.name = node.name || node.id;
        node.clip = node.clip || null;
        var exists = graph.states.some(function (s) { return s.id === node.id; });
        if (exists) {
            log('State "' + node.name + '" đã có trong graph.');
            return node;
        }
        graph.states.push(node);
        if (obj) {
            obj.userData.animGraph = graph;
            if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
                PE.EventBus.emit('animation-changed', { object: obj, graph: graph });
            }
        }
        log('Đã thêm state: ' + node.name);
        return node;
    }

    /* Nối 2 state với điều kiện chuyển đổi, vd connect('idle','walk','speed>0.5'). */
    function connect(from, to, condition, objId) {
        var obj = objId ? findObj(objId) : (PE.state && PE.state.selected);
        var graph = getGraph(obj);
        var fromId = String(from).toLowerCase();
        var toId = String(to).toLowerCase();
        var hasFrom = graph.states.some(function (s) { return s.id === fromId; });
        var hasTo = graph.states.some(function (s) { return s.id === toId; });
        if (!hasFrom || !hasTo) {
            log('Không nối được: state "' + from + '" hoặc "' + to + '" chưa có trong graph.');
            return null;
        }
        var edge = { from: fromId, to: toId, condition: condition || 'true' };
        var dup = graph.edges.some(function (e) {
            return e.from === edge.from && e.to === edge.to && e.condition === edge.condition;
        });
        if (dup) { log('Edge đã tồn tại.'); return edge; }
        graph.edges.push(edge);
        if (obj) {
            obj.userData.animGraph = graph;
            if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
                PE.EventBus.emit('animation-changed', { object: obj, graph: graph });
            }
        }
        log('Đã nối: ' + fromId + ' → ' + toId + ' (' + edge.condition + ')');
        return edge;
    }

    function removeEdge(from, to, objId) {
        var obj = objId ? findObj(objId) : (PE.state && PE.state.selected);
        var graph = getGraph(obj);
        var before = graph.edges.length;
        graph.edges = graph.edges.filter(function (e) {
            return !(e.from === String(from).toLowerCase() && e.to === String(to).toLowerCase());
        });
        if (obj) obj.userData.animGraph = graph;
        return before - graph.edges.length;
    }

    function stateName(graph, id) {
        var s = graph.states.filter(function (x) { return x.id === id; })[0];
        return s ? s.name : id;
    }

    /* Render dạng danh sách node + edge có thể click chọn. */
    function render(containerEl, objId) {
        var obj = objId ? findObj(objId) : (PE.state && PE.state.selected);
        var graph = getGraph(obj);
        var html = '<div class="anim-graph">';
        html += '<h3>🕸 Animation Graph' + (obj ? ' — ' + esc(obj.name || obj.id) : '') + '</h3>';
        html += '<p style="color:#aaa;font-size:12px;">Bấm vào state để xem các chuyển đổi đi ra từ nó. Dữ liệu lưu trong <code>obj.userData.animGraph</code>, StateMachine dùng để chuyển clip.</p>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;">';
        graph.states.forEach(function (s) {
            html += '<button data-state="' + esc(s.id) + '" style="padding:6px 12px;background:#2b3a55;color:#fff;border:1px solid #4a6fa5;border-radius:16px;cursor:pointer;">' +
                esc(s.name) + (s.clip ? ' <span style="color:#9fd;">[' + esc(s.clip) + ']</span>' : '') + (s.isDefault ? ' ★' : '') + '</button>';
        });
        html += '</div>';
        html += '<div data-graph-detail style="margin:8px 0;color:#ddd;font-size:13px;">Chọn một state để xem chuyển đổi.</div>';
        html += '<h4>Chuyển đổi (' + graph.edges.length + ')</h4>';
        html += '<ul style="font-size:13px;line-height:1.8;padding-left:18px;">';
        graph.edges.forEach(function (e) {
            html += '<li><button data-edge-from="' + esc(e.from) + '" data-edge-to="' + esc(e.to) + '" style="background:none;border:none;color:#cde;cursor:pointer;padding:0;text-decoration:underline;">' +
                esc(stateName(graph, e.from)) + ' → ' + esc(stateName(graph, e.to)) + '</button>' +
                ' <span style="color:#f6c453;">khi ' + esc(e.condition) + '</span></li>';
        });
        html += '</ul>';
        // Form thêm edge nhanh
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">' +
            '<select data-new-from>' + graph.states.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('') + '</select>' +
            '<span>→</span>' +
            '<select data-new-to>' + graph.states.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('') + '</select>' +
            '<input data-new-cond type="text" placeholder="Điều kiện, vd: speed>0.5" style="flex:1;min-width:140px;background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:4px;">' +
            '<button data-act="add-edge" style="background:#2b6cb0;color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;">+ Thêm chuyển đổi</button>' +
            '</div>';
        html += '</div>';
        if (containerEl) {
            containerEl.innerHTML = html;
            containerEl.querySelectorAll('[data-state]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = btn.getAttribute('data-state');
                    var detail = containerEl.querySelector('[data-graph-detail]');
                    var outs = graph.edges.filter(function (e) { return e.from === id; });
                    var ins = graph.edges.filter(function (e) { return e.to === id; });
                    if (detail) {
                        detail.innerHTML = '<strong>' + esc(stateName(graph, id)) + '</strong><br>' +
                            'Đi ra: ' + (outs.length ? outs.map(function (e) { return esc(stateName(graph, e.to)) + ' (' + esc(e.condition) + ')'; }).join(', ') : '—') +
                            '<br>Đi vào: ' + (ins.length ? ins.map(function (e) { return esc(stateName(graph, e.from)) + ' (' + esc(e.condition) + ')'; }).join(', ') : '—');
                    }
                });
            });
            containerEl.querySelectorAll('[data-edge-from]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var from = btn.getAttribute('data-edge-from');
                    var to = btn.getAttribute('data-edge-to');
                    if (PE.StateMachine && PE.state && PE.state.selected) {
                        log('Chọn chuyển đổi ' + from + ' → ' + to + ' (xem trong StateMachine).');
                    }
                    var detail = containerEl.querySelector('[data-graph-detail]');
                    if (detail) detail.innerHTML = '<strong>' + esc(stateName(graph, from)) + ' → ' + esc(stateName(graph, to)) + '</strong>';
                });
            });
            var addBtn = containerEl.querySelector('[data-act="add-edge"]');
            if (addBtn) {
                addBtn.addEventListener('click', function () {
                    var from = containerEl.querySelector('[data-new-from]').value;
                    var to = containerEl.querySelector('[data-new-to]').value;
                    var cond = containerEl.querySelector('[data-new-cond]').value || 'true';
                    connect(from, to, cond, obj ? obj.id : null);
                    render(containerEl, obj ? obj.id : null);
                });
            }
        }
        return html;
    }

    var AnimationGraph = {
        defaultStates: DEFAULT_STATES.slice(),
        defaultGraph: defaultGraph,
        getGraph: getGraph,
        addNode: addNode,
        connect: connect,
        removeEdge: removeEdge,
        render: render
    };
    PE.AnimationGraph = AnimationGraph;
})();
