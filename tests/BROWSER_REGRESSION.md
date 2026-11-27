# Bl3nd Desktop / Mobile Browser Regression

This is a manual acceptance run for the deployed Bl3nd app. It checks the real browser input path and cannot be replaced by a successful GitHub Pages deployment or by the Node topology tests.

## Build under test

Open the deployed app only after the latest Pages workflow succeeds:

`https://n0nam3-bot.github.io/Bl3nd/`

Latest deployed baseline before this package is v0.1.40, `main` commit `e87ee77ee3fb1e44bec50fbbe08f601be3ba1ab3`, Pages workflow run #48 (success). After uploading v0.1.41, reload and allow the v38 service-worker cache to activate before testing.

## Desktop — Chrome or Edge

1. Open the app in a normal browser window. Wait for the startup overlay to disappear. Confirm the 3D canvas is visible, the footer says `Ready` (or an appropriate object status), and no startup error overlay remains.
2. Drag with the left mouse button to orbit. Right-drag to pan. Scroll to zoom. Confirm the camera responds in the direction of the pointer and a stationary click still selects rather than orbiting.
3. Press `Tab` to enter Edit Mode and `2` for Edge Select. Click one edge, then use Shift-click to add a neighboring edge. Confirm the overlay and selection count update.
4. Open `Select ▾` and test all three region tools: (a) Circle click/short drag centered on a visible corner, (b) a narrow Box crossing an edge at a point between the old fixed samples, and (c) a Lasso around an L-shaped two-edge corner. Both visible incident edges should highlight when they intersect the region. Repeat Box in the reverse drag direction. Confirm hidden back-side edges are not selected.
5. Select exactly two adjacent edges at one supported corner and press `Ctrl+B`. Confirm the corner miter preview opens. Drag horizontally and confirm width changes continuously while camera orbit stays paused.
6. Press `+` and `-` to change segment count. Press `]` and `[` to change profile. Confirm the readout and mesh preview update without gaps or lost miter joins.
7. Press `Esc`. Confirm the exact original cube topology and selection return, with no Bevel undo entry. Start Bevel again, adjust width/segments/profile and press `Enter`; confirm one committed operation.
8. Undo and redo with the visible controls or `Ctrl+Z` / `Ctrl+Shift+Z`. Confirm both mesh states restore correctly.
9. Create a three-edge branch around a single vertex using a region gesture. Bevel must reject it and leave source positions/faces unchanged. Also confirm a cycle or unsupported selection rejects safely.
10. Repeat Bevel using numeric width and arrow-key nudges. Confirm invalid/unsupported values do not mutate the source mesh.
11. Switch to Face Select (`3`), select one cube face, and press `Ctrl+B`. Confirm the FACE BEVEL readout appears and the selected patch rises with one continuous perimeter transition. Drag horizontally and type a value to adjust width; press `H` to switch to height, then drag/type again. The world-space width and height readouts must update independently. Segment/profile controls remain available.
12. Cancel and confirm the original positions, faces and selection return with no undo entry. Start again and apply; confirm one Face Bevel undo entry and exact Undo/Redo restoration.
13. Select a connected two-face planar region and confirm the shared internal seam remains welded after Face Bevel. Then select a concave L-shaped region and a U-shaped region with two reflex corners; use a small amount and confirm each produces a continuous, valid transition when the inner boundary remains simple. An acute reflex notch that requires an excessive miter, a hole/multiple-loop region, disconnected selection or non-planar region must reject before source mutation; no rejected case may leave a partial preview.
14. While Face Bevel is active, test 1, 2, 4 and 8 segments and profile values 0, 0.50 and 1. Confirm the row count, readout and geometry update; Undo/Redo must still treat the final result as one operation.
15. Before starting a modal, choose Box, Circle or Lasso selection. After Apply and after Cancel, confirm Bl3nd automatically returns to Click Select and viewport orbit/pan/zoom work immediately without switching Object/Edit Mode or manually changing the selection tool.

Record each step as Pass / Fail / Not tested. If a region-tool result is unexpected, note the tool, drag direction, shape, viewport orientation and whether the missed edge was visible.

## Android — Chrome

