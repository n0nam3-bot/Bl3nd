import test from 'node:test';
import assert from 'node:assert/strict';
import { ModifierStack } from '../src/modifiers/ModifierStack.js';

class FakeWorker {
  static instances = [];
  constructor() {
    this.messages = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(data) { this.onmessage?.({ data }); }
}

function makeMesh(modifiers) {
  const positions = new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0]);
  const indices = new Uint32Array([0,1,2, 0,2,3]);
  return {
    geometry: { name: 'source-geometry' },
    userData: {
      hem: {
        faces: [[0,1,2,3]],
        toBufferGeometry() { return { positions, indices }; }
      },
      modifiers,
      evaluatedGeometry: null
    }
  };
}

function stageResult(message, overrides = {}) {
  return {
    id: message.id,
    stageIndex: message.stageIndex,
    type: 'stage-result',
    positions: new Float32Array(message.positions),
    indices: new Uint32Array(message.indices),
    faces: message.faces,
    ...overrides
  };
}

function setup(options = {}) {
  FakeWorker.instances = [];
  const progress = [];
  const stack = new ModifierStack({
    workerFactory: () => new FakeWorker(),
    geometryFactory: result => ({ name: 'evaluated', positions: result.positions, indices: result.indices, dispose() { this.disposed = true; } }),
    onProgress: event => progress.push(event),
    ...options
  });
  return { stack, progress, workers: FakeWorker.instances };
}

test('ModifierStack splits a stack into ordered worker stages and reports progress', async () => {
  const { stack, progress, workers } = setup();
  const mesh = makeMesh([
    { id: 'mirror-a', type: 'mirror', enabled: true },
    { id: 'solidify-a', type: 'solidify', enabled: true }
  ]);
  const promise = stack.evaluate(mesh);
  assert.equal(stack.busy, true);
  assert.equal(workers.length, 1);
  const worker = workers[0];
  const first = worker.messages[0];
  assert.equal(first.type, 'evaluate-stage');
  assert.equal(first.stageIndex, 0);
  assert.equal(first.modifier.type, 'mirror');

  const mirroredPositions = new Float32Array([...first.positions, 2,0,0]);
  const mirroredIndices = new Uint32Array([0,1,2,0,2,3]);
  worker.emit(stageResult(first, { positions: mirroredPositions, indices: mirroredIndices, faces: null }));
  await new Promise(resolve => setTimeout(resolve, 0));

  const second = worker.messages[1];
  assert.equal(second.stageIndex, 1);
  assert.equal(second.modifier.type, 'solidify');
  assert.equal(second.positions.length, mirroredPositions.length);
  worker.emit(stageResult(second));
  const geometry = await promise;
  assert.equal(geometry.name, 'evaluated');
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.userData.evaluatedGeometry, geometry);
  assert.equal(stack.busy, false);
  assert.equal(progress.at(-1).state, 'complete');
  assert.equal(progress.at(-1).progress, 100);
});

test('ModifierStack cancellation terminates active worker and keeps previous geometry', async () => {
  const { stack, progress, workers } = setup();
  const mesh = makeMesh([{ id: 'sub', type: 'subdivision', level: 3, enabled: true }]);
  const original = mesh.geometry;
  const promise = stack.evaluate(mesh);
  assert.equal(stack.busy, true);
  assert.equal(stack.cancel('Cancelled by user.'), true);
  await assert.rejects(promise, error => error.name === 'AbortError' && /Cancelled by user/.test(error.message));
  assert.equal(workers[0].terminated, true);
  assert.equal(mesh.geometry, original);
  assert.equal(mesh.userData.evaluatedGeometry, null);
  assert.equal(stack.busy, false);
  assert.equal(progress.at(-1).state, 'cancelled');
});

test('ModifierStack can create a fresh worker after cancellation', async () => {
  const { stack, workers } = setup();
  const mesh = makeMesh([{ id: 'sub', type: 'subdivision', level: 1, enabled: true }]);
  const pending = stack.evaluate(mesh);
  stack.cancel();
  await assert.rejects(pending, { name: 'AbortError' });
  const next = stack.evaluate(mesh);
  assert.equal(workers.length, 2);
  assert.equal(workers[1].terminated, false);
  stack.cancel();
  await assert.rejects(next, { name: 'AbortError' });
});

test('ModifierStack preflight budget rejects a job before creating or posting to a worker', async () => {
  const { stack, workers } = setup({ budget: { tier: 'Mobile', maxWorkingBytes: 1, maxVertices: 1, maxTriangles: 1 } });
  const mesh = makeMesh([{ id: 'array', type: 'array', count: 20, enabled: true }]);
  await assert.rejects(stack.evaluate(mesh), /paused for Mobile safety/);
  assert.equal(workers.length, 0);
  assert.equal(stack.busy, false);
});

test('ModifierStack rejects a concurrent evaluation instead of racing geometry commits', async () => {
  const { stack } = setup();
  const mesh = makeMesh([{ id: 'sub', type: 'subdivision', level: 1, enabled: true }]);
  const first = stack.evaluate(mesh);
  await assert.rejects(stack.evaluate(mesh), /already running/);
  stack.cancel();
  await assert.rejects(first, { name: 'AbortError' });
});

test('ModifierStack disposal cancels work and releases its worker', async () => {
  const { stack, workers } = setup();
  const mesh = makeMesh([{ id: 'sub', type: 'subdivision', level: 1, enabled: true }]);
  const pending = stack.evaluate(mesh);
  stack.dispose();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(workers[0].terminated, true);
  assert.equal(stack.worker, null);
});

test('ModifierStack cancellation between stages discards partial buffers and keeps the prior mesh', async () => {
  const { stack, workers } = setup();
  const mesh = makeMesh([
    { id: 'mirror', type: 'mirror', enabled: true },
    { id: 'solidify', type: 'solidify', enabled: true }
  ]);
  const original = mesh.geometry;
  const pending = stack.evaluate(mesh);
  const worker = workers[0];
  const first = worker.messages[0];
  worker.emit(stageResult(first, { faces: null }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(worker.messages.length, 2);
  assert.equal(worker.messages[1].stageIndex, 1);
  stack.cancel('Cancelled between stages.');
  await assert.rejects(pending, /Cancelled between stages/);
  assert.equal(mesh.geometry, original);
  assert.equal(mesh.userData.evaluatedGeometry, null);
  assert.equal(worker.terminated, true);
});

test('ModifierStack stage failure does not replace the last valid evaluated result', async () => {
  const { stack, progress, workers } = setup();
  const mesh = makeMesh([{ id: 'solidify', type: 'solidify', enabled: true }]);
  const original = mesh.geometry;
  const pending = stack.evaluate(mesh);
  workers[0].emit({ id: workers[0].messages[0].id, stageIndex: 0, type: 'stage-error', error: 'Unsafe shell topology.' });
  await assert.rejects(pending, /Unsafe shell topology/);
  assert.equal(mesh.geometry, original);
  assert.equal(mesh.userData.evaluatedGeometry, null);
  assert.equal(progress.at(-1).state, 'failed');
});
