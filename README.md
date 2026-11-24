# PIXIJS 3D GAME ENGINE EDITOR — v1.0 Professional

Trình biên tập game 3D chạy trên trình duyệt, phong cách Doriax/Unity: viewport 3D thật
(Babylon.js), giao diện editor bằng PixiJS v8, scene đảo nổi, terrain, tileset, GLB,
animation, particle, runtime chơi được trên điện thoại.

> **Phone-first:** mọi tính năng đều mở và dùng được bằng trình duyệt điện thoại
> (TECNO SPARK 20). Không cần máy tính, không cần cài đặt, không cần chạy server.

## Mở editor như thế nào (chỉ 1 cách)

1. Đẩy repo này lên GitHub rồi bật **GitHub Pages** (Settings → Pages → Deploy from
   branch → `main`, thư mục `/ (root)`).
2. Mở link Pages bằng trình duyệt điện thoại, ví dụ:
   `https://<tên-user>.github.io/threejs3D/`
3. Editor mở sẵn scene **đảo nổi** (36 object): 3 tầng đất cỏ, 5 cây thông, rương,
   6 đồng xu vàng, cầu gỗ, thác nước, 2 nhà, cổng Torii, đèn lồng, mặt nước.

Không có bước localhost / `node server.js` — editor là file tĩnh, chỉ cần host tĩnh
(GitHub Pages) là chạy.

## Tính năng đã làm thật (không nút trang trí)

| Nhóm | Tính năng thật |
|---|---|
| Viewport | Babylon.js 7.0.0 render 3D thật, camera orbit/free/top/front/left/right, grid, shading Shaded/Wireframe, FPS/Draw Calls/Triangles/Vertices/Memory thật (cập nhật mỗi giây) |
| Scene | Hierarchy thật theo scene, thêm/xóa/nhân bản/đổi tên/kéo-thả đổi parent, ẩn/hiện, tìm kiếm, multi-select |
| Inspector | Sửa Transform (9 số) ghi thẳng vào mesh, Material, Light, Camera, Terrain, Components (Animator/Collider/Rigidbody/Audio/Particle/Script) |
| Gizmo | Babylon GizmoManager thật: Move (W) / Rotate (E) / Scale (R), Local/World, snap, F focus, Delete, Ctrl+D nhân bản, Ctrl+Z / Ctrl+Y undo-redo |
| Terrain | Ground mesh heightmap thật; brush Raise/Lower/Smooth/Flatten/Noise (size/strength/falloff), paint texture Grass/Dirt/Stone/Sand/Snow lên vertex color, export/import heightmap, noise theo seed |
| Tileset | 21 prefab procedural thật (block cỏ/đất/đá/cát/tuyết, thông, cây, đá, rương, xu, cầu, nhà, đền, cổng, đèn lồng, biển, hàng rào...), click palette rồi click viewport để đặt, snap lưới, random xoay/tỉ lệ |
| Model | Import GLB/GLTF/OBJ/STL thật qua `BABYLON.SceneLoader` (kéo-thả file hoặc nút Import), metadata thật (mesh/triangle/vertex/material/animation/skeleton/bounding box), 2 GLB mẫu CDN (RobotExpressive, Fox) có fallback, Model Viewer + Skeleton Viewer |
| Material | Tạo/sửa/gán material: base color, metallic, roughness, emissive, opacity, wireframe |
| Animation | Timeline thật (play/pause/scrub/tốc độ/loop), clip list từ `animationGroups` của GLB, State Machine Idle/Walk/Run/Attack/Jump/Death tự map clip theo tên, procedural bob khi model không có clip |
| Particle | 6 preset thật bằng `BABYLON.ParticleSystem`: Fire, Smoke, Snow, Rain, Magic, Explosion — chỉnh emit rate/lifetime/size/gravity trực tiếp |
| Runtime | Nút Play/Pause/Stop riêng; nhân vật di chuyển WASD + **joystick chạm + nút NHẢY trên điện thoại**, camera follow, nhảy/vật lý trọng lực, va chạm mặt đất (theo độ cao đảo) + bounds |
| UI System | Thêm Button/Text/Panel/HealthBar/Image/Slider lên overlay (PixiJS, fallback DOM), kéo-thả vị trí, HealthBar đổi theo giá trị |
| Code Editor | Textarea JS + ví dụ mẫu + nút Chạy (chạy qua `new Function` với `PixiEngine`/`BABYLON`/`log`, có try/catch), lưu vào localStorage |
| AI Assistant | Rule-based, **không gọi API ngoài**: hiểu lệnh tiếng Việt/Anh ("thêm 20 cây thông quanh làng", "tạo núi tuyết", "thêm sông thác nước", "tạo đền gần núi"...), hiện preview danh sách thao tác, chỉ thực thi khi bấm **Xác nhận**; lệnh xóa cần xác nhận 2 lần |
| Project | Save/Load JSON (localStorage + tải lên/tải xuống file), autosave 60 giây, undo/redo snapshot |
| Export | Scene JSON, Export GLB (qua `BABYLON.GLTF2Export`, CDN serializers đã nạp) |

