'use strict';
/* WuxiaSkills.js — Nhóm WUXIA: 6 skill + ultimate Thần Long Giáng Thế.
   Tái dùng (viết lại gọn) từ Skills/Effects trong 3D-Model/WUXIA3D-3D.js:
   Kiếm Khí / Hỏa Bạo / Băng Phong / Lôi Đình / Kim Cương Hoàn / Long Kích
   -> gom thành 6 skill theo hợp đồng v5.0 + ultimate rồng vàng.
   Hợp đồng chung: window.PixiEngine.Wuxia.Skills; update(dt) nhận giây;
   cast(skillId, caster, targets, world) trả {ok, reason}; hiệu ứng thật bằng
   mesh/particle three.js, tự biến mất sau 0.6–1.2s. An toàn khi THREE undefined
   (damage/logic vẫn chạy, chỉ không có visual). KHÔNG tự vẽ HUD. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};

  var HAS_THREE = (typeof THREE !== 'undefined');
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist2d(ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); }
  function combat() { var w = window.PixiEngine.Wuxia; return w ? w.Combat : null; }
  function party() { var w = window.PixiEngine.Wuxia; return w ? w.Party : null; }

  /* id, tên, phím, MP, cooldown (giây), tầm, bán kính, mô tả. */
  var SKILLS = [
    { id: 'swordwind', name: 'Kiếm Khí Xanh', key: '1', mpCost: 15, cooldown: 2.5, range: 9, radius: 0, color: 0x5cb8ff, desc: 'Phóng kiếm khí xanh thẳng về phía trước, xuyên 1 mục tiêu.' },
    { id: 'firepalm', name: 'Hỏa Diệm Chưởng', key: '2', mpCost: 25, cooldown: 6, range: 6, radius: 4, color: 0xff8a3c, desc: 'Chưởng lửa cam nổ AoE bán kính 4 tại điểm chỉ định.' },
    { id: 'icefreeze', name: 'Băng Phong', key: '3', mpCost: 30, cooldown: 8, range: 7, radius: 3.5, color: 0x9fdcff, desc: 'Băng phong AoE — đóng băng quái trúng đòn trong 3s.' },
    { id: 'thunder', name: 'Lôi Đình', key: '4', mpCost: 30, cooldown: 8, range: 9, radius: 0, color: 0xffe95c, desc: 'Sét vàng đánh thẳng 1 mục tiêu gần nhất trong tầm 9.' },
    { id: 'heal', name: 'Hồi Xuân', key: '5', mpCost: 20, cooldown: 10, range: 0, radius: 0, color: 0x4dff6e, desc: 'Hồi 35% HP tối đa cho cả party.' },
    { id: 'dragonbreak', name: 'Long Ngâm Phá', key: '6', mpCost: 35, cooldown: 12, range: 0, radius: 6, color: 0xffd94d, desc: 'Phá AoE lớn quanh bản thân, bán kính 6, hất văng quái.' }
  ];
  var ULT = {
    id: 'dragon-ult', name: 'Thần Long Giáng Thế', key: 'R',
    mpCost: 60, cooldown: 30, range: 0, radius: 8, color: 0xffd94d,
    desc: 'Cần nộ 100. Rồng vàng bay vòng + AoE bán kính 8, damage lớn.'
  };
  var FREEZE_TIME = 3;
  var RAGE_PER_HIT = 4;   /* nộ tích khi đánh trúng */
  var RAGE_PER_TAKEN = 6; /* nộ tích khi trúng đòn */

  var cooldowns = {}; /* skillId -> giây còn lại */
  var ultCooldown = 0;
  var rage = 0;       /* 0 – 100 */
  var fx = [];        /* hiệu ứng đang chạy: {m, t, dur, kind, ...} */

  function getSkills() { return SKILLS.slice(); }
  function getUlt() { return ULT; }
  function getCooldowns() {
    var out = {};
    for (var i = 0; i < SKILLS.length; i++) { out[SKILLS[i].id] = cooldowns[SKILLS[i].id] || 0; }
    out[ULT.id] = ultCooldown;
    return out;
  }
  function getRage() { return rage; }
  function setRage(v) { rage = clamp(v, 0, 100); return rage; }
  /* Combat gọi khi party đánh trúng / trúng đòn để tích nộ. */
  function noteHit(attacker, target, dmg) {
    if (attacker && attacker.kind === 'hero') { rage = clamp(rage + RAGE_PER_HIT, 0, 100); }
    if (target && target.kind === 'hero') { rage = clamp(rage + RAGE_PER_TAKEN, 0, 100); }
  }

  function skillById(id) {
    if (id === ULT.id) { return ULT; }
    for (var i = 0; i < SKILLS.length; i++) { if (SKILLS[i].id === id) { return SKILLS[i]; } }
    return null;
  }
  function skillByIndex(i) { return SKILLS[i] || null; }
  function skillBase(caster) { return 40 + (caster.level || 1) * 6; }

  /* Điểm đích của skill: quái gần nhất trong tầm, không thì điểm trước mặt caster. */
  function aimPoint(caster, targets, range) {
    var C = combat();
    var tgt = null;
    if (C && targets) { tgt = C.findNearest(caster.position, targets, range); }
    if (tgt) { return { x: tgt.position.x, z: tgt.position.z, target: tgt }; }
    var d = range > 0 ? Math.min(3, range) : 2;
    return {
      x: caster.position.x + Math.sin(caster.facing) * d,
      z: caster.position.z + Math.cos(caster.facing) * d,
      target: null
    };
  }

  /* cast(skillId, caster, targets, world) — world: {enemies, party, scene}.
     Trả về {ok:true, skill} hoặc {ok:false, reason} với reason rõ ràng. */
  function cast(skillId, caster, targets, world) {
    world = world || {};
    var list = targets || world.enemies || [];
    var skill = (typeof skillId === 'number') ? skillByIndex(skillId) : skillById(skillId);
    if (!skill) { return { ok: false, reason: 'unknown-skill' }; }
    if (!caster || !caster.alive) { return { ok: false, reason: 'caster-dead' }; }
    if (caster.frozenT > 0) { return { ok: false, reason: 'frozen' }; }
    var cd = cooldowns[skill.id] || 0;
    if (cd > 0) { return { ok: false, reason: 'cooldown', remain: Math.ceil(cd) }; }
    if ((caster.mp || 0) < skill.mpCost) { return { ok: false, reason: 'not-enough-mp', need: skill.mpCost, have: caster.mp || 0 }; }
    var C = combat();
    var scene = world.scene || null;
    var base = skillBase(caster);
    caster.mp -= skill.mpCost;
    cooldowns[skill.id] = skill.cooldown;
    caster.swingT = 0.28;

    if (skill.id === 'swordwind') {
      var aim = aimPoint(caster, list, skill.range);
      var dx = aim.x - caster.position.x, dz = aim.z - caster.position.z;
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= len; dz /= len;
      /* Kiếm khí bay thật: projectile kiểm tra va chạm trong update(dt). */
      createEffect(scene, 'swordwind', { x: caster.position.x, z: caster.position.z }, 0, {
        dx: dx, dz: dz, dmg: base, caster: caster, targets: list
      });
    } else if (skill.id === 'firepalm') {
      var fp = aimPoint(caster, list, skill.range);
      createEffect(scene, 'fire', fp, skill.radius);
      if (C) { C.attackAoE(caster, fp, skill.radius, base + 25, { targets: list }); }
    } else if (skill.id === 'icefreeze') {
      var ip = aimPoint(caster, list, skill.range);
      createEffect(scene, 'ice', ip, skill.radius);
      if (C) {
        var hits = C.attackAoE(caster, ip, skill.radius, base + 5, { targets: list });
        hits.forEach(function (h) { if (!h.dead) { h.target.frozenT = FREEZE_TIME; } });
      }
    } else if (skill.id === 'thunder') {
      var tt = C ? C.findNearest(caster.position, list, skill.range) : null;
      if (!tt) { caster.mp += skill.mpCost; cooldowns[skill.id] = 0; return { ok: false, reason: 'no-target-in-range' }; }
      createEffect(scene, 'thunder', { x: tt.position.x, z: tt.position.z }, 0);
      if (C) { C.takeDamage(tt, C.computeDamage(base + 10, tt.def), { crit: Math.random() < 0.15, attacker: caster, skill: true }); }
    } else if (skill.id === 'heal') {
      createEffect(scene, 'heal', { x: caster.position.x, z: caster.position.z }, 3);
      var P = party();
      var members = (world.party || (P ? P.getMembers() : [caster]));
      members.forEach(function (m) {
        if (m && m.alive) { m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.35)); }
      });
    } else if (skill.id === 'dragonbreak') {
      createEffect(scene, 'dragonbreak', { x: caster.position.x, z: caster.position.z }, skill.radius);
      if (C) { C.attackAoE(caster, caster.position, skill.radius, base + 30, { targets: list }); }
    }
    return { ok: true, skill: skill };
  }

  /* Ultimate: cần nộ 100 + đủ MP + hết cooldown. */
  function castUlt(caster, targets, world) {
    world = world || {};
    var list = targets || world.enemies || [];
    if (!caster || !caster.alive) { return { ok: false, reason: 'caster-dead' }; }
    if (ultCooldown > 0) { return { ok: false, reason: 'cooldown', remain: Math.ceil(ultCooldown) }; }
    if (rage < 100) { return { ok: false, reason: 'not-enough-rage', need: 100, have: Math.floor(rage) }; }
    if ((caster.mp || 0) < ULT.mpCost) { return { ok: false, reason: 'not-enough-mp', need: ULT.mpCost, have: caster.mp || 0 }; }
    caster.mp -= ULT.mpCost;
    rage = 0;
    ultCooldown = ULT.cooldown;
    var C = combat();
    var base = 120 + (caster.level || 1) * 10;
    createEffect(world.scene || null, 'dragon-ult', { x: caster.position.x, z: caster.position.z }, ULT.radius);
    createEffect(world.scene || null, 'ult-ring', { x: caster.position.x, z: caster.position.z }, ULT.radius);
    if (C) { C.attackAoE(caster, caster.position, ULT.radius, base, { targets: list }); }
    return { ok: true, skill: ULT };
  }

  /* ============ HIỆU ỨNG THREE.JS (tự biến mất sau 0.6–1.2s) ============ */
  function addMesh(scene, geo, color, opts) {
    var o = { color: color, transparent: true };
    if (opts) { for (var k in opts) { o[k] = opts[k]; } }
    var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(o));
    scene.add(m);
    return m;
  }
  /* scene có thể null (chạy logic không visual) -> trả null, damage vẫn chạy. */
  function createEffect(scene, type, pos, radius, extra) {
    extra = extra || {};
    if (!HAS_THREE || !scene || !pos) { return null; }
    /* Tọa độ world: position {x, z} dùng trực tiếp (không qua tile như bản gốc). */
    var x = pos.x, z = pos.z;
    var entry = null;
    if (type === 'swordwind') {
      var blade = addMesh(scene, new THREE.BoxGeometry(1.6, 0.5, 0.08), 0x5cb8ff, { opacity: 0.95 });
      blade.position.set(x, 1.2, z);
      blade.rotation.y = Math.atan2(extra.dx || 0, extra.dz || 1);
      entry = { kind: 'proj', m: blade, t: 0, dur: 0.9, dx: extra.dx || 0, dz: extra.dz || 1, dmg: extra.dmg || 40, caster: extra.caster, targets: extra.targets || [], hit: {}, x: x, z: z };
    } else if (type === 'fire') {
      for (var i = 0; i < 14; i++) {
        var dot = addMesh(scene, new THREE.SphereGeometry(0.08 + Math.random() * 0.12, 6, 6), i % 2 ? 0xffd94d : 0xff5a1e, { opacity: 1 });
        var a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6;
        dot.position.set(x, 0.5 + Math.random() * 1.3, z);
        fx.push({ kind: 'dot', m: dot, t: 0, dur: 0.35 + Math.random() * 0.35, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 4, vz: Math.sin(a) * sp });
      }
      var boom = addMesh(scene, new THREE.SphereGeometry(0.5, 12, 10), 0xff8a3c, { opacity: 0.5, depthWrite: false });
      boom.position.set(x, 0.8, z);
      entry = { kind: 'boom', m: boom, t: 0, dur: 0.45, maxR: (radius || 4) * 0.9 };
      createEffect(scene, 'ring', pos, radius, { color: 0xff8a3c });
    } else if (type === 'ice') {
      for (var j = 0; j < 14; j++) {
        var cone = addMesh(scene, new THREE.ConeGeometry(0.14, 0.7, 5), 0x9fdcff, { opacity: 0.95 });
        cone.position.set(x + (Math.random() * 6 - 3), 2 + Math.random() * 3, z + (Math.random() * 6 - 3));
        cone.rotation.x = Math.PI;
        fx.push({ kind: 'dot', m: cone, t: 0, dur: 0.5 + Math.random() * 0.4, vx: 0, vy: -6, vz: 0 });
      }
      entry = { kind: 'ring', m: null, t: 0, dur: 0.6, maxR: (radius || 3.5) };
      createEffect(scene, 'ring', pos, radius, { color: 0x9fdcff });
    } else if (type === 'thunder') {
      var pts = [];
      for (var s = 0; s <= 5; s++) {
        pts.push(new THREE.Vector3(x + (Math.random() * 1.6 - 0.8), 12 - s * 2.2, z + (Math.random() * 1.6 - 0.8)));
      }
      var line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xffe95c, transparent: true })
      );
      scene.add(line);
      entry = { kind: 'bolt', m: line, t: 0, dur: 0.25 };
      for (var b = 0; b < 8; b++) {
        var spark = addMesh(scene, new THREE.SphereGeometry(0.1, 6, 6), 0xffe95c, { opacity: 1 });
        spark.position.set(x, 0.5 + Math.random(), z);
        fx.push({ kind: 'dot', m: spark, t: 0, dur: 0.4, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 6 });
      }
    } else if (type === 'heal') {
      entry = { kind: 'ring', m: null, t: 0, dur: 0.8, maxR: 3 };
      createEffect(scene, 'ring', pos, 3, { color: 0x4dff6e });
    } else if (type === 'dragonbreak') {
      entry = { kind: 'ring', m: null, t: 0, dur: 0.7, maxR: radius || 6 };
      createEffect(scene, 'ring', pos, radius, { color: 0xffd94d });
    } else if (type === 'ult-ring' || type === 'ring') {
      var ring = addMesh(scene, new THREE.RingGeometry(0.85, 1, 40), extra.color || 0xffd94d, { side: THREE.DoubleSide, opacity: 0.95, depthWrite: false });
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.12, z);
      entry = { kind: 'ring', m: ring, t: 0, dur: 0.6, maxR: radius || 5 };
    } else if (type === 'warning') {
      /* Vòng đỏ cảnh báo AoE của boss — nhấp nháy, game tự nổ sau 1s. */
      var warn = addMesh(scene, new THREE.RingGeometry(0.85, 1, 40), 0xff2e2e, { side: THREE.DoubleSide, opacity: 0.7, depthWrite: false });
      warn.rotation.x = -Math.PI / 2;
      warn.position.set(x, 0.12, z);
      var disc = addMesh(scene, new THREE.CircleGeometry(1, 32), 0xff2e2e, { opacity: 0.18, depthWrite: false });
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.1, z);
      entry = { kind: 'warnring', m: warn, m2: disc, t: 0, dur: 1.0, maxR: radius || 6 };
    } else if (type === 'dragon-ult') {
      /* Rồng bay procedural: thân uốn bằng cone + box xếp xoắn ốc, bay vòng quanh caster. */
      for (var d = 0; d < 26; d++) {
        var ang = d * 0.35;
        var seg = addMesh(scene, new THREE.SphereGeometry(Math.max(0.1, 0.42 - d * 0.012), 8, 8), d % 2 ? 0xffd94d : 0x5cb8ff, { opacity: 1 });
        seg.position.set(x + Math.cos(ang) * (1.5 + d * 0.5), 1.6 + Math.sin(d * 0.6) * 1.2, z + Math.sin(ang) * (1.5 + d * 0.5));
        fx.push({ kind: 'dot', m: seg, t: 0, dur: 0.9, vx: Math.cos(ang) * 3, vy: 1, vz: Math.sin(ang) * 3 });
      }
      var head = addMesh(scene, new THREE.ConeGeometry(0.5, 1.4, 6), 0xffd94d, { opacity: 1 });
      head.position.set(x, 2.6, z);
      head.rotation.x = Math.PI / 2;
      fx.push({ kind: 'dot', m: head, t: 0, dur: 0.9, vx: 0, vy: 2, vz: 0 });
      return { ok: true, type: type };
    }
    if (entry) { fx.push(entry); }
    return entry;
  }

  function removeFx(scene, f) {
    if (!f) { return; }
    [f.m, f.m2].forEach(function (m) {
      if (!m) { return; }
      if (m.parent) { m.parent.remove(m); }
      if (m.geometry) { m.geometry.dispose(); }
      if (m.material) { m.material.dispose(); }
    });
  }

  function updateFx(dt, scene) {
    var C = combat();
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i];
      f.t += dt;
      var k = f.t / f.dur;
      if (k >= 1) { removeFx(scene, f); fx.splice(i, 1); continue; }
      if (f.kind === 'ring') {
        if (f.m) {
          var r = f.maxR * (0.15 + 0.85 * k);
          f.m.scale.set(r, r, 1);
          f.m.material.opacity = 0.95 * (1 - k);
        }
      } else if (f.kind === 'warnring') {
        if (f.m) {
          f.m.scale.set(f.maxR, f.maxR, 1);
          f.m.material.opacity = 0.4 + 0.3 * Math.sin(f.t * 18);
        }
        if (f.m2) { f.m2.scale.set(f.maxR, f.maxR, 1); }
      } else if (f.kind === 'dot') {
        f.m.position.x += f.vx * dt;
        f.m.position.y += f.vy * dt;
        f.m.position.z += f.vz * dt;
        if (f.vy < 0) { f.vy -= 12 * dt; }
        f.m.material.opacity = 1 - k;
      } else if (f.kind === 'bolt') {
        f.m.material.opacity = 1 - k * 0.7;
      } else if (f.kind === 'boom') {
        var br = f.maxR * k;
        f.m.scale.set(br, br, br);
        f.m.material.opacity = 0.5 * (1 - k);
      } else if (f.kind === 'proj') {
        /* Kiếm khí bay 16 đơn vị/giây, chạm quái thì gây damage rồi bay tiếp. */
        var sp = 16;
        f.x += f.dx * sp * dt;
        f.z += f.dz * sp * dt;
        f.m.position.set(f.x, 1.2, f.z);
        f.m.material.opacity = 1 - k * 0.5;
        if (C && f.targets) {
          for (var j = 0; j < f.targets.length; j++) {
            var e = f.targets[j];
            if (!e || !e.alive || f.hit[e.id]) { continue; }
            if (dist2d(e.position.x, e.position.z, f.x, f.z) < 0.9) {
              f.hit[e.id] = true;
              C.takeDamage(e, C.computeDamage(f.dmg, e.def), { crit: Math.random() < 0.15, attacker: f.caster, skill: true });
            }
          }
        }
      }
    }
  }

  /* Tick cooldown skill + ultimate + nộ (không giảm theo thời gian) + hiệu ứng. */
  function update(dt, scene) {
    if (!dt || dt <= 0) { return; }
    for (var id in cooldowns) { if (cooldowns[id] > 0) { cooldowns[id] -= dt; } }
    if (ultCooldown > 0) { ultCooldown -= dt; }
    updateFx(dt, scene);
  }

  function reset() {
    cooldowns = {}; ultCooldown = 0; rage = 0; fx = [];
  }

  var api = {
    SKILLS: SKILLS, ULT: ULT, FREEZE_TIME: FREEZE_TIME,
    getSkills: getSkills, getUlt: getUlt, getCooldowns: getCooldowns,
    getRage: getRage, setRage: setRage, noteHit: noteHit,
    cast: cast, castUlt: castUlt, createEffect: createEffect,
    update: update, reset: reset
  };
  window.PixiEngine.Wuxia.Skills = api;
  window.PixiEngine.WuxiaSkills = api;
})();
