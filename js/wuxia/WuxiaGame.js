'use strict';
/* WuxiaGame.js — Vòng lặp game chính: Quan Ải Long Ngâm (PixiJS 3D Engine Editor v5.0).
   Nhóm Wuxia HUD / Quests / Audio / Game Loop.
   Chạy được standalone (wuxia.html — nhóm tích hợp sẽ làm) lẫn trong editor (tab Wuxia Game).
   TÍCH HỢP module thật của các nhóm khác theo API ĐÃ CÓ trong repo:
     WuxiaWorld.build(scene, THREE) / isBlocked(x,z-theo-đơn-vị-thế-giới) / update(dt) /
       worldToGrid / gridToWorld / getSpawnPoint / getNPCSpots / getEnemySpawnPoints
     WuxiaCamera.create(camera, opts) / follow(pos, dt) / snap(pos) / update(dt) /
       setDistance(d) / shake(amp, dur)   (yaw mặc định -45°)
     WuxiaCharacters.createParty / createHero / createNPC / createEnemy /
       setPosition / setFacing / animate(ch, dt, moving) / updateHpBar
       (nhân vật dùng position {x, z} ĐƠN VỊ THẾ GIỚI, cờ alive, kind hero/npc/enemy/elite/boss)
     WuxiaParty.init(list, opts) / getActive / getMembers / switchTo(i) /
       update(dt, leaderPos, {enemies, leaderAttacking}) / addXP / healParty /
       allDead / save / load / onLevelUp / onSwitch / onRevive
     WuxiaCombat.attack(a, t) / takeDamage / attackAoE / update(dt) /
       findNearest(pos, list, range) / onDamage / onKill / onHit (setter)
     WuxiaSkills.cast(id, caster, targets, world) / castUlt / getSkills / getUlt /
       getCooldowns / getRage / update(dt, scene)
       (skill id: swordwind/firepalm/icefreeze/thunder/heal/dragonbreak; ult cần nộ 100)
     WuxiaEnemies.spawn(type, {x,z}) / spawnAtPoints / createBoss(scene, pos) /
       getBoss / getAlive / getAll / update(dt, heroPos, {party, leader, scene}) /
       onBossDeath / onKill
       (type quái: 'snow' | 'bandit' | 'fox' (= Hồ Ly Tinh, kind 'elite') | 'boss')
     WuxiaInventory.init / addGold / getGold / usePotion(type, target) /
       count / getItems / save / load
     WuxiaDungeon.create(scene, onEnter, onExit) / enter / exit / isNearPortal /
       getBossSpawn / getArenaCenter / getExitPoint / isBlocked / update(dt)
     WuxiaQuests (nhóm này) / WuxiaHUD (nhóm này) / WuxiaAudio (nhóm này)
   Mọi lệnh gọi đều kiểm tra typeof trước; khi module chưa có thì dùng FALLBACK
   tối thiểu nội bộ (đánh dấu [FB]) cùng đúng model dữ liệu trên để game vẫn chạy.
   An toàn khi THREE chưa load: init() trả false + thông báo rõ trên màn hình.
   Expose: window.PixiEngine.WuxiaGame
   API: init(canvasOrContainer, opts), start(), stop(), pause(), resume(),
        update(dt), getState(), save(), load(), on(event, fn),
        setHero(i), castSkill(id), attack(), jump(), usePotion(),
        openInventory(), enterDungeon(), exitDungeon(),
        projectTileToScreen(x, y, h), projectWorldToScreen(x, y, z), destroy() */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};
  var PE = window.PixiEngine;
  var WX = PE.Wuxia;

  var SAVE_KEY = 'wuxia-save-v5';
  var SAVE_VERSION = 5;
  var MAP = 56, TILE = 2, HALF = MAP / 2;
  var BOSS_BAR_RANGE = 28;   /* hiện boss bar khi leader cách boss < 28 đơn vị */
  var AUTO_TARGET_RANGE = 12;
  var NPC_TALK_RANGE = 7;

  /* [FB] skill khi WuxiaSkills chưa có — khớp tên/MP/cooldown bản 3D-Model. */
  var FB_SKILLS = [
    { id: 'swordwind', name: 'Kiếm Khí', mpCost: 15, cooldown: 2.5 },
    { id: 'firepalm', name: 'Hỏa Bạo', mpCost: 25, cooldown: 6 },
    { id: 'icefreeze', name: 'Băng Phong', mpCost: 30, cooldown: 8 },
    { id: 'thunder', name: 'Lôi Đình', mpCost: 30, cooldown: 8 },
    { id: 'heal', name: 'Hồi Xuân', mpCost: 20, cooldown: 10 },
    { id: 'dragonbreak', name: 'Long Ngâm Phá', mpCost: 35, cooldown: 12 }
  ];
  var FB_ULT = { id: 'dragon-ult', name: 'Thần Long Giáng Thế', mpCost: 60, cooldown: 30 };
  var FB_ENEMY_DEFS = {
    snow: { name: 'Tuyết Yêu', hp: 60, atk: 8, speed: 1.6, xp: 25, gold: 12 },
    bandit: { name: 'Sơn Tặc', hp: 90, atk: 12, speed: 2.0, xp: 40, gold: 22 },
    fox: { name: 'Hồ Ly Tinh', hp: 220, atk: 18, speed: 1.8, xp: 120, gold: 60 },
    boss: { name: 'Long Ngâm Lão Tổ', hp: 1200, atk: 26, speed: 1.4, xp: 600, gold: 300 }
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function dist2(ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); }
  function wX(tx) { return (tx - HALF) * TILE; }
  function wZ(ty) { return (ty - HALF) * TILE; }
  function tileX(wx) { return wx / TILE + HALF; }
  function tileZ(wz) { return wz / TILE + HALF; }
  function has(obj, fn) { return !!(obj && typeof obj[fn] === 'function'); }
  function mod(name) { return WX[name] || null; }

  var Game = {
    _inited: false, _running: false, _paused: false, _over: false, _won: false,
    _container: null, _renderer: null, _scene: null, _camera: null,
    _raf: 0, _lastT: 0, _time: 0, _lastUI: 0, _portalCd: 0,
    _hud: null, _audio: null, _quests: null,
    _joy: { x: 0, y: 0, active: false },
    _keys: {}, _listeners: [], _events: {},
    _camYaw: -Math.PI / 4, /* khớp WuxiaCamera DEF_YAW -45°; fallback camera +45° */
    _useRealCamera: false, _inDungeon: false, _townSpawn: null,
    _fallback: {},
    _snow: null, _snowVel: null, _snowTime: 0, _blocked: null,

    /* ---- state (đơn vị thế giới; xem getState() để đổi sang tile cho HUD) ---- */
    party: [], leaderIndex: 0, enemies: [], npcs: [], boss: null,
    target: null, moveTarget: null,
    gold: 0, kills: 0, bossKills: 0, combo: 0, _comboTimer: 0,
    level: 1, xp: 0, xpNeed: 100, potions: 3,
    _cds: {}, _ultCd: 0, _rage: 0,

    /* ================= INIT ================= */
    init: function (canvasOrContainer, opts) {
      opts = opts || {};
      if (typeof THREE === 'undefined') {
        var msg = 'Không tải được three.js — kiểm tra lại thẻ <script> three r128 (CDN) trước WuxiaGame.js. Game chưa khởi động.';
        if (window.console) console.error('[WuxiaGame] ' + msg);
        this._showNotice(canvasOrContainer, msg);
        return false;
      }
      var container = null;
      if (typeof canvasOrContainer === 'string') container = document.querySelector(canvasOrContainer);
      else if (canvasOrContainer && canvasOrContainer.nodeType === 1) container = canvasOrContainer;
      if (!container) container = document.body;
      if (container.tagName === 'CANVAS') container = container.parentNode || document.body;
      this._container = container;
      if (container.style.position === '' || container.style.position === 'static') {
        container.style.position = 'relative';
      }
      var self = this;

      /* renderer / scene / camera / đèn */
      var renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this._renderer = renderer;
      var w = container.clientWidth || window.innerWidth;
      var h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';
      container.appendChild(renderer.domElement);

      var scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0d1420);
      scene.fog = new THREE.Fog(0x0d1420, 55, 150);
      this._scene = scene;
      var camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 400);
      this._camera = camera;
      scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2438, 0.85));
      var sun = new THREE.DirectionalLight(0xfff2cc, 1.05);
      sun.position.set(40, 60, 20);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
      sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
      sun.shadow.camera.far = 180;
      scene.add(sun);

      /* world thật hoặc fallback */
      var World = mod('World');
      if (World && has(World, 'build')) {
        try {
          if (!World.build(scene, THREE)) { this._fallback.world = true; this._fallbackWorld(); }
        } catch (e) { this._fallback.world = true; this._fallbackWorld(); }
      } else {
        this._fallback.world = true;
        this._fallbackWorld();
      }
      this._buildBlocked();

      /* dungeon (portal + arena) */
      var Dungeon = mod('Dungeon');
      if (Dungeon && has(Dungeon, 'create')) {
        try {
          Dungeon.create(scene,
            function () { self._inDungeon = true; },
            function () { self._inDungeon = false; });
        } catch (e) { /* bỏ qua — enter/exit vẫn teleport được */ }
      }

      /* điểm spawn phố */
      var spawn = { x: wX(28), z: wZ(40) };
      if (World && has(World, 'getSpawnPoint')) {
        try {
          var sp = World.getSpawnPoint('town');
          if (sp && typeof sp.x === 'number' && typeof sp.z === 'number') spawn = { x: sp.x, z: sp.z };
        } catch (e) { /* giữ mặc định */ }
      }
      this._townSpawn = spawn;

      /* party */
      this._spawnParty(spawn);
      /* NPC */
      this._spawnNPCs();
      /* quái + boss */
      this._spawnEnemies();

      /* combat callbacks -> HUD / quest / XP / vàng */
      var Combat = mod('Combat');
      if (Combat) {
        try {
          Combat.onDamage = function (dmg, pos, o) { self._onDamage(dmg, pos, o); };
          Combat.onKill = function (target, attacker) { self._onKill(target, attacker); };
          Combat.onHit = function (attacker, target, res) { self._sfx('swing'); };
        } catch (e) { /* bỏ qua */ }
      }
      /* boss chết (đường dự phòng qua Enemies) */
      var Enemies = mod('Enemies');
      if (Enemies) {
        try { Enemies.onBossDeath = function (b) { self._onBossDeath(b); }; } catch (e) { /* bỏ qua */ }
      }
      /* party callbacks */
      var Party = mod('Party');
      if (Party) {
        try {
          Party.onLevelUp = function (events) {
            self.level = (events && events[0] && events[0].level) || self.level;
            self.emit('levelup', { level: self.level, events: events });
            self._sfx('levelup');
            if (self._hud) self._hud.banner('⭐ LÊN CẤP ' + self.level + '!', 'HP/MP hồi đầy — sức mạnh tăng!');
          };
          Party.onSwitch = function (hero, i) { self.leaderIndex = i; self.target = null; };
          Party.onRevive = function (m) {
            self._toast(m.name + ' đã hồi sinh!');
            if (self._hud) self._hud.log(m.name + ' đã hồi sinh!', 'good');
          };
        } catch (e) { /* bỏ qua */ }
      }

      /* inventory */
      var Inv = mod('Inventory');
      if (Inv) {
        try {
          if (has(Inv, 'init')) Inv.init();
          if (has(Inv, 'load')) Inv.load();
          if (has(Inv, 'getGold')) this.gold = Inv.getGold();
        } catch (e) { /* bỏ qua */ }
      }

      /* quests (nhóm này) */
      this._quests = mod('Quests');
      if (this._quests && has(this._quests, 'init')) {
        try {
          this._quests.init({
            onQuestUpdate: function (display) { if (self._hud) self._hud.setQuest(display); },
            onReward: function (reward) { self._applyReward(reward); }
          });
          this._quests.load();
        } catch (e) { if (window.console) console.warn('[WuxiaGame] Quests lỗi:', e); }
      }

      /* HUD + audio */
      this._hud = mod('HUD');
      if (this._hud && has(this._hud, 'init')) {
        var hudRoot = container.querySelector('#wuxia-hud');
        if (!hudRoot) {
          hudRoot = document.createElement('div');
          hudRoot.id = 'wuxia-hud';
          container.appendChild(hudRoot);
        }
        try {
          this._hud.init(hudRoot, this);
          var Skills = mod('Skills');
          if (Skills && has(Skills, 'getSkills') && has(this._hud, 'setSkills')) {
            try { this._hud.setSkills(Skills.getSkills(), Skills.getUlt()); } catch (e) { /* giữ mặc định */ }
          }
          this._hud.bindActions({
            onAttack: function () { self.attack(); },
            onSkill: function (id) { self.castSkill(id); },
            onSwitchHero: function (i) { self.setHero(i); },
            onJump: function () { self.jump(); },
            onPotion: function () { self.usePotion(); },
            onOpenInventory: function () { self.openInventory(); },
            onPlayAgain: function () { self.restart(); }
          });
          var joyState = this._hud.bindJoystick();
          if (joyState) this._joy = joyState;
        } catch (e) { if (window.console) console.warn('[WuxiaGame] HUD lỗi:', e); this._hud = null; }
      }
      this._audio = mod('Audio');
      if (this._audio && has(this._audio, 'init')) {
        var resumeAudio = function () { self._audio.init(); self._audio.resume(); };
        this._on(document, 'pointerdown', resumeAudio, true);
        this._on(document, 'keydown', resumeAudio, true);
      }

      /* camera thật hoặc fallback */
      var Cam = mod('Camera');
      if (Cam && has(Cam, 'create')) {
        try {
          if (Cam.create(camera, { distance: 24 })) {
            this._useRealCamera = true;
            this._camYaw = -Math.PI / 4;
          }
        } catch (e) { /* fallback */ }
      }
      if (!this._useRealCamera) this._camYaw = Math.PI / 4;

      this._bindInput();
      this._on(window, 'resize', function () { self._onResize(); });
      this._inited = true;
      this.load();
      if (this._hud) {
        this._hud.log('Chào mừng đến Trường Bạch! Gặp Trưởng Lão để nhận nhiệm vụ.', 'sys');
        this._hud.update(this.getState());
      }
      return true;
    },

    _showNotice: function (canvasOrContainer, msg) {
      var container = null;
      if (typeof canvasOrContainer === 'string') container = document.querySelector(canvasOrContainer);
      else if (canvasOrContainer && canvasOrContainer.nodeType === 1) container = canvasOrContainer;
      if (!container) container = document.body;
      var d = document.createElement('div');
      d.style.cssText = 'padding:16px;margin:12px;background:#3a1414;color:#ffd9d9;border:1px solid #ff5a5a;border-radius:10px;font:14px/1.5 system-ui,sans-serif';
      d.textContent = '⚠ Wuxia Game chưa chạy: ' + msg;
      container.appendChild(d);
    },

    _on: function (target, evt, fn, opts) {
      var o = (opts === undefined) ? false : opts;
      target.addEventListener(evt, fn, o);
      this._listeners.push([target, evt, fn, o]);
    },

    _addToScene: function (ch) {
      if (ch && ch.group && this._scene) {
        if (!ch.group.parent) this._scene.add(ch.group);
        if (ch.group.traverse) {
          ch.group.traverse(function (o) { o.userData.char = ch; });
        }
      }
    },

    /* ---- [FB] world tối thiểu: đất tuyết + núi xa + tuyết rơi ---- */
    _fallbackWorld: function () {
      var ground = new THREE.Mesh(
        new THREE.PlaneGeometry(MAP * TILE, MAP * TILE),
        new THREE.MeshLambertMaterial({ color: 0x5c6c8c })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this._scene.add(ground);
      var self = this;
      [[2, 2, 34], [14, 0, 42], [46, 1, 46], [58, 26, 32]].forEach(function (p) {
        var m = new THREE.Mesh(new THREE.ConeGeometry(22, p[2], 5),
          new THREE.MeshLambertMaterial({ color: 0x2c3a58 }));
        m.position.set(wX(p[0]), p[2] / 2 - 2, wZ(p[1]));
        self._scene.add(m);
      });
      this._buildSnow();
    },

    _buildSnow: function () {
      var N = 900;
      var pos = new Float32Array(N * 3);
      for (var i = 0; i < N; i++) {
        pos[i * 3] = rand(-56, 56);
        pos[i * 3 + 1] = rand(0, 30);
        pos[i * 3 + 2] = rand(-56, 56);
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var pts = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xffffff, size: 0.28, transparent: true, opacity: 0.85
      }));
      pts.frustumCulled = false;
      this._scene.add(pts);
      this._snow = pts;
      this._snowVel = new Float32Array(N);
      for (var j = 0; j < N; j++) this._snowVel[j] = rand(1.2, 3);
    },

    _buildBlocked: function () {
      /* [FB] lưới chặn theo tile, khớp bản 3D-Model: hồ băng + đền + nhà + cổng. */
      var blocked = [];
      for (var x = 0; x < MAP; x++) { blocked[x] = []; for (var y = 0; y < MAP; y++) blocked[x][y] = false; }
      function rect(x0, y0, x1, y1) {
        for (var x = Math.floor(x0); x <= Math.floor(x1); x++)
          for (var y = Math.floor(y0); y <= Math.floor(y1); y++)
            if (x >= 0 && y >= 0 && x < MAP && y < MAP) blocked[x][y] = true;
      }
      rect(4, 42, 12, 50);
      rect(24, 2, 32, 9);
      rect(25.5, 44, 30.5, 45.5);
      [[16, 16], [36, 14], [14, 34], [40, 36], [20, 22], [38, 22], [46, 18]].forEach(function (h) {
        rect(h[0] - 1.7, h[1] - 1.3, h[0] + 1.7, h[1] + 1.3);
      });
      this._blocked = blocked;
    },

    /* x, z theo ĐƠN VỊ THẾ GIỚI (WuxiaWorld.isBlocked cũng nhận đơn vị thế giới). */
    _isBlocked: function (x, z) {
      var Dungeon = mod('Dungeon');
      if (this._inDungeon && Dungeon && has(Dungeon, 'isBlocked')) {
        try { if (Dungeon.isBlocked(x, z)) return true; } catch (e) { /* bỏ qua */ }
      }
      var World = mod('World');
      if (World && has(World, 'isBlocked')) {
        try { return !!World.isBlocked(x, z); } catch (e) { /* rơi xuống fallback */ }
      }
      var gx = Math.floor(tileX(x)), gz = Math.floor(tileZ(z));
      if (gx < 0 || gz < 0 || gx >= MAP || gz >= MAP) return true;
      return this._blocked ? this._blocked[gx][gz] : false;
    },

    /* ---- [FB] figure low-poly tối thiểu, cùng model dữ liệu Characters ---- */
    _fbFigure: function (robe, skin, scale, weapon) {
      var g = new THREE.Group();
      function box(w, h, d, color, x, y, z) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: color }));
        m.position.set(x, y, z);
        m.castShadow = true;
        g.add(m);
        return m;
      }
      box(0.62, 0.72, 0.36, robe, 0, 1.45, 0);
      box(0.68, 0.55, 0.4, robe, 0, 0.95, 0);
      box(0.22, 0.88, 0.24, robe, -0.17, 0.44, 0);
      box(0.22, 0.88, 0.24, robe, 0.17, 0.44, 0);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10),
        new THREE.MeshLambertMaterial({ color: skin }));
      head.position.set(0, 2.05, 0);
      head.castShadow = true;
      g.add(head);
      if (weapon === 'sword') box(0.07, 0.95, 0.03, 0xdfe8f2, 0.45, 1.1, 0.1);
      if (weapon === 'spear') box(0.06, 2.0, 0.06, 0x7d5a34, -0.45, 1.2, 0.1);
      if (weapon === 'staff') box(0.06, 1.9, 0.06, 0x6b4a2a, 0.45, 1.2, 0.1);
      g.scale.set(scale || 1, scale || 1, scale || 1);
      return g;
    },

    _fbChar: function (o) {
      var ch = {
        id: 'wuxia-fb-' + Math.random().toString(36).slice(2, 8),
        name: o.name, kind: o.kind, level: o.level || 1,
        hp: o.maxHp, maxHp: o.maxHp, mp: o.maxMp || 0, maxMp: o.maxMp || 0,
        atk: o.atk, def: o.def || 0, speed: o.speed, range: o.range || 1.5,
        attackInterval: o.attackInterval || 0.85,
        xp: o.xp || 0, gold: o.gold || 0,
        position: { x: o.x, z: o.z }, home: { x: o.x, z: o.z },
        facing: 0, alive: true, height: o.height || 2.2,
        group: null, mesh: null, parts: null, mixer: null, clips: {},
        attackCd: 0, swingT: 0, flashT: 0, slowT: 0, frozenT: 0,
        walkPhase: Math.random() * 6, respawnT: 0,
        isElite: o.kind === 'elite', isBoss: o.kind === 'boss', isNPC: o.kind === 'npc',
        enraged: false, jumpV: 0, jumpY: 0
      };
      ch.group = this._fbFigure(o.robe, o.skin, o.scale || 1, o.weapon);
      ch.mesh = ch.group;
      ch.group.position.set(o.x, 0, o.z);
      this._scene.add(ch.group);
      return ch;
    },

    _spawnParty: function (spawn) {
      var Party = mod('Party');
      if (Party && has(Party, 'init')) {
        try {
          var members = Party.init(null, { x: spawn.x, z: spawn.z });
          if (Array.isArray(members) && members.length >= 1) {
            this.party = members;
            this.leaderIndex = 0;
            var self = this;
            members.forEach(function (m) { self._addToScene(m); });
            return;
          }
        } catch (e) { /* fallback */ }
      }
      var Chars = mod('Characters');
      if (Chars && has(Chars, 'createParty')) {
        try {
          var p = Chars.createParty({ x: spawn.x, z: spawn.z });
          if (Array.isArray(p) && p.length >= 1) {
            this.party = p;
            this.leaderIndex = 0;
            var self2 = this;
            p.forEach(function (m) { self2._addToScene(m); });
            return;
          }
        } catch (e) { /* fallback */ }
      }
      this._fallback.party = true;
      var defs = [
        { name: 'Lâm Phong', kind: 'hero', robe: 0x2b5cb8, skin: 0xf2c89b, weapon: 'sword', maxHp: 320, maxMp: 160, atk: 26, def: 4, speed: 4.6, range: 1.6, attackInterval: 0.55, x: spawn.x, z: spawn.z },
        { name: 'Thiết Ngưu', kind: 'hero', robe: 0xb85c1e, skin: 0xe8b88a, weapon: 'spear', maxHp: 420, maxMp: 100, atk: 22, def: 8, speed: 4.2, range: 2.0, attackInterval: 0.85, x: spawn.x - 2.4, z: spawn.z + 2 },
        { name: 'Bạch Tuyết', kind: 'hero', robe: 0x7a3fd4, skin: 0xf7d3ae, weapon: 'staff', maxHp: 260, maxMp: 240, atk: 30, def: 2, speed: 4.0, range: 3.5, attackInterval: 0.9, x: spawn.x + 2.4, z: spawn.z + 2 }
      ];
      var self3 = this;
      this.party = defs.map(function (d) {
        var ch = self3._fbChar(d);
        self3._addToScene(ch);
        return ch;
      });
      this.leaderIndex = 0;
    },

    _spawnNPCs: function () {
      var World = mod('World');
      var Chars = mod('Characters');
      var spots = [];
      if (World && has(World, 'getNPCSpots')) {
        try { spots = World.getNPCSpots() || []; } catch (e) { spots = []; }
      }
      if (!spots.length) {
        spots = [
          { name: 'Vệ Binh A Hổ', x: wX(25.5), z: wZ(42.5) },
          { name: 'Trưởng Lão Tuyết', x: wX(24), z: wZ(20) }
        ];
      }
      var self = this;
      this.npcs = [];
      spots.forEach(function (s) {
        var key = (s.name.indexOf('A Hổ') >= 0) ? 'guard' : 'elder';
        var npcId = (key === 'guard') ? 'guard' : 'elder';
        var ch = null;
        if (Chars && has(Chars, 'createNPC')) {
          try { ch = Chars.createNPC(key, { x: s.x, z: s.z }); } catch (e) { ch = null; }
        }
        if (!ch) {
          ch = self._fbChar({
            name: s.name, kind: 'npc', robe: key === 'guard' ? 0x2e5e2e : 0xe8eef7,
            skin: 0xf2c89b, weapon: 'staff', maxHp: 9999, maxMp: 0, atk: 0,
            speed: 0, x: s.x, z: s.z
          });
        }
        ch.npcId = npcId;
        self._addToScene(ch);
        self.npcs.push(ch);
      });
      /* Thương Nhân Trần — NPC_DEFS chưa có 'merchant' nên luôn dùng figure fallback. */
      var merch = this._fbChar({
        name: 'Thương Nhân Trần', kind: 'npc', robe: 0x8a6d1f, skin: 0xe8b88a,
        weapon: 'staff', maxHp: 9999, maxMp: 0, atk: 0, speed: 0,
        x: wX(38), z: wZ(28)
      });
      merch.npcId = 'merchant';
      this._addToScene(merch);
      this.npcs.push(merch);
    },

    _spawnEnemies: function () {
      var World = mod('World');
      var Enemies = mod('Enemies');
      var points = null;
      if (World && has(World, 'getEnemySpawnPoints')) {
        try { points = World.getEnemySpawnPoints(); } catch (e) { points = null; }
      }
      this.enemies = [];
      var self = this;
      function addEnemy(e, type) {
        if (!e) return;
        e.enemyType = type; /* 'snow' | 'bandit' | 'elite' | 'boss' — cho quest */
        if (e.isBoss) self.boss = e;
        self._addToScene(e);
        self.enemies.push(e);
      }
      if (Array.isArray(points) && points.length && Enemies && has(Enemies, 'spawn')) {
        points.forEach(function (pt) {
          /* World trả type 'elite' nhưng Characters/ Enemies dùng key 'fox'. */
          var type = (pt.type === 'elite') ? 'fox' : pt.type;
          try { addEnemy(Enemies.spawn(type, { x: pt.x, z: pt.z }), pt.type); } catch (e) { /* bỏ qua */ }
        });
      } else {
        /* [FB] vùng spawn theo tile, đổi sang đơn vị thế giới. */
        this._fallback.enemies = true;
        var zones = [
          { type: 'snow', n: 9, x0: 8, y0: 8, x1: 20, y1: 20 },
          { type: 'bandit', n: 7, x0: 38, y0: 14, x1: 48, y1: 24 },
          { type: 'fox', n: 3, x0: 44, y0: 26, x1: 52, y1: 34, qtype: 'elite' },
          { type: 'snow', n: 4, x0: 12, y0: 34, x1: 20, y1: 44 }
        ];
        zones.forEach(function (z) {
          for (var i = 0; i < z.n; i++) {
            var tx = rand(z.x0, z.x1), ty = rand(z.y0, z.y1), tries = 0;
            while (self._isBlocked(wX(tx), wZ(ty)) && tries++ < 6) { tx = rand(z.x0, z.x1); ty = rand(z.y0, z.y1); }
            addEnemy(self._fbEnemy(z.type, wX(tx), wZ(ty)), z.qtype || z.type);
          }
        });
      }
      /* boss */
      var bossPos = { x: wX(48), z: wZ(40) };
      var Dungeon = mod('Dungeon');
      if (Dungeon && has(Dungeon, 'getBossSpawn')) {
        try {
          var bp = Dungeon.getBossSpawn();
          if (bp && typeof bp.x === 'number' && typeof bp.z === 'number') bossPos = { x: bp.x, z: bp.z };
        } catch (e) { /* giữ mặc định */ }
      }
      var boss = null;
      if (Enemies && has(Enemies, 'createBoss')) {
        try { boss = Enemies.createBoss(this._scene, bossPos); } catch (e) { boss = null; }
      }
      if (!boss && Enemies && has(Enemies, 'spawn')) {
        try { boss = Enemies.spawn('boss', bossPos); } catch (e) { boss = null; }
      }
      if (!boss) boss = this._fbEnemy('boss', bossPos.x, bossPos.z);
      addEnemy(boss, 'boss');
      if (Enemies && has(Enemies, 'getBoss')) {
        try { var gb = Enemies.getBoss(); if (gb) this.boss = gb; } catch (e) { /* giữ boss đã spawn */ }
      }
    },

    _fbEnemy: function (type, x, z) {
      var d = FB_ENEMY_DEFS[type] || FB_ENEMY_DEFS.snow;
      var colors = { snow: 0xdfe8f2, bandit: 0x4a3a28, fox: 0xc98a3c, boss: 0x8a6d1f };
      var ch = this._fbChar({
        name: d.name, kind: type === 'boss' ? 'boss' : (type === 'fox' ? 'elite' : 'enemy'),
        robe: colors[type], skin: 0xffffff, weapon: type === 'boss' ? 'spear' : null,
        maxHp: d.hp, maxMp: 0, atk: d.atk, speed: d.speed,
        range: type === 'boss' ? 1.8 : 1.3, attackInterval: type === 'boss' ? 1.4 : 1.1,
        xp: d.xp, gold: d.gold, x: x, z: z,
        height: type === 'boss' ? 4.2 : 2.0
      });
      ch.group.scale.set(type === 'boss' ? 1.9 : type === 'fox' ? 1.35 : 1, type === 'boss' ? 1.9 : type === 'fox' ? 1.35 : 1, type === 'boss' ? 1.9 : type === 'fox' ? 1.35 : 1);
      return ch;
    },

    get leader() { return this.party[this.leaderIndex] || this.party[0] || null; },

    /* ================= INPUT ================= */
    _bindInput: function () {
      var self = this;
      this._on(window, 'keydown', function (e) {
        if (!self._running || self._over) return;
        self._keys[e.code] = true;
        if (e.code === 'Space') { e.preventDefault(); self.jump(); }
        else if (e.code === 'KeyJ') self.attack();
        else if (e.code === 'Digit1') self.castSkill(0);
        else if (e.code === 'Digit2') self.castSkill(1);
        else if (e.code === 'Digit3') self.castSkill(2);
        else if (e.code === 'Digit4') self.castSkill(3);
        else if (e.code === 'Digit5') self.castSkill(4);
        else if (e.code === 'Digit6') self.castSkill(5);
        else if (e.code === 'KeyQ') self.castSkill('ult');
        else if (e.code === 'KeyE') self._talkNearNPC();
      });
      this._on(window, 'keyup', function (e) { self._keys[e.code] = false; });
      this._on(window, 'blur', function () { self._keys = {}; });

      var canvas = this._renderer.domElement;
      this._on(canvas, 'pointerdown', function (e) {
        if (!self._running || self._over) return;
        if (self._audio) { self._audio.init(); self._audio.resume(); }
        self._pick(e.clientX, e.clientY);
      });
      this._on(canvas, 'wheel', function (e) {
        e.preventDefault();
        var Cam = mod('Camera');
        if (self._useRealCamera && Cam && has(Cam, 'setDistance')) {
          try {
            var cur = (typeof Cam.getDistance === 'function') ? Cam.getDistance() : 24;
            Cam.setDistance(clamp(cur * (e.deltaY < 0 ? 0.88 : 1.14), 14, 40));
          } catch (err) { /* bỏ qua */ }
        } else {
          self._camDist = clamp((self._camDist || 24) * (e.deltaY < 0 ? 0.88 : 1.14), 13, 34);
        }
      }, { passive: false });
    },

    _pick: function (sx, sy) {
      var rect = this._renderer.domElement.getBoundingClientRect();
      var ndc = new THREE.Vector2(
        ((sx - rect.left) / rect.width) * 2 - 1,
        -((sy - rect.top) / rect.height) * 2 + 1
      );
      var ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this._camera);
      var groups = [];
      this.enemies.forEach(function (e) { if (e.alive && e.group) groups.push(e.group); });
      this.npcs.forEach(function (n) { if (n.group) groups.push(n.group); });
      var hits = ray.intersectObjects(groups, true);
      if (hits.length) {
        var ch = hits[0].object.userData.char;
        if (ch) {
          if (ch.kind === 'npc' || ch.isNPC) {
            if (dist2(this.leader.position.x, this.leader.position.z, ch.position.x, ch.position.z) < NPC_TALK_RANGE) {
              this._talkToNPC(ch);
            } else {
              this.moveTarget = { x: ch.position.x, z: ch.position.z, npc: ch };
              this._toast('Đang tới chỗ ' + ch.name + '...');
            }
            return;
          }
          this.target = ch;
          this.moveTarget = null;
          this.attack();
          return;
        }
      }
      var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      var pt = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, pt)) {
        this.moveTarget = { x: pt.x, z: pt.z };
        this.target = null;
      }
    },

    _talkNearNPC: function () {
      var L = this.leader;
      if (!L) return;
      var best = null, bd = NPC_TALK_RANGE;
      this.npcs.forEach(function (n) {
        var d = dist2(L.position.x, L.position.z, n.position.x, n.position.z);
        if (d < bd) { bd = d; best = n; }
      });
      if (best) this._talkToNPC(best);
    },

    _talkToNPC: function (npc) {
      var res = null;
      if (this._quests && has(this._quests, 'talkToNPC')) {
        try { res = this._quests.talkToNPC(npc.npcId || npc.name); } catch (e) { res = null; }
      }
      if (!res) {
        res = { npcName: npc.name, dialog: 'Đường lên Tuyết Sơn hiểm trở, cứ theo nhiệm vụ mà làm.', action: 'none' };
      }
      if (this._hud) {
        this._hud.showDialog(res.npcName || npc.name, res.dialog);
        if (res.action === 'accept') { this._hud.log('Nhận nhiệm vụ: ' + (res.quest && res.quest.title), 'quest'); this._sfx('quest'); }
        else if (res.action === 'turnin') {
          this._hud.log('Hoàn thành nhiệm vụ: ' + (res.quest && res.quest.title), 'quest');
          if (this._quests) this._quests.claimReward(res.quest.id);
        } else this._sfx('click');
      }
      this.emit('quest', { npc: npc.npcId || npc.name, action: res.action, quest: res.quest || null });
    },

    _applyReward: function (reward) {
      if (!reward) return;
      if (reward.gold) this._addGold(reward.gold);
      if (reward.xp) this.gainXp(reward.xp);
      if (reward.atkBonus) {
        this.party.forEach(function (p) { p.atk += reward.atkBonus; });
      }
      if (this._hud) {
        this._hud.log('Thưởng nhiệm vụ "' + (reward.title || '') + '": ' +
          (reward.item || '') + (reward.gold ? ' +' + reward.gold + ' vàng' : '') +
          (reward.xp ? ' +' + reward.xp + ' XP' : ''), 'gold');
        this._hud.banner('✅ NHIỆM VỤ HOÀN THÀNH!', reward.title || '');
      }
      this._sfx('quest');
      if (reward.victory) this._victory();
    },

    _addGold: function (n) {
      var Inv = mod('Inventory');
      if (Inv && has(Inv, 'addGold')) {
        try { this.gold = Inv.addGold(n); return; } catch (e) { /* fallback */ }
      }
      this.gold += n;
    },

    _sfx: function (name) {
      if (this._audio && has(this._audio, 'playSfx')) {
        try { this._audio.playSfx(name); } catch (e) { /* bỏ qua */ }
      }
    },

    _toast: function (msg) { if (this._hud) this._hud.toast(msg); },

    _shake: function (amp, dur) {
      var Cam = mod('Camera');
      if (this._useRealCamera && Cam && has(Cam, 'shake')) {
        try { Cam.shake(amp || 0.3, dur || 0.3); return; } catch (e) { /* fallback */ }
      }
      this._shakeAmp = Math.max(this._shakeAmp || 0, amp || 0.3);
    },

    /* ================= LOOP ================= */
    start: function () {
      if (!this._inited || this._running) return false;
      this._running = true;
      this._paused = false;
      this._over = false;
      this._lastT = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      var self = this;
      var Cam = mod('Camera');
      if (this._useRealCamera && Cam && has(Cam, 'snap') && this.leader) {
        try { Cam.snap(this.leader.position); } catch (e) { /* bỏ qua */ }
      }
      function loop(t) {
        if (!self._running) return;
        self._raf = requestAnimationFrame(loop);
        var now = t || ((typeof performance !== 'undefined') ? performance.now() : Date.now());
        var dt = Math.min((now - self._lastT) / 1000, 0.05);
        self._lastT = now;
        if (!self._paused && !self._over) {
          self._time += dt;
          self.update(dt);
        }
        if (self._renderer && self._scene && self._camera) {
          self._renderer.render(self._scene, self._camera);
        }
      }
      this._raf = requestAnimationFrame(loop);
      if (this._hud) this._hud.banner('❄ TRƯỜNG BẠCH 3D ❄', 'Nói chuyện với Trưởng Lão để nhận nhiệm vụ!');
      return true;
    },

    stop: function () {
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
    },

    pause: function () { this._paused = true; },
    resume: function () {
      this._paused = false;
      if (this._audio) this._audio.resume();
      this._lastT = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    },

    update: function (dt) {
      if (!this._inited) return;
      var L = this.leader;
      if (!L || !L.alive) return;
      var self = this;

      /* ---- leader di chuyển: joystick > WASD > click-to-move ---- */
      var mv = this._readMove();
      var moving = false;
      if (mv.x !== 0 || mv.z !== 0) {
        moving = this._tryMove(L, mv.x, mv.z, dt * (mv.mag || 1));
        this.moveTarget = null;
      } else if (this.moveTarget) {
        var d = dist2(L.position.x, L.position.z, this.moveTarget.x, this.moveTarget.z);
        if (d > 0.8) {
          moving = this._tryMove(L, (this.moveTarget.x - L.position.x) / d, (this.moveTarget.z - L.position.z) / d, dt);
        } else {
          if (this.moveTarget.npc) this._talkToNPC(this.moveTarget.npc);
          this.moveTarget = null;
        }
      }
      /* nhảy: vật lý hop đơn giản */
      if (L.jumpV !== undefined && (L.jumpV > 0 || (L.jumpY || 0) > 0)) {
        L.jumpY = (L.jumpY || 0) + L.jumpV * dt;
        L.jumpV -= 22 * dt;
        if (L.jumpY <= 0) { L.jumpY = 0; L.jumpV = 0; }
        moving = true;
      }
      if (L.slowT > 0) L.slowT -= dt;

      /* ---- tự khóa mục tiêu + đánh thường khi đủ tầm ---- */
      if (!this.target || !this.target.alive) this.target = this._nearestEnemy(L, AUTO_TARGET_RANGE);
      if (this.target && this.target.alive) {
        var td = dist2(L.position.x, L.position.z, this.target.position.x, this.target.position.z);
        if (td <= (L.range || 1.6)) this.attack();
        else if (mv.x === 0 && mv.z === 0 && !this.moveTarget) {
          moving = this._tryMove(L, (this.target.position.x - L.position.x) / td, (this.target.position.z - L.position.z) / td, dt);
        }
      }
      this._animateChar(L, dt, moving);

      /* ---- follower AI (module Party thật, hoặc fallback) ---- */
      var Party = mod('Party');
      var aliveEnemies = this.enemies.filter(function (e) { return e.alive; });
      if (Party && has(Party, 'update')) {
        try {
          Party.update(dt, L.position, { enemies: aliveEnemies, leaderAttacking: !!this.target });
        } catch (e) { this._fallbackFollowers(dt, aliveEnemies); }
      } else {
        this._fallbackFollowers(dt, aliveEnemies);
      }

      /* ---- quái + boss AI (module Enemies thật, hoặc fallback) ---- */
      var Enemies = mod('Enemies');
      if (Enemies && has(Enemies, 'update')) {
        try {
          Enemies.update(dt, L.position, { party: this.party, leader: L, scene: this._scene });
        } catch (e) { this._fallbackEnemies(dt); }
      } else {
        this._fallbackEnemies(dt);
      }
      this._respawnEnemies(dt);

      /* ---- NPC đứng yên ---- */
      for (var n = 0; n < this.npcs.length; n++) this._animateChar(this.npcs[n], dt, false);

      /* ---- cooldowns / hiệu ứng skill / combat tick ---- */
      var Skills = mod('Skills');
      if (Skills && has(Skills, 'update')) {
        try { Skills.update(dt, this._scene); } catch (e) { /* bỏ qua */ }
      } else {
        for (var ci in this._cds) if (this._cds[ci] > 0) this._cds[ci] -= dt;
        if (this._ultCd > 0) this._ultCd -= dt;
      }
      var Combat = mod('Combat');
      if (Combat && has(Combat, 'update')) {
        try { Combat.update(dt); } catch (e) { /* bỏ qua */ }
      } else {
        this.party.forEach(function (p) { if (p.attackCd > 0) p.attackCd -= dt; });
        this.enemies.forEach(function (e) { if (e.attackCd > 0) e.attackCd -= dt; });
      }

      /* ---- hồi MP + combo ---- */
      this.party.forEach(function (p) {
        if (p.alive) p.mp = Math.min(p.maxMp, (p.mp || 0) + 7 * dt);
      });
      if (this._comboTimer > 0) {
        this._comboTimer -= dt;
        if (this._comboTimer <= 0) this.combo = 0;
      }

      /* ---- tuyết rơi ---- */
      var World = mod('World');
      if (World && has(World, 'update')) {
        try { World.update(dt); } catch (e) { this._updateSnow(dt); }
      } else this._updateSnow(dt);

      /* ---- portal: tự vào/ra dungeon khi đi tới gần ---- */
      if (this._portalCd > 0) this._portalCd -= dt;
      var Dungeon = mod('Dungeon');
      if (Dungeon && this._portalCd <= 0) {
        try {
          if (!this._inDungeon && has(Dungeon, 'isNearPortal') && Dungeon.isNearPortal(L.position)) {
            this.enterDungeon();
            this._portalCd = 3;
          } else if (this._inDungeon && has(Dungeon, 'getExitPoint')) {
            var ep = Dungeon.getExitPoint();
            if (ep && dist2(L.position.x, L.position.z, ep.x, ep.z) < 3) {
              this.exitDungeon();
              this._portalCd = 3;
            }
          }
        } catch (e) { /* bỏ qua */ }
      }
      if (Dungeon && has(Dungeon, 'update')) {
        try { Dungeon.update(dt); } catch (e) { /* bỏ qua */ }
      }

      /* ---- thua khi cả đội gục ---- */
      if (Party && has(Party, 'allDead')) {
        try { if (Party.allDead()) { this._gameOver(false); return; } } catch (e) { /* bỏ qua */ }
      } else if (this.party.length && this.party.every(function (p) { return !p.alive; })) {
        this._gameOver(false);
        return;
      }

      /* ---- camera follow ---- */
      var Cam = mod('Camera');
      if (this._useRealCamera && Cam && has(Cam, 'follow')) {
        try { Cam.follow(L.position, dt); } catch (e) { this._updateCamera(dt); }
        if (has(Cam, 'update')) { try { Cam.update(dt); } catch (e) { /* bỏ qua */ } }
      } else {
        this._updateCamera(dt);
      }

      /* ---- HUD 10 lần/giây (minimap tự throttle 4 lần/giây bên trong HUD) ---- */
      if (this._time - this._lastUI > 0.1) {
        this._lastUI = this._time;
        if (this._hud) this._hud.update(this.getState());
      }
    },

    /* Đọc hướng di chuyển theo yaw camera:
       right = (cos yaw, -sin yaw), down = (sin yaw, cos yaw) trong (x, z).
       yaw -45° (WuxiaCamera): dx=(sx-sy)/√2, dz=(sx+sy)/√2.
       yaw +45° (fallback camera kiểu bản gốc): dx=(sx+sy)/√2, dz=(sy-sx)/√2. */
    _readMove: function () {
      var sx = 0, sy = 0;
      var K = this._keys;
      if (K.KeyW || K.ArrowUp) sy -= 1;
      if (K.KeyS || K.ArrowDown) sy += 1;
      if (K.KeyA || K.ArrowLeft) sx -= 1;
      if (K.KeyD || K.ArrowRight) sx += 1;
      if (sx !== 0 || sy !== 0) {
        var yaw = this._camYaw, c = Math.cos(yaw), s = Math.sin(yaw);
        var dx = sx * c + sy * s, dz = -sx * s + sy * c;
        var len = Math.hypot(dx, dz) || 1;
        return { x: dx / len, z: dz / len };
      }
      if (this._joy && this._joy.active && (this._joy.x !== 0 || this._joy.y !== 0)) {
        var jx = this._joy.x, jy = this._joy.y;
        var yaw2 = this._camYaw, c2 = Math.cos(yaw2), s2 = Math.sin(yaw2);
        var dx2 = jx * c2 + jy * s2, dz2 = -jx * s2 + jy * c2;
        var l2 = Math.hypot(dx2, dz2) || 1;
        return { x: dx2 / l2, z: dz2 / l2, mag: Math.min(1, Math.hypot(jx, jy)) };
      }
      return { x: 0, z: 0 };
    },

    _tryMove: function (ch, dx, dz, dt) {
      var sp = ch.speed * (ch.slowT > 0 ? 0.55 : 1);
      var nx = ch.position.x + dx * sp * dt;
      var nz = ch.position.z + dz * sp * dt;
      if (!this._isBlocked(nx, ch.position.z)) ch.position.x = nx;
      if (!this._isBlocked(ch.position.x, nz)) ch.position.z = nz;
      ch.position.x = clamp(ch.position.x, -MAP * TILE / 2 + 2, MAP * TILE / 2 - 2);
      ch.position.z = clamp(ch.position.z, -MAP * TILE / 2 + 2, MAP * TILE / 2 - 2);
      if (dx !== 0 || dz !== 0) ch.facing = Math.atan2(dx, dz);
      if (ch.group) {
        ch.group.position.x = ch.position.x;
        ch.group.position.z = ch.position.z;
        ch.group.rotation.y = ch.facing;
      }
      return (dx !== 0 || dz !== 0);
    },

    _animateChar: function (ch, dt, moving) {
      var Chars = mod('Characters');
      if (Chars && has(Chars, 'animate')) {
        try { Chars.animate(ch, dt, moving); } catch (e) { /* bỏ qua */ }
      } else if (ch.group) {
        if (moving) {
          ch.walkPhase = (ch.walkPhase || 0) + dt * 10;
          ch.group.position.y = Math.abs(Math.cos(ch.walkPhase)) * 0.06;
        } else {
          ch.group.position.y = 0;
        }
        ch.group.position.x = ch.position.x;
        ch.group.position.z = ch.position.z;
        ch.group.rotation.y = ch.facing || 0;
      }
      /* nhảy: cộng độ cao sau animate (animate tự reset y về 0/bob). */
      if (ch.group && (ch.jumpY || 0) > 0) ch.group.position.y += ch.jumpY;
    },

    _nearestEnemy: function (from, range) {
      var Combat = mod('Combat');
      var alive = this.enemies.filter(function (e) { return e.alive; });
      if (Combat && has(Combat, 'findNearest')) {
        try {
          var found = Combat.findNearest(from.position, alive, range);
          if (found) return found;
        } catch (e) { /* fallback */ }
      }
      var best = null, bd = range;
      for (var i = 0; i < alive.length; i++) {
        var e = alive[i];
        var d = dist2(from.position.x, from.position.z, e.position.x, e.position.z);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },

    /* [FB] follower AI khi WuxiaParty chưa có. */
    _fallbackFollowers: function (dt, aliveEnemies) {
      var L = this.leader;
      if (!L) return;
      var self = this;
      var offsets = [{ x: -2.4, z: 1.6 }, { x: 2.4, z: 1.6 }];
      for (var i = 1; i < this.party.length; i++) {
        var m = this.party[i];
        if (!m.alive) { this._revivePartyMember(m, dt); continue; }
        if (m.slowT > 0) m.slowT -= dt;
        var foe = this._nearestEnemy(m, 9);
        var moving = false;
        if (foe) {
          var fd = dist2(m.position.x, m.position.z, foe.position.x, foe.position.z);
          if (fd <= (m.range || 1.5)) this._fbAttack(m, foe);
          else moving = this._tryMove(m, (foe.position.x - m.position.x) / fd, (foe.position.z - m.position.z) / fd, dt);
        } else {
          var ox = L.position.x + offsets[i - 1].x, oz = L.position.z + offsets[i - 1].z;
          var od = dist2(m.position.x, m.position.z, ox, oz);
          if (od > 18) { m.position.x = ox; m.position.z = oz; }
          else if (od > 1.2) moving = this._tryMove(m, (ox - m.position.x) / od, (oz - m.position.z) / od, dt);
        }
        this._animateChar(m, dt, moving);
      }
    },

    _revivePartyMember: function (m, dt) {
      m.respawnT = (m.respawnT || 8) - dt;
      if (m.group) m.group.visible = false;
      if (m.respawnT <= 0) {
        m.alive = true;
        m.hp = Math.floor(m.maxHp * 0.6);
        m.position.x = this.leader.position.x + rand(-2, 2);
        m.position.z = this.leader.position.z + rand(-2, 2);
        if (m.group) m.group.visible = true;
        this._toast(m.name + ' đã hồi sinh!');
        if (this._hud) this._hud.log(m.name + ' đã hồi sinh!', 'good');
      }
    },

    /* [FB] quái AI khi WuxiaEnemies chưa có. */
    _fallbackEnemies: function (dt) {
      var self = this;
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        if (e.frozenT > 0) { e.frozenT -= dt; self._animateChar(e, dt, false); return; }
        if (e.slowT > 0) e.slowT -= dt;
        if (e.attackCd > 0) e.attackCd -= dt;
        e.aiTimer = (e.aiTimer || 0) - dt;
        var foe = null, bd = e.isBoss ? 22 : 14;
        self.party.forEach(function (p) {
          if (!p.alive) return;
          var d = dist2(e.position.x, e.position.z, p.position.x, p.position.z);
          if (d < bd) { bd = d; foe = p; }
        });
        var moving = false;
        var homeD = dist2(e.position.x, e.position.z, e.home.x, e.home.z);
        if (foe && homeD < 36) {
          var fd = dist2(e.position.x, e.position.z, foe.position.x, foe.position.z);
          var range = e.range || 1.3;
          if (fd > range) {
            moving = self._tryMove(e, (foe.position.x - e.position.x) / fd, (foe.position.z - e.position.z) / fd, dt);
          } else if (e.attackCd <= 0) {
            e.attackCd = e.attackInterval || 1.1;
            e.swingT = 0.28;
            e.facing = Math.atan2(foe.position.x - e.position.x, foe.position.z - e.position.z);
            self._fbAttack(e, foe);
            if (e.isBoss) self._fbBossHit(e, foe);
          }
        } else {
          if (homeD > 36) {
            moving = self._tryMove(e, (e.home.x - e.position.x) / homeD, (e.home.z - e.position.z) / homeD, dt);
          } else {
            if (e.aiTimer <= 0) {
              e.aiTimer = rand(2, 4);
              e.wanderX = e.home.x + rand(-4, 4);
              e.wanderZ = e.home.z + rand(-4, 4);
            }
            if (e.wanderX !== undefined) {
              var wd = dist2(e.position.x, e.position.z, e.wanderX, e.wanderZ);
              if (wd > 0.8) moving = self._tryMove(e, (e.wanderX - e.position.x) / wd, (e.wanderZ - e.position.z) / wd, dt);
            }
          }
        }
        if (e.isBoss) self._fbBossUpdate(e, dt);
        self._animateChar(e, dt, moving);
        var Chars = mod('Characters');
        if (Chars && has(Chars, 'updateHpBar')) {
          try { Chars.updateHpBar(e); } catch (err) { /* bỏ qua */ }
        }
      });
    },

    /* [FB] boss cuồng nộ + slam — module Enemies thật đã có updateBoss riêng. */
    _fbBossUpdate: function (b, dt) {
      if (!b.enraged && b.hp < b.maxHp * 0.5) {
        b.enraged = true;
        b.atk = Math.floor(b.atk * 1.4);
        b.speed *= 1.3;
        if (this._hud) this._hud.banner('LONG NGÂM CUỒNG NỘ!', 'Boss tăng sức mạnh — cẩn thận đòn AoE!');
        this._sfx('boss');
        this._shake(0.5, 0.5);
        for (var s = 0; s < 2; s++) {
          var min = this._fbEnemy('snow', b.position.x + rand(-4, 4), b.position.z + rand(-4, 4));
          min.enemyType = 'snow';
          this._addToScene(min);
          this.enemies.push(min);
        }
      }
    },

    _fbBossHit: function (boss, foe) {
      boss.hitCount = (boss.hitCount || 0) + 1;
      if (boss.hitCount % 4 === 0) {
        this._shake(0.35, 0.3);
        this._sfx('skill');
        var self = this;
        this.party.forEach(function (p) {
          if (p.alive && dist2(p.position.x, p.position.z, boss.position.x, boss.position.z) < 6.4) {
            self._fbDealDamage(boss, p, Math.floor(boss.atk * 1.2), false, true);
          }
        });
      }
    },

    _respawnEnemies: function (dt) {
      if (this._won || this._over) return;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.alive) continue;
        e.respawnT = (e.respawnT || 0) - dt;
        if (e.respawnT > 0) continue;
        if (e.isBoss) {
          if (this._won) continue;
          e.alive = true; e.hp = e.maxHp;
          e.atk = FB_ENEMY_DEFS.boss.atk; e.speed = FB_ENEMY_DEFS.boss.speed;
          e.enraged = false;
          e.position.x = e.home.x; e.position.z = e.home.z;
          if (e.group) e.group.visible = true;
          this._toast('Long Ngâm Lão Tổ đã hồi sinh ở đấu trường!');
        } else {
          e.alive = true; e.hp = e.maxHp;
          e.position.x = e.home.x + rand(-2, 2);
          e.position.z = e.home.z + rand(-2, 2);
          if (e.group) e.group.visible = true;
        }
      }
    },

    _updateSnow: function (dt) {
      if (!this._snow) return;
      this._snowTime += dt;
      var p = this._snow.geometry.attributes.position.array;
      for (var i = 0; i < p.length; i += 3) {
        p[i + 1] -= this._snowVel[i / 3] * dt;
        p[i] += Math.sin(this._snowTime * 0.7 + i) * dt * 0.4;
        if (p[i + 1] < 0) {
          p[i + 1] = rand(22, 30);
          p[i] = rand(-56, 56);
          p[i + 2] = rand(-56, 56);
        }
      }
      this._snow.geometry.attributes.position.needsUpdate = true;
    },

    /* [FB] camera isometric follow khi WuxiaCamera chưa có. */
    _updateCamera: function (dt) {
      var L = this.leader;
      if (!L || !this._camera) return;
      var theta = Math.PI / 4, el = 0.62;
      var d = this._camDist || 24;
      var tx = L.position.x, tz = L.position.z;
      var cx = tx + Math.sin(theta) * Math.cos(el) * d;
      var cy = Math.sin(el) * d + 1;
      var cz = tz + Math.cos(theta) * Math.cos(el) * d;
      var shX = 0, shZ = 0;
      if (this._shakeAmp > 0) {
        this._shakeAmp = Math.max(0, this._shakeAmp - dt * 2);
        shX = rand(-1, 1) * this._shakeAmp;
        shZ = rand(-1, 1) * this._shakeAmp;
      }
      this._camera.position.set(cx + shX, cy, cz + shZ);
      this._camera.lookAt(tx, 1, tz);
    },

    _onResize: function () {
      if (!this._renderer || !this._camera || !this._container) return;
      var w = this._container.clientWidth || window.innerWidth;
      var h = this._container.clientHeight || window.innerHeight;
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
      this._renderer.setSize(w, h);
    },

    /* ================= COMBAT ================= */
    attack: function () {
      var L = this.leader;
      if (!L || !L.alive || this._over) return;
      var Combat = mod('Combat');
      if (Combat && has(Combat, 'attack')) {
        var foe = null;
        if (this.target && this.target.alive &&
            dist2(L.position.x, L.position.z, this.target.position.x, this.target.position.z) <= (L.range || 1.6)) {
          foe = this.target;
        }
        if (!foe) foe = this._nearestEnemy(L, L.range || 1.6);
        if (!foe) return;
        try { Combat.attack(L, foe); } catch (e) { /* bỏ qua */ }
        return;
      }
      this._fallback.combat = true;
      var foe2 = null;
      if (this.target && this.target.alive &&
          dist2(L.position.x, L.position.z, this.target.position.x, this.target.position.z) < 3.2) foe2 = this.target;
      if (!foe2) foe2 = this._nearestEnemy(L, 3);
      if (!foe2) return;
      this._fbAttack(L, foe2);
    },

    /* [FB] đánh thường khi WuxiaCombat chưa có. */
    _fbAttack: function (ch, foe) {
      if (!ch || !ch.alive || this._over) return;
      if (ch.attackCd > 0) return;
      if (dist2(ch.position.x, ch.position.z, foe.position.x, foe.position.z) > (ch.range || 1.5) + 0.2) return;
      ch.attackCd = ch.attackInterval || 0.85;
      ch.swingT = 0.28;
      ch.facing = Math.atan2(foe.position.x - ch.position.x, foe.position.z - ch.position.z);
      this._sfx('swing');
      this._fbDealDamage(ch, foe, ch.atk, false);
    },

    _fbDealDamage: function (atk, tgt, base, isSkill, noCrit) {
      if (!tgt || !tgt.alive) return 0;
      var crit = !noCrit && Math.random() < 0.15;
      var dmg = Math.max(1, Math.round(base * rand(0.85, 1.15) - (tgt.def || 0)));
      if (crit) dmg = Math.round(dmg * 1.8);
      tgt.hp -= dmg;
      this._showDmgNumber(tgt, dmg, crit, isSkill);
      if (tgt.kind === 'enemy' || tgt.kind === 'elite' || tgt.kind === 'boss') {
        this.combo++;
        this._comboTimer = 2.5;
      }
      if (tgt === this.leader) this._shake(0.12, 0.15);
      this.emit('damage', { from: atk && atk.name, to: tgt.name, dmg: dmg, crit: crit, skill: !!isSkill });
      if (tgt.hp <= 0) {
        tgt.hp = 0;
        tgt.alive = false;
        if (tgt.group) tgt.group.visible = false;
        this._sfx('death');
        this._onKill(tgt, atk);
      }
      return dmg;
    },

    _showDmgNumber: function (tgt, dmg, crit, isSkill, heal) {
      if (!this._hud || !tgt.position) return;
      var pt = this.projectWorldToScreen(tgt.position.x, tgt.height || 2, tgt.position.z);
      if (pt) this._hud.showDamage(dmg, { sx: pt.x, sy: pt.y }, { crit: crit, skill: !!isSkill, heal: !!heal });
    },

    /* Combat.onDamage: dmg, pos {x, z, y} đơn vị thế giới, opts {crit, skill, attacker, target}. */
    _onDamage: function (dmg, pos, opts) {
      opts = opts || {};
      if (this._hud && pos) {
        var pt = this.projectWorldToScreen(pos.x, pos.y || 2, pos.z);
        if (pt) this._hud.showDamage(dmg, { sx: pt.x, sy: pt.y }, { crit: opts.crit, skill: opts.skill });
      }
      if (opts.target && (opts.target.kind === 'hero')) {
        this._sfx('hit');
        if (opts.target === this.leader) this._shake(0.12, 0.15);
      }
      if (opts.target && (opts.target.kind === 'enemy' || opts.target.kind === 'elite' || opts.target.kind === 'boss')) {
        this.combo++;
        this._comboTimer = 2.5;
      }
      this.emit('damage', { from: opts.attacker && opts.attacker.name, to: opts.target && opts.target.name, dmg: dmg, crit: !!opts.crit, skill: !!opts.skill });
    },

    /* Combat.onKill(target, attacker) — trung tâm xử lý giết quái / gục hero. */
    _onKill: function (target, attacker) {
      if (!target) return;
      if (target.kind === 'enemy' || target.kind === 'elite' || target.kind === 'boss') {
        this.kills++;
        var isBoss = !!target.isBoss;
        var gold = target.gold || 0;
        if (gold > 0) {
          this._addGold(gold);
          if (this._hud) this._hud.log('+' + gold + ' vàng (' + target.name + ')', 'gold');
        }
        if (target.xp) this.gainXp(target.xp);
        var qkind = isBoss ? 'boss' : (target.enemyType || (target.kind === 'elite' ? 'elite' : 'snow'));
        if (this._quests && has(this._quests, 'onKill')) {
          try {
            var q = this._quests.onKill(qkind);
            if (q && q.status === 'complete' && this._hud) {
              this._hud.log('Nhiệm vụ "' + q.title + '" xong — gặp ' + q.npcName + ' để nhận thưởng!', 'quest');
              this._hud.banner('✅ NHIỆM VỤ XONG!', 'Gặp ' + q.npcName + ' để nhận thưởng.');
            }
          } catch (e) { /* bỏ qua */ }
        }
        this.emit('kill', { name: target.name, type: qkind, isBoss: isBoss });
        if (isBoss) {
          this.bossKills++;
          this._onBossDeath(target);
        } else {
          target.respawnT = target.isElite ? 30 : 12;
        }
        if (this.target === target) this.target = null;
      } else if (target.kind === 'hero') {
        target.respawnT = 8;
        this._toast(target.name + ' đã gục — sẽ hồi sinh sau 8s!');
        if (this._hud) this._hud.log(target.name + ' đã gục!', 'bad');
      }
    },

    _onBossDeath: function (boss) {
      if (this._won) return;
      if (boss) boss.respawnT = 60;
      this.emit('boss-death', { name: boss ? boss.name : 'Long Ngâm Lão Tổ' });
      if (this._hud) this._hud.hideBoss();
      if (this._quests && has(this._quests, 'isComplete') && has(this._quests, 'claimReward')) {
        try {
          if (this._quests.isComplete('q3')) {
            var reward = this._quests.claimReward('q3');
            if (reward) return; /* _applyReward -> victory */
          }
        } catch (e) { /* bỏ qua */ }
      }
      this._victory();
    },

    /* ================= SKILL ================= */
    /* id: 0-5 (index) hoặc skill id string, hoặc 'ult'. */
    castSkill: function (id) {
      var L = this.leader;
      if (!L || !L.alive || this._over) return false;
      var Skills = mod('Skills');
      var aliveEnemies = this.enemies.filter(function (e) { return e.alive; });
      var world = { scene: this._scene, enemies: aliveEnemies };
      if (Skills && has(Skills, 'cast')) {
        try {
          var res;
          if (id === 'ult') {
            if (!has(Skills, 'castUlt')) return false;
            res = Skills.castUlt(L, aliveEnemies, world);
          } else {
            res = Skills.cast(id, L, aliveEnemies, world);
          }
          if (res && res.ok) {
            this._sfx(id === 'ult' ? 'ult' : 'skill');
            if (id === 'ult') {
              this._shake(0.6, 0.5);
              if (this._hud) this._hud.banner('THẦN LONG GIÁNG THẾ!', 'Tuyệt kỹ võ lâm chấn động Trường Bạch!');
            }
            return true;
          }
          if (res) this._skillFailToast(res);
          return false;
        } catch (e) { /* rơi xuống fallback */ }
      }
      return this._fbCastSkill(id, L, aliveEnemies);
    },

    _skillFailToast: function (res) {
      if (res.reason === 'cooldown') this._toast('Chiêu đang hồi (' + (res.remain || '') + 's)...');
      else if (res.reason === 'not-enough-mp') this._toast('Không đủ MP! (cần ' + res.need + ', có ' + res.have + ')');
      else if (res.reason === 'not-enough-rage') this._toast('Chưa đủ nộ! (' + (res.have || 0) + '/100 — đánh quái để tích nộ)');
      else if (res.reason === 'no-target-in-range') this._toast('Không có quái trong tầm!');
      else if (res.reason === 'frozen') this._toast('Đang bị đóng băng!');
    },

    /* [FB] skill khi WuxiaSkills chưa có. */
    _fbCastSkill: function (id, L, aliveEnemies) {
      this._fallback.skills = true;
      var self = this;
      if (id === 'ult') {
        if (this._ultCd > 0) { this._toast('Tuyệt kỹ đang hồi...'); return false; }
        if ((L.mp || 0) < FB_ULT.mpCost) { this._toast('Không đủ MP cho Tuyệt Kỹ!'); return false; }
        L.mp -= FB_ULT.mpCost;
        this._ultCd = FB_ULT.cooldown;
        this._sfx('ult');
        this._shake(0.6, 0.5);
        var base = 120 + this.level * 10;
        aliveEnemies.forEach(function (e) {
          if (dist2(e.position.x, e.position.z, L.position.x, L.position.z) < 16) {
            self._fbDealDamage(L, e, base, true);
          }
        });
        if (this._hud) this._hud.banner('THẦN LONG GIÁNG THẾ!', 'Tuyệt kỹ võ lâm chấn động Trường Bạch!');
        return true;
      }
      var idx = (typeof id === 'number') ? id : FB_SKILLS.findIndex(function (s) { return s.id === id; });
      var def = FB_SKILLS[idx];
      if (!def) return false;
      if ((this._cds[def.id] || 0) > 0) return false;
      if ((L.mp || 0) < def.mpCost) { this._toast('Không đủ MP!'); return false; }
      L.mp -= def.mpCost;
      this._cds[def.id] = def.cooldown;
      this._sfx('skill');
      var baseDmg = 40 + this.level * 6;
      var tgt = (this.target && this.target.alive) ? this.target : this._nearestEnemy(L, 18);
      var tx = tgt ? tgt.position.x : L.position.x + Math.sin(L.facing || 0) * 4;
      var tz = tgt ? tgt.position.z : L.position.z + Math.cos(L.facing || 0) * 4;
      if (def.id === 'swordwind') {
        if (tgt) this._fbDealDamage(L, tgt, baseDmg, true);
      } else if (def.id === 'firepalm') {
        this._sfx('fire');
        this._shake(0.25, 0.3);
        this._fbAoe(tx, tz, 8, baseDmg + 25, L, false);
      } else if (def.id === 'icefreeze') {
        this._sfx('ice');
        this._fbAoe(tx, tz, 7, baseDmg + 5, L, true);
      } else if (def.id === 'thunder') {
        this._sfx('thunder');
        var foes = aliveEnemies.filter(function (e) {
          return dist2(e.position.x, e.position.z, L.position.x, L.position.z) < 18;
        });
        if (!foes.length) { this._toast('Không có quái trong tầm sét!'); return true; }
        for (var k = 0; k < Math.min(5, foes.length); k++) {
          var f = foes[Math.floor(Math.random() * foes.length)];
          this._fbDealDamage(L, f, baseDmg + 10, true);
        }
      } else if (def.id === 'heal') {
        this._sfx('heal');
        this.party.forEach(function (p) {
          if (!p.alive) return;
          var h = Math.floor(p.maxHp * 0.35);
          p.hp = Math.min(p.maxHp, p.hp + h);
          self._showDmgNumber(p, h, false, false, true);
        });
      } else if (def.id === 'dragonbreak') {
        this._shake(0.2, 0.3);
        this._fbAoe(L.position.x, L.position.z, 12, baseDmg + 15, L, false);
      }
      return true;
    },

    _fbAoe: function (x, z, r, dmg, src, slow) {
      var self = this;
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        if (dist2(e.position.x, e.position.z, x, z) <= r) {
          self._fbDealDamage(src, e, dmg, true);
          if (slow && e.alive) e.slowT = 3;
        }
      });
    },

    jump: function () {
      var L = this.leader;
      if (!L || !L.alive || this._over) return;
      if ((L.jumpY || 0) > 0 || (L.jumpV || 0) > 0) return;
      L.jumpV = 7;
      L.jumpY = 0.01;
      this._sfx('swing');
    },

    usePotion: function () {
      var L = this.leader;
      if (!L || !L.alive) return false;
      var Inv = mod('Inventory');
      if (Inv && has(Inv, 'usePotion')) {
        try {
          var res = Inv.usePotion('hp', L);
          if (res && res.ok) {
            this._sfx('heal');
            this._showDmgNumber(L, res.healed || 0, false, false, true);
            if (this._hud) this._hud.log('Uống thuốc: +' + (res.healed || 0) + ' HP', 'good');
            return true;
          }
          if (res) {
            if (res.reason === 'no-potion') this._toast('Hết thuốc rồi! Giết quái để nhặt thêm.');
            else if (res.reason === 'already-full') this._toast('HP đã đầy!');
            else if (res.reason === 'cooldown') this._toast('Thuốc đang hồi (' + (res.remain || '') + 's)...');
          }
          return false;
        } catch (e) { /* rơi xuống fallback */ }
      }
      /* [FB] potion đếm tay. */
      if (this.potions <= 0) { this._toast('Hết thuốc rồi! Giết quái để nhặt thêm.'); return false; }
      if (L.hp >= L.maxHp) { this._toast('HP đã đầy!'); return false; }
      this.potions--;
      var heal = Math.floor(L.maxHp * 0.4);
      L.hp = Math.min(L.maxHp, L.hp + heal);
      this._sfx('heal');
      this._showDmgNumber(L, heal, false, false, true);
      if (this._hud) this._hud.log('Uống thuốc: +' + heal + ' HP (còn ' + this.potions + ')', 'good');
      return true;
    },

    openInventory: function () {
      var Inv = mod('Inventory');
      var msg = '';
      if (Inv) {
        try {
          var gold = has(Inv, 'getGold') ? Inv.getGold() : this.gold;
          var potions = has(Inv, 'count') ? Inv.count('potion-hp') : this.potions;
          var items = has(Inv, 'getItems') ? Inv.getItems() : [];
          msg = '🎒 Túi đồ: ' + gold + ' vàng · ' + potions + ' thuốc HP · ' + items.length + ' loại vật phẩm.';
        } catch (e) { msg = ''; }
      }
      if (!msg) msg = '🎒 Túi đồ: ' + this.potions + ' thuốc HP · ' + this.gold + ' vàng.';
      this._toast(msg + ' (Mở túi đầy đủ: nhóm Inventory sẽ gắn UI sau.)');
    },

    /* ================= HERO / DUNGEON / VICTORY ================= */
    setHero: function (i) {
      if (i < 0 || i >= this.party.length) return false;
      if (!this.party[i].alive) { this._toast(this.party[i].name + ' đang gục, chưa đổi được!'); return false; }
      var Party = mod('Party');
      if (Party && has(Party, 'switchTo')) {
        try {
          var next = Party.switchTo(i);
          if (!next) return false;
        } catch (e) { /* vẫn đổi leaderIndex */ }
      }
      this.leaderIndex = i;
      this.target = null;
      this._sfx('click');
      return true;
    },

    enterDungeon: function () {
      var L = this.leader;
      if (!L) return false;
      var Dungeon = mod('Dungeon');
      var center = null, bossPos = null;
      if (Dungeon) {
        try {
          if (has(Dungeon, 'enter')) Dungeon.enter();
          if (has(Dungeon, 'getArenaCenter')) center = Dungeon.getArenaCenter();
          if (has(Dungeon, 'getBossSpawn')) bossPos = Dungeon.getBossSpawn();
          if (has(Dungeon, 'getExitPoint') && center) {
            /* vào từ cửa phía nam arena */
            var ep = Dungeon.getExitPoint();
            if (ep) center = { x: ep.x, z: ep.z };
          }
        } catch (e) { /* bỏ qua */ }
      }
      this._inDungeon = true;
      var at = center || { x: wX(50), z: wZ(30) };
      this._teleportParty(at.x, at.z);
      if (this.boss && !this.boss.alive) this._respawnBossNow(bossPos);
      if (this._hud) {
        this._hud.banner('🐉 HANG LONG NGÂM 🐉', 'Hạ Long Ngâm Lão Tổ để hoàn thành Quan Ải!');
        this._hud.log('Đã vào dungeon — Boss Long Ngâm đang chờ...', 'bad');
        if (this.boss && this.boss.alive) this._hud.showBoss(this.boss.name, this.boss.hp, this.boss.maxHp);
      }
      this._sfx('boss');
      var Cam = mod('Camera');
      if (this._useRealCamera && Cam && has(Cam, 'snap')) {
        try { Cam.snap(L.position); } catch (e) { /* bỏ qua */ }
      }
      return true;
    },

    exitDungeon: function () {
      var L = this.leader;
      if (!L) return false;
      var Dungeon = mod('Dungeon');
      if (Dungeon && has(Dungeon, 'exit')) {
        try { Dungeon.exit(); } catch (e) { /* bỏ qua */ }
      }
      this._inDungeon = false;
      var sp = this._townSpawn || { x: wX(28), z: wZ(40) };
      this._teleportParty(sp.x, sp.z);
      if (this._hud) this._hud.hideBoss();
      var Cam = mod('Camera');
      if (this._useRealCamera && Cam && has(Cam, 'snap')) {
        try { Cam.snap(L.position); } catch (e) { /* bỏ qua */ }
      }
      return true;
    },

    _teleportParty: function (x, z) {
      var self = this;
      this.party.forEach(function (p, i) {
        if (!p.alive) return;
        p.position.x = x + (i - 1) * 2.4;
        p.position.z = z + 2;
        if (p.group) {
          p.group.position.x = p.position.x;
          p.group.position.z = p.position.z;
        }
      });
      this.moveTarget = null;
      this.target = null;
    },

    _respawnBossNow: function (bossPos) {
      var b = this.boss;
      if (!b) return;
      b.alive = true;
      b.hp = b.maxHp;
      b.enraged = false;
      if (b.baseAtk) b.atk = b.baseAtk;
      if (b.baseSpeed) b.speed = b.baseSpeed;
      if (bossPos) { b.position.x = bossPos.x; b.position.z = bossPos.z; }
      else { b.position.x = b.home.x; b.position.z = b.home.z; }
      if (b.group) {
        b.group.visible = true;
        b.group.position.x = b.position.x;
        b.group.position.z = b.position.z;
      }
    },

    _victory: function () {
      if (this._won) return;
      this._won = true;
      this._over = true;
      this.emit('victory', { level: this.level, kills: this.kills, gold: this.gold });
      this._sfx('victory');
      if (this._hud) {
        this._hud.showVictory('Quan Ải Long Ngâm hoàn thành — Trường Bạch lại yên bình! ' +
          'Cấp ' + this.level + ' · Diệt ' + this.kills + ' quái · ' + this.gold + ' vàng.');
      }
      this.save();
    },

    _gameOver: function (victory) {
      if (this._over) return;
      this._over = true;
      this.emit(victory ? 'victory' : 'defeat', { level: this.level, kills: this.kills, gold: this.gold });
      if (this._hud && !victory) {
        this._hud.showDialog('💀 ĐỘI ĐÃ GỤC NGÃ', 'Long Ngâm vẫn ngự trị Tuyết Sơn... Hãy thử lại!');
      }
      this._sfx('death');
    },

    restart: function () {
      var self = this;
      this.party.forEach(function (p) {
        p.alive = true; p.hp = p.maxHp; p.mp = p.maxMp;
        if (p.group) p.group.visible = true;
      });
      this.enemies.forEach(function (e) {
        e.alive = true; e.hp = e.maxHp;
        e.position.x = e.home.x; e.position.z = e.home.z;
        if (e.isBoss) { e.enraged = false; if (e.baseAtk) e.atk = e.baseAtk; if (e.baseSpeed) e.speed = e.baseSpeed; }
        if (e.group) e.group.visible = true;
      });
      var sp = this._townSpawn || { x: wX(28), z: wZ(40) };
      this._teleportParty(sp.x, sp.z);
      this._over = false;
      this._won = false;
      this._inDungeon = false;
      this.gold = 0; this.kills = 0; this.combo = 0;
      var Dungeon = mod('Dungeon');
      if (Dungeon && has(Dungeon, 'exit')) {
        try { Dungeon.exit(); } catch (e) { /* bỏ qua */ }
      }
      if (this._hud) this._hud.hideVictory();
      this.save();
    },

    /* ================= XP / LEVEL ================= */
    gainXp: function (n) {
      var Party = mod('Party');
      if (Party && has(Party, 'addXP')) {
        try {
          var events = Party.addXP(n);
          if (events && events.length) {
            this.level = events[events.length - 1].level || this.level;
            if (has(Party, 'getXp')) {
              try { this.xp = Party.getXp(); } catch (e) { /* bỏ qua */ }
            }
            if (has(Party, 'getLevel')) {
              try { this.level = Party.getLevel(); } catch (e) { /* bỏ qua */ }
            }
          } else {
            if (has(Party, 'getXp')) { try { this.xp = Party.getXp(); } catch (e) { /* bỏ qua */ } }
          }
          return;
        } catch (e) { /* rơi xuống fallback */ }
      }
      /* [FB] XP nội bộ khi Party chưa có. */
      this.xp += n;
      while (this.xp >= this.xpNeed) {
        this.xp -= this.xpNeed;
        this.level++;
        this.xpNeed = Math.floor(100 * Math.pow(1.35, this.level - 1));
        var self = this;
        this.party.forEach(function (p) {
          p.level = self.level;
          p.maxHp = Math.floor(p.maxHp * 1.12);
          p.atk = Math.floor(p.atk * 1.1);
          p.hp = p.maxHp; p.mp = p.maxMp;
        });
        this._sfx('levelup');
        if (this._hud) this._hud.banner('⭐ LÊN CẤP ' + this.level + '!', 'HP/MP hồi đầy — sức mạnh tăng!');
        this.emit('levelup', { level: this.level });
      }
    },

    /* ================= STATE / SAVE ================= */
    getState: function () {
      var Skills = mod('Skills');
      var cds = [];
      var ultCd = this._ultCd, ultCdMax = FB_ULT.cooldown, rage = this._rage;
      var skillDefs = FB_SKILLS;
      if (Skills && has(Skills, 'getSkills') && has(Skills, 'getCooldowns')) {
        try {
          skillDefs = Skills.getSkills();
          var cdMap = Skills.getCooldowns();
          var ult = has(Skills, 'getUlt') ? Skills.getUlt() : FB_ULT;
          ultCd = cdMap[ult.id] || 0;
          ultCdMax = ult.cooldown;
          if (has(Skills, 'getRage')) rage = Skills.getRage();
        } catch (e) { /* giữ fallback */ }
      }
      for (var i = 0; i < skillDefs.length; i++) {
        var def = skillDefs[i];
        var cd = 0;
        if (Skills && has(Skills, 'getCooldowns')) {
          try { cd = (Skills.getCooldowns()[def.id] || 0); } catch (e) { cd = 0; }
        } else {
          cd = this._cds[def.id] || 0;
        }
        cds.push({ cd: Math.max(0, cd), cdMax: def.cooldown, mp: def.mpCost });
      }
      var Party = mod('Party');
      var level = this.level, xp = this.xp, xpNeed = this.xpNeed;
      if (Party) {
        try {
          if (has(Party, 'getLevel')) level = Party.getLevel();
          if (has(Party, 'getXp')) xp = Party.getXp();
        } catch (e) { /* giữ nội bộ */ }
        if (has(Party, 'getMembers')) {
          try { this.party = Party.getMembers(); } catch (e) { /* bỏ qua */ }
        }
      }
      var Inv = mod('Inventory');
      var gold = this.gold;
      if (Inv && has(Inv, 'getGold')) {
        try { gold = Inv.getGold(); } catch (e) { /* giữ nội bộ */ }
      }
      var boss = this.boss;
      var Enemies = mod('Enemies');
      if (Enemies && has(Enemies, 'getBoss')) {
        try { boss = Enemies.getBoss() || boss; } catch (e) { /* bỏ qua */ }
      }
      var bossState = null;
      if (boss) {
        var showBar = this.leader && dist2(this.leader.position.x, this.leader.position.z, boss.position.x, boss.position.z) < BOSS_BAR_RANGE;
        bossState = {
          name: boss.name, hp: boss.hp, maxHp: boss.maxHp,
          dead: !boss.alive, visible: !!showBar
        };
      }
      return {
        party: this.party.map(function (p) {
          return {
            name: p.name, title: p.title || p.name, level: p.level, hp: Math.max(0, Math.ceil(p.hp)), maxHp: p.maxHp,
            mp: Math.floor(p.mp || 0), maxMp: p.maxMp || 0, dead: !p.alive,
            x: tileX(p.position.x), y: tileZ(p.position.z)
          };
        }),
        leaderIndex: this.leaderIndex,
        gold: gold, level: level, xp: xp, xpNeed: xpNeed,
        combo: this.combo, kills: this.kills,
        potions: (Inv && has(Inv, 'count')) ? (function () { try { return Inv.count('potion-hp'); } catch (e) { return 0; } })() : this.potions,
        time: Math.floor(this._time), inDungeon: this._inDungeon,
        boss: bossState,
        enemies: this.enemies.map(function (e) {
          return { x: tileX(e.position.x), y: tileZ(e.position.z), isBoss: !!e.isBoss, dead: !e.alive, name: e.name };
        }),
        npcs: this.npcs.map(function (n) {
          return { x: tileX(n.position.x), y: tileZ(n.position.z), id: n.npcId, name: n.name };
        }),
        mapW: MAP, mapH: MAP,
        skills: cds, ultCd: Math.max(0, ultCd), ultCdMax: ultCdMax, rage: rage,
        quest: (this._quests && has(this._quests, 'getDisplay')) ? this._quests.getDisplay() : null
      };
    },

    save: function () {
      try {
        if (typeof localStorage === 'undefined') return false;
        var data = {
          version: SAVE_VERSION, time: this._time, gold: this.gold,
          kills: this.kills, bossKills: this.bossKills, level: this.level,
          xp: this.xp, xpNeed: this.xpNeed, leaderIndex: this.leaderIndex,
          potions: this.potions, inDungeon: this._inDungeon,
          bossDead: !!(this.boss && !this.boss.alive)
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        var Party = mod('Party');
        if (Party && has(Party, 'save')) { try { Party.save(); } catch (e) { /* bỏ qua */ } }
        var Inv = mod('Inventory');
        if (Inv && has(Inv, 'save')) { try { Inv.save(); } catch (e) { /* bỏ qua */ } }
        if (this._quests && has(this._quests, 'save')) this._quests.save();
        return true;
      } catch (e) { return false; }
    },

    load: function () {
      try {
        if (typeof localStorage === 'undefined') return false;
        var Party = mod('Party');
        if (Party && has(Party, 'load')) {
          try {
            var loaded = Party.load();
            if (loaded && has(Party, 'getMembers')) {
              this.party = Party.getMembers();
              var self = this;
              this.party.forEach(function (m) { self._addToScene(m); });
              if (has(Party, 'getLevel')) this.level = Party.getLevel();
              if (has(Party, 'getXp')) this.xp = Party.getXp();
            }
          } catch (e) { /* bỏ qua */ }
        }
        var Inv = mod('Inventory');
        if (Inv && has(Inv, 'load')) {
          try {
            Inv.load();
            if (has(Inv, 'getGold')) this.gold = Inv.getGold();
          } catch (e) { /* bỏ qua */ }
        }
        var raw = localStorage.getItem(SAVE_KEY);
        if (!raw) {
          if (this._quests && has(this._quests, 'load')) this._quests.load();
          return false;
        }
        var data = JSON.parse(raw);
        if (!data || data.version !== SAVE_VERSION) return false;
        this._time = data.time || 0;
        this.gold = data.gold || 0;
        this.kills = data.kills || 0;
        this.bossKills = data.bossKills || 0;
        this.level = data.level || 1;
        this.xp = data.xp || 0;
        this.xpNeed = data.xpNeed || 100;
        this.leaderIndex = data.leaderIndex || 0;
        this.potions = (data.potions !== undefined) ? data.potions : 3;
        this._inDungeon = !!data.inDungeon;
        if (data.bossDead && this.boss) {
          this.boss.alive = false;
          this.boss.hp = 0;
          if (this.boss.group) this.boss.group.visible = false;
        }
        if (this._quests && has(this._quests, 'load')) this._quests.load();
        if (this._hud) this._hud.update(this.getState());
        return true;
      } catch (e) { return false; }
    },

    /* Chiếu điểm thế giới (x, y-cao, z) -> pixel màn hình. */
    projectWorldToScreen: function (x, y, z) {
      if (!this._camera || !this._renderer) return null;
      var v = new THREE.Vector3(x, (y || 2) + 0.8, z);
      v.project(this._camera);
      var rect = this._renderer.domElement.getBoundingClientRect();
      return {
        x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
        y: (-v.y * 0.5 + 0.5) * rect.height + rect.top
      };
    },

    /* Chiếu tile (tx, ty, cao h) -> pixel màn hình (cho HUD damage numbers). */
    projectTileToScreen: function (tx, ty, h) {
      return this.projectWorldToScreen(wX(tx), h || 2, wZ(ty));
    },

    /* ================= EVENTS ================= */
    on: function (event, fn) {
      if (typeof fn !== 'function') return false;
      this._events[event] = this._events[event] || [];
      this._events[event].push(fn);
      return true;
    },

    emit: function (event, data) {
      var list = this._events[event];
      if (!list) return;
      for (var i = 0; i < list.length; i++) {
        try { list[i](data); } catch (e) { if (window.console) console.warn('[WuxiaGame] event ' + event + ' lỗi:', e); }
      }
    },

    /* ================= DESTROY ================= */
    destroy: function () {
      this.stop();
      for (var i = 0; i < this._listeners.length; i++) {
        var l = this._listeners[i];
        try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (e) { /* bỏ qua */ }
      }
      this._listeners = [];
      if (this._hud && has(this._hud, 'destroy')) {
        try { this._hud.destroy(); } catch (e) { /* bỏ qua */ }
      }
      if (this._audio && has(this._audio, 'destroy')) {
        try { this._audio.destroy(); } catch (e) { /* bỏ qua */ }
      }
      var Dungeon = mod('Dungeon');
      if (Dungeon && has(Dungeon, 'dispose')) {
        try { Dungeon.dispose(); } catch (e) { /* bỏ qua */ }
      }
      var World = mod('World');
      if (World && has(World, 'dispose')) {
        try { World.dispose(); } catch (e) { /* bỏ qua */ }
      }
      if (this._renderer) {
        try { this._renderer.dispose(); } catch (e) { /* bỏ qua */ }
        if (this._renderer.domElement && this._renderer.domElement.parentNode) {
          this._renderer.domElement.parentNode.removeChild(this._renderer.domElement);
        }
      }
      this._renderer = null; this._scene = null; this._camera = null;
      this._hud = null; this._audio = null; this._quests = null;
      this._inited = false;
      this._events = {};
    }
  };

  PE.WuxiaGame = Game;
})();
