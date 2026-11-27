const DEFAULT_PRECISION = 3;

function safeVector(vector) {
  if (!Array.isArray(vector) || vector.length < 3) return [0, 0, 0];
  const result = vector.slice(0, 3).map(Number);
  return result.every(Number.isFinite) ? result : [0, 0, 0];
}

function signed(value, precision) {
  const tolerance = 0.5 * (10 ** -precision);
  const rounded = Math.abs(value) < tolerance ? 0 : value;
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded).toFixed(precision)}`;
}

/**
 * Build stable, world-space feedback for a live Move preview.
 * `amount` is signed along a constrained axis, or the positive displacement
 * magnitude for free/plane movement. `target` is the moved object origin or
 * edit pivot after applying the preview delta.
 */
export function buildMoveReadout({
  delta = [0, 0, 0],
  startPosition = [0, 0, 0],
  axisVector = null,
  precision = DEFAULT_PRECISION,
  targetLabel = 'TO'
} = {}) {
  const movement = safeVector(delta);
  const origin = safeVector(startPosition);
  const target = origin.map((value, index) => value + movement[index]);
  const magnitude = Math.hypot(...movement);

  let amount = magnitude;
  let positionAxis = null;
  let positionValue = null;
  if (axisVector) {
    const axis = safeVector(axisVector);
    const axisLength = Math.hypot(...axis);
    if (axisLength > 1e-12) {
      amount = movement.reduce((sum, value, index) => sum + value * axis[index] / axisLength, 0);
      const dominantComponent = axis.reduce((best, value, index) =>
        Math.abs(value) > Math.abs(axis[best]) ? index : best, 0);
      positionAxis = 'XYZ'[dominantComponent];
      positionValue = signed(target[dominantComponent], precision);
    }
  }

  const formatVector = (label, vector) => `${label} ${vector.map((value, index) => `${'XYZ'[index]} ${signed(value, precision)}`).join('  ')}`;
  return {
    amount,
    magnitude,
    value: signed(amount, precision),
    positionAxis,
    positionValue,
    delta: movement,
    target,
    deltaText: formatVector('Δ', movement),
    targetText: formatVector(targetLabel, target)
  };
}
