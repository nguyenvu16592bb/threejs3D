'use strict';
/* WuxiaEnemies.js — Nhóm WUXIA: spawn quái theo wave/điểm, AI quái, Boss Long Ngâm.
   Logic tái dùng (viết lại gọn) từ EnemyAI trong 3D-Model/WUXIA3D-3D.js:
   quái đuổi hero trong 12 ô, đánh khi gần, về vị trí khi xa >18;
   elite máu x3 (định nghĩa ở WuxiaCharacters: Hồ Ly 220 HP, rơi 60 vàng);
   boss enrage <50% HP, triệu hồi, AoE slam mỗi 8s, chết -> victory.
   Hợp đồng chung: window.PixiEngine.Wuxia.Enemies; update(dt, heroPos) nhận giây;
   vị trí {x, z}; KHÔNG tự tạo renderer/scene, KHÔNG tự vẽ HUD — chỉ callback
   onBossDeath / onKill. An toàn khi THREE undefined (logic số vẫn chạy). */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function dist2d(ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); }
  function chars() { var w = window.PixiEngine.Wuxia; return w ? w.Characters : null; }
  function combat() { var w = window.PixiEngine.Wuxia; return w ? w.Combat : null; }
  function skills() { var w = window.PixiEngine.Wuxia; return w ? w.Skills : null; }
  function emit(ev, data) {
    var bus = window.PixiEngine.EventBus;
    if (bus && typeof bus.emit === 'function') { try { bus.emit(ev, data); } catch (e) {} }
  }

  var CHASE_RANGE = 12;  /* đuổi hero trong 12 ô */
  var RETURN_RANGE = 18; /* xa hơn 18 ô thì quay về vị trí spawn */
  var SLAM_INTERVAL = 8; /* boss AoE slam mỗi 8s */
  var SLAM_WARN = 1;     /* vòng đỏ cảnh báo 1s trước khi nổ */
  var SLAM_RADIUS = 6;
  var ENRAGE_HP = 0.5;   /* <50% HP: cuồng nộ */
  var SUMMON_HP = 0.3;   /* <30% HP: triệu hồi 3 Tuyết Yêu (1 lần) */

  var enemies = [];
  var boss = null;
  var wave = 0;
  var _onBossDeath = null; /* fn(boss) — victory event */
  var _onKill = null;      /* fn(enemy, attacker) — loot / quest */
  var _onWaveCleared = null; /* fn(wave) */

  /* ---- Spawn ---- */
  function spawn(type, pos, opts) {
    opts = opts || {};
    var C = chars();
    var e = null;
    if (C) {
      e = C.createEnemy(type, { x: pos.x, z: pos.z, level: opts.level });
    } else {
      /* Không có module Characters: quái stub vẫn chạy được logic số. */
      var defs = { snow: { hp: 60, atk: 8, speed: 1.6 }, bandit: { hp: 90, atk: 12, speed: 2.0 }, fox: { hp: 220, atk: 18, speed: 1.8 }, boss: { hp: 1200, atk: 26, speed: 1.4 } };
      var d = defs[type] || defs.snow;
      e = { id: 'wuxia-enemy-' + Math.random().toString(36).slice(2, 8), name: type, kind: type === 'boss' ? 'boss' : type === 'fox' ? 'elite' : 'enemy', hp: d.hp, maxHp: d.hp, mp: 0, maxMp: 0, atk: d.atk, def: 0, speed: d.speed, range: 1.3, attackInterval: 1.1, position: { x: pos.x, z: pos.z }, home: { x: pos.x, z: pos.z }, facing: 0, alive: true, group: null, mesh: null, attackCd: 0, swingT: 0, flashT: 0, slowT: 0, frozenT: 0, isElite: type === 'fox', isBoss: type === 'boss', xp: 25, gold: 12 };
    }
    if (!e) { return null; }
    /* Wave scaling: mỗi wave quái khỏe thêm 10% HP, +1 atk. */
    if (wave > 0 && !e.isBoss) {
      e.maxHp = Math.floor(e.maxHp * (1 + 0.1 * wave));
      e.hp = e.maxHp;
      e.atk = e.atk + wave;
    }
    e.home = { x: pos.x, z: pos.z };
    e.wanderX = undefined; e.wanderZ = undefined; e.aiTimer = 0;
    enemies.push(e);
    return e;
  }

  /* Wave n: n+2 quái quanh điểm spawn, càng về sau càng nhiều Sơn Tặc;
     mỗi wave thứ 3 có 1 Hồ Ly Tinh elite. */
  function spawnWave(n, center, opts) {
    opts = opts || {};
    wave = n || (wave + 1);
    center = center || { x: 0, z: 0 };
    var count = wave + 2;
    var spawned = [];
    for (var i = 0; i < count; i++) {
      var type = 'snow';
      if (wave >= 2 && Math.random() < 0.45) { type = 'bandit'; }
      if (wave >= 3 && i === 0) { type = 'fox'; }
      var p = { x: center.x + rand(-6, 6), z: center.z + rand(-6, 6) };
      var e = spawn(type, p, opts);
      if (e) { spawned.push(e); }
    }
    return spawned;
  }

  function spawnAtPoints(points, types) {
    var out = [];
    for (var i = 0; i < points.length; i++) {
      var e = spawn(types ? types[i % types.length] : 'snow', points[i]);
      if (e) { out.push(e); }
    }
    return out;
  }

  /* ---- Boss Long Ngâm ---- */
  function createBoss(scene, pos) {
    pos = pos || { x: 0, z: 0 };
    var C = chars();
    var b = null;
    if (C) { b = C.createEnemy('boss', { x: pos.x, z: pos.z }); }
    else { b = spawn('boss', pos); }
    if (!b) { return null; }
    b.isBoss = true;
    b.baseAtk = b.atk;
    b.baseSpeed = b.speed;
    b.enraged = false;
    b.summoned = false;
    b.slamTimer = SLAM_INTERVAL;
    b.slamPending = null; /* {x, z, t} — đang cảnh báo, chờ nổ */
    b.hitCount = 0;
    if (scene && b.group && !b.group.parent) { scene.add(b.group); }
    boss = b;
    if (enemies.indexOf(b) === -1) { enemies.push(b); }
    return b;
  }

  function getBoss() { return boss; }
  function getAlive() {
    return enemies.filter(function (e) { return e.alive; });
  }
  function getAll() { return enemies.slice(); }
  function getWave() { return wave; }

  function removeDead() {
    enemies = enemies.filter(function (e) { return e.alive || e.isBoss; });
  }

  function clear() {
    enemies = [];
    boss = null;
    wave = 0;
  }

  /* ---- AI ---- */
  /* update(dt, heroPos, opts) — heroPos {x, z}; opts {party, scene, leader}.
     party: mảng hero để quái chọn mục tiêu gần nhất. */
  function update(dt, heroPos, opts) {
    opts = opts || {};
    if (!dt || dt <= 0) { return; }
    var C = combat();
    var S = skills();
    var party = opts.party || (opts.leader ? [opts.leader] : []);
    var hx = heroPos ? heroPos.x : 0, hz = heroPos ? heroPos.z : 0;
    var waveBefore = getAlive().length;

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.alive) { continue; }
      if (e.frozenT > 0) { e.frozenT -= dt; continue; } /* Băng Phong: đứng yên 3s */
      if (e.attackCd > 0) { e.attackCd -= dt; }
      e.aiTimer -= dt;
      var moving = false;

      /* Tìm hero gần nhất trong tầm đuổi. */
      var foe = null, bd = e.isBoss ? 14 : CHASE_RANGE;
      for (var p = 0; p < party.length; p++) {
        var m = party[p];
        if (!m || !m.alive) { continue; }
        var d = dist2d(e.position.x, e.position.z, m.position.x, m.position.z);
        if (d < bd) { bd = d; foe = m; }
      }
      var homeD = dist2d(e.position.x, e.position.z, e.home.x, e.home.z);
      if (foe && homeD < RETURN_RANGE) {
        var fd = dist2d(e.position.x, e.position.z, foe.position.x, foe.position.z);
        var range = e.range || 1.3;
        if (fd > range) {
          moving = moveTowards(e, foe.position.x, foe.position.z, dt);
        } else if (e.attackCd <= 0 && C) {
          e.attackCd = e.attackInterval || 1.1;
          e.swingT = 0.28;
          e.facing = Math.atan2(foe.position.x - e.position.x, foe.position.z - e.position.z);
          C.attack(e, foe);
          if (e.isBoss) { bossHit(e, foe, opts); }
        }
      } else {
        /* Lang thang quanh vị trí spawn; xa >18 ô thì quay về nhà. */
        if (homeD > RETURN_RANGE) {
          moving = moveTowards(e, e.home.x, e.home.z, dt);
        } else {
          if (e.aiTimer <= 0) {
            e.aiTimer = rand(2, 4);
            e.wanderX = e.home.x + rand(-2, 2);
            e.wanderZ = e.home.z + rand(-2, 2);
          }
          if (e.wanderX !== undefined) {
            var wd = dist2d(e.position.x, e.position.z, e.wanderX, e.wanderZ);
            if (wd > 0.4) { moving = moveTowards(e, e.wanderX, e.wanderZ, dt); }
          }
        }
      }

      if (e.isBoss) { updateBoss(e, dt, opts); }

      var Ch = chars();
      if (Ch) { Ch.animate(e, dt, moving); if (Ch.updateHpBar) { Ch.updateHpBar(e); } }
    }

    /* Wave hết quái sống -> báo cleared (game tự spawn wave sau). */
    if (wave > 0 && waveBefore > 0 && getAlive().length === 0 && typeof _onWaveCleared === 'function') {
      try { _onWaveCleared(wave); } catch (err) {}
    }
  }

  function moveTowards(ch, tx, tz, dt) {
    var d = dist2d(ch.position.x, ch.position.z, tx, tz);
    if (d < 0.01) { return false; }
    var sp = ch.speed * (ch.slowT > 0 ? 0.55 : 1);
    var step = Math.min(d, sp * dt);
    ch.position.x += (tx - ch.position.x) / d * step;
    ch.position.z += (tz - ch.position.z) / d * step;
    ch.facing = Math.atan2(tx - ch.position.x, tz - ch.position.z);
    return true;
  }

  /* ---- Boss state machine ---- */
  function updateBoss(b, dt, opts) {
    var S = skills();
    var C = combat();
    /* Phase 1 -> cuồng nộ khi <50% HP: đỏ lên, tốc +50%, atk +30%. */
    if (!b.enraged && b.hp < b.maxHp * ENRAGE_HP) {
      b.enraged = true;
      b.atk = Math.floor(b.baseAtk * 1.3);
      b.speed = b.baseSpeed * 1.5;
      if (b.group) {
        b.group.traverse(function (o) {
          if (o.isMesh && o.material && o.material.emissive) { o.material.emissive.setHex(0x550000); }
        });
      }
      emit('wuxia-boss-enrage', { boss: b });
    }
    /* <30% HP: triệu hồi 3 Tuyết Yêu (chỉ 1 lần). */
    if (!b.summoned && b.hp < b.maxHp * SUMMON_HP) {
      b.summoned = true;
      for (var s = 0; s < 3; s++) {
        spawn('snow', { x: b.position.x + rand(-2, 2), z: b.position.z + rand(-2, 2) });
      }
      emit('wuxia-boss-summon', { boss: b, count: 3 });
    }
    /* AoE slam mỗi 8s: vòng đỏ cảnh báo 1s rồi nổ bán kính 6. */
    if (b.slamPending) {
      b.slamPending.t -= dt;
      if (b.slamPending.t <= 0) {
        var c = { x: b.slamPending.x, z: b.slamPending.z };
        b.slamPending = null;
        b.slamTimer = SLAM_INTERVAL;
        if (C) {
          var party = opts.party || (opts.leader ? [opts.leader] : []);
          C.attackAoE(b, c, SLAM_RADIUS, Math.floor(b.atk * 1.2), { targets: party });
        }
        emit('wuxia-boss-slam', { boss: b, center: c, radius: SLAM_RADIUS });
      }
    } else {
      b.slamTimer -= dt;
      if (b.slamTimer <= 0) {
        b.slamPending = { x: b.position.x, z: b.position.z, t: SLAM_WARN };
        if (S && opts.scene) {
          S.createEffect(opts.scene, 'warning', { x: b.position.x, z: b.position.z }, SLAM_RADIUS);
        }
        emit('wuxia-boss-slam-warn', { boss: b, center: { x: b.position.x, z: b.position.z }, radius: SLAM_RADIUS });
      }
    }
  }

  /* Boss đánh thường: cứ 4 đòn thì thêm 1 đòn AoE nhỏ quanh mình (bản gốc). */
  function bossHit(b, foe, opts) {
    b.hitCount = (b.hitCount || 0) + 1;
    if (b.hitCount % 4 !== 0) { return; }
    var C = combat();
    if (!C) { return; }
    var party = opts.party || (opts.leader ? [opts.leader] : []);
    C.attackAoE(b, b.position, 3.2, Math.floor(b.atk * 1.2), { targets: party });
  }

  /* Boss chết -> victory event. Game gọi hàm này qua Combat.onKill hoặc tự gọi
     khi thấy boss.alive === false. Trả true nếu vừa xử lý lần đầu. */
  function handleBossDeath(b) {
    if (!b || b.isBoss !== true || b._deathHandled) { return false; }
    b._deathHandled = true;
    if (typeof _onBossDeath === 'function') {
      try { _onBossDeath(b); } catch (e) {}
    }
    emit('wuxia-boss-death', { boss: b });
    emit('wuxia-victory', { boss: b });
    return true;
  }

  /* Gắn vào Combat.onKill để tự bắt sự kiện quái/boss chết (game chỉ cần gọi 1 lần). */
  function bindCombatKill() {
    var C = combat();
    if (!C) { return false; }
    C.onKill = function (target, attacker) {
      if (target.isBoss) { handleBossDeath(target); }
      if (typeof _onKill === 'function') {
        try { _onKill(target, attacker); } catch (e) {}
      }
    };
    return true;
  }

  var api = {
    CHASE_RANGE: CHASE_RANGE, RETURN_RANGE: RETURN_RANGE,
    SLAM_INTERVAL: SLAM_INTERVAL, SLAM_RADIUS: SLAM_RADIUS,
    spawn: spawn, spawnWave: spawnWave, spawnAtPoints: spawnAtPoints,
    createBoss: createBoss, getBoss: getBoss,
    getAlive: getAlive, getAll: getAll, getWave: getWave,
    update: update, clear: clear, removeDead: removeDead,
    handleBossDeath: handleBossDeath, bindCombatKill: bindCombatKill,
    set onBossDeath(fn) { _onBossDeath = fn; }, get onBossDeath() { return _onBossDeath; },
    set onKill(fn) { _onKill = fn; }, get onKill() { return _onKill; },
    set onWaveCleared(fn) { _onWaveCleared = fn; }, get onWaveCleared() { return _onWaveCleared; }
  };
  window.PixiEngine.Wuxia.Enemies = api;
  window.PixiEngine.WuxiaEnemies = api;
})();
