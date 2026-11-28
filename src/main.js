import * as THREE from 'three';
import { detectCapabilities } from './core/DeviceCapabilities.js';
import { CommandBus } from './core/CommandBus.js';
import { SceneDocument } from './core/SceneDocument.js';
import { buildMoveReadout } from './core/TransformReadout.js';
import { getTransformSnapSettingKeys, getTransformSnapStep, normalizeTransformSnapSettings } from './core/TransformSnap.js';
import { normalizeProportionalSettings } from './core/ProportionalEditing.js';
import { UndoManager } from './core/UndoManager.js';
import { MeshOperators } from './operators/MeshOperators.js';
import { SelectionOperators } from './operators/SelectionOperators.js';
import { ModalTransform } from './operators/ModalTransform.js';
import { LoopCutModal } from './operators/LoopCutModal.js';
import { BevelModal } from './operators/BevelModal.js';
import { FaceOperationModal } from './operators/FaceOperationModal.js';
import { ModifierStack } from './modifiers/ModifierStack.js';
import { Viewport } from './ui/Viewport.js';
import { ModelIO } from './io/ModelIO.js';
import { KeyboardController } from './input/KeyboardController.js';
import { TouchController } from './input/TouchController.js';
import { SelectionGestureController } from './input/SelectionGestureController.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const statusEl = $('#status-message');
const toastRegion = $('#toast-region');
const loading = window.Bl3ndLoading;
function loadingProgress(value, message) { loading?.update(value, message); }

