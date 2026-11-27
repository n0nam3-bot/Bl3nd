const AXES = Object.freeze({
  x: Object.freeze([1, 0, 0]),
  y: Object.freeze([0, 1, 0]),
  z: Object.freeze([0, 0, 1])
});

/**
 * Resolve one transform axis in world space.
 * Three.js quaternions use [x, y, z, w] ordering. The helper is deliberately
 * dependency-free so its orientation math can be regression-tested in Node.
 */
export function resolveTransformAxis(axisName, orientation = 'global', quaternion = [0, 0, 0, 1]) {
  const source = AXES[axisName];
  if (!source) return null;
  if (orientation !== 'local') return [...source];

  let [x, y, z, w] = Array.isArray(quaternion) && quaternion.length >= 4
    ? quaternion.slice(0, 4).map(Number)
    : [0, 0, 0, 1];
  if (![x, y, z, w].every(Number.isFinite)) [x, y, z, w] = [0, 0, 0, 1];
  const length = Math.hypot(x, y, z, w);
  if (length <= 1e-12) [x, y, z, w] = [0, 0, 0, 1];
  else { x /= length; y /= length; z /= length; w /= length; }

  const [vx, vy, vz] = source;
  // q * v * q^-1, using the optimized unit-quaternion vector form.
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  const result = [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx)
  ];
  const resultLength = Math.hypot(...result);
  return resultLength > 1e-12 ? result.map(value => value / resultLength) : [...source];
}
