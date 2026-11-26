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

function makeValenceFourChainFixture() {
  const positions = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[0,0,1]
  ];
  // Split only the top cube face around one center vertex. The four top
  // corners become closed valence-four fans; the lower corners remain tri-valent.
  const faces = [
    [0,3,2,1], [0,1,5,4], [1,2,6,5], [2,3,7,6], [3,0,4,7],
    [4,5,8], [5,6,8], [6,7,8], [7,4,8]
  ];
  return new HalfEdgeMesh(positions, faces);
}

function makeValenceFiveSixChainFixture(targetValence = 5) {
  const positions = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[0,0,1]
  ];
  const faces = [
    [0,3,2,1], [0,1,5,4], [1,2,6,5], [2,3,7,6], [3,0,4,7],
    [4,5,8], [5,6,8], [6,7,8], [7,4,8]
  ];
  const splitFace = (faceKey, center) => {
    const faceIndex = faces.findIndex(face => face.join(',') === faceKey);
    assert.notEqual(faceIndex, -1, `fixture face ${faceKey} exists`);
    const [a,b,c] = faces[faceIndex];
    const centerId = positions.push(center) - 1;
    faces.splice(faceIndex, 1, [a,b,centerId], [b,c,centerId], [c,a,centerId]);
    return centerId;
  };
  // Splitting the opposite cap-side triangle increases both selected
  // internal vertices from valence four to five without changing endpoints.
  const firstCenter = splitFace('4,5,8', [0,-2/3,1]);
  if (targetValence >= 6) splitFace('5,6,8', [2/3,0,1]);
  if (targetValence >= 7) {
    const faceKey = `5,8,${firstCenter}`;
    const faceIndex = faces.findIndex(face => face.join(',') === faceKey);
    assert.notEqual(faceIndex, -1);
    const [a,b,c] = faces[faceIndex];
    const center = [0,1,2].map(axis => (positions[a][axis] + positions[b][axis] + positions[c][axis]) / 3);
    const centerId = positions.push(center) - 1;
    faces.splice(faceIndex, 1, [a,b,centerId], [b,c,centerId], [c,a,centerId]);
  }
  return new HalfEdgeMesh(positions, faces);
}

function selectVertexPath(hem, path) {
  hem.setSelectionMode('edge');
  for (let index = 0; index < path.length - 1; index++) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(path[index], path[index + 1]));
    assert.ok(edge, `missing path edge ${path[index]}-${path[index + 1]}`);
    hem.selectEdge(edge.id, index > 0);
  }
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


test('Multi-edge Bevel applies to separated closed neighborhoods as one topology transaction', () => {
  const positions = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
    [4,-1,-1],[6,-1,-1],[6,1,-1],[4,1,-1],[4,-1,1],[6,-1,1],[6,1,1],[4,1,1]
  ];
  const cubeFaces = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const faces = [...cubeFaces, ...cubeFaces.map(face => face.map(id => id + 8))];
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('edge');
  for (const pair of [[4,5],[12,13]]) {
    const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(...pair));
    assert.ok(seed);
    hem.selectEdge(seed.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.25 });
  assert.equal(result.changed, true);
  assert.equal(result.bevelCount, 2);
  assert.equal(result.insertedVertices, 8);
  assert.equal(result.createdFaces, 2);
  assert.equal(result.selectedEdges, 8);
  assert.equal(hem.faces.length, 14);
  assert.equal(hem.validateTopology().valid, true);
  assert.equal(hem.edgeSelection.size, 8);
});

test('Connected Bevel miters two adjacent edges at one tri-valent corner', () => {
  const hem = makeCube();
  hem.setSelectionMode('edge');
  for (const pair of [[4,5],[5,6]]) {
    const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(...pair));
    assert.ok(seed);
    hem.selectEdge(seed.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.25 });
  const report = hem.validateTopology();
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.bevelCount, 2);
  assert.equal(result.insertedVertices, 6);
  assert.equal(result.createdFaces, 2);
  assert.equal(result.miterEdges, 1);
  assert.equal(result.selectedEdges, 6);
  assert.equal(hem.positions.length, 11);
  assert.equal(hem.faces.length, 8);
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
  assert.equal(hem.edgeSelection.size, 6);
});

