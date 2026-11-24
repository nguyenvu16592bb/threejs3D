'use strict';
/* Boot.js — Nối tất cả module lại sau khi DOM sẵn sàng (nhóm CORE, bổ sung tích hợp).
   Vấn đề nó sửa: các module chỉ expose init() mà không có code nào gọi — nếu không có
   Boot, trình duyệt thật sẽ chạy được scene 3D nhưng các panel vẫn trống.
   Boot gọi init() của mọi module theo thứ tự, mỗi lệnh gọi đều bọc try/catch để một
   module lỗi không làm chết toàn bộ editor. Module cần scene (Gizmo...) tự đăng ký
   lại khi có event 'engine-ready'. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  var PE = window.PixiEngine;
  var booted = false;

  function has(obj, fn) { return obj && typeof obj[fn] === 'function'; }
  function safe(label, fn) {
    try { fn(); }
    catch (e) { if (window.console) { console.warn('[Boot] ' + label + ' lỗi:', e && e.message ? e.message : e); } }
  }

  function boot() {
    if (booted) { return; }
    booted = true;
    // Editor panels (chạy được cả khi chưa có scene; chúng tự render lại khi có event).
    safe('SceneHierarchy', function () { if (has(PE.SceneHierarchy, 'init')) { PE.SceneHierarchy.init('hierarchy-panel'); } });
    safe('Inspector', function () { if (has(PE.Inspector, 'init')) { PE.Inspector.init('inspector-panel'); } });
    safe('Toolbar', function () { if (has(PE.Toolbar, 'init')) { PE.Toolbar.init(); } });
    safe('AssetBrowser', function () { if (has(PE.AssetBrowser, 'init')) { PE.AssetBrowser.init('asset-browser'); } });
    safe('TransformGizmo', function () { if (has(PE.TransformGizmo, 'init')) { PE.TransformGizmo.init(); } });
    // Module panels theo tab.
    safe('AnimationEditor', function () { if (has(PE.AnimationEditor, 'init')) { PE.AnimationEditor.init('animation-panel'); } });
    safe('Timeline', function () { if (has(PE.Timeline, 'init')) { PE.Timeline.init('timeline-panel'); } });
    safe('UIEditor', function () { if (has(PE.UIEditor, 'init')) { PE.UIEditor.init('ui-panel'); } });
    safe('CodeEditor', function () { if (has(PE.CodeEditor, 'init')) { PE.CodeEditor.init('code-panel'); } });
    safe('AIAssistant', function () { if (has(PE.AIAssistant, 'init')) { PE.AIAssistant.init('ai-panel'); } });
    // Runtime (bàn phím + joystick + vật lý).
    safe('InputManager', function () { if (has(PE.InputManager, 'init')) { PE.InputManager.init(); } });
    safe('PhysicsManager', function () { if (has(PE.PhysicsManager, 'init')) { PE.PhysicsManager.init(); } });
    safe('GameRuntime', function () { if (has(PE.GameRuntime, 'init')) { PE.GameRuntime.init(); } });
    // Model importer (kéo-thả file vào viewport).
    safe('ModelImporter', function () { if (has(PE.ModelImporter, 'init')) { PE.ModelImporter.init(); } });
    if (window.console) { console.log('[Boot] PixiJS 3D Editor đã nối xong tất cả module.'); }
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // Phòng trường hợp Boot load sau DOMContentLoaded nhưng trước engine-ready:
  // Engine.init() gọi sau vẫn emit 'engine-ready', các module tự refresh qua event đó.
  PE.Boot = { boot: boot };
})();
