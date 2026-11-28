import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MOVE_SNAP_SETTINGS,
  getMoveSnapStep,
  getTransformSnapSettingKeys,
  getTransformSnapStep,
  normalizeMoveSnapSettings,
  normalizeTransformSnapSettings,
  resolveMoveSnapAmount,
  resolveRotateSnapDegrees,
  resolveScaleSnapFactor,
  snapMoveAmount
} from '../src/core/TransformSnap.js';

test('Move snapping is disabled by default and preserves raw mouse distance', () => {
  assert.deepEqual(normalizeMoveSnapSettings(), {
    enabled: false, globalStep: 1, localStep: 1,
    globalRotationStep: 15, localRotationStep: 15,
    globalScaleStep: 0.1, localScaleStep: 0.1
  });
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
    enabled: false, globalStep: 1, localStep: 1,
    globalRotationStep: 15, localRotationStep: 15,
    globalScaleStep: 0.1, localScaleStep: 0.1
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


test('Global and Local Rotate and Scale increments have safe independent defaults', () => {
  const settings = normalizeTransformSnapSettings({});
  assert.deepEqual(getTransformSnapSettingKeys('rotate'), {
    global: 'globalRotationStep', local: 'localRotationStep'
  });
  assert.deepEqual(getTransformSnapSettingKeys('scale'), {
    global: 'globalScaleStep', local: 'localScaleStep'
  });
  assert.equal(getTransformSnapStep(settings, 'rotate', 'global'), 15);
  assert.equal(getTransformSnapStep(settings, 'scale', 'local'), 0.1);
});

test('axis-constrained pointer rotation snaps signed degrees on separate Global and Local steps', () => {
  const settings = {
    enabled: true,
    globalRotationStep: 15,
    localRotationStep: 5
  };
  assert.equal(resolveRotateSnapDegrees(22, settings, 'global'), 15);
  assert.equal(resolveRotateSnapDegrees(-22, settings, 'global'), -15);
  assert.equal(resolveRotateSnapDegrees(7, settings, 'local'), 5);
  assert.equal(resolveRotateSnapDegrees(8, settings, 'local'), 10);
});

test('rotation snapping is disabled by default and exact numeric angles bypass snapping', () => {
  assert.equal(resolveRotateSnapDegrees(22, normalizeTransformSnapSettings(), 'global'), 22);
  assert.equal(resolveRotateSnapDegrees(22.375, { enabled: true, globalRotationStep: 15 }, 'global', true), 22.375);
  assert.equal(resolveRotateSnapDegrees(-7.25, { enabled: false, localRotationStep: 5 }, 'local'), -7.25);
});

test('scale snaps around the neutral factor 1.0 with symmetric positive and negative increments', () => {
  const settings = { enabled: true, globalScaleStep: 0.1, localScaleStep: 0.25 };
  assert.equal(resolveScaleSnapFactor(1.24, settings, 'global'), 1.2);
  assert.equal(resolveScaleSnapFactor(0.76, settings, 'global'), 0.8);
  assert.equal(resolveScaleSnapFactor(1.62, settings, 'local'), 1.5);
  assert.equal(resolveScaleSnapFactor(0.38, settings, 'local'), 0.5);
});

test('scale snapping stays disabled by default and explicit numeric scale remains exact', () => {
  assert.equal(resolveScaleSnapFactor(1.237, normalizeTransformSnapSettings(), 'global'), 1.237);
  assert.equal(resolveScaleSnapFactor(1.237, { enabled: true, globalScaleStep: 0.25 }, 'global', true), 1.237);
  assert.equal(resolveScaleSnapFactor(0.875, { enabled: false }, 'local'), 0.875);
});

test('scale snap clamps prevent zero/negative factors and extreme pointer results', () => {
  const settings = { enabled: true, globalScaleStep: 1 };
  assert.equal(resolveScaleSnapFactor(0.001, settings, 'global'), 0.001);
  assert.equal(resolveScaleSnapFactor(1000, settings, 'global'), 1000);
});

test('new snap preferences extend older saved Move-only preferences without losing them', () => {
  const settings = normalizeTransformSnapSettings({ enabled: true, globalStep: 0.25, localStep: 0.125 });
  assert.equal(settings.enabled, true);
  assert.equal(settings.globalStep, 0.25);
  assert.equal(settings.localStep, 0.125);
  assert.equal(settings.globalRotationStep, 15);
  assert.equal(settings.globalScaleStep, 0.1);
});
