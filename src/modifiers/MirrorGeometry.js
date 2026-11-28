export const DEFAULT_MIRROR_MERGE_DISTANCE = 0.001;
export const MAX_MIRROR_MERGE_DISTANCE = 1;

export function normalizeMirrorAxis(value) {
  return value === 'x' || value === 'y' || value === 'z' ? value : 'x';
}

export function clampMirrorMergeDistance(value) {
  if (value === null || value === undefined || value === '') return DEFAULT_MIRROR_MERGE_DISTANCE;
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_MIRROR_MERGE_DISTANCE;
  return Math.max(0, Math.min(MAX_MIRROR_MERGE_DISTANCE, number));
}

/** Clip a triangle surface to one side of the local origin plane. */
function bisectToHalf(positions, indices, axisIndex, mergeDistance, flip) {
  const points = Array.from(positions);
  const side = flip ? -1 : 1;
  for (let vertex = 0; vertex < points.length / 3; vertex++) {
    const offset = vertex * 3 + axisIndex;
    if (Math.abs(points[offset]) <= mergeDistance) points[offset] = 0;
  }

  const intersections = new Map();
  let intersectionCount = 0;
  const signedCoordinate = vertex => points[vertex * 3 + axisIndex] * side;
  const inside = vertex => signedCoordinate(vertex) >= -1e-12;
  const intersection = (a, b) => {
    const ca = signedCoordinate(a), cb = signedCoordinate(b);
    if (Math.abs(ca) <= 1e-12) return a;
    if (Math.abs(cb) <= 1e-12) return b;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (intersections.has(key)) return intersections.get(key);
    const t = Math.max(0, Math.min(1, ca / (ca - cb)));
    const offsetA = a * 3, offsetB = b * 3;
    const nextId = points.length / 3;
    points.push(
      points[offsetA] + (points[offsetB] - points[offsetA]) * t,
      points[offsetA + 1] + (points[offsetB + 1] - points[offsetA + 1]) * t,
      points[offsetA + 2] + (points[offsetB + 2] - points[offsetA + 2]) * t
    );
    points[nextId * 3 + axisIndex] = 0;
    intersections.set(key, nextId);
    intersectionCount++;
    return nextId;
  };

  const clippedTriangles = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
    const polygon = [];
    let previous = triangle[triangle.length - 1];
    let previousInside = inside(previous);
    for (const current of triangle) {
      const currentInside = inside(current);
      if (currentInside) {
        if (!previousInside) polygon.push(intersection(previous, current));
        polygon.push(current);
      } else if (previousInside) {
        polygon.push(intersection(previous, current));
      }
      previous = current;
      previousInside = currentInside;
    }

    const clean = polygon.filter((vertex, index) => index === 0 || vertex !== polygon[index - 1]);
    if (clean.length > 2 && clean[0] === clean[clean.length - 1]) clean.pop();
    if (clean.length < 3) continue;
    for (let corner = 1; corner < clean.length - 1; corner++) {
      const tri = [clean[0], clean[corner], clean[corner + 1]];
      if (new Set(tri).size === 3) clippedTriangles.push(...tri);
    }
  }

  if (!clippedTriangles.length) {
    throw new Error('Mirror: the selected bisect side contains no surface. Choose the other side or turn Bisect off.');
  }

  // Compact the clipped source so discarded-side vertices do not survive as
  // unused points or inflate the worker's next-stage memory estimate.
  const remap = new Map();
  const compactPoints = [];
  const compactIndices = clippedTriangles.map(vertex => {
    if (!remap.has(vertex)) {
      remap.set(vertex, remap.size);
      compactPoints.push(points[vertex * 3], points[vertex * 3 + 1], points[vertex * 3 + 2]);
    }
    return remap.get(vertex);
  });
  return {
    positions: new Float32Array(compactPoints),
    indices: new Uint32Array(compactIndices),
    intersectionCount
  };
}

