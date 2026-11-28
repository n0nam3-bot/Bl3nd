import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderModifier, reorderModifierAndEvaluate, summarizeModifierStack, getModifierGeometryCounts, describeModifierSettings, createModifierStageDiagnostic, copyModifierStageDiagnostics } from '../src/modifiers/ModifierStackOrder.js';

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


test('stage geometry counts use positions and triangle indices without retaining buffers', () => {
  const positions = new Float32Array(15);
  const indices = new Uint32Array(12);
  assert.deepEqual(getModifierGeometryCounts({ positions, indices }), { vertices: 5, triangles: 4 });
  assert.deepEqual(getModifierGeometryCounts(null), { vertices: 0, triangles: 0 });
});

test('modifier settings inspection describes supported parameters safely', () => {
  assert.equal(describeModifierSettings({ type: 'subdivision', level: 3 }), 'Level 3');
  assert.equal(describeModifierSettings({ type: 'mirror', axis: 'y', mergeDistance: 0.001 }), 'Axis Y · Merge 0.001');
  assert.equal(describeModifierSettings({ type: 'array', count: 3, offset: [1, 0.5, -2] }), '3 copies · Offset (1, 0.5, -2)');
  assert.equal(describeModifierSettings({ type: 'solidify', thickness: 0.25, offset: 0 }), 'Thickness 0.25 · Center');
  assert.match(describeModifierSettings({ type: 'array', offset: [NaN, Infinity, 1] }), /—/);
});

test('stage diagnostics report input/output deltas, settings and bypass state', () => {
  const completed = createModifierStageDiagnostic({
    modifier: { id: 'sub-a', type: 'subdivision', level: 2, enabled: true },
    stageIndex: 1,
    inputCounts: { vertices: 4, triangles: 2 },
    outputCounts: { vertices: 9, triangles: 8 },
    elapsedMs: 12.34
  });
  assert.deepEqual(completed, {
    modifierId: 'sub-a', modifierType: 'subdivision', stageIndex: 1, position: 2,
    enabled: true, state: 'complete',
    input: { vertices: 4, triangles: 2 }, output: { vertices: 9, triangles: 8 },
    delta: { vertices: 5, triangles: 6 }, elapsedMs: 12.3, settings: 'Level 2'
  });

  const bypassed = createModifierStageDiagnostic({
    modifier: { id: 'mirror-a', type: 'mirror', enabled: false, axis: 'x' },
    stageIndex: 0,
    inputCounts: { vertices: 4, triangles: 2 },
    outputCounts: { vertices: 4, triangles: 2 },
    elapsedMs: 0
  });
  assert.equal(bypassed.state, 'bypassed');
  assert.equal(bypassed.enabled, false);
  assert.deepEqual(bypassed.delta, { vertices: 0, triangles: 0 });
});

test('stage diagnostic snapshots deep-copy their count records', () => {
  const record = createModifierStageDiagnostic({
    modifier: { id: 'array-a', type: 'array' }, stageIndex: 0,
    inputCounts: { vertices: 2, triangles: 1 }, outputCounts: { vertices: 4, triangles: 2 }, elapsedMs: 1
  });
  const copy = copyModifierStageDiagnostics([record]);
  copy[0].output.vertices = 999;
  assert.equal(record.output.vertices, 4);
  assert.deepEqual(copyModifierStageDiagnostics(null), []);
});
