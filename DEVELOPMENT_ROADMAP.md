# DEVELOPMENT_ROADMAP.md — PixiJS 3D Game Engine Editor

## Trạng thái: v1.0 — tất cả 7 phase đã có bản tối thiểu thật

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 1. Engine Foundation | Shell, PixiJS 8.23.0 + Babylon 7.0.0, viewport thật, camera, grid, gizmo | ✅ Xong |
| 2. Scene Editor | Hierarchy, GameObject, Inspector, select, transform, undo/redo | ✅ Xong |
| 3. 3D Model System | GLB importer, Model Viewer, Material, Texture, Skeleton | ✅ Xong (trừ FBX — xem Planned) |
| 4. Environment Editor | Terrain, Tileset, props, vegetation, buildings, water, skybox, lighting | ✅ Xong |
| 5. Animation & VFX | Timeline, State Machine, Particle Editor, VFX preview | ✅ Xong (tối thiểu thật) |
| 6. Game Systems | Physics, Collision, Navigation, Runtime, Input | ✅ Xong (tối thiểu thật; Navigation = Planned) |
| 7. Advanced Editor | UI System, Code Editor, AI Assistant, Prefab, Project, Export | ✅ Xong (tối thiểu thật) |

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

## Số liệu

- Tổng: **45 file JS + index.html + 4 CSS + 3 MD + 1 JSON ≈ 12.600+ dòng**
  (JS ~10.500 dòng, index.html 575, CSS 434, default-scene.json 1304).
- Default scene: 36 objects (2 light, 7 terrain-block, 1 water, 5 tree, 4 rock,
  1 chest, 6 coin, 1 bridge, 1 waterfall, 2 house, 1 temple, 3 flower, 2 lantern).
- Prefabs: 21 mục, 5 category.

## Planned / việc tiếp theo (theo thứ tự ưu tiên)

1. **Test trên điện thoại thật qua GitHub Pages** — mở link Pages, kiểm tra render
   Babylon, touch orbit/pinch, joystick, Play. (Việc này cần user duyệt đẩy GitHub.)
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
