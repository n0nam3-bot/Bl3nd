const EPSILON = 1e-10;
const WORLD_UP = [0, 0, 1];
export const VIEW_ORBIT_STEP_DEGREES = 15;

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}
function normalize(vector) {
  const length = Math.hypot(...vector);
  return length > EPSILON ? vector.map(value => value / length) : null;
}
function rotateAroundAxis(vector, axis, angle) {
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const perpendicular = cross(axis, vector);
  const parallelScale = dot(axis, vector) * (1 - cosine);
  return vector.map((value, index) =>
    value * cosine + perpendicular[index] * sine + axis[index] * parallelScale
  );
}

/**
 * Resolve the supported Blender-inspired numpad navigation keys.
 * Ctrl/Meta + 1/3/7 select the opposite cardinal direction; 5 toggles
 * perspective/orthographic projection.
 */
export function resolveNumpadShortcut(code, { ctrlKey = false, metaKey = false, altKey = false } = {}) {
  const opposite = Boolean(ctrlKey || metaKey);
  const views = {
    Numpad1: opposite ? 'back' : 'front',
    Numpad3: opposite ? 'left' : 'right',
    Numpad7: opposite ? 'bottom' : 'top'
  };
  if (views[code]) return { action: 'view', view: views[code] };
  const orbit = {
    Numpad2: { horizontalSteps: 0, verticalSteps: 1 },
    Numpad4: { horizontalSteps: 1, verticalSteps: 0 },
    Numpad6: { horizontalSteps: -1, verticalSteps: 0 },
    Numpad8: { horizontalSteps: 0, verticalSteps: -1 },
    Numpad9: { horizontalSteps: 12, verticalSteps: 0 }
  };
  if (orbit[code]) return { action: 'orbit', ...orbit[code] };
  if (code === 'NumpadDecimal') return { action: 'frame-selection' };
  if (code === 'Numpad5' && !ctrlKey && !metaKey && !altKey) return { action: 'toggle-projection' };
  return null;
}

/**
 * Rotate a camera offset around world Z and its current screen-right axis.
 * The returned vector preserves distance and clamps away from exact poles so
 * repeated numpad steps cannot flip the camera or create a singular up vector.
 */
export function rotateViewUpByHorizontalSteps(cameraUp = WORLD_UP, horizontalSteps = 0, stepDegrees = VIEW_ORBIT_STEP_DEGREES) {
  if (!Array.isArray(cameraUp) || cameraUp.length < 3 || !cameraUp.slice(0, 3).every(Number.isFinite) ||
      !Number.isFinite(horizontalSteps) || !Number.isFinite(stepDegrees) || stepDegrees <= 0) return null;
  return rotateAroundAxis(cameraUp.slice(0, 3), WORLD_UP, horizontalSteps * stepDegrees * Math.PI / 180);
}

export function orbitOffsetBySteps(
  offset,
  cameraUp = WORLD_UP,
  horizontalSteps = 0,
  verticalSteps = 0,
  stepDegrees = 15
) {
  if (!Array.isArray(offset) || offset.length < 3 || !offset.slice(0, 3).every(Number.isFinite) ||
      !Array.isArray(cameraUp) || cameraUp.length < 3 || !cameraUp.slice(0, 3).every(Number.isFinite) ||
      !Number.isFinite(horizontalSteps) || !Number.isFinite(verticalSteps) ||
      !Number.isFinite(stepDegrees) || stepDegrees <= 0) return null;

  const source = offset.slice(0, 3);
  const distance = Math.hypot(...source);
  if (distance <= EPSILON) return null;
  const angle = stepDegrees * Math.PI / 180;
  const result = rotateAroundAxis(source, WORLD_UP, horizontalSteps * angle);
  let azimuth = normalize([result[0], result[1], 0]);
  if (!azimuth) {
    const preferred = cameraUp.slice(0, 2).map(value => -value);
    const fallbackLength = Math.hypot(...preferred);
    azimuth = fallbackLength > EPSILON ? [preferred[0] / fallbackLength, preferred[1] / fallbackLength, 0] : [0, -1, 0];
  }

  const direction = normalize(result);
  if (!direction) return null;
  const polar = Math.acos(Math.max(-1, Math.min(1, dot(direction, WORLD_UP))));
  const minPolar = Math.PI / 180;
  const maxPolar = Math.PI - minPolar;
  const nextPolar = Math.max(minPolar, Math.min(maxPolar, polar + verticalSteps * angle));
  const horizontalRadius = Math.sin(nextPolar) * distance;
  return [azimuth[0] * horizontalRadius, azimuth[1] * horizontalRadius, Math.cos(nextPolar) * distance];
}
