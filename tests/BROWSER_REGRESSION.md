# Bl3nd Desktop / Mobile Browser Regression

This is a manual acceptance run for the deployed Bl3nd app. It checks the real browser input path and cannot be replaced by a successful GitHub Pages deployment or by the Node topology tests.

## Build under test

Open the deployed app only after the latest Pages workflow succeeds:

`https://n0nam3-bot.github.io/Bl3nd/`

Expected baseline at the time this procedure was added: `main` commit `8931a2d863961477b2321e107c3f27575775a3ea`, v0.1.25, Pages workflow run #33. Reload the page after deployment so the v24 service-worker cache is current.

## Desktop — Chrome or Edge

1. Open the app in a normal browser window. Wait for the startup overlay to disappear. Confirm the 3D canvas is visible, the footer says `Ready` (or an appropriate object status), and no startup error overlay remains.
2. Drag with the left mouse button to orbit. Right-drag to pan. Scroll to zoom. Confirm the camera responds in the direction of the pointer and a stationary click still selects rather than orbiting.
3. Press `Tab` to enter Edit Mode and `2` for Edge Select. Select a connected three-edge path on the starter cube. Confirm selected edges are visibly highlighted and the Bevel action is available.
4. Press `Ctrl+B`. Drag horizontally and confirm the preview width changes continuously. Confirm camera orbit is paused while the modal Bevel operation is active.
5. Press `+` and `-` to change segment count. Press `]` and `[` to change profile. Confirm the readout reflects the current values and the preview updates without leaving gaps or losing the miter joins.
6. Press `Esc`. Confirm the exact original cube topology and selection return. Confirm no Bevel undo step was created.
7. Start Bevel again, adjust width/segments/profile, and press `Enter`. Confirm the preview becomes the committed mesh and the status reports Bevel applied.
8. Press the visible Undo control or `Ctrl+Z`. Confirm the mesh returns to its pre-Bevel state. Redo with the visible control or `Ctrl+Shift+Z` and confirm the committed result returns.
9. Repeat the modal adjustment with a numeric width and arrow-key nudges. Confirm invalid/unsupported values do not mutate the source mesh.

## Android — Chrome

1. Open the same deployed URL in Chrome on the phone. Reload after the deployment. Confirm the loading overlay disappears, the viewport fills its intended area, the properties panel and bottom action bar remain usable, and no startup error is shown.
2. Use one finger to orbit. Use two fingers to pan/zoom. Confirm gestures do not become stuck after lifting either finger.
3. Enter Edit Mode and switch to Edge Select. Open `Select ▾`, choose Box, Circle or Lasso, and drag one region over a connected three-edge path on the starter cube. Confirm the selected edges are visibly highlighted and the Bevel panel action can start.
4. Start Bevel. Drag horizontally to adjust width. Use the on-screen segment and profile `+` / `−` controls. Confirm the numeric pad/readout reflects the settings and the model preview updates.
5. Cancel once with the on-screen Cancel/Escape control. Confirm the original mesh returns. Start Bevel again and apply it with the on-screen Apply/Enter control.
6. Tap Undo, then Redo. Confirm the mesh returns to the expected pre- and post-Bevel states.
7. Repeat one-finger orbit and two-finger pan/zoom after Bevel has ended. Confirm viewport controls are re-enabled.

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

This procedure validates browser interaction for the starter cube. The automated mixed-fan matrix in `tests/MixedFanBevel.test.js` separately covers terminal/internal valences four through six, rotated geometry and the guarded skewed cases. Real-device results must be recorded before the handoff can describe desktop/mobile browser regression as complete.
