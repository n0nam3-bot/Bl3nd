# Bl3nd Desktop / Mobile Browser Regression

This is a manual acceptance run for the deployed Bl3nd app. It checks the real browser input path and cannot be replaced by a successful GitHub Pages deployment or by the Node topology tests.

## Build under test

Open the deployed app only after the latest Pages workflow succeeds:

`https://n0nam3-bot.github.io/Bl3nd/`

Latest deployed baseline before this package is v0.1.31, `main` commit `99d70bc520372ea72bac5ec1ec249d19e81371d1`, Pages workflow run #39 (success). After uploading v0.1.32, reload and allow the v29 service-worker cache to activate before testing.

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
9. Repeat one-finger orbit and two-finger pan/zoom after each modal operation has ended. Confirm viewport controls are re-enabled.

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

## Record results

For each device, record:

- Device model and OS version.
- Browser name and exact version.
- Whether cold startup completed and the 3D canvas appeared.
- Whether orbit, pan, zoom and selection behaved as expected.
- Whether Bevel width, segment and profile controls updated the preview.
- Whether Cancel restored the original mesh without an undo entry.
- Whether Face-region Inset and concave multi-face Extrude previewed correctly, Cancel restored the original, Confirm created one undoable operation and Undo/Redo restored both states.
- Any visible error text and the first app-owned console error, if available.

Mark each step as **Pass**, **Fail**, or **Not tested**. Do not interpret extension-injected console messages as Bl3nd errors without confirming their source. Do not change topology validation to make a failing geometry case appear to pass; unsupported or invalid candidates must leave the source mesh unchanged.

## Scope and limitations

This procedure validates browser interaction for the starter cube. The automated mixed-fan matrix in `tests/MixedFanBevel.test.js` separately covers terminal/internal valences four through six, rotated geometry and the guarded skewed cases. `tests/ScreenRegion.test.js` validates pure 2D segment/region intersection math; it does not replace the real browser raycast/touch check. Real-device results must be recorded before the handoff can describe desktop/mobile browser regression as complete.
