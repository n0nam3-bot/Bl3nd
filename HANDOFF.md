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
- **Command search:** `src/ui/CommandSearch.js` is a UI-only, curated search surface. It filters commands by Object/Edit Mode and dispatches existing CommandBus names; it does not own operator logic. Slash is accepted only outside editable controls, browser-modified shortcuts, radial menus and active modal operations.
- **Object Mode selection/transforms:** `SceneDocument.selectedObjects` is the authoritative Object Mode selection set; `activeObject` must belong to a non-empty set. Desktop Shift-click and the touch-only bottom-bar Multi toggle share the same additive/toggle selection path. The selected object indices and active index are serialized/restored with scene snapshots. Object Mode G/R/S captures all selected transforms at modal start and applies/cancels/undoes them as one transaction. Median uses the arithmetic mean of object origins, Bounds uses the union of world-space object bounds, Cursor is fixed, and Individual Origins uses one pivot per selected object. Edit Mode intentionally collapses to the active mesh. Local orientation uses the active object as the reference frame; the existing TRS representation still cannot express arbitrary shear from non-uniform world-axis scaling of differently rotated objects.
- **Half-edge data:** `src/core/HalfEdgeMesh.js` owns editable Vertex, Edge, HalfEdge, and Face connectivity. Import merges adjacent coplanar triangles only when they form one convex boundary; Three.js geometry remains a render cache, not the editable source of truth. Complex and non-manifold inputs are not fully repaired. `src/core/FaceRegionBoundary.js` provides read-only selected-region analysis: connected components, ordered boundary loops, nested hole classification on planar regions, region-facing convex/reflex corners, winding and planarity. Operators use this analysis to build private candidates; the analyzer itself never mutates topology.
- **Undo:** `src/core/UndoManager.js` writes snapshots to OPFS when available and falls back to memory. Current serialization still creates JavaScript objects before disk writes.
- **Renderer:** Three.js WebGL is currently used on all tiers. Device probing detects WebGPU but does not yet activate a WebGPU renderer.
- **Workers:** modifier evaluation runs in a module Worker. There is no worker pool or chunk scheduler yet.
- **PWA:** `manifest.json` and `sw.js` provide install metadata and app-shell/runtime caching. First visit requires network access to CDN modules.
- **Local-only:** scenes are stored in the browser; import/export uses local file pickers. No cloud sync or remote project database exists.
- **Transform frame:** modal transforms capture the camera basis, viewport bounds, pointer origin, camera-to-pivot scale and the object's starting world quaternion at start. Free movement uses the current camera-facing view plane; axis-constrained Move/Rotate/Scale can use Global world axes or Local axes resolved from that immutable starting quaternion; free rotation uses a camera-oriented virtual trackball. Edit Mode proportional influence uses world-space Dijkstra distances on a smooth-fan graph derived from existing half-edge connectivity and face normals. Face selections retain selected-face context; edges at or above the 55° dihedral guard split surface fans, and non-manifold/inconsistent-winding/unstable-normal neighborhoods are conservative barriers. Explicit vertex/edge selections seed all incident fans of the selected shared vertices. Weights rebuild from immutable modal source positions and blend Move/Rotate/Scale by per-vertex weight. Its settings persist locally outside scene undo history; Object Mode is unaffected.
- **Selection framing:** before multi-face/edge modal operations, `Viewport.frameSelection()` uses the immutable source topology to center the selected area and `src/core/SelectionView.js` chooses the view direction maximizing the weighted projected area of selected/incident face normals. Single-face/single-edge operations keep the current camera. Opposing sides cannot all be visible from one perspective; orbit remains available for inspection.
- **Edit overlays:** `src/ui/EditModeOverlay.js` draws live polygon edges, vertices and selected-face fills as children of the active mesh; overlays do not replace editable topology or intercept picking.
- **Region selection:** `src/input/SelectionGestureController.js` captures box/circle/lasso drags before OrbitControls; `src/core/ScreenRegion.js` computes continuous projected edge/region overlap intervals; `src/operators/SelectionOperators.js` ray-checks candidates against the visible mesh surface before changing selection. `src/core/SelectionAddMode.js` centralizes the Shift-or-touch-toggle policy; `TouchController` exposes a touch-only Add to Selection toggle and routes touch taps/region starts through the existing Shift-aware path without duplicating picking or mesh algorithms.
- **Face operations:** `src/operators/FaceOperationModal.js` rebuilds Extrude/Inset previews from immutable source topology, validates each candidate before display/commit, anchors viewport drags on the actual pointer-down, restores the full snapshot on cancel and records one undo step on confirm. Extrude constructs a private candidate for one face or one connected, consistently wound, coplanar region with a single simple boundary; it derives direction from the region's Newell normal and validates topology/triangulation before replacing the source. Inset offsets one connected coplanar face-region boundary with shared miter corners while preserving inner face topology. `BevelModal` supports transactional Face Bevel in Connected Region mode for one connected planar region with one simple boundary. Convex, collinear and supported reflex/concave corners use a shared inward offset; the private candidate must preserve a simple inner boundary and pass topology, triangulation, miter and transition-wall checks. Each planar Face Bevel perimeter segment is stored as the renderer-equivalent pair of triangles (rather than a quad), so later raised-cap rotations do not leave warped transition quads in editable topology. Face Bevel supports 1–8 transition segments, a monotonic cubic-Bezier cross-section profile (0 concave, 0.5 rounded, 1 convex) and independently adjustable width/height factors (0.01–0.95). Multi-row/multi-column planar grids retain shared interior seams. The v0.1.41 Continuous Surface mode adds a deliberately narrow path for one connected non-planar patch with one simple projected boundary and smoothly varying adjacent normals: area-weighted smooth vertex normals drive shared raised vertices, tangent-plane miters inset the boundary, and triangulated transition bands are checked for orientation, folds and topology. v0.1.42 adds spatially filtered triangle-intersection screening for changed top/transition triangles against the complete candidate surface, while allowing expected shared topological contacts. This is partial collision screening, not a proof of global self-intersection freedom. Sharp creases (adjacent normal turn >55°), ambiguous vertex normals, holes, multiple loops, disconnected regions, excessive offsets and invalid candidates reject without mutation; eligible unsupported curved selections retain Individual Faces as the safe fallback. The mode-switch validator eligibility is retained while temporarily in Individual Faces, so a validated shared mode remains available when settings match. Individual Faces remains separate raised panels with per-face settings, not a continuous curved transition. Existing Edge Bevel remains a separate path.
- **Polygon triangulation:** `HalfEdgeMesh.triangulateFace()` ear-clips simple concave polygons. `toBufferGeometry`, face picking and selected-face overlay all consume the same triangle list; invalid/self-intersecting polygons are not silently fanned.
- **Edge traversal:** loop selection crosses opposite edges through connected quads. Ring selection follows opposite edges through closed all-quad vertex fans; at extraordinary poles it accepts only a unique near-antiparallel incident edge (at least 155° apart and clearly better than the next candidate). Loop Cut uses the same reciprocal pairing when its two quad-opposite edges meet at a closed extraordinary all-quad pole. Both traversals stop at boundaries, mixed-face fans, non-manifold fans and ambiguous poles.
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
│   │   ├── CameraProjection.js # Perspective/orthographic view-scale and frustum math
│   │   ├── CommandBus.js       # Named command registry and undo boundary
│   │   ├── ObjectSelection.js  # Pure Object Mode additive/toggle selection resolution
│   │   ├── DeviceCapabilities.js # Device/WebGPU/WebGL2/OPFS probing
│   │   ├── HalfEdgeMesh.js     # Editable half-edge topology
│   │   ├── FaceRegionBoundary.js # Shared read-only face-region boundary/loop analysis
│   │   ├── SceneDocument.js    # Scene, objects, serialization and restore
│   │   ├── ScreenRegion.js      # Exact 2D segment/box-circle-lasso intersection intervals
│   │   ├── SelectedFaceRegions.js # Safe partitioning of independent planar face islands
│   │   ├── SelectionView.js     # Best-view direction for selected face regions
│   │   ├── TransformOrientation.js # Global/local constrained transform axes
│   │   ├── TransformReadout.js # Live world-space Move delta and destination formatting
│   │   ├── TransformSnap.js # Configurable Global/Local axis-constrained G/R/S snapping policies
│   │   ├── TransformGuideGeometry.js # Renderer-independent passive G/R/S guide geometry
│   │   ├── TransformPivot.js # Edit-region and multi-object pivot resolution
│   │   ├── SelectionAddMode.js # Shared Shift/touch additive-selection state
│   │   └── UndoManager.js      # OPFS-backed snapshots and memory fallback
│   ├── input/
│   │   ├── KeyboardController.js # Blender-inspired keyboard mappings
│   │   ├── TouchController.js # Touch, long-press and additive-selection input
│   │   └── SelectionGestureController.js # Box/circle/lasso pointer gesture capture
│   ├── io/ModelIO.js           # GLB/GLTF/OBJ/STL import/export
│   ├── modifiers/ModifierStack.js # Non-destructive modifier bridge
│   ├── operators/
│   │   ├── MeshOperators.js    # Basic extrude/inset/delete/subdivide
│   │   ├── SelectionOperators.js # Visibility-checked screen-space region selection
│   │   ├── ModalTransform.js   # Camera-aware G/R/S state machine
│   │   ├── LoopCutModal.js     # Transactional interactive loop-cut preview and slide
│   │   └── BevelModal.js       # Transactional multi-edge bevel, segments and profile preview
│   │   └── FaceOperationModal.js # Transactional face Extrude/Inset preview and undo
│   ├── ui/
│   │   ├── Viewport.js         # Three.js viewport, navigation, pointer origin and overlay lifecycle
│   │   ├── EditModeOverlay.js  # Non-destructive vertex/edge/face selection display
│   │   └── CommandSearch.js    # Context-aware searchable command launcher and focus-safe shortcut
│   ├── workers/modifier.worker.js # Background modifier evaluation
│   ├── main.js                 # App composition, commands and UI bindings
│   └── styles.css              # Responsive desktop/mobile styling
├── .gitignore
├── tests/
│   ├── CameraProjection.test.js # Projection scale/frustum conversion regressions
│   ├── HalfEdgeMesh.test.js    # Node topology/triangulation regression tests
│   ├── WarpedQuadTriangulation.test.js # Twisted-quad viewport tessellation regressions
│   ├── PlanarInset.test.js     # Connected planar-region Inset geometry regressions
│   ├── FaceRegionBoundary.test.js # Shared boundary loops, holes, concavity and safety regressions
│   ├── FaceRegionBevel.test.js # Transactional planar face-region Bevel geometry/modal regressions
│   ├── BevelTransformTopology.test.js # Single/multi-face Bevel cap-rotation topology regressions
│   ├── CurvedFaceBevel.test.js # Conservative continuous curved-surface Bevel regressions
│   ├── PlanarExtrude.test.js   # Validated concave/rotated planar-region Extrude regressions
│   ├── BevelModal.test.js      # Bevel preview/confirm/cancel regression tests
│   ├── LoopCutModal.test.js    # Loop-cut preview/confirm/cancel regression tests
│   ├── MixedFanBevel.test.js    # Mixed terminal/internal Bevel fan regression matrix
│   ├── ScreenRegion.test.js     # Screen-space edge/region intersection regressions
│   ├── SelectionView.test.js    # Selection-aware camera direction regressions
│   ├── TransformOrientation.test.js # Global/local constrained-axis regressions
│   ├── TransformReadout.test.js # Live Move amount/destination formatting regressions
│   ├── TransformSnap.test.js # Global/Local Move/Rotate/Scale snap settings, increments and precision regressions
│   ├── TransformGuideGeometry.test.js # Passive transform guide geometry regressions
│   ├── TransformPivot.test.js # Edit-region and multi-object pivot regressions
│   ├── SelectedFaceRegions.test.js # Disconnected planar face-region operation regressions
│   ├── SelectionAddMode.test.js # Touch/Shift additive-selection policy regressions
│   ├── FaceOperationModal.test.js # Face-operation preview/undo/safety regressions
│   ├── KeyboardController.test.js # Keyboard shortcut priority and browser-conflict regressions
│   ├── CommandSearch.test.js    # Search ranking, mode context and shortcut-ownership regressions
│   ├── ObjectSelection.test.js  # Object Mode selection/additive-toggle state regressions
│   └── BROWSER_REGRESSION.md    # Desktop/mobile browser regression procedure
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
| GitHub Pages deployment | Working after workflow correction | Two-job artifact/deploy pipeline; triggers after successful unpack completion and normal main pushes excluding uploads. Latest deployed source baseline is v0.1.68: `main` commit `8400e5c389d1f63297a5108888b79ff8c52388b9`; Pages workflow run `46153656122` succeeded on 2026-11-28 after the successful package-unpack run `46153642289`. |
| Bl3nd branding/PWA | Working | Bl3nd header/title, manifest identity, app icons, service worker cache-version migration. |
| Startup progress/error UI | Partial | Staged progress and visible exceptions. Starter cube now initializes directly through `SceneDocument`, outside command dispatch and undo snapshot I/O; viewport framing and initial panel refresh are isolated as non-fatal steps. Real-browser verification remains. |
| Device capabilities | Partial | Detects tier, memory, CPU threads, WebGPU, WebGL2 and OPFS. Tier affects render pixel ratio/history budget; WebGPU is not activated. |
| 3D viewport | Partial | Three.js WebGL renderer, grid, axes, orbit/pan/zoom, standard views and framing. v0.1.50 adds a pointer-transparent projected G/R/S guide for pivot, Global/Local axes and the active plane/ring; it is not an interactive gizmo. v0.1.51 adds a functional Bounding Box Center pivot for selected Edit Mode vertices and Object Mode mesh world bounds. v0.1.52 adds connected-region Edit Mode Individual Origins with per-region guide markers. v0.1.53 adds a touch-friendly additive-selection toggle in the existing Select menu. v0.1.54 adds transactional Extrude, Inset and Face Bevel across multiple disconnected planar face islands. v0.1.55 adds a stable triangulation fallback for simple warped quads and two-sided editable mesh materials so connected faces remain visible during large Edit Mode rotations. v0.1.56 stores planar Face Bevel transition strips as renderer-matching triangle pairs, keeping raised-cap rotation from creating invalid warped wall quads. v0.1.57 adds topology-distance proportional vertex influence for Edit Mode G/R/S, with a persistent O toggle, adjustable radius and disconnected-island isolation. v0.1.58 adds direct mobile actionbar access and a radius panel. v0.1.59 exposes five selectable curves (Smooth default, Linear, Sharp, Root and Sphere) through synchronized desktop Scene Properties, the mobile Prop panel and the active mobile transform pad. v0.1.60 lets later mesh operations proceed when unchanged, safely triangulatable warped quads remain elsewhere from a proportional edit; new candidate geometry is still strictly validated. v0.1.61 separates proportional influence into smooth surface fans, blocks propagation across 55°+ face creases for face selections, and blocks non-manifold, disconnected-vertex-fan, inconsistent-winding and unstable-normal neighborhoods. v0.1.62 makes conservative Safe Repair policies explicit and reports source edge/face IDs for preserved non-manifold and contradictory winding components. v0.1.63 adds pole-aware Loop Cut: it crosses only closed all-quad extraordinary fans whose candidate continuation is the unique reciprocal near-antiparallel edge pair; ambiguous or unsafe fans are rejected before mutation. v0.1.64 replaces the former rectangular command popup with eight-direction radial menus, nested Select Tools/More Actions wheels, pointer-flick release selection for `Z` and `Shift+A`, and keyboard arrow/Enter/Esc navigation; touch selection retains its center Add to Selection control. v0.1.65 adds Numpad cardinal views, opposite views with Ctrl/Meta, 15° orbit steps, a 180° opposite orbit and selected-element framing, with keycode-based handling that prevents numeric-keypad shortcuts from colliding with Edit Mode 1/2/3 or NumLock-off Delete. v0.1.66 adds Perspective/Orthographic switching on Numpad 5 and a compact P/O button beside the desktop view axes; v0.1.67 adds a larger 48px-high P/O View button in the mobile bottom actionbar, synchronizing both controls and isolating the tap from viewport input. v0.1.68 adds a searchable, mode-scoped Command Search launcher through the existing CommandBus, with a visible top-bar button, `/` shortcut, keyboard navigation and mobile touch targets. v0.1.69 adds Object Mode multi-selection and shared group G/R/S around the selected-object pivot, with one passive guide pivot marker per selected object in Individual Origins mode. |
| Command bus | Working | Named command registration and snapshot-based undo boundaries. |
| Half-edge topology | Partial | Vertex/Edge/HalfEdge/Face records and adjacency. Import reconstructs safe coplanar regions; polygon rendering uses ear clipping for simple concave faces. Diagnostics cover invalid positions/faces, duplicates, non-manifold edges, inconsistent winding, isolated vertices, non-planar/self-intersecting faces and triangulation failures. v0.1.55 preserves the normal ear-clipping path for planar/concave polygons and adds a restricted 3D diagonal fallback for simple warped quads whose dominant-axis projection self-crosses after shared-vertex transforms; true 3D boundary crossings and degenerate candidates remain rejected. v0.1.56 changes planar Face Bevel transition-wall topology from one quad to its same two renderer triangles per perimeter segment, so cap rotations preserve planar, independently valid wall faces instead of producing the former non-planar/self-intersection/triangulation warning triple. v0.1.57 introduces read-only edge-geodesic influence weights for selected Edit Mode transform groups; influence is rebuilt from the modal's immutable source positions and remains limited to vertices reachable along mesh edges within the configured world-space radius. A shared read-only face-region analyzer now reports connected components, ordered boundary loops, planar nesting (outer loops/holes), region-facing convex/reflex corners, winding and planarity. The Face Bevel Connected Region mode uses that analysis to build a private candidate for one connected planar region with one simple boundary; it preserves multi-row/multi-column grids and welded inner seams. v0.1.41 adds a separate Continuous Surface path for a small connected non-planar patch with one simple projected boundary and smooth adjacent normals; it offsets shared vertices using area-weighted smooth normals, tangent-plane boundary miters and triangulated transition walls. v0.1.42 adds spatially filtered triangle-intersection screening between the modified top/transition triangles and other candidate triangles. This detects tested local crossings but is not a global collision proof. Individual Faces mode remains the safe per-polygon alternative and stores separate width/height/segment/profile settings; adjacent raised faces become independent panels with a groove at their shared base edge. Convex, collinear and supported reflex/concave region corners are accepted only when the inner offset and every transition wall pass geometric and topology validation. A conservative repair action removes malformed/duplicate faces, reorients only safe orientable components and compacts orphan vertices; v0.1.62 exposes the exact preserve-and-report policies and source face/edge IDs for skipped non-manifold and non-orientable components. This is not a production manifold kernel. v0.1.63 adds a Loop Cut traversal guard that recognizes a pole crossing only when the two quad-opposite edges meet at a closed extraordinary all-quad fan and are reciprocal near-antiparallel partners; otherwise the complete cut is rejected before mutation. v0.1.60 adds source-coordinate signatures for safely triangulatable warped quads: the unchanged source faces can be grandfathered through later modeling operations, while changed/new candidate faces remain strict and Validate Mesh still reports inherited non-planarity. v0.1.61 derives smooth face fans from reciprocal half-edge twins and world-space polygon normals, while keeping sharp crease sides separate at shared vertices. |
| Object mode | Working | Primitive creation plus desktop Shift-click and touch Multi-toggle additive/toggle selection. The active object is separately tracked and highlighted. Object G/R/S operate on all selected objects as one modal/undo transaction; Delete removes the selected group. Edit Mode entry intentionally collapses to the active object. |
| Edit mode | Partial | Visible edge/vertex overlays and selected-face tint; click/Shift-click, plus a touch-only Add to Selection toggle for tap and box/circle/lasso selection, v0.1.57 Edit Mode proportional influence for G/R/S with the O toggle, adjustable radius and geodesic falloff across connected edges; v0.1.58 adds the direct mobile Prop actionbar control and radius panel; v0.1.59 adds selectable Smooth/Linear/Sharp/Root/Sphere falloff in synchronized desktop and mobile controls; v0.1.60 allows Extrude, Inset and Face Bevel on a planar selected region even when unchanged neighboring quads are safely warped by proportional editing, while new/changed candidate faces remain strict; v0.1.61 makes proportional face-selection falloff surface-aware, separating fans at 55°+ creases and blocking non-manifold/inconsistent/unstable neighborhoods while smooth joins remain traversable. Select All / Deselect / Invert, ray-checked visible-region selection, selection-aware vertex/edge/face deletion and constrained planar dissolve. Extrude has an immutable-source modal preview with signed distance, numeric/drag adjustment, validation, cancel and one-step undo; v0.1.54 accepts one or more disconnected selected islands, deriving a separate Newell normal for every independently connected, consistently wound, coplanar component with one simple boundary. Inset uses the same safe partitioner and processes each disconnected island separately in one transaction, applying the same normalized amount relative to each island's shortest boundary edge while preserving/reselecting every inner face. Concave and arbitrarily rotated planar islands remain supported when each offset stays simple. Separate islands must not share vertices; shared-vertex-only contact, holes/multiple loops, connected non-planar selections, inconsistent winding, excessive miters and collapsing/self-intersecting offsets reject without source mutation. It uses a conservative miter join and is not full Blender Inset/BMesh parity. Subdivision remains first-pass. Loop/ring selection has topology-based quad/fan traversal; ring traversal can pass a geometrically unambiguous extraordinary all-quad pole but stops at boundaries, mixed-face fans and ambiguous poles. Safe topology repair handles malformed/duplicate faces, orientable winding and orphan vertices; v0.1.62 reports the precise non-manifold edge fan uses, skipped face IDs and contradictory orientation components it deliberately preserves. Loop Cut previews validated convex planar quad strips and supports modal horizontal sliding, precision movement, numeric offsets, keyboard nudges, 1–8 evenly spaced cuts, confirmation and cancellation. v0.1.63 allows Loop Cut to traverse only a closed extraordinary all-quad pole with a unique reciprocal near-antiparallel pairing; ambiguous/tied, open extraordinary, non-quad and non-manifold fans remain unsupported. Face Bevel has Connected Region, Multi-Region, Continuous Surface and Individual Faces modes with 1–8 segments and a 0–1 concave/rounded/convex profile. Connected Region requires one connected planar patch and preserves welded inner seams; Multi-Region applies that same validated shared-region operation independently to two or more vertex-disjoint planar islands in one transaction, using shared width/height/segment/profile values while retaining each island's internal welded seams. Connected Region accepts validated convex, collinear and supported reflex/concave corners and multi-row/multi-column grids. Continuous Surface is a prototype for one connected non-planar patch with one simple projected boundary and smoothly varying adjacent normals (maximum adjacent face-normal turn 55°); it raises shared vertices along area-weighted smooth normals and uses triangulated transition walls with orientation/topology checks. It is not a general curvature-aware solver; v0.1.42 adds a spatial-hash broad phase and triangle/triangle checks for intersections involving changed top/transition triangles, but this remains partial screening rather than a complete global self-collision proof. Whole-sphere and high-curvature patches remain unsupported. Individual Faces stores independent width, height, segment and profile values per selected face and creates separate raised panels with transition grooves. v0.1.56 uses two planar triangles for each transition-wall segment in all planar Face Bevel modes, including Multi-Region and Individual Faces. Unsupported curvature, sharp creases, ambiguous normals, excessive offsets, folded walls and invalid candidates reject non-destructively or use Individual Faces when its own checks pass. |
| Modal transforms | Partial | Object Mode G/R/S now transforms the complete selected-object set as one cancelable/undoable transaction. Median Point uses the arithmetic mean of selected object origins, Bounding Box Center uses the union of their world-space mesh bounds, 3D Cursor remains fixed, and Individual Origins rotates/scales each object around its own origin while Move shares one translation. The passive guide marks each Individual object origin. Local orientation uses the active selected object's captured starting world quaternion. Non-uniform world-axis scaling of differently rotated objects remains limited by TRS (no arbitrary shear representation). Free G follows the current camera-facing view plane; axis-constrained Move/Rotate/Scale support Global and Local orientation using the object's captured starting world quaternion. v0.1.52 adds Edit Mode Individual Origins as one median pivot per disconnected selected region, merging any regions that share a topology vertex; shared vertices stay welded and transform once. The guide marks each region pivot and reports the region count. Rotating an ordinary selected face keeps shared vertices welded, so adjacent unselected faces deform; v0.1.55 renders simple warped quads through a safe diagonal fallback and uses two-sided editable materials to prevent false visual gaps. v0.1.56 fixes the separate post-Face-Bevel case by storing transition walls as planar triangles, so rotating a raised bevel cap does not leave those walls as invalid warped quads. This does not make ordinary adjacent faces rigid or eliminate extreme folds/self-intersections outside the bevel transition. v0.1.44 isolates the mobile Apply pointer from non-viewport movement; the owner confirmed Android Apply correctness. v0.1.45/46 provide a live Move delta and resulting XYZ destination; the owner confirmed the v0.1.46 coordinate feedback works on Android. v0.1.47 adds optional, disabled-by-default snapping for pointer-driven axis-constrained Move, with independent persisted Global/Local increments. v0.1.48 moves the mobile controls out of the More drawer into a compact in-operation transform pad control, with expandable Global/Local step fields and an explicit active-step / exact-input status in the viewport readout; the owner confirms the mobile layout and snapped Move increments work on Android. v0.1.49 extends the same disabled-by-default preference toggle to axis-constrained pointer Rotate (degree increments) and Scale (factor increments around 1.0), each with independent persisted Global/Local steps; numeric input remains exact, while free trackball rotation and unconstrained/Shift+axis plane transforms remain unchanged. The owner confirms Move, Rotate and Scale snapping work on Android. v0.1.50 adds a passive projected guide for the live pivot, Global/Local axes and active move/scale plane or rotation ring; it is visual-only and does not capture input. Bounding Box Center is now supported for one active mesh/selected Edit Mode vertices. Edit Mode Individual Origins now uses one median pivot per connected selected topology region, while v0.1.69 supersedes the single-object restriction: Object Mode Median Point and Bounding Box Center now aggregate the selected-object set, 3D Cursor remains shared/fixed, and Individual Origins uses one pivot per selected object. Multi-object Edit Mode remains unsupported. A fully interactive Blender-like gizmo remains incomplete. v0.1.57 adds Edit Mode proportional Move/Rotate/Scale: selected vertices keep weight 1, connected unselected vertices receive smooth weighted transforms by shortest mesh-edge path within a persistent adjustable world-space radius, and nearby disconnected shells remain isolated. v0.1.61 builds the distance graph from per-vertex smooth face fans: face selections do not leak around sharp creases (55° or greater), non-manifold edges, split vertex fans, inconsistent winding or unstable face normals; smoother joins still carry influence. Individual Origins keeps separate influence basins and assigns overlapping vertices to the nearest selected region. v0.1.59 exposes Smooth (default), Linear, Sharp, Root and Sphere through synchronized desktop and mobile controls; the choice persists locally and can be changed during a modal preview, which rebuilds from immutable source positions. The graph distance follows mesh edges rather than face-interior shortcuts and is therefore conservative on sparse topology. v0.1.58 adds a dedicated Prop ON/OFF button to the mobile bottom actionbar with an immediately visible radius panel; the existing Select menu toggle, O shortcut and in-operation numeric-pad controls remain synchronized. The Scene Properties panel is an additional desktop/advanced location, not a prerequisite for phone use. Global-axis object scaling is still approximate under the TRS scene representation. |
| 3D cursor/pivot | Partial | The 3D Cursor pivot remains fixed during G/R/S; Median Point uses the selected Edit Mode vertex centroid. In Object Mode, v0.1.69 aggregates selected object origins for Median Point and the union of selected world-space mesh bounds for Bounding Box Center; Individual Origins retains one pivot per selected object. v0.1.51 added Bounding Box Center from selected Edit Mode vertex extents or the active mesh world-space bounds in Object Mode. Edit Mode Individual Origins now uses one median pivot per disconnected selected region; selected face groups connect through shared vertices, selected edge groups through shared endpoints, and vertex-only picks connect across real edges only when both endpoints are selected. Shared vertices merge the affected groups and are transformed once, without vertex duplication. Object Mode Individual Origins uses one pivot per selected object. Multi-object selection and pivot aggregation are implemented in v0.1.69; multi-object Edit Mode remains unsupported. |
| Modifiers | Partial | Worker-based midpoint subdivision, mirror, array and solidify; not Blender-equivalent. |
| Undo/redo | Partial | OPFS snapshots with memory fallback; current snapshots also preserve per-object vertex/edge/face selections. Large snapshots can temporarily increase RAM. |
| Model I/O | Partial | GLB, GLTF, OBJ and STL browser import/export paths; complex scenes/materials/animation need validation. |
| Desktop/mobile input | Partial | v0.1.64 adds radial sector menus with mouse-flick, click/tap and arrow/Enter/Esc selection; touch retains the center Add to Selection toggle and direct actionbar controls. v0.1.65 adds numpad views/orbit/frame shortcuts with priority over Edit Mode numeric selection and NumLock-off Delete aliases. v0.1.66 adds an unmodified Numpad 5 projection toggle and a desktop P/O axis-toolbar button; v0.1.67 adds a larger mobile P/O View actionbar button. v0.1.68 adds a searchable top-bar launcher with `/`, mode-aware results, keyboard navigation and touch selection; commands remain routed through the existing CommandBus. v0.1.69 adds a touch-only Object Mode Multi toggle that decorates the existing viewport tap event with the same Shift-aware additive-selection path used on desktop. The launcher does not take focus during modal operations or radial menus, and editable fields plus browser-modified shortcuts retain priority. Both projection controls use the same projection command and accessible state; browser-reserved modifier combinations are left untouched. Full Blender pie/keymap parity remains incomplete. Desktop left-drag orbit, right-drag/Shift+left-drag pan and wheel zoom; B/C/L or the viewport menu activate box/circle/lasso drags, with Esc returning to click selection; Shift adds. Projected edges use continuous segment/region overlap intervals with visibility ray checks. Alt+L expands selected quad-edge loops; Ctrl+Alt+L expands supported vertex-fan rings. User confirms mobile startup/navigation/Bevel/undo checks and the v0.1.27 corner/multi-edge region-selection fix pass. v0.1.53 adds a touch-only Add to Selection toggle that reuses the existing Shift-aware tap and Box/Circle/Lasso paths; Android acceptance is pending. v0.1.54 adds transactional multi-island Extrude/Inset and Face Bevel Multi-Region for independent planar face islands; the new mobile modal interactions still require browser acceptance. The owner reports Android acceptance of the v0.1.31 Inset/Extrude and v0.1.33/v0.1.34 Face Bevel geometry/modal checks passed. The owner confirmed v0.1.35's 1–8 Face Bevel segment control, concave/rounded/convex profile control and immediate post-modal viewport navigation/Click Select recovery pass on Android. The owner also confirmed the v0.1.36 multi-row/multi-column planar Face Bevel grid fix works. The owner requested a way to adjust each selected face separately; v0.1.37 adds Individual Faces mode and per-face parameter records, pending Android acceptance. Desktop Chrome/Edge remains deferred. v0.1.38 also closes the mobile More/properties drawer when a G/R/S, Bevel, Loop Cut, Extrude or Inset modal successfully starts; the More action can reopen it after the modal. Android acceptance of this drawer behavior is pending. v0.1.39 added whole-selection view framing, but the owner reports that Android did not move the camera when beveling an eight-face selection or when adjusting/switching targets. v0.1.40 focuses the active Individual Faces target on modal start and recenters/reorients on every Previous/Next Face change; the owner confirms this works on Android. v0.1.41 adds Continuous Surface Face Bevel for a narrow smooth-curvature envelope. The owner reports all six Android acceptance checks passed for the tested small sphere patch; a whole-sphere bevel was not tested and is outside the supported envelope. v0.1.42 adds candidate intersection screening; the owner deferred visual Android retest because the effect is difficult to inspect on a sphere, so automated geometry regressions remain the evidence for this guard rather than a browser-acceptance pass. The PC browser regression is untested and explicitly deferred because the user cannot access a PC soon; it does not block continued operator development. Device/browser version details were not supplied. |
| Pie menus | Partial | v0.1.64 adds true eight-direction radial sector layouts for Add, Shading and Select, with nested Select Tools/More Actions menus, directional pointer-flick release, click/tap and keyboard navigation. The center touch-only Add to Selection control and direct mobile actionbar remain. Full Blender keymap parity and a few high-conflict shortcuts are still incomplete. |
| Command search | Partial | v0.1.68 adds a visible top-bar launcher and `/` shortcut, searchable curated actions, Object/Edit Mode filtering, Up/Down/Enter/Esc navigation, focus restoration and a mobile-friendly modal panel. Results dispatch existing CommandBus commands. It does not auto-discover later commands, and the catalogue does not yet include every panel action or context-sensitive parameter. |
| Bevel/sculpt | Partial | Existing edge Bevel retains its supported one-edge, connected pair/chain and disjoint-edge paths with 1–8 segments and concave/rounded/convex profile shaping; arbitrary mixed connected/disconnected edge batches remain unsupported. Planar Face Bevel supports one connected Region or, from v0.1.54, multiple vertex-disjoint planar islands through Multi-Region. Every island uses the existing validated shared-region operator on one private candidate, preserving its internal welded seams while sharing width/height/segment/profile settings across islands. Convex, collinear and supported reflex/concave corners build validated transition walls; 1–8 segments, monotonic cubic-Bezier profile (`0` concave, `0.50` rounded, `1` convex), multi-row/multi-column grids and independent width/height are supported. Individual Faces remains available for separate per-polygon settings and panel grooves. v0.1.56 stores each planar Face Bevel transition segment as two topology triangles to keep the resulting wall geometry valid during subsequent cap rotations. v0.1.41 also supports Continuous Surface Bevel for one connected small non-planar patch with one simple projected boundary and adjacent face normals within 55°: shared top vertices follow area-weighted smooth normals, the boundary uses tangent-plane miters, and each transition quad is split into triangles so warped quads are not trusted. Source and candidate topology, top-triangle orientation and transition outward orientation are checked before atomic commit. This is a limited prototype, not general global collision/self-intersection proof. v0.1.42 adds spatially filtered triangle-intersection checks for changed top/transition triangles against the candidate surface; expected shared topological contacts are allowed, and detected crossings reject atomically. Face islands that touch only at a vertex, holes, multiple loops, sharp creases, ambiguous normals and unsafe offsets reject without mutation; connected non-planar groups may use Individual Faces only when every polygon independently validates. Whole-sphere/high-curvature patches remain unsupported. Sculpting is not implemented. |
| Exact Blender clone | Not Started | No claim of full Blender operator, BMesh, UI, or file-format parity. |

