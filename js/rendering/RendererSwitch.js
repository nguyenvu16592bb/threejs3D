'use strict';
/* RendererSwitch.js — Chuyển renderer Babylon <-> three.js trên cùng canvas #viewport-canvas.
   Nhóm RENDERING. Dừng renderer cũ, khởi tạo renderer mới, rebuild scene từ
   state.objects, giữ camera target/zoom gần như cũ, lưu lựa chọn vào localStorage.
   An toàn khi THREE hoặc BABYLON chưa load: báo lỗi rõ, giữ renderer hiện tại. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var state = window.PixiEngine.state || {};
  var STORAGE_KEY = 'pixi3d-renderer';
  var lastCameraState = null; // {target:{x,y,z}, theta, phi, radius} — chung 2 renderer (alpha=theta, beta=phi)

  function emit(ev, data) {
    if (window.PixiEngine.EventBus) { window.PixiEngine.EventBus.emit(ev, data); }
  }
  function getStored() {
    try {
      var v = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
      return (v === 'three' || v === 'babylon') ? v : null;
    } catch (e) { return null; }
  }
  function saveStored(name) {
    try { if (window.localStorage) { window.localStorage.setItem(STORAGE_KEY, name); } } catch (e) {}
  }

  function getCurrent() {
    if (state.renderer === 'three' || state.renderer === 'babylon') { return state.renderer; }
    return getStored() || 'babylon';
  }

  function isAvailable(name) {
    if (name === 'three') { return typeof THREE !== 'undefined'; }
    if (name === 'babylon') { return typeof BABYLON !== 'undefined'; }
    return false;
  }

  function getCanvas() {
    return state.canvas || document.getElementById('viewport-canvas');
  }

  function readBabylonCamera() {
    var cam = state.camera;
    if (!cam || typeof BABYLON === 'undefined') { return null; }
    var t = { x: 0, y: 0, z: 0 };
    try {
      if (cam.getTarget) { var v = cam.getTarget(); t = { x: v.x, y: v.y, z: v.z }; }
    } catch (e) {}
    return {
      target: t,
      theta: (typeof cam.alpha === 'number') ? cam.alpha : -Math.PI / 2,
      phi: (typeof cam.beta === 'number') ? cam.beta : Math.PI / 3,
      radius: (typeof cam.radius === 'number') ? cam.radius : 30
    };
  }

  function readThreeCamera() {
    var TR = window.PixiEngine.ThreeRenderer;
    if (TR && TR.getCameraState) {
      try { return TR.getCameraState(); } catch (e) { return null; }
    }
    return null;
  }

  function applyToBabylon(cs) {
    var cam = state.camera;
    if (!cam || !cs || typeof BABYLON === 'undefined') { return false; }
    try {
      if (cam.setTarget) { cam.setTarget(new BABYLON.Vector3(cs.target.x, cs.target.y, cs.target.z)); }
      if (typeof cs.theta === 'number') { cam.alpha = cs.theta; }
      if (typeof cs.phi === 'number') { cam.beta = cs.phi; }
      if (typeof cs.radius === 'number') { cam.radius = cs.radius; }
      return true;
    } catch (e) { console.error('[RendererSwitch] applyToBabylon lỗi:', e); return false; }
  }

  function stopBabylon() {
    var eng = null;
    var BR = window.PixiEngine.BabylonRenderer;
    if (BR && BR.getEngine) { try { eng = BR.getEngine(); } catch (e) {} }
    if (!eng) { eng = state.engine; }
    if (eng && eng.stopRenderLoop) { try { eng.stopRenderLoop(); } catch (e) {} }
    // Ngắt điều khiển chuột/chạm của camera Babylon để khỏi tranh canvas với three.
    var cam = state.camera;
    if (cam && cam.detachControl) { try { cam.detachControl(); } catch (e) {} }
  }

  function stopThree() {
    var TR = window.PixiEngine.ThreeRenderer;
    if (!TR) { return; }
    try { if (TR.stop) { TR.stop(); } } catch (e) {}
    try { if (TR.dispose) { TR.dispose(); } } catch (e) {}
  }

  function startThree(canvas, cameraState) {
    var TR = window.PixiEngine.ThreeRenderer;
    if (!TR) { throw new Error('ThreeRenderer chưa load (thiếu js/rendering/ThreeRenderer.js).'); }
    if (typeof THREE === 'undefined') { throw new Error('THREE chưa load (thiếu three.min.js r128).'); }
    TR.createEngine(canvas);
    var scn = TR.createScene();
    if (!scn) { throw new Error('Tạo scene three.js thất bại.'); }
    TR.createCamera(scn, canvas);
    if (cameraState && TR.setCameraState) { TR.setCameraState(cameraState); }
    if (!TR.buildFromObjects(state.objects || [])) { throw new Error('Build scene three.js từ state.objects thất bại.'); }
    if (TR.toggleGrid) { TR.toggleGrid(true); }
    if (TR.start) { TR.start(); }
    return true;
  }

  function startBabylon(canvas) {
    var BR = window.PixiEngine.BabylonRenderer;
    if (typeof BABYLON === 'undefined') { throw new Error('BABYLON chưa load.'); }
    var eng = null;
    if (BR && BR.getEngine) { try { eng = BR.getEngine(); } catch (e) {} }
    if (!eng) { eng = state.engine; }
    if (!eng) {
      // Chưa từng khởi tạo Babylon: chỉ init được khi scene còn trống (Engine.init
      // luôn build scene mặc định — gọi khi đã có object sẽ nhân đôi object).
      if ((state.objects || []).length === 0 && window.PixiEngine.Engine && window.PixiEngine.Engine.init) {
        if (!window.PixiEngine.Engine.init()) { throw new Error('Engine.init() (Babylon) thất bại.'); }
        return true;
      }
      throw new Error('Chưa có Babylon engine (app chưa từng chạy Babylon) mà scene đã có object — tải lại trang để về Babylon.');
    }
    var scn = null;
    if (BR && BR.getScene) { try { scn = BR.getScene(); } catch (e) {} }
    if (!scn) { scn = state.scene; }
    // Khôi phục điều khiển camera + render loop (scene/mesh Babylon vẫn còn nguyên
    // vì lúc chuyển sang three chỉ stopRenderLoop, không dispose engine/scene).
    var cam = state.camera;
    if (cam && cam.attachControl && canvas) { try { cam.attachControl(canvas, true); } catch (e) {} }
    eng.runRenderLoop(function () { if (scn) { try { scn.render(); } catch (e) {} } });
    return true;
  }

  function switchTo(name) {
    if (name !== 'babylon' && name !== 'three') {
      console.error('[RendererSwitch] Renderer không hợp lệ: "' + name + '" (chỉ "babylon" hoặc "three").');
      return false;
    }
    var prev = getCurrent();
    if (name === prev) { return true; }
    if (!isAvailable(name)) {
      var lib = name === 'three' ? 'THREE (three.min.js r128)' : 'BABYLON (babylon.js 7.0.0)';
      console.error('[RendererSwitch] Không chuyển sang "' + name + '": ' + lib + ' chưa load. Giữ renderer "' + prev + '".');
      return false;
    }
    var canvas = getCanvas();
    if (!canvas) {
      console.error('[RendererSwitch] Không tìm thấy canvas #viewport-canvas. Giữ renderer "' + prev + '".');
      return false;
    }
    // Giữ camera target/zoom gần như cũ (Babylon alpha/beta == three theta/phi).
    var cameraState = (prev === 'three') ? readThreeCamera() : readBabylonCamera();
    if (cameraState) { lastCameraState = cameraState; }
    else if (lastCameraState) { cameraState = lastCameraState; }

    try {
      if (prev === 'three') { stopThree(); } else { stopBabylon(); }
      if (name === 'three') { startThree(canvas, cameraState); }
      else { startBabylon(canvas); }
    } catch (e) {
      console.error('[RendererSwitch] Chuyển sang "' + name + '" thất bại: ' + e.message + '. Thử khôi phục "' + prev + '".');
      try {
        if (prev === 'three') { startThree(canvas, cameraState); }
        else { startBabylon(canvas); }
        console.warn('[RendererSwitch] Đã khôi phục renderer "' + prev + '".');
      } catch (e2) {
        console.error('[RendererSwitch] Khôi phục "' + prev + '" cũng thất bại: ' + e2.message + '. Cần tải lại trang.');
      }
      return false;
    }

    if (name === 'babylon' && cameraState) { applyToBabylon(cameraState); }
    state.renderer = name;
    saveStored(name);
    emit('renderer-switched', { renderer: name, previous: prev });
    console.log('[RendererSwitch] Đã chuyển renderer: ' + prev + ' -> ' + name);
    return true;
  }

  window.PixiEngine.RendererSwitch = {
    getCurrent: getCurrent,
    getStored: getStored,
    isAvailable: isAvailable,
    switchTo: switchTo
  };
})();