1. Open the same deployed URL in Chrome on the phone. Reload after the deployment. Confirm the loading overlay disappears, the viewport fills its intended area, the properties panel and bottom action bar remain usable, and no startup error is shown.
2. Use one finger to orbit. Use two fingers to pan/zoom. Confirm gestures do not become stuck after lifting either finger.
3. Enter Edit Mode and switch to Edge Select. Open `Select ▾` and try each region tool. For Circle, a single tap centered on a visible corner should select nearby incident edges using the 25px brush radius. For Box or Lasso, draw one narrow region across a visible L-shaped pair or simple connected edge path; all visible edge segments intersecting that region should highlight, even when the region crosses between the old fixed sample positions. A selection of exactly two adjacent edges can start the supported corner miter. A longer selection must form one simple path. Three edges radiating from one vertex are a branch: the region tool may select them, but Bevel must reject them without changing the mesh. Vertex-only Bevel is not implemented.
4. Switch to Face Select and tap one visible cube face. Start Extrude from the bottom action bar or Edit Mesh panel. Drag vertically, then enter an exact distance with the numeric pad. Confirm the mesh previews the new position; Cancel must restore the original. Start it again and Apply; Undo/Redo must restore both states. Then add a Plane, subdivide it once, select three faces in an L-shaped connected region, and Extrude. Confirm one continuous side-wall boundary surrounds the concave region, the selected top faces remain joined along their original internal seams, and the preview readout shows the face/boundary counts and signed distance. Cancel and repeat with Apply/Undo/Redo.
5. Start Inset on one face. Drag vertically or enter an amount between 0.005 and 0.9. Confirm the inner face and border preview update. Cancel once, then repeat and Apply. Undo/Redo must restore both states. Also test a connected multi-face region: add a Plane, enter Edit Mode, subdivide it once, then select two adjacent faces with Box/Lasso or Shift-click on desktop. Start Inset and confirm the entire region gets one continuous offset border, the internal seam remains shared, and no cracks appear. Try a disconnected selection or a region with a hole and confirm it is rejected without changing the source. A concave L-shaped planar region should preview when the offset remains simple; a collapsing offset must reject non-destructively.
6. Start Bevel. Drag horizontally to adjust width. Use the on-screen segment and profile `+` / `−` controls. Confirm the numeric pad/readout reflects the settings and the model preview updates.
7. Cancel once with the on-screen Cancel/Escape control. Confirm the original mesh returns. Start Bevel again and apply it with the on-screen Apply/Enter control.
8. Tap Undo, then Redo. Confirm the mesh returns to the expected pre- and post-Bevel states.
9. Switch to Face Select and tap one cube face. Open **Bevel** from the Edit Mesh panel. Confirm Face Bevel starts, its width/height readout is visible, and horizontal drag plus numeric-pad entry update the active preview parameter. The 1–8 segment, profile and Height rows must be visible.
10. Try 1, 2, 4 and 8 segments. Try profile 0, 0.50 and 1. Confirm the model, count readout and profile readout update without cracks or invalid geometry. Use the Edit Height button, adjust height with +/- and numeric entry, then switch back to Edit Width; confirm one dimension changes without changing the other.
11. Cancel and verify the exact original mesh returns without an undo entry. Start again, set multiple segments/profile, and Apply; verify one undo step, then Undo/Redo.
12. Select two adjacent coplanar faces and repeat. Confirm the common inner seam stays welded and the transition walls form one continuous perimeter. Then select a planar 2×2 and 3×3 face grid; both must bevel successfully, retain every internal seam and pass topology validation without isolated vertices. Repeat with a concave L region and confirm the transition remains valid.
13. On a sphere, select a small connected group of faces that span different face planes. If it forms one simple boundary and adjacent normals vary smoothly, Face Bevel should enter **Continuous Surface** mode and preserve the shared raised top seams. If the patch contains a sharp crease, a hole, disconnected faces or excessive curvature, it must use Individual Faces when possible or reject without source mutation. A single individual polygon should remain bevelable through the existing Region path.
14. Before launching Face Bevel, set Box/Circle/Lasso selection. After Apply or Cancel, verify Click Select is restored automatically and orbit/pan work immediately without changing Object/Edit Mode or manually selecting Click Select.
15. Repeat one-finger orbit and two-finger pan/zoom after Extrude, Inset and Face Bevel have ended. Confirm viewport controls are re-enabled.

