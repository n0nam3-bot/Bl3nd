# Bl3nd — Living Engineering Handoff

## AI Agent Execution Rules

**Read this entire document before changing project code.** It is the single source of truth for the Bl3nd project.

1. Preserve the zero-build, mobile GitHub workflow. The app must run as static HTML, CSS, and native browser ES modules. Do not introduce npm install, a build command, Node.js, Vite, Webpack, or terminal-only setup.
2. Preserve completed behavior and architectural invariants. Distinguish Working, Partial, and Not Started; never describe a partial feature as complete.
3. Every code update package must be delta-only, with exact repository-relative paths, and must always include the updated root `HANDOFF.md`.
4. The owner uploads update ZIPs into `uploads/`. The unpack workflow extracts application files, preserves `.github/workflows/`, removes processed ZIPs, and commits changes.
5. Workflow definitions are intentionally protected from ZIP extraction because GitHub's automatic token cannot create or modify workflow files. Change `.github/workflows/*.yml` manually in the GitHub web editor.
6. GitHub Pages is deployed without a frontend build. An upload triggers the unpack workflow; when it completes successfully, the Pages workflow starts through `workflow_run`. Ordinary main-branch code commits also trigger Pages directly. The upload push itself is ignored by Pages to avoid deploying before extraction.
7. Do not add secrets, paid APIs, server dependencies, or cloud accounts to the client app. Three.js and its examples modules are loaded from a pinned CDN import map.

## Architecture & Invariants

- **Static runtime:** `index.html` is the root entry. Native ES modules run directly in the browser with a pinned Three.js 0.180.0 import map.
- **Command bus:** UI, keyboard, and touch inputs should dispatch named commands through `src/core/CommandBus.js`; keep mesh algorithms out of DOM handlers.
- **Half-edge data:** `src/core/HalfEdgeMesh.js` owns editable Vertex, Edge, HalfEdge, and Face connectivity. Import merges adjacent coplanar triangles only when they form one convex boundary; Three.js geometry remains a render cache, not the editable source of truth. Complex and non-manifold inputs are not fully repaired.
- **Undo:** `src/core/UndoManager.js` writes snapshots to OPFS when available and falls back to memory. Current serialization still creates JavaScript objects before disk writes.
- **Renderer:** Three.js WebGL is currently used on all tiers. Device probing detects WebGPU but does not yet activate a WebGPU renderer.
- **Workers:** modifier evaluation runs in a module Worker. There is no worker pool or chunk scheduler yet.
- **PWA:** `manifest.json` and `sw.js` provide install metadata and app-shell/runtime caching. First visit requires network access to CDN modules.
- **Local-only:** scenes are stored in the browser; import/export uses local file pickers. No cloud sync or remote project database exists.
- **Transform frame:** modal transforms capture the camera basis, viewport bounds, pointer origin and camera-to-pivot scale at start. Free movement uses the current camera-facing view plane; axis movement projects screen motion into world-axis distance; free rotation uses a camera-oriented virtual trackball.
- **Edit overlays:** `src/ui/EditModeOverlay.js` draws live polygon edges, vertices and selected-face fills as children of the active mesh; overlays do not replace editable topology or intercept picking.
- **Region selection:** `src/input/SelectionGestureController.js` captures box/circle/lasso drags before OrbitControls; `src/operators/SelectionOperators.js` selects projected vertices, edges and ear-clipped face triangles only when ray checks identify the visible mesh surface.
- **Polygon triangulation:** `HalfEdgeMesh.triangulateFace()` ear-clips simple concave polygons. `toBufferGeometry`, face picking and selected-face overlay all consume the same triangle list; invalid/self-intersecting polygons are not silently fanned.
- **Edge traversal:** loop selection crosses opposite edges through connected quads. Ring selection follows opposite edges through closed all-quad vertex fans; at extraordinary poles it accepts only a unique near-antiparallel incident edge (at least 155° apart and clearly better than the next candidate). It stops at boundaries, mixed-face fans, non-manifold fans and ambiguous poles. Loop Cut remains limited to regular quad strips.
- **Deployment:** `.github/workflows/pages.yml` uses two jobs: `build` creates and uploads the `github-pages` artifact; `deploy` waits for `build` and publishes it. The Pages workflow runs on normal `main` changes (excluding `uploads/**`) and after successful completion of `Unpack uploaded update packages`.

