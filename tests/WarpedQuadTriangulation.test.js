import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';

function makeCube() {
  return new HalfEdgeMesh(
    [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]
  );
}

function rotateTopFaceAroundZ(hem, degrees) {
  const angle = degrees * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  for (const id of [4, 5, 6, 7]) {
    const [x, y, z] = hem.positions[id];
    hem.positions[id] = [cosine * x - sine * y, sine * x + cosine * y, z];
  }
}

test('a rotated cube face keeps its warped neighboring quads renderable', () => {
  const hem = makeCube();
  rotateTopFaceAroundZ(hem, 90);

  // The ordinary dominant-axis projection sees the four side quads as
  // bow-ties at this angle. They are still simple 3D boundaries and must not
  // disappear from the viewport as false openings.
  for (let faceId = 0; faceId < hem.faces.length; faceId++) {
    assert.equal(hem.triangulateFace(faceId).length, 2, `face ${faceId} should render as two triangles`);
  }
  assert.equal(hem.toBufferGeometry().indices.length, 36);
  assert.deepEqual(hem.triangleFaceMap(), [0,0,1,1,2,2,3,3,4,4,5,5]);
});

test('warped quad triangulation preserves welded topology and edge incidence', () => {
  const hem = makeCube();
  rotateTopFaceAroundZ(hem, 90);

  assert.ok(hem.edges.every(edge => edge.halfEdges.length === 2));
  assert.ok(hem.edges.every(edge => edge.halfEdges[0].twin === edge.halfEdges[1]));
  assert.equal(hem.faces.length, 6);
  assert.equal(hem.positions.length, 8);
});

test('a true bow-tie quad whose opposite 3D edges cross remains rejected', () => {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,1,0],[0,1,0],[1,0,0]],
    [[0,1,2,3]]
  );
  assert.deepEqual(hem.triangulateFace(0), []);
  assert.equal(hem.toBufferGeometry().indices.length, 0);
});