16. Open the **More** properties drawer from the bottom action bar. While it is open, start Face Bevel from Edit Mesh. Confirm the drawer slides closed as soon as the modal starts and does not cover the viewport adjustment controls/numeric pad. Apply or Cancel; the drawer must stay minimized. Tap **More** to reopen it. Repeat with Extrude, Inset, Loop Cut and a G/R/S transform. A modal that fails to start must not close the drawer.

17. In Face Select, select two adjacent cube faces and start Face Bevel. Confirm the camera recenters on the selected area and rotates to show both selected planes as clearly as possible. Cancel, then select all six cube faces and start Face Bevel again; confirm the camera chooses a corner angle that exposes the greatest combined selected-face area instead of staying on a front-only view. A single view cannot show opposing front/back faces at the same time, so orbit to inspect hidden sides as needed. Confirm camera framing does not change topology, selection IDs or the modal preview. Repeat with two adjacent edges for Edge Bevel and a Loop Cut seed edge; single-face/single-edge operations should not cause an unnecessary camera jump.

18. On a curved/non-planar object, select a group of at least three faces and start Face Bevel. It should enter Individual Faces mode when the selection is not one supported planar region, and the camera must rotate/center on the first active face. Tap Next Face repeatedly: the camera must reorient to each newly active face so it can be edited even when it was on the back/side of the object. Previous Face must do the same in reverse. Change width, height, segments and profile on the current face; the camera should stay on that face while parameters change. Toggle Region/Individual mode where allowed and confirm each mode frames its actual target. The operation's geometry, face IDs, per-face settings, Cancel and one-step Apply/Undo must remain unchanged by camera movement.

## Owner-reported Android acceptance — v0.1.31 through v0.1.40 (2026-11-27)

- The owner reports Pass for connected-region Extrude, concave L-region Extrude, single-face Inset, connected-face Inset, convex Face Bevel, concave Face Bevel, Cancel restoration, Apply and Undo/Redo.
- Before the v0.1.35 input-recovery fix, post-operation viewport gestures were recoverable only after switching to Object Mode or choosing Edit Mode → Click Select. This earlier build behavior was a UX defect; the owner later confirmed the v0.1.35 automatic recovery passes.
- The owner confirms Pass for the v0.1.35 1–8 segment control, profile 0/0.50/1 controls and immediate post-modal Click Select/orbit recovery on Android.
- The owner confirms that the v0.1.36 multi-row/multi-column planar Face Bevel fix works. The owner asked how to adjust multiple selected faces individually; v0.1.37 adds an explicit Individual Faces mode with per-face settings. Android verification of that new mode remains pending. v0.1.38 adds mobile More drawer auto-minimize when a modal starts; Android acceptance is pending.
- The owner confirms v0.1.40 active-face camera focus works on Android: the view follows the active face target when switching faces.
- Device model, Android version and Chrome version were not supplied.

## Recorded mobile run — v0.1.26 (user-reported, 2026-11-26)

- Step 1 startup/layout: **Pass**.
- Step 2 one-finger orbit and two-finger pan/zoom: **Pass**.
- Step 3 region selection: **Partial**. A straight edge could be selected; corner-dot and multi-edge region selection did not work as expected.
- Steps 4–7 Bevel controls, cancel, apply, undo/redo and restored viewport navigation: **Pass**.

## Mobile retest — deployed v0.1.27 (user-reported)

- Region selection correction: **Pass**. The user confirmed corner and multi-edge selection now work on mobile after the v0.1.27 deployment.
- The earlier v0.1.26 startup, navigation, Bevel controls, cancel, apply and undo/redo passes were not changed by this selection-only update and remain the recorded results.
- Three-edge branch rejection was requested as an additional safety check but was not explicitly confirmed in the user's report; keep it **Not tested** until checked.
- Device model, OS and exact browser/version were not supplied. Desktop Chrome/Edge regression remains untested.

