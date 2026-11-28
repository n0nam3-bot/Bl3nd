import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const workerSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const entrySource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const orderSource = await readFile(new URL('../src/modifiers/ModifierStackOrder.js', import.meta.url), 'utf8');

class FakeRequest {
  constructor(input, init = {}) {
    const source = input instanceof FakeRequest
      ? input
      : { url: input instanceof URL ? input.href : String(input), method: input?.method || 'GET', mode: input?.mode || 'cors' };
    this.url = source.url;
    this.method = init.method || source.method || 'GET';
    this.mode = source.mode || init.mode || 'cors';
    this.cache = init.cache || source.cache || 'default';
  }
}

class FakeResponse {
  constructor(body, ok = true) {
    this.body = body;
    this.ok = ok;
    this.status = ok ? 200 : 503;
  }
  clone() { return new FakeResponse(this.body, this.ok); }
}

function createWorkerHarness({ fetchImpl = async () => new FakeResponse('fresh-page') } = {}) {
  const listeners = new Map();
  const openedCaches = [];
  const precacheRequests = [];
  const writes = [];
  const cacheEntries = new Map();
  const cache = {
    async addAll(requests) { precacheRequests.push(...requests); },
    async put(key, response) { cacheEntries.set(typeof key === 'string' ? key : key.url, response); },
    async match(key) {
      const normalized = typeof key === 'string' ? key : key.url;
      return cacheEntries.get(normalized) || (normalized === './index.html' ? new FakeResponse('offline-page') : undefined);
    }
  };
  const caches = {
    async open(name) { openedCaches.push(name); return cache; },
    async keys() { return openedCaches; },
    async delete() { return true; },
    async match(key) { return cache.match(key); }
  };
  const self = {
    location: new URL('https://example.test/Bl3nd/sw.js?v=0.1.87'),
    registration: { scope: 'https://example.test/Bl3nd/' },
    clients: { async claim() {} },
    addEventListener(type, listener) { listeners.set(type, listener); },
    async skipWaiting() {}
  };
  const fetchCalls = [];
  const fetch = async request => {
    fetchCalls.push(request);
    return fetchImpl(request);
  };

  vm.runInNewContext(workerSource, { self, caches, fetch, Request: FakeRequest, URL, Promise });
  return { listeners, openedCaches, precacheRequests, writes, fetchCalls, cache, FakeResponse };
}

test('app entry versions the worker URL and checks for updates on startup/foreground return', () => {
  assert.match(entrySource, /const APP_RELEASE = '0\.1\.87'/);
  assert.match(entrySource, /workerURL\.searchParams\.set\('v', APP_RELEASE\)/);
  assert.match(entrySource, /updateViaCache: 'none'/);
  assert.match(entrySource, /serviceWorkerRegistration\.update\(\)/);
  assert.match(entrySource, /addEventListener\('visibilitychange'/);
  assert.match(entrySource, /addEventListener\('focus'/);
  assert.match(entrySource, /addEventListener\('pageshow'/);
  assert.match(entrySource, /addEventListener\('controllerchange'/);
});


test('latest repository release marker bypasses the app-shell cache', async () => {
  const harness = createWorkerHarness();
  let responsePromise;
  harness.listeners.get('fetch')({
    request: { method: 'GET', url: 'https://example.test/Bl3nd/version.json?check=123', mode: 'cors' },
    respondWith(promise) { responsePromise = promise; },
    waitUntil() {}
  });
  const response = await responsePromise;
  assert.equal(response.body, 'fresh-page');
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0].cache, 'no-store');
  assert.equal(harness.openedCaches.length, 0);
});

test('workspace exposes current values, feature help, separate versions and a scene-preserving reset', () => {
  assert.match(mainSource, /bindNumericReadout/);
  assert.match(mainSource, /refreshRepositoryVersion/);
  assert.match(mainSource, /Reset Bl3nd to its default workspace/);
  assert.match(mainSource, /reset-workspace-panel-btn/);
  assert.match(entrySource, /id=\"reset-workspace-panel-btn\"/);
  assert.match(mainSource, /Your current scene and model are kept/);
  assert.match(mainSource, /cursor.set',\{point:\[0,0,0\]\}/);
  assert.match(mainSource, /shading.set',\{mode:'solid'\}/);
  assert.match(entrySource, /id="app-version-badge"/);
  assert.match(entrySource, /id="running-version"/);
  assert.match(entrySource, /id="repository-version"/);
  assert.match(entrySource, /<details class="panel-help/);
  assert.match(mainSource, /className='modifier-help'/);
});

test('new release derives fresh shell/runtime caches and bypasses HTTP cache for app-shell precache', async () => {
  const harness = createWorkerHarness();
  let installPromise;
  harness.listeners.get('install')({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;

  assert.ok(harness.openedCaches.includes('bl3nd-shell-0.1.87'));
  assert.ok(harness.precacheRequests.length > 0);
  assert.ok(harness.precacheRequests.every(request => request.cache === 'reload'));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/index.html')));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/src/main.js')));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/src/modifiers/CatmullClark.js')));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/src/core/EditOverlayStyle.js')));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/src/modifiers/ModifierBudget.js')));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/src/modifiers/ModifierStackOrder.js')));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/src/modifiers/MirrorGeometry.js')));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/src/modifiers/SolidifyGeometry.js')));
});

