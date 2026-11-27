import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMoveReadout } from '../src/core/TransformReadout.js';

test('axis-constrained movement reports a signed distance and resulting world position', () => {
  const result = buildMoveReadout({
    delta: [0, -2.5, 0],
    startPosition: [4, 1, -3],
    axisVector: [0, -1, 0]
  });
  assert.equal(result.value, '+2.500');
  assert.equal(result.amount, 2.5);
  assert.deepEqual(result.target, [4, -1.5, -3]);
  assert.match(result.deltaText, /Δ X \+0\.000  Y −2\.500  Z \+0\.000/);
  assert.match(result.targetText, /TO X \+4\.000  Y −1\.500  Z −3\.000/);
});

test('free and plane movement report the displacement magnitude and all world components', () => {
  const result = buildMoveReadout({
    delta: [3, -4, 0],
    startPosition: [-1, 2, 5]
  });
  assert.equal(result.amount, 5);
  assert.equal(result.value, '+5.000');
  assert.deepEqual(result.target, [2, -2, 5]);
  assert.match(result.deltaText, /Δ X \+3\.000  Y −4\.000  Z \+0\.000/);
});

test('near-zero components are displayed as zero rather than negative zero', () => {
  const result = buildMoveReadout({ delta: [-0.0001, 0.0001, -0] });
  assert.equal(result.deltaText, 'Δ X +0.000  Y +0.000  Z +0.000');
  assert.equal(result.value, '+0.000');
});

test('invalid vectors safely fall back to zero vectors', () => {
  const result = buildMoveReadout({ delta: [NaN, 1, 2], startPosition: [1, 2, 3] });
  assert.equal(result.value, '+0.000');
  assert.deepEqual(result.target, [1, 2, 3]);
});
