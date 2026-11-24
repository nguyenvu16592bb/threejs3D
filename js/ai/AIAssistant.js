'use strict';
/* PixiEngine.AIAssistant — Trợ lý AI RULE-BASED, chạy local, KHÔNG gọi API ngoài.
 * Parse tiếng Việt + tiếng Anh bằng từ khóa. processCommand TRẢ VỀ plan,
 * KHÔNG thực thi ngay — chỉ executePlan chạy khi user bấm "Xác nhận thực thi".
 * Lệnh phá hoại ("xóa hết" / "delete all" / "xóa scene") cần xác nhận 2 lần.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};

  var container = null;
  var inputEl = null;
  var previewEl = null;
  var pendingPlan = null;
  var confirmBtn = null;
  var destroyArmed = false; // đã bấm xác nhận lần 1 cho lệnh phá hoại
  var initialized = false;

  function getPromptManager() {
    return (typeof window.PixiEngine.PromptManager !== 'undefined')
      ? window.PixiEngine.PromptManager : null;
  }

  function parseNumber(text) {
    var pm = getPromptManager();
    if (pm && typeof pm.parseNumber === 'function') return pm.parseNumber(text);
    var m = text.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function hasKeyword(text, keywords) {
    var pm = getPromptManager();
    if (pm && typeof pm.parseKeyword === 'function') return pm.parseKeyword(text, keywords);
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i]) !== -1) return true;
    }
    return false;
  }

  // Thêm object qua Prefabs/SceneManager (typeof check, fallback SceneManager)
  function addObjectSafe(def) {
    if (typeof window.PixiEngine.SceneManager !== 'undefined' &&
        typeof window.PixiEngine.SceneManager.addObject === 'function') {
      return window.PixiEngine.SceneManager.addObject(def);
    }
    window.PixiEngine.state = window.PixiEngine.state || { objects: [] };
    window.PixiEngine.state.objects.push(def);
    return def;
  }

  function placePrefab(name, x, y, z) {
    if (typeof window.PixiEngine.Prefabs !== 'undefined' &&
        typeof window.PixiEngine.Prefabs.place === 'function') {
      try { return window.PixiEngine.Prefabs.place(name, x, y, z); } catch (err) {}
    }
    return addObjectSafe({
      id: name + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
      name: name,
      type: name,
      parentId: null,
      children: [],
      transform: {
        position: { x: x || 0, y: y || 0, z: z || 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      components: [],
      visible: true,
      active: true
    });
  }

  function randomPos(range, centerX, centerZ) {
    range = range || 20;
    return {
      x: (centerX || 0) + (Math.random() * 2 - 1) * range,
      z: (centerZ || 0) + (Math.random() * 2 - 1) * range
    };
  }

  // --- Các action chạy thật (chỉ gọi từ executePlan) ---
  var RUNNERS = {
    addTrees: function (args) {
      var count = args.count || 10;
      var cx = 0, cz = 0;
      if (args.around === 'village') { cx = 0; cz = -10; }
      for (var i = 0; i < count; i++) {
        var p = randomPos(25, cx, cz);
        placePrefab('pine', p.x, 0, p.z);
      }
      console.log('[AIAssistant] Đã thêm ' + count + ' cây thông.');
    },
    addTerrainSnow: function () {
      if (typeof window.PixiEngine.TerrainEditor !== 'undefined' &&
          typeof window.PixiEngine.TerrainEditor.setSnow === 'function') {
        window.PixiEngine.TerrainEditor.setSnow(true);
      } else if (typeof window.PixiEngine.TerrainEditor !== 'undefined' &&
          typeof window.PixiEngine.TerrainEditor.raise === 'function') {
        window.PixiEngine.TerrainEditor.raise(10, 5);
      }
      placePrefab('snow-mountain', 0, 0, -30);
      console.log('[AIAssistant] Đã thêm núi tuyết.');
    },
    addWater: function () {
      if (typeof window.PixiEngine.WaterEditor !== 'undefined' &&
          typeof window.PixiEngine.WaterEditor.addRiver === 'function') {
        window.PixiEngine.WaterEditor.addRiver();
      } else {
        placePrefab('river', 0, 0, 0);
      }
      placePrefab('waterfall', 5, 0, -25);
      console.log('[AIAssistant] Đã thêm sông + thác.');
    },
    addTemple: function () {
      placePrefab('temple', 0, 0, -28);
      console.log('[AIAssistant] Đã thêm đền gần núi.');
    },
    addHouses: function (args) {
      var count = (args && args.count) || 5;
      for (var i = 0; i < count; i++) {
        var p = randomPos(15, 0, -10);
        placePrefab('house', p.x, 0, p.z);
      }
      console.log('[AIAssistant] Đã thêm ' + count + ' nhà.');
    },
    addLanterns: function (args) {
      var count = (args && args.count) || 8;
      for (var i = 0; i < count; i++) {
        var p = randomPos(18, 0, -10);
        placePrefab('lantern', p.x, 2, p.z);
      }
      console.log('[AIAssistant] Đã thêm ' + count + ' đèn lồng.');
    },
    setFog: function () {
      if (typeof window.PixiEngine.LightingManager !== 'undefined' &&
          typeof window.PixiEngine.LightingManager.setFog === 'function') {
        window.PixiEngine.LightingManager.setFog(true);
      } else {
        var state = window.PixiEngine.state || {};
        if (state.scene) state.scene.fogEnabled = true;
      }
      console.log('[AIAssistant] Đã bật sương mù.');
    },
    setNight: function () {
      if (typeof window.PixiEngine.LightingManager !== 'undefined' &&
          typeof window.PixiEngine.LightingManager.setNight === 'function') {
        window.PixiEngine.LightingManager.setNight(true);
      } else if (typeof window.PixiEngine.LightingManager !== 'undefined' &&
          typeof window.PixiEngine.LightingManager.dimLights === 'function') {
        window.PixiEngine.LightingManager.dimLights(0.2);
      } else {
        var state = window.PixiEngine.state || {};
        if (state.scene) state.scene.clearColor = { r: 0.05, g: 0.05, b: 0.15 };
      }
      console.log('[AIAssistant] Đã chuyển sang ban đêm.');
    },
    addArena: function () {
      placePrefab('arena', 0, 0, 0);
      placePrefab('lantern', 8, 3, 0);
      placePrefab('lantern', -8, 3, 0);
      placePrefab('lantern', 0, 3, 8);
      placePrefab('lantern', 0, 3, -8);
      console.log('[AIAssistant] Đã thêm đấu trường boss.');
    }
  };

  window.PixiEngine.AIAssistant = {
    init: function (containerId) {
      containerId = containerId || 'ai-panel';
      container = document.getElementById(containerId);
      if (!container) {
        console.warn('[AIAssistant] Không tìm thấy container #' + containerId);
        return;
      }
      if (initialized) return;
      initialized = true;

      var title = document.createElement('h3');
      title.textContent = 'Trợ lý AI (rule-based, chạy local)';
      container.appendChild(title);

      var row = document.createElement('div');
      row.className = 'ai-input-row';
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.placeholder = 'VD: thêm 20 cây thông quanh làng...';
      inputEl.setAttribute('aria-label', 'Lệnh cho AI');
      var sendBtn = document.createElement('button');
      sendBtn.type = 'button';
      sendBtn.textContent = 'Gửi';
      sendBtn.addEventListener('click', function () {
        window.PixiEngine.AIAssistant.submit();
      });
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') window.PixiEngine.AIAssistant.submit();
      });
      row.appendChild(inputEl);
      row.appendChild(sendBtn);
      container.appendChild(row);

      // Nút gợi ý mẫu
      var suggRow = document.createElement('div');
      suggRow.className = 'ai-suggestions';
      var pm = getPromptManager();
      var suggestions = (pm && typeof pm.getSuggestions === 'function')
        ? pm.getSuggestions()
        : ['Thêm 20 cây thông quanh làng'];
      suggestions.forEach(function (s) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ai-suggestion';
        b.textContent = s;
        b.addEventListener('click', function () {
          if (inputEl) { inputEl.value = s; inputEl.focus(); }
        });
        suggRow.appendChild(b);
      });
      container.appendChild(suggRow);

      // Vùng preview
      previewEl = document.createElement('div');
      previewEl.className = 'ai-preview';
      container.appendChild(previewEl);
    },

    submit: function () {
      var text = inputEl ? inputEl.value.trim() : '';
      if (!text) return;
      var plan = this.processCommand(text);
      var pm = getPromptManager();
      if (pm && typeof pm.addHistory === 'function') pm.addHistory(text);
      this.showPreview(plan);
    },

    // Parse lệnh -> plan {summary, actions:[{label, run()}], destructive}
    // KHÔNG thực thi ngay.
    processCommand: function (text) {
      var raw = String(text || '');
      var lower = raw.toLowerCase();
      var actions = [];
      var parts = [];

      // Lệnh phá hoại: từ chối thực thi 1 lần, cần xác nhận 2 lần
      if (hasKeyword(lower, ['xóa hết', 'xoa het', 'delete all', 'xóa scene', 'xoa scene', 'xóa toàn bộ', 'clear scene'])) {
        return {
          summary: 'Lệnh này sẽ xóa toàn bộ scene.',
          destructive: true,
          actions: [{
            label: 'Xóa toàn bộ scene (NGUY HIỂM)',
            run: function () {
              if (typeof window.PixiEngine.SceneManager !== 'undefined' &&
                  typeof window.PixiEngine.SceneManager.serializeScene === 'function') {
                // Chỉ xóa sau khi đã xác nhận 2 lần (executePlan kiểm tra)
                var state = window.PixiEngine.state || {};
                state.objects = [];
              }
              console.warn('[AIAssistant] Đã xóa toàn bộ scene theo lệnh người dùng.');
            }
          }]
        };
      }

      var n = parseNumber(lower);

      if (hasKeyword(lower, ['cây thông', 'cay thong', 'pine']) ||
          hasKeyword(lower, ['cây', 'cay', 'tree'])) {
        var count = n || 10;
        var around = hasKeyword(lower, ['làng', 'lang', 'village']) ? 'village' : 'random';
        actions.push({
          label: 'Thêm ' + count + ' cây thông' + (around === 'village' ? ' quanh làng' : ''),
          run: (function (c, a) {
            return function () { RUNNERS.addTrees({ count: c, around: a }); };
          })(count, around)
        });
        parts.push(count + ' cây thông');
      }
      if (hasKeyword(lower, ['núi tuyết', 'nui tuyet', 'snow mountain', 'núi', 'mountain'])) {
        actions.push({
          label: 'Thêm núi tuyết + nâng địa hình',
          run: function () { RUNNERS.addTerrainSnow(); }
        });
        parts.push('núi tuyết');
      }
      if (hasKeyword(lower, ['sông', 'song', 'river', 'thác', 'thac', 'waterfall'])) {
        actions.push({
          label: 'Thêm sông + thác nước',
          run: function () { RUNNERS.addWater(); }
        });
        parts.push('sông + thác');
      }
      if (hasKeyword(lower, ['đền', 'den', 'temple', 'chùa', 'chua'])) {
        actions.push({
          label: 'Thêm đền gần núi',
          run: function () { RUNNERS.addTemple(); }
        });
        parts.push('đền');
      }
      if (hasKeyword(lower, ['làng', 'lang', 'village'])) {
        var hc = n || 5;
        actions.push({
          label: 'Thêm làng (' + hc + ' nhà)',
          run: (function (c) {
            return function () { RUNNERS.addHouses({ count: c }); };
          })(hc)
        });
        parts.push('làng ' + hc + ' nhà');
      }
      if (hasKeyword(lower, ['đèn', 'den', 'lantern'])) {
        var lc = n || 8;
        actions.push({
          label: 'Thêm ' + lc + ' đèn lồng',
          run: (function (c) {
            return function () { RUNNERS.addLanterns({ count: c }); };
          })(lc)
        });
        parts.push(lc + ' đèn lồng');
      }
      if (hasKeyword(lower, ['rừng', 'rung', 'forest'])) {
        actions.push({
          label: 'Thêm rừng (30 cây thông)',
          run: function () { RUNNERS.addTrees({ count: 30, around: 'random' }); }
        });
        parts.push('rừng 30 cây');
      }
      if (hasKeyword(lower, ['sương mù', 'suong mu', 'fog'])) {
        actions.push({
          label: 'Bật sương mù',
          run: function () { RUNNERS.setFog(); }
        });
        parts.push('sương mù');
      }
      if (hasKeyword(lower, ['đêm', 'dem', 'night'])) {
        actions.push({
          label: 'Chuyển sang ban đêm (giảm sáng)',
          run: function () { RUNNERS.setNight(); }
        });
        parts.push('ban đêm');
      }
      if (hasKeyword(lower, ['boss', 'arena', 'đấu trường', 'dau truong'])) {
        actions.push({
          label: 'Thêm đấu trường boss (sàn tròn + đèn)',
          run: function () { RUNNERS.addArena(); }
        });
        parts.push('đấu trường boss');
      }

      if (actions.length === 0) {
        return {
          summary: 'Không hiểu lệnh: "' + raw + '". Thử các gợi ý mẫu bên trên.',
          destructive: false,
          actions: []
        };
      }
      return {
        summary: 'Sẽ thực hiện: ' + parts.join(', ') + '.',
        destructive: false,
        actions: actions
      };
    },

    showPreview: function (plan) {
      pendingPlan = plan;
      destroyArmed = false;
      if (!previewEl) return;
      previewEl.innerHTML = '';
      if (window.PixiEngine.EventBus && typeof window.PixiEngine.EventBus.emit === 'function') {
        window.PixiEngine.EventBus.emit('ai-preview', plan);
      }
      var p = document.createElement('p');
      p.textContent = plan.summary || '';
      previewEl.appendChild(p);

      if (plan.destructive) {
        var warn = document.createElement('p');
        warn.className = 'ai-warning';
        warn.textContent = '⚠ Lệnh này sẽ xóa scene — cần xác nhận 2 lần.';
        warn.style.color = '#e74c3c';
        warn.style.fontWeight = 'bold';
        previewEl.appendChild(warn);
      }

      if (plan.actions && plan.actions.length > 0) {
        var ul = document.createElement('ul');
        plan.actions.forEach(function (a) {
          var li = document.createElement('li');
          li.textContent = a.label;
          ul.appendChild(li);
        });
        previewEl.appendChild(ul);

        confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.textContent = plan.destructive ? 'Xác nhận XÓA (lần 1/2)' : 'Xác nhận thực thi';
        confirmBtn.addEventListener('click', function () {
          window.PixiEngine.AIAssistant.confirmExecute();
        });
        previewEl.appendChild(confirmBtn);

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Hủy';
        cancelBtn.addEventListener('click', function () {
          window.PixiEngine.AIAssistant.cancelPreview();
        });
        previewEl.appendChild(cancelBtn);
      }
    },

    // Bấm Xác nhận: lệnh thường chạy ngay; lệnh phá hoại cần bấm 2 lần.
    confirmExecute: function () {
      if (!pendingPlan) return;
      if (pendingPlan.destructive && !destroyArmed) {
        destroyArmed = true;
        if (confirmBtn) confirmBtn.textContent = 'Xác nhận XÓA';
        if (previewEl) {
          var note = document.createElement('p');
          note.textContent = 'Bấm "Xác nhận XÓA" thêm một lần nữa để xóa thật. Bấm Hủy để dừng.';
          note.style.color = '#e74c3c';
          previewEl.appendChild(note);
        }
        return;
      }
      this.executePlan(pendingPlan);
      this.cancelPreview();
    },

    cancelPreview: function () {
      pendingPlan = null;
      destroyArmed = false;
      if (previewEl) previewEl.innerHTML = '';
      if (inputEl) inputEl.value = '';
    },

    executePlan: function (plan) {
      if (!plan || !plan.actions) return;
      plan.actions.forEach(function (a) {
        try {
          if (typeof a.run === 'function') a.run();
        } catch (err) {
          console.warn('[AIAssistant] Action lỗi:', a.label, err);
        }
      });
      if (window.PixiEngine.EventBus && typeof window.PixiEngine.EventBus.emit === 'function') {
        window.PixiEngine.EventBus.emit('hierarchy-changed', { source: 'ai' });
      }
    }
  };
})();