test('Connected Bevel preserves topology for every adjacent pair at every cube corner', () => {
  const vertexPositions = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
  ];
  let cases = 0;
  for (let center = 0; center < vertexPositions.length; center++) {
    const topology = makeCube();
    const neighbors = topology.edges
      .filter(edge => edge.vertices.includes(center))
      .map(edge => edge.vertices.find(id => id !== center));
    for (let a = 0; a < neighbors.length; a++) {
      for (let b = a + 1; b < neighbors.length; b++) {
        const hem = makeCube();
        hem.setSelectionMode('edge');
        for (const neighbor of [neighbors[a], neighbors[b]]) {
          const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(center, neighbor));
          assert.ok(edge);
          hem.selectEdge(edge.id, true);
        }
        const result = hem.bevelSelectedEdges({ amount: 0.25 });
        assert.equal(result.changed, true, `corner ${center}, neighbors ${neighbors[a]} and ${neighbors[b]}: ${result.reason}`);
        assert.equal(hem.validateTopology().valid, true);
        assert.equal(hem.validateTopology().counts.boundaryEdges, 0);
        assert.equal(hem.edgeSelection.size, 6);
        cases++;
      }
    }
  }
  assert.equal(cases, 24);
});

test('Connected Bevel supports skewed planar geometry without axis-aligned assumptions', () => {
  const source = makeCube();
  const positions = source.positions.map(([x,y,z]) => [
    2*x + 0.3*y + 0.1*z,
    0.2*x + 1.7*y + 0.15*z,
    0.1*x + 0.25*y + 1.3*z
  ]);
  const hem = new HalfEdgeMesh(positions, source.faces);
  hem.setSelectionMode('edge');
  for (const pair of [[0,1],[0,3]]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(...pair));
    assert.ok(edge);
    hem.selectEdge(edge.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.3 });
  assert.equal(result.changed, true, result.reason);
  assert.equal(hem.validateTopology().valid, true);
  assert.equal(hem.validateTopology().counts.boundaryEdges, 0);
});

test('Connected Bevel rejects branches and mixed connected components without mutating the mesh', () => {
  const selections = [
    [[4,5],[5,6],[5,1]], // branch at vertex 5
    [[4,5],[5,6],[6,7],[7,4]], // closed cycle
    [[4,5],[5,6],[6,7],[7,3],[0,1]] // a chain mixed with a disconnected edge
  ];
  for (const selection of selections) {
    const hem = makeCube();
    hem.setSelectionMode('edge');
    for (const pair of selection) {
      const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(...pair));
      assert.ok(edge);
      hem.selectEdge(edge.id, true);
    }
    const before = JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] });
    const result = hem.bevelSelectedEdges({ amount: 0.25 });
    assert.equal(result.changed, false);
    assert.match(result.reason, /simple path|cycle|branch|mixed components|separate two-edge/i);
    assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] }), before);
  }
});

test('Multi-edge Bevel rejects separated edges whose corner neighborhoods share faces', () => {
  const hem = makeCube();
  hem.setSelectionMode('edge');
  for (const pair of [[4,5],[6,7]]) {
    const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(...pair));
    hem.selectEdge(seed.id, true);
  }
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces });
  const result = hem.bevelSelectedEdges({ amount: 0.25 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /share a face|contiguous-edge/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces }), before);
});


test('Connected Bevel applies up to four independent miter junctions in one topology transaction', () => {
  const basePositions = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
  ];
  const baseFaces = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const positions = [], faces = [];
  for (let component = 0; component < 4; component++) {
    const offset = positions.length;
    positions.push(...basePositions.map(([x,y,z]) => [x + component * 4,y,z]));
    faces.push(...baseFaces.map(face => face.map(id => id + offset)));
  }
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('edge');
  for (let component = 0; component < 4; component++) {
    const offset = component * 8;
    for (const pair of [[4,5],[5,6]]) {
      const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(pair[0] + offset,pair[1] + offset));
      assert.ok(edge);
      hem.selectEdge(edge.id, true);
    }
  }
  const result = hem.bevelSelectedEdges({ amount: 0.3 });
  const report = hem.validateTopology();
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.bevelCount, 8);
  assert.equal(result.miterCount, 4);
  assert.equal(result.miterEdges, 4);
  assert.equal(result.createdFaces, 8);
  assert.equal(result.selectedEdges, 24);
  assert.equal(hem.faces.length, 32);
  assert.equal(hem.edgeSelection.size, 24);
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
});

