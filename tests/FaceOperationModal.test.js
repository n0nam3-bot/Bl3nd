import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';
import { FaceOperationModal } from '../src/operators/FaceOperationModal.js';

function makeCubeSession() {
  const hem = new HalfEdgeMesh(
    [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
  );
  hem.setSelectionMode('face');
  hem.selectFace(1);
  const mesh = { userData: { hem } };
  const document = {
    mode: 'edit', selectionMode: 'face', activeObject: mesh,
    updateMesh() {},
    async serialize() {
      return {
        selectionMode: this.selectionMode,
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
  const commits = [];
  const undoManager = { async record(label, before, after) { commits.push({ label, before, after }); } };
  const viewport = {
    lastPointer: { x: 100, y: 100 },
    camera: { position: { distanceTo: () => 10 } },
    controls: { target: { x: 0, y: 0, z: 0 } },
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 }) } }
  };
  return { hem, mesh, document, commits, undoManager, viewport };
}

function makeTwoFacePlaneSession() {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0]],
    [[0,1,4,3],[1,2,5,4]]
  );
  hem.setSelectionMode('face');
  hem.selectFace(0);
  hem.selectFace(1, true);
  const mesh = { userData: { hem } };
  const document = {
    mode: 'edit', selectionMode: 'face', activeObject: mesh,
    updateMesh() {},
    async serialize() { return { positions: mesh.userData.hem.positions.map(point => [...point]), faces: mesh.userData.hem.faces.map(face => [...face]), faceSelection: [...mesh.userData.hem.faceSelection] }; },
    async restore(snapshot) { const restored = new HalfEdgeMesh(snapshot.positions, snapshot.faces); restored.setSelectionMode('face'); restored.faceSelection = new Set(snapshot.faceSelection); mesh.userData.hem = restored; }
  };
  const commits = [];
  const undoManager = { async record(label, before, after) { commits.push({ label, before, after }); } };
  return { hem, mesh, document, commits, undoManager, viewport: { renderer: { domElement: { getBoundingClientRect: () => ({ left:0,top:0,right:400,bottom:400,width:400,height:400 }) } } } };
}

function makeConcaveRegionSession(rotated = false) {
  const transform = ([x, y, z]) => {
    if (!rotated) return [x, y, z];
    const rz = 0.47, rx = 0.39, ry = 0.28;
    const cz = Math.cos(rz), sz = Math.sin(rz);
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const afterZ = [cz * x - sz * y, sz * x + cz * y, z];
    const afterX = [afterZ[0], cx * afterZ[1] - sx * afterZ[2], sx * afterZ[1] + cx * afterZ[2]];
    return [cy * afterX[0] + sy * afterX[2] + 2, afterX[1] - 3, -sy * afterX[0] + cy * afterX[2] + 1];
  };
  const positions = [];
  for (let y = 0; y <= 2; y++) for (let x = 0; x <= 2; x++) positions.push(transform([x, y, 0]));
  const id = (x, y) => y * 3 + x;
  const faces = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) faces.push([id(x, y), id(x + 1, y), id(x + 1, y + 1), id(x, y + 1)]);
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('face');
  hem.faceSelection = new Set([0, 1, 2]);
  const mesh = { userData: { hem } };
  const document = {
    mode: 'edit', selectionMode: 'face', activeObject: mesh,
    updateMesh() {},
    async serialize() { return { positions: mesh.userData.hem.positions.map(point => [...point]), faces: mesh.userData.hem.faces.map(face => [...face]), faceSelection: [...mesh.userData.hem.faceSelection] }; },
    async restore(snapshot) { const restored = new HalfEdgeMesh(snapshot.positions, snapshot.faces); restored.setSelectionMode('face'); restored.faceSelection = new Set(snapshot.faceSelection); mesh.userData.hem = restored; }
  };
  const commits = [];
  const undoManager = { async record(label, before, after) { commits.push({ label, before, after }); } };
  const viewport = { renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 }) } } };
  return { hem, mesh, document, commits, undoManager, viewport };
}

