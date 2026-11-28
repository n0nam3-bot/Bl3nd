import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransformGuideGeometry } from '../src/core/TransformGuideGeometry.js';

const close = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('transform guide builds normalized Global/Local axis endpoints from the pivot', () => {
  const guide = buildTransformGuideGeometry({
    pivot: [2, -1, 4],
    axes: { x: [2, 0, 0], y: [0, 3, 0], z: [0, 0, -4] },
    worldLength: 2
  });
  assert.deepEqual(guide.axisLines.x.end, [4, -1, 4]);
  assert.deepEqual(guide.axisLines.y.end, [2, 1, 4]);
  assert.deepEqual(guide.axisLines.z.end, [2, -1, 2]);
  assert.deepEqual(guide.axisLines.z.direction, [0, 0, -1]);
});

test('transform guide retains the selected constrained axis label', () => {
  const guide = buildTransformGuideGeometry({
    pivot: [0, 0, 0], axes: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
    activeAxis: 'y', worldLength: 1
  });
  assert.equal(guide.activeAxis, 'y');
});

test('transform guide plane corners are symmetric around the pivot', () => {
  const guide = buildTransformGuideGeometry({
    pivot: [1, 2, 3], axes: { x: [1, 0, 0] },
    planeBasis: { u: [1, 0, 0], v: [0, 1, 0] }, worldLength: 2
  });
  assert.equal(guide.planeCorners.length, 4);
  const center = guide.planeCorners.reduce((sum, point) => sum.map((v, i) => v + point[i] / 4), [0, 0, 0]);
  center.forEach((value, index) => close(value, guide.pivot[index]));
});

test('transform guide ring closes and uses a stable segment count', () => {
  const guide = buildTransformGuideGeometry({
    pivot: [0, 0, 0], axes: { z: [0, 0, 1] }, type: 'rotate',
    ringBasis: { u: [1, 0, 0], v: [0, 1, 0] }, worldLength: 2, ringSegments: 24
  });
  assert.equal(guide.ringPoints.length, 25);
  guide.ringPoints[0].forEach((value, index) => close(value, guide.ringPoints.at(-1)[index]));
  close(Math.hypot(...guide.ringPoints[0]), 1.44);
});

test('transform guide orthogonalizes a skewed input plane basis', () => {
  const guide = buildTransformGuideGeometry({
    pivot: [0, 0, 0], axes: { z: [0, 0, 1] },
    planeBasis: { u: [2, 0, 0], v: [1, 2, 0] }, worldLength: 1
  });
  // Adjacent edge directions must be perpendicular after basis cleanup.
  const edgeA = guide.planeCorners[1].map((value, index) => value - guide.planeCorners[0][index]);
  const edgeB = guide.planeCorners[3].map((value, index) => value - guide.planeCorners[0][index]);
  close(edgeA.reduce((sum, value, index) => sum + value * edgeB[index], 0), 0);
});

test('transform guide safely rejects invalid pivots and zero-length axes', () => {
  assert.equal(buildTransformGuideGeometry({ pivot: [NaN, 0, 0], axes: { x: [1, 0, 0] } }), null);
  assert.equal(buildTransformGuideGeometry({ pivot: [0, 0, 0], axes: { x: [0, 0, 0] } }), null);
  assert.equal(buildTransformGuideGeometry({ pivot: [0, 0, 0], axes: { x: [1, 0, 0] }, worldLength: 0 }), null);
});