## Công nghệ

- **Vanilla JavaScript only** — không TypeScript, không Vite, không ES Module, không
  import/export, không React/Vue, không backend. Classic `<script>` + namespace
  `window.PixiEngine`.
- **PixiJS 8.23.0** — UI/overlay 2D, HUD, widget.
- **Babylon.js 7.0.0** — toàn bộ render 3D, model, terrain, animation, particle.
  PixiJS không làm 3D — Babylon mới là layer 3D thật.
- CDN (đã xác minh HTTP 200 ngày 2026-11-24):
  - `https://cdn.jsdelivr.net/npm/pixi.js@8.23.0/dist/pixi.min.js`
  - `https://cdn.jsdelivr.net/npm/babylonjs@7.0.0/babylon.js`
  - `https://cdn.jsdelivr.net/npm/babylonjs-loaders@7.0.0/babylonjs.loaders.min.js`
  - `https://cdn.jsdelivr.net/npm/babylonjs-gui@7.0.0/babylon.gui.min.js`
  - `https://cdn.jsdelivr.net/npm/babylonjs-serializers@7.0.0/babylonjs.serializers.min.js`
  - Lưu ý: loaders/gui/serializers là package riêng của Babylon 7, không nằm trong
    `babylon.js` chính (đường dẫn `babylonjs@7.0.0/loaders/...` trả 404).

## Cấu trúc

```text
index.html
css/ editor.css panels.css viewport.css themes.css
js/core/        Engine.js Editor.js* SceneManager.js EventManager.js
                SelectionManager.js UndoRedoManager.js ProjectManager.js Boot.js
js/rendering/   PixiRenderer.js BabylonRenderer.js CameraController.js
                LightingManager.js MaterialManager.js ShadowManager.js
js/editor/      SceneHierarchy.js Inspector.js TransformGizmo.js
                AssetBrowser.js Toolbar.js ContextMenu.js
js/terrain/     TerrainEditor.js TerrainBrush.js HeightmapEditor.js
                TexturePainter.js FoliagePainter.js WaterEditor.js
js/models/      ModelImporter.js GLBLoader.js ModelViewer.js
                ModelInspector.js SkeletonViewer.js
js/animation/   AnimationEditor.js Timeline.js AnimationGraph.js StateMachine.js
js/effects/     ParticleEditor.js VFXManager.js
js/ui/          UIEditor.js WidgetManager.js CodeEditor.js
js/ai/          AIAssistant.js PromptManager.js
js/runtime/     GameRuntime.js InputManager.js PhysicsManager.js CollisionManager.js
assets/         (thư mục asset người dùng import; đang trống)
projects/default-project/default-scene.json   (scene đảo nổi, 36 objects)
README.md  ENGINE_ARCHITECTURE.md  DEVELOPMENT_ROADMAP.md
```

