export const DEFAULT_MOVE_SNAP_SETTINGS = Object.freeze({
  enabled: false,
  globalStep: 1,
  localStep: 1
});

const MIN_STEP = 0.000001;
const MAX_STEP = 1000000;

function positiveStep(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(MAX_STEP, Math.max(MIN_STEP, number))
    : fallback;
}

/** Normalize browser-persisted or UI-provided Move snapping preferences. */
export function normalizeMoveSnapSettings(settings = {}, fallback = DEFAULT_MOVE_SNAP_SETTINGS) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return {
    enabled: source.enabled === undefined ? Boolean(fallback.enabled) : source.enabled === true,
    globalStep: positiveStep(source.globalStep, positiveStep(fallback.globalStep, 1)),
    localStep: positiveStep(source.localStep, positiveStep(fallback.localStep, 1))
  };
}

/** Return the step used by the currently selected Global or Local basis. */
export function getMoveSnapStep(settings, orientation = 'global') {
  const normalized = normalizeMoveSnapSettings(settings);
  return orientation === 'local' ? normalized.localStep : normalized.globalStep;
}

/**
 * Quantize a signed axis displacement to its nearest configured increment.
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

/** Apply snapping only to pointer-driven axis movement; typed values stay exact. */
export function resolveMoveSnapAmount(amount, settings, orientation = 'global', numericInput = false) {
  const normalized = normalizeMoveSnapSettings(settings);
  if (!normalized.enabled || numericInput) return amount;
  return snapMoveAmount(amount, orientation === 'local' ? normalized.localStep : normalized.globalStep);
}
