import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MIRROR_MERGE_DISTANCE,
  clampMirrorMergeDistance,
  mirrorGeometry,
  normalizeMirrorAxis
} from '../src/modifiers/MirrorGeometry.js';

const seamTriangle = {
  positions: new Float32Array([0,0,0, 0,1,0, 1,0,0]),
  indices: new Uint32Array([0,1,2])
};

function edgeDirections(indices, a, b) {
  let forward = 0, reverse = 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const face = [indices[i], indices[i + 1], indices[i + 2]];
    for (let corner = 0; corner < 3; corner++) {
      const from = face[corner], to = face[(corner + 1) % 3];
      if (from === a && to === b) forward++;
      if (from === b && to === a) reverse++;
    }
  }
  return { forward, reverse };
}

test('Mirror reflects a half-surface and shares exact center-plane seam indices', () => {
  const sourcePositions = new Float32Array(seamTriangle.positions);
  const sourceIndices = new Uint32Array(seamTriangle.indices);
  const result = mirrorGeometry(seamTriangle.positions, seamTriangle.indices, { axis: 'x', mergeDistance: 0 });

  assert.equal(result.positions.length / 3, 4);
  assert.deepEqual([...result.indices], [0, 1, 2, 0, 3, 1]);
  assert.deepEqual([...result.positions.slice(9, 12)], [-1, 0, 0]);
  assert.deepEqual(edgeDirections(result.indices, 0, 1), { forward: 1, reverse: 1 });
  assert.deepEqual([...seamTriangle.positions], [...sourcePositions]);
  assert.deepEqual([...seamTriangle.indices], [...sourceIndices]);
  assert.deepEqual(result.stats, {
    axis: 'x', mergeDistance: 0, bisect: false, bisectFlip: false,
    bisectedIntersectionVertices: 0, mergedCenterVertices: 2, mirroredVertices: 1,
    mirroredTriangles: 1, skippedCenterPlaneTriangles: 0, skippedCollapsedTriangles: 0
  });
});


