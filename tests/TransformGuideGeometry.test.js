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

test('rotation gizmo exposes independently addressable X, Y and Z axis rings', () => {
  const guide = buildTransformGuideGeometry({
    pivot: [1, 2, 3],
    axes: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
    axisRingBases: {
      x: { u: [0, 1, 0], v: [0, 0, 1] },
      y: { u: [0, 0, 1], v: [1, 0, 0] },
      z: { u: [1, 0, 0], v: [0, 1, 0] }
    },
    type: 'rotate', worldLength: 2, ringRadius: 1.5, ringSegments: 32
  });
  assert.deepEqual(guide.axisRings.map(ring => ring.axis), ['x', 'y', 'z']);
  for (const ring of guide.axisRings) {
    assert.equal(ring.points.length, 33);
    ring.points[0].forEach((value, index) => close(value, ring.points.at(-1)[index]));
    close(Math.hypot(...ring.points[0].map((value, index) => value - guide.pivot[index])), 1.5);
  }
});

test('rotation gizmo omits invalid individual axis rings without losing valid rings', () => {
  const guide = buildTransformGuideGeometry({
    pivot: [0, 0, 0], axes: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
    axisRingBases: {
      x: { u: [0, 1, 0], v: [0, 0, 1] },
      y: { u: [0, 0, 0], v: [1, 0, 0] },
      z: { u: [1, 0, 0], v: [0, 1, 0] }
    },
    type: 'rotate', worldLength: 1
  });
  assert.deepEqual(guide.axisRings.map(ring => ring.axis), ['x', 'z']);
});

test('Move and Scale gizmo plane handles expose XY, YZ and XZ squares between matching axes', () => {
  const guide = buildTransformGuideGeometry({
    pivot: [1, 2, 3],
    axes: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
    planeHandles: [
      { plane: 'xy', normal: 'z', u: [1, 0, 0], v: [0, 1, 0] },
      { plane: 'yz', normal: 'x', u: [0, 1, 0], v: [0, 0, 1] },
      { plane: 'xz', normal: 'y', u: [1, 0, 0], v: [0, 0, 1] }
    ],
    worldLength: 2
  });
  assert.deepEqual(guide.planeHandles.map(handle => [handle.plane, handle.normal]), [
    ['xy', 'z'], ['yz', 'x'], ['xz', 'y']
  ]);
  for (const handle of guide.planeHandles) {
    assert.equal(handle.corners.length, 4);
    const center = handle.corners.reduce((sum, point) => sum.map((value, index) => value + point[index] / 4), [0, 0, 0]);
    center.forEach((value, index) => close(value, handle.center[index]));
    assert.ok(handle.center.every(Number.isFinite));
    assert.ok(handle.corners.every(point => point.every(Number.isFinite)));
  }
});

test('transform guide marks only the selected plane square as active', () => {
  const guide = buildTransformGuideGeometry({
    pivot: [0, 0, 0], axes: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
    planeHandles: [
      { plane: 'xy', normal: 'z', u: [1, 0, 0], v: [0, 1, 0] },
      { plane: 'yz', normal: 'x', u: [0, 1, 0], v: [0, 0, 1] }
    ],
    activePlane: 'yz', worldLength: 1
  });
  assert.deepEqual(guide.planeHandles.map(handle => handle.active), [false, true]);
  assert.equal(guide.activePlane, 'yz');
});

test('transform guide rejects malformed plane definitions without losing valid squares', () => {
  const guide = buildTransformGuideGeometry({
    pivot: [0, 0, 0], axes: { x: [1, 0, 0] },
    planeHandles: [
      { plane: 'xy', normal: 'z', u: [1, 0, 0], v: [0, 1, 0] },
      { plane: 'xx', normal: 'z', u: [1, 0, 0], v: [0, 1, 0] },
      { plane: 'xz', normal: 'y', u: [0, 0, 0], v: [0, 0, 1] }
    ],
    activePlane: 'invalid', worldLength: 1
  });
  assert.deepEqual(guide.planeHandles.map(handle => handle.plane), ['xy']);
  assert.equal(guide.activePlane, null);
});
