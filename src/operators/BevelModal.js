import { HalfEdgeMesh } from '../core/HalfEdgeMesh.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Interactive, transactional preview for the first conservative edge Bevel.
 * Every update is rebuilt from the immutable source mesh; cancel restores the
 * complete document snapshot and confirm records one undo transaction.
 */
export class BevelModal {
  constructor({ document, undoManager, viewport, status, onChange }) {
    this.document = document;
    this.undoManager = undoManager;
    this.viewport = viewport;
    this.status = status;
    this.onChange = onChange;
    this.active = false;
    this.amount = 0.25;
    this.numeric = '';
    this.lastResult = null;
    this.lastError = '';
  }

  async begin() {
    if (this.active) return false;
    if (this.document.mode !== 'edit') { this.lastError = 'Bevel is available in Edit Mode.'; return false; }
    const mesh = this.document.activeObject;
    const source = mesh?.userData?.hem;
    if (!source) { this.lastError = 'Select a mesh before using Bevel.'; return false; }
    if (this.document.selectionMode !== 'edge' || source.selectionMode !== 'edge' || source.edgeSelection.size < 1 || source.edgeSelection.size > 8) {
      this.lastError = 'Switch to Edge Select and select between one and eight edges.';
      return false;
    }

    this.mesh = mesh;
    this.before = await this.document.serialize();
    this.basePositions = source.positions.map(point => [...point]);
    this.baseFaces = source.faces.map(face => [...face]);
    this.seedEdgeIds = [...source.edgeSelection];
    const rect = this.viewport?.renderer?.domElement?.getBoundingClientRect?.();
    const pointer = this.viewport?.lastPointer;
    this.startPointer = pointer && rect && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom
      ? { x: pointer.x, y: pointer.y } : null;
    this.startAmount = 0.25;
    this.amount = this.startAmount;
    this.numeric = '';
    this.lastError = '';

    const preview = this.buildPreview(this.amount);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This edge neighborhood is not supported.';
      this.clear();
      return false;
    }
    this.lastResult = preview.result;
    this.applyPreview(preview.hem);
    this.active = true;
    this.status?.(`BEVEL · ${this.seedEdgeIds.length} edge${this.seedEdgeIds.length === 1 ? '' : 's'} · drag to change width · type 0–0.95 · Enter apply · Esc cancel`);
    this.onChange?.();
    return true;
  }

  buildPreview(amount) {
    const hem = new HalfEdgeMesh(this.basePositions, this.baseFaces);
    hem.setSelectionMode('edge');
    hem.edgeSelection = new Set(this.seedEdgeIds);
    const result = hem.bevelSelectedEdges({ amount });
    return { hem, result };
  }

  applyPreview(hem) {
    this.mesh.userData.hem = hem;
    this.document.updateMesh(this.mesh);
  }

  setAmount(value, { preserveNumeric = false } = {}) {
    if (!this.active || !Number.isFinite(value)) return false;
    const next = clamp(value, 0.01, 0.95);
    const preview = this.buildPreview(next);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This bevel amount is not supported.';
      this.status?.(`Bevel amount rejected · ${this.lastError}`);
      return false;
    }
    this.amount = next;
    if (!preserveNumeric) this.numeric = '';
    this.lastResult = preview.result;
    this.lastError = '';
    this.applyPreview(preview.hem);
    this.status?.(`Bevel · ${preview.result.bevelCount || 1} edge(s) · amount ${this.amount.toFixed(2)} · width ${preview.result.width.toFixed(3)} · Enter apply / Esc cancel`);
    this.onChange?.();
    return true;
  }

  pointerMove(point, fine = false) {
    if (!this.active || !point) return;
    if (!this.startPointer) {
      this.startPointer = { x: Number(point.x) || 0, y: Number(point.y) || 0 };
      this.startAmount = this.amount;
      return;
    }
    const rect = this.viewport?.renderer?.domElement?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || 1);
    const delta = (Number(point.x) - this.startPointer.x) / width;
    this.setAmount(this.startAmount + delta * (fine ? 0.12 : 0.8));
  }

  nudge(direction, fine = false) {
    if (!this.active) return false;
    return this.setAmount(this.amount + Math.sign(direction) * (fine ? 0.001 : 0.01));
  }

  appendNumeric(value) {
    if (!this.active) return false;
    if (value === 'backspace') this.numeric = this.numeric.slice(0, -1);
    else if (value === '.' && !this.numeric.includes('.')) this.numeric += '.';
    else if (/^\d$/.test(value)) this.numeric += value;
    else return false;
    if (!this.numeric || this.numeric === '.') return true;
    const parsed = Number(this.numeric);
    if (parsed > 0 && parsed <= 0.95) return this.setAmount(parsed, { preserveNumeric: true });
    if (parsed > 0.95) this.numeric = this.amount.toFixed(2);
    this.status?.('Bevel amount must be greater than 0 and no more than 0.95.');
    this.onChange?.();
    return false;
  }

  async confirm() {
    if (!this.active) return false;
    const after = await this.document.serialize();
    await this.undoManager?.record('Bevel', this.before, after);
    const result = this.lastResult ? { ...this.lastResult, amount: this.amount } : null;
    this.clear();
    this.status?.('Bevel applied');
    this.onChange?.();
    return result;
  }

  async cancel() {
    if (!this.active) return false;
    await this.document.restore(this.before);
    this.clear();
    this.status?.('Bevel cancelled');
    this.onChange?.();
    return true;
  }

  clear() {
    this.active = false;
    this.amount = 0.25;
    this.startAmount = 0.25;
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
