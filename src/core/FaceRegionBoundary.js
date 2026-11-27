function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

function newellNormal(positions, face) {
  const normal = [0, 0, 0];
  for (let index = 0; index < face.length; index++) {
    const a = positions[face[index]];
    const b = positions[face[(index + 1) % face.length]];
    if (!a || !b) return null;
    normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
    normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
    normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const length = Math.hypot(...normal);
  return length > 1e-12 ? normal.map(value => value / length) : null;
}

function cross2(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area * 0.5;
}

function pointOnSegment(point, a, b, epsilon) {
  if (Math.abs(cross2(a, b, point)) > epsilon) return false;
  return (point[0] - a[0]) * (point[0] - b[0]) +
    (point[1] - a[1]) * (point[1] - b[1]) <= epsilon;
}

function segmentsIntersect(a, b, c, d, epsilon) {
  const abC = cross2(a, b, c), abD = cross2(a, b, d);
  const cdA = cross2(c, d, a), cdB = cross2(c, d, b);
  if (((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
      ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))) return true;
  return (Math.abs(abC) <= epsilon && pointOnSegment(c, a, b, epsilon)) ||
    (Math.abs(abD) <= epsilon && pointOnSegment(d, a, b, epsilon)) ||
    (Math.abs(cdA) <= epsilon && pointOnSegment(a, c, d, epsilon)) ||
    (Math.abs(cdB) <= epsilon && pointOnSegment(b, c, d, epsilon));
}

function loopSelfIntersects(points, epsilon) {
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    for (let other = index + 1; other < points.length; other++) {
      if (other === index || other === (index + 1) % points.length ||
          (other + 1) % points.length === index) continue;
      if (segmentsIntersect(a, b, points[other], points[(other + 1) % points.length], epsilon)) return true;
    }
  }
  return false;
}

function pointInPolygon(point, polygon, epsilon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (pointOnSegment(point, a, b, epsilon)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1])) {
      const crossingX = (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0];
      if (point[0] < crossingX) inside = !inside;
    }
  }
  return inside;
}

function makePlaneBasis(normal) {
  const reference = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const normalize = vector => {
    const length = Math.hypot(...vector);
    return length > 1e-12 ? vector.map(value => value / length) : null;
  };
  const u = normalize(cross(reference, normal));
  const v = u && normalize(cross(normal, u));
  return u && v ? { u, v } : null;
}

function invalid(reason, details = {}) {
  return {
    valid: false,
    reason,
    faceIds: [],
    components: [],
    boundaryLoops: [],
    boundaryEdges: 0,
    loopCount: 0,
    connected: false,
    planar: false,
    windingConsistent: false,
    geometryIssues: [],
    ...details
  };
}

/**
 * Read-only analysis of a selected face set. It extracts every oriented boundary
 * loop without assuming that the selection is one polygon. Geometry flags are
 * kept separate from topology validity so callers can make conservative choices
 * for concavity, holes, multiple islands and non-planar regions.
 */
