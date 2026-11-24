'use strict';
/* PixiJS 3D Game Engine Editor — TransformGizmo (nhóm EDITOR)
 * Dùng BABYLON.GizmoManager thật. Phòng thủ: nếu BABYLON hoặc GizmoManager
 * chưa có thì không crash, chỉ ghi console.warn và vẫn nhận phím tắt
 * (phần xóa/duplicate/undo qua SceneManager/UndoRedoManager nếu có).
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var PE = window.PixiEngine;

  var gizmoManager = null;
  var scene = null;
  var mode = 'move';
  var space = 'world';
  var snapEnabled = false;
  var snapSize = 0.5;
  var attachedId = null;
  var shortcutsBound = false;

  function getState() { return (PE.state && typeof PE.state === 'object') ? PE.state : null; }
  function emit(ev, data) {
    if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
      try { PE.EventBus.emit(ev, data); } catch (e) { console.warn('[Gizmo] emit lỗi:', e); }
    }
  }
  function getScene() {
    if (PE.Engine && typeof PE.Engine.getScene === 'function') {
      try { return PE.Engine.getScene(); } catch (e) { /* fallback */ }
    }
    var s = getState();
    return s ? s.scene : null;
  }
  function findById(id) {
    if (PE.SceneManager && typeof PE.SceneManager.findById === 'function') {
      try { return PE.SceneManager.findById(id); } catch (e) { /* fallback */ }
    }
    var s = getState();
    var objs = s && Array.isArray(s.objects) ? s.objects : [];
    for (var i = 0; i < objs.length; i++) if (objs[i] && objs[i].id === id) return objs[i];
    return null;
  }
  function selectedObject() {
    var s = getState();
    if (!s) { return null; }
    // Phòng thủ: state.selected có thể là id string — resolve về object.
    if (typeof s.selected === 'string') {
      if (PE.SceneManager && typeof PE.SceneManager.findById === 'function') {
        try { return PE.SceneManager.findById(s.selected); } catch (e) { /* ignore */ }
      }
      return null;
    }
    return s.selected || null;
  }

  function applyModeToManager() {
    if (!gizmoManager) return;
    try {
      gizmoManager.positionGizmoEnabled = (mode === 'move');
      gizmoManager.rotationGizmoEnabled = (mode === 'rotate');
      gizmoManager.scaleGizmoEnabled = (mode === 'scale');
      // GizmoManager dùng gizmo con; đặt useLocalSpace nếu có.
      ['positionGizmo', 'rotationGizmo', 'scaleGizmo'].forEach(function (key) {
        var g = gizmoManager[key];
        if (g) {
          if ('useLocalSpace' in g) g.useLocalSpace = (space === 'local');
          // Babylon gizmo có thuộc tính updateGizmoRotationToMatchAttachedMesh.
          if ('updateGizmoRotationToMatchAttachedMesh' in g) {
            g.updateGizmoRotationToMatchAttachedMesh = (space === 'local');
          }
        }
      });
    } catch (e) { console.warn('[Gizmo] áp mode lỗi:', e); }
  }

  function applySnapToManager() {
    if (!gizmoManager) return;
    try {
      if (gizmoManager.positionGizmo) gizmoManager.positionGizmo.snapDistance = snapEnabled ? snapSize : 0;
      if (gizmoManager.rotationGizmo) gizmoManager.rotationGizmo.snapDistance = snapEnabled ? (snapSize * Math.PI / 180 * 15) : 0;
      if (gizmoManager.scaleGizmo) gizmoManager.scaleGizmo.snapDistance = snapEnabled ? 0.1 : 0;
    } catch (e) { console.warn('[Gizmo] áp snap lỗi:', e); }
  }

  function syncAttachedTransform() {
    // Khi gizmo kéo xong, Babylon đã đổi node; đồng bộ lại obj.transform.
    if (!attachedId) return;
    var obj = findById(attachedId);
    if (!obj || !obj.babylonNode || !obj.transform) return;
    var n = obj.babylonNode;
    try {
      if (n.position) obj.transform.position = { x: n.position.x, y: n.position.y, z: n.position.z };
      if (n.rotation) obj.transform.rotation = { x: n.rotation.x, y: n.rotation.y, z: n.rotation.z };
      if (n.scaling) obj.transform.scale = { x: n.scaling.x, y: n.scaling.y, z: n.scaling.z };
      emit('transform-changed', { id: obj.id, transform: obj.transform });
    } catch (e) { console.warn('[Gizmo] đồng bộ transform lỗi:', e); }
  }

  function init() {
    scene = getScene();
    if (!scene) {
      console.warn('[Gizmo] Chưa có scene — Gizmo sẽ khởi tạo lại khi có event engine-ready/scene-loaded.');
      bindEvents();
      bindShortcuts();
      return;
    }
    createManager(scene);
    bindEvents();
    bindShortcuts();
    var sel = selectedObject();
    if (sel) attachTo(sel);
  }

  function createManager(sc) {
    if (typeof BABYLON === 'undefined' || !BABYLON.GizmoManager) {
      console.warn('[Gizmo] BABYLON.GizmoManager không có — gizmo bị tắt, các phím tắt vẫn hoạt động.');
      gizmoManager = null;
      return;
    }
    try {
      if (gizmoManager && typeof gizmoManager.dispose === 'function') {
        try { gizmoManager.dispose(); } catch (e) { /* ignore */ }
      }
      gizmoManager = new BABYLON.GizmoManager(sc);
      // Không cho gizmo tự attach khi click (SelectionManager mới là nguồn chọn).
      gizmoManager.usePointerToAttachGizmos = false;
      applyModeToManager();
      applySnapToManager();
      // Đồng bộ transform khi người dùng thả chuột sau khi kéo gizmo.
      if (gizmoManager.onDragEndObservable && typeof gizmoManager.onDragEndObservable.add === 'function') {
        gizmoManager.onDragEndObservable.add(function () { syncAttachedTransform(); });
      }
      // Một số bản Babylon chỉ có observable trên từng gizmo con.
      ['positionGizmo', 'rotationGizmo', 'scaleGizmo'].forEach(function (key) {
        var g = gizmoManager[key];
        if (g && g.onDragEndObservable && typeof g.onDragEndObservable.add === 'function') {
          g.onDragEndObservable.add(function () { syncAttachedTransform(); });
        }
      });
    } catch (e) {
      console.warn('[Gizmo] Không khởi tạo được GizmoManager:', e);
      gizmoManager = null;
    }
  }

  function attachTo(obj) {
    if (!obj) { detach(); return; }
    attachedId = obj.id;
    if (!gizmoManager) {
      if (!scene) { scene = getScene(); if (scene) createManager(scene); }
      if (!gizmoManager) return; // fallback: không crash, chỉ không có gizmo hình.
    }
    try {
      if (obj.babylonNode) gizmoManager.attachToMesh(obj.babylonNode);
      else gizmoManager.attachToMesh(null);
    } catch (e) { console.warn('[Gizmo] attachToMesh lỗi:', e); }
  }

  function detach() {
    attachedId = null;
    if (!gizmoManager) return;
    try { gizmoManager.attachToMesh(null); } catch (e) { console.warn('[Gizmo] detach lỗi:', e); }
  }

  function setMode(m) {
    if (m !== 'move' && m !== 'rotate' && m !== 'scale') return;
    mode = m;
    applyModeToManager();
    emit('gizmo-mode-changed', { mode: mode });
  }
  function setSpace(s) {
    if (s !== 'local' && s !== 'world') return;
    space = s;
    applyModeToManager();
  }
  function setSnap(enabled, size) {
    snapEnabled = !!enabled;
    if (typeof size === 'number' && size > 0) snapSize = size;
    applySnapToManager();
  }

  function deleteSelected() {
    var obj = selectedObject();
    if (!obj) return;
    var id = obj.id;
    var snapshot = JSON.parse(JSON.stringify(obj));
    if (PE.SceneManager && typeof PE.SceneManager.removeObject === 'function') {
      try { PE.SceneManager.removeObject(id); } catch (e) { console.warn('[Gizmo] removeObject lỗi:', e); return; }
    } else {
      var s = getState();
      if (!s) return;
      s.objects = (s.objects || []).filter(function (o) { return o.id !== id; });
      s.selected = null; s.selectedIds = [];
      emit('object-removed', { id: id });
    }
    if (PE.UndoRedoManager && typeof PE.UndoRedoManager.push === 'function') {
      try {
        PE.UndoRedoManager.push({
          label: 'Xóa ' + (snapshot.name || id),
          undo: function () {
            if (PE.SceneManager && typeof PE.SceneManager.addObject === 'function') {
              try { PE.SceneManager.addObject(snapshot); } catch (e) { /* ignore */ }
            }
          },
          redo: function () {
            if (PE.SceneManager && typeof PE.SceneManager.removeObject === 'function') {
              try { PE.SceneManager.removeObject(id); } catch (e) { /* ignore */ }
            }
          }
        });
      } catch (e) { console.warn('[Gizmo] push undo lỗi:', e); }
    }
    detach();
    emit('hierarchy-changed', { id: id });
  }

  function duplicateSelected() {
    var obj = selectedObject();
    if (!obj) return;
    if (PE.SceneManager && typeof PE.SceneManager.duplicateObject === 'function') {
      try { PE.SceneManager.duplicateObject(obj.id); } catch (e) { console.warn('[Gizmo] duplicate lỗi:', e); }
    }
  }

  function bindEvents() {
    if (PE.EventBus && typeof PE.EventBus.on === 'function') {
      try {
        PE.EventBus.on('selection-changed', function (data) {
          var obj = null;
          if (data && data.id) obj = findById(data.id);
          else obj = selectedObject();
          if (obj) attachTo(obj); else detach();
        });
        PE.EventBus.on('engine-ready', function () {
          scene = getScene();
          if (scene) createManager(scene);
        });
        PE.EventBus.on('scene-loaded', function () {
          scene = getScene();
          if (scene) createManager(scene);
          detach();
        });
        PE.EventBus.on('object-removed', function (data) {
          if (data && data.id === attachedId) detach();
        });
      } catch (e) { console.warn('[Gizmo] đăng ký EventBus lỗi:', e); }
    }
  }

  function isTypingTarget(ev) {
    var t = ev.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  function bindShortcuts() {
    if (shortcutsBound) return;
    shortcutsBound = true;
    document.addEventListener('keydown', function (ev) {
      if (isTypingTarget(ev)) return;
      var mod = ev.ctrlKey || ev.metaKey;
      if (mod && (ev.key === 'z' || ev.key === 'Z')) {
        ev.preventDefault();
        if (PE.UndoRedoManager && typeof PE.UndoRedoManager.undo === 'function') {
          try { PE.UndoRedoManager.undo(); } catch (e) { console.warn('[Gizmo] undo lỗi:', e); }
        }
        return;
      }
      if (mod && (ev.key === 'y' || ev.key === 'Y')) {
        ev.preventDefault();
        if (PE.UndoRedoManager && typeof PE.UndoRedoManager.redo === 'function') {
          try { PE.UndoRedoManager.redo(); } catch (e) { console.warn('[Gizmo] redo lỗi:', e); }
        }
        return;
      }
      if (mod && (ev.key === 'd' || ev.key === 'D')) {
        ev.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod) return;
      switch (ev.key) {
        case 'w': case 'W': setMode('move'); break;
        case 'e': case 'E': setMode('rotate'); break;
        case 'r': case 'R': setMode('scale'); break;
        case 'f': case 'F':
          if (PE.Engine && typeof PE.Engine.focusSelected === 'function') {
            try { PE.Engine.focusSelected(); } catch (e) { console.warn('[Gizmo] focus lỗi:', e); }
          }
          break;
        case 'Delete': case 'Backspace':
          ev.preventDefault();
          deleteSelected();
          break;
        default: break;
      }
    });
  }

  PE.TransformGizmo = {
    init: init,
    setMode: setMode,
    setSpace: setSpace,
    setSnap: setSnap,
    attachTo: attachTo,
    detach: detach,
    getMode: function () { return mode; },
    getSpace: function () { return space; },
    isAvailable: function () { return !!gizmoManager; }
  };
})();