\* `js/core/Editor.js` trong prompt gốc được thay bằng `Boot.js` (nối tất cả module
lại khi khởi động — xem `ENGINE_ARCHITECTURE.md`).

## Điều khiển

| Thao tác | Cách làm |
|---|---|
| Xoay camera | Kéo chuột phải / 1 ngón kéo trên màn hình |
| Zoom | Lăn chuột / chụm 2 ngón (pinch) |
| Pan | Chuột giữa kéo / Shift + kéo |
| Chọn object | Bấm vào object / bấm trong Hierarchy |
| Di chuyển/xoay/scale | W / E / R rồi kéo gizmo |
| Focus | F |
| Xóa / nhân bản | Delete / Ctrl+D |
| Undo / Redo | Ctrl+Z / Ctrl+Y |
| Chơi game | Nút ▶ Play → joystick trái + nút NHẢY (điện thoại) hoặc WASD + Space (máy tính) |

## Đã kiểm thử (Verified — 2026-11-24, chạy trên máy dev, chưa test trên điện thoại thật)

- `node --check`: **45/45 file JS PASS**.
- Harness Node `~/workspace/.test-pixi3d/test-pixi3d-engine.js` (stub
  window/document/BABYLON/PIXI tối thiểu): **17/17 PASS, chạy 2 lần** — boot Engine,
  default scene 36 objects, `getGroundHeight` đúng 3 điểm, hierarchy render,
  terrain brush Raise đổi heightmap thật (0 → 1), tileset place tạo object thật,
  undo/redo, save/load JSON round-trip, Inspector render thật sau select,
  CodeEditor.run() tạo object thật, AI preview không tự thực thi, particle Fire,
  GameRuntime play/stop, stats FPS/triangles.
- HTTP smoke (`python3 -m http.server`, chỉ dùng để tự kiểm tra): **51/51 file
  trả 200** (index.html + 4 CSS + 45 JS + default-scene.json).
- CDN PixiJS + Babylon (5 URL): **200**.
- 2 lỗi tích hợp đã tìm và sửa trong lúc hợp nhất:
  1. Không có code nào gọi `init()` của các panel → thêm `js/core/Boot.js` nối tất cả.
  2. `state.selected` là id string trong khi Inspector/Gizmo/TerrainBrush đọc như
     object → `SelectionManager` nay lưu object; Inspector/Gizmo thêm phòng thủ
     resolve id string.
  3. Code Editor tab chỉ có container trống → thêm `js/ui/CodeEditor.js`.

## Chưa làm / Planned (ghi rõ, không giả vờ có)

- **Import FBX**: Babylon.js không có FBX loader trên trình duyệt — import FBX trả
  lỗi rõ "chưa hỗ trợ, hãy convert sang GLB".
- **2D & Tilemaps tab**: hiện mở Tile Palette (dùng chung tileset 3D); chưa có
  trình biên tập tilemap 2D riêng.
- **Vật lý đầy đủ**: PhysicsManager/CollisionManager là vật lý đơn giản tự viết
  (trọng lực + mặt đất + AABB box/sphere), không phải engine vật lý (không có
  cannon.js/ammo.js).
- **Texture paint**: TexturePainter dùng vertex color, chưa phải splat texture /
  multi-material shader (dữ liệu `terrainData.splat` đã sẵn để nâng cấp).
- **NavMesh / AI di chuyển**: chưa có NavMesh generator; NPC chưa tự đi lại.
- **Chưa test trên trình duyệt/điện thoại thật**: toàn bộ test trên là Node stub +
  HTTP smoke. Cần mở thử trên điện thoại qua GitHub Pages sau khi đẩy để kiểm tra
  render Babylon + touch thật.

## Bảo mật

Không có secret/token/key nào trong repo. AI Assistant không gọi API ngoài.
