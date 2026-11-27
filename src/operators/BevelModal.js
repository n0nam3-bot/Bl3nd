import { HalfEdgeMesh } from '../core/HalfEdgeMesh.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Interactive, transactional preview for supported edge and planar face-region
 * Bevel. Every update is rebuilt from the
 * immutable source mesh; cancel restores the complete document snapshot and
 * confirm records one undo transaction.
 */
export class BevelModal {
  constructor({ document, undoManager, viewport, status, onChange }) {
    this.document = document;
    this.undoManager = undoManager;
    this.viewport = viewport;
    this.status = status;
    this.onChange = onChange;
    this.active = false;
    this.mode = 'edge';
    this.amount = 0.25;
    this.segments = 1;
    this.profile = 0.5;
    this.numeric = '';
    this.lastResult = null;
    this.lastError = '';
  }

  profileSafetyNote() {
    return this.mode === 'edge' && this.segments > 1 && this.lastResult?.profileScale < 1
      ? ' · high-valence profile limited to 25%' : '';
  }

  previewStatus() {
    if (this.mode === 'face-region') {
      return `Face Bevel · ${this.lastResult?.selectedFaces || this.seedFaceIds.length} face(s) · ${this.lastResult?.reflexCorners || 0} reflex · ${this.segments} segment(s) · profile ${this.profile.toFixed(2)} · amount ${this.amount.toFixed(2)} · width ${this.lastResult?.width?.toFixed(3) || '—'} · Enter apply / Esc cancel`;
    }
    return `Bevel · ${this.segments} segment(s) · profile ${this.profile.toFixed(2)}${this.profileSafetyNote()} · amount ${this.amount.toFixed(2)} · width ${this.lastResult?.width?.toFixed(3) || '—'} · Enter apply / Esc cancel`;
  }

