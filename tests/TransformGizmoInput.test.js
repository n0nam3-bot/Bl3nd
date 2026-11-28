import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransformGizmoDrag, resolveTransformGizmoHandle } from '../src/core/TransformGizmoInput.js';

test('axis handles accept only the three canonical axes', () => {
  for (const axis of ['x', 'y', 'z']) {
    assert.deepEqual(resolveTransformGizmoHandle({ dataset: { gizmoHandle: 'axis', axis } }), { kind: 'axis', axis });
  }
  for (const axis of ['', 'w', 'X-invalid', null]) {
    assert.equal(resolveTransformGizmoHandle({ dataset: { gizmoHandle: 'axis', axis } }), null);
  }
});

test('center handle resolves to the unconstrained transform action', () => {
  assert.deepEqual(resolveTransformGizmoHandle({ dataset: { gizmoHandle: 'free' } }), { kind: 'free' });
});

test('unrelated SVG elements cannot start a gizmo transform', () => {
  assert.equal(resolveTransformGizmoHandle(null), null);
  assert.equal(resolveTransformGizmoHandle({ dataset: {} }), null);
  assert.equal(resolveTransformGizmoHandle({ dataset: { gizmoHandle: 'plane', axis: 'z' } }), null);
});

test('gizmo movement ignores sub-threshold pointer jitter', () => {
  assert.equal(isTransformGizmoDrag({ x: 10, y: 10 }, { x: 12, y: 11 }, 3), false);
  assert.equal(isTransformGizmoDrag({ x: 10, y: 10 }, { x: 13, y: 10 }, 3), true);
});

test('gizmo movement uses radial distance in any direction', () => {
  assert.equal(isTransformGizmoDrag({ x: 0, y: 0 }, { x: -2.2, y: 2.2 }, 3), true);
  assert.equal(isTransformGizmoDrag({ x: 0, y: 0 }, { x: -1, y: -1 }, 3), false);
});

test('invalid pointer positions or thresholds do not count as drags', () => {
  assert.equal(isTransformGizmoDrag({ x: NaN, y: 0 }, { x: 10, y: 10 }), false);
  assert.equal(isTransformGizmoDrag({ x: 0, y: 0 }, { x: 10, y: Infinity }), false);
  assert.equal(isTransformGizmoDrag({ x: 0, y: 0 }, { x: 10, y: 10 }, -1), false);
});
