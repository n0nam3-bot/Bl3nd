/**
 * Resolve Object Mode selection without mutating the scene document.
 * The active object is always part of a non-empty selection. Additive toggles
 * preserve selection order and fall back to the most recently retained object
 * when the active object is removed.
 */
export function resolveObjectSelection({
  objects = [],
  selectedObjects = [],
  activeObject = null,
  mesh = null,
  additive = false,
  toggle = false
} = {}) {
  const validObjects = new Set(objects);
  const current = [...new Set(selectedObjects)].filter(object => validObjects.has(object));
  const activeIsValid = validObjects.has(activeObject) && current.includes(activeObject);
  const currentActive = activeIsValid ? activeObject : current.at(-1) || null;

  if (!additive) {
    const selected = mesh && validObjects.has(mesh) ? [mesh] : [];
    return { selectedObjects: selected, activeObject: selected[0] || null };
  }

  if (!mesh || !validObjects.has(mesh)) {
    return { selectedObjects: current, activeObject: currentActive };
  }

  const selected = [...current];
  const index = selected.indexOf(mesh);
  if (toggle && index >= 0) selected.splice(index, 1);
  else if (index < 0) selected.push(mesh);

  const isStillSelected = selected.includes(mesh);
  const nextActive = isStillSelected ? mesh :
    (selected.includes(currentActive) ? currentActive : selected.at(-1) || null);
  return { selectedObjects: selected, activeObject: nextActive };
}


/**
 * Restore the active and selected objects from a scene snapshot. Snapshots
 * written before selectedIndices existed retain the historical active/last
 * object fallback; a present but empty selectedIndices array is authoritative
 * and must preserve an intentionally empty Object Mode selection.
 */
export function resolveRestoredObjectSelection({
  objects = [],
  selectedIndices,
  activeIndex = -1
} = {}) {
  const hasStoredSelection = Array.isArray(selectedIndices);
  const selected = hasStoredSelection
    ? [...new Set(selectedIndices.filter(index => Number.isInteger(index) && index >= 0 && index < objects.length))]
        .map(index => objects[index])
    : [];
  const storedActive = Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < objects.length
    ? objects[activeIndex]
    : null;
  const activeObject = storedActive || selected.at(-1) || (!hasStoredSelection ? objects.at(-1) || null : null);
  if (activeObject && !selected.includes(activeObject)) selected.push(activeObject);
  return { selectedObjects: selected, activeObject };
}