test('Connected Bevel rejects separate miter pairs whose affected face neighborhoods overlap', () => {
  const hem = makeCube();
  hem.setSelectionMode('edge');
  for (const pair of [[4,5],[5,6],[0,1],[1,2]]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(...pair));
    assert.ok(edge);
    hem.selectEdge(edge.id, true);
  }
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] });
  const result = hem.bevelSelectedEdges({ amount: 0.25 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /share affected faces/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] }), before);
});


test('Connected Bevel builds a three-edge chain with two manifold miters and closed end caps', () => {
  const hem = makeCube();
  hem.setSelectionMode('edge');
  // Select the chain in a deliberately shuffled order; the operator recovers
  // the geometric path rather than depending on Set insertion order.
  for (const pair of [[6,7],[4,5],[5,6]]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(...pair));
    assert.ok(edge);
    hem.selectEdge(edge.id, true);
  }
  const beforeFaces = hem.faces.length;
  const result = hem.bevelSelectedEdges({ amount: 0.25 });
  const report = hem.validateTopology();
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.bevelCount, 3);
  assert.equal(result.miterCount, 2);
  assert.equal(result.miterEdges, 2);
  assert.equal(result.createdFaces, 3);
  assert.equal(result.endCaps, 2);
  assert.equal(result.selectedEdges, 8);
  assert.equal(hem.faces.length, beforeFaces + 3);
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
  assert.equal(hem.edgeSelection.size, 8);
});

test('Connected Bevel preserves manifold topology for every three-edge path on a cube', () => {
  const seed = makeCube();
  const graph = Array.from({ length: seed.positions.length }, () => []);
  for (const edge of seed.edges) {
    const [a, b] = edge.vertices;
    graph[a].push(b); graph[b].push(a);
  }
  const paths = [];
  const visit = path => {
    if (path.length === 4) {
      const text = path.join(',');
      const reverse = [...path].reverse().join(',');
      if (text < reverse) paths.push([...path]);
      return;
    }
    for (const next of graph[path.at(-1)]) if (!path.includes(next)) visit([...path, next]);
  };
  for (let start = 0; start < graph.length; start++) visit([start]);
  assert.equal(paths.length, 48);
  for (const path of paths) {
    const hem = makeCube();
    hem.setSelectionMode('edge');
    for (const index of [2, 0, 1]) {
      const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(path[index], path[index + 1]));
      assert.ok(edge);
      hem.selectEdge(edge.id, true);
    }
    const result = hem.bevelSelectedEdges({ amount: 0.25 });
    assert.equal(result.changed, true, `path ${path.join('→')}: ${result.reason}`);
    const report = hem.validateTopology();
    assert.equal(report.valid, true, `path ${path.join('→')} topology invalid`);
    assert.equal(report.counts.boundaryEdges, 0);
    assert.equal(result.miterEdges, 2);
    assert.equal(hem.edgeSelection.size, 8);
  }
});

test('Connected Bevel preserves every four-to-seven-edge simple path on a cube', () => {
  const seed = makeCube();
  const graph = Array.from({ length: seed.positions.length }, () => []);
  for (const edge of seed.edges) {
    const [a, b] = edge.vertices;
    graph[a].push(b); graph[b].push(a);
  }
  let checked = 0;
  for (let edgeCount = 4; edgeCount <= 7; edgeCount++) {
    const paths = [];
    const visit = path => {
      if (path.length === edgeCount + 1) {
        const forward = path.join(','), reverse = [...path].reverse().join(',');
        if (forward < reverse) paths.push([...path]);
        return;
      }
      for (const next of graph[path.at(-1)]) if (!path.includes(next)) visit([...path, next]);
    };
    for (let start = 0; start < graph.length; start++) visit([start]);
    for (const path of paths) {
      const hem = makeCube();
      hem.setSelectionMode('edge');
      for (const index of [...Array(edgeCount).keys()].reverse()) {
        const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(path[index], path[index + 1]));
        assert.ok(edge);
        hem.selectEdge(edge.id, true);
      }
      const result = hem.bevelSelectedEdges({ amount: 0.25 });
      const report = hem.validateTopology();
      assert.equal(result.changed, true, `${edgeCount}-edge path ${path.join('→')}: ${result.reason}`);
      assert.equal(result.chainLength, edgeCount);
      assert.equal(result.miterCount, edgeCount - 1);
      assert.equal(result.endCaps, 2);
      assert.equal(result.selectedEdges, 2 * edgeCount + 2);
      assert.equal(report.valid, true, `${edgeCount}-edge path ${path.join('→')} topology invalid`);
      assert.equal(report.counts.boundaryEdges, 0);
      checked++;
    }
  }
  assert.equal(checked, 360);
});

