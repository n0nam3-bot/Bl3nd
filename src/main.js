import * as THREE from 'three';
import { detectCapabilities } from './core/DeviceCapabilities.js';
import { CommandBus } from './core/CommandBus.js';
import { SceneDocument } from './core/SceneDocument.js';
import { UndoManager } from './core/UndoManager.js';
import { MeshOperators } from './operators/MeshOperators.js';
import { ModalTransform } from './operators/ModalTransform.js';
import { ModifierStack } from './modifiers/ModifierStack.js';
import { Viewport } from './ui/Viewport.js';
import { ModelIO } from './io/ModelIO.js';
import { KeyboardController } from './input/KeyboardController.js';
import { TouchController } from './input/TouchController.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const statusEl = $('#status-message');
const toastRegion = $('#toast-region');
const loading = window.Bl3ndLoading;
function loadingProgress(value, message) { loading?.update(value, message); }

loadingProgress(6, 'Checking device and graphics capabilities…');
const capabilities = await detectCapabilities();
loadingProgress(22, 'Device profile ready · initializing the 3D renderer…');

function status(message) { if (statusEl) statusEl.textContent = message; }
function notify(message, type = '') {
  const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message;
  toastRegion.appendChild(toast); setTimeout(() => toast.remove(), 3000);
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
const modalTransform = new ModalTransform({ document: sceneDocument, undoManager, status, onChange: () => ui?.refreshModal() });
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

function registerCommands() {
  commandBus.register('object.add_primitive', ({ primitive = 'cube' }) => { const mesh = sceneDocument.addPrimitive(primitive); refresh(); viewport.frame(mesh); return mesh; });
  commandBus.register('object.delete', () => { const ok = sceneDocument.deleteActiveObject(); refresh(); return ok; });
  commandBus.register('object.select', ({ mesh = null }) => { sceneDocument.setActive(mesh); refresh(); }, { recordUndo: false });
  commandBus.register('mesh.select_from_hit', ({ mesh, faceId, point }) => {
    if (sceneDocument.activeObject !== mesh) sceneDocument.setActive(mesh);
    const hem = mesh.userData.hem, face = hem.faces[faceId] || [];
    if (sceneDocument.selectionMode === 'vertex') {
      hem.clearSelection(); const localPoint = mesh.worldToLocal(new THREE.Vector3(...point)); let closest=-1,distance=Infinity;
      face.forEach(id=>{const d=new THREE.Vector3(...hem.positions[id]).distanceTo(localPoint);if(d<distance){distance=d;closest=id;}});
      if(closest>=0)hem.vertexSelection.add(closest);
    } else if (sceneDocument.selectionMode === 'edge') {
      hem.clearSelection(); const localPoint=mesh.worldToLocal(new THREE.Vector3(...point));let closest=-1,distance=Infinity;
      for(let i=0;i<face.length;i++){const a=face[i],b=face[(i+1)%face.length],mid=new THREE.Vector3(...hem.positions[a]).add(new THREE.Vector3(...hem.positions[b])).multiplyScalar(.5),d=mid.distanceTo(localPoint);if(d<distance){distance=d;closest=hem.edges.find(edge=>edge.vertices.includes(a)&&edge.vertices.includes(b))?.id??-1;}}
      if(closest>=0)hem.edgeSelection.add(closest);
    } else if(faceId>=0)hem.selectFace(faceId,false);
    refresh();
  }, { recordUndo: false });
  commandBus.register('mesh.clear_selection', () => { sceneDocument.activeObject?.userData.hem.clearSelection(); refresh(); }, { recordUndo: false });
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
    if (sceneDocument.mode === 'edit' && hem && !hem.faceSelection.size && !hem.vertexSelection.size && !hem.edgeSelection.size) {
      hem.faceSelection = new Set(hem.faces.map((_, index) => index));
    }
    refresh(); return true;
  }, { recordUndo: false });
  commandBus.register('mode.set', ({ mode }) => { sceneDocument.setMode(mode); refresh(); }, { recordUndo: false });
  commandBus.register('mesh.selection_mode', ({ mode }) => {
    sceneDocument.selectionMode = mode;
    sceneDocument.activeObject?.userData.hem.setSelectionMode(mode);
    refresh();
  }, { recordUndo: false });
  commandBus.register('mesh.extrude_region', async () => {
    if (sceneDocument.mode !== 'edit') return false;
    const result = MeshOperators.extrude(sceneDocument, 1);
    if (!result) notify('Select one or more faces before extruding.'); else await reapplyActiveModifiers();
    refresh(); return result;
  });
  commandBus.register('mesh.inset', async () => {
    if (sceneDocument.mode !== 'edit') return false;
    const result = MeshOperators.inset(sceneDocument, 0.12);
    if (!result) notify('Select one or more faces before insetting.'); else await reapplyActiveModifiers();
    refresh(); return result;
  });
  commandBus.register('mesh.delete', async () => {
    if (sceneDocument.mode !== 'edit') return false;
    const result = MeshOperators.deleteFaces(sceneDocument);
    if (!result) notify('Select faces before deleting.'); else await reapplyActiveModifiers();
    refresh(); return result;
  });
  commandBus.register('mesh.subdivide', async () => { if (sceneDocument.mode !== 'edit') return false; MeshOperators.subdivide(sceneDocument); await reapplyActiveModifiers(); refresh(); return true; });
  commandBus.register('mesh.bevel', () => notify('Bevel (Ctrl+B) is on the Phase 1/2 roadmap; edge-offset topology is not implemented yet.'), { recordUndo: false });
  commandBus.register('mesh.loop_cut', () => notify('Loop Cut (Ctrl+R) is not implemented in this foundation release.'), { recordUndo: false });
  commandBus.register('transform.modal_start', async ({ type, pointer }) => {
    const started = await modalTransform.begin(type, pointer || ui.pointerCenter());
    if (!started) notify('Select an object before transforming.');
    viewport.controls.enabled = !started; ui.refreshModal(); return started;
  }, { recordUndo: false });
  commandBus.register('transform.modal_confirm', async () => { const result = await modalTransform.commit(); viewport.controls.enabled = true; await reapplyActiveModifiers(); refresh(); return result; }, { recordUndo: false });
  commandBus.register('transform.modal_cancel', async () => { const result = await modalTransform.cancel(); viewport.controls.enabled = true; await reapplyModifiers(); refresh(); return result; }, { recordUndo: false });
  commandBus.register('transform.modal_update', ({ point }) => { modalTransform.pointerMove(point); }, { recordUndo: false });
  commandBus.register('transform.modal_axis', ({ axis, plane = false }) => { modalTransform.setAxis(axis, plane); ui.refreshModal(); }, { recordUndo: false });
  commandBus.register('transform.modal_input', ({ value }) => { modalTransform.appendNumeric(value); ui.refreshModal(); }, { recordUndo: false });
  commandBus.register('cursor.set', ({ point }) => { sceneDocument.cursor.fromArray(point); refreshCursor(); return true; }, { recordUndo: false });
  commandBus.register('pivot.set', ({ pivot }) => { sceneDocument.pivot = pivot; refresh(); }, { recordUndo: false });
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
  let tri = 0;
  for (let faceId = 0; faceId < hem.faces.length; faceId++) {
    const face = hem.faces[faceId], count = Math.max(0, face.length - 2);
    if (triangleIndex >= tri && triangleIndex < tri + count) return faceId;
    tri += count;
  }
  return -1;
}
function handleViewportSelection(hit) {
  if (modalTransform.active) return;
  if (!hit) {
    if (sceneDocument.mode === 'object') run('object.select',{mesh:null});
    else run('mesh.clear_selection');
    return;
  }
  if (sceneDocument.mode === 'object') { run('object.select',{mesh:hit.object}); return; }
  const faceId=faceIdForTriangle(hit.object.userData.hem,hit.faceIndex??0);
  run('mesh.select_from_hit',{mesh:hit.object,faceId,point:hit.point.toArray()});
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
  $('#object-mode-btn').classList.toggle('active',sceneDocument.mode==='object');
  $('#edit-mode-btn').classList.toggle('active',sceneDocument.mode==='edit');
  $('#selection-vertex').classList.toggle('active',sceneDocument.selectionMode==='vertex');
  $('#selection-edge').classList.toggle('active',sceneDocument.selectionMode==='edge');
  $('#selection-face').classList.toggle('active',sceneDocument.selectionMode==='face');
  const stats=sceneDocument.stats(); $('#object-count').textContent=`Objects: ${stats.objects}`;
  $('#mesh-stats').textContent=`Verts ${stats.vertices} · Edges ${stats.edges} · Faces ${stats.faces}`;
  $$('[data-transform]').forEach(input=>{
    const mesh=sceneDocument.activeObject,kind=input.dataset.transform,axis=input.dataset.axis;
    input.value=mesh ? (kind==='rotation'?THREE.MathUtils.radToDeg(mesh.rotation[axis]):mesh[kind][axis]).toFixed(2) : '';
    input.disabled=!mesh;
  });
  refreshCursor(); refreshModifiers(); ui?.refreshModal();
}

