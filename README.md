# PIXIJS 3D GAME ENGINE EDITOR — v5.0.0 Professional

Trình biên tập game 3D chạy trên trình duyệt, phong cách Doriax/Unity: viewport 3D thật
(Babylon.js **hoặc Three.js r128** — chuyển đổi bằng select Renderer), giao diện editor
bằng PixiJS v8, scene đảo nổi, terrain, tileset, GLB, animation, particle, runtime chơi
được trên điện thoại — **và game MMORPG 3D Wuxia (Three.js) chơi được ở tab ⚔️ Wuxia Game
hoặc file `wuxia.html` standalone**.

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

## Mở game Wuxia (v5.0.0)

- **Trong Editor:** mở `index.html` → tab **⚔️ Wuxia Game** → bấm **▶ Play Wuxia**
  (hoặc nút **▶ Play Wuxia** ở viewport-toolbar). Có thể đổi renderer ở select
  **Renderer** (Babylon.js / Three.js) — đổi sang Three.js gọi
  `window.PixiEngine.RendererSwitch.switchTo('three')` (đã xác minh hàm có thật).
- **Standalone (điện thoại):** mở `wuxia.html` trên cùng host Pages
  (`https://<tên-user>.github.io/threejs3D/wuxia.html`) → chạm **▶ Bắt đầu chơi**
  (chạm để khởi tạo AudioContext + game, theo autoplay policy). File này **chỉ load
  three.js r128**, không load Babylon/PixiJS. Link "Mở trong Editor" quay về `index.html`.
- Scene tham khảo: `projects/default-project/wuxia-scene.json` (map 56×56, thị trấn
  Trường Bạch, 3 hero Lâm Phong Kiếm / Thiết Ngưu Thương / Bạch Tuyết Pháp, NPC,
  bãi quái, boss Long Ngâm Lão Tổ, 3 quest — KHỚP def thật trong `js/wuxia/`) — mô tả tham khảo;
  `WuxiaGame` hiện hardcode map 56×56 và chưa đọc file JSON này.
- Game Wuxia dùng **Three.js r128 + GLTFLoader + MeshoptDecoder** (CDN jsdelivr, đã xác
  minh 200), model GLB thật (RobotExpressive / Fox / CesiumMan / kiem-hiep) với
  fallback procedural khi không tải được model. Joystick + nút skill do `WuxiaHUD` tạo.

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
| Three.js (v5.0.0) | Renderer Three.js r128 song song Babylon (select Renderer ở toolbar, `RendererSwitch.switchTo`), load GLB qua `ThreeGLBLoader` (GLTFLoader + MeshoptDecoder) |
| Wuxia Game (v5.0.0) | MMORPG 3D Three.js: tab ⚔️ Wuxia Game trong Editor + `wuxia.html` standalone, map 56×56 Trường Bạch, 3 hero (Lâm Phong Kiếm / Thiết Ngưu Thương / Bạch Tuyết Pháp), party + follower AI, combat combo/crit, 6 skill + ultimate Thần Long Giáng Thế, quái Tuyết Yêu/Sơn Tặc/Hồ Ly Tinh + boss Long Ngâm Lão Tổ (enrage/triệu hồi/AoE slam), 3 quest chain, dungeon portal + arena, inventory/potion, WebAudio tổng hợp, HUD HP/MP/boss bar/minimap/joystick/skill bar (xem `js/wuxia/`, `css/wuxia.css`) |
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
- **Three.js r128 (v5.0.0)** — renderer 3D thứ hai (song song Babylon) cho game
  Wuxia: `three.min.js` (UMD) + `GLTFLoader.js` + `meshopt_decoder.js`.
- CDN (đã xác minh HTTP 200 ngày 2026-11-24):
  - `https://cdn.jsdelivr.net/npm/pixi.js@8.23.0/dist/pixi.min.js`
  - `https://cdn.jsdelivr.net/npm/babylonjs@7.0.0/babylon.js`
  - `https://cdn.jsdelivr.net/npm/babylonjs-loaders@7.0.0/babylonjs.loaders.min.js`
  - `https://cdn.jsdelivr.net/npm/babylonjs-gui@7.0.0/babylon.gui.min.js`
  - `https://cdn.jsdelivr.net/npm/babylonjs-serializers@7.0.0/babylonjs.serializers.min.js`
  - Lưu ý: loaders/gui/serializers là package riêng của Babylon 7, không nằm trong
    `babylon.js` chính (đường dẫn `babylonjs@7.0.0/loaders/...` trả 404).
- CDN Three.js r128 (v5.0.0, đã xác minh HTTP 200):
  - `https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js`
  - `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js`
  - `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/meshopt_decoder.js`

## Cấu trúc

