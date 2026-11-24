'use strict';
/* BabylonRenderer.js — Tạo engine/scene/camera/lights mặc định, ground, skybox, resize.
   Nhóm RENDERING. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var engine = null;
  var scene = null;
  var camera = null;
  var sunLight = null;
  var hemiLight = null;

  function createEngine(canvas) {
    if (typeof BABYLON === 'undefined') { throw new Error('BABYLON chưa load.'); }
    engine = new BABYLON.Engine(canvas, true, { stencil: true, antialias: true });
    window.PixiEngine.state.engine = engine;
    return engine;
  }

  function createScene(eng) {
    if (typeof BABYLON === 'undefined') { throw new Error('BABYLON chưa load.'); }
    scene = new BABYLON.Scene(eng || engine);
    scene.clearColor = new BABYLON.Color4(0.53, 0.71, 0.84, 1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0035;
    window.PixiEngine.state.scene = scene;
    return scene;
  }

  function createCamera(scn, canvas) {
    scene = scn || scene;
    camera = new BABYLON.ArcRotateCamera(
      'camera', -Math.PI / 2, Math.PI / 3, 30,
      new BABYLON.Vector3(0, 0, 0), scene
    );
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 120;
    camera.wheelPrecision = 20;
    camera.pinchPrecision = 50;
    camera.panningSensibility = 50;
    if (canvas) { camera.attachControl(canvas, true); }
    window.PixiEngine.state.camera = camera;
    return camera;
  }

  function createLights(scn) {
    scene = scn || scene;
    if (!scene) { return null; }
    if (!hemiLight) {
      hemiLight = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
      hemiLight.intensity = 0.7;
      hemiLight.diffuse = BABYLON.Color3.FromHexString('#B0C4DE');
    }
    if (!sunLight) {
      sunLight = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.5, -1, -0.4), scene);
      sunLight.intensity = 1.0;
      sunLight.diffuse = BABYLON.Color3.FromHexString('#FFF2D9');
      sunLight.position = new BABYLON.Vector3(20, 30, 10);
    }
    return { sun: sunLight, hemi: hemiLight };
  }

  // Sàn đất mặc định (dùng khi scene trống, không phải đảo nổi).
  function createGround(scn, opts) {
    scene = scn || scene;
    opts = opts || {};
    var ground = BABYLON.MeshBuilder.CreateGround('Ground', {
      width: opts.width || 40, height: opts.height || 40, subdivisions: opts.subdivisions || 1
    }, scene);
    var mat = new BABYLON.StandardMaterial('ground-mat', scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString(opts.color || '#7CB342');
    ground.material = mat;
    ground.position.y = opts.y || 0;
    ground.receiveShadows = true;
    return ground;
  }

  // Skybox: KHÔNG dùng URL ngoài — dùng clearColor gradient + fog đã set ở createScene.
  // Hàm này chỉ ghi nhận trạng thái và (nếu có) tạo skybox bằng màu nội bộ.
  function createSkybox(scn, opts) {
    scene = scn || scene;
    if (!scene) { return null; }
    opts = opts || {};
    scene.clearColor = new BABYLON.Color4(0.53, 0.71, 0.84, 1);
    // Skybox thật cần CubeTexture từ URL ngoài nên không dùng ở đây (theo hợp đồng).
    return { type: 'clearColor', color: '#87b5d6' };
  }

  function resize() {
    if (engine) { engine.resize(); }
    if (window.PixiEngine.PixiRenderer && window.PixiEngine.PixiRenderer.resize) {
      window.PixiEngine.PixiRenderer.resize();
    }
  }

  function getEngine() { return engine; }
  function getScene() { return scene; }
  function getCamera() { return camera; }
  function getSunLight() { return sunLight; }
  function getHemiLight() { return hemiLight; }

  window.PixiEngine.BabylonRenderer = {
    createEngine: createEngine, createScene: createScene, createCamera: createCamera,
    createLights: createLights, createGround: createGround, createSkybox: createSkybox,
    resize: resize, getEngine: getEngine, getScene: getScene, getCamera: getCamera,
    getSunLight: getSunLight, getHemiLight: getHemiLight
  };
})();
