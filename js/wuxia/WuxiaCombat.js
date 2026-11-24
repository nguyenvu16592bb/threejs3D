'use strict';
/* WuxiaCombat.js — Nhóm WUXIA: combat thật (đánh thường, crit, knockback).
   Công thức tái dùng từ Combat trong 3D-Model/WUXIA3D-3D.js:
   damage = max(1, round(atk * rand(0.85, 1.15) - def)), crit 15% x1.8,
   cooldown theo tốc độ đánh từng vũ khí, chết -> loot + XP (qua callback).
   Hợp đồng chung: window.PixiEngine.Wuxia.Combat; update(dt) nhận giây;
   vị trí {x, z}; KHÔNG tự vẽ HUD — chỉ gọi callback onDamage / onKill
   (nhóm HUD đăng ký qua WuxiaGame.onDamage). An toàn khi THREE undefined. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};

  var CRIT_CHANCE = 0.15;
  var CRIT_MULT = 1.8;
  var VARIANCE = 0.2; /* damage dao động ±20% (gốc: rand(0.85, 1.15)) */

  var _registry = []; /* combatant đã đăng ký để update(dt) tick cooldown/knockback */
  var _onDamage = null; /* fn(dmg, pos, opts {crit, skill, attacker, target}) — HUD vẽ số damage */
  var _onKill = null;   /* fn(target, attacker) — loot / quest / XP */
  var _onHit = null;    /* fn(attacker, target, result) */

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist2d(ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function register(c) {
    if (!c || _registry.indexOf(c) !== -1) { return; }
    _registry.push(c);
  }
  function unregister(c) {
    var i = _registry.indexOf(c);
    if (i !== -1) { _registry.splice(i, 1); }
  }

  function isInRange(a, b, range) {
    if (!a || !b || !a.position || !b.position) { return false; }
    var r = (range !== undefined) ? range : (a.range || 1.5);
    return dist2d(a.position.x, a.position.z, b.position.x, b.position.z) <= r;
  }

  function findNearest(pos, list, range) {
    var best = null, bd = (range !== undefined ? range : Infinity);
    if (!list) { return null; }
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.alive || !e.position) { continue; }
      var d = dist2d(pos.x, pos.z, e.position.x, e.position.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function findAllInRadius(pos, list, radius) {
    var out = [];
    if (!list) { return out; }
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.alive || !e.position) { continue; }
      if (dist2d(pos.x, pos.z, e.position.x, e.position.z) <= radius) { out.push(e); }
    }
    return out;
  }

  /* Damage thô trước khi trừ def — dùng chung cho đánh thường + skill. */
  function computeDamage(atk, def) {
    var base = Math.max(1, Math.round(atk * rand(1 - VARIANCE, 1 + VARIANCE) - (def || 0)));
    return base;
  }
  function rollCrit() { return Math.random() < CRIT_CHANCE; }

  /* Trừ máu mục tiêu, gọi onDamage, xử lý chết. Không tự vẽ gì cả. */
  function takeDamage(target, dmg, opts) {
    opts = opts || {};
    if (!target || !target.alive) { return { dmg: 0, dead: false }; }
    var crit = !!opts.crit;
    var finalDmg = Math.max(1, Math.round(dmg));
    if (crit) { finalDmg = Math.round(finalDmg * CRIT_MULT); }
    target.hp -= finalDmg;
    target.flashT = 0.12;
    if (typeof _onDamage === 'function') {
      try {
        _onDamage(finalDmg, { x: target.position.x, z: target.position.z, y: target.height || 2 },
          { crit: crit, skill: !!opts.skill, attacker: opts.attacker || null, target: target });
      } catch (e) {}
    }
    var dead = false;
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      dead = true;
      if (target.group) { target.group.visible = false; }
      if (typeof _onKill === 'function') {
        try { _onKill(target, opts.attacker || null); } catch (e) {}
      }
    }
    return { dmg: finalDmg, crit: crit, dead: dead };
  }

  /* Đánh thường: tầm theo vũ khí, cooldown theo tốc độ đánh.
     Trả về {ok, dmg, crit, dead} hoặc {ok:false, reason}. */
  function attack(attacker, target, opts) {
    opts = opts || {};
    if (!attacker || !attacker.alive) { return { ok: false, reason: 'attacker-dead' }; }
    if (!target || !target.alive) { return { ok: false, reason: 'no-target' }; }
    if (attacker.frozenT > 0) { return { ok: false, reason: 'frozen' }; }
    if (attacker.attackCd > 0) { return { ok: false, reason: 'cooldown', remain: attacker.attackCd }; }
    var range = opts.range || attacker.range || 1.5;
    if (!isInRange(attacker, target, range)) { return { ok: false, reason: 'out-of-range' }; }
    register(attacker);
    register(target);
    attacker.attackCd = attacker.attackInterval || 0.6;
    attacker.swingT = 0.28;
    attacker.facing = Math.atan2(target.position.x - attacker.position.x, target.position.z - attacker.position.z);
    var crit = rollCrit();
    var res = takeDamage(target, computeDamage(attacker.atk, target.def), {
      crit: crit, attacker: attacker, skill: false
    });
    /* Knockback nhẹ: quái thường bị đẩy lùi, boss/elite gần như không nhúc nhích. */
    if (!res.dead && target.kind !== 'boss') {
      var kb = target.kind === 'elite' ? 0.25 : 0.6;
      var d = dist2d(attacker.position.x, attacker.position.z, target.position.x, target.position.z) || 1;
      target.knockback = {
        x: (target.position.x - attacker.position.x) / d * kb,
        z: (target.position.z - attacker.position.z) / d * kb,
        t: 0.15
      };
    }
    /* Tích nộ cho skill ultimate (nếu module Skills đã nạp). */
    var W = window.PixiEngine.Wuxia;
    if (W && W.Skills && typeof W.Skills.noteHit === 'function') {
      try { W.Skills.noteHit(attacker, target, res.dmg); } catch (e) {}
    }
    if (typeof _onHit === 'function') {
      try { _onHit(attacker, target, res); } catch (e) {}
    }
    return { ok: true, dmg: res.dmg, crit: res.crit, dead: res.dead };
  }

  /* Đánh AoE quanh một điểm — dùng cho skill / boss slam. */
  function attackAoE(attacker, center, radius, baseDmg, opts) {
    opts = opts || {};
    var results = [];
    var list = opts.targets || [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || !t.alive || !t.position) { continue; }
      if (dist2d(center.x, center.z, t.position.x, t.position.z) > radius) { continue; }
      var crit = rollCrit();
      var res = takeDamage(t, computeDamage(baseDmg, t.def), { crit: crit, attacker: attacker, skill: true });
      if (opts.knockback !== false && t.kind !== 'boss') {
        var d = dist2d(center.x, center.z, t.position.x, t.position.z) || 1;
        t.knockback = {
          x: (t.position.x - center.x) / d * 0.8,
          z: (t.position.z - center.z) / d * 0.8,
          t: 0.2
        };
      }
      results.push({ target: t, dmg: res.dmg, crit: res.crit, dead: res.dead });
    }
    return results;
  }

  /* Tick cooldown + knockback cho mọi combatant đã đăng ký. */
  function update(dt) {
    if (!dt || dt <= 0) { return; }
    for (var i = _registry.length - 1; i >= 0; i--) {
      var c = _registry[i];
      if (!c) { _registry.splice(i, 1); continue; }
      if (c.attackCd > 0) { c.attackCd -= dt; }
      if (c.swingT > 0) { c.swingT -= dt; }
      if (c.slowT > 0) { c.slowT -= dt; }
      if (c.frozenT > 0) { c.frozenT -= dt; }
      if (c.knockback && c.knockback.t > 0) {
        /* Chỉ đẩy trong phần thời gian knockback còn lại (dt lớn không đẩy quá). */
        var kdt = Math.min(dt, c.knockback.t);
        c.knockback.t -= dt;
        c.position.x += (c.knockback.x / 0.15) * kdt;
        c.position.z += (c.knockback.z / 0.15) * kdt;
        if (c.knockback.t <= 0) { c.knockback = null; }
      }
    }
  }

  var api = {
    CRIT_CHANCE: CRIT_CHANCE, CRIT_MULT: CRIT_MULT,
    attack: attack, takeDamage: takeDamage, attackAoE: attackAoE,
    update: update, isInRange: isInRange, findNearest: findNearest,
    findAllInRadius: findAllInRadius, computeDamage: computeDamage,
    register: register, unregister: unregister, dist2d: dist2d,
    set onDamage(fn) { _onDamage = fn; }, get onDamage() { return _onDamage; },
    set onKill(fn) { _onKill = fn; }, get onKill() { return _onKill; },
    set onHit(fn) { _onHit = fn; }, get onHit() { return _onHit; }
  };
  window.PixiEngine.Wuxia.Combat = api;
  window.PixiEngine.WuxiaCombat = api;
})();