```text
index.html  wuxia.html
css/ editor.css panels.css viewport.css themes.css wuxia.css
js/core/        Engine.js Editor.js* SceneManager.js EventManager.js
                SelectionManager.js UndoRedoManager.js ProjectManager.js Boot.js
js/rendering/   PixiRenderer.js BabylonRenderer.js CameraController.js
                LightingManager.js MaterialManager.js ShadowManager.js
                ThreeRenderer.js ThreeGLBLoader.js RendererSwitch.js   (v5.0.0)
js/wuxia/       WuxiaWorld.js WuxiaCamera.js WuxiaCharacters.js WuxiaParty.js
                WuxiaCombat.js WuxiaSkills.js WuxiaEnemies.js WuxiaQuests.js
                WuxiaHUD.js WuxiaDungeon.js WuxiaInventory.js WuxiaAudio.js
                WuxiaGame.js                                            (v5.0.0)
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
projects/default-project/wuxia-scene.json     (scene Wuxia tham khảo, v5.0.0)
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

## Đã kiểm thử v5.0.0 (Verified — 2026-11-24, chạy trên máy dev, chưa test trên điện thoại thật)

- `node --check`: **61/61 file JS PASS** (45 file v1.0 + 16 file mới v5.0: 13 `js/wuxia/*` + 3 `js/rendering/Three*.js`).
- Harness mới `~/workspace/.test-pixi3d/test-wuxia-v5.js` — **61/61 PASS × 2 lần**, dùng
  **three r128 thật** (npm pack `three@0.128.0`, load bằng vm; chỉ stub `WebGLRenderer`
  vì Node không có WebGL) + DOM stub tối thiểu, BABYLON/PIXI vắng (test degrade):
  three REVISION 128 + GLTFLoader + MeshoptDecoder có thật; ThreeRenderer build 4 object
  mẫu + add/remove/update + raycast + stats + shading + grid; RendererSwitch
  babylon→three OK, về babylon thất bại an toàn (giữ three, BABYLON chưa load);
  WuxiaWorld build (≥50 mesh, bậc đền 1.8/0.6, collision, 23 điểm spawn);
  camera iso pitch 42° (kẹp 35–50); party 3 hero, switch hero, combat gây damage thật,
  6 skill + ultimate bị chặn khi nộ <100, boss enrage <50% + triệu hồi <30%,
  quest Q1→active khi nói chuyện Trưởng Lão; WuxiaGame boot đầu-cuối: joystick di
  chuyển leader thật, setHero, save/load round-trip, vào/ra dungeon, stop.
  GLB loader: local 404 → fallback CDN → onError rõ (không treo, không crash).
- Harness v1.0 vẫn **17/17 PASS** (không phá v1.0).
- HTTP smoke: **73/73 file trả 200** (index.html + wuxia.html + 5 CSS + 61 JS + 3 MD + 2 JSON).
- CDN **200**: three r128 (3 URL), PixiJS 8.23.0, Babylon 7.0.0, 4 GLB fallback
  (RobotExpressive 463.988B, Fox 162.852B, CesiumMan 438.044B, kiem-hiep 18.730.780B).
- 4 lỗi tích hợp đã tìm và sửa trong lúc hợp nhất v5.0:
  1. `ThreeGLBLoader.loadGLB` không try/catch `loader.load()` — môi trường không có
     `XMLHttpRequest` sẽ throw đồng bộ và crash; nay bắt lại và đi đường onFail/fallback.
  2. `WuxiaCharacters.createCharacter` làm rơi `def.title` (hero chỉ còn tên ngắn
     "Lâm Phong"); nay giữ `title` đầy đủ (Lâm Phong Kiếm...), `WuxiaGame.getState()`
     cũng trả `title` cho party.
  3. `SceneManager` chỉ mirror object sang Babylon — thêm/xóa/sửa lúc đang ở chế độ
     three không hiện bên three; nay `syncThree()` mirror sang `ThreeRenderer`
     khi `state.renderer === 'three'`.
  4. `wuxia-scene.json` + README ghi sai tên hero/boss (Kiếm Hiệp/Hồ Ly/Thiếu Lâm,
     boss Hắc Long) — đã sửa khớp def thật (Lâm Phong Kiếm/Thiết Ngưu Thương/
     Bạch Tuyết Pháp, boss Long Ngâm Lão Tổ 1200 HP, quest q1/q2/q3).
- Còn phải test trên điện thoại thật qua GitHub Pages sau khi đẩy: mở tab Wuxia +
  `wuxia.html`, chuyển renderer qua lại, Play/Stop, joystick + skill chạm, GLB thật load.

## Chưa làm / Planned (ghi rõ, không giả vờ có)

- **Import FBX**: Babylon.js không có FBX loader trên trình duyệt — import FBX trả
  lỗi rõ "chưa hỗ trợ, hãy convert sang GLB". Three.js r128 cũng không có FBXLoader
  trong CDN đã nạp (chỉ GLTFLoader + MeshoptDecoder) — game Wuxia cũng chưa hỗ trợ FBX.
- **GLB chỉ load khi có mạng CDN**: model GLB (RobotExpressive/Fox/CesiumMan/
  kiem-hiep) tải từ CDN qua mạng; mất mạng thì game dùng fallback procedural
  (nếu nhóm Wuxia đã làm fallback) hoặc không có nhân vật thật.
- **NavMesh / AI di chuyển**: chưa có NavMesh generator; NPC chưa tự đi lại
  (game Wuxia dùng di chuyển đơn giản, quái spawn theo bãi cố định).
- **2D & Tilemaps tab**: hiện mở Tile Palette (dùng chung tileset 3D); chưa có
  trình biên tập tilemap 2D riêng.
- **Vật lý đầy đủ**: PhysicsManager/CollisionManager là vật lý đơn giản tự viết
  (trọng lực + mặt đất + AABB box/sphere), không phải engine vật lý (không có
  cannon.js/ammo.js).
- **Texture paint**: TexturePainter dùng vertex color, chưa phải splat texture /
  multi-material shader (dữ liệu `terrainData.splat` đã sẵn để nâng cấp).
- **Chưa test trên trình duyệt/điện thoại thật**: toàn bộ test trên là Node stub +
  HTTP smoke. Cần mở thử trên điện thoại qua GitHub Pages sau khi đẩy để kiểm tra
  render Babylon + Three.js + touch thật (đặc biệt tab Wuxia và `wuxia.html`).

## Bảo mật

Không có secret/token/key nào trong repo. AI Assistant không gọi API ngoài.
