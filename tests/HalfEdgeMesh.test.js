import test from 'node:test';
import assert from 'node:assert/strict';
import { HalfEdgeMesh } from '../src/core/HalfEdgeMesh.js';

const keyFor = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

function makeGrid(width, height, cells = null, liftCenter = 0) {
  const positions = [];
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const z = x === Math.floor(width / 2) && y === Math.floor(height / 2) ? liftCenter : 0;
      positions.push([x, y, z]);
    }
  }
  const id = (x, y) => y * (width + 1) + x;
  const faces = [];
  const selectedCells = cells || Array.from({ length: width * height }, (_, i) => [i % width, Math.floor(i / width)]);
  for (const [x, y] of selectedCells) faces.push([id(x,y), id(x+1,y), id(x+1,y+1), id(x,y+1)]);
  return { hem: new HalfEdgeMesh(positions, faces), id };
}

function triangleArea2D(hem, triangle) {
  const [a,b,c] = triangle.map(id => hem.positions[id]);
  return Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])) * 0.5;
}

test('ear clipping triangulates a concave L polygon without filling the missing corner', () => {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[2,0,0],[2,1,0],[1,1,0],[1,2,0],[0,2,0]],
    [[0,1,2,3,4,5]]
  );
  const triangles = hem.triangulateFace(0);
  assert.equal(triangles.length, 4);
  assert.ok(triangles.every(triangle => {
    const [a,b,c] = triangle.map(id => hem.positions[id]);
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) > 0;
  }));
  assert.equal(triangles.reduce((sum, triangle) => sum + triangleArea2D(hem, triangle), 0), 3);
  assert.equal(hem.toBufferGeometry().indices.length, 12);
  assert.equal(hem.validateTopology().valid, true);
});

test('dissolve merges a connected concave planar patch and preserves triangulation', () => {
  const { hem } = makeGrid(2, 2, [[0,0],[1,0],[0,1]]);
  hem.setSelectionMode('face');
  hem.faceSelection = new Set([0,1,2]);
  assert.equal(hem.dissolveSelected(), true);
  assert.equal(hem.faces.length, 1);
  assert.equal(hem.faces[0].length, 8);
  const triangles = hem.triangulateFace(0);
  assert.equal(triangles.length, 4);
  assert.equal(triangles.reduce((sum, triangle) => sum + triangleArea2D(hem, triangle), 0), 3);
  assert.equal(hem.validateTopology().valid, true);
});

test('dissolve rejects a patch with an off-plane interior vertex and leaves it untouched', () => {
  const { hem } = makeGrid(2, 2, null, 0.2);
  hem.setSelectionMode('face');
  hem.faceSelection = new Set([0,1,2,3]);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  assert.equal(hem.dissolveSelected(), false);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
  assert.equal(hem.validateTopology().counts.nonPlanarFaces > 0, true);
});

test('self-intersecting polygons are diagnosed and are not triangulated', () => {
  const hem = new HalfEdgeMesh([[0,0,0],[2,2,0],[0,2,0],[2,0,0]], [[0,1,2,3]]);
  assert.deepEqual(hem.triangulateFace(0), []);
  const report = hem.validateTopology();
  assert.equal(report.counts.selfIntersectingFaces, 1);
  assert.equal(report.counts.triangulationFailures, 1);
  assert.equal(hem.toBufferGeometry().indices.length, 0);
});

test('edge loop follows opposite edges through a quad strip', () => {
  const { hem, id } = makeGrid(1, 3);
  hem.setSelectionMode('edge');
  const edgesByKey = new Map(hem.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
  const seed = edgesByKey.get(keyFor(id(0,0), id(1,0)));
  hem.selectEdge(seed);
  assert.equal(hem.expandEdgeLoopSelection(), 4);
  const selectedY = [...hem.edgeSelection].map(edgeId => {
    const [a,b] = hem.edges[edgeId].vertices;
    return [hem.positions[a][1], hem.positions[b][1]];
  });
  assert.ok(selectedY.every(([a,b]) => a === b));
  assert.deepEqual(selectedY.map(([a]) => a).sort((a,b)=>a-b), [0,1,2,3]);
});

test('edge ring follows opposite edges through a closed valence-four vertex fan', () => {
  const { hem, id } = makeGrid(2, 2);
  hem.setSelectionMode('edge');
  const edgesByKey = new Map(hem.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
  const seed = edgesByKey.get(keyFor(id(1,1), id(1,0)));
  hem.selectEdge(seed);
  assert.equal(hem.orderedVertexFan(id(1,1))?.length, 4);
  assert.equal(hem.expandEdgeRingSelection(), 2);
  assert.ok([...hem.edgeSelection].every(edgeId => {
    const edge = hem.edges[edgeId];
    return edge.vertices.includes(id(1,1));
  }));
});

test('topology validator reports non-manifold shared edges', () => {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[0,1,0],[0,-1,0],[0,0,1]],
    [[0,1,2],[1,0,3],[0,1,4]]
  );
  const report = hem.validateTopology();
  assert.equal(report.counts.nonManifoldEdges, 1);
  assert.equal(report.valid, false);
});

