'use strict';
/* MaterialManager.js — Tạo / áp / liệt kê vật liệu StandardMaterial.
   Nhóm RENDERING. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var materials = {}; // name -> BABYLON material

  function getScene() { return window.PixiEngine.state.scene; }

  function createMaterial(name, opts) {
    var scene = getScene();
    if (!scene || typeof BABYLON === 'undefined') { return null; }
    opts = opts || {};
    name = name || ('Material-' + Object.keys(materials).length);
    var mat = new BABYLON.StandardMaterial(name, scene);
    if (opts.color) { mat.diffuseColor = BABYLON.Color3.FromHexString(opts.color); }
    if (typeof opts.metallic === 'number') { mat.metallic = opts.metallic; }
    if (typeof opts.roughness === 'number') { mat.roughness = opts.roughness; }
    if (opts.emissive) { mat.emissiveColor = BABYLON.Color3.FromHexString(opts.emissive); }
    if (typeof opts.opacity === 'number') { mat.alpha = opts.opacity; }
    if (opts.specular) { mat.specularColor = BABYLON.Color3.FromHexString(opts.specular); }
    materials[name] = mat;
    return mat;
  }

  function applyMaterial(objId, mat) {
    var sm = window.PixiEngine.SceneManager;
    if (!sm) { return false; }
    var obj = sm.findById(objId);
    if (!obj || !obj.babylonNode) { return false; }
    var material = (typeof mat === 'string') ? materials[mat] : mat;
    if (!material) { return false; }
    // Áp cho node chính + các mesh con (cây/nhà composite).
    var applyTo = function (node) {
      if (node.material !== undefined) { node.material = material; }
      if (node.getChildMeshes) {
        node.getChildMeshes().forEach(function (m) { m.material = material; });
      }
    };
    applyTo(obj.babylonNode);
    if (window.PixiEngine.ProjectManager) { window.PixiEngine.ProjectManager.markDirty(); }
    return true;
  }

  function getMaterial(name) { return materials[name] || null; }
  function listMaterials() { return Object.keys(materials); }
  function removeMaterial(name) {
    var mat = materials[name];
    if (!mat) { return false; }
    try { mat.dispose(); } catch (e) {}
    delete materials[name];
    return true;
  }

  window.PixiEngine.MaterialManager = {
    createMaterial: createMaterial, applyMaterial: applyMaterial,
    getMaterial: getMaterial, listMaterials: listMaterials, removeMaterial: removeMaterial
  };
})();
