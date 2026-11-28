/**
 * Decide whether a touch pointer phase should reuse the existing Shift-aware
 * selection path. Tap picking consumes pointerup; box/circle/lasso capture
 * pointerdown. Object Mode has only tap picking, while Edit Mode can use both.
 */
export function shouldMarkTouchSelectionAdditive({
  pointerType = '',
  modalOperationActive = false,
  editMode = false,
  objectAddModeEnabled = false,
  editAddModeEnabled = false,
  selectionTool = 'tap',
  eventType = 'pointerup',
  shiftKey = false
} = {}) {
  if (pointerType === 'mouse' || modalOperationActive || shiftKey) return false;

  const enabled = editMode ? editAddModeEnabled : objectAddModeEnabled;
  if (!enabled) return false;

  const selectionPhase = !editMode || selectionTool === 'tap'
    ? 'pointerup'
    : 'pointerdown';
  return eventType === selectionPhase;
}
