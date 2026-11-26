# Bl3nd — Browser 3D Workspace

Bl3nd is a zero-build, mobile-first browser 3D modeling foundation. The app runs as static HTML/CSS/native JavaScript modules and uses Three.js from a pinned CDN import map.

## First deployment

1. Create a GitHub repository with a `main` branch.
2. Create `.github/workflows/unpack-update.yml` in the GitHub web editor using the exact bootstrap workflow supplied with this release.
3. In repository Settings, set Actions → General → Workflow permissions to **Read and write permissions**. Set Pages → Build and deployment → Source to **GitHub Actions**.
4. Upload `initial-release.zip` into the repository's `uploads/` folder. The action extracts it into the repository root, removes the uploaded ZIP and commits the files. A successful unpack run automatically triggers the GitHub Pages deployment workflow.

The application displays staged startup progress and keeps the exact startup error visible if initialization fails. The progress percentage represents completed initialization phases, not downloaded-byte progress.

The application does not require a build command. Open the GitHub Pages URL after the deployment workflow completes.

## Controls

- `Tab`: Object/Edit Mode
- `G`, `R`, `S`: start Move, Rotate or Scale; move the pointer to preview
- Free `G` follows the current camera view plane, so screen-right/screen-up move with the current view
- `X`, `Y`, `Z`: constrain to a global axis; `Shift + X/Y/Z`: constrain move/scale to the plane perpendicular to that axis
- Free `R` uses a camera-oriented virtual trackball; `R` + `X/Y/Z` rotates around a global axis
- Numeric keys, `Enter`, `Esc`: enter a value, apply, cancel
- Press `G/R/S` with the pointer over the viewport to begin there; otherwise the viewport center is used
- Edit Mode `1/2/3`: vertex/edge/face selection; selected topology is drawn directly over the mesh
- Edit Mode `Shift-click`: add/remove elements; `A`: select all; `Alt+A`: deselect; `Ctrl+I`: invert selection
- Edit Mode `B` / `C` / `L`: Box / Circle / Lasso selection; `Esc` returns to click selection. Hold `Shift` while dragging to add.
- Edge Select: select one or more seed edges, then `Alt+L` expands through opposite edges of connected quads; `Ctrl+Alt+L` follows opposite edges through closed valence-four vertex fans. The Select menu exposes both operations.
- Edit Mode `X` / `Delete`: delete selected topology; `Shift+X`: dissolve selected topology; the viewport Select menu offers the same actions.
- Edit Mode `E` / `I`: Extrude / Inset
- `Shift + A`: add menu; `Z`: shading menu
- Numpad `1/3/7`: front/right/top views; scroll: zoom
- Desktop: left-drag or middle-drag to orbit; right-drag or Shift+left-drag to pan; scroll to zoom; a stationary click selects
- Mobile: one-finger orbit, two-finger pan/zoom, long-press to place cursor and bottom quick actions; choose Box / Circle / Lasso from the viewport Select menu for drag selection, then return to Click Select to orbit with one finger.
- Edit Mesh panel: Delete and Dissolve use the active vertex/edge/face selection; Validate Mesh reports invalid positions/faces, non-manifold edges, inconsistent winding, non-planar or self-intersecting polygons and triangulation failures without automatically repairing geometry.
- Concave planar polygons are ear-clipped for rendering and selection. Dissolve can merge a simple concave planar patch; non-planar, self-intersecting and non-manifold patches remain unchanged.

Run the topology regression tests with Node: `node --experimental-default-type=module --test tests/HalfEdgeMesh.test.js`.

See [`HANDOFF.md`](./HANDOFF.md) for architecture, exact implementation status, limitations and roadmap. This is an initial engineering foundation, not yet a feature-for-feature Blender clone.
