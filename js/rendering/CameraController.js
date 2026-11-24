'use strict';
/* CameraController.js — Orbit/Free/Top/Front/Left/Right, focus, zoom, WASD (free), touch pinch.
   Nhóm RENDERING. Touch 1 ngón orbit + 2 ngón pinch do Babylon ArcRotateCamera hỗ trợ sẵn. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var camera = null;
  var canvas = null;
  var mode = 'orbit';
  var keys = {};
  var moveSpeed = 0.35;
  var freeTarget = null; // Vector3 mục tiêu khi ở free mode (dùng camera target của ArcRotate)
  var attached = false;

  function attach(cam, cnv) {
    camera = cam;
    canvas = cnv || document.getElementById('viewport-canvas');
    if (!attached) {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      attached = true;
    }
  }

  function isTyping() {
    var el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }
  function isPlaying() {
    return window.PixiEngine.state && window.PixiEngine.state.mode === 'play';
  }

  function onKeyDown(e) {
    if (isTyping() || isPlaying()) { return; }
    if (mode !== 'free') { return; }
    keys[e.key.toLowerCase()] = true;
    if (['w', 'a', 's', 'd', 'q', 'e'].indexOf(e.key.toLowerCase()) !== -1) {
      e.preventDefault();
      moveFree();
    }
  }
  function onKeyUp(e) { keys[e.key.toLowerCase()] = false; }

  function moveFree() {
    if (!camera || typeof BABYLON === 'undefined') { return; }
    var fwd = camera.getForwardRay ? null : null;
    // Hướng nhìn của ArcRotateCamera: từ camera về target.
    var dir = camera.getTarget().subtract(camera.position).normalize();
    var right = BABYLON.Vector3.Cross(dir, new BABYLON.Vector3(0, 1, 0)).normalize();
    var move = new BABYLON.Vector3(0, 0, 0);
    if (keys['w']) { move = move.add(dir); }
    if (keys['s']) { move = move.subtract(dir); }
    if (keys['d']) { move = move.add(right); }
    if (keys['a']) { move = move.subtract(right); }
    if (keys['e']) { move.y += 1; }
    if (keys['q']) { move.y -= 1; }
    if (move.lengthSquared() === 0) { return; }
    move = move.normalize().scale(moveSpeed);
    camera.position.addInPlace(move);
    camera.setTarget(camera.getTarget().add(move));
  }

  function setMode(m) {
    mode = m || 'orbit';
    if (!camera || typeof BABYLON === 'undefined') { return mode; }
    var target = camera.getTarget();
    var radius = camera.radius || 30;
    // Đặt lại góc nhìn theo hướng chuẩn; giữ target + radius hiện tại.
    if (mode === 'top') { camera.alpha = -Math.PI / 2; camera.beta = 0.05; }
    else if (mode === 'front') { camera.alpha = -Math.PI / 2; camera.beta = Math.PI / 2; }
    else if (mode === 'right') { camera.alpha = 0; camera.beta = Math.PI / 2; }
    else if (mode === 'left') { camera.alpha = Math.PI; camera.beta = Math.PI / 2; }
    else if (mode === 'free') { /* WASD xử lý ở keydown; camera vẫn là ArcRotate */ }
    else { camera.alpha = -Math.PI / 2; camera.beta = Math.PI / 3; } // orbit
    camera.setTarget(target);
    camera.radius = radius;
    if (window.PixiEngine.EventBus) { window.PixiEngine.EventBus.emit('camera-mode-changed', { mode: mode }); }
    return mode;
  }

  function getMode() { return mode; }

  function focus(target) {
    if (!camera) { return false; }
    var pos = null;
    if (!target) { pos = new BABYLON.Vector3(0, 0, 0); }
    else if (target.babylonNode && target.babylonNode.getAbsolutePosition) {
      pos = target.babylonNode.getAbsolutePosition();
    } else if (target.position) {
      pos = new BABYLON.Vector3(target.position.x || 0, target.position.y || 0, target.position.z || 0);
    } else if (target.transform && target.transform.position) {
      var p = target.transform.position;
      pos = new BABYLON.Vector3(p.x, p.y, p.z);
    }
    if (!pos) { return false; }
    camera.setTarget(pos);
    if (camera.radius > 25) { camera.radius = 18; }
    return true;
  }

  function zoomIn() { if (camera) { camera.radius = Math.max(camera.lowerRadiusLimit || 5, (camera.radius || 30) * 0.8); } }
  function zoomOut() { if (camera) { camera.radius = Math.min(camera.upperRadiusLimit || 120, (camera.radius || 30) * 1.25); } }
  function reset() {
    if (!camera) { return; }
    camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    camera.alpha = -Math.PI / 2; camera.beta = Math.PI / 3; camera.radius = 30;
  }

  window.PixiEngine.CameraController = {
    attach: attach, setMode: setMode, getMode: getMode, focus: focus,
    zoomIn: zoomIn, zoomOut: zoomOut, reset: reset,
    getCamera: function () { return camera; }
  };
})();
