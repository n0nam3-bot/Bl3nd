import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneExplorerRows, summarizeSceneExplorer } from '../src/core/SceneExplorerModel.js';

function mesh(name, faces) {
  return { name, userData: { hem: { faces, faceSelection: new Set() } } };
}

const cube = mesh('Cube', [[0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[0,3,7,4],[1,2,6,5]]);
const sphere = mesh('Sphere', Array.from({ length: 12 }, () => [0,1,2]));

test('scene explorer lists object rows in scene order and reports selection counts', () => {
  const rows = buildSceneExplorerRows({ objects: [cube, sphere], selectedObjects: new Set([sphere]), activeObject: sphere });
  assert.deepEqual(rows.map(row => row.kind), ['object', 'object']);
  assert.equal(rows[0].name, 'Cube');
  assert.equal(rows[1].selected, true);
  assert.deepEqual(summarizeSceneExplorer({ objects: [cube, sphere], selectedObjects: new Set([sphere]) }), { objectCount: 2, selectedCount: 1 });
});

test('expanded object exposes a face group and expanded face list', () => {
  const rows = buildSceneExplorerRows({
    objects: [cube], activeObject: cube, selectedObjects: new Set([cube]),
    expandedObjects: new Set([cube]), expandedFaces: new Set([cube])
  });
  assert.deepEqual(rows.map(row => row.kind), ['object', 'faces', 'face', 'face', 'face', 'face', 'face', 'face']);
  assert.equal(rows[1].count, 6);
  assert.equal(rows[2].name, 'Face 001');
  assert.equal(rows[2].vertexCount, 4);
});

test('search matches an object name without requiring expanded face groups', () => {
  const rows = buildSceneExplorerRows({ objects: [cube, sphere], query: 'sph' });
  assert.deepEqual(rows.map(row => row.name), ['Sphere']);
  assert.equal(rows[0].kind, 'object');
});

test('search can find a face by its displayed index under each matching object', () => {
  const rows = buildSceneExplorerRows({ objects: [cube, sphere], query: 'face 003' });
  assert.deepEqual(rows.map(row => row.kind), ['object', 'faces', 'face', 'object', 'faces', 'face']);
  assert.deepEqual(rows.filter(row => row.kind === 'face').map(row => row.faceId), [2, 2]);
  assert.equal(rows[2].name, 'Face 003');
});

test('selected face state is reflected only for the active object', () => {
  cube.userData.hem.faceSelection = new Set([1]);
  const rows = buildSceneExplorerRows({
    objects: [cube, sphere], activeObject: cube, selectedObjects: new Set([cube]),
    expandedObjects: new Set([cube, sphere]), expandedFaces: new Set([cube, sphere])
  });
  const selectedFace = rows.find(row => row.kind === 'face' && row.object === cube && row.faceId === 1);
  const otherFace = rows.find(row => row.kind === 'face' && row.object === sphere && row.faceId === 1);
  assert.equal(selectedFace.selected, true);
  assert.equal(otherFace.selected, false);
});

test('object-name search keeps all faces visible while face-index search narrows the list', () => {
  const allFaces = buildSceneExplorerRows({ objects: [cube], expandedObjects: new Set([cube]), expandedFaces: new Set([cube]), query: 'cube' });
  const oneFace = buildSceneExplorerRows({ objects: [cube], query: '2' });
  assert.equal(allFaces.filter(row => row.kind === 'face').length, 6);
  assert.equal(oneFace.at(-1).kind, 'face');
  assert.equal(oneFace.at(-1).faceId, 1);
});


test('numeric face search matches an exact face index instead of partial IDs', () => {
  const manyFaces = mesh('DenseMesh', Array.from({ length: 40 }, () => [0, 1, 2]));
  const rows = buildSceneExplorerRows({ objects: [manyFaces], query: '3' });
  assert.deepEqual(rows.filter(row => row.kind === 'face').map(row => row.faceId), [2]);
});