export function analyzeFaceRegionBoundary(positions, faces, faceIds, options = {}) {
  if (!Array.isArray(positions) || !Array.isArray(faces) || !Array.isArray(faceIds) || !faceIds.length) {
    return invalid('Select at least one valid face.');
  }

  const selected = [...new Set(faceIds)].sort((a, b) => a - b);
  if (selected.length !== faceIds.length || selected.some(id => !Number.isInteger(id) || !Array.isArray(faces[id]))) {
    return invalid('Face-region selection contains duplicate or invalid face IDs.');
  }

  const edgeUses = new Map();
  const adjacency = new Map(selected.map(id => [id, new Set()]));
  const scalePositions = new Set();

  for (const faceId of selected) {
    const face = faces[faceId];
    if (face.length < 3 || new Set(face).size !== face.length || face.some(id =>
      !Number.isInteger(id) || !positions[id] || positions[id].length < 3 || !positions[id].slice(0, 3).every(Number.isFinite))) {
      return invalid(`Selected face ${faceId} is malformed or has invalid vertices.`);
    }
    for (const vertexId of face) scalePositions.add(vertexId);
    for (let index = 0; index < face.length; index++) {
      const a = face[index], b = face[(index + 1) % face.length];
      if (a === b) return invalid(`Selected face ${faceId} contains a zero-length topological edge.`);
      const key = edgeKey(a, b);
      if (!edgeUses.has(key)) edgeUses.set(key, []);
      edgeUses.get(key).push({ a, b, faceId, key });
    }
  }

  const boundary = [];
  for (const [key, uses] of edgeUses) {
    if (uses.length > 2) return invalid(`Selected region contains non-manifold edge ${key}.`, { edgeKey: key });
    if (uses.length === 1) {
      boundary.push(uses[0]);
      continue;
    }
    if (uses[0].a === uses[1].a && uses[0].b === uses[1].b) {
      return invalid(`Selected faces have inconsistent winding across edge ${key}.`, { edgeKey: key });
    }
    adjacency.get(uses[0].faceId).add(uses[1].faceId);
    adjacency.get(uses[1].faceId).add(uses[0].faceId);
  }

  const components = [];
  const seenFaces = new Set();
  for (const seed of selected) {
    if (seenFaces.has(seed)) continue;
    const component = [];
    const queue = [seed];
    seenFaces.add(seed);
    while (queue.length) {
      const faceId = queue.shift();
      component.push(faceId);
      for (const neighbor of adjacency.get(faceId) || []) {
        if (!seenFaces.has(neighbor)) {
          seenFaces.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component.sort((a, b) => a - b));
  }

  const outgoing = new Map(), incoming = new Map();
  for (const edge of boundary) {
    if (outgoing.has(edge.a) || incoming.has(edge.b)) {
      return invalid('Select one connected planar face region: its boundary branches or touches itself at a vertex.', {
        faceIds: selected, components, boundaryEdges: boundary.length, connected: components.length === 1
      });
    }
    outgoing.set(edge.a, edge);
    incoming.set(edge.b, edge);
  }
  for (const edge of boundary) {
    if (!incoming.has(edge.a) || !outgoing.has(edge.b)) {
      return invalid('Face-region boundary is open or inconsistently oriented.', {
        faceIds: selected, components, boundaryEdges: boundary.length, connected: components.length === 1
      });
    }
  }

  const componentForFace = new Map();
  components.forEach((component, componentId) => component.forEach(faceId => componentForFace.set(faceId, componentId)));

  const boundaryLoops = [];
  const visitedEdges = new Set();
  for (const seed of boundary) {
    if (visitedEdges.has(seed.key)) continue;
    const vertexIds = [];
    const edgeKeys = [];
    let edge = seed;
    for (let guard = 0; guard <= boundary.length; guard++) {
      if (!edge || visitedEdges.has(edge.key)) {
        if (edge?.key === seed.key) break;
        return invalid('Face-region boundary traversal encountered a duplicate or open edge.', {
          faceIds: selected, components, boundaryEdges: boundary.length, connected: components.length === 1
        });
      }
      visitedEdges.add(edge.key);
      vertexIds.push(edge.a);
      edgeKeys.push(edge.key);
      edge = outgoing.get(edge.b);
      if (edge?.key === seed.key) break;
    }
    if (!edge || edge.key !== seed.key || vertexIds.length < 3) {
      return invalid('Face-region boundary does not form closed loops.', {
        faceIds: selected, components, boundaryEdges: boundary.length, connected: components.length === 1
      });
    }
    boundaryLoops.push({ vertexIds, edgeKeys, componentId: componentForFace.get(seed.faceId) });
  }

  const firstFace = faces[selected[0]];
  const normal = newellNormal(positions, firstFace);
  const origin = normal ? [...positions[firstFace[0]]] : null;
  const allPoints = [...scalePositions].map(id => positions[id]);
  const bounds = [0, 1, 2].map(axis => {
    const values = allPoints.map(point => point[axis]);
    return [Math.min(...values), Math.max(...values)];
  });
  const scale = Math.max(1, ...bounds.map(([min, max]) => max - min));
  const tolerance = Math.max(1e-9, scale * (Number.isFinite(options.planarityTolerance) ? options.planarityTolerance : 1e-5));
  let maxPlanarityDeviation = 0;
  let planar = Boolean(normal);
  const geometryIssues = [];

  if (normal && origin) {
    for (const faceId of selected) {
      const face = faces[faceId];
      const faceNormal = newellNormal(positions, face);
      if (!faceNormal) {
        planar = false;
        geometryIssues.push(`face-${faceId}-degenerate`);
        continue;
      }
      const alignment = Math.abs(faceNormal.reduce((sum, value, axis) => sum + value * normal[axis], 0));
      if (alignment < 0.999) planar = false;
      for (const vertexId of face) {
        const point = positions[vertexId];
        const deviation = Math.abs(normal.reduce((sum, value, axis) => sum + value * (point[axis] - origin[axis]), 0));
        maxPlanarityDeviation = Math.max(maxPlanarityDeviation, deviation);
      }
    }
    if (maxPlanarityDeviation > tolerance) planar = false;
  }
  if (!planar) geometryIssues.push('non-planar-or-degenerate-region');

  let basis = normal && makePlaneBasis(normal);
  let projectedLoops = [];
  if (planar && basis && origin) {
    projectedLoops = boundaryLoops.map(loop => loop.vertexIds.map(vertexId => {
      const delta = positions[vertexId].map((value, axis) => value - origin[axis]);
      return [
        delta.reduce((sum, value, axis) => sum + value * basis.u[axis], 0),
        delta.reduce((sum, value, axis) => sum + value * basis.v[axis], 0)
      ];
    }));
    const areaScale = Math.max(1, ...projectedLoops.flat().map(point => Math.max(Math.abs(point[0]), Math.abs(point[1]))));
    const epsilon = areaScale * areaScale * 1e-10;
    for (let index = 0; index < boundaryLoops.length; index++) {
      const loopPoints = projectedLoops[index];
      const area = signedArea(loopPoints);
      const selfIntersecting = loopSelfIntersects(loopPoints, epsilon);
      boundaryLoops[index].signedArea = area;
      boundaryLoops[index].absoluteArea = Math.abs(area);
      boundaryLoops[index].selfIntersecting = selfIntersecting;
      boundaryLoops[index].perimeter = loopPoints.reduce((sum, point, pointIndex) => {
        const next = loopPoints[(pointIndex + 1) % loopPoints.length];
        return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
      }, 0);
      if (Math.abs(area) <= epsilon) geometryIssues.push(`loop-${index}-degenerate`);
      if (selfIntersecting) geometryIssues.push(`loop-${index}-self-intersecting`);
    }

    for (let a = 0; a < projectedLoops.length; a++) {
      for (let b = a + 1; b < projectedLoops.length; b++) {
        const loopA = projectedLoops[a], loopB = projectedLoops[b];
        let intersects = false;
        for (let i = 0; i < loopA.length && !intersects; i++) {
          for (let j = 0; j < loopB.length; j++) {
            if (segmentsIntersect(loopA[i], loopA[(i + 1) % loopA.length], loopB[j], loopB[(j + 1) % loopB.length], epsilon)) {
              intersects = true;
              break;
            }
          }
        }
        if (intersects) {
          boundaryLoops[a].intersectsOtherLoop = true;
          boundaryLoops[b].intersectsOtherLoop = true;
          geometryIssues.push(`loops-${a}-${b}-intersect`);
        }
      }
    }

    for (let index = 0; index < boundaryLoops.length; index++) {
      const loop = boundaryLoops[index];
      const point = projectedLoops[index][0];
      let depth = 0;
      for (let other = 0; other < boundaryLoops.length; other++) {
        if (other === index || boundaryLoops[other].componentId !== loop.componentId ||
            boundaryLoops[other].absoluteArea <= loop.absoluteArea + epsilon) continue;
        if (pointInPolygon(point, projectedLoops[other], epsilon)) depth++;
      }
      loop.nestingDepth = depth;
      loop.role = depth % 2 === 0 ? 'outer' : 'hole';
      const areaWinding = Math.sign(loop.signedArea);
      const concaveVertexIds = [], convexVertexIds = [], collinearVertexIds = [];
      loop.vertexIds.forEach((vertexId, vertexIndex) => {
        const previous = projectedLoops[index][(vertexIndex - 1 + loop.vertexIds.length) % loop.vertexIds.length];
        const current = projectedLoops[index][vertexIndex];
        const next = projectedLoops[index][(vertexIndex + 1) % loop.vertexIds.length];
        const turn = cross2(previous, current, next);
        const corner = Math.abs(turn) <= epsilon ? 'collinear' : (turn * areaWinding > 0 ? 'convex' : 'concave');
        const regionCorner = loop.role === 'hole'
          ? (corner === 'convex' ? 'concave' : corner === 'concave' ? 'convex' : corner)
          : corner;
        if (regionCorner === 'concave') concaveVertexIds.push(vertexId);
        else if (regionCorner === 'convex') convexVertexIds.push(vertexId);
        else collinearVertexIds.push(vertexId);
      });
      loop.concaveVertexIds = concaveVertexIds;
      loop.convexVertexIds = convexVertexIds;
      loop.collinearVertexIds = collinearVertexIds;
      loop.hasConcaveCorners = concaveVertexIds.length > 0;
      loop.isSimple = !loop.selfIntersecting && !loop.intersectsOtherLoop && Math.abs(loop.signedArea) > epsilon;
    }
  } else {
    for (const loop of boundaryLoops) {
      loop.nestingDepth = null;
      loop.role = 'unclassified';
      loop.selfIntersecting = null;
      loop.intersectsOtherLoop = null;
      loop.concaveVertexIds = [];
      loop.convexVertexIds = [];
      loop.collinearVertexIds = [];
      loop.hasConcaveCorners = null;
      loop.isSimple = null;
    }
  }

  const loopCount = boundaryLoops.length;
  const connected = components.length === 1;
  const geometrySimple = planar && boundaryLoops.length > 0 && boundaryLoops.every(loop => loop.isSimple);
  const singleSimpleBoundary = connected && loopCount === 1 && geometrySimple;
  const hasHoles = boundaryLoops.some(loop => loop.role === 'hole');
  const hasConcaveCorners = boundaryLoops.some(loop => loop.hasConcaveCorners === true);
  const windingConsistent = true;

  return {
    valid: true,
    reason: '',
    faceIds: selected,
    components,
    connected,
    boundaryEdges: boundary.length,
    boundaryLoops,
    loopCount,
    hasHoles,
    hasMultipleLoops: loopCount > 1,
    hasConcaveCorners,
    planar,
    normal: normal ? [...normal] : null,
    origin,
    scale,
    tolerance,
    maxPlanarityDeviation,
    windingConsistent,
    geometryIssues,
    singleSimpleBoundary,
    supportsPlanarSingleBoundary: singleSimpleBoundary && windingConsistent
  };
}
