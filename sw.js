const RELEASE_VERSION = new URL(self.location.href).searchParams.get('v') || '0.1.86';
const CACHE_VERSION = RELEASE_VERSION.replace(/[^a-zA-Z0-9._-]/g, '-');
const SHELL_CACHE = `bl3nd-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `bl3nd-runtime-${CACHE_VERSION}`;
const APP_SHELL = [
  './', './index.html', './manifest.json', './src/styles.css',
  './src/main.js', './src/core/DeviceCapabilities.js', './src/core/CommandBus.js', './src/core/SceneAutosave.js', './src/core/ObjectSelection.js',
  './src/core/HalfEdgeMesh.js', './src/core/FaceRegionBoundary.js', './src/core/SelectionView.js', './src/core/SceneDocument.js', './src/core/UndoManager.js', './src/core/ScreenRegion.js', './src/core/TransformOrientation.js', './src/core/TransformReadout.js', './src/core/TransformSnap.js', './src/core/TransformGuideGeometry.js', './src/core/ViewportNavigation.js', './src/core/CameraProjection.js', './src/core/ProjectionToggle.js', './src/core/TransformPivot.js', './src/core/ProportionalEditing.js', './src/core/SelectionAddMode.js', './src/core/TouchSelectionInput.js', './src/core/TransformGizmoInput.js', './src/core/SceneExplorerModel.js', './src/core/TransformToolSelection.js', './src/core/EditOverlayStyle.js', './src/core/SelectedFaceRegions.js', './src/core/WarpedQuadTriangulation.js',
  './src/operators/ModalTransform.js', './src/operators/LoopCutModal.js', './src/operators/BevelModal.js', './src/operators/FaceOperationModal.js', './src/operators/MeshOperators.js',
  './src/input/KeyboardController.js', './src/input/TouchController.js', './src/input/SelectionGestureController.js',
  './src/io/ModelIO.js', './src/operators/SelectionOperators.js', './src/modifiers/ModifierStack.js', './src/modifiers/CatmullClark.js', './src/modifiers/MirrorGeometry.js', './src/modifiers/SolidifyGeometry.js', './src/modifiers/ModifierBudget.js', './src/modifiers/ModifierStackOrder.js',
  './src/ui/Viewport.js', './src/ui/SceneExplorer.js', './src/ui/EditModeOverlay.js', './src/ui/RadialPieMenu.js', './src/ui/CommandSearch.js', './src/workers/modifier.worker.js', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Bypass the browser HTTP cache when building a new app shell. This prevents a
    // new service worker from precaching an older copy of a changed repo file.
    const freshRequests = APP_SHELL.map(path => new Request(
      new URL(path, self.registration.scope),
      { cache: 'reload' }
    ));
    await cache.addAll(freshRequests);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => (key.startsWith('forge-') || key.startsWith('bl3nd-')) && ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    // Cache CDN ES modules and lazy-loaded Wasm only after a successful CORS response.
    if (request.destination === 'script' || url.pathname.endsWith('.wasm')) {
      event.respondWith((async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request).then(response => {
          if (response.ok && response.type !== 'opaque') cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || network;
      })());
    }
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Navigation must reach GitHub Pages rather than a stale browser HTTP-cache entry.
        const response = await fetch(new Request(request, { cache: 'no-store' }));
        if (response.ok) {
          const cacheWrite = caches.open(SHELL_CACHE)
            .then(cache => cache.put('./index.html', response.clone()))
            .catch(() => {});
          event.waitUntil(cacheWrite);
        }
        return response;
      } catch {
        // Keep the last precached page usable when the device is genuinely offline.
        const currentCache = await caches.open(SHELL_CACHE);
        return (await currentCache.match('./index.html')) || caches.match('./index.html');
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const currentCache = await caches.open(SHELL_CACHE);
    const cached = await currentCache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cacheWrite = currentCache.put(request, response.clone()).catch(() => {});
        event.waitUntil(cacheWrite);
      }
      return response;
    } catch (error) {
      const fallback = await caches.match(request);
      if (fallback) return fallback;
      throw error;
    }
  })());
});
