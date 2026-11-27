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

function selectedMesh(positions, faces, selectedIds, { reverse = false } = {}) {
  const sourceFaces = reverse ? faces.map(face => [...face].reverse()) : faces;
  const mesh = new HalfEdgeMesh(positions, sourceFaces);
  mesh.setSelectionMode('face');
  selectedIds.forEach((id, index) => mesh.selectFace(id, index > 0));
  return mesh;
}

function snapshot(mesh) {
  return JSON.stringify({
    positions: mesh.positions,
    faces: mesh.faces,
    mode: mesh.selectionMode,
    selection: [...mesh.faceSelection].sort((a, b) => a - b)
  });
}

function gridRegion(cells, { rotated = false, reverse = false } = {}) {
  const vertexIds = new Map();
  const positions = [];
  const transform = ([x, y]) => {
    if (!rotated) return [x, y, 0];
    const rz = 0.47, rx = 0.39, ry = 0.28;
    const cz = Math.cos(rz), sz = Math.sin(rz);
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const afterZ = [cz * x - sz * y, sz * x + cz * y, 0];
    const afterX = [afterZ[0], cx * afterZ[1], sx * afterZ[1]];
    return [cy * afterX[0] + sy * afterX[2] + 2, afterX[1] - 3, -sy * afterX[0] + cy * afterX[2] + 1];
  };
  const id = (x, y) => {
    const key = `${x},${y}`;
    if (!vertexIds.has(key)) {
      vertexIds.set(key, positions.length);
      positions.push(transform([x, y]));
    }
    return vertexIds.get(key);
  };
  const faces = cells.map(([x, y]) => {
    const face = [id(x, y), id(x + 1, y), id(x + 1, y + 1), id(x, y + 1)];
    return reverse ? face.reverse() : face;
  });
  return selectedMesh(positions, faces, faces.map((_, index) => index));
}

const lRegionCells = [[0, 0], [1, 0], [0, 1]];
const uRegionCells = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]];

function makeSession(hem) {
  const mesh = { userData: { hem } };
  const document = {
    mode: 'edit',
    selectionMode: 'face',
    activeObject: mesh,
    updateMesh() {},
    async serialize() {
      return {
        selectionMode: this.selectionMode,
        positions: mesh.userData.hem.positions.map(point => [...point]),
        faces: mesh.userData.hem.faces.map(face => [...face]),
        faceSelection: [...mesh.userData.hem.faceSelection]
      };
    },
    async restore(value) {
      const restored = new HalfEdgeMesh(value.positions, value.faces);
      restored.setSelectionMode(value.selectionMode);
      restored.faceSelection = new Set(value.faceSelection || []);
      mesh.userData.hem = restored;
      this.selectionMode = value.selectionMode;
    }
  };
  const commits = [];
  const undoManager = { async record(label, before, after) { commits.push({ label, before, after }); } };
  const viewport = {
    lastPointer: { x: 100, y: 80 },
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 240, width: 400, height: 240 }) } }
  };
  return { hem, mesh, document, commits, undoManager, viewport };
}

test('Face Bevel raises a convex cube face and creates a validated mitered perimeter wall', () => {
  const mesh = selectedMesh(cubePositions, cubeFaces, [1]);
  const before = snapshot(mesh);
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.25 });

  assert.equal(result.changed, true, result.reason);
  assert.equal(result.operation, 'face-region');
  assert.equal(result.selectedFaces, 1);
  assert.equal(result.boundaryEdges, 4);
  assert.equal(result.insertedVertices, 4);
  assert.equal(result.createdFaces, 4);
  assert.equal(result.convexCorners, 4);
  assert.ok(Math.abs(result.width - 0.225) < 1e-10);
  assert.ok(Math.abs(result.height - result.width) < 1e-12);
  assert.deepEqual(result.normal, [0, 0, 1]);
  const raised = mesh.positions.slice(8);
  const expected = [
    [-0.775,-0.775,1.225], [0.775,-0.775,1.225],
    [0.775,0.775,1.225], [-0.775,0.775,1.225]
  ];
  raised.forEach((point, index) => point.forEach((value, axis) => assert.ok(Math.abs(value - expected[index][axis]) < 1e-10)));
  assert.equal(mesh.faces.length, 10);
  assert.equal(mesh.faceSelection.size, 1);
  assert.equal(mesh.validateTopology().valid, true);
  assert.notEqual(snapshot(mesh), before);
});

