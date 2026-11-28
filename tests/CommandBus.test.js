import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandBus } from '../src/core/CommandBus.js';

function documentStub() {
  let revision = 0;
  return {
    async serialize() { return { revision }; },
    change() { revision++; }
  };
}

test('CommandBus notifies the observer after a successful command and undo snapshot', async () => {
  const order = [];
  const document = documentStub();
  const bus = new CommandBus({
    undoManager: { async record(name, before, after) { order.push(['undo', name, before.revision, after.revision]); } },
    onCommand: detail => order.push(['change', detail.name, detail.result])
  });
  bus.register('mesh.test', () => { document.change(); return true; });
  assert.equal(await bus.dispatch('mesh.test', { document }), true);
  assert.deepEqual(order, [['undo', 'mesh.test', 0, 1], ['change', 'mesh.test', true]]);
});

test('CommandBus notifies the observer for successful non-undoable state changes', async () => {
  const observed = [];
  const bus = new CommandBus({ onCommand: detail => observed.push(detail.name) });
  bus.register('selection.test', () => undefined, { recordUndo: false });
  assert.equal(await bus.dispatch('selection.test'), true);
  assert.deepEqual(observed, ['selection.test']);
});

test('CommandBus does not notify persistence observers when a command rejects', async () => {
  let calls = 0;
  const bus = new CommandBus({ onCommand: () => calls++ });
  bus.register('mesh.rejected', () => false, { recordUndo: false });
  assert.equal(await bus.dispatch('mesh.rejected'), false);
  assert.equal(calls, 0);
});

test('observer errors do not convert a completed command into a failure', async () => {
  const bus = new CommandBus({ onCommand() { throw new Error('observer failure'); } });
  bus.register('mesh.ok', () => true, { recordUndo: false });
  assert.equal(await bus.dispatch('mesh.ok'), true);
});
