import test from 'node:test';
import assert from 'node:assert/strict';
import { pieSlotFromVector, nextPieSlot } from '../src/ui/RadialPieMenu.js';

test('radial pie pointer vectors map to eight clockwise sectors', () => {
  const vectors = [
    [0,-100,0], [100,-100,1], [100,0,2], [100,100,3],
    [0,100,4], [-100,100,5], [-100,0,6], [-100,-100,7]
  ];
  for (const [x,y,slot] of vectors) assert.equal(pieSlotFromVector(x,y), slot);
});

test('radial pie ignores the center dead zone and invalid vectors', () => {
  assert.equal(pieSlotFromVector(2,3), null);
  assert.equal(pieSlotFromVector(0,0,0), null);
  assert.equal(pieSlotFromVector(NaN,1), null);
  assert.equal(pieSlotFromVector(10,0,20), null);
});

test('radial pie keyboard navigation selects the closest available direction', () => {
  const slots = [0,1,2,4,6,7];
  assert.equal(nextPieSlot(null,'ArrowUp',slots),0);
  assert.equal(nextPieSlot(0,'ArrowRight',slots),2);
  assert.equal(nextPieSlot(2,'ArrowDown',slots),4);
  assert.equal(nextPieSlot(4,'ArrowLeft',slots),6);
  assert.equal(nextPieSlot(6,'ArrowRight',slots),2);
});

test('radial pie navigation safely handles sparse menus and invalid directions', () => {
  assert.equal(nextPieSlot(null,'ArrowLeft',[1,3,5,7]),5);
  assert.equal(nextPieSlot(null,'ArrowDown',[]),null);
  assert.equal(nextPieSlot(null,'Enter',[0,2]),null);
});

test('radial pie boundaries are assigned deterministically between adjacent wedges', () => {
  assert.equal(pieSlotFromVector(100,-42), 1);
  assert.equal(pieSlotFromVector(100,-39), 2);
  assert.equal(pieSlotFromVector(-100,-42), 7);
  assert.equal(pieSlotFromVector(-100,-39), 6);
});