test('Segmented Bevel preserves a four-edge chain with three shared miters and terminal caps', () => {
  const hem = makeCube();
  hem.setSelectionMode('edge');
  const path = [0, 1, 2, 6, 7];
  for (const index of [3, 1, 0, 2]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(path[index], path[index + 1]));
    assert.ok(edge);
    hem.selectEdge(edge.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.25, segments: 3, profile: 0.72 });
  const report = hem.validateTopology();
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.chainLength, 4);
  assert.equal(result.miterCount, 3);
  assert.equal(result.endCaps, 2);
  assert.equal(result.selectedEdges, 14);
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
  assert.ok(hem.edges.every(edge => edge.halfEdges.length === 2));
});

test('Connected Bevel accepts the full eight-edge limit on a closed pentagonal prism', () => {
  const positions = [];
  for (const z of [1, -1]) {
    for (let index = 0; index < 5; index++) {
      const angle = 2 * Math.PI * index / 5;
      positions.push([Math.cos(angle), Math.sin(angle), z]);
    }
  }
  const faces = [[0,1,2,3,4],[9,8,7,6,5]];
  for (let index = 0; index < 5; index++) {
    const next = (index + 1) % 5;
    faces.push([index, index + 5, next + 5, next]);
  }
  const hem = new HalfEdgeMesh(positions, faces);
  assert.equal(hem.validateTopology().valid, true);
  hem.setSelectionMode('edge');
  const path = [0,1,6,7,2,3,8,9,4];
  for (let index = 0; index < 8; index++) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(path[index], path[index + 1]));
    assert.ok(edge);
    hem.selectEdge(edge.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.25, segments: 2, profile: 0.7 });
  const report = hem.validateTopology();
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.chainLength, 8);
  assert.equal(result.miterCount, 7);
  assert.equal(result.endCaps, 2);
  assert.equal(result.segments, 2);
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
  assert.equal(report.counts.nonManifoldEdges, 0);
});

test('Connected Bevel rejects higher-valence miter fans without mutating the source', () => {
  const positions = [[0,0,1],[0,0,-1],[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]];
  const faces = [[0,2,3],[0,3,4],[0,4,5],[0,5,2],[1,3,2],[1,4,3],[1,5,4],[1,2,5]];
  const hem = new HalfEdgeMesh(positions, faces);
  assert.equal(hem.validateTopology().valid, true);
  hem.setSelectionMode('edge');
  for (const pair of [[4,0],[0,3],[3,2]]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(...pair));
    assert.ok(edge);
    hem.selectEdge(edge.id, true);
  }
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] });
  const result = hem.bevelSelectedEdges({ amount: 0.25 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /tri-valent terminal|valence-three/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] }), before);
});

test('Connected Bevel closes valence-four internal junctions with oriented cap patches', () => {
  for (const path of [[0,4,5,1], [1,5,4,0], [3,7,6,2], [2,6,7,3], [0,4,7,3], [3,7,4,0], [1,5,6,2], [2,6,5,1]]) {
    const hem = makeValenceFourChainFixture();
    assert.equal(hem.validateTopology().valid, true);
    assert.deepEqual(path.map(vertexId => hem.orderedVertexFan(vertexId)?.length), [3,4,4,3]);
    selectVertexPath(hem, path);
    const beforeFaces = hem.faces.length;
    const result = hem.bevelSelectedEdges({ amount: 0.25 });
    const report = hem.validateTopology();
    assert.equal(result.changed, true, `${path.join('-')}: ${result.reason}`);
    assert.equal(result.miterCount, 2);
    assert.equal(result.miterEdges, 4);
    assert.equal(result.capPatches, 2);
    assert.equal(result.endCaps, 2);
    assert.equal(result.selectedEdges, 8);
    assert.equal(hem.faces.length, beforeFaces + 5);
    assert.equal(report.valid, true);
    assert.equal(report.counts.boundaryEdges, 0);
    assert.equal(report.counts.nonManifoldEdges, 0);
    assert.equal(report.counts.inconsistentWinding, 0);
  }
});

