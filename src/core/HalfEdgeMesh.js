function keyFor(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

function cross2(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function newellNormal(positions, face) {
  const normal = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const a = positions[face[i]], b = positions[face[(i + 1) % face.length]];
    if (!a || !b) return null;
    normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
    normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
    normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const length = Math.hypot(...normal);
  return length > 1e-12 ? normal.map(value => value / length) : null;
}

function projectedPolygon(positions, face) {
  if (!Array.isArray(face) || face.length < 3 || new Set(face).size !== face.length ||
      face.some(id => !Number.isInteger(id) || !positions[id] || positions[id].length < 3 || !positions[id].every(Number.isFinite))) return null;
  let normal = newellNormal(positions, face);
  // A self-crossing polygon can have zero signed Newell area despite containing
  // a usable plane. Recover a projection normal so validation can identify it.
  if (!normal) {
    const origin = positions[face[0]];
    for (let i = 1; i < face.length - 1 && !normal; i++) {
      const b = positions[face[i]], c = positions[face[i + 1]];
      const u = b.map((value, axis) => value - origin[axis]);
      const v = c.map((value, axis) => value - origin[axis]);
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(...cross);
      if (length > 1e-12) normal = cross.map(value => value / length);
    }
  }
  if (!normal) return null;
  const dropAxis = normal.reduce((best, value, axis) => Math.abs(value) > Math.abs(normal[best]) ? axis : best, 0);
  const points = face.map(id => {
    const p = positions[id];
    return dropAxis === 0 ? [p[1], p[2]] : dropAxis === 1 ? [p[0], p[2]] : [p[0], p[1]];
  });
  const min = [0, 1].map(axis => Math.min(...points.map(point => point[axis])));
  const max = [0, 1].map(axis => Math.max(...points.map(point => point[axis])));
  const scale = Math.max(1, max[0] - min[0], max[1] - min[1]);
  const origin = positions[face[0]];
  const deviation = Math.max(...face.map(id => Math.abs(normal.reduce((sum, value, axis) => sum + value * (positions[id][axis] - origin[axis]), 0))));
  return { normal, points, scale, deviation };
}

function pointOnSegment2D(p, a, b, epsilon) {
  if (Math.abs(cross2(a, b, p)) > epsilon) return false;
  const dot = (p[0] - a[0]) * (p[0] - b[0]) + (p[1] - a[1]) * (p[1] - b[1]);
  return dot <= epsilon;
}

function segmentsIntersect2D(a, b, c, d, epsilon) {
  const abC = cross2(a, b, c), abD = cross2(a, b, d);
  const cdA = cross2(c, d, a), cdB = cross2(c, d, b);
  if (((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
      ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))) return true;
  return (Math.abs(abC) <= epsilon && pointOnSegment2D(c, a, b, epsilon)) ||
    (Math.abs(abD) <= epsilon && pointOnSegment2D(d, a, b, epsilon)) ||
    (Math.abs(cdA) <= epsilon && pointOnSegment2D(a, c, d, epsilon)) ||
    (Math.abs(cdB) <= epsilon && pointOnSegment2D(b, c, d, epsilon));
}

function polygonSelfIntersects(points, epsilon) {
  const count = points.length;
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % count];
    for (let j = i + 1; j < count; j++) {
      if (j === i || j === (i + 1) % count || (j + 1) % count === i) continue;
      const c = points[j], d = points[(j + 1) % count];
      if (segmentsIntersect2D(a, b, c, d, epsilon)) return true;
    }
  }
  return false;
}

function signedArea2D(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area * 0.5;
}

function pointInTriangle2D(point, a, b, c, winding, epsilon) {
  const ab = cross2(a, b, point) * winding;
  const bc = cross2(b, c, point) * winding;
  const ca = cross2(c, a, point) * winding;
  return ab >= -epsilon && bc >= -epsilon && ca >= -epsilon;
}

