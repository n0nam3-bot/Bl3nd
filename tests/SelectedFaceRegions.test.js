import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';
import { analyzeSelectedFaceRegions } from '../src/core/SelectedFaceRegions.js';
import { FaceOperationModal } from '../src/operators/FaceOperationModal.js';
import { BevelModal } from '../src/operators/BevelModal.js';

function makeSeparateQuads() {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[1,1,0],[0,1,0], [3,0,0],[4,0,0],[4,1,0],[3,1,0]],
    [[0,1,2,3],[4,5,6,7]]
  );
  hem.setSelectionMode('face');
  hem.faceSelection = new Set([0, 1]);
  return hem;
}

function makeSession(hem = makeSeparateQuads()) {
  const mesh = { userData: { hem } };
  const commits = [];
  const document = {
    mode: 'edit', selectionMode: 'face', activeObject: mesh,
    updateMesh() {},
    async serialize() {
      return {
        positions: mesh.userData.hem.positions.map(point => [...point]),
        faces: mesh.userData.hem.faces.map(face => [...face]),
        faceSelection: [...mesh.userData.hem.faceSelection]
      };
    },
    async restore(snapshot) {
      const restored = new HalfEdgeMesh(snapshot.positions, snapshot.faces);
      restored.setSelectionMode('face');
      restored.faceSelection = new Set(snapshot.faceSelection);
      mesh.userData.hem = restored;
    }
  };
  const undoManager = { async record(label, before, after) { commits.push({ label, before, after }); } };
  const viewport = {
    lastPointer: null,
    camera: { position: { distanceTo: () => 8 } },
    controls: { target: { x: 0, y: 0, z: 0 } },
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 }) } }
  };
  return { hem, mesh, document, commits, undoManager, viewport };
}

test('selected-face partition identifies separate planar components', () => {
  const hem = makeSeparateQuads();
  const result = analyzeSelectedFaceRegions(hem, [0, 1]);
  assert.equal(result.valid, true);
  assert.equal(result.regions.length, 2);
  assert.deepEqual(result.regions.map(region => region.faceIds), [[0], [1]]);
  assert.equal(result.regions.every(region => region.analysis.planar && region.analysis.singleSimpleBoundary), true);
});

test('selected-face partition keeps a connected planar patch as one region', () => {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0]],
    [[0,1,4,3],[1,2,5,4]]
  );
  const result = analyzeSelectedFaceRegions(hem, [0, 1]);
  assert.equal(result.valid, true);
  assert.equal(result.regions.length, 1);
  assert.deepEqual(result.regions[0].faceIds, [0, 1]);
});

test('selected-face partition rejects disconnected islands that share a vertex', () => {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[-1,0,0],[-1,-1,0],[-1,1,0]],
    [[0,1,2,3],[0,4,5,6]]
  );
  const result = analyzeSelectedFaceRegions(hem, [0, 1]);
  assert.equal(result.valid, false);
  assert.match(result.reason, /shared vertex|branches|touches itself/i);
});

test('Extrude processes multiple disconnected planar islands in one transaction', async () => {
  const session = makeSession();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('extrude'), true, modal.lastError);
  assert.equal(modal.lastResult.regionCount, 2);
  assert.equal(modal.lastResult.selectedFaces, 2);
  assert.equal(modal.lastResult.boundaryEdges, 8);
  assert.equal(modal.lastResult.topology.valid, true);
  const applied = await modal.confirm();
  assert.equal(applied.regionCount, 2);
  assert.equal(session.commits.length, 1);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});

test('Inset processes multiple disconnected planar islands and reselects both inner faces', async () => {
  const session = makeSession();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('inset'), true, modal.lastError);
  assert.equal(modal.lastResult.regionCount, 2);
  assert.equal(modal.lastResult.selectedFaces, 2);
  assert.equal(modal.lastResult.boundaryEdges, 8);
  assert.equal(modal.lastResult.topology.valid, true);
  assert.equal(session.mesh.userData.hem.faceSelection.size, 2);
  const applied = await modal.confirm();
  assert.equal(applied.regionCount, 2);
  assert.equal(session.commits.length, 1);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});

test('Face Bevel uses one shared-region operation per disconnected planar island', async () => {
  const session = makeSession();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.faceBevelMode, 'multi-region');
  assert.equal(modal.lastResult.regionCount, 2);
  assert.equal(modal.lastResult.selectedFaces, 2);
  assert.equal(modal.lastResult.topology.valid, true);
  assert.equal(session.mesh.userData.hem.faceSelection.size, 2);
  const applied = await modal.confirm();
  assert.equal(applied.regionCount, 2);
  assert.equal(session.commits.length, 1);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});

test('Multi-Region Face Bevel handles opposing cube faces with independent normals', async () => {
  const hem = new HalfEdgeMesh(
    [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
  );
  hem.setSelectionMode('face');
  hem.faceSelection = new Set([0, 1]);
  const session = makeSession(hem);
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.faceBevelMode, 'multi-region');
  assert.equal(modal.lastResult.regionCount, 2);
  assert.equal(modal.lastResult.topology.valid, true);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  const beforeCommit = session.mesh.userData.hem.faces.length;
  const applied = await modal.confirm();
  assert.equal(applied.regionCount, 2);
  assert.equal(session.commits.length, 1);
  assert.ok(session.mesh.userData.hem.faces.length > beforeCommit - 2);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});

test('disconnected planar Face Bevel can switch to Individual Faces and back', async () => {
  const session = makeSession();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.toggleFaceBevelMode(), true);
  assert.equal(modal.faceBevelMode, 'individual');
  assert.equal(modal.toggleFaceBevelMode(), true);
  assert.equal(modal.faceBevelMode, 'multi-region');
  assert.equal(modal.lastResult.regionCount, 2);
  await modal.cancel();
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});
