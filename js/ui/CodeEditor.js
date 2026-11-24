'use strict';
/* CodeEditor.js — Code Editor tab: textarea JS + Run an toàn + log + lưu localStorage.
   Nhóm CORE (bổ sung tích hợp). Không dùng import/export. Chạy code người dùng qua
   new Function với đúng 1 tham số PixiEngine, try/catch, KHÔNG eval toàn cục. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var PE = window.PixiEngine;
  var containerId = 'code-panel';
  var textarea = null, outputEl = null, statusEl = null;
  var LS_KEY = 'pixiengine-code-editor-v1';

  var EXAMPLES = {
    'Chào mừng': '// Ví dụ: thêm 5 cây thông quanh gốc tọa độ\nfor (var i = 0; i < 5; i++) {\n  var a = (i / 5) * Math.PI * 2;\n  PixiEngine.Prefabs.place("pine-tree", { x: Math.cos(a) * 8, y: 0.4, z: Math.sin(a) * 8 }, {});\n}\nlog("Đã thêm 5 cây thông.");',
    'Đổi màu trời': '// Ví dụ: đổi màu nền trời + sương mù\nvar scene = PixiEngine.state.scene;\nif (scene) { scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.25, 1); }\nif (PixiEngine.LightingManager) { PixiEngine.LightingManager.setFog(true, "#1a1a2e", 5, 60); }\nlog("Đã đổi sang trời đêm.");',
    'Tạo hạt lửa': '// Ví dụ: tạo hiệu ứng lửa tại vị trí (2, 2, 0)\nif (PixiEngine.ParticleEditor) { PixiEngine.ParticleEditor.createPreset("Fire", { x: 2, y: 2, z: 0 }); }\nlog("Đã tạo lửa.");',
    'Liệt kê objects': '// Ví dụ: liệt kê mọi object trong scene\nPixiEngine.state.objects.forEach(function (o) {\n  log(o.type + " — " + o.name + " @ (" + o.transform.position.x + ", " + o.transform.position.y + ", " + o.transform.position.z + ")");\n});'
  };

  function log(msg) {
    var line = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    if (outputEl) {
      var div = document.createElement('div');
      div.className = 'log-line';
      div.textContent = line;
      outputEl.appendChild(div);
      outputEl.scrollTop = outputEl.scrollHeight;
    }
    if (window.console && console.log) { console.log('[CodeEditor]', msg); }
  }

  function getCode() { return textarea ? textarea.value : ''; }
  function setCode(code) { if (textarea) { textarea.value = code || ''; } }

  function run() {
    var code = getCode();
    if (!code || !code.trim()) { log('Chưa có code để chạy.'); return false; }
    try {
      var fn = new Function('PixiEngine', 'BABYLON', 'PIXI', 'log', code);
      var ret = fn(PE, (typeof BABYLON !== 'undefined' ? BABYLON : null), (typeof PIXI !== 'undefined' ? PIXI : null), log);
      log('Chạy xong.' + (ret !== undefined ? ' Kết quả: ' + ret : ''));
      return true;
    } catch (e) {
      log('LỖI: ' + (e && e.message ? e.message : e));
      return false;
    }
  }

  function save() {
    try { window.localStorage.setItem(LS_KEY, getCode()); log('Đã lưu code vào trình duyệt.'); } catch (e) { log('Không lưu được: ' + e.message); }
  }
  function loadSaved() {
    try { return window.localStorage.getItem(LS_KEY); } catch (e) { return null; }
  }

  function buildUI(container) {
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'code-editor-wrap';

    var toolbar = document.createElement('div');
    toolbar.className = 'code-editor-toolbar';
    var sel = document.createElement('select');
    sel.className = 'code-example-select';
    var opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = '— Ví dụ mẫu —';
    sel.appendChild(opt0);
    Object.keys(EXAMPLES).forEach(function (k) {
      var o = document.createElement('option'); o.value = k; o.textContent = k; sel.appendChild(o);
    });
    sel.addEventListener('change', function () { if (sel.value) { setCode(EXAMPLES[sel.value]); log('Đã nạp ví dụ: ' + sel.value); } });
    toolbar.appendChild(sel);

    function btn(label, fn, cls) {
      var b = document.createElement('button');
      b.className = 'btn ' + (cls || ''); b.textContent = label;
      b.addEventListener('click', fn);
      toolbar.appendChild(b); return b;
    }
    btn('▶ Chạy', run, 'btn-primary');
    btn('💾 Lưu', save);
    btn('🗑 Xóa', function () { setCode(''); if (outputEl) { outputEl.innerHTML = ''; } });
    var hint = document.createElement('span');
    hint.className = 'code-hint';
    hint.textContent = 'Biến dùng được: PixiEngine, BABYLON, PIXI, log()';
    toolbar.appendChild(hint);
    wrap.appendChild(toolbar);

    textarea = document.createElement('textarea');
    textarea.className = 'code-textarea';
    textarea.spellcheck = false;
    textarea.placeholder = '// Viết JavaScript ở đây. Ví dụ: PixiEngine.Prefabs.place("pine-tree", {x: 2, y: 0.4, z: 2}, {});';
    var saved = loadSaved();
    textarea.value = saved || EXAMPLES['Chào mừng'];
    wrap.appendChild(textarea);

    statusEl = document.createElement('div');
    statusEl.className = 'code-status';
    statusEl.textContent = 'Kết quả chạy:';
    wrap.appendChild(statusEl);

    outputEl = document.createElement('div');
    outputEl.className = 'code-output';
    wrap.appendChild(outputEl);

    container.appendChild(wrap);
    log('Code Editor sẵn sàng. Bấm ▶ Chạy để thực thi code trong textarea.');
  }

  function init(id) {
    containerId = id || 'code-panel';
    var container = document.getElementById(containerId);
    if (!container) { console.warn('[CodeEditor] Không tìm thấy #' + containerId); return false; }
    var body = container.querySelector('.panel-body');
    buildUI(body || container);
    return true;
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { try { init(); } catch (e) { console.warn('[CodeEditor]', e); } });
  } else {
    try { init(); } catch (e) { console.warn('[CodeEditor]', e); }
  }

  PE.CodeEditor = { init: init, run: run, getCode: getCode, setCode: setCode, log: log, save: save };
})();
