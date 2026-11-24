'use strict';
/* ThreeGLBLoader.js — Nạp GLB bằng THREE.GLTFLoader (r128 UMD) + MeshoptDecoder nếu có.
   Nhóm RENDERING (Three.js). KHÔNG tự tạo scene: trả gltf về cho caller add vào scene.
   Thứ tự: thử URL local trước, lỗi thì fallback CDN theo map, cả 2 lỗi thì onError
   với lý do rõ để caller fallback procedural. */
(function () {
  window.PixiEngine = window.PixiEngine || {};

  var CDN_FALLBACK = {
    'models/RobotExpressive.glb': 'https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
    'models/Fox.glb': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb',
    'models/CesiumMan.glb': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMan/glTF-Binary/CesiumMan.glb',
    'models/kiem-hiep.glb': 'https://raw.githubusercontent.com/nguyenvu133/3D-Model/main/kiem%20hiep.glb'
  };

  var mixer = null;
  var currentAction = null;
  var currentGltf = null;
  var currentClipName = null;

  function loaderReady() {
    return (typeof THREE !== 'undefined') && THREE.GLTFLoader;
  }

  function loadGLB(url, onDone, onError) {
    if (!loaderReady()) {
      var msg = 'THREE.GLTFLoader chưa load (thiếu three.min.js / GLTFLoader.js r128). Không nạp được GLB "' + url + '".';
      console.error('[ThreeGLBLoader] ' + msg);
      if (typeof onError === 'function') { onError(msg, null); }
      return false;
    }
    if (!url) {
      if (typeof onError === 'function') { onError('loadGLB: thiếu URL.', null); }
      return false;
    }
    var loader = new THREE.GLTFLoader();
    if (window.MeshoptDecoder && loader.setMeshoptDecoder) {
      try { loader.setMeshoptDecoder(window.MeshoptDecoder); } catch (e) { console.warn('[ThreeGLBLoader] setMeshoptDecoder lỗi:', e); }
    }
    attempt(url, false);
    return true;

    function attempt(u, isFallback) {
      var onFail = function (err) {
        var fallback = CDN_FALLBACK[url];
        if (!isFallback && fallback && fallback !== u) {
          console.warn('[ThreeGLBLoader] Không tải được local "' + url + '", thử fallback CDN: ' + fallback);
          attempt(fallback, true);
          return;
        }
        var tried = isFallback ? ('local "' + url + '" và CDN "' + u + '"') : ('"' + u + '"');
        var detail = '';
        if (err) {
          detail = err.message || err.type || String(err);
          if (err.target && err.target.status) { detail += ' (HTTP ' + err.target.status + ')'; }
        } else { detail = 'lỗi mạng / file không tồn tại'; }
        var reason = 'Không tải được GLB ' + tried + ': ' + detail + '. Caller nên fallback procedural.';
        console.error('[ThreeGLBLoader] ' + reason);
        if (typeof onError === 'function') { onError(reason, err || null); }
      };
      /* v5.0.0 fix: loader.load() có thể throw đồng bộ (vd môi trường không có
         XMLHttpRequest) — bắt lại và đi theo đường onFail/fallback thay vì crash. */
      try {
        loader.load(u, function (gltf) {
          if (typeof onDone === 'function') { onDone(gltf); }
        }, undefined, onFail);
      } catch (e) { onFail(e); }
    }
  }

  function getMetadata(gltf) {
    if (!gltf || !gltf.scene) { return null; }
    var meshes = 0, triangles = 0, vertices = 0, hasSkeleton = false;
    gltf.scene.traverse(function (child) {
      if (child.isBone || child.isSkinnedMesh) { hasSkeleton = true; }
      if (child.isMesh) {
        meshes += 1;
        var geo = child.geometry;
        if (geo) {
          if (geo.index) { triangles += Math.floor(geo.index.count / 3); }
          else if (geo.attributes && geo.attributes.position) { triangles += Math.floor(geo.attributes.position.count / 3); }
          if (geo.attributes && geo.attributes.position) { vertices += geo.attributes.position.count; }
        }
      }
    });
    var animations = [];
    if (gltf.animations) {
      for (var i = 0; i < gltf.animations.length; i++) {
        animations.push(gltf.animations[i].name || ('clip-' + i));
      }
    }
    return { meshes: meshes, triangles: triangles, vertices: vertices, animations: animations, hasSkeleton: hasSkeleton };
  }

  function findClip(gltf, name) {
    if (!gltf || !gltf.animations || !gltf.animations.length) { return null; }
    if (name) {
      for (var i = 0; i < gltf.animations.length; i++) {
        if (gltf.animations[i].name === name) { return gltf.animations[i]; }
      }
      return null;
    }
    return gltf.animations[0];
  }

  function playClip(gltf, name, loop) {
    if (typeof THREE === 'undefined' || !THREE.AnimationMixer) {
      console.error('[ThreeGLBLoader] THREE chưa load, không play được clip.');
      return false;
    }
    var clip = findClip(gltf, name);
    if (!clip) {
      console.warn('[ThreeGLBLoader] Không tìm thấy clip "' + (name || '') + '" trong GLB.');
      return false;
    }
    if (currentGltf !== gltf || !mixer) {
      mixer = new THREE.AnimationMixer(gltf.scene);
      currentGltf = gltf;
      currentAction = null;
    }
    if (currentAction) { try { currentAction.stop(); } catch (e) {} currentAction = null; }
    currentAction = mixer.clipAction(clip);
    var once = loop === false;
    currentAction.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    currentAction.clampWhenFinished = once;
    currentAction.reset().play();
    currentClipName = clip.name;
    return clip.name;
  }

  function stopClip() {
    if (currentAction) {
      try { currentAction.stop(); } catch (e) {}
      currentAction = null;
      currentClipName = null;
      return true;
    }
    return false;
  }

  // Gọi mỗi frame từ render loop của ThreeRenderer (dt tính bằng giây).
  function update(dt) {
    if (mixer && typeof dt === 'number' && dt > 0) {
      try { mixer.update(dt); } catch (e) {}
    }
  }

  function getCurrentClip() { return currentClipName; }

  window.PixiEngine.ThreeGLBLoader = {
    loadGLB: loadGLB,
    getMetadata: getMetadata,
    playClip: playClip,
    stopClip: stopClip,
    update: update,
    getCurrentClip: getCurrentClip,
    CDN_FALLBACK: CDN_FALLBACK
  };
})();
