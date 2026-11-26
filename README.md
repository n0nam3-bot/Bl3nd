# FORGE 3D — Browser Modeler

A zero-build, mobile-first browser 3D modeling foundation. The app runs as static HTML/CSS/native JavaScript modules and uses Three.js from a pinned CDN import map.

## First deployment

1. Create a GitHub repository with a `main` branch.
2. Create `.github/workflows/unpack-update.yml` in the GitHub web editor using the exact bootstrap workflow supplied with this release.
3. In repository Settings, set Actions → General → Workflow permissions to **Read and write permissions**. Set Pages → Build and deployment → Source to **GitHub Actions**.
4. Upload `initial-release.zip` into the repository's `uploads/` folder. The action extracts it into the repository root, removes the uploaded ZIP, commits the files, and dispatches the Pages deployment.

The application does not require a build command. Open the GitHub Pages URL after the deployment workflow completes.

## Controls

- `Tab`: Object/Edit Mode
- `G`, `R`, `S`: Move, Rotate, Scale modal transforms
- `X`, `Y`, `Z`: axis lock; `Shift + X/Y/Z`: plane intent
- Numeric keys, `Enter`, `Esc`: enter value, apply, cancel
- Edit Mode `1/2/3`: vertex/edge/face selection
- Edit Mode `E` / `I`: Extrude / Inset
- `Shift + A`: add menu; `Z`: shading menu
- Numpad `1/3/7`: front/right/top views; scroll: zoom
- Mouse middle drag: orbit; Shift + middle drag: pan
- Mobile: one-finger orbit, pinch/pan, long-press to place cursor, bottom quick actions

See [`HANDOFF.md`](./HANDOFF.md) for architecture, exact implementation status, limitations and roadmap. This is an initial engineering foundation, not yet a feature-for-feature Blender clone.
