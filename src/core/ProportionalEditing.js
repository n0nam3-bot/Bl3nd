/**
 * Topology- and surface-aware proportional-editing influence.
 * Distances follow existing mesh edges (not straight-line proximity). At a
 * vertex, incident faces are separated into smooth fans so a sharp crease or
 * ambiguous non-manifold junction cannot become a shortcut between surfaces.
 * The helper is read-only and returns one disjoint influence set per selected
 * transform region.
 */

const MIN_RADIUS = 0.01;
const MAX_RADIUS = 1000000;
const EPSILON = 1e-10;
const DEFAULT_SHARP_ANGLE_DEGREES = 55;

export function normalizeProportionalSettings(input = {}, base = {}) {
  const source = { ...base, ...input };
  const radius = Number(source.radius);
  const falloff = ['smooth', 'linear', 'sharp', 'root', 'sphere'].includes(source.falloff)
    ? source.falloff : 'smooth';
  return {
    enabled: Boolean(source.enabled),
    radius: Number.isFinite(radius) ? Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, radius)) : 1,
    falloff
  };
}

export function proportionalFalloffWeight(distance, radius, falloff = 'smooth') {
  const safeRadius = Number(radius);
  const safeDistance = Number(distance);
  if (!Number.isFinite(safeRadius) || safeRadius <= 0 || !Number.isFinite(safeDistance) || safeDistance < 0) return 0;
  if (safeDistance <= EPSILON) return 1;
  const t = safeDistance / safeRadius;
  if (t >= 1) return 0;
  const remaining = 1 - t;
  switch (falloff) {
    case 'linear': return remaining;
    case 'sharp': return remaining * remaining;
    case 'root': return Math.sqrt(remaining);
    case 'sphere': return Math.sqrt(Math.max(0, 1 - t * t));
    case 'smooth':
    default: return 1 - (3 * t * t - 2 * t * t * t);
  }
}

class MinHeap {
  constructor() { this.items = []; }
  push(item) {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (items[parent].distance <= item.distance) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }
  pop() {
    const items = this.items;
    if (!items.length) return null;
    const first = items[0];
    const last = items.pop();
    if (items.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1, right = left + 1;
        if (left >= items.length) break;
        const child = right < items.length && items[right].distance < items[left].distance ? right : left;
        if (items[child].distance >= last.distance) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return first;
  }
  get size() { return this.items.length; }
}

function validPoint(point) {
  return Array.isArray(point) && point.length >= 3 && point.slice(0, 3).every(Number.isFinite);
}

function distancesFromSeeds(seedIds, adjacency, radius) {
  const distances = new Float64Array(adjacency.length);
  distances.fill(Infinity);
  const heap = new MinHeap();
  for (const id of seedIds) {
    if (!Number.isInteger(id) || id < 0 || id >= adjacency.length) continue;
    if (distances[id] !== 0) {
      distances[id] = 0;
      heap.push({ id, distance: 0 });
    }
  }
  while (heap.size) {
    const current = heap.pop();
    if (!current || current.distance !== distances[current.id]) continue;
    if (current.distance > radius) break;
    for (const neighbor of adjacency[current.id]) {
      const nextDistance = current.distance + neighbor.length;
      if (nextDistance + EPSILON >= distances[neighbor.id] || nextDistance > radius) continue;
      distances[neighbor.id] = nextDistance;
      heap.push({ id: neighbor.id, distance: nextDistance });
    }
  }
  return distances;
}

function faceNormal(positions, face) {
  if (!Array.isArray(face) || face.length < 3 || new Set(face).size !== face.length ||
      face.some(id => !Number.isInteger(id) || !validPoint(positions[id]))) return null;
  const normal = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const a = positions[face[i]], b = positions[face[(i + 1) % face.length]];
    normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
    normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
    normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const length = Math.hypot(...normal);
  if (!Number.isFinite(length) || length <= EPSILON) return null;
  return normal.map(value => value / length);
}

function addFaceAdjacency(adjacency, vertexId, faceA, faceB) {
  if (!adjacency[vertexId].has(faceA)) adjacency[vertexId].set(faceA, new Set());
  if (!adjacency[vertexId].has(faceB)) adjacency[vertexId].set(faceB, new Set());
  adjacency[vertexId].get(faceA).add(faceB);
  adjacency[vertexId].get(faceB).add(faceA);
}

function faceComponents(faceIds, adjacency) {
  const remaining = new Set(faceIds);
  const components = [];
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const component = [first];
    const queue = [first];
    while (queue.length) {
      const faceId = queue.pop();
      for (const neighbor of adjacency.get(faceId) || []) {
        if (!remaining.delete(neighbor)) continue;
        component.push(neighbor);
        queue.push(neighbor);
      }
    }
    component.sort((a, b) => a - b);
    components.push(component);
  }
  return components;
}