## Known Issues & Technical Debt

1. WebGPU is detected but the renderer is still Three.js WebGL.
2. Imported geometry is initially triangulated, then adjacent coplanar triangles are merged only when exactly two triangles share each joined edge and a single convex boundary can be reconstructed. Concave faces, holes, duplicated seam vertices, inconsistent winding and non-manifold regions may remain triangulated or lose source polygon semantics.
3. Edit Mode box/circle/lasso selection projects sub-elements into screen space and ray-checks candidates against the visible surface. Vertices and ear-clipped face triangles are point-tested; edges use continuous segment/region overlap intervals with several samples inside each actual overlap interval, avoiding misses when a narrow finger-drawn region falls between fixed edge samples. Visibility ray checks still prevent selecting hidden geometry. Edge loops cross opposite edges in quads; edge rings traverse opposite edges in closed all-quad vertex fans, including extraordinary poles only when a unique near-antiparallel pairing is found. These deterministic passes stop at boundaries and ambiguous poles and are not identical to all Blender select modes. The v0.1.26 mobile run initially missed corner/multi-edge selection; the user confirmed the v0.1.27 correction works on mobile. Desktop behavior remains unverified until the user can test it, but is not a development blocker.
4. Delete is selection-mode aware: deleting a vertex or edge removes incident faces and dependent unused vertices; face deletion removes selected faces. Dissolve supports consistently wound, single-boundary, simple planar patches, including concave boundaries. Non-planar, self-intersecting, boundary-only and non-manifold cases are deliberately skipped without mutation. Bevel supports a single edge, one two-edge miter, or one simple connected path of three to eight consecutive edges. Both chain endpoints and internal path vertices support closed valence-three through valence-six fans. Valence-four junctions add one triangular patch; valence-five/six junctions add a center-fanned patch following every cut point along the opposite fan arc. The fan boundary is oriented only when exactly one winding opposes all existing boundary half-edges, must be simple and convex in projection, and is triangulated into individually planar faces before final manifold validation. Multi-segment profile subdivision keeps the patch boundaries welded to neighboring bevel strips; valence-five/six profile amplitude at any chain vertex is scaled to 25% during segmented bevels to guard against foldovers. Four- through seven-edge tri-valent paths remain exhaustively tested across all 360 simple paths on a cube; mixed valence-four/five/six fixtures cover reversed order, repeated internal patches, rotated geometry and all 1–8 segment counts. The v0.1.25 matrix covers all nine terminal/internal fan-valence pairings (4–6) at 1, 4 and 8 segments; strongly skewed affine variants can yield a non-planar bevel candidate and are explicitly required to reject without source mutation. The segmented eight-edge tri-valent prism chain remains supported. Two to four independent two-edge miter pairs and up to eight pairwise-disjoint single edges remain supported. These validated envelopes support 1–8 segments and a 0–1 profile (0 concave, 0.50 rounded default, 1 convex); the multi-segment strip uses triangular bands and shared miter subdivisions are welded. Cycles, branches, chains longer than eight selected edges, mixed connected/disconnected selections, fans above valence six at either endpoints or internal junctions, overlapping caps and ambiguous intersections reject before source mutation. Multi-pair mitering uses sequential temporary candidates, requires disjoint affected-face neighborhoods and validates the combined candidate before commit. Boundary edges, fans above valence six at either chain endpoint or internal junction, non-manifold or invalid inputs and ambiguous/excessive miters remain unsupported. Profile shaping does not curve the shared miter seam. Loop Cut supports validated planar convex quad strips with up to eight evenly spaced cuts and, since v0.1.63, a closed extraordinary all-quad pole only when the two opposite-edge candidates are unique reciprocal near-antiparallel partners. Multiple distinct seed loops, open/ambiguous pole fans and Blender-equivalent edge sliding remain unsupported. Extrude builds a private candidate for one face or one or more disconnected, consistently wound, coplanar face components, each with one simple boundary. Each island uses its own boundary Newell normal (not an average of face normals), so concave and arbitrarily rotated planar islands can share one signed world-space distance. Inset offsets each disconnected single-face or connected multi-face planar island in one transaction; each island uses one constant offset derived from the same normalized amount and its own shortest boundary edge. Miter joins are shared at every boundary vertex; original interior vertices and edges remain in the inset region. Concave regions are accepted only when every offset point remains inside, the inner boundary preserves winding and does not self-intersect, all resulting faces triangulate, and the candidate passes topology validation. Separate islands that touch at a vertex, holes/multiple loops, inconsistent winding, connected non-planar source faces, excessive miters and collapsing offsets reject without source mutation. The offset distance is `amount × shortest boundary-edge length`, with amount limited to 0.005–0.9. Open planar sheets are supported and retain their existing outer boundary-edge status. This is conservative planar-region miter inset, not Blender BMesh parity. Midpoint subdivision retains topology/normal limitations. The shared face-region analyzer remains read-only: it reports ordered loops, components, nested holes (only when planar) and region-facing corner classes. Face Bevel Connected Region uses those results for one connected planar single-loop patch and supports 1–8 segments, a monotonic profile and independent width/height factors. Multi-row/multi-column selections are valid; if candidate generation leaves old selected-region interior vertices unused, the private candidate compacts them before topology validation. Reflex/concave corners are supported only when the inward offset remains inside the source, preserves winding, remains simple, stays within the guarded miter limit and all transition walls validate as planar/convex. Individual Faces mode applies this validated single-face path separately to each selected polygon, with independent per-face width/height/segment/profile values; each polygon must itself be planar and simple. Adjacent raised faces form separate panels and grooves rather than a continuous curved patch. Holes within a single polygon, unsupported individual polygons, excessive miters, folded walls and invalid source topology reject before mutation. Extrude/Inset accept multiple independent components only when every component is connected, planar and single-loop; never select an arbitrary loop or treat a hole as an outer boundary. Shared-vertex island contact is rejected because independent transforms would require assigning one vertex to conflicting component operations.
5. The topology validator is diagnostic only. It reports invalid positions/faces, duplicates, non-manifold edges, same-direction shared-edge winding, isolated vertices, non-planar faces, self-intersections and triangulation failures; boundary edges are reported but valid for open surfaces. It does not repair geometry. Ear clipping supports simple concave polygons, but non-planar polygons remain intrinsically ambiguous and are flagged.
6. Modifier algorithms are first-pass approximations: midpoint triangle subdivision, non-welded mirror, simple array offset and basic solidify.
7. v0.1.43 adds Global/Local orientation for axis-constrained G/R/S; v0.1.52 adds Edit Mode Individual Origins using one median pivot per disconnected selected topology region, merging any groups that share a welded vertex. v0.1.69 adds Object Mode multi-selection, object-index selection persistence, group G/R/S and Median/Bounds/Cursor/Individual pivot aggregation. Desktop Shift-click adds/toggles objects; Android uses the bottom-bar Multi toggle and routes taps through the existing Shift-aware viewport selection path. Object transforms remain one modal transaction with one Undo record and cancel restores the full selection and transforms. Local orientation uses the active selected object's captured world quaternion as the shared reference. The passive guide shows an origin marker for each selected object in Individual mode. Remaining limitations: multi-object Edit Mode is not implemented and entering Edit Mode collapses to the active object; non-uniform scaling along arbitrary world axes for differently rotated objects cannot represent the required shear in the current TRS scene graph. Global-axis object scaling is therefore still approximate. Existing Edit Mode Individual Origins keeps the shared-topology/no-duplicate-vertex rules.
8. Camera-relative G/R/S math captures the camera when an operation begins; changing the view during a modal transform is intentionally disabled until confirm/cancel. Free rotation is a practical virtual trackball, not exact Blender trackball/turntable parity.
9. First visit requires network access to jsDelivr. Strict content blockers, CDN outages, or offline first visit may prevent startup.
10. iOS Safari/Android Chrome OPFS, memory ceilings, WebGL context loss, background suspension and multi-touch behavior require device testing.
11. Undo snapshots are serialized in memory before OPFS write; no chunked serialization or inactive-scene disk paging exists. v0.1.69 adds selected object indices and the active object index to the scene snapshot so multi-object selection survives transform Undo/Redo and cancel restoration; large snapshots still temporarily increase RAM.
12. Modifier evaluation uses one worker and a full mesh payload; no worker pool, chunk scheduling, cancellation or progress protocol exists.
13. Large model import/export may temporarily duplicate large geometry buffers; advanced GLTF materials, skinning and animation are not fully validated.
14. The application uses a system UI font stack and contains no bundled Inter font files or `@font-face` declarations. Requests to `/assets/fonts/Inter-*.woff2` do not originate in the current repository source; if they persist after a clean reload, check injected browser-extension styles or stale browser caches.
15. GitHub Actions workflow files must be edited manually because the unpacker deliberately excludes `.github/workflows/**`.
16. The Pages upload artifact must be created in the `build` job and deployed in the dependent `deploy` job. Do not reintroduce a `gh workflow run pages.yml` step in the unpack workflow; the `workflow_run` event handles deployment after unpack succeeds.
17. The current Node.js 20 deprecation annotation from older action major versions is a warning, not the cause of the prior artifact lookup failure.
18. The initial starter object is document bootstrap state, not a user operation. Do not route its creation through the CommandBus or undo snapshots; later user-created objects must continue to use the CommandBus.
19. `HalfEdgeMesh.analyzeFaceRegion()` is the shared read-only boundary source for face-region operators. It can report multiple components and loops. Since v0.1.54, Extrude and Inset accept one or more selected face components when each component independently forms a connected, consistently wound, coplanar region with one simple boundary; separate components must not share vertices. Extrude derives an independent Newell normal for each island and applies one signed distance. Inset applies one normalized amount relative to each island's own shortest boundary edge. Both build and validate the complete combined candidate before one atomic commit/undo record. Face Bevel Region mode retains its one-region/one-loop constraint. Multi-Region mode applies that validated shared-region operation separately to multiple vertex-disjoint planar islands on one candidate, using common width/height/segment/profile settings and preserving welded seams inside each island. Face Bevel Individual mode remains a separate-per-polygon path with independent width/height/segment/profile settings; it can handle a connected non-planar group only when every individual polygon is itself planar and passes simple-boundary/topology checks. Adjacent selected faces become separate panels with grooves at the shared source edge; this is not continuous curved-surface Bevel. Acute/excessive miters, folded walls and self-intersections reject without mutation. Islands that only touch at a vertex, holes/multiple loops, malformed or inconsistently wound input, and connected non-planar face groups for Extrude/Inset reject safely. Region, Multi-Region and Individual Bevel modes retain 1–8 segment rows and a monotonic cubic-Bezier profile. Multi-row/multi-column planar patches remain valid. Non-planar loops still do not receive planar nesting/corner classification.
20. The persistent Box/Circle/Lasso selection tool previously intercepted the first post-modal touch drag. v0.1.35 changes Bevel, Extrude/Inset and Loop Cut modal completion/cancel to restore Click Select directly. The owner reports immediate post-modal viewport navigation now passes on Android for v0.1.35.
21. Individual Faces Bevel deliberately creates separate raised panels. Adjacent selected faces no longer share their raised top seam; their perimeter transitions meet along the original shared base edge and create a groove. This is an independent-face panel tool, not the continuous curved-surface Bevel still under research. Per-face settings must match before switching back to one connected Region operation.
22. The owner reported that v0.1.39 whole-selection camera framing did not move on Android for a balanced eight-face selection and did not follow Individual Faces target changes. v0.1.40 added an explicit active-face focus path on modal start, mode toggle and Previous/Next Face; the owner confirms that this now works. Parameter edits keep the view stable. A single perspective camera still cannot show opposing front/back surfaces simultaneously; the feature brings the current editable face to the front rather than claiming full per-face occlusion analysis.
23. Mobile properties/More drawer overlap during modal adjustments was reported on Android. v0.1.38 now removes the `mobile-open` state after a G/R/S, Bevel, Loop Cut, Extrude or Inset modal successfully starts at the existing 650px mobile breakpoint. The drawer remains closed after Apply/Cancel and can be reopened with More; real-device acceptance is pending. Desktop behavior is unchanged.
24. Continuous Surface Face Bevel remains intentionally limited to a connected non-planar patch with one simple projected boundary, stable area-weighted vertex normals, and no more than 55° normal change across any adjacent face pair that touches the selection. v0.1.42 adds spatially filtered triangle/triangle intersection screening for modified top and transition triangles against the candidate surface, allowing expected shared vertex/edge contacts. This is not a complete global self-intersection proof and does not expand support to whole spheres, arbitrary high-curvature regions, poles, holes or complex boundaries. Use Individual Faces for separate panels or retain the non-destructive rejection for unsupported patches.
25. Edit Mode transforms preserve shared topology vertices. Rotating an ordinary selected face therefore also moves vertices used by adjacent unselected faces; these neighboring polygons can become non-planar or fold as the angle increases. v0.1.55 supplies a validated 3D diagonal fallback for simple warped quads and uses two-sided viewport materials so such faces do not disappear from backface culling. v0.1.56 separately fixes the post-Face-Bevel case: planar bevel transition segments are stored as two topology triangles, so rotating the raised cap does not create invalid warped wall quads or the associated non-planar/self-intersection/triangulation warning triple. This is not a rigid-neighbor solver for ordinary un-beveled faces: extreme rotations can still fold or self-intersect the surrounding surface, and actual geometry separation is required when a face must move as a detached piece.
26. Proportional Edit Mode transforms can leave neighboring unselected quads non-planar because shared topology vertices remain welded. v0.1.60 permits later operators to ignore only unchanged source quads whose existing renderer fallback yields two valid triangles; coordinate signatures ensure the exception does not transfer to newly created or moved candidate faces. `Validate Mesh` remains strict and may continue reporting inherited non-planar quads. The selected target region must still meet the operator's own planar, winding, boundary and topology requirements. Truly crossing or degenerate quads, non-manifold edges and inconsistent winding are never waived.
27. v0.1.61 proportional surface guards use a geometric 55° dihedral threshold rather than explicit user crease attributes. Polygon normals use the world-space Newell normal; faces with unusable normals, non-manifold edge fans, inconsistent twin orientation and disconnected vertex fans are conservative barriers. Explicit vertex/edge selection seeds every incident fan of the selected shared vertices, while face selection carries its face-side context. This is a first-pass surface-aware falloff policy, not Blender's full crease-aware proportional-editing implementation; curved surfaces with adjacent-face turns of 55° or more intentionally behave as guarded creases.
28. v0.1.62 makes Safe Repair preservation explicit but does not automatically resolve a non-manifold edge or a contradictory/non-orientable face component. It reports the affected source edge/face IDs and preserves those surfaces rather than deleting an arbitrary face or guessing how to split a sheet. Manual modeling/reconstruction is still required for those cases; non-planar and self-intersecting geometry is also left untouched.
29. v0.1.63 expands Loop Cut only across a closed extraordinary all-quad pole when its two outgoing edges form the exact unique reciprocal near-antiparallel pair chosen by the ring matcher. It does not generalize to boundary/open poles, mixed-face/non-quad fans, non-manifold spokes, tied or weak direction matches, concave/non-planar quads, multiple distinct seed edges or arbitrary topology repair.
30. v0.1.68 Command Search uses a curated catalogue rather than automatic CommandBus introspection. New or renamed commands must update `src/ui/CommandSearch.js` and `tests/CommandSearch.test.js`. Search is intentionally unavailable while a radial menu or modeling modal owns input, and the slash shortcut does not override editable fields or browser-modified shortcuts.
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
- [x] Add visible vertex/edge/face overlays, hit-face screen-space element picking, desktop Shift-click plus touch Add to Selection toggle, Select All / Deselect / Invert and snapshot persistence.
- [x] Add box/circle/lasso selection with screen-space sampling and visibility checks; add topology-based edge loop/ring expansion with boundary/pole stops.
- [x] Add selection-aware vertex/edge/face deletion and safe simple-planar dissolve, plus diagnostic topology validation.
- [x] Add ear-clipping triangulation and simple concave planar dissolve; synchronize render, face-picking and overlay triangle mappings.
- [x] Add edge-loop selection across opposite quad edges and edge-ring selection through closed all-quad fans, with guarded geometric pairing at extraordinary poles.
- [x] Add conservative topology repair for malformed/duplicate faces, orientable manifold winding and orphan vertices; non-manifold and ambiguous components are explicitly skipped.
- [x] Make safe-repair policies explicit and report preserved non-manifold edge uses, source face IDs, components blocked by non-manifold ambiguity and contradictory/non-orientable winding components.
- [x] Add first transactional loop-cut topology for validated convex planar quad strips.
- [x] Add a conservative extraordinary-pole continuation for Edge Ring selection when a closed all-quad fan has a unique near-antiparallel edge pairing.
- [x] Extend Loop Cut across supported extraordinary all-quad poles using the existing unique reciprocal near-antiparallel fan pairing; reject ambiguous, open, non-quad and non-manifold fans before mutation.
- [x] Add Global/Local orientation to axis-constrained modal G/R/S; Local axes follow the active object's captured starting world orientation.
- [x] Add disabled-by-default Global/Local axis snapping for Move, Rotate and Scale, preserving exact numeric entry and free/plane transform behavior.
- [x] Add a passive viewport transform guide for the live pivot, oriented X/Y/Z axes, movement/scale planes and rotation ring.
- [x] Add Bounding Box Center pivot support for selected Edit Mode vertices and active Object Mode mesh bounds; retain Median Point and fixed 3D Cursor pivots.
- [x] Add Edit Mode Individual Origins with one pivot per disconnected selected topology region; shared vertices merge groups and remain welded.
- [x] Expose Smooth (default), Linear, Sharp, Root and Sphere proportional falloff curves in synchronized desktop Scene Properties, mobile Prop panel and active transform-pad controls.
- [x] Add surface-aware proportional falloff fans: preserve topology-distance behavior across smooth joins, split face-selection influence at 55°+ creases, and conservatively block non-manifold edges, disconnected vertex fans, inconsistent winding and unusable face normals.
- [x] Add Object Mode multi-selection (desktop Shift-click; touch Multi toggle), persist selected object indices/active object, and aggregate G/R/S across the selected group with Median, combined Bounds, Cursor and Individual Origins pivots; keep one undo/cancel transaction and passive guide markers.
- [ ] Add a fully interactive Blender-like draggable G/R/S gizmo; the current guide remains passive and pointer-transparent.
- [x] Implement a transactional Bevel preview for one edge and a guarded multi-edge extension for up to eight pairwise-disjoint neighborhoods.
- [x] Add a validated two-edge connected Bevel miter at one closed tri-valent shared corner; intersect the shared-face offset lines, create two joined strips and retain one manifold miter edge.
- [x] Extend connected Bevel to two to four independent two-edge miter junctions in one validated transaction; reject overlapping affected-face neighborhoods.
- [x] Extend connected Bevel to three-to-eight-edge paths with multiple consecutive miters and validated valence-four through valence-six cap patches at both endpoints and internal junctions; higher valences remain guarded.
- [x] Add bevel segment count and profile shaping (1–8 segments; concave, rounded and convex profiles).
- [x] Add transactional modal Extrude preview for a single face or connected planar region, plus single-face/connected-region Inset preview with shared miter offsets, drag/numeric input, candidate validation, cancel and one-step undo.
- [x] Extend transactional Extrude and Inset to multiple disconnected, vertex-disjoint planar face islands in one candidate and one undo transaction; derive per-island Extrude normals and per-island Inset distances safely.
- [x] Add Face Bevel Multi-Region for multiple disconnected, vertex-disjoint planar islands, applying the shared Region bevel to each island while preserving internal seams and common settings.
- [x] Add shared read-only face-region boundary analysis for components, ordered loops, hole nesting, region-facing concave/convex corners, winding and planarity; keep unsupported geometries non-destructive.
- [x] Implement the first transactional Face Bevel preview for one connected planar region with one simple boundary; validate private candidates and reject unsupported regions without mutation.
- [x] Extend Face Bevel to supported reflex/concave corners when the inward offset remains simple and every miter/transition wall validates; acute/excessive-miter cases still reject non-destructively.
- [x] Add 1–8 Face Bevel transition segments, concave/rounded/convex profile shaping and independently adjustable width/height controls; the owner confirms the v0.1.36 multi-grid fix works on Android.
- [x] Add Individual Faces Bevel with separate per-face width, height, segment and profile values; retain Connected Region mode for welded planar patches and auto-select Individual mode for eligible non-planar selections. Android acceptance of the new per-face controls remains pending.
- [x] Auto-frame multi-face/edge modal selections and choose a camera direction that maximizes their combined projected face area; keep a single selected face/edge in the current view.
- [x] In Individual Faces Bevel, focus the active face on modal start and reframe when Previous/Next Face changes; keep the view steady while its parameters are adjusted. The owner confirms Android acceptance.
- [x] Prototype Continuous Surface Face Bevel for small connected curved patches using shared smooth-normal offsets, tangent-plane boundary miters, triangulated transition walls and non-destructive safety checks. The owner confirms all six Android acceptance checks for the small patch passed; whole-sphere beveling remains unsupported.
- [x] Implement eight-direction radial pie menus with nested selection submenus, pointer-flick/click/tap selection and keyboard navigation.
- [x] Add keycode-based numpad cardinal views, opposite views, stepped orbit and selection framing; audit keypad collisions with Edit Mode numeric selection and NumLock-off Delete.
- [x] Add Perspective/Orthographic camera switching on Numpad 5 and an equivalent mobile P/O control; preserve target, orientation, target-plane framing, ray picking and resize behavior.
- [x] Add a command-search launcher with isolated focus/keyboard handling; preserve browser shortcuts and direct mobile controls. The v0.1.68 catalogue is curated and mode-scoped; new commands must be added explicitly.

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
- Advanced the shell/runtime service-worker cache to v9.

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
- Advanced service-worker shell/runtime cache migration to v11 and precached the new modal operator module.

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

