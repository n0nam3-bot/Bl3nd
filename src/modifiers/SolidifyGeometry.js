const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function length(a) { return Math.hypot(a[0], a[1], a[2]); }
function pointAt(positions, id) { return [positions[id * 3], positions[id * 3 + 1], positions[id * 3 + 2]]; }
function triangleNormal(positions, face) {
  return cross(subtract(pointAt(positions, face[1]), pointAt(positions, face[0])), subtract(pointAt(positions, face[2]), pointAt(positions, face[0])));
}

export function clampSolidifyThickness(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.08;
  return Math.max(0.0001, Math.min(1000, number));
}

export function clampSolidifyOffset(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return -1;
  return Math.max(-1, Math.min(1, number));
}

/**
 * Builds a two-layer shell from an oriented triangle surface.
 * Closed components are oriented outward by signed volume; open components
 * retain their supplied winding. Every source edge/fan is validated before
 * output and every offset triangle is checked for local inversion.
 *
 * This is a conservative first-pass offset shell, not a global self-intersection solver.
 */
export function solidifyGeometry(positions, indices, options = {}) {
  const fail = message => { throw new Error(`Solidify: ${message}`); };
  if (!positions || positions.length % 3 !== 0 || !indices || indices.length % 3 !== 0) {
    fail('the position or triangle index buffer is invalid.');
  }
  const vertexCount = positions.length / 3;
  const sourceTriangleCount = indices.length / 3;
  if (!vertexCount || !sourceTriangleCount) fail('a non-empty triangle surface is required.');
  const thickness = clampSolidifyThickness(options.thickness ?? 0.08);
  const offset = clampSolidifyOffset(options.offset ?? -1);
  const maxTriangles = Number.isInteger(options.maxTriangles) ? options.maxTriangles : 600_000;
  if (sourceTriangleCount * 2 > maxTriangles) fail(`the shell would exceed the ${maxTriangles.toLocaleString()}-triangle safety limit.`);

  const boundsMin = [Infinity, Infinity, Infinity], boundsMax = [-Infinity, -Infinity, -Infinity];
  for (let id = 0; id < vertexCount; id++) {
    const point = pointAt(positions, id);
    if (!point.every(Number.isFinite)) fail(`vertex ${id} has a non-finite position.`);
    for (let axis = 0; axis < 3; axis++) {
      boundsMin[axis] = Math.min(boundsMin[axis], point[axis]);
      boundsMax[axis] = Math.max(boundsMax[axis], point[axis]);
    }
  }
  const scale = Math.max(1e-6, length(subtract(boundsMax, boundsMin)));
  const areaEpsilon = scale * scale * 1e-12;
  const faces = [];
  const faceNormals = [];
  const edgeMap = new Map();
  const vertexFaces = Array.from({ length: vertexCount }, () => new Set());
  const vertexEdges = Array.from({ length: vertexCount }, () => new Set());

  for (let faceId = 0; faceId < sourceTriangleCount; faceId++) {
    const face = [indices[faceId * 3], indices[faceId * 3 + 1], indices[faceId * 3 + 2]];
    if (new Set(face).size !== 3 || face.some(id => !Number.isInteger(id) || id < 0 || id >= vertexCount)) {
      fail(`triangle ${faceId} has invalid or repeated vertex indices.`);
    }
    const normal = triangleNormal(positions, face);
    if (length(normal) <= areaEpsilon) fail(`triangle ${faceId} is degenerate.`);
    faces.push(face);
    faceNormals.push(normal);
    for (let corner = 0; corner < 3; corner++) {
      const a = face[corner], b = face[(corner + 1) % 3], key = edgeKey(a, b);
      let edge = edgeMap.get(key);
      if (!edge) {
        edge = { a, b, uses: [] };
        edgeMap.set(key, edge);
      }
      edge.uses.push({ faceId, a, b });
      if (edge.uses.length > 2) fail(`edge ${key} is non-manifold (used by more than two triangles).`);
      vertexEdges[a].add(key);
      vertexEdges[b].add(key);
    }
    for (const id of face) vertexFaces[id].add(faceId);
  }

  const faceAdjacency = Array.from({ length: faces.length }, () => new Set());
  const boundaryNeighbors = Array.from({ length: vertexCount }, () => new Set());
  const components = [];
  const componentOfFace = new Int32Array(faces.length).fill(-1);
  for (const [key, edge] of edgeMap) {
    if (edge.uses.length === 1) {
      boundaryNeighbors[edge.uses[0].a].add(edge.uses[0].b);
      boundaryNeighbors[edge.uses[0].b].add(edge.uses[0].a);
    } else {
      const [first, second] = edge.uses;
      if (first.a === second.a && first.b === second.b) fail(`edge ${key} has inconsistent triangle winding.`);
      faceAdjacency[first.faceId].add(second.faceId);
      faceAdjacency[second.faceId].add(first.faceId);
    }
  }

  for (let seed = 0; seed < faces.length; seed++) {
    if (componentOfFace[seed] !== -1) continue;
    const componentId = components.length;
    const faceIds = new Set([seed]), queue = [seed];
    componentOfFace[seed] = componentId;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const next of faceAdjacency[queue[cursor]]) {
        if (!faceIds.has(next)) {
          faceIds.add(next);
          componentOfFace[next] = componentId;
          queue.push(next);
        }
      }
    }
    components.push({ faceIds, closed: true });
  }

  for (const edge of edgeMap.values()) {
    if (edge.uses.length === 1) components[componentOfFace[edge.uses[0].faceId]].closed = false;
  }

  // Every used vertex must belong to exactly one connected manifold face fan.
  for (let vertexId = 0; vertexId < vertexCount; vertexId++) {
    const incidentFaces = [...vertexFaces[vertexId]];
    if (!incidentFaces.length) fail(`vertex ${vertexId} is unused by the surface.`);
    const boundaryCount = boundaryNeighbors[vertexId].size;
    if (boundaryCount !== 0 && boundaryCount !== 2) fail(`vertex ${vertexId} has a branching or ambiguous boundary fan.`);
    const expectedEdges = incidentFaces.length + (boundaryCount === 2 ? 1 : 0);
    if (vertexEdges[vertexId].size !== expectedEdges) fail(`vertex ${vertexId} has a non-manifold or disconnected face fan.`);
    const incidentSet = new Set(incidentFaces), visited = new Set([incidentFaces[0]]), queue = [incidentFaces[0]];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const next of faceAdjacency[queue[cursor]]) {
        if (incidentSet.has(next) && !visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    if (visited.size !== incidentFaces.length) fail(`vertex ${vertexId} has disconnected incident face fans.`);
  }

  // Give closed components a deterministic outward normal direction regardless
  // of whether the imported mesh's complete winding was inward or outward.
  for (const component of components) {
    if (!component.closed) continue;
    let volume6 = 0;
    for (const faceId of component.faceIds) {
      const face = faces[faceId];
      volume6 += dot(pointAt(positions, face[0]), cross(pointAt(positions, face[1]), pointAt(positions, face[2])));
    }
    if (Math.abs(volume6) <= scale * scale * scale * 1e-12) fail('a closed component has near-zero signed volume and no stable outward direction.');
    if (volume6 < 0) {
      for (const faceId of component.faceIds) {
        const face = faces[faceId];
        faces[faceId] = [face[0], face[2], face[1]];
        faceNormals[faceId] = faceNormals[faceId].map(value => -value);
      }
    }
  }

  // Area-weighted vertex normals provide one continuous offset direction per
  // shared cage vertex. Source vertices are copied; the editable cage is never edited.
  const vertexNormals = Array.from({ length: vertexCount }, () => [0, 0, 0]);
  for (let faceId = 0; faceId < faces.length; faceId++) {
    const normal = faceNormals[faceId];
    for (const id of faces[faceId]) for (let axis = 0; axis < 3; axis++) vertexNormals[id][axis] += normal[axis];
  }
  for (let id = 0; id < vertexCount; id++) {
    const magnitude = length(vertexNormals[id]);
    if (!Number.isFinite(magnitude) || magnitude <= areaEpsilon) fail(`vertex ${id} has an unstable averaged normal.`);
    vertexNormals[id] = vertexNormals[id].map(value => value / magnitude);
  }

  const outerDistance = thickness * (offset + 1) * 0.5;
  const innerDistance = thickness * (offset - 1) * 0.5;
  const nextPositions = new Float32Array(vertexCount * 6);
  for (let id = 0; id < vertexCount; id++) {
    const base = pointAt(positions, id), normal = vertexNormals[id];
    for (let axis = 0; axis < 3; axis++) {
      nextPositions[id * 3 + axis] = base[axis] + normal[axis] * outerDistance;
      nextPositions[(id + vertexCount) * 3 + axis] = base[axis] + normal[axis] * innerDistance;
    }
  }

  const nextIndices = [];
  const validateOffsetFace = (face, layer, faceId) => {
    const mapped = face.map(id => id + (layer === 'inner' ? vertexCount : 0));
    const points = mapped.map(id => pointAt(nextPositions, id));
    const generated = cross(subtract(points[1], points[0]), subtract(points[2], points[0]));
    const source = faceNormals[faceId];
    const alignment = dot(generated, source);
    const baseMagnitude = dot(source, source);
    if (!Number.isFinite(alignment) || alignment <= baseMagnitude * 1e-8) {
      fail(`thickness ${thickness} folds or collapses the ${layer} surface near triangle ${faceId}. Reduce Thickness.`);
    }
  };

  for (let faceId = 0; faceId < faces.length; faceId++) {
    const [a, b, c] = faces[faceId];
    validateOffsetFace(faces[faceId], 'outer', faceId);
    validateOffsetFace(faces[faceId], 'inner', faceId);
    nextIndices.push(a, b, c, c + vertexCount, b + vertexCount, a + vertexCount);
  }

  let boundaryEdgeCount = 0;
  for (const edge of edgeMap.values()) {
    if (edge.uses.length !== 1) continue;
    boundaryEdgeCount++;
    const { a, b } = edge.uses[0];
    const wallA = [a, a + vertexCount, b + vertexCount];
    const wallB = [a, b + vertexCount, b];
    for (const face of [wallA, wallB]) {
      const wallPoints = face.map(id => pointAt(nextPositions, id));
      if (length(cross(subtract(wallPoints[1], wallPoints[0]), subtract(wallPoints[2], wallPoints[0]))) <= areaEpsilon) {
        fail(`the rim wall at boundary edge ${edgeKey(a, b)} collapses at this Thickness.`);
      }
      nextIndices.push(...face);
    }
  }

  const outputTriangles = nextIndices.length / 3;
  if (outputTriangles > maxTriangles) fail(`the shell would exceed the ${maxTriangles.toLocaleString()}-triangle safety limit.`);
  return {
    positions: nextPositions,
    indices: new Uint32Array(nextIndices),
    stats: {
      sourceVertices: vertexCount,
      sourceTriangles: sourceTriangleCount,
      outputVertices: vertexCount * 2,
      outputTriangles,
      boundaryEdges: boundaryEdgeCount,
      closedComponents: components.filter(component => component.closed).length,
      openComponents: components.filter(component => !component.closed).length
    }
  };
}
