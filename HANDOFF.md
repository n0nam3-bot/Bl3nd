# Bl3nd — Living Engineering Handoff

## AI Agent Execution Rules

**Any future AI agent must read this entire `HANDOFF.md` before inspecting or changing project code.** This document is the single source of truth for project architecture, implemented behavior, limitations, and next steps.

1. Preserve the **zero-build, mobile GitHub workflow**. The deployed application is static HTML, CSS, and native browser ES modules. Never introduce `npm install`, a Node.js runtime requirement, Vite, Webpack, a bundler, a terminal-only setup step, or a local IDE requirement.
2. Treat this handoff as a living engineering record. Every update must revise the exact subsystem status, known issues, repository file tree, roadmap, and chronological changelog before delivery.
3. Do not regress working features or silently claim partial features are complete. Distinguish implemented, partial, experimental, and not-started behavior.
4. **Every update ZIP is delta-only**: include only newly created or modified files, retaining their exact repository-relative paths. Always include the updated root `HANDOFF.md`. Do not include unchanged files, generated build output, dependencies, or a duplicate repository archive.
5. The only exception to the no-snippet rule is the one-time bootstrap file `.github/workflows/unpack-update.yml`, which the owner must create once through GitHub's mobile web interface. After bootstrap, deliver code changes as a downloadable ZIP.
6. The owner uploads each update ZIP into `uploads/` through GitHub's web UI. The `unpack-update.yml` workflow extracts package contents into the repository root, deletes processed ZIPs, and preserves `uploads/.gitkeep`.
7. Keep GitHub Pages deployment build-free. `pages.yml` publishes the repository's static site files directly. The one-time repository setting must use **Settings → Pages → Build and deployment → Source → GitHub Actions**.
8. Do not add secrets, API keys, server dependencies, or account-bound services to the client application. External CDN access is currently required for Three.js and its examples modules; cache behavior is documented below.

## Architecture & Invariants

### Runtime model
- Static root: `index.html`.
- Native ES modules: browser `<script type="module">` imports under `src/`.
- Import map: pinned Three.js `0.180.0` modules from jsDelivr; no package manager or build step.
- PWA shell: `manifest.json` and `sw.js`; first visit needs a network connection for the CDN modules. The service worker caches the application shell and successfully fetched CDN scripts for later use. Cache namespace is versioned (`bl3nd-shell-v2` / `bl3nd-runtime-v2`) so deployed updates retire stale FORGE-era assets.
- The project must remain deployable at a GitHub Pages project path, not only at `/`.

### Core/presentation separation
- `src/core/` owns device capability probing, command dispatch, scene document serialization, half-edge topology, and undo/redo persistence.
- `src/operators/` owns modal transforms and mesh-edit operations.
- `src/modifiers/` and `src/workers/` own non-destructive modifier evaluation away from the UI thread.
- `src/input/` translates keyboard and touch activity into application actions.
- `src/ui/` owns the Three.js viewport and browser presentation.
- `src/io/` owns model file import/export.
- UI and input actions should route through the standardized `CommandBus` names. Do not put mesh algorithms in DOM event handlers.

### Architectural invariants
- **Headless Command Bus:** commands use stable names such as `object.add_primitive`, `mode.toggle_edit`, `transform.modal_start`, and `mesh.extrude_region`. New actions belong in command handlers, not duplicated UI-specific logic.
- **Half-Edge Mesh:** the editable mesh is represented by `Vertex`, `Edge`, `HalfEdge`, and `Face` records with origin/next/prev/twin/edge/face connectivity. Three.js `BufferGeometry` is a render cache generated from this editable topology.
- **Undo/redo:** document snapshots are persisted as JSON files in OPFS (`navigator.storage.getDirectory()`) where available. Memory fallback is required because OPFS is not exposed by every browser/context. OPFS persistence is best-effort and can be evicted by the browser or user.
- **Adaptive device tier:** startup probes device memory hints, CPU thread count, WebGPU adapter availability, WebGL2, and OPFS. The tier currently controls pixel-ratio and undo-history budgets. **The renderer is currently WebGL-based on all tiers; actual WebGPU renderer selection is not yet implemented.**
- **Workers:** modifier stack evaluation uses a module Worker. This initial implementation uses one worker per app instance; hardware concurrency is probed but a multi-worker scheduler is not yet implemented.
- **PWA/offline:** the service worker caches the static app shell and runtime CDN scripts. Offline use is only dependable after a successful online load and browser cache retention; large Wasm modules are not bundled or preloaded.
- **No server:** scene data is local to the browser session. Import/export uses the device file picker and object URLs; there is no cloud sync or remote project database.