Extend the conservative Bevel operator beyond its first closed tri-valent corner template: support carefully validated higher-valence endpoint fans and multiple contiguous edges only after cap construction and mitering are proven. Add segments/profile shaping later. Keep boundary, concave, non-planar, non-manifold and ambiguous cases non-destructive. Loop Cut pole splitting remains a separate research item.


## v0.1.14 Bevel Increment

- Replaced the `Ctrl+B` placeholder with a transactional one-edge Bevel preview.
- Supported envelope: exactly one interior manifold edge; both endpoints have exactly three incident faces and three manifold incident edges; all four affected faces are simple, planar and convex.
- The operator inserts four offset vertices, trims the two adjacent faces and both endpoint corner faces, adds one bevel strip face, compacts removed source vertices, and selects the four new bevel perimeter edges.
- Width is a normalized factor (0.01–0.95) of 45% of the shortest neighboring edge. Preview rebuilds always start from the immutable source mesh; Enter records one undo step and Esc/right-click restores the complete scene snapshot.
- Candidate topology must pass the read-only topology validator before it can replace the source mesh. Boundary, non-manifold, invalid, concave, non-planar, extraordinary and ambiguous neighborhoods are rejected without mutation.
- Added core and modal regression tests for successful cube-edge bevels, distance bounds, invalid factors, boundary/non-manifold edges, extraordinary fans, preview updates, cancellation and one-step undo records.
- Advanced the service-worker shell/runtime cache migration to v14.


