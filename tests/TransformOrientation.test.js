import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTransformAxis } from '../src/core/TransformOrientation.js';

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const normalize = value => {
  const length = Math.hypot(...value);
  return value.map(component => component / length);
};
const closeVector = (actual, expected, epsilon = 1e-10) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= epsilon,
    `component ${index}: expected ${expected[index]}, got ${value}`));
};

test('Global orientation keeps X/Y/Z aligned to world axes regardless of object rotation', () => {
  const qZ90 = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  closeVector(resolveTransformAxis('x', 'global', qZ90), [1, 0, 0]);
  closeVector(resolveTransformAxis('y', 'global', qZ90), [0, 1, 0]);
  closeVector(resolveTransformAxis('z', 'global', qZ90), [0, 0, 1]);
});

test('Local orientation rotates constrained axes with the object starting quaternion', () => {
  const qZ90 = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  closeVector(resolveTransformAxis('x', 'local', qZ90), [0, 1, 0]);
  closeVector(resolveTransformAxis('y', 'local', qZ90), [-1, 0, 0]);
  closeVector(resolveTransformAxis('z', 'local', qZ90), [0, 0, 1]);
});

test('Local orientation produces a normalized orthogonal world-space basis for arbitrary rotation', () => {
  const q = normalize([0.23, -0.41, 0.17, 0.86]);
  const axes = ['x', 'y', 'z'].map(axis => resolveTransformAxis(axis, 'local', q));
  for (const axis of axes) assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-10);
  assert.ok(Math.abs(dot(axes[0], axes[1])) < 1e-10);
  assert.ok(Math.abs(dot(axes[1], axes[2])) < 1e-10);
  assert.ok(Math.abs(dot(axes[2], axes[0])) < 1e-10);
});

test('Invalid quaternion data safely falls back to identity and unknown axes are rejected', () => {
  closeVector(resolveTransformAxis('y', 'local', [NaN, 0, 0, 0]), [0, 1, 0]);
  closeVector(resolveTransformAxis('z', 'local', [0, 0, 0, 0]), [0, 0, 1]);
  assert.equal(resolveTransformAxis('q', 'local'), null);
});
