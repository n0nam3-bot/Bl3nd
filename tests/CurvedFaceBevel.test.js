import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';
import { BevelModal } from '../src/operators/BevelModal.js';

function makeCurvedPatch() {
  // A small triangulated spherical cap with a surrounding unselected collar.
  // Every source face is planar, while the connected selected region is not.
  const divisions = 4;
  const positions = [];
  for (let y = 0; y <= divisions; y++) {
    for (let x = 0; x <= divisions; x++) {
      const px = (x - 2) * 0.18;
      const py = (y - 2) * 0.18;
      positions.push([px, py, Math.sqrt(1 - px * px - py * py)]);
    }
  }
  const faces = [];
  for (let y = 0; y < divisions; y++) {
    for (let x = 0; x < divisions; x++) {
      const a = y * (divisions + 1) + x;
      const b = a + 1;
      const d = (y + 1) * (divisions + 1) + x;
      const c = d + 1;
      faces.push([a, b, c], [a, c, d]);
    }
  }
  const selected = [];
  for (let y = 1; y <= 2; y++) {
    for (let x = 1; x <= 2; x++) {
      const cell = y * divisions + x;
      selected.push(cell * 2, cell * 2 + 1);
    }
  }
  const mesh = new HalfEdgeMesh(positions, faces);
  mesh.setSelectionMode('face');
  mesh.faceSelection = new Set(selected);
  return { mesh, positions, faces, selected };
}

function snapshot(mesh) {
  return JSON.stringify({
    positions: mesh.positions,
    faces: mesh.faces,
    selectionMode: mesh.selectionMode,
    faceSelection: [...mesh.faceSelection].sort((a, b) => a - b)
  });
}

function makeSession(source) {
  const mesh = { userData: { hem: source } };
  const document = {
    mode: 'edit',
    selectionMode: 'face',
    activeObject: mesh,
    updateMesh() {},
    async serialize() {
      const hem = mesh.userData.hem;
      return {
        selectionMode: this.selectionMode,
        positions: hem.positions.map(point => [...point]),
        faces: hem.faces.map(face => [...face]),
        faceSelection: [...hem.faceSelection]
      };
    },
    async restore(data) {
      const restored = new HalfEdgeMesh(data.positions, data.faces);
      restored.setSelectionMode(data.selectionMode);
      restored.faceSelection = new Set(data.faceSelection);
      mesh.userData.hem = restored;
      this.selectionMode = data.selectionMode;
    }
  };
  const commits = [];
  const undoManager = { async record(label, before, after) { commits.push({ label, before, after }); } };
  const viewport = {
    lastPointer: null,
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 }) } }
  };
  return { mesh, document, undoManager, viewport, commits };
}

test('a small curved surface patch bevels as one welded region with triangulated transition walls', () => {
  const { mesh, selected } = makeCurvedPatch();
  const analysis = mesh.analyzeFaceRegion(selected);
  assert.equal(analysis.valid, true);
  assert.equal(analysis.connected, true);
  assert.equal(analysis.planar, false);
  assert.equal(analysis.loopCount, 1);
  assert.equal(mesh.validateTopology().valid, true);

  const result = mesh.bevelSelectedCurvedFaceRegion({ amount: 0.25, heightAmount: 0.35, segments: 3, profile: 0.5 });
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.operation, 'face-curved-region');
  assert.equal(result.selectedFaces, 8);
  assert.equal(result.selectedTopTriangles, 8);
  assert.equal(result.boundaryEdges, 8);
  assert.equal(result.createdFaces, 8 * 3 * 2);
  assert.equal(result.segments, 3);
  assert.equal(result.profile, 0.5);
  assert.equal(mesh.faceSelection.size, 8);
  assert.equal(mesh.validateTopology().valid, true);
  assert.equal(mesh.validateTopology().counts.nonPlanarFaces, 0);
  assert.equal(mesh.validateTopology().counts.isolatedVertices, 0);

  const selectedFaces = new Set(mesh.faceSelection);
  const sharedRaisedSeams = mesh.edges.filter(edge => edge.halfEdges.length === 2 &&
    edge.halfEdges.every(halfEdge => selectedFaces.has(halfEdge.face.id)));
  // Four original cell diagonals and four joins between the four cells remain welded.
  assert.equal(sharedRaisedSeams.length, 8);
});