## v0.1.15 Multi-Edge Bevel Increment

- Extended the bevel core to accept one to eight selected edges. The existing single-edge implementation remains the primitive operation; each selected edge is resolved on a temporary candidate and processed sequentially.
- Multi-edge eligibility is preflighted before any source mutation. Selected neighborhoods must have distinct endpoints, four distinct affected faces per edge, and no shared affected faces or offset edges. Every edge remains subject to the existing closed manifold, planar, convex and tri-valent checks.
- Duplicate-coordinate endpoint references and ambiguous regenerated edges are rejected rather than guessed. The combined temporary mesh is topology-validated and all bevel perimeter edges are selected before commit.
- Updated Bevel modal preview, numeric entry, undo and status reporting to support multi-selection with one transactional preview and one undo record.
- Added regressions for two separated bevel neighborhoods, touching-edge rejection, shared-face rejection and multi-edge modal confirmation.
- Advanced service-worker shell/runtime cache migration to v15.

## v0.1.16 Contiguous Bevel Safety Guard

- Made the contiguous-edge rejection explicit in the core operator. Selecting edges that share an endpoint now returns a clear unsupported-operation reason before any candidate can replace the source mesh.
- Added a modal regression proving that a contiguous selection cannot alter the live mesh or create an undo record.
- Advanced service-worker shell/runtime caches to v16 so clients receive the updated guard and UI guidance.
- A miter prototype was not accepted: candidate face construction did not consistently pass manifold winding and planarity validation. No contiguous bevel functionality is claimed in this increment.


## v0.1.17 Two-Edge Contiguous Bevel Miter

- Added a transactional connected Bevel path for exactly two adjacent edges that share one closed, tri-valent corner. Longer connected selections and branches are rejected before mutation.
- Intersects the two offset lines in their shared face to construct a common miter point, then builds two joined bevel-strip quads sharing one manifold miter edge.
- Rebuilds the candidate from the immutable source, compacts it, validates complete topology, confirms every face triangulates, and verifies the affected source faces and new bevel strips remain planar and convex before replacing the source mesh.
- Preserves the existing one-edge bevel and up-to-eight pairwise-disjoint bevel paths. The modal preview supports adjustment, cancellation and one-step undo for the connected pair.
- Added regression coverage for all 24 adjacent edge-pair orientations on a cube, a skewed planar geometry case, longer-chain/branch rejection, preview cancellation, and single-transaction commit.
- Advanced service-worker shell/runtime cache migration to v17.
- This scoped implementation supersedes the v0.1.16 blanket guard only for a selection of exactly two adjacent edges at one closed tri-valent corner.


## v0.1.18 Multiple Independent Miter Junctions

- Extended connected Bevel to accept two to four independent two-edge miter pairs (up to eight selected edges) in one modal preview and one undo transaction.
- Selected-edge components are grouped by shared endpoints. Connected selections are accepted only when every component is exactly one two-edge pair; longer chains, branches, mixed pair/single selections and shared endpoints between pairs remain unsupported.
- Preflights every pair against the immutable source, requires closed valence-three endpoint fans and disjoint affected-face neighborhoods, and resolves later pairs by unique source endpoint coordinates after each temporary rebuild.
- Applies each miter to one temporary candidate, validates the complete combined topology and all perimeter edges, then commits the candidate once. Pair neighborhoods that overlap or become ambiguous are rejected without changing the source mesh.
- Added regression coverage for four independent miter junctions in one operation, overlapping-neighborhood rejection, and modal preview/one-step undo across multiple junctions.
- Updated desktop/mobile bevel guidance and advanced service-worker shell/runtime cache migration to v18.

## v0.1.19 Three-Edge Connected Bevel Chain

- Added a transactional three-edge Bevel path. The selected edges must form one simple path across four distinct vertices, with two degree-two internal junctions and two terminal endpoints; branches, cycles, mixed disconnected selections and longer chains are rejected.
- Constructed one shared-face miter at each internal vertex by intersecting the two selected-edge offset lines. Each of the three bevel strips is rebuilt into the shared candidate, while the two terminal corner faces are trimmed to serve as closed end caps.
- Requires closed, consistently wound, tri-valent fans at all four path vertices and simple planar convex affected faces. Boundary, non-manifold, higher-valence, concave/non-planar, excessive or ambiguous miter cases reject before source mutation.
- Candidate topology is compacted and checked for manifold/winding validity, zero boundary edges, successful triangulation, planar/convex affected faces and strips, two shared manifold miter edges, and the complete selected perimeter before commit.
- The modal reuses the immutable-source preview path and records one undo operation for the full chain. Existing single-edge, two-edge, independent-pair and independent-single-edge bevel paths remain available.
- Added regressions for 48 three-edge path orientations on a cube, skewed geometry, reversed selection order, branch/cycle/four-edge-chain rejection, and modal preview/commit/cancel/undo.
- Updated bevel guidance and advanced service-worker shell/runtime cache migration to v19.

## v0.1.20 Bevel Segments and Profile Shaping

- Added a segment count of 1–8 to all validated bevel paths: one edge, one connected two-edge miter, a three-edge/four-vertex chain with two miters and two terminal caps, independent miter pairs, and independent single edges.
- Multi-segment bevel strips are divided into intermediate cross-section rows and emitted as two triangles per segment. A shared-edge split cache ensures adjacent strips reuse identical vertices along connected miter boundaries.
- Added a profile control from 0 to 1. Profile 0 bends intermediate points inward (concave), 0.50 is the default rounded profile, and 1 bends them outward (convex). Profile points are projected into the adjacent terminal cap planes; shared miter seams remain straight to preserve welded connectivity. Profile has a geometric effect only when segment count is greater than one.
- Added desktop `+`/`-` segment controls and `[`/`]` profile controls (Shift for 0.01 fine profile steps), plus mobile +/- controls for both values. Amount preview, cancel, confirm and one-step undo remain transactional.
- Segmented candidates are built on a private mesh copy, require closed two-face cross-section edges, preserve cap boundaries, recover the full selected bevel perimeter and pass topology/triangulation validation before replacing the source. Unsupported selections fail without source mutation.
- Added regression coverage for concave/rounded/convex profiles, segmented single/pair/three-edge/multi-pair/multi-single bevels, skewed chains, invalid controls, shared miter rows and modal preview/commit/cancel. Full suite: 76 tests passing.
- Advanced service-worker shell/runtime cache migration to v20.

## v0.1.21 Connected Bevel Chains

- Generalized connected Bevel from exactly three selected edges to one simple path of three to eight consecutive edges. The path must contain exactly two degree-one endpoints, all remaining path vertices must have degree two in the selection, and no selected path vertex may repeat; branches, cycles and mixed connected/disconnected selections reject.
- The shared-face miter construction now iterates across every internal path vertex. Every path vertex must still have a closed, consistently wound, tri-valent fan; the two terminal corner faces remain the closed end caps. All miters, affected faces, bevel strips and the full perimeter are validated on a private candidate before replacement.
- Existing multi-segment/profile shaping works unchanged on longer paths, sharing each split miter edge and preserving the two terminal cap planes. Modal preview/confirm/cancel remains one transaction and one undo record.
- Added exhaustive cube regressions for all 360 simple paths of four, five, six and seven edges, plus a segmented eight-edge pentagonal-prism chain. These verify reversed selection order, shared miter counts, end-cap closure and zero boundary/non-manifold edges. Added a segmented four-edge chain test, four-edge modal commit test, and a closed valence-four octahedron rejection test that verifies the source is unchanged.
- Full regression suite: 80 tests passing. Higher-valence miter fans remain unsupported because they need a dedicated cap-patch construction rather than the single third-edge closure used by the current tri-valent template.
- Advanced service-worker shell/runtime cache migration to v21.

## v0.1.22 Valence-Four Connected Miter Cap Patches

- Extended connected three-to-eight-edge Bevel chains to accept closed valence-four internal junctions while keeping both chain endpoints restricted to closed tri-valent fans. Internal fans remain limited to tri-valent or valence-four; higher valences are rejected before mutation.
- At a valence-four junction, the two selected edges still resolve one shared-face miter. The two non-shared adjacent faces supply distinct cap-side cut points; the operator adds one triangular cap patch spanning the miter and those cut points.
- The cap patch winding is selected only when exactly one orientation opposes all three existing boundary half-edges. Missing, multiply incident or inconsistently directed boundaries reject safely. The final candidate must pass topology/winding checks, triangulation and planar/convex validation for affected faces, cap patches and bevel strips.
- Multi-segment/profile bevel subdivides the new cap-patch boundaries through the existing shared edge split cache. This keeps segmented strips welded to the cap triangles and preserves one modal undo transaction.
- Added a closed mixed-valence fixture (tri-valent endpoints with valence-four internal corners), eight reversed/unreversed chain-orientation regressions, a four-edge chain containing both valence-four and tri-valent internal fans, all 1–8 segment counts in a rotated frame at concave/convex profile extremes, and modal commit/cancel/undo tests. The closed valence-four octahedron remains rejected because its terminal fans are also valence-four.
- Full regression suite: 86 tests passing. Advanced service-worker shell/runtime cache migration to v22.

## v0.1.23 Valence-Five/Six Connected Miter Cap Patches

- Extended connected three-to-eight-edge Bevel chains to accept closed internal valence-five and valence-six fans. Chain endpoints remain restricted to closed tri-valent fans; internal valence seven and above reject before source mutation.
- For each internal junction, resolves the unique shared-face sector in `orderedVertexFan`, then offsets every non-selected edge along the ordered opposite fan arc. The cap boundary includes the shared miter and all ordered fan cut points, so no intermediate pole edges remain exposed.
- Valence-four boundaries remain one triangle. Valence-five/six cap boundaries are accepted only when one orientation opposes every existing boundary half-edge and the projected boundary is simple and convex. The patch uses an interior center vertex and one triangle per boundary edge; each triangle is planar, while warped patch boundaries are safely represented as a piecewise-planar patch.
- Valence-five/six multi-segment profile amplitude is scaled to 25% to avoid foldovers on the denser fan geometry. The modal status note identifies when this conservative scaling is active. Valence-three/four profile behavior remains unchanged.
- Added valence-five and valence-six mixed-fan fixtures, reversed path selection, all 1–8 segment counts with concave/convex profile extremes in rotated geometry, explicit valence-seven non-mutation rejection, and modal preview/commit/undo/cancel coverage.
- Full regression suite: 91 tests passing. Service-worker shell/runtime cache migration advanced to v23.


## v0.1.24 Valence-Four Through Valence-Six Terminal Cap Patches

- Extended connected three-to-eight-edge Bevel chains so both terminal endpoints, as well as internal junctions, accept closed valence-three through valence-six fans. Single-edge and exactly two-edge miter templates retain their existing tri-valent limits.
- At a high-valence endpoint, the bevel strip end edge and the ordered opposite fan arc define a terminal cap boundary. Every non-flanking fan edge receives one shared cut point; valence four produces a triangular patch, while valence five/six use a center-fanned triangulated patch.
- Terminal cap winding is accepted only when exactly one boundary orientation opposes all existing half-edges. Boundaries must be complete and unique; projections must be simple and convex; each patch triangle, affected source face and bevel strip is checked before the candidate can replace the source.
- Terminal cap edges reuse the same segmented edge-split cache as internal patches, keeping profiles welded to the strips. If any chain vertex is valence five or six, segmented profile amplitude is scaled to 25%. The modal only displays the limiter once multiple segments are active.
- Added fixtures for valence-four, -five and -six endpoints; both-ended valence-six chains; reversed path order; rotated geometry; every segment count from 1–8 with concave/convex profile extremes; valence-seven endpoint rejection without mutation; and modal commit/undo/cancel.
- Full regression suite: 95 tests passing. Service-worker shell/runtime cache migration advanced to v24.

## v0.1.25 Irregular Mixed-Fan Bevel Regression Matrix

- Added a combined closed-chain fixture that independently selects terminal and internal fan valences from four through six.
- Added the full 3×3 terminal/internal valence pairing matrix at 1, 4 and 8 segments under non-axis-aligned rotation, with both forward and reversed path order. Each successful case checks profile scaling, cap closure, manifold edges and consistent winding.
- Added nine strongly skewed affine cases across the same valence pairings. The current candidate can produce a non-planar face under this geometry; every case must reject during candidate validation and preserve the original positions, faces and edge selection exactly.
- No Bevel operator or runtime code changed. Direct execution against the current HalfEdgeMesh module completed 27 supported cases and nine non-destructive skew rejections. The complete Node test suite was not run in this agent environment; both new Node regression tests are included for the repository's existing test command.

## v0.1.26 Desktop/Mobile Browser Regression Protocol

- Added `tests/BROWSER_REGRESSION.md` with reproducible desktop and Android Chrome checks for startup, viewport navigation, edge selection, Bevel modal controls, cancellation, commit and undo.
- Updated the documented Pages deployment baseline to v0.1.25 commit `8931a2d863961477b2321e107c3f27575775a3ea`; GitHub Actions Pages run #33 completed successfully.
- Documentation-only update. No application runtime, operator, workflow, dependency or configuration changes.
- Real desktop/mobile execution remains pending; a successful Pages deployment is not evidence of pointer/touch interaction correctness.

## v0.1.27 Continuous Mobile Region Selection

- Replaced five fixed samples across each projected mesh edge with segment/region intersection intervals for Box, Circle brush and Lasso selection. Visibility ray checks are still applied at multiple positions inside the actual overlap interval, so hidden edges remain excluded.
- Added `src/core/ScreenRegion.js` and six Node regressions for narrow crossings, circle-brush corner hits, lasso crossings, multi-edge L-corners, reverse box drags and invalid gestures.
- Bumped the service-worker shell/runtime cache to v25 and precached the new helper module.
- No Bevel topology policy changed. Bevel remains edge-selection based: exactly two adjacent edges may form a corner miter; longer connected selections must form one simple path. Three edges radiating from one vertex are a branch and must reject safely. Vertex-only Bevel is not implemented.
- User-reported mobile results on v0.1.26: startup, navigation, preview controls, cancel, apply and undo/redo passed; region selection was partial (straight edge worked, corner/multi-edge selection did not).
- User retested the deployed v0.1.27 build and confirmed the mobile corner and multi-edge region selection issue is fixed. Device model, OS and browser/version were not supplied. Branch-rejection behavior was not explicitly reported as tested.
- v0.1.27 deployed as `main` commit `34388f2edf4c243aacdc4bd7a934ca3775aa6bde`; GitHub Pages run #35 completed successfully.

## v0.1.28 Mobile Selection Acceptance Record

- Updated the browser regression record with the user-confirmed v0.1.27 mobile selection pass. The earlier mobile startup, one-/two-finger navigation, Bevel preview controls, cancellation, apply and undo/redo checks remain recorded as passing from v0.1.26; the selection correction was separately confirmed after v0.1.27 deployment.
- Expanded the desktop browser checklist to explicitly verify Circle corner picking, narrow Box/Lasso intersections, L-shaped multi-edge selection, reverse-direction drag and branch rejection without source mutation.
- Documentation-only checkpoint. No runtime, topology, workflow, dependency or configuration changes. No desktop browser run has been claimed.

## v0.1.29 Transactional Extrude and Inset

- Added `src/operators/FaceOperationModal.js` for immutable-source Extrude and Inset preview sessions. Pointer drags are anchored to the actual pointer-down that begins the drag, avoiding stale movement inherited from the prior face-selection tap or side-panel click.
- Extrude supports one selected face or one connected planar face region with a single simple boundary. Positive and negative distances are supported; unsupported/disconnected regions and topology-invalid candidates are rejected without replacing the source.
- Inset supports exactly one selected face using the current center-based scaling method. It is not a constant-width offset inset; multi-face Inset is explicitly rejected rather than creating disconnected islands.
- Added numeric input, drag adjustment, arrow-key nudging, mobile numeric-pad support, Enter confirm, Escape/right-click cancel and one undo transaction per committed operation.
- Added ten modal tests covering immutable preview, negative distance, connected-region Extrude, single-face Inset, safe multi-face/disconnected rejection, numeric limits, cancel/confirm and drag anchoring.
- Bumped the service-worker shell/runtime cache to v26 and precached the new modal module.
- Full Node regression command passed: 113 tests, 0 failures. JavaScript syntax checks passed. Real browser/Android testing of the new face operations remains pending.
- User-confirmed v0.1.27 mobile startup/navigation/Bevel/undo checks and corner/multi-edge selection pass remain recorded. Desktop browser testing is deferred at the user's request and does not block continued modeling work.
- The latest deployed baseline before this package is v0.1.28, `main` commit `ca867f1fc301479447b22575d5292519fd8d6f73`, Pages run #36 succeeded.

## v0.1.30 Connected Planar-Region Inset

- Added `HalfEdgeMesh.insetSelectedRegion(amount)` for one face or one connected, consistently wound, coplanar face region with a single simple boundary. The amount is a fraction of the shortest boundary edge and is converted to one constant inward offset distance.
- Replaced per-face center scaling in the face-operation modal with a single shared region offset. Each boundary vertex is duplicated once; one mitered ring quad is created per boundary edge; the selected inner faces retain their original internal edge topology and remain selected.
- Added shared 2D line-intersection miter joins, projection/reconstruction for arbitrary face planes, source planarity/winding checks, and validation of every inner face, ring quad, inner boundary and complete candidate mesh before source replacement.
- Simple concave regions are accepted only while the inset remains inside the source region and the inner boundary remains simple with preserved winding. Disconnected regions, holes/multiple loops, non-planar or inconsistent faces, nearly reversed corners, excessive miters, self-intersections and collapsed candidates reject without changing positions, faces or selection. Open planar sheets are supported and preserve their outer boundary status.
- Updated `FaceOperationModal` and the legacy `MeshOperators.inset` wrapper to use the new region operator. Inset preview/cancel/confirm/numeric/drag and one-step undo remain transactional.
- Added eleven core geometry tests covering constant-offset square corners, connected two-face regions/shared seams, concave L-shaped regions, rotated-plane world-distance consistency, reversed winding, disconnected selections, holes, collapsing offsets, excessive miters, non-planar faces and invalid/empty selections. Updated modal regressions for successful connected-region Inset, connected-region cancellation/commit and safe disconnected rejection.
- Updated mobile/desktop regression instructions, README and handoff. Advanced the service-worker shell/runtime cache to v27.
- Full Node regression command passed: 126 tests, 0 failures. All source/test JavaScript files and the service worker passed syntax checks. Real Android/desktop browser testing of connected-region Inset remains pending.
- Desktop browser testing remains deferred at the user's request and is not treated as a development blocker. New Inset tests are automated only; Android/desktop browser behavior still requires later device validation.

## Next Roadmap Step

Continue operator development without waiting for desktop access. Next prioritize Face Select ergonomics and connected-region operations: validate multi-face Extrude on concave and non-axis-aligned planar regions, test connected-region Inset on Android, then design a safe face-region Bevel/loop tool boundary model. Keep unsupported selections non-destructive. The confirmed mobile region-selection behavior must remain intact. Desktop Chrome/Edge regression remains deferred until the user can access a PC; do not claim desktop acceptance before that run. Loop Cut traversal through extraordinary poles remains a separate research task.


