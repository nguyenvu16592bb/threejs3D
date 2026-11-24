'use strict';
/* EventManager.js — EventBus pub/sub đơn giản cho PixiEngine.
   Nhóm CORE. Không phụ thuộc BABYLON/PIXI. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.state = window.PixiEngine.state || {
    scene: null, engine: null, canvas: null, objects: [], selected: null,
    mode: 'edit', stats: { fps: 0, drawCalls: 0, triangles: 0, vertices: 0 }
  };

  var listeners = {};

  function on(ev, fn) {
    if (!ev || typeof fn !== 'function') { return; }
    listeners[ev] = listeners[ev] || [];
    if (listeners[ev].indexOf(fn) === -1) { listeners[ev].push(fn); }
  }

  function off(ev, fn) {
    if (!listeners[ev]) { return; }
    if (!fn) { delete listeners[ev]; return; }
    var i = listeners[ev].indexOf(fn);
    if (i !== -1) { listeners[ev].splice(i, 1); }
  }

  function emit(ev, data) {
    var list = listeners[ev];
    if (!list || !list.length) { return; }
    // Sao chép mảng để listener có thể off() trong lúc emit mà không lỗi.
    var copy = list.slice();
    for (var i = 0; i < copy.length; i++) {
      try { copy[i](data); } catch (e) { console.error('[EventBus]', ev, e); }
    }
  }

  function once(ev, fn) {
    function wrapper(data) { off(ev, wrapper); fn(data); }
    on(ev, wrapper);
  }

  window.PixiEngine.EventBus = { on: on, off: off, emit: emit, once: once };
  // Alias đúng tên file cho nhóm khác dùng nếu cần.
  window.PixiEngine.EventManager = window.PixiEngine.EventBus;
})();
