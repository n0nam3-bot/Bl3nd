export class KeyboardController {
  constructor({ viewport, commandBus, modalTransform, getDocument, ui, notify }) {
    this.viewport=viewport; this.commandBus=commandBus; this.modal=modalTransform; this.getDocument=getDocument; this.ui=ui; this.notify=notify;
    this.listener=event=>this.onKeyDown(event); window.addEventListener('keydown',this.listener);
  }
  dispatch(name,payload={}) { return this.commandBus.dispatch(name,{...payload,document:this.getDocument()}); }
  isTyping(target) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable; }
  async onKeyDown(event) {
    if (this.isTyping(event.target)) return;
    const key=event.key.toLowerCase(), doc=this.getDocument();
    if ((event.ctrlKey||event.metaKey) && key==='z') { event.preventDefault(); await (event.shiftKey?this.ui.redo():this.ui.undo()); return; }
    if ((event.ctrlKey||event.metaKey) && key==='y') { event.preventDefault(); await this.ui.redo(); return; }
    if ((event.ctrlKey||event.metaKey) && key==='b') { event.preventDefault(); if(doc.mode==='edit') await this.dispatch('mesh.bevel'); return; }
    if ((event.ctrlKey||event.metaKey) && key==='r') { event.preventDefault(); if(doc.mode==='edit') await this.dispatch('mesh.loop_cut'); return; }
    if (this.modal.active) {
      if (key==='escape') { event.preventDefault(); await this.dispatch('transform.modal_cancel'); return; }
      if (key==='enter') { event.preventDefault(); await this.dispatch('transform.modal_confirm'); return; }
      if (['x','y','z'].includes(key) && !event.ctrlKey && !event.altKey) { event.preventDefault(); await this.dispatch('transform.modal_axis',{axis:key,plane:event.shiftKey}); return; }
      if (/^[0-9]$/.test(key) || ['-','.'].includes(key)) { event.preventDefault(); await this.dispatch('transform.modal_input',{value:key}); return; }
      if (key==='backspace') { event.preventDefault(); await this.dispatch('transform.modal_input',{value:'backspace'}); return; }
      return;
    }
    if (key==='escape' && this.viewport.selectionTool && this.viewport.selectionTool !== 'tap') { event.preventDefault(); await this.dispatch('selection.tool.set',{tool:'tap'}); return; }
    if (event.key==='Tab') { event.preventDefault(); await this.dispatch('mode.toggle_edit'); return; }
    if (event.shiftKey && key==='a') { event.preventDefault(); this.ui.togglePie('add'); return; }
    if (doc.mode==='edit' && key==='a' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); await this.dispatch(event.altKey?'mesh.clear_selection':'mesh.select_all'); return; }
    if (doc.mode==='edit' && (event.ctrlKey||event.metaKey) && key==='i') { event.preventDefault(); await this.dispatch('mesh.invert_selection'); return; }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && key==='z') { this.ui.togglePie('shading'); return; }
    if (doc.mode==='edit' && ['1','2','3'].includes(key)) { event.preventDefault(); await this.dispatch('mesh.selection_mode',{mode:({'1':'vertex','2':'edge','3':'face'})[key]}); return; }
    if (doc.mode==='edit' && ['b','c','l'].includes(key) && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); await this.dispatch('selection.tool.set',{tool:({b:'box',c:'circle',l:'lasso'})[key]}); return; }
    if (key==='g' || key==='r' || key==='s') { event.preventDefault(); const type=({g:'move',r:'rotate',s:'scale'})[key]; await this.dispatch('transform.modal_start',{type,pointer:(this.viewport.getPointerOrigin?.() || this.ui.pointerCenter())}); return; }
    if (key==='e' && doc.mode==='edit') { event.preventDefault(); await this.dispatch('mesh.extrude_region'); return; }
    if (key==='i' && doc.mode==='edit') { event.preventDefault(); await this.dispatch('mesh.inset'); return; }
    if (event.shiftKey && key==='x' && doc.mode==='edit') { event.preventDefault(); await this.dispatch('mesh.dissolve'); return; }
    if (key==='x') { event.preventDefault(); if (doc.mode==='edit') await this.dispatch('mesh.delete'); else await this.dispatch('object.delete'); return; }
    if (key==='delete' || key==='backspace') { event.preventDefault(); if (doc.mode==='edit') await this.dispatch('mesh.delete'); else await this.dispatch('object.delete'); return; }
    if (event.code==='Numpad1') await this.dispatch('view.set',{view:'front'});
    else if (event.code==='Numpad3') await this.dispatch('view.set',{view:'right'});
    else if (event.code==='Numpad7') await this.dispatch('view.set',{view:'top'});
    else if (event.code==='Numpad5') this.notify?.('Perspective/orthographic toggle is scheduled for the next viewport pass.');
    else if (key==='home') await this.dispatch('view.frame');
  }
  dispose(){window.removeEventListener('keydown',this.listener);}
}
