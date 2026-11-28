const MIN_FOV_DEGREES = 1;
const MAX_FOV_DEGREES = 179;
const EPSILON = 1e-10;

function finitePositive(value) {
  return Number.isFinite(value) && value > EPSILON;
}

/** Visible vertical world-space span at the target plane of a perspective camera. */
export function perspectiveViewHeight(distance, fovDegrees = 48, zoom = 1) {
  if (!finitePositive(distance) || !finitePositive(zoom) || !Number.isFinite(fovDegrees) ||
      fovDegrees <= MIN_FOV_DEGREES || fovDegrees >= MAX_FOV_DEGREES) return null;
  return 2 * distance * Math.tan(fovDegrees * Math.PI / 360) / zoom;
}

/** Perspective camera distance that produces a requested target-plane view height. */
export function perspectiveDistanceForViewHeight(viewHeight, fovDegrees = 48, zoom = 1) {
  if (!finitePositive(viewHeight) || !finitePositive(zoom) || !Number.isFinite(fovDegrees) ||
      fovDegrees <= MIN_FOV_DEGREES || fovDegrees >= MAX_FOV_DEGREES) return null;
  return viewHeight * zoom / (2 * Math.tan(fovDegrees * Math.PI / 360));
}

/** Orthographic frustum bounds for a vertical span and viewport aspect ratio. */
export function orthographicFrustum(viewHeight, aspect = 1) {
  if (!finitePositive(viewHeight) || !finitePositive(aspect)) return null;
  const halfHeight = viewHeight / 2;
  const halfWidth = halfHeight * aspect;
  return {
    left: -halfWidth,
    right: halfWidth,
    top: halfHeight,
    bottom: -halfHeight
  };
}

/** Current visible vertical span of an orthographic camera, including zoom. */
export function orthographicViewHeight(top, bottom, zoom = 1) {
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || top <= bottom || !finitePositive(zoom)) return null;
  return (top - bottom) / zoom;
}


/** World-space movement represented by one screen pixel at the pivot depth. */
export function cameraUnitsPerPixel({
  projection = 'perspective',
  distance = 1,
  fovDegrees = 48,
  top = 1,
  bottom = -1,
  zoom = 1,
  pixelHeight = 1
} = {}) {
  if (!finitePositive(pixelHeight)) return null;
  const viewHeight = projection === 'orthographic'
    ? orthographicViewHeight(top, bottom, zoom)
    : perspectiveViewHeight(distance, fovDegrees, zoom);
  return finitePositive(viewHeight) ? viewHeight / pixelHeight : null;
}