## Repository File Tree

```text
.
├── .github/
│   └── workflows/
│       ├── unpack-update.yml       # Extracts uploaded ZIP updates and dispatches Pages deployment
│       └── pages.yml               # No-build GitHub Pages deployment
├── assets/
│   ├── icon.svg                    # Bl3nd vector PWA/app icon
│   ├── icon-192.png                # Home-screen icon
│   └── icon-512.png                # Installable PWA icon
├── uploads/
│   └── .gitkeep                    # Keeps the mobile update inbox directory in Git
├── src/
│   ├── core/
│   │   ├── CommandBus.js           # Named command registry and undo boundary
│   │   ├── DeviceCapabilities.js   # PC/Mobile, WebGPU, WebGL2, OPFS capability probe
│   │   ├── HalfEdgeMesh.js         # Editable polygon half-edge topology and mesh ops
│   │   ├── SceneDocument.js        # Scene objects, transforms, serialization and restore
│   │   └── UndoManager.js          # OPFS-backed undo/redo snapshots with memory fallback
│   ├── input/
│   │   ├── KeyboardController.js   # Blender-inspired keyboard command bindings
│   │   └── TouchController.js      # Long-press cursor placement and touch lifecycle
│   ├── io/
│   │   └── ModelIO.js              # GLB/GLTF/OBJ/STL import and export
│   ├── modifiers/
│   │   └── ModifierStack.js        # Non-destructive modifier records and Worker bridge
│   ├── operators/
│   │   ├── MeshOperators.js        # Extrude, inset, delete, subdivide wrappers
│   │   └── ModalTransform.js       # Move/rotate/scale modal state machine
│   ├── ui/
│   │   └── Viewport.js             # Three.js viewport, orbit controls, picking and views
│   ├── workers/
│   │   └── modifier.worker.js      # Subdivision, mirror, array and solidify evaluation
│   ├── main.js                     # Composition root, command registration and UI bindings
│   └── styles.css                  # Responsive desktop/mobile presentation
├── .gitignore
├── README.md                       # First deployment and quick controls
├── HANDOFF.md                      # Single source of truth; update with every ZIP
├── index.html                      # Static app entry and import map
├── manifest.json                   # PWA manifest
└── sw.js                            # App-shell and runtime module caching
```

## Current State

Status meanings: **Working** = implemented end-to-end in the current foundation; **Partial** = usable subset or known behavioral gaps; **Not Started** = no implementation yet.

| Subsystem | Status | Current implementation |
|---|---|---|
| Zero-build static app | Working | Native modules and pinned Three.js CDN import map; no compile step. |
| GitHub mobile ZIP workflow | Working after setup | ZIP extraction, safe path checks, cleanup, bot commit, and Pages workflow dispatch. |
| GitHub Pages workflow | Working after setup | Static artifact copied without a frontend build. Repo Pages source still needs one-time configuration. |
| Responsive PWA shell | Partial | Bl3nd manifest/icons, versioned service worker cache, responsive layout; offline/CDN cache behavior is browser-dependent. |
| Device capability probe | Partial | Detects tier, memory hint, CPU threads, WebGPU adapter, WebGL2 and OPFS. Tier currently affects pixel ratio and history budget only. |
| 3D renderer | Partial | Three.js WebGL renderer, grid, axes, orbit/pan/zoom, standard view buttons and frame selected. No active WebGPU backend. |
| Command bus | Working | Named commands, handler registry, and document snapshot boundaries. Some continuous input updates use non-undo commands. |
| Half-edge topology | Partial | Vertex/Edge/HalfEdge/Face adjacency, triangle-based imported topology, boundary edges, face selection sets, serialization. Not a full production manifold kernel. |
| Object mode | Working | Add cube, sphere, cylinder, plane; select objects; delete; transform properties; object transforms. |
| Edit mode | Partial | Vertex/edge/face selection mode, face picking, face extrusion, inset, face delete, triangle subdivision. UI selection visualization and advanced selection tools remain limited. |
| Modal transforms | Partial | G/R/S, axis locks, Shift+axis plane intent, numeric entry, Enter commit, Esc/right-click cancel. Pivot behavior, local axes, precise mouse-plane mapping and transform constraints need further work. |
| 3D cursor | Partial | Shift+right-click on viewport, mobile long-press, cursor coordinates and add-at-cursor. Cursor visualization is a projected reticle. |
| Pivot system | Partial | UI setting is stored; median/individual/cursor pivot is not yet applied consistently to transform math. |
| Modifier stack | Partial | Worker evaluation for triangle subdivision, mirror, array and solidify. Subdivision is midpoint triangle subdivision, not Catmull-Clark; mirror does not weld the seam; per-modifier controls are minimal. |
| Undo/redo | Partial | OPFS snapshots, memory fallback, bounded history, undo/redo buttons and shortcuts. Browser storage quota/eviction and crash recovery need more testing. |
| GLB/GLTF/OBJ/STL I/O | Partial | Browser loader/exporter paths for each format. Complex materials, skinning, animation, multiple material slots and very large model memory use are not fully validated. |
| PC/Mobile controls | Partial | Mouse MMB orbit, Shift+MMB pan, right-drag pan, wheel zoom; touch orbit and pinch/pan; mobile action bar and on-screen numeric pad. Gesture conflicts require device testing. |
| Startup diagnostics/progress | Partial | Phase-based progress indicator, exact startup error panel, retry button and detailed command errors are implemented; browser runtime verification remains outstanding. Percentages mark initialization milestones, not network download bytes. |
| Blender pie menus | Partial | Contextual add and shading menus are currently compact grid menus, not true radial pie geometry. |
| Bevel / Loop Cut | Not Started | Hotkey commands report that the topology operators are not implemented. |
| Exact Blender clone | Not Started | No claim of exact operator parity, Blender file compatibility, full BMesh semantics, or full keymap parity. |
| Collaboration/cloud projects | Not Started | Local-only browser workspace. |

