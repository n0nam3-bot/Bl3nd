import { HalfEdgeMesh } from '../core/HalfEdgeMesh.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Interactive preview/slide session for the conservative quad-strip Loop Cut.
 * Every preview is rebuilt from the immutable pre-operation topology so that
 * pointer movement never accumulates interpolation error or partially mutates
 * the source mesh.
 */
export class LoopCutModal {
  constructor({ document, undoManager, viewport, status, onChange }) {
    this.document = document;
    this.undoManager = undoManager;
    this.viewport = viewport;
    this.status = status;
    this.onChange = onChange;
    this.active = false;
    this.offset = 0.5;
    this.cuts = 1;
    this.numeric = '';
    this.lastResult = null;
    this.lastError = '';
  }

  async begin() {
    if (this.active) return false;
    if (this.document.mode !== 'edit') { this.lastError = 'Loop Cut is available in Edit Mode.'; return false; }
    const mesh = this.document.activeObject;
    const source = mesh?.userData?.hem;
    if (!source) { this.lastError = 'Select a mesh before using Loop Cut.'; return false; }
    if (this.document.selectionMode !== 'edge' || source.selectionMode !== 'edge' || source.edgeSelection.size !== 1) {
      this.lastError = 'Switch to Edge Select and select exactly one seed edge.';
      return false;
    }

    const seedEdgeIds = [...source.edgeSelection];
    const before = await this.document.serialize();
    this.mesh = mesh;
    this.before = before;
    this.basePositions = source.positions.map(point => [...point]);
    this.baseFaces = source.faces.map(face => [...face]);
    this.seedEdgeIds = seedEdgeIds;
    const canvasRect = this.viewport?.renderer?.domElement?.getBoundingClientRect?.();
    const lastPointer = this.viewport?.lastPointer;
    this.startPointer = lastPointer && canvasRect && lastPointer.x >= canvasRect.left && lastPointer.x <= canvasRect.right &&
      lastPointer.y >= canvasRect.top && lastPointer.y <= canvasRect.bottom
      ? { x: lastPointer.x, y: lastPointer.y } : null;
    this.offset = 0.5;
    this.cuts = 1;
    this.numeric = '';
    this.lastError = '';

    const preview = this.buildPreview(this.offset);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'The selected edge has no supported quad loop.';
      this.clear();
      return false;
    }
    this.lastResult = preview.result;
    this.applyPreview(preview.hem);
    this.active = true;
    this.status?.('LOOP CUT · wheel or +/- changes count · drag horizontally to slide · Enter apply · Esc cancel');
    this.onChange?.();
    return true;
  }

  offsetsFor(center = this.offset, cuts = this.cuts) {
    return Array.from({ length: cuts }, (_, index) => (index + 1) / (cuts + 1) + (center - 0.5));
  }

  centerLimits(cuts = this.cuts) {
    const first = 1 / (cuts + 1);
    const last = cuts / (cuts + 1);
    return { min: 0.01 - first + 0.5, max: 0.99 - last + 0.5 };
  }

  buildPreview(offset, cuts = this.cuts) {
    const hem = new HalfEdgeMesh(this.basePositions, this.baseFaces);
    hem.setSelectionMode('edge');
    hem.edgeSelection = new Set(this.seedEdgeIds);
    const result = hem.cutEdgeLoop({ cuts, offsets: this.offsetsFor(offset, cuts) });
    return { hem, result };
  }

  applyPreview(hem) {
    this.mesh.userData.hem = hem;
    this.document.updateMesh(this.mesh);
  }

  setOffset(value) {
    if (!this.active || !Number.isFinite(value)) return false;
    const limits = this.centerLimits();
    const next = clamp(value, limits.min, limits.max);
    const preview = this.buildPreview(next);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This cut position is not supported.';
      this.status?.(`Loop Cut position rejected · ${this.lastError}`);
      return false;
    }
    this.offset = next;
    if (Math.abs(next - value) > 1e-8 && this.numeric) this.numeric = next.toFixed(2);
    this.lastResult = preview.result;
    this.lastError = '';
    this.applyPreview(preview.hem);
    this.status?.(`Loop Cut · ${this.cuts} cut(s) · slide ${this.offset.toFixed(2)} · Enter apply / Esc cancel`);
    this.onChange?.();
    return true;
  }

  setCutCount(value) {
    if (!this.active || !Number.isInteger(value) || value < 1 || value > 8 || value === this.cuts) return false;
    const previous = this.cuts;
    this.cuts = value;
    const limits = this.centerLimits();
    const nextOffset = clamp(this.offset, limits.min, limits.max);
    const preview = this.buildPreview(nextOffset, value);
    if (!preview.result?.changed) {
      this.cuts = previous;
      this.lastError = preview.result?.reason || 'This cut count is not supported.';
      this.status?.(`Loop Cut count rejected · ${this.lastError}`);
      return false;
    }
    this.offset = nextOffset;
    this.numeric = '';
    this.lastResult = preview.result;
    this.lastError = '';
    this.applyPreview(preview.hem);
    this.status?.(`Loop Cut · ${this.cuts} cut(s) · drag to slide · Enter apply / Esc cancel`);
    this.onChange?.();
    return true;
  }

  adjustCuts(delta) {
    if (!this.active || !Number.isFinite(delta)) return false;
    return this.setCutCount(clamp(this.cuts + Math.sign(delta), 1, 8));
  }

  pointerMove(point, fine = false) {
    if (!this.active || !point) return;
    this.numeric = '';
    if (!this.startPointer) { this.startPointer = { x: Number(point.x) || 0, y: Number(point.y) || 0 }; return; }
    const rect = this.viewport?.renderer?.domElement?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || 1);
    const delta = (Number(point.x) - this.startPointer.x) / width;
    this.setOffset(0.5 + delta * (fine ? 0.12 : 1));
  }

  nudge(direction, fine = false) {
    if (!this.active) return false;
    this.numeric = '';
    return this.setOffset(this.offset + Math.sign(direction) * (fine ? 0.001 : 0.01));
  }

  appendNumeric(value) {
    if (!this.active) return false;
    if (value === 'backspace') this.numeric = this.numeric.slice(0, -1);
    else if (value === '.' && !this.numeric.includes('.')) this.numeric += '.';
    else if (/^\d$/.test(value)) this.numeric += value;
    else return false;
    if (!this.numeric || this.numeric === '.') return true;
    const parsed = Number(this.numeric);
    if (parsed > 0 && parsed < 1) return this.setOffset(parsed);
    this.status?.('Loop Cut offset must be greater than 0 and less than 1.');
    this.onChange?.();
    return false;
  }

  async confirm() {
    if (!this.active) return false;
    const after = await this.document.serialize();
    await this.undoManager?.record('Loop Cut', this.before, after);
    const result = this.lastResult ? { ...this.lastResult, offset: this.offset, cuts: this.cuts } : null;
    this.clear();
    this.status?.('Loop Cut applied');
    this.onChange?.();
    return result;
  }

  async cancel() {
    if (!this.active) return false;
    await this.document.restore(this.before);
    this.clear();
    this.status?.('Loop Cut cancelled');
    this.onChange?.();
    return true;
  }

  clear() {
    this.active = false;
    this.offset = 0.5;
    this.cuts = 1;
    this.numeric = '';
    this.lastResult = null;
    this.mesh = null;
    this.before = null;
    this.basePositions = [];
    this.baseFaces = [];
    this.seedEdgeIds = [];
    this.startPointer = null;
  }
}
