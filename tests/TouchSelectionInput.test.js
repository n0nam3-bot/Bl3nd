import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldMarkTouchSelectionAdditive } from '../src/core/TouchSelectionInput.js';

const objectMode = {
  pointerType: 'touch',
  editMode: false,
  objectAddModeEnabled: true,
  selectionTool: 'tap'
};

test('Object Mode Multi decorates only the tap-selection pointerup phase', () => {
  assert.equal(shouldMarkTouchSelectionAdditive({ ...objectMode, eventType: 'pointerdown' }), false);
  assert.equal(shouldMarkTouchSelectionAdditive({ ...objectMode, eventType: 'pointerup' }), true);
});

test('Object Mode taps remain replace-selection when Multi is off', () => {
  assert.equal(shouldMarkTouchSelectionAdditive({
    ...objectMode, objectAddModeEnabled: false, eventType: 'pointerup'
  }), false);
});

test('Edit Mode tap selection continues to use the Edit additive toggle', () => {
  assert.equal(shouldMarkTouchSelectionAdditive({
    pointerType: 'touch', editMode: true, editAddModeEnabled: true,
    objectAddModeEnabled: false, selectionTool: 'tap', eventType: 'pointerup'
  }), true);
  assert.equal(shouldMarkTouchSelectionAdditive({
    pointerType: 'touch', editMode: true, editAddModeEnabled: false,
    objectAddModeEnabled: true, selectionTool: 'tap', eventType: 'pointerup'
  }), false);
});

test('Edit Mode box, circle and lasso gestures decorate pointerdown, not pointerup', () => {
  const input = {
    pointerType: 'touch', editMode: true, editAddModeEnabled: true,
    objectAddModeEnabled: false, selectionTool: 'lasso'
  };
  assert.equal(shouldMarkTouchSelectionAdditive({ ...input, eventType: 'pointerdown' }), true);
  assert.equal(shouldMarkTouchSelectionAdditive({ ...input, eventType: 'pointerup' }), false);
});

test('mouse Shift selection is left to the native keyboard modifier path', () => {
  assert.equal(shouldMarkTouchSelectionAdditive({
    ...objectMode, pointerType: 'mouse', eventType: 'pointerup'
  }), false);
});

test('native Shift is not overwritten or redundantly decorated', () => {
  assert.equal(shouldMarkTouchSelectionAdditive({
    ...objectMode, shiftKey: true, eventType: 'pointerup'
  }), false);
});

test('modal operations never receive touch additive-selection decoration', () => {
  assert.equal(shouldMarkTouchSelectionAdditive({
    ...objectMode, modalOperationActive: true, eventType: 'pointerup'
  }), false);
});
