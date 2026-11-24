'use strict';
/* PixiJS 3D Game Engine Editor — ContextMenu (nhóm EDITOR)
 * Menu chuột phải dùng chung cho Hierarchy và Viewport.
 * Vanilla JS, không import/export. Hỗ trợ chuột phải + touch long-press (500ms).
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};

  var menuEl = null;
  var longPressTimer = null;
  var longPressTarget = null;

  function ensureMenu() {
    if (menuEl && document.body.contains(menuEl)) return menuEl;
    menuEl = document.getElementById('context-menu');
    if (!menuEl) {
      menuEl = document.createElement('div');
      menuEl.id = 'context-menu';
      menuEl.className = 'pixi-context-menu';
      menuEl.setAttribute('role', 'menu');
      menuEl.style.display = 'none';
      document.body.appendChild(menuEl);
    }
    return menuEl;
  }

  function clampPosition(x, y) {
    var el = ensureMenu();
    var w = el.offsetWidth || 200;
    var h = el.offsetHeight || 120;
    var maxX = window.innerWidth - w - 8;
    var maxY = window.innerHeight - h - 8;
    return { x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, Math.min(y, maxY)) };
  }

  function show(x, y, items) {
    if (!Array.isArray(items) || items.length === 0) return;
    var el = ensureMenu();
    el.innerHTML = '';
    items.forEach(function (item) {
      if (item === 'separator' || item.separator) {
        var sep = document.createElement('div');
        sep.className = 'pixi-context-separator';
        el.appendChild(sep);
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pixi-context-item';
      btn.setAttribute('role', 'menuitem');
      btn.textContent = (item.icon ? item.icon + ' ' : '') + (item.label || '');
      if (item.disabled) {
        btn.disabled = true;
        btn.classList.add('is-disabled');
        if (item.title) btn.title = item.title;
      }
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        hide();
        if (typeof item.action === 'function') {
          try { item.action(); } catch (e) { console.error('[ContextMenu] action lỗi:', e); }
        }
      });
      el.appendChild(btn);
    });
    el.style.display = 'block';
    // Đo kích thước thật rồi kẹp vào màn hình (phone-first: không tràn mép).
    var pos = clampPosition(x, y);
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.style.position = 'fixed';
    el.style.zIndex = '9999';
  }

  function hide() {
    if (menuEl) menuEl.style.display = 'none';
  }

  function isVisible() {
    return !!(menuEl && menuEl.style.display !== 'none');
  }

  // Click ngoài thì đóng. Đăng ký một lần duy nhất.
  var outsideBound = false;
  function bindOutside() {
    if (outsideBound) return;
    outsideBound = true;
    document.addEventListener('click', function (ev) {
      if (menuEl && isVisible() && !menuEl.contains(ev.target)) hide();
    });
    document.addEventListener('contextmenu', function (ev) {
      if (menuEl && isVisible() && !menuEl.contains(ev.target)) hide();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') hide();
    });
    window.addEventListener('blur', hide);
  }

  // Gắn long-press cho một element: giữ 500ms -> mở menu tại vị trí chạm.
  // getItems: function(targetEl, x, y) trả về mảng items.
  function attachLongPress(el, getItems) {
    if (!el || typeof getItems !== 'function') return;
    function cancel() {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      longPressTarget = null;
    }
    el.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 1) return;
      var t = ev.touches[0];
      longPressTarget = ev.target;
      longPressTimer = setTimeout(function () {
        longPressTimer = null;
        var items = getItems(longPressTarget, t.clientX, t.clientY);
        if (items && items.length) show(t.clientX, t.clientY, items);
      }, 500);
    }, { passive: true });
    el.addEventListener('touchmove', cancel, { passive: true });
    el.addEventListener('touchend', cancel, { passive: true });
    el.addEventListener('touchcancel', cancel, { passive: true });
  }

  bindOutside();

  window.PixiEngine.ContextMenu = {
    show: show,
    hide: hide,
    isVisible: isVisible,
    attachLongPress: attachLongPress
  };
})();
