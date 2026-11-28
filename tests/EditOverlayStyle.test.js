import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasActiveEvaluatedModifiers, resolveEditOverlayStyle } from '../src/core/EditOverlayStyle.js';

const overlaySource = await readFile(new URL('../src/ui/EditModeOverlay.js', import.meta.url), 'utf8');
const viewportSource = await readFile(new URL('../src/ui/Viewport.js', import.meta.url), 'utf8');

test('ordinary Edit Mode preserves normal depth-tested selection visibility', () => {
  const style = resolveEditOverlayStyle();
  assert.equal(style.xray, false);
  assert.equal(style.unselectedDepthTest, true);
  assert.equal(style.selectedDepthTest, true);
  assert.equal(style.selectedFaceOpacity, 0.2);
  assert.equal(style.selectedVertexHaloSize, 0);
});

test('modifier-active Edit Mode exposes selected cage elements through the evaluated shell', () => {
  const style = resolveEditOverlayStyle({ modifierActive: true });
  assert.equal(style.xray, true);
  assert.equal(style.unselectedDepthTest, true);
  assert.equal(style.selectedDepthTest, false);
  assert.ok(style.selectedFaceOpacity > 0.35);
  assert.ok(style.selectedVertexSize > 10);
  assert.ok(style.selectedVertexHaloSize > style.selectedVertexSize);
});

test('only selected cage edges use X-ray depth handling; unselected topology remains occluded', () => {
  assert.match(overlaySource, /Selected Edges · X-Ray/);
  assert.match(overlaySource, /depthTest: style\.unselectedDepthTest/);
  assert.match(overlaySource, /depthTest: style\.selectedDepthTest/);
  assert.match(overlaySource, /Selected Vertex Halos · X-Ray/);
  assert.match(overlaySource, /Selected Faces · X-Ray/);
});

test('X-ray activates only when at least one enabled modifier has an evaluated result', () => {
  const mesh = { userData: { evaluatedGeometry: {}, modifiers: [{ enabled: true }] } };
  assert.equal(hasActiveEvaluatedModifiers(mesh), true);
  mesh.userData.modifiers = [{ enabled: false }, { enabled: false }];
  assert.equal(hasActiveEvaluatedModifiers(mesh), false);
  assert.equal(hasActiveEvaluatedModifiers({ userData: { modifiers: [{ enabled: true }] } }), false);
  assert.equal(hasActiveEvaluatedModifiers({ userData: { evaluatedGeometry: {}, modifiers: [] } }), false);
  assert.match(viewportSource, /modifierActive: hasActiveEvaluatedModifiers\(mesh\)/);
  assert.match(viewportSource, /this\.editOverlay\.update\(mesh\.userData\.hem, selectionMode/);
});