test('Extrude modal previews from the immutable source and validates the candidate', async () => {
  const session = makeCubeSession();
  const before = await session.document.serialize();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('extrude'), true, modal.lastError);
  assert.equal(modal.value, 1);
  assert.equal(session.mesh.userData.hem.faces.length, 10);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  assert.equal(modal.setValue(2), true);
  assert.deepEqual(session.mesh.userData.hem.positions.slice(8), [[-1,-1,3],[1,-1,3],[1,1,3],[-1,1,3]]);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  assert.notDeepEqual(await session.document.serialize(), before);
  await modal.cancel();
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Extrude modal accepts negative distances and records one undo transaction', async () => {
  const session = makeCubeSession();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('extrude'), true);
  assert.equal(modal.setValue(-0.75), true);
  const result = await modal.confirm();
  assert.equal(result.operation, 'extrude');
  assert.equal(result.value, -0.75);
  assert.equal(session.commits.length, 1);
  assert.equal(session.commits[0].label, 'Extrude');
  assert.equal(modal.active, false);
});

test('Extrude modal supports one connected planar multi-face region', async () => {
  const session = makeTwoFacePlaneSession();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('extrude'), true, modal.lastError);
  assert.equal(session.mesh.userData.hem.faces.length, 8);
  assert.equal(modal.lastResult.selectedFaces, 2);
  assert.equal(modal.lastResult.boundaryEdges, 6);
  assert.equal(modal.lastResult.distance, 1);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  await modal.cancel();
  assert.equal(session.commits.length, 0);
});

test('Inset modal previews a single face and commits once', async () => {
  const session = makeCubeSession();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('inset'), true, modal.lastError);
  assert.equal(modal.value, 0.12);
  assert.equal(session.mesh.userData.hem.faces.length, 10);
  assert.equal(modal.setValue(0.25), true);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  const result = await modal.confirm();
  assert.equal(result.operation, 'inset');
  assert.equal(result.value, 0.25);
  assert.equal(session.commits.length, 1);
  assert.equal(session.commits[0].label, 'Inset');
});

test('Inset modal cancellation restores the original topology without an undo entry', async () => {
  const session = makeCubeSession();
  const before = await session.document.serialize();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('inset'), true);
  assert.equal(modal.setValue(0.4), true);
  assert.equal(await modal.cancel(), true);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Inset modal previews a connected two-face region with one shared boundary and commits once', async () => {
  const session = makeTwoFacePlaneSession();
  const before = await session.document.serialize();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('inset'), true, modal.lastError);
  assert.equal(session.mesh.userData.hem.faces.length, 8);
  assert.equal(session.mesh.userData.hem.faceSelection.size, 2);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  assert.equal(modal.setValue(0.2), true, modal.lastError);
  const result = await modal.confirm();
  assert.equal(result.operation, 'inset');
  assert.equal(result.selectedFaces, 2);
  assert.equal(result.boundaryEdges, 6);
  assert.ok(Math.abs(result.distance - 0.2) < 1e-10);
  assert.equal(session.commits.length, 1);
  assert.equal(session.commits[0].label, 'Inset');
  assert.notDeepEqual(session.commits[0].after, before);
});

test('Inset modal cancellation restores the full connected region without an undo entry', async () => {
  const session = makeTwoFacePlaneSession();
  const before = await session.document.serialize();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('inset'), true, modal.lastError);
  assert.equal(modal.setValue(0.3), true, modal.lastError);
  assert.notDeepEqual(await session.document.serialize(), before);
  assert.equal(await modal.cancel(), true);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Inset modal rejects disconnected multi-face regions without changing the source', async () => {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[3,0,0],[4,0,0],[4,1,0],[3,1,0]],
    [[0,1,2,3],[4,5,6,7]]
  );
  hem.setSelectionMode('face');
  hem.selectFace(0); hem.selectFace(1, true);
  const mesh = { userData: { hem } };
  const document = {
    mode: 'edit', selectionMode: 'face', activeObject: mesh,
    updateMesh() {},
    async serialize() { return { positions: mesh.userData.hem.positions.map(point => [...point]), faces: mesh.userData.hem.faces.map(face => [...face]), faceSelection: [...mesh.userData.hem.faceSelection] }; },
    async restore(snapshot) { const restored = new HalfEdgeMesh(snapshot.positions, snapshot.faces); restored.setSelectionMode('face'); restored.faceSelection = new Set(snapshot.faceSelection); mesh.userData.hem = restored; }
  };
  const commits = [];
  const undoManager = { async record(label, before, after) { commits.push({ label, before, after }); } };
  const session = { mesh, document, commits, undoManager, viewport: {} };
  const before = await document.serialize();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('inset'), false);
  assert.match(modal.lastError, /connected planar face region/i);
  assert.deepEqual(await document.serialize(), before);
  assert.equal(commits.length, 0);
});

