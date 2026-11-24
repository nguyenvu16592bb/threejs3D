'use strict';
/* WuxiaParty.js — Nhóm WUXIA: quản party 3 người (Lâm Phong / Thiết Ngưu / Bạch Tuyết).
   Logic tái dùng (viết lại gọn) từ PartyAI trong 3D-Model/WUXIA3D-3D.js:
   đổi leader phím 1/2/3, follower đi theo giữ khoảng cách, tự đánh quái gần
   khi leader đánh, chết hồi sinh sau 8s với 60% HP, XP chia đều + level-up.
   Hợp đồng chung: window.PixiEngine.Wuxia.Party; update(dt, leaderPos) nhận giây;
   vị trí {x, z}; KHÔNG tự tạo renderer/scene, KHÔNG tự vẽ HUD (chỉ callback). */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); }
  function wuxia() { return window.PixiEngine.Wuxia; }
  function combat() { var w = wuxia(); return w ? w.Combat : null; }
  function chars() { var w = wuxia(); return w ? w.Characters : null; }

  var FOLLOW_DIST = 2.2;      /* follower giữ khoảng 2 – 2.5 so với leader */
  var FOLLOW_TELEPORT = 9;    /* xa hơn thì dịch chuyển tới cạnh leader */
  var FOLLOWER_AGGRO = 4.5;   /* follower tự đánh quái trong tầm này */
  var REVIVE_TIME = 8;        /* chết hồi sinh sau 8s, 60% HP (như bản gốc) */
  var REVIVE_HP = 0.6;
  var SAVE_KEY = 'wuxia-party-v5';

  var members = [];           /* [leader, follower1, follower2] — index 0 luôn là leader hiện tại? Không: activeIndex mới là leader */
  var activeIndex = 0;
  var level = 1;
  var xp = 0;
  var xpNeed = 100;
  var onLevelUp = null;       /* fn(events) */
  var onSwitch = null;        /* fn(leader, index) */
  var onRevive = null;        /* fn(hero) */
  var _reviveTimers = {};     /* heroId -> giây còn lại */

  function xpNeedFor(lv) { return Math.floor(100 * Math.pow(1.35, lv - 1)); }

  /* heroes: mảng character (đã tạo sẵn qua WuxiaCharacters) hoặc key def
     ('lamphong' | 'thietnguu' | 'bachtuyet'). Mặc định đủ 3 người. */
  function init(heroes, opts) {
    opts = opts || {};
    members = [];
    _reviveTimers = {};
    var list = heroes && heroes.length ? heroes : ['lamphong', 'thietnguu', 'bachtuyet'];
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (typeof h === 'string') {
        var C = chars();
        h = C ? C.createHero(h, { x: opts.x || 0, z: opts.z || 0 }) : null;
      }
      if (h) { h.alive = true; members.push(h); }
    }
    activeIndex = clamp(opts.activeIndex || 0, 0, Math.max(0, members.length - 1));
    level = opts.level || 1;
    xp = opts.xp || 0;
    xpNeed = xpNeedFor(level);
    return members;
  }

  function getActive() { return members[activeIndex] || null; }
  function getMembers() { return members.slice(); }
  function getFollowers() {
    var out = [];
    for (var i = 0; i < members.length; i++) { if (i !== activeIndex) { out.push(members[i]); } }
    return out;
  }
  function getLevel() { return level; }
  function getXp() { return { xp: xp, need: xpNeed, level: level }; }

  /* Đổi leader (phím 1/2/3 + nút chạm). Trả về leader mới hoặc null nếu không đổi được. */
  function switchTo(i) {
    if (i < 0 || i >= members.length || i === activeIndex) { return null; }
    var next = members[i];
    if (!next || !next.alive) { return null; }
    activeIndex = i;
    if (typeof onSwitch === 'function') { try { onSwitch(next, i); } catch (e) {} }
    return next;
  }

  function healParty(amount) {
    var healed = [];
    members.forEach(function (m) {
      if (!m.alive) { return; }
      var before = m.hp;
      m.hp = Math.min(m.maxHp, m.hp + amount);
      healed.push({ hero: m, healed: m.hp - before });
    });
    return healed;
  }

  function healOne(hero, amount) {
    if (!hero || !hero.alive) { return 0; }
    var before = hero.hp;
    hero.hp = Math.min(hero.maxHp, hero.hp + amount);
    return hero.hp - before;
  }

  /* XP chia đều cho cả đội (mỗi người nhận amount — như bản gốc: gainXp chung cho party).
     Level-up: maxHp +12%, atk +10%, hồi đầy HP/MP. Trả về mảng levelUp events. */
  function addXP(amount) {
    var events = [];
    if (!amount || amount <= 0 || !members.length) { return events; }
    xp += amount;
    while (xp >= xpNeed) {
      xp -= xpNeed;
      level++;
      xpNeed = xpNeedFor(level);
      members.forEach(function (p) {
        p.level = level;
        p.maxHp = Math.floor(p.maxHp * 1.12);
        p.atk = Math.floor(p.atk * 1.1);
        p.hp = p.maxHp; p.mp = p.maxMp;
        events.push({ hero: p, level: level, maxHp: p.maxHp, atk: p.atk });
      });
    }
    if (events.length && typeof onLevelUp === 'function') {
      try { onLevelUp(events); } catch (e) {}
    }
    return events;
  }

  function allDead() {
    if (!members.length) { return false; }
    for (var i = 0; i < members.length; i++) { if (members[i].alive) { return false; } }
    return true;
  }

  /* Follower AI: đi theo leader, tránh đè nhau, tự đánh quái gần khi leader đánh.
     leaderPos: {x, z} vị trí leader hiện tại (game tự di chuyển leader).
     opts: {enemies: [...], leaderAttacking: bool} — enemies để follower tự đánh. */
  function update(dt, leaderPos, opts) {
    opts = opts || {};
    var leader = getActive();
    if (!leader || !members.length) { return; }
    var lx = leaderPos ? leaderPos.x : leader.position.x;
    var lz = leaderPos ? leaderPos.z : leader.position.z;
    var C = combat();
    /* Hồi sinh thành viên đã gục sau 8s, 60% HP, xuất hiện cạnh leader. */
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (!m.alive) {
        if (!_reviveTimers[m.id]) { _reviveTimers[m.id] = REVIVE_TIME; }
        _reviveTimers[m.id] -= dt;
        if (_reviveTimers[m.id] <= 0) {
          delete _reviveTimers[m.id];
          m.alive = true;
          m.hp = Math.floor(m.maxHp * REVIVE_HP);
          m.position.x = lx + (Math.random() * 2 - 1);
          m.position.z = lz + (Math.random() * 2 - 1);
          if (m.group) { m.group.visible = true; }
          if (typeof onRevive === 'function') { try { onRevive(m); } catch (e) {} }
        }
      }
    }
    /* Vị trí theo sau: 2 follower đứng chéo sau leader (góc theo facing). */
    var followers = getFollowers();
    var offsets = [
      { x: -1.6, z: 1.6 },
      { x: 1.6, z: 1.6 }
    ];
    for (var f = 0; f < followers.length; f++) {
      var fo = followers[f];
      if (!fo.alive) { continue; }
      if (fo.frozenT > 0) { fo.frozenT -= dt; continue; }
      if (fo.slowT > 0) { fo.slowT -= dt; }
      var moving = false;
      /* Tự đánh quái gần — ưu tiên quái leader đang đánh, rồi quái gần nhất. */
      var foe = null;
      if (opts.enemies && opts.enemies.length && C) {
        foe = C.findNearest(fo.position, opts.enemies, FOLLOWER_AGGRO);
      }
      if (foe && (opts.leaderAttacking || dist(fo.position.x, fo.position.z, lx, lz) < 6)) {
        var fd = dist(fo.position.x, fo.position.z, foe.position.x, foe.position.z);
        if (fd <= fo.range) {
          C.attack(fo, foe);
        } else {
          moveTowards(fo, foe.position.x, foe.position.z, dt);
          moving = true;
        }
      } else {
        var off = offsets[f] || { x: 0, z: 2 };
        var tx = lx + off.x, tz = lz + off.z;
        var od = dist(fo.position.x, fo.position.z, tx, tz);
        if (od > FOLLOW_TELEPORT) {
          fo.position.x = tx; fo.position.z = tz;
        } else if (od > 0.6) {
          moveTowards(fo, tx, tz, dt);
          moving = true;
        }
      }
      /* Tránh đè nhau: đẩy nhẹ follower ra khỏi leader + follower khác. */
      separate(fo, leader, dt);
      for (var g = 0; g < followers.length; g++) {
        if (g !== f) { separate(fo, followers[g], dt); }
      }
      var Ch = chars();
      if (Ch) { Ch.animate(fo, dt, moving); }
    }
  }

  function moveTowards(ch, tx, tz, dt) {
    var d = dist(ch.position.x, ch.position.z, tx, tz);
    if (d < 0.01) { return false; }
    var sp = ch.speed * (ch.slowT > 0 ? 0.55 : 1);
    var step = Math.min(d, sp * dt);
    ch.position.x += (tx - ch.position.x) / d * step;
    ch.position.z += (tz - ch.position.z) / d * step;
    ch.facing = Math.atan2(tx - ch.position.x, tz - ch.position.z);
    return true;
  }

  function separate(a, b, dt) {
    if (!a || !b || a === b) { return; }
    var d = dist(a.position.x, a.position.z, b.position.x, b.position.z);
    var minD = 0.9;
    if (d >= minD || d < 0.001) { return; }
    var push = (minD - d) * 0.5;
    var nx = (a.position.x - b.position.x) / d, nz = (a.position.z - b.position.z) / d;
    a.position.x += nx * push;
    a.position.z += nz * push;
  }

  function save() {
    var data = {
      v: 5, level: level, xp: xp,
      activeIndex: activeIndex,
      members: members.map(function (m) {
        return {
          key: m.key || m.name, name: m.name, kind: m.kind, level: m.level,
          hp: m.hp, maxHp: m.maxHp, mp: m.mp, maxMp: m.maxMp,
          atk: m.atk, def: m.def, x: m.position.x, z: m.position.z, alive: m.alive
        };
      })
    };
    try {
      if (typeof localStorage !== 'undefined') { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }
    } catch (e) {}
    return data;
  }

  function load() {
    var raw = null;
    try {
      if (typeof localStorage !== 'undefined') { raw = localStorage.getItem(SAVE_KEY); }
    } catch (e) {}
    if (!raw) { return null; }
    try {
      var data = JSON.parse(raw);
      if (!data || !data.members) { return null; }
      var C = chars();
      var heroes = [];
      data.members.forEach(function (s) {
        var h = null;
        if (C) {
          var key = (s.name === 'Lâm Phong' ? 'lamphong' : s.name === 'Thiết Ngưu' ? 'thietnguu' : s.name === 'Bạch Tuyết' ? 'bachtuyet' : null);
          h = key ? C.createHero(key, { x: s.x, z: s.z }) : null;
        }
        if (!h) {
          h = { id: 'wuxia-load-' + s.name, name: s.name, kind: 'hero', position: { x: s.x, z: s.z }, facing: 0, alive: s.alive, group: null, mesh: null };
        }
        h.level = s.level; h.hp = s.hp; h.maxHp = s.maxHp;
        h.mp = s.mp; h.maxMp = s.maxMp; h.atk = s.atk; h.def = s.def;
        h.alive = !!s.alive;
        heroes.push(h);
      });
      init(heroes, { activeIndex: data.activeIndex || 0, level: data.level || 1, xp: data.xp || 0 });
      return data;
    } catch (e) { return null; }
  }

  var api = {
    init: init, getActive: getActive, getMembers: getMembers, getFollowers: getFollowers,
    switchTo: switchTo, update: update,
    healParty: healParty, healOne: healOne, addXP: addXP, getXp: getXp, getLevel: getLevel,
    allDead: allDead, save: save, load: load,
    FOLLOW_DIST: FOLLOW_DIST, REVIVE_TIME: REVIVE_TIME,
    set onLevelUp(fn) { onLevelUp = fn; }, get onLevelUp() { return onLevelUp; },
    set onSwitch(fn) { onSwitch = fn; }, get onSwitch() { return onSwitch; },
    set onRevive(fn) { onRevive = fn; }, get onRevive() { return onRevive; }
  };
  window.PixiEngine.Wuxia.Party = api;
  window.PixiEngine.WuxiaParty = api;
})();
