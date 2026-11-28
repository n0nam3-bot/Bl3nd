# Bl3nd Desktop / Mobile Browser Regression

This is a manual acceptance run for the deployed Bl3nd app. It checks the real browser input path and cannot be replaced by a successful GitHub Pages deployment or by the Node topology tests.

## Build under test

Current repository baseline before v0.1.73: v0.1.72 source, `main` commit `e8c6ed33ccc37813b140a584a9281ebd592c812e`; Pages workflow run #80 succeeded. The owner reports that blank-area Move/Rotate/Scale drags still do nothing on Android after v0.1.72, so the v0.1.73 pointer-origin re-anchoring and capture-phase pointer-ID routing fix needs live retesting.

Open the deployed app only after the latest Pages workflow succeeds:

`https://n0nam3-bot.github.io/Bl3nd/`


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
- The owner confirms all six v0.1.41 Continuous Surface acceptance checks passed on Android for the tested small selected sphere patch. The entire sphere was not tested and is not within the supported curvature envelope.
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


## Transform orientation regression — v0.1.43 (automated; browser acceptance pending)

- `tests/TransformOrientation.test.js` verifies Global axes remain world-aligned, Local axes follow a rotated object's quaternion, the resulting basis stays normalized/orthogonal, and invalid quaternion data falls back safely.
- On a rotated object, start Move with `G`, press `X`, then `,` to switch Global → Local. The constrained direction must change from world X to the object's starting local X direction. Repeat for `R` and `S`; confirm `Shift+X/Y/Z` uses the selected orientation's plane normal. Toggle back to Global and confirm the world-axis behavior returns.
- On mobile, use the **GLOBAL AXES · SWITCH TO LOCAL** button in the numeric pad, then confirm it changes to **LOCAL AXES · SWITCH TO GLOBAL** and the readout names the active orientation. Axis constraints must update without a new modal start.
- Confirm free movement still follows the camera-facing view plane and free rotation still uses the camera-oriented trackball. Local axes must remain anchored to the object's orientation at modal start while pointer previews update; Cancel restores the original transform and Apply creates one undoable operation.
- Object-mode Global axis scaling retains its documented TRS approximation; Local axis scaling follows the object's local scale components. This update does not add snapping, proportional editing or exact multi-object pivot aggregation.

## Mobile transform Apply pointer isolation — v0.1.44 (browser acceptance pending)

- Start Move (`G`) on Android, drag inside the 3D viewport until the preview reaches a clear position, then lift your finger. Tap the numeric-pad Apply/Enter button. The object must remain exactly at the last visible preview position; moving your finger to the keypad must not become another transform drag.
- Repeat while selecting Global X/Y/Z, Local X/Y/Z, and the YZ/XZ/XY plane buttons. Axis/plane previews must still respond to drags inside the viewport, and changing orientation must not disturb the current preview.
- Repeat once in Edit Mode with a selected vertex/edge/face region. Confirm Apply preserves the preview, Cancel restores the source, and one Undo/Redo step restores the pre-/post-transform states.
- Move a finger over the numeric pad without pressing a key while a transform is active. The preview must not change. Then drag again inside the viewport and confirm it updates normally.
- This regression specifically guards against the former window-wide pointer listener treating finger travel over the numeric pad as a new viewport drag. Desktop pointer behavior should remain unchanged.

## Curved-surface Face Bevel regression — v0.1.42 (automated; Android retest pending)

- `tests/CurvedFaceBevel.test.js` covers a triangulated spherical-cap patch, welded raised top seams, triangulated transition strips at 1–8 segments and all profile endpoints, planar-path separation, sharp-crease rejection and modal fallback to Individual Faces, invalid controls, modal preview/commit, mode switching and Cancel restoration. v0.1.42 adds an intentionally intersecting detached triangle that must reject atomically and a distant disconnected triangle that must not block a valid patch.
- The supported prototype is intentionally limited to one connected non-planar patch with one simple projected boundary, stable area-weighted vertex normals, and adjacent face-normal changes no greater than 55 degrees. The complete private candidate must pass topology validation; top triangles must retain their source-facing orientation; transition triangles must face outward without fold/inversion. v0.1.42 additionally uses a spatial hash/AABB broad phase and triangle/triangle tests for intersections involving changed top and transition triangles, while allowing expected shared topological contacts. This remains partial collision screening, not a proof of global self-collision/occlusion freedom; whole-sphere/high-curvature bevels remain unsupported.
- On Android, use step 19 above and repeat the small-patch acceptance once on v0.1.42. The owner already confirmed all six v0.1.41 checks for the tested small sphere patch. A whole-sphere bevel was not tested and is not expected to work in this narrow prototype. Automated tests establish the operator's geometric envelope but do not replace browser interaction, rendering, touch-control or visual quality acceptance. Desktop Chrome/Edge remains deferred.

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
- Whether mobile G/R/S preview remains fixed when the finger leaves the viewport to tap Apply/Cancel/numeric controls, for Global/Local axis and plane constraints.

Mark each step as **Pass**, **Fail**, or **Not tested**. Do not interpret extension-injected console messages as Bl3nd errors without confirming their source. Do not change topology validation to make a failing geometry case appear to pass; unsupported or invalid candidates must leave the source mesh unchanged.

## Scope and limitations

This procedure validates browser interaction for the starter cube. The automated mixed-fan matrix in `tests/MixedFanBevel.test.js` separately covers terminal/internal valences four through six, rotated geometry and the guarded skewed cases. `tests/ScreenRegion.test.js` validates pure 2D segment/region intersection math; it does not replace the real browser raycast/touch check. Real-device results must be recorded before the handoff can describe desktop/mobile browser regression as complete.

19. On a UV Sphere, select a small connected patch of approximately 4–12 adjacent faces away from a pole/seam. Start Face Bevel. Confirm it enters **Continuous Surface** (not Individual Faces), moves the whole raised patch as one welded surface, and creates one continuous triangulated transition band without separate grooves along internal selected seams. Adjust width, height, 1–8 segments and profile; the preview must remain topologically valid and must not develop inverted/folded transition triangles. Cancel and confirm exact source restoration; repeat Apply and verify one Undo/Redo step. Increase the selected patch until adjacent-normal or offset safety checks reject; the source must remain unchanged or switch to the Individual Faces fallback. Try a selection crossing a sharp crease and confirm it does not force a continuous bevel. A whole-sphere bevel is outside the current support envelope and should not be used as an acceptance criterion.
20. After the v0.1.42 deployment, repeat the same small sphere-patch test once. Confirm the new collision screen does not reject the known-safe patch or change the welded transition, parameter controls, Cancel or Apply/Undo/Redo behavior. The automated detached-triangle collision tests cover the rejection path; no manual collision fixture is required for this mobile retest.