test('Face operations require Face Select and leave the source unchanged on invalid selection', async () => {
  const session = makeCubeSession();
  session.document.selectionMode = 'edge';
  session.mesh.userData.hem.setSelectionMode('edge');
  const before = await session.document.serialize();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('extrude'), false);
  assert.match(modal.lastError, /Face Select/i);
  assert.deepEqual(await session.document.serialize(), before);
});

test('Extrude rejects disconnected face regions without changing the source', async () => {
  const session = makeCubeSession();
  session.mesh.userData.hem.clearSelection();
  session.mesh.userData.hem.selectFace(0);
  session.mesh.userData.hem.selectFace(1, true);
  const before = await session.document.serialize();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('extrude'), false);
  assert.match(modal.lastError, /connected, planar face region/i);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('numeric input supports signed Extrude and bounded Inset values', async () => {
  const extrudeSession = makeCubeSession();
  const extrude = new FaceOperationModal(extrudeSession);
  assert.equal(await extrude.begin('extrude'), true);
  for (const key of ['-', '0', '.', '5']) extrude.appendNumeric(key);
  assert.equal(extrude.value, -0.5);
  assert.equal(extrude.numeric, '-0.5');
  await extrude.cancel();

  const insetSession = makeCubeSession();
  const inset = new FaceOperationModal(insetSession);
  assert.equal(await inset.begin('inset'), true);
  for (const key of ['0', '.', '2', '5']) inset.appendNumeric(key);
  assert.equal(inset.value, 0.25);
  await inset.cancel();
});


test('face-operation drag starts from the actual pointer-down, not the previous face-selection pointer', async () => {
  const session = makeCubeSession();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('extrude'), true);
  assert.equal(modal.startPointer, null);
  assert.equal(modal.setPointerAnchor({ x: 120, y: 160 }), true);
  modal.pointerMove({ x: 120, y: 120 });
  assert.ok(Math.abs(modal.value - 1.8) < 1e-10);
  await modal.cancel();
});


test('Extrude modal previews a concave L-shaped face region and cancel restores the original', async () => {
  const session = makeConcaveRegionSession();
  const before = await session.document.serialize();
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('extrude'), true, modal.lastError);
  assert.equal(modal.lastResult.selectedFaces, 3);
  assert.equal(modal.lastResult.boundaryEdges, 8);
  assert.equal(modal.lastResult.createdFaces, 8);
  assert.equal(session.mesh.userData.hem.faces.length, 12);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  assert.equal(modal.setValue(1.4), true, modal.lastError);
  assert.equal(modal.lastResult.distance, 1.4);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  assert.equal(await modal.cancel(), true);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Extrude modal commits a rotated concave region once and returns its world-space normal', async () => {
  const session = makeConcaveRegionSession(true);
  const modal = new FaceOperationModal(session);
  assert.equal(await modal.begin('extrude'), true, modal.lastError);
  assert.ok(modal.lastResult.normal.every(value => Number.isFinite(value)));
  assert.ok(modal.lastResult.normal.every(value => Math.abs(value) > 0.1));
  assert.equal(modal.setValue(1.25), true, modal.lastError);
  const result = await modal.confirm();
  assert.equal(result.operation, 'extrude');
  assert.equal(result.selectedFaces, 3);
  assert.equal(result.boundaryEdges, 8);
  assert.equal(result.distance, 1.25);
  assert.equal(session.commits.length, 1);
  assert.equal(session.commits[0].label, 'Extrude');
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});
