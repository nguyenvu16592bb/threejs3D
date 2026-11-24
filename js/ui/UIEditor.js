'use strict';
/* PixiEngine.UIEditor — Soạn UI overlay (Button/Text/Panel/HealthBar/Image/Slider).
 * Widget lưu trong PixiEngine.state.uiWidgets, hiển thị THẬT trong viewport
 * khi Play (qua WidgetManager nếu có, fallback DOM div absolute).
 * Kéo thả vị trí bằng pointer, xóa được.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};

  var container = null;
  var listEl = null;
  var initialized = false;
  var idCounter = 0;

  var WIDGET_DEFAULTS = {
    Button:    { w: 120, h: 40, text: 'Nút bấm', color: '#4a90d9' },
    Text:      { w: 160, h: 30, text: 'Văn bản', color: '#ffffff' },
    Panel:     { w: 220, h: 140, text: '', color: 'rgba(0,0,0,0.5)' },
    HealthBar: { w: 200, h: 20, text: '', color: '#e74c3c', value: 100 },
    Image:     { w: 120, h: 120, text: '', color: '#9b59b6' },
    Slider:    { w: 180, h: 24, text: '', color: '#2ecc71', value: 50 }
  };

  function getState() {
    window.PixiEngine.state = window.PixiEngine.state || { scene: null, engine: null, objects: [], selected: null, mode: 'edit' };
    window.PixiEngine.state.uiWidgets = window.PixiEngine.state.uiWidgets || [];
    return window.PixiEngine.state;
  }

  function nextId(type) {
    idCounter += 1;
    return 'ui-' + type.toLowerCase() + '-' + Date.now() + '-' + idCounter;
  }

  function syncToWidgetManager() {
    if (typeof window.PixiEngine.WidgetManager !== 'undefined' &&
        typeof window.PixiEngine.WidgetManager.renderAll === 'function') {
      try { window.PixiEngine.WidgetManager.renderAll(); } catch (err) {}
    }
  }

  function makeDraggable(el, widget) {
    var startX = 0, startY = 0, origX = 0, origY = 0, dragging = false, pid = null;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', function (e) {
      dragging = true;
      pid = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      origX = widget.x; origY = widget.y;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      e.stopPropagation();
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== pid) return;
      widget.x = Math.max(0, origX + (e.clientX - startX));
      widget.y = Math.max(0, origY + (e.clientY - startY));
      el.style.left = widget.x + 'px';
      el.style.top = widget.y + 'px';
    });
    function endDrag(e) {
      if (!dragging || (pid !== null && e.pointerId !== pid)) return;
      dragging = false;
      pid = null;
      syncToWidgetManager();
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }

  // Vẽ 1 widget bằng DOM div absolute trong #viewport-wrap (fallback khi
  // WidgetManager/PIXI chưa sẵn sàng).
  function renderDomWidget(widget) {
    var wrap = document.getElementById('viewport-wrap');
    if (!wrap) return;
    var old = document.getElementById(widget.id);
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = widget.id;
    el.className = 'ui-widget ui-widget-' + widget.type.toLowerCase();
    el.style.cssText =
      'position:absolute;left:' + widget.x + 'px;top:' + widget.y + 'px;' +
      'width:' + widget.w + 'px;height:' + widget.h + 'px;' +
      'background:' + (widget.color || '#4a90d9') + ';color:#fff;' +
      'display:flex;align-items:center;justify-content:center;' +
      'border-radius:6px;font-size:14px;cursor:move;z-index:25;' +
      'box-sizing:border-box;overflow:hidden;';
    if (widget.type === 'Text') {
      el.style.background = 'transparent';
      el.style.color = widget.color || '#fff';
    }
    if (widget.type === 'HealthBar') {
      el.style.background = 'rgba(0,0,0,0.5)';
      el.style.padding = '2px';
      var fill = document.createElement('div');
      var v = (typeof widget.value === 'number') ? widget.value : 100;
      fill.style.cssText = 'height:100%;width:' + Math.max(0, Math.min(100, v)) + '%;' +
        'background:' + (v > 50 ? '#2ecc71' : '#e74c3c') + ';border-radius:4px;';
      el.appendChild(fill);
    } else if (widget.type === 'Slider') {
      el.style.background = 'transparent';
      var input = document.createElement('input');
      input.type = 'range';
      input.min = '0'; input.max = '100';
      input.value = String((typeof widget.value === 'number') ? widget.value : 50);
      input.style.width = '100%';
      input.addEventListener('input', function () { widget.value = Number(input.value); });
      el.appendChild(input);
    } else if (widget.text) {
      el.textContent = widget.text;
    }
    if (widget.type === 'Button') {
      el.addEventListener('click', function () {
        if (window.PixiEngine.EventBus && typeof window.PixiEngine.EventBus.emit === 'function') {
          window.PixiEngine.EventBus.emit('ui-button-clicked', { id: widget.id, text: widget.text });
        }
        console.log('[UIEditor] Button clicked:', widget.id, widget.text);
      });
    }
    makeDraggable(el, widget);
    wrap.appendChild(el);
  }

  window.PixiEngine.UIEditor = {
    init: function (containerId) {
      containerId = containerId || 'ui-panel';
      container = document.getElementById(containerId);
      if (!container) {
        console.warn('[UIEditor] Không tìm thấy container #' + containerId);
        return;
      }
      if (initialized) { this.render(); return; }
      initialized = true;

      var title = document.createElement('h3');
      title.textContent = 'Soạn giao diện (UI)';
      container.appendChild(title);

      var btnRow = document.createElement('div');
      btnRow.className = 'ui-editor-buttons';
      var types = ['Button', 'Text', 'Panel', 'HealthBar', 'Image', 'Slider'];
      var labels = { Button: 'Nút', Text: 'Chữ', Panel: 'Khung', HealthBar: 'Thanh máu', Image: 'Hình', Slider: 'Thanh trượt' };
      types.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = '+ ' + (labels[t] || t);
        b.addEventListener('click', function () {
          window.PixiEngine.UIEditor.addWidget(t);
        });
        btnRow.appendChild(b);
      });
      container.appendChild(btnRow);

      listEl = document.createElement('div');
      listEl.className = 'ui-widget-list';
      container.appendChild(listEl);

      this.render();
    },

    addWidget: function (type) {
      if (!WIDGET_DEFAULTS[type]) {
        console.warn('[UIEditor] Loại widget không hỗ trợ:', type);
        return null;
      }
      var d = WIDGET_DEFAULTS[type];
      var widget = {
        id: nextId(type),
        type: type,
        x: 20 + Math.floor(Math.random() * 60),
        y: 20 + Math.floor(Math.random() * 60),
        w: d.w, h: d.h,
        text: d.text || '',
        color: d.color
      };
      if (typeof d.value === 'number') widget.value = d.value;
      var state = getState();
      state.uiWidgets.push(widget);
      this.render();
      syncToWidgetManager();
      return widget;
    },

    removeWidget: function (id) {
      var state = getState();
      state.uiWidgets = state.uiWidgets.filter(function (w) { return w.id !== id; });
      var el = document.getElementById(id);
      if (el) el.remove();
      this.render();
      syncToWidgetManager();
    },

    setHealth: function (v) {
      var state = getState();
      state.uiWidgets.forEach(function (w) {
        if (w.type === 'HealthBar') w.value = Math.max(0, Math.min(100, v));
      });
      this.render();
      syncToWidgetManager();
    },

    // Vẽ lại list trong panel + widget DOM trong viewport
    render: function () {
      var state = getState();
      if (listEl) {
        listEl.innerHTML = '';
        if (state.uiWidgets.length === 0) {
          var empty = document.createElement('p');
          empty.textContent = 'Chưa có widget nào. Bấm nút trên để thêm.';
          listEl.appendChild(empty);
        }
        state.uiWidgets.forEach(function (w) {
          var row = document.createElement('div');
          row.className = 'ui-widget-row';
          var label = document.createElement('span');
          label.textContent = w.type + ' — ' + (w.text || w.id) + ' (' + Math.round(w.x) + ',' + Math.round(w.y) + ')';
          var del = document.createElement('button');
          del.type = 'button';
          del.textContent = 'Xóa';
          del.addEventListener('click', function () {
            window.PixiEngine.UIEditor.removeWidget(w.id);
          });
          row.appendChild(label);
          row.appendChild(del);
          listEl.appendChild(row);
        });
      }
      // Vẽ DOM widget trong viewport (WidgetManager sẽ vẽ đè bằng PIXI nếu có)
      state.uiWidgets.forEach(function (w) {
        if (typeof window.PixiEngine.WidgetManager === 'undefined' ||
            typeof window.PixiEngine.WidgetManager.renderAll !== 'function') {
          renderDomWidget(w);
        }
      });
      syncToWidgetManager();
    }
  };
})();
