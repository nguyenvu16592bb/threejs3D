'use strict';
/* LightingManager.js — Mặt trời, ambient, sương mù, thêm đèn.
   Nhóm RENDERING. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var lights = {}; // name -> BABYLON light

  function getScene() { return window.PixiEngine.state.scene; }

  function setSun(intensity, color) {
    var scene = getScene();
    if (!scene || typeof BABYLON === 'undefined') { return null; }
    var sun = lights['sun'];
    if (!sun) {
      sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.5, -1, -0.4), scene);
      sun.position = new BABYLON.Vector3(20, 30, 10);
      lights['sun'] = sun;
    }
    if (typeof intensity === 'number') { sun.intensity = intensity; }
    if (color) { sun.diffuse = BABYLON.Color3.FromHexString(color); }
    return sun;
  }

  function setAmbient(color, intensity) {
    var scene = getScene();
    if (!scene || typeof BABYLON === 'undefined') { return null; }
    var hemi = lights['hemi'];
    if (!hemi) {
      hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
      lights['hemi'] = hemi;
    }
    if (color) { hemi.diffuse = BABYLON.Color3.FromHexString(color); }
    if (typeof intensity === 'number') { hemi.intensity = intensity; }
    return hemi;
  }

  function setFog(enabled, color, near, far) {
    var scene = getScene();
    if (!scene || typeof BABYLON === 'undefined') { return false; }
    if (!enabled) { scene.fogMode = BABYLON.Scene.FOGMODE_NONE; return true; }
    scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
    if (color) { scene.fogColor = BABYLON.Color3.FromHexString(color); }
    scene.fogStart = (typeof near === 'number') ? near : 20;
    scene.fogEnd = (typeof far === 'number') ? far : 100;
    return true;
  }

  function addLight(type, opts) {
    var scene = getScene();
    if (!scene || typeof BABYLON === 'undefined') { return null; }
    opts = opts || {};
    var name = opts.name || ('light-' + Object.keys(lights).length);
    var light = null;
    var dir = opts.direction || new BABYLON.Vector3(0, -1, 0);
    var pos = opts.position || new BABYLON.Vector3(0, 5, 0);
    if (type === 'directional') {
      light = new BABYLON.DirectionalLight(name, dir, scene);
      light.position = pos;
    } else if (type === 'point') {
      light = new BABYLON.PointLight(name, pos, scene);
      if (opts.range) { light.range = opts.range; }
    } else if (type === 'spot') {
      light = new BABYLON.SpotLight(name, pos, dir, opts.angle || Math.PI / 3, opts.exponent || 2, scene);
    } else { // hemispheric mặc định
      light = new BABYLON.HemisphericLight(name, new BABYLON.Vector3(0, 1, 0), scene);
    }
    if (typeof opts.intensity === 'number') { light.intensity = opts.intensity; }
    if (opts.color) { light.diffuse = BABYLON.Color3.FromHexString(opts.color); }
    lights[name] = light;
    // Đăng ký vào SceneManager dạng light (không mesh) để hiện trong Hierarchy.
    if (window.PixiEngine.SceneManager && type !== 'sun') {
      try {
        window.PixiEngine.SceneManager.addObject({
          name: name, type: 'light', tag: type,
          transform: { position: { x: pos.x, y: pos.y, z: pos.z } }
        });
      } catch (e) {}
    }
    return light;
  }

  function getLight(name) { return lights[name] || null; }
  function listLights() { return Object.keys(lights); }

  window.PixiEngine.LightingManager = {
    setSun: setSun, setAmbient: setAmbient, setFog: setFog,
    addLight: addLight, getLight: getLight, listLights: listLights
  };
})();
