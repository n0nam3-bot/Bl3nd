const EPSILON = 1e-8;

const clamp01 = value => Math.max(0, Math.min(1, value));
const cross2 = (ax, ay, bx, by) => ax * by - ay * bx;
const pointAt = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function uniqueSorted(values) {
  const sorted = values.filter(Number.isFinite).map(clamp01).sort((a, b) => a - b);
  return sorted.filter((value, index) => index === 0 || Math.abs(value - sorted[index - 1]) > EPSILON);
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && start <= end + EPSILON)
    .map(([start, end]) => [clamp01(start), clamp01(end)])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && interval[0] <= previous[1] + EPSILON) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

function pointOnSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const px = point.x - a.x, py = point.y - a.y;
  if (Math.abs(cross2(dx, dy, px, py)) > EPSILON) return false;
  const dot = px * dx + py * dy;
  return dot >= -EPSILON && dot <= dx * dx + dy * dy + EPSILON;
}

function pointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (pointOnSegment(point, a, b)) return true;
    const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function clipToBox(a, b, points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const opposite = points[points.length - 1];
  const minX = Math.min(points[0].x, opposite.x);
  const maxX = Math.max(points[0].x, opposite.x);
  const minY = Math.min(points[0].y, opposite.y);
  const maxY = Math.max(points[0].y, opposite.y);
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - minX, maxX - a.x, a.y - minY, maxY - a.y];
  let start = 0, end = 1;
  for (let index = 0; index < 4; index++) {
    if (Math.abs(p[index]) <= EPSILON) {
      if (q[index] < -EPSILON) return [];
      continue;
    }
    const ratio = q[index] / p[index];
    if (p[index] < 0) start = Math.max(start, ratio);
    else end = Math.min(end, ratio);
    if (start > end + EPSILON) return [];
  }
  return [[clamp01(start), clamp01(end)]];
}

function circleIntervals(a, b, centers, radius) {
  if (!Array.isArray(centers) || !centers.length || !Number.isFinite(radius) || radius < 0) return [];
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) {
    return centers.some(center => Math.hypot(a.x - center.x, a.y - center.y) <= radius)
      ? [[0, 1]] : [];
  }
  const intervals = [];
  for (const center of centers) {
    const fx = a.x - center.x, fy = a.y - center.y;
    const c = fx * fx + fy * fy - radius * radius;
    const bTerm = 2 * (fx * dx + fy * dy);
    const discriminant = bTerm * bTerm - 4 * lengthSquared * c;
    if (discriminant < -EPSILON) continue;
    const root = Math.sqrt(Math.max(0, discriminant));
    const first = (-bTerm - root) / (2 * lengthSquared);
    const second = (-bTerm + root) / (2 * lengthSquared);
    const start = Math.max(0, first);
    const end = Math.min(1, second);
    if (start <= end + EPSILON) intervals.push([clamp01(start), clamp01(end)]);
  }
  return mergeIntervals(intervals);
}

function intersectionParameters(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y;
  const sx = d.x - c.x, sy = d.y - c.y;
  const qx = c.x - a.x, qy = c.y - a.y;
  const denominator = cross2(rx, ry, sx, sy);
  if (Math.abs(denominator) <= EPSILON) {
    if (Math.abs(cross2(qx, qy, rx, ry)) > EPSILON) return [];
    const lengthSquared = rx * rx + ry * ry;
    if (lengthSquared <= EPSILON) return [];
    return [((c.x - a.x) * rx + (c.y - a.y) * ry) / lengthSquared,
      ((d.x - a.x) * rx + (d.y - a.y) * ry) / lengthSquared]
      .filter(value => value >= -EPSILON && value <= 1 + EPSILON).map(clamp01);
  }
  const t = cross2(qx, qy, sx, sy) / denominator;
  const u = cross2(qx, qy, rx, ry) / denominator;
  return t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON
    ? [clamp01(t)] : [];
}

function lassoIntervals(a, b, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return [];
  const parameters = [0, 1];
  for (let index = 0; index < polygon.length; index++) {
    const next = (index + 1) % polygon.length;
    parameters.push(...intersectionParameters(a, b, polygon[index], polygon[next]));
  }
  const sorted = uniqueSorted(parameters);
  const intervals = [];
  for (const t of sorted) {
    if (pointInPolygon(pointAt(a, b, t), polygon)) intervals.push([t, t]);
  }
  for (let index = 0; index < sorted.length - 1; index++) {
    const start = sorted[index], end = sorted[index + 1];
    if (pointInPolygon(pointAt(a, b, (start + end) / 2), polygon)) intervals.push([start, end]);
  }
  return mergeIntervals(intervals);
}

/**
 * Returns the parameter intervals where a projected mesh edge overlaps a
 * box, circle-brush trail, or lasso. Intervals are measured along a -> b.
 */
export function segmentRegionIntervals(a, b, tool, points, radius = 25) {
  if (!a || !b || !Array.isArray(points) || !points.length) return [];
  if (tool === 'box') return clipToBox(a, b, points);
  if (tool === 'circle') return circleIntervals(a, b, points, radius);
  if (tool === 'lasso') return lassoIntervals(a, b, points);
  return [];
}

/**
 * Produces several visibility-check positions inside each overlap interval.
 * This avoids the old fixed five samples across the whole edge, which could
 * miss narrow finger-drawn regions and small corner intersections entirely.
 */
export function segmentRegionSamples(a, b, tool, points, radius = 25) {
  const samples = [];
  for (const [start, end] of segmentRegionIntervals(a, b, tool, points, radius)) {
    for (let index = 0; index <= 4; index++) samples.push(start + (end - start) * index / 4);
  }
  return uniqueSorted(samples);
}
