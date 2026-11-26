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
- Edge Select: select one or more seed edges, then `Alt+L` expands through opposite edges of connected quads; `Ctrl+Alt+L` follows opposite edges through closed all-quad vertex fans. At extraordinary poles, it pairs only a unique near-antiparallel edge direction (at least 155° apart with a clear best match); boundaries, mixed-face fans, non-manifold fans and ambiguous pairings are skipped. The Select menu exposes both operations.
- Edit Mode `X` / `Delete`: delete selected topology; `Shift+X`: dissolve selected topology; the viewport Select menu offers the same actions.
- Edit Mode `E` / `I`: Extrude / Inset
- Edge Select: select one supported interior edge, exactly two adjacent edges at one closed tri-valent corner, exactly three consecutive edges forming a simple chain, two to four separate two-edge miter pairs (up to eight selected edges), or up to eight pairwise-disjoint interior edges, then use `Ctrl+B` or **Bevel** in the Edit Mesh panel. Drag horizontally to preview width; hold `Shift` for precision, use `←/→` for small width changes or type a factor from `0` to `0.95`. `Enter` applies the preview in one undoable operation; `Esc` or right-click cancels. On mobile, drag or use the on-screen numeric pad. A three-edge chain builds two shared-face miters and keeps two trimmed terminal corner faces as closed end caps. Longer chains, branches, cycles and overlapping independent neighborhoods are rejected. Convex planar boundary-free neighborhoods with closed tri-valent endpoint fans are required; boundaries, extraordinary poles, non-manifold topology and ambiguous corners are rejected without mutation.
- Edge Select: select exactly one seed edge, then `Ctrl+R` or **Loop Cut** in the Edit Mesh panel. Drag horizontally to slide the live cut preview; hold `Shift` for precision, use `←/→` for 1% steps (Shift for 0.1%), or type an offset from `0` to `1`. `Enter` applies and `Esc` cancels. Use the mouse wheel or `+` / `-` to adjust 1–8 evenly spaced cuts; all cuts slide together. On mobile, drag in the viewport, type the slide value, or use the on-screen cut-count buttons.
- `Shift + A`: add menu; `Z`: shading menu
- Numpad `1/3/7`: front/right/top views; scroll: zoom
- Desktop: left-drag or middle-drag to orbit; right-drag or Shift+left-drag to pan; scroll to zoom; a stationary click selects
- Mobile: one-finger orbit, two-finger pan/zoom, long-press to place cursor and bottom quick actions; choose Box / Circle / Lasso from the viewport Select menu for drag selection, then return to Click Select to orbit with one finger.
- Edit Mesh panel: Delete and Dissolve use the active vertex/edge/face selection; Validate Mesh reports topology problems, and Repair Safe Issues handles only conservative repairs. Loop Cut is available from the panel or Ctrl+R while one seed edge is selected. Bevel is available from the panel or Ctrl+B for one supported edge, exactly two adjacent edges at one tri-valent corner, exactly three consecutive edges forming a simple chain with two miters and two closed end caps, two to four disjoint two-edge miter pairs, or up to eight pairwise-disjoint single-edge neighborhoods; all previews are transactional and commit one undo step.
- Concave planar polygons are ear-clipped for rendering and selection. Dissolve can merge a simple concave planar patch; non-planar, self-intersecting and non-manifold patches remain unchanged.

Run all topology/operator regression tests with Node: `node --experimental-default-type=module --test tests/*.test.js`.

See [`HANDOFF.md`](./HANDOFF.md) for architecture, exact implementation status, limitations and roadmap. This is an initial engineering foundation, not yet a feature-for-feature Blender clone.


### Safe topology repair

In Edit Mode, **Repair Safe Issues** removes malformed faces and duplicate faces, reorients consistently orientable manifold face components, and compacts unused vertices. It deliberately does not guess how to repair non-manifold edges, non-planar faces, self-intersections, or contradictory/non-orientable components; those remain in the validation report for manual correction. Use **Validate Mesh** before and after repair to inspect what changed.

### Bevel

Select one edge in Edge Select mode on a closed manifold mesh. The single-edge template is limited to an edge whose two endpoints each have exactly three incident faces, with all four affected faces simple, planar and convex. It replaces the selected edge with a four-sided bevel strip and selects its new perimeter.

Connected bevel supports exactly two adjacent edges sharing one closed, tri-valent corner, or exactly three consecutive selected edges forming one simple path. The two-edge case intersects offset lines in the common face, creates one shared miter edge and adds two joined bevel strips. The three-edge chain creates two such miters, one at each internal vertex, and retains the two trimmed terminal corner faces as closed end caps. Chains must have four distinct path vertices and closed tri-valent endpoint fans; cycles, branches, longer chains, higher-valence fans, overlapping cap regions and ambiguous miter intersections are rejected before source mutation. You can also select two to four separate two-edge pairs and process their miter junctions in one transaction when their affected face neighborhoods are disjoint. Alternatively, select up to eight pairwise-disjoint single edges to bevel independent neighborhoods together. The amount is a normalized factor of the safe maximum (45% of the shortest neighboring edge), not a world-unit distance.

Press **Ctrl+B** or choose **Bevel** in the Edit Mesh panel. Drag horizontally, hold `Shift` for precision, use arrow keys to nudge, or type a factor from `0` to `0.95`. `Enter` commits one undoable operation; `Esc` or right-click restores the original mesh. Every candidate is rebuilt from the original preview source, compacted, topology-validated, and checked for planar convex affected faces before the source is replaced. Boundary edges, non-manifold or inconsistently wound meshes, existing topology warnings, non-planar/concave faces, extraordinary endpoints, ambiguous miter intersections and excessive miters are rejected without mutation. Bevel segments, profile shaping and open-boundary bevels are not implemented.

### Loop Cut

Select exactly one edge in Edge Select mode, then press **Ctrl+R** or use **Loop Cut** in the Edit Mesh panel. The operation follows the quad-opposite edge loop and previews 1–8 evenly spaced cuts, sharing an interpolated vertex per cut and crossed edge. Drag horizontally to slide the cut group; hold `Shift` for fine movement, use arrow keys for small nudges, or type a group offset between `0` and `1`. Use the mouse wheel or `+` / `-` to change the number of cuts. `Enter` commits one undoable operation; `Esc` or right-click restores the original mesh. Mobile users can drag, enter an offset, or use the on-screen cut-count controls. Each crossed quad is split into `cuts + 1` quads and all new cut edges remain selected. It currently accepts only consistently wound, convex, planar quad strips. Non-manifold, non-quad, concave, non-planar, or inconsistently wound paths are rejected before mutation. Loop Cut itself still stops at extraordinary poles; the pole-aware behavior currently applies only to Edge Ring selection. N-gons, multiple distinct seed loops and Blender-equivalent edge sliding remain unsupported.
