# ENGINE_ARCHITECTURE.md — PixiJS 3D Game Engine Editor — v5.0.0

## 1. Tổng quan

```
┌─────────────────────────────────────────────────────────────────┐
│ index.html — shell: menu, 7 tab (thêm ⚔️ Wuxia Game), layout,   │
│   status bar, CDN (Pixi + Babylon + Three r128), wuxia.html    │
│   standalone (chỉ Three.js)                                     │
├─────────────────────────────────────────────────────────────────┤
│ js/core/Boot.js — nối tất cả module (gọi init từng module)     │
├───────────┬───────────────┬───────────────┬─────────────────────┤
│ CORE      │ RENDERING     │ EDITOR        │ TERRAIN / MODELS /  │
│ Engine    │ BabylonRender │ Hierarchy     │ ANIMATION / EFFECTS │
│ (v5.0.0)  │ ThreeRenderer │ Inspector     │ UI / AI / RUNTIME   │
│ SceneMgr  │ RendererSwitch│ Gizmo         │ WUXIA (Three.js)    │
│ EventBus  │ PixiRenderer  │ AssetBrowser  │ (xem §4b)           │
│ Select    │ CameraCtrl    │ Toolbar       │                     │
│ Undo/Redo │ Lighting      │ ContextMenu   │                     │
│ Project   │ Shadow        │               │                     │
└───────────┴───────────────┴───────────────┴─────────────────────┘
        │                │                 │
        ▼                ▼                 ▼
  window.PixiEngine.state ──► BABYLON.Scene (3D thật) / THREE.Scene
  { scene, engine, canvas,      ▲              (Wuxia, qua
    objects[], selected,        │ PixiJS overlay (HUD/widget)  RendererSwitch)
    mode, stats }               │
```

## 2. Nguyên tắc kiến trúc

- **Vanilla JS, không module**: mọi file là IIFE `'use strict'`, expose qua
  `window.PixiEngine = window.PixiEngine || {}`. Không `import`/`export`.
- **Một nguồn sự thật**: `PixiEngine.state.objects` là mảng GameObject duy nhất.
  Mọi panel (Hierarchy, Inspector, AssetBrowser) đều render từ đó và lắng nghe
  `EventBus`.
- **Hai layer render rõ ràng**: Babylon.js làm 3D thật (mesh, light, animation,
  particle, terrain). PixiJS v8 chỉ làm overlay 2D (HUD, widget UI) trên canvas
  `#pixi-overlay` phủ trên viewport. Không giả vờ PixiJS làm 3D.
- **v5.0.0 — renderer thứ hai (Three.js r128)**: `js/rendering/ThreeRenderer.js` +
  `ThreeGLBLoader.js` + `RendererSwitch.js` (nhóm Rendering) cho phép chuyển
  viewport giữa Babylon và Three.js qua select `#renderer-select` ở toolbar.
  Wiring trong `index.html` gọi `window.PixiEngine.RendererSwitch.switchTo(value)`
  có phòng thủ `typeof` — nếu module chưa có thì báo status rõ và giữ Babylon.
- **v5.0.0 — Wuxia Game tách riêng**: `js/wuxia/*.js` (nhóm Wuxia) chạy trên
  Three.js, không chạm logic Babylon/PixiJS của editor. Điểm nối duy nhất:
  tab `#wuxia-panel` + `#wuxia-viewport`/`#wuxia-hud` trong `index.html`, nút Play
  gọi `PE.WuxiaGame.init(container)` + `start()` có phòng thủ `typeof THREE`.
  **Đã xác minh từ code thật của nhóm Wuxia:** `WuxiaGame.init(canvasOrContainer,
  opts)` nhận element hoặc selector; Game tự tạo canvas renderer WebGL và append
  vào container, tự tìm `#wuxia-hud` trong container để gắn HUD; nếu truyền
  element CANVAS thì lấy parentNode làm container. Vì vậy wiring truyền
  `#wuxia-viewport` (index.html, hiện khi tab wuxia mở) và `#wuxia-app`
  (wuxia.html, full màn hình) — **không** truyền `#viewport-canvas` (nằm trong
  `#main-layout` đang bị ẩn ở tab wuxia) hay object `{canvas, hud}`. Tên global
  đã xác minh: `PE.WuxiaGame` (wiring thử thêm `window.WuxiaGame` /
  `PE.Wuxia.Game` để phòng hờ); `start()`/`stop()` đều có thật. `wuxia.html`
  standalone chỉ load three.js r128 (không Babylon/PixiJS) và khởi tạo game sau
  gesture chạm (AudioContext).
