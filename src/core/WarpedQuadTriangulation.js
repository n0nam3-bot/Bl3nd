const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const length = vector => Math.hypot(...vector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function segmentDistanceSquared(p1, q1, p2, q2) {
  const d1 = subtract(q1, p1);
  const d2 = subtract(q2, p2);
  const r = subtract(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0, t = 0;

  if (a <= 1e-24 && e <= 1e-24) return dot(r, r);
  if (a <= 1e-24) {
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-24) {
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denominator = a * e - b * b;
      s = denominator > 1e-24 ? clamp((b * f - c * e) / denominator, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }

  const closestA = p1.map((value, axis) => value + d1[axis] * s);
  const closestB = p2.map((value, axis) => value + d2[axis] * t);
  return dot(subtract(closestA, closestB), subtract(closestA, closestB));
}

/**
 * Recover a renderable triangulation for a simple, warped four-sided face.
 * The ordinary 2D ear-clipping path remains authoritative for planar/concave
 * polygons. A non-planar quad can look like a bow-tie in its dominant-axis
 * projection even though its 3D boundary is still a simple loop; omitting it
 * creates a false visual opening after connected Edit Mode transforms.
 *
 * Both diagonal splits are scored against the quad's Newell area vector. The
 * split whose triangles best preserve the source winding and minimize the
 * fold between the two triangles is selected. A true 3D boundary crossing,
 * degenerate triangle or ambiguous zero-area quad still rejects.
 */
export function triangulateWarpedQuad(positions, face) {
  if (!Array.isArray(face) || face.length !== 4 || new Set(face).size !== 4) return null;
  const points = face.map(id => positions[id]);
  if (points.some(point => !Array.isArray(point) || point.length < 3 || !point.slice(0, 3).every(Number.isFinite))) return null;

  const bounds = [0, 1, 2].map(axis => {
    const values = points.map(point => point[axis]);
    return [Math.min(...values), Math.max(...values)];
  });
  const scale = Math.max(1, ...bounds.map(([min, max]) => max - min));
  const distanceTolerance = scale * 1e-8;
  const distanceToleranceSquared = distanceTolerance * distanceTolerance;

  // Opposite boundary edges may not physically cross in 3D. Projected
  // crossings are the case this fallback repairs; real 3D crossings are not.
  if (segmentDistanceSquared(points[0], points[1], points[2], points[3]) <= distanceToleranceSquared ||
      segmentDistanceSquared(points[1], points[2], points[3], points[0]) <= distanceToleranceSquared) return null;

  let areaVector = [0, 0, 0];
  for (let index = 0; index < 4; index++) {
    const a = points[index], b = points[(index + 1) % 4];
    areaVector = [
      areaVector[0] + (a[1] - b[1]) * (a[2] + b[2]),
      areaVector[1] + (a[2] - b[2]) * (a[0] + b[0]),
      areaVector[2] + (a[0] - b[0]) * (a[1] + b[1])
    ];
  }
  const referenceLength = length(areaVector);
  const areaTolerance = scale * scale * 1e-10;
  if (!Number.isFinite(referenceLength) || referenceLength <= areaTolerance) return null;
  const referenceNormal = areaVector.map(value => value / referenceLength);

  const splits = [
    [[0, 1, 2], [0, 2, 3]],
    [[0, 1, 3], [1, 2, 3]]
  ];
  let best = null;
  for (const triangles of splits) {
    const normals = triangles.map(indices => {
      const a = points[indices[0]], b = points[indices[1]], c = points[indices[2]];
      return cross(subtract(b, a), subtract(c, a));
    });
    const magnitudes = normals.map(length);
    if (magnitudes.some(value => !Number.isFinite(value) || value <= areaTolerance)) continue;

    const alignments = normals.map((normal, index) => dot(normal, referenceNormal) / magnitudes[index]);
    if (alignments.some(value => !Number.isFinite(value) || value <= 1e-5)) continue;
    const unitNormals = normals.map((normal, index) => normal.map(value => value / magnitudes[index]));
    const coherence = dot(unitNormals[0], unitNormals[1]);
    const minimumAlignment = Math.min(...alignments);
    const averageAlignment = (alignments[0] + alignments[1]) * 0.5;
    const score = minimumAlignment * 4 + averageAlignment + coherence * 0.25;
    if (!best || score > best.score) best = { triangles, score };
  }

  if (!best) return null;
  return best.triangles.map(triangle => triangle.map(index => face[index]));
}
