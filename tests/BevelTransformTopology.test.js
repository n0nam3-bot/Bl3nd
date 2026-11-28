import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';
import { BevelModal } from '../src/operators/BevelModal.js';

const cubePositions = [
  [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
  [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
];
const cubeFaces = [
  [0,3,2,1],[4,5,6,7],[0,1,5,4],
  [1,2,6,5],[2,3,7,6],[3,0,4,7]
];

function rotateSelectedCaps(mesh, angleDegrees = 45) {
  const selectedVertices = [...new Set(
    [...mesh.faceSelection].flatMap(faceId => mesh.faces[faceId] || [])
  )].sort((a, b) => a - b);
  assert.ok(selectedVertices.length >= 3, 'selected bevel caps should contain vertices');

  const center = [0, 1, 2].map(axis => selectedVertices.reduce(
    (sum, vertexId) => sum + mesh.positions[vertexId][axis], 0
  ) / selectedVertices.length);
  const angle = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  for (const vertexId of selectedVertices) {
    const [x, y, z] = mesh.positions[vertexId].map((value, axis) => value - center[axis]);
    mesh.positions[vertexId] = [
      center[0] + x * cosine - y * sine,
      center[1] + x * sine + y * cosine,
      center[2] + z
    ];
  }
  mesh.rebuild();
  return selectedVertices;
}


function rotateSelectedCapsIndividually(mesh, angleDegrees = 45) {
  const angle = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  for (const faceId of [...mesh.faceSelection].sort((a, b) => a - b)) {
    const vertices = [...new Set(mesh.faces[faceId] || [])];
    const center = [0, 1, 2].map(axis => vertices.reduce(
      (sum, vertexId) => sum + mesh.positions[vertexId][axis], 0
    ) / vertices.length);
    for (const vertexId of vertices) {
      const [x, y, z] = mesh.positions[vertexId].map((value, axis) => value - center[axis]);
      mesh.positions[vertexId] = [
        center[0] + x * cosine - y * sine,
        center[1] + x * sine + y * cosine,
        center[2] + z
      ];
    }
  }
  mesh.rebuild();
}

function assertClosedManifold(mesh) {
  const report = mesh.validateTopology();
  assert.equal(report.valid, true, JSON.stringify(report.counts));
  assert.equal(report.issueCount, 0);
  assert.equal(report.counts.nonPlanarFaces, 0);
  assert.equal(report.counts.selfIntersectingFaces, 0);
  assert.equal(report.counts.triangulationFailures, 0);
  assert.equal(report.counts.nonManifoldEdges, 0);
  assert.equal(report.counts.inconsistentWinding, 0);
  assert.equal(report.counts.boundaryEdges, 0);

  for (const edge of mesh.edges) {
    assert.equal(edge.halfEdges.length, 2, `edge ${edge.id} should have two incident faces`);
    const [a, b] = edge.halfEdges;
    assert.equal(a.twin, b);
    assert.equal(b.twin, a);
  }
  for (let faceId = 0; faceId < mesh.faces.length; faceId++) {
    const triangles = mesh.triangulateFace(faceId);
    assert.ok(triangles.length > 0, `face ${faceId} should remain renderable`);
    assert.ok(triangles.every(triangle => triangle.length === 3));
  }
}


function assertValidOpenSurface(mesh) {
  const report = mesh.validateTopology();
  assert.equal(report.valid, true, JSON.stringify(report.counts));
  assert.equal(report.issueCount, 0);
  assert.equal(report.counts.nonPlanarFaces, 0);
  assert.equal(report.counts.selfIntersectingFaces, 0);
  assert.equal(report.counts.triangulationFailures, 0);
  assert.equal(report.counts.nonManifoldEdges, 0);
  assert.equal(report.counts.inconsistentWinding, 0);
  for (const edge of mesh.edges) {
    assert.ok(edge.halfEdges.length === 1 || edge.halfEdges.length === 2);
    if (edge.halfEdges.length === 2) {
      const [a, b] = edge.halfEdges;
      assert.equal(a.twin, b);
      assert.equal(b.twin, a);
    }
  }
  for (let faceId = 0; faceId < mesh.faces.length; faceId++) {
    const triangles = mesh.triangulateFace(faceId);
    assert.ok(triangles.length > 0, `face ${faceId} should remain renderable`);
    assert.ok(triangles.every(triangle => triangle.length === 3));
  }
}

test('single-face bevel walls remain valid after rotating the raised cap', () => {
  const mesh = new HalfEdgeMesh(cubePositions, cubeFaces);
  mesh.setSelectionMode('face');
  mesh.faceSelection = new Set([1]);

  const bevel = mesh.bevelSelectedFaceRegion({ amount: 0.25 });
  assert.equal(bevel.changed, true, bevel.reason);
  assert.equal(bevel.createdFaces, bevel.boundaryEdges * bevel.segments * 2);
  assert.equal(mesh.faces.length, 14);

  const movedVertices = rotateSelectedCaps(mesh, 45);
  assert.equal(movedVertices.length, 4);
  assert.deepEqual([...mesh.faceSelection], [1]);
  assertClosedManifold(mesh);

  // A second rotate/apply-style edit must not be blocked by Safe Repair warnings.
  rotateSelectedCaps(mesh, 45);
  assertClosedManifold(mesh);
});

test('multi-face Individual Bevel walls remain valid after rotating the selected caps', () => {
  const mesh = new HalfEdgeMesh(cubePositions, cubeFaces);
  mesh.setSelectionMode('face');
  mesh.faceSelection = new Set([1, 3]);

  const bevel = mesh.bevelSelectedFacesIndividually({ amount: 0.25 });
  assert.equal(bevel.changed, true, bevel.reason);
  assert.equal(bevel.createdFaces, bevel.perFace.reduce(
    (sum, face) => sum + face.boundaryEdges * face.segments * 2, 0
  ));
  assert.deepEqual([...mesh.faceSelection], [1, 3]);

  const movedVertices = rotateSelectedCaps(mesh, 45);
  assert.ok(movedVertices.length >= 6);
  assertClosedManifold(mesh);
});

test('segmented Face Bevel stores two triangles per transition segment and survives rotation', () => {
  const mesh = new HalfEdgeMesh(cubePositions, cubeFaces);
  mesh.setSelectionMode('face');
  mesh.faceSelection = new Set([1]);

  const bevel = mesh.bevelSelectedFaceRegion({ amount: 0.2, segments: 3, profile: 0.75 });
  assert.equal(bevel.changed, true, bevel.reason);
  assert.equal(bevel.createdFaces, 4 * 3 * 2);
  assert.equal(mesh.faces.length, 6 + 1 + 4 * 3 * 2 - 1);

  rotateSelectedCaps(mesh, 45);
  assertClosedManifold(mesh);
});

test('multi-region Face Bevel islands remain valid after independently rotating both caps', () => {
  const mesh = new HalfEdgeMesh(cubePositions, cubeFaces);
  mesh.setSelectionMode('face');
  mesh.faceSelection = new Set([0, 1]);

  const modal = Object.create(BevelModal.prototype);
  modal.seedFaceIds = [0, 1];
  const bevel = modal.bevelSelectedFaceRegions(mesh, { amount: 0.25 });
  assert.equal(bevel.changed, true, bevel.reason);
  assert.equal(bevel.operation, 'face-multi-region');
  assert.equal(bevel.regionCount, 2);
  assert.equal(bevel.createdFaces, 16);
  assert.deepEqual([...mesh.faceSelection].sort((a, b) => a - b), [0, 1]);

  rotateSelectedCapsIndividually(mesh, 45);
  assertClosedManifold(mesh);
});

test('connected multi-face Region Bevel remains valid after rotating its shared raised cap', () => {
  const mesh = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0]],
    [[0,1,4,3],[1,2,5,4]]
  );
  mesh.setSelectionMode('face');
  mesh.faceSelection = new Set([0, 1]);

  const bevel = mesh.bevelSelectedFaceRegion({ amount: 0.25, segments: 2 });
  assert.equal(bevel.changed, true, bevel.reason);
  assert.equal(bevel.selectedFaces, 2);
  assert.equal(bevel.boundaryEdges, 6);
  assert.equal(bevel.createdFaces, 6 * 2 * 2);
  assert.equal(mesh.faceSelection.size, 2);

  rotateSelectedCaps(mesh, 45);
  assertValidOpenSurface(mesh);
});