- **Phòng thủ giữa các nhóm**: mọi lệnh gọi chéo manager đều kiểm tra `typeof`
  trước; module chưa sẵn thì nút bị disable + title "Planned", không giả vờ chạy.

## 3. GameObject

```js
{
  id, name, type,            // type: terrain-block | tree | rock | light | ...
  parentId, children: [id],  // hierarchy
  transform: { position:{x,y,z}, rotation:{x,y,z}, scale:{x,y,z} },
  babylonNode,               // BABYLON.Mesh | TransformNode | null
  components: [{type, ...}], // Animator, Collider, Rigidbody, ...
  visible, active, tag, layer, static,
  meshType, size, options, color, opacity,  // đủ để dựng lại node khi load
  userData: { terrainData?, modelInfo?, prefabId?, collider? }
}
```

Quy ước quan trọng: **`state.selected` luôn là object** (không phải id string).
`selectedIds` (trong SelectionManager) mới là mảng id. Inspector/Gizmo cũng
phòng thủ resolve id string nếu gặp.

## 4. Module

### Core (`js/core/`)
- `EventManager.js` — EventBus `on/off/emit/once`. Event chính:
  `engine-ready`, `hierarchy-changed`, `selection-changed`,
  `transform-changed`, `object-added`, `object-removed`, `scene-loaded`,
  `scene-changed`, `play-state-changed`, `stats-updated`, `ai-preview`.
- `Engine.js` — `init()`: tạo `BABYLON.Engine` + scene + ArcRotateCamera qua
  BabylonRenderer, gọi `buildDefaultScene()`, bật grid, chạy render loop,
  cập nhật stats mỗi 1 giây (fps từ `engine.getFps()`, triangles/vertices từ
  `scene.getActiveMeshes()`).
- `SceneManager.js` — `addObject/removeObject/duplicateObject/findById/
  getChildren/serializeScene/deserializeScene/clearScene/buildDefaultScene/
  getGroundHeight(x,z)`. `addObject` nhận `def` có `meshType` (box/cylinder/
  sphere/cone/ground/plane/torus), `build(scene)` (node composite), hoặc `node`
  đã build sẵn. Composite node giữ nguyên transform từ node (không ghi đè 0,0,0).
  `getGroundHeight` dùng bảng `groundBlocks` từ các object `terrain-block`.
  `deserializeScene` dựng lại node composite (tree/house/temple/bridge/chest/
  waterfall) từ transform đã lưu vì node không serialize được.
- `SelectionManager.js` — đơn + đa chọn, `state.selected` = object.
- `UndoRedoManager.js` — snapshot `serializeScene()` trước/sau cho
  add/remove/transform; `undo()/redo()`.
- `ProjectManager.js` — localStorage + download/upload JSON, autosave 60s khi dirty.
- `Boot.js` — **bổ sung ở bước hợp nhất**: gọi `init()` của mọi module theo thứ
  tự khi DOM sẵn sàng. Trước Boot, không có code nào gọi các `init()` nên panel
  trống dù scene vẫn chạy.

### Rendering (`js/rendering/`)
- `BabylonRenderer.js` — tạo engine/scene/camera/lights, `createGround`,
  `createSkybox` (dùng `clearColor`, không URL ngoài).
- `ThreeRenderer.js` / `ThreeGLBLoader.js` / `RendererSwitch.js` — **v5.0.0,
  nhóm Rendering**: renderer Three.js r128 song song Babylon, load GLB qua
  GLTFLoader + MeshoptDecoder, `RendererSwitch.switchTo('babylon'|'three')`.
  (File do nhóm Rendering cung cấp; `index.html` đã load script tag trước Boot.js.)
- `PixiRenderer.js` — `PIXI.Application` overlay, crosshair, `drawTextOverlay`.
  Degrade gracefully khi PIXI chưa load.
- `CameraController.js` — orbit/free/top/front/left/right, focus, zoom, WASD
  khi free (không Play). Touch orbit/pinch do Babylon hỗ trợ sẵn.
- `LightingManager.js` — sun/ambient/fog/addLight. `MaterialManager.js` —
  create/apply/list material. `ShadowManager.js` — bật/tắt + độ phân giải shadow.

### Editor (`js/editor/`)
- `SceneHierarchy.js` — cây từ `state.objects`, expand/collapse, eye toggle,
  đổi tên inline, drag-drop đổi parent + undo, search, context menu, Ctrl+click.