## Recorded mobile run — v0.1.27 (user-reported, 2026-11-26)

- Startup/layout: **Pass**.
- One-finger orbit and two-finger pan/zoom: **Pass**.
- Circle corner selection and Box/Lasso multi-edge region selection after v0.1.27: **Pass**.
- Bevel controls, cancel, apply, undo/redo and restored viewport navigation: **Pass**.
- Device/browser details were not supplied. The user cannot run the desktop regression soon; desktop testing is deferred and must not block continued modeling work. The browser-specific PC checklist remains unverified.

## Face-operation regression — v0.1.31 (automated; Android run pending)

- Node tests cover modal Extrude and Inset preview, numeric input, negative Extrude, connected planar-region Extrude, concave and rotated face regions, single-face inset, cancel restoration, one-step commit, safe rejection of invalid/disconnected selections, and drag anchoring on the actual pointer-down.
- The v0.1.30 Inset regressions cover constant-offset miters, connected two-face regions, concave L-shaped regions, rotated-plane world-distance consistency, reversed winding, disconnected regions, holes, collapsing offsets, excessive miters and non-planar faces. The v0.1.31 Extrude regressions cover concave L regions, tilted-plane world normals, reversed winding, shared interior seams, invalid distance/mode, holes and disconnected selections. v0.1.32 adds ten read-only boundary-analysis regressions for convex/concave loops, annular holes, disconnected and nested-independent islands, non-planar regions, inconsistent winding and non-manifold edges. These automated tests do not replace real touch/browser validation.
- On Android Chrome, verify connected-region Inset on a subdivided Plane and concave L-region Extrude. Confirm shared internal seams stay welded, previews update, Cancel restores the original, Apply creates one undoable operation, and Undo/Redo restores both states. This is still pending owner/device acceptance; automated boundary analysis is not evidence of browser interaction correctness. Desktop pointer behavior remains deferred until the user can access a PC; it does not block continued modeling work.

## Face-region Bevel regression — v0.1.33–v0.1.37 (automated; latest browser run pending)

## Selection-aware view regression — v0.1.39–v0.1.40 (automated; active-face Android focus confirmed)

- `tests/SelectionView.test.js` verifies planar face alignment, two-plane compromise orientation, a corner view for all six cube faces, face-area weighting and safe fallback for invalid/empty normals.
- v0.1.39 tests the best-view direction for planar, multi-plane, six-sided and area-weighted face sets. v0.1.40 adds a focused-face regression showing that one active Individual Faces target overrides a balanced whole-selection view.
- The owner confirmed on Android that v0.1.40 active-face focus follows the face when switching targets. v0.1.39 whole-selection framing had previously failed to move for a balanced eight-face selection; v0.1.40 addresses Individual Faces focus specifically. Desktop browser testing remains deferred.

## Curved-surface Face Bevel regression — v0.1.41 (automated; Android run pending)

- `tests/CurvedFaceBevel.test.js` covers a triangulated spherical-cap patch, welded raised top seams, triangulated transition strips at 1–8 segments and all profile endpoints, planar-path separation, sharp-crease rejection and modal fallback to Individual Faces, invalid controls, modal preview/commit, mode switching and Cancel restoration.
- The supported prototype is intentionally limited to one connected non-planar patch with one simple projected boundary, stable area-weighted vertex normals, and adjacent face-normal changes no greater than 55 degrees. The complete private candidate must pass topology validation; top triangles must retain their source-facing orientation; transition triangles must face outward without fold/inversion. It does not yet perform a general global self-collision/occlusion solve.
- On Android, use step 19 above. Automated tests establish the operator's geometric envelope but do not replace browser interaction, rendering, touch-control or visual quality acceptance. Desktop Chrome/Edge remains deferred.

