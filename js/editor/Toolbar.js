'use strict';
/* PixiJS 3D Game Engine Editor — Toolbar (nhóm EDITOR)
 * Thanh công cụ viewport + panel cài đặt brush. Mọi nút gọi hàm thật của Core/
 * TransformGizmo/TerrainBrush/GameRuntime; module nào chưa sẵn thì nút bị
 * disable + title 'Planned', không giả vờ chạy.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var PE = window.PixiEngine;

  var initialized = false;
  var toolbarEl = null;
  var settingsEl = null;
  var currentTool = 'select';
  var snapEnabled = false;
  var snapSize = 0.5;
  var gridVisible = true;

  function getState() { return (PE.state && typeof PE.state === 'object') ? PE.state : null; }
  function emit(ev, data) {
    if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
      try { PE.EventBus.emit(ev, data); } catch (e) { console.warn('[Toolbar] emit lỗi:', e); }
    }
  }
  function has(obj, fn) { return !!(obj && typeof obj[fn] === 'function'); }

  function makeBtn(label, title, onClick, opts) {
    opts = opts || {};
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'toolbar-btn' + (opts.active ? ' is-active' : '');
    b.textContent = label;
    b.title = title || label;
    b.setAttribute('aria-label', title || label);
    if (opts.disabled) {
      b.disabled = true;
      b.classList.add('is-planned');
      b.title = (title || label) + ' — Planned (module chưa sẵn)';
    }
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function setGizmoTool(tool) {
    currentTool = tool;
    if (tool === 'select') {
      if (PE.TransformGizmo && typeof PE.TransformGizmo.detach === 'function') {
        try { PE.TransformGizmo.detach(); } catch (e) { /* ignore */ }
      }
    } else if (has(PE.TransformGizmo, 'setMode')) {
      try { PE.TransformGizmo.setMode(tool); } catch (e) { console.warn('[Toolbar] setMode lỗi:', e); }
    }
    refreshActiveStates();
  }

  function refreshActiveStates() {
    if (!toolbarEl) return;
    var btns = toolbarEl.querySelectorAll('[data-tool]');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('is-active', b.dataset.tool === currentTool);
    });
  }

  function addObjectDef(def) {
    if (has(PE.SceneManager, 'addObject')) {
      try { PE.SceneManager.addObject(def); return; } catch (e) { console.warn('[Toolbar] addObject lỗi:', e); }
    }
    var s = getState();
    if (!s) { console.warn('[Toolbar] Chưa có state — không thêm được object.'); return; }
    s.objects = Array.isArray(s.objects) ? s.objects : [];
    var obj = {
      id: 'obj_' + Date.now(), name: def.name || 'Object', type: def.type || 'empty',
      parentId: def.parentId || null, children: [],
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      babylonNode: null, components: [], visible: true, active: true, tag: '', layer: 0, static: false
    };
    s.objects.push(obj);
    emit('object-added', { id: obj.id, object: obj });
    emit('hierarchy-changed', { id: obj.id });
  }

  function buildToolbar() {
    var wrap = document.getElementById('viewport-wrap');
    toolbarEl = document.getElementById('viewport-toolbar');
    if (!toolbarEl) {
      if (!wrap) {
        console.warn('[Toolbar] Không tìm thấy #viewport-wrap và #viewport-toolbar — chưa tạo được thanh công cụ.');
        return;
      }
      toolbarEl = document.createElement('div');
      toolbarEl.id = 'viewport-toolbar';
      toolbarEl.className = 'viewport-toolbar';
      wrap.appendChild(toolbarEl);
    }
    toolbarEl.innerHTML = '';

    var gizmoReady = has(PE.TransformGizmo, 'setMode');
    var tools = [
      { id: 'select', label: '🖱️ Chọn', title: 'Chọn object (V)' },
      { id: 'move', label: '↔️ Di chuyển', title: 'Gizmo di chuyển (W)' },
      { id: 'rotate', label: '🔄 Xoay', title: 'Gizmo xoay (E)' },
      { id: 'scale', label: '⤢ Tỉ lệ', title: 'Gizmo tỉ lệ (R)' }
    ];
    tools.forEach(function (t) {
      var b = makeBtn(t.label, t.title, function () { setGizmoTool(t.id); },
        { disabled: t.id !== 'select' && !gizmoReady, active: currentTool === t.id });
      b.dataset.tool = t.id;
      toolbarEl.appendChild(b);
    });

    toolbarEl.appendChild(separator());

    // Shading.
    var shading = document.createElement('select');
    shading.className = 'toolbar-select';
    shading.setAttribute('aria-label', 'Chế độ hiển thị (Shading)');
    [['shaded', '🎨 Shaded'], ['wireframe', '🕸️ Wireframe'], ['textured', '🖼️ Textured']].forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt[0]; o.textContent = opt[1];
      shading.appendChild(o);
    });
    shading.disabled = !has(PE.Engine, 'setShading');
    shading.title = has(PE.Engine, 'setShading') ? 'Chế độ hiển thị' : 'Shading — Planned (Engine chưa sẵn)';
    shading.addEventListener('change', function () {
      try { PE.Engine.setShading(shading.value); } catch (e) { console.warn('[Toolbar] setShading lỗi:', e); }
    });
    toolbarEl.appendChild(shading);

    // Grid toggle.
    var gridBtn = makeBtn(gridVisible ? '▦ Lưới: Bật' : '▦ Lưới: Tắt', 'Bật/tắt lưới', function () {
      gridVisible = !gridVisible;
      gridBtn.textContent = gridVisible ? '▦ Lưới: Bật' : '▦ Lưới: Tắt';
      if (PE.Engine && typeof PE.Engine.setGridVisible === 'function') {
        try { PE.Engine.setGridVisible(gridVisible); } catch (e) { /* ignore */ }
      } else {
        var s = getState();
        var scene = s ? s.scene : null;
        if (scene && scene.getMeshByName) {
          try { var grid = scene.getMeshByName('grid'); if (grid && grid.setEnabled) grid.setEnabled(gridVisible); } catch (e) { /* ignore */ }
        }
      }
    });
    toolbarEl.appendChild(gridBtn);

    // Snap toggle + snap size.
    var snapBtn = makeBtn('🧲 Snap: Tắt', 'Bật/tắt snap khi kéo gizmo', function () {
      snapEnabled = !snapEnabled;
      snapBtn.textContent = snapEnabled ? '🧲 Snap: Bật' : '🧲 Snap: Tắt';
      snapBtn.classList.toggle('is-active', snapEnabled);
      if (has(PE.TransformGizmo, 'setSnap')) {
        try { PE.TransformGizmo.setSnap(snapEnabled, snapSize); } catch (e) { /* ignore */ }
      }
    });
    toolbarEl.appendChild(snapBtn);
    var snapInput = document.createElement('input');
    snapInput.type = 'number';
    snapInput.className = 'toolbar-number';
    snapInput.value = snapSize;
    snapInput.step = '0.1';
    snapInput.min = '0.1';
    snapInput.title = 'Kích thước snap';
    snapInput.setAttribute('aria-label', 'Kích thước snap');
    snapInput.addEventListener('input', function () {
      var v = parseFloat(snapInput.value);
      if (!isNaN(v) && v > 0) {
        snapSize = v;
        if (has(PE.TransformGizmo, 'setSnap')) {
          try { PE.TransformGizmo.setSnap(snapEnabled, snapSize); } catch (e) { /* ignore */ }
        }
      }
    });
    toolbarEl.appendChild(snapInput);

    toolbarEl.appendChild(separator());

    // Camera view.
    var camReady = PE.CameraController && typeof PE.CameraController.setMode === 'function';
    [['persp', '🎥 Persp'], ['top', '⬆️ Top'], ['front', '➡️ Front'], ['left', '⬅️ Left']].forEach(function (v) {
      var b = makeBtn(v[1], 'Góc nhìn ' + v[0], function () {
        try { PE.CameraController.setMode(v[0]); } catch (e) { console.warn('[Toolbar] CameraController.setMode lỗi:', e); }
      }, { disabled: !camReady });
      toolbarEl.appendChild(b);
    });

    toolbarEl.appendChild(separator());

    // Play / Pause / Stop.
    var runtimeReady = has(PE.GameRuntime, 'play');
    toolbarEl.appendChild(makeBtn('▶️ Play', 'Chạy game', function () {
      try { PE.GameRuntime.play(); } catch (e) { console.warn('[Toolbar] play lỗi:', e); }
    }, { disabled: !runtimeReady }));
    toolbarEl.appendChild(makeBtn('⏸️ Pause', 'Tạm dừng game', function () {
      if (has(PE.GameRuntime, 'pause')) { try { PE.GameRuntime.pause(); } catch (e) { console.warn('[Toolbar] pause lỗi:', e); } }
    }, { disabled: !has(PE.GameRuntime, 'pause') }));
    toolbarEl.appendChild(makeBtn('⏹️ Stop', 'Dừng game', function () {
      if (has(PE.GameRuntime, 'stop')) { try { PE.GameRuntime.stop(); } catch (e) { console.warn('[Toolbar] stop lỗi:', e); } }
    }, { disabled: !has(PE.GameRuntime, 'stop') }));

    toolbarEl.appendChild(separator());

    // Nút Add.
    var adds = [
      { label: '+ 🧊 Cube', def: { name: 'Cube', type: 'cube' } },
      { label: '+ 🔵 Sphere', def: { name: 'Sphere', type: 'sphere' } },
      { label: '+ 🛢️ Cylinder', def: { name: 'Cylinder', type: 'cylinder' } },
      { label: '+ ▭ Plane', def: { name: 'Plane', type: 'plane' } },
      { label: '+ 💡 Light', def: { name: 'Light', type: 'light' } },
      { label: '+ ⛰️ Terrain', def: { name: 'Terrain', type: 'terrain' } }
    ];
    adds.forEach(function (a) {
      toolbarEl.appendChild(makeBtn(a.label, 'Thêm ' + a.def.name + ' vào scene', function () { addObjectDef(a.def); }));
    });
    // Particle: ưu tiên ParticleEditor/VFXManager, nếu không có thì addObject thường.
    toolbarEl.appendChild(makeBtn('+ ✨ Particle', 'Thêm hiệu ứng particle', function () {
      if (has(PE.ParticleEditor, 'addPreset')) {
        try { PE.ParticleEditor.addPreset('fire', { x: 0, y: 1, z: 0 }); return; } catch (e) { console.warn('[Toolbar] ParticleEditor.addPreset lỗi:', e); }
      }
      if (has(PE.VFXManager, 'addPreset')) {
        try { PE.VFXManager.addPreset('fire', { x: 0, y: 1, z: 0 }); return; } catch (e) { console.warn('[Toolbar] VFXManager.addPreset lỗi:', e); }
      }
      addObjectDef({ name: 'Particle', type: 'particle' });
    }));
  }

  function separator() {
    var s = document.createElement('span');
    s.className = 'toolbar-separator';
    s.textContent = '|';
    return s;
  }

  function buildToolSettings() {
    settingsEl = document.getElementById('tool-settings');
    if (!settingsEl) return;
    settingsEl.innerHTML = '';
    settingsEl.appendChild(Object.assign(document.createElement('div'), { className: 'tool-settings-title', textContent: '🖌️ Cài đặt Brush (Terrain)' }));

    var brushReady = has(PE.TerrainBrush, 'setBrush');
    var brush = { tool: 'raise', size: 5, strength: 0.5, falloff: 0.5 };

    function pushBrush() {
      if (!brushReady) return;
      try { PE.TerrainBrush.setBrush({ tool: brush.tool, size: brush.size, strength: brush.strength, falloff: brush.falloff }); } catch (e) { console.warn('[Toolbar] setBrush lỗi:', e); }
      if (has(PE.TerrainBrush, 'setActiveTool')) {
        try { PE.TerrainBrush.setActiveTool(brush.tool); } catch (e) { /* ignore */ }
      }
    }

    var toolRow = document.createElement('div');
    toolRow.className = 'tool-settings-row';
    toolRow.appendChild(Object.assign(document.createElement('label'), { textContent: 'Công cụ' }));
    var toolSel = document.createElement('select');
    toolSel.className = 'tool-settings-select';
    [['raise', '⛰️ Nâng (Raise)'], ['lower', '🕳️ Hạ (Lower)'], ['smooth', '〰️ Làm mịn (Smooth)'], ['flatten', '▬ San phẳng (Flatten)'], ['paint', '🎨 Sơn (Paint)']].forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o[0]; opt.textContent = o[1];
      toolSel.appendChild(opt);
    });
    toolSel.disabled = !brushReady;
    toolSel.title = brushReady ? 'Chọn công cụ brush' : 'Brush — Planned (TerrainBrush chưa sẵn)';
    toolSel.addEventListener('change', function () { brush.tool = toolSel.value; pushBrush(); });
    toolRow.appendChild(toolSel);
    settingsEl.appendChild(toolRow);

    function sliderRow(label, min, max, step, value, onInput) {
      var row = document.createElement('div');
      row.className = 'tool-settings-row';
      row.appendChild(Object.assign(document.createElement('label'), { textContent: label }));
      var input = document.createElement('input');
      input.type = 'range';
      input.min = min; input.max = max; input.step = step; input.value = value;
      input.className = 'tool-settings-slider';
      input.disabled = !brushReady;
      var val = document.createElement('span');
      val.className = 'tool-settings-value';
      val.textContent = value;
      input.addEventListener('input', function () { val.textContent = input.value; onInput(parseFloat(input.value)); });
      row.appendChild(input);
      row.appendChild(val);
      settingsEl.appendChild(row);
    }
    sliderRow('Kích thước Brush', 1, 20, 1, brush.size, function (v) { brush.size = v; pushBrush(); });
    sliderRow('Độ mạnh (Strength)', 0, 1, 0.05, brush.strength, function (v) { brush.strength = v; pushBrush(); });
    sliderRow('Độ mềm (Falloff)', 0, 1, 0.05, brush.falloff, function (v) { brush.falloff = v; pushBrush(); });
    if (!brushReady) {
      settingsEl.appendChild(Object.assign(document.createElement('div'), { className: 'tool-settings-note', textContent: 'Brush chưa sẵn — TerrainBrush (nhóm Terrain) chưa load. Các slider đang bị khóa.' }));
    }

    function toggleRow(label, onChange) {
      var row = document.createElement('div');
      row.className = 'tool-settings-row';
      row.appendChild(Object.assign(document.createElement('label'), { textContent: label }));
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', function () { onChange(cb.checked); });
      row.appendChild(cb);
      settingsEl.appendChild(row);
    }
    toggleRow('Xoay ngẫu nhiên khi đặt object', function (v) {
      if (PE.state) PE.state.randomRotation = v;
      emit('toolbar-option-changed', { randomRotation: v });
    });
    toggleRow('Tỉ lệ ngẫu nhiên khi đặt object', function (v) {
      if (PE.state) PE.state.randomScale = v;
      emit('toolbar-option-changed', { randomScale: v });
    });
    toggleRow('Snap to Grid', function (v) {
      snapEnabled = v;
      if (has(PE.TransformGizmo, 'setSnap')) {
        try { PE.TransformGizmo.setSnap(v, snapSize); } catch (e) { /* ignore */ }
      }
      if (PE.state) PE.state.snapToGrid = v;
    });
  }

  function init() {
    if (initialized) { buildToolbar(); buildToolSettings(); return; }
    initialized = true;
    buildToolbar();
    buildToolSettings();
    if (PE.EventBus && typeof PE.EventBus.on === 'function') {
      try {
        PE.EventBus.on('engine-ready', function () { buildToolbar(); buildToolSettings(); });
        PE.EventBus.on('scene-loaded', function () { refreshActiveStates(); });
      } catch (e) { console.warn('[Toolbar] đăng ký EventBus lỗi:', e); }
    }
  }

  PE.Toolbar = { init: init, setGizmoTool: setGizmoTool };
})();
