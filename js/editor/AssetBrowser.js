'use strict';
/* PixiJS 3D Game Engine Editor — AssetBrowser (nhóm EDITOR)
 * Thư mục assets ảo: models, textures, materials, animations, prefabs, scenes,
 * audio, ui. Nguồn: state.objects loại prefab + materials (MaterialManager nếu
 * có) + scene đã lưu localStorage. Kéo thả asset vào viewport để thêm object.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var PE = window.PixiEngine;

  var container = null;
  var containerId = 'asset-browser';
  var currentCategory = 'all';
  var searchText = '';
  var selectedAssetId = null;

  var CATEGORIES = [
    { id: 'all', label: 'Tất cả', icon: '🗂️' },
    { id: 'models', label: 'Models', icon: '📦' },
    { id: 'textures', label: 'Textures', icon: '🖼️' },
    { id: 'materials', label: 'Materials', icon: '🎨' },
    { id: 'animations', label: 'Animations', icon: '🎬' },
    { id: 'prefabs', label: 'Prefabs', icon: '🧩' },
    { id: 'scenes', label: 'Scenes', icon: '🗺️' },
    { id: 'audio', label: 'Audio', icon: '🔊' },
    { id: 'ui', label: 'UI', icon: '🪟' }
  ];

  var BUILTIN_ASSETS = [
    { id: 'asset-cube', name: 'Cube', category: 'models', icon: '🧊', type: 'cube', def: { name: 'Cube', type: 'cube' } },
    { id: 'asset-sphere', name: 'Sphere', category: 'models', icon: '🔵', type: 'sphere', def: { name: 'Sphere', type: 'sphere' } },
    { id: 'asset-cylinder', name: 'Cylinder', category: 'models', icon: '🛢️', type: 'cylinder', def: { name: 'Cylinder', type: 'cylinder' } },
    { id: 'asset-plane', name: 'Plane', category: 'models', icon: '▭', type: 'plane', def: { name: 'Plane', type: 'plane' } },
    { id: 'asset-tree', name: 'Cây', category: 'models', icon: '🌲', type: 'tree', def: { name: 'Cây', type: 'tree' } },
    { id: 'asset-light', name: 'Đèn Point', category: 'models', icon: '💡', type: 'light', def: { name: 'Đèn Point', type: 'light' } },
    { id: 'asset-camera', name: 'Camera', category: 'models', icon: '📷', type: 'camera', def: { name: 'Camera', type: 'camera' } },
    { id: 'asset-terrain', name: 'Terrain', category: 'models', icon: '⛰️', type: 'terrain', def: { name: 'Terrain', type: 'terrain' } },
    { id: 'asset-particle', name: 'Hiệu ứng lửa', category: 'prefabs', icon: '✨', type: 'particle', def: { name: 'Hiệu ứng lửa', type: 'particle' } },
    { id: 'asset-mat-default', name: 'Material mặc định', category: 'materials', icon: '🎨', type: 'material', def: null },
    { id: 'asset-anim-idle', name: 'Idle', category: 'animations', icon: '🎬', type: 'animation', def: null },
    { id: 'asset-anim-walk', name: 'Walk', category: 'animations', icon: '🎬', type: 'animation', def: null }
  ];

  function getState() { return (PE.state && typeof PE.state === 'object') ? PE.state : null; }
  function emit(ev, data) {
    if (PE.EventBus && typeof PE.EventBus.emit === 'function') {
      try { PE.EventBus.emit(ev, data); } catch (e) { console.warn('[AssetBrowser] emit lỗi:', e); }
    }
  }

  function collectAssets() {
    var list = BUILTIN_ASSETS.slice();
    var s = getState();
    // Prefab = object trong scene có type prefab (hoặc tag prefab).
    if (s && Array.isArray(s.objects)) {
      s.objects.forEach(function (o) {
        if (!o) return;
        if (o.type === 'prefab' || o.tag === 'prefab') {
          list.push({ id: 'prefab-' + o.id, name: o.name || 'Prefab', category: 'prefabs', icon: '🧩', type: 'prefab', def: { name: o.name, type: o.type, prefabId: o.id } });
        }
      });
    }
    // Vật liệu từ MaterialManager nếu có.
    if (PE.MaterialManager && typeof PE.MaterialManager.listMaterials === 'function') {
      try {
        var mats = PE.MaterialManager.listMaterials() || [];
        mats.forEach(function (m) {
          var name = (m && (m.name || m.id)) || 'Material';
          list.push({ id: 'mat-' + name, name: name, category: 'materials', icon: '🎨', type: 'material', def: null });
        });
      } catch (e) { /* bỏ qua */ }
    }
    // Scene đã lưu trong localStorage (key pixi-scenes / pixi-saved-scenes).
    try {
      ['pixi-scenes', 'pixi-saved-scenes', 'pixiengine-scenes'].forEach(function (key) {
        var raw = localStorage.getItem(key);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        var names = Array.isArray(parsed) ? parsed : Object.keys(parsed);
        names.forEach(function (n) {
          var name = (typeof n === 'string') ? n : (n.name || n.id || 'Scene');
          list.push({ id: 'scene-' + name, name: name, category: 'scenes', icon: '🗺️', type: 'scene', def: null });
        });
      });
    } catch (e) { /* localStorage không có hoặc dữ liệu hỏng */ }
    return list;
  }

  function filteredAssets() {
    var all = collectAssets();
    return all.filter(function (a) {
      if (currentCategory !== 'all' && a.category !== currentCategory) return false;
      if (searchText) {
        var n = (a.name || '').toLowerCase();
        if (n.indexOf(searchText) === -1) return false;
      }
      return true;
    });
  }

  function addAssetToScene(asset, position) {
    if (!asset || !asset.def) {
      console.warn('[AssetBrowser] Asset "' + (asset && asset.name) + '" không thêm được vào scene (chỉ xem trước).');
      return false;
    }
    var def = JSON.parse(JSON.stringify(asset.def));
    if (position) {
      def.transform = def.transform || {};
      def.transform.position = { x: position.x || 0, y: position.y || 0, z: position.z || 0 };
    }
    // Particle: ưu tiên ParticleEditor/VFXManager nếu có.
    if (asset.type === 'particle') {
      if (PE.ParticleEditor && typeof PE.ParticleEditor.addPreset === 'function') {
        try { PE.ParticleEditor.addPreset('fire', position || { x: 0, y: 0, z: 0 }); return true; } catch (e) { console.warn('[AssetBrowser] addPreset lỗi:', e); }
      }
      if (PE.VFXManager && typeof PE.VFXManager.addPreset === 'function') {
        try { PE.VFXManager.addPreset('fire', position || { x: 0, y: 0, z: 0 }); return true; } catch (e) { console.warn('[AssetBrowser] VFX addPreset lỗi:', e); }
      }
    }
    // Prefab: ưu tiên instantiate của PrefabManager nếu có.
    if (asset.type === 'prefab' && def.prefabId && PE.PrefabManager && typeof PE.PrefabManager.instantiate === 'function') {
      try { PE.PrefabManager.instantiate(def.prefabId, position); return true; } catch (e) { console.warn('[AssetBrowser] Prefab instantiate lỗi:', e); }
    }
    if (PE.SceneManager && typeof PE.SceneManager.addObject === 'function') {
      try { PE.SceneManager.addObject(def); return true; } catch (e) { console.warn('[AssetBrowser] addObject lỗi:', e); return false; }
    }
    // Fallback: thêm trực tiếp vào state.
    var s = getState();
    if (!s) { console.warn('[AssetBrowser] Chưa có state — không thêm được object.'); return false; }
    s.objects = Array.isArray(s.objects) ? s.objects : [];
    def.id = 'obj_' + Date.now();
    def.parentId = null; def.children = [];
    def.transform = def.transform || { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
    def.components = []; def.visible = true; def.active = true;
    s.objects.push(def);
    emit('object-added', { id: def.id, object: def });
    emit('hierarchy-changed', { id: def.id });
    return true;
  }

  function groundPositionAtScreenCenter() {
    var s = getState();
    var scene = s ? s.scene : null;
    if (!scene) return { x: 0, y: 0, z: 0 };
    try {
      if (typeof scene.pick === 'function') {
        var pick = scene.pick(window.innerWidth / 2, window.innerHeight / 2);
        if (pick && pick.pickedPoint) return { x: pick.pickedPoint.x, y: pick.pickedPoint.y, z: pick.pickedPoint.z };
      }
    } catch (e) { /* rơi xuống getGroundHeight */ }
    if (PE.SceneManager && typeof PE.SceneManager.getGroundHeight === 'function') {
      try { return { x: 0, y: PE.SceneManager.getGroundHeight(0, 0), z: 0 }; } catch (e) { /* ignore */ }
    }
    return { x: 0, y: 0, z: 0 };
  }

  function render() {
    if (!container) return;
    container.innerHTML = '';

    var toolbar = document.createElement('div');
    toolbar.className = 'asset-toolbar';
    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'asset-search';
    search.placeholder = '🔍 Tìm asset...';
    search.value = searchText;
    search.setAttribute('aria-label', 'Tìm asset');
    search.addEventListener('input', function () { searchText = search.value.trim().toLowerCase(); render(); });
    toolbar.appendChild(search);

    var filter = document.createElement('select');
    filter.className = 'asset-filter';
    filter.setAttribute('aria-label', 'Lọc theo danh mục');
    CATEGORIES.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.icon + ' ' + c.label;
      if (c.id === currentCategory) opt.selected = true;
      filter.appendChild(opt);
    });
    filter.addEventListener('change', function () { currentCategory = filter.value; render(); });
    toolbar.appendChild(filter);

    var importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'asset-btn';
    importBtn.textContent = '⬆️ Import';
    importBtn.title = 'Import file .glb / .gltf / .obj';
    importBtn.addEventListener('click', function () { fileInput.click(); });
    toolbar.appendChild(importBtn);

    var refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'asset-btn';
    refreshBtn.textContent = '🔄 Làm mới';
    refreshBtn.addEventListener('click', render);
    toolbar.appendChild(refreshBtn);
    container.appendChild(toolbar);

    // Input file ẩn cho Import.
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.glb,.gltf,.obj';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInput.files || []);
      if (!files.length) return;
      if (PE.ModelImporter && typeof PE.ModelImporter.importFiles === 'function') {
        try { PE.ModelImporter.importFiles(files); } catch (e) { console.warn('[AssetBrowser] importFiles lỗi:', e); }
      } else {
        alert('Module ModelImporter đang tải — chưa import được file. Thử lại sau khi module sẵn sàng.');
        console.warn('[AssetBrowser] ModelImporter chưa có, không import được:', files.map(function (f) { return f.name; }));
      }
      fileInput.value = '';
      render();
    });
    container.appendChild(fileInput);

    var grid = document.createElement('div');
    grid.className = 'asset-grid';
    var assets = filteredAssets();
    if (!assets.length) {
      grid.appendChild(Object.assign(document.createElement('div'), { className: 'asset-empty', textContent: 'Không có asset nào khớp.' }));
    }
    assets.forEach(function (asset) {
      var card = document.createElement('div');
      card.className = 'asset-card' + (selectedAssetId === asset.id ? ' is-selected' : '');
      card.draggable = true;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.title = asset.name + ' (' + asset.category + ') — bấm đúp để thêm vào scene';
      var thumb = document.createElement('div');
      thumb.className = 'asset-thumb';
      thumb.textContent = asset.icon || '📦';
      card.appendChild(thumb);
      var name = document.createElement('div');
      name.className = 'asset-name';
      name.textContent = asset.name;
      card.appendChild(name);
      var cat = document.createElement('div');
      cat.className = 'asset-category';
      cat.textContent = asset.category;
      card.appendChild(cat);

      card.addEventListener('click', function () { selectedAssetId = asset.id; render(); });
      card.addEventListener('dblclick', function () { addAssetToScene(asset, groundPositionAtScreenCenter()); });
      card.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') addAssetToScene(asset, groundPositionAtScreenCenter());
      });
      card.addEventListener('dragstart', function (ev) {
        ev.dataTransfer.setData('application/x-pixi-asset', JSON.stringify({ id: asset.id, name: asset.name, type: asset.type, def: asset.def }));
        ev.dataTransfer.setData('text/plain', asset.id);
        ev.dataTransfer.effectAllowed = 'copy';
      });
      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  function bindViewportDrop() {
    var wrap = document.getElementById('viewport-wrap');
    if (!wrap) return;
    wrap.addEventListener('dragover', function (ev) {
      if (ev.dataTransfer && Array.prototype.indexOf.call(ev.dataTransfer.types || [], 'application/x-pixi-asset') !== -1) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
      }
    });
    wrap.addEventListener('drop', function (ev) {
      var raw = ev.dataTransfer ? ev.dataTransfer.getData('application/x-pixi-asset') : '';
      if (!raw) return;
      ev.preventDefault();
      var asset = null;
      try { asset = JSON.parse(raw); } catch (e) { return; }
      var pos = null;
      // Raycast xuống đất tại điểm thả.
      var s = getState();
      var scene = s ? s.scene : null;
      if (scene && typeof scene.pick === 'function') {
        try {
          var rect = wrap.getBoundingClientRect();
          var pick = scene.pick(ev.clientX - rect.left, ev.clientY - rect.top);
          if (pick && pick.pickedPoint) pos = { x: pick.pickedPoint.x, y: pick.pickedPoint.y, z: pick.pickedPoint.z };
        } catch (e) { /* fallback dưới */ }
      }
      if (!pos && PE.SceneManager && typeof PE.SceneManager.getGroundHeight === 'function') {
        try { pos = { x: 0, y: PE.SceneManager.getGroundHeight(0, 0), z: 0 }; } catch (e) { pos = null; }
      }
      if (!pos) pos = groundPositionAtScreenCenter();
      addAssetToScene(asset, pos);
    });
  }

  function init(id) {
    containerId = id || 'asset-browser';
    container = document.getElementById(containerId);
    if (!container) {
      console.warn('[AssetBrowser] Không tìm thấy container #' + containerId);
      return;
    }
    bindViewportDrop();
    if (PE.EventBus && typeof PE.EventBus.on === 'function') {
      ['object-added', 'object-removed', 'scene-loaded', 'engine-ready', 'hierarchy-changed'].forEach(function (ev) {
        try { PE.EventBus.on(ev, render); } catch (e) { /* ignore */ }
      });
    }
    render();
  }

  PE.AssetBrowser = { init: init, render: render };
})();