test('curved Face Bevel preserves valid topology across segment and profile extremes', () => {
  for (const segments of [1, 2, 4, 8]) {
    for (const profile of [0, 0.5, 1]) {
      const { mesh } = makeCurvedPatch();
      const result = mesh.bevelSelectedCurvedFaceRegion({ amount: 0.12, heightAmount: 0.18, segments, profile });
      assert.equal(result.changed, true, `segments=${segments}, profile=${profile}: ${result.reason}`);
      assert.equal(result.createdFaces, result.boundaryEdges * segments * 2);
      assert.equal(mesh.validateTopology().valid, true);
      assert.ok(mesh.faces.every((_, faceId) => mesh.triangulateFace(faceId).length > 0));
    }
  }
});

test('the existing planar Connected Region path remains separate and unchanged', () => {
  const mesh = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0]],
    [[0,1,4,3],[1,2,5,4]]
  );
  mesh.setSelectionMode('face');
  mesh.faceSelection = new Set([0, 1]);
  const before = snapshot(mesh);
  const curved = mesh.bevelSelectedCurvedFaceRegion({ amount: 0.2 });
  assert.equal(curved.changed, false);
  assert.match(curved.reason, /Connected Region Face Bevel/);
  assert.equal(snapshot(mesh), before);
  const planar = mesh.bevelSelectedFaceRegion({ amount: 0.2 });
  assert.equal(planar.changed, true, planar.reason);
  assert.equal(planar.operation, 'face-region');
  assert.equal(mesh.validateTopology().valid, true);
});

test('a sharp crease is rejected non-destructively instead of becoming a false smooth patch', () => {
  const mesh = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[1,1,0],[0,1,2]],
    [[0,1,2],[0,2,3]]
  );
  mesh.setSelectionMode('face');
  mesh.faceSelection = new Set([0, 1]);
  const before = snapshot(mesh);
  const result = mesh.bevelSelectedCurvedFaceRegion({ amount: 0.2 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /smoothly varying|sharp crease/i);
  assert.equal(snapshot(mesh), before);
});

test('an unsupported offset or invalid controls leave the curved source unchanged', () => {
  const { mesh } = makeCurvedPatch();
  const before = snapshot(mesh);
  for (const options of [
    { amount: 0, heightAmount: 0.25 },
    { amount: 0.25, heightAmount: 1 },
    { amount: 0.25, segments: 0 },
    { amount: 0.25, profile: 1.2 }
  ]) {
    const result = mesh.bevelSelectedCurvedFaceRegion(options);
    assert.equal(result.changed, false, JSON.stringify(options));
    assert.equal(snapshot(mesh), before);
  }
});

test('Bevel modal automatically previews a valid curved patch as Continuous Surface and commits one undo step', async () => {
  const source = makeCurvedPatch().mesh;
  const session = makeSession(source);
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.faceBevelMode, 'curved-region');
  assert.equal(modal.lastResult.operation, 'face-curved-region');
  assert.equal(modal.setAmount(0.35), true, modal.lastError);
  assert.equal(modal.setHeightAmount(0.45), true, modal.lastError);
  assert.equal(modal.setSegments(4), true, modal.lastError);
  assert.equal(modal.setProfile(0.8), true, modal.lastError);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  const result = await modal.confirm();
  assert.equal(result.operation, 'face-curved-region');
  assert.equal(result.amount, 0.35);
  assert.equal(result.heightAmount, 0.45);
  assert.equal(result.segments, 4);
  assert.equal(result.profile, 0.8);
  assert.equal(session.commits.length, 1);
  assert.equal(session.commits[0].label, 'Face Bevel');
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});

test('Continuous Surface can switch to Individual Faces and back while settings match; Cancel restores source', async () => {
  const source = makeCurvedPatch().mesh;
  const session = makeSession(source);
  const before = await session.document.serialize();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.faceBevelMode, 'curved-region');
  assert.equal(modal.toggleFaceBevelMode(), true, modal.lastError);
  assert.equal(modal.faceBevelMode, 'individual');
  assert.equal(modal.lastResult.operation, 'face-individual');
  assert.equal(modal.toggleFaceBevelMode(), true, modal.lastError);
  assert.equal(modal.faceBevelMode, 'curved-region');
  assert.equal(modal.lastResult.operation, 'face-curved-region');
  assert.equal(await modal.cancel(), true);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Bevel modal falls back to Individual Faces when a selected curved patch contains a sharp crease', async () => {
  const mesh = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[1,1,0],[0,1,2]],
    [[0,1,2],[0,2,3]]
  );
  mesh.setSelectionMode('face');
  mesh.faceSelection = new Set([0, 1]);
  const session = makeSession(mesh);
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.faceBevelMode, 'individual');
  assert.equal(modal.continuousCurvedRegionCandidate, false);
  assert.equal(modal.lastResult.operation, 'face-individual');
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  assert.equal(await modal.cancel(), true);
  assert.equal(session.commits.length, 0);
});
