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

  const points = Array.from(positions);
  const reflectedVertex = new Uint32Array(vertexCount);
  let mergedCenterVertices = 0;
  let mirroredVertices = 0;

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const offset = vertex * 3;
    const coordinate = positions[offset + axisIndex];
    if (Math.abs(coordinate) <= mergeDistance) {
      // Snap only the evaluated copy. The editable half-mesh remains untouched.
      points[offset + axisIndex] = 0;
      reflectedVertex[vertex] = vertex;
      mergedCenterVertices++;
      continue;
    }

    const nextId = points.length / 3;
    const reflected = [positions[offset], positions[offset + 1], positions[offset + 2]];
    reflected[axisIndex] = -coordinate;
    points.push(...reflected);
    reflectedVertex[vertex] = nextId;
    mirroredVertices++;
  }

  const outputIndices = Array.from(indices);
  let mirroredTriangles = 0;
  let skippedCenterPlaneTriangles = 0;
  let skippedCollapsedTriangles = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset], b = indices[offset + 1], c = indices[offset + 2];
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
      mergedCenterVertices,
      mirroredVertices,
      mirroredTriangles,
      skippedCenterPlaneTriangles,
      skippedCollapsedTriangles
    }
  };
}