- `Inspector.js` — render theo type object; input ghi thẳng vào `babylonNode`
  + `obj.transform` + emit `transform-changed`.
- `TransformGizmo.js` — `BABYLON.GizmoManager` thật, mode W/E/R, snap, F/Delete/
  Ctrl+D/Z/Y.
- `AssetBrowser.js` — thư mục ảo + search/filter + import GLB + kéo-thả vào viewport.
- `Toolbar.js` — toolbar viewport + panel brush settings, tự tạo DOM nếu
  index.html chưa có.
- `ContextMenu.js` — menu chuột phải + long-press touch 500ms.

### Terrain & Tileset (`js/terrain/`)
- `TerrainEditor.js` — ground mesh `CreateGround({updatable:true})`, heightmap
  `Float32Array (subdivisions+1)²` trong `obj.terrainData`,
  `applyHeightmapToMesh` cập nhật vertex Y + `ComputeNormals`.
- `TerrainBrush.js` — raise/lower/smooth/flatten/noise, falloff, preview vòng
  torus, pointer events (chuột + touch), snapshot heightmap mỗi stroke → undo.
- `HeightmapEditor.js` — export/import (JSON/base64), value-noise + fBm theo seed.
- `TexturePainter.js` — splat map `Uint8Array` layer/vertex → vertex colors
  (`useVertexColors`). Chưa phải splat shader.
- `FoliagePainter.js` — chứa **`PixiEngine.Prefabs`** (21 builder procedural +
  `place/selectPrefab/handleViewportPlace/renderPalette`) và `paintFoliage/
  eraseFoliage`.
- `WaterEditor.js` — mặt nước trong suốt + sóng `registerBeforeRender`, thác.

### Models (`js/models/`)
- `ModelImporter.js` — `SceneLoader.ImportMeshAsync` thật, drag-drop, FBX báo lỗi rõ.
- `GLBLoader.js` — chuẩn hóa bounding box về cao ~2m, 2 GLB mẫu CDN có fallback.
- `ModelViewer.js` — preview bằng chính viewport (không tạo engine thứ 2).
- `ModelInspector.js` — metadata thật + Export GLB (`GLTF2Export`, serializers CDN).
- `SkeletonViewer.js` — cây bone thật, `BABYLON.Debug.SkeletonViewer` hoặc
  sphere fallback.

### Animation (`js/animation/`)
- `AnimationEditor.js` — clip từ `scene.animationGroups`, procedural bob fallback.
- `Timeline.js` — playhead kéo được (pointer + touch), scrub → `goToFrame`.
- `AnimationGraph.js` — node/edge lưu vào `obj.userData.animGraph`.
- `StateMachine.js` — `autoMapClips` theo tên clip, crossfade stop/play group.

### Effects (`js/effects/`)
- `ParticleEditor.js` — 6 preset `BABYLON.ParticleSystem`, texture flare tự vẽ
  bằng DynamicTexture radial gradient (không URL ngoài).
- `VFXManager.js` — registry effect, GameObject type `particle`, dispose đúng.

### UI (`js/ui/`)
- `UIEditor.js` — widget lưu `state.uiWidgets`, vẽ DOM div `.ui-widget`, kéo-thả.
- `WidgetManager.js` — vẽ bằng PIXI khi sẵn sàng, fallback DOM.
- `CodeEditor.js` — **bổ sung ở bước hợp nhất** (tab Code Editor trước đó trống):
  textarea + ví dụ mẫu + Run qua `new Function('PixiEngine','BABYLON','PIXI',
  'log', code)` + try/catch + lưu localStorage.

### AI (`js/ai/`)
- `AIAssistant.js` — rule-based local: parse từ khóa VI/EN → plan
  `{summary, actions:[{label, run}]}`. Chỉ `executePlan()` khi user bấm Xác nhận.
  Lệnh xóa cần xác nhận 2 lần.
- `PromptManager.js` — 8 lệnh mẫu, history localStorage (tối đa 20).

### Runtime (`js/runtime/`)
- `InputManager.js` — WASD + Space + Shift; joystick ảo `#touch-joystick` +
  nút `#touch-jump` 72px trong `#touch-controls`, chỉ hiện khi Play.
- `PhysicsManager.js` — trọng lực -9.8, mặt đất qua `getGroundHeight`, bounds ±60.
- `CollisionManager.js` — collider box/sphere, AABB overlap, `resolvePlayer`.
- `GameRuntime.js` — play/pause/stop, spawn player procedural, camera follow
  (`ArcRotateCamera.target`), loop `registerBeforeRender` dt cố định 1/60,
  cập nhật StateMachine Walk/Idle.

