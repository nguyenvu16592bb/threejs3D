'use strict';
/* WuxiaCharacters.js — Nhóm WUXIA: Combat / Skills / Enemies / Boss / Characters / Party.
   Tạo nhân vật procedural low-poly + gắn GLB thật khi load được.
   Logic tái dùng (viết lại gọn) từ 3D-Model/WUXIA3D-3D.js — game Quan Ải Long Ngâm:
   party Lâm Phong Kiếm / Thiết Ngưu Thương / Bạch Tuyết Pháp, quái Tuyết Yêu /
   Sơn Tặc / Hồ Ly Tinh, Boss Long Ngâm. KHÔNG copy nguyên file gốc.
   Hợp đồng chung: window.PixiEngine.Wuxia.Characters; vị trí {x, z} mặt đất;
   an toàn khi THREE undefined (logic số vẫn chạy, mesh/group = null);
   KHÔNG tự tạo renderer/scene/canvas, KHÔNG tự vẽ HUD. */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};

  var HAS_THREE = (typeof THREE !== 'undefined');
  var _idSeq = 1;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hasDoc() { return (typeof document !== 'undefined'); }

  /* ============ ĐỊNH NGHĨA NHÂN VẬT (số liệu gốc từ WUXIA3D-3D.js) ============ */
  var PARTY_DEFS = {
    lamphong: {
      key: 'lamphong', name: 'Lâm Phong', title: 'Lâm Phong Kiếm',
      kind: 'hero', weapon: 'sword', weaponName: 'Kiếm',
      robe: 0x2b5cb8, trim: 0xffd94d, skin: 0xf2c89b, hair: 0x1a1a1a,
      maxHp: 320, maxMp: 160, atk: 26, def: 4, speed: 4.6,
      range: 1.6, attackInterval: 0.55, scale: 1.0,
      desc: 'Kiếm khách cân bằng — nhanh, đều, dễ chơi.',
      glb: 'models/RobotExpressive.glb', glbScale: 1.3
    },
    thietnguu: {
      key: 'thietnguu', name: 'Thiết Ngưu', title: 'Thiết Ngưu Thương',
      kind: 'hero', weapon: 'spear', weaponName: 'Thương',
      robe: 0xb85c1e, trim: 0xffe9a8, skin: 0xe8b88a, hair: 0x2a1a08,
      maxHp: 420, maxMp: 100, atk: 22, def: 8, speed: 4.2,
      range: 2.0, attackInterval: 0.85, scale: 1.05,
      desc: 'Thương thủ trâu bò — máu nhiều, thủ cao, đánh chậm.',
      glb: null, glbScale: 1
    },
    bachtuyet: {
      key: 'bachtuyet', name: 'Bạch Tuyết', title: 'Bạch Tuyết Pháp',
      kind: 'hero', weapon: 'staff', weaponName: 'Pháp Trượng',
      robe: 0x7a3fd4, trim: 0xe0aaff, skin: 0xf7d3ae, hair: 0x3a2a5e,
      maxHp: 260, maxMp: 240, atk: 30, def: 2, speed: 4.0,
      range: 3.5, attackInterval: 0.9, scale: 1.0,
      desc: 'Pháp sư tầm xa — phép mạnh, máu thấp, cần giữ khoảng cách.',
      glb: null, glbScale: 1
    }
  };

  var NPC_DEFS = {
    guard: {
      key: 'guard', name: 'Vệ Binh A Hổ', kind: 'npc', weapon: 'spear',
      robe: 0x2e5e2e, trim: 0xc9a94f, skin: 0xf2c89b, hair: 0x111111,
      maxHp: 9999, maxMp: 0, atk: 0, def: 0, speed: 0,
      range: 1, attackInterval: 1, scale: 1.0, level: 30,
      glb: 'models/CesiumMan.glb', glbScale: 1.0,
      desc: 'Vệ binh cổng thành Trường Bạch — giao nhiệm vụ diệt Tuyết Yêu.'
    },
    elder: {
      key: 'elder', name: 'Trưởng Lão Tuyết', kind: 'npc', weapon: 'staff',
      robe: 0xe8eef7, trim: 0x5cb8ff, skin: 0xf2c89b, hair: 0xe8e8e8,
      maxHp: 9999, maxMp: 0, atk: 0, def: 0, speed: 0,
      range: 1, attackInterval: 1, scale: 1.0, level: 40,
      glb: 'models/CesiumMan.glb', glbScale: 1.0,
      desc: 'Trưởng lão làng — chỉ đường lên Tuyết Sơn, cảnh báo về Long Ngâm.'
    }
  };

  var ENEMY_DEFS = {
    snow: {
      key: 'snow', name: 'Tuyết Yêu', kind: 'enemy', body: 0xdfe8f2, belly: 0xffffff,
      horns: true, maxHp: 60, maxMp: 0, atk: 8, def: 0, speed: 1.6,
      range: 1.1, attackInterval: 1.1, scale: 1.0, xp: 25, gold: 12, level: 1
    },
    bandit: {
      key: 'bandit', name: 'Sơn Tặc', kind: 'enemy', body: 0x4a3a28, belly: 0x5e4632,
      horns: false, maxHp: 90, maxMp: 0, atk: 12, def: 2, speed: 2.0,
      range: 1.1, attackInterval: 1.1, scale: 1.05, xp: 40, gold: 22, level: 3
    },
    fox: {
      key: 'fox', name: 'Hồ Ly Tinh', kind: 'elite', body: 0xc98a3c, belly: 0xe8b88a,
      horns: true, maxHp: 220, maxMp: 0, atk: 18, def: 3, speed: 1.8,
      range: 1.3, attackInterval: 1.0, scale: 1.35, xp: 120, gold: 60, level: 6,
      glb: 'models/Fox.glb', glbScale: 1.4,
      desc: 'Tinh anh — máu x3 quái thường, rơi nhiều vàng.'
    },
    boss: {
      key: 'boss', name: 'Long Ngâm Lão Tổ', kind: 'boss', weapon: 'spear',
      robe: 0x8a6d1f, trim: 0xffd94d, skin: 0x5e4632, hair: 0xffd94d,
      maxHp: 1200, maxMp: 0, atk: 26, def: 5, speed: 1.4,
      range: 1.8, attackInterval: 1.4, scale: 1.9, xp: 600, gold: 300, level: 15
    }
  };

  var GLB_URLS = {
    hero: 'models/RobotExpressive.glb',
    fox: 'models/Fox.glb',
    npc: 'models/CesiumMan.glb'
  };

  /* ============ DỰNG MESH PROCEDURAL (chỉ chạy khi có THREE) ============ */
  function mat(color, opts) {
    var o = { color: color };
    if (opts) { for (var k in opts) { o[k] = opts[k]; } }
    return new THREE.MeshLambertMaterial(o);
  }
  function part(geo, material, x, y, z, parent) {
    var m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  /* Người low-poly bằng khối (mặt hướng +Z) — gọn lại từ buildHumanoid gốc. */
  function buildHumanoid(o) {
    var S = o.scale || 1;
    var g = new THREE.Group();
    var robe = mat(o.robe), skin = mat(o.skin), hair = mat(o.hair), trim = mat(o.trim || 0xc9a94f);
    function leg(x) {
      var grp = new THREE.Group(); grp.position.set(x, 0.88, 0); g.add(grp);
      part(new THREE.BoxGeometry(0.22, 0.88, 0.24), robe, 0, -0.44, 0, grp);
      return grp;
    }
    var legL = leg(-0.17), legR = leg(0.17);
    part(new THREE.BoxGeometry(0.68, 0.55, 0.4), robe, 0, 0.95, 0, g); /* váy áo */
    part(new THREE.BoxGeometry(0.62, 0.72, 0.36), robe, 0, 1.45, 0, g); /* thân */
    part(new THREE.BoxGeometry(0.64, 0.1, 0.38), trim, 0, 1.15, 0, g);
    part(new THREE.BoxGeometry(0.64, 0.08, 0.38), trim, 0, 1.78, 0, g);
    function arm(x) {
      var grp = new THREE.Group(); grp.position.set(x, 1.72, 0); g.add(grp);
      part(new THREE.BoxGeometry(0.18, 0.72, 0.2), robe, 0, -0.36, 0, grp);
      return grp;
    }
    var armL = arm(-0.42), armR = arm(0.42);
    var head = new THREE.Group(); head.position.set(0, 1.98, 0); g.add(head);
    part(new THREE.SphereGeometry(0.26, 12, 10), skin, 0, 0, 0, head);
    var hairTop = part(new THREE.SphereGeometry(0.27, 12, 10), hair, 0, 0.06, -0.03, head);
    hairTop.scale.set(1, 0.75, 1);
    part(new THREE.SphereGeometry(0.09, 8, 6), hair, 0, 0.3, 0, head);
    part(new THREE.SphereGeometry(0.035, 6, 6), mat(0x1a1a1a), -0.09, 0.02, 0.24, head);
    part(new THREE.SphereGeometry(0.035, 6, 6), mat(0x1a1a1a), 0.09, 0.02, 0.24, head);
    /* Vũ khí gắn tay phải — kiếm / thương / quạt / trượng. */
    var weapon = null;
    if (o.weapon) {
      weapon = new THREE.Group();
      if (o.weapon === 'sword') {
        part(new THREE.BoxGeometry(0.07, 0.95, 0.03), mat(0xdfe8f2), 0, -0.5, 0.05, weapon);
        part(new THREE.BoxGeometry(0.22, 0.06, 0.06), mat(0xc9a94f), 0, -0.02, 0.05, weapon);
        part(new THREE.BoxGeometry(0.06, 0.22, 0.06), mat(0x5e4632), 0, 0.1, 0.05, weapon);
      } else if (o.weapon === 'spear') {
        part(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 6), mat(0x7d5a34), 0, -0.6, 0.05, weapon);
        var tip = part(new THREE.ConeGeometry(0.09, 0.4, 6), mat(0xff8a3c), 0, -1.8, 0.05, weapon);
        tip.rotation.x = Math.PI;
      } else if (o.weapon === 'fan') {
        part(new THREE.BoxGeometry(0.55, 0.4, 0.03), mat(0x9d4edd), 0, -0.85, 0.05, weapon);
        part(new THREE.BoxGeometry(0.06, 0.25, 0.05), mat(0x5e4632), 0, -0.62, 0.05, weapon);
      } else if (o.weapon === 'staff') {
        part(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6), mat(0x6b4a2a), 0, -0.6, 0.05, weapon);
        part(new THREE.SphereGeometry(0.12, 8, 8), mat(0x5cb8ff, { emissive: 0x224488 }), 0, -1.6, 0.05, weapon);
      }
      weapon.position.set(0, -0.72, 0.05);
      armR.add(weapon);
    }
    g.scale.set(S, S, S);
    return { group: g, parts: { armL: armL, armR: armR, legL: legL, legR: legR, head: head, weapon: weapon }, height: 2.3 * S };
  }

  /* Quái low-poly — gọn lại từ buildMonster gốc. */
  function buildMonster(o) {
    var S = o.scale || 1;
    var g = new THREE.Group();
    var body = mat(o.body), belly = mat(o.belly || o.body);
    function leg(x) {
      var grp = new THREE.Group(); grp.position.set(x, 0.5, 0); g.add(grp);
      part(new THREE.BoxGeometry(0.24, 0.5, 0.26), body, 0, -0.25, 0, grp);
      return grp;
    }
    var legL = leg(-0.2), legR = leg(0.2);
    var torso = part(new THREE.SphereGeometry(0.55, 12, 10), body, 0, 0.95, 0, g);
    torso.scale.set(1, 1.1, 0.9);
    var bl = part(new THREE.SphereGeometry(0.38, 10, 8), belly, 0, 0.85, 0.18, g);
    bl.scale.set(1, 1, 0.6);
    var head = new THREE.Group(); head.position.set(0, 1.6, 0); g.add(head);
    part(new THREE.SphereGeometry(0.36, 12, 10), body, 0, 0, 0, head);
    if (o.horns) {
      var h1 = part(new THREE.ConeGeometry(0.1, 0.42, 6), mat(0xd8cdb8), -0.24, 0.42, 0, head);
      h1.rotation.z = 0.5;
      var h2 = part(new THREE.ConeGeometry(0.1, 0.42, 6), mat(0xd8cdb8), 0.24, 0.42, 0, head);
      h2.rotation.z = -0.5;
    }
    part(new THREE.SphereGeometry(0.06, 6, 6), mat(0xff2e2e, { emissive: 0x880000 }), -0.13, 0.05, 0.3, head);
    part(new THREE.SphereGeometry(0.06, 6, 6), mat(0xff2e2e, { emissive: 0x880000 }), 0.13, 0.05, 0.3, head);
    function arm(x) {
      var grp = new THREE.Group(); grp.position.set(x, 1.25, 0); g.add(grp);
      part(new THREE.BoxGeometry(0.2, 0.7, 0.22), body, 0, -0.35, 0, grp);
      return grp;
    }
    var armL = arm(-0.55), armR = arm(0.55);
    g.scale.set(S, S, S);
    return { group: g, parts: { armL: armL, armR: armR, legL: legL, legR: legR, head: head }, height: 2.0 * S };
  }

  /* Bảng tên + thanh HP dạng sprite (luôn hướng camera). Bỏ qua khi không có document/THREE. */
  function makeNameSprite(text, color, scale) {
    if (!HAS_THREE || !hasDoc()) { return null; }
    var cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    var ctx = cv.getContext('2d');
    if (ctx) {
      ctx.font = 'bold 30px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = '#000';
      ctx.strokeText(text, 128, 32);
      ctx.fillStyle = color || '#ffffff';
      ctx.fillText(text, 128, 32);
    }
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    sp.scale.set(scale || 2.4, (scale || 2.4) * 0.25, 1);
    return sp;
  }
  function makeHpBar(ch) {
    if (!HAS_THREE) { return; }
    var hpBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x111111, depthWrite: false }));
    hpBg.scale.set(1.3, 0.16, 1);
    hpBg.position.y = ch.height + 0.55;
    var hpFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x4dff6e, depthWrite: false }));
    hpFg.scale.set(1.26, 0.1, 1);
    hpFg.position.y = ch.height + 0.55;
    hpFg.visible = false;
    var color = ch.kind === 'hero' ? '#8dff9e' : ch.kind === 'npc' ? '#ffd94d' : ch.kind === 'boss' ? '#ffb347' : '#ffffff';
    var nameSp = makeNameSprite(ch.name, color, ch.kind === 'boss' ? 3.4 : 2.2);
    if (nameSp) { nameSp.position.y = ch.height + 0.85; ch.group.add(nameSp); }
    ch.group.add(hpBg); ch.group.add(hpFg);
    ch.hpBg = hpBg; ch.hpFg = hpFg; ch.nameSprite = nameSp;
  }

  /* ============ TẠO NHÂN VẬT ============ */
  function createCharacter(def, opts) {
    opts = opts || {};
    var ch = {
      id: 'wuxia-' + (_idSeq++),
      name: opts.name || def.name,
      title: opts.title || def.title || opts.name || def.name, /* v5.0.0 fix: giữ tên đầy đủ (Lâm Phong Kiếm...) — trước đây def.title bị rơi */
      kind: def.kind, /* 'hero' | 'npc' | 'enemy' | 'elite' | 'boss' */
      weapon: def.weapon || null,
      level: opts.level || def.level || 1,
      hp: def.maxHp, maxHp: def.maxHp,
      mp: def.maxMp || 0, maxMp: def.maxMp || 0,
      atk: def.atk, def: def.def || 0, speed: def.speed,
      range: def.range || 1.5, attackInterval: def.attackInterval || 1,
      scale: def.scale || 1,
      xp: def.xp || 0, gold: def.gold || 0,
      position: { x: (opts.x !== undefined ? opts.x : 0), z: (opts.z !== undefined ? opts.z : 0) },
      home: { x: (opts.x !== undefined ? opts.x : 0), z: (opts.z !== undefined ? opts.z : 0) },
      facing: opts.facing || 0,
      alive: true,
      mesh: null, group: null, parts: null, height: 2.2,
      mixer: null, clips: {}, animCur: null, animAction: null,
      attackCd: 0, swingT: 0, flashT: 0, slowT: 0, frozenT: 0,
      walkPhase: Math.random() * 6, respawnT: 0,
      glbUrl: def.glb || null, glbScale: def.glbScale || 1,
      isElite: def.kind === 'elite', isBoss: def.kind === 'boss', isNPC: def.kind === 'npc',
      enraged: false
    };
    if (HAS_THREE) {
      var built = null;
      if (ch.kind === 'enemy' || ch.kind === 'elite') {
        built = buildMonster(def);
      } else {
        built = buildHumanoid(def);
        if (ch.isBoss) {
          /* Sừng rồng cho boss Long Ngâm (như bản gốc). */
          var hornMat = mat(0xffd94d);
          [-0.2, 0.2].forEach(function (dx) {
            var horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), hornMat);
            horn.position.set(dx, 2.2, 0);
            horn.rotation.z = dx > 0 ? -0.4 : 0.4;
            horn.castShadow = true;
            built.parts.head.add(horn);
          });
          built.height = 4.2;
        }
      }
      ch.group = built.group;
      ch.mesh = built.group;
      ch.parts = built.parts;
      ch.height = built.height || 2.2;
      makeHpBar(ch);
      syncTransform(ch);
    }
    return ch;
  }

  function resolveDef(table, keyOrDef) {
    if (typeof keyOrDef === 'string') { return table[keyOrDef] || null; }
    return keyOrDef || null;
  }

  function createHero(keyOrDef, opts) {
    var def = resolveDef(PARTY_DEFS, keyOrDef);
    if (!def) { return null; }
    return createCharacter(def, opts);
  }
  function createNPC(keyOrDef, opts) {
    var def = resolveDef(NPC_DEFS, keyOrDef);
    if (!def) { return null; }
    return createCharacter(def, opts);
  }
  function createEnemy(keyOrDef, opts) {
    var def = resolveDef(ENEMY_DEFS, keyOrDef);
    if (!def) { return null; }
    return createCharacter(def, opts);
  }
  function createParty(opts) {
    opts = opts || {};
    return [
      createHero('lamphong', { x: opts.x || 0, z: (opts.z || 0) + 1 }),
      createHero('thietnguu', { x: (opts.x || 0) - 1.2, z: (opts.z || 0) + 2 }),
      createHero('bachtuyet', { x: (opts.x || 0) + 1.2, z: (opts.z || 0) + 2 })
    ];
  }

  /* ============ GLB THẬT — thay mesh procedural ============ */
  /* gltf: kết quả GLTFLoader ({scene, animations}) hoặc trực tiếp một THREE.Group.
     Trả về true nếu thay xong, false nếu không có mesh/THREE. Không tự load file
     (việc fetch GLB do nhóm Models / Game lo — ở đây chỉ gắn vào nhân vật). */
  function attachGLB(character, gltf) {
    if (!character || !HAS_THREE || !character.group || !gltf) { return false; }
    var scene = gltf.scene || gltf;
    if (!scene || typeof scene.traverse !== 'function') { return false; }
    /* Gỡ mesh procedural cũ, giữ lại sprite HP/tên (Sprite không phải Mesh). */
    var keep = [];
    var children = character.group.children.slice();
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c.isSprite) { keep.push(c); continue; }
      character.group.remove(c);
    }
    var scale = character.glbScale || 1;
    scene.scale.set(scale, scale, scale);
    scene.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
    character.group.add(scene);
    for (var j = 0; j < keep.length; j++) { character.group.add(keep[j]); }
    character.parts = null;
    character.glbRoot = scene;
    if (gltf.animations && gltf.animations.length && typeof THREE.AnimationMixer === 'function') {
      character.mixer = new THREE.AnimationMixer(scene);
      character.clips = {};
      gltf.animations.forEach(function (a) { character.clips[a.name] = a; });
    }
    character.height = character.isBoss ? 4.2 : (character.kind === 'elite' ? 1.6 : 2.4);
    syncTransform(character);
    return true;
  }

  /* ============ BIẾN ĐỔI / HOẠT ẢNH ============ */
  function syncTransform(ch) {
    if (!ch.group) { return; }
    ch.group.position.set(ch.position.x, 0, ch.position.z);
    ch.group.rotation.y = ch.facing;
  }
  function setPosition(ch, x, z) {
    if (!ch) { return; }
    ch.position.x = x; ch.position.z = z;
    if (ch.group) { ch.group.position.x = x; ch.group.position.z = z; }
  }
  function setFacing(ch, angle) {
    if (!ch) { return; }
    ch.facing = angle;
    if (ch.group) { ch.group.rotation.y = angle; }
  }
  function faceTowards(ch, x, z) {
    if (!ch) { return; }
    setFacing(ch, Math.atan2(x - ch.position.x, z - ch.position.z));
  }

  function setAnim(ch, name) {
    if (!ch.mixer || !ch.clips[name] || ch.animCur === name) { return; }
    var action = ch.mixer.clipAction(ch.clips[name]);
    if (ch.animAction) { ch.animAction.fadeOut(0.15); }
    action.reset().fadeIn(0.15).play();
    ch.animAction = action;
    ch.animCur = name;
  }

  /* Chạy animation đi/đánh/chết. moving=true khi đang di chuyển. */
  function animate(ch, dt, moving) {
    if (!ch) { return; }
    syncTransform(ch);
    if (ch.mixer) {
      ch.mixer.update(dt);
      var want = null;
      if (!ch.alive) { want = ch.clips.Death ? 'Death' : null; }
      else if (ch.swingT > 0) { want = ch.clips.Punch ? 'Punch' : null; }
      else if (moving) { want = ch.clips.Running ? 'Running' : (ch.clips.Walking ? 'Walking' : null); }
      else { want = ch.clips.Idle ? 'Idle' : null; }
      if (want) { setAnim(ch, want); }
    } else if (ch.parts) {
      if (moving) {
        ch.walkPhase += dt * 10;
        var s = Math.sin(ch.walkPhase);
        ch.parts.legL.rotation.x = s * 0.65;
        ch.parts.legR.rotation.x = -s * 0.65;
        ch.parts.armL.rotation.x = -s * 0.5;
        ch.parts.armR.rotation.x = s * 0.5;
        if (ch.group) { ch.group.position.y = Math.abs(Math.cos(ch.walkPhase)) * 0.06; }
      } else {
        ch.parts.legL.rotation.x *= 0.8; ch.parts.legR.rotation.x *= 0.8;
        ch.parts.armL.rotation.x *= 0.8; ch.parts.armR.rotation.x *= 0.8;
        if (ch.group) { ch.group.position.y = 0; }
      }
      if (ch.swingT > 0) {
        ch.swingT -= dt;
        if (ch.parts.armR) { ch.parts.armR.rotation.x = -2.2 * (1 - ch.swingT / 0.28); }
      }
    }
    /* Nhấp nháy đỏ khi vừa trúng đòn. */
    if (ch.flashT > 0 && ch.group) {
      ch.flashT -= dt;
      var on = ch.flashT > 0;
      ch.group.traverse(function (o) {
        if (o.isMesh && o.material && o.material.emissive) {
          o.material.emissive.setHex(on ? 0x881111 : 0x000000);
        }
      });
    }
  }

  function updateHpBar(ch) {
    if (!ch || !ch.hpFg || !ch.hpBg) { return; }
    var ratio = clamp(ch.hp / ch.maxHp, 0, 1);
    ch.hpFg.scale.x = 1.26 * ratio;
    ch.hpFg.material.color.setHex(ratio > 0.5 ? 0x4dff6e : ratio > 0.25 ? 0xffc93c : 0xff2e2e);
    ch.hpFg.visible = (ch.hp < ch.maxHp && ch.alive);
    ch.hpBg.visible = ch.hpFg.visible;
  }

  var api = {
    PARTY_DEFS: PARTY_DEFS, NPC_DEFS: NPC_DEFS, ENEMY_DEFS: ENEMY_DEFS, GLB_URLS: GLB_URLS,
    createHero: createHero, createNPC: createNPC, createEnemy: createEnemy,
    createParty: createParty, createCharacter: createCharacter,
    attachGLB: attachGLB,
    setPosition: setPosition, setFacing: setFacing, faceTowards: faceTowards,
    syncTransform: syncTransform, animate: animate, updateHpBar: updateHpBar,
    hasThree: function () { return HAS_THREE; }
  };
  window.PixiEngine.Wuxia.Characters = api;
  window.PixiEngine.WuxiaCharacters = api;
})();
