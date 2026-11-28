import { resolveNumpadShortcut } from '../core/ViewportNavigation.js';

export class KeyboardController {
  constructor({ viewport, commandBus, modalTransform, loopCutModal = null, bevelModal = null, faceOperationModal = null, getDocument, ui, notify }) {
    this.viewport=viewport; this.commandBus=commandBus; this.modal=modalTransform; this.loopCutModal=loopCutModal; this.bevelModal=bevelModal; this.faceOperationModal=faceOperationModal; this.getDocument=getDocument; this.ui=ui; this.notify=notify;
    this.listener=event=>this.onKeyDown(event);
    this.keyupListener=event=>this.onKeyUp(event);
    window.addEventListener('keydown',this.listener);
    window.addEventListener('keyup',this.keyupListener);
  }
  dispatch(name,payload={}) { return this.commandBus.dispatch(name,{...payload,document:this.getDocument()}); }
  isTyping(target) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable; }
  async onKeyDown(event) {
    if (this.isTyping(event.target)) return;
    const key=event.key.toLowerCase(), doc=this.getDocument();
    if (this.ui?.pieMenuOpen) {
      if (key==='escape' || key==='backspace') { event.preventDefault(); this.ui.closePie(); return; }
      if (['arrowup','arrowright','arrowdown','arrowleft'].includes(key)) { event.preventDefault(); this.ui.movePieSelection(event.key); return; }
      if (key==='tab') { event.preventDefault(); this.ui.movePieSelection(event.shiftKey?'ArrowLeft':'ArrowRight'); return; }
      if (key==='enter' || key===' ') { event.preventDefault(); this.ui.activatePieSelection(); return; }
      return;
    }
    if (this.faceOperationModal?.active) {
      if (key==='escape') { event.preventDefault(); await this.dispatch('mesh.face_operation_cancel'); return; }
      if (key==='enter') { event.preventDefault(); await this.dispatch('mesh.face_operation_confirm'); return; }
      if (key==='arrowleft' || key==='arrowdown') { event.preventDefault(); await this.dispatch('mesh.face_operation_nudge',{direction:-1,fine:event.shiftKey}); return; }
      if (key==='arrowright' || key==='arrowup') { event.preventDefault(); await this.dispatch('mesh.face_operation_nudge',{direction:1,fine:event.shiftKey}); return; }
      if (/^\d$/.test(key) || key==='.' || key==='backspace' || (key==='-' && this.faceOperationModal.operation==='extrude')) {
        event.preventDefault(); await this.dispatch('mesh.face_operation_input',{value:key==='backspace'?'backspace':key}); return;
      }
      return;
    }
    if (this.bevelModal?.active) {
      if (key==='escape') { event.preventDefault(); await this.dispatch('mesh.bevel_cancel'); return; }
      if (key==='enter') { event.preventDefault(); await this.dispatch('mesh.bevel_confirm'); return; }
      if (key==='h' && this.bevelModal.mode==='face-region') { event.preventDefault(); await this.dispatch('mesh.bevel_dimension_toggle'); return; }
      if (key==='i' && this.bevelModal.mode==='face-region') { event.preventDefault(); await this.dispatch('mesh.bevel_face_mode_toggle'); return; }
      if (key==='pageup' && this.bevelModal.mode==='face-region' && this.bevelModal.faceBevelMode==='individual') { event.preventDefault(); await this.dispatch('mesh.bevel_face_target',{delta:-1}); return; }
      if (key==='pagedown' && this.bevelModal.mode==='face-region' && this.bevelModal.faceBevelMode==='individual') { event.preventDefault(); await this.dispatch('mesh.bevel_face_target',{delta:1}); return; }
      if (key==='arrowleft' || key==='arrowdown') { event.preventDefault(); await this.dispatch('mesh.bevel_nudge',{direction:-1,fine:event.shiftKey}); return; }
      if (key==='arrowright' || key==='arrowup') { event.preventDefault(); await this.dispatch('mesh.bevel_nudge',{direction:1,fine:event.shiftKey}); return; }
      if (key==='+' || key==='=') { event.preventDefault(); await this.dispatch('mesh.bevel_segments',{delta:1}); return; }
      if (key==='-') { event.preventDefault(); await this.dispatch('mesh.bevel_segments',{delta:-1}); return; }
      if (key==='[' || key==='{') { event.preventDefault(); await this.dispatch('mesh.bevel_profile',{delta:-1,fine:event.shiftKey || key==='{'}); return; }
      if (key===']' || key==='}') { event.preventDefault(); await this.dispatch('mesh.bevel_profile',{delta:1,fine:event.shiftKey || key==='}'}); return; }
      if (/^\d$/.test(key) || key==='.' || key==='backspace') {
        event.preventDefault(); await this.dispatch('mesh.bevel_input',{value:key==='backspace'?'backspace':key}); return;
      }
      return;
    }
    if (this.loopCutModal?.active) {
      if (key==='escape') { event.preventDefault(); await this.dispatch('mesh.loop_cut_cancel'); return; }
      if (key==='enter') { event.preventDefault(); await this.dispatch('mesh.loop_cut_confirm'); return; }
      if (key==='arrowleft' || key==='arrowdown') { event.preventDefault(); await this.dispatch('mesh.loop_cut_nudge',{direction:-1,fine:event.shiftKey}); return; }
      if (key==='arrowright' || key==='arrowup') { event.preventDefault(); await this.dispatch('mesh.loop_cut_nudge',{direction:1,fine:event.shiftKey}); return; }
      if (key==='+' || key==='=') { event.preventDefault(); await this.dispatch('mesh.loop_cut_count',{delta:1}); return; }
      if (key==='-') { event.preventDefault(); await this.dispatch('mesh.loop_cut_count',{delta:-1}); return; }
      if (/^\d$/.test(key) || key==='.' || key==='backspace') {
        event.preventDefault(); await this.dispatch('mesh.loop_cut_input',{value:key==='backspace'?'backspace':key}); return;
      }
      return;
    }
    if ((event.ctrlKey||event.metaKey) && key==='z') { event.preventDefault(); await (event.shiftKey?this.ui.redo():this.ui.undo()); return; }
    if ((event.ctrlKey||event.metaKey) && key==='y') { event.preventDefault(); await this.ui.redo(); return; }
    if ((event.ctrlKey||event.metaKey) && key==='b') { event.preventDefault(); if(doc.mode==='edit') await this.dispatch('mesh.bevel'); return; }
    if ((event.ctrlKey||event.metaKey) && key==='r') { event.preventDefault(); if(doc.mode==='edit') await this.dispatch('mesh.loop_cut'); return; }
    if (this.modal.active) {
      if (key==='o' && doc.mode==='edit') { event.preventDefault(); await this.dispatch('transform.proportional_toggle'); return; }
      if (key===',') { event.preventDefault(); await this.dispatch('transform.modal_orientation_toggle'); return; }
      if (key==='escape') { event.preventDefault(); await this.dispatch('transform.modal_cancel'); return; }
      if (key==='enter') { event.preventDefault(); await this.dispatch('transform.modal_confirm'); return; }
      if (['x','y','z'].includes(key) && !event.ctrlKey && !event.altKey) { event.preventDefault(); await this.dispatch('transform.modal_axis',{axis:key,plane:event.shiftKey}); return; }
      if (/^[0-9]$/.test(key) || ['-','.'].includes(key)) { event.preventDefault(); await this.dispatch('transform.modal_input',{value:key}); return; }
      if (key==='backspace') { event.preventDefault(); await this.dispatch('transform.modal_input',{value:'backspace'}); return; }
      return;
    }
    const numpad = resolveNumpadShortcut(event.code, event);
    if (numpad?.action === 'view') {
      event.preventDefault(); await this.dispatch('view.set', { view: numpad.view }); return;
    }
    if (numpad?.action === 'orbit') {
      event.preventDefault(); await this.dispatch('view.orbit_step', {
        horizontalSteps: numpad.horizontalSteps,
        verticalSteps: numpad.verticalSteps
      }); return;
    }
    if (numpad?.action === 'frame-selection') {
      event.preventDefault(); await this.dispatch('view.frame_selection'); return;
    }
    if (numpad?.action === 'toggle-projection') {
      event.preventDefault(); await this.dispatch('view.toggle_projection'); return;
    }
    if (key==='escape' && this.viewport.selectionTool && this.viewport.selectionTool !== 'tap') { event.preventDefault(); await this.dispatch('selection.tool.set',{tool:'tap'}); return; }
    if (event.key==='Tab') { event.preventDefault(); await this.dispatch('mode.toggle_edit'); return; }
    if (event.shiftKey && key==='a') { event.preventDefault(); this.ui.togglePie('add',{gestureKey:'a'}); return; }
    if (doc.mode==='edit' && key==='o' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); await this.dispatch('transform.proportional_toggle'); return; }
    if (doc.mode==='edit' && key==='a' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); await this.dispatch(event.altKey?'mesh.clear_selection':'mesh.select_all'); return; }
    if (doc.mode==='edit' && (event.ctrlKey||event.metaKey) && key==='i') { event.preventDefault(); await this.dispatch('mesh.invert_selection'); return; }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && key==='z') { event.preventDefault(); this.ui.togglePie('shading',{gestureKey:'z'}); return; }
    if (doc.mode==='edit' && ['1','2','3'].includes(key)) { event.preventDefault(); await this.dispatch('mesh.selection_mode',{mode:({'1':'vertex','2':'edge','3':'face'})[key]}); return; }
    if (doc.mode==='edit' && key==='l' && event.ctrlKey && event.altKey) { event.preventDefault(); await this.dispatch('mesh.select_edge_ring'); return; }
    if (doc.mode==='edit' && key==='l' && event.altKey) { event.preventDefault(); await this.dispatch('mesh.select_edge_loop'); return; }
    if (doc.mode==='edit' && ['b','c','l'].includes(key) && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); await this.dispatch('selection.tool.set',{tool:({b:'box',c:'circle',l:'lasso'})[key]}); return; }
    if (key==='g' || key==='r' || key==='s') { event.preventDefault(); const type=({g:'move',r:'rotate',s:'scale'})[key]; await this.dispatch('transform.modal_start',{type,pointer:(this.viewport.getPointerOrigin?.() || this.ui.pointerCenter())}); return; }
    if (key==='e' && doc.mode==='edit') { event.preventDefault(); await this.dispatch('mesh.extrude_region'); return; }
    if (key==='i' && doc.mode==='edit') { event.preventDefault(); await this.dispatch('mesh.inset'); return; }
    if (event.shiftKey && key==='x' && doc.mode==='edit') { event.preventDefault(); await this.dispatch('mesh.dissolve'); return; }
    if (key==='x') { event.preventDefault(); if (doc.mode==='edit') await this.dispatch('mesh.delete'); else await this.dispatch('object.delete'); return; }
    if (key==='delete' || key==='backspace') { event.preventDefault(); if (doc.mode==='edit') await this.dispatch('mesh.delete'); else await this.dispatch('object.delete'); return; }
    if (key==='home') { event.preventDefault(); await this.dispatch('view.frame'); }
  }
  onKeyUp(event) {
    const key=event.key.toLowerCase();
    if (key==='a' || key==='z') this.ui?.finishPieGesture(key);
  }
  dispose(){window.removeEventListener('keydown',this.listener);window.removeEventListener('keyup',this.keyupListener);}
}
