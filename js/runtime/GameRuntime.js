'use strict';
/* PixiEngine.GameRuntime — Play / Pause / Stop + player procedural + camera follow.
 * Vanilla JS. Mọi manager khác đều gọi qua typeof check.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};

  var playing = false;
  var paused = false;
  var playerId = null;
  var spawnPos = { x: 0, y: 0, z: 5 };
  var jumpRequested = false;
  var WALK_SPEED = 6;
  var RUN_SPEED = 10;
  var JUMP_VELOCITY = 7;
  var observerRegistered = false;

  function emit(name, data) {
    if (window.PixiEngine.EventBus && typeof window.PixiEngine.EventBus.emit === 'function') {
      window.PixiEngine.EventBus.emit(name, data);
    }
  }

  function getState() {
    window.PixiEngine.state = window.PixiEngine.state || { scene: null, engine: null, objects: [], selected: null, mode: 'edit' };
    return window.PixiEngine.state;
  }

  function findPlayerObject() {
    var state = getState();
    if (typeof window.PixiEngine.SceneManager !== 'undefined' &&
        typeof window.PixiEngine.SceneManager.findById === 'function' && playerId) {
      var byId = window.PixiEngine.SceneManager.findById(playerId);
      if (byId) return byId;
    }
    for (var i = 0; i < (state.objects || []).length; i++) {
      if (state.objects[i].type === 'player') return state.objects[i];
    }
    return null;
  }

  function createProceduralPlayer() {
    var def = {
      id: 'player-' + Date.now(),
      name: 'Player',
      type: 'player',
      parentId: null,
      children: [],
      transform: {
        position: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      components: [{ type: 'rigidbody', mass: 1 }, { type: 'collider', colliderType: 'box' }],
      visible: true,
      active: true,
      // Mô tả hình procedural để renderer khác dựng khi có: thân capsule/box + đầu sphere
      procedural: {
        body: { shape: 'box', size: { x: 0.6, y: 1.0, z: 0.4 }, color: '#4a90d9', offsetY: 0.9 },
        head: { shape: 'sphere', radius: 0.3, color: '#f2c89b', offsetY: 1.7 }
      }
    };
    if (typeof window.PixiEngine.SceneManager !== 'undefined' &&
        typeof window.PixiEngine.SceneManager.addObject === 'function') {
      var created = window.PixiEngine.SceneManager.addObject(def);
      if (created && created.id) playerId = created.id;
      else playerId = def.id;
    } else {
      getState().objects.push(def);
      playerId = def.id;
    }
    return findPlayerObject();
  }

  function ensurePlayer() {
    var player = findPlayerObject();
    if (!player) player = createProceduralPlayer();
    if (player) playerId = player.id;
    if (player && typeof window.PixiEngine.PhysicsManager !== 'undefined' &&
        typeof window.PixiEngine.PhysicsManager.addRigidbody === 'function') {
      window.PixiEngine.PhysicsManager.addRigidbody(player.id, { mass: 1, gravity: 1, friction: 0.1 });
    }
    if (player && typeof window.PixiEngine.CollisionManager !== 'undefined' &&
        typeof window.PixiEngine.CollisionManager.addCollider === 'function') {
      window.PixiEngine.CollisionManager.addCollider(player.id, {
        type: 'box', size: { x: 0.6, y: 1.8, z: 0.6 }
      });
    }
    return player;
  }

  function setAnimState(name) {
    if (typeof window.PixiEngine.StateMachine !== 'undefined' &&
        typeof window.PixiEngine.StateMachine.setState === 'function') {
      try { window.PixiEngine.StateMachine.setState(name); } catch (err) {}
    }
  }

  function getCamera() {
    var state = getState();
    if (state.scene && state.scene.activeCamera) return state.scene.activeCamera;
    return null;
  }

  function updateCameraFollow(player) {
    var camera = getCamera();
    if (!camera || !player || !player.transform) return;
    var pos = player.transform.position;
    // ArcRotateCamera: đổi target theo player, giữ khoảng cách/radius hiện tại
    if (camera.target && typeof camera.target.set === 'function') {
      camera.target.set(pos.x, pos.y + 1.2, pos.z);
    } else if (camera.target) {
      camera.target.x = pos.x;
      camera.target.y = pos.y + 1.2;
      camera.target.z = pos.z;
    } else if (typeof camera.setTarget === 'function') {
      try { camera.setTarget({ x: pos.x, y: pos.y + 1.2, z: pos.z }); } catch (err) {}
    }
  }

  function frameUpdate() {
    if (!playing || paused) return;
    var player = findPlayerObject();
    if (!player || !player.transform) return;
    var pos = player.transform.position;

    var move = { x: 0, z: 0 };
    if (typeof window.PixiEngine.InputManager !== 'undefined' &&
        typeof window.PixiEngine.InputManager.getMoveVector === 'function') {
      move = window.PixiEngine.InputManager.getMoveVector() || move;
    }
    var running = false;
    if (typeof window.PixiEngine.InputManager !== 'undefined' &&
        typeof window.PixiEngine.InputManager.isRunning === 'function') {
      running = window.PixiEngine.InputManager.isRunning();
    }
    var speed = running ? RUN_SPEED : WALK_SPEED;
    var moving = (move.x !== 0 || move.z !== 0);

    // Di chuyển theo hướng camera (nếu có) — fallback: trục thế giới
    var dx = move.x, dz = move.z;
    var camera = getCamera();
    if (camera && typeof camera.alpha === 'number') {
      var sin = Math.sin(camera.alpha), cos = Math.cos(camera.alpha);
      var fx = -sin, fz = -cos;   // hướng camera nhìn (ArcRotate)
      var rx = -fz, rz = fx;      // phải
      dx = rx * move.x + fx * (-move.z);
      dz = rz * move.x + fz * (-move.z);
    }
    var len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) {
      var dt = 1 / 60;
      pos.x += (dx / len) * speed * dt * Math.min(len, 1) * (len > 1 ? 1 : len);
      pos.z += (dz / len) * speed * dt * Math.min(len, 1) * (len > 1 ? 1 : len);
      // Xoay player theo hướng di chuyển
      player.transform.rotation.y = Math.atan2(dx, dz);
    }

    // Nhảy
    if (jumpRequested) {
      jumpRequested = false;
      var rb = null;
      if (typeof window.PixiEngine.PhysicsManager !== 'undefined' &&
          typeof window.PixiEngine.PhysicsManager.getRigidbody === 'function') {
        rb = window.PixiEngine.PhysicsManager.getRigidbody(player.id);
      }
      if (rb && rb.grounded) {
        rb.velocity.y = JUMP_VELOCITY;
        rb.grounded = false;
      }
    }

    // Vật lý + va chạm
    if (typeof window.PixiEngine.PhysicsManager !== 'undefined' &&
        typeof window.PixiEngine.PhysicsManager.step === 'function') {
      window.PixiEngine.PhysicsManager.step(1 / 60);
    }
    if (typeof window.PixiEngine.CollisionManager !== 'undefined' &&
        typeof window.PixiEngine.CollisionManager.resolvePlayer === 'function') {
      window.PixiEngine.CollisionManager.resolvePlayer(pos, 0.5);
    }
    if (player.babylonNode && player.babylonNode.position) {
      player.babylonNode.position.x = pos.x;
      player.babylonNode.position.y = pos.y;
      player.babylonNode.position.z = pos.z;
      if (typeof player.babylonNode.rotation !== 'undefined') {
        player.babylonNode.rotation.y = player.transform.rotation.y;
      }
    }

    setAnimState(moving ? 'Walk' : 'Idle');
    updateCameraFollow(player);
  }

  function registerLoop() {
    if (observerRegistered) return;
    var state = getState();
    if (state.scene && typeof state.scene.registerBeforeRender === 'function') {
      state.scene.registerBeforeRender(frameUpdate);
      observerRegistered = true;
    }
  }

  window.PixiEngine.GameRuntime = {
    play: function () {
      var state = getState();
      state.mode = 'play';
      playing = true;
      paused = false;
      ensurePlayer();
      registerLoop();
      if (typeof window.PixiEngine.InputManager !== 'undefined' &&
          typeof window.PixiEngine.InputManager.enableTouchJoystick === 'function') {
        window.PixiEngine.InputManager.enableTouchJoystick(true);
      }
      if (typeof window.PixiEngine.CameraController !== 'undefined' &&
          typeof window.PixiEngine.CameraController.setMode === 'function') {
        try { window.PixiEngine.CameraController.setMode('follow'); } catch (err) {}
      }
      emit('play-state-changed', { playing: true, paused: false });
    },

    pause: function () {
      paused = true;
      emit('play-state-changed', { playing: true, paused: true });
    },

    resume: function () {
      if (!playing) return;
      paused = false;
      emit('play-state-changed', { playing: true, paused: false });
    },

    stop: function () {
      var state = getState();
      state.mode = 'edit';
      playing = false;
      paused = false;
      // Đưa player về vị trí spawn
      var player = findPlayerObject();
      if (player && player.transform) {
        player.transform.position.x = spawnPos.x;
        player.transform.position.y = spawnPos.y;
        player.transform.position.z = spawnPos.z;
        if (player.babylonNode && player.babylonNode.position) {
          player.babylonNode.position.x = spawnPos.x;
          player.babylonNode.position.y = spawnPos.y;
          player.babylonNode.position.z = spawnPos.z;
        }
        if (typeof window.PixiEngine.PhysicsManager !== 'undefined' &&
            typeof window.PixiEngine.PhysicsManager.getRigidbody === 'function') {
          var rb = window.PixiEngine.PhysicsManager.getRigidbody(player.id);
          if (rb) { rb.velocity.x = 0; rb.velocity.y = 0; rb.velocity.z = 0; }
        }
      }
      // Camera về orbit mặc định
      if (typeof window.PixiEngine.CameraController !== 'undefined' &&
          typeof window.PixiEngine.CameraController.setMode === 'function') {
        try { window.PixiEngine.CameraController.setMode('orbit'); } catch (err) {}
      } else {
        var camera = getCamera();
        if (camera && camera.target && typeof camera.target.set === 'function') {
          camera.target.set(0, 1, 0);
        }
      }
      if (typeof window.PixiEngine.InputManager !== 'undefined' &&
          typeof window.PixiEngine.InputManager.enableTouchJoystick === 'function') {
        window.PixiEngine.InputManager.enableTouchJoystick(false);
      }
      setAnimState('Idle');
      emit('play-state-changed', { playing: false, paused: false });
    },

    isPlaying: function () {
      return playing && !paused;
    },

    isPaused: function () {
      return paused;
    },

    getPlayer: function () {
      return findPlayerObject();
    },

    spawnPlayer: function (x, y, z) {
      if (typeof x === 'number') spawnPos.x = x;
      if (typeof y === 'number') spawnPos.y = y;
      if (typeof z === 'number') spawnPos.z = z;
      var player = ensurePlayer();
      if (player && player.transform) {
        player.transform.position.x = spawnPos.x;
        player.transform.position.y = spawnPos.y;
        player.transform.position.z = spawnPos.z;
      }
      return player;
    },

    // Gọi 1 lần khi khởi động app: nối nút nhảy của InputManager
    init: function () {
      if (typeof window.PixiEngine.InputManager !== 'undefined' &&
          typeof window.PixiEngine.InputManager.onJump === 'function') {
        window.PixiEngine.InputManager.onJump(function () { jumpRequested = true; });
      }
    }
  };
})();
