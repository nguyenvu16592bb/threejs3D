'use strict';
/* WuxiaQuests.js — Chuỗi 3 nhiệm vụ qua NPC cho PixiJS 3D Engine Editor v5.0.
   Nhóm Wuxia HUD / Quests / Audio / Game Loop.
   Q1 "Dẹp loạn Tuyết Yêu" — giết 5 Tuyết Yêu, Trưởng Lão giao, thưởng 100 vàng + 50 XP.
   Q2 "Cứu thương nhân" — giết 3 Sơn Tặc + 1 Hồ Ly Tinh elite, thưởng kiếm +10 atk.
   Q3 "Long Ngâm Giáng Thế" — vào dungeon giết Boss Long Ngâm, thưởng victory + 500 vàng.
   Expose: window.PixiEngine.WuxiaQuests
   API: init(opts), getActive(), getAll(), talkToNPC(npcId), onKill(kind),
        isComplete(id), claimReward(id), save(), load(), reset(),
        setOnQuestUpdate(fn), setOnReward(fn) */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};
  var PE = window.PixiEngine;

  var SAVE_KEY = 'wuxia-quests-v5';

  /* kind quái: 'snow' = Tuyết Yêu, 'bandit' = Sơn Tặc, 'elite' = Hồ Ly Tinh, 'boss' = Long Ngâm */
  var DEFS = [
    {
      id: 'q1', title: 'Dẹp loạn Tuyết Yêu',
      npc: 'elder', npcName: 'Trưởng Lão Tuyết',
      desc: 'Tuyết Yêu hoành hành phía tây bắc Trường Bạch. Diệt 5 con để lấy lại an toàn cho làng.',
      need: [{ kind: 'snow', count: 5, label: 'Tuyết Yêu' }],
      reward: { gold: 100, xp: 50 },
      rewardText: '100 vàng + 50 XP'
    },
    {
      id: 'q2', title: 'Cứu thương nhân',
      npc: 'merchant', npcName: 'Thương Nhân Trần',
      desc: 'Đoàn thương nhân bị Sơn Tặc chặn cướp phía đông, cầm đầu là một Hồ Ly Tinh. Dẹp 3 Sơn Tặc và hạ Hồ Ly Tinh để cứu họ.',
      need: [
        { kind: 'bandit', count: 3, label: 'Sơn Tặc' },
        { kind: 'elite', count: 1, label: 'Hồ Ly Tinh' }
      ],
      reward: { atkBonus: 10, item: 'Bảo Kiếm Long Ngâm (+10 atk)' },
      rewardText: 'Bảo Kiếm Long Ngâm (+10 atk)'
    },
    {
      id: 'q3', title: 'Long Ngâm Giáng Thế',
      npc: 'elder', npcName: 'Trưởng Lão Tuyết',
      desc: 'Long Ngâm Lão Tổ đã thức tỉnh trong dungeon phía đông nam (qua cổng tím). Vào dungeon và hạ hắn để hoàn thành Quan Ải!',
      need: [{ kind: 'boss', count: 1, label: 'Boss Long Ngâm' }],
      reward: { gold: 500, victory: true },
      rewardText: 'Chiến thắng + 500 vàng'
    }
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var Quests = {
    _quests: null,
    _onQuestUpdate: null,
    _onReward: null,
    _inited: false,

    init: function (opts) {
      opts = opts || {};
      if (typeof opts.onQuestUpdate === 'function') this._onQuestUpdate = opts.onQuestUpdate;
      if (typeof opts.onReward === 'function') this._onReward = opts.onReward;
      if (!this._quests) this.reset();
      this._inited = true;
      return true;
    },

    setOnQuestUpdate: function (fn) { if (typeof fn === 'function') this._onQuestUpdate = fn; },
    setOnReward: function (fn) { if (typeof fn === 'function') this._onReward = fn; },

    reset: function () {
      this._quests = DEFS.map(function (d) {
        return {
          id: d.id, title: d.title, npc: d.npc, npcName: d.npcName,
          desc: d.desc, reward: clone(d.reward), rewardText: d.rewardText,
          need: d.need.map(function (n) { return { kind: n.kind, count: n.count, label: n.label, done: 0 }; }),
          status: d.id === 'q1' ? 'available' : 'locked'
        };
      });
      this._notify();
      return this.getAll();
    },

    getAll: function () {
      if (!this._quests) this.reset();
      return clone(this._quests);
    },

    getActive: function () {
      if (!this._quests) this.reset();
      for (var i = 0; i < this._quests.length; i++) {
        if (this._quests[i].status === 'active') return clone(this._quests[i]);
      }
      return null;
    },

    /* Quest đang hiển thị trên HUD: quest active, nếu không có thì quest
       available đầu tiên (để người chơi biết phải gặp NPC nào). */
    getDisplay: function () {
      var active = this.getActive();
      if (active) return this._displayOf(active);
      var all = this.getAll();
      for (var i = 0; i < all.length; i++) {
        if (all[i].status === 'available') return this._displayOf(all[i]);
      }
      return null;
    },

    _displayOf: function (q) {
      var parts = [];
      q.need.forEach(function (n) { parts.push(n.label + ' ' + n.done + '/' + n.count); });
      return {
        id: q.id, title: q.title, desc: q.desc + ' (Gặp ' + q.npcName + ' để nhận.)',
        progress: 'Tiến độ: ' + parts.join(' · '),
        status: q.status, all: this.getAll()
      };
    },

    _find: function (id) {
      if (!this._quests) this.reset();
      for (var i = 0; i < this._quests.length; i++) {
        if (this._quests[i].id === id) return this._quests[i];
      }
      return null;
    },

    _notify: function () {
      if (typeof this._onQuestUpdate === 'function') {
        try { this._onQuestUpdate(this.getDisplay(), this.getAll()); } catch (e) {
          if (window.console) console.warn('[WuxiaQuests] onQuestUpdate lỗi:', e);
        }
      }
    },

    /* Nói chuyện với NPC. Trả về {npcId, npcName, dialog, action, quest}:
       action: 'accept' (vừa nhận quest) | 'turnin' (trả được, gọi claimReward)
             | 'progress' (đang làm) | 'locked' (chưa mở) | 'none' (không có gì). */
    talkToNPC: function (npcId) {
      if (!this._quests) this.reset();
      var active = null, i, q;
      for (i = 0; i < this._quests.length; i++) {
        if (this._quests[i].npc === npcId) {
          q = this._quests[i];
          if (q.status === 'active' || q.status === 'complete') { active = q; break; }
          if (q.status === 'available') {
            q.status = 'active';
            this._notify();
            return {
              npcId: npcId, npcName: q.npcName, action: 'accept', quest: clone(q),
              dialog: 'Nhận nhiệm vụ "' + q.title + '": ' + q.desc + ' (Thưởng: ' + q.rewardText + ')'
            };
          }
          if (q.status === 'locked') {
            return {
              npcId: npcId, npcName: q.npcName, action: 'locked', quest: clone(q),
              dialog: 'Hoàn thành nhiệm vụ trước đã, hiệp khách. (' + q.title + ' chưa mở.)'
            };
          }
        }
      }
      if (active) {
        if (active.status === 'complete') {
          return {
            npcId: npcId, npcName: active.npcName, action: 'turnin', quest: clone(active),
            dialog: 'Ngươi đã hoàn thành "' + active.title + '"! Nhận thưởng: ' + active.rewardText + '.'
          };
        }
        var prog = active.need.map(function (n) { return n.label + ' ' + n.done + '/' + n.count; }).join(', ');
        return {
          npcId: npcId, npcName: active.npcName, action: 'progress', quest: clone(active),
          dialog: '"' + active.title + '" — tiến độ: ' + prog + '. ' + active.desc
        };
      }
      /* NPC không gắn quest nào trong chuỗi (hoặc đã xong hết). */
      var doneAll = this._quests.every(function (x) { return x.status === 'claimed'; });
      return {
        npcId: npcId, npcName: this._npcName(npcId), action: 'none', quest: null,
        dialog: doneAll
          ? 'Quan Ải Long Ngâm đã xong, hiệp khách! Trường Bạch cảm ơn ngươi.'
          : 'Đường lên Tuyết Sơn hiểm trở, nhưng võ công của ngươi đã tiến bộ. Cứ theo nhiệm vụ mà làm.'
      };
    },

    _npcName: function (npcId) {
      for (var i = 0; i < DEFS.length; i++) {
        if (DEFS[i].npc === npcId) return DEFS[i].npcName;
      }
      return npcId === 'guard' ? 'Vệ Binh A Hổ' : 'Dân làng';
    },

    /* Gọi khi giết quái. kind: 'snow' | 'bandit' | 'elite' | 'boss'.
       Trả về quest đã cập nhật (clone) hoặc null nếu không ảnh hưởng quest nào. */
    onKill: function (kind) {
      if (!this._quests) this.reset();
      var active = null;
      for (var i = 0; i < this._quests.length; i++) {
        if (this._quests[i].status === 'active') { active = this._quests[i]; break; }
      }
      if (!active) return null;
      var changed = false;
      active.need.forEach(function (n) {
        if (n.kind === kind && n.done < n.count) { n.done++; changed = true; }
      });
      if (!changed) return clone(active);
      if (active.need.every(function (n) { return n.done >= n.count; })) {
        active.status = 'complete';
      }
      this._notify();
      return clone(active);
    },

    isComplete: function (id) {
      var q = this._find(id);
      return !!q && (q.status === 'complete' || q.status === 'claimed');
    },

    isActive: function (id) {
      var q = this._find(id);
      return !!q && q.status === 'active';
    },

    /* Nhận thưởng quest đã complete. Trả về reward {gold,xp,atkBonus,item,victory}
       để game áp dụng (vàng/XP/cộng atk/màn victory), hoặc null nếu chưa xong.
       Mở khóa quest tiếp theo trong chuỗi. */
    claimReward: function (id) {
      var q = this._find(id);
      if (!q || q.status !== 'complete') return null;
      q.status = 'claimed';
      /* mở quest kế tiếp */
      var idx = -1;
      for (var i = 0; i < this._quests.length; i++) {
        if (this._quests[i].id === id) { idx = i; break; }
      }
      if (idx >= 0 && idx + 1 < this._quests.length && this._quests[idx + 1].status === 'locked') {
        this._quests[idx + 1].status = 'available';
      }
      var reward = clone(q.reward);
      reward.questId = id;
      reward.title = q.title;
      if (typeof this._onReward === 'function') {
        try { this._onReward(reward, clone(q)); } catch (e) {
          if (window.console) console.warn('[WuxiaQuests] onReward lỗi:', e);
        }
      }
      this._notify();
      this.save();
      return reward;
    },

    save: function () {
      try {
        if (typeof localStorage === 'undefined') return false;
        localStorage.setItem(SAVE_KEY, JSON.stringify(this._quests || []));
        return true;
      } catch (e) { return false; }
    },

    load: function () {
      try {
        if (typeof localStorage === 'undefined') return false;
        var raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        var data = JSON.parse(raw);
        if (!Array.isArray(data) || data.length !== DEFS.length) return false;
        this._quests = data;
        this._notify();
        return true;
      } catch (e) { return false; }
    },

    clearSave: function () {
      try { if (typeof localStorage !== 'undefined') localStorage.removeItem(SAVE_KEY); } catch (e) { /* bỏ qua */ }
      return true;
    }
  };

  PE.WuxiaQuests = Quests;
  PE.Wuxia.Quests = Quests;
})();
