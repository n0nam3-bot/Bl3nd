import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneAutosave, isRecoverableSceneSnapshot } from '../src/core/SceneAutosave.js';

function snapshot(x = 0) {
  return {
    version: 1,
    cursor: [0, 0, 0],
    mode: 'object',
    pivot: 'median',
    selectionMode: 'face',
    nameCounter: 2,
    activeIndex: 0,
    selectedIndices: [0],
    objects: [{
      name: 'Cube.001', positions: [[x, 0, 0], [1, 0, 0], [0, 1, 0]],
      faces: [[0, 1, 2]], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    }]
  };
}

function memoryStore(initial = null) {
  return {
    record: initial ? { snapshot: initial, savedAt: 100 } : null,
    saves: [],
    async load() { return this.record; },
    async save(value) {
      this.saves.push(value);
      this.record = { snapshot: value, savedAt: this.saves.length + 100 };
      return true;
    }
  };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('recoverable snapshot validation accepts SceneDocument version 1 data', () => {
  assert.equal(isRecoverableSceneSnapshot(snapshot()), true);
  assert.equal(isRecoverableSceneSnapshot({ ...snapshot(), version: 2 }), false);
  assert.equal(isRecoverableSceneSnapshot({ ...snapshot(), cursor: [0, NaN, 0] }), false);
  assert.equal(isRecoverableSceneSnapshot({ ...snapshot(), objects: [{ positions: 'bad' }] }), false);
});

test('load returns the last local snapshot record without modifying it', async () => {
  const saved = snapshot(3);
  const store = memoryStore(saved);
  const autosave = new SceneAutosave({ store });
  const record = await autosave.load();
  assert.equal(record.snapshot.objects[0].positions[0][0], 3);
  assert.equal(store.saves.length, 0);
  autosave.dispose();
});

test('scheduled writes debounce rapid scene changes and save only the newest snapshot', async () => {
  const store = memoryStore();
  const autosave = new SceneAutosave({ store, debounceMs: 25 });
  autosave.schedule(() => snapshot(1));
  await delay(10);
  autosave.schedule(() => snapshot(2));
  await delay(10);
  autosave.schedule(() => snapshot(3));
  await delay(45);
  assert.equal(store.saves.length, 1);
  assert.equal(store.record.snapshot.objects[0].positions[0][0], 3);
  autosave.dispose();
});

test('a modal guard prevents an in-progress preview from replacing the committed snapshot', async () => {
  const store = memoryStore(snapshot(4));
  const autosave = new SceneAutosave({ store, debounceMs: 5 });
  let modalActive = true;
  autosave.schedule(() => snapshot(99), () => !modalActive);
  await delay(15);
  assert.equal(store.saves.length, 0);
  assert.equal(store.record.snapshot.objects[0].positions[0][0], 4);
  modalActive = false;
  autosave.schedule(() => snapshot(5), () => !modalActive);
  await delay(15);
  assert.equal(store.record.snapshot.objects[0].positions[0][0], 5);
  autosave.dispose();
});

test('flush bypasses the debounce and writes the current scene for page-hide recovery', async () => {
  const store = memoryStore();
  const autosave = new SceneAutosave({ store, debounceMs: 1000 });
  autosave.schedule(() => snapshot(7));
  const saved = await autosave.flush(() => snapshot(8));
  assert.equal(saved, true);
  assert.equal(store.saves.length, 1);
  assert.equal(store.record.snapshot.objects[0].positions[0][0], 8);
  await delay(10);
  assert.equal(store.saves.length, 1);
  autosave.dispose();
});

test('flush respects the active-modal guard', async () => {
  const store = memoryStore(snapshot(2));
  const autosave = new SceneAutosave({ store, debounceMs: 1000 });
  assert.equal(await autosave.flush(() => snapshot(9), () => false), false);
  assert.equal(store.saves.length, 0);
  assert.equal(store.record.snapshot.objects[0].positions[0][0], 2);
  autosave.dispose();
});

test('serialized writes remain ordered when saves overlap', async () => {
  const values = [];
  const store = {
    async load() { return null; },
    async save(value) { await delay(value.objects[0].positions[0][0] === 1 ? 15 : 1); values.push(value.objects[0].positions[0][0]); }
  };
  const autosave = new SceneAutosave({ store });
  const first = autosave.writeSnapshot(() => snapshot(1));
  const second = autosave.writeSnapshot(() => snapshot(2));
  await Promise.all([first, second]);
  assert.deepEqual(values, [1, 2]);
  autosave.dispose();
});

test('storage failures are surfaced as state without escaping the scheduled writer', async () => {
  const states = [];
  const store = { async load() { return null; }, async save() { throw new Error('quota'); } };
  const autosave = new SceneAutosave({ store, debounceMs: 5, onState: state => states.push(state) });
  autosave.schedule(() => snapshot());
  await delay(15);
  assert.ok(states.includes('saving'));
  assert.ok(states.includes('error'));
  autosave.dispose();
});

function fakeIndexedDB() {
  const records = new Map();
  const database = {
    objectStoreNames: { contains: () => false },
    createObjectStore() {},
    close() {},
    transaction(_name, _mode) {
      const transaction = {};
      const objectStore = {
        get(key) {
          const request = {};
          queueMicrotask(() => {
            request.result = records.get(key);
            request.onsuccess?.();
            transaction.oncomplete?.();
          });
          return request;
        },
        put(value, key) {
          records.set(key, value);
          queueMicrotask(() => transaction.oncomplete?.());
        }
      };
      transaction.objectStore = () => objectStore;
      return transaction;
    }
  };
  return {
    records,
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}

test('IndexedDB scene store persists one recoverable document record across store instances', async () => {
  const { IndexedDBSceneStore } = await import('../src/core/SceneAutosave.js');
  const indexedDB = fakeIndexedDB();
  const firstStore = new IndexedDBSceneStore(indexedDB);
  await firstStore.save(snapshot(12));
  const secondStore = new IndexedDBSceneStore(indexedDB);
  const record = await secondStore.load();
  assert.equal(record.snapshot.objects[0].positions[0][0], 12);
  assert.ok(record.savedAt > 0);
});