/** Ear-clips a simple polygon while preserving the source winding and vertex IDs. */
function triangulatePolygon(positions, face) {
  const projection = projectedPolygon(positions, face);
  if (!projection) return null;
  const { points, scale } = projection;
  const epsilon = scale * scale * 1e-10;
  if (polygonSelfIntersects(points, epsilon)) return null;
  const area = signedArea2D(points);
  if (Math.abs(area) <= epsilon) return null;
  const winding = Math.sign(area);
  let ring = face.map((id, index) => ({ id, point: points[index] }));

  // Remove redundant collinear points from the triangulation ring; they remain
  // in the HEM boundary and therefore remain visible as editable edges.
  let changed = true;
  while (changed && ring.length > 3) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      const prev = ring[(i - 1 + ring.length) % ring.length].point;
      const current = ring[i].point;
      const next = ring[(i + 1) % ring.length].point;
      if (Math.abs(cross2(prev, current, next)) <= epsilon &&
          (current[0] - prev[0]) * (current[0] - next[0]) +
          (current[1] - prev[1]) * (current[1] - next[1]) <= epsilon) {
        ring.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (ring.length < 3) return null;

  const triangles = [];
  let guard = ring.length * ring.length;
  while (ring.length > 3 && guard-- > 0) {
    let earFound = false;
    for (let i = 0; i < ring.length; i++) {
      const prev = ring[(i - 1 + ring.length) % ring.length];
      const current = ring[i];
      const next = ring[(i + 1) % ring.length];
      if (cross2(prev.point, current.point, next.point) * winding <= epsilon) continue;
      let containsVertex = false;
      for (let j = 0; j < ring.length; j++) {
        if (j === i || j === (i - 1 + ring.length) % ring.length || j === (i + 1) % ring.length) continue;
        if (pointInTriangle2D(ring[j].point, prev.point, current.point, next.point, winding, epsilon)) {
          containsVertex = true;
          break;
        }
      }
      if (containsVertex) continue;
      triangles.push([prev.id, current.id, next.id]);
      ring.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) return null;
  }
  if (ring.length !== 3 || Math.abs(cross2(ring[0].point, ring[1].point, ring[2].point)) <= epsilon) return null;
  triangles.push([ring[0].id, ring[1].id, ring[2].id]);
  return triangles;
}


function mergeCoplanarTriangles(vertices, triangles) {
  if (triangles.length < 2) return triangles.map(face => [...face]);
  const planes = triangles.map(face => {
    const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
    const u = b.map((value, i) => value - a[i]), v = c.map((value, i) => value - a[i]);
    const normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const length = Math.hypot(...normal);
    if (length < 1e-12) return null;
    const n = normal.map(value => value / length);
    return { normal: n, distance: n.reduce((sum, value, i) => sum + value * a[i], 0) };
  });
  const parent = triangles.map((_, index) => index);
  const find = id => { while (parent[id] !== id) { parent[id] = parent[parent[id]]; id = parent[id]; } return id; };
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const edgeFaces = new Map();
  triangles.forEach((face, faceId) => {
    for (let i = 0; i < 3; i++) {
      const key = keyFor(face[i], face[(i + 1) % 3]);
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key).push(faceId);
    }
  });
  const nonManifoldFaces = new Set();
  for (const incident of edgeFaces.values()) {
    if (incident.length > 2) {
      incident.forEach(id => nonManifoldFaces.add(id));
      continue;
    }
    if (incident.length !== 2) continue;
    const [a, b] = incident, pa = planes[a], pb = planes[b];
    if (!pa || !pb) continue;
    const alignment = pa.normal.reduce((sum, value, axis) => sum + value * pb.normal[axis], 0);
    if (alignment > 0.999999 && Math.abs(pa.distance - pb.distance) < 1e-5) join(a, b);
  }

  const components = new Map();
  triangles.forEach((face, id) => {
    const root = find(id);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(id);
  });
  const merged = [];
  for (const ids of components.values()) {
    if (ids.length === 1 || ids.some(id => nonManifoldFaces.has(id))) {
      for (const id of ids) merged.push([...triangles[id]]);
      continue;
    }
    const counts = new Map(), directed = new Map();
    for (const id of ids) {
      const face = triangles[id];
      for (let i = 0; i < 3; i++) {
        const a = face[i], b = face[(i + 1) % 3], key = keyFor(a, b);
        counts.set(key, (counts.get(key) || 0) + 1);
        directed.set(key, [a, b]);
      }
    }
    const boundary = [...counts].filter(([, count]) => count === 1).map(([key]) => directed.get(key));
    const outgoing = new Map();
    let valid = boundary.length >= 3;
    for (const [a, b] of boundary) {
      if (outgoing.has(a)) valid = false;
      outgoing.set(a, b);
    }
    let polygon = [];
    if (valid) {
      const start = boundary[0][0]; let current = start;
      for (let i = 0; i < boundary.length; i++) {
        if (!outgoing.has(current)) { valid = false; break; }
        polygon.push(current); current = outgoing.get(current);
        if (current === start) break;
      }
      if (current !== start || polygon.length !== boundary.length || new Set(polygon).size !== polygon.length) valid = false;
    }
    // Only replace a triangle cluster with one convex, single-boundary polygon.
    if (valid) {
      const normal = planes[ids[0]]?.normal || [0, 0, 1];
      for (let i = 0; i < polygon.length; i++) {
        const a = vertices[polygon[i]], b = vertices[polygon[(i + 1) % polygon.length]], c = vertices[polygon[(i + 2) % polygon.length]];
        const ab = b.map((value, axis) => value - a[axis]), bc = c.map((value, axis) => value - b[axis]);
        const cross = [ab[1]*bc[2]-ab[2]*bc[1], ab[2]*bc[0]-ab[0]*bc[2], ab[0]*bc[1]-ab[1]*bc[0]];
        if (cross.reduce((sum, value, axis) => sum + value * normal[axis], 0) < -1e-7) { valid = false; break; }
      }
    }
    if (valid) merged.push(polygon);
    else for (const id of ids) merged.push([...triangles[id]]);
  }
  return merged;
}

export class Vertex {
  constructor(id, position) { this.id = id; this.position = position; this.halfEdge = null; }
}
export class Edge {
  constructor(id, a, b) { this.id = id; this.vertices = [a, b]; this.halfEdges = []; }
}
export class HalfEdge {
  constructor(id, origin, face, edge) {
    this.id = id; this.origin = origin; this.face = face; this.edge = edge;
    this.next = null; this.prev = null; this.twin = null;
  }
}
export class Face {
  constructor(id) { this.id = id; this.halfEdge = null; this.vertices = []; }
}

/** Editable polygon topology. The Three.js geometry is a render cache only. */
export class HalfEdgeMesh {
  constructor(vertices = [], faces = []) {
    this.positions = vertices.map(v => [...v]);
    this.faces = faces.map(f => [...f]);
    this.vertices = []; this.edges = []; this.halfEdges = []; this.faceRecords = [];
    this.vertexSelection = new Set(); this.edgeSelection = new Set(); this.faceSelection = new Set();
    this.selectionMode = 'face';
    this.rebuild();
  }

