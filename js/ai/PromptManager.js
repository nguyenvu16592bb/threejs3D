'use strict';
/* PixiEngine.PromptManager — Gợi ý lệnh mẫu + lịch sử lệnh AI.
 * Lịch sử lưu localStorage key 'pixiengine-ai-history', tối đa 20 mục.
 */
(function () {
  window.PixiEngine = window.PixiEngine || {};

  var STORAGE_KEY = 'pixiengine-ai-history';
  var MAX_HISTORY = 20;

  var SUGGESTIONS = [
    'Thêm 20 cây thông quanh làng',
    'Thêm núi tuyết',
    'Thêm sông và thác nước',
    'Thêm đền gần núi',
    'Thêm làng 5 nhà và đèn lồng',
    'Thêm rừng',
    'Bật sương mù và chuyển sang ban đêm',
    'Thêm đấu trường boss'
  ];

  function loadHistory() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (err) {
      return [];
    }
  }

  function saveHistory(arr) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (err) {
      console.warn('[PromptManager] Không lưu được lịch sử:', err);
    }
  }

  window.PixiEngine.PromptManager = {
    getSuggestions: function () {
      return SUGGESTIONS.slice();
    },

    getHistory: function () {
      return loadHistory();
    },

    addHistory: function (text) {
      text = String(text || '').trim();
      if (!text) return loadHistory();
      var arr = loadHistory();
      // Xóa trùng rồi đưa lên đầu
      arr = arr.filter(function (t) { return t !== text; });
      arr.unshift(text);
      if (arr.length > MAX_HISTORY) arr = arr.slice(0, MAX_HISTORY);
      saveHistory(arr);
      return arr;
    },

    clearHistory: function () {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (err) {}
      return [];
    },

    // Lấy số đầu tiên trong câu lệnh, vd "20 cây" -> 20; không có -> null
    parseNumber: function (text) {
      if (typeof text !== 'string') return null;
      var m = text.match(/(\d+)/);
      if (!m) return null;
      var n = parseInt(m[1], 10);
      return isNaN(n) ? null : n;
    },

    // true nếu text chứa bất kỳ keyword nào (so khớp lowercase, có dấu/không dấu tùy caller)
    parseKeyword: function (text, keywords) {
      if (typeof text !== 'string' || !Array.isArray(keywords)) return false;
      var lower = text.toLowerCase();
      for (var i = 0; i < keywords.length; i++) {
        var kw = String(keywords[i]).toLowerCase();
        if (kw && lower.indexOf(kw) !== -1) return true;
      }
      return false;
    }
  };
})();
