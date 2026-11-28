import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';
import { buildProportionalInfluence } from '../src/core/ProportionalEditing.js';
import { BevelModal } from '../src/operators/BevelModal.js';
import { FaceOperationModal } from '../src/operators/FaceOperationModal.js';

function makeProportionallyDeformedGrid() {
  const width = 3, height = 3;
  const positions = [];
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) positions.push([x, y, 0]);
  }
  const vertexId = (x, y) => y * (width + 1) + x;
  const faces = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      faces.push([vertexId(x, y), vertexId(x + 1, y), vertexId(x + 1, y + 1), vertexId(x, y + 1)]);
    }
  }
  const source = new HalfEdgeMesh(positions, faces);
  const selectedVertices = [vertexId(1, 1), vertexId(2, 1), vertexId(2, 2), vertexId(1, 2)];
  const influence = buildProportionalInfluence({
    positions,
    edges: source.edges,
    seedGroups: [selectedVertices],
    radius: 3,
    falloff: 'smooth'
  });
  // Reproduce a Face Select proportional Move: selected vertices receive full
  // displacement; surrounding grid vertices receive the geodesic falloff.
  for (const { vertexId: id, weight } of influence.groups[0]) positions[id][2] += weight;
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('face');
  hem.faceSelection = new Set([4]); // The transformed center face remains planar.
  return hem;
}

function makeSession(hem) {
  const mesh = { userData: { hem } };
  const document = {
    mode: 'edit',
    selectionMode: 'face',
    activeObject: mesh,
    updateMesh() {},
    async serialize() {
      const current = mesh.userData.hem;
      return {
        positions: current.positions.map(point => [...point]),
        faces: current.faces.map(face => [...face]),
        selectionMode: current.selectionMode,
        faceSelection: [...current.faceSelection]
      };
    },
    async restore(snapshot) {
      const restored = new HalfEdgeMesh(snapshot.positions, snapshot.faces);
      restored.setSelectionMode(snapshot.selectionMode);
      restored.faceSelection = new Set(snapshot.faceSelection);
      mesh.userData.hem = restored;
      this.selectionMode = snapshot.selectionMode;
    }
  };
  const commits = [];
  const undoManager = { async record(label, before, after) { commits.push({ label, before, after }); } };
  return { mesh, document, undoManager, commits };
}

test('strict validation keeps proportional warp warnings while operation-safe validation accepts only renderable warped quads', () => {
  const hem = makeProportionallyDeformedGrid();
  const strict = hem.validateTopology();
  assert.equal(strict.valid, false);
  assert.ok(strict.counts.nonPlanarFaces > 0);
  assert.equal(hem.validateTopology({ allowSafeWarpedQuads: true }).valid, true);
  assert.ok(hem.faces.every((_, faceId) => hem.triangulateFace(faceId).length === 2));

  const bowTie = new HalfEdgeMesh(
    [[0,0,0],[1,1,0],[0,1,0],[1,0,0]],
    [[0,1,2,3]]
  );
  assert.equal(bowTie.validateTopology({ allowSafeWarpedQuads: true }).valid, false);
  assert.equal(bowTie.triangulateFace(0).length, 0);
});

test('Face Operation modal can Extrude a planar selected face after proportional editing warped neighboring quads', async () => {
  const session = makeSession(makeProportionallyDeformedGrid());
  const modal = new FaceOperationModal({
    document: session.document,
    undoManager: session.undoManager,
    viewport: {},
    status() {},
    onChange() {}
  });

  assert.equal(await modal.begin('extrude'), true, modal.lastError);
  const result = await modal.confirm();
  assert.equal(result.changed, true);
  assert.equal(result.operation, 'extrude');
  assert.equal(modal.active, false);
  assert.equal(session.commits.length, 1);
  assert.ok(session.mesh.userData.hem.validateTopology().counts.nonPlanarFaces > 0);
  assert.equal(session.mesh.userData.hem.validateTopology({ allowSafeWarpedQuads: true }).valid, true);
});

test('Face Operation modal can Inset a planar selected face after proportional editing warped neighboring quads', async () => {
  const session = makeSession(makeProportionallyDeformedGrid());
  const modal = new FaceOperationModal({
    document: session.document,
    undoManager: session.undoManager,
    viewport: {},
    status() {},
    onChange() {}
  });

  assert.equal(await modal.begin('inset'), true, modal.lastError);
  const result = await modal.confirm();
  assert.equal(result.changed, true);
  assert.equal(result.operation, 'inset');
  assert.equal(modal.active, false);
  assert.equal(session.commits.length, 1);
  assert.equal(session.mesh.userData.hem.validateTopology({ allowSafeWarpedQuads: true }).valid, true);
});

test('Face Bevel modal can bevel a planar selected face after proportional editing warped neighboring quads', async () => {
  const session = makeSession(makeProportionallyDeformedGrid());
  const modal = new BevelModal({
    document: session.document,
    undoManager: session.undoManager,
    viewport: {},
    status() {},
    onChange() {}
  });

  assert.equal(await modal.begin(), true, modal.lastError);
  const result = await modal.confirm();
  assert.equal(result.changed, true);
  assert.equal(result.operation, 'face-region');
  assert.equal(modal.active, false);
  assert.equal(session.commits.length, 1);
  assert.equal(session.mesh.userData.hem.validateTopology({ allowSafeWarpedQuads: true }).valid, true);
});
