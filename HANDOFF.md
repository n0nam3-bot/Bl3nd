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
- **Half-edge data:** `src/core/HalfEdgeMesh.js` owns editable Vertex, Edge, HalfEdge, and Face connectivity. Import merges adjacent coplanar triangles only when they form one convex boundary; Three.js geometry remains a render cache, not the editable source of truth. Complex and non-manifold inputs are not fully repaired. `src/core/FaceRegionBoundary.js` provides read-only selected-region analysis: connected components, ordered boundary loops, nested hole classification on planar regions, region-facing convex/reflex corners, winding and planarity. Operators use this analysis to build private candidates; the analyzer itself never mutates topology.
- **Undo:** `src/core/UndoManager.js` writes snapshots to OPFS when available and falls back to memory. Current serialization still creates JavaScript objects before disk writes.
- **Renderer:** Three.js WebGL is currently used on all tiers. Device probing detects WebGPU but does not yet activate a WebGPU renderer.
- **Workers:** modifier evaluation runs in a module Worker. There is no worker pool or chunk scheduler yet.
- **PWA:** `manifest.json` and `sw.js` provide install metadata and app-shell/runtime caching. First visit requires network access to CDN modules.
- **Local-only:** scenes are stored in the browser; import/export uses local file pickers. No cloud sync or remote project database exists.
- **Transform frame:** modal transforms capture the camera basis, viewport bounds, pointer origin and camera-to-pivot scale at start. Free movement uses the current camera-facing view plane; axis movement projects screen motion into world-axis distance; free rotation uses a camera-oriented virtual trackball.
- **Edit overlays:** `src/ui/EditModeOverlay.js` draws live polygon edges, vertices and selected-face fills as children of the active mesh; overlays do not replace editable topology or intercept picking.
- **Region selection:** `src/input/SelectionGestureController.js` captures box/circle/lasso drags before OrbitControls; `src/core/ScreenRegion.js` computes continuous projected edge/region overlap intervals; `src/operators/SelectionOperators.js` ray-checks candidates against the visible mesh surface before changing selection.
- **Face operations:** `src/operators/FaceOperationModal.js` rebuilds Extrude/Inset previews from immutable source topology, validates each candidate before display/commit, anchors viewport drags on the actual pointer-down, restores the full snapshot on cancel and records one undo step on confirm. Extrude constructs a private candidate for one face or one connected, consistently wound, coplanar region with a single simple boundary; it derives direction from the region's Newell normal and validates topology/triangulation before replacing the source. Inset offsets one connected coplanar face-region boundary with shared miter corners while preserving inner face topology. `BevelModal` also supports transactional Face Bevel for one connected planar region with one simple boundary. Convex, collinear and supported reflex/concave corners use a shared inward offset; the private candidate must preserve a simple inner boundary and pass topology, triangulation, miter and transition-wall planarity/convexity checks. Acute reflex corners that exceed the miter envelope, holes, multiple loops, disconnected regions and non-planar regions reject non-destructively. Existing Edge Bevel remains a separate path.
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
│   │   ├── FaceRegionBoundary.js # Shared read-only face-region boundary/loop analysis
│   │   ├── SceneDocument.js    # Scene, objects, serialization and restore
│   │   ├── ScreenRegion.js      # Exact 2D segment/box-circle-lasso intersection intervals
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
│   │   ├── LoopCutModal.js     # Transactional interactive loop-cut preview and slide
│   │   └── BevelModal.js       # Transactional multi-edge bevel, segments and profile preview
│   │   └── FaceOperationModal.js # Transactional face Extrude/Inset preview and undo
│   ├── ui/
│   │   ├── Viewport.js         # Three.js viewport, navigation, pointer origin and overlay lifecycle
│   │   └── EditModeOverlay.js  # Non-destructive vertex/edge/face selection display
│   ├── workers/modifier.worker.js # Background modifier evaluation
│   ├── main.js                 # App composition, commands and UI bindings
│   └── styles.css              # Responsive desktop/mobile styling
├── .gitignore
├── tests/
│   ├── HalfEdgeMesh.test.js    # Node topology/triangulation regression tests
│   ├── PlanarInset.test.js     # Connected planar-region Inset geometry regressions
│   ├── FaceRegionBoundary.test.js # Shared boundary loops, holes, concavity and safety regressions
│   ├── FaceRegionBevel.test.js # Transactional face-region Bevel geometry/modal regressions
│   ├── PlanarExtrude.test.js   # Validated concave/rotated planar-region Extrude regressions
│   ├── BevelModal.test.js      # Bevel preview/confirm/cancel regression tests
│   ├── LoopCutModal.test.js    # Loop-cut preview/confirm/cancel regression tests
│   ├── MixedFanBevel.test.js    # Mixed terminal/internal Bevel fan regression matrix
│   ├── ScreenRegion.test.js     # Screen-space edge/region intersection regressions
│   ├── FaceOperationModal.test.js # Face-operation preview/undo/safety regressions
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
| GitHub Pages deployment | Working after workflow correction | Two-job artifact/deploy pipeline; triggers after successful unpack completion and normal main pushes excluding uploads. Latest deployed baseline for v0.1.33: `main` commit `b12c14eca2ad0054a86a1b1a439fef8e92c35291` (Pages run #41 succeeded on 2026-11-27). |
| Bl3nd branding/PWA | Working | Bl3nd header/title, manifest identity, app icons, service worker cache-version migration. |
| Startup progress/error UI | Partial | Staged progress and visible exceptions. Starter cube now initializes directly through `SceneDocument`, outside command dispatch and undo snapshot I/O; viewport framing and initial panel refresh are isolated as non-fatal steps. Real-browser verification remains. |
| Device capabilities | Partial | Detects tier, memory, CPU threads, WebGPU, WebGL2 and OPFS. Tier affects render pixel ratio/history budget; WebGPU is not activated. |
| 3D viewport | Partial | Three.js WebGL renderer, grid, axes, orbit/pan/zoom, standard views and framing. |
| Command bus | Working | Named command registration and snapshot-based undo boundaries. |
| Half-edge topology | Partial | Vertex/Edge/HalfEdge/Face records and adjacency. Import reconstructs safe coplanar regions; polygon rendering uses ear clipping for simple concave faces. Diagnostics cover invalid positions/faces, duplicates, non-manifold edges, inconsistent winding, isolated vertices, non-planar/self-intersecting faces and triangulation failures. A shared read-only face-region analyzer now reports connected components, ordered boundary loops, planar nesting (outer loops/holes), region-facing convex/reflex corners, winding and planarity. The Face Bevel operator uses that analysis to build a private candidate for one connected planar region with one simple boundary. Convex, collinear and supported reflex/concave corners are accepted only when the inner offset and every transition wall pass geometric and topology validation. A conservative repair action handles only malformed/duplicate faces, orientable manifold winding and orphan vertices; this is not a production manifold kernel. |
| Object mode | Working | Primitive creation, object selection/deletion and object transforms. |
| Edit mode | Partial | Visible edge/vertex overlays and selected-face tint; click/Shift-click, Select All / Deselect / Invert, box/circle/lasso region selection with ray-checked visibility, selection-aware vertex/edge/face deletion and constrained planar dissolve. Extrude has an immutable-source modal preview with signed distance, numeric/drag adjustment, validation, cancel and one-step undo; it builds a private candidate, uses the shared face-region analyzer and connected region's Newell normal, and accepts one face or one connected consistently wound/coplanar multi-face region with a single simple boundary, including concave and arbitrarily rotated planar regions. Invalid distances, disconnected/multi-loop regions and topology-invalid candidates reject without source mutation. Inset now uses the same face-region boundary analyzer and one constant inward offset for a connected coplanar face region, creates shared mitered border quads and retains the selected inner-face topology. Simple concave regions work when the offset remains simple; disconnected regions, holes/multiple loops, non-planar or inconsistently wound faces, excessive miters and collapsing/self-intersecting offsets reject without source mutation. It uses a conservative miter join and is not full Blender Inset/BMesh parity. Subdivision remains first-pass. Loop/ring selection has topology-based quad/fan traversal; ring traversal can pass a geometrically unambiguous extraordinary all-quad pole but stops at boundaries, mixed-face fans and ambiguous poles. Safe topology repair handles malformed/duplicate faces, orientable winding and orphan vertices. Loop Cut previews validated convex planar quad strips and supports modal horizontal sliding, precision movement, numeric offsets, keyboard nudges, 1–8 evenly spaced cuts, confirmation and cancellation. Loop Cut itself still does not traverse extraordinary poles. Face Bevel is a one-segment raised-region transition. It now supports convex, collinear and validated reflex/concave corners when the inner offset remains inside/simple and every perimeter wall passes planarity/convexity/topology checks; acute reflex corners requiring excessive miters, holes, multiple loops, disconnected selections and non-planar input still reject before source mutation. |
| Modal transforms | Partial | Free G follows the current camera-facing view plane; axis movement converts projected pointer travel into global world units; Shift+axis uses a camera-derived perpendicular plane; free R uses a camera-oriented virtual trackball; numeric commit/cancel remain. Local orientation, snapping and full Blender pivot parity remain incomplete. |
| 3D cursor/pivot | Partial | Cursor placement and UI pivot selection exist; pivot math is incomplete. |
| Modifiers | Partial | Worker-based midpoint subdivision, mirror, array and solidify; not Blender-equivalent. |
| Undo/redo | Partial | OPFS snapshots with memory fallback; current snapshots also preserve per-object vertex/edge/face selections. Large snapshots can temporarily increase RAM. |
| Model I/O | Partial | GLB, GLTF, OBJ and STL browser import/export paths; complex scenes/materials/animation need validation. |
| Desktop/mobile input | Partial | Desktop left-drag orbit, right-drag/Shift+left-drag pan and wheel zoom; B/C/L or the viewport menu activate box/circle/lasso drags, with Esc returning to click selection; Shift adds. Projected edges use continuous segment/region overlap intervals with visibility ray checks. Alt+L expands selected quad-edge loops; Ctrl+Alt+L expands supported vertex-fan rings. User confirms mobile startup/navigation/Bevel/undo checks and the v0.1.27 corner/multi-edge region-selection fix pass. The PC browser regression is untested and explicitly deferred because the user cannot access a PC soon; it does not block continued operator development. Device/browser version details were not supplied. |
| Pie menus | Partial | Compact command menus; not true radial Blender pie menus. |
| Bevel/sculpt | Partial | Existing edge Bevel supports one edge, exactly two adjacent edges at one closed tri-valent corner, or one simple connected path of three to eight consecutive edges. Face-region Bevel has a transactional one-segment preview for one connected, consistently wound planar region with one simple boundary. Convex, collinear and validated reflex/concave corners are supported when the inward offset remains inside/simple and every transition wall passes planarity, convexity and topology checks; acute excessive-miter cases, holes, multiple loops, disconnected regions and non-planar input reject safely. Face Bevel currently uses one transition segment, couples height to width and has no profile shaping; this is not Blender parity. Both endpoints and internal junctions accept closed valence-three through valence-six fans. Internal junctions use shared-face miters; higher-valence internal and terminal fans add ordered, uniquely oriented cap patches, triangulated with individually planar faces. The full candidate must pass manifold/winding, cap-boundary, planarity/convexity and triangulation checks. Valence-five/six at any chain vertex scales profile amplitude to 25% when segmented. The new suite covers valence-four through valence-six terminal and internal fans, both-end valence-six chains, reversed path order, rotated geometry, all 1–8 segment counts and modal commit/cancel/undo; valence-seven fans still reject. v0.1.25 covers all nine terminal/internal valence pairings from four through six at 1, 4 and 8 segments in rotated geometry; strongly skewed affine candidates that fail planar validation reject without source mutation. Existing 360-path cube sweep, eight-edge prism chain, independent miter pairs and independent single-edge bevels remain supported. All supported selections accept 1–8 segments; concave, rounded and convex profiles are available. Boundaries, non-manifold/invalid meshes, branches, cycles, chains longer than eight, mixed connected/disconnected selections, fans above valence six, ambiguous cap boundaries and concave/non-planar affected faces remain unsupported. Sculpting is not implemented. |
| Exact Blender clone | Not Started | No claim of full Blender operator, BMesh, UI, or file-format parity. |

## Known Issues & Technical Debt

1. WebGPU is detected but the renderer is still Three.js WebGL.
2. Imported geometry is initially triangulated, then adjacent coplanar triangles are merged only when exactly two triangles share each joined edge and a single convex boundary can be reconstructed. Concave faces, holes, duplicated seam vertices, inconsistent winding and non-manifold regions may remain triangulated or lose source polygon semantics.
3. Edit Mode box/circle/lasso selection projects sub-elements into screen space and ray-checks candidates against the visible surface. Vertices and ear-clipped face triangles are point-tested; edges use continuous segment/region overlap intervals with several samples inside each actual overlap interval, avoiding misses when a narrow finger-drawn region falls between fixed edge samples. Visibility ray checks still prevent selecting hidden geometry. Edge loops cross opposite edges in quads; edge rings traverse opposite edges in closed all-quad vertex fans, including extraordinary poles only when a unique near-antiparallel pairing is found. These deterministic passes stop at boundaries and ambiguous poles and are not identical to all Blender select modes. The v0.1.26 mobile run initially missed corner/multi-edge selection; the user confirmed the v0.1.27 correction works on mobile. Desktop behavior remains unverified until the user can test it, but is not a development blocker.
4. Delete is selection-mode aware: deleting a vertex or edge removes incident faces and dependent unused vertices; face deletion removes selected faces. Dissolve supports consistently wound, single-boundary, simple planar patches, including concave boundaries. Non-planar, self-intersecting, boundary-only and non-manifold cases are deliberately skipped without mutation. Bevel supports a single edge, one two-edge miter, or one simple connected path of three to eight consecutive edges. Both chain endpoints and internal path vertices support closed valence-three through valence-six fans. Valence-four junctions add one triangular patch; valence-five/six junctions add a center-fanned patch following every cut point along the opposite fan arc. The fan boundary is oriented only when exactly one winding opposes all existing boundary half-edges, must be simple and convex in projection, and is triangulated into individually planar faces before final manifold validation. Multi-segment profile subdivision keeps the patch boundaries welded to neighboring bevel strips; valence-five/six profile amplitude at any chain vertex is scaled to 25% during segmented bevels to guard against foldovers. Four- through seven-edge tri-valent paths remain exhaustively tested across all 360 simple paths on a cube; mixed valence-four/five/six fixtures cover reversed order, repeated internal patches, rotated geometry and all 1–8 segment counts. The v0.1.25 matrix covers all nine terminal/internal fan-valence pairings (4–6) at 1, 4 and 8 segments; strongly skewed affine variants can yield a non-planar bevel candidate and are explicitly required to reject without source mutation. The segmented eight-edge tri-valent prism chain remains supported. Two to four independent two-edge miter pairs and up to eight pairwise-disjoint single edges remain supported. These validated envelopes support 1–8 segments and a 0–1 profile (0 concave, 0.50 rounded default, 1 convex); the multi-segment strip uses triangular bands and shared miter subdivisions are welded. Cycles, branches, chains longer than eight selected edges, mixed connected/disconnected selections, fans above valence six at either endpoints or internal junctions, overlapping caps and ambiguous intersections reject before source mutation. Multi-pair mitering uses sequential temporary candidates, requires disjoint affected-face neighborhoods and validates the combined candidate before commit. Boundary edges, fans above valence six at either chain endpoint or internal junction, non-manifold or invalid inputs and ambiguous/excessive miters remain unsupported. Profile shaping does not curve the shared miter seam. Loop Cut is implemented for validated planar convex quad strips with up to eight evenly spaced cuts, but does not traverse extraordinary poles or multiple distinct seed loops. Extrude builds a private candidate for one face or one connected, consistently wound, coplanar region with a single simple boundary. It uses the boundary Newell normal (not an average of face normals), supports concave and arbitrarily rotated planar regions plus signed distances, and validates topology/triangulation before atomic source replacement; disconnected, multi-boundary, non-planar, invalid or unsupported selections reject without mutation. Inset now offsets a single-face or connected multi-face planar region with one shared constant-distance boundary offset. Miter joins are shared at every boundary vertex; original interior vertices and edges remain in the inset region. Concave regions are accepted only when every offset point remains inside, the inner boundary preserves winding and does not self-intersect, all resulting faces triangulate, and the candidate passes topology validation. Disconnected selections, holes/multiple loops, inconsistent winding, non-planar source faces, excessive miters and collapsing offsets reject without source mutation. The offset distance is `amount × shortest boundary-edge length`, with amount limited to 0.005–0.9. Open planar sheets are supported and retain their existing outer boundary-edge status. This is conservative planar-region miter inset, not Blender BMesh parity. Midpoint subdivision retains topology/normal limitations. The shared face-region analyzer remains read-only: it reports ordered loops, components, nested holes (only when planar) and region-facing corner classes. Face Bevel uses those results but accepts only one connected planar single-loop region. Reflex/concave corners are supported only when the inward offset remains inside the source, preserves winding, remains simple, stays within the guarded miter limit and all transition walls validate as planar/convex; excessive-miter, folded, self-intersecting or otherwise invalid candidates reject before source mutation. Holes, multiple loops, disconnected selections and non-planar input remain unsupported. Existing Extrude/Inset retain their own one-connected-planar-single-loop constraints; never select an arbitrary loop or treat a hole as an outer boundary.
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
19. `HalfEdgeMesh.analyzeFaceRegion()` is the shared read-only boundary source for face-region operators. It can report multiple components and loops, but current Extrude, Inset and Face Bevel only accept one connected planar region with one simple loop. Do not silently choose one loop or treat holes as outer boundaries. Reflex/concave corners are classified from the selected-region side. Face Bevel accepts them only when the inward offset, miter envelope, simple-loop checks and complete transition-wall candidate all validate; acute/excessive miters, folded walls and self-intersections reject without mutation. Non-planar loops can be topologically ordered but do not receive planar nesting/corner classification.
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
- [x] Implement a transactional Bevel preview for one edge and a guarded multi-edge extension for up to eight pairwise-disjoint neighborhoods.
- [x] Add a validated two-edge connected Bevel miter at one closed tri-valent shared corner; intersect the shared-face offset lines, create two joined strips and retain one manifold miter edge.
- [x] Extend connected Bevel to two to four independent two-edge miter junctions in one validated transaction; reject overlapping affected-face neighborhoods.
- [x] Extend connected Bevel to three-to-eight-edge paths with multiple consecutive miters and validated valence-four through valence-six cap patches at both endpoints and internal junctions; higher valences remain guarded.
- [x] Add bevel segment count and profile shaping (1–8 segments; concave, rounded and convex profiles).
- [x] Add transactional modal Extrude preview for a single face or connected planar region, plus single-face/connected-region Inset preview with shared miter offsets, drag/numeric input, candidate validation, cancel and one-step undo.
- [x] Add shared read-only face-region boundary analysis for components, ordered loops, hole nesting, region-facing concave/convex corners, winding and planarity; keep unsupported geometries non-destructive.
- [x] Implement the first transactional Face Bevel preview for one connected planar region with one simple boundary; validate private candidates and reject unsupported regions without mutation.
- [x] Extend Face Bevel to supported reflex/concave corners when the inward offset remains simple and every miter/transition wall validates; acute/excessive-miter cases still reject non-destructively.
- [ ] Add multiple Face Bevel transition segments, profile shaping and independently adjustable bevel height after the Android acceptance pass.
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

## Next Roadmap Step

Complete Android Chrome acceptance for v0.1.31 connected-region Inset and concave multi-face Extrude, v0.1.33 convex Face Bevel, and v0.1.34 concave L/U Face Bevel. Verify supported previews, drag/numeric amount changes, Cancel, Apply, Undo/Redo, restored viewport gestures, and safe rejection of acute/excessive-miter, hole, disconnected and non-planar selections. Do not treat automated geometry tests as browser acceptance. After that acceptance pass, implement Face Bevel multi-segment transitions and profile shaping, then decouple bevel height from width; keep each stage gated by topology, planarity, self-intersection and undo regressions. Desktop Chrome/Edge regression remains deferred until the user can access a PC; do not claim desktop acceptance before that run. Loop Cut traversal through extraordinary poles remains a separate research task.