## Known Issues & Technical Debt

1. **WebGPU:** the app probes WebGPU but initializes `THREE.WebGLRenderer` on both tiers. Add an actual WebGPU renderer path with asynchronous initialization and a tested WebGL2 fallback before calling this adaptive renderer tier complete.
2. **Topology robustness:** `HalfEdgeMesh.fromBufferGeometry` welds vertices by rounded position and converts source triangles into triangle faces. This can merge intentional seams, lose source polygon boundaries, mishandle non-manifold inputs, and is not equivalent to Blender BMesh.
3. **Edit-mode selection:** current selection is basic face-hit-driven selection. There are no dedicated vertex/edge overlay handles, box/circle/lasso selection, linked selection, loop/ring selection, or complete hide/select semantics.
4. **Mesh operators:** bevel and loop cut are placeholders. Extrude and inset are useful initial polygon operations but have limited region validation, normals handling, and manifold safeguards. Subdivide splits triangles at edge midpoints.
5. **Modifier fidelity:** Subdivision is a triangle midpoint split, Mirror does not merge center vertices, Array has a simple offset vector, and Solidify is a basic shell. These are not yet Blender-equivalent implementations.
6. **Modal behavior:** mouse movement is a simplified viewport-space approximation. Plane constraints, local/global mode switching, snapping, proportional editing, transform orientation, individual-origin pivots, and numeric-unit expressions need implementation and tests.
7. **PWA/CDN:** the first page load requires network access to jsDelivr. A strict CSP, content blocker, CDN outage, or offline first visit can prevent startup. The service worker caches runtime script requests after successful fetch; it does not package vendor code locally. Cache names must be bumped when app-shell behavior changes; v2 now retires the stale `forge-*` caches that could keep older JavaScript alive.
8. **Startup progress:** the progress bar advances through initialization milestones. It is intentionally not represented as byte-level CDN download progress because native module imports do not expose reliable per-module byte progress. Startup errors now remain visible with their actual message and a reload action. The current repository has no `refreshModel` symbol; the reported undefined reference was consistent with stale cached JavaScript, so service-worker cache invalidation is included in v0.1.1.
9. **Mobile browser behavior:** iOS Safari may not expose `navigator.deviceMemory`; OPFS availability, persistence permission, WebGL memory ceilings, multitouch event ordering, and background-tab suspension vary. Android devices with limited graphics memory may still lose the WebGL context on heavy scenes.
10. **Large-scene memory:** current serialization creates document snapshots in JavaScript before writing them to OPFS, so peak memory can temporarily rise. No chunked scene serialization, geometry paging, inactive-object disk swap, or OPFS virtual-memory manager is implemented.
11. **Worker scheduling:** one module Worker evaluates the full mesh payload. There is no chunk scheduler, worker pool, task cancellation, progress protocol, or transfer-buffer reuse.
12. **File I/O:** imported meshes are flattened into independent document objects. Advanced GLTF scene features and STL unit conventions need validation. Exporting a very large model may temporarily duplicate substantial buffers.
13. **GitHub Actions:** the upload workflow is configured for branch `main`. Change that branch filter if the repository default branch has a different name. Set repository Actions workflow permissions to **Read and write permissions**. The first package dispatches Pages after the bot commit because a `GITHUB_TOKEN`-authored push does not automatically start a separate push-triggered workflow.
14. **ZIP safety:** archive entry paths are checked for absolute paths and parent-directory traversal. Only upload trusted project update packages; do not use this workflow as a public untrusted ZIP extraction service.