/**
 * Build one graph node per smooth face fan at each source vertex. A sharp edge
 * is traversable along either of its surface sides, but it does not merge the
 * two sides at the shared vertices. Non-manifold/inconsistently wound edges
 * are not traversed, and their endpoints are split into per-face fan nodes.
 */
function buildSurfaceGraph(positions, edges, faces, sharpAngleDegrees) {
  if (!Array.isArray(faces) || !faces.length || !Array.isArray(edges) ||
      !edges.some(edge => Array.isArray(edge?.halfEdges) && edge.halfEdges.length > 0)) return null;

  const faceNormals = faces.map(face => faceNormal(positions, face));
  const incidentFaces = Array.from({ length: positions.length }, () => new Set());
  faces.forEach((face, faceId) => {
    if (!Array.isArray(face)) return;
    for (const vertexId of new Set(face)) {
      if (Number.isInteger(vertexId) && vertexId >= 0 && vertexId < positions.length && validPoint(positions[vertexId])) {
        incidentFaces[vertexId].add(faceId);
      }
    }
  });

  const smoothAdjacency = Array.from({ length: positions.length }, () => new Map());
  const topologyAdjacency = Array.from({ length: positions.length }, () => new Map());
  const unsafeVertices = new Set();
  const linkSpecs = [];
  const seenEdges = new Set();
  const cosineLimit = Math.cos(Math.max(0, Math.min(180, sharpAngleDegrees)) * Math.PI / 180);
  const guards = { sharpEdges: 0, nonManifoldEdges: 0, inconsistentEdges: 0, unstableNormalEdges: 0, nonManifoldVertices: 0 };

  for (const edge of edges) {
    const pair = edge?.vertices;
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [a, b] = pair;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || a < 0 || b < 0 ||
        a >= positions.length || b >= positions.length || !validPoint(positions[a]) || !validPoint(positions[b])) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    const length = Math.hypot(
      positions[a][0] - positions[b][0],
      positions[a][1] - positions[b][1],
      positions[a][2] - positions[b][2]
    );
    if (!Number.isFinite(length) || length <= EPSILON) {
      unsafeVertices.add(a); unsafeVertices.add(b);
      continue;
    }

    const halfEdges = Array.isArray(edge.halfEdges) ? edge.halfEdges : [];
    const faceIds = [...new Set(halfEdges.map(item => item?.face?.id)
      .filter(id => Number.isInteger(id) && id >= 0 && id < faces.length))];
    if (halfEdges.length === 1 && faceIds.length === 1) {
      if (!faceNormals[faceIds[0]]) {
        guards.unstableNormalEdges++;
        unsafeVertices.add(a); unsafeVertices.add(b);
        continue;
      }
      linkSpecs.push({ a, b, length, faceIds, sideMode: 'single' });
      continue;
    }
    if (halfEdges.length === 2 && faceIds.length === 2) {
      const [first, second] = halfEdges;
      if (first?.twin !== second || second?.twin !== first) {
        guards.inconsistentEdges++;
        unsafeVertices.add(a); unsafeVertices.add(b);
        continue;
      }
      const normalA = faceNormals[faceIds[0]], normalB = faceNormals[faceIds[1]];
      if (!normalA || !normalB) {
        guards.unstableNormalEdges++;
        unsafeVertices.add(a); unsafeVertices.add(b);
        continue;
      }
      addFaceAdjacency(topologyAdjacency, a, faceIds[0], faceIds[1]);
      addFaceAdjacency(topologyAdjacency, b, faceIds[0], faceIds[1]);
      const dot = Math.max(-1, Math.min(1, normalA.reduce((sum, value, axis) => sum + value * normalB[axis], 0)));
      if (dot <= cosineLimit + EPSILON) {
        guards.sharpEdges++;
        linkSpecs.push({ a, b, length, faceIds, sideMode: 'separate' });
      } else {
        addFaceAdjacency(smoothAdjacency, a, faceIds[0], faceIds[1]);
        addFaceAdjacency(smoothAdjacency, b, faceIds[0], faceIds[1]);
        linkSpecs.push({ a, b, length, faceIds, sideMode: 'smooth' });
      }
      continue;
    }
    if (halfEdges.length > 2) {
      guards.nonManifoldEdges++;
      unsafeVertices.add(a); unsafeVertices.add(b);
      continue;
    }
    // Missing/duplicate face references or malformed edge fans are ambiguous.
    if (halfEdges.length > 0) {
      guards.inconsistentEdges++;
      unsafeVertices.add(a); unsafeVertices.add(b);
    }
  }

  const adjacency = [];
  const nodeVertices = [];
  const vertexNodes = Array.from({ length: positions.length }, () => []);
  const nodeForVertexFace = Array.from({ length: positions.length }, () => new Map());
  for (let vertexId = 0; vertexId < positions.length; vertexId++) {
    const faceIds = [...incidentFaces[vertexId]].sort((a, b) => a - b);
    if (!faceIds.length) {
      const nodeId = adjacency.length;
      adjacency.push([]); nodeVertices.push(vertexId); vertexNodes[vertexId].push(nodeId);
      continue;
    }
    const components = unsafeVertices.has(vertexId)
      ? faceIds.map(faceId => [faceId])
      : faceComponents(faceIds, smoothAdjacency[vertexId]);
    const topologyComponents = faceComponents(faceIds, topologyAdjacency[vertexId]);
    if (unsafeVertices.has(vertexId) || topologyComponents.length > 1) guards.nonManifoldVertices++;
    for (const component of components) {
      const nodeId = adjacency.length;
      adjacency.push([]); nodeVertices.push(vertexId); vertexNodes[vertexId].push(nodeId);
      for (const faceId of component) nodeForVertexFace[vertexId].set(faceId, nodeId);
    }
  }

  const linkedNodes = new Set();
  const connect = (nodeA, nodeB, length) => {
    if (!Number.isInteger(nodeA) || !Number.isInteger(nodeB) || nodeA === nodeB) return;
    const key = nodeA < nodeB ? `${nodeA}:${nodeB}` : `${nodeB}:${nodeA}`;
    if (linkedNodes.has(key)) return;
    linkedNodes.add(key);
    adjacency[nodeA].push({ id: nodeB, length });
    adjacency[nodeB].push({ id: nodeA, length });
  };
  for (const spec of linkSpecs) {
    const sideFaces = spec.sideMode === 'separate' ? spec.faceIds : [spec.faceIds[0]];
    for (const faceId of sideFaces) {
      connect(nodeForVertexFace[spec.a].get(faceId), nodeForVertexFace[spec.b].get(faceId), spec.length);
    }
  }
  return { adjacency, nodeVertices, vertexNodes, nodeForVertexFace, guards, sharpAngleDegrees };
}