## Repository File Tree

```text
.
├── .github/workflows/
│   ├── unpack-update.yml       # Validates/extracts uploaded ZIPs; protects workflow files
│   └── pages.yml               # Static artifact build job and dependent Pages deploy job
├── assets/
│   ├── icon.svg                # Bl3nd vector app icon
│   ├── icon-192.png            # PWA icon
│   └── icon-512.png            # PWA icon
├── uploads/.gitkeep            # Mobile update inbox
├── src/
│   ├── core/
│   │   ├── CommandBus.js       # Named command registry and undo boundary
│   │   ├── DeviceCapabilities.js # Device/WebGPU/WebGL2/OPFS probing
│   │   ├── HalfEdgeMesh.js     # Editable half-edge topology
│   │   ├── SceneDocument.js    # Scene, objects, serialization and restore
│   │   └── UndoManager.js      # OPFS-backed snapshots and memory fallback
│   ├── input/
│   │   ├── KeyboardController.js # Blender-inspired keyboard mappings
│   │   ├── TouchController.js # Touch and long-press input
│   │   └── SelectionGestureController.js # Box/circle/lasso pointer gesture capture
│   ├── io/ModelIO.js           # GLB/GLTF/OBJ/STL import/export
│   ├── modifiers/ModifierStack.js # Non-destructive modifier bridge
│   ├── operators/
│   │   ├── MeshOperators.js    # Basic extrude/inset/delete/subdivide
│   │   ├── SelectionOperators.js # Visibility-checked screen-space region selection
│   │   ├── ModalTransform.js   # Camera-aware G/R/S state machine
│   │   └── LoopCutModal.js     # Transactional interactive loop-cut preview and slide
│   ├── ui/
│   │   ├── Viewport.js         # Three.js viewport, navigation, pointer origin and overlay lifecycle
│   │   └── EditModeOverlay.js  # Non-destructive vertex/edge/face selection display
│   ├── workers/modifier.worker.js # Background modifier evaluation
│   ├── main.js                 # App composition, commands and UI bindings
│   └── styles.css              # Responsive desktop/mobile styling
├── .gitignore
├── tests/
│   ├── HalfEdgeMesh.test.js    # Node topology/triangulation regression tests
│   └── LoopCutModal.test.js    # Loop-cut preview/confirm/cancel regression tests
├── HANDOFF.md                  # This document
├── README.md                   # Deployment and quick controls
├── index.html                  # Static app entry and Bl3nd identity
├── manifest.json               # PWA metadata
└── sw.js                       # Versioned service-worker caches
```

## Current State

Status meanings: **Working** = implemented end-to-end in the current foundation; **Partial** = useful subset with documented gaps; **Not Started** = not implemented.

