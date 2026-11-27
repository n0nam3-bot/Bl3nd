import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSelectionViewDirection } from '../src/core/SelectionView.js';

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const normalize = value => {
  const length = Math.hypot(...value);
  return value.map(component => component / length);
};

test('a planar multi-face selection aligns the view with its shared normal', () => {
  const direction = chooseSelectionViewDirection([
    { normal: [0, 0, 1], weight: 1 },
    { normal: [0, 0, 1], weight: 2 },
    { normal: [0, 0, 1], weight: 3 }
  ], [1, 0, 0]);
  assert.ok(dot(direction, [0, 0, 1]) > 1 - 1e-10);
});

test('two differently oriented selected faces are both represented by the view direction', () => {
  const expected = normalize([1, 1, 0]);
  const direction = chooseSelectionViewDirection([
    { normal: [1, 0, 0], weight: 1 },
    { normal: [0, 1, 0], weight: 1 }
  ], [0, 0, 1]);
  assert.ok(dot(direction, expected) > 1 - 1e-8);
  assert.ok(dot(direction, [1, 0, 0]) > 0.7);
  assert.ok(dot(direction, [0, 1, 0]) > 0.7);
});

test('a selection spanning all six cube faces chooses a corner view that exposes three faces', () => {
  const normals = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1]
  ];
  const direction = chooseSelectionViewDirection(normals.map(normal => ({ normal, weight: 1 })), [0, -1, 0]);
  const absolute = direction.map(Math.abs).sort((a, b) => a - b);
  assert.ok(absolute.every(value => Math.abs(value - 1 / Math.sqrt(3)) < 1e-7));
  const projectedArea = normals.reduce((sum, normal) => sum + Math.max(0, dot(normal, direction)), 0);
  assert.ok(projectedArea > 1.7, `Expected three visible face directions, got ${projectedArea}`);
});

test('face area weights make the larger selected surface dominate orientation', () => {
  const direction = chooseSelectionViewDirection([
    { normal: [1, 0, 0], weight: 10 },
    { normal: [0, 1, 0], weight: 1 }
  ], [0, 1, 0]);
  assert.ok(dot(direction, [1, 0, 0]) > 0.99);
});

test('empty, invalid and zero-area samples preserve the current view direction', () => {
  const direction = chooseSelectionViewDirection([
    { normal: [0, 0, 0], weight: 10 },
    { normal: [NaN, 0, 1], weight: 1 },
    { normal: [0, 0, 1], weight: 0 }
  ], [0, -2, 0]);
  assert.deepEqual(direction, [0, -1, 0]);
});
