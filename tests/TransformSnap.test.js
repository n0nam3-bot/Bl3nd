import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MOVE_SNAP_SETTINGS,
  getMoveSnapStep,
  normalizeMoveSnapSettings,
  resolveMoveSnapAmount,
  snapMoveAmount
} from '../src/core/TransformSnap.js';

test('Move snapping is disabled by default and preserves raw mouse distance', () => {
  assert.deepEqual(normalizeMoveSnapSettings(), { enabled: false, globalStep: 1, localStep: 1 });
  assert.equal(resolveMoveSnapAmount(0.37, DEFAULT_MOVE_SNAP_SETTINGS, 'global'), 0.37);
});

test('Global and Local orientations select their own configured increments', () => {
  const settings = { enabled: true, globalStep: 0.5, localStep: 0.125 };
  assert.equal(getMoveSnapStep(settings, 'global'), 0.5);
  assert.equal(getMoveSnapStep(settings, 'local'), 0.125);
  assert.equal(resolveMoveSnapAmount(0.62, settings, 'global'), 0.5);
  assert.equal(resolveMoveSnapAmount(0.62, settings, 'local'), 0.625);
});

test('positive and negative distances snap symmetrically, including half-step ties', () => {
  assert.equal(snapMoveAmount(0.24, 0.1), 0.2);
  assert.equal(snapMoveAmount(0.25, 0.1), 0.3);
  assert.equal(snapMoveAmount(-0.25, 0.1), -0.3);
  assert.equal(snapMoveAmount(-0.24, 0.1), -0.2);
});

test('numeric input bypasses snapping and keeps its full entered precision', () => {
  const settings = { enabled: true, globalStep: 1, localStep: 0.5 };
  assert.equal(resolveMoveSnapAmount(0.123456789, settings, 'global', true), 0.123456789);
  assert.equal(resolveMoveSnapAmount(-2.375, settings, 'local', true), -2.375);
});

test('invalid settings fall back safely and positive steps are clamped', () => {
  assert.deepEqual(normalizeMoveSnapSettings({ enabled: 1, globalStep: 0, localStep: NaN }), {
    enabled: false, globalStep: 1, localStep: 1
  });
  assert.equal(normalizeMoveSnapSettings({ globalStep: 1e-20 }).globalStep, 0.000001);
  assert.equal(normalizeMoveSnapSettings({ localStep: 1e20 }).localStep, 1000000);
});

test('snapping remains numerically clean for decimal increments', () => {
  assert.equal(snapMoveAmount(0.3, 0.1), 0.3);
  assert.equal(snapMoveAmount(-0.6, 0.2), -0.6);
  assert.equal(snapMoveAmount(0.0000001, 0.1), 0);
});

test('enabling snapping quantizes the same live pointer displacement without changing the default', () => {
  const settings = normalizeMoveSnapSettings();
  const rawPointerAmount = 0.62;
  assert.equal(resolveMoveSnapAmount(rawPointerAmount, settings, 'global'), rawPointerAmount);
  settings.enabled = true;
  assert.equal(resolveMoveSnapAmount(rawPointerAmount, settings, 'global'), 1);
});

test('switching Global and Local orientation recomputes the same pointer displacement on each grid', () => {
  const settings = { enabled: true, globalStep: 1, localStep: 0.25 };
  const rawPointerAmount = 0.62;
  assert.equal(resolveMoveSnapAmount(rawPointerAmount, settings, 'global'), 1);
  assert.equal(resolveMoveSnapAmount(rawPointerAmount, settings, 'local'), 0.5);
});

test('editing the active grid increment immediately changes the snapped preview amount', () => {
  const settings = { enabled: true, globalStep: 1, localStep: 0.25 };
  const rawPointerAmount = 0.62;
  assert.equal(resolveMoveSnapAmount(rawPointerAmount, settings, 'local'), 0.5);
  settings.localStep = 0.125;
  assert.equal(resolveMoveSnapAmount(rawPointerAmount, settings, 'local'), 0.625);
});

test('positive and negative pointer previews cross snap thresholds symmetrically', () => {
  const settings = { enabled: true, globalStep: 0.5, localStep: 0.5 };
  assert.equal(resolveMoveSnapAmount(0.249, settings, 'global'), 0);
  assert.equal(resolveMoveSnapAmount(0.251, settings, 'global'), 0.5);
  assert.equal(resolveMoveSnapAmount(-0.249, settings, 'global'), 0);
  assert.equal(resolveMoveSnapAmount(-0.251, settings, 'global'), -0.5);
});

test('the active preview returns to continuous movement immediately when snapping is switched off', () => {
  const settings = { enabled: true, globalStep: 1, localStep: 0.25 };
  const rawPointerAmount = 0.62;
  assert.equal(resolveMoveSnapAmount(rawPointerAmount, settings, 'local'), 0.5);
  settings.enabled = false;
  assert.equal(resolveMoveSnapAmount(rawPointerAmount, settings, 'local'), rawPointerAmount);
});
