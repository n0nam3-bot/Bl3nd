/**
 * Resolve a transform pivot from a set of selected local-space positions.
 * `bounds` returns the axis-aligned selection bounds center; other modes use
 * the arithmetic median point. Cursor and object-origin pivots are resolved
 * by ModalTransform because they live outside the selected point set.
 */
export function resolveTransformPivotPoint(points, mode = 'median') {
  if (!Array.isArray(points) || points.length === 0) return null;
  const valid = points.filter(point => Array.isArray(point) && point.length >= 3 &&
    point.slice(0, 3).every(value => Number.isFinite(Number(value))))
    .map(point => point.slice(0, 3).map(Number));
  if (!valid.length) return null;

  if (mode === 'bounds') {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const point of valid) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
    return min.map((value, axis) => (value + max[axis]) * 0.5);
  }

  const sum = [0, 0, 0];
  for (const point of valid) for (let axis = 0; axis < 3; axis++) sum[axis] += point[axis];
  return sum.map(value => value / valid.length);
}

/**
 * Group the vertices participating in an Edit Mode transform into connected
 * selected regions. Selected faces contribute all of their vertices, selected
 * edges contribute their endpoints, and selected vertices connect only when
 * an actual mesh edge joins two of them. Any shared topology vertex merges the
 * affected selections into one group, so one welded vertex is never assigned
 * two different per-region transforms.
 *
 * The helper is deliberately read-only and returns sorted, disjoint vertex ID
 * lists. It does not duplicate vertices or mutate selection/topology data.
 */
export function groupSelectedTransformVertices({
  positions = [],
  vertexIds = [],
  edgeIds = [],
  faceIds = [],
  edges = [],
  faces = []
} = {}) {
  if (!Array.isArray(positions) || !positions.length) return [];
  const validVertex = id => Number.isInteger(id) && id >= 0 && id < positions.length &&
    Array.isArray(positions[id]) && positions[id].length >= 3 &&
    positions[id].slice(0, 3).every(Number.isFinite);
  const parent = new Map();
  const find = id => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const add = id => {
    if (!validVertex(id)) return false;
    if (!parent.has(id)) parent.set(id, id);
    return true;
  };
  const join = (a, b) => {
    if (!add(a) || !add(b)) return;
    const rootA = find(a), rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };
  const addPrimitive = ids => {
    const valid = [...new Set((ids || []).filter(validVertex))];
    valid.forEach(add);
    for (let index = 1; index < valid.length; index++) join(valid[0], valid[index]);
  };

  for (const id of vertexIds || []) add(id);
  for (const edgeId of edgeIds || []) addPrimitive(edges[edgeId]?.vertices);
  for (const faceId of faceIds || []) addPrimitive(faces[faceId]);

  // Vertex-only selections connect across real mesh edges only when both
  // endpoints were explicitly selected as vertices. Do not let an unselected
  // edge from some other face bridge two otherwise disconnected face groups.
  const explicitlySelectedVertices = new Set((vertexIds || []).filter(validVertex));
  for (const edge of edges || []) {
    const pair = edge?.vertices;
    if (Array.isArray(pair) && pair.length >= 2 &&
        explicitlySelectedVertices.has(pair[0]) && explicitlySelectedVertices.has(pair[1])) {
      join(pair[0], pair[1]);
    }
  }

  const groups = new Map();
  for (const id of [...parent.keys()].sort((a, b) => a - b)) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()].sort((a, b) => a[0] - b[0]);
}