test('connected planar face region keeps its internal seam welded after Face Bevel', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[2,0,0],[0,1,0],[1,1,0],[2,1,0]],
    [[0,1,4,3],[1,2,5,4]],
    [0,1]
  );
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.25 });
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.selectedFaces, 2);
  assert.equal(result.boundaryEdges, 6);
  assert.equal(result.insertedVertices, 6);
  assert.equal(mesh.faceSelection.size, 2);
  const selected = new Set(mesh.faceSelection);
  const innerSeams = mesh.edges.filter(edge => edge.halfEdges.length === 2 &&
    edge.halfEdges.every(halfEdge => selected.has(halfEdge.face.id)));
  assert.equal(innerSeams.length, 1);
  assert.equal(mesh.validateTopology().valid, true);
});

test('multi-row and multi-column planar grids bevel without orphaned interior source vertices', () => {
  for (const [width, height, segments] of [[2, 2, 3], [3, 2, 4], [3, 3, 6]]) {
    const cells = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push([x, y]);
    const mesh = gridRegion(cells);
    const result = mesh.bevelSelectedFaceRegion({ amount: 0.2, heightAmount: 0.6, segments, profile: 0.65 });

    assert.equal(result.changed, true, `${width}x${height}: ${result.reason}`);
    assert.equal(result.selectedFaces, width * height);
    assert.equal(result.boundaryEdges, 2 * width + 2 * height);
    assert.equal(result.createdFaces, result.boundaryEdges * segments);
    assert.equal(result.heightAmount, 0.6);
    assert.ok(Math.abs(result.height / result.width - 3) < 1e-10);
    assert.equal(result.topology.counts.isolatedVertices, 0);
    assert.equal(mesh.validateTopology().valid, true);
    assert.equal(mesh.faceSelection.size, width * height);
    const selected = new Set(mesh.faceSelection);
    const internalSeams = mesh.edges.filter(edge => edge.halfEdges.length === 2 &&
      edge.halfEdges.every(halfEdge => selected.has(halfEdge.face.id)));
    assert.equal(internalSeams.length, width * (height - 1) + height * (width - 1));
    assert.ok(mesh.faces.every((_, faceId) => mesh.triangulateFace(faceId).length > 0));
  }
});

test('Face Bevel follows a rotated region normal and keeps bevel walls planar', () => {
  const angle = Math.PI / 5;
  const positions = [[0,0],[2,0],[2,1],[0,1]].map(([x,y]) => [x, y * Math.cos(angle), y * Math.sin(angle)]);
  const mesh = selectedMesh(positions, [[0,1,2,3]], [0]);
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.2 });
  assert.equal(result.changed, true, result.reason);
  assert.ok(Math.abs(result.normal[0]) < 1e-10);
  assert.ok(Math.abs(result.normal[1] + Math.sin(angle)) < 1e-10);
  assert.ok(Math.abs(result.normal[2] - Math.cos(angle)) < 1e-10);
  assert.equal(mesh.validateTopology().valid, true);
  assert.equal(mesh.faces.length, 5);
});

test('Face Bevel preserves reversed region winding', () => {
  const mesh = selectedMesh(
    [[0,0,0],[2,0,0],[2,2,0],[0,2,0]],
    [[0,1,2,3]],
    [0],
    { reverse: true }
  );
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.2 });
  assert.equal(result.changed, true, result.reason);
  assert.deepEqual(result.normal, [0, 0, -1]);
  assert.ok(mesh.positions.slice(4).every(point => Math.abs(point[2] + result.width) < 1e-10));
  assert.equal(mesh.validateTopology().valid, true);
});

