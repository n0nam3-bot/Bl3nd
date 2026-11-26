export class SelectionGestureController {
  constructor({ viewport, dispatch, getDocument, notify } = {}) {
    this.viewport = viewport;
    this.dispatch = dispatch;
    this.getDocument = getDocument;
    this.notify = notify;
    this.active = null;
    viewport.onSelectionGestureStart = (event, tool) => this.start(event, tool);
    this.moveListener = event => this.move(event);
    this.upListener = event => this.finish(event, false);
    this.cancelListener = event => this.finish(event, true);
    window.addEventListener('pointermove', this.moveListener, { passive: true });
    window.addEventListener('pointerup', this.upListener);
    window.addEventListener('pointercancel', this.cancelListener);
  }

  start(event, tool) {
    if (this.active) return;
    if (this.getDocument()?.mode !== 'edit') {
      this.notify?.('Enter Edit Mode before using region selection.');
      return;
    }
    const rect = this.viewport.renderer.domElement.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.active = { tool, pointerId: event.pointerId, start: point, points: [point],
      additive: Boolean(event.shiftKey), rect, moved: false };
    try { this.viewport.renderer.domElement.setPointerCapture(event.pointerId); } catch {}
    this.layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.layer.setAttribute('class', 'selection-gesture-layer');
    this.layer.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    this.layer.setAttribute('preserveAspectRatio', 'none');
    this.viewport.container.appendChild(this.layer);
    this.render();
  }

  move(event) {
    const state = this.active;
    if (!state || state.pointerId !== event.pointerId) return;
    const point = { x: event.clientX - state.rect.left, y: event.clientY - state.rect.top };
    const last = state.points[state.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < (state.tool === 'circle' ? 7 : 3)) return;
    state.moved = true;
    if (state.tool === 'box') state.points = [state.start, point];
    else state.points.push(point);
    if (state.points.length > 600) state.points = state.points.filter((_, index) => index % 2 === 0);
    this.render();
  }

  render() {
    const state = this.active;
    if (!state || !this.layer) return;
    this.layer.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    const add = (tag, attrs) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      this.layer.appendChild(node);
    };
    if (state.tool === 'box') {
      const a = state.start, b = state.points[state.points.length - 1];
      add('rect', { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y), class: 'selection-box' });
    } else if (state.tool === 'lasso') {
      add('polygon', { points: state.points.map(point => `${point.x},${point.y}`).join(' '), class: 'selection-lasso' });
    } else {
      for (const point of state.points) add('circle', { cx: point.x, cy: point.y, r: 25, class: 'selection-brush' });
    }
  }

  finish(event, cancelled) {
    const state = this.active;
    if (!state || state.pointerId !== event.pointerId) return;
    this.active = null;
    this.layer?.remove();
    this.layer = null;
    if (cancelled || (state.tool !== 'circle' && !state.moved) ||
        (state.tool === 'lasso' && state.points.length < 3)) return;
    Promise.resolve(this.dispatch('mesh.select_region', {
      tool: state.tool, points: state.points, radius: 25, additive: state.additive
    })).catch(error => this.notify?.(error?.message || String(error)));
  }

  dispose() {
    this.active = null;
    this.layer?.remove();
    this.layer = null;
    if (this.viewport.onSelectionGestureStart) this.viewport.onSelectionGestureStart = null;
    window.removeEventListener('pointermove', this.moveListener);
    window.removeEventListener('pointerup', this.upListener);
    window.removeEventListener('pointercancel', this.cancelListener);
  }
}