## v0.1.31 Validated Concave and Rotated-Plane Extrude

- Replaced the direct, in-place Extrude builder with `HalfEdgeMesh.extrudeSelectedRegion(distance)`. The complete candidate is constructed privately and only committed after source validation, boundary/plane checks, candidate topology validation and face triangulation all pass.
- Extrude direction now comes from the selected region boundary's Newell normal. This avoids cancellation and direction errors from averaging per-face normals, particularly for concave multi-face regions and tilted planar geometry.
- Supports one face or one connected, consistently wound, coplanar face region with one simple boundary. Concave L-shaped regions retain their continuous top faces and shared interior seams while creating one side wall per boundary edge. Positive and negative distances remain supported.
- Disconnected selections, holes/multiple boundary loops, invalid face selections, non-planar/inconsistently wound source geometry and distances outside the modal/operator range reject without changing positions, faces or selection. The legacy `extrudeSelected()` boolean API remains supported and now delegates to the validated implementation.
- Updated the modal and legacy `MeshOperators.extrude` wrapper to consume validated result details, including world-space normal, boundary count and distance. Preview still starts from an immutable source and cancel/confirm remains transactional.
- Added seven core geometry regressions for concave L-region extrusion, rotated-plane direction and displacement, reversed winding, disconnected regions, holes, invalid distance/selection mode, and boolean API compatibility. Added two modal regressions for concave preview/cancel and rotated concave commit/undo metadata.
- Updated README, browser regression instructions and this handoff. Advanced the service-worker shell/runtime cache to v28.
- The v0.1.31 package was applied as `main` commit `99d70bc520372ea72bac5ec1ec249d19e81371d1`; GitHub Pages workflow run #39 succeeded.
- Full Node regression command passed: 135 tests, 0 failures. All source/test JavaScript files and the service worker passed syntax checks. Automated geometry results do not replace Android browser testing. Desktop Chrome/Edge testing remains deferred at the user's request.

## Next Roadmap Step

Continue without waiting for desktop access. The next acceptance focus is Android verification of connected-region Inset and concave multi-face Extrude, including preview, cancel, apply and Undo/Redo. Then design a safe face-region Bevel/loop boundary model with shared boundary extraction and explicit treatment of concave corners, non-planar regions, holes and multiple loops. Keep unsupported selections non-destructive. Desktop Chrome/Edge regression remains deferred until the user can access a PC; do not claim desktop acceptance before that run.


## v0.1.32 Shared Face-Region Boundary Analysis

- Added `src/core/FaceRegionBoundary.js` and `HalfEdgeMesh.analyzeFaceRegion()` as a read-only, shared boundary source for future face-region operators. It extracts every ordered boundary loop and selected-face connected component rather than assuming a region is one polygon.
- Planar regions classify nested loops as outer boundaries or holes and identify region-facing convex, reflex/concave and collinear corners. Non-planar regions keep their topological loops but are explicitly marked geometrically unclassified.
- Invalid face IDs, malformed faces, non-manifold selected edges, inconsistent shared-edge winding and branched/touching boundaries reject with explicit reasons. Analysis never changes positions, faces or selection.
- Routed current Extrude and Inset through the shared analyzer while preserving the legacy `boundaryForRegion()` single-loop API for existing Dissolve/operator callers. Existing one-simple-boundary constraints remain; holes, multiple loops, disconnected selections and non-planar regions still reject non-destructively.
- Added ten geometry regressions for convex and concave loops, annular holes, disconnected islands (including nested but independent islands), non-planar regions, inconsistent winding, non-manifold edges, reversed face winding and invalid selection IDs.
- Added the new module to the service-worker shell and advanced cache migration to v29. Updated the browser regression handoff and README.
- Full Node regression command passed: 145 tests, 0 failures. All source/test JavaScript files and the service worker passed syntax checks. Browser/device verification of the v0.1.31 face operations remains pending; this analyzer increment has no new browser UI.
- The v0.1.32 package was applied as `main` commit `6a385cb7af45bc70b2c93aaed53c6f357d95a26e`; GitHub Pages workflow run #40 succeeded.

## v0.1.33 Transactional Convex Face-Region Bevel

- Added `HalfEdgeMesh.bevelSelectedFaceRegion({ amount })`, using the shared `analyzeFaceRegion()` result as the boundary source. The first supported envelope is one connected, consistently wound, planar region with exactly one simple boundary and only convex/collinear region-facing corners.
- The operation builds a private candidate: the selected patch is raised along the analyzer's world-space normal by the computed width, its boundary is offset inward, and one mitered transition wall is constructed per boundary edge. Existing internal selected-face seams remain welded.
- The complete candidate must pass topology validation, triangulation, wall planarity, simple-boundary and convexity checks before it can replace the source. Reflex/concave corners, holes, multiple loops, disconnected selections, non-planar regions, inconsistent/invalid input, zero/invalid amounts and excessive miters reject without mutation.
- Integrated Face Bevel into the existing transactional `BevelModal` and `Ctrl+B` / Edit Mesh panel command. It supports drag/numeric amount adjustment, preview, Cancel, one-step Confirm/Undo and Undo/Redo. The existing Edge Bevel path and its segment/profile controls remain unchanged; Face Bevel uses one transition segment, couples height to width and has no profile shaping.
- Added `tests/FaceRegionBevel.test.js` for convex single-face and connected multi-face regions, welded internal seams, rotated planes, reversed winding, concave/hole/disconnected/non-planar/acute-miter rejection, invalid values, modal preview, numeric limits, cancel restoration and one-step commit.
- Added Face Bevel to the PWA shell/UI guidance, updated browser regression instructions, and advanced the service-worker shell/runtime cache to v30. No workflow, dependency, secret, API or backend changes.
- Full Node regression command passed: 159 tests, 0 failures. Source/test JavaScript and service-worker syntax checks passed. Real Android browser acceptance of Face Bevel and the prior v0.1.31 Inset/Extrude remains pending; desktop Chrome/Edge is still deferred.
- The v0.1.33 package was applied as `main` commit `b12c14eca2ad0054a86a1b1a439fef8e92c35291`; GitHub Pages workflow run #41 succeeded.

## v0.1.34 Validated Reflex/Concave Face Bevel

- Extended `HalfEdgeMesh.bevelSelectedFaceRegion({ amount })` to accept region-facing reflex/concave corners when the inward offset remains inside the source polygon, preserves winding, remains simple and stays inside the guarded miter envelope.
- Kept the same private-candidate transaction: every generated top face and perimeter wall must triangulate; the complete mesh must pass topology validation; every transition wall must remain planar, simple and convex before source replacement.
- Added support coverage for a concave L-shaped three-face region and a U-shaped seven-face region with two reflex corners. Both preserve shared internal seams and pass topology checks. Rotated-plane and reversed-winding concave fixtures also pass.
- Added a near-acute reflex notch regression proving excessive miter candidates reject without changing positions, faces or selection. Existing hole, multiple-loop, disconnected, non-planar, invalid amount and convex acute-corner rejections remain.
- Added modal coverage for concave preview, amount update, Cancel restoration, one-step Confirm and undo transaction metadata. Face Bevel reports the number of reflex corners in its live readout and completion toast.
- Updated README and browser regression steps to test supported concave L/U regions and excessive-miter rejection. Advanced service-worker shell/runtime cache migration to v31. No workflow, dependency, secret, API or backend changes.
- Full Node regression command passed: 163 tests, 0 failures. All source/test JavaScript, service worker and inline app-script syntax checks passed. Android browser acceptance remains pending; desktop Chrome/Edge remains deferred.
- This v0.1.34 package is prepared for upload; the current deployed baseline is v0.1.33, `main` commit `b12c14eca2ad0054a86a1b1a439fef8e92c35291`, Pages workflow run #41 succeeded.

## v0.1.35 Multi-Segment/Profile Face Bevel and Modal Input Recovery

- Extended `HalfEdgeMesh.bevelSelectedFaceRegion({ amount, segments, profile })` to support one through eight transition segments. Each boundary vertex receives shared intermediate row vertices, while the selected top-face topology and all internal seams remain welded.
- Added a monotonic cubic-Bezier cross-section: profile `0` is concave, `0.50` is rounded and `1` is convex. Every row is rebuilt from the immutable source; the complete mesh must pass topology validation and triangulation, and every transition quad must remain planar, simple and convex before atomic source replacement.
- Face Bevel keeps its current width-to-height coupling. No independent height control is claimed in this increment. Unsupported acute/excessive miter, hole, multiple-loop, disconnected, non-planar and folded/self-intersecting candidates still reject without mutation.
- Enabled the same 1–8 segment and 0–1 profile controls in Face Bevel's modal, desktop keyboard (`+`/`-`, `[`/`]`, Shift for fine profile) and mobile numeric pad rows. Confirm still records one undo entry; Cancel restores the full source snapshot.
- Fixed the reported post-modal viewport recovery issue: Bevel, Extrude/Inset and Loop Cut now return the selection gesture to Click Select on both Confirm and Cancel. This prevents a previously active Box/Circle/Lasso tool from intercepting the next touch drag that should orbit the view.
- Owner reports Android checks 1–9 for v0.1.31 connected Inset/concave Extrude and v0.1.33/v0.1.34 Face Bevel passed. The post-operation viewport gesture check was recoverable only after manually switching to Object Mode or Edit Mode → Click Select. The v0.1.35 automatic Click Select reset is a code fix pending fresh device verification; it is not reported as tested yet. Desktop Chrome/Edge remains deferred.
- Added geometry/modal regressions for 1–8 segments, all three profile endpoints/default, concave L/U regions, rotated/reversed winding, welded internal seams, invalid segment/profile ranges and cancel/commit transaction behavior. Updated mobile regression steps and cache migration to v32. No workflow, dependency, API, secret or backend changes.
- Full Node regression command passed: 168 tests, 0 failures. All source/test JavaScript files and the service worker passed syntax checks; the inline application script passed syntax validation. The owner later confirmed the segment/profile controls and automatic post-modal Click Select recovery on Android. The uploaded v0.1.35 package is deployed as `main` commit `8b78b7eb4b9cd0bbee42ee372064f41bb5dabc3b`; Pages workflow run #43 succeeded on 2026-11-27.
- After that deployment, the owner explicitly reported Pass for segment controls, profile controls and immediate post-modal navigation (tests 1–3). The additional multi-row/multi-column planar grid case was separately reported as failing and is corrected in v0.1.36.

## Next Roadmap Step (recorded at v0.1.35)

Decouple Face Bevel height from width. Preserve the new 1–8 segment/profile cross-section and expose a separately adjustable height parameter with its own numeric/drag behavior and clear readout. Rebuild each preview from immutable source data, keep the inner boundary offset and extrusion height independently parameterized, and reject any candidate with inverted, folded, non-planar, self-intersecting or non-manifold transition walls. Preserve one-step Confirm/Undo and full Cancel restoration. The v0.1.35 automatic Click Select recovery must be retested on Android alongside segment/profile controls; do not claim the post-modal gesture issue closed until the user confirms. Desktop Chrome/Edge regression remains deferred; Loop Cut traversal through extraordinary poles remains separate research. This height-decoupling step was implemented in v0.1.36.


## v0.1.36 Multi-Grid Face Bevel and Independent Height

- Fixed Face Bevel on planar regions arranged in more than one row and one column. The selected top faces replace their original interior vertices with raised copies; the old interior source vertices are now compacted from the private candidate only when topology diagnostics report them as isolated. Candidate face ordering and selection IDs remain stable, and normal single-face candidates retain their previous vertex ordering.
- Added automated 2×2, 3×2 and 3×3 planar-grid regressions at multiple segment counts. They verify connected selection, welded internal seams, zero isolated vertices, full topology validity and triangulation of every resulting face.
- Added `heightAmount` independent of `amount` to the Face Bevel core. Both factors range from 0.01–0.95 of 45% of the shortest selected-region boundary edge; existing width behavior remains unchanged and the default height initially matches width.
- Added Face Bevel height controls to the modal: `H` switches the active drag/numeric parameter between width and height; arrow/nudge and viewport drag adjust the active parameter; the Android numeric pad provides direct height increments plus an Edit Width/Height input toggle. Live readout and completion toast report world-space width and height. Edge Bevel remains unchanged.
- Preserved transactional candidate rebuilding, segment/profile settings, Cancel restoration and one-step Confirm/Undo. Invalid height factors, excessive miters, holes, disconnected selections and non-planar regions remain non-destructive rejections.
- Owner-reported Android v0.1.35 checks: segment controls, profile controls and immediate post-modal viewport navigation all passed. The owner later confirmed that the v0.1.36 multi-grid Face Bevel fix works. The owner asked for per-selected-face adjustment; that UX is implemented in v0.1.37 and awaits Android verification. A connected sphere patch is handled as separate panels in Individual Faces mode only when each source polygon is independently planar; a continuous curved transition is not yet implemented. Desktop Chrome/Edge remains deferred.
- Full Node regression suite: 172 tests, 0 failures. JavaScript syntax checks and inline app-script syntax validation passed. No workflow, dependency, API, secret or backend changes. Service-worker shell/runtime cache advanced to v33. The owner subsequently confirmed the multi-grid operation works on Android; per-face control is now addressed by v0.1.37.

## Next Roadmap Step

Research a conservative curved-surface Face Bevel model for smoothly varying adjacent face normals, beginning with small sphere patches. Keep the existing planar-region path as the safe fallback; do not relax the planarity guard until a private candidate with continuous seams, valid transition normals, manifold topology and non-folding walls is proven. Continue desktop regression deferral as requested and verify the v0.1.36 grid/height controls on Android before expanding the curved-surface envelope.

## v0.1.37 Individual Face Bevel Settings

- Added `HalfEdgeMesh.bevelSelectedFacesIndividually()` to bevel each selected polygon independently on one private candidate. Each face is processed through the existing validated single-face Face Bevel path; if any selected face fails, no source geometry or selection is changed.
- Added per-face storage for width, height, segment count and profile. In the modal, press `I` to switch Connected Region / Individual Faces; mobile provides the equivalent mode button. In Individual mode, use PageUp/PageDown on desktop or the mobile previous/next face controls to target one face and edit only its values.
- Connected non-planar or otherwise non-single-region selections automatically enter Individual mode when each selected polygon independently passes the planar, simple-boundary and topology validators. Planar connected selections still start in Connected Region mode and preserve welded internal seams.
- Individual Faces mode intentionally creates separate raised panels: the top faces do not share an inner seam, and each selected face receives its own perimeter transition. Adjacent panels meet along the original shared base edge as a groove. This is not continuous curved-surface Bevel; smooth shared-normal transitions remain a separate research task.
- Switching back to Connected Region mode requires every per-face setting to match and the complete combined region candidate to validate. Cancel restores the full source snapshot; Confirm records one undo entry for the complete batch.
- Added geometry/modal tests for adjacent differently oriented faces with distinct settings, atomic rejection when one face is invalid, automatic modal fallback for connected non-planar selections, independent per-face control editing, previous/next target value restoration, planar-region mode switching, one-step commit and full Cancel restoration.
- Updated README and Android/desktop regression instructions. Advanced service-worker shell/runtime caches to v34. No new API, AI service, dependency, secret, workflow or external configuration.
- Full Node regression command passed: 177 tests, 0 failures. Source/test JavaScript and service-worker syntax checks plus the inline app script syntax check passed. Real Android acceptance of the new Individual Faces mode is pending; the owner has already confirmed the v0.1.36 multi-grid fix works. Desktop Chrome/Edge remains deferred.
- The current deployed baseline is v0.1.37, `main` commit `f2f6befcb6b6935aa1f2f02b43b504e8d0fd2224`, Pages workflow run #45 succeeded on 2026-11-27.


## v0.1.38 Mobile More Drawer Auto-Minimize

- Added one shared `minimizeMobilePropertiesPanel()` UI helper in `src/main.js`. When a modal adjustment successfully starts at the existing `max-width: 650px` breakpoint, it removes the properties panel's `mobile-open` state so the drawer slides away from the viewport and numeric adjustment pad.
- Applied the behavior to Face Bevel / Edge Bevel, Extrude, Inset, Loop Cut and G/R/S modal transforms. A failed modal start leaves the drawer untouched. The bottom **More** action still reopens the drawer; after Apply or Cancel it stays minimized until reopened. Desktop layout and panel behavior are unchanged.
- Added Android browser regression step 16 covering drawer auto-close, staying closed after Apply/Cancel, reopening with More, and the same behavior for the other modal adjustments.
- Advanced service-worker shell/runtime caches from v34 to v35 so deployed clients receive the updated main module.
- All JavaScript syntax checks passed and the existing Node regression suite passed: 177 tests, 0 failures. The new drawer behavior still requires the documented Android browser check. No workflow, dependency, API, AI service, secret, backend or external configuration changes. Android acceptance of the new drawer behavior remains pending; desktop Chrome/Edge remains deferred.
- This package is based on the deployed v0.1.37 baseline, `main` commit `f2f6befcb6b6935aa1f2f02b43b504e8d0fd2224`, Pages workflow run #45 succeeded on 2026-11-27.


## v0.1.39 Selection-Aware View Framing

- Added `src/core/SelectionView.js` to choose a viewing direction that maximizes the combined area-weighted projected area of the selected/incident face planes. It samples the view sphere, refines candidate directions against the active face-normal hemisphere and uses the current camera as a tie-breaker so equivalent views do not jump unnecessarily.
- Added `Viewport.frameSelection()` to center the selected region, fit it with object context, calculate transformed world-space polygon normals/areas and orient the perspective camera toward the best available multi-face view. A single selected face or edge keeps the current camera; multiple faces/edges recenter and reorient. Bevel/Loop Cut drag anchors are cleared after a reframe so the next viewport drag starts from its actual pointer.
- Face Bevel and Edge Bevel, Extrude, Inset and Loop Cut capture the immutable source topology before their modal preview replaces the live half-edge mesh, then frame the relevant selected faces or adjacent faces of selected edges. G/R/S transforms and ordinary selection are unchanged.
- For a selection spanning opposing sides (such as all six cube faces), the camera chooses a corner compromise that exposes the greatest combined projected area. A single perspective cannot show every front/back surface simultaneously; orbit remains the inspection tool for hidden sides.
- Added five focused regressions for planar multi-face alignment, two differently oriented faces, a six-sided cube corner view, face-area weighting and safe invalid/empty-normal fallback. Updated browser regression step 17 and README guidance.
- Added the selection-view helper to the PWA app shell and advanced service-worker caches from v35 to v36.
- Full Node regression suite passed: 182 tests, 0 failures. JavaScript syntax checks passed for all source/test files and the service worker. Actual Three.js camera behavior still requires Android browser verification; desktop Chrome/Edge remains deferred. No workflow, dependency, API, AI service, secret, backend or external configuration changes.
- This package is based on deployed v0.1.38, `main` commit `af760c2ea62a6a6a328434995f6218ed55e22752`, Pages workflow run #46 succeeded on 2026-11-27.


## v0.1.40 Individual Face Target Camera Focus

