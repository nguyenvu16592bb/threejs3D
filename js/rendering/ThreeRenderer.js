'use strict';
/* ThreeRenderer.js — Renderer three.js r128 UMD thật (không dùng OrbitControls module).
   Nhóm RENDERING (Three.js). API khớp BabylonRenderer: createEngine/createScene/
   createCamera/buildFromObjects/addObject/removeObject/updateObject/clear/render loop/
   resize/setShading/toggleGrid/raycastPick/getStats.
   Degrade: nếu THREE chưa load, các hàm trả false và log rõ (không throw giữa chừng). */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var state = window.PixiEngine.state || {};

  var renderer = null;
  var scene = null;
  var camera = null;
  var canvas = null;
  var skyDome = null;
  var gridHelper = null;
  var hemiLight = null;
  var sunLight = null;
  var rafId = 0;
  var active = false;
  var shadingMode = 'shaded';
  var clock = null;
  var nodeById = {}; // id -> THREE.Object3D (mesh hoặc Group)
  var orbit = { target: null, theta: -Math.PI / 2, phi: Math.PI / 3, radius: 30, minRadius: 5, maxRadius: 120 };
  var pointers = {}; // pointerId -> {x, y, button, type}
  var pinchDist = 0;
  var listenersAttached = false;

  function hasThree() { return typeof THREE !== 'undefined'; }
  function fail(msg) { console.error('[ThreeRenderer] ' + msg); return false; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

  function parseColor(c, fallback) {
    try { return new THREE.Color(c || fallback || '#888888'); }
    catch (e) { return new THREE.Color(fallback || '#888888'); }
  }

  // Đọc transform: ưu tiên obj.transform (SceneManager) rồi obj.position/rotation/scale trực tiếp.
  function readTransform(obj) {
    var t = obj.transform || {};
    var p = t.position || obj.position || {};
    var r = t.rotation || obj.rotation || {};
    var s = t.scale || obj.scale;
    if (typeof s === 'number') { s = { x: s, y: s, z: s }; }
    s = s || {};
    return {
      position: { x: num(p.x, 0), y: num(p.y, 0), z: num(p.z, 0) },
      rotation: { x: num(r.x, 0), y: num(r.y, 0), z: num(r.z, 0) },
      scale: { x: num(s.x, 1), y: num(s.y, 1), z: num(s.z, 1) }
    };
  }

  function applyTransform(node, obj) {
    if (!node) { return; }
    var tr = readTransform(obj);
    node.position.set(tr.position.x, tr.position.y, tr.position.z);
    node.rotation.set(tr.rotation.x, tr.rotation.y, tr.rotation.z);
    node.scale.set(tr.scale.x, tr.scale.y, tr.scale.z);
  }

  function makeMaterial(obj, color) {
    var mat = new THREE.MeshStandardMaterial({
      color: parseColor(color || obj.color, '#888888'),
      roughness: 0.8,
      metalness: 0.05
    });
    if (typeof obj.opacity === 'number' && obj.opacity < 1) {
      mat.transparent = true;
      mat.opacity = obj.opacity;
    }
    if (shadingMode === 'wireframe') { mat.wireframe = true; }
    return mat;
  }

  function single(geometry, obj, color) {
    var mesh = new THREE.Mesh(geometry, makeMaterial(obj, color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.gameObjectId = obj.id;
    return mesh;
  }

  function group(children, obj) {
    var g = new THREE.Group();
    g.userData.gameObjectId = obj.id;
    for (var i = 0; i < children.length; i++) {
      children[i].userData.gameObjectId = obj.id;
      children[i].castShadow = true;
      children[i].receiveShadow = true;
      g.add(children[i]);
    }
    return g;
  }

  function childBox(w, h, d, color, x, y, z, obj) {
    var m = single(new THREE.BoxGeometry(w, h, d), obj, color);
    m.position.set(x, y, z);
    return m;
  }
  function childCylinder(rTop, rBottom, h, color, x, y, z, obj, seg) {
    var m = single(new THREE.CylinderGeometry(rTop, rBottom, h, seg || 16), obj, color);
    m.position.set(x, y, z);
    return m;
  }
  function childCone(r, h, color, x, y, z, obj) {
    var m = single(new THREE.CylinderGeometry(0.01, r, h, 16), obj, color);
    m.position.set(x, y, z);
    return m;
  }
  function childSphere(d, color, x, y, z, obj) {
    var m = single(new THREE.SphereGeometry(d / 2, 24, 16), obj, color);
    m.position.set(x, y, z);
    return m;
  }

  // Map state.objects -> mesh three. kind = meshType (SceneManager) hoặc type.
  function buildMesh(obj) {
    var kind = obj.meshType || obj.type || 'box';
    var s = obj.size || {};
    var color = obj.color || '#888888';
    var w = num(s.width, 1), h = num(s.height, 1), d = num(s.depth, 1);
    switch (kind) {
      case 'sphere': {
        var m = single(new THREE.SphereGeometry(num(s.diameter, 1) / 2, 24, 16), obj, color);
        if (s.diameterX || s.diameterY || s.diameterZ) {
          m.scale.set(num(s.diameterX, 1), num(s.diameterY, 1), num(s.diameterZ, 1));
        }
        return m;
      }
      case 'cylinder':
        return single(new THREE.CylinderGeometry(
          num(s.diameterTop, num(s.diameter, 1)) / 2,
          num(s.diameterBottom, num(s.diameter, 1)) / 2,
          num(s.height, 1), 16), obj, color);
      case 'cone':
        return single(new THREE.CylinderGeometry(0.01, num(s.diameter, num(s.diameterBottom, 1)) / 2, num(s.height, 1), 16), obj, color);
      case 'plane': {
        var pl = single(new THREE.PlaneGeometry(w, num(s.height, 1)), obj, color);
        pl.rotation.x = -Math.PI / 2;
        pl.castShadow = false;
        return pl;
      }
      case 'ground': {
        var gr = single(new THREE.PlaneGeometry(w, num(s.height, 1)), obj, color);
        gr.rotation.x = -Math.PI / 2;
        gr.castShadow = false;
        return gr;
      }
      case 'torus':
        return single(new THREE.TorusGeometry(num(s.diameter, 1) / 2, num(s.thickness, 0.2), 12, 24), obj, color);
      case 'tree':
        return group([
          childCylinder(0.125, 0.2, 1.6, '#8B5A2B', 0, 0.8, 0, obj),
          childCone(0.9, 1.4, '#2E7D32', 0, 2.0, 0, obj),
          childCone(0.7, 1.2, '#388E3C', 0, 2.8, 0, obj),
          childCone(0.5, 1.0, '#43A047', 0, 3.5, 0, obj)
        ], obj);
      case 'rock': {
        var rk = childSphere(1, color, 0, 0, 0, obj);
        rk.scale.set(1.4, 0.8, 1.2);
        return group([rk], obj);
      }
      case 'house': {
        var roof = childBox(2.9, 0.25, 2.5, '#D32F2F', 0, 1.85, 0, obj);
        roof.rotation.z = 0.18;
        return group([
          childBox(2.4, 1.6, 2, '#FFF3E0', 0, 0.8, 0, obj),
          roof,
          childBox(0.7, 1.0, 0.1, '#5D4037', 0, 0.5, 1.02, obj)
        ], obj);
      }
      case 'temple': // cổng torii
        return group([
          childCylinder(0.14, 0.14, 3, '#C62828', -1.2, 1.5, 0, obj),
          childCylinder(0.14, 0.14, 3, '#C62828', 1.2, 1.5, 0, obj),
          childBox(3.4, 0.25, 0.3, '#C62828', 0, 2.6, 0, obj),
          childBox(3.8, 0.22, 0.7, '#8E0000', 0, 3.05, 0, obj)
        ], obj);
      case 'bridge': {
        var parts = [];
        for (var i = 0; i < 7; i++) {
          parts.push(childBox(1.2, 0.12, 0.5, '#A1887F', 0, 0, -1.8 + i * 0.6, obj));
        }
        parts.push(childBox(0.1, 0.5, 3.8, '#8D6E63', -0.65, 0.3, 0, obj));
        parts.push(childBox(0.1, 0.5, 3.8, '#8D6E63', 0.65, 0.3, 0, obj));
        var br = group(parts, obj);
        br.rotation.y = Math.PI / 4;
        return br;
      }
      case 'chest':
        return group([
          childBox(1.0, 0.6, 0.7, '#6D4C41', 0, 0.3, 0, obj),
          childBox(1.05, 0.25, 0.75, '#8D6E63', 0, 0.7, 0, obj),
          childBox(0.2, 0.2, 0.08, '#FFD54F', 0, 0.55, 0.38, obj)
        ], obj);
      case 'coin': {
        var cn = single(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 20), obj, '#FFD54F');
        cn.rotation.x = Math.PI / 2;
        return cn;
      }
      case 'waterfall': {
        var wf = single(new THREE.PlaneGeometry(1.6, 4), obj, '#66BBE8');
        wf.material.transparent = true;
        wf.material.opacity = 0.75;
        wf.position.set(0, -1, 0);
        wf.castShadow = false;
        return group([wf, childBox(2.0, 0.8, 0.6, '#9E9E9E', 0, 1.2, -0.2, obj)], obj);
      }
      case 'flower':
      case 'lantern':
        return childSphere(num(s.diameter, kind === 'lantern' ? 0.5 : 0.3), color, 0, 0, 0, obj);
      case 'platform':
      case 'terrain-block':
      case 'water':
      case 'box':
      default:
        return single(new THREE.BoxGeometry(w, h, d), obj, color);
    }
  }

  /* ---------- Engine / Scene / Camera ---------- */

  function createEngine(cnv) {
    if (!hasThree()) { return fail('THREE chưa load (thiếu three.min.js r128). Không tạo được ThreeRenderer.'); }
    canvas = cnv || document.getElementById('viewport-canvas');
    if (!canvas) { return fail('Không tìm thấy canvas #viewport-canvas.'); }
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    } catch (e) {
      return fail('Tạo WebGLRenderer thất bại: ' + e.message);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    resize();
    state.threeRenderer = renderer;
    return renderer;
  }

  function createSkyDome(scn) {
    // Nền trời gradient vẽ bằng canvas 2D (không URL ngoài), mặt trong sphere.
    var c = document.createElement('canvas');
    c.width = 4; c.height = 512;
    var ctx = c.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#5ea9dd');
    grad.addColorStop(0.55, '#87b5d6');
    grad.addColorStop(1, '#dceefb');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 512);
    var tex = new THREE.CanvasTexture(c);
    var mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), mat);
    skyDome.userData.noPick = true;
    skyDome.renderOrder = -1;
    scn.add(skyDome);
    return skyDome;
  }

  function createScene() {
    if (!hasThree()) { return fail('THREE chưa load. Không tạo được scene three.js.'); }
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#87b5d6');
    scene.fog = new THREE.FogExp2(0x87b5d6, 0.0035);
    createSkyDome(scene);
    hemiLight = new THREE.HemisphereLight(0xb0c4de, 0x8d6e63, 0.7);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xfff2d9, 1.0);
    sunLight.position.set(20, 30, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -30;
    sunLight.shadow.camera.right = 30;
    sunLight.shadow.camera.top = 30;
    sunLight.shadow.camera.bottom = -30;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 100;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);
    state.threeScene = scene;
    return scene;
  }

  function applyOrbit() {
    if (!camera || !orbit.target) { return; }
    var sp = Math.sin(orbit.phi);
    camera.position.set(
      orbit.target.x + orbit.radius * sp * Math.cos(orbit.theta),
      orbit.target.y + orbit.radius * Math.cos(orbit.phi),
      orbit.target.z + orbit.radius * sp * Math.sin(orbit.theta)
    );
    camera.lookAt(orbit.target);
  }

  function rotateBy(dx, dy) {
    orbit.theta -= dx * 0.005;
    orbit.phi -= dy * 0.005;
    orbit.phi = Math.max(0.05, Math.min(Math.PI - 0.05, orbit.phi));
    applyOrbit();
  }
  function zoomBy(factor) {
    orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.radius * factor));
    applyOrbit();
  }
  function panBy(dx, dy) {
    if (!camera) { return; }
    var s = orbit.radius * 0.0016;
    var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    var up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    orbit.target.addScaledVector(right, -dx * s);
    orbit.target.addScaledVector(up, dy * s);
    applyOrbit();
  }

  function pointerList() {
    var out = [];
    for (var k in pointers) { if (Object.prototype.hasOwnProperty.call(pointers, k)) { out.push(pointers[k]); } }
    return out;
  }
  function pinchDistance() {
    var pts = pointerList();
    if (pts.length < 2) { return 0; }
    var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onPointerDown(e) {
    try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); } } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY, button: e.button, type: e.pointerType || 'mouse' };
    if (pointerList().length === 2) { pinchDist = pinchDistance(); }
    if (e.pointerType === 'touch') { e.preventDefault(); }
  }
  function onPointerMove(e) {
    var p = pointers[e.pointerId];
    if (!p) { return; }
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    var count = pointerList().length;
    if (count === 1) {
      if (p.type === 'mouse' && (p.button === 1 || p.button === 2)) { panBy(dx, dy); }
      else { rotateBy(dx, dy); }
    } else if (count === 2) {
      p.x = e.clientX; p.y = e.clientY;
      var nd = pinchDistance();
      if (pinchDist > 0 && nd > 0) { zoomBy(pinchDist / nd); }
      pinchDist = nd;
      // Chụm 2 ngón kéo: pan theo điểm giữa.
      panBy(dx / 2, dy / 2);
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (e.pointerType === 'touch') { e.preventDefault(); }
  }
  function onPointerUp(e) {
    delete pointers[e.pointerId];
    if (pointerList().length < 2) { pinchDist = 0; }
  }
  function onWheel(e) {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? 1.1 : 0.9);
  }
  function onContextMenu(e) { e.preventDefault(); }

  function attachOrbitControls() {
    if (!canvas || listenersAttached) { return; }
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    listenersAttached = true;
  }
  function detachOrbitControls() {
    if (!canvas || !listenersAttached) { return; }
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    listenersAttached = false;
  }

  function createCamera(scn, cnv) {
    if (!hasThree()) { return fail('THREE chưa load. Không tạo được camera three.js.'); }
    scene = scn || scene;
    canvas = cnv || canvas || document.getElementById('viewport-canvas');
    if (!orbit.target) { orbit.target = new THREE.Vector3(0, 0, 0); }
    var w = canvas ? (canvas.clientWidth || 800) : 800;
    var h = canvas ? (canvas.clientHeight || 600) : 600;
    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    applyOrbit();
    attachOrbitControls();
    state.threeCamera = camera;
    if (renderer && scene) { start(); }
    return camera;
  }

  /* ---------- Objects ---------- */

  function buildFromObjects(objects) {
    if (!hasThree()) { return fail('THREE chưa load. Không build được scene three.js.'); }
    if (!scene) { return fail('Chưa có scene three.js: gọi createScene() trước.'); }
    clear();
    (objects || []).forEach(function (obj) { addObject(obj); });
    return true;
  }

  function addObject(obj) {
    if (!hasThree()) { return fail('THREE chưa load. Không thêm được object "' + (obj && obj.name) + '".'); }
    if (!scene || !obj || !obj.id) { return false; }
    if (obj.type === 'light') { return null; } // đèn đã có sẵn trong scene three
    if (nodeById[obj.id]) { removeObject(obj.id); }
    var node;
    try { node = buildMesh(obj); } catch (e) { console.error('[ThreeRenderer] buildMesh lỗi:', obj.id, e); return false; }
    if (!node) { return false; }
    node.name = obj.name || obj.id;
    applyTransform(node, obj);
    if (obj.visible === false) { node.visible = false; }
    scene.add(node);
    nodeById[obj.id] = node;
    obj.threeNode = node;
    return node;
  }

  function disposeNode(node) {
    node.traverse(function (child) {
      if (child.geometry) { try { child.geometry.dispose(); } catch (e) {} }
      var mats = child.material;
      if (mats) {
        if (!Array.isArray(mats)) { mats = [mats]; }
        mats.forEach(function (m) {
          if (m.map) { try { m.map.dispose(); } catch (e) {} }
          try { m.dispose(); } catch (e) {}
        });
      }
    });
  }

  function removeObject(id) {
    if (!hasThree()) { return fail('THREE chưa load. Không xóa được object ' + id + '.'); }
    var node = nodeById[id];
    if (!node) { return false; }
    if (scene) { scene.remove(node); }
    disposeNode(node);
    delete nodeById[id];
    var sm = window.PixiEngine.SceneManager;
    if (sm && sm.findById) { var o = sm.findById(id); if (o) { o.threeNode = null; } }
    return true;
  }

  function updateObject(obj) {
    if (!hasThree()) { return fail('THREE chưa load. Không cập nhật được object ' + (obj && obj.id) + '.'); }
    if (!obj || !obj.id) { return false; }
    var node = nodeById[obj.id];
    if (!node) { return addObject(obj) ? true : false; }
    applyTransform(node, obj);
    if (typeof obj.visible === 'boolean') { node.visible = obj.visible; }
    if (obj.color) {
      // Chỉ đổi màu mesh đơn; group composite (cây/nhà...) giữ màu từng bộ phận.
      if (node.isMesh && node.material && node.material.color && node.material.color.copy) {
        node.material.color.copy(parseColor(obj.color, null));
      }
    }
    if (typeof obj.opacity === 'number') {
      node.traverse(function (child) {
        if (child.material && child.isMesh) {
          child.material.transparent = obj.opacity < 1;
          child.material.opacity = obj.opacity;
        }
      });
    }
    return true;
  }

  function clear() {
    if (!hasThree()) { return fail('THREE chưa load. Không clear được scene three.js.'); }
    Object.keys(nodeById).forEach(function (id) {
      var node = nodeById[id];
      if (scene) { scene.remove(node); }
      disposeNode(node);
      delete nodeById[id];
    });
    return true;
  }

  /* ---------- Render loop / resize / shading / grid / pick / stats ---------- */

  function loop() {
    if (!active) { return; }
    rafId = window.requestAnimationFrame(loop);
    var dt = 0;
    try { dt = clock ? clock.getDelta() : 0; } catch (e) { dt = 0; }
    var glb = window.PixiEngine.ThreeGLBLoader;
    if (glb && glb.update) { try { glb.update(dt); } catch (e) {} }
    if (renderer && scene && camera) {
      try { renderer.render(scene, camera); } catch (e) { console.error('[ThreeRenderer] render lỗi:', e); stop(); }
    }
  }

  function start() {
    if (!hasThree()) { return fail('THREE chưa load. Không chạy được render loop three.js.'); }
    if (!renderer || !scene || !camera) { return fail('Chưa đủ engine/scene/camera three.js để chạy render loop.'); }
    if (active) { return true; }
    active = true;
    if (!clock) { clock = new THREE.Clock(); }
    clock.getDelta();
    rafId = window.requestAnimationFrame(loop);
    return true;
  }

  function stop() {
    active = false;
    if (rafId) { try { window.cancelAnimationFrame(rafId); } catch (e) {} rafId = 0; }
    return true;
  }

  function resize() {
    if (!renderer || !canvas) { return false; }
    var w = canvas.clientWidth || (canvas.parentElement ? canvas.parentElement.clientWidth : 0) || 800;
    var h = canvas.clientHeight || (canvas.parentElement ? canvas.parentElement.clientHeight : 0) || 600;
    renderer.setSize(w, h, false);
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    return true;
  }

  function setShading(mode) {
    shadingMode = (mode === 'wireframe') ? 'wireframe' : 'shaded';
    var wire = shadingMode === 'wireframe';
    Object.keys(nodeById).forEach(function (id) {
      nodeById[id].traverse(function (child) {
        if (child.material && child.isMesh) {
          var mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(function (m) { if ('wireframe' in m) { m.wireframe = wire; } });
        }
      });
    });
    if (window.PixiEngine.EventBus) { window.PixiEngine.EventBus.emit('shading-changed', { mode: shadingMode }); }
    return shadingMode;
  }

  function toggleGrid(show) {
    if (!hasThree()) { return fail('THREE chưa load. Không bật/tắt lưới three.js.'); }
    if (!scene) { return false; }
    if (show && !gridHelper) {
      gridHelper = new THREE.GridHelper(40, 40, 0x888888, 0xbbbbbb);
      gridHelper.position.y = -0.9;
      gridHelper.userData.noPick = true;
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = 0.35;
      scene.add(gridHelper);
    }
    if (gridHelper) { gridHelper.visible = !!show; }
    return !!show;
  }

  function raycastPick(x, y) {
    if (!hasThree()) { return fail('THREE chưa load. Không pick được.'); }
    if (!scene || !camera || !canvas) { return null; }
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) { return null; }
    var ndc = new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );
    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(scene.children, true);
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      while (o) {
        if (o.userData && o.userData.gameObjectId) { return o.userData.gameObjectId; }
        if (o.userData && o.userData.noPick) { break; }
        o = o.parent;
      }
    }
    return null;
  }

  function getStats() {
    if (!hasThree() || !renderer) { return false; }
    var info = renderer.info || {};
    var render = info.render || {};
    var memory = info.memory || {};
    return {
      drawCalls: render.calls || 0,
      triangles: render.triangles || 0,
      geometries: memory.geometries || 0,
      textures: memory.textures || 0
    };
  }

  function getCameraState() {
    if (!orbit.target) { return null; }
    return {
      target: { x: orbit.target.x, y: orbit.target.y, z: orbit.target.z },
      theta: orbit.theta, phi: orbit.phi, radius: orbit.radius
    };
  }
  function setCameraState(cs) {
    if (!cs || !hasThree()) { return false; }
    if (!orbit.target) { orbit.target = new THREE.Vector3(0, 0, 0); }
    if (cs.target) { orbit.target.set(num(cs.target.x, 0), num(cs.target.y, 0), num(cs.target.z, 0)); }
    if (typeof cs.theta === 'number') { orbit.theta = cs.theta; }
    if (typeof cs.phi === 'number') { orbit.phi = Math.max(0.05, Math.min(Math.PI - 0.05, cs.phi)); }
    if (typeof cs.radius === 'number') { orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, cs.radius)); }
    applyOrbit();
    return true;
  }

  function dispose() {
    stop();
    detachOrbitControls();
    try { clear(); } catch (e) {}
    if (skyDome) { try { disposeNode(skyDome); } catch (e) {} skyDome = null; }
    if (gridHelper) { try { disposeNode(gridHelper); } catch (e) {} gridHelper = null; }
    if (renderer) {
      try { renderer.dispose(); } catch (e) {}
      // KHÔNG dispose canvas: canvas #viewport-canvas vẫn dùng chung cho Babylon.
      renderer = null;
    }
    scene = null; camera = null; hemiLight = null; sunLight = null; clock = null;
    if (state) { state.threeRenderer = null; state.threeScene = null; state.threeCamera = null; }
    return true;
  }

  window.PixiEngine.ThreeRenderer = {
    createEngine: createEngine, createScene: createScene, createCamera: createCamera,
    buildFromObjects: buildFromObjects, addObject: addObject, removeObject: removeObject,
    updateObject: updateObject, clear: clear, start: start, stop: stop,
    resize: resize, setShading: setShading, toggleGrid: toggleGrid,
    raycastPick: raycastPick, getStats: getStats,
    getCameraState: getCameraState, setCameraState: setCameraState,
    getRenderer: function () { return renderer; },
    getScene: function () { return scene; },
    getCamera: function () { return camera; },
    isActive: function () { return active; },
    dispose: dispose
  };
})();
