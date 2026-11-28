import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  bindProjectionToggleButton,
  projectionToggleState,
  syncProjectionToggleButton
} from '../src/core/ProjectionToggle.js';

function fakeButton({ label = null } = {}) {
  const attributes = new Map();
  const listeners = new Map();
  const labelNode = label === null ? null : { textContent: label };
  return {
    attributes,
    listeners,
    labelNode,
    dataset: {},
    textContent: '',
    title: '',
    querySelector(selector) { return selector === '[data-projection-label]' ? labelNode : null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name); }
  };
}

test('projection toggle state describes perspective and orthographic modes accessibly', () => {
  assert.deepEqual(projectionToggleState('perspective'), {
    mode: 'perspective', label: 'P', ariaPressed: 'false',
    ariaLabel: 'Switch to Orthographic projection',
    title: 'Perspective · tap to switch (Numpad 5)'
  });
  assert.deepEqual(projectionToggleState('orthographic'), {
    mode: 'orthographic', label: 'O', ariaPressed: 'true',
    ariaLabel: 'Switch to Perspective projection',
    title: 'Orthographic · tap to switch (Numpad 5)'
  });
});

test('desktop projection toggle label and pressed state follow the active camera', () => {
  const button = fakeButton();
  syncProjectionToggleButton(button, 'orthographic');
  assert.equal(button.textContent, 'O');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'Switch to Perspective projection');
  syncProjectionToggleButton(button, 'perspective');
  assert.equal(button.textContent, 'P');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
});

test('mobile projection toggle updates only its P/O label and retains the View caption', () => {
  const button = fakeButton({ label: 'P' });
  syncProjectionToggleButton(button, 'orthographic');
  assert.equal(button.labelNode.textContent, 'O');
  assert.equal(button.textContent, '');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.dataset.projection, 'orthographic');
});

test('projection click prevents default and bubbling before toggling exactly once', () => {
  const button = fakeButton();
  let calls = 0, prevented = 0, stopped = 0;
  const dispose = bindProjectionToggleButton(button, () => { calls++; });
  button.listeners.get('click')({
    preventDefault() { prevented++; },
    stopPropagation() { stopped++; }
  });
  assert.equal(calls, 1);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  dispose();
  assert.equal(button.listeners.has('click'), false);
});

test('mobile actionbar exposes a dedicated large projection control without the tiny axis button', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const actionbar = html.match(/<nav class="mobile-actionbar"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.match(actionbar, /id="mobile-projection-toggle"[^>]*data-projection-toggle/);
  assert.match(actionbar, /data-projection-label>P<\/span><small>View<\/small>/);
  assert.match(css, /\.axis-gizmo \.projection-toggle\{display:none\}/);
  assert.match(css, /#mobile-projection-toggle\{display:flex;[^}]*height:48px/);
});