test('concave L-shaped face region bevels with a validated reflex miter and welded seams', () => {
  const mesh = gridRegion(lRegionCells);
  const analysis = mesh.analyzeFaceRegion([...mesh.faceSelection]);
  assert.equal(analysis.valid, true);
  assert.equal(analysis.hasConcaveCorners, true);
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.1 });

  assert.equal(result.changed, true, result.reason);
  assert.equal(result.reflexCorners, 1);
  assert.equal(result.boundaryEdges, 8);
  assert.equal(result.createdFaces, 8);
  assert.equal(mesh.validateTopology().valid, true);
  const selected = new Set(mesh.faceSelection);
  const innerSeams = mesh.edges.filter(edge => edge.halfEdges.length === 2 &&
    edge.halfEdges.every(halfEdge => selected.has(halfEdge.face.id)));
  assert.equal(innerSeams.length, 2);
  assert.ok(mesh.faces.every((_, faceId) => mesh.triangulateFace(faceId).length > 0));
});

test('two-reflex U-shaped region bevels when the inner boundary remains simple', () => {
  const mesh = gridRegion(uRegionCells);
  const analysis = mesh.analyzeFaceRegion([...mesh.faceSelection]);
  assert.equal(analysis.boundaryLoops[0].concaveVertexIds.length, 2);
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.2 });
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.reflexCorners, 2);
  assert.equal(result.boundaryEdges, 16);
  assert.equal(result.createdFaces, 16);
  assert.equal(mesh.validateTopology().valid, true);
});

test('rotated concave region bevel follows its world-space normal', () => {
  const mesh = gridRegion(lRegionCells, { rotated: true });
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.2 });
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.reflexCorners, 1);
  assert.ok(result.normal.every(Number.isFinite));
  assert.ok(Math.abs(result.normal[0]) > 0.1);
  assert.ok(Math.abs(result.normal[1]) > 0.1);
  assert.ok(Math.abs(result.normal[2]) > 0.1);
  assert.equal(mesh.validateTopology().valid, true);
});

test('concave region bevel preserves reversed face winding', () => {
  const mesh = gridRegion(lRegionCells, { reverse: true });
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.2 });
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.reflexCorners, 1);
  assert.deepEqual(result.normal, [0, 0, -1]);
  assert.equal(mesh.validateTopology().valid, true);
});

test('acute reflex notch rejects excessive miter without changing the source', () => {
  const mesh = selectedMesh(
    [[0,0,0],[4,0,0],[4,3,0],[2.1,3,0],[2,2,0],[1.9,3,0],[0,3,0]],
    [[0,1,2,3,4,5,6]],
    [0]
  );
  const before = snapshot(mesh);
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.95 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /excessive miter/i);
  assert.equal(snapshot(mesh), before);
});

test('a selected region with a hole is rejected without mutation', () => {
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
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.1 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /boundary loop|holes/i);
  assert.equal(snapshot(mesh), before);
});

test('disconnected face islands are rejected without mutation', () => {
  const mesh = selectedMesh(
    [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[3,0,0],[4,0,0],[4,1,0],[3,1,0]],
    [[0,1,2,3],[4,5,6,7]],
    [0,1]
  );
  const before = snapshot(mesh);
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.1 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /connected/i);
  assert.equal(snapshot(mesh), before);
});

test('non-planar face regions are rejected without mutation', () => {
  const mesh = selectedMesh(
    [[0,0,0],[2,0,0],[2,2,0.2],[0,2,0]],
    [[0,1,2,3]],
    [0]
  );
  const before = snapshot(mesh);
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.1 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /coplanar/i);
  assert.equal(snapshot(mesh), before);
});

