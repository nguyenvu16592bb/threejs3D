'use strict';
/* WuxiaHUD.js — HUD kiểu MMORPG cho PixiJS 3D Engine Editor v5.0.
   Nhóm Wuxia HUD / Quests / Audio / Game Loop.
   DOM thuần (không canvas HUD), phone-first: mọi nút chạm >= 44px.
   Viết lại gọn theo tinh thần WUXIA3D-3D.js (3D-Model), KHÔNG copy nguyên.
   Expose: window.PixiEngine.WuxiaHUD
   API: init(container, game), update(state), showDamage(dmg, pos, opts),
        log(msg, kind), showBoss(name), hideBoss(), setSkillCooldowns(map),
        bindActions(handlers), bindJoystick(el), destroy() */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};
  var PE = window.PixiEngine;

  /* 6 skill + ultimate mặc định (khớp WUXIA3D-3D.js: tên/MP/cooldown). */
  var DEFAULT_SKILLS = [
    { name: 'Kiếm Khí', icon: '🗡', mp: 15, cd: 2.5, key: '1' },
    { name: 'Kim Cương Hoàn', icon: '⭕', mp: 20, cd: 5, key: '2' },
    { name: 'Long Kích', icon: '🐉', mp: 25, cd: 6, key: '3' },
    { name: 'Hỏa Bạo', icon: '🔥', mp: 25, cd: 6, key: '4' },
    { name: 'Băng Phong Bạo', icon: '❄', mp: 30, cd: 8, key: '5' },
    { name: 'Lôi Đình', icon: '⚡', mp: 30, cd: 8, key: '6' }
  ];
  var DEFAULT_ULT = { name: 'Thần Long Giáng Thế', icon: '🌟', mp: 60, cd: 30, key: 'Q' };
  var HERO_COLORS = ['#2b5cb8', '#b85c1e', '#7a3fd4'];
  var HERO_ICONS = ['⚔', '🔱', '❄'];
  var MAP_W = 56, MAP_H = 56;
  var MINIMAP_MS = 250; /* cập nhật 4 lần/giây */
  var LOG_MAX = 30;

  var CSS_ID = 'wuxia-hud-style';
  var CSS = [
    '#wuxia-hud{position:absolute;inset:0;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#fff;z-index:20;overflow:hidden}',
    '#wuxia-hud .wx-panel{background:rgba(10,16,32,.72);border:1px solid rgba(255,255,255,.18);border-radius:10px;backdrop-filter:blur(2px)}',
    '#wuxia-hud .wx-btn{pointer-events:auto;min-width:44px;min-height:44px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(20,30,55,.85);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0 8px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
    '#wuxia-hud .wx-btn:active{background:rgba(80,120,220,.85)}',
    '#wuxia-hud .wx-btn.small{min-width:44px;min-height:44px;font-size:15px}',
    /* --- party trái trên --- */
    '#wuxia-party{position:absolute;top:10px;left:10px;display:flex;flex-direction:column;gap:6px;pointer-events:auto;width:196px}',
    '#wuxia-party .wx-member{display:flex;gap:8px;align-items:center;padding:6px;border-radius:10px;background:rgba(10,16,32,.72);border:1px solid rgba(255,255,255,.18);cursor:pointer;min-height:52px}',
    '#wuxia-party .wx-member.leader{border-color:#ffd94d;box-shadow:0 0 0 1px #ffd94d inset}',
    '#wuxia-party .wx-member.dead{opacity:.45;filter:grayscale(1)}',
    '#wuxia-party .wx-avatar{width:40px;height:40px;min-width:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px}',
    '#wuxia-party .wx-minfo{flex:1;min-width:0}',
    '#wuxia-party .wx-mname{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#wuxia-party .wx-bar{height:8px;border-radius:4px;background:rgba(0,0,0,.6);margin-top:3px;overflow:hidden}',
    '#wuxia-party .wx-bar>i{display:block;height:100%;border-radius:4px;transition:width .15s linear}',
    '#wuxia-party .wx-hp>i{background:linear-gradient(90deg,#37d67a,#4dff6e)}',
    '#wuxia-party .wx-mp>i{background:linear-gradient(90deg,#3b82f6,#5cb8ff)}',
    '#wuxia-party .wx-switch{display:flex;gap:4px;margin-top:2px}',
    '#wuxia-party .wx-switch button{flex:1;min-height:30px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font-size:12px;cursor:pointer}',
    '#wuxia-party .wx-switch button.on{background:#ffd94d;color:#222;font-weight:700}',
    /* --- thanh chính (HP/MP/XP/vàng) dưới party --- */
    '#wuxia-mainbar{position:absolute;top:10px;left:216px;max-width:340px;width:calc(100% - 560px);min-width:180px;padding:8px 10px;pointer-events:none}',
    '#wuxia-mainbar .wx-lv{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700}',
    '#wuxia-mainbar .wx-lv b{background:#ffd94d;color:#222;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-size:14px}',
    '#wuxia-mainbar .wx-bar{height:12px;border-radius:6px;background:rgba(0,0,0,.6);margin-top:5px;overflow:hidden;position:relative}',
    '#wuxia-mainbar .wx-bar.mp{height:9px}',
    '#wuxia-mainbar .wx-bar.xp{height:6px}',
    '#wuxia-mainbar .wx-bar>i{display:block;height:100%;transition:width .15s linear}',
    '#wuxia-mainbar .wx-hp>i{background:linear-gradient(90deg,#e5484d,#ff6b6b)}',
    '#wuxia-mainbar .wx-mp>i{background:linear-gradient(90deg,#3b82f6,#5cb8ff)}',
    '#wuxia-mainbar .wx-xp>i{background:linear-gradient(90deg,#c9a94f,#ffd94d)}',
    '#wuxia-mainbar .wx-bar span{position:absolute;inset:0;text-align:center;font-size:10px;line-height:12px;color:#fff;text-shadow:0 1px 2px #000}',
    '#wuxia-mainbar .wx-gold{font-size:13px;margin-top:5px;color:#ffd94d;font-weight:700}',
    '#wuxia-mainbar .wx-combo{font-size:13px;color:#ff9d5c;font-weight:700}',
    /* --- boss bar trên cùng giữa --- */
    '#wuxia-bossbar{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:min(520px,60%);padding:8px 12px;text-align:center;display:none;pointer-events:none}',
    '#wuxia-bossbar .wx-bossname{font-size:14px;font-weight:800;color:#ffb347;letter-spacing:.5px}',
    '#wuxia-bossbar .wx-bar{height:14px;border-radius:7px;background:rgba(0,0,0,.65);margin-top:5px;overflow:hidden}',
    '#wuxia-bossbar .wx-bar>i{display:block;height:100%;background:linear-gradient(90deg,#8a1f1f,#ff2e2e);transition:width .15s linear}',
    /* --- minimap phải trên --- */
    '#wuxia-minimap-wrap{position:absolute;top:10px;right:10px;text-align:center;pointer-events:none}',
    '#wuxia-minimap{width:132px;height:132px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:#16233d;display:block}',
    '#wuxia-minimap-wrap .wx-maptitle{font-size:11px;color:#cfe0ff;margin-top:3px;text-shadow:0 1px 2px #000}',
    /* --- panel nhiệm vụ phải --- */
    '#wuxia-quest{position:absolute;top:172px;right:10px;width:210px;padding:9px 10px;pointer-events:none;font-size:13px}',
    '#wuxia-quest h3{margin:0 0 4px;font-size:13px;color:#ffd94d}',
    '#wuxia-quest .wx-qdesc{color:#e8eef7;line-height:1.35}',
    '#wuxia-quest .wx-qprog{margin-top:5px;font-weight:700;color:#8dff9e}',
    '#wuxia-quest .wx-qlist{margin:6px 0 0;padding:0;list-style:none;font-size:12px;color:#cfe0ff}',
    '#wuxia-quest .wx-qlist li{padding:2px 0}',
    '#wuxia-quest .wx-qlist li.done{color:#8dff9e;text-decoration:line-through}',
    '#wuxia-quest .wx-qlist li.active{color:#fff;font-weight:700}',
    /* --- log trái dưới --- */
    '#wuxia-log{position:absolute;left:10px;bottom:170px;width:280px;max-height:120px;overflow:hidden;padding:6px 8px;font-size:12px;line-height:1.5;pointer-events:none}',
    '#wuxia-log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#wuxia-log .k-quest{color:#ffd94d}#wuxia-log .k-gold{color:#ffe98a}#wuxia-log .k-bad{color:#ff8a8a}#wuxia-log .k-good{color:#8dff9e}#wuxia-log .k-sys{color:#9fc8e8}',
    /* --- joystick trái dưới --- */
    '#wuxia-joy{position:absolute;left:16px;bottom:16px;width:128px;height:128px;border-radius:50%;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.3);pointer-events:auto;touch-action:none}',
    '#wuxia-joyknob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.6)}',
    /* --- cụm nút hành động phải dưới --- */
    '#wuxia-actions{position:absolute;right:16px;bottom:16px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none}',
    '#wuxia-actions .wx-row{display:flex;gap:8px;pointer-events:auto}',
    '#wuxia-actions .wx-btn{width:56px;height:56px;border-radius:50%;font-size:24px}',
    '#wuxia-actions .wx-btn.ult{width:64px;height:64px;font-size:28px;border-color:#ffd94d;background:rgba(120,80,0,.8)}',
    '#wuxia-actions .wx-btn.atk{background:rgba(140,30,30,.85)}',
    /* --- thanh skill dưới giữa --- */
    '#wuxia-skills{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:6px;pointer-events:auto;padding:6px}',
    '#wuxia-skills .wx-skill{position:relative;width:52px;height:52px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(20,30,55,.85);color:#fff;cursor:pointer;overflow:hidden;padding:0;touch-action:manipulation}',
    '#wuxia-skills .wx-skill .wx-ic{font-size:22px;line-height:1;display:block;margin-top:6px}',
    '#wuxia-skills .wx-skill .wx-key{position:absolute;top:2px;left:4px;font-size:10px;color:#cfe0ff}',
    '#wuxia-skills .wx-skill .wx-mp{position:absolute;bottom:2px;left:0;right:0;font-size:9px;color:#5cb8ff;text-align:center}',
    '#wuxia-skills .wx-skill .wx-cd{position:absolute;inset:0;background:rgba(0,0,0,.65);color:#fff;font-size:20px;font-weight:800;display:none;align-items:center;justify-content:center}',
    '#wuxia-skills .wx-skill .wx-sweep{position:absolute;left:0;bottom:0;width:100%;background:rgba(0,0,0,.55);pointer-events:none}',
    '#wuxia-skills .wx-skill.onCd .wx-cd{display:flex}',
    '#wuxia-skills .wx-skill.noMp{border-color:#ff5a5a}',
    '#wuxia-skills .wx-skill.noMp .wx-mp{color:#ff8a8a}',
    '#wuxia-skills .wx-skill.ult{border-color:#ffd94d}',
    /* --- damage numbers --- */
    '#wuxia-dmg{position:absolute;inset:0;overflow:hidden;pointer-events:none}',
    '#wuxia-dmg .wx-dmgnum{position:absolute;font-weight:800;font-size:18px;color:#fff;text-shadow:0 1px 0 #000,0 0 6px rgba(0,0,0,.6);transform:translate(-50%,-50%);animation:wx-float .9s ease-out forwards;white-space:nowrap}',
    '#wuxia-dmg .wx-dmgnum.crit{color:#ffd94d;font-size:24px}',
    '#wuxia-dmg .wx-dmgnum.skill{color:#5cb8ff}',
    '#wuxia-dmg .wx-dmgnum.heal{color:#4dff6e}',
    '@keyframes wx-float{0%{opacity:1;margin-top:0}100%{opacity:0;margin-top:-56px}}',
    /* --- banner / toast / dialog / victory --- */
    '#wuxia-banner{position:absolute;top:22%;left:50%;transform:translateX(-50%);text-align:center;display:none;pointer-events:none;text-shadow:0 2px 8px #000}',
    '#wuxia-banner .wx-big{font-size:30px;font-weight:900;color:#ffd94d}',
    '#wuxia-banner .wx-sub{font-size:15px;color:#fff;margin-top:4px}',
    '#wuxia-toast{position:absolute;bottom:190px;left:50%;transform:translateX(-50%);background:rgba(10,16,32,.85);border:1px solid rgba(255,255,255,.25);padding:8px 14px;border-radius:8px;font-size:14px;display:none;pointer-events:none;max-width:90%;text-align:center}',
    '#wuxia-dialog{position:absolute;left:50%;bottom:200px;transform:translateX(-50%);width:min(480px,92%);padding:12px 14px;display:none;pointer-events:auto}',
    '#wuxia-dialog .wx-who{font-weight:800;color:#ffd94d;font-size:14px}',
    '#wuxia-dialog .wx-txt{margin-top:4px;font-size:14px;line-height:1.45}',
    '#wuxia-dialog .wx-dlgbtn{margin-top:8px;min-height:44px;width:100%}',
    '#wuxia-victory{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,8,18,.72);pointer-events:auto}',
    '#wuxia-victory .wx-vbox{text-align:center;padding:24px;background:rgba(10,16,32,.9);border:1px solid #ffd94d;border-radius:14px;max-width:88%}',
    '#wuxia-victory h2{margin:0 0 8px;color:#ffd94d;font-size:26px}',
    '#wuxia-victory p{margin:0 0 14px;font-size:14px;line-height:1.5}',
    '#wuxia-victory .wx-btn{width:100%;font-size:16px}',
    '@media (max-width:700px){#wuxia-mainbar{display:none}#wuxia-quest{width:160px;top:158px}#wuxia-minimap{width:104px;height:104px}#wuxia-log{display:none}#wuxia-skills .wx-skill{width:46px;height:46px}}'
  ].join('\n');

  function el(tag, cls, html) {
    var d = document.createElement(tag || 'div');
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pct(v, max) { return clamp((v / (max || 1)) * 100, 0, 100); }

  var HUD = {
    _root: null, _game: null, _handlers: {},
    _skillBtns: [], _ultBtn: null, _memberEls: [],
    _cds: {}, _ultCd: 0, _ultCdMax: 0,
    _lastMap: 0, _mapCtx: null, _mapCv: null,
    _joyState: { x: 0, y: 0, active: false },
    _joyEl: null, _joyKnob: null, _joyId: null,
    _bound: [], _destroyed: false,
    _bannerT: null, _toastT: null,

    /* Tạo toàn bộ DOM HUD trong container. container: element | selector | null -> #wuxia-hud.
       game: WuxiaGame (tùy chọn) — dùng để chiếu tile->màn hình cho damage numbers. */
    init: function (container, game) {
      this.destroy();
      this._destroyed = false;
      this._game = game || null;
      var root = null;
      if (typeof container === 'string') root = document.querySelector(container);
      else if (container && container.nodeType === 1) root = container;
      if (!root) root = document.getElementById('wuxia-hud');
      if (!root) {
        root = el('div');
        root.id = 'wuxia-hud';
        document.body.appendChild(root);
      }
      this._root = root;
      root.innerHTML = '';
      if (!document.getElementById(CSS_ID)) {
        var st = document.createElement('style');
        st.id = CSS_ID;
        st.textContent = CSS;
        document.head.appendChild(st);
      }
      this._build();
      return true;
    },

    _build: function () {
      var self = this;
      var root = this._root;

      /* --- party 3 hero (trái trên) --- */
      var party = el('div');
      party.id = 'wuxia-party';
      this._memberEls = [];
      for (var i = 0; i < 3; i++) {
        (function (idx) {
          var m = el('div', 'wx-member' + (idx === 0 ? ' leader' : ''));
          m.setAttribute('role', 'button');
          m.setAttribute('tabindex', '0');
          m.innerHTML =
            '<div class="wx-avatar" style="background:' + HERO_COLORS[idx] + '">' + HERO_ICONS[idx] + '</div>' +
            '<div class="wx-minfo"><div class="wx-mname">Hero ' + (idx + 1) + ' · Lv<span class="wx-mlvl">1</span></div>' +
            '<div class="wx-bar wx-hp"><i style="width:100%"></i></div>' +
            '<div class="wx-bar wx-mp"><i style="width:100%"></i></div></div>';
          m.addEventListener('click', function () { self._switchHero(idx); });
          m.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self._switchHero(idx); } });
          party.appendChild(m);
          self._memberEls.push(m);
        })(i);
      }
      var sw = el('div', 'wx-switch');
      for (var s = 0; s < 3; s++) {
        (function (idx) {
          var b = el('button', null, 'Hero ' + (idx + 1));
          if (idx === 0) b.className = 'on';
          b.setAttribute('aria-label', 'Đổi sang hero ' + (idx + 1));
          b.addEventListener('click', function () { self._switchHero(idx); });
          sw.appendChild(b);
        })(s);
      }
      party.appendChild(sw);
      root.appendChild(party);
      this._switchBtns = sw.querySelectorAll('button');

      /* --- thanh HP/MP/XP chính --- */
      var main = el('div', 'wx-panel');
      main.id = 'wuxia-mainbar';
      main.innerHTML =
        '<div class="wx-lv"><b id="wx-lvl">1</b><span id="wx-leadername">Lâm Phong</span>' +
        '<span class="wx-combo" id="wx-combo" style="display:none">🔥 Combo <span id="wx-combonum">0</span></span></div>' +
        '<div class="wx-bar wx-hp"><i id="wx-hpfill" style="width:100%"></i><span id="wx-hptext"></span></div>' +
        '<div class="wx-bar mp"><i id="wx-mpfill" style="width:100%"></i><span id="wx-mptext"></span></div>' +
        '<div class="wx-bar xp"><i id="wx-xpfill" style="width:0%"></i></div>' +
        '<div class="wx-gold">🪙 <span id="wx-gold">0</span> vàng</div>';
      root.appendChild(main);

      /* --- boss bar --- */
      var boss = el('div', 'wx-panel');
      boss.id = 'wuxia-bossbar';
      boss.innerHTML = '<div class="wx-bossname" id="wx-bossname">BOSS</div>' +
        '<div class="wx-bar"><i id="wx-bossfill" style="width:100%"></i></div>';
      root.appendChild(boss);

      /* --- minimap --- */
      var mmWrap = el('div');
      mmWrap.id = 'wuxia-minimap-wrap';
      var cv = document.createElement('canvas');
      cv.id = 'wuxia-minimap';
      cv.width = 132; cv.height = 132;
      mmWrap.appendChild(cv);
      mmWrap.appendChild(el('div', 'wx-maptitle', 'Trường Bạch · 56×56'));
      root.appendChild(mmWrap);
      this._mapCv = cv;
      this._mapCtx = cv.getContext('2d');

      /* --- quest panel --- */
      var q = el('div', 'wx-panel');
      q.id = 'wuxia-quest';
      q.innerHTML = '<h3>📜 Nhiệm vụ</h3><div class="wx-qdesc" id="wx-qdesc">Nói chuyện với Trưởng Lão để nhận nhiệm vụ.</div>' +
        '<div class="wx-qprog" id="wx-qprog"></div><ul class="wx-qlist" id="wx-qlist"></ul>';
      root.appendChild(q);

      /* --- activity / chat log --- */
      var lg = el('div', 'wx-panel');
      lg.id = 'wuxia-log';
      root.appendChild(lg);

      /* --- joystick --- */
      var joy = el('div');
      joy.id = 'wuxia-joy';
      joy.setAttribute('aria-label', 'Joystick di chuyển');
      var knob = el('div');
      knob.id = 'wuxia-joyknob';
      joy.appendChild(knob);
      root.appendChild(joy);
      this._joyEl = joy;
      this._joyKnob = knob;
      this.bindJoystick(joy);

      /* --- thanh skill 6 ô + ultimate (def mặc định; Game gọi setSkills() khi có WuxiaSkills thật) --- */
      var sk = el('div', 'wx-panel');
      sk.id = 'wuxia-skills';
      root.appendChild(sk);
      this._skillsWrap = sk;
      this._buildSkillButtons(DEFAULT_SKILLS, DEFAULT_ULT);

      /* --- cụm nút hành động --- */
      var act = el('div');
      act.id = 'wuxia-actions';
      act.innerHTML =
        '<div class="wx-row">' +
        '<button class="wx-btn" id="wx-btn-jump" aria-label="Nhảy">⬆</button>' +
        '<button class="wx-btn" id="wx-btn-potion" aria-label="Uống thuốc hồi máu">🧪</button>' +
        '<button class="wx-btn" id="wx-btn-bag" aria-label="Mở túi đồ">🎒</button></div>' +
        '<div class="wx-row">' +
        '<button class="wx-btn ult" id="wx-btn-ult2" aria-label="Tuyệt kỹ">🌟</button>' +
        '<button class="wx-btn atk" id="wx-btn-atk" aria-label="Tấn công">⚔</button></div>';
      root.appendChild(act);
      this._on(act.querySelector('#wx-btn-atk'), 'click', function () { self._call('onAttack'); });
      this._on(act.querySelector('#wx-btn-jump'), 'click', function () { self._call('onJump'); });
      this._on(act.querySelector('#wx-btn-potion'), 'click', function () { self._call('onPotion'); });
      this._on(act.querySelector('#wx-btn-bag'), 'click', function () { self._call('onOpenInventory'); });
      this._on(act.querySelector('#wx-btn-ult2'), 'click', function () { self._onSkill('ult'); });

      /* --- lớp damage numbers --- */
      var dmg = el('div');
      dmg.id = 'wuxia-dmg';
      root.appendChild(dmg);

      /* --- banner / toast / dialog --- */
      var banner = el('div');
      banner.id = 'wuxia-banner';
      banner.innerHTML = '<div class="wx-big"></div><div class="wx-sub"></div>';
      root.appendChild(banner);
      var toast = el('div');
      toast.id = 'wuxia-toast';
      root.appendChild(toast);
      var dlg = el('div', 'wx-panel');
      dlg.id = 'wuxia-dialog';
      dlg.innerHTML = '<div class="wx-who"></div><div class="wx-txt"></div>' +
        '<button class="wx-btn wx-dlgbtn">Đóng</button>';
      dlg.querySelector('.wx-dlgbtn').addEventListener('click', function () { dlg.style.display = 'none'; });
      root.appendChild(dlg);

      /* --- màn victory --- */
      var vic = el('div');
      vic.id = 'wuxia-victory';
      vic.innerHTML = '<div class="wx-vbox"><h2>🏆 CHIẾN THẮNG!</h2>' +
        '<p id="wx-vtext">Quan Ải Long Ngâm hoàn thành — Trường Bạch lại yên bình!</p>' +
        '<button class="wx-btn" id="wx-btn-again">🔄 Chơi lại</button></div>';
      vic.querySelector('#wx-btn-again').addEventListener('click', function () {
        vic.style.display = 'none';
        self._call('onPlayAgain');
      });
      root.appendChild(vic);
    },

    _on: function (node, evt, fn) {
      if (!node) return;
      node.addEventListener(evt, fn);
      this._bound.push([node, evt, fn]);
    },

    _call: function (name) {
      var fn = this._handlers[name];
      if (typeof fn === 'function') {
        try { fn(); } catch (e) { if (window.console) console.warn('[WuxiaHUD] handler ' + name + ' lỗi:', e); }
      }
    },

    _switchHero: function (i) {
      var fn = this._handlers.onSwitchHero;
      if (typeof fn === 'function') {
        try { fn(i); } catch (e) { if (window.console) console.warn('[WuxiaHUD] onSwitchHero lỗi:', e); }
      }
      this._markLeader(i);
    },

    _markLeader: function (i) {
      for (var k = 0; k < this._memberEls.length; k++) {
        this._memberEls[k].classList.toggle('leader', k === i);
      }
      if (this._switchBtns) {
        for (var j = 0; j < this._switchBtns.length; j++) {
          this._switchBtns[j].classList.toggle('on', j === i);
        }
      }
    },

    _onSkill: function (id) {
      var fn = this._handlers.onSkill;
      if (typeof fn === 'function') {
        try { fn(id); } catch (e) { if (window.console) console.warn('[WuxiaHUD] onSkill lỗi:', e); }
      }
    },

    _skillIcon: function (def) {
      var byId = {
        swordwind: '🗡', firepalm: '🔥', icefreeze: '❄', thunder: '⚡',
        heal: '💚', dragonbreak: '🐉', 'dragon-ult': '🌟'
      };
      if (def.id && byId[def.id]) return byId[def.id];
      if (def.icon) return def.icon;
      var n = def.name || '';
      if (n.indexOf('Hỏa') >= 0) return '🔥';
      if (n.indexOf('Băng') >= 0) return '❄';
      if (n.indexOf('Lôi') >= 0) return '⚡';
      if (n.indexOf('Hồi') >= 0) return '💚';
      if (n.indexOf('Long') >= 0) return '🐉';
      return '🗡';
    },

    /* Dựng lại nút skill từ def. defs: [{id,name,mp|mpCost,cd|cooldown,key,icon}].
       Dùng khi WuxiaSkills thật có tên/MP/cooldown khác bản mặc định. */
    _buildSkillButtons: function (defs, ultDef) {
      var self = this;
      var sk = this._skillsWrap;
      if (!sk) return;
      sk.innerHTML = '';
      this._skillBtns = [];
      this._skillDefs = (defs || []).map(function (s) {
        return {
          id: s.id || null, name: s.name || '?', icon: self._skillIcon(s),
          mp: (s.mp !== undefined) ? s.mp : (s.mpCost || 0),
          cd: (s.cd !== undefined) ? s.cd : (s.cooldown || 0),
          key: s.key || ''
        };
      });
      this._ultDef = {
        id: (ultDef && ultDef.id) || 'dragon-ult',
        name: (ultDef && ultDef.name) || DEFAULT_ULT.name,
        icon: '🌟',
        mp: (ultDef && (ultDef.mp !== undefined ? ultDef.mp : ultDef.mpCost)) || DEFAULT_ULT.mp,
        cd: (ultDef && (ultDef.cd !== undefined ? ultDef.cd : ultDef.cooldown)) || DEFAULT_ULT.cd
      };
      this._skillDefs.forEach(function (s, i) {
        var b = el('button', 'wx-skill');
        b.setAttribute('aria-label', s.name + ' (phím ' + (s.key || (i + 1)) + ', ' + s.mp + ' MP)');
        b.title = s.name;
        b.innerHTML = '<span class="wx-key">' + (s.key || (i + 1)) + '</span><span class="wx-ic">' + s.icon + '</span>' +
          '<span class="wx-mp">' + s.mp + ' MP</span><span class="wx-sweep"></span><span class="wx-cd"></span>';
        b.addEventListener('click', function () { self._onSkill(i); });
        sk.appendChild(b);
        self._skillBtns.push(b);
      });
      var ub = el('button', 'wx-skill ult');
      ub.setAttribute('aria-label', self._ultDef.name + ' (phím Q, ' + self._ultDef.mp + ' MP, cần nộ 100)');
      ub.title = self._ultDef.name;
      ub.innerHTML = '<span class="wx-key">Q</span><span class="wx-ic">' + self._ultDef.icon + '</span>' +
        '<span class="wx-mp">' + self._ultDef.mp + ' MP</span><span class="wx-sweep"></span><span class="wx-cd"></span>';
      ub.addEventListener('click', function () { self._onSkill('ult'); });
      sk.appendChild(ub);
      this._ultBtn = ub;
      /* giữ lại cooldown đang chạy (nếu có) */
      if (this._cds) this.setSkillCooldowns(this._cds);
      if (this._ultCd) this.setUltCooldown(this._ultCd, this._ultCdMax);
      if (this._rage !== undefined && this._rage !== null) this.setRage(this._rage);
    },

    /* Game gọi khi WuxiaSkills thật đã nạp: defs = Skills.getSkills(), ultDef = Skills.getUlt(). */
    setSkills: function (defs, ultDef) {
      if (!Array.isArray(defs) || !defs.length) return this;
      this._buildSkillButtons(defs, ultDef);
      return this;
    },

    /* Nộ 0-100 cho ultimate (WuxiaSkills yêu cầu nộ 100 mới dùng được). */
    setRage: function (v) {
      this._rage = Math.max(0, Math.min(100, v || 0));
      var b = this._ultBtn;
      if (!b) return;
      var mpEl = b.querySelector('.wx-mp');
      if (mpEl) mpEl.textContent = (this._rage < 100) ? ('Nộ ' + Math.floor(this._rage) + '%') : (this._ultDef.mp + ' MP');
      this._refreshSkillMp(this._lastMp || 0);
    },
    /* handlers: {onAttack,onSkill(id),onSwitchHero(i),onJump,onPotion,onOpenInventory,onPlayAgain} */
    bindActions: function (handlers) {
      this._handlers = handlers || {};
      return this;
    },

    /* Joystick chạm: hỗ trợ touch + chuột (Pointer Events).
       Trả về object {x,y,active} CHUẨN HÓA (-1..1) — object này được cập nhật
       trực tiếp (live) nên game loop chỉ cần đọc nó mỗi frame. */
    bindJoystick: function (el) {
      var self = this;
      var joyEl = (typeof el === 'string') ? document.querySelector(el) : el;
      if (!joyEl) joyEl = this._joyEl;
      if (!joyEl) return this._joyState;
      var knob = joyEl.querySelector('#wuxia-joyknob') || this._joyKnob;
      var state = this._joyState;
      function move(e) {
        var r = joyEl.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var dx = (e.clientX - cx) / (r.width / 2);
        var dy = (e.clientY - cy) / (r.height / 2);
        var len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; len = 1; }
        state.x = dx; state.y = dy; state.active = true;
        if (knob) knob.style.transform = 'translate(' + (dx * 34) + 'px,' + (dy * 34) + 'px)';
        if (typeof self._handlers.onJoystick === 'function') {
          try { self._handlers.onJoystick(state.x, state.y); } catch (err) { /* bỏ qua */ }
        }
      }
      function end(e) {
        if (self._joyId !== null && e.pointerId !== self._joyId) return;
        self._joyId = null;
        state.x = 0; state.y = 0; state.active = false;
        if (knob) knob.style.transform = '';
      }
      joyEl.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        self._joyId = e.pointerId;
        try { joyEl.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
        move(e);
      });
      joyEl.addEventListener('pointermove', function (e) { if (e.pointerId === self._joyId) move(e); });
      joyEl.addEventListener('pointerup', end);
      joyEl.addEventListener('pointercancel', end);
      joyEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      return state;
    },

    getJoystick: function () { return this._joyState; },

    /* state: {party:[{name,level,hp,maxHp,mp,maxMp,dead}], leaderIndex, gold,
               level, xp, xpNeed, combo, boss:{name,hp,maxHp}|null,
               enemies:[{x,y,isBoss,dead}], npcs:[{x,y}], mapW, mapH,
               skills:[{cd,cdMax,mp}], ultCd, ultCdMax, quest:{title,desc,progress}} */
    update: function (state) {
      if (!this._root || this._destroyed || !state) return;
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

      /* party */
      var party = state.party || [];
      for (var i = 0; i < this._memberEls.length; i++) {
        var p = party[i];
        var mEl = this._memberEls[i];
        if (!p) { mEl.style.display = 'none'; continue; }
        mEl.style.display = '';
        mEl.classList.toggle('dead', !!p.dead);
        mEl.classList.toggle('leader', i === (state.leaderIndex || 0));
        var nameEl = mEl.querySelector('.wx-mname');
        if (nameEl) nameEl.innerHTML = (p.name || ('Hero ' + (i + 1))) + ' · Lv<span class="wx-mlvl">' + (p.level || 1) + '</span>';
        var hp = mEl.querySelector('.wx-hp>i');
        var mp = mEl.querySelector('.wx-mp>i');
        if (hp) hp.style.width = pct(p.hp, p.maxHp) + '%';
        if (mp) mp.style.width = pct(p.mp, p.maxMp) + '%';
      }
      if (this._switchBtns) {
        for (var j = 0; j < this._switchBtns.length; j++) {
          this._switchBtns[j].classList.toggle('on', j === (state.leaderIndex || 0));
        }
      }

      /* thanh chính của leader */
      var leader = party[state.leaderIndex || 0] || party[0];
      if (leader) {
        var q = function (id) { return document.getElementById(id); };
        var hf = q('wx-hpfill'), mf = q('wx-mpfill'), xf = q('wx-xpfill');
        if (hf) hf.style.width = pct(leader.hp, leader.maxHp) + '%';
        if (mf) mf.style.width = pct(leader.mp, leader.maxMp) + '%';
        if (xf) xf.style.width = pct(state.xp || 0, state.xpNeed || 100) + '%';
        var ht = q('wx-hptext'), mt = q('wx-mptext');
        if (ht) ht.textContent = Math.max(0, Math.ceil(leader.hp)) + '/' + leader.maxHp;
        if (mt) mt.textContent = Math.floor(leader.mp) + '/' + leader.maxMp;
        var lv = q('wx-lvl');
        if (lv) lv.textContent = state.level || leader.level || 1;
        var nm = q('wx-leadername');
        if (nm) nm.textContent = leader.name || '';
        var gd = q('wx-gold');
        if (gd) gd.textContent = state.gold || 0;
        var cb = q('wx-combo');
        if (cb) {
          cb.style.display = (state.combo || 0) >= 3 ? '' : 'none';
          var cn = q('wx-combonum');
          if (cn) cn.textContent = state.combo || 0;
        }
      }

      /* boss bar (chỉ hiện khi state.boss.visible, vd leader ở gần boss) */
      if (state.boss && !state.boss.dead && state.boss.visible !== false) this.showBoss(state.boss.name || 'BOSS', state.boss.hp, state.boss.maxHp);
      else this.hideBoss();

      /* skill cooldowns */
      if (state.skills) this.setSkillCooldowns(state.skills);
      if (state.ultCd !== undefined) this.setUltCooldown(state.ultCd, state.ultCdMax || (this._ultDef && this._ultDef.cd) || DEFAULT_ULT.cd);
      if (state.rage !== undefined) this.setRage(state.rage);
      if (leader) this._refreshSkillMp(leader.mp || 0);

      /* quest panel */
      if (state.quest) this.setQuest(state.quest);

      /* minimap 4 lần/giây */
      if (now - this._lastMap >= MINIMAP_MS) {
        this._lastMap = now;
        this._drawMinimap(state);
      }
    },

    _refreshSkillMp: function (mp) {
      this._lastMp = mp || 0;
      var defs = this._skillDefs || DEFAULT_SKILLS;
      for (var i = 0; i < this._skillBtns.length; i++) {
        var need = defs[i] ? defs[i].mp : DEFAULT_SKILLS[i].mp;
        this._skillBtns[i].classList.toggle('noMp', mp < need);
      }
      if (this._ultBtn) {
        var ultNeed = (this._ultDef && this._ultDef.mp) || DEFAULT_ULT.mp;
        var rageOk = (this._rage === undefined || this._rage === null) ? true : (this._rage >= 100);
        this._ultBtn.classList.toggle('noMp', mp < ultNeed || !rageOk);
      }
    },

    /* map: mảng [{cd,cdMax}] (6 ô) hoặc object {0:giây,...,'ult':giây} */
    setSkillCooldowns: function (map) {
      if (!map) return;
      var defs = this._skillDefs || DEFAULT_SKILLS;
      for (var i = 0; i < this._skillBtns.length; i++) {
        var cd = 0, cdMax = (defs[i] && defs[i].cd) || DEFAULT_SKILLS[i].cd;
        if (Array.isArray(map)) {
          var s = map[i];
          if (s) { cd = (typeof s === 'number') ? s : (s.cd || 0); cdMax = (s && s.cdMax) || cdMax; }
        } else if (map[i] !== undefined) {
          cd = (typeof map[i] === 'number') ? map[i] : (map[i].cd || 0);
          cdMax = (map[i] && map[i].cdMax) || cdMax;
        }
        this._cds[i] = cd;
        var b = this._skillBtns[i];
        b.classList.toggle('onCd', cd > 0);
        var cdEl = b.querySelector('.wx-cd');
        if (cdEl) cdEl.textContent = cd > 0 ? Math.ceil(cd) : '';
        var sw = b.querySelector('.wx-sweep');
        if (sw) sw.style.height = (cd > 0 && cdMax > 0) ? pct(cd, cdMax) + '%' : '0%';
      }
      if (map && map.ult !== undefined) {
        this.setUltCooldown((typeof map.ult === 'number') ? map.ult : (map.ult.cd || 0),
          (map.ult && map.ult.cdMax) || DEFAULT_ULT.cd);
      }
    },

    setUltCooldown: function (cd, cdMax) {
      this._ultCd = cd || 0;
      this._ultCdMax = cdMax || DEFAULT_ULT.cd;
      var b = this._ultBtn;
      if (!b) return;
      b.classList.toggle('onCd', this._ultCd > 0);
      var cdEl = b.querySelector('.wx-cd');
      if (cdEl) cdEl.textContent = this._ultCd > 0 ? Math.ceil(this._ultCd) : '';
      var sw = b.querySelector('.wx-sweep');
      if (sw) sw.style.height = (this._ultCd > 0) ? pct(this._ultCd, this._ultCdMax) + '%' : '0%';
    },

    showBoss: function (name, hp, maxHp) {
      var bar = document.getElementById('wuxia-bossbar');
      if (!bar) return;
      bar.style.display = 'block';
      var n = document.getElementById('wx-bossname');
      if (n && name) n.textContent = '🐉 ' + name;
      if (hp !== undefined && maxHp) {
        var f = document.getElementById('wx-bossfill');
        if (f) f.style.width = pct(hp, maxHp) + '%';
      }
    },

    hideBoss: function () {
      var bar = document.getElementById('wuxia-bossbar');
      if (bar) bar.style.display = 'none';
    },

    setQuest: function (quest) {
      var d = document.getElementById('wx-qdesc');
      var p = document.getElementById('wx-qprog');
      var list = document.getElementById('wx-qlist');
      if (!quest) {
        if (d) d.textContent = 'Nói chuyện với Trưởng Lão để nhận nhiệm vụ.';
        if (p) p.textContent = '';
        if (list) list.innerHTML = '';
        return;
      }
      if (d) d.textContent = quest.desc || quest.title || '';
      if (p) p.textContent = quest.progress || '';
      if (list && Array.isArray(quest.all)) {
        list.innerHTML = '';
        quest.all.forEach(function (qq) {
          var li = document.createElement('li');
          li.className = qq.status === 'claimed' || qq.status === 'complete' ? 'done' : (qq.status === 'active' ? 'active' : '');
          li.textContent = (qq.status === 'claimed' || qq.status === 'complete' ? '✅ ' : qq.status === 'active' ? '▶ ' : '🔒 ') + qq.title;
          list.appendChild(li);
        });
      }
    },

    /* Damage number bay lên. pos: {sx,sy} (pixel màn hình) hoặc {x,y} tile
       (cần game.projectTileToScreen) hoặc null -> giữa màn hình lệch ngẫu nhiên.
       opts: {crit, skill, heal, text} */
    showDamage: function (dmg, pos, opts) {
      if (!this._root || this._destroyed) return;
      opts = opts || {};
      var layer = document.getElementById('wuxia-dmg');
      if (!layer) return;
      var sx, sy;
      if (pos && typeof pos.sx === 'number' && typeof pos.sy === 'number') {
        sx = pos.sx; sy = pos.sy;
      } else if (pos && typeof pos.x === 'number' && typeof pos.y === 'number' &&
                 this._game && typeof this._game.projectTileToScreen === 'function') {
        var pt = this._game.projectTileToScreen(pos.x, pos.y, pos.h || 2);
        if (pt) { sx = pt.x; sy = pt.y; } else { sx = window.innerWidth / 2; sy = window.innerHeight / 2; }
      } else {
        sx = window.innerWidth / 2 + (Math.random() * 120 - 60);
        sy = window.innerHeight / 2 + (Math.random() * 60 - 30);
      }
      var d = el('div', 'wx-dmgnum' + (opts.crit ? ' crit' : opts.skill ? ' skill' : opts.heal ? ' heal' : ''));
      d.textContent = (opts.text !== undefined) ? opts.text : ((opts.crit ? '💥 ' : '') + (opts.heal ? '+' : '') + dmg);
      d.style.left = sx + 'px';
      d.style.top = sy + 'px';
      layer.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 950);
    },

    /* Log activity/chat, tối đa 30 dòng. kind: info|quest|gold|bad|good|sys */
    log: function (msg, kind) {
      if (!this._root) return;
      var lg = document.getElementById('wuxia-log');
      if (!lg) return;
      var line = el('div', 'k-' + (kind || 'info'));
      line.textContent = msg;
      lg.appendChild(line);
      while (lg.children.length > LOG_MAX) lg.removeChild(lg.firstChild);
      lg.scrollTop = lg.scrollHeight;
    },

    toast: function (msg, ms) {
      var t = document.getElementById('wuxia-toast');
      if (!t) return;
      t.textContent = msg;
      t.style.display = 'block';
      clearTimeout(this._toastT);
      this._toastT = setTimeout(function () { t.style.display = 'none'; }, ms || 2000);
    },

    banner: function (big, sub, ms) {
      var b = document.getElementById('wuxia-banner');
      if (!b) return;
      b.querySelector('.wx-big').textContent = big;
      b.querySelector('.wx-sub').textContent = sub || '';
      b.style.display = 'block';
      clearTimeout(this._bannerT);
      this._bannerT = setTimeout(function () { b.style.display = 'none'; }, ms || 2400);
    },

    showDialog: function (who, txt) {
      var d = document.getElementById('wuxia-dialog');
      if (!d) return;
      d.querySelector('.wx-who').textContent = who;
      d.querySelector('.wx-txt').textContent = txt;
      d.style.display = 'block';
    },

    hideDialog: function () {
      var d = document.getElementById('wuxia-dialog');
      if (d) d.style.display = 'none';
    },

    showVictory: function (text) {
      var v = document.getElementById('wuxia-victory');
      if (!v) return;
      var t = document.getElementById('wx-vtext');
      if (t && text) t.textContent = text;
      v.style.display = 'flex';
    },

    hideVictory: function () {
      var v = document.getElementById('wuxia-victory');
      if (v) v.style.display = 'none';
    },

    /* Minimap 2D: map 56x56 thu nhỏ — nhà/đền/cổng (điểm cố định),
       hero xanh lá/xanh dương, quái đỏ, boss tím/đỏ lớn, NPC vàng. */
    _drawMinimap: function (state) {
      var ctx = this._mapCtx, cv = this._mapCv;
      if (!ctx || !cv) return;
      var MW = state.mapW || MAP_W, MH = state.mapH || MAP_H;
      var W = cv.width, H = cv.height;
      var sx = W / MW, sy = H / MH;
      ctx.fillStyle = '#16233d';
      ctx.fillRect(0, 0, W, H);
      /* đường đá chính */
      ctx.strokeStyle = '#8d8578';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(28 * sx, 4 * sy); ctx.lineTo(28 * sx, 46 * sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(12 * sx, 29 * sy); ctx.lineTo(44 * sx, 29 * sy); ctx.stroke();
      /* hồ băng tây bắc */
      ctx.fillStyle = '#9fc8e8';
      ctx.beginPath(); ctx.ellipse(8 * sx, 46 * sy, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      /* đền (vàng) + cổng (nâu) + portal (tím) */
      ctx.fillStyle = '#c9a94f';
      ctx.fillRect(26 * sx, 3 * sy, 4 * sx, 4 * sy);
      ctx.fillStyle = '#8a5f36';
      ctx.fillRect(26 * sx, 44 * sy, 4 * sx, 2 * sy);
      ctx.fillStyle = '#9d4edd';
      ctx.beginPath(); ctx.arc(50 * sx, 30 * sy, 4, 0, Math.PI * 2); ctx.fill();
      /* nhà (điểm xám nhạt) */
      ctx.fillStyle = '#a89a7a';
      var houses = [[16, 16], [36, 14], [14, 34], [40, 36], [20, 22], [38, 22], [46, 18]];
      houses.forEach(function (h) { ctx.fillRect(h[0] * sx - 2, h[1] * sy - 2, 4, 4); });
      /* NPC vàng */
      (state.npcs || []).forEach(function (n) {
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath(); ctx.arc(n.x * sx, n.y * sy, 3, 0, Math.PI * 2); ctx.fill();
      });
      /* quái đỏ, boss tím to */
      (state.enemies || []).forEach(function (e) {
        if (e.dead) return;
        ctx.fillStyle = e.isBoss ? '#c44dff' : '#ff7a5c';
        ctx.beginPath(); ctx.arc(e.x * sx, e.y * sy, e.isBoss ? 5 : 2.5, 0, Math.PI * 2); ctx.fill();
      });
      /* party: leader xanh lá, follower xanh dương */
      (state.party || []).forEach(function (p, i) {
        if (p.dead) return;
        ctx.fillStyle = i === (state.leaderIndex || 0) ? '#4dff6e' : '#5cb8ff';
        ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, i === (state.leaderIndex || 0) ? 4 : 3, 0, Math.PI * 2); ctx.fill();
      });
    },

    destroy: function () {
      this._destroyed = true;
      for (var i = 0; i < this._bound.length; i++) {
        var b = this._bound[i];
        try { b[0].removeEventListener(b[1], b[2]); } catch (e) { /* bỏ qua */ }
      }
      this._bound = [];
      clearTimeout(this._bannerT);
      clearTimeout(this._toastT);
      this._joyState = { x: 0, y: 0, active: false };
      this._joyId = null;
      if (this._root) {
        this._root.innerHTML = '';
        this._root = null;
      }
      this._skillBtns = [];
      this._ultBtn = null;
      this._memberEls = [];
      this._mapCtx = null;
      this._mapCv = null;
      this._game = null;
      this._handlers = {};
    }
  };

  PE.WuxiaHUD = HUD;
  PE.Wuxia.HUD = HUD;
})();
