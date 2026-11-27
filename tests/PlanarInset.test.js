import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';

const cubePositions = [
  [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
  [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
];
const cubeFaces = [
  [0,3,2,1],[4,5,6,7],[0,1,5,4],
  [1,2,6,5],[2,3,7,6],[3,0,4,7]
];

function selectedMesh(positions, faces, selectedIds) {
  const mesh = new HalfEdgeMesh(positions, faces);
  mesh.setSelectionMode('face');
  selectedIds.forEach((id, index) => mesh.selectFace(id, index > 0));
  return mesh;
}

function snapshot(mesh) {
  return JSON.stringify({ positions: mesh.positions, faces: mesh.faces, selection: [...mesh.faceSelection] });
}

test('single-face Inset uses constant edge offset and shared miter corners', () => {
  const mesh = selectedMesh(cubePositions, cubeFaces, [1]);
  const result = mesh.insetSelectedRegion(0.12);
  assert.equal(result.changed, true, result.reason);
  assert.ok(Math.abs(result.distance - 0.24) < 1e-10);
  assert.equal(result.boundaryEdges, 4);
  assert.deepEqual(mesh.positions.slice(8), [
    [-0.76,-0.76,1],[0.76,-0.76,1],[0.76,0.76,1],[-0.76,0.76,1]
  ]);
  assert.equal(mesh.validateTopology().valid, true);
  assert.equal(mesh.faceSelection.size, 1);
  assert.equal(mesh.faces.length, 10);
});

test('connected two-face Inset offsets one shared region boundary and preserves the interior seam', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0]],
    [[0,1,4,3],[1,2,5,4]],
    [0,1]
  );
  const result = mesh.insetSelectedRegion(0.1);
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.selectedFaces, 2);
  assert.equal(result.boundaryEdges, 6);
  assert.ok(Math.abs(result.distance - 0.1) < 1e-10);
  assert.equal(mesh.positions.length, 12);
  assert.equal(mesh.faces.length, 8);
  assert.equal(mesh.faceSelection.size, 2);
  const selected = new Set(mesh.faceSelection);
  const sharedInnerEdges = mesh.edges.filter(edge => edge.halfEdges.length === 2 &&
    edge.halfEdges.every(halfEdge => selected.has(halfEdge.face.id)));
  assert.equal(sharedInnerEdges.length, 1);
  assert.equal(mesh.validateTopology().valid, true);
});

test('concave L-shaped connected face region insets when the inner boundary remains simple', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0],[0,2,0],[1,2,0]],
    [[0,1,4,3],[1,2,5,4],[3,4,7,6]],
    [0,1,2]
  );
  const result = mesh.insetSelectedRegion(0.05);
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.selectedFaces, 3);
  assert.equal(result.boundaryEdges, 8);
  assert.equal(mesh.faceSelection.size, 3);
  assert.equal(mesh.validateTopology().valid, true);
});

test('rotated planar regions keep the same world-space offset along every boundary edge', () => {
  const cosine = Math.cos(Math.PI / 6), sine = Math.sin(Math.PI / 6);
  const positions = [];
  for (const [x, y] of [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]) positions.push([x, y * cosine, y * sine]);
  const faces = [[0,1,4,3],[1,2,5,4]];
  const mesh = selectedMesh(positions, faces, [0,1]);
  const boundary = mesh.boundaryForRegion([0,1]);
  const result = mesh.insetSelectedRegion(0.1);
  assert.equal(result.changed, true, result.reason);
  const pointLineDistance = (point, start, end) => {
    const edge = end.map((value, axis) => value - start[axis]);
    const delta = point.map((value, axis) => value - start[axis]);
    const cross = [
      edge[1] * delta[2] - edge[2] * delta[1],
      edge[2] * delta[0] - edge[0] * delta[2],
      edge[0] * delta[1] - edge[1] * delta[0]
    ];
    return Math.hypot(...cross) / Math.hypot(...edge);
  };
  const inner = mesh.positions.slice(positions.length);
  assert.equal(inner.length, boundary.length);
  for (let index = 0; index < boundary.length; index++) {
    const previous = positions[boundary[(index - 1 + boundary.length) % boundary.length]];
    const current = positions[boundary[index]];
    const next = positions[boundary[(index + 1) % boundary.length]];
    assert.ok(Math.abs(pointLineDistance(inner[index], previous, current) - 0.1) < 1e-8);
    assert.ok(Math.abs(pointLineDistance(inner[index], current, next) - 0.1) < 1e-8);
  }
  assert.equal(mesh.validateTopology().valid, true);
});

