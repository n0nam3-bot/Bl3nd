const AXES = new Set(['x', 'y', 'z']);

/** Convert SVG data attributes into a safe transform-gizmo action. */
export function resolveTransformGizmoHandle(target) {
  const kind = String(target?.dataset?.gizmoHandle || '');
  if (kind === 'free') return { kind: 'free' };
  if (kind === 'axis') {
    const axis = String(target?.dataset?.axis || '').toLowerCase();
    return AXES.has(axis) ? { kind: 'axis', axis } : null;
  }
  return null;
}

/**
 * Keep the full-size SVG overlay transparent to ordinary viewport gestures.
 * Only explicit gizmo handles may receive pointer input.
 */
export function resolveTransformGuidePointerEvents(target) {
  const handle = resolveTransformGizmoHandle(target);
  if (!handle) return 'none';
  return handle.kind === 'free' ? 'all' : 'stroke';
}

/** Ignore pointer jitter; only a real drag should auto-apply a gizmo transform. */
export function isTransformGizmoDrag(start, current, threshold = 3) {
  const sx = Number(start?.x), sy = Number(start?.y);
  const cx = Number(current?.x), cy = Number(current?.y);
  const limit = Number(threshold);
  if (![sx, sy, cx, cy, limit].every(Number.isFinite) || limit < 0) return false;
  return Math.hypot(cx - sx, cy - sy) >= limit;
}
