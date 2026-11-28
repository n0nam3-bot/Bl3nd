import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSubdivisionLevel, subdivideCatmullClark } from '../src/modifiers/CatmullClark.js';

const quad = {
  positions: new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0]),
  faces: [[0,1,2,3]]
};

const cube = {
  positions: new Float32Array([
    -1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1,
    -1,-1,1, 1,-1,1, 1,1,1, -1,1,1
  ]),
  faces: [
    [0,3,2,1], [4,5,6,7], [0,1,5,4],
    [3,7,6,2], [0,4,7,3], [1,2,6,5]
  ]
};

function edgeUseCounts(faces) {
  const counts = new Map();
  for (const face of faces) for (let i=0;i<face.length;i++) {
    const a=face[i], b=face[(i+1)%face.length], key=a<b?`${a}:${b}`:`${b}:${a}`;
    counts.set(key,(counts.get(key)||0)+1);
  }
  return [...counts.values()];
}

test('Catmull-Clark builds a candidate without mutating the source cage', () => {
  const positions = new Float32Array(quad.positions);
  const faces = quad.faces.map(face => [...face]);
  subdivideCatmullClark(positions, faces);
  assert.deepEqual([...positions], [...quad.positions]);
  assert.deepEqual(faces, quad.faces);
});

test('Catmull-Clark replaces a quad with four ordered quads and shared edge points', () => {
  const result = subdivideCatmullClark(quad.positions, quad.faces);
  assert.equal(result.positions.length / 3, 9);
  assert.equal(result.faces.length, 4);
  assert.ok(result.faces.every(face => face.length === 4));
  assert.deepEqual(edgeUseCounts(result.faces).filter(count => count === 2).length, 4);
  assert.deepEqual(result.stats, { sourceVertices: 4, sourceFaces: 1, outputVertices: 9, outputFaces: 4 });
});

test('Catmull-Clark smooths a closed cube with manifold shared edges', () => {
  const result = subdivideCatmullClark(cube.positions, cube.faces);
  assert.equal(result.positions.length / 3, 26);
  assert.equal(result.faces.length, 24);
  assert.ok(result.faces.every(face => face.length === 4));
  assert.ok(edgeUseCounts(result.faces).every(count => count === 2));
  assert.ok(Math.abs(result.positions[0] - (-5/9)) < 1e-6);
});

test('Catmull-Clark uses the boundary rule and keeps open edges open', () => {
  const result = subdivideCatmullClark(quad.positions, quad.faces);
  // At the lower-left corner: (6P + the two boundary neighbors) / 8.
  assert.ok(Math.abs(result.positions[0] - 0.125) < 1e-6);
  assert.ok(Math.abs(result.positions[1] - 0.125) < 1e-6);
  const uses = edgeUseCounts(result.faces);
  assert.equal(uses.filter(count => count === 1).length, 8);
  assert.ok(uses.every(count => count === 1 || count === 2));
});

test('Catmull-Clark handles multiple polygon levels without losing shared topology', () => {
  let positions = quad.positions, faces = quad.faces;
  for (let level=0; level<2; level++) {
    const result = subdivideCatmullClark(positions, faces);
    positions = result.positions; faces = result.faces;
  }
  assert.equal(faces.length, 16);
  assert.ok(faces.every(face => face.length === 4));
  assert.ok(edgeUseCounts(faces).every(count => count === 1 || count === 2));
});

test('Catmull-Clark rejects non-manifold edges before returning a candidate', () => {
  const positions = new Float32Array([
    0,0,0, 1,0,0, 0,1,0, 0,-1,0, 0,0,1
  ]);
  const faces = [[0,1,2],[1,0,3],[0,1,4]];
  assert.throws(() => subdivideCatmullClark(positions, faces), /non-manifold/);
});

test('Catmull-Clark rejects inconsistent winding across a shared edge', () => {
  const positions = new Float32Array([0,0,0, 1,0,0, 0,1,0, 1,1,0]);
  assert.throws(() => subdivideCatmullClark(positions, [[0,1,2],[1,2,3]]), /inconsistent face winding/);
});

test('Catmull-Clark rejects disconnected face fans that only touch at one vertex', () => {
  const positions = new Float32Array([
    0,0,0, 1,0,0, 0,1,0, -1,0,0, 0,-1,0
  ]);
  const faces = [[0,1,2],[0,3,4]];
  assert.throws(() => subdivideCatmullClark(positions, faces), /ambiguous boundary|non-manifold or disconnected|disconnected incident/);
});

test('Catmull-Clark rejects malformed polygons and enforces output face budgets', () => {
  assert.throws(() => subdivideCatmullClark(quad.positions, [[0,1,1,3]]), /malformed/);
  assert.throws(() => subdivideCatmullClark(quad.positions, quad.faces, { maxFaces: 3 }), /safety limit/);
});

test('subdivision level input is rounded and capped to one through three', () => {
  assert.equal(clampSubdivisionLevel(0), 1);
  assert.equal(clampSubdivisionLevel(2.6), 3);
  assert.equal(clampSubdivisionLevel(8), 3);
  assert.equal(clampSubdivisionLevel('2'), 2);
  assert.equal(clampSubdivisionLevel('invalid'), 1);
});
