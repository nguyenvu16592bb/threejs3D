'use strict';
/* SceneManager.js — Quản lý GameObject + hierarchy + serialize + scene mặc định (đảo nổi).
   Nhóm CORE. Tạo BABYLON mesh thật qua MeshBuilder. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var state = window.PixiEngine.state;
  var idCounter = 0;
  var groundBlocks = []; // {minX,maxX,minZ,maxZ,topY} — cho getGroundHeight()
  var suppressUndo = false;

  function genId(prefix) {
    idCounter += 1;
    return (prefix || 'obj') + '-' + Date.now().toString(36) + '-' + idCounter;
  }
  function getScene() { return state.scene; }
  function emit(ev, data) { if (window.PixiEngine.EventBus) { window.PixiEngine.EventBus.emit(ev, data); } }
  function markDirty() {
    if (window.PixiEngine.ProjectManager) { window.PixiEngine.ProjectManager.markDirty(); }
    emit('scene-changed', { objects: state.objects.length });
  }
  /* v5.0.0: mirror sang ThreeRenderer khi đang ở chế độ three — nếu không,
     object thêm/xóa/sửa lúc ở chế độ three sẽ không hiện bên three cho tới
     khi switchTo() rebuild. Phòng thủ try/catch, không phá luồng Babylon. */
  function syncThree(action, obj) {
    try {
      if (!window.PixiEngine || window.PixiEngine.state.renderer !== 'three') { return; }
      var TR = window.PixiEngine.ThreeRenderer;
      if (!TR) { return; }
      if (action === 'add' && TR.addObject) { TR.addObject(obj); }
      else if (action === 'remove' && TR.removeObject) { TR.removeObject(obj && obj.id); }
      else if (action === 'update' && TR.updateObject) { TR.updateObject(obj); }
    } catch (e) { console.warn('[SceneManager] sync three failed:', e); }
  }

  function defaultTransform() {
    return {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
  }
  function mergeTransform(t) {
    var d = defaultTransform();
    if (!t) { return d; }
    ['position', 'rotation', 'scale'].forEach(function (k) {
      if (t[k]) {
        ['x', 'y', 'z'].forEach(function (a) { if (typeof t[k][a] === 'number') { d[k][a] = t[k][a]; } });
      }
    });
    return d;
  }
  function applyTransformToNode(node, tr) {
    if (!node) { return; }
    if (node.position) { node.position.set(tr.position.x, tr.position.y, tr.position.z); }
    if (node.rotation) { node.rotation.set(tr.rotation.x, tr.rotation.y, tr.rotation.z); }
    if (node.scaling) { node.scaling.set(tr.scale.x, tr.scale.y, tr.scale.z); }
  }
  function readTransformFromNode(node) {
    var tr = defaultTransform();
    if (!node) { return tr; }
    if (node.position) { tr.position = { x: node.position.x, y: node.position.y, z: node.position.z }; }
    if (node.rotation) { tr.rotation = { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z }; }
    if (node.scaling) { tr.scale = { x: node.scaling.x, y: node.scaling.y, z: node.scaling.z }; }
    return tr;
  }

  function makeMaterial(scene, color, alpha) {
    var mat = new BABYLON.StandardMaterial('mat-' + genId('m'), scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString(color || '#888888');
    if (typeof alpha === 'number' && alpha < 1) { mat.alpha = alpha; }
    mat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
    return mat;
  }

  // Tạo mesh đơn từ def.meshType: box|cylinder|sphere|cone|ground|plane|torus
  function createMeshFromDef(def, scene) {
    var name = def.name || 'Object';
    var opts = def.options || {};
    var size = def.size || {};
    var mesh = null;
    switch (def.meshType) {
      case 'cylinder':
        mesh = BABYLON.MeshBuilder.CreateCylinder(name, {
          height: size.height || opts.height || 1,
          diameterTop: size.diameterTop || opts.diameterTop || size.diameter || 1,
          diameterBottom: size.diameterBottom || opts.diameterBottom || size.diameter || 1,
          tessellation: opts.tessellation || 16
        }, scene);
        break;
      case 'sphere':
        mesh = BABYLON.MeshBuilder.CreateSphere(name, {
          diameter: size.diameter || 1, diameterX: size.diameterX, diameterY: size.diameterY, diameterZ: size.diameterZ,
          segments: opts.segments || 16
        }, scene);
        break;
      case 'cone':
        mesh = BABYLON.MeshBuilder.CreateCylinder(name, {
          height: size.height || 1, diameterTop: 0.01,
          diameterBottom: size.diameter || size.diameterBottom || 1, tessellation: opts.tessellation || 16
        }, scene);
        break;
      case 'ground':
        mesh = BABYLON.MeshBuilder.CreateGround(name, {
          width: size.width || 10, height: size.height || 10, subdivisions: opts.subdivisions || 1
        }, scene);
        break;
      case 'plane':
        mesh = BABYLON.MeshBuilder.CreatePlane(name, {
          width: size.width || 1, height: size.height || 1
        }, scene);
        break;
      case 'torus':
        mesh = BABYLON.MeshBuilder.CreateTorus(name, {
          diameter: size.diameter || 1, thickness: size.thickness || 0.2, tessellation: opts.tessellation || 16
        }, scene);
        break;
      case 'box':
      default:
        mesh = BABYLON.MeshBuilder.CreateBox(name, {
          width: size.width || 1, height: size.height || 1, depth: size.depth || 1
        }, scene);
        break;
    }
    if (def.color) { mesh.material = makeMaterial(scene, def.color, def.opacity); }
    return mesh;
  }

  // Tạo node composite (cây, nhà, cầu...) — def.build(scene, parentNode) trả về node gốc.
  function addObject(def) {
    def = def || {};
    var scene = getScene();
    var before = (!suppressUndo && window.PixiEngine.UndoRedoManager) ? serializeScene() : null;
    // Object composite (node đã build sẵn vị trí): lấy transform từ chính node,
    // không ghi đè về (0,0,0) bằng transform mặc định.
    var tr = def.transform ? mergeTransform(def.transform)
      : (def.node ? readTransformFromNode(def.node) : defaultTransform());
    var node = null;
    if (def.node) {
      node = def.node;
    } else if (typeof def.build === 'function') {
      node = def.build(scene, tr);
    } else if (def.type === 'light') {
      node = new BABYLON.TransformNode(def.name || 'Light', scene);
    } else if (scene && typeof BABYLON !== 'undefined') {
      node = createMeshFromDef(def, scene);
    }
    if (node) { applyTransformToNode(node, tr); }

    var obj = {
      id: def.id || genId(def.type || 'obj'),
      name: def.name || (def.type || 'Object'),
      type: def.type || 'object',
      parentId: def.parentId || null,
      children: [],
      transform: tr,
      babylonNode: node || null,
      components: def.components ? def.components.slice() : [],
      visible: def.visible !== false,
      active: def.active !== false,
      tag: def.tag || '',
      layer: def.layer || 'Default',
      static: !!def.static,
      meshType: def.meshType || null,
      size: def.size || null,
      options: def.options || null,
      color: def.color || null,
      opacity: (typeof def.opacity === 'number') ? def.opacity : null,
      _def: def
    };
    if (node) { node.metadata = node.metadata || {}; node.metadata.gameObjectId = obj.id; }
    if (node) { node.setEnabled(obj.visible); }
    state.objects.push(obj);
    if (obj.parentId) {
      var parent = findById(obj.parentId);
      if (parent && parent.children.indexOf(obj.id) === -1) { parent.children.push(obj.id); }
      if (parent && parent.babylonNode && node) { node.parent = parent.babylonNode; }
    }
    if (obj.type === 'terrain-block' && node) {
      var s = obj.size || { width: 1, height: 1, depth: 1 };
      var w = (s.width || s.diameter || 1) * tr.scale.x;
      var d = (s.depth || s.width || s.diameter || 1) * tr.scale.z;
      var h = (s.height || 1) * tr.scale.y;
      groundBlocks.push({
        minX: tr.position.x - w / 2, maxX: tr.position.x + w / 2,
        minZ: tr.position.z - d / 2, maxZ: tr.position.z + d / 2,
        topY: tr.position.y + h / 2
      });
    }
    if (!suppressUndo && before && window.PixiEngine.UndoRedoManager) {
      var after = serializeScene();
      var action = window.PixiEngine.UndoRedoManager.snapshotAction('Thêm ' + obj.name, before, after);
      if (action) { window.PixiEngine.UndoRedoManager.push(action); }
    }
    emit('hierarchy-changed', { action: 'add', id: obj.id });
    syncThree('add', obj);
    markDirty();
    return obj;
  }

  function findById(id) {
    if (!id) { return null; }
    for (var i = 0; i < state.objects.length; i++) {
      if (state.objects[i].id === id) { return state.objects[i]; }
    }
    return null;
  }
  function getChildren(id) {
    var out = [];
    state.objects.forEach(function (o) { if (o.parentId === id) { out.push(o); } });
    return out;
  }
  function getRootObjects() {
    return state.objects.filter(function (o) { return !o.parentId; });
  }

  function removeObject(id, skipUndo) {
    var obj = findById(id);
    if (!obj) { return false; }
    var before = (!suppressUndo && !skipUndo && window.PixiEngine.UndoRedoManager) ? serializeScene() : null;
    // Xóa con trước (đệ quy).
    getChildren(id).slice().forEach(function (child) { removeObject(child.id, true); });
    if (obj.parentId) {
      var parent = findById(obj.parentId);
      if (parent) { var pi = parent.children.indexOf(id); if (pi !== -1) { parent.children.splice(pi, 1); } }
    }
    if (obj.babylonNode && !obj.babylonNode.isDisposed()) { obj.babylonNode.dispose(); }
    var idx = state.objects.indexOf(obj);
    if (idx !== -1) { state.objects.splice(idx, 1); }
    if (window.PixiEngine.SelectionManager && window.PixiEngine.SelectionManager.isSelected(id)) {
      window.PixiEngine.SelectionManager.clearSelection();
    }
    rebuildGroundBlocks();
    if (before && window.PixiEngine.UndoRedoManager) {
      var after = serializeScene();
      var action = window.PixiEngine.UndoRedoManager.snapshotAction('Xóa ' + obj.name, before, after);
      if (action) { window.PixiEngine.UndoRedoManager.push(action); }
    }
    emit('hierarchy-changed', { action: 'remove', id: id });
    syncThree('remove', obj);
    markDirty();
    return true;
  }

  function duplicateObject(id) {
    var src = findById(id);
    if (!src) { return null; }
    var def = JSON.parse(JSON.stringify({
      name: src.name + ' (bản sao)', type: src.type, meshType: src.meshType,
      size: src.size, options: src.options, color: src.color, opacity: src.opacity,
      transform: {
        position: { x: src.transform.position.x + 1, y: src.transform.position.y, z: src.transform.position.z + 1 },
        rotation: src.transform.rotation, scale: src.transform.scale
      },
      components: src.components, tag: src.tag, layer: src.layer, static: src.static
    }));
    // Object composite (cây/nhà...) không clone được bằng meshType: clone node Babylon.
    if (!def.meshType && src.babylonNode && src.babylonNode.clone) {
      var cloned = src.babylonNode.clone(def.name);
      def.node = cloned;
    }
    return addObject(def);
  }

  function setTransform(id, transform, commitUndo) {
    var obj = findById(id);
    if (!obj) { return false; }
    var before = (commitUndo && window.PixiEngine.UndoRedoManager) ? serializeScene() : null;
    obj.transform = mergeTransform(transform);
    applyTransformToNode(obj.babylonNode, obj.transform);
    rebuildGroundBlocks();
    if (before && window.PixiEngine.UndoRedoManager) {
      var after = serializeScene();
      var action = window.PixiEngine.UndoRedoManager.snapshotAction('Di chuyển ' + obj.name, before, after);
      if (action) { window.PixiEngine.UndoRedoManager.push(action); }
    }
    emit('transform-changed', { id: id });
    syncThree('update', obj);
    markDirty();
    return true;
  }

  function setVisible(id, visible) {
    var obj = findById(id);
    if (!obj) { return false; }
    obj.visible = !!visible;
    if (obj.babylonNode) { obj.babylonNode.setEnabled(obj.visible); }
    syncThree('update', obj);
    emit('hierarchy-changed', { action: 'visibility', id: id });
    markDirty();
    return true;
  }

  function rebuildGroundBlocks() {
    groundBlocks.length = 0;
    state.objects.forEach(function (o) {
      if (o.type !== 'terrain-block') { return; }
      var s = o.size || { width: 1, height: 1, depth: 1 };
      var w = (s.width || s.diameter || 1) * o.transform.scale.x;
      var d = (s.depth || s.width || s.diameter || 1) * o.transform.scale.z;
      var h = (s.height || 1) * o.transform.scale.y;
      groundBlocks.push({
        minX: o.transform.position.x - w / 2, maxX: o.transform.position.x + w / 2,
        minZ: o.transform.position.z - d / 2, maxZ: o.transform.position.z + d / 2,
        topY: o.transform.position.y + h / 2
      });
    });
  }

  // Độ cao mặt đất gần nhất tại (x,z): trong bounds tầng đảo -> y top cao nhất,
  // ngược lại -> mặt nước y = -1. Nhóm Runtime dùng cho collision.
  function getGroundHeight(x, z) {
    var best = null;
    for (var i = 0; i < groundBlocks.length; i++) {
      var b = groundBlocks[i];
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        if (best === null || b.topY > best) { best = b.topY; }
      }
    }
    return best === null ? -1 : best;
  }

  function serializeScene() {
    return {
      version: 1,
      name: (window.PixiEngine.ProjectManager && window.PixiEngine.ProjectManager.projectName) || 'Untitled',
      objects: state.objects.map(function (o) {
        return {
          id: o.id, name: o.name, type: o.type, parentId: o.parentId,
          transform: JSON.parse(JSON.stringify(o.transform)),
          components: o.components, visible: o.visible, active: o.active,
          tag: o.tag, layer: o.layer, static: o.static,
          meshType: o.meshType, size: o.size, options: o.options,
          color: o.color, opacity: o.opacity
        };
      })
    };
  }

  function deserializeScene(json) {
    if (!json || !Array.isArray(json.objects)) { return false; }
    clearScene(true);
    var oldSuppress = suppressUndo;
    suppressUndo = true;
    try {
      json.objects.forEach(function (d) {
        // Object composite (cây/nhà/cầu...) không serialize được node:
        // dựng lại node từ transform đã lưu (màu mặc định của builder).
        if (!d.meshType && d.type !== 'light' && getScene() && typeof BABYLON !== 'undefined') {
          var p = (d.transform && d.transform.position) || { x: 0, y: 0, z: 0 };
          var sc = (d.transform && d.transform.scale) || { x: 1, y: 1, z: 1 };
          var rotY = (d.transform && d.transform.rotation) ? d.transform.rotation.y : 0;
          var scn = getScene();
          if (d.type === 'tree') { d.node = buildTree(scn, p.x, p.y, p.z, sc.x || 1); }
          else if (d.type === 'house') { d.node = buildHouse(scn, p.x, p.y, p.z, '#FFF3E0', '#D32F2F', rotY); }
          else if (d.type === 'temple') { d.node = buildTorii(scn, p.x, p.y, p.z); }
          else if (d.type === 'bridge') { d.node = buildBridge(scn, p.x, p.y, p.z); }
          else if (d.type === 'chest') { d.node = buildChest(scn, p.x, p.y, p.z); }
          else if (d.type === 'waterfall') { d.node = buildWaterfall(scn, p.x, p.y, p.z); }
          d.transform = null; // để addObject đọc transform từ node vừa dựng
        }
        addObject(d);
      });
    } finally { suppressUndo = oldSuppress; }
    emit('hierarchy-changed', { action: 'load' });
    markDirty();
    return true;
  }

  function _restoreSnapshot(json) {
    var oldSuppress = suppressUndo;
    suppressUndo = true;
    try { deserializeScene(json); } finally { suppressUndo = oldSuppress; }
  }

  function clearScene(skipEmit) {
    var oldSuppress = suppressUndo;
    suppressUndo = true;
    try {
      state.objects.slice().forEach(function (o) {
        if (o.babylonNode && !o.babylonNode.isDisposed()) { try { o.babylonNode.dispose(); } catch (e) {} }
      });
      state.objects.length = 0;
      groundBlocks.length = 0;
      if (window.PixiEngine.SelectionManager) { window.PixiEngine.SelectionManager.clearSelection(); }
    } finally { suppressUndo = oldSuppress; }
    if (!skipEmit) { emit('hierarchy-changed', { action: 'clear' }); markDirty(); }
  }

  /* ---------- Builders cho scene mặc định ---------- */
  function childMesh(scene, parent, meshType, name, size, color, pos, rot) {
    var m = createMeshFromDef({ name: name, meshType: meshType, size: size, color: color }, scene);
    m.parent = parent;
    if (pos) { m.position.set(pos.x || 0, pos.y || 0, pos.z || 0); }
    if (rot) { m.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0); }
    return m;
  }

  function buildTree(scene, x, y, z, s) {
    var root = new BABYLON.TransformNode('Tree', scene);
    childMesh(scene, root, 'cylinder', 'ThanCay', { height: 1.6, diameterTop: 0.25, diameterBottom: 0.4 }, '#8B5A2B', { x: 0, y: 0.8, z: 0 });
    childMesh(scene, root, 'cone', 'Tan1', { height: 1.4, diameter: 1.8 }, '#2E7D32', { x: 0, y: 2.0, z: 0 });
    childMesh(scene, root, 'cone', 'Tan2', { height: 1.2, diameter: 1.4 }, '#388E3C', { x: 0, y: 2.8, z: 0 });
    childMesh(scene, root, 'cone', 'Tan3', { height: 1.0, diameter: 1.0 }, '#43A047', { x: 0, y: 3.5, z: 0 });
    root.scaling.set(s, s, s);
    root.position.set(x, y, z);
    return root;
  }
  function buildHouse(scene, x, y, z, wallColor, roofColor, rotY) {
    var root = new BABYLON.TransformNode('House', scene);
    childMesh(scene, root, 'box', 'ThanNha', { width: 2.4, height: 1.6, depth: 2 }, wallColor, { x: 0, y: 0.8, z: 0 });
    var roof = childMesh(scene, root, 'box', 'MaiNha', { width: 2.9, height: 0.25, depth: 2.5 }, roofColor, { x: 0, y: 1.85, z: 0 });
    roof.rotation.z = 0.18;
    childMesh(scene, root, 'box', 'Cua', { width: 0.7, height: 1.0, depth: 0.1 }, '#5D4037', { x: 0, y: 0.5, z: 1.02 });
    root.position.set(x, y, z);
    root.rotation.y = rotY || 0;
    return root;
  }
  function buildTorii(scene, x, y, z) {
    var root = new BABYLON.TransformNode('Torii', scene);
    childMesh(scene, root, 'cylinder', 'CotTrai', { height: 3, diameter: 0.28 }, '#C62828', { x: -1.2, y: 1.5, z: 0 });
    childMesh(scene, root, 'cylinder', 'CotPhai', { height: 3, diameter: 0.28 }, '#C62828', { x: 1.2, y: 1.5, z: 0 });
    childMesh(scene, root, 'box', 'XaNgang', { width: 3.4, height: 0.25, depth: 0.3 }, '#C62828', { x: 0, y: 2.6, z: 0 });
    childMesh(scene, root, 'box', 'MaiTorii', { width: 3.8, height: 0.22, depth: 0.7 }, '#8E0000', { x: 0, y: 3.05, z: 0 });
    root.position.set(x, y, z);
    return root;
  }
  function buildBridge(scene, x, y, z) {
    var root = new BABYLON.TransformNode('Bridge', scene);
    for (var i = 0; i < 7; i++) {
      childMesh(scene, root, 'box', 'Van' + i, { width: 1.2, height: 0.12, depth: 0.5 }, '#A1887F', { x: 0, y: 0, z: -1.8 + i * 0.6 });
    }
    childMesh(scene, root, 'box', 'LanCanTrai', { width: 0.1, height: 0.5, depth: 3.8 }, '#8D6E63', { x: -0.65, y: 0.3, z: 0 });
    childMesh(scene, root, 'box', 'LanCanPhai', { width: 0.1, height: 0.5, depth: 3.8 }, '#8D6E63', { x: 0.65, y: 0.3, z: 0 });
    root.position.set(x, y, z);
    root.rotation.y = Math.PI / 4;
    return root;
  }
  function buildChest(scene, x, y, z) {
    var root = new BABYLON.TransformNode('Chest', scene);
    childMesh(scene, root, 'box', 'ThanRuong', { width: 1.0, height: 0.6, depth: 0.7 }, '#6D4C41', { x: 0, y: 0.3, z: 0 });
    childMesh(scene, root, 'box', 'NapRuong', { width: 1.05, height: 0.25, depth: 0.75 }, '#8D6E63', { x: 0, y: 0.7, z: 0 });
    childMesh(scene, root, 'box', 'KhoaVang', { width: 0.2, height: 0.2, depth: 0.08 }, '#FFD54F', { x: 0, y: 0.55, z: 0.38 });
    root.position.set(x, y, z);
    return root;
  }
  function buildWaterfall(scene, x, y, z) {
    var root = new BABYLON.TransformNode('Waterfall', scene);
    var plane = BABYLON.MeshBuilder.CreatePlane('ThacNuoc', { width: 1.6, height: 4 }, scene);
    plane.parent = root;
    plane.position.set(0, -1, 0);
    var mat = new BABYLON.StandardMaterial('thac-mat', scene);
    mat.diffuseColor = new BABYLON.Color3(0.4, 0.75, 0.95); mat.alpha = 0.75;
    plane.material = mat;
    childMesh(scene, root, 'box', 'DaThac', { width: 2.0, height: 0.8, depth: 0.6 }, '#9E9E9E', { x: 0, y: 1.2, z: -0.2 });
    root.position.set(x, y, z);
    return root;
  }

  function buildDefaultScene() {
    var scene = getScene();
    if (!scene || typeof BABYLON === 'undefined') { return false; }
    clearScene(true);
    var oldSuppress = suppressUndo;
    suppressUndo = true;
    try {
      // Môi trường: trời xanh + sương mù + 2 đèn (đăng ký dạng light).
      scene.clearColor = new BABYLON.Color4(0.53, 0.71, 0.84, 1);
      scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
      scene.fogDensity = 0.0035;
      if (window.PixiEngine.LightingManager) {
        window.PixiEngine.LightingManager.setSun(1.0, '#FFF2D9');
        window.PixiEngine.LightingManager.setAmbient('#B0C4DE', 0.7);
      }
      addObject({ name: 'Ánh sáng mặt trời', type: 'light', tag: 'sun' });
      addObject({ name: 'Ánh sáng môi trường', type: 'light', tag: 'ambient' });

      // 3 tầng đảo đất cỏ (đất nâu + cỏ xanh, kích thước giảm dần, lệch vị trí).
      addObject({ name: 'Đất tầng 1', type: 'terrain-block', meshType: 'box', size: { width: 14, height: 3, depth: 14 }, color: '#8D6E63', transform: { position: { x: 0, y: -1.5, z: 0 } } });
      addObject({ name: 'Cỏ tầng 1', type: 'terrain-block', meshType: 'box', size: { width: 14.4, height: 0.4, depth: 14.4 }, color: '#66BB6A', transform: { position: { x: 0, y: 0.2, z: 0 } } });
      addObject({ name: 'Đất tầng 2', type: 'terrain-block', meshType: 'box', size: { width: 9, height: 2, depth: 9 }, color: '#8D6E63', transform: { position: { x: 8, y: -1.9, z: 5 } } });
      addObject({ name: 'Cỏ tầng 2', type: 'terrain-block', meshType: 'box', size: { width: 9.4, height: 0.4, depth: 9.4 }, color: '#66BB6A', transform: { position: { x: 8, y: -0.7, z: 5 } } });
      addObject({ name: 'Đất tầng 3', type: 'terrain-block', meshType: 'box', size: { width: 6, height: 1.5, depth: 6 }, color: '#8D6E63', transform: { position: { x: -8, y: -1.9, z: -5 } } });
      addObject({ name: 'Cỏ tầng 3', type: 'terrain-block', meshType: 'box', size: { width: 6.4, height: 0.4, depth: 6.4 }, color: '#66BB6A', transform: { position: { x: -8, y: -0.95, z: -5 } } });
      // Đáy đảo (nón ngược) cho cảm giác đảo nổi.
      addObject({ name: 'Đáy đảo', type: 'terrain-block', meshType: 'cylinder', size: { height: 5, diameterTop: 11, diameterBottom: 1.5 }, color: '#795548', transform: { position: { x: 0, y: -5.5, z: 0 } } });

      // Mặt nước xanh trong suốt dưới đảo (y = -1).
      addObject({ name: 'Mặt nước', type: 'water', meshType: 'ground', size: { width: 80, height: 80 }, color: '#4FC3F7', opacity: 0.65, transform: { position: { x: 0, y: -1, z: 0 } } });

      // 5 cây thông.
      var trees = [[-4.5, 0.4, -4, 1], [4.5, 0.4, -3.5, 1.1], [-5, 0.4, 3.5, 0.9], [5.5, 0.4, 4, 1], [8, -0.5, 5, 0.9]];
      trees.forEach(function (t, i) {
        addObject({ name: 'Cây thông ' + (i + 1), type: 'tree', node: buildTree(scene, t[0], t[1], t[2], t[3]) });
      });

      // 4 đá.
      var rocks = [[-2, 0.4, 5.5, 1.1], [2.5, 0.4, -5.5, 0.9], [9.5, -0.5, 2.5, 0.8], [-9, -0.75, -3, 0.7]];
      rocks.forEach(function (r, i) {
        addObject({ name: 'Tảng đá ' + (i + 1), type: 'rock', meshType: 'sphere', size: { diameterX: r[3] * 1.4, diameterY: r[3] * 0.8, diameterZ: r[3] * 1.2 }, color: '#9E9E9E', transform: { position: { x: r[0], y: r[1], z: r[2] } } });
      });

      // 1 rương.
      addObject({ name: 'Rương kho báu', type: 'chest', node: buildChest(scene, 3, 0.4, 3) });
      // 6 đồng xu vàng (xoay đứng).
      var coins = [[1.5, 1, 2], [2.2, 1, 2.6], [1.8, 1.6, 3.2], [4, 1, 1.5], [-3, 1, -2], [8.5, 0.2, 6]];
      coins.forEach(function (c, i) {
        addObject({ name: 'Đồng xu ' + (i + 1), type: 'coin', meshType: 'cylinder', size: { height: 0.08, diameter: 0.5 }, color: '#FFD54F', transform: { position: { x: c[0], y: c[1], z: c[2] }, rotation: { x: Math.PI / 2, y: 0, z: 0 } } });
      });

      // 1 cầu gỗ, 1 thác nước.
      addObject({ name: 'Cầu gỗ', type: 'bridge', node: buildBridge(scene, 0, 0.6, 6.5) });
      addObject({ name: 'Thác nước', type: 'waterfall', node: buildWaterfall(scene, 7.2, 0.4, 0) });

      // 2 nhà nhỏ.
      addObject({ name: 'Nhà nhỏ 1', type: 'house', node: buildHouse(scene, -3.5, 0.4, -1.5, '#FFF3E0', '#D32F2F', 0.4) });
      addObject({ name: 'Nhà nhỏ 2', type: 'house', node: buildHouse(scene, 8, -0.5, 7, '#E3F2FD', '#1976D2', -0.6) });
      // 1 cổng torii / đền.
      addObject({ name: 'Cổng Torii', type: 'temple', node: buildTorii(scene, 0, 0.4, -6) });

      // 3 hoa.
      var flowers = [[-1.5, 0.6, 4.5, '#F06292'], [3.5, 0.6, -1, '#FFEB3B'], [-6, 0.6, 1, '#BA68C8']];
      flowers.forEach(function (f, i) {
        addObject({ name: 'Hoa ' + (i + 1), type: 'flower', meshType: 'sphere', size: { diameter: 0.3 }, color: f[3], transform: { position: { x: f[0], y: f[1], z: f[2] } } });
      });
      // 2 đèn lồng đỏ.
      addObject({ name: 'Đèn lồng 1', type: 'lantern', meshType: 'sphere', size: { diameter: 0.5 }, color: '#E53935', transform: { position: { x: -1.2, y: 1.8, z: -6 } } });
      addObject({ name: 'Đèn lồng 2', type: 'lantern', meshType: 'sphere', size: { diameter: 0.5 }, color: '#E53935', transform: { position: { x: 1.2, y: 1.8, z: -6 } } });
    } finally { suppressUndo = oldSuppress; }
    emit('hierarchy-changed', { action: 'build-default' });
    markDirty();
    return true;
  }

  window.PixiEngine.SceneManager = {
    addObject: addObject, removeObject: removeObject, duplicateObject: duplicateObject,
    findById: findById, getChildren: getChildren, getRootObjects: getRootObjects,
    serializeScene: serializeScene, deserializeScene: deserializeScene,
    clearScene: clearScene, buildDefaultScene: buildDefaultScene,
    getGroundHeight: getGroundHeight, setTransform: setTransform, setVisible: setVisible,
    _restoreSnapshot: _restoreSnapshot, _rebuildGroundBlocks: rebuildGroundBlocks
  };
})();
