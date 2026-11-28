const AXIS_NAMES = ['x', 'y', 'z'];

function vector3(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const vector = value.slice(0, 3).map(Number);
  return vector.every(Number.isFinite) ? vector : null;
}

function normalize(value) {
  const vector = vector3(value);
  if (!vector) return null;
  const length = Math.hypot(...vector);
  return Number.isFinite(length) && length > 1e-9 ? vector.map(component => component / length) : null;
}

function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function addScaled(origin, direction, amount) {
  return origin.map((component, index) => component + direction[index] * amount);
}

function normalizedBasis(basis) {
  if (!basis) return null;
  const u = normalize(basis.u);
  const rawV = normalize(basis.v);
  if (!u || !rawV) return null;
  const projectedV = rawV.map((component, index) => component - u[index] * dot(rawV, u));
  let v = normalize(projectedV);
  if (!v) {
    const fallback = Math.abs(u[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
    v = normalize(cross(normalize(cross(u, fallback)), u));
  }
  if (!v) return null;
  return { u, v };
}

/**
 * Build a small, renderer-independent description of the passive transform guide.
 * All coordinates are world-space triples; callers remain responsible for projection.
 */
export function buildTransformGuideGeometry({
  pivot,
  axes,
  activeAxis = null,
  planeBasis = null,
  ringBasis = null,
  axisRingBases = null,
  type = 'move',
  worldLength = 1,
  ringRadius = null,
  ringSegments = 48
} = {}) {
  const origin = vector3(pivot);
  const length = Number(worldLength);
  if (!origin || !origin.every(Number.isFinite) || !Number.isFinite(length) || length <= 0) return null;

  const axisLines = {};
  for (const name of AXIS_NAMES) {
    const direction = normalize(axes?.[name]);
    if (!direction) continue;
    axisLines[name] = {
      start: [...origin],
      end: addScaled(origin, direction, length),
      direction
    };
  }
  if (!Object.keys(axisLines).length) return null;

  const plane = normalizedBasis(planeBasis);
  const planeExtent = length * 0.58;
  const planeCorners = plane ? [
    addScaled(addScaled(origin, plane.u, -planeExtent), plane.v, -planeExtent),
    addScaled(addScaled(origin, plane.u, planeExtent), plane.v, -planeExtent),
    addScaled(addScaled(origin, plane.u, planeExtent), plane.v, planeExtent),
    addScaled(addScaled(origin, plane.u, -planeExtent), plane.v, planeExtent)
  ] : [];

  const ring = normalizedBasis(ringBasis);
  const radius = Number.isFinite(Number(ringRadius)) && Number(ringRadius) > 0
    ? Number(ringRadius)
    : length * 0.72;
  const segments = Math.max(12, Math.min(96, Math.round(Number(ringSegments) || 48)));
  const makeRingPoints = basis => Array.from({ length: segments + 1 }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return origin.map((component, axisIndex) => component + radius * (
      basis.u[axisIndex] * Math.cos(angle) + basis.v[axisIndex] * Math.sin(angle)
    ));
  });
  const ringPoints = ring && type === 'rotate' ? makeRingPoints(ring) : [];
  const axisRings = type === 'rotate'
    ? AXIS_NAMES.flatMap(axis => {
        const basis = normalizedBasis(axisRingBases?.[axis]);
        return basis ? [{ axis, points: makeRingPoints(basis), radius }] : [];
      })
    : [];

  return {
    pivot: origin,
    type,
    activeAxis: AXIS_NAMES.includes(activeAxis) ? activeAxis : null,
    axisLines,
    planeCorners,
    ringPoints,
    axisRings,
    worldLength: length
  };
}