test('connected curved face regions reject safely while an individual planar face remains bevelable', () => {
  const positions = [[0,0,0],[1,0,0],[1,1,0.25],[0,1,0]];
  const faces = [[0,1,2],[0,2,3]];
  const curved = selectedMesh(positions, faces, [0,1]);
  const before = snapshot(curved);
  const result = curved.bevelSelectedFaceRegion({ amount: 0.1 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /coplanar/i);
  assert.equal(snapshot(curved), before);

  const singleFace = selectedMesh(positions, faces, [0]);
  const singleResult = singleFace.bevelSelectedFaceRegion({ amount: 0.1 });
  assert.equal(singleResult.changed, true, singleResult.reason);
  assert.equal(singleFace.validateTopology().valid, true);
});

test('near-parallel acute corners reject excessive miter candidates without mutation', () => {
  const mesh = selectedMesh(
    [[0,0,0],[2,0,0],[2,0.05,0]],
    [[0,1,2]],
    [0]
  );
  const before = snapshot(mesh);
  const result = mesh.bevelSelectedFaceRegion({ amount: 0.25 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /miter/i);
  assert.equal(snapshot(mesh), before);
});

test('invalid amount, segment/profile controls and wrong selection mode reject without mutation', () => {
  const mesh = selectedMesh(cubePositions, cubeFaces, [1]);
  const before = snapshot(mesh);
  for (const amount of [0, -0.1, 1, 2, NaN, Infinity]) {
    assert.equal(mesh.bevelSelectedFaceRegion({ amount }).changed, false);
    assert.equal(snapshot(mesh), before);
  }
  for (const heightAmount of [0, -0.1, 1, 2, NaN, Infinity]) {
    assert.equal(mesh.bevelSelectedFaceRegion({ amount: 0.25, heightAmount }).changed, false);
    assert.equal(snapshot(mesh), before);
  }
  for (const segments of [0, -1, 1.5, 9, NaN]) {
    assert.equal(mesh.bevelSelectedFaceRegion({ amount: 0.25, segments }).changed, false);
    assert.equal(snapshot(mesh), before);
  }
  for (const profile of [-0.1, 1.1, NaN, Infinity]) {
    assert.equal(mesh.bevelSelectedFaceRegion({ amount: 0.25, segments: 3, profile }).changed, false);
    assert.equal(snapshot(mesh), before);
  }
  mesh.setSelectionMode('edge');
  const edgeMode = snapshot(mesh);
  assert.equal(mesh.bevelSelectedFaceRegion({ amount: 0.25 }).changed, false);
  assert.equal(snapshot(mesh), edgeMode);
});

test('Face Bevel supports one through eight segments with valid profile candidates', () => {
  for (const segments of [1, 2, 3, 4, 6, 8]) {
    for (const profile of [0, 0.5, 1]) {
      const mesh = selectedMesh(cubePositions, cubeFaces, [1]);
      const result = mesh.bevelSelectedFaceRegion({ amount: 0.25, segments, profile });
      assert.equal(result.changed, true, `segments=${segments}, profile=${profile}: ${result.reason}`);
      assert.equal(result.segments, segments);
      assert.equal(result.profile, profile);
      assert.equal(result.createdFaces, 4 * segments);
      assert.equal(result.insertedVertices, 4 * segments);
      assert.equal(mesh.validateTopology().valid, true);
      assert.ok(mesh.faces.every((_, faceId) => mesh.triangulateFace(faceId).length > 0));
    }
  }
});

test('Face Bevel profile creates distinct concave, rounded and convex cross-sections', () => {
  const profiles = [0, 0.5, 1].map(profile => {
    const mesh = selectedMesh(cubePositions, cubeFaces, [1]);
    const result = mesh.bevelSelectedFaceRegion({ amount: 0.25, segments: 2, profile });
    assert.equal(result.changed, true, result.reason);
    return mesh.positions.slice(12).map(point => point.map(value => Number(value.toFixed(8))));
  });
  assert.notDeepEqual(profiles[0], profiles[1]);
  assert.notDeepEqual(profiles[1], profiles[2]);
  assert.notDeepEqual(profiles[0], profiles[2]);
});

test('segmented concave L/U Face Bevel preserves reflex corners and welded internal seams', () => {
  for (const [cells, reflexCorners] of [[lRegionCells, 1], [uRegionCells, 2]]) {
    for (const segments of [2, 4, 8]) {
      for (const profile of [0, 0.5, 1]) {
        const mesh = gridRegion(cells);
        const result = mesh.bevelSelectedFaceRegion({ amount: 0.1, segments, profile });
        assert.equal(result.changed, true, `segments=${segments}, profile=${profile}: ${result.reason}`);
        assert.equal(result.reflexCorners, reflexCorners);
        assert.equal(result.createdFaces, result.boundaryEdges * segments);
        assert.equal(mesh.validateTopology().valid, true);
        assert.ok(mesh.faces.every((_, faceId) => mesh.triangulateFace(faceId).length > 0));
        const selected = new Set(mesh.faceSelection);
        const internalSeams = mesh.edges.filter(edge => edge.halfEdges.length === 2 &&
          edge.halfEdges.every(halfEdge => selected.has(halfEdge.face.id)));
        assert.equal(internalSeams.length, cells.length - 1);
      }
    }
  }
});

test('segmented concave Face Bevel supports rotated and reversed winding', () => {
  for (const options of [{ rotated: true }, { reverse: true }]) {
    const mesh = gridRegion(lRegionCells, options);
    const result = mesh.bevelSelectedFaceRegion({ amount: 0.1, segments: 5, profile: 0.35 });
    assert.equal(result.changed, true, result.reason);
    assert.equal(result.segments, 5);
    assert.equal(result.reflexCorners, 1);
    assert.equal(mesh.validateTopology().valid, true);
  }
});

test('Face Bevel modal previews from immutable source and applies amount updates', async () => {
  const session = makeSession(selectedMesh(cubePositions, cubeFaces, [1]));
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.mode, 'face-region');
  assert.equal(modal.active, true);
  assert.equal(modal.lastResult.operation, 'face-region');
  const preview = await session.document.serialize();
  assert.notDeepEqual(preview, { positions: cubePositions, faces: cubeFaces, faceSelection: [1] });
  assert.equal(modal.setAmount(0.4), true, modal.lastError);
  assert.ok(Math.abs(modal.lastResult.width - 0.36) < 1e-10);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  assert.equal(modal.setSegments(4), true, modal.lastError);
  assert.equal(modal.lastResult.segments, 4);
  assert.equal(modal.lastResult.createdFaces, 16);
  assert.equal(modal.lastResult.insertedVertices, 16);
  assert.equal(modal.setProfile(0.8), true, modal.lastError);
  assert.equal(modal.lastResult.profile, 0.8);
  const result = await modal.confirm();
  assert.equal(result.operation, 'face-region');
  assert.equal(result.amount, 0.4);
  assert.equal(result.segments, 4);
  assert.equal(result.profile, 0.8);
  assert.equal(modal.active, false);
  assert.equal(session.commits.length, 1);
  assert.equal(session.commits[0].label, 'Face Bevel');
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});

test('Face Bevel width and height adjust independently and commit one undo step', async () => {
  const session = makeSession(selectedMesh(cubePositions, cubeFaces, [1]));
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.ok(Math.abs(modal.lastResult.width - modal.lastResult.height) < 1e-10);

  assert.equal(modal.setAmount(0.4), true, modal.lastError);
  assert.equal(modal.setHeightAmount(0.6), true, modal.lastError);
  assert.ok(Math.abs(modal.lastResult.width - 0.36) < 1e-10);
  assert.ok(Math.abs(modal.lastResult.height - 0.54) < 1e-10);
  assert.equal(modal.amount, 0.4);
  assert.equal(modal.heightAmount, 0.6);

  assert.equal(modal.toggleActiveDimension(), true);
  assert.equal(modal.activeDimension, 'height');
  for (const key of ['0', '.', '4']) modal.appendNumeric(key);
  assert.equal(modal.heightAmount, 0.4);
  assert.ok(Math.abs(modal.lastResult.width - 0.36) < 1e-10);
  assert.ok(Math.abs(modal.lastResult.height - 0.36) < 1e-10);

  assert.equal(modal.setSegments(4), true, modal.lastError);
  assert.equal(modal.setProfile(0.8), true, modal.lastError);
  const result = await modal.confirm();
  assert.equal(result.amount, 0.4);
  assert.equal(result.heightAmount, 0.4);
  assert.equal(result.segments, 4);
  assert.equal(result.profile, 0.8);
  assert.equal(session.commits.length, 1);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});

test('Face Bevel height drag uses a fresh anchor and Cancel restores the source', async () => {
  const session = makeSession(selectedMesh(cubePositions, cubeFaces, [1]));
  const before = await session.document.serialize();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.toggleActiveDimension(), true);
  modal.pointerMove({ x: 100, y: 80 });
  modal.pointerMove({ x: 150, y: 80 });
  assert.ok(Math.abs(modal.heightAmount - 0.35) < 1e-10);
  assert.equal(modal.amount, 0.25);
  assert.equal(await modal.cancel(), true);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Face Bevel numeric entry rejects values below the actual minimum', async () => {
  const session = makeSession(selectedMesh(cubePositions, cubeFaces, [1]));
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  const beforeAmount = modal.amount;
  for (const key of ['0', '.', '0', '0', '5']) modal.appendNumeric(key);
  assert.equal(modal.amount, beforeAmount);
  assert.equal(modal.numeric, beforeAmount.toFixed(2));
  assert.match(modal.lastError, /0.01 and 0.95/i);
  await modal.cancel();
});

