import test from 'node:test';
import assert from 'node:assert/strict';

const messages = [];
globalThis.self = {
  postMessage(message) { messages.push(message); },
  onmessage: null
};
await import('../src/workers/modifier.worker.js');

let nextId = 1;
function runWorkerStage(data) {
  return new Promise((resolve, reject) => {
    const originalPost = globalThis.self.postMessage;
    const timeout = setTimeout(() => {
      globalThis.self.postMessage = originalPost;
      reject(new Error('Worker stage did not respond.'));
    }, 2000);
    globalThis.self.postMessage = message => {
      originalPost(message);
      if (message.id !== data.id) return;
      clearTimeout(timeout);
      globalThis.self.postMessage = originalPost;
      resolve(message);
    };
    globalThis.self.onmessage({ data });
  });
}

async function runWorker(data) {
  const id = data.id ?? nextId++;
  let result = {
    positions: data.positions,
    indices: data.indices,
    faces: data.faces ?? null
  };
  for (let stageIndex = 0; stageIndex < (data.modifiers || []).length; stageIndex++) {
    const message = await runWorkerStage({
      type: 'evaluate-stage', id, stageIndex,
      ...result,
      modifier: data.modifiers[stageIndex]
    });
    if (message.type === 'stage-error') return { id, error: message.error };
    assert.equal(message.type, 'stage-result');
    result = { positions: message.positions, indices: message.indices, faces: message.faces };
  }
  return { id, ...result };
}

const quad = {
  positions: new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0]),
  indices: new Uint32Array([0,1,2,0,2,3]),
  faces: [[0,1,2,3]]
};

test('worker evaluates Catmull-Clark from polygon cage data', async () => {
  const result = await runWorker({ id: 7, ...quad, modifiers: [{ type: 'subdivision', level: 1, enabled: true }] });
  assert.equal(result.id, 7);
  assert.equal(result.error, undefined);
  assert.equal(result.positions.length / 3, 9);
  assert.equal(result.indices.length, 24);
});

test('worker applies the requested bounded Catmull-Clark levels', async () => {
  const result = await runWorker({ id: 8, ...quad, modifiers: [{ type: 'subdivision', level: 2, enabled: true }] });
  assert.equal(result.error, undefined);
  assert.equal(result.positions.length / 3, 25);
  assert.equal(result.indices.length, 96);
});

test('worker falls back to triangle cages after earlier mesh-generating modifiers', async () => {
  const result = await runWorker({
    id: 9, ...quad,
    modifiers: [
      { type: 'array', count: 2, offset: [2,0,0], enabled: true },
      { type: 'subdivision', level: 1, enabled: true }
    ]
  });
  assert.equal(result.error, undefined);
  assert.equal(result.positions.length / 3, 22);
  assert.equal(result.indices.length, 72);
});

test('worker surfaces topology errors without returning a partial geometry', async () => {
  const positions = new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,-1,0, 0,0,1]);
  const result = await runWorker({
    id: 10, positions,
    indices: new Uint32Array([0,1,2,1,0,3,0,1,4]),
    faces: [[0,1,2],[1,0,3],[0,1,4]],
    modifiers: [{ type: 'subdivision', level: 1, enabled: true }]
  });
  assert.equal(result.id, 10);
  assert.match(result.error, /non-manifold/);
  assert.equal(result.positions, undefined);
  assert.equal(result.indices, undefined);
});

test('worker mirrors and welds a half-surface at the configured center plane', async () => {
  const result = await runWorker({
    id: 11,
    positions: new Float32Array([0,0,0, 0,1,0, 1,0,0]),
    indices: new Uint32Array([0,1,2]),
    faces: [[0,1,2]],
    modifiers: [{ type: 'mirror', axis: 'x', mergeDistance: 0.001, enabled: true }]
  });
  assert.equal(result.id, 11);
  assert.equal(result.error, undefined);
  assert.equal(result.positions.length / 3, 4);
  assert.deepEqual([...result.indices], [0,1,2,0,3,1]);
});

