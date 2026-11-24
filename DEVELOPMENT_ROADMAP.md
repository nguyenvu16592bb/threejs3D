# DEVELOPMENT_ROADMAP.md — PixiJS 3D Game Engine Editor — v5.0.0

## Trạng thái: v5.0.0 — xong, đã test harness (chưa test trên điện thoại thật, xem mục Verified v5.0.0)

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 1. Engine Foundation | Shell, PixiJS 8.23.0 + Babylon 7.0.0, viewport thật, camera, grid, gizmo | ✅ Xong |
| 2. Scene Editor | Hierarchy, GameObject, Inspector, select, transform, undo/redo | ✅ Xong |
| 3. 3D Model System | GLB importer, Model Viewer, Material, Texture, Skeleton | ✅ Xong (trừ FBX — xem Planned) |
| 4. Environment Editor | Terrain, Tileset, props, vegetation, buildings, water, skybox, lighting | ✅ Xong |
| 5. Animation & VFX | Timeline, State Machine, Particle Editor, VFX preview | ✅ Xong (tối thiểu thật) |
| 6. Game Systems | Physics, Collision, Navigation, Runtime, Input | ✅ Xong (tối thiểu thật; Navigation = Planned) |
| 7. Advanced Editor | UI System, Code Editor, AI Assistant, Prefab, Project, Export | ✅ Xong (tối thiểu thật) |
| 8. Three.js + Wuxia (v5.0.0) | Renderer Three.js r128 song song Babylon + game MMORPG Wuxia (tab trong Editor + `wuxia.html` standalone) | ✅ Xong — harness v5 61/61 ×2, smoke 73/73, CDN 200 |

## Đã kiểm thử (Verified — 2026-11-24)

- `node --check`: **45/45 file JS PASS** (chạy sau bước hợp nhất cuối).
- Harness Node `~/workspace/.test-pixi3d/test-pixi3d-engine.js` (stub
  window/document/BABYLON/PIXI): **17/17 PASS × 2 lần** — boot, default scene
  36 objects, `getGroundHeight`, hierarchy, terrain brush Raise đổi heightmap thật,
  tileset place, undo/redo, save/load JSON round-trip, Inspector render thật,
  CodeEditor.run(), AI preview không tự thực thi, particle Fire, GameRuntime
  play/stop, stats.
- HTTP smoke: **51/51 file trả 200** (index + 4 CSS + 45 JS + default-scene.json).
- CDN: PixiJS 8.23.0 + Babylon 7.0.0 + loaders/gui/serializers — **200**.
- Lỗi tích hợp đã sửa: (1) thêm `js/core/Boot.js` nối các `init()`; (2) sửa
  `state.selected` id string → object + phòng thủ ở Inspector/Gizmo;
  (3) thêm `js/ui/CodeEditor.js` (tab Code Editor trước đó trống).

## Đã kiểm thử v5.0.0 (Verified — 2026-11-24, coordinator chạy sau hợp nhất)

- `node --check`: **61/61 file JS PASS** (45 v1.0 + 16 mới v5.0).
- Harness mới `~/workspace/.test-pixi3d/test-wuxia-v5.js`: **61/61 PASS × 2 lần**,
  dùng **three r128 thật** (npm pack, vm; chỉ stub WebGLRenderer vì Node không có
  WebGL): REVISION 128, GLTFLoader + MeshoptDecoder; ThreeRenderer build/add/remove/
  update/raycast/stats; RendererSwitch babylon→three OK (về babylon thất bại an toàn
  khi BABYLON chưa load); World build ≥50 mesh + bậc đền + collision; camera iso 42°;
  party/combat/skill/boss enrage + triệu hồi/quest Q1; WuxiaGame boot đầu-cuối
  (joystick di chuyển thật, setHero, save/load, vào/ra dungeon); GLB fallback onError rõ.
- Harness v1.0 vẫn **17/17 PASS**.
- HTTP smoke: **73/73 file trả 200**. CDN 200: three r128 (3 URL), PixiJS 8.23.0,
  Babylon 7.0.0, 4 GLB fallback (RobotExpressive/Fox/CesiumMan/kiem-hiep).
- 4 lỗi tích hợp đã sửa: (1) `ThreeGLBLoader.loadGLB` try/catch `loader.load()`
  (không XHR thì crash); (2) `createCharacter` giữ `title` hero đầy đủ +
  `getState()` trả `title`; (3) `SceneManager.syncThree()` mirror object sang
  ThreeRenderer khi ở chế độ three; (4) `wuxia-scene.json`/README sửa tên hero/boss
  khớp def thật.
- Còn phải test trên điện thoại thật qua GitHub Pages sau khi đẩy: tab Wuxia +
  `wuxia.html`, chuyển renderer, Play/Stop, joystick + skill chạm, GLB thật load.

## Số liệu

- Tổng v5.0.0: **75 file, 20.667 dòng** (61 file JS + index.html + wuxia.html + 5 CSS + 3 MD + 2 JSON + assets).
- v5.0.0 thêm so với v1.0 (13.038 dòng): **wuxia.html + css/wuxia.css +
  projects/default-project/wuxia-scene.json** + 13 file `js/wuxia/*.js` +
  3 file `js/rendering/Three*.js` (~7.600 dòng mới).
- Default scene: 36 objects (2 light, 7 terrain-block, 1 water, 5 tree, 4 rock,
  1 chest, 6 coin, 1 bridge, 1 waterfall, 2 house, 1 temple, 3 flower, 2 lantern).
- Prefabs: 21 mục, 5 category.
- Wuxia scene: map 56×56, 3 hero (Lâm Phong Kiếm / Thiết Ngưu Thương / Bạch Tuyết Pháp),
  2 NPC (Vệ Binh A Hổ, Trưởng Lão Tuyết), 3 bãi quái (Tuyết Yêu/Sơn Tặc/Hồ Ly Tinh),
  1 boss Long Ngâm Lão Tổ (1200 HP), 3 quest (xem `projects/default-project/wuxia-scene.json`).

## Planned / việc tiếp theo (theo thứ tự ưu tiên)

1. **Test v5.0.0 trên điện thoại thật qua GitHub Pages** — harness + smoke đã xong;
   còn lại mở `index.html` tab Wuxia + `wuxia.html` trên phone thật (chuyển renderer,
   Play/Stop Wuxia, joystick + skill chạm, GLB thật load). (Việc này cần user duyệt đẩy GitHub.)
2. **NavMesh + NPC tự di chuyển** — NavMesh generator, Navigation Surface,
   agent đi lại trên đảo.
3. **Texture terrain nâng cấp** — từ vertex color lên splat texture /
   multi-material shader (dữ liệu `terrainData.splat` đã sẵn).
4. **Import FBX** — cần converter (VD: dùng tool ngoài convert FBX → GLB trước
   khi import) hoặc loader WASM; hiện tại báo lỗi rõ ràng.
5. **2D & Tilemaps riêng** — trình biên tập tilemap 2D thật (hiện tab 2D dùng chung
   Tile Palette 3D).
6. **Vật lý đầy đủ** — tích hợp cannon.js/ammo.js qua CDN (giữ nguyên Vanilla JS,
   không build step) thay cho vật lý tự viết.
7. **Export Project ZIP** — gói scene JSON + asset thành 1 file ZIP tải về.
8. **Prefab variants / nested prefab** — hiện chỉ có Save/Instantiate cơ bản.
9. **Animation Blend Tree** — hiện chỉ có State Machine + crossfade đơn giản.
10. **UI anchor/pivot/event binding đầy đủ** — hiện widget kéo-thả + click cơ bản.
