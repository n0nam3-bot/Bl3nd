import { analyzeFaceRegionBoundary } from './FaceRegionBoundary.js';
import { triangulateWarpedQuad } from './WarpedQuadTriangulation.js';

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

function pointInPolygon2D(point, polygon, epsilon = 1e-9) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (Math.abs(cross2(a, b, point)) <= epsilon &&
        (point[0] - a[0]) * (point[0] - b[0]) + (point[1] - a[1]) * (point[1] - b[1]) <= epsilon) return true;
    if (((a[1] > point[1]) !== (b[1] > point[1])) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / ((b[1] - a[1]) || epsilon) + a[0]) inside = !inside;
  }
  return inside;
}

/**
 * Offset a simple 2D polygon toward its interior using shared miter joins.
 * The result is rejected when a corner needs an extreme miter or the offset
 * changes winding, leaves the source region, or self-intersects.
 */
function offsetPolygonInward(points, distance, scale) {
  const fail = reason => ({ changed: false, reason });
  if (!Array.isArray(points) || points.length < 3 || !Number.isFinite(distance) || distance <= 0) {
    return fail('Inset requires a simple polygon and a positive offset distance.');
  }
  const epsilon = Math.max(1e-10, scale * scale * 1e-10);
  if (polygonSelfIntersects(points, epsilon)) return fail('The selected region boundary is self-intersecting.');
  const sourceArea = signedArea2D(points);
  if (Math.abs(sourceArea) <= epsilon) return fail('The selected region boundary has negligible area.');
  const winding = Math.sign(sourceArea);
  const edgeData = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length <= Math.sqrt(epsilon)) return fail('The selected region has a zero-length boundary edge.');
    const normal = winding > 0 ? [-dy / length, dx / length] : [dy / length, -dx / length];
    edgeData.push({ dx, dy, length, normal });
  }

  const inset = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const previous = edgeData[(i - 1 + points.length) % points.length];
    const next = edgeData[i];
    const p = [point[0] + previous.normal[0] * distance, point[1] + previous.normal[1] * distance];
    const q = [point[0] + next.normal[0] * distance, point[1] + next.normal[1] * distance];
    const denominator = previous.dx * next.dy - previous.dy * next.dx;
    let result;
    if (Math.abs(denominator) <= 1e-9 * previous.length * next.length) {
      const alignment = previous.normal[0] * next.normal[0] + previous.normal[1] * next.normal[1];
      if (alignment < 0.999) return fail('Inset encountered a nearly reversed or ambiguous corner.');
      const nx = previous.normal[0] + next.normal[0];
      const ny = previous.normal[1] + next.normal[1];
      const normalLength = Math.hypot(nx, ny) || 1;
      result = [point[0] + nx / normalLength * distance, point[1] + ny / normalLength * distance];
    } else {
      const qpx = q[0] - p[0], qpy = q[1] - p[1];
      const t = (qpx * next.dy - qpy * next.dx) / denominator;
      result = [p[0] + previous.dx * t, p[1] + previous.dy * t];
    }
    const miterLength = Math.hypot(result[0] - point[0], result[1] - point[1]);
    if (!Number.isFinite(miterLength) || miterLength > distance * 8 + scale * 1e-8) {
      return fail('Inset corner would require an excessive miter. Reduce the inset amount.');
    }
    if (!pointInPolygon2D(result, points, epsilon)) {
      return fail('Inset offset leaves the selected region at a concave corner. Reduce the inset amount.');
    }
    inset.push(result);
  }

  if (polygonSelfIntersects(inset, epsilon)) return fail('Inset amount causes the inner boundary to self-intersect. Reduce the inset amount.');
  const insetArea = signedArea2D(inset);
  if (Math.sign(insetArea) !== winding || Math.abs(insetArea) <= epsilon || Math.abs(insetArea) >= Math.abs(sourceArea) - epsilon) {
    return fail('Inset amount collapses or reverses the selected region. Reduce the inset amount.');
  }
  return { changed: true, points: inset, sourceArea, insetArea, winding };
}

function pointInTriangle2D(point, a, b, c, winding, epsilon) {
  const ab = cross2(a, b, point) * winding;
  const bc = cross2(b, c, point) * winding;
  const ca = cross2(c, a, point) * winding;
  return ab >= -epsilon && bc >= -epsilon && ca >= -epsilon;
}

function pointStrictlyInTriangle2D(point, a, b, c, winding, epsilon) {
  return cross2(a, b, point) * winding > epsilon &&
    cross2(b, c, point) * winding > epsilon &&
    cross2(c, a, point) * winding > epsilon;
}

function properSegmentsIntersect2D(a, b, c, d, epsilon) {
  const abC = cross2(a, b, c), abD = cross2(a, b, d);
  const cdA = cross2(c, d, a), cdB = cross2(c, d, b);
  return ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
    ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon));
}

function pointInTriangle3D(point, triangle, normal, epsilon) {
  const a = triangle[0], b = triangle[1], c = triangle[2];
  const v0 = b.map((value, axis) => value - a[axis]);
  const v1 = c.map((value, axis) => value - a[axis]);
  const v2 = point.map((value, axis) => value - a[axis]);
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1);
  const d20 = dot(v2, v0), d21 = dot(v2, v1);
  const denominator = d00 * d11 - d01 * d01;
  if (!Number.isFinite(denominator) || denominator <= epsilon * epsilon) return false;
  const v = (d11 * d20 - d01 * d21) / denominator;
  const w = (d00 * d21 - d01 * d20) / denominator;
  const edgeScale = Math.max(Math.sqrt(d00), Math.sqrt(d11), 1e-12);
  const barycentricEpsilon = epsilon / edgeScale;
  return v >= -barycentricEpsilon && w >= -barycentricEpsilon &&
    v + w <= 1 + barycentricEpsilon && Math.abs(normal.reduce((sum, value, axis) =>
      sum + value * v2[axis], 0)) <= epsilon * 2;
}

/**
 * Tests two non-degenerate triangles for a geometric intersection beyond the
 * vertex/edge contacts that their editable topology explicitly shares.
 * Coplanar overlap is handled in 2D; non-coplanar intersections are found by
 * testing vertices and edge/plane crossings in both directions.
 */
