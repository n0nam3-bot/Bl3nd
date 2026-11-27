import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';

function selectedMesh(positions, faces, selectedIds) {
  const mesh = new HalfEdgeMesh(positions, faces);
  mesh.setSelectionMode('face');
  mesh.faceSelection = new Set(selectedIds);
  return mesh;
}

function makeLRegion() {
  const positions = [];
  for (let y = 0; y <= 2; y++) {
    for (let x = 0; x <= 2; x++) positions.push([x, y, 0]);
  }
  const id = (x, y) => y * 3 + x;
  const faces = [];
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) faces.push([id(x, y), id(x + 1, y), id(x + 1, y + 1), id(x, y + 1)]);
  }
  return selectedMesh(positions, faces, [0, 1, 2]);
}

function makeAnnulus() {
  const positions = [];
  for (let y = 0; y <= 3; y++) {
    for (let x = 0; x <= 3; x++) positions.push([x, y, 0]);
  }
  const faces = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (x === 1 && y === 1) continue;
      const a = y * 4 + x;
      faces.push([a, a + 1, a + 5, a + 4]);
    }
  }
  return selectedMesh(positions, faces, faces.map((_, index) => index));
}

test('shared analyzer extracts one ordered convex boundary for a connected two-face region', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0]],
    [[0,1,4,3],[1,2,5,4]],
    [0,1]
  );
  const result = mesh.analyzeFaceRegion([0, 1]);
  assert.equal(result.valid, true);
  assert.equal(result.connected, true);
  assert.equal(result.planar, true);
  assert.equal(result.loopCount, 1);
  assert.equal(result.boundaryEdges, 6);
  assert.equal(result.singleSimpleBoundary, true);
  assert.equal(result.supportsPlanarSingleBoundary, true);
  assert.equal(result.boundaryLoops[0].isSimple, true);
  assert.equal(result.boundaryLoops[0].hasConcaveCorners, false);
  assert.deepEqual(mesh.boundaryForRegion([0, 1]), result.boundaryLoops[0].vertexIds);
});

test('concave L-shaped boundary reports its reflex corner without rejecting the region', () => {
  const mesh = makeLRegion();
  const result = mesh.analyzeFaceRegion([0, 1, 2]);
  assert.equal(result.valid, true);
  assert.equal(result.connected, true);
  assert.equal(result.planar, true);
  assert.equal(result.loopCount, 1);
  assert.equal(result.hasConcaveCorners, true);
  assert.deepEqual(result.boundaryLoops[0].concaveVertexIds, [4]);
  assert.equal(result.supportsPlanarSingleBoundary, true);
});

test('annular region preserves both ordered loops and explicitly identifies the hole', () => {
  const mesh = makeAnnulus();
  const result = mesh.analyzeFaceRegion([...mesh.faceSelection]);
  assert.equal(result.valid, true);
  assert.equal(result.connected, true);
  assert.equal(result.planar, true);
  assert.equal(result.loopCount, 2);
  assert.equal(result.hasHoles, true);
  assert.equal(result.boundaryLoops.filter(loop => loop.role === 'outer').length, 1);
  assert.equal(result.boundaryLoops.filter(loop => loop.role === 'hole').length, 1);
  assert.equal(result.singleSimpleBoundary, false);
  assert.equal(mesh.boundaryForRegion([...mesh.faceSelection]), null);
});

test('disconnected islands remain separate components and separate outer loops', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[3,0,0],[4,0,0],[4,1,0],[3,1,0]],
    [[0,1,2,3],[4,5,6,7]],
    [0,1]
  );
  const result = mesh.analyzeFaceRegion([0, 1]);
  assert.equal(result.valid, true);
  assert.equal(result.connected, false);
  assert.equal(result.components.length, 2);
  assert.equal(result.loopCount, 2);
  assert.equal(result.boundaryLoops.every(loop => loop.role === 'outer'), true);
  assert.equal(result.supportsPlanarSingleBoundary, false);
});

test('nested but disconnected face islands are not misclassified as holes', () => {
  const mesh = selectedMesh(
    [[0,0,0],[4,0,0],[4,4,0],[0,4,0],[1,1,0],[2,1,0],[2,2,0],[1,2,0]],
    [[0,1,2,3],[4,5,6,7]],
    [0,1]
  );
  const result = mesh.analyzeFaceRegion([0, 1]);
  assert.equal(result.valid, true);
  assert.equal(result.connected, false);
  assert.equal(result.components.length, 2);
  assert.equal(result.loopCount, 2);
  assert.equal(result.hasHoles, false);
  assert.deepEqual(result.boundaryLoops.map(loop => loop.role), ['outer', 'outer']);
});

test('non-planar connected regions retain topology loops but are flagged unsupported geometrically', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0.2],[2,1,0]],
    [[0,1,4,3],[1,2,5,4]],
    [0,1]
  );
  const result = mesh.analyzeFaceRegion([0, 1]);
  assert.equal(result.valid, true);
  assert.equal(result.connected, true);
  assert.equal(result.loopCount, 1);
  assert.equal(result.planar, false);
  assert.equal(result.supportsPlanarSingleBoundary, false);
  assert.ok(result.geometryIssues.includes('non-planar-or-degenerate-region'));
  assert.equal(result.boundaryLoops[0].role, 'unclassified');
});

test('inconsistent selected-face winding rejects instead of guessing a boundary orientation', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0]],
    [[0,1,4,3],[1,4,5,2]],
    [0,1]
  );
  const before = JSON.stringify({ positions: mesh.positions, faces: mesh.faces });
  const result = mesh.analyzeFaceRegion([0, 1]);
  assert.equal(result.valid, false);
  assert.match(result.reason, /inconsistent winding/i);
  assert.equal(JSON.stringify({ positions: mesh.positions, faces: mesh.faces }), before);
});

test('more than two selected-face uses of an edge reject as non-manifold', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[0,1,0],[0,-1,0],[0,0,1]],
    [[0,1,2],[1,0,3],[0,1,4]],
    [0,1,2]
  );
  const result = mesh.analyzeFaceRegion([0, 1, 2]);
  assert.equal(result.valid, false);
  assert.match(result.reason, /non-manifold edge/i);
});

test('clockwise selected regions preserve loop direction and still classify planar boundaries', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0]],
    [[3,4,1,0],[4,5,2,1]],
    [0,1]
  );
  const result = mesh.analyzeFaceRegion([0, 1]);
  assert.equal(result.valid, true);
  assert.equal(result.planar, true);
  assert.equal(result.loopCount, 1);
  assert.ok(result.normal[2] < 0);
  assert.ok(result.boundaryLoops[0].signedArea > 0);
  assert.equal(result.boundaryLoops[0].hasConcaveCorners, false);
});

test('duplicate and invalid face IDs reject without topology mutation', () => {
  const mesh = makeLRegion();
  const before = JSON.stringify({ positions: mesh.positions, faces: mesh.faces });
  assert.equal(mesh.analyzeFaceRegion([0, 0]).valid, false);
  assert.equal(mesh.analyzeFaceRegion([0, 99]).valid, false);
  assert.equal(JSON.stringify({ positions: mesh.positions, faces: mesh.faces }), before);
});