ui = {
  async undo(){if(!undoManager.canUndo){notify('Nothing to undo.');return;} await undoManager.undo();refresh();},
  async redo(){if(!undoManager.canRedo){notify('Nothing to redo.');return;} await undoManager.redo();refresh();},
  togglePie(kind){
    const menu=$('#pie-menu');
    if(!menu.hidden && menu.dataset.kind===kind){menu.hidden=true;return;}
    const entries=kind==='shading'?
      [['Solid','shade_solid'],['Wireframe','shade_wire'],['Material','shade_material'],['Rendered','shade_render']]:
      [['Cube','add_cube'],['UV Sphere','add_sphere'],['Cylinder','add_cylinder'],['Plane','add_plane'],['Edit Mode','toggle_mode'],['3D Cursor','cursor_center']];
    menu.replaceChildren();
    for(const [label,command] of entries){const button=document.createElement('button');button.textContent=label;button.dataset.command=command;menu.append(button);}
    menu.dataset.kind=kind; menu.hidden=false;
  },
  pointerCenter(){const rect=$('#viewport').getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2};},
  refreshModal(){
    const readout=$('#modal-readout'),pad=$('#numeric-pad');
    if(!modalTransform.active){readout.hidden=true;pad.hidden=true;return;}
    const axis=modalTransform.axis?` · ${modalTransform.axis.toUpperCase()} axis`:modalTransform.planeNormal?` · ${modalTransform.planeNormal.toUpperCase()} plane`:'';
    readout.hidden=false; readout.textContent=`${modalTransform.type.toUpperCase()}${axis} · ${modalTransform.numeric || 'mouse'} · Enter apply / Esc cancel`;
    pad.hidden=!capabilities.tier.includes('Mobile'); $('#pad-value').textContent=modalTransform.numeric || '0';
  }
};
loadingProgress(73, 'Building the workspace panels and editing controls…');

