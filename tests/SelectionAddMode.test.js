import test from 'node:test';
import assert from 'node:assert/strict';
import { SelectionAddMode } from '../src/core/SelectionAddMode.js';

test('additive selection is disabled by default and can be toggled', () => {
  const mode = new SelectionAddMode();
  assert.equal(mode.enabled, false);
  assert.equal(mode.shouldAdd(), false);
  assert.equal(mode.toggle(), true);
  assert.equal(mode.shouldAdd(), true);
  assert.equal(mode.toggle(), false);
  assert.equal(mode.shouldAdd(), false);
});

test('keyboard Shift remains additive when the touch toggle is off', () => {
  const mode = new SelectionAddMode();
  assert.equal(mode.shouldAdd({ shiftKey: true }), true);
  assert.equal(mode.shouldAdd({ shiftKey: false }), false);
});

test('explicit state changes and reset are normalized', () => {
  const mode = new SelectionAddMode(true);
  assert.equal(mode.setEnabled(0), false);
  assert.equal(mode.setEnabled('yes'), true);
  assert.equal(mode.reset(), false);
  assert.equal(mode.enabled, false);
});