test('Connected Bevel supports mixed tri-valent and valence-four internal fans with segments', () => {
  const hem = makeValenceFourChainFixture();
  const path = [0,4,5,1,2];
  assert.deepEqual(path.map(vertexId => hem.orderedVertexFan(vertexId)?.length), [3,4,4,3,3]);
  selectVertexPath(hem, path);
  const result = hem.bevelSelectedEdges({ amount: 0.25, segments: 4, profile: 0.65 });
  const report = hem.validateTopology();
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.chainLength, 4);
  assert.equal(result.miterCount, 3);
  assert.equal(result.capPatches, 2);
  assert.equal(result.miterEdges, 5);
  assert.equal(result.segments, 4);
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
  assert.equal(report.counts.nonManifoldEdges, 0);
});

test('Valence-four cap patches stay manifold through all segment counts in a rotated frame', () => {
  const c = Math.cos(0.37), s = Math.sin(0.37), cx = Math.cos(0.29), sx = Math.sin(0.29);
  for (let segments = 1; segments <= 8; segments++) {
    const hem = makeValenceFourChainFixture();
    hem.positions = hem.positions.map(([x, y, z]) => {
      const rotatedX = c * x - s * y;
      const rotatedY = s * x + c * y;
      return [rotatedX, cx * rotatedY - sx * z, sx * rotatedY + cx * z];
    });
    hem.rebuild();
    selectVertexPath(hem, [0,4,5,1]);
    const result = hem.bevelSelectedEdges({ amount: 0.25, segments, profile: segments % 2 ? 0 : 1 });
    const report = hem.validateTopology();
    assert.equal(result.changed, true, `segments ${segments}: ${result.reason}`);
    assert.equal(result.capPatches, 2);
    assert.equal(result.miterEdges, 4);
    assert.equal(report.valid, true, `segments ${segments} produced invalid topology`);
    assert.equal(report.counts.boundaryEdges, 0);
    assert.equal(report.counts.nonManifoldEdges, 0);
  }
});

test('Connected Bevel closes valence-five and valence-six internal fans with triangulated cap patches', () => {
  for (const valence of [5, 6]) {
    const hem = makeValenceFiveSixChainFixture(valence);
    assert.equal(hem.validateTopology().valid, true);
    assert.deepEqual([0,4,5,1].map(vertexId => hem.orderedVertexFan(vertexId)?.length),
      valence === 5 ? [3,5,5,3] : [3,5,6,3]);
    const path = valence === 5 ? [0,4,5,1] : [1,5,4,0];
    selectVertexPath(hem, path);
    const result = hem.bevelSelectedEdges({ amount: 0.22 });
    const report = hem.validateTopology();
    assert.equal(result.changed, true, `valence ${valence}: ${result.reason}`);
    assert.equal(result.chainLength, 3);
    assert.equal(result.miterCount, 2);
    assert.equal(result.miterEdges, 4);
    assert.equal(result.capPatches, valence === 5 ? 8 : 9);
    assert.equal(result.endCaps, 2);
    assert.equal(report.valid, true);
    assert.equal(report.counts.boundaryEdges, 0);
    assert.equal(report.counts.nonManifoldEdges, 0);
    assert.equal(report.counts.inconsistentWinding, 0);
  }
});

test('Valence-five and valence-six cap patches remain closed through every segment count in rotated geometry', () => {
  const c = Math.cos(0.31), s = Math.sin(0.31), cx = Math.cos(0.27), sx = Math.sin(0.27);
  for (const valence of [5, 6]) {
    for (let segments = 1; segments <= 8; segments++) {
      const hem = makeValenceFiveSixChainFixture(valence);
      hem.positions = hem.positions.map(([x,y,z]) => {
        const rotatedX = c*x - s*y;
        const rotatedY = s*x + c*y;
        return [rotatedX, cx*rotatedY - sx*z, sx*rotatedY + cx*z];
      });
      hem.rebuild();
      selectVertexPath(hem, [0,4,5,1]);
      const result = hem.bevelSelectedEdges({ amount: 0.22, segments, profile: segments % 2 ? 0 : 1 });
      const report = hem.validateTopology();
      assert.equal(result.changed, true, `valence ${valence}, segments ${segments}: ${result.reason}`);
      assert.equal(result.capPatches, valence === 5 ? 8 : 9);
      assert.equal(result.miterEdges, 4);
      assert.equal(result.profileScale, 0.25);
      assert.equal(report.valid, true, `valence ${valence}, segments ${segments} topology`);
      assert.equal(report.counts.boundaryEdges, 0);
      assert.equal(report.counts.nonManifoldEdges, 0);
      assert.equal(report.counts.inconsistentWinding, 0);
    }
  }
});

