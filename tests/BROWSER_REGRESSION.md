# Bl3nd Desktop / Mobile Browser Regression

This is a manual acceptance run for the deployed Bl3nd app. It checks the real browser input path and cannot be replaced by a successful GitHub Pages deployment or by the Node topology tests.

## Build under test

Open the deployed app only after the latest Pages workflow succeeds:

`https://n0nam3-bot.github.io/Bl3nd/`

Build under desktop test: v0.1.27, `main` commit `34388f2edf4c243aacdc4bd7a934ca3775aa6bde`, Pages workflow run #35. Reload the app and allow the v25 service-worker cache to activate before testing.

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
4. Start Bevel. Drag horizontally to adjust width. Use the on-screen segment and profile `+` / `−` controls. Confirm the numeric pad/readout reflects the settings and the model preview updates.
5. Cancel once with the on-screen Cancel/Escape control. Confirm the original mesh returns. Start Bevel again and apply it with the on-screen Apply/Enter control.
6. Tap Undo, then Redo. Confirm the mesh returns to the expected pre- and post-Bevel states.
7. Repeat one-finger orbit and two-finger pan/zoom after Bevel has ended. Confirm viewport controls are re-enabled.

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

## Record results

For each device, record:

- Device model and OS version.
- Browser name and exact version.
- Whether cold startup completed and the 3D canvas appeared.
- Whether orbit, pan, zoom and selection behaved as expected.
- Whether Bevel width, segment and profile controls updated the preview.
- Whether Cancel restored the original mesh without an undo entry.
- Whether Confirm created one undoable operation and Undo/Redo restored both states.
- Any visible error text and the first app-owned console error, if available.

Mark each step as **Pass**, **Fail**, or **Not tested**. Do not interpret extension-injected console messages as Bl3nd errors without confirming their source. Do not change topology validation to make a failing geometry case appear to pass; unsupported or invalid candidates must leave the source mesh unchanged.

## Scope and limitations

This procedure validates browser interaction for the starter cube. The automated mixed-fan matrix in `tests/MixedFanBevel.test.js` separately covers terminal/internal valences four through six, rotated geometry and the guarded skewed cases. `tests/ScreenRegion.test.js` validates pure 2D segment/region intersection math; it does not replace the real browser raycast/touch check. Real-device results must be recorded before the handoff can describe desktop/mobile browser regression as complete.
