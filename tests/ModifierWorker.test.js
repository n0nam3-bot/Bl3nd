import test from 'node:test';
import assert from 'node:assert/strict';

const messages = [];
globalThis.self = {
  postMessage(message) { messages.push(message); },
  onmessage: null
};
await import('../src/workers/modifier.worker.js');

function runWorker(data) {
  const before = messages.length;
  globalThis.self.onmessage({ data });
  assert.equal(messages.length, before + 1, 'worker should post exactly one result');
  return messages.at(-1);
}

const quad = {
  positions: new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0]),
  indices: new Uint32Array([0,1,2,0,2,3]),
  faces: [[0,1,2,3]]
};

test('worker evaluates Catmull-Clark from polygon cage data', () => {
  const result = runWorker({ id: 7, ...quad, modifiers: [{ type: 'subdivision', level: 1, enabled: true }] });
  assert.equal(result.id, 7);
  assert.equal(result.error, undefined);
  assert.equal(result.positions.length / 3, 9);
  assert.equal(result.indices.length, 24); // Four quads become eight render triangles.
});

test('worker applies the requested bounded Catmull-Clark levels', () => {
  const result = runWorker({ id: 8, ...quad, modifiers: [{ type: 'subdivision', level: 2, enabled: true }] });
  assert.equal(result.error, undefined);
  assert.equal(result.positions.length / 3, 25);
  assert.equal(result.indices.length, 96); // Sixteen quads become thirty-two triangles.
});

test('worker falls back to triangle cages after earlier mesh-generating modifiers', () => {
  const result = runWorker({
    id: 9,
    ...quad,
    modifiers: [
      { type: 'array', count: 2, offset: [2,0,0], enabled: true },
      { type: 'subdivision', level: 1, enabled: true }
    ]
  });
  assert.equal(result.error, undefined);
  assert.equal(result.positions.length / 3, 22);
  assert.equal(result.indices.length, 72);
});

test('worker surfaces topology errors without returning a partial geometry', () => {
  const positions = new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,-1,0, 0,0,1]);
  const result = runWorker({
    id: 10,
    positions,
    indices: new Uint32Array([0,1,2,1,0,3,0,1,4]),
    faces: [[0,1,2],[1,0,3],[0,1,4]],
    modifiers: [{ type: 'subdivision', level: 1, enabled: true }]
  });
  assert.equal(result.id, 10);
  assert.match(result.error, /non-manifold/);
  assert.equal(result.positions, undefined);
  assert.equal(result.indices, undefined);
});