test('Connected Bevel rejects an internal valence-seven fan without mutating the source', () => {
  const hem = makeValenceFiveSixChainFixture(7);
  assert.equal(hem.validateTopology().valid, true);
  assert.equal(hem.orderedVertexFan(5)?.length, 7);
  selectVertexPath(hem, [0,4,5,1]);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] });
  const result = hem.bevelSelectedEdges({ amount: 0.25 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /valence three through six/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] }), before);
});

test('Connected Bevel rejects a valence-four terminal fan without mutating the source', () => {
  const hem = makeValenceFourChainFixture();
  selectVertexPath(hem, [4,5,1,2]);
  const before = JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] });
  const result = hem.bevelSelectedEdges({ amount: 0.25 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /tri-valent terminal/i);
  assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] }), before);
});

test('Connected Bevel supports a skewed three-edge chain without axis-aligned assumptions', () => {
  const source = makeCube();
  const positions = source.positions.map(([x, y, z]) => [
    2 * x + 0.3 * y + 0.1 * z,
    0.2 * x + 1.7 * y + 0.15 * z,
    0.1 * x + 0.25 * y + 1.3 * z
  ]);
  const hem = new HalfEdgeMesh(positions, source.faces);
  hem.setSelectionMode('edge');
  for (const pair of [[4,5],[5,6],[6,7]]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(...pair));
    assert.ok(edge);
    hem.selectEdge(edge.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.3 });
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.miterEdges, 2);
  assert.equal(hem.validateTopology().valid, true);
  assert.equal(hem.validateTopology().counts.boundaryEdges, 0);
});

test('Segmented Bevel builds a profiled multi-face strip and preserves closed topology', () => {
  const build = profile => {
    const hem = makeCube();
    hem.setSelectionMode('edge');
    const seed = hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(4,5));
    hem.selectEdge(seed.id);
    const result = hem.bevelSelectedEdges({ amount: 0.25, segments: 4, profile });
    return { hem, result };
  };
  const concave = build(0);
  const rounded = build(0.5);
  const convex = build(1);
  for (const { hem, result } of [concave, rounded, convex]) {
    assert.equal(result.changed, true, result.reason);
    assert.equal(result.segments, 4);
    assert.equal(result.createdFaces, 8);
    assert.equal(result.selectedEdges, 10);
    assert.equal(hem.faces.length, 14);
    const report = hem.validateTopology();
    assert.equal(report.valid, true);
    assert.equal(report.counts.boundaryEdges, 0);
    assert.ok(hem.edges.every(edge => edge.halfEdges.length === 2));
  }
  assert.notDeepEqual(concave.hem.positions, rounded.hem.positions, 'the default rounded profile must differ from the concave profile');
  assert.notDeepEqual(rounded.hem.positions, convex.hem.positions, 'the convex profile must differ from the default rounded profile');
  assert.notDeepEqual(concave.hem.positions, convex.hem.positions, 'profile values must change the cross-section geometry');
});

test('Segmented Bevel shares profile subdivisions across a connected two-edge miter', () => {
  const hem = makeCube();
  hem.setSelectionMode('edge');
  for (const pair of [[4,5],[5,6]]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(...pair));
    hem.selectEdge(edge.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.25, segments: 3, profile: 0.65 });
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.miterEdges, 1);
  assert.equal(result.createdFaces, 12);
  assert.equal(result.selectedEdges, 10);
  const report = hem.validateTopology();
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
  assert.ok(hem.edges.every(edge => edge.halfEdges.length === 2));
});

test('Segmented Bevel preserves both miter junctions and terminal caps on a three-edge chain', () => {
  const hem = makeCube();
  hem.setSelectionMode('edge');
  for (const pair of [[4,5],[5,6],[6,7]]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(...pair));
    hem.selectEdge(edge.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.25, segments: 3, profile: 0.5 });
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.miterEdges, 2);
  assert.equal(result.endCaps, 2);
  assert.equal(result.createdFaces, 18);
  assert.equal(result.selectedEdges, 12);
  const report = hem.validateTopology();
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
  assert.ok(hem.edges.every(edge => edge.halfEdges.length === 2));
});

