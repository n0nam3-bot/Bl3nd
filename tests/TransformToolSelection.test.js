import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSFORM_TOOL_STORAGE_KEY,
  getTransformToolFromDataset,
  loadTransformToolSelection,
  normalizeTransformToolSelection,
  saveTransformToolSelection
} from '../src/core/TransformToolSelection.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    values
  };
}

test('Select is the default when no transform-tool preference exists', () => {
  assert.equal(loadTransformToolSelection(memoryStorage()), 'select');
});

test('only the four supported toolbar tools normalize as valid selections', () => {
  for (const tool of ['select', 'move', 'rotate', 'scale']) {
    assert.equal(normalizeTransformToolSelection(tool), tool);
  }
  for (const value of ['Move', 'translate', '', null, undefined, 4]) {
    assert.equal(normalizeTransformToolSelection(value), 'select');
  }
  for (const tool of ['select', 'move', 'rotate', 'scale']) {
    assert.equal(getTransformToolFromDataset({ transformTool: tool }), tool);
  }
  assert.equal(getTransformToolFromDataset({ tool: 'move' }), null);
  assert.equal(getTransformToolFromDataset(null), null);
});

test('transform-tool preference round-trips through browser storage', () => {
  const storage = memoryStorage();
  for (const tool of ['move', 'rotate', 'scale', 'select']) {
    assert.equal(saveTransformToolSelection(tool, storage), tool);
    assert.equal(loadTransformToolSelection(storage), tool);
    assert.equal(storage.values.get(TRANSFORM_TOOL_STORAGE_KEY), tool);
  }
});

test('invalid stored preferences safely fall back to Select', () => {
  const storage = memoryStorage({ [TRANSFORM_TOOL_STORAGE_KEY]: 'shear' });
  assert.equal(loadTransformToolSelection(storage), 'select');
});

test('storage read failures do not prevent workspace startup', () => {
  const storage = { getItem() { throw new Error('blocked'); } };
  assert.equal(loadTransformToolSelection(storage), 'select');
});

test('storage write failures preserve the current-page tool choice', () => {
  const storage = { setItem() { throw new Error('blocked'); } };
  assert.equal(saveTransformToolSelection('rotate', storage), 'rotate');
});

test('missing storage is a safe no-op', () => {
  assert.equal(saveTransformToolSelection('scale', null), 'scale');
});