test('worker Mirror uses normalized Y axis and preserves the source triangle', async () => {
  const positions = new Float32Array([0,0,0, 0,0.5,0, 0,0.5,1]);
  const result = await runWorker({
    id: 12, positions,
    indices: new Uint32Array([0,1,2]),
    modifiers: [{ type: 'mirror', axis: 'y', mergeDistance: 0.0001, enabled: true }]
  });
  assert.equal(result.error, undefined);
  assert.equal(result.positions.length / 3, 5);
  assert.equal(result.positions[3 * 3 + 1], -0.5);
  assert.equal(result.positions[4 * 3 + 1], -0.5);
  assert.equal(positions[4], 0.5);
});

test('worker skips duplicate geometry from faces already on the Mirror center plane', async () => {
  const result = await runWorker({
    id: 13,
    positions: new Float32Array([0,0,0, 0,1,0, 0,1,1]),
    indices: new Uint32Array([0,1,2]),
    modifiers: [{ type: 'mirror', axis: 'x', mergeDistance: 0.001, enabled: true }]
  });
  assert.equal(result.positions.length / 3, 3);
  assert.deepEqual([...result.indices], [0,1,2]);
});

test('worker can apply Catmull-Clark after a welded Mirror result', async () => {
  const result = await runWorker({
    id: 14,
    positions: new Float32Array([0,0,0, 0,1,0, 1,0,0]),
    indices: new Uint32Array([0,1,2]),
    faces: [[0,1,2]],
    modifiers: [
      { type: 'mirror', axis: 'x', mergeDistance: 0, enabled: true },
      { type: 'subdivision', level: 1, enabled: true }
    ]
  });
  assert.equal(result.error, undefined);
  assert.ok(result.positions.length / 3 > 4);
  assert.equal(result.indices.length % 3, 0);
});

test('worker Solidify closes an open quad surface with shared rim vertices', async () => {
  const result = await runWorker({
    id: 15, ...quad,
    modifiers: [{ type: 'solidify', thickness: 0.2, offset: -1, enabled: true }]
  });
  assert.equal(result.error, undefined);
  assert.equal(result.positions.length / 3, 8);
  assert.equal(result.indices.length / 3, 12);
});

test('worker Solidify honors Center and Outside offset modes', async () => {
  const centered = await runWorker({ id: 16, ...quad, modifiers: [{ type: 'solidify', thickness: 0.2, offset: 0, enabled: true }] });
  const outside = await runWorker({ id: 17, ...quad, modifiers: [{ type: 'solidify', thickness: 0.2, offset: 1, enabled: true }] });
  assert.ok(Math.abs(centered.positions[2] - 0.1) < 1e-6);
  assert.ok(Math.abs(centered.positions[14] + 0.1) < 1e-6);
  assert.equal(outside.positions[14], 0);
  assert.ok(Math.abs(outside.positions[2] - 0.2) < 1e-6);
});

test('worker Solidify reports unsafe topology without returning a partial shell', async () => {
  const positions = new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,-1,0, 0,0,1]);
  const result = await runWorker({
    id: 18, positions,
    indices: new Uint32Array([0,1,2, 1,0,3, 0,1,4]),
    modifiers: [{ type: 'solidify', thickness: 0.08, enabled: true }]
  });
  assert.match(result.error, /non-manifold/);
  assert.equal(result.positions, undefined);
  assert.equal(result.indices, undefined);
});

test('worker returns each modifier as an independent transferable stage', async () => {
  const message = await runWorkerStage({
    type: 'evaluate-stage', id: 19, stageIndex: 0,
    ...quad,
    modifier: { type: 'mirror', axis: 'x', mergeDistance: 0, enabled: true }
  });
  assert.equal(message.type, 'stage-result');
  assert.equal(message.stageIndex, 0);
  assert.ok(message.positions instanceof Float32Array);
  assert.ok(message.indices instanceof Uint32Array);
});

test('worker passes disabled modifier stages through without changing geometry', async () => {
  const result = await runWorker({ id: 20, ...quad, modifiers: [{ type: 'solidify', enabled: false }] });
  assert.deepEqual([...result.positions], [...quad.positions]);
  assert.deepEqual([...result.indices], [...quad.indices]);
});