test('ear clipping preserves reversed face winding', () => {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[2,0,0],[2,1,0],[1,1,0],[1,2,0],[0,2,0]],
    [[5,4,3,2,1,0]]
  );
  const triangles = hem.triangulateFace(0);
  assert.equal(triangles.length, 4);
  assert.ok(triangles.every(triangle => {
    const [a,b,c] = triangle.map(id => hem.positions[id]);
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) < 0;
  }));
  assert.equal(triangles.reduce((sum, triangle) => sum + triangleArea2D(hem, triangle), 0), 3);
});

test('validator reports non-planar faces without mutating mesh data', () => {
  const hem = new HalfEdgeMesh([[0,0,0],[1,0,0],[1,1,0.25],[0,1,0]], [[0,1,2,3]]);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  const report = hem.validateTopology();
  assert.equal(report.counts.nonPlanarFaces, 1);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
});

test('triangle-to-face mapping omits invalid polygons consistently with rendered indices', () => {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[0,1,0],[2,0,0],[4,2,0],[2,2,0],[4,0,0],[5,0,0],[4,1,0]],
    [[0,1,2],[3,4,5,6],[6,7,8]]
  );
  assert.deepEqual(hem.triangleFaceMap(), [0,2]);
  assert.equal(hem.toBufferGeometry().indices.length, 6);
});

test('safe topology repair removes duplicate faces and isolated vertices and fixes winding', () => {
  const positions = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[3,0,0],[3,1,0],[9,9,9]];
  // The second quad shares the edge 1-2 in the same direction as the first.
  const hem = new HalfEdgeMesh(positions, [[0,1,2,3],[1,2,5,4],[0,1,2,3]]);
  const result = hem.repairTopology();
  assert.equal(result.removedDuplicateFaces, 1);
  assert.equal(result.flippedFaces, 1);
  assert.equal(result.removedIsolatedVertices, 1);
  assert.equal(hem.validateTopology().counts.inconsistentWinding, 0);
  assert.equal(hem.validateTopology().counts.duplicateFaces, 0);
  assert.equal(hem.positions.length, 6);
});

test('safe topology repair leaves non-manifold faces untouched', () => {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[0,1,0],[0,-1,0],[0,0,1]],
    [[0,1,2],[1,0,3],[0,1,4]]
  );
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  const result = hem.repairTopology();
  assert.equal(result.skippedNonManifoldComponents, 3);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
  assert.equal(result.remaining.counts.nonManifoldEdges, 1);
});


test('Loop Cut inserts a centered cut through a regular quad strip', () => {
  const { hem, id } = makeGrid(1, 2);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(id(0,0), id(1,0)));
  hem.selectEdge(seed.id);
  const result = hem.cutEdgeLoop();
  assert.equal(result.changed, true);
  assert.equal(result.insertedVertices, 3);
  assert.equal(result.splitFaces, 2);
  assert.equal(result.createdCutEdges, 2);
  assert.equal(result.selectedCutEdges, 2);
  assert.equal(hem.faces.length, 4);
  assert.equal(hem.positions.length, 9);
  assert.equal(hem.faces.every(face => face.length === 4), true);
  assert.equal(hem.validateTopology().valid, true);
  assert.equal([...hem.edgeSelection].length, 2);
});

