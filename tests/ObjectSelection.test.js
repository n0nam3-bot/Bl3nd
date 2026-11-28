import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectSelection, resolveRestoredObjectSelection } from '../src/core/ObjectSelection.js';

const objects = ['A', 'B', 'C'];

function state(selectedObjects, activeObject) {
  return { objects, selectedObjects, activeObject };
}

test('ordinary click replaces the Object Mode selection and makes the clicked object active', () => {
  assert.deepEqual(resolveObjectSelection({ ...state(['A','B'], 'B'), mesh:'C' }), {
    selectedObjects:['C'], activeObject:'C'
  });
});

test('Shift-click adds an unselected object without dropping existing selection', () => {
  assert.deepEqual(resolveObjectSelection({ ...state(['A','B'], 'B'), mesh:'C', additive:true, toggle:true }), {
    selectedObjects:['A','B','C'], activeObject:'C'
  });
});

test('Shift-click toggles an already-selected object off', () => {
  assert.deepEqual(resolveObjectSelection({ ...state(['A','B','C'], 'C'), mesh:'B', additive:true, toggle:true }), {
    selectedObjects:['A','C'], activeObject:'C'
  });
});

test('removing the active object selects the last remaining object as active', () => {
  assert.deepEqual(resolveObjectSelection({ ...state(['A','B'], 'B'), mesh:'B', additive:true, toggle:true }), {
    selectedObjects:['A'], activeObject:'A'
  });
});

test('clicking empty space clears selection, while additive empty-space clicks preserve it', () => {
  assert.deepEqual(resolveObjectSelection({ ...state(['A','B'], 'B'), mesh:null }), {
    selectedObjects:[], activeObject:null
  });
  assert.deepEqual(resolveObjectSelection({ ...state(['A','B'], 'B'), mesh:null, additive:true, toggle:true }), {
    selectedObjects:['A','B'], activeObject:'B'
  });
});

test('invalid or deleted object references are pruned from additive selection', () => {
  assert.deepEqual(resolveObjectSelection({
    objects:['A','C'], selectedObjects:['A','B'], activeObject:'B', mesh:'C', additive:true, toggle:true
  }), { selectedObjects:['A','C'], activeObject:'C' });
});


test('restore preserves an intentionally empty selection from new snapshots', () => {
  assert.deepEqual(resolveRestoredObjectSelection({ objects, selectedIndices:[], activeIndex:-1 }), {
    selectedObjects:[], activeObject:null
  });
});

test('restore retains selected indices and the active object identity', () => {
  assert.deepEqual(resolveRestoredObjectSelection({ objects, selectedIndices:[0,2], activeIndex:2 }), {
    selectedObjects:['A','C'], activeObject:'C'
  });
});

test('legacy snapshots without selectedIndices retain their active/last object fallback', () => {
  assert.deepEqual(resolveRestoredObjectSelection({ objects, activeIndex:1 }), {
    selectedObjects:['B'], activeObject:'B'
  });
  assert.deepEqual(resolveRestoredObjectSelection({ objects }), {
    selectedObjects:['C'], activeObject:'C'
  });
});