/**
 * Reflects an indexed triangle surface across the object's local origin plane.
 * Vertices within mergeDistance are snapped to the plane and reused by the
 * reflected triangles, so both sides share the same seam vertex indices.
 * The input buffers are never mutated.
 */
export function mirrorGeometry(positions, indices, modifier = {}) {
  const fail = message => { throw new Error(`Mirror: ${message}`); };
  if (!positions || !Number.isInteger(positions.length) || positions.length % 3 !== 0) {
    fail('the position buffer is invalid.');
  }
  if (!indices || !Number.isInteger(indices.length) || indices.length % 3 !== 0) {
    fail('the triangle index buffer is invalid.');
  }

  const axis = normalizeMirrorAxis(modifier.axis);
  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const mergeDistance = clampMirrorMergeDistance(modifier.mergeDistance);
  const vertexCount = positions.length / 3;
  for (let index = 0; index < positions.length; index++) {
    if (!Number.isFinite(positions[index])) fail('non-finite vertex positions are not supported.');
  }
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      fail('the triangle index buffer references a missing vertex.');
    }
  }

  const bisect = modifier.bisect === true;
  const bisectFlip = modifier.bisectFlip === true;
  const source = bisect
    ? bisectToHalf(positions, indices, axisIndex, mergeDistance, bisectFlip)
    : { positions: new Float32Array(positions), indices: new Uint32Array(indices), intersectionCount: 0 };
  const sourcePositions = source.positions;
  const sourceIndices = source.indices;
  const sourceVertexCount = sourcePositions.length / 3;
  const points = Array.from(sourcePositions);
  const reflectedVertex = new Uint32Array(sourceVertexCount);
  let mergedCenterVertices = 0;
  let mirroredVertices = 0;

  for (let vertex = 0; vertex < sourceVertexCount; vertex++) {
    const offset = vertex * 3;
    const coordinate = sourcePositions[offset + axisIndex];
    if (Math.abs(coordinate) <= mergeDistance) {
      // Snap only the evaluated copy. The editable half-mesh remains untouched.
      points[offset + axisIndex] = 0;
      reflectedVertex[vertex] = vertex;
      mergedCenterVertices++;
      continue;
    }

    const nextId = points.length / 3;
    const reflected = [sourcePositions[offset], sourcePositions[offset + 1], sourcePositions[offset + 2]];
    reflected[axisIndex] = -coordinate;
    points.push(...reflected);
    reflectedVertex[vertex] = nextId;
    mirroredVertices++;
  }

  const outputIndices = Array.from(sourceIndices);
  let mirroredTriangles = 0;
  let skippedCenterPlaneTriangles = 0;
  let skippedCollapsedTriangles = 0;
  for (let offset = 0; offset < sourceIndices.length; offset += 3) {
    const a = sourceIndices[offset], b = sourceIndices[offset + 1], c = sourceIndices[offset + 2];
    // Reflection reverses orientation, so swap the final two corners.
    const reflected = [reflectedVertex[a], reflectedVertex[c], reflectedVertex[b]];
    if (new Set(reflected).size !== 3) {
      skippedCollapsedTriangles++;
      continue;
    }
    const originalSorted = [a, b, c].sort((left, right) => left - right);
    const reflectedSorted = [...reflected].sort((left, right) => left - right);
    if (originalSorted.every((value, index) => value === reflectedSorted[index])) {
      // A triangle entirely on the mirror plane already exists on both sides.
      skippedCenterPlaneTriangles++;
      continue;
    }
    outputIndices.push(...reflected);
    mirroredTriangles++;
  }

  return {
    positions: new Float32Array(points),
    indices: new Uint32Array(outputIndices),
    stats: {
      axis,
      mergeDistance,
      bisect,
      bisectFlip,
      bisectedIntersectionVertices: source.intersectionCount,
      mergedCenterVertices,
      mirroredVertices,
      mirroredTriangles,
      skippedCenterPlaneTriangles,
      skippedCollapsedTriangles
    }
  };
}