- Corrected the v0.1.39 Android framing gap reported by the owner: whole-selection projected-area scoring could preserve a similar camera angle for balanced/opposing face sets, and Individual Faces Previous/Next target changes did not call the viewport framing path.
- Added an explicit `focusFaceId` path to `Viewport.frameSelection()`. It computes the active source face's transformed world-space normal and bounds, points the camera toward that face and frames it with modest object context, bypassing the multi-selection count guard. The original whole-selection scoring path remains for Connected Region and multi-edge operations.
- Face Bevel now focuses the first active face when it starts in Individual Faces mode. Switching Region/Individual mode frames the new mode's target, and every Previous/Next Face change rotates/recenters on the newly active face. Width, height, segment and profile adjustments leave the camera stable on the active face.
- The focus uses the immutable source `basePositions` / `baseFaces`, not the generated preview topology; camera movement cannot alter geometry, face IDs, per-face settings or undo state. Edge Bevel, Extrude, Inset and Loop Cut retain the v0.1.39 whole-selection framing behavior.
- Added a focused-view regression for an active face overriding a balanced whole-selection direction and expanded Android browser steps to cover eight-face / curved selections, repeated target switching, stable parameter editing, mode toggles and transactional geometry checks.
- Advanced service-worker caches from v36 to v37. No workflow, dependency, API, AI service, secret, backend or external configuration changes.
- Full Node regression suite passed: 184 tests, 0 failures. `node --check --experimental-default-type=module` passed for all 34 JavaScript modules under `src/` and `tests/`, and `node --check sw.js` passed. The owner subsequently confirmed Android Pass for active-face camera focus and Previous/Next target reorientation; desktop Chrome/Edge remains deferred.
- This package is based on deployed v0.1.39, `main` commit `8909d9d4b9e8a9d3c13419bc224d00c0fd68143b`, Pages workflow run #47 succeeded on 2026-11-27.


## Next Roadmap Step

The owner confirmed v0.1.40 active-face camera focus works on Android. The owner then confirmed all six v0.1.41 Android checks passed for a small selected sphere patch; this does not imply whole-sphere support. v0.1.42 adds local intersection screening as the next conservative safety step; Android retest of this screening update remains pending.

## v0.1.41 Conservative Continuous Curved-Surface Face Bevel

- Added `HalfEdgeMesh.bevelSelectedCurvedFaceRegion()` as a separate transactional operator for one connected non-planar selected patch with one simple projected boundary. It is intended for small smooth patches such as a low-poly UV-sphere cap; planar regions continue to use the existing Connected Region path.
- Computes area-weighted face normals and area-weighted smooth vertex normals from the source mesh. Adjacent face pairs touching the selection must remain within 55°; vertex-normal coherence and the selected patch's aggregate normal must also remain stable. Sharp creases, ambiguous normals, disconnected regions and holes reject before source mutation.
- Offsets each shared selected vertex once along its smooth normal. Boundary vertices receive a shared tangent-plane miter offset derived from the incoming/outgoing boundary tangents. Each selected source polygon is triangulated before raising so a warped raised quad is never silently retained.
- Builds the transition band from the original boundary to the inset/raised boundary using the existing 1–8 segment cubic-Bezier profile. Every transition quad is split into two triangles using the shorter diagonal; raised top-triangle orientation, transition outward orientation, complete candidate topology and triangulation are validated before atomic source replacement.
- Face Bevel auto-selects **Continuous Surface** for a structurally eligible curved patch when the curved candidate passes validation. If it does not, it falls back to existing **Individual Faces** when every polygon can be beveled separately. The mode button / `I` key switches Continuous Surface and Individual Faces on curved patches; planar selections retain Region / Individual Faces. Independent per-face settings are not silently merged when switching to a shared operation.
- Added eight initial regressions covering spherical-cap patch geometry, welded top seams, 1–8 transition segments/profile endpoints, preserved planar Region behavior, sharp-crease rejection plus safe modal fallback to Individual Faces, invalid controls, modal preview/commit/undo and Continuous Surface ↔ Individual Faces switching/Cancel restoration. The owner subsequently confirmed all six documented Android acceptance checks for the tested small sphere patch; the whole sphere was not tested and remains outside the supported envelope.
- Full Node regression command passed: 192 tests, 0 failures. All source/test JavaScript and service-worker syntax checks passed. The owner subsequently confirmed Android acceptance of the small-patch curved transition; desktop Chrome/Edge remains deferred. No workflow, dependency, API, AI service, secret, backend or external configuration changes.
- Added the curved-surface browser acceptance protocol and updated README/handoff. Advanced service-worker shell/runtime caches from v37 to v38.
- This package is based on deployed v0.1.40, `main` commit `e87ee77ee3fb1e44bec50fbbe08f601be3ba1ab3`, Pages workflow run #48 succeeded on 2026-11-27.

## v0.1.42 Conservative Curved-Bevel Intersection Screening

- Added `trianglesIntersectBeyondSharedTopology()` to detect geometric intersections between two non-degenerate triangles while allowing their expected shared vertex/edge contact. Coplanar overlap is checked in a local 2D projection; non-coplanar intersections are checked through vertex/plane and edge/plane tests.
- After topology/orientation validation, the curved bevel builds triangle records for the complete candidate. A spatial hash / AABB broad phase restricts exact tests to nearby triangles; very large triangles use a bounded overflow path. Every changed raised-top or transition triangle is checked against the remaining candidate, including other changed triangles. A detected crossing rejects the private candidate before source replacement.
- Added regressions proving an intentionally crossing detached triangle rejects without changing the source and a distant disconnected triangle does not block the small sphere-patch bevel. Existing welded seams, all 1–8 segment/profile cases, planar separation, sharp-crease fallback and modal transaction tests remain covered.
- The collision screen is deliberately a conservative partial check, not a production BVH, manifold repair or proof that every possible self-intersection/occlusion has been found. It does not broaden the supported curvature envelope. Whole-sphere/high-curvature patches, poles, holes, multiple loops and complex boundaries remain unsupported.
- Advanced service-worker shell/runtime caches from v38 to v39. No dependency, API, AI service, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 194 tests, 0 failures. All source/test JavaScript and service-worker syntax checks passed. The v0.1.41 small-patch Android acceptance is owner-confirmed; Android retest of this additional intersection guard is pending, and desktop Chrome/Edge remains deferred.
- This package is based on deployed v0.1.41, `main` commit `cef724abc2c10ea299626517cfd2bf60682a43b5`, Pages workflow run #49 succeeded on 2026-11-27.

## Next Roadmap Step

The owner deferred a visual Android retest of v0.1.42 because triangle intersections are difficult to inspect on the sphere; the automated collision regressions remain the current evidence for that narrow guard. The next transform step is to add snapping and more accurate pivot behavior without changing the now-working camera-relative G/R/S foundation. Desktop Chrome/Edge remains deferred.

## v0.1.43 Global / Local Transform Orientation

- Added a dependency-free `resolveTransformAxis()` helper that resolves canonical X/Y/Z axes in Global world space or Local space using a normalized quaternion. Invalid quaternions safely fall back to identity; unknown axes reject.
- Modal G/R/S captures the active object's starting world quaternion before preview begins. Axis-constrained Move, Rotate and Scale now use either fixed world axes (Global, the default) or the captured object-local axes (Local). The immutable starting quaternion prevents the local basis from rotating/drifting as Rotate previews are regenerated.
- `,` toggles Global / Local during a modal transform. The mobile numeric pad exposes the same orientation toggle and the modal readout names the active orientation. Shift+axis uses a plane normal from the selected orientation; free camera-plane movement and free camera-oriented trackball rotation are unchanged.
- Local object-mode scale uses the matching object-local scale component. Global axis object scaling retains the existing TRS approximation; snapping and full gizmo feedback remain future work; Edit Mode proportional editing is now available, while exact multi-object pivot aggregation remains future work.
- Added four math regressions for Global-axis invariance, rotated Local axes, orthonormal basis output and invalid-quaternion fallback. Added Android/Desktop browser checks for axis constraints, orientation switching, preview stability, free-drag preservation and transactional Cancel/Apply.
- Full Node regression suite passed: 198 tests, 0 failures. JavaScript syntax checks passed for all source/test modules and `sw.js`. Browser/touch acceptance of the new Global/Local control remains pending; desktop Chrome/Edge remains deferred. No new dependency, API, AI service, secret, backend, workflow or external configuration.
- Added `src/core/TransformOrientation.js` to the PWA shell and advanced service-worker shell/runtime caches from v39 to v40.
- This package is based on deployed v0.1.42, `main` commit `164ecc58a3da02066a139ff26baadd6d72cb23bd`, Pages workflow run #50 succeeded on 2026-11-27.

## v0.1.44 Mobile Transform Apply Pointer Isolation

- Fixed the mobile transform Apply jump in `src/main.js`. The global pointer-move listener previously forwarded every pointer movement to an active G/R/S transform, including the finger's travel from the viewport to the numeric pad. Tapping Apply could therefore change the preview immediately before commit.
- G/R/S pointer updates now run only when the pointer event target is the viewport canvas or one of its descendants. Numeric-pad interaction, moving over other UI, and finger travel outside the viewport no longer alter the preview. Dragging inside the viewport remains unchanged.
- Added Android browser acceptance steps for Move with Global/Local X/Y/Z and YZ/XZ/XY constraints, numeric-pad Apply/Cancel, Edit Mode transforms, and one-step Undo/Redo. Desktop pointer behavior is intended to remain unchanged.
- Advanced service-worker shell/runtime caches from v40 to v41. No API, AI service, dependency, secret, backend, workflow or external configuration changes.
- Source-level inspection confirms the transform pointer path now uses the same viewport-target guard already used by Face Bevel, Extrude/Inset and Loop Cut. The owner subsequently confirmed on Android that Apply preserves the last visible preview for all tested Global/Local axis and plane constraints; desktop Chrome/Edge remains deferred.
- This package is based on deployed v0.1.43, `main` commit `7b03007246da36e6e1548c37cb4249d368253195`, Pages workflow run #51 succeeded on 2026-11-27.

## v0.1.45 Live Move Displacement and Destination Readout

- Added dependency-free `src/core/TransformReadout.js` to report the signed distance along an active constrained axis, the displacement magnitude for free/plane movement, all three world-space delta components, and the resulting world-space target position.
- The mobile Move pad now updates its primary value during viewport dragging instead of remaining at `0`. Axis-constrained movement displays a signed world-unit distance; free and plane movement display the displacement magnitude. Typing a numeric value keeps the typed amount visible while the vector and destination readout update to match the numeric preview.
- Added a compact two-row mobile readout for `Δ X/Y/Z` and resulting `TO X/Y/Z` coordinates. Edit Mode labels the destination as `PIVOT`, because the displayed target is the active selection transform pivot rather than the object's origin. Readout rows stay hidden during Rotate, Scale and other modal operations.
- Added four pure Node regressions for signed axis projection, free/plane displacement magnitude, world-space target coordinates, negative-zero cleanup and invalid-vector fallback.
- Full Node regression suite passed: 202 tests, 0 failures. JavaScript syntax checks passed for all source/test modules and `sw.js`; the new helper has four focused regressions.
- Added `TransformReadout.js` to the service-worker app shell and advanced shell/runtime caches from v41 to v42. No dependencies, API, AI service, secrets, backend, workflow or external configuration changes.
- Browser/Android acceptance of the live readout is pending. Desktop G/R/S behavior and the v0.1.44 Apply pointer isolation are otherwise unchanged.
- This package is based on deployed v0.1.44, `main` commit `eef0db6617ce78abf3b5789460efe9edfd3d1c1c`, Pages workflow run #52 succeeded on 2026-11-27.


## v0.1.46 Live Move Position Coordinate Feedback

- Changed the prominent Move-pad value for axis-constrained movement from displacement distance to the resulting world coordinate on the dominant world component. For example, Global Z now displays the object's final world Z position, including its non-zero starting position. Local-axis moves show the dominant world coordinate and retain the orientation/axis label.
- The viewport modal readout now includes the live destination (`TO X/Y/Z`, or `PIVOT X/Y/Z` in Edit Mode) instead of showing distance alone. The mobile detail rows continue to show all three world-space deltas and destination coordinates.
- Object Mode destination coordinates are read from the object's actual post-preview world transform. Edit Mode reports the selected transform pivot translated by the preview delta. Free/plane Move keeps displacement magnitude as the primary value because it has no single constrained world axis.
- Added two focused regressions for off-origin Global Z destination display and a rotated Local axis's dominant world coordinate. Updated Android browser acceptance to require the live destination coordinate to change while moving on Z and to remain consistent with the viewport readout.
- Advanced service-worker shell/runtime caches from v42 to v43. No dependency, API, AI service, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 204 tests, 0 failures (`node --experimental-default-type=module --test tests/*.test.js`). `node --experimental-default-type=module --check` passed for all 39 JavaScript modules under `src/` and `tests/`; `node --check sw.js` and the inline `index.html` script syntax check also passed. The owner subsequently confirmed the corrected live position feedback works on Android. Desktop G/R/S interaction remains deferred.
- This package is based on deployed v0.1.45, `main` commit `04398c4d5940e60545556ed553e34d23c6bced52`, Pages workflow run `46081717330` succeeded on 2026-11-27.


## v0.1.47 Axis-Constrained Move Snapping

- Added dependency-free `src/core/TransformSnap.js` to normalize the snap preferences, select independent Global/Local movement increments, and symmetrically quantize signed axis displacement with floating-point cleanup. Defaults are `enabled: false`, Global step `1.0`, and Local step `1.0`.
- Axis-constrained pointer-driven Move (X/Y/Z) now snaps to the configured increment for the current Global/Local orientation. Switching orientation during the modal operation immediately selects the other step. Free camera-plane movement and Shift+axis plane movement are unchanged.
- Explicit numeric input bypasses snapping entirely, preserving the exact entered precision. Snap changes rebuild the live preview from the immutable operation start, remain inside the existing single modal transaction, and do not add extra undo entries. Cancel/Apply continue to use the existing snapshot restore/one-step commit behavior.
- Added Scene properties controls for the enable toggle and independent Global/Local step values, plus an in-operation mobile pad toggle. Preferences persist locally in browser `localStorage`; storage failures safely fall back to in-memory defaults. Snapping remains off by default.
- Added six pure regressions for default-off behavior, Global/Local step selection, positive/negative and half-step rounding, exact numeric-input bypass, safe setting normalization/clamping and decimal precision. Added Android/desktop browser acceptance for axis constraints, free/plane isolation, orientation switching, Edit Mode, preferences, numeric entry and Cancel/Apply/Undo/Redo.
- Added the new helper to the PWA app shell and advanced shell/runtime caches from v43 to v44. No dependencies, API, AI service, secrets, backend, workflow or external configuration changes.
- Full Node regression suite passed: 210 tests, 0 failures. Syntax checks passed for all 41 JavaScript modules under `src/` and `tests/`, `sw.js` and the inline `index.html` script. Android browser acceptance of snapping is pending; the owner confirms v0.1.46 live Move coordinate feedback works on Android. Desktop G/R/S acceptance remains deferred.
- This package is based on deployed v0.1.46, `main` commit `9217aa14866ffdf387108f16f34711d59793d589`, Pages workflow run `46082812182` succeeded on 2026-11-27.

## v0.1.48 Mobile Move Snap Controls Refinement

- Removed the Move Snapping section from the Android More / Scene drawer. The desktop Scene panel retains its snapping preferences; on mobile, all snapping controls now live beside the active Move numeric pad.
- Replaced the long full-width snap toggle with a compact two-button row: a clear `SNAP OFF` / `SNAP ON · <step>` state control and an expandable `STEP SIZE` control. The expanded panel edits separate Global and Local increments and explains that pointer drags snap while typed values remain exact.
- Added explicit viewport feedback: axis-constrained Move now reports `SNAP <step>` while snapping is active, `SNAP OFF` when disabled, and `EXACT INPUT (SNAP BYPASSED)` while a numeric value is being entered. Changing a step during a modal move rebuilds the preview from the original pointer anchor.
- Added five additional snap-path regressions for default-off/toggle behavior, Global/Local step switching, live step changes, positive/negative threshold crossings and returning to continuous movement when disabled. Existing tests continue to cover exact numeric bypass and free/plane movement isolation. Expanded Android acceptance steps to confirm the More drawer is clean and the visible snap state / increments match actual movement.
- Advanced service-worker shell/runtime caches from v44 to v45. No API, AI service, dependency, secret, backend, workflow or external configuration changes. The owner subsequently confirmed the revised mobile layout looks better and Global/Local snapped Move increments match actual movement on Android.
- Full Node regression suite passed: 215 tests, 0 failures. All 41 JavaScript modules under `src/` and `tests/`, `sw.js`, and the inline `index.html` script passed syntax checks.
- This package is based on deployed v0.1.47, `main` commit `74d20cbe7dfe58baea644ae96e029a7a73fb4f0b`, Pages workflow run `46083645339` succeeded on 2026-11-27.

## v0.1.49 Axis-Constrained Rotate and Scale Snapping

- Expanded `src/core/TransformSnap.js` from Move-only preferences to one backward-compatible Global/Local G/R/S snap model. Existing Move settings and the `bl3nd-move-snap-v1` localStorage key are preserved. New defaults are 15° for Global/Local Rotate and 0.1 scale-factor delta for Global/Local Scale; the shared enable flag remains off by default.
- Axis-constrained pointer Rotate (`X/Y/Z`) now quantizes the signed pointer-derived angle in degrees before quaternion construction. Free trackball rotation is unchanged. Numeric rotation input bypasses snapping exactly.
- Axis-constrained pointer Scale (`X/Y/Z`) now quantizes the scale-factor difference relative to neutral factor `1.0`, so a 0.1 increment yields 0.9, 1.0, 1.1, 1.2, etc. The snap helper clamps the resulting factor to the existing 0.001–1000 safety range. Free Scale and Shift+axis plane Scale remain unchanged; typed numeric scale remains exact.
- The in-operation compact pad SNAP / STEP SIZE controls now work for Move, Rotate and Scale. The expanded Global/Local fields change labels and units for the active operation. Desktop Scene properties expose independent Global/Local Move (world units), Rotate (degrees) and Scale (factor-delta) values. The mobile More drawer remains clean.
- Added seven pure regressions for default settings and legacy preference compatibility, independent orientation/type step selection, positive/negative Rotate snapping, exact numeric angle bypass, Scale snapping around 1.0, exact numeric scale bypass and factor safety clamps. Updated README and Android/Desktop browser acceptance.
- Advanced service-worker shell/runtime caches from v45 to v46. No API, AI service, dependency, secrets, backend, workflow or external configuration changes.
- Full Node regression suite passed: 222 tests, 0 failures. Syntax checks passed for all 41 JavaScript modules under `src/` and `tests/`, `sw.js`, and the inline `index.html` script. The owner subsequently confirmed that Move, Rotate and Scale snapping all work on Android. Desktop G/R/S interaction remains deferred.
- This package is based on deployed v0.1.48, `main` commit `4ecfe72ed3baf6cf50e8c39140fc9cccf48ff682`, Pages workflow run `46084602371` succeeded on 2026-11-27.

## v0.1.50 Passive Transform Pivot and Axis Guide

