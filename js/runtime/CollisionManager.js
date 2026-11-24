'use strict';
/* PixiEngine.CollisionManager — Collider box/sphere AABB đơn giản, tự viết.
 * Không lib ngoài. checkCollision dùng AABB overlap thật.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};

  var colliders = {}; // objId -> { objId, type, size:{x,y,z}, radius }
  var BOUND = 60;

  function getObj(id) {
    if (typeof window.PixiEngine.SceneManager !== 'undefined' &&
        typeof window.PixiEngine.SceneManager.findById === 'function') {
      return window.PixiEngine.SceneManager.findById(id);
    }
    return null;
  }

  function getPos(obj) {
    if (!obj) return null;
    if (obj.transform && obj.transform.position) return obj.transform.position;
    if (obj.babylonNode && obj.babylonNode.position) return obj.babylonNode.position;
    return null;
  }

  // Bounding box (AABB) của một object: ưu tiên babylonNode nếu có,
  // ngược lại suy ra từ collider + vị trí.
  function getAABB(objId) {
    var obj = getObj(objId);
    if (!obj) return null;
    var pos = getPos(obj);
    if (!pos) return null;
    var col = colliders[objId];

    if (obj.babylonNode && typeof obj.babylonNode.getBoundingInfo === 'function') {
      try {
        var info = obj.babylonNode.getBoundingInfo();
        if (info && info.boundingBox) {
          var bb = info.boundingBox;
          return {
            min: { x: bb.minimumWorld.x, y: bb.minimumWorld.y, z: bb.minimumWorld.z },
            max: { x: bb.maximumWorld.x, y: bb.maximumWorld.y, z: bb.maximumWorld.z }
          };
        }
      } catch (err) { /* fallback xuống collider */ }
    }

    var hx = 0.5, hy = 0.5, hz = 0.5;
    if (col) {
      if (col.type === 'sphere') {
        hx = hy = hz = col.radius || 0.5;
      } else if (col.size) {
        hx = (col.size.x || 1) / 2;
        hy = (col.size.y || 1) / 2;
        hz = (col.size.z || 1) / 2;
      }
    }
    return {
      min: { x: pos.x - hx, y: pos.y - hy, z: pos.z - hz },
      max: { x: pos.x + hx, y: pos.y + hy, z: pos.z + hz }
    };
  }

  window.PixiEngine.CollisionManager = {
    addCollider: function (objId, opts) {
      opts = opts || {};
      var col = {
        objId: objId,
        type: opts.type === 'sphere' ? 'sphere' : 'box',
        size: opts.size || { x: 1, y: 1, z: 1 },
        radius: (typeof opts.radius === 'number') ? opts.radius : 0.5
      };
      colliders[objId] = col;
      var obj = getObj(objId);
      if (obj) {
        obj.userData = obj.userData || {};
        obj.userData.collider = col;
      }
      return col;
    },

    removeCollider: function (objId) {
      delete colliders[objId];
      var obj = getObj(objId);
      if (obj && obj.userData) delete obj.userData.collider;
    },

    getCollider: function (objId) {
      return colliders[objId] || null;
    },

    // AABB overlap thật giữa 2 object
    checkCollision: function (objA, objB) {
      var idA = (typeof objA === 'string') ? objA : (objA && objA.id);
      var idB = (typeof objB === 'string') ? objB : (objB && objB.id);
      if (!idA || !idB || idA === idB) return false;
      var a = getAABB(idA);
      var b = getAABB(idB);
      if (!a || !b) return false;
      return (
        a.min.x <= b.max.x && a.max.x >= b.min.x &&
        a.min.y <= b.max.y && a.max.y >= b.min.y &&
        a.min.z <= b.max.z && a.max.z >= b.min.z
      );
    },

    // Đẩy player ra khỏi mọi box collider + chặn rơi khỏi bounds.
    // pos: {x,y,z} — trả về pos mới (cùng object, đã sửa tại chỗ).
    resolvePlayer: function (pos, radius) {
      if (!pos) return pos;
      radius = (typeof radius === 'number' && radius > 0) ? radius : 0.5;
      var ids = Object.keys(colliders);
      for (var i = 0; i < ids.length; i++) {
        var col = colliders[ids[i]];
        var obj = getObj(col.objId);
        if (!obj || obj.active === false) continue;
        // Bỏ qua chính player (collider của player không chặn chính nó)
        if (obj.type === 'player') continue;
        var box = getAABB(col.objId);
        if (!box) continue;
        // Chỉ xử lý khi player chồng lấn theo chiều Y (đứng cùng tầng)
        if (pos.y + 1.0 < box.min.y || pos.y > box.max.y) continue;
        var closestX = Math.max(box.min.x, Math.min(pos.x, box.max.x));
        var closestZ = Math.max(box.min.z, Math.min(pos.z, box.max.z));
        var dx = pos.x - closestX;
        var dz = pos.z - closestZ;
        var distSq = dx * dx + dz * dz;
        if (distSq < radius * radius) {
          if (distSq > 0.000001) {
            var dist = Math.sqrt(distSq);
            var push = radius - dist;
            pos.x += (dx / dist) * push;
            pos.z += (dz / dist) * push;
          } else {
            // Player nằm hẳn trong box: đẩy ra theo trục ngắn nhất
            var left = pos.x - box.min.x;
            var right = box.max.x - pos.x;
            var back = pos.z - box.min.z;
            var front = box.max.z - pos.z;
            var m = Math.min(left, right, back, front);
            if (m === left) pos.x = box.min.x - radius;
            else if (m === right) pos.x = box.max.x + radius;
            else if (m === back) pos.z = box.min.z - radius;
            else pos.z = box.max.z + radius;
          }
        }
      }
      // Chặn rơi khỏi bounds
      if (pos.x > BOUND) pos.x = BOUND;
      if (pos.x < -BOUND) pos.x = -BOUND;
      if (pos.z > BOUND) pos.z = BOUND;
      if (pos.z < -BOUND) pos.z = -BOUND;
      return pos;
    }
  };
})();