test('page navigation bypasses HTTP cache, returns the network page and stores an offline copy', async () => {
  const harness = createWorkerHarness();
  let responsePromise;
  const waitUntilPromises = [];
  harness.listeners.get('fetch')({
    request: { method: 'GET', url: 'https://example.test/Bl3nd/', mode: 'navigate' },
    respondWith(promise) { responsePromise = promise; },
    waitUntil(promise) { waitUntilPromises.push(promise); }
  });

  const response = await responsePromise;
  await Promise.all(waitUntilPromises);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0].cache, 'no-store');
  assert.equal(response.body, 'fresh-page');
  assert.ok(harness.openedCaches.includes('bl3nd-shell-0.1.87'));
});

test('offline navigation keeps the last cached app page available', async () => {
  const harness = createWorkerHarness({ fetchImpl: async () => { throw new Error('offline'); } });
  let responsePromise;
  harness.listeners.get('fetch')({
    request: { method: 'GET', url: 'https://example.test/Bl3nd/', mode: 'navigate' },
    respondWith(promise) { responsePromise = promise; },
    waitUntil() {}
  });

  const response = await responsePromise;
  assert.equal(response.body, 'offline-page');
});


test('mobile modifier panel exposes three large, named subdivision-level choices', () => {
  assert.match(mainSource, /SUBDIVISION LEVEL/);
  assert.match(mainSource, /getSubdivisionLevelOptions\(activeLevel\)/);
  assert.match(mainSource, /choice\.textContent=option\.label/);
  assert.match(mainSource, /choice\.setAttribute\('aria-pressed',String\(option\.selected\)\)/);
  assert.match(mainSource, /const previousValue = item\[field\]/);
  assert.match(mainSource, /item\[field\] = previousValue/);
  assert.match(mainSource, /More → Mods|More/);
  assert.match(styleSource, /\.modifier-level-button\[aria-pressed="true"\]/);
  assert.match(styleSource, /\.modifier-level-button\{min-height:46px/);
});


test('modifier panel exposes Mirror bisect, side flip and center-plane merge distance', () => {
  assert.match(mainSource, /addField\('Merge Distance','mergeDistance',clampMirrorMergeDistance\(mod\.mergeDistance\)/);
  assert.match(mainSource, /Bisect keeps only one side of the object origin plane/);
  assert.match(mainSource, /Flip retained side switches from the positive half to the negative half/);
  assert.match(mainSource, /addToggleField\('Bisect at center plane','bisect'/);
  assert.match(mainSource, /field === 'mergeDistance' \? clampMirrorMergeDistance\(value\)/);
  assert.match(mainSource, /DEFAULT_MIRROR_MERGE_DISTANCE|clampMirrorMergeDistance/);
});


test('mobile Solidify card exposes touch-sized Thickness and Inside/Center/Outside controls', () => {
  assert.match(mainSource, /SHELL POSITION/);
  assert.match(mainSource, /INSIDE/);
  assert.match(mainSource, /CENTER/);
  assert.match(mainSource, /OUTSIDE/);
  assert.match(mainSource, /solidify-position-button/);
  assert.match(mainSource, /clampSolidifyThickness\(value\)/);
  assert.match(mainSource, /clampSolidifyOffset\(value\)/);
  assert.match(styleSource, /\.solidify-position-button\{[^}]*min-height:40px/);
  assert.match(styleSource, /\.solidify-position-button\{min-height:46px/);
});


test('modifier add/toggle/remove/update restore previous stack state after worker rejection', () => {
  assert.match(mainSource, /const modifier = modifierStack\.add\(mesh, type\)/);
  assert.match(mainSource, /filter\(item => item\.id !== modifier\.id\)/);
  assert.match(mainSource, /modifiers\.splice\(index, 0, removed\)/);
  assert.match(mainSource, /item\.enabled = previousValue/);
  assert.match(mainSource, /item\[field\] = previousValue/);
  assert.match(mainSource, /refreshModifiers\(\);\s*throw error/);
});


test('modifier panel exposes staged progress, an explicit cancel action and device-limit feedback', () => {
  const htmlSource = entrySource;
  assert.match(htmlSource, /id="modifier-progress-panel"/);
  assert.match(htmlSource, /id="modifier-cancel-btn"/);
  assert.match(mainSource, /onProgress: updateModifierProgress/);
  assert.match(mainSource, /modifierStack\.cancel\('Cancelled by user/);
  assert.match(mainSource, /getModifierBudget\(capabilities\)/);
  assert.match(mainSource, /isIndeterminate/);
  assert.match(styleSource, /modifier-progress-sweep/);
  assert.match(mainSource, /AbortError/);
  assert.match(mainSource, /function assertStableModelForModifiers\(\)/);
  assert.match(mainSource, /Apply or cancel the active modeling operation before evaluating modifiers/);
  assert.match(styleSource, /\.modifier-progress-panel/);
  assert.match(styleSource, /@media\(max-width:650px\).*modifier-progress-heading button/s);
});


test('modifier cards expose safe per-stage reordering and visible stack diagnostics', () => {
  assert.match(mainSource, /commandBus\.register\('modifier\.move'/);
  assert.match(mainSource, /reorderModifierAndEvaluate\(/);
  assert.match(mainSource, /catch \(error\) \{\s*refreshModifiers\(\);\s*throw error;/);
  assert.match(orderSource, /mesh\.userData\.modifiers = reordered\.modifiers/);
  assert.match(orderSource, /mesh\.userData\.modifiers = previousModifiers/);
  assert.match(mainSource, /Move .* earlier in the stack/);
  assert.match(mainSource, /Move .* later in the stack/);
  assert.match(mainSource, /modifier-stack-summary/);
  assert.match(mainSource, /ENABLED.*BYPASSED/s);
  assert.match(styleSource, /\.modifier-order-button/);
  assert.match(styleSource, /\.modifier-stack-summary/);
});


test('modifier cards expose expandable per-stage input/output and timing inspection', () => {
  assert.match(mainSource, /getLastDiagnostics\(mesh\)/);
  assert.match(mainSource, /Inspect last accepted stage output/);
  assert.match(mainSource, /INPUT/);
  assert.match(mainSource, /OUTPUT/);
  assert.match(mainSource, /STAGE TIME/);
  assert.match(mainSource, /worker round-trip/);
  assert.match(mainSource, /Intermediate geometry buffers are not retained/);
  assert.match(styleSource, /\.modifier-stage-inspector/);
  assert.match(styleSource, /@media\(max-width:650px\).*modifier-stage-inspector>summary/s);
});