| Subsystem | Status | Current state |
|---|---|---|
| Zero-build static app | Working | Native ES modules, static HTML/CSS, pinned Three.js CDN imports. |
| Mobile ZIP workflow | Working | ZIP path validation, extraction, cleanup, bot commit; workflow files are excluded. |
| GitHub Pages deployment | Working after workflow correction | Two-job artifact/deploy pipeline; triggers after successful unpack completion and normal main pushes excluding uploads. Latest deployed baseline for v0.1.12: `main` commit `33ea052` (Pages run #19 succeeded). |
| Bl3nd branding/PWA | Working | Bl3nd header/title, manifest identity, app icons, service worker cache-version migration. |
| Startup progress/error UI | Partial | Staged progress and visible exceptions. Starter cube now initializes directly through `SceneDocument`, outside command dispatch and undo snapshot I/O; viewport framing and initial panel refresh are isolated as non-fatal steps. Real-browser verification remains. |
| Device capabilities | Partial | Detects tier, memory, CPU threads, WebGPU, WebGL2 and OPFS. Tier affects render pixel ratio/history budget; WebGPU is not activated. |
| 3D viewport | Partial | Three.js WebGL renderer, grid, axes, orbit/pan/zoom, standard views and framing. |
| Command bus | Working | Named command registration and snapshot-based undo boundaries. |
| Half-edge topology | Partial | Vertex/Edge/HalfEdge/Face records and adjacency. Import reconstructs safe coplanar regions; polygon rendering uses ear clipping for simple concave faces. Diagnostics cover invalid positions/faces, duplicates, non-manifold edges, inconsistent winding, isolated vertices, non-planar/self-intersecting faces and triangulation failures. A conservative repair action handles only malformed/duplicate faces, orientable manifold winding and orphan vertices; this is not a production manifold kernel. |
| Object mode | Working | Primitive creation, object selection/deletion and object transforms. |
| Edit mode | Partial | Visible edge/vertex overlays and selected-face tint; click/Shift-click, Select All / Deselect / Invert, box/circle/lasso region selection with ray-checked visibility, selection-aware vertex/edge/face deletion and constrained planar dissolve, plus face extrude/inset/subdivision. Loop/ring selection now has topology-based quad/fan traversal; ring traversal can pass a geometrically unambiguous extraordinary all-quad pole but stops at boundaries, mixed-face fans and ambiguous poles. Safe topology repair handles malformed/duplicate faces, orientable winding and orphan vertices. Loop Cut previews validated convex planar quad strips and supports modal horizontal sliding, precision movement, numeric offsets, keyboard nudges, 1–8 evenly spaced cuts, confirmation and cancellation. Loop Cut itself still does not traverse extraordinary poles. |
| Modal transforms | Partial | Free G follows the current camera-facing view plane; axis movement converts projected pointer travel into global world units; Shift+axis uses a camera-derived perpendicular plane; free R uses a camera-oriented virtual trackball; numeric commit/cancel remain. Local orientation, snapping and full Blender pivot parity remain incomplete. |
| 3D cursor/pivot | Partial | Cursor placement and UI pivot selection exist; pivot math is incomplete. |
| Modifiers | Partial | Worker-based midpoint subdivision, mirror, array and solidify; not Blender-equivalent. |
| Undo/redo | Partial | OPFS snapshots with memory fallback; current snapshots also preserve per-object vertex/edge/face selections. Large snapshots can temporarily increase RAM. |
| Model I/O | Partial | GLB, GLTF, OBJ and STL browser import/export paths; complex scenes/materials/animation need validation. |
| Desktop/mobile input | Partial | Desktop left-drag orbit, right-drag/Shift+left-drag pan and wheel zoom; B/C/L or the viewport menu activate box/circle/lasso drags, with Esc returning to click selection; Shift adds. Alt+L expands selected quad-edge loops; Ctrl+Alt+L expands regular vertex-fan rings. Mobile supports the same drag tools from the Select menu, two-finger dolly-pan and existing quick actions. Device testing remains. |
| Pie menus | Partial | Compact command menus; not true radial Blender pie menus. |
| Bevel/sculpt | Not Started | Bevel and sculpting are not implemented. Loop Cut is limited to validated planar convex quad strips and 1–8 evenly spaced cuts. |
| Exact Blender clone | Not Started | No claim of full Blender operator, BMesh, UI, or file-format parity. |

## Known Issues & Technical Debt

1. WebGPU is detected but the renderer is still Three.js WebGL.
2. Imported geometry is initially triangulated, then adjacent coplanar triangles are merged only when exactly two triangles share each joined edge and a single convex boundary can be reconstructed. Concave faces, holes, duplicated seam vertices, inconsistent winding and non-manifold regions may remain triangulated or lose source polygon semantics.
3. Edit Mode box/circle/lasso selection projects sub-elements into screen space and ray-checks candidates against the visible surface. It samples vertices, edge points and ear-clipped triangle centers. Edge loops cross opposite edges in quads; edge rings traverse opposite edges in closed all-quad vertex fans, including extraordinary poles only when a unique near-antiparallel pairing is found. These deterministic passes stop at boundaries and ambiguous poles and are not identical to all Blender select modes.
4. Delete is selection-mode aware: deleting a vertex or edge removes incident faces and dependent unused vertices; face deletion removes selected faces. Dissolve supports consistently wound, single-boundary, simple planar patches, including concave boundaries. Non-planar, self-intersecting, boundary-only and non-manifold cases are deliberately skipped without mutation. Bevel remains a placeholder; Loop Cut is implemented for validated planar convex quad strips with up to eight evenly spaced cuts, but does not traverse extraordinary poles or multiple distinct seed loops. Extrude/inset and midpoint subdivision retain topology/normal limitations.
5. The topology validator is diagnostic only. It reports invalid positions/faces, duplicates, non-manifold edges, same-direction shared-edge winding, isolated vertices, non-planar faces, self-intersections and triangulation failures; boundary edges are reported but valid for open surfaces. It does not repair geometry. Ear clipping supports simple concave polygons, but non-planar polygons remain intrinsically ambiguous and are flagged.
6. Modifier algorithms are first-pass approximations: midpoint triangle subdivision, non-welded mirror, simple array offset and basic solidify.
7. Transform orientation is currently global-axis oriented. Full local/global orientation toggle, snapping, proportional editing, multi-object pivot aggregation and exact Blender operator feedback remain incomplete. Axis-constrained scaling of rotated objects is approximate because the scene representation stores TRS rather than an arbitrary affine/shear matrix.
8. Camera-relative G/R/S math captures the camera when an operation begins; changing the view during a modal transform is intentionally disabled until confirm/cancel. Free rotation is a practical virtual trackball, not exact Blender trackball/turntable parity.
9. First visit requires network access to jsDelivr. Strict content blockers, CDN outages, or offline first visit may prevent startup.
10. iOS Safari/Android Chrome OPFS, memory ceilings, WebGL context loss, background suspension and multi-touch behavior require device testing.
11. Undo snapshots are serialized in memory before OPFS write; no chunked serialization or inactive-scene disk paging exists.
12. Modifier evaluation uses one worker and a full mesh payload; no worker pool, chunk scheduling, cancellation or progress protocol exists.
13. Large model import/export may temporarily duplicate large geometry buffers; advanced GLTF materials, skinning and animation are not fully validated.
14. The application uses a system UI font stack and contains no bundled Inter font files or `@font-face` declarations. Requests to `/assets/fonts/Inter-*.woff2` do not originate in the current repository source; if they persist after a clean reload, check injected browser-extension styles or stale browser caches.
15. GitHub Actions workflow files must be edited manually because the unpacker deliberately excludes `.github/workflows/**`.
16. The Pages upload artifact must be created in the `build` job and deployed in the dependent `deploy` job. Do not reintroduce a `gh workflow run pages.yml` step in the unpack workflow; the `workflow_run` event handles deployment after unpack succeeds.
17. The current Node.js 20 deprecation annotation from older action major versions is a warning, not the cause of the prior artifact lookup failure.
18. The initial starter object is document bootstrap state, not a user operation. Do not route its creation through the CommandBus or undo snapshots; later user-created objects must continue to use the CommandBus.
## Roadmap

### Phase 1 — Behavioral Core
- [x] Zero-build static app and mobile ZIP delivery.
- [x] Command bus, document serialization and half-edge connectivity foundation.
- [x] Basic object/edit modes, primitives, selection modes, extrude, inset, delete and subdivide.
- [x] Basic G/R/S modal transforms with numeric entry and cancel/confirm.
- [x] Camera-facing free-move plane and projected global-axis movement foundation.
- [x] Camera-oriented virtual trackball rotation foundation and smoother exponential mouse scaling.
- [x] OPFS undo/redo with memory fallback.
- [x] Preserve editable polygon boundaries, triangulate simple concave faces, and diagnose common non-manifold/inconsistent-winding conditions; automatic repair policies remain open.
- [x] Add visible vertex/edge/face overlays, hit-face screen-space element picking, Shift-click selection toggle, Select All / Deselect / Invert and snapshot persistence.
- [x] Add box/circle/lasso selection with screen-space sampling and visibility checks; add topology-based edge loop/ring expansion with boundary/pole stops.
- [x] Add selection-aware vertex/edge/face deletion and safe simple-planar dissolve, plus diagnostic topology validation.
- [x] Add ear-clipping triangulation and simple concave planar dissolve; synchronize render, face-picking and overlay triangle mappings.
- [x] Add edge-loop selection across opposite quad edges and edge-ring selection through closed all-quad fans, with guarded geometric pairing at extraordinary poles.
- [x] Add conservative topology repair for malformed/duplicate faces, orientable manifold winding and orphan vertices; non-manifold and ambiguous components are explicitly skipped.
- [x] Add first transactional loop-cut topology for validated convex planar quad strips.
- [x] Add a conservative extraordinary-pole continuation for Edge Ring selection when a closed all-quad fan has a unique near-antiparallel edge pairing.
- [ ] Extend Loop Cut itself across supported extraordinary poles; this remains intentionally unsupported until a reliable split template is implemented.
- [ ] Complete local/global transform orientation, snapping, proportional editing, exact pivot aggregation and Blender-like transform gizmo/feedback.
- [ ] Implement bevel, interactive loop-cut placement/sliding and multi-cut support.
- [ ] Implement true radial pie menus and complete keymap parity.

### Phase 2 — Modifiers, Sculpt, Render
- [x] First-pass worker-based Subdivision, Mirror, Array and Solidify.
- [ ] Catmull-Clark subdivision, seam-welded mirror, robust solidify and editable stack controls.
- [ ] Actual WebGPU renderer with WebGL2 fallback.
- [ ] Multi-worker/chunked evaluation and mobile memory policy.
- [ ] Sculpt brushes, symmetry, remeshing and scalable sculpt undo.
- [ ] Camera, lighting, materials, render settings and render/export pipeline.
- [ ] Chunked OPFS snapshots and inactive-object disk offload.
- [ ] iOS Safari, Android Chrome and desktop regression matrix.

### Phase 3 — Custom Reskin
- [x] Initial Bl3nd name, header identity, manifest identity and app icons.
- [ ] Refine complete visual system, workspace layouts, themes, icons and contextual help.
- [ ] Onboarding, install prompt, offline status, recovery messaging and mobile ergonomics.
- [ ] Accessibility and performance audits.

## Changelog

### 2026-11-26 — `initial-release.zip` — v0.1.0
- Created the static no-build PWA foundation, viewport, command bus, half-edge data model, first-pass operators, undo system, worker modifiers, model I/O and initial GitHub Actions deployment workflows.

### 2026-11-26 — `bl3nd-startup-rebrand-fix.zip` — v0.1.1
- Rebranded the UI, PWA metadata and icons to Bl3nd.
- Added versioned service-worker cache migration and startup progress/error presentation.

### 2026-11-26 — `bl3nd-pages-workflow-fix.zip` — v0.1.2
- Replaced workflow-dispatch deployment handoff with a `workflow_run` trigger after successful ZIP extraction.
- Split Pages artifact creation and deployment into dependent `build` and `deploy` jobs.
- Kept workflow definitions protected from ZIP extraction and removed the manual `gh workflow run` call.
- Added a validation check ensuring `index.html` exists in the Pages artifact.

### 2026-11-26 — `bl3nd-starter-cube-startup-fix.zip` — v0.1.3
- Changed first-run cube initialization to call `SceneDocument.addPrimitive` directly. The startup scene no longer depends on CommandBus availability or undo snapshot persistence.
- Added explicit editable-mesh validation and reports the underlying creation exception if the scene document cannot produce the starter cube.
- Isolated viewport framing and initial panel refresh as non-fatal startup steps, allowing a valid cube and workspace to remain available if a secondary presentation update fails.
- Kept all user-triggered object creation routed through the CommandBus with normal undo recording.

### 2026-11-26 — `bl3nd-console-camera-fix.zip` — v0.1.4
- Fixed `refresh()` calling the nonexistent `refreshModal()` function; it now safely calls `ui?.refreshModal()`, preventing the same ReferenceError from breaking selection, object creation, transforms, and pivot updates.
- Replaced the Inter font-family preference with a native system UI font stack. No Inter font files or font-face declarations exist in the repository; this removes the app’s dependency on an unavailable custom font.
- Enabled desktop left-button drag orbit while retaining stationary click-to-select, middle-button orbit, right-button pan, Shift+left drag pan, Shift+middle pan, and wheel zoom.
- Kept mobile one-finger orbit and two-finger dolly/pan; touch long-press cursor placement now cancels when a second finger joins the gesture.
- Added visible desktop/mobile navigation hints and advanced the service-worker shell/runtime cache to v3 so deployed clients replace the earlier cached scripts.


### 2026-11-26 — `bl3nd-view-relative-transform-fix.zip` — v0.1.5
- Rebuilt G/R/S pointer math around the camera frame captured when the modal operation begins.
- Free movement now follows the current camera-facing view plane instead of fixed world X/Z directions.
- Axis-constrained movement maps pointer displacement along the projected global axis back to world units; Shift+axis uses a camera-derived basis in the perpendicular plane.
- Free rotation now uses a camera-oriented virtual trackball; axis rotation uses projected tangent motion; numeric rotation remains degrees.
- Mouse scaling now uses an exponential response instead of the previous small linear `1 + delta` factor.
- Modal input starts from the current pointer within the viewport when available; pointer movement is observed at window level while transforms are active.
- Added mobile quick actions for Move, Rotate and Scale plus on-screen global-axis/perpendicular-plane constraints; updated desktop/mobile hints and bumped service-worker caches to v4.

### 2026-11-26 — `bl3nd-edit-selection-foundation.zip` — v0.1.6
- Added a non-destructive Edit Mode overlay for polygon edges, vertex points, selected vertices and selected-face fill. Overlay geometry follows the active object and is excluded from viewport raycasting.
- Replaced world-space nearest-element selection with screen-space nearest vertex and point-to-segment edge picking on the face hit by the cursor. Desktop Shift-click adds or toggles selections.
- Added Select All, Deselect All and Invert Selection commands, desktop shortcuts, and toolbar actions usable on mobile.
- Made selection-mode changes propagate selected faces to their constituent vertices/edges and propagate a fully selected vertex/edge set back to faces.
- Preserved vertex, edge and face selections in scene snapshots so undo/redo restore the edit selection state.
- Reconstructed simple convex coplanar polygon faces from imported triangle pairs/clusters, removing artificial triangulation diagonals on primitives and planar hard-surface faces when their boundary can be safely recovered.
- Added the overlay module to the service-worker shell and advanced cache migration to v6.


### 2026-11-26 — `bl3nd-selection-ops-region-tools.zip` — v0.1.7
- Added selection-mode-aware Delete: vertex and edge deletion removes incident faces and compacts unused vertices; face deletion removes selected faces.
- Added constrained Dissolve for selected face regions, shared edges and interior vertices. It merges only consistently wound, single-boundary, convex planar regions and skips unsupported regions without changing the mesh.
- Added a diagnostic topology validator for invalid/degenerate and duplicate faces, non-manifold edges, inconsistent shared-edge winding and isolated vertices. Boundary edges are reported but are not treated as errors; validation never auto-repairs.
- Added Box, Circle and Lasso selection through B/C/L shortcuts and the viewport Select menu. Drag gestures are isolated from OrbitControls; Shift-drag adds to the selection, and Esc returns to click selection.
- Added screen-space vertex/edge/face region sampling with ray checks against the visible mesh surface, desktop/mobile gestures, Edit Mesh validation and dissolve controls.
- Added the two new modules to the service-worker app shell and advanced the cache migration to v7.


### 2026-11-26 — `bl3nd-concave-topology-loop-ring.zip` — v0.1.8
- Added ear-clipping triangulation for simple concave polygons. Rendering, face picking, region selection and edit overlays now use the same per-face triangle mapping; invalid/self-intersecting polygons are not rendered using an unsafe fan fallback.
- Expanded dissolve to support simple concave planar regions while preserving checks for single boundaries, consistent winding, full-patch planarity and valid triangulation.
- Expanded topology diagnostics to report invalid positions/faces, duplicates, non-manifold edges, inconsistent winding, isolated vertices, non-planar/self-intersecting faces and triangulation failures. Validation remains read-only.
- Added quad-opposite edge-loop expansion (`Alt+L`) and regular valence-four vertex-fan edge-ring expansion (`Ctrl+Alt+L`), with safe stops at boundaries and unsupported poles.
- Advanced the service-worker cache migration to v8 and documented topology/traversal limitations.

## Next Roadmap Step

Add explicit repair policies for non-manifold and inconsistent-winding meshes, then implement loop-cut topology, robust extraordinary-pole traversal and desktop/mobile regression testing. Keep updates zero-build and delta-ZIP only.


### 2026-11-26 — `bl3nd-safe-topology-repair.zip` — v0.1.9
- Added an explicit **Repair Safe Issues** action in Edit Mesh. It removes malformed faces and duplicate faces, repairs winding only across orientable manifold-connected components, and removes orphaned vertices by compacting the mesh.
- Repair skips components touching non-manifold edges or containing contradictory orientation constraints. It does not attempt speculative fixes for non-planar or self-intersecting polygons. Validation is run again after repair and the remaining report is shown in the console/toast.
- Added regression tests for duplicate cleanup, winding correction, orphan compaction and non-manifold preservation.
- Advanced the service-worker shell/runtime cache to v9.

## Next Roadmap Step

Extend Loop Cut with interactive placement, sliding and multiple cuts; then improve traversal around extraordinary poles. Keep non-manifold and ambiguous cases non-destructive.


### 2026-11-26 — `bl3nd-quad-loop-cut.zip` — v0.1.10
- Replaced the `Ctrl+R` placeholder with a transactional Loop Cut for a single selected seed edge in Edge Select mode.
- Traverses the connected quad-opposite edge loop, interpolates one shared vertex per loop edge, splits every crossed quad into two quads and selects the newly created cut edges.
- Eligibility checks reject non-quad boundaries, non-manifold edges, inconsistent winding, non-planar faces, self-intersections and concave quads before mutating mesh data.
- Added an Edit Mesh button, regression tests for topology/interpolation/rejection, and advanced the service-worker cache migration to v10.

## Next Roadmap Step

Add multiple loop cuts and improve traversal around extraordinary poles, then implement a conservative bevel operator with explicit rejection of unsupported vertex/edge neighborhoods.


### 2026-11-26 — `bl3nd-interactive-loop-cut.zip` — v0.1.11
- Replaced the one-shot centered Loop Cut command with a modal preview session. Every preview is regenerated from the immutable source topology so repeated pointer movement does not accumulate interpolation error.
- Drag horizontally to slide the cut; hold Shift for finer movement; use arrow keys for 1% nudges (Shift+arrow for 0.1%); type an offset between 0 and 1; Enter commits one undo transaction; Escape or right-click restores the original mesh.
- Added mobile numeric-pad input and a modal offset readout. Unsupported loop topology is checked before the preview can replace the source mesh.
- Added tests for live preview, precision drag, numeric positioning, cancel restoration, confirm/undo recording and invalid selection. The regression suite now runs with `node --experimental-default-type=module --test tests/*.test.js`.
- Advanced service-worker cache migration to v11 and precached the new modal operator module.

## Next Roadmap Step

Add multiple evenly spaced loop cuts with stable interpolation across closed loops, then investigate supported pole traversal. After that, begin a conservative bevel implementation with topology fixtures for boundaries, corners and non-manifold rejection.


### 2026-11-26 — `bl3nd-multiple-loop-cuts.zip` — v0.1.12
- Extended the quad-strip Loop Cut core operator to accept 1–8 evenly spaced cuts. Each original crossed quad is split into `cuts + 1` consistently wound quads, with interpolated vertices shared across the complete edge loop.
- Cut fractions are propagated as ordered parameter sets across closed loops; reversed canonical edge orientation reverses the fractions safely. Unsupported/non-manifold/non-quad/concave/non-planar paths and unstable near-duplicate offsets are rejected before topology mutation.
- The modal preview supports wheel and `+`/`-` count adjustment; mobile numeric pad includes cut-count increment/decrement controls. Drag/numeric slide positions the cut group, and the full multi-cut preview remains a single undo transaction.
- Added regression coverage for multiple cuts on open quad strips and closed cube loops, topology/winding preservation, count clamping and modal commit/cancel.
- Advanced the service-worker shell/runtime cache migration to v12.

## Next Roadmap Step

Add carefully constrained traversal across supported extraordinary poles, then design a conservative bevel implementation with explicit rejection tests for boundaries, corners and non-manifold neighborhoods. Desktop/mobile browser regression remains required.


### 2026-11-26 — `bl3nd-extraordinary-pole-ring.zip` — v0.1.13
- Extended `Ctrl+Alt+L` Edge Ring selection from regular valence-four fans to supported extraordinary all-quad fans. A non-regular vertex is traversed only when the seed edge has exactly one mutually preferred incident edge at least 155 degrees away, with a clear score margin over the next candidate.
- Boundaries, open fans, mixed triangle/quad fans, non-manifold/inconsistently wound fans, weak opposition and tied candidate directions stop safely. Traversal statistics report regular vertices, supported poles, ambiguous poles and stopped fans.
- Loop Cut remains regular quad-strip only; no topology split is attempted through a pole.
- Added regression fixtures for a valence-six pole, a valence-five fan without an opposite, tied opposite candidates and a mixed-face fan.
- Advanced the service-worker shell/runtime cache migration to v13.

## Next Roadmap Step

Begin the conservative Bevel operator with a small, explicit first-pass support envelope (planar convex boundary-free edge neighborhoods only), preflight validation, rollback-on-failure behavior and regression fixtures for corners, boundaries and non-manifold rejection. Loop Cut pole splitting remains a separate research item.
