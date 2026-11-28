/**
 * Partitions a face selection into independent, safe planar regions.
 * Components are connected through shared edges. Components that only touch
 * at a vertex are rejected because independent operations would otherwise
 * compete for the same source vertex.
 */
export function analyzeSelectedFaceRegions(mesh, faceIds, {
  requirePlanar = true,
  requireSingleSimpleBoundary = true
} = {}) {
  const fail = reason => ({ valid: false, reason, regions: [], analysis: null });
  if (!mesh || !Array.isArray(faceIds) || !faceIds.length || typeof mesh.analyzeFaceRegion !== 'function') {
    return fail('Select one or more valid faces.');
  }

  const analysis = mesh.analyzeFaceRegion(faceIds);
  if (!analysis?.valid) return fail(analysis?.reason || 'The selected face regions could not be analyzed.');
  const components = Array.isArray(analysis.components) && analysis.components.length
    ? analysis.components.map(component => [...component].sort((a, b) => a - b))
    : [[...new Set(faceIds)].sort((a, b) => a - b)];
  const vertexOwners = new Map();
  const regions = [];

  for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
    const component = components[componentIndex];
    const detail = mesh.analyzeFaceRegion(component);
    if (!detail?.valid || !detail.connected) {
      return fail(detail?.reason || `Selected region ${componentIndex + 1} is not one connected face component.`);
    }
    if (requirePlanar && !detail.planar) {
      return fail(`Selected region ${componentIndex + 1} is not planar. Extrude, Inset and shared-region Face Bevel need planar components.`);
    }
    if (requireSingleSimpleBoundary &&
        (detail.loopCount !== 1 || !detail.singleSimpleBoundary || !detail.boundaryLoops?.[0]?.isSimple)) {
      return fail(`Selected region ${componentIndex + 1} must have one simple boundary with no holes.`);
    }

    const vertexIds = [...new Set(component.flatMap(faceId => mesh.faces[faceId] || []))].sort((a, b) => a - b);
    for (const vertexId of vertexIds) {
      const previous = vertexOwners.get(vertexId);
      if (previous !== undefined && previous !== componentIndex) {
        return fail('Separate selected regions touch at a shared vertex. Select regions with no shared vertices so each can be edited independently.');
      }
      vertexOwners.set(vertexId, componentIndex);
    }
    regions.push({ faceIds: component, vertexIds, analysis: detail });
  }

  return { valid: regions.length > 0, reason: '', regions, analysis };
}