- Added dependency-free `src/core/TransformGuideGeometry.js` to build axis endpoints, a symmetric plane quad and a closed rotation ring from finite world-space inputs. It normalizes directions, orthogonalizes plane/ring bases, bounds segment counts and rejects invalid pivots/zero-length axes without throwing.
- `ModalTransform.getGuideState()` exposes the current live pivot, captured Global/Local basis, active axis/plane and camera-relative basis. Move guides follow the live moved object/selection; the 3D Cursor pivot remains fixed. Rotate exposes a camera-facing trackball ring or an axis-normal ring. Move and Shift+axis Scale expose the active plane.
- `Viewport` renders the guide as an SVG overlay projected from world space on each modal refresh and viewport resize. X/Y/Z retain distinct axis colors; the constrained direction is emphasized, the others dim, scale has endpoint handles, and the pivot badge names Global/Local and pivot mode. The overlay is pointer-transparent and is cleared when the transform ends or another modal operator owns the viewport. It is passive visual feedback, not a draggable gizmo and does not alter transform math.
- Added six pure helper regressions for oriented axes, active-axis metadata, plane symmetry, ring closure/segments, basis orthogonalization and invalid input. Added manual Android/Desktop checks for Global/Local axes, live pivot behavior, plane/ring feedback, view orbit/zoom and input isolation.
- Advanced service-worker shell/runtime caches from v46 to v47 and added the new helper to the app shell. No API, AI service, dependency, secret, backend, workflow or external configuration changes.
- Owner-confirmed Android acceptance of v0.1.49 Move/Rotate/Scale snapping is recorded. Full Node suite passed: 228 tests, 0 failures. Syntax checks passed for all 43 JavaScript modules under `src/` and `tests/`, `sw.js`, and the inline `index.html` script. The v0.1.50 passive guide itself still requires Android browser acceptance; desktop Chrome/Edge remains deferred.
- This package is based on deployed v0.1.49, `main` commit `d8d8cff318bc4ae86f26e6f2668de0d64f069fc1`, Pages workflow run `46085889963` succeeded on 2026-11-28.

## v0.1.51 Bounding Box Center Transform Pivot

- Added dependency-free `src/core/TransformPivot.js` to resolve a selected point set's arithmetic Median Point or axis-aligned Bounding Box Center. Invalid points are ignored, and empty/invalid selections return no pivot so callers can safely fall back.
- Edit Mode G/R/S now computes Bounding Box Center from the captured selected-vertex positions in object-local space. Median Point remains the arithmetic average of the selected unique vertices. The 3D Cursor pivot remains a fixed world-space point.
- Object Mode Bounding Box Center originally used the active mesh's precise world-space bounds. v0.1.69 supersedes the single-active-object restriction: Median Point aggregates selected origins, Bounding Box Center aggregates the selected meshes' world-space bounds, and Individual Origins uses one pivot per selected object.
- Added the Bounding Box Center option to the existing Pivot Point selector and ensured the selector reflects restored document pivot state after refresh/undo. The implementation does not change transform snapping, numeric entry, axis orientation or the passive guide's pointer-transparent behavior.
- Added four pure regressions for centroid vs bounds center, flat/single-point extents, invalid point filtering and empty-selection fallback. Added Android/Desktop browser acceptance for asymmetric Edit Mode selections, offset-origin objects, Cursor stability, dropdown restoration and transactional Cancel/Apply/Undo/Redo.
- Advanced service-worker shell/runtime caches from v47 to v48 and added `TransformPivot.js` to the app shell. No API, AI service, dependency, secret, backend, workflow or external configuration changes.
- Full Node suite passed: 232 tests, 0 failures. Syntax checks passed for all 45 JavaScript modules under `src/` and `tests/`, and `sw.js`; the HTML import map parsed as valid JSON. Browser acceptance of Bounding Box Center remains pending; the owner confirmed v0.1.50 passive transform guide works on Android. Desktop Chrome/Edge remains deferred.
- This package is based on deployed v0.1.50, `main` commit `effe5c81ceb5caf21557f17025e08aea3fd5338b`, Pages workflow run `46087985134` succeeded on 2026-11-28.

### 2026-11-28 — `bl3nd-v0.1.69-multi-object-pivots.zip` — v0.1.69

- Added Object Mode additive/toggle multi-selection. Desktop uses Shift-click; Android uses a touch-only **Multi** toggle in the existing bottom actionbar slot, which is replaced by Proportional Editing in Edit Mode. The active object remains distinct and is highlighted; secondary selected objects receive a separate highlight.
- Scene snapshots now persist selected object indices and active object identity; an explicitly empty selection also survives restore, while snapshots from before this field retain their legacy active-object fallback. Object Mode Delete removes the selected group. Entering Edit Mode deliberately collapses to the active object because multi-object Edit Mode remains out of scope.
- Extended G/R/S to capture every selected object at modal start and apply Move, Rotate and Scale previews to the complete group. Apply records one undo step for the group; Cancel restores all objects and the original selection.
- Implemented Object Mode Median Point (mean of selected object origins), Bounding Box Center (union of selected world-space mesh bounds), fixed 3D Cursor, and Individual Origins (one pivot per object). The passive guide marks every object origin in Individual mode. Local axes use the active selected object as the shared orientation reference.
- Added pure selection/pivot regression tests and desktop/mobile browser acceptance steps. Existing Edit Mode Individual Origins and single-mesh topology transforms remain unchanged. Full Node regression suite passed: 348 tests, 0 failures. Syntax checks passed for all 68 JavaScript modules under `src/` and `tests/`, plus `sw.js`; the `index.html` import map parsed as valid JSON and all 45 service-worker app-shell paths resolve. Real Android/Desktop browser acceptance remains pending.
- Advanced service-worker shell/runtime caches from v65 to v66 and precached `ObjectSelection.js`. Updated README and this handoff. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Known remaining limitation: non-uniform world-axis scaling of differently rotated objects can require shear that the current TRS scene graph cannot represent exactly; full multi-object Edit Mode and the interactive draggable gizmo are not included.
- This delta is based on deployed v0.1.68, `main` commit `8400e5c389d1f63297a5108888b79ff8c52388b9`, Pages workflow run `46153656122` succeeded on 2026-11-28 after unpack run `46153642289`.

## Next Roadmap Step

Implement a fully interactive draggable G/R/S gizmo as a separate pointer-safe overlay, preserving the passive guide and routing operations through the existing modal transform state machine. Desktop acceptance remains deferred until the owner can test on PC.

### 2026-11-28 — `bl3nd-v0.1.68-command-search.zip` — v0.1.68

- Added `src/ui/CommandSearch.js` with a curated command catalogue, token-based matching/ranking, Object/Edit Mode availability (including mode-switch filtering), accessible results, Up/Down/Enter/Esc navigation and focus restoration.
- Added a visible **⌕** launcher to the existing top bar and an unmodified `/` shortcut. The shortcut is ignored in inputs, textareas, selects and contenteditable fields; radial-menu navigation and active modal G/R/S, Bevel, Extrude, Inset and Loop Cut input retain priority. Ctrl/Meta/Alt/Shift shortcuts are not intercepted.
- Search results dispatch existing named CommandBus commands. The palette closes before dispatch so established modal/viewport ownership remains intact; no mesh algorithms or command handlers are duplicated.
- Added catalogue/search and keyboard-priority regression tests, plus desktop/mobile browser acceptance steps.
- Full Node regression suite passed: 334 tests, 0 failures. Automated JavaScript tests passed; real Android touch and desktop browser acceptance remain pending.
- Advanced service-worker shell/runtime caches from v64 to v65 and precached `CommandSearch.js`. Updated README and this handoff. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- This delta is based on deployed v0.1.67, `main` commit `aed61049bb8588f21c5b94563588ade2945a4bb2`, Pages workflow run `46150737234` succeeded on 2026-11-28 after unpack run `46150719344`.

## Next Roadmap Step

Implement a fully interactive draggable G/R/S gizmo as a separate pointer-safe overlay. Preserve the passive guide as an accessible fallback, route drag actions through the existing modal transform state machine, and maintain viewport orbit/pan recovery on mobile. Desktop acceptance remains deferred until the owner can test on PC.

## v0.1.67 Mobile Projection Toggle Access Fix

- The original P/O control was a 34×27px button beside the viewport axis gizmo. On phones this small target was difficult to discover and tap reliably. Added a dedicated **P/O View** button to the always-visible mobile bottom actionbar and hide the tiny axis-gizmo projection button at the mobile breakpoint; desktop retains its existing axis-gizmo button.
- Both controls share one projection state helper and the same `view.toggle_projection` command. The mobile button updates only its P/O label while retaining its View caption; text, accessible label, title and `aria-pressed` state stay synchronized with the active camera.
- The shared click binding prevents default behavior and stops propagation before dispatch so a touch activation cannot turn into viewport orbit/selection input. Existing modal-operation lockout, Numpad 5 behavior, camera conversion math and desktop controls remain unchanged.
- Added regression coverage for both projection states, desktop/mobile label synchronization, touch click isolation/cleanup and the mobile actionbar markup/48px touch target.
- Advanced service-worker shell/runtime caches from v63 to v64 and precached `ProjectionToggle.js`. Updated README, browser regression instructions and this handoff. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 320 tests, 0 failures. Syntax/structure checks are recorded with this delta; Android touch retest remains required, and desktop browser acceptance remains deferred.
- This delta is based on deployed v0.1.66, `main` commit `eaf6accaf2ec1d1989f275c7333d6648e77bbc56`, Pages workflow run `46116338906` succeeded on 2026-11-28 after package-unpack run `46116324594`.

## v0.1.66 Perspective / Orthographic Projection Toggle

- Added `src/core/CameraProjection.js` with tested perspective target-plane view-height/distance conversions and aspect-aware orthographic frustum sizing.
- `Viewport.toggleProjection()` now switches the live camera between Three.js PerspectiveCamera and OrthographicCamera while preserving the controls target, view direction/up orientation and apparent target-plane scale. The existing OrbitControls instance is rebound to the new camera object so its mouse/touch listeners, damping, pan and zoom controls remain in place. `ModalTransform.captureViewFrame()` now computes world-units-per-pixel from orthographic frustum height when appropriate, keeping G/R/S pointer transforms stable and depth-independent in orthographic mode.
- Numpad `5` now toggles projection through the view command bus. Added an always-visible P/O button next to the axis-view buttons for touch and desktop; its text, title and accessible pressed state stay synchronized. Switching is rejected while modal transforms/modeling operations have camera input locked.
- Updated orthographic aspect/frustum sizing on viewport resize and adapted transform guide scale, object framing and selection framing to the active projection. Existing ray picking and cursor placement already use `viewport.camera`, which now always references the active camera.
- Added seven projection/view-scale math regressions plus keyboard/nav shortcut coverage, including browser-modifier pass-through and orthographic depth-independent G/R/S scaling. Added desktop and Android browser acceptance for toggling, framing preservation, resize, orbit/zoom, picking, modal lockout and mobile gesture retention.
- Advanced service-worker shell/runtime caches from v62 to v63 and precached `CameraProjection.js`. Updated README and this handoff. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 315 tests, 0 failures. Syntax checks passed for all 62 JavaScript modules under `src/` and `tests/` plus `sw.js`; the `index.html` inline executable script parsed, the import map is valid JSON, all 121 HTML IDs are unique, and ZIP integrity passed. Numpad hardware acceptance remains pending; the P/O button provides an Android test path and desktop browser acceptance remains deferred.
- This delta is based on deployed v0.1.65, `main` commit `eaf6accaf2ec1d1989f275c7333d6648e77bbc56`, Pages workflow run `46115270214` succeeded on 2026-11-28 after package-unpack run `46115259398`.

## v0.1.65 Numpad Navigation and Keyboard Shortcut Conflict Audit

- Added renderer-independent `src/core/ViewportNavigation.js` to resolve keypad bindings by `KeyboardEvent.code` and compute stable 15° camera orbit steps. Numpad 1/3/7 set front/right/top; Ctrl/Meta+1/3/7 set back/left/bottom; 2/4/6/8 orbit vertically/horizontally; 9 turns the view 180°; Numpad Decimal frames the active Edit Mode selection or active Object Mode object. `Home` continues to frame the active object.
- Added `Viewport.orbitStep()` and a forced single-element selection framing path. Navigation changes only the camera and do not create undo records. Repeated vertical stepping clamps before the camera crosses a pole. Cardinal directions remain on the existing perspective camera; Numpad 5 explicitly remains unavailable pending a safe perspective/orthographic camera implementation.
- Moved keypad handling ahead of ordinary Edit Mode digit shortcuts and Delete processing. This ensures Numpad 1 does not accidentally switch to Vertex Select and Numpad Decimal with NumLock off does not accidentally delete the mesh; top-row 1/2/3 and the dedicated Delete key keep their existing actions.
- Added pure navigation/key-mapping tests and KeyboardController integration tests for the key priority/conflict cases. Updated README controls and the desktop/mobile browser regression procedure.
- Advanced service-worker shell/runtime caches from v61 to v62 and added `ViewportNavigation.js` to the app shell. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 306 tests, 0 failures. JavaScript syntax checks, `sw.js`, `index.html` inline scripts/import map, unique HTML IDs and ZIP integrity were checked. Numpad browser acceptance requires a physical keyboard and remains pending; Android touch controls are unchanged, and desktop acceptance remains deferred.
- This delta is based on deployed v0.1.64, `main` commit `007fe3052f0a1ae70a2fe115cb0d72945e76350e`, Pages workflow run `46114009322` succeeded on 2026-11-28 after package-unpack run `46113992493`.

## Next Roadmap Step

The v0.1.68 Command Search launcher now offers curated Object/Edit Mode actions through the existing CommandBus, with an explicit focus model and mobile access. Next, implement exact Object Mode multi-object pivot aggregation as a separate increment, then investigate a fully interactive draggable G/R/S gizmo. Preserve the current passive guide and Edit Mode Individual Origins behavior; desktop acceptance remains deferred until the owner can test on PC.


## v0.1.64 Radial Pie Menus and Directional Selection

- Replaced the former two-column command popup with eight-direction radial sector wheels for Add, Shading and Select. The Select wheel groups Click/Box/Circle/Lasso in a Select Tools submenu and Validate/Safe Repair/Delete/Dissolve in a More Actions submenu; the main wheel keeps Proportional, Edge Loop, Edge Ring, Select All, Deselect and Invert directly available.
- Added directional pointer-flick selection for the `Z` shading and `Shift+A` Add shortcuts: when the last pointer is safely inside the viewport, the wheel anchors at that point, highlights the nearest sector as the pointer moves, and activates it when the shortcut is released. Releasing without a flick leaves the menu open for click/tap or arrow-key selection. Near viewport edges the wheel safely opens at the viewport center rather than clipping off-screen.
- Added arrow-key navigation, `Enter` activation and `Esc`/`Backspace` close behavior. Each menu sector retains the same named CommandBus action as before. The mobile Add to Selection toggle remains in the center of the Select wheel; direct mobile actionbar controls for Move/Rotate/Scale/Extrude/Proportional remain available.
- Added four pure radial-layout/navigation regressions plus deterministic sector-boundary coverage. Updated desktop/mobile manual acceptance instructions and README controls.
- Advanced service-worker shell/runtime caches from v60 to v61 and precached `src/ui/RadialPieMenu.js`. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 293 tests, 0 failures. Syntax checks passed for all 57 JavaScript modules under `src/` and `tests/` plus `sw.js`; the `index.html` inline script parsed, the import map remained valid JSON, and all 120 HTML IDs remained unique. ZIP integrity passed. Android visual/touch acceptance is pending; desktop Chrome/Edge remains deferred.
- This delta is based on deployed v0.1.63, `main` commit `81dcba7f09a05756019799f09088ec0a02421b8e`, Pages workflow run `46112111100` succeeded on 2026-11-28 after package-unpack run `46112098266`.

## v0.1.63 Pole-Aware Loop Cut

- Added a dedicated Loop Cut traversal that inspects the two quad-opposite edges emitted by a crossed edge. When those edges meet at an extraordinary vertex, traversal continues only if the vertex has a closed all-quad fan and the existing `oppositeEdgeAtExtraordinaryPole()` matcher selects the exact same pair in both directions. The matcher retains the ≥155° near-antiparallel threshold and clear-best-match margin.
- The Loop Cut transaction now records how many extraordinary poles were crossed. Regular quad strips, closed cube loops, 1–8 cut interpolation, numeric/drag sliding and modal undo behavior are unchanged. Ambiguous or tied pairings, open extraordinary fans, non-quad fans, non-manifold spokes, invalid quad geometry and inconsistent winding reject before source positions/faces/selection change.
- Added five- and six-valence closed all-quad fixtures where the cut passes through one uniquely paired pole in each fan. Tests verify one- and multi-cut topology, four crossed quad faces, continuous unbranched selected cut paths, manifoldness, winding and strict non-mutation for ambiguous, open/non-quad and non-manifold pole fans.
- Updated README and browser regression steps. Advanced service-worker shell/runtime caches from v59 to v60. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 288 tests, 0 failures. Syntax checks passed for all 55 JavaScript modules under `src/` and `tests/` plus `sw.js`; the `index.html` inline executable scripts parsed, its import map is valid JSON, and all 120 HTML IDs are unique. ZIP integrity passed. Live Android acceptance is pending; desktop Chrome/Edge remains deferred.
- This delta is based on deployed v0.1.62, `main` commit `fd436dddef429faa9442cbb4d54481eadfd2eab3`, Pages workflow run `46109624623` succeeded on 2026-11-28 after package-unpack run `46109609929`.

## v0.1.62 Explicit Safe Topology-Repair Policies

- Made the Safe Repair policy part of its returned result: malformed faces are removed, the first duplicate face is kept, isolated vertices are compacted, orientable manifold components may be reoriented, and non-manifold edges, components touching those ambiguities, non-orientable conflicts, non-planar faces and self-intersections are preserved.
- Repair now reports each preserved non-manifold source edge, its incident source face IDs and the directed use made by every incident face. It separately lists source face IDs in contradictory winding components and in otherwise orientable components blocked by adjacency to a non-manifold fan.
- Corrected repair classification so a component blocked only because it touches a non-manifold fan is not mislabeled as a non-orientable cycle. Safe independent manifold components still repair in the same pass.
- Expanded the Repair Safe Issues notification to summarize preserved non-manifold edges and winding-conflict components; the full structured report remains available in the console. No arbitrary face deletion, automatic sheet splitting or speculative normal repair is performed.
- Added regressions for explicit non-manifold edge/face reporting, repairing a separate orientable component beside a preserved non-manifold fan, and preserving/reporting a non-orientable Möbius-strip component.
- Advanced service-worker shell/runtime caches from v58 to v59. Updated README, browser regression steps and this handoff. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Full Node suite passed: 284 tests, 0 failures. Syntax checks passed for all 55 JavaScript modules under `src/` and `tests/` plus `sw.js`; the `index.html` inline executable script parsed, its import map is valid JSON, and all 120 HTML IDs are unique. ZIP integrity passed. Live Android acceptance is pending; desktop Chrome/Edge remains deferred.
- This package is based on deployed v0.1.61, `main` commit `d47c28036dca9fdf23c5a165617cf9ef82a1145a`, Pages workflow run `46108560253` succeeded on 2026-11-28 after package-unpack run `46108548469`.

## v0.1.61 Surface-Aware Proportional Editing Guards

