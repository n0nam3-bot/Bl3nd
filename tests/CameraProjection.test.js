import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraUnitsPerPixel,
  orthographicFrustum,
  orthographicViewHeight,
  perspectiveDistanceForViewHeight,
  perspectiveViewHeight
} from '../src/core/CameraProjection.js';

const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('perspective and orthographic conversions preserve the target-plane vertical span', () => {
  for (const distance of [0.25, 1, 7.5, 100]) {
    for (const fov of [35, 48, 70]) {
      const height = perspectiveViewHeight(distance, fov);
      const restoredDistance = perspectiveDistanceForViewHeight(height, fov);
      close(restoredDistance, distance);
      close(orthographicViewHeight(height / 2, -height / 2), height);
    }
  }
});

test('perspective zoom is included when deriving the orthographic view span', () => {
  const height = perspectiveViewHeight(12, 48, 1.5);
  close(height, perspectiveViewHeight(12, 48) / 1.5);
  close(perspectiveDistanceForViewHeight(height, 48), 8);
});

test('orthographic zoom is included when returning to perspective', () => {
  const visibleHeight = orthographicViewHeight(5, -5, 2);
  close(visibleHeight, 5);
  close(perspectiveViewHeight(perspectiveDistanceForViewHeight(visibleHeight, 48), 48), visibleHeight);
});

test('orthographic frustum keeps vertical span and scales horizontal bounds by aspect', () => {
  const portrait = orthographicFrustum(10, 0.5);
  const landscape = orthographicFrustum(10, 2);
  assert.deepEqual(portrait, { left: -2.5, right: 2.5, top: 5, bottom: -5 });
  assert.deepEqual(landscape, { left: -10, right: 10, top: 5, bottom: -5 });
});

test('projection helpers reject invalid and singular dimensions', () => {
  assert.equal(perspectiveViewHeight(0, 48), null);
  assert.equal(perspectiveViewHeight(10, 180), null);
  assert.equal(perspectiveDistanceForViewHeight(NaN, 48), null);
  assert.equal(orthographicFrustum(10, 0), null);
  assert.equal(orthographicViewHeight(2, 2, 1), null);
});


test('modal transform scale is depth-independent in orthographic projection', () => {
  const near = cameraUnitsPerPixel({ projection: 'orthographic', top: 5, bottom: -5, pixelHeight: 1000 });
  const far = cameraUnitsPerPixel({ projection: 'orthographic', top: 5, bottom: -5, distance: 500, pixelHeight: 1000 });
  close(near, 0.01);
  close(far, near);
});

test('modal transform scale follows perspective depth and FOV', () => {
  const near = cameraUnitsPerPixel({ projection: 'perspective', distance: 5, fovDegrees: 48, pixelHeight: 1000 });
  const far = cameraUnitsPerPixel({ projection: 'perspective', distance: 10, fovDegrees: 48, pixelHeight: 1000 });
  close(far, near * 2);
});
