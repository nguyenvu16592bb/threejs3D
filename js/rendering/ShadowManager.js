'use strict';
/* ShadowManager.js — Bật/tắt bóng đổ, độ phân giải shadow map.
   Nhóm RENDERING. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var shadowGenerator = null;
  var resolution = 1024;
  var enabled = false;

  function getScene() { return window.PixiEngine.state.scene; }

  function enableShadows(on) {
    var scene = getScene();
    if (!scene || typeof BABYLON === 'undefined') { return false; }
    enabled = !!on;
    var sun = null;
    if (window.PixiEngine.LightingManager) { sun = window.PixiEngine.LightingManager.getLight('sun'); }
    if (!sun && window.PixiEngine.BabylonRenderer) { sun = window.PixiEngine.BabylonRenderer.getSunLight(); }
    if (enabled) {
      if (!sun) { return false; }
      if (!shadowGenerator) {
        shadowGenerator = new BABYLON.ShadowGenerator(resolution, sun);
        shadowGenerator.useBlurExponentialShadowMap = true;
        shadowGenerator.blurKernel = 32;
      }
      (scene.meshes || []).forEach(function (m) {
        if (m.isPickable === false) { return; }
        shadowGenerator.addShadowCaster(m);
        m.receiveShadows = true;
      });
    } else if (shadowGenerator) {
      try { shadowGenerator.dispose(); } catch (e) {}
      shadowGenerator = null;
      (scene.meshes || []).forEach(function (m) { m.receiveShadows = false; });
    }
    if (window.PixiEngine.EventBus) { window.PixiEngine.EventBus.emit('shadows-changed', { enabled: enabled }); }
    return enabled;
  }

  function setResolution(n) {
    resolution = n || 1024;
    if (enabled) { enableShadows(false); enableShadows(true); }
    return resolution;
  }

  function isEnabled() { return enabled; }
  function getResolution() { return resolution; }
  function getGenerator() { return shadowGenerator; }

  window.PixiEngine.ShadowManager = {
    enableShadows: enableShadows, setResolution: setResolution,
    isEnabled: isEnabled, getResolution: getResolution, getGenerator: getGenerator
  };
})();
