'use strict';
/* PixiEngine.PhysicsManager — Vật lý đơn giản tự viết, KHÔNG lib ngoài.
 * CHỈ có: trọng lực, va chạm mặt đất, giới hạn bounds.
 * Đây KHÔNG phải engine vật lý đầy đủ (không có va chạm phức tạp,
 * không có xoay, không có joint/constraint).
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};

  var rigidbodies = {}; // objId -> { objId, mass, gravity, friction, velocity:{x,y,z}, grounded }
  var GRAVITY = -9.8;
  var BOUND = 60; // |x|, |z| <= 60
  var initialized = false;

  function getObj(id) {
    if (typeof window.PixiEngine.SceneManager !== 'undefined' &&
        typeof window.PixiEngine.SceneManager.findById === 'function') {
      return window.PixiEngine.SceneManager.findById(id);
    }
    return null;
  }

  function getGroundHeight(x, z) {
    if (typeof window.PixiEngine.SceneManager !== 'undefined' &&
        typeof window.PixiEngine.SceneManager.getGroundHeight === 'function') {
      var h = window.PixiEngine.SceneManager.getGroundHeight(x, z);
      return (typeof h === 'number' && isFinite(h)) ? h : 0;
    }
    return 0;
  }

  window.PixiEngine.PhysicsManager = {
    init: function () {
      initialized = true;
      rigidbodies = {};
    },

    addRigidbody: function (objId, opts) {
      opts = opts || {};
      rigidbodies[objId] = {
        objId: objId,
        mass: (typeof opts.mass === 'number' && opts.mass > 0) ? opts.mass : 1,
        gravity: (typeof opts.gravity === 'number') ? opts.gravity : 1,
        friction: (typeof opts.friction === 'number') ? opts.friction : 0.1,
        velocity: { x: 0, y: 0, z: 0 },
        grounded: false
      };
      return rigidbodies[objId];
    },

    removeRigidbody: function (objId) {
      delete rigidbodies[objId];
    },

    getRigidbody: function (objId) {
      return rigidbodies[objId] || null;
    },

    setVelocity: function (objId, vx, vy, vz) {
      var rb = rigidbodies[objId];
      if (!rb) return;
      rb.velocity.x = vx; rb.velocity.y = vy; rb.velocity.z = vz;
    },

    // Áp trọng lực cho mọi rigidbody đang active
    applyGravity: function (dt) {
      dt = (typeof dt === 'number' && dt > 0) ? dt : 0.016;
      var ids = Object.keys(rigidbodies);
      for (var i = 0; i < ids.length; i++) {
        var rb = rigidbodies[ids[i]];
        var obj = getObj(rb.objId);
        if (!obj || obj.active === false) continue;
        if (!rb.grounded) {
          rb.velocity.y += GRAVITY * rb.gravity * dt;
        }
      }
    },

    // Cập nhật vị trí + va chạm mặt đất + bounds cho mọi rigidbody active
    step: function (dt) {
      dt = (typeof dt === 'number' && dt > 0) ? Math.min(dt, 0.05) : 0.016;
      this.applyGravity(dt);
      var ids = Object.keys(rigidbodies);
      for (var i = 0; i < ids.length; i++) {
        var rb = rigidbodies[ids[i]];
        var obj = getObj(rb.objId);
        if (!obj || obj.active === false) continue;
        if (!obj.transform || !obj.transform.position) continue;

        var pos = obj.transform.position;
        pos.x += rb.velocity.x * dt;
        pos.y += rb.velocity.y * dt;
        pos.z += rb.velocity.z * dt;

        // Giới hạn bounds scene
        if (pos.x > BOUND) pos.x = BOUND;
        if (pos.x < -BOUND) pos.x = -BOUND;
        if (pos.z > BOUND) pos.z = BOUND;
        if (pos.z < -BOUND) pos.z = -BOUND;

        // Va chạm mặt đất
        var ground = getGroundHeight(pos.x, pos.z);
        if (pos.y <= ground) {
          pos.y = ground;
          rb.velocity.y = 0;
          rb.grounded = true;
        } else {
          rb.grounded = false;
        }

        // Đồng bộ sang babylonNode nếu có
        if (obj.babylonNode && obj.babylonNode.position) {
          obj.babylonNode.position.x = pos.x;
          obj.babylonNode.position.y = pos.y;
          obj.babylonNode.position.z = pos.z;
        }
      }
    }
  };
})();
