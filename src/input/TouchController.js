export class TouchController {
  constructor(viewport, notify) {
    this.viewport=viewport; this.notify=notify; this.timer=null; this.start=null;
    const el=viewport.renderer.domElement;
    this.down=e=>this.onDown(e); this.move=e=>this.onMove(e); this.up=()=>this.clear();
    el.addEventListener('pointerdown',this.down); el.addEventListener('pointermove',this.move); window.addEventListener('pointerup',this.up);
  }
  onDown(event) {
    if (event.pointerType!=='touch') return;
    this.start={x:event.clientX,y:event.clientY};
    this.timer=setTimeout(()=>{
      if (!this.start) return;
      this.viewport.placeCursorFromPointer(event.clientX,event.clientY); this.notify?.('3D Cursor placed'); this.clear();
    },560);
  }
  onMove(event) {
    if (!this.start) return;
    if (Math.hypot(event.clientX-this.start.x,event.clientY-this.start.y)>12) this.clear();
  }
  clear(){clearTimeout(this.timer);this.timer=null;this.start=null;}
  dispose(){this.clear();this.viewport.renderer.domElement.removeEventListener('pointerdown',this.down);this.viewport.renderer.domElement.removeEventListener('pointermove',this.move);window.removeEventListener('pointerup',this.up);}
}