test('Segmented Bevel processes multiple independent miter pairs in one closed candidate', () => {
  const source = makeCube();
  const positions = [], faces = [];
  for (let component = 0; component < 2; component++) {
    const offset = positions.length;
    positions.push(...source.positions.map(([x,y,z]) => [x + component * 4,y,z]));
    faces.push(...source.faces.map(face => face.map(id => id + offset)));
  }
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('edge');
  for (const offset of [0,8]) for (const pair of [[4,5],[5,6]]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(pair[0] + offset,pair[1] + offset));
    hem.selectEdge(edge.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.25, segments: 2, profile: 0.7 });
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.miterCount, 2);
  assert.equal(result.createdFaces, 16);
  assert.equal(result.selectedEdges, 16);
  assert.equal(hem.validateTopology().valid, true);
  assert.equal(hem.validateTopology().counts.boundaryEdges, 0);
});

test('Segmented Bevel rejects invalid segment/profile controls without mutating the source', () => {
  for (const options of [{ segments: 0 }, { segments: 9 }, { profile: -0.1 }, { profile: 1.1 }]) {
    const hem = makeCube();
    hem.setSelectionMode('edge');
    hem.selectEdge(hem.edges.find(edge => keyFor(...edge.vertices) === keyFor(4,5)).id);
    const before = JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] });
    const result = hem.bevelSelectedEdges({ amount: 0.25, ...options });
    assert.equal(result.changed, false);
    assert.equal(JSON.stringify({ positions: hem.positions, faces: hem.faces, selection: [...hem.edgeSelection] }), before);
  }
});


test('Segmented Bevel preserves a skewed three-edge chain with profiled caps', () => {
  const source = makeCube();
  const positions = source.positions.map(([x, y, z]) => [
    2 * x + 0.3 * y + 0.1 * z,
    0.2 * x + 1.7 * y + 0.15 * z,
    0.1 * x + 0.25 * y + 1.3 * z
  ]);
  const hem = new HalfEdgeMesh(positions, source.faces);
  hem.setSelectionMode('edge');
  for (const pair of [[6,7],[4,5],[5,6]]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(...pair));
    assert.ok(edge);
    hem.selectEdge(edge.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.3, segments: 4, profile: 0.8 });
  const report = hem.validateTopology();
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.segments, 4);
  assert.equal(result.miterEdges, 2);
  assert.equal(result.endCaps, 2);
  assert.equal(result.createdFaces, 24);
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
  assert.ok(hem.edges.every(edge => edge.halfEdges.length === 2));
});

test('Segmented Bevel handles disconnected single-edge selections in one candidate', () => {
  const source = makeCube();
  const positions = [], faces = [];
  for (let component = 0; component < 2; component++) {
    const offset = positions.length;
    positions.push(...source.positions.map(([x, y, z]) => [x + component * 5, y, z]));
    faces.push(...source.faces.map(face => face.map(id => id + offset)));
  }
  const hem = new HalfEdgeMesh(positions, faces);
  hem.setSelectionMode('edge');
  for (const offset of [0, 8]) {
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(4 + offset, 5 + offset));
    assert.ok(edge);
    hem.selectEdge(edge.id, true);
  }
  const result = hem.bevelSelectedEdges({ amount: 0.25, segments: 3, profile: 0.4 });
  const report = hem.validateTopology();
  assert.equal(result.changed, true, result.reason);
  assert.equal(result.bevelCount, 2);
  assert.equal(result.createdFaces, 12);
  assert.equal(result.selectedEdges, 16);
  assert.equal(report.valid, true);
  assert.equal(report.counts.boundaryEdges, 0);
});


test('Segmented Bevel accepts every supported segment count from one through eight', () => {
  for (let segments = 1; segments <= 8; segments++) {
    const hem = makeCube();
    hem.setSelectionMode('edge');
    const edge = hem.edges.find(item => keyFor(...item.vertices) === keyFor(4,5));
    assert.ok(edge);
    hem.selectEdge(edge.id);
    const result = hem.bevelSelectedEdges({ amount: 0.25, segments, profile: 0.5 });
    const report = hem.validateTopology();
    assert.equal(result.changed, true, `segments ${segments}: ${result.reason}`);
    assert.equal(result.segments, segments);
    assert.equal(report.valid, true, `segments ${segments} produced invalid topology`);
    assert.equal(report.counts.boundaryEdges, 0);
  }
});