## Live Move readout regression — v0.1.46 (browser acceptance pending)

- On Android, place an object at a non-zero location (use the Transform Location fields), start Move with `G` or the mobile Move action, then press `Z`. Drag up and down inside the viewport. The large value must continuously show the resulting world Z coordinate (not `0` or only the movement distance), and the title must say `WORLD Z POSITION`. The viewport modal readout must also show the live `TO X/Y/Z` destination.
- Confirm the compact two-row readout shows all three world-space displacement components (`Δ X/Y/Z`) and the resulting destination (`TO X/Y/Z`). The prominent value shows the destination coordinate aligned with a constrained axis (for example, the final world Z coordinate while moving on Global Z); the viewport readout shows that destination as well. In Edit Mode, the destination row is labeled `PIVOT` and tracks the selected region's transform pivot.
- Repeat Global X/Y/Z, Local X/Y/Z and YZ/XZ/XY. Global-axis moves must show the final coordinate on that world axis. Local-axis moves must show the dominant world coordinate plus the complete XYZ destination; plane/free movement must show displacement magnitude plus all destination coordinates. Near-zero components display as `+0.000`, never negative zero.
- Type a numeric value after dragging. The numeric entry remains visible as the entered amount while the detailed displacement and target coordinates update to the active numeric preview. Clear/backspace/cancel must continue to work.
- Tap Apply and verify the final object/pivot position matches the displayed `TO`/`PIVOT` coordinates. Cancel restores the exact starting state; Apply creates one undo step and Undo/Redo restores both states.
- Confirm the detail block is hidden for Rotate, Scale, Bevel, Extrude, Inset and Loop Cut, and existing numeric controls for those operations remain unchanged. Desktop G/R/S behavior remains unchanged.


## Axis-constrained Move snapping regression — v0.1.48 UI and interaction acceptance (pending)

- Confirm Move snapping is disabled on a fresh browser profile. With it off, Global/Local X/Y/Z pointer drags must behave exactly as before. Free view-plane movement and Shift+axis plane movement must remain unsnapped even when the preference is enabled.
- Confirm the mobile More/Scene drawer does not contain a separate snapping section. Start Move, press `Z`, and use **STEP SIZE** in the numeric pad to set Global `1.0` and Local `0.25`; closing STEP SIZE must leave the Move pad usable. The settings must persist after reload.
- With Move constrained to `Z`, confirm the pad shows **SNAP OFF** initially. Drag slowly and verify the object follows smoothly. Tap **SNAP OFF**; it must change to **SNAP ON · 1**, and the viewport readout must show `SNAP 1`. Continue dragging: the destination should change only in 1-unit increments, while the displayed position/readout remains steady between thresholds.
- Switch Global/Local during the same modal operation. The button must show the active step (Global `1`, Local `0.25`), and pointer movement must advance in the selected orientation's increments without resetting the original transform or pointer origin. Change step size while the operation is active and verify the preview immediately recomputes from the same pointer position.
- While snapping is enabled, type a precise value such as `0.137`. The viewport readout must say `EXACT INPUT (SNAP BYPASSED)` and the exact typed amount must be previewed; snapping must not round explicit numeric input. Backspace and replacing the value must remain exact. Clear the numeric field before resuming snapped pointer movement.
- Test positive and negative drags, values near half-step boundaries, non-unit starting locations, rotated Local orientation, Object Mode and Edit Mode selection pivots. Preview positions must remain stable and the `TO` / `PIVOT` coordinates must match the snapped destination.
- Cancel after several snapped changes and confirm the exact original object/mesh state is restored with no undo entry. Repeat and Apply; confirm one undo entry, then Undo/Redo both restore the corresponding states. Confirm snapping preferences persist after reload, remain disabled by default for a fresh profile, and do not affect Rotate, Scale, Bevel, Extrude, Inset or Loop Cut.


## Axis-constrained Rotate and Scale snapping regression — v0.1.49 (browser acceptance pending)

- Confirm the existing snap preference remains disabled on a fresh browser profile and that saved v0.1.48 Move increments are preserved after upgrading. Move continues to use its existing Global/Local world-unit steps.
- Start Rotate (`R`), press `X`, and enable snapping from the transform pad. Drag slowly in both directions. The preview must advance in Global rotation increments (default 15 degrees), and the pad must show the active step with a degree symbol. Switch to Local orientation and confirm the Local rotation increment is used without resetting the pointer origin or original transform.
- Expand STEP SIZE while Rotate is active. Set different Global and Local rotation increments (for example 30° and 5°). Confirm the mobile labels say GLOBAL ROTATION / LOCAL ROTATION, changing a step immediately rebuilds the preview, and the viewport readout displays the correct active step.
- Start Scale (`S`), press `X`, enable snapping and drag both larger and smaller than the starting factor. With the default 0.1 factor step, previews must land on values around 1.0 (for example 0.9, 1.0, 1.1, 1.2), never cross through zero, and use independent Global/Local increments. Edit Mode selection transforms must follow the same constraint behavior.
- Expand STEP SIZE while Scale is active. Set different Global and Local scale steps (for example 0.25 and 0.05); verify the displayed step and preview use the active orientation's value.
- Type precise numeric Rotate and Scale values while snapping is enabled. The entered angle/factor must remain exact and the viewport readout must state EXACT INPUT (SNAP BYPASSED). After clearing the numeric field, pointer-driven snapping must resume.
- Confirm free Rotate trackball and unconstrained Scale remain unsnapped. Shift+axis plane Scale remains unchanged; this increment targets explicit X/Y/Z axis constraints only.
- Toggle snapping on/off during an active Rotate and Scale preview. Turning it off must immediately restore continuous pointer movement; turning it back on must quantize from the same immutable modal start. Apply creates one undo record; Cancel restores the original transform; Undo/Redo restore both states.
- Confirm the More drawer remains free of snap settings on mobile. The active pad contains the compact toggle and operation-specific STEP SIZE panel. Desktop Scene properties expose Move (world units), Rotate (degrees), and Scale (factor delta) Global/Local increments.


## Passive transform guide — v0.1.50 (browser acceptance pending)

