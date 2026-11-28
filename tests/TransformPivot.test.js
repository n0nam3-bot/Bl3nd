import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSelectedTransformVertices, resolveObjectTransformPivot, resolveTransformPivotPoint } from '../src/core/TransformPivot.js';

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


test('connected selected faces share one pivot region across welded seams', () => {
  const positions = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[2,0,0],[2,1,0]];
  const faces = [[0,1,2,3],[1,4,5,2]];
  const groups = groupSelectedTransformVertices({ positions, faceIds: [0,1], faces });
  assert.deepEqual(groups, [[0,1,2,3,4,5]]);
  assert.deepEqual(resolveTransformPivotPoint(groups[0].map(id => positions[id])), [1,0.5,0]);
});

test('selected faces that touch at only one welded vertex share a region pivot', () => {
  const positions = [[0,0,0],[1,0,0],[0,1,0],[2,1,0],[2,2,0]];
  const faces = [[0,1,2],[2,3,4]];
  const groups = groupSelectedTransformVertices({ positions, faceIds:[0,1], faces });
  assert.deepEqual(groups, [[0,1,2,3,4]]);
});

test('disconnected selected faces keep independent region groups and median pivots', () => {
  const positions = [[0,0,0],[2,0,0],[2,2,0],[0,2,0],[10,0,0],[12,0,0],[12,2,0],[10,2,0]];
  const faces = [[0,1,2,3],[4,5,6,7]];
  const groups = groupSelectedTransformVertices({ positions, faceIds: [0,1], faces });
  assert.deepEqual(groups, [[0,1,2,3],[4,5,6,7]]);
  assert.deepEqual(groups.map(group => resolveTransformPivotPoint(group.map(id => positions[id]))), [[1,1,0],[11,1,0]]);
});

test('selected edge components join at shared vertices but separate paths stay independent', () => {
  const positions = Array.from({length: 6}, (_, id) => [id, 0, 0]);
  const edges = [{vertices:[0,1]},{vertices:[1,2]},{vertices:[3,4]},{vertices:[4,5]}];
  const groups = groupSelectedTransformVertices({ positions, edgeIds:[0,1,2,3], edges });
  assert.deepEqual(groups, [[0,1,2],[3,4,5]]);
});

test('vertex-only selections connect through real mesh edges, not unselected geometry paths', () => {
  const positions = Array.from({length: 5}, (_, id) => [id, 0, 0]);
  const edges = [{vertices:[0,1]},{vertices:[1,2]},{vertices:[2,3]}];
  const groups = groupSelectedTransformVertices({ positions, vertexIds:[0,2,3,4], edges });
  assert.deepEqual(groups, [[0],[2,3],[4]]);
});

test('a selected edge chain joins face, edge and vertex selections without duplication', () => {
  const positions = Array.from({length: 7}, (_, id) => [id, 0, 0]);
  const faces = [[0,1,2,3],[4,5,6]];
  const edges = [{vertices:[2,4]},{vertices:[4,5]},{vertices:[5,6]}];
  const groups = groupSelectedTransformVertices({ positions, faceIds:[0], edgeIds:[0,1,2], faces, edges, vertexIds:[6] });
  assert.deepEqual(groups, [[0,1,2,3,4,5,6]]);
  assert.equal(groups.flat().length, new Set(groups.flat()).size);
});

test('unselected bridge edges do not merge independent selected face regions', () => {
  const positions = Array.from({length: 8}, (_, id) => [id, 0, 0]);
  const faces = [[0,1,2,3],[4,5,6,7]];
  const edges = [{vertices:[1,4]}];
  const groups = groupSelectedTransformVertices({ positions, faceIds:[0,1], faces, edges });
  assert.deepEqual(groups, [[0,1,2,3],[4,5,6,7]]);
});

test('invalid selected topology IDs and malformed positions are ignored safely', () => {
  const positions = [[0,0,0],[1,0,0],[NaN,0,0]];
  const faces = [[0,1,2],[90,91,92]];
  const edges = [{vertices:[0,2]},{vertices:[90,91]}];
  const groups = groupSelectedTransformVertices({ positions, faceIds:[0,1,100], edgeIds:[0,1], vertexIds:[2], faces, edges });
  assert.deepEqual(groups, [[0,1]]);
  assert.deepEqual(groupSelectedTransformVertices({ positions:[], vertexIds:[0] }), []);
});


test('Object Mode Median pivot averages the selected object origins', () => {
  assert.deepEqual(resolveObjectTransformPivot({
    origins: [[0,0,0],[10,4,2],[2,2,8]]
  }, 'median'), [4,2,10/3]);
});

test('Object Mode Bounding Box pivot uses the combined world-space bounds', () => {
  const corners = [
    [-2,-1,-1],[2,-1,-1],[-2,1,-1],[2,1,-1],[-2,-1,1],[2,-1,1],[-2,1,1],[2,1,1],
    [8,-3,-2],[12,-3,-2],[8,3,-2],[12,3,-2],[8,-3,2],[12,-3,2],[8,3,2],[12,3,2]
  ];
  assert.deepEqual(resolveObjectTransformPivot({ origins:[[0,0,0],[10,0,0]], bounds:corners }, 'bounds'), [5,0,0]);
});

test('Object Mode Cursor pivot remains fixed and Individual Origins anchor to active origin', () => {
  const input = { origins:[[0,0,0],[10,0,0]], cursor:[3,4,5], activeOrigin:[10,0,0] };
  assert.deepEqual(resolveObjectTransformPivot(input, 'cursor'), [3,4,5]);
  assert.deepEqual(resolveObjectTransformPivot(input, 'individual'), [10,0,0]);
});

test('Object Mode pivot resolution safely falls back when one source is invalid', () => {
  assert.deepEqual(resolveObjectTransformPivot({ origins:[[2,4,6]], bounds:[], cursor:[NaN,0,0] }, 'bounds'), [2,4,6]);
  assert.equal(resolveObjectTransformPivot({ origins:[], cursor:[NaN,0,0] }, 'cursor'), null);
});
