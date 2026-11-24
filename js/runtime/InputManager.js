'use strict';
/* PixiEngine.InputManager — Bàn phím + joystick ảo (phone-first).
 * Vanilla JS, không phụ thuộc lib ngoài. Mọi hàm đều phòng thủ typeof
 * trước khi gọi các manager khác.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};

  var keys = {};            // code -> true khi đang giữ
  var joy = { x: 0, z: 0, active: false }; // vector joystick -1..1
  var jumpCbs = [];
  var joystickEnabled = false;
  var joystickEl = null;
  var knobEl = null;
  var jumpBtnEl = null;
  var touchControlsEl = null;
  var initialized = false;

  var KEY_MAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right'
  };

  function ensureTouchControls() {
    touchControlsEl = document.getElementById('touch-controls');
    if (!touchControlsEl) {
      touchControlsEl = document.createElement('div');
      touchControlsEl.id = 'touch-controls';
      touchControlsEl.style.cssText =
        'position:absolute;left:0;right:0;bottom:0;top:0;pointer-events:none;' +
        'display:none;z-index:30;';
      var wrap = document.getElementById('viewport-wrap') || document.body;
      wrap.appendChild(touchControlsEl);
    }
    return touchControlsEl;
  }

  function buildJoystick() {
    ensureTouchControls();
    if (joystickEl) return;

    joystickEl = document.createElement('div');
    joystickEl.id = 'touch-joystick';
    joystickEl.style.cssText =
      'position:absolute;left:16px;bottom:16px;width:120px;height:120px;' +
      'border-radius:50%;background:rgba(255,255,255,0.12);' +
      'border:2px solid rgba(255,255,255,0.35);pointer-events:auto;' +
      'touch-action:none;';
    knobEl = document.createElement('div');
    knobEl.id = 'touch-joystick-knob';
    knobEl.style.cssText =
      'position:absolute;left:50%;top:50%;width:52px;height:52px;' +
      'margin:-26px 0 0 -26px;border-radius:50%;' +
      'background:rgba(255,255,255,0.45);border:2px solid rgba(255,255,255,0.7);';
    joystickEl.appendChild(knobEl);
    touchControlsEl.appendChild(joystickEl);

    jumpBtnEl = document.createElement('button');
    jumpBtnEl.id = 'touch-jump';
    jumpBtnEl.type = 'button';
    jumpBtnEl.textContent = 'NHẢY';
    jumpBtnEl.style.cssText =
      'position:absolute;right:20px;bottom:28px;width:72px;height:72px;' +
      'border-radius:50%;border:2px solid rgba(255,255,255,0.6);' +
      'background:rgba(80,160,255,0.55);color:#fff;font-weight:bold;' +
      'font-size:15px;pointer-events:auto;touch-action:none;';
    touchControlsEl.appendChild(jumpBtnEl);

    var pointerId = null;

    function updateKnob(clientX, clientY) {
      var rect = joystickEl.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = clientX - cx;
      var dy = clientY - cy;
      var max = rect.width / 2 - 10;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      joy.x = dx / max;
      joy.z = dy / max;
      joy.active = true;
      knobEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }

    function resetKnob() {
      joy.x = 0; joy.z = 0; joy.active = false;
      knobEl.style.transform = 'translate(0px,0px)';
    }

    joystickEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      pointerId = e.pointerId;
      try { joystickEl.setPointerCapture(e.pointerId); } catch (err) {}
      updateKnob(e.clientX, e.clientY);
    });
    joystickEl.addEventListener('pointermove', function (e) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      updateKnob(e.clientX, e.clientY);
    });
    function endPointer(e) {
      if (pointerId !== null && e.pointerId !== pointerId) return;
      pointerId = null;
      resetKnob();
    }
    joystickEl.addEventListener('pointerup', endPointer);
    joystickEl.addEventListener('pointercancel', endPointer);

    jumpBtnEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      fireJump();
    });
    jumpBtnEl.addEventListener('click', function (e) {
      e.preventDefault();
    });
  }

  function fireJump() {
    for (var i = 0; i < jumpCbs.length; i++) {
      try { jumpCbs[i](); } catch (err) { console.warn('[InputManager] onJump lỗi:', err); }
    }
  }

  function onKeyDown(e) {
    if (e.code === 'Space') {
      // Không nhảy khi đang gõ trong input/textarea
      var tag = (e.target && e.target.tagName) || '';
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        if (!e.repeat) fireJump();
      }
    }
    keys[e.code] = true;
  }

  function onKeyUp(e) {
    keys[e.code] = false;
  }

  function onBlur() {
    keys = {};
    joy.x = 0; joy.z = 0; joy.active = false;
    if (knobEl) knobEl.style.transform = 'translate(0px,0px)';
  }

  window.PixiEngine.InputManager = {
    init: function () {
      if (initialized) return;
      initialized = true;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      buildJoystick();
      this.showTouchControls(false);
    },

    isKeyDown: function (code) {
      return !!keys[code];
    },

    isRunning: function () {
      return !!(keys.ShiftLeft || keys.ShiftRight);
    },

    // Gộp bàn phím + joystick. Trả về {x, z} trong khoảng -1..1.
    // x: phải (+) / trái (-); z: xuống (+) / lên (-).
    getMoveVector: function () {
      var x = 0, z = 0;
      if (keys.KeyD || keys.ArrowRight) x += 1;
      if (keys.KeyA || keys.ArrowLeft) x -= 1;
      if (keys.KeyS || keys.ArrowDown) z += 1;
      if (keys.KeyW || keys.ArrowUp) z -= 1;
      if (joy.active || joy.x !== 0 || joy.z !== 0) {
        x += joy.x;
        z += joy.z;
      }
      // Chuẩn hóa để vector không vượt quá 1
      var len = Math.sqrt(x * x + z * z);
      if (len > 1) { x /= len; z /= len; }
      return { x: x, z: z };
    },

    onJump: function (cb) {
      if (typeof cb === 'function') jumpCbs.push(cb);
    },

    enableTouchJoystick: function (enabled) {
      joystickEnabled = !!enabled;
      this.showTouchControls(joystickEnabled);
    },

    // Chỉ hiện joystick khi mode play
    showTouchControls: function (show) {
      ensureTouchControls();
      if (touchControlsEl) {
        touchControlsEl.style.display = show ? 'block' : 'none';
      }
    },

    isTouchEnabled: function () {
      return joystickEnabled;
    }
  };
})();