- Start Move (`G`) with no constraint. Confirm the viewport shows a centered pivot marker, three labeled world axes, and a translucent camera-facing movement plane. Drag in the viewport: the guide's pivot marker must follow the moved object/selection while the plane and axis directions remain stable.
- Press `X`, `Y` or `Z`. Confirm the selected axis becomes visually emphasized and the others remain visible but dimmed. Toggle Global/Local with `,`; the guide axes must rotate with the captured object orientation when Local is active, then return to world alignment in Global.
- Press `Shift+X/Y/Z` during Move. Confirm the highlighted movement plane is perpendicular to that selected Global/Local axis and updates when orientation changes. The guide must remain pointer-transparent: viewport drag, numeric pad input, Apply and Cancel behave exactly as before.
- Start Rotate (`R`) unconstrained. Confirm a camera-facing ring surrounds the pivot. Constrain to `X/Y/Z` and confirm the ring plane is perpendicular to the active axis and the corresponding axis is emphasized. Free trackball rotation, snapped axis rotation and exact numeric rotation must remain unchanged.
- Start Scale (`S`). Confirm the three scale directions and endpoint handles are visible; Shift+axis plane scale displays the active plane. Scale previews, snapping and numeric entry must be unchanged.
- Apply each transform and confirm the guide disappears immediately. Cancel each transform and confirm it disappears while the source transform/mesh is restored. Starting Bevel, Extrude, Inset or Loop Cut must never leave a stale transform guide visible.
- Orbit/pan/zoom before starting G/R/S from several camera angles. The guide must align with the actual projected world axes/pivot and remain clipped within the viewport. Normal camera navigation remains disabled during the modal transform; the SVG guide must not block viewport drags, touch gestures or modal controls. Confirm the marker stays at the cursor when the active pivot mode is 3D Cursor.
- Desktop Chrome/Edge follows the same visual checks when the owner next has PC access; desktop acceptance remains deferred until then.


## Transform pivot Bounding Box Center regression — v0.1.51 (browser acceptance pending)

- In Edit Mode, select an asymmetrical set of vertices (for example, two close together and one much farther away). Choose **Median Point**, start Rotate or Scale, and note the guide pivot. Cancel, choose **Bounding Box Center**, and repeat. The pivot must now sit at the center of the selected vertices' local-space minimum/maximum extents, not at their arithmetic average.
- Repeat with a flat selection and a single selected vertex. The bounding-box pivot must remain finite and sit at the middle of the selected extents; a single vertex must use that vertex position.
- In Object Mode, choose Bounding Box Center and transform a mesh whose local geometry is offset from its object origin (or an imported mesh with an off-center origin). The guide pivot must sit at the center of the mesh's world-space bounds, and Rotate/Scale must operate around that point. The object origin must remain distinct.
- Switch between Median Point, Bounding Box Center and 3D Cursor. The dropdown must reflect the active mode after a refresh/undo restore. 3D Cursor remains fixed while the object/selection moves; the Median and Bounding Box pivots remain anchored to the transform's starting geometry during Rotate/Scale previews.
- Confirm the guide remains pointer-transparent, snapping still uses the same increments, numeric input stays exact, and Apply/Cancel/Undo/Redo remain transactional. Individual Origins is a documented limited mode and is not part of this acceptance. Desktop Chrome/Edge remains deferred.


## Edit Mode Individual Origins by connected selected region — v0.1.52 (browser acceptance pending)

- On a subdivided cube/grid, select two adjacent faces sharing an edge, choose **Individual Origins**, then Rotate or Scale. Both faces must move together around one shared region pivot; the shared edge/vertices remain welded with no seam or duplicate points.
- Select a second face island separated by unselected faces/edges. Rotate or Scale: each disconnected selected island must turn/scale around its own median pivot. The passive guide must show a marker at each region origin and the badge must report the connected-region count.
- Select two edge paths that meet at an endpoint. They must share one pivot; a separate edge path must have its own pivot. Repeat with vertex selection and confirm only selected vertices connected by actual mesh edges are grouped.
- Select faces that meet at a shared vertex. They must be treated as one region so the shared vertex is transformed only once and topology remains welded. Undo/Redo must restore both islands exactly.
- Confirm Move applies the same world delta to every region, Global/Local axis constraints and snapping remain consistent across all regions, numeric entry stays exact, and Cancel/Apply remain one transactional operation. Repeat Free Move/Rotate/Scale and X/Y/Z constraints on Android. Desktop Chrome/Edge remains deferred.

## Touch additive selection — v0.1.53 (browser acceptance pending)

- On Android, enter Edit Mode and choose Face Select. Open `Select ▾`; confirm the menu contains `Add to Selection · OFF`. Tap it. Confirm the menu closes and the toolbar button changes to `Select+ ▾` (or displays a visible `+` beside the active selection tool).
- Tap one visible cube face, orbit the camera to expose a different face, then tap that face. Both faces must remain highlighted. Repeat with a third face. The mode must work even though no Shift key is available.
- Open `Select+ ▾` and tap `Add to Selection · ON` to turn it off. Confirm the toolbar loses the `+`. Tap another face and confirm normal click selection replaces the previous selection.
- Turn Add to Selection back on and tap an already selected face. It must toggle off without clearing the other selected faces. Tap an unselected face and confirm it is added.
- Switch to Box, Circle and Lasso from `Select ▾`. With Add to Selection on, each region gesture must extend the existing selection; with it off, the gesture must replace the selection. Confirm the toggle state remains visible while a region tool is active.
- Confirm ordinary one-finger orbit still works with Add to Selection on, a stationary tap selects, and long-press still places the 3D Cursor. Confirm the toggle automatically resets when leaving Edit Mode.
- Repeat desktop Shift-click and Shift-drag selection with the touch toggle unavailable or off; keyboard behavior must be unchanged.
- Desktop Chrome/Edge G/R/S and selection acceptance remains deferred until the owner has PC access.


## Multi-Region face operations — v0.1.54 (browser acceptance pending)

