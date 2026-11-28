import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_MODIFIER_BUDGET,
  LOW_MEMORY_MOBILE_MODIFIER_BUDGET,
  MOBILE_MODIFIER_BUDGET,
  estimateModifierWorkingSet,
  getModifierBudget,
  validateModifierBudget
} from '../src/modifiers/ModifierBudget.js';

const positions = new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0]);
const indices = new Uint32Array([0,1,2, 0,2,3]);
const faces = [[0,1,2,3]];

test('device profile chooses conservative mobile and desktop modifier limits', () => {
  assert.equal(getModifierBudget({ tier: 'Mobile' }), MOBILE_MODIFIER_BUDGET);
  assert.equal(getModifierBudget({ tier: 'Mobile', memory: 2 }), LOW_MEMORY_MOBILE_MODIFIER_BUDGET);
  assert.equal(getModifierBudget({ tier: 'PC' }), DESKTOP_MODIFIER_BUDGET);
  assert.ok(getModifierBudget({ tier: 'PC', memory: 4 }).maxWorkingBytes < DESKTOP_MODIFIER_BUDGET.maxWorkingBytes);
});

test('working-set estimate accounts for one polygon cage subdivision pass', () => {
  const estimate = estimateModifierWorkingSet({ positions, indices, faces, modifiers: [{ type: 'subdivision', level: 1 }] });
  assert.equal(estimate.sourceVertices, 4);
  assert.equal(estimate.sourceTriangles, 2);
  assert.equal(estimate.estimatedVertices, 9);
  assert.equal(estimate.estimatedTriangles, 8);
  assert.ok(estimate.estimatedWorkingBytes > 0);
});

test('working-set estimate grows with subdivision levels and array copies', () => {
  const levelOne = estimateModifierWorkingSet({ positions, indices, faces, modifiers: [{ type: 'subdivision', level: 1 }] });
  const levelThree = estimateModifierWorkingSet({ positions, indices, faces, modifiers: [{ type: 'subdivision', level: 3 }] });
  const arrayFive = estimateModifierWorkingSet({ positions, indices, faces, modifiers: [{ type: 'array', count: 5 }] });
  assert.ok(levelThree.estimatedVertices > levelOne.estimatedVertices);
  assert.ok(levelThree.estimatedWorkingBytes > levelOne.estimatedWorkingBytes);
  assert.equal(arrayFive.estimatedVertices, 20);
  assert.equal(arrayFive.estimatedTriangles, 10);
});

test('working-set estimate budgets Solidify shell and boundary walls conservatively', () => {
  const estimate = estimateModifierWorkingSet({ positions, indices, faces, modifiers: [{ type: 'solidify', thickness: 0.1 }] });
  assert.equal(estimate.estimatedVertices, 8);
  assert.ok(estimate.estimatedTriangles >= 12);
});

test('disabled modifiers do not inflate the preflight estimate', () => {
  const plain = estimateModifierWorkingSet({ positions, indices, faces, modifiers: [] });
  const disabled = estimateModifierWorkingSet({ positions, indices, faces, modifiers: [{ type: 'array', count: 20, enabled: false }] });
  assert.deepEqual(disabled, plain);
});

test('budget validation rejects oversized jobs before worker allocation', () => {
  const estimate = estimateModifierWorkingSet({ positions, indices, faces, modifiers: [{ type: 'array', count: 20 }] });
  assert.throws(() => validateModifierBudget(estimate, {
    tier: 'Mobile', maxWorkingBytes: 100, maxVertices: 10, maxTriangles: 10
  }), /paused for Mobile safety/);
});

test('budget validation accepts a small mobile modeling job', () => {
  const estimate = estimateModifierWorkingSet({ positions, indices, faces, modifiers: [{ type: 'subdivision', level: 2 }] });
  assert.equal(validateModifierBudget(estimate, MOBILE_MODIFIER_BUDGET), estimate);
});
