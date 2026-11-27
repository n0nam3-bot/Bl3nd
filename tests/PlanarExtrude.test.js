import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';

const keyFor = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

function transformPoint(point) {
  const [x, y, z] = point;
  const rz = 0.47, rx = 0.39, ry = 0.28;
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const afterZ = [cz * x - sz * y, sz * x + cz * y, z];
  const afterX = [afterZ[0], cx * afterZ[1] - sx * afterZ[2], sx * afterZ[1] + cx * afterZ[2]];
  return [cy * afterX[0] + sy * afterX[2] + 2, afterX[1] - 3, -sy * afterX[0] + cy * afterX[2] + 1];
}

function expectedNormal() {
  const origin = transformPoint([0, 0, 0]);
  const tip = transformPoint([0, 0, 1]);
  const vector = tip.map((value, axis) => value - origin[axis]);
  const length = Math.hypot(...vector);
  return vector.map(value => value / length);
}

function makeLRegion({ rotated = false, reverse = false, width = 2, height = 2, selected = [0, 1, 2] } = {}) {
  const positions = [];
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const point = [x, y, 0];
      positions.push(rotated ? transformPoint(point) : point);
    }
  }
  const id = (x, y) => y * (width + 1) + x;
  const faces = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const face = [id(x, y), id(x + 1, y), id(x + 1, y + 1), id(x, y + 1)];
      faces.push(reverse ? face.reverse() : face);
    }
  }
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('face');
  hem.faceSelection = new Set(selected);
  return hem;
}

function snapshot(hem) {
  return JSON.stringify({
    positions: hem.positions,
    faces: hem.faces,
    mode: hem.selectionMode,
    selection: [...hem.faceSelection].sort((a, b) => a - b)
  });
}

test('concave connected face-region Extrude preserves the L boundary and internal seams', () => {
  const hem = makeLRegion();
  assert.equal(hem.validateTopology().valid, true);
  const result = hem.extrudeSelectedRegion(1.25);
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.selectedFaces, 3);
  assert.equal(result.boundaryEdges, 8);
  assert.equal(result.insertedVertices, 8);
  assert.equal(result.createdFaces, 8);
  assert.equal(result.distance, 1.25);
  assert.deepEqual(result.normal, [0, 0, 1]);
  assert.equal(hem.faces.length, 12);
  assert.equal(hem.positions.length, 17);
  assert.deepEqual([...hem.faceSelection].sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(hem.validateTopology().valid, true);

  // The three moved faces must still share their two original interior seams.
  const regionEdges = hem.edges.filter(edge => {
    const adjacent = edge.halfEdges.map(halfEdge => halfEdge.face?.id);
    return adjacent.length === 2 && adjacent.every(faceId => [0, 1, 2].includes(faceId));
  });
  assert.equal(regionEdges.length, 2);
  assert.ok(regionEdges.every(edge => edge.halfEdges.every(halfEdge => halfEdge.twin)));

  // The L-shaped cut has eight boundary edges, so exactly eight side walls are made.
  assert.deepEqual(hem.faces.slice(4).map(face => face.length), Array(8).fill(4));
});

test('connected-region Extrude follows a rotated plane normal in world space', () => {
  const hem = makeLRegion({ rotated: true });
  const original = hem.positions.map(point => [...point]);
  const normal = expectedNormal();
  const distance = 0.8;
  const result = hem.extrudeSelectedRegion(distance);
  assert.equal(result.changed, true, result.reason);
  assert.ok(result.normal.every((value, axis) => Math.abs(value - normal[axis]) < 1e-10));
  assert.ok(Math.abs(result.normal[0]) > 0.1);
  assert.ok(Math.abs(result.normal[1]) > 0.1);
  assert.ok(Math.abs(result.normal[2]) > 0.1);

  // This L region uses original vertices 0..7; extrusion duplicates them once.
  for (let index = 0; index < 8; index++) {
    const moved = hem.positions[original.length + index];
    const delta = moved.map((value, axis) => value - original[index][axis]);
    assert.ok(delta.every((value, axis) => Math.abs(value - normal[axis] * distance) < 1e-9));
  }
  assert.equal(hem.validateTopology().valid, true);
});

test('reversed connected-region winding extrudes along the reversed plane normal', () => {
  const hem = makeLRegion({ reverse: true });
  const original = hem.positions.map(point => [...point]);
  const result = hem.extrudeSelectedRegion(0.6);
  assert.equal(result.changed, true, result.reason);
  assert.deepEqual(result.normal, [0, 0, -1]);
  for (let index = 0; index < 8; index++) {
    assert.deepEqual(hem.positions[original.length + index], [original[index][0], original[index][1], -0.6]);
  }
  assert.equal(hem.validateTopology().valid, true);
});

test('disconnected selected faces reject without mutating positions, faces or selection', () => {
  const hem = makeLRegion({ selected: [0, 3] });
  const before = snapshot(hem);
  const result = hem.extrudeSelectedRegion(1);
  assert.equal(result.changed, false);
  assert.match(result.reason, /connected planar face region/i);
  assert.equal(snapshot(hem), before);
});

test('a selected face region with a hole rejects without source mutation', () => {
  const all = Array.from({ length: 9 }, (_, index) => index).filter(index => index !== 4);
  const hem = makeLRegion({ width: 3, height: 3, selected: all });
  assert.equal(hem.validateTopology().valid, true);
  const before = snapshot(hem);
  const result = hem.extrudeSelectedRegion(1);
  assert.equal(result.changed, false);
  assert.match(result.reason, /single simple boundary and no holes/i);
  assert.equal(snapshot(hem), before);
});

test('invalid Extrude distance or selection mode is rejected non-destructively', () => {
  const hem = makeLRegion();
  const before = snapshot(hem);
  for (const distance of [0, 1e-5, 101, NaN, Infinity]) {
    const result = hem.extrudeSelectedRegion(distance);
    assert.equal(result.changed, false);
    assert.equal(snapshot(hem), before);
  }
  hem.setSelectionMode('edge');
  const edgeModeBefore = snapshot(hem);
  const result = hem.extrudeSelectedRegion(1);
  assert.equal(result.changed, false);
  assert.match(result.reason, /Face Select/i);
  assert.equal(snapshot(hem), edgeModeBefore);
});

test('legacy Extrude entry point remains boolean and uses the validated region implementation', () => {
  const hem = makeLRegion();
  assert.equal(hem.extrudeSelected(1), true);
  assert.equal(hem.validateTopology().valid, true);
  const disconnected = makeLRegion({ selected: [0, 3] });
  const before = snapshot(disconnected);
  assert.equal(disconnected.extrudeSelected(1), false);
  assert.equal(snapshot(disconnected), before);
});