test('Loop Cut interpolates the requested offset along the edge loop', () => {
  const { hem, id } = makeGrid(1, 1);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(id(0,0), id(1,0)));
  hem.selectEdge(seed.id);
  const result = hem.cutEdgeLoop({ offset: 0.25 });
  assert.equal(result.changed, true);
  const inserted = hem.positions.slice(4);
  assert.deepEqual(inserted.map(point => point[0]), [0.25, 0.25]);
  assert.deepEqual(inserted.map(point => point[1]).sort((a,b)=>a-b), [0,1]);
  assert.equal(hem.validateTopology().valid, true);
});

test('Loop Cut rejects a loop that reaches a non-quad face without mutating topology', () => {
  const positions = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,2,0],[1,2,0]];
  const hem = new HalfEdgeMesh(positions, [[0,1,2,3],[3,2,5,4,0]]);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(0,1));
  hem.selectEdge(seed.id);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  const result = hem.cutEdgeLoop();
  assert.equal(result.changed, false);
  assert.match(result.reason, /quad|boundary/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
});

test('Loop Cut rejects zero or out-of-range interpolation without changing mesh', () => {
  const { hem, id } = makeGrid(1, 1);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(id(0,0), id(1,0)));
  hem.selectEdge(seed.id);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  const result = hem.cutEdgeLoop({ offset: 1 });
  assert.equal(result.changed, false);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
});


test('Loop Cut wraps a closed quad loop without creating boundary or non-manifold edges', () => {
  const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const faces = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(0,1));
  hem.selectEdge(seed.id);
  const result = hem.cutEdgeLoop();
  assert.equal(result.changed, true);
  assert.equal(result.insertedVertices, 4);
  assert.equal(result.splitFaces, 4);
  assert.equal(hem.validateTopology().valid, true);
  assert.equal(hem.validateTopology().counts.boundaryEdges, 0);
  assert.equal(hem.faces.length, 10);
});

test('Loop Cut rejects inconsistent winding before changing the mesh', () => {
  const positions = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,2,0],[1,2,0]];
  const hem = new HalfEdgeMesh(positions, [[0,1,2,3],[2,3,4,5]]);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(0,1));
  hem.selectEdge(seed.id);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  const result = hem.cutEdgeLoop();
  assert.equal(result.changed, false);
  assert.match(result.reason, /winding/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
});

test('Loop Cut rejects non-planar quads before changing the mesh', () => {
  const hem = new HalfEdgeMesh([[0,0,0],[1,0,0],[1,1,0.2],[0,1,0]], [[0,1,2,3]]);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(0,1));
  hem.selectEdge(seed.id);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  const result = hem.cutEdgeLoop();
  assert.equal(result.changed, false);
  assert.match(result.reason, /planar/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
});


test('Loop Cut carries offset orientation across edges with reordered vertex IDs', () => {
  const hem = new HalfEdgeMesh([[1,0,0],[0,0,0],[0,1,0],[1,1,0]], [[0,1,2,3]]);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(0,1));
  hem.selectEdge(seed.id);
  const result = hem.cutEdgeLoop({ offset: 0.25 });
  assert.equal(result.changed, true);
  const inserted = hem.positions.slice(4);
  assert.deepEqual(inserted.map(point => point[0]), [0.75, 0.75]);
  assert.equal(hem.validateTopology().valid, true);
});

test('Multiple Loop Cuts split each crossed quad into correctly wound evenly spaced strips', () => {
  const { hem, id } = makeGrid(1, 1);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(id(0,0), id(1,0)));
  hem.selectEdge(seed.id);
  const result = hem.cutEdgeLoop({ cuts: 3 });
  assert.equal(result.changed, true);
  assert.equal(result.cuts, 3);
  assert.deepEqual(result.offsets, [0.25, 0.5, 0.75]);
  assert.equal(result.insertedVertices, 6);
  assert.equal(result.splitFaces, 1);
  assert.equal(result.createdFaces, 4);
  assert.equal(result.createdCutEdges, 3);
  assert.equal(hem.faces.length, 4);
  assert.equal(hem.edgeSelection.size, 3);
  assert.deepEqual(hem.positions.slice(4, 7).map(point => point[0]), [0.25, 0.5, 0.75]);
  assert.deepEqual(hem.positions.slice(7).map(point => point[0]).sort((a,b)=>a-b), [0.25, 0.5, 0.75]);
  assert.equal(hem.validateTopology().valid, true);
});

