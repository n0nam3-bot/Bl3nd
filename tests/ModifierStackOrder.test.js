import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderModifier, reorderModifierAndEvaluate, summarizeModifierStack } from '../src/modifiers/ModifierStackOrder.js';

const stack = () => [
  { id: 'mirror-a', type: 'mirror', enabled: true },
  { id: 'subdivision-a', type: 'subdivision', enabled: false },
  { id: 'solidify-a', type: 'solidify', enabled: true }
];

test('modifier reorder moves one stage up without mutating the original stack', () => {
  const source = stack();
  const result = reorderModifier(source, 'solidify-a', 'up');
  assert.deepEqual(result.modifiers.map(item => item.id), ['mirror-a', 'solidify-a', 'subdivision-a']);
  assert.equal(result.fromIndex, 2);
  assert.equal(result.toIndex, 1);
  assert.deepEqual(source.map(item => item.id), ['mirror-a', 'subdivision-a', 'solidify-a']);
  assert.equal(result.modifiers[0], source[0]);
});

test('modifier reorder moves one stage down in the requested pipeline order', () => {
  const result = reorderModifier(stack(), 'mirror-a', 'down');
  assert.deepEqual(result.modifiers.map(item => item.type), ['subdivision', 'mirror', 'solidify']);
  assert.equal(result.fromIndex, 0);
  assert.equal(result.toIndex, 1);
});

test('modifier reorder rejects boundaries, missing IDs, duplicate IDs and invalid directions', () => {
  const source = stack();
  assert.equal(reorderModifier(source, 'mirror-a', 'up'), null);
  assert.equal(reorderModifier(source, 'solidify-a', 'down'), null);
  assert.equal(reorderModifier(source, 'missing', 'up'), null);
  assert.equal(reorderModifier(source, 'mirror-a', 'left'), null);
  assert.equal(reorderModifier([{ id: 'dup' }, { id: 'dup' }], 'dup', 'down'), null);
  assert.equal(reorderModifier(null, 'mirror-a', 'up'), null);
});

test('stack diagnostics report enabled, bypassed and ordered stages deterministically', () => {
  const summary = summarizeModifierStack(stack());
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.enabledCount, 2);
  assert.equal(summary.disabledCount, 1);
  assert.deepEqual(summary.order, [
    { id: 'mirror-a', type: 'mirror', position: 1, enabled: true },
    { id: 'subdivision-a', type: 'subdivision', position: 2, enabled: false },
    { id: 'solidify-a', type: 'solidify', position: 3, enabled: true }
  ]);
});

test('stack diagnostics safely describe an empty or malformed value', () => {
  assert.deepEqual(summarizeModifierStack(null), {
    totalCount: 0, enabledCount: 0, disabledCount: 0, order: []
  });
  const summary = summarizeModifierStack([{ id: 'unknown', enabled: true }]);
  assert.equal(summary.order[0].type, 'unknown');
  assert.equal(summary.order[0].position, 1);
});


test('modifier reorder commits the new order only after full evaluation succeeds', async () => {
  const modifiers = stack();
  const mesh = { userData: { modifiers } };
  let evaluatedMesh = null;
  const result = await reorderModifierAndEvaluate(mesh, 'solidify-a', 'up', async target => { evaluatedMesh = target; });
  assert.equal(evaluatedMesh, mesh);
  assert.deepEqual(mesh.userData.modifiers.map(item => item.id), ['mirror-a', 'solidify-a', 'subdivision-a']);
  assert.deepEqual(modifiers.map(item => item.id), ['mirror-a', 'subdivision-a', 'solidify-a']);
  assert.equal(result.fromIndex, 2);
  assert.equal(result.toIndex, 1);
});

test('modifier reorder restores the exact previous array when evaluation fails or is cancelled', async () => {
  for (const failure of [new Error('Preflight rejected.'), Object.assign(new Error('Cancelled.'), { name: 'AbortError' })]) {
    const modifiers = stack();
    const mesh = { userData: { modifiers } };
    await assert.rejects(
      reorderModifierAndEvaluate(mesh, 'solidify-a', 'up', async () => { throw failure; }),
      error => error === failure
    );
    assert.equal(mesh.userData.modifiers, modifiers);
    assert.deepEqual(mesh.userData.modifiers.map(item => item.id), ['mirror-a', 'subdivision-a', 'solidify-a']);
  }
});
