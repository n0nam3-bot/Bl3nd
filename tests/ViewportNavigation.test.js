import test from 'node:test';
import assert from 'node:assert/strict';
import { orbitOffsetBySteps, resolveNumpadShortcut, rotateViewUpByHorizontalSteps } from '../src/core/ViewportNavigation.js';

const length = vector => Math.hypot(...vector);
const polar = vector => Math.acos(Math.max(-1, Math.min(1, vector[2] / length(vector)))) * 180 / Math.PI;
const close = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('numpad cardinal views and Ctrl/Meta opposite views resolve consistently', () => {
  assert.deepEqual(resolveNumpadShortcut('Numpad1'), { action: 'view', view: 'front' });
  assert.deepEqual(resolveNumpadShortcut('Numpad1', { ctrlKey: true }), { action: 'view', view: 'back' });
  assert.deepEqual(resolveNumpadShortcut('Numpad3'), { action: 'view', view: 'right' });
  assert.deepEqual(resolveNumpadShortcut('Numpad3', { metaKey: true }), { action: 'view', view: 'left' });
  assert.deepEqual(resolveNumpadShortcut('Numpad7'), { action: 'view', view: 'top' });
  assert.deepEqual(resolveNumpadShortcut('Numpad7', { ctrlKey: true }), { action: 'view', view: 'bottom' });
});

test('numpad orbit directions, 180-degree opposite orbit and frame selection are explicit', () => {
  assert.deepEqual(resolveNumpadShortcut('Numpad2'), { action: 'orbit', horizontalSteps: 0, verticalSteps: 1 });
  assert.deepEqual(resolveNumpadShortcut('Numpad4'), { action: 'orbit', horizontalSteps: 1, verticalSteps: 0 });
  assert.deepEqual(resolveNumpadShortcut('Numpad6'), { action: 'orbit', horizontalSteps: -1, verticalSteps: 0 });
  assert.deepEqual(resolveNumpadShortcut('Numpad8'), { action: 'orbit', horizontalSteps: 0, verticalSteps: -1 });
  assert.deepEqual(resolveNumpadShortcut('Numpad9'), { action: 'orbit', horizontalSteps: 12, verticalSteps: 0 });
  assert.deepEqual(resolveNumpadShortcut('NumpadDecimal'), { action: 'frame-selection' });
  assert.deepEqual(resolveNumpadShortcut('Numpad5'), { action: 'toggle-projection' });
  assert.equal(resolveNumpadShortcut('Numpad5', { ctrlKey: true }), null);
  assert.equal(resolveNumpadShortcut('Numpad5', { metaKey: true }), null);
  assert.equal(resolveNumpadShortcut('Numpad5', { altKey: true }), null);
  assert.equal(resolveNumpadShortcut('Numpad0'), null);
  assert.equal(resolveNumpadShortcut('Digit1'), null);
});

test('horizontal numpad orbit rotates around world Z and preserves camera distance', () => {
  const source = [0, -10, 0];
  const left = orbitOffsetBySteps(source, [0, 0, 1], 1, 0);
  const right = orbitOffsetBySteps(source, [0, 0, 1], -1, 0);
  close(length(left), 10);
  close(length(right), 10);
  close(Math.atan2(left[0], -left[1]) * 180 / Math.PI, 15);
  close(Math.atan2(right[0], -right[1]) * 180 / Math.PI, -15);
});

test('vertical orbit changes polar angle by one 15-degree step', () => {
  const source = [0, -10, 0];
  const up = orbitOffsetBySteps(source, [0, 0, 1], 0, -1);
  const down = orbitOffsetBySteps(source, [0, 0, 1], 0, 1);
  close(polar(up), 75);
  close(polar(down), 105);
  close(length(up), 10);
  close(length(down), 10);
});

test('orbit from exact top/bottom views remains finite and avoids singular poles', () => {
  const fromTop = orbitOffsetBySteps([0, 0, 10], [0, 1, 0], 0, 1);
  const fromBottom = orbitOffsetBySteps([0, 0, -10], [0, 1, 0], 0, -1);
  assert.ok(fromTop.every(Number.isFinite));
  assert.ok(fromBottom.every(Number.isFinite));
  close(polar(fromTop), 15);
  close(polar(fromBottom), 165);
  close(length(fromTop), 10);
  close(length(fromBottom), 10);
});

test('repeated vertical orbit clamps before crossing a camera pole', () => {
  const fromTop = orbitOffsetBySteps([0, 0, 10], [0, 1, 0], 0, -20);
  const fromBottom = orbitOffsetBySteps([0, 0, -10], [0, 1, 0], 0, 20);
  close(polar(fromTop), 1);
  close(polar(fromBottom), 179);
  close(length(fromTop), 10);
  close(length(fromBottom), 10);
});


test('a 180-degree numpad turn also rotates the top-view screen-up axis', () => {
  const topUp = rotateViewUpByHorizontalSteps([0, 1, 0], 12);
  const ordinaryUp = rotateViewUpByHorizontalSteps([0, 0, 1], 12);
  close(topUp[0], 0);
  close(topUp[1], -1);
  close(topUp[2], 0);
  close(ordinaryUp[0], 0);
  close(ordinaryUp[1], 0);
  close(ordinaryUp[2], 1);
});

test('invalid orbit inputs and zero-length camera offsets are rejected', () => {
  assert.equal(orbitOffsetBySteps([0, 0, 0]), null);
  assert.equal(orbitOffsetBySteps([1, 2, NaN]), null);
  assert.equal(orbitOffsetBySteps([1, 2, 3], [0, 0, 1], Infinity, 0), null);
  assert.equal(orbitOffsetBySteps([1, 2, 3], [0, 0, 1], 0, 1, 0), null);
});