- v0.1.33 automated tests cover convex single-face and connected multi-face regions, welded internal seams, rotated-plane normals, reversed winding, miter limits, numeric bounds, modal amount updates, Cancel and one-step commit/undo metadata.
- v0.1.34 adds concave L-shaped and two-reflex U-shaped regions, rotated and reversed concave regions, retained internal seams, modal preview/Cancel/Apply and an acute reflex notch that must reject for excessive miter without source mutation. Holes, multiple loops, disconnected islands, non-planar input and invalid amounts remain rejected.
- Face Bevel Region mode accepts one connected, consistently wound planar region with one simple boundary. Supported reflex/concave corners are accepted only when the inward offset remains inside/simple and every miter and transition wall passes candidate validation. v0.1.35 adds 1–8 segments/profile shaping; the owner confirms these and automatic post-modal Click Select/orbit recovery pass on Android.
- v0.1.36 fixes orphaned interior source vertices in multi-row/multi-column planar face grids and decouples width from height. Automated coverage includes 2×2, 3×2 and 3×3 grids, shared seams, 1–8 segments/profile geometry and independent height controls. The owner confirms the planar grid case works on Android.
- v0.1.37 adds Individual Faces mode with per-face width, height, segments and profile. It rebuilds one private candidate by applying the validated single-face path to each selected face; adjacent selected faces become separate raised panels with grooves at shared base edges. Connected non-planar groups auto-select this mode if all individual polygons pass. On Android Chrome, verify `I` / the mobile mode button, previous/next face navigation, deliberately different settings across two faces, automatic selection for a curved sphere patch, topology validity, Cancel and one-step Apply/Undo/Redo. Unsupported individual polygons and invalid candidates must reject atomically. Desktop Chrome/Edge remains deferred until the owner can access a PC.

## Record results

For each device, record:

- Device model and OS version.
- Browser name and exact version.
- Whether cold startup completed and the 3D canvas appeared.
- Whether orbit, pan, zoom and selection behaved as expected.
- Whether Edge Bevel and Face Bevel width, independent height, 1–8 segment count and profile 0–1 controls updated the previews; Face Bevel height can be selected with `H` or the mobile Edit Width/Height toggle.
- Whether Cancel restored the original mesh without an undo entry.
- Whether Face-region Inset and concave multi-face Extrude previewed correctly, Cancel restored the original, Confirm created one undoable operation and Undo/Redo restored both states.
- Whether Face Bevel Region mode previewed/applied for supported convex and concave planar regions and multi-row/multi-column grids; internal seams stayed welded, width and height changed independently, segment/profile changes updated geometry, Cancel restored the source, one undo operation was recorded, and Undo/Redo restored both states.
- Whether Individual Faces mode allowed targeting each selected face and assigning different width, height, segment and profile values; whether curved groups auto-entered Continuous Surface or safely fell back to Individual Faces; and whether welded continuous patches / separate panels passed topology validation and restored correctly through Cancel/Apply/Undo/Redo.
- Whether Click Select was restored after each modal operation and viewport orbit/pan worked immediately without switching Object/Edit Mode.
- Any visible error text and the first app-owned console error, if available.

Mark each step as **Pass**, **Fail**, or **Not tested**. Do not interpret extension-injected console messages as Bl3nd errors without confirming their source. Do not change topology validation to make a failing geometry case appear to pass; unsupported or invalid candidates must leave the source mesh unchanged.

## Scope and limitations

This procedure validates browser interaction for the starter cube. The automated mixed-fan matrix in `tests/MixedFanBevel.test.js` separately covers terminal/internal valences four through six, rotated geometry and the guarded skewed cases. `tests/ScreenRegion.test.js` validates pure 2D segment/region intersection math; it does not replace the real browser raycast/touch check. Real-device results must be recorded before the handoff can describe desktop/mobile browser regression as complete.

19. On a UV Sphere, select a small connected patch of approximately 4–12 adjacent faces away from a pole/seam. Start Face Bevel. Confirm it enters **Continuous Surface** (not Individual Faces), moves the whole raised patch as one welded surface, and creates one continuous triangulated transition band without separate grooves along internal selected seams. Adjust width, height, 1–8 segments and profile; the preview must remain topologically valid and must not develop inverted/folded transition triangles. Cancel and confirm exact source restoration; repeat Apply and verify one Undo/Redo step. Increase the selected patch until adjacent-normal or offset safety checks reject; the source must remain unchanged or switch to the Individual Faces fallback. Try a selection crossing a sharp crease and confirm it does not force a continuous bevel.
