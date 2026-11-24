'use strict';
/* WuxiaInventory.js — Nhóm WUXIA: túi đồ đơn giản (potion, trang bị, vàng).
   Logic mới theo hợp đồng v5.0, số liệu theo game gốc Quan Ải Long Ngâm
   (WUXIA3D-3D.js: loot vàng 4–12/quái, HP orb +40, boss 300 vàng).
   Hợp đồng chung: window.PixiEngine.Wuxia.Inventory; vị trí không liên quan;
   KHÔNG tự tạo renderer/scene, KHÔNG tự vẽ HUD — chỉ trả dữ liệu + reason.
   An toàn khi THREE undefined (module này không cần THREE). */
(function () {
  window.PixiEngine = window.PixiEngine || {};
  window.PixiEngine.Wuxia = window.PixiEngine.Wuxia || {};

  var POTION_HEAL = 0.4;   /* potion hồi 40% HP/MP tối đa */
  var POTION_COOLDOWN = 5; /* cooldown dùng potion 5s (chung cả HP + MP) */
  var SAVE_KEY = 'wuxia-inventory-v5';

  /* Catalog vật phẩm. type: 'potion-hp' | 'potion-mp' | 'weapon' | 'armor' | 'misc'. */
  var ITEMS = {
    'potion-hp': { id: 'potion-hp', name: 'Thuốc Hồi HP', type: 'potion-hp', icon: '❤️', desc: 'Hồi 40% HP tối đa. Cooldown 5s.', stackable: true },
    'potion-mp': { id: 'potion-mp', name: 'Thuốc Hồi MP', type: 'potion-mp', icon: '💙', desc: 'Hồi 40% MP tối đa. Cooldown 5s.', stackable: true },
    'sword-wood': { id: 'sword-wood', name: 'Kiếm Gỗ', type: 'weapon', slot: 'weapon', weapon: 'sword', atk: 5, icon: '🗡️', desc: 'Kiếm gỗ tập luyện. +5 ATK.' },
    'sword-iron': { id: 'sword-iron', name: 'Kiếm Sắt', type: 'weapon', slot: 'weapon', weapon: 'sword', atk: 12, icon: '⚔️', desc: 'Kiếm sắt sắc bén. +12 ATK.' },
    'spear-bronze': { id: 'spear-bronze', name: 'Thương Đồng', type: 'weapon', slot: 'weapon', weapon: 'spear', atk: 10, icon: '🔱', desc: 'Thương đồng nặng tay. +10 ATK.' },
    'staff-jade': { id: 'staff-jade', name: 'Trượng Ngọc', type: 'weapon', slot: 'weapon', weapon: 'staff', atk: 14, icon: '🔮', desc: 'Trượng ngọc tụ linh. +14 ATK.' },
    'armor-cloth': { id: 'armor-cloth', name: 'Giáp Vải', type: 'armor', slot: 'armor', def: 3, icon: '🥋', desc: 'Giáp vải nhẹ. +3 DEF.' },
    'armor-iron': { id: 'armor-iron', name: 'Giáp Sắt', type: 'armor', slot: 'armor', def: 8, icon: '🛡️', desc: 'Giáp sắt vững chãi. +8 DEF.' },
    'dragon-sword': { id: 'dragon-sword', name: 'Bảo Kiếm Long Ngâm', type: 'weapon', slot: 'weapon', weapon: 'sword', atk: 25, icon: '🐉', desc: 'Phần thưởng hạ Boss Long Ngâm. +25 ATK.' }
  };

  var items = [];      /* [{id, amount}] — potion stack, trang bị mỗi cái 1 dòng */
  var gold = 0;
  var equipped = {};   /* heroId -> {weapon: itemId|null, armor: itemId|null} */
  var potionCd = 0;

  function cloneItem(def) {
    var out = {};
    for (var k in def) { out[k] = def[k]; }
    return out;
  }
  function findEntry(itemId) {
    for (var i = 0; i < items.length; i++) { if (items[i].id === itemId) { return items[i]; } }
    return null;
  }
  function heroKey(hero) { return (typeof hero === 'string') ? hero : (hero.id || hero.name); }

  /* ---- Túi đồ ---- */
  function addItem(item, amount) {
    var id = (typeof item === 'string') ? item : (item && item.id);
    var def = ITEMS[id];
    if (!def) { return { ok: false, reason: 'unknown-item', id: id }; }
    var n = amount || 1;
    var entry = findEntry(id);
    if (def.stackable && entry) {
      entry.amount += n;
    } else if (def.stackable) {
      items.push({ id: id, amount: n });
    } else {
      for (var i = 0; i < n; i++) { items.push({ id: id, amount: 1 }); }
    }
    return { ok: true, item: cloneItem(def), amount: n };
  }

  function removeItem(itemId, amount) {
    var entry = findEntry(itemId);
    if (!entry) { return { ok: false, reason: 'not-in-bag' }; }
    var n = amount || 1;
    if (entry.amount > n) { entry.amount -= n; return { ok: true }; }
    items.splice(items.indexOf(entry), 1);
    return { ok: true };
  }

  function getItems() {
    return items.map(function (e) {
      var def = cloneItem(ITEMS[e.id] || { id: e.id, name: e.id, type: 'misc' });
      def.amount = e.amount;
      return def;
    });
  }
  function count(itemId) { var e = findEntry(itemId); return e ? e.amount : 0; }
  function clear() { items = []; gold = 0; equipped = {}; potionCd = 0; }

  /* ---- Vàng ---- */
  function addGold(n) { gold += Math.max(0, n || 0); return gold; }
  function getGold() { return gold; }
  function spendGold(n) {
    if (gold < n) { return { ok: false, reason: 'not-enough-gold', need: n, have: gold }; }
    gold -= n;
    return { ok: true, gold: gold };
  }

  /* ---- Potion ---- */
  /* type: 'hp' | 'mp' (mặc định 'hp'). Hồi 40%, cooldown 5s chung. */
  function usePotion(type, target) {
    type = type || 'hp';
    if (potionCd > 0) { return { ok: false, reason: 'cooldown', remain: Math.ceil(potionCd) }; }
    var itemId = type === 'mp' ? 'potion-mp' : 'potion-hp';
    if (count(itemId) <= 0) { return { ok: false, reason: 'no-potion', type: type }; }
    if (!target || !target.alive) { return { ok: false, reason: 'invalid-target' }; }
    var healed = 0;
    if (type === 'mp') {
      if (target.hp !== undefined && (target.maxMp || 0) <= 0) { return { ok: false, reason: 'no-mp-stat' }; }
      var beforeMp = target.mp || 0;
      target.mp = Math.min(target.maxMp, beforeMp + Math.floor(target.maxMp * POTION_HEAL));
      healed = target.mp - beforeMp;
      if (healed <= 0) { return { ok: false, reason: 'already-full' }; }
    } else {
      var beforeHp = target.hp;
      target.hp = Math.min(target.maxHp, beforeHp + Math.floor(target.maxHp * POTION_HEAL));
      healed = target.hp - beforeHp;
      if (healed <= 0) { return { ok: false, reason: 'already-full' }; }
    }
    removeItem(itemId, 1);
    potionCd = POTION_COOLDOWN;
    return { ok: true, healed: healed, type: type, remain: count(itemId) };
  }
  function getPotionCooldown() { return potionCd; }

  /* ---- Trang bị: tối đa 1 vũ khí + 1 giáp mỗi hero ---- */
  function getEquipped(hero) {
    var k = heroKey(hero);
    return equipped[k] || { weapon: null, armor: null };
  }
  function equip(itemId, hero) {
    var def = ITEMS[itemId];
    if (!def || (def.type !== 'weapon' && def.type !== 'armor')) {
      return { ok: false, reason: 'not-equippable' };
    }
    if (!hero || !hero.alive) { return { ok: false, reason: 'invalid-hero' }; }
    if (count(itemId) <= 0) { return { ok: false, reason: 'not-in-bag' }; }
    /* Vũ khí phải đúng loại của hero (kiếm/thương/trượng). */
    if (def.type === 'weapon' && hero.weapon && def.weapon !== hero.weapon) {
      return { ok: false, reason: 'wrong-weapon-type', need: hero.weapon, got: def.weapon };
    }
    var k = heroKey(hero);
    equipped[k] = equipped[k] || { weapon: null, armor: null };
    var slot = def.slot;
    var oldId = equipped[k][slot];
    if (oldId === itemId) { return { ok: false, reason: 'already-equipped' }; }
    /* Gỡ đồ cũ (trả chỉ số), mặc đồ mới. */
    if (oldId) { applyStats(hero, ITEMS[oldId], -1); }
    applyStats(hero, def, 1);
    equipped[k][slot] = itemId;
    return { ok: true, item: cloneItem(def), replaced: oldId || null };
  }
  function unequip(slot, hero) {
    var k = heroKey(hero);
    var eq = equipped[k];
    if (!eq || !eq[slot]) { return { ok: false, reason: 'nothing-equipped' }; }
    var oldId = eq[slot];
    applyStats(hero, ITEMS[oldId], -1);
    eq[slot] = null;
    return { ok: true, item: cloneItem(ITEMS[oldId]) };
  }
  function applyStats(hero, def, sign) {
    if (!def) { return; }
    if (def.atk) { hero.atk = Math.max(1, (hero.atk || 0) + sign * def.atk); }
    if (def.def) { hero.def = Math.max(0, (hero.def || 0) + sign * def.def); }
  }

  /* ---- Khởi đầu + save/load ---- */
  function giveStarter() {
    addItem('potion-hp', 3);
    addItem('potion-mp', 2);
    addItem('sword-wood', 1);
    return getItems();
  }
  function init() {
    if (!items.length && gold === 0) { giveStarter(); }
    return getItems();
  }

  function save() {
    var data = { v: 5, gold: gold, items: items, equipped: equipped };
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
      if (!data) { return null; }
      gold = data.gold || 0;
      items = data.items || [];
      equipped = data.equipped || {};
      return data;
    } catch (e) { return null; }
  }

  function update(dt) {
    if (dt && potionCd > 0) { potionCd -= dt; }
  }

  var api = {
    ITEMS: ITEMS, POTION_HEAL: POTION_HEAL, POTION_COOLDOWN: POTION_COOLDOWN,
    init: init, giveStarter: giveStarter, clear: clear,
    addItem: addItem, removeItem: removeItem, getItems: getItems, count: count,
    addGold: addGold, getGold: getGold, spendGold: spendGold,
    usePotion: usePotion, getPotionCooldown: getPotionCooldown,
    equip: equip, unequip: unequip, getEquipped: getEquipped,
    save: save, load: load, update: update
  };
  window.PixiEngine.Wuxia.Inventory = api;
  window.PixiEngine.WuxiaInventory = api;
})();
