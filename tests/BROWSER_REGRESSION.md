# Bl3nd Desktop / Mobile Browser Regression

This is a manual acceptance run for the deployed Bl3nd app. It checks the real browser input path and cannot be replaced by a successful GitHub Pages deployment or by the Node topology tests.

## Build under test

Open the deployed app only after the latest Pages workflow succeeds:

`https://n0nam3-bot.github.io/Bl3nd/`

Latest deployed baseline before this package is v0.1.34, `main` commit `7dba192191717f646ae09160b6c236e5eb9e5ccf`, Pages workflow run #42 (success). After uploading v0.1.35, reload and allow the v32 service-worker cache to activate before testing.

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
11. Switch to Face Select (`3`), select one cube face, and press `Ctrl+B`. Confirm the FACE BEVEL readout appears and the selected patch rises with one continuous perimeter transition. Drag horizontally and type a value; the reported width and mesh must update together. Segment/profile controls must be absent/ignored in this mode.
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
9. Switch to Face Select and tap one cube face. Open **Bevel** from the Edit Mesh panel. Confirm Face Bevel starts, its amount/width readout is visible, and horizontal drag plus numeric-pad entry update the same preview. The 1–8 segment and profile rows must both be visible.
10. Try 1, 2, 4 and 8 segments. Try profile 0, 0.50 and 1. Confirm the model, count readout and profile readout update without cracks or invalid geometry.
11. Cancel and verify the exact original mesh returns without an undo entry. Start again, set multiple segments/profile, and Apply; verify one undo step, then Undo/Redo.
12. Select two adjacent coplanar faces and repeat. Confirm the common inner seam stays welded and the transition walls form one continuous perimeter. Repeat with a concave L region and confirm the transition remains valid.
13. Before launching Face Bevel, set Box/Circle/Lasso selection. After Apply or Cancel, verify Click Select is restored automatically and orbit/pan work immediately without changing Object/Edit Mode or manually selecting Click Select.
14. Repeat one-finger orbit and two-finger pan/zoom after Extrude, Inset and Face Bevel have ended. Confirm viewport controls are re-enabled.

## Owner-reported Android acceptance — v0.1.31 / v0.1.33 / v0.1.34 (2026-11-27)

- The owner reports Pass for connected-region Extrude, concave L-region Extrude, single-face Inset, connected-face Inset, convex Face Bevel, concave Face Bevel, Cancel restoration, Apply and Undo/Redo.
- Post-operation viewport gestures were recoverable, but did not work immediately: the owner had to switch to Object Mode or choose Edit Mode → Click Select. This is recorded as a UX defect, not a clean pass.
- v0.1.35 changes all mesh modal completion/cancel paths to restore Click Select automatically instead of restoring a persistent Box/Circle/Lasso tool. The automatic reset requires a fresh Android browser retest; no retest is claimed in this package.
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

## Face-region Bevel regression — v0.1.33/v0.1.34 (automated; browser run pending)

- v0.1.33 automated tests cover convex single-face and connected multi-face regions, welded internal seams, rotated-plane normals, reversed winding, miter limits, numeric bounds, modal amount updates, Cancel and one-step commit/undo metadata.
- v0.1.34 adds concave L-shaped and two-reflex U-shaped regions, rotated and reversed concave regions, retained internal seams, modal preview/Cancel/Apply and an acute reflex notch that must reject for excessive miter without source mutation. Holes, multiple loops, disconnected islands, non-planar input and invalid amounts remain rejected.
- Face Bevel accepts one connected, consistently wound planar region with one simple boundary. Supported reflex/concave corners are accepted only when the inward offset remains inside and simple and every miter and transition wall passes candidate validation. v0.1.35 adds 1–8 transition segments and a 0–1 concave/rounded/convex profile. Height remains coupled to width.
- The owner reports the v0.1.31–v0.1.34 geometry/modal acceptance checks passed, with a post-operation navigation workaround recorded above. On v0.1.35 Android Chrome, verify startup, Face Select, panel Bevel launch, drag/numeric amount, 1–8 segment controls, profile 0/0.50/1, concave L preview, Cancel, Apply, Undo/Redo and immediate orbit/pan after the new automatic Click Select reset. Confirm acute excessive-miter, hole/disconnected and non-planar regions reject without mutation. Desktop Chrome/Edge remains deferred until the owner can access a PC.

## Record results

For each device, record:

- Device model and OS version.
- Browser name and exact version.
- Whether cold startup completed and the 3D canvas appeared.
- Whether orbit, pan, zoom and selection behaved as expected.
- Whether Edge Bevel and Face Bevel amount/width, 1–8 segment count and profile 0–1 controls updated the previews; Face Bevel uses the same segment/profile controls as Edge Bevel.
- Whether Cancel restored the original mesh without an undo entry.
- Whether Face-region Inset and concave multi-face Extrude previewed correctly, Cancel restored the original, Confirm created one undoable operation and Undo/Redo restored both states.
- Whether Face Bevel previewed/applied for supported convex and concave planar regions, segment/profile changes updated geometry, Cancel restored the source, one undo operation was recorded, Undo/Redo restored both states, and excessive-miter/hole/disconnected/non-planar regions rejected safely.
- Whether Click Select was restored after each modal operation and viewport orbit/pan worked immediately without switching Object/Edit Mode.
- Any visible error text and the first app-owned console error, if available.

Mark each step as **Pass**, **Fail**, or **Not tested**. Do not interpret extension-injected console messages as Bl3nd errors without confirming their source. Do not change topology validation to make a failing geometry case appear to pass; unsupported or invalid candidates must leave the source mesh unchanged.

## Scope and limitations

This procedure validates browser interaction for the starter cube. The automated mixed-fan matrix in `tests/MixedFanBevel.test.js` separately covers terminal/internal valences four through six, rotated geometry and the guarded skewed cases. `tests/ScreenRegion.test.js` validates pure 2D segment/region intersection math; it does not replace the real browser raycast/touch check. Real-device results must be recorded before the handoff can describe desktop/mobile browser regression as complete.