- On Android, enter Edit Mode and Face Select. Turn **Add to Selection** on from `Select ▾`; select one planar face, orbit to expose a separate face that shares no vertices with the first, and tap it. Confirm both remain selected. Repeat on a subdivided plane by selecting two separated planar islands.
- Start Extrude. Confirm the preview status reports the number of selected regions. Drag/type a positive value: every island must move along its own face-region normal by the same signed distance, with separate perimeter walls and no shared/duplicated vertices between islands. Cancel and verify exact topology/selection restoration; repeat Apply and check one undo step plus Undo/Redo.
- Start Inset on the same islands. Confirm every island gets its own inward boundary ring and remains selected on its new inner face. The same normalized amount should be used, while actual world offsets may differ when island edge lengths differ. Cancel/Apply/Undo/Redo must behave as one transaction.
- Start Face Bevel. Confirm `MULTI-REGION` appears in the preview/readout and both islands bevel with the same width, height, segment count and profile while seams inside each connected island remain welded. Change segments/profile/height, then use `I` or the mobile mode button to switch to Individual Faces and back to Multi-Region while settings match. Cancel once and confirm the original mesh is restored; repeat and Apply, then Undo/Redo.
- On a cube, additive-select opposite faces and repeat Extrude, Inset and Face Bevel. Each should process the two disjoint planar islands separately. Do not expect several adjacent, non-coplanar cube sides to be treated as separate planar islands: they form one connected non-planar group and Extrude/Inset must reject it safely. Face Bevel may use Individual Faces when every polygon independently validates.
- Select two faces that touch only at one shared vertex, or select islands containing a hole/multiple boundary loops. Extrude, Inset and Multi-Region Face Bevel must reject the complete operation without a partial preview or source mutation.
- Turn Add to Selection off and confirm ordinary click selection again replaces the old selection. Verify a single connected planar region and existing multi-row/multi-column Face Bevel still work as before. After Apply/Cancel, one-finger orbit and two-finger pan/zoom must recover immediately. Desktop Chrome/Edge remains deferred.


## Warped neighboring faces after Edit Mode rotation — v0.1.55

- On a cube, select one face and choose **Individual Origins**. Rotate it around its normal by approximately 45°, then 90°. The selected face and every adjacent side face must remain visible; no whole side quad may disappear as a false opening. The adjacent faces are expected to warp because they share the rotated vertices.
- Repeat with two opposite faces selected using mobile Add to Selection. Rotate with Individual Origins and inspect all four connecting side faces. Confirm the selected faces remain welded to their side walls and the passive guide still shows one origin per disconnected selected face.
- Confirm a normal 3D boundary crossing is not incorrectly accepted by the warped-quad fallback: use the automated bow-tie fixture, which must still return no triangles.
- Orbit around the object and inspect both sides of folded walls. The modeling material is now two-sided, so a folded face should remain visible from either side; this does not repair the shape or prevent extreme self-intersections. Cancel and verify original topology/positions, then Apply and verify one Undo/Redo step.
- Desktop Chrome/Edge remains deferred until PC access is available.


## Face Bevel transition topology after rotation — v0.1.56 (browser acceptance pending)

- On a cube, select one face, run Face Bevel in Region mode, and apply it. Select the raised cap and rotate it around its normal by 45°, then 90°. Confirm the bevel perimeter remains connected, no warning badge or Safe Repair issue count appears, and another edit operation can be started normally.
- On a subdivided plane, select a connected 2×1 or 2×2 face region and bevel it in Region mode. Rotate the complete raised region by 45° and confirm the shared inner seams stay welded and the transition strips remain clean.
- Repeat with a multi-face selection using Individual Faces mode. Bevel the selected panels, rotate the selected caps, then change selection mode and start another operation. The app must not become blocked by non-planar/self-intersecting transition-wall warnings.
- Enable touch Add to Selection and select two opposite cube faces. Confirm Face Bevel chooses Multi-Region, apply it, rotate the two raised caps, and start another mesh operation. Both islands must remain valid and editable.
- Repeat with three or more bevel segments and a non-default profile. Confirm the transition bands remain visually continuous and the topology validator reports zero non-planar, self-intersecting or triangulation-failure faces.
- Confirm Cancel restores the pre-bevel mesh. Confirm Apply followed by Undo/Redo restores the beveled/rotated result transactionally. Desktop Chrome/Edge remains deferred until PC access is available.


## v0.1.57 — Proportional Editing

1. In Edit Mode, select one vertex on a cube, press `O`, and confirm the Select menu shows Proportional Editing ON. Start `G`, move the vertex, and confirm nearby connected unselected vertices move by smaller amounts while selected vertices move fully. The readout shows the active radius and influenced-vertex count.
2. Change the radius with the desktop mouse wheel during a transform, or with the mobile Proportional radius slider in the numeric pad. Confirm the preview changes immediately without accumulating drift. A smaller radius should influence fewer vertices; a larger radius should influence more.
3. Test `R` and `S` with proportional editing enabled. Confirm nearby vertices follow a smooth partial rotation/scale rather than snapping to the full transform. Confirm the same operation without proportional editing behaves as before.
4. Select a face or edge and repeat; the full selected region must remain weight 1 while surrounding connected vertices receive falloff. Repeat in Vertex, Edge and Face Select.
5. Select two disconnected islands on one mesh with Add to Selection. Confirm each island influences only vertices reachable along its own mesh-edge paths; nearby vertices on a disconnected shell must not move. Repeat with Pivot Point set to Individual Origins and confirm the islands retain independent pivots.
6. Toggle proportional editing off with `O` or `Select ▾`; confirm the transform returns to selected-only behavior. Confirm the preference remains after refreshing the page.
7. Cancel with `Esc` and verify every source vertex is restored. Apply with `Enter`, Undo once and Redo once; verify the complete proportional deformation is one transaction.
8. Confirm Object Mode `G/R/S` is unchanged, and radius changes never alter topology, vertex count, face count or edge connectivity.


## Mobile proportional-edit controls — v0.1.58 visibility fix

- Enter Edit Mode on a phone. Confirm a dedicated **Prop OFF** button appears in the bottom actionbar without opening More, Scene Properties or Select. In Object Mode, the button must be hidden.
- Tap **Prop OFF**. Confirm it changes to **Prop ON**, receives the active styling, and a **PROPORTIONAL EDITING · ON** panel appears immediately above the bottom actionbar with the current radius value and slider.
- Drag the radius slider before starting a transform. The value must update continuously and persist after leaving/re-entering Edit Mode or reloading the page. Tap Prop ON to disable; the panel must close and the actionbar button return to Prop OFF.
- With Prop ON, select one or more vertices and use the mobile Move, Rotate and Scale actions. Confirm the modal numeric pad still includes its proportional toggle and radius slider, and adjusting the radius rebuilds the preview without drift. Cancel restores the exact source; Apply is one undo step.
- Confirm the existing `Select ▾` toggle and `O` keyboard shortcut remain synchronized with the bottom actionbar button. Desktop keyboard/mouse controls remain unchanged. Desktop Chrome/Edge acceptance remains deferred until PC access is available.

## v0.1.59 — Proportional falloff selector

