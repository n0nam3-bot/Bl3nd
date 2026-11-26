export class TouchController {
  constructor(viewport, notify) {
    this.viewport = viewport;
    this.notify = notify;
    this.timer = null;
    this.start = null;
    this.activePointers = new Set();
    const el = viewport.renderer.domElement;
    this.down = event => this.onDown(event);
    this.move = event => this.onMove(event);
    this.up = event => this.onUp(event);
    this.cancel = event => this.onUp(event);
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);
  }

  onDown(event) {
    if (event.pointerType !== 'touch') return;
    this.activePointers.add(event.pointerId);
    if (this.activePointers.size > 1) {
      this.clear();
      return;
    }

    this.start = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.timer = setTimeout(() => {
      if (!this.start || this.activePointers.size !== 1) return;
      this.viewport.placeCursorFromPointer(event.clientX, event.clientY);
      this.notify?.('3D Cursor placed');
      this.clear();
    }, 560);
  }

  onMove(event) {
    if (!this.start || event.pointerId !== this.start.id) return;
    if (Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > 12) this.clear();
  }

  onUp(event) {
    this.activePointers.delete(event.pointerId);
    if (this.start?.id === event.pointerId || this.activePointers.size > 1) this.clear();
  }

  clear() {
    clearTimeout(this.timer);
    this.timer = null;
    this.start = null;
  }

  dispose() {
    this.clear();
    this.viewport.renderer.domElement.removeEventListener('pointerdown', this.down);
    this.viewport.renderer.domElement.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.cancel);
  }
}