const MOVE_SNAP_STORAGE_KEY = 'bl3nd-move-snap-v1';
const PROPORTIONAL_STORAGE_KEY = 'bl3nd-proportional-edit-v1';
let transformSnapSettingsOpen = false;
const formatSnapStep = (value, type = 'move') => `${Number(Number(value).toPrecision(6)).toString()}${type === 'rotate' ? '°' : type === 'scale' ? '×' : ''}`;
function loadTransformSnapSettings() {
  try { return normalizeTransformSnapSettings(JSON.parse(localStorage.getItem(MOVE_SNAP_STORAGE_KEY) || '{}')); }
  catch { return normalizeTransformSnapSettings(); }
}
function persistTransformSnapSettings(settings) {
  try { localStorage.setItem(MOVE_SNAP_STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* Browser storage may be unavailable; in-memory settings still work. */ }
}
function loadProportionalSettings() {
  try { return normalizeProportionalSettings(JSON.parse(localStorage.getItem(PROPORTIONAL_STORAGE_KEY) || '{}')); }
  catch { return normalizeProportionalSettings(); }
}
function persistProportionalSettings(settings) {
  try { localStorage.setItem(PROPORTIONAL_STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* Browser storage may be unavailable; in-memory settings still work. */ }
}

loadingProgress(6, 'Checking device and graphics capabilities…');
const capabilities = await detectCapabilities();
loadingProgress(22, 'Device profile ready · initializing the 3D renderer…');

function status(message) { if (statusEl) statusEl.textContent = message; }
function notify(message, type = '') {
  const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message;
  toastRegion.appendChild(toast); setTimeout(() => toast.remove(), 3000);
}

function minimizeMobilePropertiesPanel() {
  if (window.matchMedia('(max-width: 650px)').matches) {
    $('.properties-panel')?.classList.remove('mobile-open');
  }
}

$('#device-tier').textContent = `${capabilities.tier} Tier`;
$('#renderer-profile').textContent = capabilities.rendererPreference;
$('#memory-profile').textContent = capabilities.memory ? `${capabilities.memory} GB hint` : 'Not exposed';
$('#cpu-profile').textContent = String(capabilities.threads);
$('#storage-profile').textContent = capabilities.storage ? 'OPFS available' : 'Memory fallback';

let viewport;
try {
  viewport = new Viewport($('#viewport'), { pixelRatio: capabilities.pixelRatioCap, onStatus: status, onSelect: handleViewportSelection, onCursor: point => run('cursor.set', { point: point.toArray() }) });
} catch (error) {
  loading?.fail(error);
  throw error;
}
const sceneDocument = new SceneDocument(viewport.scene);
viewport.setContent(sceneDocument.content);
loadingProgress(43, 'Viewport created · preparing the scene document…');

let ui;
const undoManager = new UndoManager({
  maxEntries: capabilities.maxUndoEntries,
  status,
  onRestore: async snapshot => { await sceneDocument.restore(snapshot); await reapplyModifiers(); refresh(); }
});
const modalTransform = new ModalTransform({ document: sceneDocument, undoManager, viewport, status, transformSnapSettings: loadTransformSnapSettings(), proportionalSettings: loadProportionalSettings(), onChange: () => ui?.refreshModal() });
const loopCutModal = new LoopCutModal({ document: sceneDocument, undoManager, viewport, status, onChange: () => { refresh(); ui?.refreshModal(); } });
const bevelModal = new BevelModal({ document: sceneDocument, undoManager, viewport, status, onChange: () => { refresh(); ui?.refreshModal(); } });
const faceOperationModal = new FaceOperationModal({ document: sceneDocument, undoManager, viewport, status, onChange: () => { refresh(); ui?.refreshModal(); } });
viewport.onModalPointerStart = event => faceOperationModal.setPointerAnchor({ x: event.clientX, y: event.clientY });
const commandBus = new CommandBus({ undoManager, status });
const modifierStack = new ModifierStack({ onStatus: status });
const modelIO = new ModelIO(sceneDocument, notify);
loadingProgress(50, 'Scene document, undo history and model I/O are initialized…');

async function run(name, payload = {}) {
  try { return await commandBus.dispatch(name, { ...payload, document: sceneDocument }); }
  catch (error) { console.error(`[Bl3nd command: ${name}]`, error); notify(error?.message || String(error), 'error'); status(`Command failed · ${error?.message || name}`); return false; }
}

async function reapplyModifiers() {
  for (const mesh of sceneDocument.objects) if (mesh.userData.modifiers?.length) {
    try { await modifierStack.evaluate(mesh); } catch (error) { notify(error.message, 'error'); }
  }
}
async function reapplyActiveModifiers() {
  const mesh=sceneDocument.activeObject;
  if(mesh?.userData.modifiers?.length) { try { await modifierStack.evaluate(mesh); } catch(error) { notify(error.message,'error'); } }
}

function frameCurrentBevelTarget() {
  if (!bevelModal.active || bevelModal.mode !== 'face-region' || !bevelModal.mesh) return false;
  const sourceTopology = { positions: bevelModal.basePositions, faces: bevelModal.baseFaces };
  if (bevelModal.faceBevelMode === 'individual') {
    const faceId = bevelModal.seedFaceIds?.[bevelModal.activeFaceIndex];
    if (!Number.isInteger(faceId)) return false;
    const framed = viewport.frameSelection(bevelModal.mesh, sourceTopology, { focusFaceId: faceId });
    if (framed) bevelModal.startPointer = null;
    return framed;
  }
  const framed = viewport.frameSelection(bevelModal.mesh, sourceTopology, { faceIds: bevelModal.seedFaceIds || [] });
  if (framed) bevelModal.startPointer = null;
  return framed;
}

async function startFaceOperation(operation) {
  if (modalTransform.active || loopCutModal.active || bevelModal.active || faceOperationModal.active) {
    notify('Confirm or cancel the current operation before starting Extrude or Inset.');
    return false;
  }
  const selectedObject = sceneDocument.activeObject;
  const sourceTopology = selectedObject?.userData?.hem;
  const selectedFaceIds = [...(sourceTopology?.faceSelection || [])];
  const started = await faceOperationModal.begin(operation);
  if (!started) {
    notify(`${operation === 'extrude' ? 'Extrude' : 'Inset'} skipped · ${faceOperationModal.lastError || 'Unable to start the face operation.'}`, 'error');
    return false;
  }
  minimizeMobilePropertiesPanel();
  viewport.frameSelection(selectedObject, sourceTopology, { faceIds: selectedFaceIds });
  viewport.controls.enabled = false;
  viewport.selectionTool = 'tap';
  viewport.modalOperationActive = true;
  ui.refreshSelectionTool();
  $('#pie-menu').hidden = true;
  document.body.classList.add('face-operation-modal-active');
  refresh();
  ui.refreshModal();
  return true;
}

function initializeEditSelection(hem) {
  if (!hem || hem.vertexSelection.size || hem.edgeSelection.size || hem.faceSelection.size) return;
  if (sceneDocument.selectionMode === 'vertex') hem.vertexSelection = new Set(hem.vertices.map((_, id) => id));
  else if (sceneDocument.selectionMode === 'edge') hem.edgeSelection = new Set(hem.edges.map((_, id) => id));
  else hem.faceSelection = new Set(hem.faces.map((_, id) => id));
}

function registerCommands() {
  commandBus.register('object.add_primitive', ({ primitive = 'cube' }) => { const mesh = sceneDocument.addPrimitive(primitive); refresh(); viewport.frame(mesh); return mesh; });
  commandBus.register('object.delete', () => { const ok = sceneDocument.deleteActiveObject(); refresh(); return ok; });
  commandBus.register('object.select', ({ mesh = null }) => { sceneDocument.setActive(mesh); refresh(); }, { recordUndo: false });
  commandBus.register('mesh.select_from_hit', ({ mesh, faceId, event = null }) => {
    if (!mesh?.userData?.hem || faceId < 0) return false;
    if (sceneDocument.activeObject !== mesh) sceneDocument.setActive(mesh);
    const hem = mesh.userData.hem, face = hem.faces[faceId] || [], additive = Boolean(event?.shiftKey);
    mesh.updateMatrixWorld(true); viewport.camera.updateMatrixWorld(true);
    const rect = viewport.renderer.domElement.getBoundingClientRect();
    const screenPoint = id => {
      const projected = new THREE.Vector3(...hem.positions[id]).applyMatrix4(mesh.matrixWorld).project(viewport.camera);
      if (projected.z < -1 || projected.z > 1) return null;
      return { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2 };
    };
    const pxDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const pointer = { x: event?.clientX ?? rect.left + rect.width / 2, y: event?.clientY ?? rect.top + rect.height / 2 };
    if (sceneDocument.selectionMode === 'vertex') {
      let closest = -1, distance = Infinity;
      for (const id of face) { const point = screenPoint(id); if (!point) continue; const d = pxDistance(point, pointer); if (d < distance) { distance = d; closest = id; } }
      if (closest >= 0 && distance <= (matchMedia('(pointer: coarse)').matches ? 24 : 17)) hem.selectVertex(closest, additive);
    } else if (sceneDocument.selectionMode === 'edge') {
      const edgeIds = new Map(hem.edges.map(edge => [`${Math.min(...edge.vertices)}:${Math.max(...edge.vertices)}`, edge.id]));
      let closest = -1, distance = Infinity;
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length], pa = screenPoint(a), pb = screenPoint(b);
        if (!pa || !pb) continue;
        const dx = pb.x - pa.x, dy = pb.y - pa.y, length2 = dx*dx + dy*dy || 1;
        const t = Math.max(0, Math.min(1, ((pointer.x - pa.x)*dx + (pointer.y - pa.y)*dy) / length2));
        const d = Math.hypot(pointer.x - (pa.x + t*dx), pointer.y - (pa.y + t*dy));
        const edgeId = edgeIds.get(`${Math.min(a,b)}:${Math.max(a,b)}`);
        if (edgeId !== undefined && d < distance) { distance = d; closest = edgeId; }
      }
      if (closest >= 0 && distance <= (matchMedia('(pointer: coarse)').matches ? 20 : 13)) hem.selectEdge(closest, additive);
    } else hem.selectFace(faceId, additive);
    refresh();
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.clear_selection', () => { sceneDocument.activeObject?.userData.hem.clearSelection(); refresh(); }, { recordUndo: false });
  commandBus.register('mesh.select_all', () => {
    const hem = sceneDocument.activeObject?.userData?.hem; if (!hem) return false;
    hem.clearSelection();
    const target = sceneDocument.selectionMode === 'vertex' ? hem.vertexSelection : sceneDocument.selectionMode === 'edge' ? hem.edgeSelection : hem.faceSelection;
    const count = sceneDocument.selectionMode === 'vertex' ? hem.vertices.length : sceneDocument.selectionMode === 'edge' ? hem.edges.length : hem.faces.length;
    for (let id = 0; id < count; id++) target.add(id);
    refresh(); return true;
  }, { recordUndo: false });
  commandBus.register('mesh.invert_selection', () => {
    const hem = sceneDocument.activeObject?.userData?.hem; if (!hem) return false;
    const target = sceneDocument.selectionMode === 'vertex' ? hem.vertexSelection : sceneDocument.selectionMode === 'edge' ? hem.edgeSelection : hem.faceSelection;
    const count = sceneDocument.selectionMode === 'vertex' ? hem.vertices.length : sceneDocument.selectionMode === 'edge' ? hem.edges.length : hem.faces.length;
    const inverted = new Set(); for (let id = 0; id < count; id++) if (!target.has(id)) inverted.add(id);
    hem.clearSelection();
    if (sceneDocument.selectionMode === 'vertex') hem.vertexSelection = inverted;
    else if (sceneDocument.selectionMode === 'edge') hem.edgeSelection = inverted;
    else hem.faceSelection = inverted;
    refresh(); return true;
  }, { recordUndo: false });
  commandBus.register('view.set', ({ view }) => viewport.setView(view), { recordUndo: false });
  commandBus.register('view.frame', () => viewport.frame(sceneDocument.activeObject), { recordUndo: false });
  commandBus.register('shading.set', ({ mode }) => {
    sceneDocument.objects.forEach(mesh=>{mesh.material.wireframe=mode==='wire';mesh.material.needsUpdate=true;});
    notify(`${mode} shading`);
  }, { recordUndo: false });
  commandBus.register('object.set_transform', ({ kind, axis, value }) => {
    const mesh = sceneDocument.activeObject; if (!mesh || !['position','rotation','scale'].includes(kind) || !['x','y','z'].includes(axis)) return false;
    mesh[kind][axis] = kind === 'rotation' ? THREE.MathUtils.degToRad(Number(value) || 0) : Number(value);
    refresh(); return true;
  });
  commandBus.register('mode.toggle_edit', () => {
    sceneDocument.setMode(sceneDocument.mode === 'object' ? 'edit' : 'object');
    const hem = sceneDocument.activeObject?.userData.hem;
    if (hem) hem.setSelectionMode(sceneDocument.selectionMode);
    if (sceneDocument.mode === 'edit') initializeEditSelection(hem);
    refresh(); return true;
  }, { recordUndo: false });
  commandBus.register('mode.set', ({ mode }) => {
    sceneDocument.setMode(mode);
    const hem = sceneDocument.activeObject?.userData.hem;
    if (hem) hem.setSelectionMode(sceneDocument.selectionMode);
    if (sceneDocument.mode === 'edit') initializeEditSelection(hem);
    refresh();
  }, { recordUndo: false });
  commandBus.register('mesh.selection_mode', ({ mode }) => {
    sceneDocument.selectionMode = mode;
    sceneDocument.activeObject?.userData.hem.setSelectionMode(mode);
    refresh();
  }, { recordUndo: false });
  commandBus.register('mesh.extrude_region', async () => {
    if (sceneDocument.mode !== 'edit') return false;
    return startFaceOperation('extrude');
  }, { recordUndo: false });
  commandBus.register('mesh.inset', async () => {
    if (sceneDocument.mode !== 'edit') return false;
    return startFaceOperation('inset');
  }, { recordUndo: false });
  commandBus.register('mesh.face_operation_pointer', ({ point, fine = false }) => {
    faceOperationModal.pointerMove(point, fine);
    ui.refreshModal();
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.face_operation_input', ({ value }) => {
    faceOperationModal.appendNumeric(value);
    ui.refreshModal();
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.face_operation_nudge', ({ direction, fine = false }) => {
    const changed = faceOperationModal.nudge(direction, fine);
    ui.refreshModal();
    return changed;
  }, { recordUndo: false });
  commandBus.register('mesh.face_operation_confirm', async () => {
    const result = await faceOperationModal.confirm();
    viewport.controls.enabled = true;
    viewport.modalOperationActive = false;
    // Modal completion returns to click selection so touch drags immediately orbit.
    viewport.selectionTool = 'tap';
    ui.refreshSelectionTool();
    document.body.classList.remove('face-operation-modal-active');
    if (result) {
      await reapplyActiveModifiers();
      const insetDistance = result.operation === 'inset' && Number.isFinite(result.distance)
        ? ` · offset ${result.distance.toFixed(3)}` : '';
      notify(`${result.operation === 'extrude' ? 'Extrude' : 'Inset'} applied · ${result.selectedFaces} face(s) · ${result.insertedVertices} vertices · ${result.createdFaces} added faces · value ${result.value.toFixed(3)}${insetDistance}.`, 'success');
    }
    refresh(); ui.refreshModal();
    return Boolean(result);
  }, { recordUndo: false });
  commandBus.register('mesh.face_operation_cancel', async () => {
    const result = await faceOperationModal.cancel();
    viewport.controls.enabled = true;
    viewport.modalOperationActive = false;
    // Modal completion returns to click selection so touch drags immediately orbit.
    viewport.selectionTool = 'tap';
    ui.refreshSelectionTool();
    document.body.classList.remove('face-operation-modal-active');
    if (result) await reapplyModifiers();
    refresh(); ui.refreshModal();
    return result;
  }, { recordUndo: false });
  commandBus.register('mesh.delete', async () => {
    if (sceneDocument.mode !== 'edit') return false;
    const result = MeshOperators.deleteSelected(sceneDocument);
    if (!result) notify(`Select ${sceneDocument.selectionMode} elements before deleting.`);
    else await reapplyActiveModifiers();
    refresh(); return result;
  });
  commandBus.register('mesh.dissolve', async () => {
    if (sceneDocument.mode !== 'edit') return false;
    const result = MeshOperators.dissolveSelected(sceneDocument);
    if (!result) notify('This selection cannot be safely dissolved as one simple planar surface. Nothing was changed.');
    else await reapplyActiveModifiers();
    refresh(); return result;
  });
  commandBus.register('mesh.select_region', ({ tool, points, radius, additive }) => {
    if (sceneDocument.mode !== 'edit' || !sceneDocument.activeObject) return false;
    const result = SelectionOperators.selectRegion(sceneDocument.activeObject, viewport.camera,
      viewport.renderer.domElement, { tool, points, radius, additive });
    refresh(); return result;
  }, { recordUndo: false });
  commandBus.register('selection.tool.set', ({ tool = 'tap' }) => {
    if (!['tap', 'box', 'circle', 'lasso'].includes(tool)) return false;
    if (tool !== 'tap' && sceneDocument.mode !== 'edit') {
      notify('Region selection tools require Edit Mode.'); return false;
    }
    viewport.selectionTool = tool;
    ui?.refreshSelectionTool();
    status(tool === 'tap' ? 'Click selection active' : `${tool[0].toUpperCase() + tool.slice(1)} selection active · Esc returns to click selection`);
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.validate_topology', () => {
    const report = MeshOperators.validateTopology(sceneDocument);
    if (!report) { notify('Select a mesh before validating topology.'); return false; }
    console.info('[Bl3nd topology validation]', report);
    const c = report.counts;
    if (report.issueCount === 0) notify(`Topology check passed · ${c.boundaryEdges} boundary edges`, 'success');
    else notify(`Topology warnings · ${c.invalidPositions} invalid positions · ${c.invalidFaces} invalid faces · ${c.duplicateFaces} duplicates · ${c.nonManifoldEdges} non-manifold · ${c.inconsistentWinding} winding · ${c.nonPlanarFaces} non-planar · ${c.selfIntersectingFaces} self-intersecting · ${c.triangulationFailures} triangulation failures`, 'error');
    status(report.issueCount === 0 ? 'Topology validation passed' : `Topology validation found ${report.issueCount} issue(s)`);
    return report;
  }, { recordUndo: false });
  commandBus.register('mesh.repair_topology', async () => {
    if (sceneDocument.mode !== 'edit') return false;
    const result = MeshOperators.repairTopology(sceneDocument);
    if (!result) { notify('Select a mesh before repairing topology.'); return false; }
    if (result.changed) await reapplyActiveModifiers();
    const remaining = result.remaining;
    notify(`Safe repair · removed ${result.removedInvalidFaces} invalid face(s), ${result.removedDuplicateFaces} duplicate(s), flipped ${result.flippedFaces} face(s), removed ${result.removedIsolatedVertices} isolated vertex/vertices. ${remaining.issueCount} issue(s) remain.`, remaining.issueCount ? 'error' : 'success');
    console.info('[Bl3nd topology repair]', result);
    refresh(); return result;
  });
  commandBus.register('mesh.select_edge_loop', () => {
    const hem = sceneDocument.activeObject?.userData?.hem;
    if (sceneDocument.mode !== 'edit' || sceneDocument.selectionMode !== 'edge' || !hem) {
      notify('Switch to Edge Select and select at least one edge first.'); return false;
    }
    const before = hem.edgeSelection.size;
    const count = hem.expandEdgeLoopSelection();
    if (!count || hem.edgeSelection.size === before) notify('No quad continuation was found from the selected edge(s).');
    else status(`Edge loop selected · ${hem.edgeSelection.size} edge(s)`);
    refresh(); return count > 0;
  }, { recordUndo: false });
  commandBus.register('mesh.select_edge_ring', () => {
    const hem = sceneDocument.activeObject?.userData?.hem;
    if (sceneDocument.mode !== 'edit' || sceneDocument.selectionMode !== 'edge' || !hem) {
      notify('Switch to Edge Select and select at least one edge first.'); return false;
    }
    const before = hem.edgeSelection.size;
    const count = hem.expandEdgeRingSelection();
    const traversal = hem.lastRingTraversal || {};
    if (!count || hem.edgeSelection.size === before) notify('No unambiguous ring continuation was found. Extraordinary poles require a closed all-quad fan and one clearly opposite edge.');
    else status(`Edge ring selected · ${hem.edgeSelection.size} edge(s)${traversal.extraordinaryVertices ? ` · ${traversal.extraordinaryVertices} pole continuation(s)` : ''}`);
    refresh(); return count > 0;
  }, { recordUndo: false });
  commandBus.register('mesh.subdivide', async () => { if (sceneDocument.mode !== 'edit') return false; MeshOperators.subdivide(sceneDocument); await reapplyActiveModifiers(); refresh(); return true; });
  commandBus.register('mesh.bevel', async () => {
    if (modalTransform.active || loopCutModal.active || faceOperationModal.active) { notify('Confirm or cancel the current operation before starting Bevel.'); return false; }
    const selectedObject = sceneDocument.activeObject;
    const sourceTopology = selectedObject?.userData?.hem;
    const selection = {
      faceIds: [...(sourceTopology?.faceSelection || [])],
      edgeIds: [...(sourceTopology?.edgeSelection || [])],
      vertexIds: [...(sourceTopology?.vertexSelection || [])]
    };
    const started = await bevelModal.begin();
    if (!started) { notify(`Bevel skipped · ${bevelModal.lastError || 'Unable to start Bevel.'}`, 'error'); return false; }
    minimizeMobilePropertiesPanel();
    const framed = bevelModal.mode === 'face-region'
      ? frameCurrentBevelTarget()
      : viewport.frameSelection(selectedObject, sourceTopology, selection);
    if (framed) bevelModal.startPointer = null;
    viewport.controls.enabled = false;
    viewport.selectionTool = 'tap';
    viewport.modalOperationActive = true;
    ui.refreshSelectionTool();
    $('#pie-menu').hidden = true;
    document.body.classList.add('bevel-modal-active');
    refresh();
    ui.refreshModal();
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_pointer', ({ point, fine = false }) => {
    bevelModal.pointerMove(point, fine);
    ui.refreshModal();
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_input', ({ value }) => {
    bevelModal.appendNumeric(value);
    ui.refreshModal();
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_nudge', ({ direction, fine = false }) => {
    const changed = bevelModal.nudge(direction, fine);
    ui.refreshModal();
    return changed;
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_height', ({ delta }) => {
    const changed = bevelModal.setHeightAmount(bevelModal.heightAmount + Number(delta || 0));
    ui.refreshModal();
    return changed;
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_dimension_toggle', () => {
    const changed = bevelModal.toggleActiveDimension();
    ui.refreshModal();
    return changed;
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_face_mode_toggle', () => {
    const changed = bevelModal.toggleFaceBevelMode();
    if (changed) frameCurrentBevelTarget();
    ui.refreshModal();
    return changed;
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_face_target', ({ delta }) => {
    const changed = bevelModal.selectFaceTarget(delta);
    if (changed) frameCurrentBevelTarget();
    ui.refreshModal();
    return changed;
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_segments', ({ delta }) => {
    const changed = bevelModal.changeSegments(delta);
    ui.refreshModal();
    return changed;
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_profile', ({ delta, fine = false }) => {
    const changed = bevelModal.changeProfile(delta, fine);
    ui.refreshModal();
    return changed;
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_confirm', async () => {
    const result = await bevelModal.confirm();
    viewport.controls.enabled = true;
    viewport.modalOperationActive = false;
    // Return to click selection so the next touch drag is camera navigation,
    // not the previously armed Box/Circle/Lasso selection gesture.
    viewport.selectionTool = 'tap';
    ui.refreshSelectionTool();
    document.body.classList.remove('bevel-modal-active');
    if (result) {
      await reapplyActiveModifiers();
      if (String(result.operation || '').startsWith('face-')) {
        notify(`Face Bevel applied · ${result.selectedFaces} face(s) · ${result.reflexCorners || 0} reflex corner(s) · ${result.boundaryEdges} boundary edges · ${result.insertedVertices} vertices · width ${result.width.toFixed(3)} · height ${result.height.toFixed(3)}.`, 'success');
      } else {
        notify(`Bevel applied · ${result.bevelCount || 1} edge(s) · ${result.insertedVertices} vertices · ${result.createdFaces} faces · avg width ${result.width.toFixed(3)}.`, 'success');
      }
    }
    refresh(); ui.refreshModal();
    return Boolean(result);
  }, { recordUndo: false });
  commandBus.register('mesh.bevel_cancel', async () => {
    const result = await bevelModal.cancel();
    viewport.controls.enabled = true;
    viewport.modalOperationActive = false;
    // Return to click selection so the next touch drag is camera navigation,
    // not the previously armed Box/Circle/Lasso selection gesture.
    viewport.selectionTool = 'tap';
    ui.refreshSelectionTool();
    document.body.classList.remove('bevel-modal-active');
    if (result) await reapplyModifiers();
    refresh(); ui.refreshModal();
    return result;
  }, { recordUndo: false });
  commandBus.register('mesh.loop_cut', async () => {
    if (modalTransform.active || bevelModal.active || faceOperationModal.active) { notify('Confirm or cancel the current operation before starting Loop Cut.'); return false; }
    const selectedObject = sceneDocument.activeObject;
    const sourceTopology = selectedObject?.userData?.hem;
    const selection = { edgeIds: [...(sourceTopology?.edgeSelection || [])] };
    const started = await loopCutModal.begin();
    if (!started) { notify(`Loop Cut skipped · ${loopCutModal.lastError || 'Unable to start the cut.'}`, 'error'); return false; }
    minimizeMobilePropertiesPanel();
    if (viewport.frameSelection(selectedObject, sourceTopology, selection)) loopCutModal.startPointer = null;
    viewport.controls.enabled = false;
    viewport.selectionTool = 'tap';
    viewport.modalOperationActive = true;
    ui.refreshSelectionTool();
    $('#pie-menu').hidden = true;
    document.body.classList.add('loop-cut-modal-active');
    refresh();
    ui.refreshModal();
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.loop_cut_pointer', ({ point, fine = false }) => {
    loopCutModal.pointerMove(point, fine);
    ui.refreshModal();
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.loop_cut_input', ({ value }) => {
    loopCutModal.appendNumeric(value);
    ui.refreshModal();
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.loop_cut_nudge', ({ direction, fine = false }) => {
    loopCutModal.nudge(direction, fine);
    ui.refreshModal();
    return true;
  }, { recordUndo: false });
  commandBus.register('mesh.loop_cut_count', ({ delta }) => {
    const changed = loopCutModal.adjustCuts(delta);
    ui.refreshModal();
    return changed;
  }, { recordUndo: false });
  commandBus.register('mesh.loop_cut_confirm', async () => {
    const result = await loopCutModal.confirm();
    viewport.controls.enabled = true;
    viewport.modalOperationActive = false;
    // Modal completion returns to click selection so touch drags immediately orbit.
    viewport.selectionTool = 'tap';
    ui.refreshSelectionTool();
    document.body.classList.remove('loop-cut-modal-active');
    if (result) {
      await reapplyActiveModifiers();
      notify(`Loop Cut applied · ${result.cuts} cut(s) · ${result.insertedVertices} vertices · ${result.splitFaces} quads · slide ${result.offset.toFixed(2)}.`, 'success');
    }
    refresh(); ui.refreshModal();
    return Boolean(result);
  }, { recordUndo: false });
  commandBus.register('mesh.loop_cut_cancel', async () => {
    const result = await loopCutModal.cancel();
    viewport.controls.enabled = true;
    viewport.modalOperationActive = false;
    // Modal completion returns to click selection so touch drags immediately orbit.
    viewport.selectionTool = 'tap';
    ui.refreshSelectionTool();
    document.body.classList.remove('loop-cut-modal-active');
    if (result) await reapplyModifiers();
    refresh(); ui.refreshModal();
    return result;
  }, { recordUndo: false });
  commandBus.register('transform.modal_start', async ({ type, pointer }) => {
    transformSnapSettingsOpen = false;
    if (loopCutModal.active || bevelModal.active) { notify('Apply or cancel the current mesh operation before starting a transform.'); return false; }
    const started = await modalTransform.begin(type, pointer || ui.pointerOrigin());
    if (!started) notify('Select an object before transforming.');
    else minimizeMobilePropertiesPanel();
    viewport.controls.enabled = !started; ui.refreshModal(); return started;
  }, { recordUndo: false });
  commandBus.register('transform.modal_confirm', async () => { const result = await modalTransform.commit(); viewport.controls.enabled = true; await reapplyActiveModifiers(); refresh(); return result; }, { recordUndo: false });
  commandBus.register('transform.modal_cancel', async () => { const result = await modalTransform.cancel(); viewport.controls.enabled = true; await reapplyModifiers(); refresh(); return result; }, { recordUndo: false });
  commandBus.register('transform.modal_update', ({ point }) => { modalTransform.pointerMove(point); }, { recordUndo: false });
  commandBus.register('transform.modal_axis', ({ axis, plane = false }) => { modalTransform.setAxis(axis, plane); ui.refreshModal(); }, { recordUndo: false });
  commandBus.register('transform.modal_orientation_toggle', () => modalTransform.toggleOrientation(), { recordUndo: false });
  commandBus.register('transform.modal_input', ({ value }) => { modalTransform.appendNumeric(value); ui.refreshModal(); }, { recordUndo: false });
  commandBus.register('transform.snap_settings', ({ settings }) => {
    const next = modalTransform.setTransformSnapSettings(settings);
    persistTransformSnapSettings(next);
    return next;
  }, { recordUndo: false });
  commandBus.register('transform.proportional_settings', ({ settings }) => {
    const next = modalTransform.setProportionalSettings(settings);
    persistProportionalSettings(next);
    refresh();
    return next;
  }, { recordUndo: false });
  commandBus.register('transform.proportional_toggle', () => {
    const next = modalTransform.setProportionalSettings({ enabled: !modalTransform.proportionalSettings.enabled });
    persistProportionalSettings(next);
    refresh();
    return next.enabled;
  }, { recordUndo: false });
  commandBus.register('cursor.set', ({ point }) => { sceneDocument.cursor.fromArray(point); refreshCursor(); return true; }, { recordUndo: false });
  commandBus.register('pivot.set', ({ pivot }) => {
    if (!['median', 'bounds', 'individual', 'cursor'].includes(pivot)) return false;
    sceneDocument.pivot = pivot; refresh(); return true;
  }, { recordUndo: false });
  commandBus.register('modifier.add', async ({ type }) => {
    const mesh = sceneDocument.activeObject; if (!mesh) return notify('Select a mesh before adding a modifier.');
    modifierStack.add(mesh, type); await modifierStack.evaluate(mesh); refreshModifiers();
  });
  commandBus.register('modifier.remove', async ({ id }) => {
    const mesh = sceneDocument.activeObject; if (!mesh) return;
    mesh.userData.modifiers = mesh.userData.modifiers.filter(item => item.id !== id);
    if (mesh.userData.modifiers.length) await modifierStack.evaluate(mesh); else { modifierStack.clearEvaluation(mesh); sceneDocument.updateMesh(mesh); }
    refreshModifiers();
  });
  commandBus.register('modifier.toggle', async ({ id }) => {
    const mesh = sceneDocument.activeObject; const item = mesh?.userData.modifiers?.find(m => m.id === id); if (!item) return;
    item.enabled = !item.enabled; await modifierStack.evaluate(mesh); refreshModifiers();
  });
  commandBus.register('modifier.update', async ({ id, field, value }) => {
    const mesh = sceneDocument.activeObject; const item = mesh?.userData.modifiers?.find(m => m.id === id); if (!item) return;
    item[field] = field === 'count' || field === 'thickness' ? Number(value) : value;
    await modifierStack.evaluate(mesh); refreshModifiers();
  });
}
registerCommands();
loadingProgress(61, 'Modeling commands registered · preparing workspace controls…');

function faceIdForTriangle(hem, triangleIndex) {
  return hem.triangleFaceMap()[triangleIndex] ?? -1;
}
function handleViewportSelection(hit, pointer, event) {
  if (modalTransform.active || loopCutModal.active || bevelModal.active) return;
  if (!hit) {
    if (sceneDocument.mode === 'object') run('object.select',{mesh:null});
    else run('mesh.clear_selection');
    return;
  }
  if (sceneDocument.mode === 'object') { run('object.select',{mesh:hit.object}); return; }
  const faceId = faceIdForTriangle(hit.object.userData.hem, hit.faceIndex ?? 0);
  run('mesh.select_from_hit', { mesh: hit.object, faceId, event: event ? { clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey } : null });
}

function refreshCursor() {
  const p = sceneDocument.cursor;
  $('#cursor-coords').textContent = `X ${p.x.toFixed(2)} · Y ${p.y.toFixed(2)} · Z ${p.z.toFixed(2)}`;
  const projected = p.clone().project(viewport.camera), rect = $('#viewport').getBoundingClientRect();
  const el = $('#cursor-reticle'); el.style.left = `${(projected.x+1)*rect.width/2}px`; el.style.top = `${(-projected.y+1)*rect.height/2}px`; el.hidden = projected.z > 1;
}
function refreshModifiers() {
  const host = $('#modifier-list'), mesh = sceneDocument.activeObject, modifiers = mesh?.userData.modifiers || [];
  host.replaceChildren();
  if (!mesh) { host.innerHTML = '<div class="empty-state">Select a mesh to manage its modifiers.</div>'; return; }
  if (!modifiers.length) { host.innerHTML = '<div class="empty-state">No modifiers yet. Add one above.</div>'; return; }
  for (const mod of modifiers) {
    const card = document.createElement('div'); card.className='modifier-card';
    const title = document.createElement('header'); title.textContent = mod.type[0].toUpperCase()+mod.type.slice(1);
    const actions=document.createElement('span');
    const toggle=document.createElement('button'); toggle.textContent=mod.enabled?'On':'Off'; toggle.addEventListener('click',()=>run('modifier.toggle',{id:mod.id}));
    const remove=document.createElement('button'); remove.textContent='×'; remove.title='Remove modifier'; remove.addEventListener('click',()=>run('modifier.remove',{id:mod.id}));
    actions.append(toggle,remove); title.append(actions); card.append(title);
    const addField=(label,field,value,type='number')=>{
      const row=document.createElement('label'); row.textContent=label; const input=document.createElement('input'); input.type=type;
      if(type==='select') { input.outerHTML=''; }
      input.value=value; input.addEventListener('change',()=>run('modifier.update',{id:mod.id,field,value:input.value})); row.append(input); card.append(row);
    };
    if(mod.type==='mirror'){
      const row=document.createElement('label'); row.textContent='Axis'; const select=document.createElement('select');
      for(const axis of ['x','y','z']){const option=document.createElement('option');option.value=axis;option.textContent=axis.toUpperCase();select.append(option);} select.value=mod.axis;
      select.addEventListener('change',()=>run('modifier.update',{id:mod.id,field:'axis',value:select.value}));row.append(select);card.append(row);
    }
    if(mod.type==='array') addField('Copies','count',mod.count);
    if(mod.type==='solidify') addField('Thickness','thickness',mod.thickness);
    if(mod.type==='subdivision') { const note=document.createElement('div'); note.className='panel-note'; note.textContent='Triangle subdivision · one level per stack pass'; card.append(note); }
    host.append(card);
  }
}

function refresh() {
  $('#pivot-select').value = ['median', 'bounds', 'individual', 'cursor'].includes(sceneDocument.pivot) ? sceneDocument.pivot : 'median';
  const proportionalEnabled = $('#proportional-editing-enabled');
  const proportionalRadius = $('#proportional-editing-radius');
  if (proportionalEnabled) { proportionalEnabled.checked = modalTransform.proportionalSettings.enabled; proportionalEnabled.disabled = sceneDocument.mode !== 'edit'; }
  if (proportionalRadius) { proportionalRadius.value = String(Math.min(25, Math.max(0.1, modalTransform.proportionalSettings.radius))); proportionalRadius.disabled = sceneDocument.mode !== 'edit'; }
  const proportionalRadiusLabel = $('#proportional-editing-radius-value');
  if (proportionalRadiusLabel) proportionalRadiusLabel.textContent = modalTransform.proportionalSettings.radius.toFixed(2);
  $('#object-mode-btn').classList.toggle('active',sceneDocument.mode==='object');
  $('#edit-mode-btn').classList.toggle('active',sceneDocument.mode==='edit');
  $('#selection-vertex').classList.toggle('active',sceneDocument.selectionMode==='vertex');
  $('#selection-edge').classList.toggle('active',sceneDocument.selectionMode==='edge');
  $('#selection-face').classList.toggle('active',sceneDocument.selectionMode==='face');
  const editing = sceneDocument.mode === 'edit';
  const mobileProportionalButton = $('#mobile-proportional');
  const mobileProportionalPanel = $('#mobile-proportional-panel');
  const mobileProportionalRadius = $('#mobile-proportional-radius');
  const mobileProportionalRadiusValue = $('#mobile-proportional-radius-value');
  const proportionalEnabledState = modalTransform.proportionalSettings.enabled;
  if (mobileProportionalButton) {
    mobileProportionalButton.hidden = !editing;
    mobileProportionalButton.classList.toggle('active', proportionalEnabledState);
    mobileProportionalButton.setAttribute('aria-pressed', String(proportionalEnabledState));
    mobileProportionalButton.setAttribute('aria-label', `Proportional Editing ${proportionalEnabledState ? 'on' : 'off'}`);
    mobileProportionalButton.title = `Proportional Editing · ${proportionalEnabledState ? 'ON' : 'OFF'} · tap to toggle`;
    const smallLabel = mobileProportionalButton.querySelector('small');
    if (smallLabel) smallLabel.textContent = proportionalEnabledState ? 'Prop ON' : 'Prop OFF';
  }
  if (mobileProportionalPanel) mobileProportionalPanel.hidden = !editing || !proportionalEnabledState || modalTransform.active || viewport.modalOperationActive;
  if (mobileProportionalRadius) {
    if (document.activeElement !== mobileProportionalRadius) {
      mobileProportionalRadius.value = String(Math.min(25, Math.max(0.1, modalTransform.proportionalSettings.radius)));
    }
  }
  if (mobileProportionalRadiusValue) mobileProportionalRadiusValue.textContent = modalTransform.proportionalSettings.radius.toFixed(2);
  if (!editing && viewport.selectionTool !== 'tap') viewport.selectionTool = 'tap';
  ['selection-vertex','selection-edge','selection-face','select-all-btn','deselect-btn','selection-menu-btn','dissolve-panel-btn','validate-topology-btn','repair-topology-btn','loop-cut-btn'].forEach(id => { const control = document.getElementById(id); if (control) control.disabled = !editing; });
  $('#selection-vertex').setAttribute('aria-pressed', String(sceneDocument.selectionMode==='vertex'));
  $('#selection-edge').setAttribute('aria-pressed', String(sceneDocument.selectionMode==='edge'));
  $('#selection-face').setAttribute('aria-pressed', String(sceneDocument.selectionMode==='face'));
  viewport.updateEditOverlay(editing ? sceneDocument.activeObject : null, sceneDocument.selectionMode);
  const hintDesktop = $('.hint-desktop'), hintMobile = $('.hint-mobile');
  if (editing) {
    hintDesktop.textContent = 'Edit: Click topology · O proportional · Alt+L loop · Ctrl+Alt+L ring · Ctrl+B bevel · Ctrl+R loop cut · X delete';
    hintMobile.textContent = 'Edit: Tap topology · Prop in the bottom bar toggles proportional G/R/S · adjust radius in its panel or transform pad · Select ▾ for selection tools';
  } else {
    hintDesktop.textContent = 'Drag to orbit · Right-drag to pan · Scroll to zoom · Click to select · G/R/S then drag to transform';
    hintMobile.textContent = 'One finger: orbit · Two fingers: pan/zoom · Long press: 3D Cursor · G/R/S: transform';
  }
  const stats=sceneDocument.stats(); $('#object-count').textContent=`Objects: ${stats.objects}`;
  $('#mesh-stats').textContent=`Verts ${stats.vertices} · Edges ${stats.edges} · Faces ${stats.faces}`;
  $$('[data-transform]').forEach(input=>{
    const mesh=sceneDocument.activeObject,kind=input.dataset.transform,axis=input.dataset.axis;
    input.value=mesh ? (kind==='rotation'?THREE.MathUtils.radToDeg(mesh.rotation[axis]):mesh[kind][axis]).toFixed(2) : '';
    input.disabled=!mesh;
  });
  refreshCursor(); refreshModifiers(); ui?.refreshModal(); ui?.refreshSelectionTool();
}

ui = {
  async undo(){if(loopCutModal.active || bevelModal.active || faceOperationModal.active){notify('Apply or cancel the active mesh operation before undoing.');return;}if(!undoManager.canUndo){notify('Nothing to undo.');return;} await undoManager.undo();refresh();},
  async redo(){if(loopCutModal.active || bevelModal.active || faceOperationModal.active){notify('Apply or cancel the active mesh operation before redoing.');return;}if(!undoManager.canRedo){notify('Nothing to redo.');return;} await undoManager.redo();refresh();},
  togglePie(kind){
    const menu=$('#pie-menu');
    if(!menu.hidden && menu.dataset.kind===kind){menu.hidden=true;return;}
    const entries=kind==='shading'?
      [['Solid','shade_solid'],['Wireframe','shade_wire'],['Material','shade_material'],['Rendered','shade_render']]:
      kind==='selection'?
      [['Click Select','tool_tap'],['Box Select (B)','tool_box'],['Circle Select (C)','tool_circle'],['Lasso Select (L)','tool_lasso'],['Proportional Editing · '+(modalTransform.proportionalSettings.enabled?'ON':'OFF')+' (O)','toggle_proportional'],['Edge Loop (Alt+L)','edge_loop'],['Edge Ring (Ctrl+Alt+L)','edge_ring'],['Select All','select_all'],['Deselect All','clear_selection'],['Invert','invert_selection'],['Delete Selected (X)','delete_selected'],['Dissolve Selected (Shift+X)','dissolve_selected']]:
      [['Cube','add_cube'],['UV Sphere','add_sphere'],['Cylinder','add_cylinder'],['Plane','add_plane'],['Edit Mode','toggle_mode'],['3D Cursor','cursor_center']];
    menu.replaceChildren();
    for(const [label,command] of entries){const button=document.createElement('button');button.textContent=label;button.dataset.command=command;if(command==='toggle_proportional' && modalTransform.proportionalSettings.enabled)button.classList.add('is-enabled');menu.append(button);}
    menu.dataset.kind=kind; menu.hidden=false;
  },
  pointerCenter(){const rect=$('#viewport').getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2};},
  pointerOrigin(){return this.pointerCenter();},
  refreshSelectionTool(){
    const button=$('#selection-menu-btn'),tool=viewport.selectionTool||'tap';
    button.textContent=tool==='tap'?'Select ▾':`${tool[0].toUpperCase()+tool.slice(1)} ▾`;
    button.dataset.tool=tool;
    button.setAttribute('aria-label',`Selection tools · active: ${tool}`);
    button.setAttribute('aria-pressed',String(tool!=='tap'));
  },
  refreshModal(){
    viewport.updateTransformGuide(modalTransform.active ? modalTransform.getGuideState() : null);
    const readout=$('#modal-readout'),pad=$('#numeric-pad'),padTitle=pad.querySelector('.pad-title');
    const axisButtons=pad.querySelectorAll('[data-axis]');
    const orientationButton=$('#pad-transform-orientation');
    const proportionalControls=$('#pad-proportional-controls');
    const proportionalToggle=$('#pad-proportional-toggle');
    const proportionalRadius=$('#pad-proportional-radius');
    const proportionalRadiusValue=$('#pad-proportional-radius-value');
    proportionalControls.hidden=true;
    const mobileProportionalPanel=$('#mobile-proportional-panel');
    if(mobileProportionalPanel) mobileProportionalPanel.hidden=sceneDocument.mode!=='edit' || !modalTransform.proportionalSettings.enabled || modalTransform.active || viewport.modalOperationActive;
    const snapControls=$('#pad-transform-snap-controls');
    const snapButton=$('#pad-transform-snap-toggle');
    const snapSettingsButton=$('#pad-transform-snap-settings-toggle');
    const snapSettingsPanel=$('#pad-transform-snap-settings');
    const snapSettings=modalTransform.transformSnapSettings;
    const snapEnabledInput=$('#transform-snap-enabled');
    const snapType=modalTransform.active ? modalTransform.type : 'move';
    const snapKeys=getTransformSnapSettingKeys(snapType);
    const snapStepInputs=$$('[data-snap-setting]').map(input=>[input,input.dataset.snapSetting]);
    const mobileGlobalInput=$('#pad-transform-snap-global-step');
    const mobileLocalInput=$('#pad-transform-snap-local-step');
    if(document.activeElement!==snapEnabledInput) snapEnabledInput.checked=snapSettings.enabled;
    for(const [input,key] of snapStepInputs) if(document.activeElement!==input) input.value=String(snapSettings[key]);
    if(document.activeElement!==mobileGlobalInput) mobileGlobalInput.value=String(snapSettings[snapKeys.global]);
    if(document.activeElement!==mobileLocalInput) mobileLocalInput.value=String(snapSettings[snapKeys.local]);
    const labelType=snapType==='rotate'?'ROTATION':snapType.toUpperCase();
    $('#pad-snap-global-label').textContent=`GLOBAL ${labelType}`;
    $('#pad-snap-local-label').textContent=`LOCAL ${labelType}`;
    $('#pad-snap-help').textContent=snapType==='rotate'
      ? 'Axis drags snap in degrees. Typed rotation values stay exact.'
      : snapType==='scale'
        ? 'Axis drags snap by factor steps around 1.0. Typed scale values stay exact.'
        : 'Axis drags snap in world units. Typed Move values stay exact.';
    const canConfigureSnap=modalTransform.active && Boolean(modalTransform.axis) && ['move','rotate','scale'].includes(modalTransform.type);
    snapControls.hidden=!canConfigureSnap;
    snapSettingsPanel.hidden=!canConfigureSnap || !transformSnapSettingsOpen;
    const activeSnapStep=getTransformSnapStep(snapSettings,snapType,modalTransform.orientation);
    const activeSnapLabel=formatSnapStep(activeSnapStep,snapType);
    snapButton.textContent=snapSettings.enabled?`SNAP ON · ${activeSnapLabel}`:'SNAP OFF';
    snapButton.classList.toggle('is-enabled',snapSettings.enabled);
    snapButton.setAttribute('aria-pressed',String(snapSettings.enabled));
    snapButton.title=snapSettings.enabled
      ? `Pointer-driven ${snapType} on the ${modalTransform.orientation} axis snaps in ${activeSnapLabel}. Numeric input stays exact.`
      : `Snapping is off. Tap to enable axis-constrained ${snapType}.`;
    snapSettingsButton.textContent=transformSnapSettingsOpen?'HIDE STEPS ▴':'STEP SIZE ▾';
    snapSettingsButton.setAttribute('aria-expanded',String(transformSnapSettingsOpen));
    const padDetail=$('#pad-detail');
    orientationButton.hidden=true;
    padDetail.hidden=true;
    const negativeKey=pad.querySelector('[data-key="-"]');
    if(faceOperationModal.active){
      negativeKey.hidden=faceOperationModal.operation!=='extrude';
      const label=faceOperationModal.operation==='extrude'?'EXTRUDE':'INSET';
      const unit=faceOperationModal.operation==='extrude'?'distance':'amount';
      readout.hidden=false;
      const offsetDetail = faceOperationModal.operation==='inset' && Number.isFinite(faceOperationModal.lastResult?.distance)
        ? ` · offset ${faceOperationModal.lastResult.distance.toFixed(3)}` : '';
      const boundaryDetail = faceOperationModal.operation==='extrude' && Number.isFinite(faceOperationModal.lastResult?.boundaryEdges)
        ? ` · ${faceOperationModal.lastResult.boundaryEdges} boundary edges` : '';
      readout.textContent=`${label} · ${faceOperationModal.seedFaceIds.length} face(s)${boundaryDetail} · ${unit} ${faceOperationModal.value.toFixed(3)}${offsetDetail} · drag up/down or arrows · Enter apply / Esc cancel`;
      pad.hidden=!capabilities.tier.includes('Mobile');
      pad.classList.remove('loop-cut-mode','bevel-mode');
      pad.classList.add('face-operation-mode');
      padTitle.textContent=faceOperationModal.operation==='extrude'?'EXTRUDE DISTANCE · ±100':'INSET AMOUNT · 0.005–0.9';
      axisButtons.forEach(button=>button.hidden=true);
      $('#pad-value').textContent=faceOperationModal.numeric || faceOperationModal.value.toFixed(3);
      $('#pad-count-row').hidden=true;
      $('#pad-bevel-segments-row').hidden=true;
      $('#pad-bevel-profile-row').hidden=true;
      $('#pad-bevel-height-row').hidden=true;
      $('#pad-bevel-dimension-toggle').hidden=true;
      $('#pad-bevel-face-target-row').hidden=true;
      $('#pad-bevel-mode-toggle').hidden=true;
      return;
    }
    if(bevelModal.active){
      negativeKey.hidden=true;
      const faceRegion = bevelModal.mode === 'face-region';
      readout.hidden=false;
      const individualFace = faceRegion && bevelModal.faceBevelMode === 'individual';
      const curvedSurface = faceRegion && bevelModal.faceBevelMode === 'curved-region';
      const multiRegion = faceRegion && bevelModal.faceBevelMode === 'multi-region';
      const activeFaceId = individualFace ? bevelModal.seedFaceIds[bevelModal.activeFaceIndex] : null;
      const activeFaceResult = individualFace
        ? bevelModal.lastResult?.perFace?.find(item => item.faceId === activeFaceId)
        : bevelModal.lastResult;
      readout.textContent=faceRegion
        ? `FACE BEVEL · ${individualFace ? `INDIVIDUAL ${bevelModal.activeFaceIndex + 1}/${bevelModal.seedFaceIds.length}` : curvedSurface ? 'CONTINUOUS SURFACE' : multiRegion ? `MULTI-REGION ${bevelModal.lastResult?.regionCount || 0}` : 'CONNECTED REGION'} · ${bevelModal.lastResult?.selectedFaces || bevelModal.seedFaceIds.length} face(s) · ${bevelModal.segments} segment(s) · Profile ${bevelModal.profile.toFixed(2)} · Width ${activeFaceResult?.width?.toFixed(3) || '—'} · Height ${activeFaceResult?.height?.toFixed(3) || '—'} · Drag / arrows / type: ${bevelModal.activeDimension} · H switches · I changes mode${individualFace ? ' · PageUp/PageDown changes face' : ''} · Enter apply / Esc cancel`
        : `BEVEL · ${bevelModal.seedEdgeIds.length} edge(s) · ${bevelModal.segments} segment(s) · Profile ${bevelModal.profile.toFixed(2)} · Amount ${bevelModal.amount.toFixed(2)} · Drag / arrows: width · +/-: segments · [ ]: profile · Enter apply / Esc cancel`;
      pad.hidden=!capabilities.tier.includes('Mobile');
      pad.classList.remove('loop-cut-mode','bevel-mode');
      pad.classList.add('bevel-mode');
      padTitle.textContent=faceRegion?`FACE BEVEL ${bevelModal.activeDimension.toUpperCase()} · 0.01–0.95`:'BEVEL WIDTH · 0.01–0.95';
      axisButtons.forEach(button=>button.hidden=true);
      $('#pad-value').textContent=bevelModal.numeric || (faceRegion && bevelModal.activeDimension==='height' ? bevelModal.heightAmount : bevelModal.amount).toFixed(2);
      $('#pad-count-row').hidden=true;
      $('#pad-bevel-segments-row').hidden=false;
      $('#pad-bevel-profile-row').hidden=false;
      $('#pad-bevel-height-row').hidden=!faceRegion;
      $('#pad-bevel-dimension-toggle').hidden=!faceRegion;
      $('#pad-bevel-height').textContent=bevelModal.heightAmount.toFixed(2);
      $('#pad-bevel-dimension-toggle').textContent=`EDIT ${bevelModal.activeDimension==='width'?'HEIGHT':'WIDTH'}`;
      $('#pad-bevel-face-target-row').hidden=!individualFace || bevelModal.seedFaceIds.length < 2;
      $('#pad-bevel-face-index').textContent=String(bevelModal.activeFaceIndex + 1);
      $('#pad-bevel-face-count').textContent=String(bevelModal.seedFaceIds.length);
      const hasMultiRegionAlternative = bevelModal.hasMultiRegionCandidate();
      const hasSharedAlternative = bevelModal.hasContinuousCurvedRegionCandidate() || bevelModal.hasPlanarRegionCandidate() || hasMultiRegionAlternative;
      $('#pad-bevel-mode-toggle').hidden=!faceRegion || bevelModal.seedFaceIds.length < 2 || (individualFace && !hasSharedAlternative);
      $('#pad-bevel-mode-toggle').textContent=individualFace
        ? (bevelModal.hasContinuousCurvedRegionCandidate()?'CONTINUOUS SURFACE':hasMultiRegionAlternative?'MULTI-REGION':'USE REGION MODE')
        : 'INDIVIDUAL FACES';
      $('#pad-bevel-segments').textContent=String(bevelModal.segments);
      $('#pad-bevel-profile').textContent=bevelModal.profile.toFixed(2);
      return;
    }
    if(loopCutModal.active){
      negativeKey.hidden=true;
      readout.hidden=false;
      readout.textContent=`LOOP CUT · ${loopCutModal.cuts} cut(s) · Offset ${loopCutModal.offset.toFixed(2)} · Wheel / +/- count · Enter apply / Esc cancel`;
      pad.hidden=!capabilities.tier.includes('Mobile');
      pad.classList.remove('bevel-mode');
      pad.classList.add('loop-cut-mode');
      padTitle.textContent='CUT OFFSET · TYPE 0–1';
      axisButtons.forEach(button=>button.hidden=true);
      $('#pad-value').textContent=loopCutModal.numeric || loopCutModal.offset.toFixed(2);
      $('#pad-count-row').hidden=false;
      $('#pad-cuts').textContent=String(loopCutModal.cuts);
      $('#pad-bevel-segments-row').hidden=true;
      $('#pad-bevel-profile-row').hidden=true;
      $('#pad-bevel-height-row').hidden=true;
      $('#pad-bevel-dimension-toggle').hidden=true;
      $('#pad-bevel-face-target-row').hidden=true;
      $('#pad-bevel-mode-toggle').hidden=true;
      return;
    }
    pad.classList.remove('loop-cut-mode','bevel-mode','face-operation-mode');
    $('#pad-count-row').hidden=true;
    $('#pad-bevel-segments-row').hidden=true;
    $('#pad-bevel-profile-row').hidden=true;
    $('#pad-bevel-height-row').hidden=true;
    $('#pad-bevel-dimension-toggle').hidden=true;
    $('#pad-bevel-face-target-row').hidden=true;
    $('#pad-bevel-mode-toggle').hidden=true;
    padTitle.textContent='TRANSFORM VALUE';
    axisButtons.forEach(button=>button.hidden=false);
    negativeKey.hidden=false;
    if(!modalTransform.active){readout.hidden=true;pad.hidden=true;snapControls.hidden=true;snapSettingsPanel.hidden=true;transformSnapSettingsOpen=false;return;}
    const axis=modalTransform.axis?` · ${modalTransform.orientation.toUpperCase()} ${modalTransform.axis.toUpperCase()} axis`:modalTransform.planeNormal?` · ${modalTransform.orientation.toUpperCase()} ${modalTransform.planeNormal.toUpperCase()} plane`:` · ${modalTransform.orientation.toUpperCase()} orientation`;
    const proportionalReadout = sceneDocument.mode === 'edit' && modalTransform.proportionalSettings.enabled
      ? ` · PROP r ${modalTransform.proportionalSettings.radius.toFixed(2)} · ${modalTransform.proportionalInfluencedCount} influenced`
      : '';
    let moveReadout=null;
    let transformPadValue='0';
    if(modalTransform.type==='move'){
      const numeric=modalTransform.numeric.trim()!=='' && Number.isFinite(Number(modalTransform.numeric));
      const previewDelta=modalTransform.getMoveWorldDelta(numeric);
      const startPosition=sceneDocument.mode==='edit'
        ? modalTransform.worldPivot.toArray()
        : modalTransform.original?.worldPosition?.toArray() || [0,0,0];
      const previewTarget=sceneDocument.mode==='edit'
        ? startPosition.map((value,index)=>value+previewDelta.getComponent(index))
        : modalTransform.object?.getWorldPosition(new THREE.Vector3()).toArray()
          || startPosition.map((value,index)=>value+previewDelta.getComponent(index));
      const liveDelta=previewTarget.map((value,index)=>value-startPosition[index]);
      moveReadout=buildMoveReadout({
        delta:liveDelta,
        startPosition,
        axisVector:modalTransform.axis ? modalTransform.axisVector(modalTransform.axis).toArray() : null,
        targetLabel:sceneDocument.mode==='edit'?'PIVOT':'TO'
      });
      const positionKind=sceneDocument.mode==='edit'?'PIVOT':'WORLD';
      const primaryPosition=moveReadout.positionAxis ? `${moveReadout.positionAxis} ${moveReadout.positionValue}` : null;
      const primaryLabel=primaryPosition ? `${positionKind} ${primaryPosition}` : `DIST ${moveReadout.value}`;
      const snapFeedback=modalTransform.axis
        ? numeric ? (snapSettings.enabled?' · EXACT INPUT (SNAP BYPASSED)':' · EXACT INPUT')
          : snapSettings.enabled ? ` · SNAP ${formatSnapStep(activeSnapStep)}` : ' · SNAP OFF'
        : '';
      readout.textContent=`MOVE${axis} · ${numeric?`VALUE ${modalTransform.numeric}`:primaryLabel}${snapFeedback}${proportionalReadout} · ${moveReadout.targetText} · Enter apply / Esc cancel`;
      padTitle.textContent=!numeric && primaryPosition
        ? `${positionKind} ${moveReadout.positionAxis} POSITION`
        : numeric ? 'MOVE INPUT · WORLD UNITS' : 'MOVE DISTANCE · WORLD UNITS';
      transformPadValue=modalTransform.numeric || moveReadout.positionValue || moveReadout.value || '0';
      padDetail.hidden=false;
      const [dx,dy,dz]=moveReadout.delta;
      const [tx,ty,tz]=moveReadout.target;
      const signed=(value)=>`${value< -0.0005?'−':'+'}${Math.abs(value)<0.0005?'0.000':Math.abs(value).toFixed(3)}`;
      $('#pad-delta-x').textContent=`X ${signed(dx)}`;
      $('#pad-delta-y').textContent=`Y ${signed(dy)}`;
      $('#pad-delta-z').textContent=`Z ${signed(dz)}`;
      $('#pad-target-label').textContent=sceneDocument.mode==='edit'?'PIVOT':'TO';
      $('#pad-target-x').textContent=`X ${signed(tx)}`;
      $('#pad-target-y').textContent=`Y ${signed(ty)}`;
      $('#pad-target-z').textContent=`Z ${signed(tz)}`;
    }else{
      const numeric=modalTransform.numeric.trim()!=='' && Number.isFinite(Number(modalTransform.numeric));
      const snapFeedback=modalTransform.axis
        ? numeric ? (snapSettings.enabled?' · EXACT INPUT (SNAP BYPASSED)':' · EXACT INPUT')
          : snapSettings.enabled ? ` · SNAP ${activeSnapLabel}` : ' · SNAP OFF'
        : '';
      if(modalTransform.type==='rotate'){
        const angle=modalTransform.rotationPointerDegrees();
        transformPadValue=modalTransform.numeric || (angle===null?'TRACKBALL':`${angle.toFixed(2)}°`);
        const angleReadout=modalTransform.numeric ? `VALUE ${modalTransform.numeric}` : angle===null ? 'TRACKBALL' : `ANGLE ${angle.toFixed(2)}°`;
        readout.textContent=`ROTATE${axis} · ${angleReadout}${snapFeedback}${proportionalReadout} · , switches Global/Local · Enter apply / Esc cancel`;
        padTitle.textContent='ROTATION · DEGREES';
      }else{
        const factor=modalTransform.scaleFactor(numeric);
        transformPadValue=modalTransform.numeric || `${factor.toFixed(3)}×`;
        readout.textContent=`SCALE${axis} · ${numeric?`VALUE ${modalTransform.numeric}`:`FACTOR ${factor.toFixed(3)}×`}${snapFeedback}${proportionalReadout} · , switches Global/Local · Enter apply / Esc cancel`;
        padTitle.textContent='SCALE FACTOR';
      }
    }
    pad.hidden=!capabilities.tier.includes('Mobile');
    proportionalControls.hidden=!capabilities.tier.includes('Mobile') || sceneDocument.mode!=='edit';
    proportionalToggle.textContent=modalTransform.proportionalSettings.enabled?'PROPORTIONAL · ON':'PROPORTIONAL · OFF';
    proportionalToggle.classList.toggle('is-enabled',modalTransform.proportionalSettings.enabled);
    proportionalToggle.setAttribute('aria-pressed',String(modalTransform.proportionalSettings.enabled));
    proportionalRadius.hidden=!modalTransform.proportionalSettings.enabled;
    proportionalRadius.value=String(Math.min(25,Math.max(0.1,modalTransform.proportionalSettings.radius)));
    proportionalRadiusValue.textContent=modalTransform.proportionalSettings.radius.toFixed(2);
    orientationButton.hidden=false; orientationButton.textContent=`${modalTransform.orientation.toUpperCase()} AXES · SWITCH TO ${modalTransform.orientation==='global'?'LOCAL':'GLOBAL'}`; orientationButton.setAttribute('aria-label',`Current orientation: ${modalTransform.orientation}. Switch to ${modalTransform.orientation==='global'?'Local':'Global'}.`); orientationButton.setAttribute('aria-pressed',String(modalTransform.orientation==='local')); $('#pad-value').textContent=transformPadValue;
  }
};
loadingProgress(73, 'Building the workspace panels and editing controls…');

// Header, panels, tools and mobile quick actions all route into the command bus.
$('#undo-btn').addEventListener('click',()=>ui.undo()); $('#redo-btn').addEventListener('click',()=>ui.redo());
$('#object-mode-btn').addEventListener('click',()=>run('mode.set',{mode:'object'}));
$('#edit-mode-btn').addEventListener('click',()=>run('mode.set',{mode:'edit'}));
$('#save-btn').addEventListener('click',async()=>{try{await modelIO.exportFile('glb');}catch(e){notify(e.message,'error');}});
$('#open-btn').addEventListener('click',()=>$('#file-input').click());
$('#file-input').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{const meshes=await modelIO.importFile(file);const issues=meshes.reduce((sum,mesh)=>sum+(mesh.userData.hem?.validateTopology().issueCount||0),0);if(issues)notify(`Imported mesh validation found ${issues} topology issue(s). Use Validate Mesh for details.`,'error');refresh();viewport.frame(meshes[0]);}catch(e){notify(e.message,'error');}finally{event.target.value='';}});
$('#add-menu-btn').addEventListener('click',()=>ui.togglePie('add'));
$('#mobile-add').addEventListener('click',()=>ui.togglePie('add'));
$('#mobile-move').addEventListener('click',()=>run('transform.modal_start',{type:'move',pointer:ui.pointerOrigin()}));
$('#mobile-rotate').addEventListener('click',()=>run('transform.modal_start',{type:'rotate',pointer:ui.pointerOrigin()}));
$('#mobile-scale').addEventListener('click',()=>run('transform.modal_start',{type:'scale',pointer:ui.pointerOrigin()}));
$('#mobile-proportional').addEventListener('click',()=>run('transform.proportional_toggle'));
$('#mobile-proportional-radius').addEventListener('input',event=>{
  const radius=Number(event.target.value);
  $('#mobile-proportional-radius-value').textContent=radius.toFixed(2);
  run('transform.proportional_settings',{settings:{radius}});
});
$('#mobile-edit').addEventListener('click',()=>run('mode.toggle_edit'));
$('#mobile-more').addEventListener('click',()=>$('.properties-panel').classList.toggle('mobile-open'));
$$('[data-tool]').forEach(button=>button.addEventListener('click',()=>{
  $$('.tool-button').forEach(item=>item.classList.remove('selected'));button.classList.add('selected');
  const tool=button.dataset.tool;
  if(['move','rotate','scale'].includes(tool))run('transform.modal_start',{type:tool,pointer:ui.pointerOrigin()});
}));
$('#extrude-btn').addEventListener('click',()=>run('mesh.extrude_region')); $('#extrude-panel-btn').addEventListener('click',()=>run('mesh.extrude_region')); $('#mobile-extrude').addEventListener('click',()=>run('mesh.extrude_region'));
$('#inset-btn').addEventListener('click',()=>run('mesh.inset')); $('#inset-panel-btn').addEventListener('click',()=>run('mesh.inset'));
$('#delete-btn').addEventListener('click',()=>sceneDocument.mode==='edit'?run('mesh.delete'):run('object.delete'));
$('#delete-panel-btn').addEventListener('click',()=>run('mesh.delete')); $('#subdivide-btn').addEventListener('click',()=>run('mesh.subdivide'));
$('#selection-vertex').addEventListener('click',()=>run('mesh.selection_mode',{mode:'vertex'}));
$('#selection-edge').addEventListener('click',()=>run('mesh.selection_mode',{mode:'edge'}));
$('#selection-face').addEventListener('click',()=>run('mesh.selection_mode',{mode:'face'}));
$('#select-all-btn').addEventListener('click',()=>run('mesh.select_all'));
$('#deselect-btn').addEventListener('click',()=>run('mesh.clear_selection'));
$('#selection-menu-btn').addEventListener('click',()=>ui.togglePie('selection'));
$('#dissolve-panel-btn').addEventListener('click',()=>run('mesh.dissolve'));
$('#bevel-panel-btn').addEventListener('click',()=>run('mesh.bevel'));
$('#validate-topology-btn').addEventListener('click',()=>run('mesh.validate_topology'));
$('#repair-topology-btn').addEventListener('click',()=>run('mesh.repair_topology')); $('#loop-cut-btn').addEventListener('click',()=>run('mesh.loop_cut'));
$('#frame-btn').addEventListener('click',()=>run('view.frame'));
$('#proportional-editing-enabled').addEventListener('change',event=>run('transform.proportional_settings',{settings:{enabled:event.target.checked}}));
$('#proportional-editing-radius').addEventListener('input',event=>{
  const radius=Number(event.target.value);$('#proportional-editing-radius-value').textContent=radius.toFixed(2);
  run('transform.proportional_settings',{settings:{radius}});
});
$('#pad-proportional-radius').addEventListener('input',event=>{
  const radius=Number(event.target.value);$('#pad-proportional-radius-value').textContent=radius.toFixed(2);
  run('transform.proportional_settings',{settings:{radius}});
});
$('#pivot-select').addEventListener('change',event=>run('pivot.set',{pivot:event.target.value}));
$('#transform-snap-enabled').addEventListener('change',event=>run('transform.snap_settings',{settings:{enabled:event.target.checked}}));
const mobileSnapInputRoles=[
  [$('#pad-transform-snap-global-step'),'global'],
  [$('#pad-transform-snap-local-step'),'local']
];
const snapStepBindings=[
  ...$$('[data-snap-setting]').map(input=>[input,input.dataset.snapSetting]),
  ...mobileSnapInputRoles
];
for (const [input,setting] of snapStepBindings) {
  input.addEventListener('change',event=>{
    const key=setting==='global' || setting==='local'
      ? getTransformSnapSettingKeys(modalTransform.active ? modalTransform.type : 'move')[setting]
      : setting;
    const value=Number(event.target.value);
    if(!Number.isFinite(value) || value<=0){
      event.target.value=String(modalTransform.transformSnapSettings[key]);
      notify('Snap step must be a number greater than zero.','error');
      return;
    }
    const normalized=normalizeTransformSnapSettings({[key]:value},modalTransform.transformSnapSettings);
    event.target.value=String(normalized[key]);
    run('transform.snap_settings',{settings:{[key]:normalized[key]}});
  });
}
$$('[data-view]').forEach(button=>button.addEventListener('click',()=>run('view.set',{view:button.dataset.view})));
$$('[data-modifier]').forEach(button=>button.addEventListener('click',()=>run('modifier.add',{type:button.dataset.modifier})));
$$('[data-panel]').forEach(button=>button.addEventListener('click',()=>{
  $$('.panel-tab').forEach(item=>item.classList.toggle('active',item===button));
  $$('.panel-content').forEach(item=>item.hidden=item.id!==`panel-${button.dataset.panel}`);
  if(matchMedia('(max-width:650px)').matches) $('.properties-panel').classList.add('mobile-open');
}));
$$('[data-transform]').forEach(input=>input.addEventListener('change',()=>run('object.set_transform',{kind:input.dataset.transform,axis:input.dataset.axis,value:input.value})));
$('#pie-menu').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-command]');if(!button)return;const command=button.dataset.command;$('#pie-menu').hidden=true;
  if(command.startsWith('add_')) await run('object.add_primitive',{primitive:command.slice(4)});
  else if(command==='toggle_mode') await run('mode.toggle_edit');
  else if(command==='cursor_center') await run('cursor.set',{point:viewport.controls.target.toArray()});
  else if(command==='select_all') await run('mesh.select_all');
  else if(command==='clear_selection') await run('mesh.clear_selection');
  else if(command==='invert_selection') await run('mesh.invert_selection');
  else if(command.startsWith('tool_')) await run('selection.tool.set',{tool:command.slice(5)});
  else if(command==='delete_selected') await run('mesh.delete');
  else if(command==='dissolve_selected') await run('mesh.dissolve');
  else if(command==='edge_loop') await run('mesh.select_edge_loop');
  else if(command==='edge_ring') await run('mesh.select_edge_ring');
  else if(command==='toggle_proportional') await run('transform.proportional_toggle');
  else if(command.startsWith('shade_')){
    await run('shading.set',{mode:command.slice(6)});
  }
});
$('#shading-btn').addEventListener('click',()=>ui.togglePie('shading'));
$('#numeric-pad').addEventListener('click',async event=>{
  if(modalTransform.active && event.target.closest('#pad-transform-snap-settings-toggle')){
    transformSnapSettingsOpen=!transformSnapSettingsOpen;
    ui.refreshModal();
    return;
  }
  if(modalTransform.active && event.target.closest('#pad-transform-snap-toggle')){
    await run('transform.snap_settings',{settings:{enabled:!modalTransform.transformSnapSettings.enabled}});
    return;
  }
  if(modalTransform.active && event.target.closest('#pad-transform-orientation')){await run('transform.modal_orientation_toggle');return;}
  if(modalTransform.active && event.target.closest('#pad-proportional-toggle')){await run('transform.proportional_toggle');return;}
  if(faceOperationModal.active){
    const faceKeyButton=event.target.closest('button[data-key]');if(!faceKeyButton)return;const faceKey=faceKeyButton.dataset.key;
    if(faceKey==='enter'){await run('mesh.face_operation_confirm');return;}
    if(faceKey==='escape'){await run('mesh.face_operation_cancel');return;}
    await run('mesh.face_operation_input',{value:faceKey});return;
  }
  if(bevelModal.active){
    const segmentButton=event.target.closest('button[data-bevel-segments]');
    if(segmentButton){await run('mesh.bevel_segments',{delta:Number(segmentButton.dataset.bevelSegments)});return;}
    const profileButton=event.target.closest('button[data-bevel-profile]');
    if(profileButton){await run('mesh.bevel_profile',{delta:Number(profileButton.dataset.bevelProfile)});return;}
    const heightButton=event.target.closest('button[data-bevel-height]');
    if(heightButton){await run('mesh.bevel_height',{delta:Number(heightButton.dataset.bevelHeight)});return;}
    const faceTargetButton=event.target.closest('button[data-bevel-face-target]');
    if(faceTargetButton){await run('mesh.bevel_face_target',{delta:Number(faceTargetButton.dataset.bevelFaceTarget)});return;}
    if(event.target.closest('#pad-bevel-dimension-toggle')){await run('mesh.bevel_dimension_toggle');return;}
    if(event.target.closest('#pad-bevel-mode-toggle')){await run('mesh.bevel_face_mode_toggle');return;}
    const bevelKey=event.target.closest('button[data-key]');if(!bevelKey)return;const key=bevelKey.dataset.key;
    if(key==='enter'){await run('mesh.bevel_confirm');return;}
    if(key==='escape'){await run('mesh.bevel_cancel');return;}
    if(key==='-'){await run('mesh.bevel_segments',{delta:-1});return;}
    await run('mesh.bevel_input',{value:key});return;
  }
  if(loopCutModal.active){
    const countButton=event.target.closest('button[data-cuts]');if(countButton){await run('mesh.loop_cut_count',{delta:Number(countButton.dataset.cuts)});return;}
    const cutButton=event.target.closest('button[data-key]');if(!cutButton)return;const cutKey=cutButton.dataset.key;
    if(cutKey==='enter'){await run('mesh.loop_cut_confirm');return;}
    if(cutKey==='escape'){await run('mesh.loop_cut_cancel');return;}
    if(cutKey==='-'){await run('mesh.loop_cut_nudge',{direction:-1});return;}
    await run('mesh.loop_cut_input',{value:cutKey});return;
  }
  const axisButton=event.target.closest('button[data-axis]');
  if(axisButton){
    await run('transform.modal_axis',{axis:axisButton.dataset.axis,plane:axisButton.dataset.plane==='true'});
    return;
  }
  const button=event.target.closest('button[data-key]');if(!button)return;const key=button.dataset.key;
  if(key==='enter'){await run('transform.modal_confirm');return;}
  if(key==='escape'){await run('transform.modal_cancel');return;}
  await commandBus.dispatch('transform.modal_input',{value:key});
});