// Header, panels, tools and mobile quick actions all route into the command bus.
$('#undo-btn').addEventListener('click',()=>ui.undo()); $('#redo-btn').addEventListener('click',()=>ui.redo());
$('#object-mode-btn').addEventListener('click',()=>run('mode.set',{mode:'object'}));
$('#edit-mode-btn').addEventListener('click',()=>run('mode.set',{mode:'edit'}));
$('#save-btn').addEventListener('click',async()=>{try{await modelIO.exportFile('glb');}catch(e){notify(e.message,'error');}});
$('#open-btn').addEventListener('click',()=>$('#file-input').click());
$('#file-input').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{const meshes=await modelIO.importFile(file);refresh();viewport.frame(meshes[0]);}catch(e){notify(e.message,'error');}finally{event.target.value='';}});
$('#add-menu-btn').addEventListener('click',()=>ui.togglePie('add'));
$('#mobile-add').addEventListener('click',()=>ui.togglePie('add'));
$('#mobile-move').addEventListener('click',()=>run('transform.modal_start',{type:'move',pointer:ui.pointerCenter()}));
$('#mobile-edit').addEventListener('click',()=>run('mode.toggle_edit'));
$('#mobile-more').addEventListener('click',()=>$('.properties-panel').classList.toggle('mobile-open'));
$$('[data-tool]').forEach(button=>button.addEventListener('click',()=>{
  $$('.tool-button').forEach(item=>item.classList.remove('selected'));button.classList.add('selected');
  const tool=button.dataset.tool;
  if(['move','rotate','scale'].includes(tool))run('transform.modal_start',{type:tool,pointer:ui.pointerCenter()});
}));
$('#extrude-btn').addEventListener('click',()=>run('mesh.extrude_region')); $('#extrude-panel-btn').addEventListener('click',()=>run('mesh.extrude_region')); $('#mobile-extrude').addEventListener('click',()=>run('mesh.extrude_region'));
$('#inset-btn').addEventListener('click',()=>run('mesh.inset')); $('#inset-panel-btn').addEventListener('click',()=>run('mesh.inset'));
$('#delete-btn').addEventListener('click',()=>sceneDocument.mode==='edit'?run('mesh.delete'):run('object.delete'));
$('#delete-panel-btn').addEventListener('click',()=>run('mesh.delete')); $('#subdivide-btn').addEventListener('click',()=>run('mesh.subdivide'));
$('#selection-vertex').addEventListener('click',()=>run('mesh.selection_mode',{mode:'vertex'}));
$('#selection-edge').addEventListener('click',()=>run('mesh.selection_mode',{mode:'edge'}));
$('#selection-face').addEventListener('click',()=>run('mesh.selection_mode',{mode:'face'}));
$('#frame-btn').addEventListener('click',()=>run('view.frame'));
$('#pivot-select').addEventListener('change',event=>run('pivot.set',{pivot:event.target.value}));
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
  else if(command.startsWith('shade_')){
    await run('shading.set',{mode:command.slice(6)});
  }
});
$('#shading-btn').addEventListener('click',()=>ui.togglePie('shading'));
$('#numeric-pad').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-key]');if(!button)return;const key=button.dataset.key;
  if(key==='enter'){await run('transform.modal_confirm');return;}
  if(key==='escape'){await run('transform.modal_cancel');return;}
  await commandBus.dispatch('transform.modal_input',{value:key});
});

const viewportCanvas=viewport.renderer.domElement;
viewportCanvas.addEventListener('pointermove',event=>{if(modalTransform.active){commandBus.dispatch('transform.modal_update',{point:{x:event.clientX,y:event.clientY}});ui.refreshModal();}});
viewportCanvas.addEventListener('contextmenu',event=>{if(modalTransform.active){event.preventDefault();run('transform.modal_cancel');}});
new TouchController(viewport,notify);
new KeyboardController({viewport,commandBus,modalTransform,getDocument:()=>sceneDocument,ui,notify});
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
