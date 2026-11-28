/** Browser-local memory for the last selected transform tool. */
export const TRANSFORM_TOOL_STORAGE_KEY = 'bl3nd-transform-tool-v1';

const VALID_TOOLS = new Set(['select', 'move', 'rotate', 'scale']);

export function normalizeTransformToolSelection(value) {
  return VALID_TOOLS.has(value) ? value : 'select';
}

/** Read the camel-cased dataset property created by data-transform-tool. */
export function getTransformToolFromDataset(dataset = null) {
  const value = dataset?.transformTool;
  return VALID_TOOLS.has(value) ? value : null;
}

export function loadTransformToolSelection(storage = null) {
  try {
    const target = storage || globalThis.localStorage;
    return normalizeTransformToolSelection(target?.getItem(TRANSFORM_TOOL_STORAGE_KEY));
  } catch {
    // Private browsing / embedded browsers may deny storage access. The app
    // still works with the default Select tool for the current page session.
    return 'select';
  }
}

export function saveTransformToolSelection(value, storage = null) {
  const tool = normalizeTransformToolSelection(value);
  try {
    const target = storage || globalThis.localStorage;
    target?.setItem(TRANSFORM_TOOL_STORAGE_KEY, tool);
  } catch {
    // Keep the in-memory selection even when browser storage is unavailable.
  }
  return tool;
}