- In Edit Mode on desktop, enable Proportional Editing in Scene Properties. Confirm the Falloff shape selector offers Smooth, Linear, Sharp, Root and Sphere, with Smooth selected by default.
- Change the shape to Linear, then to Sharp, Root and Sphere. Confirm each selection updates the same preference without changing the radius or enabled state. Start Move, Rotate and Scale and confirm the viewport readout identifies the active falloff curve.
- On a phone, enter Edit Mode and enable Prop from the bottom actionbar. Confirm the same five choices appear in the panel above the actionbar. Change the falloff and confirm the desktop/Scene control reflects the same value after reopening More.
- Start a mobile G/R/S transform. Confirm the transform pad exposes the same falloff selector while the always-available panel is hidden. Change the curve during the preview and verify the geometry rebuilds from the immutable source rather than accumulating drift.
- With the same selection, radius and transform amount, compare the five curves: Smooth is the default, Linear fades evenly, Sharp falls off more quickly, Root retains broader influence, and Sphere has its rounded curve. Disconnected mesh islands must remain unaffected for every curve.
- Cancel and confirm exact source restoration. Apply, Undo and Redo; confirm one transform transaction. Reload the page and confirm the chosen falloff remains selected in every control. Repeat with Proportional Editing OFF to confirm the saved falloff does not activate the feature by itself.
- Desktop Chrome/Edge acceptance remains deferred until PC access is available; live Android acceptance is pending.

## v0.1.60 — Mesh operations after proportional editing

- Create a 3×3 face grid. In Face Select, select the center face, enable Proportional Editing, and move the face along its normal with a radius that reaches the diagonal neighboring faces. Confirm the selected center face remains planar while some surrounding quads become gently warped.
- Apply the transform. Without undoing or rebuilding the mesh, run Extrude on the selected center face, then Undo. Run Inset, then Undo. Run Face Bevel, then Undo. Each operation must enter its normal modal preview and complete/cancel transactionally.
- Confirm the surrounding warped quads remain visible and safely triangulated through every operation. `Validate Mesh` may still report those non-planar faces because the public diagnostic remains strict; that warning alone must not globally block unrelated planar operations.
- Select a warped neighboring face itself and try an operation that requires a planar face region. Confirm the operation rejects it non-destructively with the existing geometry-specific explanation. A quad with a true 3D boundary crossing, a degenerate triangle, a non-manifold edge or inconsistent winding must never be waived by the operation-safe validator.
- Repeat with each proportional falloff curve and with Proportional Editing turned off. Confirm ordinary flat-mesh operations and existing rejection boundaries are unchanged. Android acceptance is pending; desktop Chrome/Edge remains deferred.



## v0.1.61 — Surface-aware proportional editing guards

- On a subdivided cube, enter Face Select and select one small face on a flat side, away from the cube's outer boundary. Enable Prop and choose a radius large enough to reach across that side. Start Move and deform the face slightly. Confirm nearby coplanar faces on the same side receive a smooth falloff, while unselected vertices on the perpendicular side do not receive influence around the 90° cube crease. The shared crease vertices may still move because they belong to the selected face; the guard prevents influence from spreading through those vertices into the opposite surface fan. Cancel and confirm the mesh restores exactly.
- Repeat with a small selected face farther from the crease and a larger radius. Confirm the influence follows the surface's connected edge paths and remains on the same smooth side. Try Rotate and Scale as well as Move, then Apply and Undo.
- Change to Vertex Select, select a vertex on the crease and start Move with Prop enabled. Explicitly selected shared vertices seed their incident surface fans, so both sides may receive influence from that selected vertex. Confirm this differs from the face-selection side-context behavior and that the selected vertex itself still moves once.
- Automated topology regressions cover sub-55° smooth joins, sharp creases at/above 55°, edges with more than two incident faces, two face fans that meet only at one vertex, and inconsistent winding. Invalid or ambiguous neighborhoods must be isolated rather than silently bridged.
- Recheck all five falloff curves, radius changes during a modal preview, Individual Origins, disconnected islands, Cancel/Apply and Undo/Redo. Desktop Chrome/Edge acceptance remains deferred until PC access is available.

## v0.1.62 — Explicit safe topology-repair policies

- On an imported or test mesh with three faces sharing one edge, run **Validate Mesh** and confirm the non-manifold edge is reported. Run **Repair Safe Issues**. The notification must say that the non-manifold edge was preserved, and the detailed command result in the console must include the source edge key, all incident source face IDs and each directed edge use. Run Validate Mesh again; the non-manifold edge must remain rather than having a face silently deleted or an arbitrary sheet chosen.
- On a non-orientable strip (for example, a Möbius strip with a same-direction seam), run Repair Safe Issues. It must report the contradictory winding-conflict component and its source face IDs, leave that component's face winding unchanged, and retain the inconsistency in the next Validate Mesh report.
- Include a separate, ordinary orientable component with a locally reversed face. Repair Safe Issues must still reorient that independent component even when the same mesh contains a preserved non-manifold or non-orientable component.
- Confirm malformed and duplicate faces are still removed, isolated vertices are compacted, and planar/non-planar geometry is not moved by repair. The result's `policies` map must identify the keep/remove behavior. Undo must restore the pre-repair document; redo must restore the repaired-safe result.
- Ambiguous non-manifold sheets and non-orientable components intentionally remain manual-repair work. Desktop Chrome/Edge acceptance remains deferred until PC access is available.


## v0.1.63 — Loop Cut through supported extraordinary poles

- On a closed all-quad surface with a six-valence pole, select one edge in Edge Select where the quad-opposite traversal reaches two edges sharing that pole. Confirm the pole fan has a unique near-antiparallel reciprocal pair (at least 155° apart with a clear best match). Start Loop Cut; it must continue through the pole and split the complete quad strip on both sides.
- Try one cut, then two or more cuts. Drag to slide and change the cut count. Every crossing quad must split into `cuts + 1` quads, the newly selected cut edges must form separate unbranched cut paths, and the mesh must have no new non-manifold edges or inconsistent winding. Apply, Undo and Redo; Cancel must restore the exact original mesh and selection.
- Create or use an extraordinary pole whose two candidate directions are not sufficiently opposite or have tied/ambiguous best matches. Loop Cut must show a clear rejection and preserve positions, faces and selection.
- Repeat with an open fan, a fan containing a triangle/ngon, and a non-manifold spoke. All must reject without partial preview or topology mutation.
- Confirm regular quad strips and closed cube loops still cut normally; boundary stopping, offset orientation, 1–8 cuts, numeric/drag slide and modal Cancel/Apply behavior must remain unchanged. Desktop Chrome/Edge remains deferred until PC access is available.


## v0.1.64 — Radial pie menus and directional selection

### Desktop — Chrome or Edge