  async begin() {
    if (this.active) return false;
    if (this.document.mode !== 'edit') { this.lastError = 'Bevel is available in Edit Mode.'; return false; }
    const mesh = this.document.activeObject;
    const source = mesh?.userData?.hem;
    if (!source) { this.lastError = 'Select a mesh before using Bevel.'; return false; }
    const selectionMode = this.document.selectionMode || source.selectionMode;
    if (selectionMode === 'face' && source.selectionMode === 'face' && source.faceSelection.size > 0) {
      this.mode = 'face-region';
      this.seedFaceIds = [...source.faceSelection].sort((a, b) => a - b);
      this.seedEdgeIds = [];
    } else if (selectionMode === 'edge' && source.selectionMode === 'edge' && source.edgeSelection.size >= 1 && source.edgeSelection.size <= 8) {
      this.mode = 'edge';
      this.seedEdgeIds = [...source.edgeSelection];
      this.seedFaceIds = [];
    } else {
      this.lastError = 'Switch to Face Select and select a supported face region, or Edge Select and select between one and eight edges.';
      return false;
    }

    this.mesh = mesh;
    this.before = await this.document.serialize();
    this.basePositions = source.positions.map(point => [...point]);
    this.baseFaces = source.faces.map(face => [...face]);
    const rect = this.viewport?.renderer?.domElement?.getBoundingClientRect?.();
    const pointer = this.viewport?.lastPointer;
    this.startPointer = pointer && rect && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom
      ? { x: pointer.x, y: pointer.y } : null;
    this.startAmount = 0.25;
    this.amount = this.startAmount;
    this.segments = 1;
    this.profile = 0.5;
    this.numeric = '';
    this.lastError = '';

    const preview = this.buildPreview(this.amount, this.segments, this.profile);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This edge neighborhood is not supported.';
      this.clear();
      return false;
    }
    this.lastResult = preview.result;
    this.applyPreview(preview.hem);
    this.active = true;
    this.status?.(this.mode === 'face-region'
      ? `FACE BEVEL · ${this.lastResult.selectedFaces} face(s) · ${this.lastResult.reflexCorners || 0} reflex · ${this.segments} segment(s) · profile ${this.profile.toFixed(2)} · width ${this.lastResult.width.toFixed(3)} · drag / type amount · +/- segments · [ ] profile · Enter apply · Esc cancel`
      : `BEVEL · ${this.segments} segment(s) · profile ${this.profile.toFixed(2)}${this.profileSafetyNote()} · drag width · +/- segments · [ ] profile · Enter apply · Esc cancel`);
    this.onChange?.();
    return true;
  }

  buildPreview(amount, segments = this.segments, profile = this.profile) {
    const hem = new HalfEdgeMesh(this.basePositions, this.baseFaces);
    if (this.mode === 'face-region') {
      hem.setSelectionMode('face');
      hem.faceSelection = new Set(this.seedFaceIds);
      return { hem, result: hem.bevelSelectedFaceRegion({ amount, segments, profile }) };
    }
    hem.setSelectionMode('edge');
    hem.edgeSelection = new Set(this.seedEdgeIds);
    const result = hem.bevelSelectedEdges({ amount, segments, profile });
    return { hem, result };
  }

  applyPreview(hem) {
    this.mesh.userData.hem = hem;
    this.document.updateMesh(this.mesh);
  }

  setAmount(value, { preserveNumeric = false } = {}) {
    if (!this.active || !Number.isFinite(value)) return false;
    const next = clamp(value, 0.01, 0.95);
    const preview = this.buildPreview(next, this.segments, this.profile);
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
    this.status?.(this.previewStatus());
    this.onChange?.();
    return true;
  }

  setSegments(value) {
    if (!this.active || !Number.isFinite(value)) return false;
    const next = Math.round(clamp(value, 1, 8));
    const preview = this.buildPreview(this.amount, next, this.profile);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This segment count is not supported.';
      this.status?.(`Bevel segments rejected · ${this.lastError}`);
      return false;
    }
    this.segments = next;
    this.lastResult = preview.result;
    this.lastError = '';
    this.applyPreview(preview.hem);
    this.status?.(this.previewStatus());
    this.onChange?.();
    return true;
  }

  changeSegments(delta) {
    if (!this.active || !Number.isFinite(delta)) return false;
    return this.setSegments(this.segments + Math.sign(delta));
  }

  setProfile(value) {
    if (!this.active || !Number.isFinite(value)) return false;
    const next = Math.round(clamp(value, 0, 1) * 100) / 100;
    const preview = this.buildPreview(this.amount, this.segments, next);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This profile is not supported.';
      this.status?.(`Bevel profile rejected · ${this.lastError}`);
      return false;
    }
    this.profile = next;
    this.lastResult = preview.result;
    this.lastError = '';
    this.applyPreview(preview.hem);
    this.status?.(this.previewStatus());
    this.onChange?.();
    return true;
  }

  changeProfile(delta, fine = false) {
    if (!this.active || !Number.isFinite(delta)) return false;
    return this.setProfile(this.profile + Math.sign(delta) * (fine ? 0.01 : 0.05));
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
    if (parsed >= 0.01 && parsed <= 0.95) return this.setAmount(parsed, { preserveNumeric: true });
    if (parsed > 0.95 || (parsed > 0 && parsed < 0.01)) this.numeric = this.amount.toFixed(2);
    this.lastError = 'Bevel amount must be between 0.01 and 0.95.';
    this.status?.(this.lastError);
    this.onChange?.();
    return false;
  }

  async confirm() {
    if (!this.active) return false;
    const after = await this.document.serialize();
    const label = this.mode === 'face-region' ? 'Face Bevel' : 'Bevel';
    await this.undoManager?.record(label, this.before, after);
    const result = this.lastResult ? {
      ...this.lastResult,
      amount: this.amount,
      segments: this.segments,
      profile: this.profile
    } : null;
    this.clear();
    this.status?.(`${label} applied`);
    this.onChange?.();
    return result;
  }

  async cancel() {
    if (!this.active) return false;
    await this.document.restore(this.before);
    const label = this.mode === 'face-region' ? 'Face Bevel' : 'Bevel';
    this.clear();
    this.status?.(`${label} cancelled`);
    this.onChange?.();
    return true;
  }

  clear() {
    this.active = false;
    this.mode = 'edge';
    this.amount = 0.25;
    this.startAmount = 0.25;
    this.segments = 1;
    this.profile = 0.5;
    this.numeric = '';
    this.lastResult = null;
    this.mesh = null;
    this.before = null;
    this.basePositions = [];
    this.baseFaces = [];
    this.seedEdgeIds = [];
    this.seedFaceIds = [];
    this.startPointer = null;
  }
}