const viewportCanvas=viewport.renderer.domElement;
viewportCanvas.addEventListener('wheel',event=>{
  if(faceOperationModal.active){event.preventDefault();commandBus.dispatch('mesh.face_operation_nudge',{direction:event.deltaY<0?1:-1});ui.refreshModal();return;}
  if(bevelModal.active){event.preventDefault();commandBus.dispatch('mesh.bevel_nudge',{direction:event.deltaY<0?1:-1});ui.refreshModal();return;}
  if(modalTransform.active && sceneDocument.mode==='edit' && modalTransform.proportionalSettings.enabled){
    event.preventDefault();
    const current=modalTransform.proportionalSettings.radius;
    const radius=Math.max(0.1,Math.min(25,current*(event.deltaY<0?1.1:1/1.1)));
    commandBus.dispatch('transform.proportional_settings',{settings:{radius}});return;
  }
  if(!loopCutModal.active)return;
  event.preventDefault();
  commandBus.dispatch('mesh.loop_cut_count',{delta:event.deltaY<0?1:-1});
  ui.refreshModal();
},{passive:false});
window.addEventListener('pointermove',event=>{
  if(faceOperationModal.active && (event.target===viewportCanvas || viewportCanvas.contains(event.target))){commandBus.dispatch('mesh.face_operation_pointer',{point:{x:event.clientX,y:event.clientY},fine:event.shiftKey});ui.refreshModal();return;}
  if(bevelModal.active && (event.target===viewportCanvas || viewportCanvas.contains(event.target))){commandBus.dispatch('mesh.bevel_pointer',{point:{x:event.clientX,y:event.clientY},fine:event.shiftKey});ui.refreshModal();return;}
  if(loopCutModal.active && (event.target===viewportCanvas || viewportCanvas.contains(event.target))){commandBus.dispatch('mesh.loop_cut_pointer',{point:{x:event.clientX,y:event.clientY},fine:event.shiftKey});ui.refreshModal();return;}
  if(modalTransform.active && (event.target===viewportCanvas || viewportCanvas.contains(event.target))){
    commandBus.dispatch('transform.modal_update',{point:{x:event.clientX,y:event.clientY}});
    ui.refreshModal();
  }
});
viewportCanvas.addEventListener('contextmenu',event=>{
  if(faceOperationModal.active){event.preventDefault();run('mesh.face_operation_cancel');return;}
  if(bevelModal.active){event.preventDefault();run('mesh.bevel_cancel');return;}
  if(loopCutModal.active){event.preventDefault();run('mesh.loop_cut_cancel');return;}
  if(modalTransform.active){event.preventDefault();run('transform.modal_cancel');}
});
new TouchController(viewport,notify);
new SelectionGestureController({viewport,dispatch:(name,payload)=>run(name,payload),getDocument:()=>sceneDocument,notify});
new KeyboardController({viewport,commandBus,modalTransform,loopCutModal,bevelModal,faceOperationModal,getDocument:()=>sceneDocument,ui,notify});
loadingProgress(88, 'Keyboard, pointer and touch controls are ready…');
$('#sw-profile').textContent='Registering…';
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(()=>$('#sw-profile').textContent='Registered').catch(()=>$('#sw-profile').textContent='Unavailable');
} else $('#sw-profile').textContent='Unsupported';

