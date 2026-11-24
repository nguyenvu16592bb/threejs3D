/* ============================================================
 * WuxiaWorld.js — Thế giới tuyết Trường Bạch (PixiJS 3D Engine v5.0)
 * Vanilla JS, IIFE, 'use strict'. three.js r128 UMD (THREE global).
 * Ý tưởng tái dùng từ 3D-Model/WUXIA3D-3D.js (map 56x56, đền, phố,
 * cổng, hồ băng, portal) nhưng viết lại gọn cho module mới.
 * KHÔNG tự tạo renderer/canvas — chỉ nhận scene có sẵn.
 * An toàn khi THREE undefined: build() log rõ + trả false, các hàm
 * khác trả giá trị mặc định, không crash.
 * ============================================================ */
(function () {
'use strict';

window.PixiEngine = window.PixiEngine || {};
window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};
var PE = window.PixiEngine;

/* ---------- Hằng số & palette tuyết ---------- */
var TILE = 2;              /* 1 ô lưới = 2 đơn vị thế giới */
var MAP = 56;              /* lưới collision 56x56 */
var HALF = MAP / 2;        /* 28 */
var WORLD = MAP * TILE;    /* 112 */
var PALETTE = {
  snow: 0xe8eef7, ground: 0x5c6c8c, road: 0x8d8578, roadEdge: 0x6e675c,
  ice: 0x9fc8e8, iceHi: 0xcfe6f7, plaza: 0x7a7264,
  roof: 0x1e4d3a,            /* mái ngói xanh đậm */
  wall: 0x7a4a2e, wood: 0x6b4a2a, woodLight: 0x7d5a34,
  templeRed: 0x8a2f26, templeDark: 0x5e1f18, gold: 0xc9a94f,
  lantern: 0xff5a3c, lanternGlow: 0xffb347,
  pine: 0x1d4a2e, pine2: 0x25603a, trunk: 0x4a3220,
  mountain: 0x2c3a58, rock: 0x9aa4b5, stone: 0x7a7264
};
var MAX_LANTERN_LIGHTS = 6;   /* tối đa 6 PointLight thật để nhẹ máy */
var SNOW_COUNT = 800;
var STATUE_GLB = 'models/kiem-hiep.glb';
var STATUE_CDN = 'https://raw.githubusercontent.com/nguyenvu133/3D-Model/main/kiem%20hiep.glb';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
/* tile -> world */
function wX(tx) { return (tx - HALF) * TILE; }
function wZ(ty) { return (ty - HALF) * TILE; }

var World = {
  _three: null, _scene: null, _root: null,
  _blocked: null, _mats: null,
  _snow: null, _snowVel: null, _snowTime: 0,
  _lanternLights: [], _statue: null, _built: false,
  _counts: null,

  /* ---------- helpers ---------- */
  _mat: function (color, opts) {
    var T = this._three;
    var o = { color: color };
    if (opts) for (var k in opts) o[k] = opts[k];
    var m = new T.MeshLambertMaterial(o);
    this._mats.push(m);
    return m;
  },
  _box: function (w, h, d, color, x, y, z, opts) {
    var T = this._three;
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), this._mat(color, opts));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    this._root.add(m);
    return m;
  },
  _cone: function (r, h, color, x, y, z, seg, opts) {
    var T = this._three;
    var m = new T.Mesh(new T.ConeGeometry(r, h, seg || 8), this._mat(color, opts));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    this._root.add(m);
    return m;
  },
  _cyl: function (rt, rb, h, color, x, y, z, seg, opts) {
    var T = this._three;
    var m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 8), this._mat(color, opts));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    this._root.add(m);
    return m;
  },
  _sphere: function (r, color, x, y, z, opts) {
    var T = this._three;
    var m = new T.Mesh(new T.SphereGeometry(r, 12, 10), this._mat(color, opts));
    m.position.set(x, y, z);
    m.castShadow = true;
    this._root.add(m);
    return m;
  },
  _blockRect: function (x0, y0, x1, y1) {
    for (var x = Math.floor(x0); x <= Math.floor(x1); x++)
      for (var y = Math.floor(y0); y <= Math.floor(y1); y++)
        if (x >= 0 && y >= 0 && x < MAP && y < MAP) this._blocked[x][y] = true;
  },

  /* ---------- API chính ---------- */
  build: function (scene, THREE) {
    var T = THREE || (typeof window !== 'undefined' ? window.THREE : null);
    if (!T) { console.warn('[WuxiaWorld] THREE chưa có — build() bỏ qua.'); return false; }
    if (!scene) { console.warn('[WuxiaWorld] build(scene) thiếu scene.'); return false; }
    if (this._built) this.dispose();
    this._three = T; this._scene = scene;
    this._mats = []; this._lanternLights = []; this._statue = null;
    this._snowTime = 0;
    this._counts = { houses: 0, pines: 0, lanterns: 0, lanternLights: 0, mountains: 0, rocks: 0, fences: 0 };
    this._blocked = [];
    for (var i = 0; i < MAP; i++) { this._blocked[i] = []; for (var j = 0; j < MAP; j++) this._blocked[i][j] = false; }
    /* hồ băng chặn đường */
    this._blockRect(4, 42, 12, 50);
    this._root = new T.Group();
    this._root.name = 'WuxiaWorld';
    scene.add(this._root);

    this._buildGround();
    this._buildMountains();
    this._buildTemple();
    this._buildHouses();
    this._buildTrees();
    this._buildFences();
    this._buildLanterns();
    this._buildGate();
    this._buildBridge();
    this._buildIceLake();
    this._buildRocks();
    this._buildStatue();
    this._buildSnow();
    this._built = true;
    return true;
  },

  update: function (dt) {
    if (!this._built || !this._snow) return;
    dt = (typeof dt === 'number' && dt > 0) ? Math.min(dt, 0.1) : 0.016;
    this._snowTime += dt;
    var p = this._snow.geometry.attributes.position.array;
    var t = this._snowTime;
    for (var i = 0; i < p.length; i += 3) {
      p[i + 1] -= this._snowVel[i / 3] * dt;          /* rơi */
      p[i] += Math.sin(t * 0.7 + i) * dt * 0.6;       /* gió nhẹ đung đưa */
      if (p[i + 1] < 0) {                             /* chạm đất -> lên lại */
        p[i + 1] = rand(22, 30);
        p[i] = rand(-HALF * TILE, HALF * TILE);
        p[i + 2] = rand(-HALF * TILE, HALF * TILE);
      }
    }
    this._snow.geometry.attributes.position.needsUpdate = true;
  },

  /* ---------- Tọa độ / collision ---------- */
  worldToGrid: function (x, z) {
    return { gx: Math.floor(x / TILE + HALF), gz: Math.floor(z / TILE + HALF) };
  },
  gridToWorld: function (gx, gz) {
    return { x: (gx - HALF) * TILE, z: (gz - HALF) * TILE };
  },
  isBlockedGrid: function (gx, gz) {
    if (!this._blocked) return true;
    if (gx < 0 || gz < 0 || gx >= MAP || gz >= MAP) return true;
    return this._blocked[gx][gz];
  },
  /* x, z theo đơn vị thế giới */
  isBlocked: function (x, z) {
    var g = this.worldToGrid(x, z);
    return this.isBlockedGrid(g.gx, g.gz);
  },

  /* Độ cao mặt đất: bậc thang đền (tối đa 1.8), còn lại 0. */
  getGroundHeight: function (x, z) {
    if (Math.abs(x) <= 7.5 && z >= -50.5 && z <= -38.5) {
      if (z < -44.5) return 1.8;   /* sân đền */
      if (z < -42) return 1.2;     /* bậc 2 */
      return 0.6;                  /* bậc 1 */
    }
    return 0;
  },

  getSpawnPoint: function (name) {
    var spots = {
      town: { tx: 28, ty: 40 },     /* giữa phố, trước cổng thành */
      temple: { tx: 28, ty: 12 },   /* sân trước đền */
      gate: { tx: 28, ty: 43 },     /* ngay trong cổng thành */
      dungeon: { tx: 50, ty: 30 }   /* trước portal (WuxiaDungeon) */
    };
    var s = spots[name] || spots.town;
    var w = this.gridToWorld(s.tx, s.ty);
    return { x: w.x, y: this.getGroundHeight(w.x, w.z), z: w.z };
  },

  getNPCSpots: function () {
    return [
      { name: 'Vệ Binh A Hổ', tile: { x: 25.5, y: 42.5 }, x: wX(25.5), z: wZ(42.5) },
      { name: 'Trưởng Lão Tuyết', tile: { x: 24, y: 20 }, x: wX(24), z: wZ(20) }
    ];
  },

  /* Điểm spawn quái theo vùng (tile -> world), tránh ô bị chặn. */
  getEnemySpawnPoints: function () {
    var zones = [
      { type: 'snow', n: 9, x0: 8, y0: 8, x1: 20, y1: 20 },    /* Tuyết Yêu tây-bắc */
      { type: 'bandit', n: 7, x0: 38, y0: 14, x1: 48, y1: 24 }, /* Sơn Tặc phía đông */
      { type: 'elite', n: 3, x0: 44, y0: 26, x1: 52, y1: 34 },  /* Hồ Ly Tinh đông-nam */
      { type: 'snow', n: 4, x0: 12, y0: 34, x1: 20, y1: 44 }
    ];
    var out = [];
    for (var z = 0; z < zones.length; z++) {
      var zn = zones[z];
      for (var i = 0; i < zn.n; i++) {
        var tx = rand(zn.x0, zn.x1), ty = rand(zn.y0, zn.y1), tries = 0;
        while (this.isBlockedGrid(Math.floor(tx), Math.floor(ty)) && tries++ < 8) {
          tx = rand(zn.x0, zn.x1); ty = rand(zn.y0, zn.y1);
        }
        out.push({ type: zn.type, x: wX(tx), z: wZ(ty) });
      }
    }
    out.push({ type: 'boss', x: wX(48), z: wZ(40) });  /* Long Ngâm Lão Tổ */
    return out;
  },

  getCounts: function () {
    return this._counts ? JSON.parse(JSON.stringify(this._counts)) : null;
  },

  dispose: function () {
    if (!this._built) return;
    var self = this;
    if (this._root) {
      this._root.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
      });
      /* material dùng chung nên dispose mỗi cái 1 lần */
      var seen = {};
      this._mats.forEach(function (m) {
        var key = m.uuid || m.id;
        if (!seen[key]) { seen[key] = true; if (m.dispose) m.dispose(); }
      });
      if (this._scene) this._scene.remove(this._root);
      if (this._snow) {
        if (this._snow.material) this._snow.material.dispose();
        this._snow = null;
      }
    }
    this._root = null; this._scene = null; this._three = null;
    this._blocked = null; this._mats = null; this._snowVel = null;
    this._counts = null;
    this._lanternLights = []; this._statue = null; this._built = false;
  },

  /* ---------- Xây dựng ---------- */
  _groundTexture: function () {
    try {
      if (typeof document === 'undefined') return null;
      var cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 1024;
      var ctx = cv.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#5c6c8c'; ctx.fillRect(0, 0, 1024, 1024);
      var i;
      for (i = 0; i < 2600; i++) {  /* đốm tuyết */
        ctx.fillStyle = pick(['#566280', '#64748f', '#526078', '#6b7c9e']);
        ctx.fillRect(Math.random() * 1024, Math.random() * 1024, rand(4, 14), rand(4, 14));
      }
      function px(tx, ty) { return [tx / MAP * 1024, ty / MAP * 1024]; }
      function road(x0, y0, x1, y1) {
        var a = px(x0, y0), b = px(x1, y1);
        ctx.fillStyle = '#8d8578';
        ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        ctx.fillStyle = '#6e675c';   /* viền đường */
        ctx.fillRect(a[0], a[1], 4, b[1] - a[1]);
        ctx.fillRect(b[0] - 4, a[1], 4, b[1] - a[1]);
      }
      road(26.5, 4, 29.5, 46);       /* đường dọc đền -> cổng */
      road(12, 27.5, 44, 30.5);      /* đường ngang qua phố */
      road(40, 30, 52, 32);          /* đường ra portal */
      var lp = px(8, 46);            /* hồ băng */
      ctx.fillStyle = '#9fc8e8';
      ctx.beginPath(); ctx.ellipse(lp[0], lp[1], 90, 42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cfe6f7';
      ctx.beginPath(); ctx.ellipse(lp[0], lp[1], 72, 30, 0, 0, Math.PI * 2); ctx.fill();
      var qp = px(28, 12);           /* quảng trường trước đền */
      ctx.fillStyle = '#7a7264';
      ctx.beginPath(); ctx.ellipse(qp[0], qp[1], 120, 60, 0, 0, Math.PI * 2); ctx.fill();
      var tex = new this._three.CanvasTexture(cv);
      tex.anisotropy = 4;
      return tex;
    } catch (e) { return null; }
  },

  _buildGround: function () {
    var T = this._three;
    var tex = this._groundTexture();
    var mat = tex ? new T.MeshLambertMaterial({ map: tex })
                  : this._mat(PALETTE.ground);
    if (!tex) this._mats.push(mat);
    var g = new T.Mesh(new T.PlaneGeometry(WORLD, WORLD), mat);
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this._root.add(g);
  },

  _buildMountains: function () {
    var peaks = [
      { x: 2, y: 2, h: 34, r: 22 }, { x: 14, y: 0, h: 42, r: 26 },
      { x: 30, y: -2, h: 38, r: 24 }, { x: 46, y: 1, h: 46, r: 28 },
      { x: 56, y: 8, h: 36, r: 22 }, { x: -2, y: 22, h: 30, r: 20 },
      { x: 58, y: 26, h: 32, r: 20 }, { x: 8, y: 58, h: 34, r: 22 },
      { x: 40, y: 58, h: 38, r: 24 }
    ];
    for (var i = 0; i < peaks.length; i++) {
      var p = peaks[i];
      var m = new this._three.Mesh(
        new this._three.ConeGeometry(p.r, p.h, 5), this._mat(PALETTE.mountain));
      m.position.set(wX(p.x), p.h / 2 - 2, wZ(p.y));
      this._root.add(m);
      var cap = new this._three.Mesh(
        new this._three.ConeGeometry(p.r * 0.42, p.h * 0.38, 5), this._mat(PALETTE.snow));
      cap.position.set(wX(p.x), p.h - 2 - p.h * 0.19, wZ(p.y));
      this._root.add(cap);
      this._counts.mountains++;
    }
  },

  _buildTemple: function () {
    this._blockRect(24, 2, 32, 9);
    var cx = wX(28), cz = wZ(5.5);   /* (0, -45) */
    /* bậc thang: 0.6 -> 1.2 -> sân 1.8 (khớp getGroundHeight) */
    this._box(15, 0.6, 3, PALETTE.stone, cx, 0.3, -40);
    this._box(13, 1.2, 3, PALETTE.road, cx, 0.6, -43.5);
    this._box(12, 1.8, 6, PALETTE.stone, cx, 0.9, -47.5);
    /* thân đền trên sân (cao 1.8) */
    this._box(11, 6.5, 6, PALETTE.templeRed, cx, 1.8 + 3.25, -47.5);
    this._box(11.4, 0.5, 6.4, PALETTE.gold, cx, 1.8 + 6.5, -47.5);
    this._box(2.2, 4.2, 0.3, PALETTE.gold, cx, 1.8 + 2.1, -44.4);  /* cửa vàng */
    var self = this;
    [-4.6, 4.6].forEach(function (dx) {
      self._cyl(0.35, 0.35, 6.5, PALETTE.templeDark, cx + dx, 1.8 + 3.25, -44.9, 8);
    });
    /* mái 2 tầng + chóp tuyết */
    var roof1 = this._cone(9.5, 3.4, PALETTE.roof, cx, 1.8 + 8.3, -47.5, 4);
    roof1.rotation.y = Math.PI / 4;
    var cap1 = this._cone(9.7, 0.5, PALETTE.snow, cx, 1.8 + 6.9, -47.5, 4);
    cap1.rotation.y = Math.PI / 4;
    var roof2 = this._cone(7, 2.8, PALETTE.roof, cx, 1.8 + 11.3, -47.5, 4);
    roof2.rotation.y = Math.PI / 4;
    this._sphere(0.5, PALETTE.gold, cx, 1.8 + 13.5, -47.5, { emissive: 0x8a6d1f });
    this._cyl(0.12, 0.12, 1.6, PALETTE.gold, cx, 1.8 + 12.7, -47.5, 6);
  },

  _buildHouses: function () {
    var houses = [
      { x: 16, y: 16 }, { x: 36, y: 14 }, { x: 14, y: 34 },
      { x: 40, y: 36 }, { x: 20, y: 22 }, { x: 38, y: 22 },
      { x: 46, y: 18 }, { x: 44, y: 40 }, { x: 12, y: 20 }
    ];
    for (var i = 0; i < houses.length; i++) {
      var h = houses[i];
      this._blockRect(h.x - 1.7, h.y - 1.3, h.x + 1.7, h.y + 1.3);
      var cx = wX(h.x), cz = wZ(h.y);
      this._box(6.8, 3, 5, PALETTE.wall, cx, 1.5, cz);
      var roof = this._cone(5.4, 2.6, PALETTE.roof, cx, 4.3, cz, 4);
      roof.rotation.y = Math.PI / 4;
      var cap = this._cone(5.5, 0.35, PALETTE.snow, cx, 3.2, cz, 4);
      cap.rotation.y = Math.PI / 4;
      /* cửa sổ ấm */
      var win = new this._three.Mesh(new this._three.PlaneGeometry(1.1, 1.1),
        new this._three.MeshBasicMaterial({ color: 0xffc86e }));
      win.position.set(cx, 1.6, cz + 2.55);
      this._root.add(win);
      var win2 = win.clone();
      win2.position.set(cx - 2, 1.6, cz + 2.55);
      this._root.add(win2);
      this._counts.houses++;
    }
  },

  _buildTrees: function () {
    var placed = 0, guard = 0;
    while (placed < 40 && guard++ < 400) {
      var x = rand(2, 54), y = rand(2, 54);
      if (x > 24 && x < 32 && y < 12) continue;              /* đền */
      if (x > 25 && x < 31 && y > 4 && y < 47) continue;     /* đường dọc */
      if (x > 11 && x < 45 && y > 26.5 && y < 31.5) continue;/* đường ngang */
      if (x > 3 && x < 13 && y > 41 && y < 51) continue;     /* hồ băng */
      if (this.isBlockedGrid(Math.floor(x), Math.floor(y))) continue;
      var cx = wX(x), cz = wZ(y), s = rand(0.8, 1.35);
      this._cyl(0.18 * s, 0.24 * s, 1.6 * s, PALETTE.trunk, cx, 0.8 * s, cz, 6);
      this._cone(1.5 * s, 2.6 * s, PALETTE.pine, cx, 2.8 * s, cz, 8);
      this._cone(1.1 * s, 2.2 * s, PALETTE.pine2, cx, 4.4 * s, cz, 8);
      this._cone(0.55 * s, 1.1 * s, PALETTE.snow, cx, 5.6 * s, cz, 8);
      placed++;
    }
    this._counts.pines = placed;
  },

  _buildFences: function () {
    var self = this;
    function run(x0, y0, x1, y1) {
      var dx = x1 - x0, dy = y1 - y0;
      var n = Math.floor(Math.sqrt(dx * dx + dy * dy) / 1.4);
      for (var i = 0; i <= n; i++) {
        var tx = x0 + dx * i / n, ty = y0 + dy * i / n;
        self._box(0.14, 1.1, 0.14, PALETTE.wood, wX(tx), 0.55, wZ(ty));
      }
      var len = Math.sqrt(dx * dx + dy * dy) * TILE;
      var rail = new self._three.Mesh(
        new self._three.BoxGeometry(len, 0.12, 0.12), self._mat(PALETTE.woodLight));
      rail.position.set((wX(x0) + wX(x1)) / 2, 0.85, (wZ(y0) + wZ(y1)) / 2);
      rail.rotation.y = -Math.atan2(wZ(y1) - wZ(y0), wX(x1) - wX(x0));
      rail.castShadow = true;
      self._root.add(rail);
      self._counts.fences++;
    }
    run(12, 24, 24, 24); run(32, 24, 44, 24);
    run(12, 33, 24, 33); run(32, 33, 44, 33);
    run(10, 12, 10, 44); run(46, 12, 46, 44);
  },

  _buildLanterns: function () {
    var spots = [[24, 26], [32, 26], [24, 32], [32, 32], [26, 12],
                 [30, 12], [26, 40], [30, 40], [42, 28], [14, 28]];
    for (var i = 0; i < spots.length; i++) {
      var cx = wX(spots[i][0]), cz = wZ(spots[i][1]);
      this._cyl(0.09, 0.09, 2.6, 0x2a2018, cx, 1.3, cz, 6);
      this._sphere(0.55, PALETTE.lantern, cx, 2.9, cz, { emissive: 0x992200 });
      var halo = new this._three.Mesh(
        new this._three.SphereGeometry(0.7, 10, 8),
        new this._three.MeshBasicMaterial({ color: PALETTE.lanternGlow, transparent: true, opacity: 0.18 }));
      halo.position.set(cx, 2.9, cz);
      this._root.add(halo);
      /* chỉ 6 đèn đầu có PointLight thật, còn lại chỉ phát sáng giả */
      if (this._lanternLights.length < MAX_LANTERN_LIGHTS) {
        var pl = new this._three.PointLight(0xff8a3c, 0.8, 12);
        pl.position.set(cx, 3, cz);
        this._root.add(pl);
        this._lanternLights.push(pl);
      }
      this._counts.lanterns++;
    }
    this._counts.lanternLights = this._lanternLights.length;
  },

  _buildGate: function () {
    this._blockRect(25.5, 44, 30.5, 45.5);
    var cx = wX(28), cz = wZ(44.8);
    var self = this;
    [-6.5, 6.5].forEach(function (dx) {
      self._box(1.1, 7.5, 1.1, 0x6e3f2a, cx + dx, 3.75, cz);
    });
    this._box(15.5, 1.3, 1.4, PALETTE.roof, cx, 7.6, cz);
    var roof = this._cone(10.5, 2.6, PALETTE.roof, cx, 9.4, cz, 4);
    roof.rotation.y = Math.PI / 4;
    var cap = this._cone(10.7, 0.35, PALETTE.snow, cx, 8.3, cz, 4);
    cap.rotation.y = Math.PI / 4;
    this._sphere(0.5, PALETTE.gold, cx, 11.4, cz, { emissive: 0x8a6d1f });
    this._box(5.2, 1, 0.2, PALETTE.templeRed, cx, 6.6, cz + 0.8);  /* biển cổng */
  },

  /* Cầu gỗ bắc qua mép hồ băng (tile 8,40 -> 8,46), đi bộ được. */
  _buildBridge: function () {
    var cx = wX(8), cz0 = wZ(40), cz1 = wZ(46);
    var n = 7;
    for (var i = 0; i < n; i++) {
      var z = cz0 + (cz1 - cz0) * i / (n - 1);
      var y = 0.35 + Math.sin(i / (n - 1) * Math.PI) * 0.5;  /* vòm nhẹ */
      this._box(3.4, 0.18, 1.1, PALETTE.woodLight, cx, y, z);
    }
    var self = this;
    [-1.7, 1.7].forEach(function (dx) {
      var rail = new self._three.Mesh(
        new self._three.BoxGeometry(0.12, 0.12, Math.abs(cz1 - cz0) + 1),
        self._mat(PALETTE.wood));
      rail.position.set(cx + dx, 1.3, (cz0 + cz1) / 2);
      rail.castShadow = true;
      self._root.add(rail);
      for (var j = 0; j <= 4; j++) {
        self._box(0.12, 1.0, 0.12, PALETTE.wood, cx + dx, 0.8,
          cz0 + (cz1 - cz0) * j / 4);
      }
    });
  },

  _buildIceLake: function () {
    var T = this._three;
    var lake = new T.Mesh(
      new T.CircleGeometry(9, 24),
      new T.MeshLambertMaterial({ color: PALETTE.ice, transparent: true, opacity: 0.9 }));
    this._mats.push(lake.material);
    lake.rotation.x = -Math.PI / 2;
    lake.scale.set(1, 0.45, 1);
    lake.position.set(wX(8), 0.06, wZ(46));
    lake.receiveShadow = true;
    this._root.add(lake);
    var shine = new T.Mesh(
      new T.CircleGeometry(6.5, 24),
      new T.MeshBasicMaterial({ color: PALETTE.iceHi, transparent: true, opacity: 0.5 }));
    shine.rotation.x = -Math.PI / 2;
    shine.position.set(wX(8), 0.08, wZ(46));
    this._root.add(shine);
  },

  _buildRocks: function () {
    for (var i = 0; i < 12; i++) {
      var tx = rand(3, 53), ty = rand(3, 53);
      if (this.isBlockedGrid(Math.floor(tx), Math.floor(ty))) continue;
      var s = rand(0.5, 1.4);
      var rock = new this._three.Mesh(
        new this._three.IcosahedronGeometry(s, 0), this._mat(PALETTE.rock));
      rock.position.set(wX(tx), s * 0.5, wZ(ty));
      rock.rotation.y = rand(0, Math.PI);
      rock.castShadow = true; rock.receiveShadow = true;
      this._root.add(rock);
      this._counts.rocks++;
    }
  },

  /* Tượng kiếm hiệp trước đền: GLB thật nếu có GLTFLoader, không thì
   * procedural. Lỗi tải GLB cũng fallback procedural, không crash. */
  _buildStatue: function () {
    var T = this._three;
    var px = wX(28), pz = wZ(10);   /* (0, -36) */
    this._box(3, 1, 3, PALETTE.stone, px, 0.5, pz);
    this._blockRect(27.4, 9.4, 28.6, 10.6);
    var self = this;
    function procedural() {
      self._cyl(0.55, 0.75, 2.6, PALETTE.rock, px, 1 + 1.3, pz, 8);
      self._sphere(0.45, PALETTE.rock, px, 1 + 2.9, pz);
      self._cone(0.5, 0.7, PALETTE.rock, px, 1 + 3.4, pz, 8);   /* mũ */
      var sword = self._box(0.08, 2.2, 0.3, 0xdfe8f2, px + 0.7, 1 + 2.2, pz);
      sword.rotation.z = -0.4;
      self._statue = 'procedural';
    }
    if (!T.GLTFLoader) { procedural(); return; }
    try {
      var loader = new T.GLTFLoader();
      if (typeof window !== 'undefined' && window.MeshoptDecoder && loader.setMeshoptDecoder) {
        try { loader.setMeshoptDecoder(window.MeshoptDecoder); } catch (e) { /* bỏ qua */ }
      }
      loader.load(STATUE_GLB, function (gltf) {
        var m = gltf.scene;
        m.position.set(px, 1, pz);
        m.scale.set(1.4, 1.4, 1.4);
        m.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        if (self._root) { self._root.add(m); self._statue = m; }
      }, undefined, function () {
        /* thử CDN công khai, lỗi nữa thì procedural */
        loader.load(STATUE_CDN, function (gltf) {
          var m = gltf.scene;
          m.position.set(px, 1, pz);
          m.scale.set(1.4, 1.4, 1.4);
          m.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          if (self._root) { self._root.add(m); self._statue = m; }
        }, undefined, function () { if (self._root) procedural(); });
      });
      this._statue = 'loading';
    } catch (e) {
      console.warn('[WuxiaWorld] Không tải được tượng GLB, dùng procedural:', e);
      procedural();
    }
  },

  _buildSnow: function () {
    var T = this._three;
    var pos = new Float32Array(SNOW_COUNT * 3);
    this._snowVel = new Float32Array(SNOW_COUNT);
    for (var i = 0; i < SNOW_COUNT; i++) {
      pos[i * 3] = rand(-HALF * TILE, HALF * TILE);
      pos[i * 3 + 1] = rand(0, 30);
      pos[i * 3 + 2] = rand(-HALF * TILE, HALF * TILE);
      this._snowVel[i] = rand(1.2, 3);
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({
      color: 0xffffff, size: 0.28, transparent: true, opacity: 0.85, sizeAttenuation: true
    });
    var pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    this._root.add(pts);
    this._snow = pts;
  }
};

PE.WuxiaWorld = World;
PE.Wuxia.World = World;

})();
