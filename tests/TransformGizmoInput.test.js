import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransformGizmoDrag, isTransformPointerOwner, resolveTransformGizmoHandle, resolveTransformGuidePointerEvents } from '../src/core/TransformGizmoInput.js';

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

test('the full-size SVG guide passes blank-area pointer input through to the viewport', () => {
  assert.equal(resolveTransformGuidePointerEvents({ dataset: {} }), 'none');
  assert.equal(resolveTransformGuidePointerEvents({ dataset: { label: 'axis badge' } }), 'none');
});

test('only explicit gizmo handles remain pointer targets above the canvas', () => {
  for (const axis of ['x', 'y', 'z']) {
    assert.equal(resolveTransformGuidePointerEvents({ dataset: { gizmoHandle: 'axis', axis, gizmoHit: '' } }), 'stroke');
  }
  assert.equal(resolveTransformGuidePointerEvents({ dataset: { gizmoHandle: 'free', gizmoHit: '' } }), 'all');
  assert.equal(resolveTransformGuidePointerEvents({ dataset: { gizmoHandle: 'axis', axis: 'w', gizmoHit: '' } }), 'none');
});


test('modal viewport drags remain owned by their initiating pointer ID', () => {
  assert.equal(isTransformPointerOwner(7, { pointerId: 7 }), true);
  // The same pointer remains valid when a browser retargets the event to SVG/UI.
  assert.equal(isTransformPointerOwner(7, { pointerId: 7, target: { id: 'transform-guide' } }), true);
  assert.equal(isTransformPointerOwner(7, { pointerId: 8 }), false);
  assert.equal(isTransformPointerOwner(0, { pointerId: 0 }), true);
  assert.equal(isTransformPointerOwner(null, { pointerId: 0 }), false);
  assert.equal(isTransformPointerOwner(7, {}), false);
});

test('plane handles resolve only XY, YZ and XZ to their perpendicular constraint axes', () => {
  assert.deepEqual(resolveTransformGizmoHandle({ dataset: { gizmoHandle: 'plane', plane: 'xy' } }), { kind: 'plane', plane: 'xy', axis: 'z' });
  assert.deepEqual(resolveTransformGizmoHandle({ dataset: { gizmoHandle: 'plane', plane: 'yz' } }), { kind: 'plane', plane: 'yz', axis: 'x' });
  assert.deepEqual(resolveTransformGizmoHandle({ dataset: { gizmoHandle: 'plane', plane: 'xz' } }), { kind: 'plane', plane: 'xz', axis: 'y' });
  for (const plane of ['', 'xx', 'zyx', null]) {
    assert.equal(resolveTransformGizmoHandle({ dataset: { gizmoHandle: 'plane', plane } }), null);
  }
});

test('plane squares remain interactive pointer targets above the transparent SVG guide', () => {
  assert.equal(resolveTransformGuidePointerEvents({ dataset: { gizmoHandle: 'plane', plane: 'xy' } }), 'all');
});
