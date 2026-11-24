'use strict';
/* PixiEngine.WidgetManager — Vẽ widget UI bằng PixiJS lên overlay nếu PIXI
 * sẵn sàng; nếu không thì fallback DOM div trong #viewport-wrap.
 * HealthBar: thanh đỏ/xanh theo value. Button: click được.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};

  var pixiApp = null;      // PIXI.Application (nếu renderer tạo sẵn)
  var overlay = null;      // PIXI.Container chứa widget
  var domLayer = null;     // div fallback
  var visible = true;
  var initialized = false;

  function getState() {
    window.PixiEngine.state = window.PixiEngine.state || { scene: null, engine: null, objects: [], selected: null, mode: 'edit' };
    window.PixiEngine.state.uiWidgets = window.PixiEngine.state.uiWidgets || [];
    return window.PixiEngine.state;
  }

  function pixiReady() {
    return (typeof window.PIXI !== 'undefined') && pixiApp && pixiApp.stage;
  }

  function ensureDomLayer() {
    if (domLayer) return domLayer;
    var wrap = document.getElementById('viewport-wrap');
    if (!wrap) return null;
    domLayer = document.createElement('div');
    domLayer.id = 'widget-dom-layer';
    domLayer.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:25;';
    wrap.appendChild(domLayer);
    return domLayer;
  }

  function clearDomLayer() {
    if (domLayer) domLayer.innerHTML = '';
  }

  function clearPixiOverlay() {
    if (overlay) {
      while (overlay.children.length > 0) {
        var child = overlay.children[0];
        overlay.removeChild(child);
        if (child.destroy) { try { child.destroy({ children: true }); } catch (err) {} }
      }
    }
  }

  function hexColor(color) {
    if (typeof color !== 'string') return 0x4a90d9;
    if (color.indexOf('rgba') === 0 || color.indexOf('rgb') === 0) return 0x333333;
    try {
      var hex = color.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
      return parseInt(hex, 16);
    } catch (err) { return 0x4a90d9; }
  }

  // --- Vẽ bằng PIXI ---
  function drawPixiWidget(w) {
    var g = new window.PIXI.Graphics();
    var fill = hexColor(w.color);
    if (w.type === 'Text') {
      var text = new window.PIXI.Text(w.text || '', {
        fontSize: 16, fill: w.color || '#ffffff'
      });
      text.x = w.x; text.y = w.y;
      overlay.addChild(text);
      return;
    }
    if (w.type === 'HealthBar') {
      var v = (typeof w.value === 'number') ? Math.max(0, Math.min(100, w.value)) : 100;
      g.beginFill(0x000000, 0.5);
      g.drawRect(w.x, w.y, w.w, w.h);
      g.endFill();
      g.beginFill(v > 50 ? 0x2ecc71 : 0xe74c3c);
      g.drawRect(w.x + 2, w.y + 2, Math.max(0, (w.w - 4) * v / 100), w.h - 4);
      g.endFill();
      overlay.addChild(g);
      return;
    }
    if (w.type === 'Slider') {
      g.beginFill(0x555555);
      g.drawRoundedRect(w.x, w.y + w.h / 2 - 3, w.w, 6, 3);
      g.endFill();
      var sv = (typeof w.value === 'number') ? w.value : 50;
      g.beginFill(fill);
      g.drawCircle(w.x + (w.w * sv / 100), w.y + w.h / 2, 9);
      g.endFill();
      overlay.addChild(g);
      return;
    }
    // Button / Panel / Image: hình chữ nhật màu
    g.beginFill(fill, w.type === 'Panel' ? 0.7 : 1);
    if (w.type === 'Button') g.drawRoundedRect(w.x, w.y, w.w, w.h, 6);
    else g.drawRect(w.x, w.y, w.w, w.h);
    g.endFill();
    if (w.type === 'Button') {
      g.interactive = true;
      g.buttonMode = true;
      g.on('pointerdown', function () {
        if (window.PixiEngine.EventBus && typeof window.PixiEngine.EventBus.emit === 'function') {
          window.PixiEngine.EventBus.emit('ui-button-clicked', { id: w.id, text: w.text });
        }
        console.log('[WidgetManager] Button clicked:', w.id, w.text);
      });
    }
    overlay.addChild(g);
    if (w.text) {
      var label = new window.PIXI.Text(w.text, { fontSize: 14, fill: '#ffffff' });
      label.x = w.x + w.w / 2 - label.width / 2;
      label.y = w.y + w.h / 2 - label.height / 2;
      overlay.addChild(label);
    }
  }

  // --- Vẽ fallback bằng DOM ---
  function drawDomWidget(w) {
    var layer = ensureDomLayer();
    if (!layer) return;
    var el = document.createElement('div');
    el.className = 'ui-widget ui-widget-' + w.type.toLowerCase();
    el.style.cssText =
      'position:absolute;left:' + w.x + 'px;top:' + w.y + 'px;' +
      'width:' + w.w + 'px;height:' + w.h + 'px;' +
      'background:' + (w.color || '#4a90d9') + ';color:#fff;' +
      'display:flex;align-items:center;justify-content:center;' +
      'border-radius:6px;font-size:14px;box-sizing:border-box;overflow:hidden;';
    if (w.type === 'Text') {
      el.style.background = 'transparent';
      el.style.color = w.color || '#fff';
      el.textContent = w.text || '';
    } else if (w.type === 'HealthBar') {
      el.style.background = 'rgba(0,0,0,0.5)';
      el.style.padding = '2px';
      var v = (typeof w.value === 'number') ? w.value : 100;
      var fillEl = document.createElement('div');
      fillEl.style.cssText = 'height:100%;width:' + Math.max(0, Math.min(100, v)) + '%;' +
        'background:' + (v > 50 ? '#2ecc71' : '#e74c3c') + ';border-radius:4px;';
      el.appendChild(fillEl);
    } else if (w.type === 'Slider') {
      el.style.background = 'transparent';
      var input = document.createElement('input');
      input.type = 'range'; input.min = '0'; input.max = '100';
      input.value = String((typeof w.value === 'number') ? w.value : 50);
      input.style.width = '100%';
      input.style.pointerEvents = 'auto';
      input.addEventListener('input', function () { w.value = Number(input.value); });
      el.appendChild(input);
    } else {
      el.textContent = w.text || '';
    }
    if (w.type === 'Button') {
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.addEventListener('click', function () {
        if (window.PixiEngine.EventBus && typeof window.PixiEngine.EventBus.emit === 'function') {
          window.PixiEngine.EventBus.emit('ui-button-clicked', { id: w.id, text: w.text });
        }
        console.log('[WidgetManager] Button clicked:', w.id, w.text);
      });
    }
    layer.appendChild(el);
  }

  window.PixiEngine.WidgetManager = {
    // app: PIXI.Application tùy chọn (nếu renderer đã tạo). Không có cũng chạy DOM fallback.
    init: function (app) {
      if (app && app.stage) {
        pixiApp = app;
        overlay = new window.PIXI.Container();
        overlay.sortableChildren = true;
        pixiApp.stage.addChild(overlay);
      }
      initialized = true;
      this.renderAll();
    },

    // Cho renderer bên ngoài gắn PIXI app sau khi init
    setPixiApp: function (app) {
      if (app && app.stage && typeof window.PIXI !== 'undefined') {
        pixiApp = app;
        if (!overlay) {
          overlay = new window.PIXI.Container();
          pixiApp.stage.addChild(overlay);
        }
        this.renderAll();
      }
    },

    addWidget: function (def) {
      def = def || {};
      var state = getState();
      var widget = {
        id: def.id || ('ui-' + (def.type || 'panel').toLowerCase() + '-' + Date.now()),
        type: def.type || 'Panel',
        x: (typeof def.x === 'number') ? def.x : 20,
        y: (typeof def.y === 'number') ? def.y : 20,
        w: (typeof def.w === 'number') ? def.w : 120,
        h: (typeof def.h === 'number') ? def.h : 40,
        text: def.text || '',
        color: def.color || '#4a90d9'
      };
      if (typeof def.value === 'number') widget.value = def.value;
      state.uiWidgets.push(widget);
      this.renderAll();
      return widget;
    },

    removeWidget: function (id) {
      var state = getState();
      state.uiWidgets = state.uiWidgets.filter(function (w) { return w.id !== id; });
      this.renderAll();
    },

    setHealth: function (v) {
      var state = getState();
      var changed = false;
      state.uiWidgets.forEach(function (w) {
        if (w.type === 'HealthBar') { w.value = Math.max(0, Math.min(100, v)); changed = true; }
      });
      if (changed) this.renderAll();
    },

    renderAll: function () {
      if (!initialized && !pixiApp) {
        // Vẫn vẽ DOM fallback ngay cả khi chưa init (UIEditor gọi sớm)
      }
      var state = getState();
      if (pixiReady()) {
        clearPixiOverlay();
        clearDomLayer();
        if (!visible) return;
        state.uiWidgets.forEach(drawPixiWidget);
      } else {
        clearDomLayer();
        if (!visible) return;
        state.uiWidgets.forEach(drawDomWidget);
      }
    },

    setVisible: function (v) {
      visible = !!v;
      if (overlay) overlay.visible = visible;
      if (domLayer) domLayer.style.display = visible ? 'block' : 'none';
      if (visible) this.renderAll();
    },

    isVisible: function () { return visible; }
  };
})();
