export const DEFAULT_TRANSFORM_SNAP_SETTINGS = Object.freeze({
  enabled: false,
  globalStep: 1,
  localStep: 1,
  globalRotationStep: 15,
  localRotationStep: 15,
  globalScaleStep: 0.1,
  localScaleStep: 0.1
});

// Backward-compatible name retained for existing Move-snap callers.
export const DEFAULT_MOVE_SNAP_SETTINGS = DEFAULT_TRANSFORM_SNAP_SETTINGS;

const MIN_STEP = 0.000001;
const MAX_STEP = 1000000;

function positiveStep(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(MAX_STEP, Math.max(MIN_STEP, number))
    : fallback;
}

/** Normalize persisted or UI-provided Global/Local G/R/S snap preferences. */
export function normalizeTransformSnapSettings(settings = {}, fallback = DEFAULT_TRANSFORM_SNAP_SETTINGS) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const defaults = fallback && typeof fallback === 'object' ? fallback : DEFAULT_TRANSFORM_SNAP_SETTINGS;
  return {
    enabled: source.enabled === undefined ? Boolean(defaults.enabled) : source.enabled === true,
    globalStep: positiveStep(source.globalStep, positiveStep(defaults.globalStep, 1)),
    localStep: positiveStep(source.localStep, positiveStep(defaults.localStep, 1)),
    globalRotationStep: positiveStep(source.globalRotationStep, positiveStep(defaults.globalRotationStep, 15)),
    localRotationStep: positiveStep(source.localRotationStep, positiveStep(defaults.localRotationStep, 15)),
    globalScaleStep: positiveStep(source.globalScaleStep, positiveStep(defaults.globalScaleStep, 0.1)),
    localScaleStep: positiveStep(source.localScaleStep, positiveStep(defaults.localScaleStep, 0.1))
  };
}

// Existing Move-specific API stays available while the preference model expands.
export const normalizeMoveSnapSettings = normalizeTransformSnapSettings;

const SETTING_KEYS = Object.freeze({
  move: Object.freeze({ global: 'globalStep', local: 'localStep' }),
  rotate: Object.freeze({ global: 'globalRotationStep', local: 'localRotationStep' }),
  scale: Object.freeze({ global: 'globalScaleStep', local: 'localScaleStep' })
});

/** Return the pair of preference keys for one transform type. */
export function getTransformSnapSettingKeys(type = 'move') {
  return SETTING_KEYS[type] || SETTING_KEYS.move;
}

/** Return the step used by the currently selected Global or Local transform basis. */
export function getTransformSnapStep(settings, type = 'move', orientation = 'global') {
  const normalized = normalizeTransformSnapSettings(settings);
  const keys = getTransformSnapSettingKeys(type);
  return normalized[orientation === 'local' ? keys.local : keys.global];
}

export function getMoveSnapStep(settings, orientation = 'global') {
  return getTransformSnapStep(settings, 'move', orientation);
}

/**
 * Quantize a signed amount to its nearest configured increment.
 * Ties round away from zero and the returned value is cleaned of float noise.
 */
export function snapMoveAmount(amount, step) {
  const value = Number(amount);
  const increment = positiveStep(step, NaN);
  if (!Number.isFinite(value) || !Number.isFinite(increment)) return value;
  if (Math.abs(value) < MIN_STEP * 0.5) return 0;
  const intervals = Math.round(Math.abs(value) / increment + Number.EPSILON * Math.max(1, Math.abs(value / increment)) * 4);
  const snapped = Math.sign(value) * intervals * increment;
  return Number(snapped.toPrecision(12));
}

/** Apply snapping only to pointer-driven axis Move; typed values remain exact. */
export function resolveMoveSnapAmount(amount, settings, orientation = 'global', numericInput = false) {
  const normalized = normalizeTransformSnapSettings(settings);
  if (!normalized.enabled || numericInput) return amount;
  return snapMoveAmount(amount, getTransformSnapStep(normalized, 'move', orientation));
}

/** Snap pointer-driven constrained rotation in degrees; numeric input stays exact. */
export function resolveRotateSnapDegrees(degrees, settings, orientation = 'global', numericInput = false) {
  const normalized = normalizeTransformSnapSettings(settings);
  if (!normalized.enabled || numericInput) return degrees;
  return snapMoveAmount(degrees, getTransformSnapStep(normalized, 'rotate', orientation));
}

/**
 * Snap pointer-driven scale relative to the neutral factor 1.0. A 0.1 step
 * therefore yields 0.9, 1.0, 1.1, 1.2, etc., never crossing through zero.
 */
export function resolveScaleSnapFactor(factor, settings, orientation = 'global', numericInput = false) {
  const value = Number(factor);
  if (!Number.isFinite(value)) return value;
  const normalized = normalizeTransformSnapSettings(settings);
  if (!normalized.enabled || numericInput) return value;
  const step = getTransformSnapStep(normalized, 'scale', orientation);
  const snapped = 1 + snapMoveAmount(value - 1, step);
  return Number(Math.min(1000, Math.max(0.001, snapped)).toPrecision(12));
}
