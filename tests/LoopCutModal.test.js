import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';
import { LoopCutModal } from '../src/operators/LoopCutModal.js';

function makeSession() {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[1,1,0],[0,1,0]],
    [[0,1,2,3]]
  );
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => edge.vertices.includes(0) && edge.vertices.includes(1));
  hem.selectEdge(seed.id);
  const mesh = { userData: { hem } };
  const document = {
    mode: 'edit', selectionMode: 'edge', activeObject: mesh,
    updateMesh() {},
    async serialize() {
      return {
        positions: mesh.userData.hem.positions.map(point => [...point]),
        faces: mesh.userData.hem.faces.map(face => [...face]),
        edgeSelection: [...mesh.userData.hem.edgeSelection]
      };
    },
    async restore(snapshot) {
      const restored = new HalfEdgeMesh(snapshot.positions, snapshot.faces);
      restored.setSelectionMode('edge');
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

test('Loop Cut modal previews at center and slides continuously from the original mesh', async () => {
  const session = makeSession();
  const modal = new LoopCutModal(session);
  assert.equal(await modal.begin(), true);
  assert.equal(modal.active, true);
  assert.equal(modal.offset, 0.5);
  assert.equal(session.mesh.userData.hem.faces.length, 2);

  modal.pointerMove({ x: 150, y: 50 });
  assert.equal(modal.offset, 0.625);
  const inserted = session.mesh.userData.hem.positions.slice(4);
  assert.deepEqual(inserted.map(point => point[0]), [0.625, 0.625]);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});

test('Loop Cut modal supports precision drag and numeric offset entry', async () => {
  const session = makeSession();
  const modal = new LoopCutModal(session);
  assert.equal(await modal.begin(), true);
  modal.pointerMove({ x: 150, y: 50 }, true);
  assert.equal(modal.offset, 0.515);

  modal.numeric = '';
  for (const key of ['0', '.', '2', '5']) modal.appendNumeric(key);
  assert.equal(modal.offset, 0.25);
  assert.equal(modal.numeric, '0.25');
  assert.deepEqual(session.mesh.userData.hem.positions.slice(4).map(point => point[0]), [0.25, 0.25]);
});

test('Loop Cut modal cancel restores the original topology and creates no undo record', async () => {
  const session = makeSession();
  const before = await session.document.serialize();
  const modal = new LoopCutModal(session);
  assert.equal(await modal.begin(), true);
  modal.pointerMove({ x: 180, y: 50 });
  assert.equal(session.mesh.userData.hem.faces.length, 2);
  assert.equal(await modal.cancel(), true);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Loop Cut modal confirm stores one undo transaction at the selected offset', async () => {
  const session = makeSession();
  const modal = new LoopCutModal(session);
  assert.equal(await modal.begin(), true);
  modal.appendNumeric('0'); modal.appendNumeric('.'); modal.appendNumeric('4');
  const result = await modal.confirm();
  assert.equal(modal.active, false);
  assert.equal(result.changed, true);
  assert.equal(result.offset, 0.4);
  assert.equal(session.commits.length, 1);
  assert.equal(session.commits[0].label, 'Loop Cut');
  assert.equal(session.commits[0].after.faces.length, 2);
});

test('Loop Cut modal refuses to start without exactly one selected edge', async () => {
  const session = makeSession();
  session.mesh.userData.hem.edgeSelection.clear();
  const modal = new LoopCutModal(session);
  assert.equal(await modal.begin(), false);
  assert.match(modal.lastError, /exactly one/i);
  assert.equal(session.mesh.userData.hem.faces.length, 1);
});

test('Loop Cut modal establishes a fresh drag anchor when started from the side panel', async () => {
  const session = makeSession();
  session.viewport.lastPointer = null;
  const modal = new LoopCutModal(session);
  assert.equal(await modal.begin(), true);
  assert.equal(modal.startPointer, null);
  modal.pointerMove({ x: 120, y: 50 });
  assert.deepEqual(modal.startPointer, { x: 120, y: 50 });
  modal.pointerMove({ x: 160, y: 50 });
  assert.equal(modal.offset, 0.6);
  await modal.cancel();
});
