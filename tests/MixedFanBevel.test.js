import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';

function makeMixedValenceChainFixture({ terminalValence = 4, internalValence = 4 } = {}) {
  const positions = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[0,0,1],[0,0,-1]
  ];
  const faces = [
    [0,3,9],[3,2,9],[2,1,9],[1,0,9],
    [0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],
    [4,5,8],[5,6,8],[6,7,8],[7,4,8]
  ];
  const splitTriangle = faceKey => {
    const faceIndex = faces.findIndex(face => face.join(',') === faceKey);
    assert.notEqual(faceIndex, -1, `fixture triangle ${faceKey} exists`);
    const [a,b,c] = faces[faceIndex];
    const centerId = positions.push([0,1,2].map(axis =>
      (positions[a][axis] + positions[b][axis] + positions[c][axis]) / 3
    )) - 1;
    faces.splice(faceIndex, 1, [a,b,centerId], [b,c,centerId], [c,a,centerId]);
  };

  // Raise both terminal path fans from valence four to five independently.
  // Splitting their shared bottom triangle then raises both to valence six.
  if (terminalValence >= 5) {
    splitTriangle('0,3,9');
    splitTriangle('2,1,9');
  }
  if (terminalValence >= 6) splitTriangle('1,0,9');

  // Raise both internal path fans from four to five using separate triangles;
  // splitting their shared triangle raises both internal fans to six.
  if (internalValence >= 5) {
    splitTriangle('7,4,8');
    splitTriangle('5,6,8');
  }
  if (internalValence >= 6) splitTriangle('4,5,8');

  return new HalfEdgeMesh(positions, faces);
}

function selectVertexPath(hem, path) {
  hem.setSelectionMode('edge');
  for (let index = 0; index < path.length - 1; index++) {
    const edge = hem.edges.find(item =>
      item.vertices.includes(path[index]) && item.vertices.includes(path[index + 1])
    );
    assert.ok(edge, `missing path edge ${path[index]}-${path[index + 1]}`);
    hem.selectEdge(edge.id, index > 0);
  }
}

function rotateMixedFanFixture(hem) {
  const angle = 0.37, tilt = 0.61;
  const c = Math.cos(angle), s = Math.sin(angle);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  hem.positions = hem.positions.map(([x,y,z]) => {
    const rx = c*x - s*y, ry = s*x + c*y;
    return [rx, ct*ry - st*z, st*ry + ct*z];
  });
  hem.rebuild();
}

test('Connected Bevel covers every mixed terminal/internal valence pairing in rotated geometry', () => {
  let checked = 0;
  for (const terminalValence of [4,5,6]) {
    for (const internalValence of [4,5,6]) {
      for (const segments of [1,4,8]) {
        const hem = makeMixedValenceChainFixture({ terminalValence, internalValence });
        assert.equal(hem.validateTopology().valid, true);
        rotateMixedFanFixture(hem);
        const path = segments === 4 ? [1,5,4,0] : [0,4,5,1];
        assert.deepEqual(path.map(vertexId => hem.orderedVertexFan(vertexId)?.length),
          [terminalValence, internalValence, internalValence, terminalValence]);
        selectVertexPath(hem, path);
        const profile = segments === 4 ? 0 : segments === 8 ? 1 : 0.5;
        const result = hem.bevelSelectedEdges({ amount: 0.22, segments, profile });
        const report = hem.validateTopology();
        assert.equal(result.changed, true,
          `terminal ${terminalValence}, internal ${internalValence}, segments ${segments}: ${result.reason}`);
        assert.equal(result.maxChainValence, Math.max(terminalValence, internalValence));
        assert.equal(result.profileScale, Math.max(terminalValence, internalValence) > 4 ? 0.25 : 1);
        assert.equal(result.segments, segments);
        assert.equal(result.endCaps, 2);
        assert.ok(result.capPatches >= 4);
        assert.equal(report.valid, true);
        assert.equal(report.counts.boundaryEdges, 0);
        assert.equal(report.counts.nonManifoldEdges, 0);
        assert.equal(report.counts.inconsistentWinding, 0);
        assert.ok(hem.edges.every(edge => edge.halfEdges.length === 2));
        checked++;
      }
    }
  }
  assert.equal(checked, 27);
});

test('Connected Bevel rejects skewed mixed-fan candidates without mutating any supported valence pairing', () => {
  let checked = 0;
  for (const terminalValence of [4,5,6]) {
    for (const internalValence of [4,5,6]) {
      const hem = makeMixedValenceChainFixture({ terminalValence, internalValence });
      hem.positions = hem.positions.map(([x,y,z]) => [
        2*x + 0.3*y + 0.1*z,
        0.2*x + 1.7*y + 0.15*z,
        0.1*x + 0.25*y + 1.3*z
      ]);
      hem.rebuild();
      assert.equal(hem.validateTopology().valid, true);
      selectVertexPath(hem, [0,4,5,1]);
      const before = JSON.stringify({
        positions: hem.positions,
        faces: hem.faces,
        edgeSelection: [...hem.edgeSelection]
      });
      const result = hem.bevelSelectedEdges({ amount: 0.22, segments: 4, profile: 0.7 });
      const after = JSON.stringify({
        positions: hem.positions,
        faces: hem.faces,
        edgeSelection: [...hem.edgeSelection]
      });
      assert.equal(result.changed, false,
        `skewed terminal ${terminalValence}, internal ${internalValence} candidate must reject`);
      assert.match(result.reason, /topology validation/i);
      assert.equal(after, before, 'a rejected skewed candidate must preserve the complete source mesh and selection');
      checked++;
    }
  }
  assert.equal(checked, 9);
});