test('Multiple Loop Cuts preserve a closed cube manifold without boundary or winding errors', () => {
  const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const faces = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(0,1));
  hem.selectEdge(seed.id);
  const result = hem.cutEdgeLoop({ cuts: 2, offset: 0.6 });
  assert.equal(result.changed, true);
  assert.ok(Math.abs(result.offsets[0] - (1/3 + 0.1)) < 1e-10);
  assert.ok(Math.abs(result.offsets[1] - (2/3 + 0.1)) < 1e-10);
  assert.equal(result.insertedVertices, 8);
  assert.equal(result.splitFaces, 4);
  assert.equal(result.createdFaces, 12);
  assert.equal(hem.faces.length, 14);
  assert.equal(hem.edgeSelection.size, 8);
  const report = hem.validateTopology();
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
  assert.equal(report.counts.nonManifoldEdges, 0);
  assert.equal(report.counts.inconsistentWinding, 0);
});

test('Multiple Loop Cuts reject excessive counts and too-close parameters transactionally', () => {
  const { hem, id } = makeGrid(1, 1);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(id(0,0), id(1,0)));
  hem.selectEdge(seed.id);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  assert.equal(hem.cutEdgeLoop({ cuts: 9 }).changed, false);
  assert.equal(hem.cutEdgeLoop({ cuts: 2, offsets: [0.5, 0.500001] }).changed, false);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
});

function makeExtraordinaryFan(angles, triangleFaceIndex = -1) {
  const positions = [[0,0,0]], ring = [];
  for (const angle of angles) {
    const radians = angle * Math.PI / 180;
    ring.push(positions.length);
    positions.push([Math.cos(radians), Math.sin(radians), 0]);
  }
  const faces = [];
  for (let i = 0; i < ring.length; i++) {
    const next = (i + 1) % ring.length;
    const midpoint = (angles[i] + (i === ring.length - 1 ? angles[0] + 360 : angles[next])) * 0.5;
    const radians = midpoint * Math.PI / 180;
    const outer = positions.length;
    positions.push([2 * Math.cos(radians), 2 * Math.sin(radians), 0]);
    faces.push(i === triangleFaceIndex ? [0, ring[i], ring[next]] : [0, ring[i], outer, ring[next]]);
  }
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => edge.vertices.includes(0) && edge.vertices.includes(ring[0]));
  hem.selectEdge(seed.id);
  return { hem, center: 0, ring, seed };
}

test('edge ring crosses an extraordinary valence-six pole only through a unique near-opposite edge', () => {
  const { hem, center, ring } = makeExtraordinaryFan([0,60,120,180,240,300]);
  assert.equal(hem.orderedVertexFan(center)?.length, 6);
  assert.equal(hem.expandEdgeRingSelection(), 2);
  const selected = [...hem.edgeSelection].map(id => hem.edges[id].vertices);
  assert.ok(selected.some(vertices => vertices.includes(center) && vertices.includes(ring[0])));
  assert.ok(selected.some(vertices => vertices.includes(center) && vertices.includes(ring[3])));
  assert.equal(hem.lastRingTraversal.extraordinaryVertices, 1);
});

test('edge ring stops at an extraordinary pole when no edge is sufficiently opposite', () => {
  const { hem, center } = makeExtraordinaryFan([0,72,144,216,288]);
  assert.equal(hem.orderedVertexFan(center)?.length, 5);
  assert.equal(hem.expandEdgeRingSelection(), 1);
  assert.equal(hem.lastRingTraversal.ambiguousPoles, 1);
});

test('edge ring stops when an extraordinary pole has tied opposite candidates', () => {
  const { hem, center } = makeExtraordinaryFan([0,160,200,240,280,320]);
  assert.equal(hem.orderedVertexFan(center)?.length, 6);
  assert.equal(hem.expandEdgeRingSelection(), 1);
  assert.equal(hem.lastRingTraversal.ambiguousPoles, 1);
});

test('edge ring refuses extraordinary fans containing non-quad faces', () => {
  const { hem, center } = makeExtraordinaryFan([0,60,120,180,240,300], 2);
  assert.equal(hem.orderedVertexFan(center)?.length, 6);
  assert.equal(hem.expandEdgeRingSelection(), 1);
  assert.equal(hem.lastRingTraversal.ambiguousPoles, 0);
  assert.ok(hem.lastRingTraversal.stoppedFans >= 1);
});

