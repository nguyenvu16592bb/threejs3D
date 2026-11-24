/* ============================================================
 * WuxiaDungeon.js — Cổng portal + đấu trường boss Long Ngâm
 * (PixiJS 3D Engine v5.0). Vanilla JS, IIFE, 'use strict'.
 * three.js r128 UMD (THREE global). KHÔNG tự tạo renderer/canvas.
 * Portal ở cuối map (tile 50,30 — khớp WuxiaWorld.getSpawnPoint('dungeon')).
 * Arena boss đặt ở vùng riêng (tâm x=200) để không chồng lên phố;
 * enter() hiện arena, exit() ẩn arena. Collision arena: ngoài r=18
 * là chặn, 4 cột lửa chặn trong bán kính 1.2.
 * An toàn khi THREE undefined: create() log rõ + trả false, các hàm
 * khác trả giá trị mặc định, không crash.
 * ============================================================ */
(function () {
'use strict';

window.PixiEngine = window.PixiEngine || {};
window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};
var PE = window.PixiEngine;

/* Portal ở tile (50,30) -> world (44,4) */
var PORTAL_TILE = { x: 50, y: 30 };
var PORTAL_POS = { x: (50 - 28) * 2, z: (30 - 28) * 2 };   /* (44, 4) */
var PORTAL_RADIUS = 3;        /* isNearPortal */
var ARENA_CENTER = { x: 200, y: 0, z: 0 };
var ARENA_R = 18;
var PILLAR_R = 1.2;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

var Dungeon = {
  _three: null, _scene: null,
  _portal: null, _portalRing: null, _portalDisc: null, _portalLight: null,
  _arena: null, _flames: [], _arenaLight: null,
  _inDungeon: false, _time: 0,
  _onEnter: null, _onExit: null, _built: false,

  /* create(scene, onEnter, onExit?) — onExit có thể là hàm hoặc {onExit}. */
  create: function (scene, onEnter, onExit) {
    var T = (typeof window !== 'undefined') ? window.THREE : null;
    if (!T) { console.warn('[WuxiaDungeon] THREE chưa có — create() bỏ qua.'); return false; }
    if (!scene) { console.warn('[WuxiaDungeon] create(scene) thiếu scene.'); return false; }
    if (this._built) this.dispose();
    this._three = T; this._scene = scene;
    this._onEnter = (typeof onEnter === 'function') ? onEnter : null;
    this._onExit = (typeof onExit === 'function') ? onExit
      : (onExit && typeof onExit.onExit === 'function') ? onExit.onExit : null;
    this._flames = [];
    this._time = 0;
    this._inDungeon = false;
    this._buildPortal();
    this._buildArena();
    this._built = true;
    return true;
  },

  /* ---------- Portal ---------- */
  _labelSprite: function (text) {
    try {
      if (typeof document === 'undefined') return null;
      var cv = document.createElement('canvas');
      cv.width = 512; cv.height = 96;
      var ctx = cv.getContext('2d');
      if (!ctx) return null;
      ctx.font = 'bold 44px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = '#000';
      ctx.strokeText(text, 256, 48);
      ctx.fillStyle = '#d8b4fe';
      ctx.fillText(text, 256, 48);
      var tex = new this._three.CanvasTexture(cv);
      var sp = new this._three.Sprite(
        new this._three.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(7, 1.3, 1);
      return sp;
    } catch (e) { return null; }
  },

  _buildPortal: function () {
    var T = this._three;
    var g = new T.Group();
    g.name = 'WuxiaPortal';
    var px = PORTAL_POS.x, pz = PORTAL_POS.z;
    /* bệ đá tròn */
    var base = new T.Mesh(new T.CylinderGeometry(3.4, 3.8, 0.5, 24),
      new T.MeshLambertMaterial({ color: 0x7a7264 }));
    base.position.set(px, 0.25, pz);
    base.receiveShadow = true;
    g.add(base);
    /* vòng portal phát sáng xanh/tím */
    var ring = new T.Mesh(new T.TorusGeometry(2.6, 0.35, 10, 28),
      new T.MeshBasicMaterial({ color: 0x9d4edd }));
    ring.position.set(px, 2.6, pz);
    ring.rotation.y = Math.PI / 4;
    g.add(ring);
    this._portalRing = ring;
    /* lõi portal */
    var disc = new T.Mesh(new T.CircleGeometry(2.3, 24),
      new T.MeshBasicMaterial({
        color: 0x6a1fb0, transparent: true, opacity: 0.75, side: T.DoubleSide
      }));
    disc.position.set(px, 2.6, pz);
    disc.rotation.y = Math.PI / 4;
    g.add(disc);
    this._portalDisc = disc;
    /* ánh sáng tím */
    var pl = new T.PointLight(0x9d4edd, 1.2, 18);
    pl.position.set(px, 3, pz);
    g.add(pl);
    this._portalLight = pl;
    /* chữ trên portal */
    var label = this._labelSprite('LONG NGÂM • DUNGEON');
    if (label) { label.position.set(px, 6.2, pz); g.add(label); }
    this._scene.add(g);
    this._portal = g;
  },

  isNearPortal: function (pos) {
    if (!pos || typeof pos.x !== 'number' || typeof pos.z !== 'number') return false;
    var dx = pos.x - PORTAL_POS.x, dz = pos.z - PORTAL_POS.z;
    return Math.sqrt(dx * dx + dz * dz) < PORTAL_RADIUS;
  },
  getPortalPos: function () {
    return { x: PORTAL_POS.x, y: 0, z: PORTAL_POS.z };
  },

  /* ---------- Arena boss ---------- */
  _buildArena: function () {
    var T = this._three;
    var g = new T.Group();
    g.name = 'WuxiaArena';
    var cx = ARENA_CENTER.x, cz = ARENA_CENTER.z;
    /* sàn đá tròn r=18 */
    var floor = new T.Mesh(new T.CircleGeometry(ARENA_R, 40),
      new T.MeshLambertMaterial({ color: 0x6e675c }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.05, cz);
    floor.receiveShadow = true;
    g.add(floor);
    /* vòng đá trang trí giữa sàn */
    var ring = new T.Mesh(new T.RingGeometry(6, 6.6, 40),
      new T.MeshBasicMaterial({ color: 0xc9a94f, transparent: true, opacity: 0.7, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.07, cz);
    g.add(ring);
    var ring2 = new T.Mesh(new T.RingGeometry(12, 12.4, 40),
      new T.MeshBasicMaterial({ color: 0x9d4edd, transparent: true, opacity: 0.45, side: T.DoubleSide }));
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.set(cx, 0.07, cz);
    g.add(ring2);
    /* tường bao quanh (nhìn từ trong) */
    var wall = new T.Mesh(
      new T.CylinderGeometry(ARENA_R + 0.5, ARENA_R + 0.5, 4.5, 40, 1, true),
      new T.MeshLambertMaterial({ color: 0x4a4038, side: T.BackSide }));
    wall.position.set(cx, 2.25, cz);
    g.add(wall);
    /* 4 cột lửa ở 4 góc chéo */
    var self = this;
    [[-12, -12], [12, -12], [-12, 12], [12, 12]].forEach(function (p) {
      var x = cx + p[0], z = cz + p[1];
      var col = new T.Mesh(new T.CylinderGeometry(0.7, 0.9, 3.4, 8),
        new T.MeshLambertMaterial({ color: 0x7a7264 }));
      col.position.set(x, 1.7, z);
      col.castShadow = true;
      g.add(col);
      var bowl = new T.Mesh(new T.CylinderGeometry(1.0, 0.6, 0.5, 8),
        new T.MeshLambertMaterial({ color: 0x3a322a }));
      bowl.position.set(x, 3.6, z);
      g.add(bowl);
      var flame = new T.Mesh(new T.ConeGeometry(0.55, 1.6, 8),
        new T.MeshLambertMaterial({ color: 0xff8a3c, emissive: 0xcc4400 }));
      flame.position.set(x, 4.6, z);
      g.add(flame);
      self._flames.push(flame);
    });
    /* 1 đèn cam giữa arena (đủ sáng, không thêm đèn mỗi cột) */
    var light = new T.PointLight(0xff8a3c, 0.9, 30);
    light.position.set(cx, 6, cz);
    g.add(light);
    this._arenaLight = light;
    /* cổng ra phía nam (z = +17): 2 trụ + xà + dấu phát sáng xanh */
    [-2.2, 2.2].forEach(function (dx) {
      var pillar = new T.Mesh(new T.BoxGeometry(0.9, 5, 0.9),
        new T.MeshLambertMaterial({ color: 0x6e3f2a }));
      pillar.position.set(cx + dx, 2.5, cz + 17);
      pillar.castShadow = true;
      g.add(pillar);
    });
    var beam = new T.Mesh(new T.BoxGeometry(5.6, 0.8, 1),
      new T.MeshLambertMaterial({ color: 0x1e4d3a }));
    beam.position.set(cx, 5.2, cz + 17);
    g.add(beam);
    var exitGlow = new T.Mesh(new T.CircleGeometry(1.6, 20),
      new T.MeshBasicMaterial({ color: 0x4dff6e, transparent: true, opacity: 0.6, side: T.DoubleSide }));
    exitGlow.rotation.x = -Math.PI / 2;
    exitGlow.position.set(cx, 0.09, cz + 17);
    g.add(exitGlow);
    var label = this._labelSprite('CỔNG RA');
    if (label) { label.position.set(cx, 6.4, cz + 17); g.add(label); }

    g.visible = false;   /* ẩn cho tới khi enter() */
    this._scene.add(g);
    this._arena = g;
  },

  /* Chuyển sang arena boss. Trả false nếu chưa create(). */
  enter: function () {
    if (!this._built) { console.warn('[WuxiaDungeon] enter() trước create().'); return false; }
    this._inDungeon = true;
    if (this._arena) this._arena.visible = true;
    if (this._onEnter) { try { this._onEnter(); } catch (e) { console.warn('[WuxiaDungeon] onEnter lỗi:', e); } }
    return true;
  },

  /* Về phố: ẩn arena. Trả false nếu chưa create(). */
  exit: function () {
    if (!this._built) { console.warn('[WuxiaDungeon] exit() trước create().'); return false; }
    this._inDungeon = false;
    if (this._arena) this._arena.visible = false;
    if (this._onExit) { try { this._onExit(); } catch (e) { console.warn('[WuxiaDungeon] onExit lỗi:', e); } }
    return true;
  },

  isInDungeon: function () { return this._inDungeon; },

  /* Boss đứng phía bắc arena, đối diện cổng vào. */
  getBossSpawn: function () {
    return { x: ARENA_CENTER.x, y: 0, z: ARENA_CENTER.z - 10 };
  },
  getArenaCenter: function () {
    return { x: ARENA_CENTER.x, y: 0, z: ARENA_CENTER.z };
  },
  getExitPoint: function () {
    return { x: ARENA_CENTER.x, y: 0, z: ARENA_CENTER.z + 16 };
  },
  getArenaRadius: function () { return ARENA_R; },

  /* Collision riêng của arena: ngoài r=18 là chặn, cột lửa chặn r=1.2.
   * Chỉ dùng khi đang ở trong dungeon; ngoài dungeon trả false. */
  isBlocked: function (x, z) {
    if (!this._inDungeon) return false;
    var dx = x - ARENA_CENTER.x, dz = z - ARENA_CENTER.z;
    if (Math.sqrt(dx * dx + dz * dz) > ARENA_R) return true;
    var pillars = [[-12, -12], [12, -12], [-12, 12], [12, 12]];
    for (var i = 0; i < pillars.length; i++) {
      var px = pillars[i][0], pz = pillars[i][1];
      var ddx = x - (ARENA_CENTER.x + px), ddz = z - (ARENA_CENTER.z + pz);
      if (Math.sqrt(ddx * ddx + ddz * ddz) < PILLAR_R) return true;
    }
    return false;
  },

  update: function (dt) {
    if (!this._built) return;
    dt = (typeof dt === 'number' && dt > 0) ? Math.min(dt, 0.1) : 0.016;
    this._time += dt;
    var t = this._time;
    /* portal xoay + nhấp nháy */
    if (this._portalRing) this._portalRing.rotation.z += dt * 0.6;
    if (this._portalDisc) {
      this._portalDisc.material.opacity = 0.55 + 0.25 * Math.sin(t * 3);
      this._portalDisc.rotation.z += dt * 0.3;
    }
    if (this._portalLight) this._portalLight.intensity = 1.0 + 0.35 * Math.sin(t * 3);
    /* lửa cột chập chờn */
    for (var i = 0; i < this._flames.length; i++) {
      var f = this._flames[i];
      var s = 1 + 0.18 * Math.sin(t * 7 + i * 1.7);
      f.scale.set(1, s, 1);
    }
  },

  dispose: function () {
    if (!this._built) return;
    var self = this;
    [this._portal, this._arena].forEach(function (grp) {
      if (!grp) return;
      grp.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      if (self._scene) self._scene.remove(grp);
    });
    this._portal = null; this._arena = null;
    this._portalRing = null; this._portalDisc = null; this._portalLight = null;
    this._arenaLight = null; this._flames = [];
    this._scene = null; this._three = null;
    this._onEnter = null; this._onExit = null;
    this._inDungeon = false; this._built = false;
  }
};

PE.WuxiaDungeon = Dungeon;
PE.Wuxia.Dungeon = Dungeon;

})();