test('clockwise connected region preserves its face winding after Inset', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0]],
    [[3,4,1,0],[4,5,2,1]],
    [0,1]
  );
  const result = mesh.insetSelectedRegion(0.1);
  assert.equal(result.changed, true, result.reason);
  assert.equal(mesh.validateTopology().valid, true);
  assert.equal(mesh.faceSelection.size, 2);
});

test('disconnected selected faces reject without changing source positions, faces or selection', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[3,0,0],[4,0,0],[4,1,0],[3,1,0]],
    [[0,1,2,3],[4,5,6,7]],
    [0,1]
  );
  const before = snapshot(mesh);
  const result = mesh.insetSelectedRegion(0.12);
  assert.equal(result.changed, false);
  assert.match(result.reason, /connected planar face region/i);
  assert.equal(snapshot(mesh), before);
});

test('a selected region with a hole rejects without changing the source', () => {
  const positions = [];
  for (let y = 0; y <= 3; y++) for (let x = 0; x <= 3; x++) positions.push([x,y,0]);
  const faces = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    if (x === 1 && y === 1) continue;
    const a = y * 4 + x;
    faces.push([a,a+1,a+5,a+4]);
  }
  const mesh = selectedMesh(positions, faces, faces.map((_, index) => index));
  const before = snapshot(mesh);
  const result = mesh.insetSelectedRegion(0.05);
  assert.equal(result.changed, false);
  assert.match(result.reason, /one connected planar face region|simple face-region boundary/i);
  assert.equal(snapshot(mesh), before);
});

test('an offset that collapses a narrow region rejects non-destructively', () => {
  const mesh = selectedMesh(
    [[0,0,0],[2,0,0],[2,1,0],[0,1,0]],
    [[0,1,2,3]],
    [0]
  );
  const before = snapshot(mesh);
  const result = mesh.insetSelectedRegion(0.6);
  assert.equal(result.changed, false);
  assert.match(result.reason, /self-intersect|collapses|leaves the selected region/i);
  assert.equal(snapshot(mesh), before);
});

test('an acute corner that needs an excessive miter rejects without mutation', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[1,0.05,0]],
    [[0,1,2]],
    [0]
  );
  const before = snapshot(mesh);
  const result = mesh.insetSelectedRegion(0.12);
  assert.equal(result.changed, false);
  assert.match(result.reason, /excessive miter/i);
  assert.equal(snapshot(mesh), before);
});

test('non-planar selected face rejects without changing the source', () => {
  const mesh = selectedMesh(
    [[0,0,0],[2,0,0],[2,2,0.2],[0,2,0]],
    [[0,1,2,3]],
    [0]
  );
  const before = snapshot(mesh);
  const result = mesh.insetSelectedRegion(0.1);
  assert.equal(result.changed, false);
  assert.match(result.reason, /planar|projected/i);
  assert.equal(snapshot(mesh), before);
});

test('invalid inset amounts and empty selection reject without mutation', () => {
  const mesh = selectedMesh(cubePositions, cubeFaces, [1]);
  const before = snapshot(mesh);
  assert.equal(mesh.insetSelectedRegion(0).changed, false);
  assert.equal(snapshot(mesh), before);
  mesh.clearSelection();
  const empty = snapshot(mesh);
  assert.equal(mesh.insetSelectedRegion(0.1).changed, false);
  assert.equal(snapshot(mesh), empty);
});