function buildLegacyGraph(positions, edges) {
  const adjacency = Array.from({ length: positions.length }, () => []);
  const seenEdges = new Set();
  for (const edge of Array.isArray(edges) ? edges : []) {
    const pair = edge?.vertices;
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [a, b] = pair;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || a < 0 || b < 0 ||
        a >= positions.length || b >= positions.length || !validPoint(positions[a]) || !validPoint(positions[b])) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    const length = Math.hypot(
      positions[a][0] - positions[b][0],
      positions[a][1] - positions[b][1],
      positions[a][2] - positions[b][2]
    );
    if (!Number.isFinite(length) || length <= EPSILON) continue;
    adjacency[a].push({ id: b, length });
    adjacency[b].push({ id: a, length });
  }
  return {
    adjacency,
    nodeVertices: positions.map((_, id) => id),
    vertexNodes: positions.map((_, id) => [id]),
    nodeForVertexFace: null,
    guards: { sharpEdges: 0, nonManifoldEdges: 0, inconsistentEdges: 0, unstableNormalEdges: 0, nonManifoldVertices: 0 }
  };
}

/**
 * @param {object} input
 * @param {number[][]} input.positions World-space positions, indexed by vertex ID.
 * @param {{vertices:number[],halfEdges?:object[]}[]} input.edges Half-edge mesh edge records.
 * @param {number[][]} input.faces Optional face vertex loops used for surface-normal guards.
 * @param {number[][]} input.seedGroups Disjoint selected vertex groups.
 * @param {number[][]} [input.seedFaceGroups] Optional selected face context per seed group.
 * @param {number} input.radius World-space geodesic influence radius.
 * @param {string} [input.falloff='smooth'] One of smooth/linear/sharp/root/sphere.
 * @param {number} [input.sharpAngleDegrees=55] Edges at/above this dihedral angle split surface fans.
 * @returns {{groups:{vertexId:number,weight:number,distance:number}[][],influencedCount:number,guards:object}}
 */
