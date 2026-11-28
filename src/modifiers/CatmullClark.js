const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

/**
 * One Catmull-Clark pass over a polygon cage.
 *
 * Manifold interior edges and ordinary open boundaries are supported. Edges
 * used by more than two faces, non-manifold vertex fans, and vertices with an
 * ambiguous boundary are rejected before a candidate is returned.
 */
export function subdivideCatmullClark(positions, faces, { maxFaces = 200_000 } = {}) {
  const fail = message => { throw new Error(`Catmull-Clark: ${message}`); };
  if (!positions || positions.length % 3 !== 0) fail('the position buffer is invalid.');
  const vertexCount = positions.length / 3;
  for (let index = 0; index < positions.length; index++) {
    if (!Number.isFinite(positions[index])) fail('non-finite vertex positions are not supported.');
  }
  if (!Array.isArray(faces) || !faces.length) fail('a polygon surface is required.');

  const edgeMap = new Map();
  const vertexFaces = Array.from({ length: vertexCount }, () => new Set());
  const vertexEdges = Array.from({ length: vertexCount }, () => new Set());
  const facePoints = [];
  const faceCountNext = faces.reduce((sum, face) => sum + (Array.isArray(face) ? face.length : 0), 0);
  if (faceCountNext > maxFaces) fail(`the next level would exceed the ${maxFaces.toLocaleString()}-face safety limit.`);

  for (let faceId = 0; faceId < faces.length; faceId++) {
    const face = faces[faceId];
    if (!Array.isArray(face) || face.length < 3 || new Set(face).size !== face.length ||
        face.some(id => !Number.isInteger(id) || id < 0 || id >= vertexCount)) {
      fail(`face ${faceId} is malformed.`);
    }
    const point = [0, 0, 0];
    for (const vertexId of face) {
      vertexFaces[vertexId].add(faceId);
      for (let axis = 0; axis < 3; axis++) point[axis] += positions[vertexId * 3 + axis] / face.length;
    }
    facePoints.push(point);

    for (let corner = 0; corner < face.length; corner++) {
      const a = face[corner], b = face[(corner + 1) % face.length];
      const key = edgeKey(a, b);
      let edge = edgeMap.get(key);
      if (!edge) {
        edge = { a: Math.min(a, b), b: Math.max(a, b), faces: [], directions: [] };
        edgeMap.set(key, edge);
      }
      edge.faces.push(faceId);
      edge.directions.push([a, b]);
      if (edge.faces.length === 2) {
        const [first, second] = edge.directions;
        if (first[0] === second[0] && first[1] === second[1]) {
          fail(`edge ${key} has inconsistent face winding.`);
        }
      }
      vertexEdges[a].add(key);
      vertexEdges[b].add(key);
      if (edge.faces.length > 2) fail(`edge ${key} is non-manifold (used by more than two faces).`);
    }
  }

  const boundaryNeighbors = Array.from({ length: vertexCount }, () => new Set());
  for (const edge of edgeMap.values()) {
    if (edge.faces.length === 1) {
      boundaryNeighbors[edge.a].add(edge.b);
      boundaryNeighbors[edge.b].add(edge.a);
    }
  }

  // Verify each used vertex has one connected fan. The degree/boundary counts
  // alone would allow two disconnected shells touching at a single vertex.
  for (let vertexId = 0; vertexId < vertexCount; vertexId++) {
    const incidentFaces = [...vertexFaces[vertexId]];
    if (!incidentFaces.length) continue; // keep unused cage points unchanged
    const boundaryCount = boundaryNeighbors[vertexId].size;
    if (boundaryCount !== 0 && boundaryCount !== 2) {
      fail(`vertex ${vertexId} has an ambiguous boundary fan.`);
    }
    const expectedEdges = boundaryCount === 2 ? incidentFaces.length + 1 : incidentFaces.length;
    if (vertexEdges[vertexId].size !== expectedEdges) {
      fail(`vertex ${vertexId} has a non-manifold or disconnected face fan.`);
    }
    const incidentSet = new Set(incidentFaces);
    const adjacency = new Map(incidentFaces.map(id => [id, []]));
    for (const key of vertexEdges[vertexId]) {
      const edge = edgeMap.get(key);
      if (edge?.faces.length === 2) {
        const [a, b] = edge.faces;
        if (incidentSet.has(a) && incidentSet.has(b)) {
          adjacency.get(a).push(b);
          adjacency.get(b).push(a);
        }
      }
    }
    const visited = new Set([incidentFaces[0]]), queue = [incidentFaces[0]];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const next of adjacency.get(queue[cursor])) {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    if (visited.size !== incidentFaces.length) fail(`vertex ${vertexId} has disconnected incident face fans.`);
  }

  const nextPositions = Array.from(positions);
  const edgePointIds = new Map();
  for (const [key, edge] of edgeMap) {
    const point = [0, 0, 0];
    for (let axis = 0; axis < 3; axis++) {
      const a = positions[edge.a * 3 + axis], b = positions[edge.b * 3 + axis];
      if (edge.faces.length === 1) point[axis] = (a + b) * 0.5;
      else {
        point[axis] = (a + b + facePoints[edge.faces[0]][axis] + facePoints[edge.faces[1]][axis]) * 0.25;
      }
    }
    edgePointIds.set(key, nextPositions.length / 3);
    nextPositions.push(...point);
  }

  const facePointIds = facePoints.map(point => {
    const id = nextPositions.length / 3;
    nextPositions.push(...point);
    return id;
  });

  // Reposition the original cage vertices after face/edge point construction.
  for (let vertexId = 0; vertexId < vertexCount; vertexId++) {
    const incidentFaces = [...vertexFaces[vertexId]];
    if (!incidentFaces.length) continue;
    const boundary = [...boundaryNeighbors[vertexId]];
    let next;
    if (boundary.length === 2) {
      next = [0, 1, 2].map(axis =>
        (6 * positions[vertexId * 3 + axis] +
          positions[boundary[0] * 3 + axis] + positions[boundary[1] * 3 + axis]) / 8
      );
    } else {
      const n = incidentFaces.length;
      if (n < 3) fail(`interior vertex ${vertexId} has fewer than three incident faces.`);
      const averageFace = [0, 1, 2].map(axis => incidentFaces.reduce((sum, faceId) => sum + facePoints[faceId][axis], 0) / n);
      const averageEdge = [0, 1, 2].map(axis => {
        let sum = 0;
        for (const key of vertexEdges[vertexId]) {
          const edge = edgeMap.get(key);
          sum += (positions[edge.a * 3 + axis] + positions[edge.b * 3 + axis]) * 0.5;
        }
        return sum / n;
      });
      next = [0, 1, 2].map(axis =>
        (averageFace[axis] + 2 * averageEdge[axis] + (n - 3) * positions[vertexId * 3 + axis]) / n
      );
    }
    nextPositions.splice(vertexId * 3, 3, ...next);
  }

  const nextFaces = [];
  for (let faceId = 0; faceId < faces.length; faceId++) {
    const face = faces[faceId];
    const facePointId = facePointIds[faceId];
    for (let corner = 0; corner < face.length; corner++) {
      const previous = face[(corner - 1 + face.length) % face.length];
      const current = face[corner];
      const next = face[(corner + 1) % face.length];
      nextFaces.push([
        current,
        edgePointIds.get(edgeKey(current, next)),
        facePointId,
        edgePointIds.get(edgeKey(previous, current))
      ]);
    }
  }

  return {
    positions: new Float32Array(nextPositions),
    faces: nextFaces,
    stats: { sourceVertices: vertexCount, sourceFaces: faces.length, outputVertices: nextPositions.length / 3, outputFaces: nextFaces.length }
  };
}

export function clampSubdivisionLevel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(3, Math.round(number)));
}
