'use strict';
/* Engine.js — Khởi tạo BABYLON Engine + scene + camera, render loop, stats thật.
   Nhóm CORE. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  /* v5.0.0 — version hiển thị (chỉ đổi version, không đổi logic renderer). */
  var VERSION = '5.0.0';
  window.PixiEngine.version = VERSION;
  var state = window.PixiEngine.state;
  var engine = null;
  var scene = null;
  var camera = null;
  var gridMesh = null;
  var statsTimer = null;
  var initialized = false;

  function showError(msg) {
    var el = document.getElementById('viewport-error');
    if (el) {
      el.classList.add('show');
      var p = el.querySelector('p');
      if (p) { p.textContent = msg; }
    }
    console.error('[Engine]', msg);
  }

  function init() {
    if (initialized) { return true; }
    if (typeof BABYLON === 'undefined') {
      showError('Không tải được Babylon.js từ CDN. Kiểm tra kết nối mạng rồi tải lại trang.');
      return false;
    }
    var canvas = document.getElementById('viewport-canvas');
    if (!canvas) { showError('Không tìm thấy canvas #viewport-canvas trong index.html.'); return false; }
    state.canvas = canvas;
    try {
      // Dùng BabylonRenderer nếu có, fallback tạo trực tiếp.
      if (window.PixiEngine.BabylonRenderer && window.PixiEngine.BabylonRenderer.createEngine) {
        engine = window.PixiEngine.BabylonRenderer.createEngine(canvas);
        scene = window.PixiEngine.BabylonRenderer.createScene(engine);
        camera = window.PixiEngine.BabylonRenderer.createCamera(scene, canvas);
        window.PixiEngine.BabylonRenderer.createLights(scene);
      } else {
        engine = new BABYLON.Engine(canvas, true, { stencil: true, antialias: true });
        scene = new BABYLON.Scene(engine);
        camera = new BABYLON.ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 30, new BABYLON.Vector3(0, 0, 0), scene);
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 5; camera.upperRadiusLimit = 120;
      }
    } catch (e) {
      showError('Khởi tạo Babylon Engine thất bại: ' + e.message);
      return false;
    }
    state.engine = engine;
    state.scene = scene;
    state.camera = camera;

    // Scene mặc định (đảo nổi).
    if (window.PixiEngine.SceneManager) { window.PixiEngine.SceneManager.buildDefaultScene(); }
    // Lưới sàn (mặc định bật).
    toggleGrid(true);
    // CameraController giữ tham chiếu camera.
    if (window.PixiEngine.CameraController && window.PixiEngine.CameraController.attach) {
      window.PixiEngine.CameraController.attach(camera, canvas);
    }
    // Overlay PixiJS (degrade gracefully nếu PIXI chưa load).
    if (window.PixiEngine.PixiRenderer) { window.PixiEngine.PixiRenderer.init(); }

    window.addEventListener('resize', onResize);
    engine.runRenderLoop(function () { if (scene) { scene.render(); } });
    statsTimer = window.setInterval(updateStats, 1000);
    updateStats();
    initialized = true;
    if (window.PixiEngine.EventBus) { window.PixiEngine.EventBus.emit('engine-ready', { engine: engine, scene: scene }); }
    // Autosave của ProjectManager (nếu đã load).
    if (window.PixiEngine.ProjectManager && window.PixiEngine.ProjectManager.startAutosave) {
      window.PixiEngine.ProjectManager.startAutosave();
    }
    return true;
  }

  function onResize() {
    if (window.PixiEngine.BabylonRenderer && window.PixiEngine.BabylonRenderer.resize) {
      window.PixiEngine.BabylonRenderer.resize();
    } else if (engine) { engine.resize(); }
    if (window.PixiEngine.PixiRenderer && window.PixiEngine.PixiRenderer.resize) {
      window.PixiEngine.PixiRenderer.resize();
    }
  }

  function updateStats() {
    if (!engine || !scene) { return; }
    var fps = 0;
    try { fps = Math.round(engine.getFps()); } catch (e) { fps = 0; }
    var active = [];
    try { active = scene.getActiveMeshes() || []; } catch (e) { active = []; }
    var drawCalls = active.length;
    try {
      if (typeof engine.getDrawCalls === 'function') { drawCalls = engine.getDrawCalls(); }
      else if (typeof engine._drawCalls === 'number') { drawCalls = engine._drawCalls; }
    } catch (e) {}
    var triangles = 0, vertices = 0;
    for (var i = 0; i < active.length; i++) {
      try {
        var idx = active[i].getTotalIndices ? active[i].getTotalIndices() : 0;
        triangles += Math.floor(idx / 3);
        vertices += active[i].getTotalVertices ? active[i].getTotalVertices() : 0;
      } catch (e) {}
    }
    state.stats = { fps: fps, drawCalls: drawCalls, triangles: triangles, vertices: vertices };
    setText('stat-fps', String(fps));
    setText('stat-objects', String(state.objects.length));
    setText('stat-drawcalls', String(drawCalls));
    setText('stat-triangles', String(triangles));
    setText('stat-vertices', String(vertices));
    var mem = 'n/a';
    try {
      if (window.performance && performance.memory) {
        mem = Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB';
      }
    } catch (e) {}
    setText('stat-memory', mem);
    setText('fps-badge', 'FPS: ' + fps + ' | Mesh: ' + active.length);
    if (window.PixiEngine.EventBus) { window.PixiEngine.EventBus.emit('stats-updated', state.stats); }
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) { el.textContent = text; }
  }

  function getScene() { return scene; }
  function getEngine() { return engine; }
  function getCamera() { return camera; }

  function focusSelected() {
    var sel = window.PixiEngine.SelectionManager ? window.PixiEngine.SelectionManager.getSelected() : null;
    if (!sel) { return false; }
    if (window.PixiEngine.CameraController) { window.PixiEngine.CameraController.focus(sel); return true; }
    if (camera && sel.babylonNode && sel.babylonNode.position) {
      camera.setTarget(sel.babylonNode.position.clone ? sel.babylonNode.position.clone() : sel.babylonNode.position);
      return true;
    }
    return false;
  }

  function setShading(mode) {
    if (!scene) { return; }
    var meshes = scene.meshes || [];
    meshes.forEach(function (m) {
      if (!m.material) { return; }
      if (mode === 'wireframe') { m.material.wireframe = true; }
      else { m.material.wireframe = false; }
      // 'textured' = shaded + giữ texture/material gốc; 'shaded' tương tự.
    });
    if (window.PixiEngine.EventBus) { window.PixiEngine.EventBus.emit('shading-changed', { mode: mode }); }
  }

  function toggleGrid(show) {
    if (!scene || typeof BABYLON === 'undefined') { return; }
    if (show && !gridMesh) {
      gridMesh = BABYLON.MeshBuilder.CreateGround('Grid', { width: 40, height: 40, subdivisions: 40 }, scene);
      var mat = new BABYLON.StandardMaterial('grid-mat', scene);
      mat.wireframe = true;
      mat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
      mat.alpha = 0.35;
      gridMesh.material = mat;
      gridMesh.position.y = -0.9;
      gridMesh.isPickable = false;
    }
    if (gridMesh) { gridMesh.setEnabled(!!show); }
  }

  function dispose() {
    if (statsTimer) { window.clearInterval(statsTimer); statsTimer = null; }
    window.removeEventListener('resize', onResize);
    if (engine) { engine.dispose(); }
    initialized = false;
  }

  window.PixiEngine.Engine = {
    init: init, getScene: getScene, getEngine: getEngine, getCamera: getCamera,
    focusSelected: focusSelected, setShading: setShading, toggleGrid: toggleGrid,
    dispose: dispose, updateStats: updateStats, version: VERSION
  };
})();
