const SHELL_CACHE = 'bl3nd-shell-v65';
const RUNTIME_CACHE = 'bl3nd-runtime-v65';
const APP_SHELL = [
  './', './index.html', './manifest.json', './src/styles.css',
  './src/main.js', './src/core/DeviceCapabilities.js', './src/core/CommandBus.js',
  './src/core/HalfEdgeMesh.js', './src/core/FaceRegionBoundary.js', './src/core/SelectionView.js', './src/core/SceneDocument.js', './src/core/UndoManager.js', './src/core/ScreenRegion.js', './src/core/TransformOrientation.js', './src/core/TransformReadout.js', './src/core/TransformSnap.js', './src/core/TransformGuideGeometry.js', './src/core/ViewportNavigation.js', './src/core/CameraProjection.js', './src/core/ProjectionToggle.js', './src/core/TransformPivot.js', './src/core/ProportionalEditing.js', './src/core/SelectionAddMode.js', './src/core/SelectedFaceRegions.js', './src/core/WarpedQuadTriangulation.js',
  './src/operators/ModalTransform.js', './src/operators/LoopCutModal.js', './src/operators/BevelModal.js', './src/operators/FaceOperationModal.js', './src/operators/MeshOperators.js',
  './src/input/KeyboardController.js', './src/input/TouchController.js', './src/input/SelectionGestureController.js',
  './src/io/ModelIO.js', './src/operators/SelectionOperators.js', './src/modifiers/ModifierStack.js',
  './src/ui/Viewport.js', './src/ui/EditModeOverlay.js', './src/ui/RadialPieMenu.js', './src/ui/CommandSearch.js', './src/workers/modifier.worker.js', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(APP_SHELL);
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
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone(); caches.open(SHELL_CACHE).then(cache => cache.put('./index.html', copy)); return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(SHELL_CACHE).then(cache => cache.put(request,response.clone()));
    return response;
  })));
});
