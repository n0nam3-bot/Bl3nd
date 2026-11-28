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
