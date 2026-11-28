export const MOBILE_MODIFIER_BUDGET = Object.freeze({
  tier: 'Mobile',
  maxWorkingBytes: 96 * 1024 * 1024,
  maxVertices: 180_000,
  maxTriangles: 300_000
});

export const LOW_MEMORY_MOBILE_MODIFIER_BUDGET = Object.freeze({
  tier: 'Mobile',
  maxWorkingBytes: 48 * 1024 * 1024,
  maxVertices: 100_000,
  maxTriangles: 160_000
});

export const DESKTOP_MODIFIER_BUDGET = Object.freeze({
  tier: 'PC',
  maxWorkingBytes: 384 * 1024 * 1024,
  maxVertices: 1_200_000,
  maxTriangles: 2_400_000
});

export function getModifierBudget({ tier = 'Mobile', memory = null } = {}) {
  if (tier !== 'PC') {
    return Number.isFinite(memory) && memory <= 2
      ? LOW_MEMORY_MOBILE_MODIFIER_BUDGET
      : MOBILE_MODIFIER_BUDGET;
  }
  if (Number.isFinite(memory) && memory <= 4) {
    return Object.freeze({
      tier: 'PC', maxWorkingBytes: 192 * 1024 * 1024,
      maxVertices: 700_000, maxTriangles: 1_400_000
    });
  }
  return DESKTOP_MODIFIER_BUDGET;
}

function countUniqueEdges(faces, fallbackTriangles) {
  // Count every directed face edge as distinct. This is a cheap upper bound
  // that avoids allocating a large Set during the memory preflight itself.
  if (!Array.isArray(faces) || !faces.length) return fallbackTriangles * 3;
  let edgeUpperBound = 0;
  for (const face of faces) if (Array.isArray(face)) edgeUpperBound += face.length;
  return edgeUpperBound;
}

function estimateBytes({ vertices, triangles, faces, edges, corners }) {
  // Includes typed buffers, JS-side topology maps/sets and both the previous and
  // candidate buffers. It is deliberately conservative rather than a heap promise.
  const typedBuffers = vertices * 12 + triangles * 12;
  const topologyScratch = vertices * 112 + edges * 104 + faces * 112 + corners * 20;
  return Math.ceil((typedBuffers + topologyScratch) * 2.25);
}

/** Estimate the largest in-flight stage before any input buffers are transferred. */
export function estimateModifierWorkingSet({ positions, indices, faces = null, modifiers = [] }) {
  const initialVertices = Number(positions?.length || 0) / 3;
  const initialTriangles = Number(indices?.length || 0) / 3;
  if (!Number.isInteger(initialVertices) || !Number.isInteger(initialTriangles)) {
    throw new Error('Modifier evaluation rejected: the source geometry buffers are invalid.');
  }

  let vertices = initialVertices;
  let triangles = initialTriangles;
  let faceCount = Array.isArray(faces) ? faces.length : initialTriangles;
  let corners = Array.isArray(faces) && faces.length
    ? faces.reduce((sum, face) => sum + (Array.isArray(face) ? face.length : 0), 0)
    : initialTriangles * 3;
  let edges = countUniqueEdges(faces, initialTriangles);
  let peakBytes = estimateBytes({ vertices, triangles, faces: faceCount, edges, corners });
  const stages = [];

  for (const modifier of modifiers || []) {
    if (modifier?.enabled === false) continue;
    const type = modifier?.type;
    const before = { vertices, triangles, faces: faceCount, edges, corners };

    if (type === 'subdivision') {
      const level = Math.max(1, Math.min(3, Math.round(Number(modifier.level) || 1)));
      for (let pass = 0; pass < level; pass++) {
        const nextFaces = corners;
        const nextVertices = vertices + edges + faceCount;
        const nextEdges = edges * 2 + corners;
        const nextCorners = nextFaces * 4;
        const nextTriangles = nextFaces * 2;
        peakBytes = Math.max(peakBytes,
          estimateBytes(before),
          estimateBytes({ vertices: nextVertices, triangles: nextTriangles, faces: nextFaces, edges: nextEdges, corners: nextCorners }));
        vertices = nextVertices;
        triangles = nextTriangles;
        faceCount = nextFaces;
        edges = nextEdges;
        corners = nextCorners;
      }
    } else if (type === 'mirror') {
      if (modifier?.bisect !== false) {
        // Bisect can create one shared intersection per crossed source edge,
        // then reflect a clipped triangle set that can contain up to twice as
        // many triangles as the original indexed surface.
        vertices = (vertices + edges) * 2;
        triangles *= 4;
      } else {
        vertices *= 2;
        triangles *= 2;
      }
      edges = Math.ceil(triangles * 1.5);
      faceCount = triangles;
      corners = triangles * 3;
      peakBytes = Math.max(peakBytes, estimateBytes(before), estimateBytes({ vertices, triangles, faces: faceCount, edges, corners }));
    } else if (type === 'solidify') {
      const boundaryEdgesUpperBound = Math.min(edges, triangles * 3);
      vertices *= 2;
      triangles = triangles * 2 + boundaryEdgesUpperBound * 2;
      edges = Math.ceil(triangles * 1.5);
      faceCount = triangles;
      corners = triangles * 3;
      peakBytes = Math.max(peakBytes, estimateBytes(before), estimateBytes({ vertices, triangles, faces: faceCount, edges, corners }));
    } else if (type === 'array') {
      const copies = Math.max(1, Math.min(20, Math.round(Number(modifier.count) || 2)));
      vertices *= copies;
      triangles *= copies;
      edges *= copies;
      faceCount *= copies;
      corners *= copies;
      peakBytes = Math.max(peakBytes, estimateBytes(before), estimateBytes({ vertices, triangles, faces: faceCount, edges, corners }));
    } else {
      stages.push({ type: type || 'unknown', vertices, triangles, estimatedBytes: peakBytes });
      continue;
    }
    stages.push({ type, vertices, triangles, estimatedBytes: peakBytes });
  }

  return {
    sourceVertices: initialVertices,
    sourceTriangles: initialTriangles,
    estimatedVertices: vertices,
    estimatedTriangles: triangles,
    estimatedWorkingBytes: peakBytes,
    stages
  };
}

export function validateModifierBudget(estimate, budget = MOBILE_MODIFIER_BUDGET) {
  const maxBytes = Number(budget.maxWorkingBytes) || MOBILE_MODIFIER_BUDGET.maxWorkingBytes;
  const maxVertices = Number(budget.maxVertices) || MOBILE_MODIFIER_BUDGET.maxVertices;
  const maxTriangles = Number(budget.maxTriangles) || MOBILE_MODIFIER_BUDGET.maxTriangles;
  const formatMB = bytes => `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (estimate.estimatedVertices > maxVertices || estimate.estimatedTriangles > maxTriangles || estimate.estimatedWorkingBytes > maxBytes) {
    throw new Error(
      `Modifier stack paused for ${budget.tier || 'this device'} safety: estimated ${estimate.estimatedVertices.toLocaleString()} vertices, ` +
      `${estimate.estimatedTriangles.toLocaleString()} triangles and ${formatMB(estimate.estimatedWorkingBytes)} working memory. ` +
      `This device limit is ${maxVertices.toLocaleString()} vertices, ${maxTriangles.toLocaleString()} triangles and ${formatMB(maxBytes)}. ` +
      'Lower Subdivision levels or reduce the source mesh.'
    );
  }
  return estimate;
}
