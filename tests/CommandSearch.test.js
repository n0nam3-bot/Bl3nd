import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COMMAND_SEARCH_ITEMS,
  isCommandSearchShortcut,
  isEditableCommandSearchTarget,
  searchCommandItems
} from '../src/ui/CommandSearch.js';

test('command catalogue has unique ids and every item references a registered command', async () => {
  const ids = COMMAND_SEARCH_ITEMS.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(COMMAND_SEARCH_ITEMS.every(item => item.label && item.command && item.category && item.description));
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const command of new Set(COMMAND_SEARCH_ITEMS.map(item => item.command))) {
    assert.ok(main.includes(`commandBus.register('${command}'`), `Unregistered command: ${command}`);
  }
});

test('empty query returns a bounded list in curated order', () => {
  const results = searchCommandItems('', 'object', 6);
  assert.equal(results.length, 6);
  assert.deepEqual(results.map(item => item.id), COMMAND_SEARCH_ITEMS.filter(item => item.scope !== 'edit').slice(0, 6).map(item => item.id));
});

test('direct label matches rank before keyword and description matches', () => {
  const results = searchCommandItems('front', 'object');
  assert.equal(results[0].id, 'view-front');
  assert.equal(results.length, 1);
});

test('multi-word queries require every token to match', () => {
  assert.ok(searchCommandItems('orthographic projection', 'object').some(item => item.id === 'projection-toggle'));
  assert.equal(searchCommandItems('orthographic bevel', 'edit').length, 0);
});

test('result scope follows Object and Edit Mode context', () => {
  const objectResults = searchCommandItems('delete', 'object');
  const editResults = searchCommandItems('delete', 'edit');
  assert.ok(objectResults.some(item => item.id === 'delete-object'));
  assert.equal(objectResults.some(item => item.id === 'delete-geometry'), false);
  assert.ok(editResults.some(item => item.id === 'delete-geometry'));
  assert.equal(editResults.some(item => item.id === 'delete-object'), false);
  assert.equal(searchCommandItems('bevel', 'object').length, 0);
});

test('mode-switch actions are offered only when they change the current mode', () => {
  assert.ok(searchCommandItems('switch to edit mode', 'object').some(item => item.id === 'mode-edit'));
  assert.equal(searchCommandItems('switch to edit mode', 'edit').length, 0);
  assert.ok(searchCommandItems('switch to object mode', 'edit').some(item => item.id === 'mode-object'));
  assert.equal(searchCommandItems('switch to object mode', 'object').length, 0);
});

test('common modeling synonyms find their intended commands', () => {
  assert.ok(searchCommandItems('chamfer', 'edit').some(item => item.id === 'bevel'));
  assert.ok(searchCommandItems('soft selection', 'edit').some(item => item.id === 'proportional-toggle'));
  assert.ok(searchCommandItems('ring', 'edit').some(item => item.id === 'edge-ring'));
  assert.ok(searchCommandItems('parallel projection', 'object').some(item => item.id === 'projection-toggle'));
});

test('search normalization is case- and accent-insensitive', () => {
  assert.ok(searchCommandItems('UV SPHERE', 'object').some(item => item.id === 'add-sphere'));
  assert.ok(searchCommandItems('wireframe', 'object').some(item => item.id === 'shading-wire'));
});

test('slash shortcut requires no modifiers and a non-editable target', () => {
  assert.equal(isCommandSearchShortcut({ key:'/', target:null }), true);
  for (const modifiers of [{ shiftKey:true }, { ctrlKey:true }, { metaKey:true }, { altKey:true }]) {
    assert.equal(isCommandSearchShortcut({ key:'/', target:null, ...modifiers }), false);
  }
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(isCommandSearchShortcut({ key:'/', target:{ tagName } }), false);
  }
  assert.equal(isCommandSearchShortcut({ key:'/', target:{ isContentEditable:true } }), false);
});

test('editable-field detection recognizes editable ancestors but ignores ordinary buttons', () => {
  assert.equal(isEditableCommandSearchTarget({ tagName:'BUTTON' }), false);
  assert.equal(isEditableCommandSearchTarget({ closest() { return true; } }), true);
});


test('Object Mode delete command is described as deleting the selected object group', () => {
  const item = COMMAND_SEARCH_ITEMS.find(entry => entry.id === 'delete-object');
  assert.equal(item.label, 'Delete Selected Objects');
  assert.match(item.description, /every selected scene object/i);
});