function makeCube() {
  const positions = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
  ];
  const faces = [
    [0,3,2,1], [4,5,6,7], [0,1,5,4],
    [1,2,6,5], [2,3,7,6], [3,0,4,7]
  ];
  return new HalfEdgeMesh(positions, faces);
}

test('Bevel trims a closed cube-like tri-valent edge neighborhood and keeps topology valid', () => {
  const hem = makeCube();
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(4,5));
  hem.selectEdge(seed.id);
  const result = hem.bevelSelectedEdge({ amount: 0.25 });
  assert.equal(result.changed, true);
  assert.equal(result.insertedVertices, 4);
  assert.equal(result.createdFaces, 1);
  assert.equal(result.selectedEdges, 4);
  assert.equal(hem.positions.length, 10);
  assert.equal(hem.faces.length, 7);
  assert.equal(hem.validateTopology().valid, true);
  assert.equal(hem.validateTopology().counts.boundaryEdges, 0);
  assert.equal(hem.edgeSelection.size, 4);
});

test('Bevel succeeds on every cube edge with manifold topology preserved', () => {
  const positions = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
  ];
  const faces = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const seedMesh = new HalfEdgeMesh(positions, faces);
  const edgeKeys = seedMesh.edges.map(edge => keyFor(...edge.vertices));
  for (const edgeKey of edgeKeys) {
    const hem = new HalfEdgeMesh(positions, faces);
    hem.setSelectionMode('edge');
    hem.selectEdge(hem.edges.find(edge => keyFor(...edge.vertices) === edgeKey).id);
    const result = hem.bevelSelectedEdge({ amount: 0.95 });
    assert.equal(result.changed, true, `expected cube edge ${edgeKey} to bevel`);
    assert.equal(hem.validateTopology().valid, true, `expected cube edge ${edgeKey} to remain manifold`);
  }
});

test('Bevel uses a bounded distance along the four neighboring edges', () => {
  const hem = makeCube();
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(4,5));
  hem.selectEdge(seed.id);
  const result = hem.bevelSelectedEdge({ amount: 0.5 });
  assert.equal(result.changed, true);
  assert.ok(Math.abs(result.width - 0.45) < 1e-10);
  const expected = [[-1,-0.55,1],[1,-0.55,1],[1,-1,0.55],[-1,-1,0.55]];
  for (const point of expected) {
    assert.ok(hem.positions.some(candidate => candidate.every((value, axis) => Math.abs(value - point[axis]) < 1e-10)));
  }
});

test('Bevel rejects a boundary edge without modifying the source mesh', () => {
  const { hem } = makeGrid(1,1);
  hem.setSelectionMode('edge');
  hem.selectEdge(hem.edges[0].id);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  const result = hem.bevelSelectedEdge({ amount: 0.25 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /closed interior manifold edge|boundary/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
});

test('Bevel rejects extraordinary endpoint fans without modifying the source mesh', () => {
  const hem = new HalfEdgeMesh(
    [[0,0,1],[0,0,-1],[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]],
    [[0,2,3],[0,3,4],[0,4,5],[0,5,2],[1,3,2],[1,4,3],[1,5,4],[1,2,5]]
  );
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(0,2));
  hem.selectEdge(seed.id);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  const result = hem.bevelSelectedEdge({ amount: 0.25 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /valence-three|three-face/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
});

test('Bevel rejects non-manifold edges without modifying the source mesh', () => {
  const hem = new HalfEdgeMesh(
    [[0,0,0],[1,0,0],[0,1,0],[0,-1,0],[0,0,1]],
    [[0,1,2],[1,0,3],[0,1,4]]
  );
  hem.setSelectionMode('edge');
  const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(0,1));
  hem.selectEdge(seed.id);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  const result = hem.bevelSelectedEdge({ amount: 0.25 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /manifold/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
});

test('Bevel rejects a zero or out-of-range width without changing the source mesh', () => {
  for (const amount of [0, -0.1, 0.96, Number.NaN]) {
    const hem = makeCube();
    hem.setSelectionMode('edge');
    hem.selectEdge(hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(4,5)).id);
    const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
    assert.equal(hem.bevelSelectedEdge({ amount }).changed, false);
    assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
  }
});
