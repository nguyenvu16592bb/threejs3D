/* ============================================================
 * WuxiaCamera.js — Camera isometric follow (PixiJS 3D Engine v5.0)
 * Vanilla JS, IIFE, 'use strict'. Camera three.js PerspectiveCamera,
 * KHÔNG dùng OrbitControls. Góc nhìn isometric: pitch mặc định 42°
 * (kẹp 35-50°), yaw mặc định -45°, distance 14-40 (mặc định 24).
 * follow() lerp mượt theo hệ số 5*dt (khử phụ thuộc framerate).
 * Toán thuần JS nên vẫn chạy khi THREE undefined, chỉ cần camera
 * có position.set(x,y,z) + lookAt(x,y,z) (camera three thật hoặc
 * object giả lập có 2 hàm đó).
 * ============================================================ */
(function () {
'use strict';

window.PixiEngine = window.PixiEngine || {};
window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};
var PE = window.PixiEngine;

var MIN_PITCH = 35, MAX_PITCH = 50, DEF_PITCH = 42;
var MIN_DIST = 14, MAX_DIST = 40, DEF_DIST = 24;
var DEF_YAW = -45;
var SMOOTH = 5;          /* hệ số lerp: 5*dt */
var LOOK_HEIGHT = 1;     /* điểm nhìn cao hơn chân nhân vật 1 đơn vị */

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function deg2rad(d) { return d * Math.PI / 180; }
function normYaw(d) {
  d = d % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
/* target có thể là {x,y,z}, {x,z}, THREE.Vector3, hoặc {position:{x,y,z}} */
function readTarget(t) {
  if (!t) return null;
  if (typeof t.x === 'number' && typeof t.z === 'number')
    return { x: t.x, y: (typeof t.y === 'number' ? t.y : 0), z: t.z };
  if (t.position && typeof t.position.x === 'number')
    return { x: t.position.x, y: t.position.y || 0, z: t.position.z };
  return null;
}

var Camera = {
  _camera: null,
  _pitch: DEF_PITCH, _yaw: DEF_YAW, _distance: DEF_DIST,
  _target: { x: 0, y: 0, z: 0 },   /* điểm nhìn hiện tại (đã lerp) */
  _hasTarget: false,
  _shakeAmp: 0, _shakeT: 0, _shakeDur: 0,

  /* Gắn camera three (PerspectiveCamera). Trả false nếu camera không hợp lệ. */
  create: function (camera, opts) {
    if (!camera || !camera.position || typeof camera.position.set !== 'function'
        || typeof camera.lookAt !== 'function') {
      console.warn('[WuxiaCamera] create() cần camera có position.set + lookAt.');
      return false;
    }
    this._camera = camera;
    opts = opts || {};
    if (typeof opts.pitch === 'number') this.setPitch(opts.pitch);
    if (typeof opts.yaw === 'number') this.setYaw(opts.yaw);
    if (typeof opts.distance === 'number') this.setDistance(opts.distance);
    return true;
  },

  /* Theo mục tiêu, lerp mượt. dt tính bằng giây; thiếu dt thì dùng 1/60. */
  follow: function (targetPos, dt) {
    var t = readTarget(targetPos);
    if (!t) return false;
    if (!this._camera) { console.warn('[WuxiaCamera] follow() trước create().'); return false; }
    dt = (typeof dt === 'number' && dt > 0) ? Math.min(dt, 0.1) : 1 / 60;
    if (!this._hasTarget) {   /* lần đầu: nhảy thẳng tới mục tiêu */
      this._target.x = t.x; this._target.y = t.y; this._target.z = t.z;
      this._hasTarget = true;
    } else {
      var k = 1 - Math.exp(-SMOOTH * dt);   /* ~ 5*dt, ổn định mọi fps */
      this._target.x += (t.x - this._target.x) * k;
      this._target.y += (t.y - this._target.y) * k;
      this._target.z += (t.z - this._target.z) * k;
    }
    this._apply(dt);
    return true;
  },

  /* Nhảy thẳng tới mục tiêu, không lerp (dùng khi teleport / đổi map). */
  snap: function (targetPos) {
    var t = readTarget(targetPos);
    if (!t) return false;
    this._target.x = t.x; this._target.y = t.y; this._target.z = t.z;
    this._hasTarget = true;
    this._apply(0);
    return true;
  },

  /* Cập nhật mỗi frame: giảm rung + giữ camera ở vị trí theo target cuối.
   * Gọi sau follow() hoặc độc lập khi target đứng yên mà còn rung. */
  update: function (dt) {
    if (!this._camera || !this._hasTarget) return false;
    /* dt không kẹp 0.1 ở đây: _apply chỉ dùng dt để giảm rung,
     * kẹp sẽ làm rung kéo dài hơn thời gian thực khi frame dài. */
    this._apply((typeof dt === 'number' && dt > 0) ? dt : 1 / 60);
    return true;
  },

  _apply: function (dt) {
    var pitch = deg2rad(this._pitch), yaw = deg2rad(this._yaw);
    var d = this._distance;
    var ox = Math.sin(yaw) * Math.cos(pitch) * d;
    var oy = Math.sin(pitch) * d;
    var oz = Math.cos(yaw) * Math.cos(pitch) * d;
    var sx = 0, sz = 0;
    if (this._shakeT > 0) {
      this._shakeT -= dt;
      var f = this._shakeAmp * Math.max(0, this._shakeT / this._shakeDur);
      sx = (Math.random() * 2 - 1) * f;
      sz = (Math.random() * 2 - 1) * f;
      if (this._shakeT <= 0) { this._shakeAmp = 0; this._shakeT = 0; }
    }
    this._camera.position.set(
      this._target.x + ox + sx,
      this._target.y + oy,
      this._target.z + oz + sz);
    this._camera.lookAt(this._target.x, this._target.y + LOOK_HEIGHT, this._target.z);
  },

  setPitch: function (deg) {
    this._pitch = clamp(deg, MIN_PITCH, MAX_PITCH);
    return this._pitch;
  },
  getPitch: function () { return this._pitch; },

  setYaw: function (deg) {
    this._yaw = normYaw(deg);
    return this._yaw;
  },
  getYaw: function () { return this._yaw; },

  setDistance: function (d) {
    this._distance = clamp(d, MIN_DIST, MAX_DIST);
    return this._distance;
  },
  getDistance: function () { return this._distance; },

  zoomIn: function () { return this.setDistance(this._distance * 0.85); },
  zoomOut: function () { return this.setDistance(this._distance * 1.18); },

  /* Rung camera cho đòn boss. amount ~0.2-0.6, kéo dài ~0.4s. */
  shake: function (amount, duration) {
    this._shakeAmp = Math.max(0, amount || 0);
    this._shakeDur = (typeof duration === 'number' && duration > 0) ? duration : 0.4;
    this._shakeT = this._shakeDur;
    return this._shakeAmp;
  },
  isShaking: function () { return this._shakeT > 0; },

  getState: function () {
    return {
      pitch: this._pitch, yaw: this._yaw, distance: this._distance,
      target: { x: this._target.x, y: this._target.y, z: this._target.z },
      hasTarget: this._hasTarget
    };
  },

  dispose: function () {
    this._camera = null;
    this._hasTarget = false;
    this._shakeAmp = 0; this._shakeT = 0;
  }
};

PE.WuxiaCamera = Camera;
PE.Wuxia.Camera = Camera;

})();
