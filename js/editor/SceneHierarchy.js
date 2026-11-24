'use strict';
/* PixiJS 3D Game Engine Editor — SceneHierarchy (nhóm EDITOR)
 * Cây scene thật từ PixiEngine.state.objects (theo parentId/children).
 * Phòng thủ: mọi lệnh gọi Core (SelectionManager, SceneManager, UndoRedoManager,
 * EventBus) đều kiểm tra typeof trước khi gọi; nếu core chưa có thì vẫn render
 * được và thao tác ở mức state, không crash.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var PE = window.PixiEngine;

  var container = null;
  var containerId = 'hierarchy-panel';
  var searchText = '';
  var collapsed = {}; // id -> true nếu đang thu gọn
  var renamingId = null;

  var TYPE_ICONS = {
    empty: '📦', cube: '📦', box: '📦', sphere: '🔵', cylinder: '🛢️',
    plane: '▭', mesh: '📦', model: '📦', prefab: '🧩',
    tree: '🌲', terrain: '⛰️', light: '💡', camera: '📷',
    particle: '✨', audio: '🔊', script: '📜', group: '📁',
    character: '🧍', npc: '🧍', sprite: '🖼️', ui: '🖼️'
  };

  function iconFor(obj) {
    var t = (obj && obj.type ? String(obj.type) : 'empty').toLowerCase();
    return TYPE_ICONS[t] || '📦';
  }

  function getState() { return (PE.state && typeof PE.state === 'object') ? PE.state : null; }
  function getObjects() {
    var s = getState();
    return (s && Array.isArray(s.objects)) ? s.objects : [];
  }
  function findById(id) {
    if (PE.SceneManager && typeof PE.SceneManager.findById === 'function') {
      try { return PE.SceneManager.findById(id); } catch (e) { /* rơi xuống tra state */ }
    }
    var objs = getObjects();
    for (var i = 0; i < objs.length; i++) if (objs[i] && objs[i].id === id) return objs[i];
    return null;
  }
  function emit(ev, data) {
    if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
      try { PE.EventBus.emit(ev, data); } catch (e) { console.warn('[Hierarchy] emit lỗi:', e); }
    }
  }
  function isSelected(id) {
    var s = getState();
    if (!s) return false;
    if (s.selected && s.selected.id === id) return true;
    return Array.isArray(s.selectedIds) && s.selectedIds.indexOf(id) !== -1;
  }
  function selectObject(id, additive) {
    if (PE.SelectionManager && typeof PE.SelectionManager.select === 'function') {
      try { PE.SelectionManager.select(id); } catch (e) { console.warn('[Hierarchy] select lỗi:', e); }
    } else {
      var s = getState();
      if (s) {
        var obj = findById(id);
        if (additive && Array.isArray(s.selectedIds)) {
          var idx = s.selectedIds.indexOf(id);
          if (idx === -1) s.selectedIds.push(id); else s.selectedIds.splice(idx, 1);
          s.selected = obj || null;
        } else {
          s.selected = obj || null;
          s.selectedIds = obj ? [id] : [];
        }
      }
    }
    emit('selection-changed', { id: id, additive: !!additive });
    render();
  }

  function getChildrenIds(obj) {
    if (Array.isArray(obj.children) && obj.children.length) return obj.children.slice();
    // Dự phòng: suy ra từ parentId của các object khác.
    var out = [];
    getObjects().forEach(function (o) { if (o && o.parentId === obj.id) out.push(o.id); });
    return out;
  }
  function getRoots() {
    var objs = getObjects();
    return objs.filter(function (o) { return o && !o.parentId; });
  }
  function matchesSearch(obj) {
    if (!searchText) return true;
    var name = (obj.name || '').toLowerCase();
    var type = (obj.type || '').toLowerCase();
    return name.indexOf(searchText) !== -1 || type.indexOf(searchText) !== -1;
  }
  // Có con nào (đệ quy) khớp search không — để auto mở nhánh khi tìm kiếm.
  function subtreeMatches(obj) {
    if (matchesSearch(obj)) return true;
    var kids = getChildrenIds(obj);
    for (var i = 0; i < kids.length; i++) {
      var c = findById(kids[i]);
      if (c && subtreeMatches(c)) return true;
    }
    return false;
  }

  function setVisible(obj, visible) {
    obj.visible = visible;
    if (obj.babylonNode && typeof obj.babylonNode.setEnabled === 'function') {
      try { obj.babylonNode.setEnabled(visible); } catch (e) { console.warn('[Hierarchy] setEnabled lỗi:', e); }
    }
    emit('transform-changed', { id: obj.id, visible: visible });
    emit('hierarchy-changed', { id: obj.id });
    render();
  }

  function renameObject(obj, newName) {
    newName = (newName || '').trim();
    if (!newName || newName === obj.name) return;
    var oldName = obj.name;
    obj.name = newName;
    if (PE.UndoRedoManager && typeof PE.UndoRedoManager.push === 'function') {
      try {
        PE.UndoRedoManager.push({
          label: 'Đổi tên ' + oldName + ' → ' + newName,
          undo: function () { obj.name = oldName; emit('hierarchy-changed', { id: obj.id }); render(); },
          redo: function () { obj.name = newName; emit('hierarchy-changed', { id: obj.id }); render(); }
        });
      } catch (e) { console.warn('[Hierarchy] push undo lỗi:', e); }
    }
    emit('hierarchy-changed', { id: obj.id });
    render();
  }

  function deleteObject(obj) {
    if (PE.SceneManager && typeof PE.SceneManager.removeObject === 'function') {
      try { PE.SceneManager.removeObject(obj.id); } catch (e) { console.warn('[Hierarchy] remove lỗi:', e); }
    } else {
      var s = getState();
      if (s) s.objects = getObjects().filter(function (o) { return o.id !== obj.id; });
      if (s && s.selected && s.selected.id === obj.id) { s.selected = null; s.selectedIds = []; }
      emit('object-removed', { id: obj.id });
    }
    emit('hierarchy-changed', { id: obj.id });
    render();
  }

  function duplicateObject(obj) {
    if (PE.SceneManager && typeof PE.SceneManager.duplicateObject === 'function') {
      try { PE.SceneManager.duplicateObject(obj.id); return; } catch (e) { console.warn('[Hierarchy] duplicate lỗi:', e); }
    }
    // Fallback: nhân bản nông ở mức state (không có babylonNode mới).
    var s = getState();
    if (!s) return;
    var copy = JSON.parse(JSON.stringify(obj));
    copy.id = 'obj_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    copy.name = (obj.name || 'Object') + ' (bản sao)';
    copy.babylonNode = null;
    copy.children = [];
    s.objects.push(copy);
    emit('object-added', { id: copy.id, object: copy });
    emit('hierarchy-changed', { id: copy.id });
    render();
  }

  function groupObjects(ids) {
    if (!ids || !ids.length) return;
    var def = { name: 'Nhóm mới', type: 'group', parentId: null };
    var groupId = null;
    if (PE.SceneManager && typeof PE.SceneManager.addObject === 'function') {
      try {
        var created = PE.SceneManager.addObject(def);
        groupId = created && created.id ? created.id : (created || null);
      } catch (e) { console.warn('[Hierarchy] addObject group lỗi:', e); }
    }
    if (!groupId) {
      var s = getState();
      if (!s) return;
      groupId = 'obj_' + Date.now();
      s.objects.push({ id: groupId, name: 'Nhóm mới', type: 'group', parentId: null,
        children: [], transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
        babylonNode: null, components: [], visible: true, active: true, tag: '', layer: 0, static: false });
      emit('object-added', { id: groupId });
    }
    ids.forEach(function (id) { reparent(id, groupId, true); });
    emit('hierarchy-changed', { id: groupId });
    render();
  }

  function reparent(childId, newParentId, silent) {
    var child = findById(childId);
    if (!child) return;
    if (childId === newParentId) return;
    // Chống vòng lặp: newParent không được là con cháu của child.
    var p = newParentId ? findById(newParentId) : null;
    while (p) {
      if (p.id === childId) return;
      p = p.parentId ? findById(p.parentId) : null;
    }
    var oldParentId = child.parentId || null;
    var oldParent = oldParentId ? findById(oldParentId) : null;
    if (oldParent && Array.isArray(oldParent.children)) {
      oldParent.children = oldParent.children.filter(function (c) { return c !== childId; });
    }
    child.parentId = newParentId || null;
    if (newParentId) {
      var np = findById(newParentId);
      if (np) {
        np.children = Array.isArray(np.children) ? np.children : [];
        if (np.children.indexOf(childId) === -1) np.children.push(childId);
      }
    }
    if (!silent) {
      if (PE.UndoRedoManager && typeof PE.UndoRedoManager.push === 'function') {
        try {
          PE.UndoRedoManager.push({
            label: 'Di chuyển ' + (child.name || childId),
            undo: function () { reparent(childId, oldParentId, true); emit('hierarchy-changed', { id: childId }); render(); },
            redo: function () { reparent(childId, newParentId, true); emit('hierarchy-changed', { id: childId }); render(); }
          });
        } catch (e) { console.warn('[Hierarchy] push undo lỗi:', e); }
      }
      emit('hierarchy-changed', { id: childId });
      render();
    }
  }

  function contextItems(obj) {
    var items = [
      { label: 'Đổi tên', icon: '✏️', action: function () { startRename(obj); } },
      { label: 'Nhân bản (Ctrl+D)', icon: '📋', action: function () { duplicateObject(obj); } },
      { label: 'Xóa (Delete)', icon: '🗑️', action: function () { deleteObject(obj); } },
      'separator',
      { label: 'Nhóm với object đã chọn', icon: '📁', action: function () {
          var s = getState();
          var ids = (s && Array.isArray(s.selectedIds) && s.selectedIds.length) ? s.selectedIds.slice() : [obj.id];
          if (ids.indexOf(obj.id) === -1) ids.push(obj.id);
          groupObjects(ids);
        } },
      { label: 'Thêm Empty con', icon: '📦', action: function () { addChild(obj.id, 'empty', 'Empty'); } },
      { label: 'Thêm Cube con', icon: '🧊', action: function () { addChild(obj.id, 'cube', 'Cube'); } }
    ];
    return items;
  }

  function addChild(parentId, type, name) {
    var def = { name: name, type: type, parentId: parentId };
    if (PE.SceneManager && typeof PE.SceneManager.addObject === 'function') {
      try { PE.SceneManager.addObject(def); return; } catch (e) { console.warn('[Hierarchy] addObject lỗi:', e); }
    }
    var s = getState();
    if (!s) return;
    var id = 'obj_' + Date.now();
    s.objects.push({ id: id, name: name, type: type, parentId: parentId, children: [],
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      babylonNode: null, components: [], visible: true, active: true, tag: '', layer: 0, static: false });
    var parent = findById(parentId);
    if (parent) { parent.children = parent.children || []; parent.children.push(id); }
    emit('object-added', { id: id });
    emit('hierarchy-changed', { id: id });
    render();
  }

  function startRename(obj) {
    renamingId = obj.id;
    render();
    var input = container ? container.querySelector('input.hierarchy-rename-input[data-id="' + obj.id + '"]') : null;
    if (input) { input.focus(); input.select(); }
  }

  function buildLi(obj) {
    var li = document.createElement('li');
    li.className = 'hierarchy-item' + (isSelected(obj.id) ? ' is-selected' : '') + (obj.visible === false ? ' is-hidden' : '');
    li.dataset.id = obj.id;
    li.draggable = true;

    var row = document.createElement('div');
    row.className = 'hierarchy-row';

    var kids = getChildrenIds(obj);
    var hasKids = kids.length > 0;
    var isCollapsed = !!collapsed[obj.id] && !searchText;

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'hierarchy-toggle';
    toggle.textContent = hasKids ? (isCollapsed ? '▶' : '▼') : '';
    toggle.setAttribute('aria-label', hasKids ? (isCollapsed ? 'Mở rộng' : 'Thu gọn') : '');
    if (hasKids) {
      toggle.addEventListener('click', function (ev) {
        ev.stopPropagation();
        collapsed[obj.id] = !collapsed[obj.id];
        render();
      });
    } else {
      toggle.disabled = true;
    }
    row.appendChild(toggle);

    var icon = document.createElement('span');
    icon.className = 'hierarchy-icon';
    icon.textContent = iconFor(obj);
    row.appendChild(icon);

    if (renamingId === obj.id) {
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'hierarchy-rename-input';
      input.dataset.id = obj.id;
      input.value = obj.name || '';
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { renamingId = null; renameObject(obj, input.value); }
        else if (ev.key === 'Escape') { renamingId = null; render(); }
        ev.stopPropagation();
      });
      input.addEventListener('blur', function () {
        if (renamingId === obj.id) { renamingId = null; renameObject(obj, input.value); }
      });
      input.addEventListener('click', function (ev) { ev.stopPropagation(); });
      row.appendChild(input);
    } else {
      var name = document.createElement('span');
      name.className = 'hierarchy-name';
      name.textContent = obj.name || '(không tên)';
      name.title = (obj.name || '') + ' — ' + (obj.type || '');
      row.appendChild(name);
    }

    var eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'hierarchy-eye';
    eye.textContent = obj.visible === false ? '🙈' : '👁️';
    eye.title = obj.visible === false ? 'Hiện object' : 'Ẩn object';
    eye.setAttribute('aria-label', eye.title);
    eye.addEventListener('click', function (ev) {
      ev.stopPropagation();
      setVisible(obj, obj.visible === false);
    });
    row.appendChild(eye);

    row.addEventListener('click', function (ev) {
      if (ev.target === eye || ev.target === toggle) return;
      selectObject(obj.id, ev.ctrlKey || ev.metaKey);
    });
    row.addEventListener('dblclick', function (ev) {
      if (ev.target === eye || ev.target === toggle) return;
      startRename(obj);
    });
    row.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!isSelected(obj.id)) selectObject(obj.id, false);
      if (PE.ContextMenu && typeof PE.ContextMenu.show === 'function') {
        PE.ContextMenu.show(ev.clientX, ev.clientY, contextItems(obj));
      }
    });

    // Drag-drop đổi parent (HTML5).
    li.addEventListener('dragstart', function (ev) {
      ev.dataTransfer.setData('text/plain', obj.id);
      ev.dataTransfer.setData('application/x-pixi-object', obj.id);
      ev.dataTransfer.effectAllowed = 'move';
      li.classList.add('is-dragging');
    });
    li.addEventListener('dragend', function () { li.classList.remove('is-dragging'); });
    li.addEventListener('dragover', function (ev) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      li.classList.add('is-drop-target');
    });
    li.addEventListener('dragleave', function () { li.classList.remove('is-drop-target'); });
    li.addEventListener('drop', function (ev) {
      ev.preventDefault();
      li.classList.remove('is-drop-target');
      var draggedId = ev.dataTransfer.getData('application/x-pixi-object') || ev.dataTransfer.getData('text/plain');
      if (draggedId && draggedId !== obj.id) reparent(draggedId, obj.id, false);
    });

    li.appendChild(row);

    if (hasKids && !isCollapsed) {
      var ul = document.createElement('ul');
      ul.className = 'hierarchy-children';
      kids.forEach(function (kidId) {
        var kid = findById(kidId);
        if (!kid) return;
        if (searchText && !subtreeMatches(kid)) return;
        ul.appendChild(buildLi(kid));
      });
      li.appendChild(ul);
    }
    return li;
  }

  function render() {
    if (!container) return;
    container.innerHTML = '';

    // Thanh search + nút thêm.
    var toolbar = document.createElement('div');
    toolbar.className = 'hierarchy-toolbar';
    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'hierarchy-search';
    search.placeholder = '🔍 Tìm object...';
    search.value = searchText;
    search.setAttribute('aria-label', 'Tìm object trong scene');
    search.addEventListener('input', function () { searchText = search.value.trim().toLowerCase(); render(); });
    toolbar.appendChild(search);
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'hierarchy-add-btn';
    addBtn.textContent = '+ Thêm';
    addBtn.title = 'Thêm Empty object vào gốc scene';
    addBtn.addEventListener('click', function () { addChild(null, 'empty', 'Empty'); });
    toolbar.appendChild(addBtn);
    container.appendChild(toolbar);

    var objs = getObjects();
    var s = getState();
    if (!s || !s.scene) {
      var empty = document.createElement('div');
      empty.className = 'hierarchy-empty';
      empty.textContent = 'Chưa có scene. Mở hoặc tạo scene mới để xem cây object.';
      container.appendChild(empty);
      return;
    }
    if (!objs.length) {
      var none = document.createElement('div');
      none.className = 'hierarchy-empty';
      none.textContent = 'Scene trống. Bấm "+ Thêm" hoặc dùng thanh Toolbar để thêm object.';
      container.appendChild(none);
      return;
    }

    var roots = getRoots();
    var list = document.createElement('ul');
    list.className = 'hierarchy-tree';
    var shown = 0;
    roots.forEach(function (root) {
      if (searchText && !subtreeMatches(root)) return;
      list.appendChild(buildLi(root));
      shown++;
    });
    // Object mồ côi (parentId trỏ tới id không tồn tại) vẫn hiện ở gốc.
    objs.forEach(function (o) {
      if (o && o.parentId && !findById(o.parentId)) {
        if (searchText && !subtreeMatches(o)) return;
        list.appendChild(buildLi(o));
        shown++;
      }
    });
    if (shown === 0) {
      var noMatch = document.createElement('div');
      noMatch.className = 'hierarchy-empty';
      noMatch.textContent = 'Không tìm thấy object nào khớp "' + searchText + '".';
      container.appendChild(noMatch);
      return;
    }
    // Thả vào vùng trống của cây = đưa về gốc.
    list.addEventListener('dragover', function (ev) { ev.preventDefault(); });
    list.addEventListener('drop', function (ev) {
      if (ev.target === list) {
        var draggedId = ev.dataTransfer.getData('application/x-pixi-object') || ev.dataTransfer.getData('text/plain');
        if (draggedId) reparent(draggedId, null, false);
      }
    });
    container.appendChild(list);
  }

  function init(id) {
    containerId = id || 'hierarchy-panel';
    container = document.getElementById(containerId);
    if (!container) {
      console.warn('[Hierarchy] Không tìm thấy container #' + containerId);
      return;
    }
    // Long-press trên touch: mở context menu.
    if (PE.ContextMenu && typeof PE.ContextMenu.attachLongPress === 'function') {
      try {
        PE.ContextMenu.attachLongPress(container, function (target) {
          var li = target && target.closest ? target.closest('.hierarchy-item') : null;
          if (!li) return [];
          var obj = findById(li.dataset.id);
          return obj ? contextItems(obj) : [];
        });
      } catch (e) { console.warn('[Hierarchy] attachLongPress lỗi:', e); }
    }
    if (PE.EventBus && typeof PE.EventBus.on === 'function') {
      ['hierarchy-changed', 'object-added', 'object-removed', 'scene-loaded', 'engine-ready'].forEach(function (ev) {
        try { PE.EventBus.on(ev, render); } catch (e) { /* bỏ qua */ }
      });
    }
    render();
  }

  PE.SceneHierarchy = { init: init, render: render };
})();
