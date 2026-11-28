/**
 * Return a reordered copy of a modifier list. The source list and its modifier
 * records are never mutated; callers commit the returned array only after the
 * complete worker stack has evaluated successfully.
 */
export function reorderModifier(modifiers, modifierId, direction) {
  if (!Array.isArray(modifiers) || !['up', 'down'].includes(direction)) return null;
  const matches = [];
  modifiers.forEach((modifier, index) => {
    if (modifier?.id === modifierId) matches.push(index);
  });
  if (matches.length !== 1) return null;

  const fromIndex = matches[0];
  const toIndex = fromIndex + (direction === 'up' ? -1 : 1);
  if (toIndex < 0 || toIndex >= modifiers.length) return null;

  const nextModifiers = [...modifiers];
  [nextModifiers[fromIndex], nextModifiers[toIndex]] = [nextModifiers[toIndex], nextModifiers[fromIndex]];
  return { modifiers: nextModifiers, fromIndex, toIndex };
}

/** Build a renderer-independent summary for the stack diagnostics UI. */
export function summarizeModifierStack(modifiers) {
  const items = Array.isArray(modifiers) ? modifiers : [];
  const enabledCount = items.filter(modifier => modifier?.enabled !== false).length;
  const order = items.map((modifier, index) => ({
    id: modifier?.id ?? null,
    type: String(modifier?.type || 'unknown'),
    position: index + 1,
    enabled: modifier?.enabled !== false
  }));
  return {
    totalCount: items.length,
    enabledCount,
    disabledCount: items.length - enabledCount,
    order
  };
}

/**
 * Temporarily reorder and evaluate a mesh's full modifier stack. Any worker
 * failure or AbortError restores the exact prior array reference, allowing the
 * previous evaluated geometry to remain paired with the last accepted order.
 */
export async function reorderModifierAndEvaluate(mesh, modifierId, direction, evaluate) {
  if (!mesh?.userData || typeof evaluate !== 'function') return false;
  const previousModifiers = mesh.userData.modifiers;
  const reordered = reorderModifier(previousModifiers, modifierId, direction);
  if (!reordered) return false;

  mesh.userData.modifiers = reordered.modifiers;
  try {
    await evaluate(mesh);
  } catch (error) {
    mesh.userData.modifiers = previousModifiers;
    throw error;
  }
  return reordered;
}