// Initial scene: bootstrap directly through SceneDocument.
// The default scene must not depend on command dispatch or undo snapshot I/O.
loadingProgress(94, 'Creating the starter object…');
let starterObject;
try {
  starterObject = sceneDocument.addPrimitive('cube');
} catch (error) {
  console.error('[Bl3nd startup: starter cube creation]', error);
  loading?.fail(error);
  throw new Error(`Starter cube creation failed: ${error?.message || String(error)}`, { cause: error });
}

if (!starterObject?.isMesh || !starterObject.userData?.hem) {
  const error = new Error('SceneDocument did not return a valid editable cube mesh.');
  loading?.fail(error);
  throw error;
}

starterObject.position.set(0, 0, 0);
try {
  viewport.frame(starterObject);
} catch (error) {
  console.error('[Bl3nd startup: starter cube framing]', error);
  notify(`Starter cube created, but auto-framing failed: ${error?.message || String(error)}`, 'error');
}
try {
  refresh();
} catch (error) {
  console.error('[Bl3nd startup: initial UI refresh]', error);
  notify(`Starter cube created, but some status panels could not refresh: ${error?.message || String(error)}`, 'error');
}
loadingProgress(98, 'Finalizing the workspace and browser storage…');
status(`Ready · ${capabilities.tier} tier · ${capabilities.webgpu?'WebGPU detected':'WebGL path'}`);
if(capabilities.storage){
  try{await navigator.storage.persist?.();}catch{/* persistence is browser-managed */}
}
loadingProgress(99, 'All systems initialized…');
loading?.finish();