- Move the pointer to a safe interior point of the viewport. Hold `Z`, move the pointer toward the top/right/bottom/left sector of the radial wheel, then release `Z`. Confirm the highlighted direction activates the corresponding Solid/Wireframe/Material/Rendered shading mode. Repeat with `Shift+A` and confirm the requested Add action runs. Diagonal directions must activate their matching sector as well.
- Press and release `Z` without moving the pointer. Confirm the Shading wheel remains open; click a sector to select it. Reopen it and use arrow keys to highlight directions, `Enter` to activate and `Esc` to close. `Backspace` must also close the wheel.
- Repeat at viewport positions near each edge. The wheel must move to a safe centered position rather than clipping off-screen; it remains usable by click or keyboard navigation when the pointer-flick origin cannot be safely placed. Clicking outside the wheel closes it without also orbiting/selecting the mesh on that same pointer-down.
- Press `Shift+A` and test Cube, UV Sphere, Cylinder, Plane, Edit Mode and 3D Cursor. Confirm each still invokes its original command and the menu closes after selection.
- Enter Edit Mode and open `Select ▾`. Confirm the eight-direction wheel contains Select Tools, Proportional, Edge Loop, Edge Ring, Select All, Deselect, Invert and More Actions. Select Tools opens a second radial wheel with Click/Box/Circle/Lasso and a center Back button. More Actions opens Validate Mesh, Safe Repair, Delete and Dissolve with the same Back behavior.
- In the main Select wheel, confirm Proportional ON/OFF text and enabled styling reflect the current preference when the wheel is reopened. Run Edge Loop/Edge Ring only with valid Edge Select input; these must continue to use their existing topology commands.
- Confirm arrow keys move the highlight to the nearest available direction in both nested wheels. `Enter` activates the highlighted sector. `Esc` closes and does not trigger a viewport command. Direct clicking on each visible sector must still work.

### Android — Chrome

- Open the Add wheel from the bottom actionbar. Confirm the radial wheel fits in portrait mode without clipped/overlapping sectors. Tap each sector; verify Cube, Sphere, Cylinder, Plane, Edit Mode and 3D Cursor actions work. Tap outside the wheel; it should close without accidentally orbiting/selecting the viewport.
- In Edit Mode, open `Select ▾`. Confirm the Add to Selection ON/OFF control remains centered in the wheel. Tap it and confirm the menu closes, the mode changes, and the toolbar still shows the `+` state. Reopen the wheel; the center label must display the current ON/OFF state.
- Open Select Tools and tap Click, Box, Circle and Lasso. Confirm each tool works as before and Back returns to the main Select wheel. Open More Actions and confirm all four action sectors remain reachable; Back returns to Select.
- Recheck the wheel in a narrow portrait viewport and landscape orientation, and with the More drawer open. Every sector must remain tappable; the wheel must not block direct actionbar Move/Rotate/Scale/Extrude/Prop controls after it closes.
- Confirm existing touch orbit, two-finger pan/zoom, selection additive mode, modal controls, Undo/Redo and the `O` proportional action are unchanged. Desktop pointer-flick behavior is not applicable to touch; tapping sectors is the mobile selection path.

Full Blender keymap parity is not claimed by this build. Android touch acceptance is pending; desktop Chrome/Edge remains deferred until PC access is available.


## v0.1.65 — Numpad viewport navigation and shortcut conflict audit

### Desktop — full-size keyboard with a numeric keypad

- In Object Mode, press Numpad `1`, `3` and `7`; confirm front, right and top cardinal views. Press `Ctrl+Numpad 1/3/7`; confirm back, left and bottom views. These are still perspective-camera cardinal views; no orthographic projection toggle is claimed.
- Press Numpad `4` and `6` to orbit left/right by 15° per keypress, and `8` / `2` to orbit up/down by 15°. Press `9` to rotate the current view 180°. Confirm the camera keeps the same target and distance and that repeated vertical steps stop at the pole instead of flipping through it.
- Enter Edit Mode, select a single face, then press Numpad `.`. Confirm the selected region is centered/framed even though only one face is selected. Repeat with one edge, one vertex, and multiple selected elements in each selection mode. In Object Mode, Numpad `.` frames the active object. `Home` continues to frame the full active object regardless of Edit Mode selection.
- In Edit Mode, press the top-row `1/2/3` keys and confirm they still change Vertex/Edge/Face Select. Press Numpad `1/2/3` and confirm they navigate the view instead. With NumLock off, press Numpad `.` (which some browsers report as `Delete`); it must frame selection and must not delete geometry. The dedicated `Delete` key must still delete the selected topology/object.
- The former v0.1.65 expectation that Numpad `5` is unavailable is superseded by v0.1.66 below. Use the v0.1.66 projection-toggle procedure instead; browser-modified Numpad 5 combinations remain unhandled by Bl3nd.
- Confirm navigation shortcuts are ignored by the active text fields and do not create undo records. Reopen the radial wheels and confirm their keyboard navigation still takes priority while a wheel is open.

### Android — Chrome

- No new hardware-keyboard requirement is introduced. Confirm the existing bottom actionbar, one-finger orbit, two-finger pan/zoom, touch selection and radial menus still work. PC/numpad acceptance remains deferred until a physical keyboard is available.


## v0.1.66 — Perspective / orthographic projection toggle

- On desktop, press unmodified Numpad `5` from the current perspective view. Confirm the camera switches to orthographic without shifting the view target, changing the view direction or visibly jumping the target-plane framing. Press Numpad `5` again and confirm perspective returns with the same target-plane scale and orientation.
- On desktop and Android, tap the `P` / `O` control beside the viewport axis buttons. Confirm the button changes to `O` in orthographic mode and back to `P` in perspective mode; its title/accessible pressed state must match the active camera.
- Press Ctrl/Meta/Alt+Numpad `5` and confirm Bl3nd does not consume those browser-modified shortcuts. In orthographic mode, orbit and pan normally and use the mouse wheel or two-finger gesture to zoom. Confirm parallel edges remain parallel while zooming. In perspective mode, confirm normal depth perspective is restored.
- Resize the browser between portrait/landscape or narrow/wide dimensions while orthographic. Confirm the vertical framing remains stable and the horizontal view widens/narrows with aspect ratio. Then return to perspective and confirm the same visual framing is retained.
- In both projection modes, use Front/Right/Top axis buttons and the Numpad cardinal/orbit shortcuts. Frame the active object with Home and the selected Edit Mode elements with Numpad `.`. Confirm object/selection framing fits the object without a mode-specific jump.
- Pick visible faces/edges/vertices and place the 3D Cursor in both modes. Confirm ray picking and cursor placement target the visible geometry rather than a stale camera.
- Start Move, Rotate and Scale in orthographic mode. Confirm pointer-driven screen movement uses the orthographic world-units-per-pixel scale and is independent of pivot depth; numeric entry, axis constraints, snapping, Apply/Cancel and Undo/Redo remain unchanged. Then switch back to perspective and confirm depth/FOV movement scaling returns.
- Start Bevel, Extrude, Inset or Loop Cut. Confirm projection switching is not performed during the active modal operation; Apply/Cancel and Undo/Redo remain unaffected.
- On Android, confirm one-finger orbit, two-finger pan/zoom, selection taps, radial pie menus and the bottom actionbar remain available with the P/O button visible. Desktop numpad hardware acceptance remains pending until a physical keyboard is available.


