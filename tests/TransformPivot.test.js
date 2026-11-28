import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTransformPivotPoint } from '../src/core/TransformPivot.js';

test('Median Point is the arithmetic center of selected vertices', () => {
  assert.deepEqual(resolveTransformPivotPoint([[0, 0, 0], [2, 4, 6], [4, 2, 0]]), [2, 2, 2]);
});

test('Bounding Box Center uses spatial extents rather than the vertex average', () => {
  const points = [[0, 0, 0], [0, 2, 0], [10, 1, 4]];
  assert.deepEqual(resolveTransformPivotPoint(points, 'median'), [10 / 3, 1, 4 / 3]);
  assert.deepEqual(resolveTransformPivotPoint(points, 'bounds'), [5, 1, 2]);
});

test('Bounding Box Center handles flat and single-point selections', () => {
  assert.deepEqual(resolveTransformPivotPoint([[3, 2, -1], [7, 2, -1]], 'bounds'), [5, 2, -1]);
  assert.deepEqual(resolveTransformPivotPoint([[4, 5, 6]], 'bounds'), [4, 5, 6]);
});

test('Pivot resolution ignores invalid points and safely rejects empty selections', () => {
  assert.deepEqual(resolveTransformPivotPoint([[1, 2, 3], [NaN, 0, 0], null], 'bounds'), [1, 2, 3]);
  assert.equal(resolveTransformPivotPoint([], 'bounds'), null);
  assert.equal(resolveTransformPivotPoint([[NaN, 0, 0]]), null);
});
