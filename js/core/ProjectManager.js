'use strict';
/* ProjectManager.js — Lưu/tải project (localStorage + JSON file), autosave 60s khi dirty.
   Nhóm CORE. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var STORAGE_KEY = 'pixi-engine-project-v1';
  var projectName = 'Untitled Project';
  var dirty = false;
  var autosaveTimer = null;

  function markDirty() { dirty = true; }
  function markClean() { dirty = false; }
  function isDirty() { return dirty; }

  function setProjectName(name) {
    projectName = name || 'Untitled Project';
    var el = document.getElementById('project-name');
    if (el) { el.textContent = projectName; }
    var title = document.getElementById('app-title');
    if (title) { title.title = projectName; }
  }

  function buildProjectJson() {
    var sm = window.PixiEngine.SceneManager;
    return {
      version: 1,
      name: projectName,
      savedAt: new Date().toISOString(),
      scene: sm ? sm.serializeScene() : { version: 1, name: projectName, objects: [] }
    };
  }

  function saveToLocalStorage() {
    try {
      var data = buildProjectJson();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      markClean();
      setStatus('Đã lưu project "' + projectName + '" vào trình duyệt.');
      return true;
    } catch (e) {
      console.error('[ProjectManager] save lỗi:', e);
      setStatus('Lưu thất bại: ' + e.message);
      return false;
    }
  }

  function loadFromLocalStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setStatus('Chưa có project nào đã lưu trong trình duyệt.'); return false; }
      var data = JSON.parse(raw);
      return applyProjectData(data);
    } catch (e) {
      console.error('[ProjectManager] load lỗi:', e);
      setStatus('Tải project thất bại: ' + e.message);
      return false;
    }
  }

  function applyProjectData(data) {
    if (!data || !data.scene) { return false; }
    var sm = window.PixiEngine.SceneManager;
    if (!sm) { return false; }
    setProjectName(data.name || 'Untitled Project');
    var ok = sm.deserializeScene(data.scene);
    if (ok) {
      markClean();
      if (window.PixiEngine.UndoRedoManager) { window.PixiEngine.UndoRedoManager.clear(); }
      setStatus('Đã tải project "' + projectName + '".');
    }
    return ok;
  }

  function downloadJSON() {
    var data = buildProjectJson();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var safe = projectName.replace(/[^a-zA-Z0-9-_À-ỹ ]/g, '').trim().replace(/\s+/g, '-') || 'project';
    a.href = URL.createObjectURL(blob);
    a.download = safe + '.pixi-project.json';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    markClean();
    setStatus('Đã tải file project "' + a.download + '".');
    return true;
  }

  function uploadJSON(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('Chưa chọn file.')); return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result));
          var ok = applyProjectData(data);
          resolve(ok);
        } catch (e) { reject(e); }
      };
      reader.onerror = function () { reject(new Error('Đọc file thất bại.')); };
      reader.readAsText(file);
    });
  }

  function newProject() {
    var sm = window.PixiEngine.SceneManager;
    if (sm) { sm.clearScene(); sm.buildDefaultScene(); }
    if (window.PixiEngine.UndoRedoManager) { window.PixiEngine.UndoRedoManager.clear(); }
    setProjectName('Untitled Project');
    markDirty();
    setStatus('Đã tạo project mới (scene đảo nổi mặc định).');
  }

  function startAutosave() {
    if (autosaveTimer) { return; }
    autosaveTimer = window.setInterval(function () {
      if (dirty) { saveToLocalStorage(); }
    }, 60000);
  }
  function stopAutosave() {
    if (autosaveTimer) { window.clearInterval(autosaveTimer); autosaveTimer = null; }
  }

  function setStatus(msg) {
    var el = document.getElementById('status-message');
    if (el) { el.textContent = msg; }
    if (window.PixiEngine.EventBus) { window.PixiEngine.EventBus.emit('status-changed', { message: msg }); }
  }

  window.PixiEngine.ProjectManager = {
    saveToLocalStorage: saveToLocalStorage,
    loadFromLocalStorage: loadFromLocalStorage,
    downloadJSON: downloadJSON,
    uploadJSON: uploadJSON,
    newProject: newProject,
    startAutosave: startAutosave,
    stopAutosave: stopAutosave,
    markDirty: markDirty,
    markClean: markClean,
    isDirty: isDirty,
    setProjectName: setProjectName,
    get projectName() { return projectName; },
    set projectName(v) { setProjectName(v); }
  };
})();