## v0.1.67 — Mobile P/O projection control access

- On Android, confirm the small P/O button beside the X/Y/Z view axes is hidden at the mobile breakpoint. A dedicated **P/O View** control must be visible in the bottom actionbar beside the existing quick actions, with a comfortably tappable 48px height.
- Tap **P**. Confirm the viewport switches to orthographic, the button changes to **O**, its active styling appears, and the view label reports User Orthographic. The button must remain visible after switching to Edit Mode and when the More panel is closed.
- Tap **O**. Confirm perspective returns, the button changes back to **P**, active styling clears, and the label reports User Perspective. Repeat several times; each tap must perform exactly one toggle.
- Tap the P/O button while close to the viewport edge. Confirm the action changes projection without rotating the view, selecting mesh elements, placing the 3D cursor or opening another panel.
- During an active Move/Rotate/Scale, Bevel, Extrude, Inset or Loop Cut modal, confirm the mobile actionbar is disabled/visually dimmed per existing modal rules and projection switching remains blocked. Confirm Cancel/Apply restores the button's usable state.
- Verify the desktop P/O button remains beside the X/Y/Z axes and continues to synchronize with the same mobile/keyboard camera state. Desktop Numpad 5 acceptance still requires a physical keyboard.


## v0.1.68 — Command search launcher

### Desktop — Chrome / Edge
- Click the **⌕** button in the top bar. Confirm a modal Command Search panel opens, focuses its search field and displays commands available in the current Object/Edit Mode.
- Type a complete label, partial label and a multi-word synonym. Confirm results update immediately, require every query term, rank direct label matches first and show a useful empty state for unmatched queries.
- Use Up/Down to move the active result, Enter to run it, and Esc to close. Confirm the active row is visibly highlighted and announced through its selected option state.
- Search for Add Cube, Move, Front View, Projection, Frame Selection, Pivot, Bevel, Extrude, Loop Cut and a modifier. Confirm each result dispatches its existing named command, opens the expected modal where relevant, and preserves existing undo behavior.
- Enter Edit Mode and search for Delete. Confirm Delete Selected Geometry is offered and Delete Active Object is hidden; return to Object Mode and confirm the reverse. Confirm Edit Mesh commands are hidden from Object Mode.
- Press `/` with the viewport focused. Confirm Command Search opens. Press `/` while an input, textarea, select or contenteditable field is focused; confirm the character is typed normally and the palette does not open.
- Confirm Ctrl/Meta/Alt/Shift combinations are not captured by the search shortcut. Test Ctrl/Meta+Z/Y, Ctrl+B, Ctrl+R, Shift+A, Z, Tab and numpad view/projection shortcuts to confirm existing behavior and browser-reserved combinations remain unchanged.
- During G/R/S, Bevel, Extrude, Inset or Loop Cut, press `/` and confirm the palette does not open or steal modal input. Confirm the header launcher is inaccessible while the existing modal overlay rules are active. Open a radial pie menu and confirm slash does not cover it.
- Click the backdrop outside the panel to close. Confirm focus returns to the launcher and the palette can be opened again.

### Android — Chrome
- Confirm the **⌕** header button remains visible and tappable at narrow phone widths without clipping Object/Edit, Undo/Redo, Export or Import controls.
- Tap the launcher, type a search query and tap a result. Confirm the correct command runs and the palette closes. Verify the panel scrolls and result targets remain comfortably tappable.
- Confirm Android keyboard typing, text selection, scrolling, Back/Esc close behavior and touch viewport navigation remain usable after closing the palette.


## v0.1.69 — Object Mode multi-selection and pivot aggregation

### Desktop — Chrome / Edge
- In Object Mode, click one object, then Shift+click a second. Confirm both remain highlighted, the second becomes active, and the footer reports the selected count. Shift+click the active object to remove it; the remaining selected object becomes active. Shift+click the final object to clear the group, then click empty viewport space to clear a normal selection.
- Create or import at least three objects at distinct positions and with different dimensions. Select two or more objects. Confirm the selected group persists through a scene serialize/restore path and Undo/Redo of a subsequent transform.
- Set Pivot Point to Median Point. Start Move, Rotate and Scale. Confirm every selected object moves together; rotation and scale use the arithmetic mean of selected object origins as the shared pivot. Compare a selection with a deliberately offset origin to distinguish the mean from the bounding-box center.
- Set Pivot Point to Bounding Box Center. Rotate and scale a selection containing differently sized and rotated objects. Confirm the pivot is centered on the union of their world-space mesh bounds, not the active object bounds.
- Set Pivot Point to 3D Cursor. Move the cursor away from the objects, then rotate/scale the selection. Confirm the cursor stays fixed and every selected object's origin orbits around it.
- Set Pivot Point to Individual Origins. Rotate and scale multiple objects. Confirm each object's origin stays fixed while its orientation/size changes. Confirm the viewport guide marks every object origin and labels the count as OBJECTS. Move in Individual mode and confirm all origins receive the same translation.
- Test Global and Local axis constraints. Local orientation uses the active selected object as the shared reference; confirm every selected item responds to the same constrained world axis. Test snapping and numeric input.
- Apply a multi-object transform and confirm exactly one undo step restores every object's transforms and the complete selection; Redo restores all of them. Cancel a transform and confirm every object returns to its original state with the same selection.
- Delete with multiple objects selected. Confirm all selected objects are deleted together, the remaining scene is valid and one Undo restores all deleted objects. Enter Edit Mode with multiple objects selected and confirm only the active object remains selected/edited. Return to Object Mode and verify ordinary single-object selection still works.