- Replaced the vertex-only proportional distance graph with a surface-aware smooth-fan graph built from editable half-edge records and world-space polygon normals. Influence still uses Dijkstra shortest paths over existing mesh edges, the same five falloff curves and immutable modal source positions.
- A 55° default dihedral threshold (inclusive at exactly 55°) separates sharp face fans at shared vertices. Face selections carry selected-face context, so falloff can travel across coplanar and smoothly curved joins below the threshold without leaking around a sharp crease into the opposite surface. Sharp crease edges remain traversable along either side, but their two surface fans are not merged.
- Edges with more than two incident faces, inconsistent/missing reciprocal twins, disconnected face fans that only meet at a vertex and faces without a stable Newell normal are conservatively isolated. Explicit vertex/edge selections seed all incident fans at the selected shared vertices, preserving the expected behavior when a user directly selects a shared vertex or edge. Disconnected-island isolation and nearest-group assignment remain intact.
- Added regressions for sharp crease isolation (including the exact 55° threshold), smooth 40° joins, non-manifold edge fans, shared-vertex disconnected fans, inconsistent winding and explicit vertex selection at a crease. Updated Android/Desktop browser retests.
- Advanced service-worker shell/runtime caches from v57 to v58. Updated README and this handoff. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 281 tests, 0 failures. Syntax checks passed for all 55 JavaScript modules under `src/` and `tests/` plus `sw.js`; the `index.html` inline scripts parsed, its import map is valid JSON, and all 120 HTML IDs are unique. ZIP integrity passed. Live Android acceptance is pending; desktop Chrome/Edge remains deferred.
- This delta is based on deployed v0.1.60, `main` commit `8d0ff05d80ec2460d968c1d7b4862c5e7457dfe1`, Pages workflow run `46107041331` succeeded on 2026-11-28 after package-unpack run `46107024706`.

## v0.1.60 Mesh Operations After Proportional Editing

- Fixed a workflow regression where a proportional G/R/S edit could leave safely triangulatable neighboring quads non-planar, after which a strict whole-mesh check blocked unrelated Extrude, Inset and Bevel operations on a still-planar selected face.
- Added source-geometry signatures for inherited safe warped quads. Operator source checks continue accepting only faces that the existing warped-quad fallback can render as two non-degenerate triangles without a true 3D boundary crossing. Candidate checks grandfather only those exact unchanged source-face geometries; newly generated or position-changed candidate faces must pass strict planarity, intersection and triangulation validation.
- Applied the policy to Extrude, Inset, connected and multi-region Face Bevel, and the existing edge-Bevel candidate paths. The selected operation region remains subject to its existing planar/single-boundary/winding constraints. Public `Validate Mesh` and `Repair Safe Issues` remain strict diagnostics/repairs; this change does not hide their non-planar warnings.
- Added four regressions: strict diagnostics still report the inherited warps; safe source signatures permit the unchanged renderable quads; true 3D bow-ties remain rejected; and Extrude, Inset and Face Bevel each work on a planar selected center face after a proportional-style move bends surrounding quads. The existing skewed mixed-fan bevel rejection matrix remains passing.
- Advanced service-worker shell/runtime caches from v56 to v57. Updated README, browser regression instructions and this handoff. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 274 tests, 0 failures. All source/test modules, `sw.js`, `index.html` inline scripts and import map passed syntax/structure checks. Live Android acceptance is pending; desktop Chrome/Edge remains deferred.
- This delta is based on deployed v0.1.59, `main` commit `826d83d4b80dbfc086e52f64708210741d077f28`, Pages workflow run `46105999341` succeeded on 2026-11-28.

## v0.1.59 Selectable Proportional Falloff Shapes

- Exposed the five falloff curves already implemented by `src/core/ProportionalEditing.js`: Smooth (default), Linear, Sharp, Root and Sphere. No weighting equations or topology-distance traversal were changed.
- Added synchronized selectors to desktop Scene Properties, the always-available mobile Prop panel and the active mobile G/R/S transform pad. All three use the existing `transform.proportional_settings` command and the existing local preference, so falloff remains synchronized with the enabled state and radius without duplicating settings or transform logic.
- Changing the curve during an active Edit Mode transform rebuilds influence weights and the preview from immutable source positions. The active transform readout and modal status identify the selected curve. Object Mode transforms remain unchanged; disconnected topology islands remain isolated.
- Added pure regressions for the five distinct curve values and falloff persistence across radius-only settings updates. Added desktop/mobile manual acceptance steps. Android acceptance is pending; desktop Chrome/Edge remains deferred.
- Advanced service-worker shell/runtime caches from v55 to v56. Updated README and this handoff. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 270 tests, 0 failures. Syntax checks passed for all 55 JavaScript modules under `src/` and `tests/` plus `sw.js`; the `index.html` inline script parsed, its import map is valid JSON, all 120 HTML IDs are unique, and all three falloff selectors contain the five supported shapes. Live Android acceptance remains pending; desktop Chrome/Edge remains deferred.
- This delta is based on deployed v0.1.58, `main` commit `2755dd090bdc702bbd188e8b2d1dc7c8b6194c85`, Pages workflow run `46104256956` succeeded on 2026-11-28.

## v0.1.58 Mobile Proportional Editing Access

- The v0.1.57 controls existed in the Select menu and the mobile G/R/S numeric pad, but the always-available radius preference was inside the collapsed Scene Properties drawer on phones. Added a dedicated **Prop OFF / Prop ON** actionbar button that is visible whenever Edit Mode is active.
- Tapping the actionbar button toggles the same persistent proportional setting used by `O`, Select ▾ and the in-operation numeric pad. When enabled outside a modal transform, a compact panel appears directly above the mobile actionbar with the current world-space radius slider and an explanation of its G/R/S effect. The active transform pad continues to expose the toggle/radius during G/R/S.
- Synced button text, pressed/active styling, radius value, panel visibility and Edit/Object Mode visibility through the existing refresh/command path. No desktop layout or transform math changed.
- Added Android browser acceptance for discovery, toggling, radius adjustment before/during transforms, persistence, and synchronization with the Select menu / keyboard command. Desktop Chrome/Edge remains deferred.
- Advanced service-worker shell/runtime caches from v54 to v55. Updated README and this handoff. No API, AI service, external dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 268 tests, 0 failures. All 54 JavaScript modules, `sw.js`, `index.html` inline scripts and import map passed syntax/structure checks. ZIP integrity passed. Live Android acceptance is pending.
- This delta is based on deployed v0.1.57, `main` commit `76f7eae7e317f11239a1cc2bdaf660fc34df4401`, Pages workflow run `46103584982` succeeded on 2026-11-28.

## v0.1.57 Edit Mode Proportional Transform Influence

- Added `src/core/ProportionalEditing.js`, a read-only topology-distance influence builder. It uses Dijkstra shortest paths over the editable half-edge edge graph with world-space edge lengths, supports smooth/linear/sharp/root/sphere weighting, ignores malformed/zero-length edges and assigns each influenced vertex to only its nearest selected transform group. Disconnected islands and nearby surfaces without a mesh-edge path remain isolated.
- Added Edit Mode proportional influence to modal Move, Rotate and Scale. Selected vertices retain weight 1; unselected reachable vertices inside the configured radius receive smooth weighted transforms. Move blends translation by weight, Rotate slerps identity to the requested quaternion, and Scale interpolates its factor around each applicable pivot. The operation always rebuilds from immutable source positions, so pointer previews and live radius edits do not accumulate deformation error. Individual Origins keeps one influence basin per selected region and assigns overlapping vertices deterministically to the nearest region.
- Added the `O` keyboard toggle, the existing Select menu toggle for touch, persistent enable/radius preferences, a Scene Properties radius slider, mouse-wheel radius adjustment during desktop transforms and a touch-visible toggle/radius slider inside the mobile transform pad. Settings do not enter scene undo history; mesh transforms still commit as one undo step or restore fully on cancel. Object Mode transforms are unchanged.
- Added geodesic distance, falloff curve, radius, malformed-edge, tie-breaking, group-isolation and overlap regressions. Added Android/Desktop browser steps for vertex/edge/face selections, Move/Rotate/Scale, radius changes, Individual Origins, disconnected islands and Undo/Cancel.
- Advanced service-worker shell/runtime caches from v53 to v54 and precached the new helper. Updated README and this handoff. No API, AI service, external dependency, secret, backend or workflow changes.
- Node regression and browser syntax checks are recorded with this package; live Android acceptance remains pending and desktop Chrome/Edge remains deferred.
- This delta is based on deployed v0.1.56, `main` commit `71edd923a1c58d481f1993cdb017a10d049e5338`, Pages workflow run `46102742889` succeeded on 2026-11-28.

## Next Roadmap Step

v0.1.64 now provides true radial Add, Shading and Select wheels, nested Select Tools/More Actions menus, pointer-flick release selection, and click/tap/arrow-key fallback; the mobile center Add to Selection control remains. Next, expand Blender-style keymap parity and audit browser-shortcut conflicts without reducing touch usability. Full Android visual acceptance is pending and desktop Chrome/Edge remains deferred.


## v0.1.56 Face Bevel Transition Topology for Later Rotations

- Reproduced the user's Face Bevel → Rotate issue: a single cube face bevel followed by a 45° cap rotation previously left four perimeter wall quads non-planar, self-intersecting in projection and non-triangulatable. The validator reported 12 warnings (four faces in each of those three diagnostic categories); Safe Repair correctly removed/flipped nothing because these were geometrically warped walls, not duplicate or malformed face records.
- Changed planar `bevelSelectedFaceRegion()` to store every perimeter wall segment as the same two ear-clipped triangles the viewport renderer already used. This makes the editable half-edge topology match the rendered surface. Every transition triangle remains an independently planar face after raised-cap rotation; the visible bevel shape and shared boundary vertices are unchanged. The `createdFaces` result now counts both triangles per perimeter segment, including all 1–8 segment and Individual Faces/Multi-Region paths.
- Added single-face, connected multi-face Region, multi-face Individual Bevel, disconnected Multi-Region and segmented-bevel regressions. They rotate selected cap vertices and assert zero topology issues, zero boundary/non-manifold/inconsistent-winding edges, reciprocal half-edge twins, and renderable triangle lists for every face. Updated existing Face Bevel face-count expectations to reflect the explicit diagonal topology.
- Advanced service-worker shell/runtime caches from v52 to v53. Updated README, browser regression instructions and this handoff. No API, AI service, dependency, secret, backend, workflow or external configuration changes.
- Full Node suite passed: 259 tests, 0 failures. Syntax checks passed for all 52 JavaScript modules under `src/` and `tests/`, `sw.js`, the `index.html` inline executable script and import map. Android browser acceptance remains pending; desktop Chrome/Edge remains deferred.
- This delta is based on deployed v0.1.55, `main` commit `55a5356e2b2acc80a692d5d1b5a167830f47237d`, Pages workflow run `46101370254` succeeded on 2026-11-28.

## v0.1.55 Warped-Quad Visibility During Edit Mode Transforms

- Investigated the reported visual openings that appear when rotating selected faces. The selected boundary vertices remain shared with adjacent unselected faces, but a large face rotation can twist those neighboring quads. Their dominant-axis 2D projection can appear self-crossing even when the 3D boundary is still a simple loop; the previous ear-clipping path returned no triangles, so the entire adjacent quad disappeared from the viewport.
- Added `src/core/WarpedQuadTriangulation.js`, a restricted fallback for four-sided faces only. It rejects invalid/duplicate vertices, real 3D opposite-edge crossings, zero-area faces and degenerate candidate triangles. It evaluates both diagonal splits against the quad's Newell area vector and chooses the split that best preserves winding and minimizes the fold between its triangles. The existing ear-clipping path remains authoritative for normal planar and concave polygons.
- `HalfEdgeMesh.triangulateFace()` now tries that fallback only after the standard triangulator fails. This keeps render geometry, triangle-to-face picking maps, selected-face overlays and topology triangulation diagnostics synchronized. True planar bow-ties / 3D boundary crossings remain rejected.
- Editable mesh materials are now two-sided for primitives, restored scenes and imported meshes. This prevents an otherwise valid but locally folded triangle from being hidden solely because it faces away from the camera. It does not repair the shape or prevent severe self-intersections.
- Added three regressions: a cube face rotated 90° keeps every side quad triangulated; all shared edge half-edge pairs remain welded; and a true bow-tie quad is still rejected. Added the Android/Desktop manual rotation retest and documented that adjacent faces deform rather than remaining rigid.
- Advanced service-worker shell/runtime caches from v51 to v52 and added the new triangulation helper to the app shell. No workflow, dependency, API, AI service, secret, backend or external configuration changes.
- Full Node suite passed: 254 tests, 0 failures. All source/test JavaScript modules, `sw.js`, `index.html` inline scripts and import map were syntax/structure checked. Real Android acceptance remains pending; desktop Chrome/Edge remains deferred.
- This package is based on deployed v0.1.54, `main` commit `8e6e157aae2ca17e97f716cee24cb77aa72b3818`, Pages workflow run `46099052361` succeeded on 2026-11-28.

## Next Roadmap Step

Continue transform ergonomics with proportional editing as a distinct, explicitly weighted selection mode. Keep the current shared-topology behavior and safe warped-quad display; a rigid detached-face workflow must remain a separate geometry/separation feature. Desktop Chrome/Edge remains deferred.


## v0.1.54 Multi-Region Face Operations

- Added `src/core/SelectedFaceRegions.js` to partition a selected face set into edge-connected components and validate each as a consistently wound planar region with one simple boundary. It rejects components that touch only at a shared vertex, holes/multiple loops and malformed/invalid selections before candidate mutation.
- Extended `FaceOperationModal` so Extrude and Inset can preview and commit multiple disconnected planar islands in one transaction. Extrude derives an independent Newell normal per island and applies the same signed world-space distance. Inset applies the same normalized amount per island, computes each island's offset from its own shortest boundary edge, and reselects all inner faces after the combined operation. Candidate topology and triangulation are checked as a whole before preview/commit.
- Added Face Bevel **Multi-Region** mode for separate, non-touching planar islands. Each island uses the existing validated Connected Region Bevel path, retaining welded internal seams while sharing width, height, segment and profile settings. `I` switches to Individual Faces when separate per-polygon panels are preferred; the modal can switch back to Multi-Region while settings match.
- Connected non-planar face selections (for example, several adjacent cube sides) are not treated as separate islands and remain unsupported by shared-region Extrude/Inset. Individual Face Bevel retains its existing safe fallback where every selected polygon independently validates. Touching-at-a-vertex islands, holes, unsafe offsets and invalid topology remain non-destructive rejections. Edge Bevel supported templates are unchanged; mixed connected/disconnected edge selections remain unsupported.
- Added eight focused regressions for region partitioning, connected vs disconnected regions, shared-vertex rejection, two-island Extrude/Inset, Multi-Region Face Bevel on separate and opposing surfaces, and mode switching. Updated older rejection tests to verify the new multi-island acceptance.
- Advanced service-worker shell/runtime caches from v50 to v51 and added `SelectedFaceRegions.js` to the app shell. Updated README and Android/Desktop browser acceptance instructions. No API, AI service, dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 251 tests, 0 failures. All 49 JavaScript modules under `src/` and `tests/` plus `sw.js` passed syntax checks. Android browser acceptance is pending; desktop Chrome/Edge remains deferred.
- This package is based on deployed v0.1.53, `main` commit `978a9adbcb0873382a250c21af841d722aec28a8`, Pages workflow run `46095000534` succeeded on 2026-11-28.

## v0.1.53 Touch Additive Selection Toggle

- Added `src/core/SelectionAddMode.js` to centralize the additive-selection state and preserve the existing desktop Shift modifier. Three pure regressions cover default-off/toggle behavior, keyboard Shift compatibility, explicit state changes and reset.
- Extended `TouchController` with an `Add to Selection · ON/OFF` item in the existing Select menu on touch-capable devices. The selection toolbar displays `+` while enabled, and the mode resets when leaving Edit Mode.
- Touch tap selection and Box/Circle/Lasso gestures reuse the existing Shift-aware selection paths: taps add or toggle an element, region gestures add visible elements, and disabling the mode restores replace-selection behavior. Picking, ray checks, half-edge topology and undo behavior are not duplicated or changed.
- Added Android browser acceptance for disconnected face selection, additive/toggle-off behavior, all three region tools, orbit/long-press recovery and automatic mode reset. Desktop Shift-click/Shift-drag behavior remains unchanged.
- Added the helper to the PWA app shell and advanced service-worker shell/runtime caches from v49 to v50. Updated README and browser regression instructions.
- Full Node regression suite passed: 243 tests, 0 failures. All 47 JavaScript modules under `src/` and `tests/` plus `sw.js` passed syntax checks. Android browser acceptance is pending; desktop Chrome/Edge remains deferred. No API, AI service, dependency, secret, backend, workflow or external configuration changes.
- This package is based on v0.1.52, `main` commit `2c3fa9dd569f7e220fd4acbd07c9ff78849797c3`.

## v0.1.52 Connected-Region Edit Mode Individual Origins

- Implemented the approved conservative policy: Edit Mode Individual Origins uses one median pivot per disconnected selected region. Selected faces join through shared topology vertices (including vertex-only contact), selected edges join through shared endpoints, and vertex-only selections join only across actual mesh edges whose two endpoints are selected.
- Added read-only `groupSelectedTransformVertices()` to `src/core/TransformPivot.js`. It filters malformed IDs/positions, returns deterministic sorted disjoint groups, and never changes mesh positions, topology or selection.
- Updated `ModalTransform` so each selected region captures its immutable source vertices and own world-space pivot. Move applies the same world delta to all regions; Rotate and Scale rebuild each region independently around its pivot. A welded shared vertex is assigned to one component and transformed once; no temporary or permanent vertex splitting is introduced.
- Extended the passive transform SVG guide to mark every region origin and show the connected-region count. The central guide remains the stable pointer-to-world interaction anchor; individual markers identify the actual per-region origins.
- Added eight pure regression cases for shared-face seams, single-vertex face contact, disconnected islands and their pivots, edge paths, vertex-only adjacency, mixed selection overlap, protection against unselected bridge edges, duplicate protection and invalid topology IDs. Added Android/Desktop browser acceptance for Move/Rotate/Scale, welded seams, shared-vertex contact, multiple islands, guide markers, snapping, numeric input and transactional Undo/Redo.
- Advanced service-worker shell/runtime caches from v48 to v49. No API, AI service, dependency, secret, backend, workflow or external configuration changes.
- Full Node regression suite passed: 240 tests, 0 failures. Syntax checks passed for all 45 JavaScript modules under `src/` and `tests/`, `sw.js`, and the three inline script blocks were parsed from `index.html`; the import map is valid JSON. Android browser acceptance is pending; desktop Chrome/Edge remains deferred.
- This package is based on deployed v0.1.51, `main` commit `908fb1ce0fc9aed6c3202cce5a8b18a908912120`, Pages workflow run `46089305031` succeeded on 2026-11-28.

## Next Roadmap Step

Return to explicit non-manifold/inconsistent-winding repair policies and extend Loop Cut across supported extraordinary poles. Preserve conservative, non-destructive rejection for ambiguous topology. Preserve the current non-destructive guards for shared-vertex islands and unsupported region boundaries. After operator coverage, continue with exact Object Mode multi-object pivot aggregation, proportional editing and a fully interactive draggable gizmo as separate steps. Desktop Chrome/Edge remains deferred.
