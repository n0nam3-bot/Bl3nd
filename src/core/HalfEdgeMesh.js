function keyFor(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

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

  toBufferGeometry() {
    const positions = this.positions.flat();
    const indices = [];
    for (const face of this.faces) {
      for (let i = 1; i < face.length - 1; i++) indices.push(face[0], face[i], face[i + 1]);
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

  deleteSelectedFaces() {
    if (!this.faceSelection.size) return false;
    const removed = this.faceSelection;
    this.faces = this.faces.filter((_, id) => !removed.has(id));
    this.clearSelection(); this.compact();
    return true;
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
  }
}