test('Mirror Bisect turns a complete centered cube into one clean reflected result', () => {
  const positions = new Float32Array([
    -1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1,
    -1,-1,1, 1,-1,1, 1,1,1, -1,1,1
  ]);
  const quads = [
    [0,3,2,1], [4,5,6,7], [0,1,5,4],
    [3,7,6,2], [1,2,6,5], [0,4,7,3]
  ];
  const indices = [];
  for (const face of quads) {
    for (let corner = 1; corner < face.length - 1; corner++) indices.push(face[0], face[corner], face[corner + 1]);
  }
  const result = mirrorGeometry(positions, new Uint32Array(indices), {
    axis: 'x', mergeDistance: 0.001, bisect: true
  });
  const edgeUses = new Map();
  for (let i = 0; i < result.indices.length; i += 3) {
    const tri = [result.indices[i], result.indices[i + 1], result.indices[i + 2]];
    for (let corner = 0; corner < 3; corner++) {
      const a = tri[corner], b = tri[(corner + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUses.set(key, (edgeUses.get(key) || 0) + 1);
    }
  }
  const coordinates = [...result.positions];
  assert.equal(result.stats.bisect, true);
  assert.ok(result.stats.bisectedIntersectionVertices >= 4);
  assert.ok(coordinates.some((value, index) => index % 3 === 0 && value === -1));
  assert.ok(coordinates.some((value, index) => index % 3 === 0 && value === 1));
  assert.ok(coordinates.every(Number.isFinite));
  assert.ok([...edgeUses.values()].every(count => count === 2), 'the bisected mirrored cube closes every surface and seam edge');
  assert.deepEqual([...positions], [
    -1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1,
    -1,-1,1, 1,-1,1, 1,1,1, -1,1,1
  ], 'editable source positions remain unchanged');
});

test('Mirror Bisect can retain the negative side when Flip Side is enabled', () => {
  const positions = new Float32Array([-1,0,0, -1,1,0, -0.5,0,1]);
  const indices = new Uint32Array([0,1,2]);
  assert.throws(() => mirrorGeometry(positions, indices, { axis: 'x', bisect: true }), /selected bisect side contains no surface/);
  const result = mirrorGeometry(positions, indices, { axis: 'x', bisect: true, bisectFlip: true, mergeDistance: 0 });
  assert.ok([...result.positions].some((value, index) => index % 3 === 0 && value === 1));
  assert.ok([...result.positions].every(Number.isFinite));
  assert.equal(result.stats.bisectFlip, true);
});

test('Mirror snaps near-plane vertices only in the evaluated copy and honours merge distance', () => {
  const positions = new Float32Array([0.0005,0,0, 0.5,1,0, 0.5,0,0]);
  const indices = new Uint32Array([0,1,2]);
  const merged = mirrorGeometry(positions, indices, { axis: 'x', mergeDistance: 0.001 });
  const separate = mirrorGeometry(positions, indices, { axis: 'x', mergeDistance: 0 });

  assert.equal(merged.positions[0], 0);
  assert.equal(merged.positions.length / 3, 5);
  assert.equal(merged.stats.mergedCenterVertices, 1);
  assert.equal(merged.stats.mirroredVertices, 2);
  assert.equal(separate.positions.length / 3, 6);
  assert.equal(separate.stats.mergedCenterVertices, 0);
  assert.ok(Math.abs(positions[0] - 0.0005) < 1e-9, 'editable source buffer remains unchanged');
});

test('Mirror does not generate duplicate triangles that lie wholly on the center plane', () => {
  const positions = new Float32Array([0,0,0, 0,1,0, 0,1,1]);
  const indices = new Uint32Array([0,1,2]);
  const result = mirrorGeometry(positions, indices, { axis: 'x', mergeDistance: 0.001 });
  assert.equal(result.positions.length / 3, 3);
  assert.deepEqual([...result.indices], [0,1,2]);
  assert.equal(result.stats.skippedCenterPlaneTriangles, 1);
  assert.equal(result.stats.mirroredTriangles, 0);
});

test('Mirror supports each local axis and reverses reflected triangle winding', () => {
  for (const axis of ['x', 'y', 'z']) {
    const axisIndex = { x: 0, y: 1, z: 2 }[axis];
    const seamAxis = (axisIndex + 1) % 3;
    const pointA = [0, 0, 0];
    const pointB = [0, 0, 0]; pointB[seamAxis] = 1;
    const pointC = [0, 0, 0]; pointC[axisIndex] = 1;
    const positions = new Float32Array([...pointA, ...pointB, ...pointC]);
    const result = mirrorGeometry(positions, new Uint32Array([0,1,2]), { axis, mergeDistance: 0 });
    assert.equal(result.positions.length / 3, 4);
    assert.equal(result.stats.axis, axis);
    assert.equal(result.positions[9 + axisIndex], -1);
    assert.deepEqual(edgeDirections(result.indices, 0, 1), { forward: 1, reverse: 1 });
  }
});

test('Mirror normalizes axis and safely clamps merge-distance input', () => {
  assert.equal(DEFAULT_MIRROR_MERGE_DISTANCE, 0.001);
  assert.equal(normalizeMirrorAxis('invalid'), 'x');
  assert.equal(normalizeMirrorAxis('z'), 'z');
  assert.equal(clampMirrorMergeDistance(undefined), 0.001);
  assert.equal(clampMirrorMergeDistance('0.02'), 0.02);
  assert.equal(clampMirrorMergeDistance(-1), 0);
  assert.equal(clampMirrorMergeDistance(4), 1);
  assert.equal(clampMirrorMergeDistance('bad'), 0.001);
});

test('Mirror rejects malformed index buffers and non-finite positions', () => {
  assert.throws(() => mirrorGeometry(seamTriangle.positions, [0, 1], { axis: 'x' }), /triangle index buffer/);
  assert.throws(() => mirrorGeometry(seamTriangle.positions, [0, 1, 99], { axis: 'x' }), /missing vertex/);
  assert.throws(() => mirrorGeometry([0, 0, NaN], [0, 0, 0], { axis: 'x' }), /non-finite/);
});

test('Mirror closes a one-sided cube surface with exactly two uses per seam edge', () => {
  const positions = new Float32Array([
    0,-1,-1, 1,-1,-1, 1,1,-1, 0,1,-1,
    0,-1,1, 1,-1,1, 1,1,1, 0,1,1
  ]);
  const quads = [
    [0,3,2,1], [4,5,6,7], [0,1,5,4],
    [3,7,6,2], [1,2,6,5]
  ];
  const indices = [];
  for (const face of quads) {
    for (let corner = 1; corner < face.length - 1; corner++) {
      indices.push(face[0], face[corner], face[corner + 1]);
    }
  }

  const result = mirrorGeometry(positions, new Uint32Array(indices), { axis: 'x', mergeDistance: 0.001 });
  const edgeUses = new Map();
  for (let i = 0; i < result.indices.length; i += 3) {
    const tri = [result.indices[i], result.indices[i + 1], result.indices[i + 2]];
    for (let corner = 0; corner < 3; corner++) {
      const a = tri[corner], b = tri[(corner + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUses.set(key, (edgeUses.get(key) || 0) + 1);
    }
  }
  assert.equal(result.positions.length / 3, 12);
  assert.equal(result.indices.length / 3, 20);
  assert.ok([...edgeUses.values()].every(count => count === 2), 'the mirrored shell has no boundary or doubled seam edge');
});
