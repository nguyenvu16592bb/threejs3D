'use strict';
/* PixiJS 3D Game Engine Editor — Inspector (nhóm EDITOR)
 * Hiện/ sửa object thật đang chọn: Transform, Mesh Renderer, Terrain, Light,
 * Camera, Components. Mọi input đều ghi vào obj.transform + babylonNode thật
 * và emit 'transform-changed'. Phòng thủ khi Core/MaterialManager chưa có.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var PE = window.PixiEngine;

  var container = null;
  var containerId = 'inspector-panel';
  var currentId = null;

  function getState() { return (PE.state && typeof PE.state === 'object') ? PE.state : null; }
  function emit(ev, data) {
    if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
      try { PE.EventBus.emit(ev, data); } catch (e) { console.warn('[Inspector] emit lỗi:', e); }
    }
  }
  function selectedObject() {
    var s = getState();
    if (!s) return null;
    // Phòng thủ: state.selected có thể là id string (do code cũ) — resolve về object.
    if (typeof s.selected === 'string') {
      if (PE.SceneManager && typeof PE.SceneManager.findById === 'function') {
        try { return PE.SceneManager.findById(s.selected); } catch (e) { /* fallback */ }
      }
      return null;
    }
    if (s.selected) return s.selected;
    if (Array.isArray(s.selectedIds) && s.selectedIds.length) {
      var id = s.selectedIds[0];
      if (PE.SceneManager && typeof PE.SceneManager.findById === 'function') {
        try { return PE.SceneManager.findById(id); } catch (e) { /* fallback */ }
      }
      var objs = Array.isArray(s.objects) ? s.objects : [];
      for (var i = 0; i < objs.length; i++) if (objs[i] && objs[i].id === id) return objs[i];
    }
    return null;
  }
  function nodeOf(obj) { return obj && obj.babylonNode ? obj.babylonNode : null; }
  function num(v, fallback) { var n = parseFloat(v); return isNaN(n) ? fallback : n; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function section(title, open) {
    var wrap = el('div', 'inspector-section');
    var head = el('div', 'inspector-section-head', title);
    head.addEventListener('click', function () { wrap.classList.toggle('is-collapsed'); });
    var body = el('div', 'inspector-section-body');
    if (open === false) wrap.classList.add('is-collapsed');
    wrap.appendChild(head);
    wrap.appendChild(body);
    return { wrap: wrap, body: body };
  }

  function numberRow(parent, label, value, onChange, step) {
    var row = el('div', 'inspector-row');
    row.appendChild(el('label', 'inspector-label', label));
    var input = document.createElement('input');
    input.type = 'number';
    input.className = 'inspector-number';
    input.value = (value === undefined || value === null) ? 0 : value;
    input.step = step || '0.1';
    input.addEventListener('input', function () { onChange(num(input.value, 0)); });
    input.addEventListener('change', function () { render(currentId ? findCurrent() : null); });
    row.appendChild(input);
    parent.appendChild(row);
    return input;
  }

  function vec3Group(parent, title, vec, onChange) {
    var g = el('div', 'inspector-vec3');
    g.appendChild(el('div', 'inspector-vec3-title', title));
    ['x', 'y', 'z'].forEach(function (axis) {
      numberRow(g, axis.toUpperCase(), vec ? vec[axis] : 0, function (v) {
        var next = { x: vec ? vec.x : 0, y: vec ? vec.y : 0, z: vec ? vec.z : 0 };
        next[axis] = v;
        onChange(next);
      });
    });
    parent.appendChild(g);
  }

  function findCurrent() {
    var obj = selectedObject();
    return obj && obj.id === currentId ? obj : obj;
  }

  function applyTransformToNode(obj) {
    var node = nodeOf(obj);
    if (!node || !obj.transform) return;
    var t = obj.transform;
    try {
      if (node.position && t.position) node.position.set(t.position.x, t.position.y, t.position.z);
      if (node.rotation && t.rotation) node.rotation.set(t.rotation.x, t.rotation.y, t.rotation.z);
      if (node.scaling && t.scale) node.scaling.set(t.scale.x, t.scale.y, t.scale.z);
    } catch (e) { console.warn('[Inspector] áp transform lên node lỗi:', e); }
  }

  function transformChanged(obj) {
    applyTransformToNode(obj);
    emit('transform-changed', { id: obj.id, transform: obj.transform });
  }

  function buildTransformSection(obj, parent) {
    var sec = section('🔧 Transform', true);
    obj.transform = obj.transform || { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
    var t = obj.transform;
    t.position = t.position || { x: 0, y: 0, z: 0 };
    t.rotation = t.rotation || { x: 0, y: 0, z: 0 };
    t.scale = t.scale || { x: 1, y: 1, z: 1 };

    vec3Group(sec.body, 'Vị trí (Position)', t.position, function (v) { t.position = v; transformChanged(obj); });
    vec3Group(sec.body, 'Xoay (Rotation, radian)', t.rotation, function (v) { t.rotation = v; transformChanged(obj); });
    vec3Group(sec.body, 'Tỉ lệ (Scale)', t.scale, function (v) { t.scale = v; transformChanged(obj); });

    var snapRow = el('div', 'inspector-row inspector-actions');
    var snapBtn = el('button', 'inspector-btn', '🧲 Snap về lưới (0.5)');
    snapBtn.type = 'button';
    snapBtn.addEventListener('click', function () {
      var snap = 0.5;
      ['x', 'y', 'z'].forEach(function (a) { t.position[a] = Math.round(t.position[a] / snap) * snap; });
      transformChanged(obj);
      render(obj);
    });
    snapRow.appendChild(snapBtn);
    var resetBtn = el('button', 'inspector-btn', '↺ Đặt lại');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', function () {
      t.position = { x: 0, y: 0, z: 0 }; t.rotation = { x: 0, y: 0, z: 0 }; t.scale = { x: 1, y: 1, z: 1 };
      transformChanged(obj);
      render(obj);
    });
    snapRow.appendChild(resetBtn);
    sec.body.appendChild(snapRow);
    parent.appendChild(sec.wrap);
  }

  function buildMeshSection(obj, parent) {
    var node = nodeOf(obj);
    var sec = section('🧊 Mesh Renderer', true);
    var meshName = (node && (node.name || node.id)) || obj.name || '(không có mesh)';
    sec.body.appendChild(el('div', 'inspector-info', 'Mesh: ' + meshName));

    // Material select từ MaterialManager nếu có.
    var mats = null;
    if (PE.MaterialManager && typeof PE.MaterialManager.listMaterials === 'function') {
      try { mats = PE.MaterialManager.listMaterials(); } catch (e) { mats = null; }
    }
    var row = el('div', 'inspector-row');
    row.appendChild(el('label', 'inspector-label', 'Material'));
    if (Array.isArray(mats) && mats.length) {
      var sel = document.createElement('select');
      sel.className = 'inspector-select';
      mats.forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = m.name || m.id || m;
        opt.textContent = m.name || m.id || String(m);
        sel.appendChild(opt);
      });
      var currentMat = node && node.material ? (node.material.name || node.material.id) : null;
      if (currentMat) sel.value = currentMat;
      sel.addEventListener('change', function () {
        if (PE.MaterialManager && typeof PE.MaterialManager.applyMaterial === 'function') {
          try { PE.MaterialManager.applyMaterial(obj.id, sel.value); } catch (e) { console.warn('[Inspector] applyMaterial lỗi:', e); }
        } else if (node) {
          // Fallback: chỉ ghi tên vào object, không giả vờ đổi material thật.
          obj.materialName = sel.value;
          console.warn('[Inspector] MaterialManager.applyMaterial chưa có — chỉ lưu tên material.');
        }
        emit('transform-changed', { id: obj.id, material: sel.value });
      });
      row.appendChild(sel);
    } else {
      row.appendChild(el('span', 'inspector-info', 'Chưa có MaterialManager — chưa có material để chọn.'));
    }
    sec.body.appendChild(row);

    function checkRow(label, checked, onToggle) {
      var r = el('div', 'inspector-row');
      var lab = el('label', 'inspector-label', label);
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!checked;
      cb.addEventListener('change', function () { onToggle(cb.checked); });
      r.appendChild(lab); r.appendChild(cb);
      sec.body.appendChild(r);
    }
    if (node) {
      // Babylon: AbstractMesh có receiveShadows; cast shadow qua material/shadowGenerator.
      checkRow('Nhận bóng (Receive Shadow)', node.receiveShadows, function (v) {
        try { node.receiveShadows = v; } catch (e) { console.warn('[Inspector] receiveShadows lỗi:', e); }
        emit('transform-changed', { id: obj.id, receiveShadows: v });
      });
      var castVal = (typeof node.castShadow !== 'undefined') ? node.castShadow : (obj.castShadow !== false);
      checkRow('Đổ bóng (Cast Shadow)', castVal, function (v) {
        obj.castShadow = v;
        try { if (typeof node.castShadow !== 'undefined') node.castShadow = v; } catch (e) { /* Babylon mesh không có field này */ }
        emit('transform-changed', { id: obj.id, castShadow: v });
      });
    }
    parent.appendChild(sec.wrap);
  }

  function buildTerrainSection(obj, parent) {
    var sec = section('⛰️ Terrain', true);
    sec.body.appendChild(el('div', 'inspector-info', 'Cài đặt địa hình. Thay đổi sẽ gọi TerrainEditor nếu có.'));
    var height = (obj.terrain && obj.terrain.height) || 10;
    var size = (obj.terrain && obj.terrain.size) || 100;
    numberRow(sec.body, 'Chiều cao', height, function (v) {
      obj.terrain = obj.terrain || {}; obj.terrain.height = v;
      if (PE.TerrainEditor && typeof PE.TerrainEditor.setHeight === 'function') {
        try { PE.TerrainEditor.setHeight(obj.id, v); } catch (e) { console.warn('[Inspector] TerrainEditor.setHeight lỗi:', e); }
      }
      emit('transform-changed', { id: obj.id });
    }, '1');
    numberRow(sec.body, 'Kích thước', size, function (v) {
      obj.terrain = obj.terrain || {}; obj.terrain.size = v;
      if (PE.TerrainEditor && typeof PE.TerrainEditor.setSize === 'function') {
        try { PE.TerrainEditor.setSize(obj.id, v); } catch (e) { console.warn('[Inspector] TerrainEditor.setSize lỗi:', e); }
      }
      emit('transform-changed', { id: obj.id });
    }, '1');
    parent.appendChild(sec.wrap);
  }

  function buildLightSection(obj, parent) {
    var sec = section('💡 Light', true);
    var node = nodeOf(obj);
    var light = node || obj;
    var intensity = (typeof light.intensity === 'number') ? light.intensity : 1;
    numberRow(sec.body, 'Cường độ', intensity, function (v) {
      try { light.intensity = v; } catch (e) { /* ignore */ }
      obj.intensity = v;
      emit('transform-changed', { id: obj.id, intensity: v });
    }, '0.1');
    var row = el('div', 'inspector-row');
    row.appendChild(el('label', 'inspector-label', 'Màu'));
    var color = document.createElement('input');
    color.type = 'color';
    var cur = '#ffffff';
    try {
      if (light.diffuse && typeof light.diffuse.toHexString === 'function') cur = light.diffuse.toHexString();
      else if (typeof light.color === 'string') cur = light.color;
    } catch (e) { /* giữ mặc định */ }
    color.value = cur;
    color.addEventListener('input', function () {
      obj.lightColor = color.value;
      try {
        if (typeof BABYLON !== 'undefined' && BABYLON.Color3 && light.diffuse !== undefined) {
          light.diffuse = BABYLON.Color3.FromHexString(color.value);
        } else if (light.diffuse && typeof light.diffuse.set === 'function') {
          light.diffuse.set(color.value);
        }
      } catch (e) { console.warn('[Inspector] đổi màu light lỗi:', e); }
      emit('transform-changed', { id: obj.id, color: color.value });
    });
    row.appendChild(color);
    sec.body.appendChild(row);
    numberRow(sec.body, 'Tầm chiếu (Range)', (typeof light.range === 'number' ? light.range : 20), function (v) {
      try { light.range = v; } catch (e) { /* ignore */ }
      obj.range = v;
      emit('transform-changed', { id: obj.id, range: v });
    }, '1');
    parent.appendChild(sec.wrap);
  }

  function buildCameraSection(obj, parent) {
    var sec = section('📷 Camera', true);
    var node = nodeOf(obj);
    var fov = (node && typeof node.fov === 'number') ? node.fov : (obj.fov || 0.8);
    numberRow(sec.body, 'FOV (radian)', fov, function (v) {
      obj.fov = v;
      try { if (node) node.fov = v; } catch (e) { console.warn('[Inspector] set fov lỗi:', e); }
      emit('transform-changed', { id: obj.id, fov: v });
    }, '0.05');
    parent.appendChild(sec.wrap);
  }

  var COMPONENT_DEFS = {
    Animator: { label: 'Animator', fields: [{ key: 'clip', label: 'Animation clip', type: 'text', def: '' }, { key: 'loop', label: 'Lặp lại', type: 'checkbox', def: true }] },
    Collider: { label: 'Collider', fields: [{ key: 'shape', label: 'Hình dạng', type: 'text', def: 'box' }, { key: 'isTrigger', label: 'Là Trigger', type: 'checkbox', def: false }] },
    Rigidbody: { label: 'Rigidbody', fields: [{ key: 'mass', label: 'Khối lượng', type: 'number', def: 1 }, { key: 'useGravity', label: 'Dùng trọng lực', type: 'checkbox', def: true }] },
    'Audio Source': { label: 'Audio Source', fields: [{ key: 'clip', label: 'File âm thanh', type: 'text', def: '' }, { key: 'volume', label: 'Âm lượng', type: 'number', def: 1 }] },
    'Particle System': { label: 'Particle System', fields: [{ key: 'preset', label: 'Preset', type: 'text', def: 'fire' }, { key: 'rate', label: 'Tốc độ phát', type: 'number', def: 10 }] },
    Script: { label: 'Script', fields: [{ key: 'source', label: 'Tên script', type: 'text', def: '' }] }
  };

  function buildComponentsSection(obj, parent) {
    var sec = section('🧩 Components', true);
    obj.components = Array.isArray(obj.components) ? obj.components : [];
    if (!obj.components.length) {
      sec.body.appendChild(el('div', 'inspector-info', 'Chưa có component nào.'));
    }
    obj.components.forEach(function (comp, idx) {
      var def = COMPONENT_DEFS[comp.type] || { label: comp.type, fields: [] };
      var card = el('div', 'inspector-component');
      var head = el('div', 'inspector-component-head');
      head.appendChild(el('span', '', def.label));
      var rm = el('button', 'inspector-btn inspector-btn-danger', '✕ Xóa');
      rm.type = 'button';
      rm.addEventListener('click', function () {
        obj.components.splice(idx, 1);
        emit('transform-changed', { id: obj.id, components: obj.components });
        render(obj);
      });
      head.appendChild(rm);
      card.appendChild(head);
      (def.fields || []).forEach(function (f) {
        comp.props = comp.props || {};
        if (comp.props[f.key] === undefined) comp.props[f.key] = f.def;
        if (f.type === 'checkbox') {
          var r = el('div', 'inspector-row');
          r.appendChild(el('label', 'inspector-label', f.label));
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = !!comp.props[f.key];
          cb.addEventListener('change', function () {
            comp.props[f.key] = cb.checked;
            emit('transform-changed', { id: obj.id, components: obj.components });
          });
          r.appendChild(cb);
          card.appendChild(r);
        } else {
          var row = el('div', 'inspector-row');
          row.appendChild(el('label', 'inspector-label', f.label));
          var inp = document.createElement('input');
          inp.type = f.type === 'number' ? 'number' : 'text';
          inp.className = 'inspector-text';
          inp.value = comp.props[f.key];
          if (f.type === 'number') inp.step = '0.1';
          inp.addEventListener('input', function () {
            comp.props[f.key] = f.type === 'number' ? num(inp.value, 0) : inp.value;
            emit('transform-changed', { id: obj.id, components: obj.components });
          });
          row.appendChild(inp);
          card.appendChild(row);
        }
      });
      sec.body.appendChild(card);
    });

    var addRow = el('div', 'inspector-row inspector-actions');
    var select = document.createElement('select');
    select.className = 'inspector-select';
    Object.keys(COMPONENT_DEFS).forEach(function (k) {
      var opt = document.createElement('option');
      opt.value = k; opt.textContent = COMPONENT_DEFS[k].label;
      select.appendChild(opt);
    });
    addRow.appendChild(select);
    var addBtn = el('button', 'inspector-btn', '+ Thêm Component');
    addBtn.type = 'button';
    addBtn.addEventListener('click', function () {
      var type = select.value;
      var def = COMPONENT_DEFS[type];
      var props = {};
      (def.fields || []).forEach(function (f) { props[f.key] = f.def; });
      obj.components.push({ type: type, props: props });
      emit('transform-changed', { id: obj.id, components: obj.components });
      render(obj);
    });
    addRow.appendChild(addBtn);
    sec.body.appendChild(addRow);
    parent.appendChild(sec.wrap);
  }

  function render(obj) {
    if (!container) return;
    obj = obj || selectedObject();
    container.innerHTML = '';
    if (!obj) { renderEmpty(); return; }
    currentId = obj.id;

    var header = el('div', 'inspector-header');
    header.appendChild(el('span', 'inspector-title', '🔍 ' + (obj.name || '(không tên)')));
    header.appendChild(el('span', 'inspector-type', obj.type || ''));
    container.appendChild(header);

    // Thông tin chung: tên, tag, layer, visible, static.
    var sec = section('📋 Thông tin chung', true);
    var nameRow = el('div', 'inspector-row');
    nameRow.appendChild(el('label', 'inspector-label', 'Tên'));
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'inspector-text';
    nameInput.value = obj.name || '';
    nameInput.addEventListener('input', function () {
      obj.name = nameInput.value;
      emit('hierarchy-changed', { id: obj.id });
    });
    nameInput.addEventListener('change', function () { render(obj); });
    nameRow.appendChild(nameInput);
    sec.body.appendChild(nameRow);

    var tagRow = el('div', 'inspector-row');
    tagRow.appendChild(el('label', 'inspector-label', 'Tag'));
    var tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'inspector-text';
    tagInput.value = obj.tag || '';
    tagInput.placeholder = 'VD: Player, Enemy...';
    tagInput.addEventListener('input', function () { obj.tag = tagInput.value; });
    tagRow.appendChild(tagInput);
    sec.body.appendChild(tagRow);

    [['visible', 'Hiển thị', obj.visible !== false], ['active', 'Hoạt động', obj.active !== false], ['static', 'Static', !!obj.static]].forEach(function (cfg) {
      var r = el('div', 'inspector-row');
      r.appendChild(el('label', 'inspector-label', cfg[1]));
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = cfg[2];
      cb.addEventListener('change', function () {
        obj[cfg[0]] = cb.checked;
        if (cfg[0] === 'visible' && nodeOf(obj) && typeof nodeOf(obj).setEnabled === 'function') {
          try { nodeOf(obj).setEnabled(cb.checked); } catch (e) { /* ignore */ }
        }
        emit('transform-changed', { id: obj.id });
        emit('hierarchy-changed', { id: obj.id });
      });
      r.appendChild(cb);
      sec.body.appendChild(r);
    });
    container.appendChild(sec.wrap);

    buildTransformSection(obj, container);
    var type = (obj.type || '').toLowerCase();
    if (type === 'terrain') buildTerrainSection(obj, container);
    else if (type === 'light') buildLightSection(obj, container);
    else if (type === 'camera') buildCameraSection(obj, container);
    else buildMeshSection(obj, container);
    buildComponentsSection(obj, container);
  }

  function renderEmpty() {
    if (!container) return;
    currentId = null;
    var d = el('div', 'inspector-empty', 'Chưa chọn object nào.\nBấm vào một object trong Hierarchy hoặc trong viewport để xem thuộc tính.');
    container.appendChild(d);
  }

  function init(id) {
    containerId = id || 'inspector-panel';
    container = document.getElementById(containerId);
    if (!container) {
      console.warn('[Inspector] Không tìm thấy container #' + containerId);
      return;
    }
    if (PE.EventBus && typeof PE.EventBus.on === 'function') {
      try {
        PE.EventBus.on('selection-changed', function () { render(selectedObject()); });
        PE.EventBus.on('transform-changed', function (data) {
          // Chỉ render lại nếu object đang xem bị đổi từ nơi khác (tránh mất focus khi đang gõ).
          if (data && data.id === currentId && document.activeElement && document.activeElement.tagName !== 'INPUT') render(selectedObject());
        });
        PE.EventBus.on('scene-loaded', function () { render(null); });
      } catch (e) { console.warn('[Inspector] đăng ký EventBus lỗi:', e); }
    }
    renderEmpty();
  }

  PE.Inspector = { init: init, render: render, renderEmpty: renderEmpty };
})();
