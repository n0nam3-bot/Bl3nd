import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardController } from '../src/input/KeyboardController.js';

class FakeInput {}
class FakeTextArea {}

function makeController(mode = 'edit') {
  const listeners = new Map();
  globalThis.HTMLInputElement = FakeInput;
  globalThis.HTMLTextAreaElement = FakeTextArea;
  globalThis.window = {
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); }
  };
  const calls = [];
  const document = { mode };
  const controller = new KeyboardController({
    viewport: { selectionTool: 'tap' },
    commandBus: { async dispatch(name, payload) { calls.push({ name, payload }); return true; } },
    modalTransform: { active: false },
    getDocument: () => document,
    ui: { pieMenuOpen: false },
    notify() {}
  });
  return { controller, calls, document, listeners };
}

function keyEvent({ key, code, ctrlKey = false, metaKey = false, shiftKey = false } = {}) {
  return {
    key, code, ctrlKey, metaKey, shiftKey, target: null,
    prevented: false,
    preventDefault() { this.prevented = true; }
  };
}

test('numpad view keys take priority over Edit Mode 1/2/3 selection-mode keys', async () => {
  const { controller, calls } = makeController('edit');
  const event = keyEvent({ key: '1', code: 'Numpad1' });
  await controller.onKeyDown(event);
  assert.equal(event.prevented, true);
  assert.deepEqual(calls.map(call => [call.name, call.payload.view]), [['view.set', 'front']]);
  controller.dispose();
});

test('Ctrl plus numpad direction chooses the opposite cardinal view', async () => {
  const { controller, calls } = makeController();
  const event = keyEvent({ key: 'End', code: 'Numpad1', ctrlKey: true });
  await controller.onKeyDown(event);
  assert.deepEqual(calls.map(call => [call.name, call.payload.view]), [['view.set', 'back']]);
  controller.dispose();
});

test('numpad orbit keys dispatch view-only steps without entering transforms', async () => {
  const { controller, calls } = makeController('object');
  const event = keyEvent({ key: 'ArrowLeft', code: 'Numpad4' });
  await controller.onKeyDown(event);
  assert.equal(event.prevented, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'view.orbit_step');
  assert.equal(calls[0].payload.horizontalSteps, 1);
  assert.equal(calls[0].payload.verticalSteps, 0);
  controller.dispose();
});

test('NumpadDecimal frames selection even when NumLock-off reports Delete', async () => {
  const { controller, calls } = makeController('edit');
  const event = keyEvent({ key: 'Delete', code: 'NumpadDecimal' });
  await controller.onKeyDown(event);
  assert.equal(event.prevented, true);
  assert.deepEqual(calls.map(call => call.name), ['view.frame_selection']);
  controller.dispose();
});

test('the regular Delete key still invokes delete and ordinary digit keys remain selection shortcuts', async () => {
  const { controller, calls } = makeController('edit');
  const deleteEvent = keyEvent({ key: 'Delete', code: 'Delete' });
  await controller.onKeyDown(deleteEvent);
  const digitEvent = keyEvent({ key: '2', code: 'Digit2' });
  await controller.onKeyDown(digitEvent);
  assert.deepEqual(calls.map(call => call.name), ['mesh.delete', 'mesh.selection_mode']);
  assert.equal(calls[1].payload.mode, 'edge');
  controller.dispose();
});