export function buildProportionalInfluence({
  positions = [], edges = [], faces = null, seedGroups = [], seedFaceGroups = null,
  radius = 1, falloff = 'smooth', sharpAngleDegrees = DEFAULT_SHARP_ANGLE_DEGREES
} = {}) {
  if (!Array.isArray(positions) || !positions.length || !Array.isArray(seedGroups) || !seedGroups.length) {
    return { groups: [], influencedCount: 0 };
  }
  const settings = normalizeProportionalSettings({ radius, falloff });
  const safeRadius = settings.radius;
  const safeFalloff = settings.falloff;
  const angle = Number.isFinite(Number(sharpAngleDegrees))
    ? Math.max(0, Math.min(180, Number(sharpAngleDegrees))) : DEFAULT_SHARP_ANGLE_DEGREES;
  const graph = buildSurfaceGraph(positions, edges, faces, angle) || buildLegacyGraph(positions, edges);
  const normalizedSeeds = seedGroups.map(group => [...new Set((Array.isArray(group) ? group : [])
    .filter(id => Number.isInteger(id) && id >= 0 && id < positions.length && validPoint(positions[id]))) ]);
  const groupDistances = normalizedSeeds.map((seedIds, groupIndex) => {
    const contextualFaces = Array.isArray(seedFaceGroups?.[groupIndex])
      ? new Set(seedFaceGroups[groupIndex].filter(id => Number.isInteger(id) && id >= 0)) : null;
    const seedNodes = new Set();
    for (const vertexId of seedIds) {
      const nodes = graph.vertexNodes[vertexId] || [];
      if (contextualFaces?.size && graph.nodeForVertexFace) {
        for (const faceId of contextualFaces) {
          const nodeId = graph.nodeForVertexFace[vertexId]?.get(faceId);
          if (Number.isInteger(nodeId)) seedNodes.add(nodeId);
        }
        // A malformed/incomplete face context must never drop selected seeds.
        let matchedContext = false;
        for (const faceId of contextualFaces) {
          if (graph.nodeForVertexFace[vertexId]?.has(faceId)) { matchedContext = true; break; }
        }
        if (!matchedContext) for (const nodeId of nodes) seedNodes.add(nodeId);
      } else {
        for (const nodeId of nodes) seedNodes.add(nodeId);
      }
    }
    const nodeDistances = distancesFromSeeds([...seedNodes], graph.adjacency, safeRadius);
    const vertexDistances = new Float64Array(positions.length);
    vertexDistances.fill(Infinity);
    nodeDistances.forEach((distance, nodeId) => {
      const vertexId = graph.nodeVertices[nodeId];
      if (Number.isInteger(vertexId) && distance < vertexDistances[vertexId]) vertexDistances[vertexId] = distance;
    });
    return vertexDistances;
  });

  const bestDistance = new Float64Array(positions.length);
  bestDistance.fill(Infinity);
  const bestGroup = new Int32Array(positions.length);
  bestGroup.fill(-1);
  groupDistances.forEach((distances, groupIndex) => {
    for (let vertexId = 0; vertexId < distances.length; vertexId++) {
      const distance = distances[vertexId];
      if (!Number.isFinite(distance) || distance > safeRadius) continue;
      if (distance + EPSILON < bestDistance[vertexId] ||
          (Math.abs(distance - bestDistance[vertexId]) <= EPSILON && (bestGroup[vertexId] < 0 || groupIndex < bestGroup[vertexId]))) {
        bestDistance[vertexId] = distance;
        bestGroup[vertexId] = groupIndex;
      }
    }
  });

  const groups = normalizedSeeds.map(() => []);
  let influencedCount = 0;
  for (let vertexId = 0; vertexId < bestGroup.length; vertexId++) {
    const groupIndex = bestGroup[vertexId];
    if (groupIndex < 0) continue;
    const distance = bestDistance[vertexId];
    const weight = proportionalFalloffWeight(distance, safeRadius, safeFalloff);
    if (weight <= EPSILON) continue;
    groups[groupIndex].push({ vertexId, weight: distance <= EPSILON ? 1 : weight, distance });
    if (distance > EPSILON && weight > EPSILON) influencedCount++;
  }
  groups.forEach(group => group.sort((a, b) => a.vertexId - b.vertexId));
  return { groups, influencedCount, guards: graph.guards };
}