### Android — Chrome
- In Object Mode, confirm the **Multi OFF** actionbar button is visible in the same slot used by Proportional Editing in Edit Mode. Create a second object at a visible offset. Tap Multi ON, then tap the second object. Confirm the button turns green and reads `ON · 2`, the footer says `Selected: 2`, the active object is amber and the other selected object is blue.
- Tap empty viewport space while Multi is ON; the two-object selection must remain. Tap one selected object again; it must be removed and the remaining object becomes active, with the button/footer count changing to 1. Tap Multi OFF; the next object tap must replace the selection and the button reads `Multi OFF`.
- Enter Edit Mode and confirm Multi disappears while Prop controls take its place. Return to Object Mode and confirm Multi returns OFF.
- With at least two objects selected, start G/R/S from the bottom actionbar. Confirm the operation applies to all selected objects, mobile numeric entry and Apply/Cancel work, and camera orbit returns immediately after completion.
- Test Median, Bounding Box, Individual and Cursor pivots with Move/Rotate/Scale. Confirm individual-origin guide markers remain visible and controls do not select geometry or place the cursor accidentally.
- Confirm two-finger viewport pan/zoom, one-finger orbit, P/O View, Add, More and the mobile properties drawer remain functional.


## v0.1.71 — Draggable G/R/S gizmo

### Android — Chrome
- With an object selected in Object Mode, tap Move. Confirm the colored gizmo appears at the active pivot. Drag the red X, green Y and blue Z arrows one at a time; each drag must move the object/group only on the named Global axis and apply on finger release. Undo must restore each move in one step.
- Tap an axis handle without dragging. Confirm the operation stays active and its numeric readout names that axis. Enter a numeric amount and apply; confirm the same constrained axis is used. Esc must cancel and restore the original transform.
- Tap the center handle and drag. Confirm free Move follows the camera-facing view plane. Repeat with Scale: the axis arrows constrain scale and the center handle performs uniform scale. Scale on multiple objects should preserve the complete selection and undo as one transaction.
- Tap Rotate. Confirm red/green/blue rings appear. Drag each ring and confirm rotation is around its matching Global axis; use the center handle for the existing free trackball rotation. Release must apply one undoable transform. Verify Esc cancels.
- Repeat in Edit Mode with a vertex, edge and face selection; proportional editing on/off; and Individual Origins. Confirm the same underlying modal operator is used and no topology or selection changes occur from starting/dragging the gizmo.
- During a gizmo drag, confirm the camera does not orbit, the viewport does not pick another object, and movement outside the visible ring/arrow still updates until release. After apply/cancel, one-finger orbit and two-finger pan/zoom work immediately again. Confirm the numeric pad remains tappable while a transform is active.

### Desktop — Chrome / Edge (deferred)
- Repeat axis-arrow Move/Scale and axis-ring Rotate with a mouse. Confirm a drag-release is one transaction, a click-only selects a constraint without committing, and the center handle provides free transforms. Confirm ordinary viewport dragging, Shift plane constraints, numeric input, Enter/Esc, snap settings, Undo/Redo and object picking are unchanged.

## v0.1.72 — Mobile viewport drag passthrough during G/R/S

### Android — Chrome
- Tap Move, Rotate or Scale from the bottom actionbar. Without touching a gizmo arrow/ring/center, press on an ordinary empty area of the viewport and drag. Confirm the object preview updates continuously from the finger movement; numeric keypad entry is optional, not required.
- Repeat the blank-area drag on top of the grid, in front of/behind the selected object, and near the viewport edges. Confirm the camera does not orbit and normal object picking does not occur while the modal is active.
- Drag the red/green/blue arrow or rotation-ring handle. Confirm the gizmo remains interactive and commits on release. Tap a handle without dragging and confirm it only selects the constraint.
- Confirm the numeric pad still accepts typed values, Enter applies, Escape cancels, and after Apply/Cancel one-finger orbit and two-finger pan/zoom work again.

### Desktop — Chrome / Edge
- Confirm ordinary viewport drags still adjust an active G/R/S modal while visible SVG gizmo handles independently capture axis/center drags. Clicks outside the handles must reach the renderer canvas; clicks on handles must reach only the gizmo action.



## v0.1.73 — Free viewport G/R/S pointer ownership

### Android — Chrome / Samsung Internet
- With an object selected, tap Move. Touch an ordinary empty grid area well away from the center/axis handles and drag in two different directions. Confirm the object preview follows the finger freely in the camera-facing view plane; it must not require an arrow or numeric entry.
- Repeat for Rotate: drag an ordinary empty viewport area and confirm the free trackball preview responds. Repeat for Scale and confirm uniform scaling responds from the same blank-area gesture.
- Repeat all three operations in Edit Mode with a selected vertex/edge/face. Confirm proportional settings still apply and no camera orbit or picking happens during the modal drag.
- Start a blank-area drag and move across the projected gizmo/guide area and toward the viewport edge. Confirm the same initiating pointer continues to update the transform even if the browser changes the event target. Release the finger, then use Apply/Enter to commit or Cancel/Esc to restore.
- Confirm axis arrows/rings remain constrained to X/Y/Z and still release-to-apply. The center handle remains the direct free-transform handle. Verify one undo restores each committed operation and orbit resumes after Apply/Cancel.

### Desktop — Chrome / Edge
- Repeat blank-viewport free Move, trackball Rotate and uniform Scale with a mouse. Move the pointer across the visible guide and outside the canvas before releasing; confirm the initiating pointer still updates the modal. Confirm axis arrows/rings and keyboard numeric input remain unchanged.


## v0.1.74 — Move/Scale plane-square gizmo handles

### Android — Chrome / Samsung Internet
- Start Move and confirm three small square handles appear between the corresponding axis arrows. Drag XY, YZ and XZ separately; motion must remain within only the selected plane and the selected square must highlight.
- Repeat with Scale; each square must scale in its named plane and leave the perpendicular component unchanged. Confirm a square remains easy to grab on a phone and does not prevent dragging a nearby axis arrow or center handle.
- Repeat with Global and Local orientation, in Object Mode and Edit Mode, including a multi-object selection and proportional Edit Mode selection. Confirm the squares follow the current orientation and still operate on the existing modal transform transaction.
- Confirm release commits one undo step, Undo restores the prior state, Esc cancels, and a blank-area drag still performs free Move/Rotate/Scale. Rotate should continue showing only its three axis rings (no plane squares).

### Desktop — Chrome / Edge (deferred)
- Repeat each Move/Scale plane square with a mouse and compare with Shift+X/Y/Z keyboard plane constraints. Verify plane hit targets do not steal neighboring axis/ring/center handle clicks and verify numeric entry, snapping, Enter/Esc, Undo/Redo and viewport navigation.