  static fromBufferGeometry(geometry) {
    const attr = geometry.getAttribute('position');
    if (!attr) return new HalfEdgeMesh();
    const source = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: attr.count }, (_, i) => i);
    const vertices = [], map = new Map(), faces = [];
    const quantize = n => Math.round(n * 100000) / 100000;
    const remap = sourceIndex => {
      const x = quantize(attr.getX(sourceIndex)), y = quantize(attr.getY(sourceIndex)), z = quantize(attr.getZ(sourceIndex));
      const key = `${x},${y},${z}`;
      if (!map.has(key)) { map.set(key, vertices.length); vertices.push([x, y, z]); }
      return map.get(key);
    };
    for (let i = 0; i + 2 < source.length; i += 3) {
      const tri = [remap(source[i]), remap(source[i + 1]), remap(source[i + 2])];
      if (new Set(tri).size === 3) faces.push(tri);
    }
    return new HalfEdgeMesh(vertices, mergeCoplanarTriangles(vertices, faces));
  }

  rebuild() {
    this.vertices = this.positions.map((position, id) => new Vertex(id, position));
    this.edges = []; this.halfEdges = []; this.faceRecords = [];
    const edgeMap = new Map();
    this.faces.forEach((indices, faceId) => {
      const face = new Face(faceId); face.vertices = [...indices];
      const cycle = [];
      for (let i = 0; i < indices.length; i++) {
        const a = indices[i], b = indices[(i + 1) % indices.length];
        if (!this.vertices[a] || !this.vertices[b] || a === b) continue;
        const key = keyFor(a, b);
        let edge = edgeMap.get(key);
        if (!edge) { edge = new Edge(this.edges.length, Math.min(a, b), Math.max(a, b)); edgeMap.set(key, edge); this.edges.push(edge); }
        const he = new HalfEdge(this.halfEdges.length, a, face, edge);
        this.halfEdges.push(he); edge.halfEdges.push(he); cycle.push(he);
        if (!this.vertices[a].halfEdge) this.vertices[a].halfEdge = he;
      }
      if (cycle.length) {
        cycle.forEach((he, i) => { he.next = cycle[(i + 1) % cycle.length]; he.prev = cycle[(i - 1 + cycle.length) % cycle.length]; });
        face.halfEdge = cycle[0];
      }
      this.faceRecords.push(face);
    });
    for (const edge of this.edges) {
      if (edge.halfEdges.length === 2) {
        const [a, b] = edge.halfEdges;
        if (a.origin === b.next.origin) { a.twin = b; b.twin = a; }
      }
    }
    this.vertexSelection = new Set([...this.vertexSelection].filter(id => id < this.vertices.length));
    this.edgeSelection = new Set([...this.edgeSelection].filter(id => id < this.edges.length));
    this.faceSelection = new Set([...this.faceSelection].filter(id => id < this.faceRecords.length));
  }

  clone() { return new HalfEdgeMesh(this.positions, this.faces); }
  setSelectionMode(mode) {
    if (!['vertex', 'edge', 'face'].includes(mode) || mode === this.selectionMode) return;
    const vertices = new Set(), edges = new Set(), faces = new Set();
    const edgeIds = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
    if (mode === 'vertex') {
      if (this.faceSelection.size) for (const faceId of this.faceSelection) for (const id of this.faces[faceId] || []) vertices.add(id);
      else if (this.edgeSelection.size) for (const edgeId of this.edgeSelection) for (const id of this.edges[edgeId]?.vertices || []) vertices.add(id);
      else for (const id of this.vertexSelection) vertices.add(id);
    } else if (mode === 'edge') {
      if (this.faceSelection.size) {
        for (const faceId of this.faceSelection) {
          const face = this.faces[faceId] || [];
          for (let i = 0; i < face.length; i++) { const id = edgeIds.get(keyFor(face[i], face[(i + 1) % face.length])); if (id !== undefined) edges.add(id); }
        }
      } else if (this.vertexSelection.size) {
        for (const edge of this.edges) if (this.vertexSelection.has(edge.vertices[0]) && this.vertexSelection.has(edge.vertices[1])) edges.add(edge.id);
      } else for (const id of this.edgeSelection) edges.add(id);
    } else {
      if (this.vertexSelection.size) {
        for (let faceId = 0; faceId < this.faces.length; faceId++) if (this.faces[faceId].every(id => this.vertexSelection.has(id))) faces.add(faceId);
      } else if (this.edgeSelection.size) {
        for (let faceId = 0; faceId < this.faces.length; faceId++) {
          const face = this.faces[faceId] || [];
          if (face.length && face.every((id, i) => { const edgeId = edgeIds.get(keyFor(id, face[(i + 1) % face.length])); return edgeId !== undefined && this.edgeSelection.has(edgeId); })) faces.add(faceId);
        }
      } else for (const id of this.faceSelection) faces.add(id);
    }
    this.clearSelection();
    this.vertexSelection = vertices; this.edgeSelection = edges; this.faceSelection = faces;
    this.selectionMode = mode;
  }

  clearSelection() { this.vertexSelection.clear(); this.edgeSelection.clear(); this.faceSelection.clear(); }

  selectVertex(id, additive = false) {
    if (!this.vertices[id]) return;
    if (!additive) this.clearSelection();
    if (additive && this.vertexSelection.has(id)) this.vertexSelection.delete(id);
    else this.vertexSelection.add(id);
  }

  selectEdge(id, additive = false) {
    if (!this.edges[id]) return;
    if (!additive) this.clearSelection();
    if (additive && this.edgeSelection.has(id)) this.edgeSelection.delete(id);
    else this.edgeSelection.add(id);
  }

  selectFace(id, additive = false) {
    if (!this.faceRecords[id]) return;
    if (!additive) this.clearSelection();
    if (additive && this.faceSelection.has(id)) { this.faceSelection.delete(id); return; }
    if (this.selectionMode === 'face') { this.faceSelection.add(id); return; }
    const face = this.faces[id], edgeIds = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
    if (this.selectionMode === 'vertex') for (const vertexId of face) this.vertexSelection.add(vertexId);
    if (this.selectionMode === 'edge') for (let i = 0; i < face.length; i++) {
      const edgeId = edgeIds.get(keyFor(face[i], face[(i + 1) % face.length]));
      if (edgeId !== undefined) this.edgeSelection.add(edgeId);
    }
  }

  triangulateFace(faceId) {
    const face = this.faces[faceId];
    return face ? triangulatePolygon(this.positions, face) || [] : [];
  }

  triangleFaceMap() {
    const faceIds = [];
    this.faces.forEach((_, faceId) => {
      for (const _triangle of this.triangulateFace(faceId)) faceIds.push(faceId);
    });
    return faceIds;
  }

  toBufferGeometry() {
    const positions = this.positions.flat();
    const indices = [];
    for (let faceId = 0; faceId < this.faces.length; faceId++) {
      for (const triangle of this.triangulateFace(faceId)) indices.push(...triangle);
    }
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
  }

  faceNormal(faceId) {
    const face = this.faces[faceId];
    if (!face || face.length < 3) return [0, 0, 1];
    const a = this.positions[face[0]], b = this.positions[face[1]], c = this.positions[face[2]];
    const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const length = Math.hypot(...n) || 1;
    return n.map(x => x / length);
  }

  extrudeSelected(distance = 1) {
    const selected = [...this.faceSelection];
    if (!selected.length) return false;
    const selectedSet = new Set(selected), boundary = new Map(), normal = [0, 0, 0], used = new Set();
    for (const faceId of selected) {
      const face = this.faces[faceId]; const n = this.faceNormal(faceId);
      n.forEach((v, i) => normal[i] += v);
      for (const v of face) used.add(v);
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length], key = keyFor(a, b);
        const item = boundary.get(key) || { count: 0, a, b };
        item.count++; boundary.set(key, item);
      }
    }
    const nLen = Math.hypot(...normal) || 1; normal.forEach((v, i) => normal[i] = v / nLen);
    const remap = new Map();
    for (const oldId of used) {
      remap.set(oldId, this.positions.length);
      this.positions.push(this.positions[oldId].map((v, axis) => v + normal[axis] * distance));
    }
    const oldFaces = this.faces.map((face, id) => selectedSet.has(id) ? face.map(v => remap.get(v)) : face);
    for (const edge of boundary.values()) if (edge.count === 1) oldFaces.push([edge.a, edge.b, remap.get(edge.b), remap.get(edge.a)]);
    this.faces = oldFaces;
    this.clearSelection();
    for (let id = 0; id < selected.length; id++) this.faceSelection.add(selected[id]);
    this.rebuild();
    this.faceSelection = new Set(selected.map(id => id));
    return true;
  }

  insetSelected(amount = 0.12) {
    const selected = [...this.faceSelection];
    if (!selected.length) return false;
    const selectedSet = new Set(selected), replacement = [], innerFaceIds = [];
    const kept = this.faces.filter((_, id) => !selectedSet.has(id));
    for (const faceId of selected) {
      const face = this.faces[faceId];
      const center = [0, 0, 0];
      face.forEach(v => this.positions[v].forEach((p, i) => center[i] += p / face.length));
      const ring = face.map(v => {
        const p = this.positions[v]; const id = this.positions.length;
        this.positions.push(p.map((n, i) => n * (1 - amount) + center[i] * amount)); return id;
      });
      for (let i = 0; i < face.length; i++) replacement.push([face[i], face[(i + 1) % face.length], ring[(i + 1) % face.length], ring[i]]);
      innerFaceIds.push(kept.length + replacement.length);
      replacement.push(ring);
    }
    this.faces = [...kept, ...replacement];
    this.clearSelection();
    this.rebuild();
    this.faceSelection = new Set(innerFaceIds);
    return true;
  }

  deleteSelectedElements() {
    const removedFaces = new Set();
    if (this.selectionMode === 'face') {
      for (const id of this.faceSelection) if (this.faces[id]) removedFaces.add(id);
    } else if (this.selectionMode === 'edge') {
      for (const edgeId of this.edgeSelection) {
        for (const halfEdge of this.edges[edgeId]?.halfEdges || []) {
          if (Number.isInteger(halfEdge.face?.id)) removedFaces.add(halfEdge.face.id);
        }
      }
    } else if (this.selectionMode === 'vertex') {
      this.faces.forEach((face, id) => {
        if (face.some(vertexId => this.vertexSelection.has(vertexId))) removedFaces.add(id);
      });
    }
    if (!removedFaces.size) return false;
    this.faces = this.faces.filter((_, id) => !removedFaces.has(id));
    this.clearSelection();
    this.compact();
    return true;
  }

  // Keep the original method name for compatibility with earlier callers.
  deleteSelectedFaces() { return this.deleteSelectedElements(); }

  boundaryForRegion(faceIds) {
    if (!Array.isArray(faceIds) || faceIds.length < 2) return null;
    const edgeUses = new Map();
    for (const faceId of faceIds) {
      const face = this.faces[faceId];
      if (!face || face.length < 3 || new Set(face).size !== face.length) return null;
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        if (!this.positions[a] || !this.positions[b] || a === b) return null;
        const key = keyFor(a, b);
        if (!edgeUses.has(key)) edgeUses.set(key, []);
        edgeUses.get(key).push({ a, b });
      }
    }

    const boundary = [];
    for (const incidents of edgeUses.values()) {
      if (incidents.length > 2) return null;
      if (incidents.length === 1) boundary.push(incidents[0]);
      else if (incidents[0].a === incidents[1].a && incidents[0].b === incidents[1].b) return null;
    }
    if (boundary.length < 3) return null;

    const outgoing = new Map(), incoming = new Map();
    for (const edge of boundary) {
      if (outgoing.has(edge.a) || incoming.has(edge.b)) return null;
      outgoing.set(edge.a, edge.b);
      incoming.set(edge.b, edge.a);
    }
    if (outgoing.size !== boundary.length || incoming.size !== boundary.length) return null;

    const polygon = [], start = boundary[0].a;
    let current = start;
    for (let i = 0; i < boundary.length; i++) {
      if (!outgoing.has(current) || polygon.includes(current)) return null;
      polygon.push(current);
      current = outgoing.get(current);
      if (current === start) break;
    }
    if (current !== start || polygon.length !== boundary.length) return null;

    // Dissolve can now preserve concave planar boundaries, but still rejects
    // folded, inconsistent, multi-loop, self-intersecting or non-manifold patches.
    const boundaryProjection = projectedPolygon(this.positions, polygon);
    if (!boundaryProjection) return null;
    const origin = this.positions[polygon[0]];
    const scale = Math.max(1, boundaryProjection.scale);
    const tolerance = scale * 1e-5;
    for (const faceId of faceIds) {
      const face = this.faces[faceId];
      const faceProjection = projectedPolygon(this.positions, face);
      if (!faceProjection) return null;
      if (faceProjection.deviation > tolerance) return null;
      if (faceProjection.normal.reduce((sum, value, axis) => sum + value * boundaryProjection.normal[axis], 0) < 0.999) return null;
      for (const vertexId of face) {
        const point = this.positions[vertexId];
        const distance = boundaryProjection.normal.reduce((sum, value, axis) => sum + value * (point[axis] - origin[axis]), 0);
        if (Math.abs(distance) > tolerance) return null;
      }
    }
    return triangulatePolygon(this.positions, polygon) ? polygon : null;
  }

  dissolveSelected() {
    const mode = this.selectionMode;
    const selectedFaces = new Set();
    const parent = this.faces.map((_, id) => id);
    const find = id => {
      while (parent[id] !== id) { parent[id] = parent[parent[id]]; id = parent[id]; }
      return id;
    };
    const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

    if (mode === 'face') {
      for (const id of this.faceSelection) if (this.faces[id]) selectedFaces.add(id);
      if (selectedFaces.size < 2) return false;
      for (const edge of this.edges) {
        const adjacent = edge.halfEdges.map(halfEdge => halfEdge.face?.id).filter(id => selectedFaces.has(id));
        if (adjacent.length === 2) join(adjacent[0], adjacent[1]);
      }
    } else if (mode === 'edge') {
      if (!this.edgeSelection.size) return false;
      for (const edgeId of this.edgeSelection) {
        const adjacent = (this.edges[edgeId]?.halfEdges || []).map(halfEdge => halfEdge.face?.id);
        if (adjacent.length !== 2 || adjacent.some(id => !Number.isInteger(id))) continue;
        selectedFaces.add(adjacent[0]);
        selectedFaces.add(adjacent[1]);
        join(adjacent[0], adjacent[1]);
      }
    } else if (mode === 'vertex') {
      if (!this.vertexSelection.size) return false;
      for (const vertexId of this.vertexSelection) {
        const adjacent = [];
        this.faces.forEach((face, id) => { if (face.includes(vertexId)) adjacent.push(id); });
        adjacent.forEach(id => selectedFaces.add(id));
        for (let i = 1; i < adjacent.length; i++) join(adjacent[0], adjacent[i]);
      }
    } else return false;

    const components = new Map();
    for (const faceId of selectedFaces) {
      const root = find(faceId);
      if (!components.has(root)) components.set(root, []);
      components.get(root).push(faceId);
    }
    const groups = [];
    for (const ids of components.values()) {
      if (ids.length < 2) continue;
      const polygon = this.boundaryForRegion(ids);
      if (!polygon) continue;
      // A boundary vertex cannot be dissolved by replacing the incident patch.
      if (mode === 'vertex' && [...this.vertexSelection].some(id => polygon.includes(id))) continue;
      groups.push({ ids: ids.sort((a, b) => a - b), polygon });
    }
    if (!groups.length) return false;

    const replacements = new Map(), removed = new Set();
    for (const group of groups) {
      replacements.set(group.ids[0], group);
      group.ids.forEach(id => removed.add(id));
    }
    const nextFaces = [], mergedFaceIds = [], boundaryVertices = new Set();
    for (let id = 0; id < this.faces.length; id++) {
      const group = replacements.get(id);
      if (group) {
        mergedFaceIds.push(nextFaces.length);
        nextFaces.push([...group.polygon]);
        group.polygon.forEach(vertexId => boundaryVertices.add(vertexId));
      } else if (!removed.has(id)) nextFaces.push([...this.faces[id]]);
    }

    this.faces = nextFaces;
    this.clearSelection();
    const remap = this.compact();
    if (mode === 'face') {
      for (const id of mergedFaceIds) this.faceSelection.add(id);
    } else if (mode === 'vertex') {
      for (const id of boundaryVertices) {
        const mapped = remap.get(id);
        if (Number.isInteger(mapped)) this.vertexSelection.add(mapped);
      }
    } else {
      const edgeIds = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
      for (const group of groups) {
        const ring = group.polygon.map(id => remap.get(id));
        for (let i = 0; i < ring.length; i++) {
          const edgeId = edgeIds.get(keyFor(ring[i], ring[(i + 1) % ring.length]));
          if (edgeId !== undefined) this.edgeSelection.add(edgeId);
        }
      }
    }
    return true;
  }


  collectEdgeLoop(seedEdgeIds) {
    const edgeByKey = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
    const visited = new Set(seedEdgeIds), queue = [...seedEdgeIds];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const edge = this.edges[queue[cursor]];
      if (!edge) continue;
      for (const halfEdge of edge.halfEdges) {
        const face = this.faces[halfEdge.face?.id];
        if (!face || face.length !== 4) continue;
        let side = -1;
        for (let i = 0; i < 4; i++) {
          if (keyFor(face[i], face[(i + 1) % 4]) === keyFor(...edge.vertices)) { side = i; break; }
        }
        if (side < 0) continue;
        const opposite = edgeByKey.get(keyFor(face[(side + 2) % 4], face[(side + 3) % 4]));
        if (opposite !== undefined && !visited.has(opposite)) { visited.add(opposite); queue.push(opposite); }
      }
    }
    return visited;
  }

  expandEdgeLoopSelection({ extend = true } = {}) {
    if (this.selectionMode !== 'edge' || !this.edgeSelection.size) return 0;
    const visited = this.collectEdgeLoop([...this.edgeSelection]);
    if (!extend) this.edgeSelection.clear();
    for (const id of visited) this.edgeSelection.add(id);
    return visited.size;
  }

  /**
   * Inserts a centered/interpolated cut through a regular quad edge loop.
   * The operation is transactional: all incident faces are checked before any
   * vertex or face data is changed. Unsupported topology returns a reason.
   */
  cutEdgeLoop({ offset = 0.5, cuts = 1, offsets = null } = {}) {
    if (this.selectionMode !== 'edge' || this.edgeSelection.size !== 1) {
      return { changed: false, reason: 'Select exactly one seed edge in Edge Select mode.' };
    }
    if (!Number.isInteger(cuts) || cuts < 1 || cuts > 8) {
      return { changed: false, reason: 'Loop Cut supports between 1 and 8 cuts per operation.' };
    }
    const requestedOffsets = Array.isArray(offsets) ? [...offsets] :
      Array.from({ length: cuts }, (_, index) => (index + 1) / (cuts + 1) + (offset - 0.5));
    if (requestedOffsets.length !== cuts || requestedOffsets.some(value => !Number.isFinite(value) || value <= 0 || value >= 1)) {
      return { changed: false, reason: 'Every cut must remain strictly inside its source edge.' };
    }
    requestedOffsets.sort((a, b) => a - b);
    if (requestedOffsets.some((value, index) => index > 0 && value - requestedOffsets[index - 1] < 1e-5)) {
      return { changed: false, reason: 'Loop Cut positions are too close together to create stable topology.' };
    }

    const loopEdgeIds = this.collectEdgeLoop([...this.edgeSelection]);
    const loopEdgeSet = new Set(loopEdgeIds);
    const edgeFaces = new Map();
    for (const edgeId of loopEdgeIds) {
      const edge = this.edges[edgeId];
      if (!edge || edge.halfEdges.length < 1 || edge.halfEdges.length > 2) {
        return { changed: false, reason: 'The edge loop touches a non-manifold or detached edge.' };
      }
      edgeFaces.set(edgeId, edge.halfEdges.map(halfEdge => halfEdge.face?.id));
      if (edge.halfEdges.length === 2) {
        const [a, b] = edge.halfEdges;
        if (a.origin !== b.next?.origin || a.next?.origin !== b.origin) {
          return { changed: false, reason: 'The loop touches faces with inconsistent winding.' };
        }
      }
    }

    const edgeByKey = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge]));
    const splitPlans = [];
    const participatingFaces = new Set();
    for (let faceId = 0; faceId < this.faces.length; faceId++) {
      const face = this.faces[faceId];
      if (!Array.isArray(face) || face.length !== 4) continue;
      const selectedSides = [];
      for (let i = 0; i < 4; i++) {
        const edgeId = edgeByKey.get(keyFor(face[i], face[(i + 1) % 4]))?.id;
        if (edgeId !== undefined && loopEdgeSet.has(edgeId)) selectedSides.push(i);
      }
      if (!selectedSides.length) continue;
      if (selectedSides.length !== 2 || (selectedSides[0] + 2) % 4 !== selectedSides[1]) {
        return { changed: false, reason: 'The loop reaches a quad without exactly two opposite loop edges.' };
      }

      const projection = projectedPolygon(this.positions, face);
      if (!projection || projection.deviation > projection.scale * 1e-5 ||
          polygonSelfIntersects(projection.points, projection.scale * projection.scale * 1e-10) ||
          !triangulatePolygon(this.positions, face)) {
        return { changed: false, reason: 'Loop Cut requires simple, planar quad faces.' };
      }
      const points = projection.points;
      const turns = points.map((point, index) => cross2(point, points[(index + 1) % 4], points[(index + 2) % 4]));
      const epsilon = projection.scale * projection.scale * 1e-10;
      if (!(turns.every(value => value > epsilon) || turns.every(value => value < -epsilon))) {
        return { changed: false, reason: 'Loop Cut requires convex quad faces; concave quads are left unchanged.' };
      }

      const side = selectedSides[0];
      const a = face[side], b = face[(side + 1) % 4];
      const c = face[(side + 2) % 4], d = face[(side + 3) % 4];
      const edgeAB = edgeByKey.get(keyFor(a, b));
      const edgeCD = edgeByKey.get(keyFor(c, d));
      if (!edgeAB || !edgeCD) return { changed: false, reason: 'The selected loop edge could not be resolved in the quad topology.' };
      const signAB = a === edgeAB.vertices[0] ? 1 : -1;
      const signCD = c === edgeCD.vertices[0] ? 1 : -1;
      splitPlans.push({ faceId, face: [...face], side, edgeABId: edgeAB.id, edgeCDId: edgeCD.id, sameEdgeOrientation: signAB === signCD });
      participatingFaces.add(faceId);
    }

    for (const [edgeId, incidentFaceIds] of edgeFaces) {
      if (incidentFaceIds.some(faceId => !Number.isInteger(faceId) || !participatingFaces.has(faceId))) {
        return { changed: false, reason: 'The edge loop reaches a non-quad face or an unsupported boundary.' };
      }
    }
    if (!splitPlans.length) return { changed: false, reason: 'No complete quad strip was found from the selected edge.' };

    // Carry an ordered set of cut fractions across every opposite-edge pair.
    // Reversing canonical edge direction reverses every fraction, then sorting
    // restores the local low-to-high ordering used by the vertex lookup below.
    const parameterAdjacency = new Map([...loopEdgeIds].map(edgeId => [edgeId, []]));
    for (const plan of splitPlans) {
      parameterAdjacency.get(plan.edgeABId)?.push([plan.edgeCDId, plan.sameEdgeOrientation]);
      parameterAdjacency.get(plan.edgeCDId)?.push([plan.edgeABId, plan.sameEdgeOrientation]);
    }
    const seedEdgeId = this.edgeSelection.values().next().value;
    const edgeParameters = new Map([[seedEdgeId, [...requestedOffsets]]]);
    const parameterQueue = [seedEdgeId];
    for (let cursor = 0; cursor < parameterQueue.length; cursor++) {
      const edgeId = parameterQueue[cursor];
      const parameters = edgeParameters.get(edgeId);
      for (const [nextEdgeId, sameEdgeOrientation] of parameterAdjacency.get(edgeId) || []) {
        const nextParameters = (sameEdgeOrientation ? parameters.map(value => 1 - value) : [...parameters]).sort((a, b) => a - b);
        if (!edgeParameters.has(nextEdgeId)) {
          edgeParameters.set(nextEdgeId, nextParameters);
          parameterQueue.push(nextEdgeId);
        } else if (edgeParameters.get(nextEdgeId).some((value, index) => Math.abs(value - nextParameters[index]) > 1e-8)) {
          return { changed: false, reason: 'The loop returns with inconsistent cut offsets; no topology was changed.' };
        }
      }
    }
    if (edgeParameters.size !== loopEdgeSet.size) {
      return { changed: false, reason: 'The cut offsets could not be propagated across the complete loop.' };
    }

    const nextPositions = this.positions.map(position => [...position]);
    const splitVerticesByEdge = new Map();
    for (const edgeId of loopEdgeIds) {
      const [a, b] = this.edges[edgeId].vertices;
      const entries = edgeParameters.get(edgeId).map(parameter => {
        const point = nextPositions[a].map((value, axis) => value + (nextPositions[b][axis] - value) * parameter);
        return { parameter, vertex: nextPositions.push(point) - 1 };
      });
      splitVerticesByEdge.set(edgeId, entries);
    }

    const verticesAlongEdge = (edgeId, fromVertex) => {
      const edge = this.edges[edgeId];
      const entries = splitVerticesByEdge.get(edgeId) || [];
      return (edge.vertices[0] === fromVertex ? entries : [...entries].reverse()).map(entry => entry.vertex);
    };
    const nextFaces = [], cutPairs = [];
    const planByFace = new Map(splitPlans.map(plan => [plan.faceId, plan]));
    for (let faceId = 0; faceId < this.faces.length; faceId++) {
      const plan = planByFace.get(faceId);
      if (!plan) { nextFaces.push([...this.faces[faceId]]); continue; }
      const { face, side } = plan;
      const a = face[side], b = face[(side + 1) % 4];
      const c = face[(side + 2) % 4], d = face[(side + 3) % 4];
      const pAB = verticesAlongEdge(plan.edgeABId, a);
      const pCD = verticesAlongEdge(plan.edgeCDId, c);
      if (pAB.length !== cuts || pCD.length !== cuts) {
        return { changed: false, reason: 'The cut positions could not be mapped consistently across the quad strip.' };
      }

      // The two opposite sides run in opposite spatial directions around the
      // quad. Pair the first point on AB with the last point on CD.
      nextFaces.push([pAB[cuts - 1], b, c, pCD[0]]);
      for (let index = 0; index < cuts - 1; index++) {
        nextFaces.push([pAB[index], pAB[index + 1], pCD[cuts - 2 - index], pCD[cuts - 1 - index]]);
      }
      nextFaces.push([pCD[cuts - 1], d, a, pAB[0]]);
      for (let index = 0; index < cuts; index++) cutPairs.push([pAB[index], pCD[cuts - 1 - index]]);
    }

    this.positions = nextPositions;
    this.faces = nextFaces;
    this.clearSelection();
    this.rebuild();
    const rebuiltEdgeIds = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
    for (const [a, b] of cutPairs) {
      const edgeId = rebuiltEdgeIds.get(keyFor(a, b));
      if (edgeId !== undefined) this.edgeSelection.add(edgeId);
    }
    return {
      changed: true,
      cuts,
      offsets: requestedOffsets,
      insertedVertices: [...splitVerticesByEdge.values()].reduce((sum, entries) => sum + entries.length, 0),
      splitFaces: splitPlans.length,
      createdFaces: splitPlans.length * (cuts + 1),
      createdCutEdges: cutPairs.length,
      selectedCutEdges: this.edgeSelection.size
    };
  }

  orderedVertexFan(vertexId) {
    const start = this.vertices[vertexId]?.halfEdge;
    if (!start || start.origin !== vertexId) return null;
    const fan = [], visited = new Set();
    let current = start;
    while (current && !visited.has(current.id) && fan.length <= this.halfEdges.length) {
      if (current.origin !== vertexId) return null;
      visited.add(current.id);
      fan.push(current);
      current = current.prev?.twin || null;
    }
    return current === start ? fan : null;
  }

  expandEdgeRingSelection({ extend = true } = {}) {
    if (this.selectionMode !== 'edge' || !this.edgeSelection.size) return 0;
    const seeds = [...this.edgeSelection];
    const visited = new Set(seeds), queue = [...seeds];
    while (queue.length) {
      const edge = this.edges[queue.shift()];
      if (!edge) continue;
      for (const vertexId of edge.vertices) {
        const fan = this.orderedVertexFan(vertexId);
        // Ring traversal is ambiguous at boundaries and extraordinary poles.
        // Continue only through a closed regular valence-four quad fan.
        if (!fan || fan.length !== 4) continue;
        const currentIndex = fan.findIndex(halfEdge => halfEdge.edge.id === edge.id);
        if (currentIndex < 0) continue;
        const opposite = fan[(currentIndex + 2) % 4].edge.id;
        if (!visited.has(opposite)) { visited.add(opposite); queue.push(opposite); }
      }
    }
    if (!extend) this.edgeSelection.clear();
    for (const id of visited) this.edgeSelection.add(id);
    return visited.size;
  }

  validateTopology() {
    const invalidPositions = [], invalidFaces = [], duplicateFaces = [], nonManifoldEdges = [];
    const inconsistentWinding = [], isolatedVertices = [], nonPlanarFaces = [];
    const selfIntersectingFaces = [], triangulationFailures = [];
    const edgeUses = new Map(), usedVertices = new Set(), faceKeys = new Set();
    this.positions.forEach((position, id) => {
      if (!Array.isArray(position) || position.length < 3 || !position.slice(0, 3).every(Number.isFinite)) invalidPositions.push(id);
    });
    const invalidPositionSet = new Set(invalidPositions);
    this.faces.forEach((face, faceId) => {
      if (!Array.isArray(face) || face.length < 3 || new Set(face).size !== face.length ||
          face.some(id => !Number.isInteger(id) || id < 0 || id >= this.positions.length || invalidPositionSet.has(id))) {
        invalidFaces.push(faceId);
        return;
      }
      face.forEach(id => usedVertices.add(id));
      const canonical = [...face].sort((a, b) => a - b).join(':');
      if (faceKeys.has(canonical)) duplicateFaces.push(faceId); else faceKeys.add(canonical);
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length], key = keyFor(a, b);
        if (!edgeUses.has(key)) edgeUses.set(key, []);
        edgeUses.get(key).push({ a, b });
      }
      const projection = projectedPolygon(this.positions, face);
      if (!projection) { invalidFaces.push(faceId); triangulationFailures.push(faceId); return; }
      const tolerance = projection.scale * 1e-5;
      if (projection.deviation > tolerance) nonPlanarFaces.push({ faceId, deviation: projection.deviation, tolerance });
      if (polygonSelfIntersects(projection.points, projection.scale * projection.scale * 1e-10)) selfIntersectingFaces.push(faceId);
      if (!triangulatePolygon(this.positions, face)) triangulationFailures.push(faceId);
    });
    for (const [key, incidents] of edgeUses) {
      if (incidents.length > 2) nonManifoldEdges.push(key);
      else if (incidents.length === 2 && incidents[0].a === incidents[1].a && incidents[0].b === incidents[1].b) inconsistentWinding.push(key);
    }
    for (let id = 0; id < this.positions.length; id++) if (!usedVertices.has(id)) isolatedVertices.push(id);
    const boundaryEdges = [...edgeUses.values()].filter(incidents => incidents.length === 1).length;
    const counts = {
      invalidPositions: invalidPositions.length, invalidFaces: invalidFaces.length,
      duplicateFaces: duplicateFaces.length, nonManifoldEdges: nonManifoldEdges.length,
      inconsistentWinding: inconsistentWinding.length, isolatedVertices: isolatedVertices.length,
      nonPlanarFaces: nonPlanarFaces.length, selfIntersectingFaces: selfIntersectingFaces.length,
      triangulationFailures: triangulationFailures.length, boundaryEdges
    };
    const issueCount = counts.invalidPositions + counts.invalidFaces + counts.duplicateFaces +
      counts.nonManifoldEdges + counts.inconsistentWinding + counts.isolatedVertices +
      counts.nonPlanarFaces + counts.selfIntersectingFaces + counts.triangulationFailures;
    return {
      valid: issueCount === 0, issueCount, counts,
      details: { invalidPositions, invalidFaces, duplicateFaces, nonManifoldEdges,
        inconsistentWinding, isolatedVertices, nonPlanarFaces, selfIntersectingFaces, triangulationFailures }
    };
  }

  repairTopology() {
    const before = this.validateTopology();
    const invalidPositionSet = new Set(before.details.invalidPositions);
    const kept = [], seen = new Set();
    let removedInvalidFaces = 0, removedDuplicateFaces = 0;
    for (const face of this.faces) {
      const valid = Array.isArray(face) && face.length >= 3 && new Set(face).size === face.length &&
        face.every(id => Number.isInteger(id) && id >= 0 && id < this.positions.length && !invalidPositionSet.has(id));
      if (!valid) { removedInvalidFaces++; continue; }
      const key = [...face].sort((a,b)=>a-b).join(':');
      if (seen.has(key)) { removedDuplicateFaces++; continue; }
      seen.add(key); kept.push([...face]);
    }

    // Reorient only closed, manifold-connected face components. Components touching
    // an edge with >2 incident faces are deliberately left untouched.
    const uses = new Map();
    kept.forEach((face, faceId) => face.forEach((a, i) => {
      const b = face[(i+1)%face.length], key = keyFor(a,b);
      if (!uses.has(key)) uses.set(key, []);
      uses.get(key).push({ faceId, a, b });
    }));
    const adjacency = kept.map(() => []), blocked = new Set();
    for (const incidents of uses.values()) {
      if (incidents.length > 2) { incidents.forEach(item => blocked.add(item.faceId)); continue; }
      if (incidents.length !== 2) continue;
      const [a,b] = incidents;
      const sameDirection = a.a === b.a && a.b === b.b;
      adjacency[a.faceId].push([b.faceId, sameDirection]);
      adjacency[b.faceId].push([a.faceId, sameDirection]);
    }
    const flip = new Map(), unsafe = new Set();
    for (let seed=0; seed<kept.length; seed++) {
      if (flip.has(seed) || blocked.has(seed)) continue;
      const queue=[seed], component=[]; flip.set(seed,false); let conflict=false;
      while(queue.length) {
        const current=queue.shift(); component.push(current);
        for (const [next, mustDiffer] of adjacency[current]) {
          if (blocked.has(next)) { conflict=true; continue; }
          const expected=flip.get(current) !== mustDiffer;
          if (!flip.has(next)) { flip.set(next,expected); queue.push(next); }
          else if (flip.get(next)!==expected) conflict=true;
        }
      }
      if (conflict) component.forEach(id=>unsafe.add(id));
    }
    const safeFlips = [...flip].filter(([id,value])=>value && !unsafe.has(id)).map(([id])=>id);
    for (const id of safeFlips) kept[id].reverse();
    this.faces = kept;
    this.compact();
    const after = this.validateTopology();
    return {
      changed: removedInvalidFaces + removedDuplicateFaces + safeFlips.length > 0 || before.details.isolatedVertices.length > 0,
      removedInvalidFaces, removedDuplicateFaces, flippedFaces: safeFlips.length,
      removedIsolatedVertices: before.details.isolatedVertices.length,
      skippedNonManifoldComponents: blocked.size,
      remaining: after
    };
  }

  subdivide() {
    const midpointCache = new Map(), out = [];
    const mid = (a, b) => {
      const key = keyFor(a, b);
      if (midpointCache.has(key)) return midpointCache.get(key);
      const pa = this.positions[a], pb = this.positions[b], id = this.positions.length;
      this.positions.push(pa.map((v, i) => (v + pb[i]) / 2)); midpointCache.set(key, id); return id;
    };
    for (const face of this.faces) {
      if (face.length !== 3) { out.push(face); continue; }
      const [a,b,c] = face, ab = mid(a,b), bc = mid(b,c), ca = mid(c,a);
      out.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);
    }
    this.faces = out; this.clearSelection(); this.rebuild();
  }

  compact() {
    const used = new Set(this.faces.flat()), ids = new Map(), positions = [];
    for (const old of used) { ids.set(old, positions.length); positions.push(this.positions[old]); }
    this.positions = positions; this.faces = this.faces.map(face => face.map(v => ids.get(v)));
    this.rebuild();
    return ids;
  }
}