### Wuxia MMORPG (`js/wuxia/`) — v5.0.0, nhóm Wuxia
- `WuxiaWorld.js` / `WuxiaCamera.js` — thế giới Trường Bạch (map 56×56, đền, nhà,
  cổng, portal) + camera theo nhân vật. `WuxiaCharacters.js` — 3 hero GLB
  (RobotExpressive / Fox / CesiumMan) + NPC. `WuxiaParty.js` — party 3 người.
  `WuxiaCombat.js` / `WuxiaSkills.js` — combat + skill. `WuxiaEnemies.js` —
  quái theo bãi spawn + boss Long Ngâm Lão Tổ (1200 HP). `WuxiaQuests.js` — quest (ids trong
  `projects/default-project/wuxia-scene.json`). `WuxiaHUD.js` — HUD HP/MP,
  boss bar, minimap, joystick + skill bar (style `css/wuxia.css`).
  `WuxiaDungeon.js` / `WuxiaInventory.js` / `WuxiaAudio.js` — dungeon, túi đồ,
  âm thanh (AudioContext resume sau gesture chạm). `WuxiaGame.js` — entry
  `PE.WuxiaGame`, `init(containerElementHoặcSelector, opts)` + `start()`/`stop()`
  (đã xác minh từ code thật; Game tự tạo renderer canvas, map hardcode 56×56,
  chưa đọc file `wuxia-scene.json` — file JSON chỉ là mô tả tham khảo).
- Thứ tự load: World/Camera trước, Game cuối, tất cả trước `Boot.js`.
  `wuxia.html` load cùng 13 file này + CDN three r128, không load Babylon/PixiJS.

## 5. Luồng dữ liệu

```
User click viewport → scene.pick → SelectionManager.select(obj)
  → emit 'selection-changed' → Inspector.render + Gizmo.attach + Hierarchy highlight
User sửa số trong Inspector → babylonNode.position... + obj.transform
  → emit 'transform-changed' → (UndoRedoManager snapshot khi commit)
User đặt prefab → Prefabs.place → SceneManager.addObject → emit 'hierarchy-changed'
  → Hierarchy re-render + ProjectManager.markDirty → autosave
Play → GameRuntime.play → state.mode='play' → InputManager joystick hiện
  → registerBeforeRender: move + Physics.step + Collision.resolve
Save → SceneManager.serializeScene → JSON → localStorage / download
Load → deserializeScene → dựng lại node (meshType hoặc builder composite)
```

## 6. Thứ tự load script (index.html)

CDN: pixi → **three r128 (three.min.js → GLTFLoader.js → meshopt_decoder.js)**
→ babylon → loaders → gui → serializers.
Sau đó: core (EventManager → Engine → SceneManager → Selection → UndoRedo →
ProjectManager) → rendering (PixiRenderer → BabylonRenderer →
**ThreeRenderer → ThreeGLBLoader → RendererSwitch**) → editor → terrain →
models → animation → effects → ui (UIEditor → WidgetManager → CodeEditor) → ai
→ runtime → **wuxia (WuxiaWorld → WuxiaCamera → … → WuxiaGame cuối)** →
**`Boot.js` cuối cùng**.
Inline `DOMContentLoaded` gọi `Engine.init()`; Boot tự boot khi DOM sẵn sàng.
`wuxia.html`: CDN three r128 → 13 file `js/wuxia/*` (cùng thứ tự) → inline
start-on-tap; không có Babylon/PixiJS/Boot.

## 7. Giới hạn đã biết

- Vật lý đơn giản, không engine vật lý đầy đủ; không NavMesh.
- Texture terrain = vertex color, chưa phải splat shader.
- Không import FBX (Babylon không có loader; Three.js r128 trong dự án cũng
  chỉ nạp GLTFLoader + MeshoptDecoder, không có FBXLoader).
- GLB Wuxia chỉ load khi có mạng CDN (three r128 + model GLB); mất mạng thì
  dùng fallback procedural (nếu nhóm Wuxia đã làm) hoặc không có nhân vật thật.
- `wuxia-scene.json` chỉ là mô tả tham khảo — `WuxiaGame` hiện hardcode map
  56×56 và chưa có hàm load file JSON này.
- v5.0.0 **chưa test** trên trình duyệt/điện thoại thật.
