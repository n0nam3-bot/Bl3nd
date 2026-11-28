import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const workerSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const entrySource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

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
    location: new URL('https://example.test/Bl3nd/sw.js?v=0.1.82'),
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
  assert.match(entrySource, /const APP_RELEASE = '0\.1\.82'/);
  assert.match(entrySource, /workerURL\.searchParams\.set\('v', APP_RELEASE\)/);
  assert.match(entrySource, /updateViaCache: 'none'/);
  assert.match(entrySource, /serviceWorkerRegistration\.update\(\)/);
  assert.match(entrySource, /addEventListener\('visibilitychange'/);
  assert.match(entrySource, /addEventListener\('focus'/);
  assert.match(entrySource, /addEventListener\('pageshow'/);
  assert.match(entrySource, /addEventListener\('controllerchange'/);
});

test('new release derives fresh shell/runtime caches and bypasses HTTP cache for app-shell precache', async () => {
  const harness = createWorkerHarness();
  let installPromise;
  harness.listeners.get('install')({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;

  assert.ok(harness.openedCaches.includes('bl3nd-shell-0.1.82'));
  assert.ok(harness.precacheRequests.length > 0);
  assert.ok(harness.precacheRequests.every(request => request.cache === 'reload'));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/index.html')));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/src/main.js')));
  assert.ok(harness.precacheRequests.some(request => request.url.endsWith('/Bl3nd/src/modifiers/CatmullClark.js')));
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
  assert.ok(harness.openedCaches.includes('bl3nd-shell-0.1.82'));
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


test('modifier panel exposes Mirror axis and center-plane merge distance', () => {
  assert.match(mainSource, /addField\('Merge Distance','mergeDistance',clampMirrorMergeDistance\(mod\.mergeDistance\)/);
  assert.match(mainSource, /Vertices within the merge distance are snapped to the center plane/);
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
