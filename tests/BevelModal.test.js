import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';
import { BevelModal } from '../src/operators/BevelModal.js';

const keyFor = (a,b) => a < b ? `${a}:${b}` : `${b}:${a}`;

function makeSession({ boundary = false } = {}) {
  const positions = boundary
    ? [[0,0,0],[2,0,0],[2,2,0],[0,2,0]]
    : [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const faces = boundary
    ? [[0,1,2,3]]
    : [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(...(boundary ? [0,1] : [4,5])));
  hem.selectEdge(seed.id);
  const mesh = { userData: { hem } };
  const document = {
    mode: 'edit', selectionMode: 'edge', activeObject: mesh,
    updateMesh() {},
    async serialize() {
      return {
        selectionMode: this.selectionMode,
        positions: mesh.userData.hem.positions.map(point => [...point]),
        faces: mesh.userData.hem.faces.map(face => [...face]),
        edgeSelection: [...mesh.userData.hem.edgeSelection]
      };
    },
    async restore(snapshot) {
      const restored = new HalfEdgeMesh(snapshot.positions, snapshot.faces);
      restored.setSelectionMode(snapshot.selectionMode || 'edge');
      restored.edgeSelection = new Set(snapshot.edgeSelection);
      mesh.userData.hem = restored;
    }
  };
  const commits = [];
  const undoManager = { async record(label, before, after) { commits.push({ label, before, after }); } };
  const viewport = {
    lastPointer: { x: 100, y: 50 },
    getPointerOrigin: () => ({ x: 100, y: 50 }),
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }) } }
  };
  return { hem, mesh, document, commits, viewport, undoManager };
}

test('Bevel modal previews supported edge and updates amount from numeric entry', async () => {
  const session = makeSession();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true);
  assert.equal(modal.active, true);
  assert.equal(modal.amount, 0.25);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  modal.numeric = '';
  for (const key of ['0','.','5']) modal.appendNumeric(key);
  assert.equal(modal.amount, 0.5);
  assert.ok(Math.abs(modal.lastResult.width - 0.45) < 1e-10);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});

test('Bevel modal drag changes width from its original preview anchor', async () => {
  const session = makeSession();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true);
  modal.pointerMove({ x: 150, y: 50 });
  assert.equal(modal.amount, 0.35);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  await modal.cancel();
});

test('Bevel modal cancel restores the original mesh and creates no undo record', async () => {
  const session = makeSession();
  const before = await session.document.serialize();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true);
  modal.setAmount(0.6);
  assert.notDeepEqual(await session.document.serialize(), before);
  assert.equal(await modal.cancel(), true);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Bevel modal confirm records exactly one undo transaction', async () => {
  const session = makeSession();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true);
  modal.setAmount(0.4);
  const result = await modal.confirm();
  assert.equal(modal.active, false);
  assert.equal(result.changed, true);
  assert.equal(result.amount, 0.4);
  assert.equal(session.commits.length, 1);
  assert.equal(session.commits[0].label, 'Bevel');
  assert.equal(session.commits[0].after.faces.length, 7);
});

test('Bevel modal refuses boundary edges without changing the source mesh', async () => {
  const session = makeSession({ boundary: true });
  const before = await session.document.serialize();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), false);
  assert.match(modal.lastError, /closed interior manifold|boundary/i);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Bevel modal rejects invalid numeric width and keeps the last valid preview', async () => {
  const session = makeSession();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true);
  modal.numeric = '';
  for (const key of ['0','.','9']) modal.appendNumeric(key);
  const before = await session.document.serialize();
  modal.appendNumeric('9');
  assert.equal(modal.amount, 0.9);
  assert.deepEqual(await session.document.serialize(), before);
  await modal.cancel();
});
