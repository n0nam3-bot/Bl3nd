/**
 * Topology-aware proportional-editing influence.
 * Distances follow existing mesh edges (not straight-line proximity), so
 * disconnected islands and vertices separated by a thin gap do not influence
 * one another. The helper is read-only and returns one disjoint influence set
 * per selected transform region.
 */

const MIN_RADIUS = 0.01;
const MAX_RADIUS = 1000000;
const EPSILON = 1e-10;

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

function distancesFromSeeds(seedIds, adjacency, positions, radius) {
  const distances = new Float64Array(positions.length);
  distances.fill(Infinity);
  const heap = new MinHeap();
  for (const id of seedIds) {
    if (!Number.isInteger(id) || id < 0 || id >= positions.length || !validPoint(positions[id])) continue;
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

/**
 * @param {object} input
 * @param {number[][]} input.positions World-space positions, indexed by vertex ID.
 * @param {{vertices:number[]}[]} input.edges Half-edge mesh edge records.
 * @param {number[][]} input.seedGroups Disjoint selected vertex groups.
 * @param {number} input.radius World-space geodesic influence radius.
 * @param {string} [input.falloff='smooth'] One of smooth/linear/sharp/root/sphere.
 * @returns {{groups:{vertexId:number,weight:number,distance:number}[][],influencedCount:number}}
 */
export function buildProportionalInfluence({ positions = [], edges = [], seedGroups = [], radius = 1, falloff = 'smooth' } = {}) {
  if (!Array.isArray(positions) || !positions.length || !Array.isArray(seedGroups) || !seedGroups.length) {
    return { groups: [], influencedCount: 0 };
  }
  const safeRadius = normalizeProportionalSettings({ radius, falloff }).radius;
  const safeFalloff = normalizeProportionalSettings({ radius, falloff }).falloff;
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

  const normalizedSeeds = seedGroups.map(group => [...new Set((Array.isArray(group) ? group : [])
    .filter(id => Number.isInteger(id) && id >= 0 && id < positions.length && validPoint(positions[id]))) ]);
  const bestDistance = new Float64Array(positions.length);
  bestDistance.fill(Infinity);
  const bestGroup = new Int32Array(positions.length);
  bestGroup.fill(-1);
  const groupDistances = normalizedSeeds.map(seedIds => distancesFromSeeds(seedIds, adjacency, positions, safeRadius));

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
  return { groups, influencedCount };
}