function trianglesIntersectBeyondSharedTopology(positions, idsA, idsB, epsilon) {
  if (idsA.length !== 3 || idsB.length !== 3) return false;
  const sharedIds = idsA.filter(id => idsB.includes(id));
  if (sharedIds.length === 3) return false;
  const a = idsA.map(id => positions[id]);
  const b = idsB.map(id => positions[id]);
  if (a.some(point => !point) || b.some(point => !point)) return false;

  const cross = (u, v) => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0]
  ];
  const subtract = (u, v) => u.map((value, axis) => value - v[axis]);
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const length = vector => Math.hypot(...vector);
  const normalA = cross(subtract(a[1], a[0]), subtract(a[2], a[0]));
  const normalB = cross(subtract(b[1], b[0]), subtract(b[2], b[0]));
  const magnitudeA = length(normalA), magnitudeB = length(normalB);
  if (magnitudeA <= epsilon * epsilon || magnitudeB <= epsilon * epsilon) return false;
  const nA = normalA.map(value => value / magnitudeA);
  const nB = normalB.map(value => value / magnitudeB);
  const planeA = dot(nA, a[0]), planeB = dot(nB, b[0]);
  const distancesAtoB = a.map(point => dot(nB, point) - planeB);
  const distancesBtoA = b.map(point => dot(nA, point) - planeA);
  if (distancesAtoB.every(value => value > epsilon) || distancesAtoB.every(value => value < -epsilon) ||
      distancesBtoA.every(value => value > epsilon) || distancesBtoA.every(value => value < -epsilon)) return false;

  const sharedPoints = sharedIds.map(id => positions[id]);
  const pointOnSegment = (point, start, end) => {
    const direction = subtract(end, start);
    const denominator = dot(direction, direction);
    if (denominator <= epsilon * epsilon) return length(subtract(point, start)) <= epsilon;
    const t = dot(subtract(point, start), direction) / denominator;
    if (t < -epsilon || t > 1 + epsilon) return false;
    const projected = start.map((value, axis) => value + direction[axis] * t);
    return length(subtract(point, projected)) <= epsilon;
  };
  const isExpectedSharedContact = point => {
    if (sharedPoints.some(shared => length(subtract(point, shared)) <= epsilon * 2)) return true;
    return sharedPoints.length >= 2 && pointOnSegment(point, sharedPoints[0], sharedPoints[1]);
  };

  const coplanar = distancesAtoB.every(value => Math.abs(value) <= epsilon) &&
    distancesBtoA.every(value => Math.abs(value) <= epsilon);
  if (coplanar) {
    const dropAxis = nA.reduce((best, value, axis) => Math.abs(value) > Math.abs(nA[best]) ? axis : best, 0);
    const project = point => dropAxis === 0 ? [point[1], point[2]] :
      dropAxis === 1 ? [point[0], point[2]] : [point[0], point[1]];
    const projectedA = a.map(project), projectedB = b.map(project);
    const projectionOrigin = projectedA[0];
    const a2 = projectedA.map(point => point.map((value, axis) => value - projectionOrigin[axis]));
    const b2 = projectedB.map(point => point.map((value, axis) => value - projectionOrigin[axis]));
    const areaA = cross2(a2[0], a2[1], a2[2]);
    const areaB = cross2(b2[0], b2[1], b2[2]);
    if (Math.abs(areaA) <= epsilon * epsilon || Math.abs(areaB) <= epsilon * epsilon) return false;
    const windingA = Math.sign(areaA), windingB = Math.sign(areaB);
    const edgeScale = Math.max(
      Math.hypot(a2[1][0] - a2[0][0], a2[1][1] - a2[0][1]),
      Math.hypot(a2[2][0] - a2[1][0], a2[2][1] - a2[1][1]),
      Math.hypot(b2[1][0] - b2[0][0], b2[1][1] - b2[0][1]),
      Math.hypot(b2[2][0] - b2[1][0], b2[2][1] - b2[1][1]), epsilon
    );
    const areaEpsilon = epsilon * edgeScale;
    for (let index = 0; index < 3; index++) {
      if (!isExpectedSharedContact(a[index]) &&
          pointStrictlyInTriangle2D(a2[index], b2[0], b2[1], b2[2], windingB, areaEpsilon)) return true;
      if (!isExpectedSharedContact(b[index]) &&
          pointStrictlyInTriangle2D(b2[index], a2[0], a2[1], a2[2], windingA, areaEpsilon)) return true;
    }
    const centroid = points => [0, 1].map(axis => (points[0][axis] + points[1][axis] + points[2][axis]) / 3);
    if (pointStrictlyInTriangle2D(centroid(a2), b2[0], b2[1], b2[2], windingB, areaEpsilon) ||
        pointStrictlyInTriangle2D(centroid(b2), a2[0], a2[1], a2[2], windingA, areaEpsilon)) return true;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (properSegmentsIntersect2D(a2[i], a2[(i + 1) % 3], b2[j], b2[(j + 1) % 3], areaEpsilon)) return true;
      }
    }
    return false;
  }

  const edgePlaneCrossesTriangle = (source, target, targetNormal, targetPlane) => {
    const distances = source.map(point => dot(targetNormal, point) - targetPlane);
    for (let index = 0; index < 3; index++) {
      if (Math.abs(distances[index]) <= epsilon && pointInTriangle3D(source[index], target, targetNormal, epsilon) &&
          !isExpectedSharedContact(source[index])) return true;
    }
    for (let index = 0; index < 3; index++) {
      const next = (index + 1) % 3;
      const d0 = distances[index], d1 = distances[next];
      if (Math.abs(d0) <= epsilon && Math.abs(d1) <= epsilon) {
        const dropAxis = targetNormal.reduce((best, value, axis) =>
          Math.abs(value) > Math.abs(targetNormal[best]) ? axis : best, 0);
        const project = point => dropAxis === 0 ? [point[1], point[2]] :
          dropAxis === 1 ? [point[0], point[2]] : [point[0], point[1]];
        const target2D = target.map(project);
        const start2D = project(source[index]), end2D = project(source[next]);
        const area = cross2(target2D[0], target2D[1], target2D[2]);
        const winding = Math.sign(area);
        if (Math.abs(area) <= epsilon * epsilon) continue;
        const edgeScale = Math.max(
          Math.hypot(target2D[1][0] - target2D[0][0], target2D[1][1] - target2D[0][1]),
          Math.hypot(target2D[2][0] - target2D[1][0], target2D[2][1] - target2D[1][1]),
          Math.hypot(target2D[0][0] - target2D[2][0], target2D[0][1] - target2D[2][1]), epsilon
        );
        const areaTolerance = epsilon * edgeScale;
        let startT = 0, endT = 1, intersects = true;
        for (let edge = 0; edge < 3; edge++) {
          const edgeA = target2D[edge], edgeB = target2D[(edge + 1) % 3];
          const f0 = cross2(edgeA, edgeB, start2D) * winding;
          const f1 = cross2(edgeA, edgeB, end2D) * winding;
          if (f0 < -areaTolerance && f1 < -areaTolerance) {
            intersects = false;
            break;
          }
          if (f0 < -areaTolerance && f1 >= -areaTolerance) {
            startT = Math.max(startT, (-areaTolerance - f0) / (f1 - f0));
          } else if (f0 >= -areaTolerance && f1 < -areaTolerance) {
            endT = Math.min(endT, (-areaTolerance - f0) / (f1 - f0));
          }
          if (startT > endT + 1e-10) {
            intersects = false;
            break;
          }
        }
        if (intersects && startT <= endT + 1e-10) {
          const t = (startT + endT) * 0.5;
          const point = source[index].map((value, axis) => value + (source[next][axis] - value) * t);
          if (!isExpectedSharedContact(point)) return true;
        }
        continue;
      }
      if ((d0 > epsilon && d1 > epsilon) || (d0 < -epsilon && d1 < -epsilon)) continue;
      const denominator = d0 - d1;
      if (Math.abs(denominator) <= 1e-20) continue;
      const t = d0 / denominator;
      if (t < -epsilon || t > 1 + epsilon) continue;
      const point = source[index].map((value, axis) => value + (source[next][axis] - value) * t);
      if (pointInTriangle3D(point, target, targetNormal, epsilon) && !isExpectedSharedContact(point)) return true;
    }
    return false;
  };

  return edgePlaneCrossesTriangle(a, b, nB, planeB) || edgePlaneCrossesTriangle(b, a, nA, planeA);
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
    this.lastRingTraversal = { regularVertices: 0, extraordinaryVertices: 0, ambiguousPoles: 0, stoppedFans: 0 };
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
    if (!face) return [];
    return triangulatePolygon(this.positions, face) || triangulateWarpedQuad(this.positions, face) || [];
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

  // Preserve the original boolean entry point for older command callers.
  extrudeSelected(distance = 1) {
    return this.extrudeSelectedRegion(distance).changed;
  }

  /**
   * Extrude one face or one connected, coplanar face region along its boundary
   * plane normal. The complete result is built on a private candidate mesh and
   * replaces the source only after topology and polygon validation succeed.
   */
  extrudeSelectedRegion(distance = 1) {
    const fail = reason => ({ changed: false, reason });
    if (!Number.isFinite(distance) || Math.abs(distance) < 1e-4 || Math.abs(distance) > 100) {
      return fail('Extrude distance must be non-zero and within ±100.');
    }
    if (this.selectionMode !== 'face') return fail('Extrude requires Face Select mode.');

    const selected = [...this.faceSelection]
      .filter(id => Number.isInteger(id) && this.faces[id])
      .sort((a, b) => a - b);
    if (!selected.length || selected.length !== this.faceSelection.size) {
      return fail('Select one valid face or one connected planar face region before extruding.');
    }

    const sourceReport = this.validateTopology();
    if (!sourceReport.valid) {
      return fail('The source mesh has topology warnings. Validate and repair safe issues before extruding.');
    }

    const analysis = this.analyzeFaceRegion(selected);
    if (!analysis.valid) return fail(analysis.reason || 'Extrude could not analyze the selected face region.');
    if (!analysis.connected) return fail('Extrude requires one connected planar face region.');
    if (!analysis.planar) return fail('Extrude requires consistently wound, coplanar selected faces.');
    if (analysis.loopCount !== 1 || !analysis.boundaryLoops[0]?.isSimple) {
      return fail('Extrude requires one connected planar face region with a single simple boundary and no holes.');
    }

    const boundary = [...analysis.boundaryLoops[0].vertexIds];
    const projection = projectedPolygon(this.positions, boundary);
    if (!projection) return fail('The selected face-region boundary has no stable plane.');
    const tolerance = Math.max(1, projection.scale) * 1e-5;
    if (projection.deviation > tolerance || !triangulatePolygon(this.positions, boundary)) {
      return fail('Extrude requires a simple, planar face-region boundary.');
    }

    // Verify every selected face agrees with the region plane and winding.
    // The boundary's Newell normal is stable for concave polygons, unlike a
    // cross product from an arbitrary first triangle or an unweighted sum of
    // face normals.
    const origin = this.positions[boundary[0]];
    for (const faceId of selected) {
      const faceProjection = projectedPolygon(this.positions, this.faces[faceId]);
      if (!faceProjection || faceProjection.deviation > tolerance ||
          faceProjection.normal.reduce((sum, value, axis) => sum + value * projection.normal[axis], 0) < 0.999 ||
          this.faces[faceId].some(vertexId => Math.abs(projection.normal.reduce((sum, value, axis) =>
            sum + value * (this.positions[vertexId][axis] - origin[axis]), 0)) > tolerance) ||
          !this.triangulateFace(faceId).length) {
        return fail('Extrude requires consistently wound, coplanar selected faces.');
      }
    }

    const used = new Set(selected.flatMap(faceId => this.faces[faceId]));
    const nextPositions = this.positions.map(point => [...point]);
    const remap = new Map();
    for (const vertexId of [...used].sort((a, b) => a - b)) {
      const source = this.positions[vertexId];
      const moved = source.map((value, axis) => value + projection.normal[axis] * distance);
      if (!moved.every(Number.isFinite)) return fail('Extrude produced a non-finite vertex position.');
      remap.set(vertexId, nextPositions.length);
      nextPositions.push(moved);
    }

    const selectedSet = new Set(selected);
    const nextFaces = this.faces.map((face, faceId) => selectedSet.has(faceId)
      ? face.map(vertexId => remap.get(vertexId))
      : [...face]);
    for (let index = 0; index < boundary.length; index++) {
      const a = boundary[index], b = boundary[(index + 1) % boundary.length];
      const wall = [a, b, remap.get(b), remap.get(a)];
      if (!wall.every(Number.isInteger)) return fail('Extrude could not construct a complete boundary wall.');
      nextFaces.push(wall);
    }

    const candidate = new HalfEdgeMesh(nextPositions, nextFaces);
    const report = candidate.validateTopology();
    if (!report.valid) {
      return fail(`Extrude candidate failed topology validation (${report.issueCount} issue(s)); the source mesh was not changed.`);
    }
    if (candidate.faces.some((_, faceId) => !candidate.triangulateFace(faceId).length)) {
      return fail('Extrude candidate contains a face that cannot be triangulated; the source mesh was not changed.');
    }

    candidate.setSelectionMode('face');
    candidate.faceSelection = new Set(selected);
    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'face';
    this.clearSelection();
    this.rebuild();
    this.faceSelection = new Set(selected);

    return {
      changed: true,
      distance,
      normal: [...projection.normal],
      selectedFaces: selected.length,
      boundaryEdges: boundary.length,
      insertedVertices: used.size,
      createdFaces: boundary.length,
      topology: report
    };
  }

  // Preserve the original public entry point while routing it through the
  // validated constant-offset region operator.
  insetSelected(amount = 0.12) {
    return this.insetSelectedRegion(amount).changed;
  }

  /**
   * Inset one connected, coplanar face region by a constant boundary offset.
   * Boundary vertices are duplicated and moved inward; the selected interior
   * faces retain their topology, while one shared mitered ring face is added
   * per boundary edge. The operation is built and validated on a private mesh.
   * `amount` is a fraction of the shortest selected-region boundary edge.
   */
  insetSelectedRegion(amount = 0.12) {
    const fail = reason => ({ changed: false, reason });
    if (!Number.isFinite(amount) || amount < 0.005 || amount > 0.9) {
      return fail('Inset amount must be between 0.005 and 0.9.');
    }
    const selected = [...this.faceSelection].filter(id => Number.isInteger(id) && this.faces[id]).sort((a, b) => a - b);
    if (!selected.length) return fail('Select one connected face region before insetting.');
    const analysis = this.analyzeFaceRegion(selected);
    if (!analysis.valid) return fail(analysis.reason || 'Inset could not analyze the selected face region.');
    if (!analysis.connected) return fail('Inset requires one connected planar face region.');
    if (analysis.loopCount !== 1 || !analysis.boundaryLoops[0]?.isSimple) {
      return fail('Inset requires one connected planar face region with one simple boundary and no holes.');
    }
    if (!analysis.planar) return fail('Inset requires a planar, consistently wound face region.');

    const boundary = [...analysis.boundaryLoops[0].vertexIds];
    const projection = projectedPolygon(this.positions, boundary);
    if (!projection) return fail('Inset region boundary could not be projected to a stable plane.');
    const tolerance = projection.scale * 1e-5;
    if (projection.deviation > tolerance) return fail('Inset requires a planar region.');
    if (selected.some(faceId => {
      const faceProjection = projectedPolygon(this.positions, this.faces[faceId]);
      if (!faceProjection || faceProjection.deviation > tolerance) return true;
      const alignment = faceProjection.normal.reduce((sum, value, axis) => sum + value * projection.normal[axis], 0);
      if (alignment < 0.999) return true;
      const origin = this.positions[boundary[0]];
      return this.faces[faceId].some(vertexId => Math.abs(projection.normal.reduce((sum, value, axis) =>
        sum + value * (this.positions[vertexId][axis] - origin[axis]), 0)) > tolerance);
    })) return fail('Inset requires consistently wound, coplanar selected faces.');

    const origin = [...this.positions[boundary[0]]];
    // Use an orthonormal in-plane basis rather than dropping a world axis.
    // Dominant-axis projection is suitable for triangulation, but it distorts
    // distances on rotated planes and would make the inset width inconsistent.
    const normal = projection.normal;
    const reference = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const normalize = vector => {
      const length = Math.hypot(...vector) || 1;
      return vector.map(value => value / length);
    };
    const basisU = normalize(cross(reference, normal));
    const basisV = normalize(cross(normal, basisU));
    const regionPoints = boundary.map(vertexId => {
      const delta = this.positions[vertexId].map((value, axis) => value - origin[axis]);
      return [delta.reduce((sum, value, axis) => sum + value * basisU[axis], 0),
        delta.reduce((sum, value, axis) => sum + value * basisV[axis], 0)];
    });
    const coordinateBounds = [0, 1].map(axis => [
      Math.min(...regionPoints.map(point => point[axis])),
      Math.max(...regionPoints.map(point => point[axis]))
    ]);
    const regionScale = Math.max(1, ...coordinateBounds.map(([min, max]) => max - min));
    const sourceArea = signedArea2D(regionPoints);
    const epsilon = regionScale * regionScale * 1e-10;
    if (Math.abs(sourceArea) <= epsilon || polygonSelfIntersects(regionPoints, epsilon) || !triangulatePolygon(this.positions, boundary)) {
      return fail('Inset requires a simple, non-degenerate region boundary.');
    }
    const edgeLengths = boundary.map((vertexId, index) => {
      const a = this.positions[vertexId], b = this.positions[boundary[(index + 1) % boundary.length]];
      return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    });
    const shortestEdge = Math.min(...edgeLengths);
    if (!Number.isFinite(shortestEdge) || shortestEdge <= 1e-10) return fail('Inset region contains a zero-length boundary edge.');
    const distance = amount * shortestEdge;
    const offset = offsetPolygonInward(regionPoints, distance, regionScale);
    if (!offset.changed) return offset;

    const newPositions = this.positions.map(point => [...point]);
    const innerVertexByOuter = new Map();
    for (let index = 0; index < boundary.length; index++) {
      const inner2D = offset.points[index];
      const point = origin.map((value, axis) => value + basisU[axis] * inner2D[0] + basisV[axis] * inner2D[1]);
      if (!point.every(Number.isFinite)) return fail('Inset produced a non-finite offset vertex.');
      const newId = newPositions.length;
      newPositions.push(point);
      innerVertexByOuter.set(boundary[index], newId);
    }

    const selectedSet = new Set(selected);
    const nextFaces = this.faces.filter((_, faceId) => !selectedSet.has(faceId)).map(face => [...face]);
    const innerFaceIds = [];
    for (const faceId of selected) {
      const innerFace = this.faces[faceId].map(vertexId => innerVertexByOuter.get(vertexId) ?? vertexId);
      if (!triangulatePolygon(newPositions, innerFace)) return fail('Inset collapses or folds an inner selected face. Reduce the inset amount.');
      innerFaceIds.push(nextFaces.length);
      nextFaces.push(innerFace);
    }
    for (let index = 0; index < boundary.length; index++) {
      const a = boundary[index], b = boundary[(index + 1) % boundary.length];
      const ringFace = [a, b, innerVertexByOuter.get(b), innerVertexByOuter.get(a)];
      if (!ringFace.every(Number.isInteger) || !triangulatePolygon(newPositions, ringFace)) {
        return fail('Inset creates a degenerate boundary ring face. Reduce the inset amount.');
      }
      nextFaces.push(ringFace);
    }

    const candidate = new HalfEdgeMesh(newPositions, nextFaces);
    const report = candidate.validateTopology();
    if (!report.valid) return fail('Inset candidate failed topology validation; the source mesh was not changed.');
    candidate.setSelectionMode('face');
    candidate.faceSelection = new Set(innerFaceIds);

    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'face';
    this.clearSelection();
    this.rebuild();
    this.faceSelection = new Set(innerFaceIds);
    return {
      changed: true,
      amount,
      distance,
      selectedFaces: selected.length,
      boundaryEdges: boundary.length,
      insertedVertices: boundary.length,
      createdFaces: boundary.length,
      topology: report
    };
  }

  /**
   * Create a conservative face-region Bevel: raise the selected planar region
   * and connect its inward-offset boundary to the original perimeter with one
   * mitered transition wall per boundary edge.
   *
   * The candidate is built on a private mesh and committed atomically. One
   * connected, consistently wound planar region with one simple boundary is
   * required. Convex, collinear and reflex corners are accepted only when the
   * inward offset remains inside/simple and every miter and wall validates.
   * Excessive miters, folded walls, holes and unsupported topology reject.
   */
  bevelSelectedFaceRegion({ amount = 0.25, heightAmount = amount, segments = 1, profile = 0.5 } = {}) {
    const fail = reason => ({ changed: false, reason });
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 0.95) {
      return fail('Face Bevel amount must be between 0.01 and 0.95.');
    }
    if (!Number.isFinite(heightAmount) || heightAmount < 0.01 || heightAmount > 0.95) {
      return fail('Face Bevel height must be between 0.01 and 0.95.');
    }
    if (!Number.isInteger(segments) || segments < 1 || segments > 8) {
      return fail('Face Bevel supports between one and eight segments.');
    }
    if (!Number.isFinite(profile) || profile < 0 || profile > 1) {
      return fail('Face Bevel profile must be between 0 and 1.');
    }
    if (this.selectionMode !== 'face') return fail('Face Bevel requires Face Select mode.');

    const selected = [...this.faceSelection]
      .filter(id => Number.isInteger(id) && this.faces[id])
      .sort((a, b) => a - b);
    if (!selected.length || selected.length !== this.faceSelection.size) {
      return fail('Select one valid face or one connected face region before using Face Bevel.');
    }

    const analysis = this.analyzeFaceRegion(selected);
    if (!analysis.valid) return fail(analysis.reason || 'Face Bevel could not analyze the selected region.');
    if (!analysis.connected) return fail('Face Bevel requires one connected face region.');
    if (!analysis.planar) return fail('Face Bevel requires a consistently wound, coplanar face region.');
    if (analysis.loopCount !== 1 || !analysis.boundaryLoops[0]?.isSimple || !analysis.singleSimpleBoundary) {
      return fail('Face Bevel requires exactly one simple boundary loop with no holes.');
    }
    const sourceReport = this.validateTopology();
    if (!sourceReport.valid) {
      return fail('The source mesh has topology warnings. Validate and repair safe issues before Face Bevel.');
    }

    const loop = analysis.boundaryLoops[0];
    const boundary = [...loop.vertexIds];
    const normal = [...analysis.normal];
    const origin = [...this.positions[boundary[0]]];
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
    const basisU = normalize(cross(reference, normal));
    const basisV = basisU && normalize(cross(normal, basisU));
    if (!basisU || !basisV) return fail('Face Bevel could not establish a stable region plane.');

    const regionPoints = boundary.map(vertexId => {
      const delta = this.positions[vertexId].map((value, axis) => value - origin[axis]);
      return [
        delta.reduce((sum, value, axis) => sum + value * basisU[axis], 0),
        delta.reduce((sum, value, axis) => sum + value * basisV[axis], 0)
      ];
    });
    const coordinateBounds = [0, 1].map(axis => [
      Math.min(...regionPoints.map(point => point[axis])),
      Math.max(...regionPoints.map(point => point[axis]))
    ]);
    const regionScale = Math.max(1, ...coordinateBounds.map(([min, max]) => max - min));
    const sourceArea = signedArea2D(regionPoints);
    const epsilon = regionScale * regionScale * 1e-10;
    if (Math.abs(sourceArea) <= epsilon || polygonSelfIntersects(regionPoints, epsilon)) {
      return fail('Face Bevel requires a simple, non-degenerate region boundary.');
    }

    const edgeLengths = boundary.map((vertexId, index) => {
      const a = this.positions[vertexId];
      const b = this.positions[boundary[(index + 1) % boundary.length]];
      return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    });
    const shortestEdge = Math.min(...edgeLengths);
    if (!Number.isFinite(shortestEdge) || shortestEdge <= 1e-10) {
      return fail('Face Bevel region contains a zero-length boundary edge.');
    }
    const width = amount * shortestEdge * 0.45;
    if (!Number.isFinite(width) || width <= 1e-9) return fail('Face Bevel width is too small for a stable candidate.');

    const offset = offsetPolygonInward(regionPoints, width, regionScale);
    if (!offset.changed) return fail(offset.reason.replace(/^Inset/, 'Face Bevel'));

    // The shared analyzer classifies corners from the selected-region side.
    // Convex and reflex corners use the same inward offset-line intersection;
    // the offset solver and the complete wall candidate must prove that every
    // result remains simple, inside the source, planar and convex.
    const convexIds = new Set(loop.convexVertexIds || []);
    const concaveIds = new Set(loop.concaveVertexIds || []);
    const collinearIds = new Set(loop.collinearVertexIds || []);
    for (let index = 0; index < boundary.length; index++) {
      const vertexId = boundary[index];
      if (!convexIds.has(vertexId) && !concaveIds.has(vertexId) && !collinearIds.has(vertexId)) {
        return fail(`Face Bevel could not classify boundary corner ${vertexId} unambiguously.`);
      }
      const point = regionPoints[index];
      const insetPoint = offset.points[index];
      const miterLength = Math.hypot(insetPoint[0] - point[0], insetPoint[1] - point[1]);
      if (!Number.isFinite(miterLength) || miterLength > width * 4 + regionScale * 1e-8) {
        return fail('Face Bevel corner requires an excessive miter. Reduce the amount.');
      }
    }

    const height = heightAmount * shortestEdge * 0.45;
    const selectedSet = new Set(selected);
    const used = [...new Set(selected.flatMap(faceId => this.faces[faceId]))].sort((a, b) => a - b);
    const boundaryIndexByVertex = new Map(boundary.map((vertexId, index) => [vertexId, index]));
    const nextPositions = this.positions.map(point => [...point]);
    const remap = new Map();
    for (const vertexId of used) {
      const source = this.positions[vertexId];
      const raised = source.map((value, axis) => value + normal[axis] * height);
      const boundaryIndex = boundaryIndexByVertex.get(vertexId);
      if (boundaryIndex !== undefined) {
        const point2D = offset.points[boundaryIndex];
        for (let axis = 0; axis < 3; axis++) {
          raised[axis] += basisU[axis] * point2D[0] + basisV[axis] * point2D[1] -
            (basisU[axis] * regionPoints[boundaryIndex][0] + basisV[axis] * regionPoints[boundaryIndex][1]);
        }
      }
      if (!raised.every(Number.isFinite)) return fail('Face Bevel produced a non-finite vertex position.');
      remap.set(vertexId, nextPositions.length);
      nextPositions.push(raised);
    }

    const boundaryOffsetVectors = boundary.map((_, index) => {
      const point2D = offset.points[index];
      const sourcePoint = regionPoints[index];
      const dx = point2D[0] - sourcePoint[0];
      const dy = point2D[1] - sourcePoint[1];
      return basisU.map((value, axis) => value * dx + basisV[axis] * dy);
    });

    // Each profile row follows one monotonic cubic-Bezier cross-section from
    // the original boundary to the raised inset boundary. The control value
    // maps 0=concave, 0.5=rounded and 1=convex; endpoints are invariant.
    const profileControl = 0.25 + profile * 0.6045694996615875;
    const profileFactors = t => {
      const inverse = 1 - t;
      const inward = 3 * inverse * t * t * (1 - profileControl) + t * t * t;
      const rise = 3 * inverse * inverse * t * profileControl + 3 * inverse * t * t + t * t * t;
      return { inward, rise };
    };

    const boundaryRows = [boundary.map(vertexId => vertexId)];
    for (let step = 1; step < segments; step++) {
      const t = step / segments;
      const factors = profileFactors(t);
      const row = [];
      for (let index = 0; index < boundary.length; index++) {
        const source = this.positions[boundary[index]];
        const inward = boundaryOffsetVectors[index];
        const point = source.map((value, axis) => value + inward[axis] * factors.inward +
          normal[axis] * height * factors.rise);
        if (!point.every(Number.isFinite)) return fail('Face Bevel profile produced a non-finite intermediate vertex.');
        row.push(nextPositions.length);
        nextPositions.push(point);
      }
      boundaryRows.push(row);
    }
    boundaryRows.push(boundary.map(vertexId => remap.get(vertexId)));

    const nextFaces = this.faces.map((face, faceId) => selectedSet.has(faceId)
      ? face.map(vertexId => remap.get(vertexId))
      : [...face]);
    const bevelFaceStart = nextFaces.length;
    for (let step = 0; step < segments; step++) {
      const lower = boundaryRows[step];
      const upper = boundaryRows[step + 1];
      for (let index = 0; index < boundary.length; index++) {
        const next = (index + 1) % boundary.length;
        const wall = [lower[index], lower[next], upper[next], upper[index]];
        if (!wall.every(Number.isInteger)) return fail('Face Bevel could not construct a complete segmented perimeter wall.');
        // The viewport already renders every perimeter quad as these two
        // triangles. Store that diagonal in editable topology as well: a later
        // Edit Mode rotation can twist the cross-section, but each transition
        // triangle remains a valid planar face instead of becoming one invalid
        // non-planar/self-crossing quad.
        const wallTriangles = triangulatePolygon(nextPositions, wall);
        if (!wallTriangles?.length || wallTriangles.some(triangle => triangle.length !== 3)) {
          return fail('Face Bevel could not safely triangulate a segmented perimeter wall.');
        }
        nextFaces.push(...wallTriangles);
      }
    }

    const candidate = new HalfEdgeMesh(nextPositions, nextFaces);
    // Selected-region interior source vertices are replaced by their raised
    // copies. Compact only when those old interior points are now orphaned;
    // this fixes multi-row/multi-column grids without reordering an ordinary
    // single-face candidate that already has no isolated vertices.
    let report = candidate.validateTopology();
    if (report.counts.isolatedVertices) {
      candidate.compact();
      report = candidate.validateTopology();
    }
    if (!report.valid) {
      return fail(`Face Bevel candidate failed topology validation (${report.issueCount} issue(s)); the source mesh was not changed.`);
    }
    for (let faceId = 0; faceId < candidate.faces.length; faceId++) {
      if (!candidate.triangulateFace(faceId).length) {
        return fail('Face Bevel candidate contains a face that cannot be triangulated; the source mesh was not changed.');
      }
    }
    for (let faceId = bevelFaceStart; faceId < candidate.faces.length; faceId++) {
      const projection = projectedPolygon(candidate.positions, candidate.faces[faceId]);
      const convex = projection && Math.abs(signedArea2D(projection.points)) > projection.scale * projection.scale * 1e-10 &&
        !polygonSelfIntersects(projection.points, projection.scale * projection.scale * 1e-10) &&
        projection.points.every((point, index) =>
          cross2(
            projection.points[(index - 1 + projection.points.length) % projection.points.length],
            point,
            projection.points[(index + 1) % projection.points.length]
          ) * Math.sign(signedArea2D(projection.points)) >= -projection.scale * projection.scale * 1e-9
        );
      if (!projection || projection.deviation > projection.scale * 1e-5 || !convex) {
        return fail('Face Bevel produced a non-planar, folded or non-convex perimeter wall; the source mesh was not changed.');
      }
    }

    candidate.setSelectionMode('face');
    candidate.faceSelection = new Set(selected);
    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'face';
    this.clearSelection();
    this.rebuild();
    this.faceSelection = new Set(selected);

    return {
      changed: true,
      operation: 'face-region',
      amount,
      heightAmount,
      width,
      height,
      normal,
      selectedFaces: selected.length,
      boundaryEdges: boundary.length,
      convexCorners: loop.convexVertexIds.length,
      reflexCorners: loop.concaveVertexIds.length,
      collinearCorners: loop.collinearVertexIds.length,
      insertedVertices: used.length + boundary.length * (segments - 1),
      createdFaces: boundary.length * segments * 2,
      segments,
      profile,
      topology: report
    };
  }


  /**
   * Create one continuous Face Bevel over a small, smoothly curved connected
   * surface patch. The selected top remains welded: every selected source
   * vertex is duplicated once and displaced along an area-weighted smooth
   * vertex normal. The boundary is inset in its local tangent planes and the
   * transition is triangulated so curved rows never rely on warped quads.
   *
   * This deliberately narrow envelope requires one connected non-planar patch,
   * one simple projected boundary, smooth adjacent face normals and a validated
   * private candidate. Unsupported curvature/folds reject without mutation.
   */
  bevelSelectedCurvedFaceRegion({ amount = 0.25, heightAmount = amount, segments = 1, profile = 0.5 } = {}) {
    const fail = reason => ({ changed: false, reason });
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 0.95) return fail('Curved Face Bevel amount must be between 0.01 and 0.95.');
    if (!Number.isFinite(heightAmount) || heightAmount < 0.01 || heightAmount > 0.95) return fail('Curved Face Bevel height must be between 0.01 and 0.95.');
    if (!Number.isInteger(segments) || segments < 1 || segments > 8) return fail('Curved Face Bevel supports between one and eight segments.');
    if (!Number.isFinite(profile) || profile < 0 || profile > 1) return fail('Curved Face Bevel profile must be between 0 and 1.');
    if (this.selectionMode !== 'face') return fail('Curved Face Bevel requires Face Select mode.');

    const selected = [...this.faceSelection].filter(id => Number.isInteger(id) && this.faces[id]).sort((a, b) => a - b);
    if (selected.length < 2 || selected.length !== this.faceSelection.size) {
      return fail('Continuous Curved Face Bevel requires at least two valid selected faces.');
    }
    const analysis = this.analyzeFaceRegion(selected);
    if (!analysis.valid) return fail(analysis.reason || 'Curved Face Bevel could not analyze the selected region.');
    if (!analysis.connected) return fail('Continuous Curved Face Bevel requires one connected face region.');
    if (analysis.planar) return fail('Use Connected Region Face Bevel for planar selections.');
    if (analysis.loopCount !== 1) return fail('Continuous Curved Face Bevel requires exactly one boundary loop with no holes.');

    const sourceReport = this.validateTopology();
    if (!sourceReport.valid) return fail('The source mesh has topology warnings. Validate and repair safe issues before Curved Face Bevel.');

    const selectedSet = new Set(selected);
    const vectorLength = vector => Math.hypot(vector[0], vector[1], vector[2]);
    const normalize = vector => {
      const length = vectorLength(vector);
      return Number.isFinite(length) && length > 1e-12 ? vector.map(value => value / length) : null;
    };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
    const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
    const addScaled = (point, direction, scale) => point.map((value, axis) => value + direction[axis] * scale);
    const polygonAreaVector = face => {
      const area = [0, 0, 0];
      for (let index = 0; index < face.length; index++) {
        const a = this.positions[face[index]], b = this.positions[face[(index + 1) % face.length]];
        area[0] += (a[1] - b[1]) * (a[2] + b[2]);
        area[1] += (a[2] - b[2]) * (a[0] + b[0]);
        area[2] += (a[0] - b[0]) * (a[1] + b[1]);
      }
      return area;
    };
    const faceNormals = new Map();
    const vertexNormalSums = this.positions.map(() => [0, 0, 0]);
    const vertexNormalWeights = this.positions.map(() => 0);
    const edgeUses = new Map();
    const used = [...new Set(selected.flatMap(faceId => this.faces[faceId]))].sort((a, b) => a - b);
    let regionAreaVector = [0, 0, 0], totalSelectedArea = 0;

    for (let faceId = 0; faceId < this.faces.length; faceId++) {
      const face = this.faces[faceId];
      const areaVector = polygonAreaVector(face);
      const doubleArea = vectorLength(areaVector);
      if (!Number.isFinite(doubleArea) || doubleArea <= 1e-10) {
        if (selectedSet.has(faceId)) return fail(`Selected face ${faceId + 1} has no stable surface normal.`);
        continue;
      }
      const normal = areaVector.map(value => value / doubleArea);
      faceNormals.set(faceId, normal);
      for (const vertexId of face) {
        for (let axis = 0; axis < 3; axis++) vertexNormalSums[vertexId][axis] += areaVector[axis];
        vertexNormalWeights[vertexId] += doubleArea;
      }
      if (selectedSet.has(faceId)) {
        for (let axis = 0; axis < 3; axis++) regionAreaVector[axis] += areaVector[axis];
        totalSelectedArea += doubleArea;
      }
      for (let index = 0; index < face.length; index++) {
        const key = keyFor(face[index], face[(index + 1) % face.length]);
        if (!edgeUses.has(key)) edgeUses.set(key, []);
        edgeUses.get(key).push(faceId);
      }
    }

    const regionNormal = normalize(regionAreaVector);
    const regionCoherence = vectorLength(regionAreaVector) / Math.max(1e-12, totalSelectedArea);
    if (!regionNormal || regionCoherence < 0.58) {
      return fail('The selected surface patch bends too far for one continuous bevel. Select a smaller, more locally consistent patch.');
    }

    // Reject hard creases at both the selected interior and its perimeter.
    // The supported prototype is for smoothly varying normals, not sharp edges.
    const minimumNormalDot = Math.cos(55 * Math.PI / 180);
    for (const [edgeKey, incidents] of edgeUses) {
      if (!incidents.some(faceId => selectedSet.has(faceId))) continue;
      if (incidents.length > 2) return fail(`Curved Face Bevel touches non-manifold edge ${edgeKey}.`);
      if (incidents.length === 2) {
        const a = faceNormals.get(incidents[0]), b = faceNormals.get(incidents[1]);
        if (!a || !b || dot(a, b) < minimumNormalDot) {
          return fail('Curved Face Bevel only supports smoothly varying adjacent face normals; a sharp crease was found.');
        }
      }
    }

    const vertexNormals = new Map();
    for (const vertexId of used) {
      const sum = vertexNormalSums[vertexId];
      const weight = vertexNormalWeights[vertexId];
      const normal = normalize(sum);
      const coherence = weight > 0 ? vectorLength(sum) / weight : 0;
      if (!normal || coherence < 0.68) {
        return fail(`Vertex ${vertexId + 1} has an ambiguous smooth normal. Reduce the selected patch or use Individual Faces mode.`);
      }
      vertexNormals.set(vertexId, normal);
    }
    for (const faceId of selected) {
      const faceNormal = faceNormals.get(faceId);
      for (const vertexId of this.faces[faceId]) {
        if (dot(vertexNormals.get(vertexId), faceNormal) < 0.45) {
          return fail('The selected patch has no stable tangent-normal field. Use Individual Faces mode for this selection.');
        }
      }
    }

    const boundary = [...analysis.boundaryLoops[0].vertexIds];
    if (boundary.length < 3 || new Set(boundary).size !== boundary.length) {
      return fail('Curved Face Bevel requires one simple, non-repeating boundary loop.');
    }
    const reference = Math.abs(regionNormal[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    const basisU = normalize(cross(reference, regionNormal));
    const basisV = basisU && normalize(cross(regionNormal, basisU));
    if (!basisU || !basisV) return fail('Curved Face Bevel could not establish a stable reference tangent plane.');
    const origin = this.positions[boundary[0]];
    const project = point => {
      const delta = subtract(point, origin);
      return [dot(delta, basisU), dot(delta, basisV)];
    };
    const boundary2D = boundary.map(vertexId => project(this.positions[vertexId]));
    const bounds = [0, 1].map(axis => [
      Math.min(...boundary2D.map(point => point[axis])),
      Math.max(...boundary2D.map(point => point[axis]))
    ]);
    const boundaryScale = Math.max(1, ...bounds.map(([min, max]) => max - min));
    const epsilon = boundaryScale * boundaryScale * 1e-10;
    if (Math.abs(signedArea2D(boundary2D)) <= epsilon || polygonSelfIntersects(boundary2D, epsilon)) {
      return fail('The curved region boundary is not simple in its local tangent-plane projection.');
    }

    const edgeLengths = boundary.map((vertexId, index) => vectorLength(subtract(
      this.positions[boundary[(index + 1) % boundary.length]], this.positions[vertexId]
    )));
    const shortestEdge = Math.min(...edgeLengths);
    if (!Number.isFinite(shortestEdge) || shortestEdge <= 1e-10) return fail('Curved Face Bevel contains a zero-length boundary edge.');
    const width = amount * shortestEdge * 0.45;
    const height = heightAmount * shortestEdge * 0.45;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 1e-9 || height <= 1e-9) {
      return fail('Curved Face Bevel width or height is too small for a stable candidate.');
    }

    const projectTangent = (vector, normal) => normalize(subtract(vector, normal.map(value => value * dot(vector, normal))));
    const inwardOffsets = new Map();
    const offsetLoop2D = [];
    for (let index = 0; index < boundary.length; index++) {
      const vertexId = boundary[index];
      const previousId = boundary[(index - 1 + boundary.length) % boundary.length];
      const nextId = boundary[(index + 1) % boundary.length];
      const normal = vertexNormals.get(vertexId);
      const incoming = projectTangent(subtract(this.positions[vertexId], this.positions[previousId]), normal);
      const outgoing = projectTangent(subtract(this.positions[nextId], this.positions[vertexId]), normal);
      if (!incoming || !outgoing) return fail(`Boundary vertex ${vertexId + 1} has no stable tangent direction.`);
      const inwardPrevious = normalize(cross(normal, incoming));
      const inwardNext = normalize(cross(normal, outgoing));
      const bisector = inwardPrevious && inwardNext ? normalize(inwardPrevious.map((value, axis) => value + inwardNext[axis])) : null;
      if (!bisector) return fail(`Boundary vertex ${vertexId + 1} has an ambiguous inward tangent.`);
      const alignment = Math.min(dot(bisector, inwardPrevious), dot(bisector, inwardNext));
      if (!Number.isFinite(alignment) || alignment <= 0.25) {
        return fail('Curved Face Bevel encountered an acute or ambiguous tangent miter. Reduce the amount or use Individual Faces mode.');
      }
      const miterLength = width / alignment;
      if (!Number.isFinite(miterLength) || miterLength > width * 4) {
        return fail('Curved Face Bevel requires an excessive tangent miter. Reduce the amount.');
      }
      const offset = bisector.map(value => value * miterLength);
      if (dot(offset, inwardPrevious) < width * 0.98 || dot(offset, inwardNext) < width * 0.98) {
        return fail('Curved Face Bevel could not form a consistent inward tangent offset.');
      }
      const sourcePoint = this.positions[vertexId];
      const targetPoint = sourcePoint.map((value, axis) => value + offset[axis]);
      const target2D = project(targetPoint);
      if (!pointInPolygon2D(target2D, boundary2D, epsilon)) {
        return fail('Curved Face Bevel tangent offset leaves the selected patch. Reduce the amount.');
      }
      inwardOffsets.set(vertexId, offset);
      offsetLoop2D.push(target2D);
    }
    if (polygonSelfIntersects(offsetLoop2D, epsilon) || Math.abs(signedArea2D(offsetLoop2D)) <= epsilon ||
        Math.sign(signedArea2D(offsetLoop2D)) !== Math.sign(signedArea2D(boundary2D))) {
      return fail('Curved Face Bevel inward tangent offset collapses or self-intersects. Reduce the amount.');
    }

    const boundarySet = new Set(boundary);
    const boundaryIndexByVertex = new Map(boundary.map((vertexId, index) => [vertexId, index]));
    const nextPositions = this.positions.map(point => [...point]);
    const remap = new Map();
    for (const vertexId of used) {
      const source = this.positions[vertexId];
      const normal = vertexNormals.get(vertexId);
      let raised = source.map((value, axis) => value + normal[axis] * height);
      if (boundarySet.has(vertexId)) {
        const offset = inwardOffsets.get(vertexId);
        raised = raised.map((value, axis) => value + offset[axis]);
      }
      if (!raised.every(Number.isFinite)) return fail('Curved Face Bevel produced a non-finite raised vertex.');
      remap.set(vertexId, nextPositions.length);
      nextPositions.push(raised);
    }

    // Keep one shared raised copy per source vertex. Triangulate selected source
    // polygons before offsetting so even a warped raised quad becomes valid
    // planar triangles while all selected internal seams remain welded.
    const nextFaces = [];
    const selectedOutputFaceIds = new Set();
    for (let faceId = 0; faceId < this.faces.length; faceId++) {
      if (!selectedSet.has(faceId)) {
        nextFaces.push([...this.faces[faceId]]);
        continue;
      }
      const triangles = this.triangulateFace(faceId);
      if (!triangles.length) return fail(`Selected face ${faceId + 1} could not be triangulated for the curved offset.`);
      const expectedNormal = faceNormals.get(faceId);
      for (const triangle of triangles) {
        const mapped = triangle.map(vertexId => remap.get(vertexId));
        if (mapped.some(vertexId => !Number.isInteger(vertexId))) return fail('Curved Face Bevel could not remap a selected top-face vertex.');
        const a = nextPositions[mapped[0]], b = nextPositions[mapped[1]], c = nextPositions[mapped[2]];
        const areaNormal = cross(subtract(b, a), subtract(c, a));
        const areaMagnitude = vectorLength(areaNormal);
        if (!Number.isFinite(areaMagnitude) || areaMagnitude <= boundaryScale * boundaryScale * 1e-10 ||
            dot(areaNormal, expectedNormal) <= areaMagnitude * 0.08) {
          return fail('Curved Face Bevel would invert or collapse a raised top triangle. Reduce the height.');
        }
        selectedOutputFaceIds.add(nextFaces.length);
        nextFaces.push(mapped);
      }
    }

    const boundaryRows = [boundary.map(vertexId => vertexId)];
    const profileControl = 0.25 + profile * 0.6045694996615875;
    const profileFactors = t => {
      const inverse = 1 - t;
      return {
        inward: 3 * inverse * t * t * (1 - profileControl) + t * t * t,
        rise: 3 * inverse * inverse * t * profileControl + 3 * inverse * t * t + t * t * t
      };
    };
    for (let step = 1; step < segments; step++) {
      const factors = profileFactors(step / segments);
      const row = [];
      for (const vertexId of boundary) {
        const source = this.positions[vertexId];
        const normal = vertexNormals.get(vertexId);
        const inward = inwardOffsets.get(vertexId);
        const point = source.map((value, axis) => value + inward[axis] * factors.inward + normal[axis] * height * factors.rise);
        if (!point.every(Number.isFinite)) return fail('Curved Face Bevel profile produced a non-finite transition vertex.');
        row.push(nextPositions.length);
        nextPositions.push(point);
      }
      boundaryRows.push(row);
    }
    boundaryRows.push(boundary.map(vertexId => remap.get(vertexId)));

    const transitionFaceStart = nextFaces.length;
    for (let step = 0; step < segments; step++) {
      const lower = boundaryRows[step], upper = boundaryRows[step + 1];
      for (let index = 0; index < boundary.length; index++) {
        const next = (index + 1) % boundary.length;
        const quad = [lower[index], lower[next], upper[next], upper[index]];
        const points = quad.map(vertexId => nextPositions[vertexId]);
        const diagonal02 = vectorLength(subtract(points[2], points[0]));
        const diagonal13 = vectorLength(subtract(points[3], points[1]));
        const triangles = diagonal02 <= diagonal13
          ? [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]]
          : [[quad[0], quad[1], quad[3]], [quad[1], quad[2], quad[3]]];
        const edgeDirection = normalize(subtract(this.positions[boundary[next]], this.positions[boundary[index]]));
        const averageNormal = normalize(vertexNormals.get(boundary[index]).map((value, axis) =>
          value + vertexNormals.get(boundary[next])[axis]));
        const expectedOutward = edgeDirection && averageNormal ? normalize(cross(edgeDirection, averageNormal)) : null;
        if (!expectedOutward) return fail('Curved Face Bevel could not establish a stable transition-wall direction.');
        for (const triangle of triangles) {
          const [aId, bId, cId] = triangle;
          const a = nextPositions[aId], b = nextPositions[bId], c = nextPositions[cId];
          const areaNormal = cross(subtract(b, a), subtract(c, a));
          const areaMagnitude = vectorLength(areaNormal);
          if (!Number.isFinite(areaMagnitude) || areaMagnitude <= boundaryScale * boundaryScale * 1e-10 ||
              dot(areaNormal, expectedOutward) <= areaMagnitude * 0.025) {
            return fail('Curved Face Bevel produced a folded or inverted transition triangle. Reduce width/height or use Individual Faces mode.');
          }
          nextFaces.push(triangle);
        }
      }
    }

    const candidate = new HalfEdgeMesh(nextPositions, nextFaces);
    let report = candidate.validateTopology();
    if (report.counts.isolatedVertices) {
      candidate.compact();
      report = candidate.validateTopology();
    }
    if (!report.valid) {
      return fail(`Curved Face Bevel candidate failed topology validation (${report.issueCount} issue(s)); the source mesh was not changed.`);
    }
    for (let faceId = 0; faceId < candidate.faces.length; faceId++) {
      if (!candidate.triangulateFace(faceId).length) {
        return fail('Curved Face Bevel candidate contains a triangle that could not be validated; the source mesh was not changed.');
      }
    }

    // Check only geometry changed by this operation against the complete
    // candidate surface. A spatial hash keeps distant scene triangles out of
    // the exact triangle/triangle tests; exceptionally large triangles use a
    // small overflow list rather than occupying an unbounded number of cells.
    const collisionRecords = [];
    const affectedFace = faceId => selectedOutputFaceIds.has(faceId) || faceId >= transitionFaceStart;
    for (let faceId = 0; faceId < candidate.faces.length; faceId++) {
      const affected = affectedFace(faceId);
      for (const triangle of candidate.triangulateFace(faceId)) {
        const points = triangle.map(vertexId => candidate.positions[vertexId]);
        const min = [0, 1, 2].map(axis => Math.min(...points.map(point => point[axis])));
        const max = [0, 1, 2].map(axis => Math.max(...points.map(point => point[axis])));
        collisionRecords.push({ ids: triangle, points, min, max, affected, index: collisionRecords.length, faceId });
      }
    }
    const affectedRecords = collisionRecords.filter(record => record.affected);
    const affectedMinimum = [0, 1, 2].map(axis => Math.min(...affectedRecords.map(record => record.min[axis])));
    const affectedMaximum = [0, 1, 2].map(axis => Math.max(...affectedRecords.map(record => record.max[axis])));
    const affectedExtent = Math.max(...[0, 1, 2].map(axis => affectedMaximum[axis] - affectedMinimum[axis]));
    const collisionTolerance = Math.max(1e-10, affectedExtent * 1e-8);
    const cellSize = Math.max(1e-6, affectedExtent / 8, collisionTolerance * 4);
    const cells = new Map();
    const overflow = [];
    const cellRangeFor = record => {
      const low = record.min.map(value => Math.floor((value - collisionTolerance) / cellSize));
      const high = record.max.map(value => Math.floor((value + collisionTolerance) / cellSize));
      const count = (high[0] - low[0] + 1) * (high[1] - low[1] + 1) * (high[2] - low[2] + 1);
      return count > 256 ? null : { low, high, count };
    };
    const cellKey = (x, y, z) => `${x},${y},${z}`;
    for (const record of collisionRecords) {
      const range = cellRangeFor(record);
      if (!range) {
        overflow.push(record.index);
        continue;
      }
      for (let x = range.low[0]; x <= range.high[0]; x++) {
        for (let y = range.low[1]; y <= range.high[1]; y++) {
          for (let z = range.low[2]; z <= range.high[2]; z++) {
            const key = cellKey(x, y, z);
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(record.index);
          }
        }
      }
    }
    const boundsOverlap = (a, b) => [0, 1, 2].every(axis =>
      a.min[axis] <= b.max[axis] + collisionTolerance && b.min[axis] <= a.max[axis] + collisionTolerance
    );
    let collisionPairsChecked = 0;
    for (const record of affectedRecords) {
      const range = cellRangeFor(record);
      const nearby = new Set(overflow);
      if (!range) {
        for (const candidateRecord of collisionRecords) nearby.add(candidateRecord.index);
      } else {
        for (let x = range.low[0]; x <= range.high[0]; x++) {
          for (let y = range.low[1]; y <= range.high[1]; y++) {
            for (let z = range.low[2]; z <= range.high[2]; z++) {
              for (const index of cells.get(cellKey(x, y, z)) || []) nearby.add(index);
            }
          }
        }
      }
      for (const otherIndex of nearby) {
        if (otherIndex === record.index || (collisionRecords[otherIndex].affected && otherIndex < record.index)) continue;
        const other = collisionRecords[otherIndex];
        if (!boundsOverlap(record, other)) continue;
        collisionPairsChecked++;
        if (trianglesIntersectBeyondSharedTopology(candidate.positions, record.ids, other.ids, collisionTolerance)) {
          return fail(`Curved Face Bevel would intersect existing or newly created geometry near face ${other.faceId + 1}. Reduce the width/height or use Individual Faces mode.`);
        }
      }
    }

    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'face';
    this.clearSelection();
    this.rebuild();
    this.faceSelection = new Set(selectedOutputFaceIds);
    return {
      changed: true,
      operation: 'face-curved-region',
      amount,
      heightAmount,
      width,
      height,
      normal: regionNormal,
      selectedFaces: selected.length,
      selectedTopTriangles: selectedOutputFaceIds.size,
      boundaryEdges: boundary.length,
      insertedVertices: used.length + boundary.length * (segments - 1),
      createdFaces: nextFaces.length - transitionFaceStart,
      segments,
      profile,
      maximumAdjacentNormalAngle: 55,
      collisionPairsChecked,
      topology: report
    };
  }

  /**
   * Bevel every selected polygon as its own panel. Each face is processed on
   * one private candidate using the validated single-face region path, so a
   * curved selection can still work when every individual polygon is planar.
   * Per-face settings let the modal preserve different width/height/profile
   * values while the selected faces remain one selection set.
   */
  bevelSelectedFacesIndividually({ faceSettings = {}, amount = 0.25, heightAmount = amount, segments = 1, profile = 0.5 } = {}) {
    const fail = reason => ({ changed: false, reason });
    if (this.selectionMode !== 'face') return fail('Individual Face Bevel requires Face Select mode.');
    const selected = [...this.faceSelection]
      .filter(id => Number.isInteger(id) && this.faces[id])
      .sort((a, b) => a - b);
    if (!selected.length || selected.length !== this.faceSelection.size) {
      return fail('Select one or more valid faces before using Individual Face Bevel.');
    }
    if (selected.length < 2) {
      return fail('Individual Face mode requires at least two selected faces. Use Region mode for one face.');
    }

    const candidate = new HalfEdgeMesh(this.positions, this.faces);
    const perFace = [];
    for (const faceId of selected) {
      const settings = faceSettings instanceof Map ? faceSettings.get(faceId) : faceSettings?.[faceId];
      const options = {
        amount: settings?.amount ?? amount,
        heightAmount: settings?.heightAmount ?? heightAmount,
        segments: settings?.segments ?? segments,
        profile: settings?.profile ?? profile
      };
      candidate.setSelectionMode('face');
      candidate.faceSelection = new Set([faceId]);
      const result = candidate.bevelSelectedFaceRegion(options);
      if (!result.changed) {
        return fail(`Face ${faceId + 1} could not be beveled individually: ${result.reason || 'unsupported face geometry.'}`);
      }
      perFace.push({ faceId, ...options, width: result.width, height: result.height,
        boundaryEdges: result.boundaryEdges, insertedVertices: result.insertedVertices,
        createdFaces: result.createdFaces, reflexCorners: result.reflexCorners || 0,
        normal: result.normal });
    }

    const mean = key => perFace.reduce((sum, item) => sum + item[key], 0) / perFace.length;
    const topology = candidate.validateTopology();
    if (!topology.valid) {
      return fail('Individual Face Bevel failed final topology validation; the source mesh was not changed.');
    }
    candidate.setSelectionMode('face');
    candidate.clearSelection();
    candidate.rebuild();
    candidate.faceSelection = new Set(selected);
    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'face';
    this.clearSelection();
    this.rebuild();
    this.faceSelection = new Set(selected);
    return {
      changed: true,
      operation: 'face-individual',
      selectedFaces: selected.length,
      width: mean('width'),
      height: mean('height'),
      boundaryEdges: perFace.reduce((sum, item) => sum + item.boundaryEdges, 0),
      insertedVertices: perFace.reduce((sum, item) => sum + item.insertedVertices, 0),
      createdFaces: perFace.reduce((sum, item) => sum + item.createdFaces, 0),
      reflexCorners: perFace.reduce((sum, item) => sum + item.reflexCorners, 0),
      perFace,
      topology
    };
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

  analyzeFaceRegion(faceIds) {
    return analyzeFaceRegionBoundary(this.positions, this.faces, faceIds);
  }

  // Preserve the legacy single-loop API used by Extrude, Inset and Dissolve.
  // New operators should consume analyzeFaceRegion() so holes and multiple
  // components remain explicit instead of collapsing into a generic null.
  boundaryForRegion(faceIds) {
    if (!Array.isArray(faceIds) || faceIds.length < 2) return null;
    const analysis = this.analyzeFaceRegion(faceIds);
    if (!analysis.valid || !analysis.supportsPlanarSingleBoundary) return null;
    return [...analysis.boundaryLoops[0].vertexIds];
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
   * Transactionally bevels one edge, a supported connected path of two to
   * eight edges, or up to eight disjoint edge selections. Multi-segment/profile work
   * is built on a private candidate and committed only after full validation.
   */
  bevelSelectedEdges({ amount = 0.25, segments = 1, profile = 0.5 } = {}) {
    const fail = reason => ({ changed: false, reason });
    if (!Number.isInteger(segments) || segments < 1 || segments > 8) {
      return fail('Bevel supports between one and eight segments.');
    }
    if (!Number.isFinite(profile) || profile < 0 || profile > 1) {
      return fail('Bevel profile must be between 0 and 1.');
    }
    if (segments === 1) {
      const result = this._bevelSelectedEdgesCore({ amount });
      if (!result.changed) return result;
      const { bevelFaceRefs, ...publicResult } = result;
      const profileScale = (result.maxChainValence || result.maxInternalValence || 3) > 4 ? 0.25 : 1;
      return { ...publicResult, segments, profile, profileScale };
    }

    // Segment/profile work is performed on a private copy. The source remains
    // untouched unless every shared split edge, cap boundary and triangle
    // passes topology validation.
    const candidate = new HalfEdgeMesh(this.positions, this.faces);
    candidate.selectionMode = this.selectionMode;
    candidate.edgeSelection = new Set(this.edgeSelection);
    const baseResult = candidate._bevelSelectedEdgesCore({ amount });
    if (!baseResult.changed) return baseResult;
    const profileScale = (baseResult.maxChainValence || baseResult.maxInternalValence || 3) > 4 ? 0.25 : 1;
    const refined = candidate._applyBevelSegments({
      bevelFaceRefs: baseResult.bevelFaceRefs,
      segments,
      profile,
      profileScale
    });
    if (!refined.changed) return fail(refined.reason || 'Segmented bevel validation failed; the original mesh was not changed.');

    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'edge';
    this.clearSelection();
    this.rebuild();
    this.edgeSelection = new Set(candidate.edgeSelection);
    const { bevelFaceRefs, ...publicResult } = baseResult;
    return {
      ...publicResult,
      segments,
      profile,
      profileScale,
      insertedVertices: baseResult.insertedVertices + refined.insertedVertices,
      createdFaces: refined.createdFaces + (baseResult.capPatches || 0),
      selectedEdges: this.edgeSelection.size
    };
  }

  _bevelSelectedEdgesCore({ amount = 0.25 } = {}) {
    const fail = reason => ({ changed: false, reason });
    if (this.selectionMode !== 'edge' || this.edgeSelection.size < 1 || this.edgeSelection.size > 8) {
      return fail('Select between one and eight edges in Edge Select mode.');
    }
    if (this.edgeSelection.size === 1) return this.bevelSelectedEdge({ amount });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 0.95) {
      return fail('Bevel amount must be greater than 0 and no more than 0.95.');
    }
    const sharedSelections = [...this.edgeSelection];
    if (sharedSelections.length === 2) {
      const firstEdge = this.edges[sharedSelections[0]], secondEdge = this.edges[sharedSelections[1]];
      const sharedVertices = firstEdge && secondEdge
        ? firstEdge.vertices.filter(vertexId => secondEdge.vertices.includes(vertexId)) : [];
      if (sharedVertices.length) return this.bevelSelectedAdjacentPair({ amount, edgeIds: sharedSelections, sharedVertexId: sharedVertices[0] });
    }
    if (sharedSelections.length > 2) {
      // Connected selections are either one simple three-to-eight-edge
      // path or a collection of disjoint two-edge miter pairs. Branches,
      // cycles, mixed components and shared endpoints between pairs reject.
      const remaining = new Set(sharedSelections);
      const components = [];
      while (remaining.size) {
        const seed = remaining.values().next().value;
        const component = new Set([seed]);
        const queue = [seed];
        remaining.delete(seed);
        for (let cursor = 0; cursor < queue.length; cursor++) {
          const current = this.edges[queue[cursor]];
          if (!current) return fail('A selected bevel edge could not be resolved.');
          for (const candidateId of [...remaining]) {
            const candidate = this.edges[candidateId];
            if (!candidate) return fail('A selected bevel edge could not be resolved.');
            if (current.vertices.some(vertexId => candidate.vertices.includes(vertexId))) {
              remaining.delete(candidateId);
              component.add(candidateId);
              queue.push(candidateId);
            }
          }
        }
        components.push([...component]);
      }
      if (components.some(component => component.length > 1)) {
        if (components.length === 1 && components[0].length >= 3 && components[0].length <= 8) {
          return this.bevelSelectedConnectedChain({ amount, edgeIds: components[0] });
        }
        if (components.every(component => component.length === 2)) {
          return this.bevelSelectedAdjacentPairs({ amount, edgePairs: components });
        }
        return fail('Connected Bevel accepts one simple three-to-eight-edge chain or separate two-edge miter pairs; branches, cycles and mixed connected/disconnected selections are rejected.');
      }
    }
    const sourceReport = this.validateTopology();
    if (!sourceReport.valid) return fail('The mesh has existing topology warnings. Validate and repair safe issues before beveling.');

    const occupiedVertices = new Set();
    const occupiedFaces = new Set();
    const occupiedCutEdges = new Set();
    const sourceRefs = [];
    for (const edgeId of this.edgeSelection) {
      const edge = this.edges[edgeId];
      if (!edge || edge.halfEdges.length !== 2 || !edge.halfEdges.every(halfEdge => halfEdge.twin)) {
        return fail('Multi-edge Bevel requires closed interior manifold edges only.');
      }
      const [first, second] = edge.halfEdges;
      if (first.next.origin !== second.origin || second.next.origin !== first.origin || first.twin !== second || second.twin !== first) {
        return fail('A selected edge has inconsistent face winding. Repair or orient the mesh before beveling.');
      }
      const endpoints = edge.vertices;
      const localFaces = new Set([first.face?.id, second.face?.id]);
      if (localFaces.has(undefined) || localFaces.size !== 2) return fail('A selected edge has an ambiguous adjacent face pair.');
      const localCutEdges = new Set();
      for (const vertexId of endpoints) {
        const incidentFaces = this.faces.reduce((ids, face, faceId) => {
          if (face.includes(vertexId)) ids.push(faceId);
          return ids;
        }, []);
        const incidentEdges = this.edges.filter(item => item.vertices.includes(vertexId));
        if (incidentFaces.length !== 3 || incidentEdges.length !== 3 || incidentEdges.some(item => item.halfEdges.length !== 2)) {
          return fail('Multi-edge Bevel currently supports closed valence-three corners only.');
        }
        const thirdFaces = incidentFaces.filter(id => !localFaces.has(id));
        if (thirdFaces.length !== 1) return fail('A selected edge has an ambiguous three-face endpoint fan.');
        localFaces.add(thirdFaces[0]);
        for (const item of incidentEdges) {
          if (item.id !== edgeId) localCutEdges.add(item.id);
        }
        if (occupiedVertices.has(vertexId)) return fail('Selected bevel neighborhoods share an endpoint; only exactly two adjacent edges at one common corner are supported in connected mode.');
      }
      if (localFaces.size !== 4) return fail('A selected edge does not have four distinct affected faces.');
      if ([...localFaces].some(id => occupiedFaces.has(id))) {
        return fail('Selected bevel neighborhoods share a face and cannot be separated safely.');
      }
      if ([...localCutEdges].some(id => occupiedCutEdges.has(id))) {
        return fail('Selected bevel neighborhoods share an offset edge and cannot be separated safely.');
      }
      endpoints.forEach(id => occupiedVertices.add(id));
      localFaces.forEach(id => occupiedFaces.add(id));
      localCutEdges.forEach(id => occupiedCutEdges.add(id));
      const points = endpoints.map(id => [...this.positions[id]]);
      const pointKey = point => JSON.stringify(point);
      sourceRefs.push(points.map(pointKey));
    }

    // Endpoint coordinates are used only as stable references across the
    // temporary single-edge rebuilds. Reject duplicate coordinates rather
    // than guessing which disconnected vertex instance should be bevelled.
    const originalPointCounts = new Map();
    this.positions.forEach(point => {
      const key = JSON.stringify(point);
      originalPointCounts.set(key, (originalPointCounts.get(key) || 0) + 1);
    });
    if (sourceRefs.flat().some(key => originalPointCounts.get(key) !== 1)) {
      return fail('Selected edges have duplicate-position endpoint vertices; unique topology references are required.');
    }

    const candidate = new HalfEdgeMesh(this.positions, this.faces);
    const edgeIdFromPointRefs = refs => {
      const verticesByPoint = new Map();
      candidate.positions.forEach((point, id) => {
        const key = JSON.stringify(point);
        if (!verticesByPoint.has(key)) verticesByPoint.set(key, []);
        verticesByPoint.get(key).push(id);
      });
      const aIds = verticesByPoint.get(refs[0]) || [], bIds = verticesByPoint.get(refs[1]) || [];
      if (aIds.length !== 1 || bIds.length !== 1) return null;
      const key = keyFor(aIds[0], bIds[0]);
      const matches = candidate.edges.filter(item => keyFor(...item.vertices) === key);
      return matches.length === 1 ? matches[0].id : null;
    };
    const selectedPerimeterKeys = [];
    const widths = [];
    const bevelFaceRefs = [];
    let insertedVertices = 0;
    let createdFaces = 0;

    for (const refs of sourceRefs) {
      const edgeId = edgeIdFromPointRefs(refs);
      if (!Number.isInteger(edgeId)) return fail('A selected edge could not be found after rebuilding a separate bevel preview.');
      candidate.selectionMode = 'edge';
      candidate.clearSelection();
      candidate.edgeSelection.add(edgeId);
      const result = candidate.bevelSelectedEdge({ amount });
      if (!result.changed) return fail(`Multi-edge Bevel was cancelled: ${result.reason}`);
      widths.push(result.width);
      insertedVertices += result.insertedVertices;
      createdFaces += result.createdFaces;
      bevelFaceRefs.push(...(result.bevelFaceRefs || []));
      for (const selectedId of candidate.edgeSelection) {
        const selectedEdge = candidate.edges[selectedId];
        if (!selectedEdge) return fail('A bevel perimeter edge could not be recovered.');
        const points = selectedEdge.vertices.map(id => JSON.stringify(candidate.positions[id])).sort();
        selectedPerimeterKeys.push(points.join('|'));
      }
    }

    const report = candidate.validateTopology();
    if (!report.valid) return fail(`Combined bevel failed topology validation (${report.issueCount} issue(s)); the original mesh was not changed.`);
    const finalEdgesByPointKey = new Map();
    candidate.edges.forEach(edge => {
      const points = edge.vertices.map(id => JSON.stringify(candidate.positions[id])).sort();
      const key = points.join('|');
      if (!finalEdgesByPointKey.has(key)) finalEdgesByPointKey.set(key, []);
      finalEdgesByPointKey.get(key).push(edge.id);
    });
    candidate.selectionMode = 'edge';
    candidate.clearSelection();
    for (const key of selectedPerimeterKeys) {
      const ids = finalEdgesByPointKey.get(key) || [];
      if (ids.length === 1) candidate.edgeSelection.add(ids[0]);
    }
    if (candidate.edgeSelection.size !== selectedPerimeterKeys.length || candidate.edgeSelection.size !== sourceRefs.length * 4) {
      return fail('The combined bevel perimeter was ambiguous; the original mesh was not changed.');
    }

    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'edge';
    this.clearSelection();
    this.rebuild();
    // Rebuild order is deterministic for identical positions/faces, so the
    // candidate's already-validated edge IDs map directly to this mesh.
    this.edgeSelection = new Set(candidate.edgeSelection);
    return {
      changed: true,
      amount,
      bevelCount: sourceRefs.length,
      width: widths.reduce((sum, width) => sum + width, 0) / widths.length,
      widths,
      insertedVertices,
      createdFaces,
      selectedEdges: this.edgeSelection.size,
      bevelFaceRefs
    };
  }

  /**
   * Applies multiple independent two-edge miter junctions in one transaction.
   * Every pair is preflighted against the immutable source; their affected
   * face neighborhoods must be disjoint. Each pair is then rebuilt on one
   * temporary candidate and the combined result is validated before commit.
   */
  bevelSelectedAdjacentPairs({ amount = 0.25, edgePairs = [] } = {}) {
    const fail = reason => ({ changed: false, reason });
    if (this.selectionMode !== 'edge' || !Number.isFinite(amount) || amount <= 0 || amount > 0.95 ||
        !Array.isArray(edgePairs) || edgePairs.length < 2 || edgePairs.length > 4 ||
        edgePairs.some(pair => !Array.isArray(pair) || pair.length !== 2)) {
      return fail('Multi-junction Bevel requires two to four separate two-edge miter pairs and a width factor from 0–0.95.');
    }
    const sourceReport = this.validateTopology();
    if (!sourceReport.valid) return fail('The mesh has existing topology warnings. Validate and repair safe issues before beveling.');

    const allEndpointIds = new Set();
    const occupiedFaces = new Set();
    const pairRefs = [];
    const pointCounts = new Map();
    this.positions.forEach(point => {
      const key = JSON.stringify(point);
      pointCounts.set(key, (pointCounts.get(key) || 0) + 1);
    });

    for (const pair of edgePairs) {
      const [first, second] = pair.map(id => this.edges[id]);
      if (!first || !second || first.id === second.id) return fail('A miter pair contains an unresolved or duplicated edge.');
      const shared = first.vertices.filter(id => second.vertices.includes(id));
      if (shared.length !== 1) return fail('Each miter pair must contain exactly two edges sharing one endpoint.');
      const center = shared[0];
      const outer = [...first.vertices, ...second.vertices].filter(id => id !== center);
      if (outer.length !== 2 || outer[0] === outer[1]) return fail('A miter pair has ambiguous outer endpoints.');
      const endpointIds = [center, ...outer];
      if (endpointIds.some(id => allEndpointIds.has(id))) {
        return fail('Separate miter pairs cannot share vertices. Connected chains and branching junctions remain unsupported.');
      }

      const localFaces = new Set();
      for (const vertexId of endpointIds) {
        const incidentFaces = this.faces.reduce((ids, face, faceId) => {
          if (face.includes(vertexId)) ids.push(faceId);
          return ids;
        }, []);
        const incidentEdges = this.edges.filter(edge => edge.vertices.includes(vertexId));
        if (incidentFaces.length !== 3 || incidentEdges.length !== 3 ||
            incidentEdges.some(edge => edge.halfEdges.length !== 2 || !edge.halfEdges.every(halfEdge => halfEdge.twin))) {
          return fail('Every miter junction and outer endpoint must have a closed valence-three fan.');
        }
        incidentFaces.forEach(id => localFaces.add(id));
      }
      if ([...localFaces].some(id => occupiedFaces.has(id))) {
        return fail('Separate miter pairs share affected faces; their offset neighborhoods cannot be combined safely.');
      }
      for (const vertexId of endpointIds) {
        const key = JSON.stringify(this.positions[vertexId]);
        if (pointCounts.get(key) !== 1) {
          return fail('Miter endpoint positions must be unique so later pairs can be resolved without guessing.');
        }
        allEndpointIds.add(vertexId);
      }
      localFaces.forEach(id => occupiedFaces.add(id));
      pairRefs.push({
        edgePoints: pair.map(id => this.edges[id].vertices.map(vertexId => JSON.stringify(this.positions[vertexId]))),
        centerPoint: JSON.stringify(this.positions[center])
      });
    }

    const candidate = new HalfEdgeMesh(this.positions, this.faces);
    const findVertex = pointKey => {
      const matches = [];
      candidate.positions.forEach((point, id) => {
        if (JSON.stringify(point) === pointKey) matches.push(id);
      });
      return matches.length === 1 ? matches[0] : null;
    };
    const findEdge = pointRefs => {
      const a = findVertex(pointRefs[0]), b = findVertex(pointRefs[1]);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
      const matches = candidate.edges.filter(edge => keyFor(...edge.vertices) === keyFor(a, b));
      return matches.length === 1 ? matches[0].id : null;
    };
    const selectedPerimeterKeys = [];
    const widths = [];
    const bevelFaceRefs = [];
    let insertedVertices = 0;
    let createdFaces = 0;
    let miterEdges = 0;

    for (const refs of pairRefs) {
      const edgeIds = refs.edgePoints.map(findEdge);
      const center = findVertex(refs.centerPoint);
      if (edgeIds.some(id => !Number.isInteger(id)) || !Number.isInteger(center)) {
        return fail('A later miter pair could not be resolved after rebuilding an earlier independent junction.');
      }
      candidate.selectionMode = 'edge';
      const result = candidate.bevelSelectedAdjacentPair({ amount, edgeIds, sharedVertexId: center });
      if (!result.changed) return fail(`Combined miter preview was cancelled: ${result.reason}`);
      widths.push(result.width);
      insertedVertices += result.insertedVertices;
      createdFaces += result.createdFaces;
      miterEdges += result.miterEdges;
      bevelFaceRefs.push(...(result.bevelFaceRefs || []));
      for (const edgeId of candidate.edgeSelection) {
        const edge = candidate.edges[edgeId];
        if (!edge) return fail('A connected bevel perimeter edge could not be recovered.');
        const points = edge.vertices.map(id => JSON.stringify(candidate.positions[id])).sort();
        selectedPerimeterKeys.push(points.join('|'));
      }
    }

    const report = candidate.validateTopology();
    if (!report.valid) return fail(`Combined miter junctions failed topology validation (${report.issueCount} issue(s)); the original mesh was not changed.`);
    const edgesByPointKey = new Map();
    candidate.edges.forEach(edge => {
      const points = edge.vertices.map(id => JSON.stringify(candidate.positions[id])).sort();
      const key = points.join('|');
      if (!edgesByPointKey.has(key)) edgesByPointKey.set(key, []);
      edgesByPointKey.get(key).push(edge.id);
    });
    candidate.selectionMode = 'edge';
    candidate.clearSelection();
    for (const key of selectedPerimeterKeys) {
      const ids = edgesByPointKey.get(key) || [];
      if (ids.length === 1) candidate.edgeSelection.add(ids[0]);
    }
    const expectedPerimeterEdges = pairRefs.length * 6;
    if (candidate.edgeSelection.size !== expectedPerimeterEdges || selectedPerimeterKeys.length !== expectedPerimeterEdges) {
      return fail('The combined miter perimeter was ambiguous; the original mesh was not changed.');
    }

    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'edge';
    this.clearSelection();
    this.rebuild();
    // Topology rebuild order is deterministic for identical positions/faces.
    // The candidate's perimeter edge IDs therefore map directly to this mesh.
    this.edgeSelection = new Set(candidate.edgeSelection);
    return {
      changed: true,
      amount,
      bevelCount: pairRefs.length * 2,
      miterCount: pairRefs.length,
      width: widths.reduce((sum, width) => sum + width, 0) / widths.length,
      widths,
      insertedVertices,
      createdFaces,
      miterEdges,
      selectedEdges: this.edgeSelection.size,
      bevelFaceRefs
    };
  }

  /**
   * Bevels one simple three-to-eight-edge path as one transaction.
   * Every internal degree-two vertex receives a shared-face miter; the two
   * terminal vertices retain trimmed corner faces as closed end caps.
   * Branches, cycles, overlapping path vertices and unsupported fans reject.
   */
  bevelSelectedConnectedChain({ amount = 0.25, edgeIds = [...this.edgeSelection] } = {}) {
    const fail = reason => ({ changed: false, reason });
    if (this.selectionMode !== 'edge' || !Array.isArray(edgeIds) || edgeIds.length < 3 || edgeIds.length > 8 ||
        new Set(edgeIds).size !== edgeIds.length || !Number.isFinite(amount) || amount <= 0 || amount > 0.95) {
      return fail('Connected chain Bevel requires three to eight selected edges and a width factor from 0–0.95.');
    }
    const selectedEdges = edgeIds.map(id => this.edges[id]);
    if (selectedEdges.some(edge => !edge)) return fail('A selected chain edge could not be resolved.');
    const selectedEdgeIds = new Set(edgeIds);
    const adjacency = new Map();
    for (const edge of selectedEdges) {
      for (const vertexId of edge.vertices) {
        if (!adjacency.has(vertexId)) adjacency.set(vertexId, []);
        adjacency.get(vertexId).push(edge.id);
      }
    }
    const edgeCount = edgeIds.length;
    if (adjacency.size !== edgeCount + 1 || [...adjacency.values()].filter(list => list.length === 1).length !== 2 ||
        [...adjacency.values()].filter(list => list.length === 2).length !== edgeCount - 1 ||
        [...adjacency.values()].some(list => list.length < 1 || list.length > 2)) {
      return fail('Connected chain Bevel requires one simple path; cycles and branches are rejected.');
    }

    // Recover a deterministic end-to-end path before using any geometry.
    const pathVertices = [adjacency.keys().find(id => adjacency.get(id).length === 1)];
    const pathEdges = [];
    const usedEdges = new Set();
    while (pathEdges.length < edgeCount) {
      const currentVertex = pathVertices[pathVertices.length - 1];
      const nextEdgeId = adjacency.get(currentVertex).find(id => !usedEdges.has(id));
      if (!Number.isInteger(nextEdgeId)) return fail('The selected edges do not form one unambiguous connected chain.');
      const edge = this.edges[nextEdgeId];
      const nextVertex = edge.vertices.find(id => id !== currentVertex);
      if (!Number.isInteger(nextVertex) || pathVertices.includes(nextVertex)) {
        return fail('Connected chain Bevel does not accept cycles or repeated path vertices.');
      }
      pathEdges.push(nextEdgeId);
      usedEdges.add(nextEdgeId);
      pathVertices.push(nextVertex);
    }
    if (usedEdges.size !== edgeCount || pathVertices.length !== edgeCount + 1 || pathVertices.at(-1) === pathVertices[0]) {
      return fail('The selected edges do not form one simple connected chain.');
    }

    const sourceReport = this.validateTopology();
    if (!sourceReport.valid) return fail('The mesh has existing topology warnings. Validate and repair safe issues before beveling.');
    const edgeByKey = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge]));
    const edgeIdFor = (a, b) => edgeByKey.get(keyFor(a, b))?.id;
    const isPlanarConvex = (face, positions = this.positions) => {
      const projection = projectedPolygon(positions, face);
      if (!projection || projection.deviation > projection.scale * 1e-5 || !triangulatePolygon(positions, face)) return false;
      const area = signedArea2D(projection.points), winding = Math.sign(area);
      if (!winding) return false;
      const epsilon = projection.scale * projection.scale * 1e-9;
      return projection.points.every((_, index) => cross2(
        projection.points[(index - 1 + projection.points.length) % projection.points.length],
        projection.points[index], projection.points[(index + 1) % projection.points.length]
      ) * winding > epsilon);
    };

    const fanValenceByVertex = new Map();
    const fanByVertex = new Map();
    const affectedFaceIds = new Set();
    for (let pathIndex = 0; pathIndex < pathVertices.length; pathIndex++) {
      const vertexId = pathVertices[pathIndex];
      const incidentFaces = this.faces.reduce((ids, face, faceId) => {
        if (face.includes(vertexId)) ids.push(faceId);
        return ids;
      }, []);
      const incidentEdges = this.edges.filter(edge => edge.vertices.includes(vertexId));
      const fan = this.orderedVertexFan(vertexId);
      const supportedValence = incidentEdges.length >= 3 && incidentEdges.length <= 6;
      if (!supportedValence || incidentFaces.length !== incidentEdges.length || !fan || fan.length !== incidentEdges.length ||
          incidentEdges.some(edge => edge.halfEdges.length !== 2 || !edge.halfEdges.every(halfEdge => halfEdge.twin)) ||
          fan.some(halfEdge => !halfEdge?.face || !incidentEdges.includes(halfEdge.edge))) {
        return fail('Connected chain Bevel requires closed manifold fans with valence three through six at every path vertex.');
      }
      fanValenceByVertex.set(vertexId, incidentEdges.length);
      fanByVertex.set(vertexId, fan);
      incidentFaces.forEach(id => affectedFaceIds.add(id));
    }
    for (const faceId of affectedFaceIds) {
      if (!isPlanarConvex(this.faces[faceId])) {
        return fail('All faces around the connected chain and its end caps must be simple, planar and convex.');
      }
    }

    const inspectEdge = (edgeId, start, end) => {
      const edge = this.edges[edgeId];
      if (!edge || edge.halfEdges.length !== 2) return null;
      const first = edge.halfEdges.find(item => item.origin === start && item.next?.origin === end);
      const second = edge.halfEdges.find(item => item.origin === end && item.next?.origin === start);
      if (!first || !second || first.twin !== second || second.twin !== first) return null;
      const cutInfo = (halfEdge, atStart) => {
        const vertexId = atStart ? halfEdge.origin : halfEdge.next.origin;
        const adjacentHalfEdge = atStart ? halfEdge.prev : halfEdge.next;
        const adjacent = this.edges[adjacentHalfEdge?.edge?.id];
        if (!adjacent || adjacent.halfEdges.length !== 2 || !adjacent.halfEdges.every(item => item.twin)) return null;
        const otherId = adjacent.vertices.find(id => id !== vertexId);
        const from = this.positions[vertexId], to = this.positions[otherId];
        if (!from || !to) return null;
        const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        if (!Number.isFinite(length) || length <= 1e-10) return null;
        return { vertexId, edgeId: adjacent.id, otherId, from, to, length };
      };
      const cuts = [cutInfo(first, true), cutInfo(first, false), cutInfo(second, true), cutInfo(second, false)];
      if (cuts.some(item => !item)) return null;
      return { edgeId, start, end, first, second, faceAId: first.face.id, faceBId: second.face.id, cuts };
    };
    const plans = pathEdges.map((edgeId, index) => inspectEdge(edgeId, pathVertices[index], pathVertices[index + 1]));
    if (plans.some(plan => !plan)) return fail('Every chain edge must have two consistently wound interior manifold faces.');
    const endpointRefs = plans.map(plan => [[...this.positions[plan.start]], [...this.positions[plan.end]]]);

    // Resolve the complete opposite fan arc at each internal junction. Every
    // non-selected radial edge receives a shared cut point, so valence-five
    // and valence-six fans close with a triangulated cap patch rather than
    // leaving the original pole vertex exposed inside the bevel.
    const fanCapEdgeIdsByVertex = new Map();
    for (let index = 1; index < pathVertices.length - 1; index++) {
      const center = pathVertices[index];
      const leftPlan = plans[index - 1], rightPlan = plans[index];
      const commonFaces = [leftPlan.faceAId, leftPlan.faceBId]
        .filter(id => id === rightPlan.faceAId || id === rightPlan.faceBId);
      const sharedFaceIds = [...new Set(commonFaces)];
      if (sharedFaceIds.length !== 1) return fail('Each internal chain junction must have exactly one shared face for its miter.');
      const sharedFaceId = sharedFaceIds[0];
      const fan = fanByVertex.get(center) || [];
      const sectorIndex = fan.findIndex((halfEdge, fanIndex) => {
        const next = fan[(fanIndex + 1) % fan.length];
        return halfEdge.face?.id === sharedFaceId && next &&
          ((halfEdge.edge.id === leftPlan.edgeId && next.edge.id === rightPlan.edgeId) ||
           (halfEdge.edge.id === rightPlan.edgeId && next.edge.id === leftPlan.edgeId));
      });
      if (sectorIndex < 0) return fail('The shared miter face does not occupy one unique sector of the ordered vertex fan.');
      const capEdgeIds = [];
      for (let offset = 2; offset < fan.length; offset++) {
        const edgeId = fan[(sectorIndex + offset) % fan.length]?.edge?.id;
        if (!Number.isInteger(edgeId) || selectedEdgeIds.has(edgeId)) {
          return fail('The opposite vertex-fan arc contains a selected or unresolved edge.');
        }
        capEdgeIds.push(edgeId);
      }
      if (capEdgeIds.length !== fan.length - 2 || new Set(capEdgeIds).size !== capEdgeIds.length) {
        return fail('The opposite vertex-fan arc is incomplete or ambiguous.');
      }
      fanCapEdgeIdsByVertex.set(center, capEdgeIds);
    }

    // Terminal fans of valence four through six need an explicit cap patch
    // too. The two edges flanking the selected terminal edge already receive
    // cut points from the selected-edge plan; every edge along the remaining
    // ordered fan arc receives one additional shared cut point.
    const terminalCapByVertex = new Map();
    for (const pathIndex of [0, pathVertices.length - 1]) {
      const vertexId = pathVertices[pathIndex];
      const plan = pathIndex === 0 ? plans[0] : plans.at(-1);
      const fan = fanByVertex.get(vertexId) || [];
      const selectedFanIndex = fan.findIndex(halfEdge => halfEdge.edge?.id === plan.edgeId);
      if (selectedFanIndex < 0) return fail('A terminal bevel edge is missing from its ordered vertex fan.');
      const startEdgeId = fan[(selectedFanIndex + 1) % fan.length]?.edge?.id;
      const endEdgeId = fan[(selectedFanIndex - 1 + fan.length) % fan.length]?.edge?.id;
      if (!Number.isInteger(startEdgeId) || !Number.isInteger(endEdgeId) || startEdgeId === endEdgeId) {
        return fail('A terminal cap has an ambiguous pair of fan-boundary edges.');
      }
      const capEdgeIds = [];
      for (let offset = 2; offset < fan.length - 1; offset++) {
        const edgeId = fan[(selectedFanIndex + offset) % fan.length]?.edge?.id;
        if (!Number.isInteger(edgeId) || selectedEdgeIds.has(edgeId)) {
          return fail('A terminal cap fan arc contains a selected or unresolved edge.');
        }
        capEdgeIds.push(edgeId);
      }
      if (capEdgeIds.length !== fan.length - 3 || new Set(capEdgeIds).size !== capEdgeIds.length) {
        return fail('A terminal cap fan arc is incomplete or ambiguous.');
      }
      terminalCapByVertex.set(vertexId, { startEdgeId, endEdgeId, capEdgeIds });
    }

    const cutInfoByKey = new Map();
    const addCutInfo = info => {
      if (!info) return false;
      const key = `${info.vertexId}:${info.edgeId}`;
      const previous = cutInfoByKey.get(key);
      if (previous && (Math.abs(previous.length - info.length) > 1e-8 ||
          previous.to.some((value, axis) => Math.abs(value - info.to[axis]) > 1e-8))) return false;
      cutInfoByKey.set(key, info);
      return true;
    };
    for (const plan of plans) {
      for (const info of plan.cuts) {
        if (!addCutInfo(info)) return fail('The chain has inconsistent offset data on a shared neighboring edge.');
      }
    }
    for (const [vertexId, edgeIds] of fanCapEdgeIdsByVertex) {
      for (const edgeId of edgeIds) {
        const edge = this.edges[edgeId];
        const otherId = edge?.vertices.find(id => id !== vertexId);
        const from = this.positions[vertexId], to = this.positions[otherId];
        if (!edge || edge.halfEdges.length !== 2 || !edge.halfEdges.every(item => item.twin) || !from || !to) {
          return fail('A higher-valence cap edge is not a closed manifold edge.');
        }
        const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        if (!Number.isFinite(length) || length <= 1e-10 || !addCutInfo({ vertexId, edgeId, otherId, from, to, length })) {
          return fail('A higher-valence cap edge has invalid or conflicting offset data.');
        }
      }
    }
    for (const [vertexId, terminal] of terminalCapByVertex) {
      for (const edgeId of terminal.capEdgeIds) {
        const edge = this.edges[edgeId];
        const otherId = edge?.vertices.find(id => id !== vertexId);
        const from = this.positions[vertexId], to = this.positions[otherId];
        if (!edge || edge.halfEdges.length !== 2 || !edge.halfEdges.every(item => item.twin) || !from || !to) {
          return fail('A terminal cap edge is not a closed manifold edge.');
        }
        const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        if (!Number.isFinite(length) || length <= 1e-10 || !addCutInfo({ vertexId, edgeId, otherId, from, to, length })) {
          return fail('A terminal cap edge has invalid or conflicting offset data.');
        }
      }
    }
    const maxWidth = Math.min(...[...cutInfoByKey.values()].map(info => info.length)) * 0.45;
    const width = maxWidth * amount;
    if (!Number.isFinite(width) || width <= 1e-9) return fail('The selected chain is too small for a stable bevel.');
    const offsetPoint = info => {
      if (!info) return null;
      const ratio = width / info.length;
      if (!(ratio > 0 && ratio < 0.5)) return null;
      const point = info.from.map((value, axis) => value + (info.to[axis] - value) * ratio);
      return point.every(Number.isFinite) ? point : null;
    };

    const nextPositions = this.positions.map(point => [...point]);
    const cutIdByKey = new Map();
    for (const [key, info] of cutInfoByKey) {
      // Offset points on selected chain edges are used only to solve miters;
      // those source edges are removed and never become candidate vertices.
      if (selectedEdgeIds.has(info.edgeId)) continue;
      const point = offsetPoint(info);
      if (!point) return fail('A chain endpoint offset is outside a stable neighboring-edge range.');
      cutIdByKey.set(key, nextPositions.push(point) - 1);
    }
    const cutId = (vertexId, edgeId) => cutIdByKey.get(`${vertexId}:${edgeId}`);

    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot3 = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
    const miterByVertexFace = new Map();
    const miterInfos = [];
    for (let index = 1; index < pathVertices.length - 1; index++) {
      const center = pathVertices[index];
      const leftPlan = plans[index - 1], rightPlan = plans[index];
      const commonFaces = [leftPlan.faceAId, leftPlan.faceBId]
        .filter(id => id === rightPlan.faceAId || id === rightPlan.faceBId);
      const sharedFaceIds = [...new Set(commonFaces)];
      if (sharedFaceIds.length !== 1) return fail('Each internal chain junction must have exactly one shared face for its miter.');
      const sharedFaceId = sharedFaceIds[0];
      const sharedFace = this.faces[sharedFaceId];
      const centerIndex = sharedFace.indexOf(center);
      if (centerIndex < 0) return fail('A chain miter face does not contain its selected junction vertex.');
      const beforeEdge = edgeIdFor(sharedFace[(centerIndex - 1 + sharedFace.length) % sharedFace.length], center);
      const afterEdge = edgeIdFor(center, sharedFace[(centerIndex + 1) % sharedFace.length]);
      if (!selectedEdgeIds.has(beforeEdge) || !selectedEdgeIds.has(afterEdge) ||
          ![leftPlan.edgeId, rightPlan.edgeId].every(id => id === beforeEdge || id === afterEdge)) {
        return fail('Each miter pair must be consecutive boundary edges of its common face.');
      }

      const leftOther = leftPlan.start === center ? leftPlan.end : leftPlan.start;
      const rightOther = rightPlan.start === center ? rightPlan.end : rightPlan.start;
      const pointOnLeft = offsetPoint(cutInfoByKey.get(`${center}:${leftPlan.edgeId}`));
      const pointOnRight = offsetPoint(cutInfoByKey.get(`${center}:${rightPlan.edgeId}`));
      if (!pointOnLeft || !pointOnRight) return fail('A chain junction could not resolve its selected-edge offset lines.');
      const directionLeft = this.positions[leftOther].map((value, axis) => value - this.positions[center][axis]);
      const directionRight = this.positions[rightOther].map((value, axis) => value - this.positions[center][axis]);
      const normal = newellNormal(this.positions, sharedFace);
      const denominator = normal ? dot3(cross3(directionLeft, directionRight), normal) : 0;
      const scale = Math.max(1, Math.hypot(...directionLeft) * Math.hypot(...directionRight));
      if (!Number.isFinite(denominator) || Math.abs(denominator) <= scale * 1e-8) {
        return fail('A chain junction has nearly parallel edges and cannot form a stable miter.');
      }
      const difference = pointOnLeft.map((value, axis) => value - pointOnRight[axis]);
      const parameterLeft = dot3(cross3(difference, directionRight), normal) / denominator;
      const parameterRight = dot3(cross3(difference, directionLeft), normal) / denominator;
      if (!(parameterLeft > 1e-8 && parameterRight > 1e-8)) {
        return fail('A chain miter intersection does not lie inside the selected corner.');
      }
      const miterLeft = pointOnRight.map((value, axis) => value + parameterLeft * directionLeft[axis]);
      const miterRight = pointOnLeft.map((value, axis) => value + parameterRight * directionRight[axis]);
      const mismatch = Math.hypot(...miterLeft.map((value, axis) => value - miterRight[axis]));
      if (mismatch > Math.max(1e-7, width * 1e-5)) return fail('A chain miter intersection is numerically ambiguous.');
      const miterPoint = miterLeft.map((value, axis) => (value + miterRight[axis]) * 0.5);
      const miterLength = Math.hypot(...miterPoint.map((value, axis) => value - this.positions[center][axis]));
      if (!Number.isFinite(miterLength) || miterLength > width * 4) {
        return fail('A chain junction requires an excessive miter; reduce the width or bevel edges separately.');
      }
      const projection = projectedPolygon(this.positions, sharedFace);
      const dropAxis = normal.reduce((best, value, axis) => Math.abs(value) > Math.abs(normal[best]) ? axis : best, 0);
      const project = point => dropAxis === 0 ? [point[1], point[2]] : dropAxis === 1 ? [point[0], point[2]] : [point[0], point[1]];
      const miter2 = project(miterPoint);
      const winding = Math.sign(signedArea2D(projection.points));
      const epsilon = projection.scale * projection.scale * 1e-9;
      if (projection.points.some((point, pointIndex) =>
        cross2(point, projection.points[(pointIndex + 1) % projection.points.length], miter2) * winding < -epsilon
      )) return fail('A chain miter intersection falls outside its shared face.');

      const miterId = nextPositions.push(miterPoint) - 1;
      miterByVertexFace.set(`${center}:${sharedFaceId}`, miterId);
      const capEdgeIds = fanCapEdgeIdsByVertex.get(center) || [];
      const capCuts = capEdgeIds.map(edgeId => cutId(center, edgeId));
      if (capCuts.length !== fanValenceByVertex.get(center) - 2 ||
          capCuts.some(id => !Number.isInteger(id)) || new Set(capCuts).size !== capCuts.length) {
        return fail('A chain miter could not resolve every ordered cap-side cut point.');
      }
      miterInfos.push({ vertexId: center, faceId: sharedFaceId, miterId, capCuts });
    }

    if (miterInfos.length !== edgeCount - 1) {
      return fail('Every internal chain junction must resolve to exactly one shared-face miter.');
    }

    const nextFaces = [];
    for (let faceId = 0; faceId < this.faces.length; faceId++) {
      const face = this.faces[faceId];
      const output = [];
      const append = id => {
        if (!Number.isInteger(id)) return false;
        if (output.at(-1) !== id) output.push(id);
        return true;
      };
      for (let index = 0; index < face.length; index++) {
        const startVertex = face[index];
        const endVertex = face[(index + 1) % face.length];
        const edgeId = edgeIdFor(startVertex, endVertex);
        if (!Number.isInteger(edgeId)) return fail('An affected chain face has an unresolved boundary edge.');
        if (selectedEdgeIds.has(edgeId)) {
          const edge = this.edges[edgeId];
          const halfEdge = edge.halfEdges.find(item => item.face.id === faceId && item.origin === startVertex && item.next.origin === endVertex);
          if (!halfEdge) return fail('A selected chain edge has an inconsistent face-boundary direction.');
          const startPoint = miterByVertexFace.get(`${startVertex}:${faceId}`) ?? cutId(startVertex, halfEdge.prev.edge.id);
          const endPoint = miterByVertexFace.get(`${endVertex}:${faceId}`) ?? cutId(endVertex, halfEdge.next.edge.id);
          if (!append(startPoint) || !append(endPoint)) return fail('A chain edge boundary could not be replaced by its offset points.');
        } else {
          const startPoint = cutId(startVertex, edgeId) ?? startVertex;
          const endPoint = cutId(endVertex, edgeId) ?? endVertex;
          if (!append(startPoint) || !append(endPoint)) return fail('A chain end cap could not trim a neighboring source edge.');
        }
      }
      if (output.length > 1 && output[0] === output.at(-1)) output.pop();
      nextFaces.push(output);
    }

    const bevelFaces = [];
    const bevelFaceStartId = nextFaces.length;
    for (const plan of plans) {
      const pA0 = miterByVertexFace.get(`${plan.start}:${plan.faceAId}`) ?? cutId(plan.start, plan.first.prev.edge.id);
      const pB0 = miterByVertexFace.get(`${plan.end}:${plan.faceAId}`) ?? cutId(plan.end, plan.first.next.edge.id);
      const pB1 = miterByVertexFace.get(`${plan.end}:${plan.faceBId}`) ?? cutId(plan.end, plan.second.prev.edge.id);
      const pA1 = miterByVertexFace.get(`${plan.start}:${plan.faceBId}`) ?? cutId(plan.start, plan.second.next.edge.id);
      if (![pA0, pB0, pB1, pA1].every(Number.isInteger)) return fail('A chain bevel strip could not resolve its four boundary points.');
      const strip = [pB0, pA0, pA1, pB1];
      bevelFaces.push(strip);
      nextFaces.push(strip);
    }

    // A tri-valent junction closes on one shared miter edge. Higher-valence
    // fans leave a polygon bounded by the miter and every cut point along the
    // opposite fan arc. Triangulate that boundary as a patch; only accept the
    // winding that opposes every existing boundary half-edge.
    const capPatchFaces = [];
    for (const info of miterInfos) {
      if (info.capCuts.length === 1) continue;
      const provisional = new HalfEdgeMesh(nextPositions, nextFaces);
      const boundary = [info.miterId, ...info.capCuts];
      const options = [boundary, [info.miterId, ...info.capCuts.slice().reverse()]];
      const validOrientations = options.filter(face => face.every((start, index) => {
        const end = face[(index + 1) % face.length];
        const edge = provisional.edges.find(item => keyFor(...item.vertices) === keyFor(start, end));
        if (!edge || edge.halfEdges.length !== 1) return false;
        const existing = edge.halfEdges[0];
        return existing.origin === end && existing.next?.origin === start;
      }));
      if (validOrientations.length !== 1) {
        return fail('A higher-valence cap patch has an ambiguous or incomplete boundary; the original mesh was not changed.');
      }
      const orientedBoundary = validOrientations[0];
      if (orientedBoundary.length === 3) {
        capPatchFaces.push(orientedBoundary);
        nextFaces.push(orientedBoundary);
        continue;
      }
      const projection = projectedPolygon(nextPositions, orientedBoundary);
      if (!projection) return fail('A higher-valence cap boundary has no stable projection.');
      const polygonEpsilon = projection.scale * projection.scale * 1e-9;
      if (polygonSelfIntersects(projection.points, polygonEpsilon)) {
        return fail('A higher-valence cap boundary self-intersects; the original mesh was not changed.');
      }
      const area = signedArea2D(projection.points);
      const winding = Math.sign(area);
      if (!winding || Math.abs(area) <= polygonEpsilon || projection.points.some((point, pointIndex) =>
        cross2(projection.points[(pointIndex - 1 + projection.points.length) % projection.points.length], point,
          projection.points[(pointIndex + 1) % projection.points.length]) * winding < -polygonEpsilon
      )) return fail('A higher-valence cap boundary is not a simple convex patch.');

      // A warped cap boundary cannot safely become one polygon face. Add a
      // center point and triangulate each boundary segment into an individually
      // planar triangle; this also preserves collinear boundary vertices.
      const capCenter = [0, 1, 2].map(axis =>
        orientedBoundary.reduce((sum, id) => sum + nextPositions[id][axis], 0) / orientedBoundary.length
      );
      const capCenterId = nextPositions.push(capCenter) - 1;
      const capTriangles = [];
      for (let index = 0; index < orientedBoundary.length; index++) {
        const a = orientedBoundary[index], b = orientedBoundary[(index + 1) % orientedBoundary.length];
        const pa = nextPositions[a], pb = nextPositions[b];
        const u = pa.map((value, axis) => value - capCenter[axis]);
        const v = pb.map((value, axis) => value - capCenter[axis]);
        const normal = cross3(u, v);
        if (Math.hypot(...normal) <= projection.scale * projection.scale * 1e-10) {
          return fail('A higher-valence cap patch would contain a degenerate triangle.');
        }
        capTriangles.push([capCenterId, a, b]);
      }
      capPatchFaces.push(...capTriangles);
      nextFaces.push(...capTriangles);
    }

    // A high-valence terminal end is bounded by the bevel strip end edge and
    // every cut point along the remaining ordered fan arc. At valence three,
    // the existing opposite source face already provides the cap and no patch
    // is needed. At valence four through six, close the truncated fan with an
    // oriented triangular or center-triangulated cap patch.
    for (const [vertexId, terminal] of terminalCapByVertex) {
      if (!terminal.capEdgeIds.length) continue;
      const startCut = cutId(vertexId, terminal.startEdgeId);
      const middleCuts = terminal.capEdgeIds.map(edgeId => cutId(vertexId, edgeId));
      const endCut = cutId(vertexId, terminal.endEdgeId);
      const boundary = [startCut, ...middleCuts, endCut];
      if (boundary.some(id => !Number.isInteger(id)) || new Set(boundary).size !== boundary.length) {
        return fail('A terminal cap could not resolve every ordered fan cut point.');
      }
      const provisional = new HalfEdgeMesh(nextPositions, nextFaces);
      const options = [boundary, [...boundary].reverse()];
      const validOrientations = options.filter(face => face.every((start, index) => {
        const end = face[(index + 1) % face.length];
        const edge = provisional.edges.find(item => keyFor(...item.vertices) === keyFor(start, end));
        if (!edge || edge.halfEdges.length !== 1) return false;
        const existing = edge.halfEdges[0];
        return existing.origin === end && existing.next?.origin === start;
      }));
      if (validOrientations.length !== 1) {
        return fail('A terminal cap patch has an ambiguous or incomplete boundary; the original mesh was not changed.');
      }
      const orientedBoundary = validOrientations[0];
      if (orientedBoundary.length === 3) {
        capPatchFaces.push(orientedBoundary);
        nextFaces.push(orientedBoundary);
        continue;
      }
      const projection = projectedPolygon(nextPositions, orientedBoundary);
      if (!projection) return fail('A terminal cap boundary has no stable projection.');
      const polygonEpsilon = projection.scale * projection.scale * 1e-9;
      if (polygonSelfIntersects(projection.points, polygonEpsilon)) {
        return fail('A terminal cap boundary self-intersects; the original mesh was not changed.');
      }
      const area = signedArea2D(projection.points);
      const winding = Math.sign(area);
      if (!winding || Math.abs(area) <= polygonEpsilon || projection.points.some((point, pointIndex) =>
        cross2(projection.points[(pointIndex - 1 + projection.points.length) % projection.points.length], point,
          projection.points[(pointIndex + 1) % projection.points.length]) * winding < -polygonEpsilon
      )) return fail('A terminal cap boundary is not a simple convex patch.');
      const capCenter = [0, 1, 2].map(axis =>
        orientedBoundary.reduce((sum, id) => sum + nextPositions[id][axis], 0) / orientedBoundary.length
      );
      const capCenterId = nextPositions.push(capCenter) - 1;
      const capTriangles = [];
      for (let index = 0; index < orientedBoundary.length; index++) {
        const a = orientedBoundary[index], b = orientedBoundary[(index + 1) % orientedBoundary.length];
        const pa = nextPositions[a], pb = nextPositions[b];
        const u = pa.map((value, axis) => value - capCenter[axis]);
        const v = pb.map((value, axis) => value - capCenter[axis]);
        if (Math.hypot(...cross3(u, v)) <= projection.scale * projection.scale * 1e-10) {
          return fail('A terminal cap patch would contain a degenerate triangle.');
        }
        capTriangles.push([capCenterId, a, b]);
      }
      capPatchFaces.push(...capTriangles);
      nextFaces.push(...capTriangles);
    }

    const candidate = new HalfEdgeMesh(nextPositions, nextFaces);
    const compactMap = candidate.compact();
    const report = candidate.validateTopology();
    if (!report.valid) return fail(`The proposed connected-chain bevel failed topology validation (${report.issueCount} issue(s)); the original mesh was not changed.`);
    for (let faceId = 0; faceId < candidate.faces.length; faceId++) {
      if (!candidate.triangulateFace(faceId).length) return fail('The proposed chain produced a face that could not be triangulated.');
    }
    if (![...affectedFaceIds].every(faceId => isPlanarConvex(candidate.faces[faceId], candidate.positions)) ||
        !bevelFaces.every(face => isPlanarConvex(face.map(id => compactMap.get(id)), candidate.positions)) ||
        !capPatchFaces.every(face => isPlanarConvex(face.map(id => compactMap.get(id)), candidate.positions))) {
      return fail('The chain must preserve planar, convex source faces, cap patches, end caps and bevel strips.');
    }

    // Only the first and last patch spokes touch bevel strips. Intermediate
    // spokes are internal triangulation edges shared by cap-patch triangles.
    const miterKeys = new Set(miterInfos.flatMap(info => {
      const boundaryCuts = [...new Set([info.capCuts[0], info.capCuts.at(-1)])];
      return boundaryCuts.map(cutId => keyFor(compactMap.get(info.miterId), compactMap.get(cutId)));
    }));
    const edgeIdsByKey = new Map(candidate.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
    for (const key of miterKeys) {
      const miterEdge = candidate.edges.filter(edge => keyFor(...edge.vertices) === key);
      if (miterEdge.length !== 1 || miterEdge[0].halfEdges.length !== 2 || !miterEdge[0].halfEdges.every(halfEdge => halfEdge.twin)) {
        return fail('Each chain miter boundary must be a shared manifold edge between its strip and cap patch.');
      }
    }
    const perimeterKeys = new Set();
    for (const face of bevelFaces) {
      const mapped = face.map(id => compactMap.get(id));
      for (let index = 0; index < mapped.length; index++) {
        const key = keyFor(mapped[index], mapped[(index + 1) % mapped.length]);
        if (!miterKeys.has(key)) perimeterKeys.add(key);
      }
    }
    const expectedPerimeterEdges = 4 * plans.length - 2 * miterInfos.length;
    candidate.selectionMode = 'edge';
    candidate.clearSelection();
    for (const key of perimeterKeys) {
      const id = edgeIdsByKey.get(key);
      if (id !== undefined) candidate.edgeSelection.add(id);
    }
    if (perimeterKeys.size !== expectedPerimeterEdges || candidate.edgeSelection.size !== expectedPerimeterEdges) {
      return fail('The chain perimeter could not be recovered unambiguously.');
    }

    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'edge';
    this.clearSelection();
    this.rebuild();
    const committedEdges = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
    for (const key of perimeterKeys) {
      const id = committedEdges.get(key);
      if (id !== undefined) this.edgeSelection.add(id);
    }
    return {
      changed: true,
      amount,
      width,
      maxWidth,
      bevelCount: plans.length,
      miterCount: miterInfos.length,
      miterEdges: miterKeys.size,
      capPatches: capPatchFaces.length,
      insertedVertices: cutIdByKey.size + miterInfos.length,
      createdFaces: plans.length + capPatchFaces.length,
      selectedEdges: this.edgeSelection.size,
      endCaps: 2,
      chainLength: plans.length,
      maxInternalValence: Math.max(...pathVertices.slice(1, -1).map(vertexId => fanValenceByVertex.get(vertexId))),
      maxChainValence: Math.max(...pathVertices.map(vertexId => fanValenceByVertex.get(vertexId))),
      bevelFaceRefs: plans.map((plan, index) => ({
        faceId: bevelFaceStartId + index,
        endpointPoints: endpointRefs[index]
      }))
    };
  }

  /**
   * Bevels exactly two adjacent edges around one closed tri-valent corner.
   * The two strip faces share a computed miter edge. All source faces are
   * rebuilt from the immutable input and the candidate is validated before
   * the editable mesh is replaced.
   */
  bevelSelectedAdjacentPair({ amount = 0.25, edgeIds = [...this.edgeSelection], sharedVertexId = null } = {}) {
    const fail = reason => ({ changed: false, reason });
    if (this.selectionMode !== 'edge' || edgeIds.length !== 2 || !Number.isFinite(amount) || amount <= 0 || amount > 0.95) {
      return fail('Connected Bevel requires exactly two selected edges and a width factor from 0–0.95.');
    }
    const [edgeA, edgeB] = edgeIds.map(id => this.edges[id]);
    if (!edgeA || !edgeB) return fail('A selected bevel edge could not be resolved.');
    const commonVertices = edgeA.vertices.filter(id => edgeB.vertices.includes(id));
    if (commonVertices.length !== 1 || (sharedVertexId !== null && commonVertices[0] !== sharedVertexId)) {
      return fail('Connected Bevel requires two edges sharing exactly one endpoint.');
    }
    const center = commonVertices[0];
    const outerVertices = [...edgeA.vertices, ...edgeB.vertices].filter(id => id !== center);
    if (outerVertices.length !== 2 || outerVertices[0] === outerVertices[1]) {
      return fail('The adjacent edge pair has ambiguous outer endpoints.');
    }
    const sourceReport = this.validateTopology();
    if (!sourceReport.valid) return fail('The mesh has existing topology warnings. Validate and repair safe issues before beveling.');

    const edgeByKey = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge]));
    const edgeIdFor = (a, b) => edgeByKey.get(keyFor(a, b))?.id;
    const selectedEdgeIds = new Set(edgeIds);
    const incidentEdgesByVertex = new Map();
    const affectedFaceIds = new Set();
    for (const vertexId of [center, ...outerVertices]) {
      const incidentFaces = this.faces.reduce((ids, face, faceId) => {
        if (face.includes(vertexId)) ids.push(faceId);
        return ids;
      }, []);
      const incidentEdges = this.edges.filter(edge => edge.vertices.includes(vertexId));
      if (incidentFaces.length !== 3 || incidentEdges.length !== 3 ||
          incidentEdges.some(edge => edge.halfEdges.length !== 2 || !edge.halfEdges.every(halfEdge => halfEdge.twin))) {
        return fail('Connected Bevel currently supports closed valence-three endpoint fans only.');
      }
      incidentEdgesByVertex.set(vertexId, incidentEdges);
      incidentFaces.forEach(id => affectedFaceIds.add(id));
    }

    const isPlanarConvex = (face, positions = this.positions) => {
      const projection = projectedPolygon(positions, face);
      if (!projection || projection.deviation > projection.scale * 1e-5 || !triangulatePolygon(positions, face)) return false;
      const area = signedArea2D(projection.points), winding = Math.sign(area);
      if (!winding) return false;
      const epsilon = projection.scale * projection.scale * 1e-9;
      return projection.points.every((_, index) => cross2(
        projection.points[(index - 1 + projection.points.length) % projection.points.length],
        projection.points[index], projection.points[(index + 1) % projection.points.length]
      ) * winding > epsilon);
    };
    for (const faceId of affectedFaceIds) {
      if (!isPlanarConvex(this.faces[faceId])) return fail('All faces around both bevel endpoints must be simple, planar and convex.');
    }

    const inspectEdge = edge => {
      if (edge.halfEdges.length !== 2) return null;
      let [first, second] = edge.halfEdges;
      if (!first.twin || !second.twin || first.twin !== second || second.twin !== first ||
          first.next.origin !== second.origin || second.next.origin !== first.origin) return null;
      if (first.origin !== center) [first, second] = [second, first];
      const cutInfo = (halfEdge, atStart) => {
        const vertexId = atStart ? halfEdge.origin : halfEdge.next.origin;
        const adjacentHalfEdge = atStart ? halfEdge.prev : halfEdge.next;
        const adjacent = this.edges[adjacentHalfEdge.edge.id];
        if (!adjacent || adjacent.halfEdges.length !== 2 || !adjacent.halfEdges.every(item => item.twin)) return null;
        const otherId = adjacent.vertices[0] === vertexId ? adjacent.vertices[1] : adjacent.vertices[0];
        const from = this.positions[vertexId], to = this.positions[otherId];
        if (!from || !to) return null;
        const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        if (!Number.isFinite(length) || length <= 1e-10) return null;
        return { vertexId, edgeId: adjacent.id, otherId, from, to, length };
      };
      const start = first.origin, end = first.next.origin;
      const cuts = [
        cutInfo(first, true), cutInfo(first, false),
        cutInfo(second, true), cutInfo(second, false)
      ];
      if (cuts.some(item => !item)) return null;
      return { edgeId: edge.id, first, second, start, end, faceAId: first.face.id, faceBId: second.face.id, cuts };
    };
    const plans = [inspectEdge(edgeA), inspectEdge(edgeB)];
    if (plans.some(plan => !plan)) return fail('Both selected edges must have consistently wound interior manifold neighborhoods.');
    const endpointRefs = plans.map(plan => [[...this.positions[plan.start]], [...this.positions[plan.end]]]);

    const sharedFaces = plans[0].first.face.id === plans[1].first.face.id || plans[0].first.face.id === plans[1].second.face.id
      ? [plans[0].first.face.id] : [];
    for (const faceId of [plans[0].second.face.id]) {
      if (plans[1].first.face.id === faceId || plans[1].second.face.id === faceId) sharedFaces.push(faceId);
    }
    const uniqueSharedFaces = [...new Set(sharedFaces)];
    if (uniqueSharedFaces.length !== 1) return fail('The adjacent edges do not have one unambiguous shared face for the miter.');
    const sharedFaceId = uniqueSharedFaces[0];
    const sharedFace = this.faces[sharedFaceId];
    const centralIndex = sharedFace.indexOf(center);
    if (centralIndex < 0) return fail('The shared face does not contain the selected corner.');
    const sharedPrevEdgeId = edgeIdFor(sharedFace[(centralIndex - 1 + sharedFace.length) % sharedFace.length], center);
    const sharedNextEdgeId = edgeIdFor(center, sharedFace[(centralIndex + 1) % sharedFace.length]);
    if (!selectedEdgeIds.has(sharedPrevEdgeId) || !selectedEdgeIds.has(sharedNextEdgeId)) {
      return fail('The two selected edges must be consecutive boundary edges of their shared face.');
    }

    const cutInfoByKey = new Map();
    for (const plan of plans) {
      for (const info of plan.cuts) {
        const key = `${info.vertexId}:${info.edgeId}`;
        const previous = cutInfoByKey.get(key);
        if (previous && (previous.length - info.length > 1e-8 ||
            previous.to.some((value, axis) => Math.abs(value - info.to[axis]) > 1e-8))) {
          return fail('The adjacent bevels disagree on a shared offset edge; no topology was changed.');
        }
        cutInfoByKey.set(key, info);
      }
    }
    const maxWidth = Math.min(...[...cutInfoByKey.values()].map(info => info.length)) * 0.45;
    const width = maxWidth * amount;
    if (!Number.isFinite(width) || width <= 1e-9) return fail('The selected corner is too small for a stable bevel.');

    const nextPositions = this.positions.map(point => [...point]);
    const cutIdByKey = new Map();
    const offsetPoint = info => {
      const ratio = width / info.length;
      if (!(ratio > 0 && ratio < 0.5)) return null;
      const point = info.from.map((value, axis) => value + (info.to[axis] - value) * ratio);
      return point.every(Number.isFinite) ? point : null;
    };
    // The points on the two selected radial edges are consumed by the miter
    // intersection; they are not retained as vertices in the final topology.
    const selectedRadialKeys = new Set([`${center}:${edgeA.id}`, `${center}:${edgeB.id}`]);
    for (const [key, info] of cutInfoByKey) {
      const point = offsetPoint(info);
      if (!point) return fail('The requested bevel width is outside a stable edge range.');
      if (selectedRadialKeys.has(key)) continue;
      cutIdByKey.set(key, nextPositions.push(point) - 1);
    }
    const cutId = (vertexId, edgeId) => cutIdByKey.get(`${vertexId}:${edgeId}`);

    // Intersect the two offset lines in the shared face. Each line is parallel
    // to one selected edge and passes through the cut point on the other edge.
    const edgeAOther = edgeA.vertices.find(id => id !== center);
    const edgeBOther = edgeB.vertices.find(id => id !== center);
    const pointOnA = offsetPoint(cutInfoByKey.get(`${center}:${edgeA.id}`));
    const pointOnB = offsetPoint(cutInfoByKey.get(`${center}:${edgeB.id}`));
    if (!pointOnA || !pointOnB) return fail('The shared corner offsets could not be resolved.');
    const directionA = this.positions[edgeAOther].map((value, axis) => value - this.positions[center][axis]);
    const directionB = this.positions[edgeBOther].map((value, axis) => value - this.positions[center][axis]);
    const normal = newellNormal(this.positions, sharedFace);
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot3 = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
    const denominator = normal ? dot3(cross3(directionA, directionB), normal) : 0;
    const scale = Math.max(1, Math.hypot(...directionA) * Math.hypot(...directionB));
    if (!Number.isFinite(denominator) || Math.abs(denominator) <= scale * 1e-8) {
      return fail('The selected corner edges are too close to parallel for a stable miter.');
    }
    const difference = pointOnA.map((value, axis) => value - pointOnB[axis]);
    const parameterA = dot3(cross3(difference, directionB), normal) / denominator;
    const parameterB = dot3(cross3(difference, directionA), normal) / denominator;
    if (!(parameterA > 1e-8 && parameterB > 1e-8)) return fail('The offset lines do not meet inside the selected corner.');
    const miterA = pointOnB.map((value, axis) => value + parameterA * directionA[axis]);
    const miterB = pointOnA.map((value, axis) => value + parameterB * directionB[axis]);
    const mismatch = Math.hypot(...miterA.map((value, axis) => value - miterB[axis]));
    if (mismatch > Math.max(1e-7, width * 1e-5)) return fail('The shared offset lines do not meet at a stable miter point.');
    const miterPoint = miterA.map((value, axis) => (value + miterB[axis]) * 0.5);
    const miterLength = Math.hypot(...miterPoint.map((value, axis) => value - this.positions[center][axis]));
    if (!Number.isFinite(miterLength) || miterLength > width * 4) return fail('The corner requires an excessive miter; reduce the width or bevel the edges separately.');
    const projection = projectedPolygon(this.positions, sharedFace);
    const dropAxis = normal.reduce((best, value, axis) => Math.abs(value) > Math.abs(normal[best]) ? axis : best, 0);
    const project = point => dropAxis === 0 ? [point[1], point[2]] : dropAxis === 1 ? [point[0], point[2]] : [point[0], point[1]];
    const miter2 = project(miterPoint);
    const winding = Math.sign(signedArea2D(projection.points));
    const epsilon = projection.scale * projection.scale * 1e-9;
    if (projection.points.some((point, index) => cross2(point, projection.points[(index + 1) % projection.points.length], miter2) * winding < -epsilon)) {
      return fail('The shared offset lines meet outside the common face.');
    }
    const miterId = nextPositions.push(miterPoint) - 1;

    const nextFaces = [];
    for (let faceId = 0; faceId < this.faces.length; faceId++) {
      const face = this.faces[faceId];
      const output = [];
      const append = id => {
        if (!Number.isInteger(id)) return false;
        if (output.at(-1) !== id) output.push(id);
        return true;
      };
      for (let index = 0; index < face.length; index++) {
        const startVertex = face[index];
        const endVertex = face[(index + 1) % face.length];
        const edgeId = edgeIdFor(startVertex, endVertex);
        if (!Number.isInteger(edgeId)) return fail('An affected face has an unresolved boundary edge.');
        if (selectedEdgeIds.has(edgeId)) {
          const edge = this.edges[edgeId];
          const halfEdge = edge.halfEdges.find(item => item.face.id === faceId && item.origin === startVertex && item.next.origin === endVertex);
          if (!halfEdge) return fail('A selected edge has an inconsistent face-boundary direction.');
          const startPoint = faceId === sharedFaceId && startVertex === center
            ? miterId : cutId(startVertex, halfEdge.prev.edge.id);
          const endPoint = faceId === sharedFaceId && endVertex === center
            ? miterId : cutId(endVertex, halfEdge.next.edge.id);
          if (!append(startPoint) || !append(endPoint)) return fail('A selected bevel side could not be replaced by its offset boundary.');
        } else {
          const startPoint = cutId(startVertex, edgeId) ?? startVertex;
          const endPoint = cutId(endVertex, edgeId) ?? endVertex;
          if (!append(startPoint) || !append(endPoint)) return fail('An adjacent source edge could not be trimmed safely.');
        }
      }
      if (output.length > 1 && output[0] === output.at(-1)) output.pop();
      nextFaces.push(output);
    }

    const bevelFaces = [];
    for (const plan of plans) {
      let pA0 = cutId(plan.start, plan.first.prev.edge.id);
      const pB0 = cutId(plan.end, plan.first.next.edge.id);
      const pB1 = cutId(plan.end, plan.second.prev.edge.id);
      let pA1 = cutId(plan.start, plan.second.next.edge.id);
      if (plan.start === center) {
        if (plan.faceAId === sharedFaceId) pA0 = miterId;
        else if (plan.faceBId === sharedFaceId) pA1 = miterId;
      } else {
        return fail('The connected bevel edge direction could not be normalized around the shared corner.');
      }
      if (![pA0, pB0, pB1, pA1].every(Number.isInteger)) return fail('A bevel strip could not resolve its four corner offsets.');
      const strip = [pB0, pA0, pA1, pB1];
      bevelFaces.push(strip);
      nextFaces.push(strip);
    }

    const candidate = new HalfEdgeMesh(nextPositions, nextFaces);
    const compactMap = candidate.compact();
    const report = candidate.validateTopology();
    if (!report.valid) return fail(`The proposed miter failed topology validation (${report.issueCount} issue(s)); the original mesh was not changed.`);
    for (let faceId = 0; faceId < candidate.faces.length; faceId++) {
      if (!candidate.triangulateFace(faceId).length) return fail('The proposed miter produced a face that could not be triangulated.');
    }
    const affectedFacesRemainConvex = [...affectedFaceIds].every(faceId =>
      isPlanarConvex(candidate.faces[faceId], candidate.positions)
    );
    const bevelFacesArePlanarConvex = bevelFaces.every(face =>
      isPlanarConvex(face.map(id => compactMap.get(id)), candidate.positions)
    );
    if (!affectedFacesRemainConvex || !bevelFacesArePlanarConvex) {
      return fail('The proposed miter must preserve planar, convex affected faces and bevel strips.');
    }

    const thirdEdge = incidentEdgesByVertex.get(center).find(edge => !selectedEdgeIds.has(edge.id));
    const thirdCut = cutId(center, thirdEdge?.id);
    if (!Number.isInteger(thirdCut)) return fail('The shared miter edge could not be resolved.');
    const miterKey = keyFor(compactMap.get(miterId), compactMap.get(thirdCut));
    const perimeterKeys = new Set();
    for (const face of bevelFaces) {
      const mapped = face.map(id => compactMap.get(id));
      for (let index = 0; index < mapped.length; index++) {
        const key = keyFor(mapped[index], mapped[(index + 1) % mapped.length]);
        if (key !== miterKey) perimeterKeys.add(key);
      }
    }
    const edgeIdsByKey = new Map(candidate.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
    candidate.selectionMode = 'edge';
    candidate.clearSelection();
    for (const key of perimeterKeys) {
      const id = edgeIdsByKey.get(key);
      if (id !== undefined) candidate.edgeSelection.add(id);
    }
    const miterEdges = candidate.edges.filter(edge => keyFor(...edge.vertices) === miterKey);
    if (candidate.edgeSelection.size !== 6 || miterEdges.length !== 1 || miterEdges[0].halfEdges.length !== 2) {
      return fail('The miter must contain six selectable perimeter edges and one shared manifold miter edge.');
    }

    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'edge';
    this.clearSelection();
    this.rebuild();
    const committedEdges = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
    for (const key of perimeterKeys) {
      const id = committedEdges.get(key);
      if (id !== undefined) this.edgeSelection.add(id);
    }
    return {
      changed: true,
      amount,
      width,
      maxWidth,
      bevelCount: 2,
      insertedVertices: cutIdByKey.size + 1,
      createdFaces: 2,
      miterEdges: 1,
      selectedEdges: this.edgeSelection.size,
      bevelFaceRefs: plans.map((plan, index) => ({
        faceId: candidate.faces.length - plans.length + index,
        endpointPoints: endpointRefs[index]
      }))
    };
  }

  /**
   * Bevels one interior edge on a closed, convex tri-valent neighborhood.
   * This deliberately narrow first pass supports cube-like corners only:
   * both endpoints must have three incident faces, all affected faces must be
   * planar/convex, and every affected edge must be manifold. All topology is
   * built and validated on a temporary mesh before the source is replaced.
   * `amount` is a 0–1 fraction of the maximum safe offset (45% of the shortest
   * adjacent edge), not a world-unit distance.
   */
  bevelSelectedEdge({ amount = 0.25 } = {}) {
    const fail = reason => ({ changed: false, reason });
    if (this.selectionMode !== 'edge' || this.edgeSelection.size !== 1) {
      return fail('Select exactly one edge in Edge Select mode.');
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 0.95) {
      return fail('Bevel amount must be greater than 0 and no more than 0.95.');
    }

    const edge = this.edges[[...this.edgeSelection][0]];
    if (!edge || edge.halfEdges.length !== 2 || !edge.halfEdges[0].twin || !edge.halfEdges[1].twin) {
      return fail('Bevel currently requires one closed interior manifold edge; boundary and non-manifold edges are skipped.');
    }
    const [first, second] = edge.halfEdges;
    if (first.next.origin !== second.origin || second.next.origin !== first.origin || first.twin !== second || second.twin !== first) {
      return fail('The selected edge has inconsistent face winding. Repair or orient the mesh before beveling.');
    }

    const sourceReport = this.validateTopology();
    if (!sourceReport.valid) return fail('The mesh has existing topology warnings. Validate and repair safe issues before beveling.');

    const faceAId = first.face?.id, faceBId = second.face?.id;
    const faceA = this.faces[faceAId], faceB = this.faces[faceBId];
    if (!faceA || !faceB || faceAId === faceBId) return fail('The selected edge does not have two distinct adjacent faces.');
    const a = first.origin, b = first.next.origin;
    const endpointPoints = [[...this.positions[a]], [...this.positions[b]]];
    const affectedFaces = new Set([faceAId, faceBId]);
    const edgeByKey = new Map(this.edges.map(item => [keyFor(...item.vertices), item]));
    const vertices = [a, b];

    for (const vertexId of vertices) {
      const incidentFaces = this.faces.reduce((ids, face, faceId) => {
        if (face.includes(vertexId)) ids.push(faceId);
        return ids;
      }, []);
      const incidentEdges = this.edges.filter(item => item.vertices.includes(vertexId));
      if (incidentFaces.length !== 3 || incidentEdges.length !== 3 || incidentEdges.some(item => item.halfEdges.length !== 2)) {
        return fail('Bevel currently supports closed valence-three corners only; boundary and extraordinary neighborhoods are skipped.');
      }
      const thirdFaces = incidentFaces.filter(id => !affectedFaces.has(id));
      if (thirdFaces.length !== 1) return fail('The selected edge does not have a simple three-face corner fan at both endpoints.');
      const thirdFace = this.faces[thirdFaces[0]];
      if (!thirdFace || thirdFace.length < 3 || !thirdFace.includes(vertexId)) return fail('The adjacent corner face is invalid.');
      affectedFaces.add(thirdFaces[0]);
    }
    if (affectedFaces.size !== 4) return fail('Both edge endpoints must have distinct, unambiguous corner faces.');

    const isPlanarConvex = faceId => {
      const face = this.faces[faceId];
      const projection = projectedPolygon(this.positions, face);
      if (!projection || projection.deviation > projection.scale * 1e-5 || !triangulatePolygon(this.positions, face)) return false;
      const area = signedArea2D(projection.points), winding = Math.sign(area);
      if (!winding) return false;
      const epsilon = projection.scale * projection.scale * 1e-9;
      for (let i = 0; i < projection.points.length; i++) {
        if (cross2(projection.points[(i - 1 + projection.points.length) % projection.points.length],
          projection.points[i], projection.points[(i + 1) % projection.points.length]) * winding <= epsilon) return false;
      }
      return true;
    };
    for (const faceId of affectedFaces) {
      if (!isPlanarConvex(faceId)) return fail('All four faces around this edge must be simple, planar and convex.');
    }

    // Create one cut vertex on each non-selected edge meeting the selected
    // edge's two endpoints. The two remaining corner faces bridge those pairs.
    const adjacentLengths = [];
    const pointAlong = (vertexId, edgeId) => {
      const adjacent = this.edges[edgeId];
      if (!adjacent || adjacent.halfEdges.length !== 2 || !adjacent.halfEdges.every(he => he.twin)) return null;
      const otherId = adjacent.vertices[0] === vertexId ? adjacent.vertices[1] : adjacent.vertices[0];
      const from = this.positions[vertexId], to = this.positions[otherId];
      if (!from || !to) return null;
      const length = Math.hypot(to[0]-from[0], to[1]-from[1], to[2]-from[2]);
      if (!Number.isFinite(length) || length <= 1e-10) return null;
      adjacentLengths.push(length);
      return { edgeId: adjacent.id, otherId, from, to, length };
    };
    const cornerCut = (halfEdge, atStart) => {
      const vertexId = atStart ? halfEdge.origin : halfEdge.next.origin;
      const adjacentHalfEdge = atStart ? halfEdge.prev : halfEdge.next;
      const edgeInfo = pointAlong(vertexId, adjacentHalfEdge.edge.id);
      if (!edgeInfo) return null;
      return { vertexId, edgeId: edgeInfo.edgeId, otherId: edgeInfo.otherId, from: edgeInfo.from, to: edgeInfo.to, length: edgeInfo.length };
    };
    const cutA0 = cornerCut(first, true);   // on the incoming edge of face A at A
    const cutB0 = cornerCut(first, false);  // on the outgoing edge of face A at B
    const cutB1 = cornerCut(second, true);  // on the incoming edge of face B at B
    const cutA1 = cornerCut(second, false); // on the outgoing edge of face B at A
    if (![cutA0, cutB0, cutB1, cutA1].every(Boolean)) {
      return fail('The edge neighborhood is incomplete or contains a boundary edge.');
    }
    const uniqueCuts = new Set([cutA0, cutB0, cutB1, cutA1].map(item => `${item.vertexId}:${item.edgeId}`));
    if (uniqueCuts.size !== 4) return fail('The selected edge has overlapping or ambiguous corner edges.');

    const maxWidth = Math.min(...adjacentLengths) * 0.45;
    const width = maxWidth * amount;
    if (!Number.isFinite(width) || width <= 1e-9) return fail('The selected edge is too small for a stable bevel.');
    const nextPositions = this.positions.map(point => [...point]);
    const cutIdByCornerEdge = new Map();
    const createCut = item => {
      const ratio = width / item.length;
      if (!(ratio > 0 && ratio < 0.5)) return null;
      const point = item.from.map((value, axis) => value + (item.to[axis] - value) * ratio);
      if (!point.every(Number.isFinite)) return null;
      const id = nextPositions.length;
      nextPositions.push(point);
      cutIdByCornerEdge.set(`${item.vertexId}:${item.edgeId}`, id);
      return id;
    };
    const pA0 = createCut(cutA0), pB0 = createCut(cutB0), pB1 = createCut(cutB1), pA1 = createCut(cutA1);
    if (![pA0,pB0,pB1,pA1].every(Number.isInteger)) return fail('The requested bevel width is outside a stable edge range.');

    const trimDirectedFace = (halfEdge, startCut, endCut) => {
      const face = this.faces[halfEdge.face.id], start = halfEdge.origin, end = halfEdge.next.origin;
      const index = face.indexOf(start);
      if (index < 0 || face[(index + 1) % face.length] !== end) return null;
      const rotated = [...face.slice(index), ...face.slice(0, index)];
      return [startCut, endCut, ...rotated.slice(2)];
    };
    const trimCornerFace = (faceId, vertexId) => {
      const face = this.faces[faceId], index = face.indexOf(vertexId);
      if (index < 0) return null;
      const previous = face[(index - 1 + face.length) % face.length];
      const next = face[(index + 1) % face.length];
      const previousEdge = edgeByKey.get(keyFor(previous, vertexId));
      const nextEdge = edgeByKey.get(keyFor(vertexId, next));
      const previousCut = previousEdge && cutIdByCornerEdge.get(`${vertexId}:${previousEdge.id}`);
      const nextCut = nextEdge && cutIdByCornerEdge.get(`${vertexId}:${nextEdge.id}`);
      if (!Number.isInteger(previousCut) || !Number.isInteger(nextCut)) return null;
      return [...face.slice(0, index), previousCut, nextCut, ...face.slice(index + 1)];
    };

    const trimmedA = trimDirectedFace(first, pA0, pB0);
    const trimmedB = trimDirectedFace(second, pB1, pA1);
    if (!trimmedA || !trimmedB) return fail('The adjacent faces do not have a consistent edge neighborhood.');

    const nextFaces = this.faces.map(face => [...face]);
    nextFaces[faceAId] = trimmedA;
    nextFaces[faceBId] = trimmedB;
    for (const vertexId of [a, b]) {
      const incident = [...affectedFaces].filter(faceId => faceId !== faceAId && faceId !== faceBId && this.faces[faceId].includes(vertexId));
      if (incident.length !== 1) return fail('The corner cap face is ambiguous.');
      const cap = trimCornerFace(incident[0], vertexId);
      if (!cap) return fail('The corner cap could not be constructed safely.');
      nextFaces[incident[0]] = cap;
    }
    // Reverse the selected face edge, then bridge both trimmed face strips.
    const bevelFace = [pB0, pA0, pA1, pB1];
    nextFaces.push(bevelFace);

    const candidate = new HalfEdgeMesh(nextPositions, nextFaces);
    const compactMap = candidate.compact();
    const candidateReport = candidate.validateTopology();
    if (!candidateReport.valid) {
      return fail(`The proposed bevel failed topology validation (${candidateReport.issueCount} issue(s)); the original mesh was not changed.`);
    }
    if (candidate.faces.slice(0, nextFaces.length - 1).some((_, faceId) => !candidate.triangulateFace(faceId).length) ||
        !candidate.triangulateFace(candidate.faces.length - 1).length) {
      return fail('The proposed bevel produced a face that could not be triangulated.');
    }

    const selectedRing = [pB0, pA0, pA1, pB1].map(id => compactMap.get(id));
    candidate.selectionMode = 'edge';
    candidate.clearSelection();
    const candidateEdgeIds = new Map(candidate.edges.map(item => [keyFor(...item.vertices), item.id]));
    for (let i = 0; i < selectedRing.length; i++) {
      const edgeId = candidateEdgeIds.get(keyFor(selectedRing[i], selectedRing[(i + 1) % selectedRing.length]));
      if (edgeId !== undefined) candidate.edgeSelection.add(edgeId);
    }
    if (candidate.edgeSelection.size !== 4) return fail('The bevel perimeter did not produce four stable edges.');

    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'edge';
    this.clearSelection();
    this.rebuild();
    const selectedKeys = selectedRing.map((id, index) => keyFor(id, selectedRing[(index + 1) % selectedRing.length]));
    const rebuiltEdgeIds = new Map(this.edges.map(item => [keyFor(...item.vertices), item.id]));
    for (const key of selectedKeys) {
      const edgeId = rebuiltEdgeIds.get(key);
      if (edgeId !== undefined) this.edgeSelection.add(edgeId);
    }
    return {
      changed: true, amount, width, maxWidth, insertedVertices: 4, createdFaces: 1,
      selectedEdges: this.edgeSelection.size,
      bevelFaceRefs: [{ faceId: candidate.faces.length - 1, endpointPoints }]
    };
  }



  /**
   * Replaces each validated bevel quad with a profiled, triangulated strip.
   * Cross-section split vertices are shared by adjacent strips. Terminal cap
   * points are displaced inside their cap-face plane; shared miter edges stay
   * straight so neighboring bevel strips cannot open a crack.
   */
  _applyBevelSegments({ bevelFaceRefs = [], segments = 1, profile = 0.5, profileScale = 1 } = {}) {
    const fail = reason => ({ changed: false, reason });
    if (!Number.isInteger(segments) || segments < 2 || segments > 8 ||
        !Number.isFinite(profile) || profile < 0 || profile > 1 ||
        !Number.isFinite(profileScale) || profileScale <= 0 || profileScale > 1 || !bevelFaceRefs.length) {
      return fail('The segmented bevel parameters or strip references are invalid.');
    }
    const bevelFaceIds = new Set(bevelFaceRefs.map(ref => ref.faceId));
    if (bevelFaceIds.size !== bevelFaceRefs.length || [...bevelFaceIds].some(id =>
      !Number.isInteger(id) || !this.faces[id] || this.faces[id].length !== 4)) {
      return fail('A bevel strip could not be identified unambiguously for segmentation.');
    }

    const edgeByKey = new Map(this.edges.map(edge => [keyFor(...edge.vertices), edge]));
    const splitByEdge = new Map();
    const lerp = (a, b, t) => a.map((value, axis) => value + (b[axis] - value) * t);
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
    const profileBulge = (0.14644660940672624 + (profile - 0.5) * 0.5) * profileScale;

    for (const ref of bevelFaceRefs) {
      const face = this.faces[ref.faceId];
      const endpoints = ref.endpointPoints;
      if (!Array.isArray(endpoints) || endpoints.length !== 2 ||
          endpoints.some(point => !Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite))) {
        return fail('A source edge endpoint reference is missing from a bevel strip.');
      }
      const crossEdges = [[face[1], face[2]], [face[0], face[3]]];
      const midpoints = crossEdges.map(([a, b]) => lerp(this.positions[a], this.positions[b], 0.5));
      const costForward = distance(midpoints[0], endpoints[0]) + distance(midpoints[1], endpoints[1]);
      const costReverse = distance(midpoints[0], endpoints[1]) + distance(midpoints[1], endpoints[0]);
      const endpointForEdge = costForward <= costReverse ? [endpoints[0], endpoints[1]] : [endpoints[1], endpoints[0]];

      for (let edgeIndex = 0; edgeIndex < crossEdges.length; edgeIndex++) {
        const [u, v] = crossEdges[edgeIndex];
        const key = keyFor(u, v);
        if (splitByEdge.has(key)) continue;
        const edge = edgeByKey.get(key);
        if (!edge || edge.halfEdges.length !== 2 || !edge.halfEdges.every(halfEdge => halfEdge.twin)) {
          return fail('A bevel cross-section is not a closed two-face manifold edge.');
        }
        const neighborFaceIds = edge.halfEdges.map(halfEdge => halfEdge.face?.id);
        const isSharedMiter = neighborFaceIds.some(id => id !== ref.faceId && bevelFaceIds.has(id));
        const capFaceId = neighborFaceIds.find(id => id !== ref.faceId && !bevelFaceIds.has(id));
        const [a, b] = edge.vertices;
        const start = this.positions[a], end = this.positions[b];
        const edgeLength = distance(start, end);
        if (!Number.isFinite(edgeLength) || edgeLength <= 1e-10) return fail('A bevel profile edge is too small to subdivide.');
        let bendDirection = [0, 0, 0];
        if (!isSharedMiter) {
          const capFace = this.faces[capFaceId];
          const normal = Number.isInteger(capFaceId) ? newellNormal(this.positions, capFace) : null;
          if (!normal) return fail('A bevel terminal cap has no stable plane for profile shaping.');
          const midpoint = lerp(start, end, 0.5);
          const towardCorner = endpointForEdge[edgeIndex].map((value, axis) => value - midpoint[axis]);
          const projected = towardCorner.map((value, axis) => value - normal[axis] * dot(towardCorner, normal));
          const length = Math.hypot(...projected);
          if (!Number.isFinite(length) || length <= 1e-10) return fail('A bevel profile direction is ambiguous at a terminal cap.');
          bendDirection = projected.map(value => value / length);
        }
        const finalIds = [];
        for (let step = 1; step < segments; step++) {
          const t = step / segments;
          const point = lerp(start, end, t);
          if (!isSharedMiter && profileBulge !== 0) {
            const height = edgeLength * profileBulge * Math.sin(Math.PI * t);
            for (let axis = 0; axis < 3; axis++) point[axis] += bendDirection[axis] * height;
          }
          finalIds.push(this.positions.length);
          this.positions.push(point);
        }
        splitByEdge.set(key, { a, b, ids: finalIds, sharedMiter: isSharedMiter });
      }
    }

    const splitInDirection = (startId, endId) => {
      const entry = splitByEdge.get(keyFor(startId, endId));
      if (!entry) return [];
      return startId === entry.a ? [...entry.ids] : [...entry.ids].reverse();
    };
    const nextFaces = [];
    for (let faceId = 0; faceId < this.faces.length; faceId++) {
      const face = this.faces[faceId];
      if (bevelFaceIds.has(faceId)) {
        const sectionA = [face[1], ...splitInDirection(face[1], face[2]), face[2]];
        const sectionB = [face[0], ...splitInDirection(face[0], face[3]), face[3]];
        if (sectionA.length !== segments + 1 || sectionB.length !== segments + 1) {
          return fail('A shared bevel section could not be divided into matching segment rows.');
        }
        for (let step = 0; step < segments; step++) {
          const b0 = sectionB[step], a0 = sectionA[step], a1 = sectionA[step + 1], b1 = sectionB[step + 1];
          nextFaces.push([b0, a0, a1], [b0, a1, b1]);
        }
      } else {
        const output = [];
        for (let index = 0; index < face.length; index++) {
          const startId = face[index], endId = face[(index + 1) % face.length];
          output.push(startId, ...splitInDirection(startId, endId));
        }
        if (output.length < 3 || new Set(output).size !== output.length) return fail('A cap boundary could not be reconstructed after profile subdivision.');
        nextFaces.push(output);
      }
    }

    const candidate = new HalfEdgeMesh(this.positions, nextFaces);
    const report = candidate.validateTopology();
    if (!report.valid) {
      return fail(`Segmented bevel failed topology validation (${report.issueCount} issue(s)); the original mesh was not changed.`);
    }
    for (let faceId = 0; faceId < candidate.faces.length; faceId++) {
      if (!candidate.triangulateFace(faceId).length) return fail('A segmented bevel face could not be triangulated.');
    }

    const selectedPairs = [...this.edgeSelection].map(edgeId => {
      const edge = this.edges[edgeId];
      return edge ? [...edge.vertices] : null;
    });
    if (selectedPairs.some(pair => !pair)) return fail('A bevel perimeter edge disappeared before segmentation.');
    const edgeIdsByKey = new Map(candidate.edges.map(edge => [keyFor(...edge.vertices), edge.id]));
    candidate.selectionMode = 'edge';
    candidate.clearSelection();
    for (const [startId, endId] of selectedPairs) {
      const chain = [startId, ...splitInDirection(startId, endId), endId];
      for (let index = 0; index < chain.length - 1; index++) {
        const edgeId = edgeIdsByKey.get(keyFor(chain[index], chain[index + 1]));
        if (edgeId === undefined) return fail('A segmented bevel perimeter edge could not be recovered.');
        candidate.edgeSelection.add(edgeId);
      }
    }
    const expectedSelected = selectedPairs.reduce((sum, [a, b]) => sum + 1 + (splitByEdge.get(keyFor(a, b))?.ids.length || 0), 0);
    if (candidate.edgeSelection.size !== expectedSelected) return fail('The segmented bevel perimeter is incomplete or ambiguous.');

    this.positions = candidate.positions.map(point => [...point]);
    this.faces = candidate.faces.map(face => [...face]);
    this.selectionMode = 'edge';
    this.clearSelection();
    this.rebuild();
    this.edgeSelection = new Set(candidate.edgeSelection);
    return {
      changed: true,
      insertedVertices: splitByEdge.size * (segments - 1),
      createdFaces: bevelFaceRefs.length * segments * 2,
      selectedEdges: this.edgeSelection.size
    };
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

  isClosedQuadFan(fan) {
    if (!Array.isArray(fan) || fan.length < 3) return false;
    const edgeIds = new Set();
    for (const halfEdge of fan) {
      if (!halfEdge?.face || this.faces[halfEdge.face.id]?.length !== 4 ||
          !halfEdge.edge || halfEdge.edge.halfEdges.length !== 2 || !halfEdge.twin ||
          edgeIds.has(halfEdge.edge.id)) return false;
      edgeIds.add(halfEdge.edge.id);
    }
    return true;
  }

  /**
   * Finds a geometrically unambiguous continuation through a closed
   * extraordinary all-quad vertex fan. Only near-antiparallel incident edges
   * are paired; weak or tied candidates deliberately stop at the pole.
   */
  oppositeEdgeAtExtraordinaryPole(vertexId, edgeId, fan) {
    if (!this.isClosedQuadFan(fan) || fan.length === 4) return null;
    const origin = this.positions[vertexId];
    if (!origin) return null;
    const candidates = fan.map(halfEdge => halfEdge.edge);
    const direction = edge => {
      const otherId = edge.vertices[0] === vertexId ? edge.vertices[1] : edge.vertices[0];
      const point = this.positions[otherId];
      if (!point) return null;
      const vector = point.map((value, axis) => value - origin[axis]);
      const length = Math.hypot(...vector);
      return length > 1e-10 ? vector.map(value => value / length) : null;
    };
    const vectors = new Map(fan.map(halfEdge => [halfEdge.edge.id, direction(halfEdge.edge)]));
    if (!vectors.get(edgeId)) return null;
    const threshold = -Math.cos(25 * Math.PI / 180); // at least 155 degrees apart
    const uniquenessMargin = 0.15;
    const bestPartner = sourceId => {
      const source = vectors.get(sourceId);
      if (!source) return null;
      const ranked = candidates.filter(edge => edge.id !== sourceId && vectors.get(edge.id))
        .map(edge => ({ id: edge.id, dot: source.reduce((sum, value, axis) => sum + value * vectors.get(edge.id)[axis], 0) }))
        .sort((a, b) => a.dot - b.dot);
      if (!ranked.length || ranked[0].dot > threshold) return null;
      if (ranked[1] && ranked[1].dot - ranked[0].dot < uniquenessMargin) return null;
      return ranked[0].id;
    };
    const partner = bestPartner(edgeId);
    if (partner === null || bestPartner(partner) !== edgeId) return null;
    return partner;
  }

  expandEdgeRingSelection({ extend = true } = {}) {
    if (this.selectionMode !== 'edge' || !this.edgeSelection.size) {
      this.lastRingTraversal = { regularVertices: 0, extraordinaryVertices: 0, ambiguousPoles: 0, stoppedFans: 0 };
      return 0;
    }
    const seeds = [...this.edgeSelection];
    const visited = new Set(seeds), queue = [...seeds];
    const stats = { regularVertices: 0, extraordinaryVertices: 0, ambiguousPoles: 0, stoppedFans: 0 };
    const regularVertexIds = new Set(), extraordinaryVertexIds = new Set();
    const ambiguousPoleIds = new Set(), stoppedFanVertexIds = new Set();
    const processed = new Set();
    while (queue.length) {
      const edge = this.edges[queue.shift()];
      if (!edge) continue;
      for (const vertexId of edge.vertices) {
        const visitKey = `${vertexId}:${edge.id}`;
        if (processed.has(visitKey)) continue;
        processed.add(visitKey);
        const fan = this.orderedVertexFan(vertexId);
        if (!this.isClosedQuadFan(fan)) { stoppedFanVertexIds.add(vertexId); continue; }
        const currentIndex = fan.findIndex(halfEdge => halfEdge.edge.id === edge.id);
        if (currentIndex < 0) continue;
        let opposite;
        if (fan.length === 4) {
          regularVertexIds.add(vertexId);
          opposite = fan[(currentIndex + 2) % 4].edge.id;
        } else {
          opposite = this.oppositeEdgeAtExtraordinaryPole(vertexId, edge.id, fan);
          if (opposite === null) { ambiguousPoleIds.add(vertexId); continue; }
          extraordinaryVertexIds.add(vertexId);
        }
        if (!visited.has(opposite)) { visited.add(opposite); queue.push(opposite); }
      }
    }
    stats.regularVertices = regularVertexIds.size;
    stats.extraordinaryVertices = extraordinaryVertexIds.size;
    stats.ambiguousPoles = ambiguousPoleIds.size;
    stats.stoppedFans = stoppedFanVertexIds.size;
    this.lastRingTraversal = stats;
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
