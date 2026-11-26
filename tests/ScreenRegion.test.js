import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentRegionIntervals, segmentRegionSamples } from '../src/core/ScreenRegion.js';

const horizontal = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };

test('box selection detects a narrow crossing between the old fixed edge samples', () => {
  const points = [{ x: 32, y: -3 }, { x: 36, y: 3 }];
  const samples = segmentRegionSamples(horizontal.a, horizontal.b, 'box', points);
  assert.ok(samples.length > 0);
  assert.ok(samples.every(t => t >= 0.32 - 1e-8 && t <= 0.36 + 1e-8));
  assert.ok(![0, 0.25, 0.5, 0.75, 1].some(t => samples.includes(t)));
});

test('a circle brush centered on a corner includes both incident edge segments', () => {
  const corner = { x: 100, y: 100 };
  const horizontal = segmentRegionSamples(corner, { x: 200, y: 100 }, 'circle', [corner], 25);
  const vertical = segmentRegionSamples(corner, { x: 100, y: 200 }, 'circle', [corner], 25);
  assert.ok(horizontal.includes(0));
  assert.ok(vertical.includes(0));
  assert.ok(horizontal.some(t => t > 0 && t <= 0.25));
  assert.ok(vertical.some(t => t > 0 && t <= 0.25));
});

test('lasso selection detects a thin polygon crossing between fixed edge samples', () => {
  const lasso = [
    { x: 41, y: -4 }, { x: 46, y: -4 },
    { x: 46, y: 4 }, { x: 41, y: 4 }
  ];
  const intervals = segmentRegionIntervals(horizontal.a, horizontal.b, 'lasso', lasso);
  assert.equal(intervals.length, 1);
  assert.ok(intervals[0][0] > 0.4 && intervals[0][0] < 0.42);
  assert.ok(intervals[0][1] > 0.45 && intervals[0][1] < 0.47);
});

test('one region around an L-shaped corner overlaps both connected edges', () => {
  const box = [{ x: 78, y: -12 }, { x: 112, y: 28 }];
  const first = segmentRegionSamples({ x: 0, y: 0 }, { x: 100, y: 0 }, 'box', box);
  const second = segmentRegionSamples({ x: 100, y: 0 }, { x: 100, y: 100 }, 'box', box);
  assert.ok(first.length > 0);
  assert.ok(second.length > 0);
});

test('box selection supports reverse drag direction', () => {
  const forward = segmentRegionIntervals(horizontal.a, horizontal.b, 'box', [
    { x: 32, y: -3 }, { x: 36, y: 3 }
  ]);
  const reverse = segmentRegionIntervals(horizontal.a, horizontal.b, 'box', [
    { x: 36, y: 3 }, { x: 32, y: -3 }
  ]);
  assert.deepEqual(reverse, forward);
});

test('unsupported tools and incomplete lassos return no edge samples', () => {
  assert.deepEqual(segmentRegionIntervals(horizontal.a, horizontal.b, 'tap', [{ x: 0, y: 0 }]), []);
  assert.deepEqual(segmentRegionIntervals(horizontal.a, horizontal.b, 'lasso', [{ x: 0, y: 0 }, { x: 1, y: 1 }]), []);
  assert.deepEqual(segmentRegionSamples(horizontal.a, horizontal.b, 'box', []), []);
});