## Roadmap

### Phase 1 — Behavioral Core
- [x] Zero-build static app and GitHub mobile ZIP workflow.
- [x] Bl3nd product rebrand, refreshed app icons and PWA metadata.
- [x] Startup progress milestones, actionable startup errors and stale service-worker cache invalidation.
- [x] Command bus and document serialization boundary.
- [x] Half-edge connectivity data model.
- [x] Basic object/edit modes, primitive creation, face selection, extrude, inset, delete and subdivide.
- [x] Basic modal G/R/S, axis selection, numeric input, commit/cancel.
- [x] OPFS-backed undo/redo with fallback.
- [ ] Complete BMesh-like topology invariants, non-manifold handling, and source polygon preservation.
- [ ] Vertex/edge/face visual overlays and robust selection tools.
- [ ] Accurate local/global axes, plane constraints, snapping, transform orientation, and pivot behavior.
- [ ] Bevel (`Ctrl+B`), loop cut (`Ctrl+R`), delete menu (`X`) and additional edit operators.
- [ ] True radial pie menus and complete keyboard mapping.
- [ ] Automated browser regression checks for commands, topology, transforms, and restore.

### Phase 2 — Modifiers, Sculpt, Render
- [x] Worker-based first-pass Subdivision, Mirror, Array and Solidify modifiers.
- [ ] Catmull-Clark subdivision, seam-welded mirror, robust solidify, modifier ordering and per-modifier evaluation status.
- [ ] Actual WebGPU renderer on supported systems; WebGL2 fallback on unsupported/mobile systems.
- [ ] Multi-worker/chunked evaluation, task cancellation and low-memory mobile policy.
- [ ] Sculpt brushes, brush falloff, symmetry, remeshing and sculpt undo strategy.
- [ ] Camera/light management, material editor, render settings and browser rendering/export pipeline.
- [ ] Chunked OPFS scene snapshots and inactive-object disk offload.
- [ ] Extensive iOS Safari, Android Chrome and desktop browser test matrix.

### Phase 3 — Custom Reskin
- [x] Replace the FORGE 3D visual identity with the Bl3nd name, B-mark icon and PWA metadata.
- [ ] Add configurable workspace layouts, themes, icons, shortcuts and contextual help.
- [ ] Polish onboarding, install prompt, offline status, recovery messaging and mobile ergonomics.
- [ ] Performance profiling, accessibility audit and release-quality documentation.

## Changelog

### 2026-11-26 — `bl3nd-startup-rebrand-fix.zip` — v0.1.1
- Rebranded the browser title, visible header, PWA name, SVG/PNG icons, undo-storage namespace and export filenames to Bl3nd.
- Added a staged startup progress bar, percent display, exact startup error message and reload action. The percentage represents completed initialization stages rather than downloaded bytes. The versioned service worker is registered before the app module; an already-controlled startup page reloads once when the new worker takes control.
- Added detailed console and status reporting for command failures and fail-fast validation of the initial starter cube.
- Bumped the service-worker cache namespace to `bl3nd-shell-v2` / `bl3nd-runtime-v2` and explicitly removed old `forge-*` caches to prevent stale JavaScript from surviving deployment.
- Confirmed the current repository source has no `refreshModel` reference; the reported error is addressed as a stale-cache problem rather than by adding an unrelated global shim.

### 2026-11-26 — `initial-release.zip` — v0.1.0
- Created the no-build static PWA foundation and mobile-responsive modeling shell.
- Added Three.js WebGL viewport, orbit/pan/zoom controls, grid, axis views and primitive creation.
- Added named CommandBus, document serialization, half-edge topology records, basic edit operators and modal G/R/S transforms.
- Added OPFS-backed undo/redo snapshots with memory fallback.
- Added first-pass worker-based Subdivision, Mirror, Array and Solidify modifiers.
- Added GLB/GLTF/OBJ/STL import/export paths.
- Added browser capability probing, service-worker caching, PWA manifest and icon.
- Added upload/unpack and no-build GitHub Pages workflows.
- Documented incomplete Blender behavior explicitly; this package is an architectural foundation, not a completed Blender clone.

## Next Roadmap Step

Complete and regression-test Phase 1 topology and transform behavior: preserve polygon boundaries during import, add selectable vertex/edge overlays, correct plane/pivot/local-axis math, and implement robust bevel and loop-cut operators. Keep the delivery zero-build and delta-ZIP only.