test('Face Bevel modal cancel restores the complete source snapshot without an undo entry', async () => {
  const session = makeSession(selectedMesh(cubePositions, cubeFaces, [1]));
  const before = await session.document.serialize();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.setAmount(0.5), true, modal.lastError);
  assert.notDeepEqual(await session.document.serialize(), before);
  assert.equal(await modal.cancel(), true);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Face Bevel modal Cancel restores the source after segment and profile changes', async () => {
  const session = makeSession(selectedMesh(cubePositions, cubeFaces, [1]));
  const before = await session.document.serialize();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.setSegments(6), true, modal.lastError);
  assert.equal(modal.setProfile(0.1), true, modal.lastError);
  assert.notDeepEqual(await session.document.serialize(), before);
  assert.equal(await modal.cancel(), true);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);
});

test('Face Bevel modal previews, cancels and commits a supported concave region transactionally', async () => {
  const session = makeSession(gridRegion(lRegionCells));
  const before = await session.document.serialize();
  const modal = new BevelModal(session);
  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.lastResult.reflexCorners, 1);
  assert.equal(modal.setAmount(0.2), true, modal.lastError);
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
  assert.equal(await modal.cancel(), true);
  assert.deepEqual(await session.document.serialize(), before);
  assert.equal(session.commits.length, 0);

  assert.equal(await modal.begin(), true, modal.lastError);
  assert.equal(modal.setAmount(0.2), true, modal.lastError);
  const committed = await modal.confirm();
  assert.equal(committed.reflexCorners, 1);
  assert.equal(committed.operation, 'face-region');
  assert.equal(session.commits.length, 1);
  assert.equal(session.commits[0].label, 'Face Bevel');
  assert.equal(session.mesh.userData.hem.validateTopology().valid, true);
});
