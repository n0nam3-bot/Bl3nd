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


/** Count the lightweight indexed geometry shape used at a worker-stage boundary. */
export function getModifierGeometryCounts(geometry) {
  const positionLength = Number(geometry?.positions?.length) || 0;
  const indexLength = Number(geometry?.indices?.length) || 0;
  return {
    vertices: Math.floor(Math.max(0, positionLength) / 3),
    triangles: Math.floor(Math.max(0, indexLength) / 3)
  };
}

function displayNumber(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Number(number.toPrecision(digits)).toString();
}

/** Return a compact, safe-to-display snapshot of the modifier's accepted settings. */
export function describeModifierSettings(modifier) {
  if (!modifier || typeof modifier !== 'object') return 'Settings unavailable';
  if (modifier.type === 'subdivision') return `Level ${Math.max(1, Math.min(3, Math.round(Number(modifier.level) || 1)))}`;
  if (modifier.type === 'mirror') {
    const axis = ['x', 'y', 'z'].includes(String(modifier.axis).toLowerCase()) ? String(modifier.axis).toUpperCase() : 'X';
    return `Axis ${axis} · Merge ${displayNumber(modifier.mergeDistance ?? 0.001)}`;
  }
  if (modifier.type === 'array') {
    const count = Math.max(1, Math.min(20, Math.round(Number(modifier.count) || 2)));
    const rawOffset = Array.isArray(modifier.offset) ? modifier.offset : [2, 0, 0];
    const offset = [0, 1, 2].map(index => displayNumber(rawOffset[index] ?? 0)).join(', ');
    return `${count} copies · Offset (${offset})`;
  }
  if (modifier.type === 'solidify') {
    const offset = Number(modifier.offset);
    const position = offset === 0 ? 'Center' : offset === 1 ? 'Outside' : 'Inside';
    return `Thickness ${displayNumber(modifier.thickness ?? 0.08)} · ${position}`;
  }
  return 'No stage settings available';
}

/** Build a renderer-independent record; no intermediate geometry buffers are retained. */
export function createModifierStageDiagnostic({ modifier, stageIndex, inputCounts, outputCounts, elapsedMs }) {
  const input = {
    vertices: Math.max(0, Math.floor(Number(inputCounts?.vertices) || 0)),
    triangles: Math.max(0, Math.floor(Number(inputCounts?.triangles) || 0))
  };
  const output = {
    vertices: Math.max(0, Math.floor(Number(outputCounts?.vertices) || 0)),
    triangles: Math.max(0, Math.floor(Number(outputCounts?.triangles) || 0))
  };
  const enabled = modifier?.enabled !== false;
  const safeStageIndex = Number.isInteger(stageIndex) && stageIndex >= 0 ? stageIndex : 0;
  const duration = Number(elapsedMs);
  return {
    modifierId: typeof modifier?.id === 'string' ? modifier.id : null,
    modifierType: String(modifier?.type || 'unknown'),
    stageIndex: safeStageIndex,
    position: safeStageIndex + 1,
    enabled,
    state: enabled ? 'complete' : 'bypassed',
    input,
    output,
    delta: {
      vertices: output.vertices - input.vertices,
      triangles: output.triangles - input.triangles
    },
    elapsedMs: Number.isFinite(duration) ? Math.round(Math.max(0, duration) * 10) / 10 : 0,
    settings: describeModifierSettings(modifier)
  };
}

/** Clone diagnostic records without sharing nested mutable objects with the caller. */
export function copyModifierStageDiagnostics(records) {
  return (Array.isArray(records) ? records : []).map(record => ({
    ...record,
    input: { ...(record?.input || {}) },
    output: { ...(record?.output || {}) },
    delta: { ...(record?.delta || {}) }
  }));
}
