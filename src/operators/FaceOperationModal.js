import { HalfEdgeMesh } from '../core/HalfEdgeMesh.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Transactional preview for face-region Extrude and single-face Inset.
 * Each preview is rebuilt from immutable source topology. Unsupported or
 * invalid candidates never replace the live source; confirm records one undo
 * entry and cancel restores the full document snapshot.
 */
export class FaceOperationModal {
  constructor({ document, undoManager, viewport, status, onChange }) {
    this.document = document;
    this.undoManager = undoManager;
    this.viewport = viewport;
    this.status = status;
    this.onChange = onChange;
    this.active = false;
    this.operation = null;
    this.value = 0;
    this.numeric = '';
    this.lastResult = null;
    this.lastError = '';
  }

  async begin(operation) {
    if (this.active) return false;
    if (!['extrude', 'inset'].includes(operation)) {
      this.lastError = 'Choose Extrude or Inset.';
      return false;
    }
    if (this.document.mode !== 'edit') {
      this.lastError = `${operation === 'extrude' ? 'Extrude' : 'Inset'} is available in Edit Mode.`;
      return false;
    }

    const mesh = this.document.activeObject;
    const source = mesh?.userData?.hem;
    if (!source) {
      this.lastError = 'Select a mesh before editing faces.';
      return false;
    }
    if (this.document.selectionMode !== 'face' || source.selectionMode !== 'face' || !source.faceSelection.size) {
      this.lastError = `Switch to Face Select and select ${operation === 'inset' ? 'one face' : 'a connected planar face region'}.`;
      return false;
    }
    if (operation === 'inset' && source.faceSelection.size !== 1) {
      this.lastError = 'Inset currently supports exactly one selected face. Select one face and try again.';
      return false;
    }
    const sourceReport = source.validateTopology();
    if (!sourceReport.valid) {
      this.lastError = 'The source mesh has topology warnings. Validate and repair safe issues before using this operation.';
      return false;
    }
    if (operation === 'extrude' && !this.isSupportedExtrudeRegion(source, [...source.faceSelection])) {
      this.lastError = 'Extrude requires one connected, planar face region with a single simple boundary.';
      return false;
    }

    const before = await this.document.serialize();
    this.mesh = mesh;
    this.before = before;
    this.basePositions = source.positions.map(point => [...point]);
    this.baseFaces = source.faces.map(face => [...face]);
    this.seedFaceIds = [...source.faceSelection];
    this.operation = operation;
    this.value = operation === 'extrude' ? 1 : 0.12;
    this.numeric = '';
    this.lastError = '';

    // A face-selection tap or side-panel click can leave a stale viewport
    // pointer behind. Wait for the actual drag pointer-down to establish the
    // preview anchor rather than applying that old displacement.
    this.startPointer = null;
    this.startValue = this.value;
    this.dragScale = operation === 'extrude'
      ? Math.max(1, this.viewport?.camera?.position?.distanceTo?.(this.viewport?.controls?.target) || 8) * 0.8
      : 0.8;

    const preview = this.buildPreview(this.value);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || `The selected region cannot be ${operation}d safely.`;
      this.clear();
      return false;
    }
    this.lastResult = preview.result;
    this.applyPreview(preview.hem);
    this.active = true;
    this.status?.(operation === 'extrude'
      ? 'EXTRUDE · drag up/down or type a distance · Enter apply · Esc cancel'
      : 'INSET · drag up/down or type an amount · Enter apply · Esc cancel');
    this.onChange?.();
    return true;
  }

  isSupportedExtrudeRegion(source, faceIds) {
    if (!Array.isArray(faceIds) || !faceIds.length) return false;
    if (faceIds.length === 1) return Boolean(source.faces[faceIds[0]] && source.triangulateFace(faceIds[0]).length);
    // boundaryForRegion verifies a single simple boundary, planar faces and
    // consistent normals; this also excludes disconnected selections/holes.
    return Boolean(source.boundaryForRegion(faceIds));
  }

  buildPreview(value) {
    const hem = new HalfEdgeMesh(this.basePositions, this.baseFaces);
    hem.setSelectionMode('face');
    hem.faceSelection = new Set(this.seedFaceIds);
    const changed = this.operation === 'extrude'
      ? hem.extrudeSelected(value)
      : hem.insetSelected(value);
    if (!changed) return { hem, result: { changed: false, reason: `The selected faces could not be ${this.operation}d.` } };
    const report = hem.validateTopology();
    if (!report.valid) {
      return { hem, result: { changed: false, reason: `${this.operation === 'extrude' ? 'Extrude' : 'Inset'} candidate failed topology validation; the source mesh was not changed.` } };
    }
    const sourceFaces = this.baseFaces.length;
    return {
      hem,
      result: {
        changed: true,
        operation: this.operation,
        value,
        selectedFaces: this.seedFaceIds.length,
        insertedVertices: hem.positions.length - this.basePositions.length,
        createdFaces: hem.faces.length - sourceFaces,
        topology: report
      }
    };
  }

  applyPreview(hem) {
    this.mesh.userData.hem = hem;
    this.document.updateMesh(this.mesh);
  }

  setValue(value, { preserveNumeric = false } = {}) {
    if (!this.active || !Number.isFinite(value)) return false;
    const next = this.operation === 'extrude'
      ? clamp(value, -100, 100)
      : clamp(value, 0.005, 0.9);
    if (this.operation === 'extrude' && Math.abs(next) < 1e-4) {
      this.lastError = 'Extrude distance must be non-zero.';
      this.status?.(this.lastError);
      return false;
    }
    const preview = this.buildPreview(next);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || `This ${this.operation} value is not supported.`;
      this.status?.(`${this.operation === 'extrude' ? 'Extrude' : 'Inset'} preview rejected · ${this.lastError}`);
      return false;
    }
    this.value = next;
    if (!preserveNumeric) this.numeric = '';
    this.lastResult = preview.result;
    this.lastError = '';
    this.applyPreview(preview.hem);
    this.status?.(`${this.operation === 'extrude' ? 'Extrude' : 'Inset'} preview · ${this.value.toFixed(3)} · Enter apply / Esc cancel`);
    this.onChange?.();
    return true;
  }

  setPointerAnchor(point) {
    if (!this.active || !point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return false;
    this.startPointer = { x: Number(point.x), y: Number(point.y) };
    this.startValue = this.value;
    return true;
  }

  pointerMove(point, fine = false) {
    if (!this.active || !point) return;
    if (!this.startPointer) {
      this.setPointerAnchor(point);
      return;
    }
    const rect = this.viewport?.renderer?.domElement?.getBoundingClientRect?.();
    const height = Math.max(1, rect?.height || 1);
    const delta = (this.startPointer.y - Number(point.y)) / height;
    const scale = this.dragScale * (fine ? 0.15 : 1);
    this.numeric = '';
    this.setValue(this.startValue + delta * scale);
  }

  nudge(direction, fine = false) {
    if (!this.active || !Number.isFinite(direction)) return false;
    this.numeric = '';
    const step = this.operation === 'extrude' ? (fine ? 0.005 : 0.05) : (fine ? 0.001 : 0.01);
    return this.setValue(this.value + Math.sign(direction) * step);
  }

  appendNumeric(value) {
    if (!this.active) return false;
    if (value === 'backspace') this.numeric = this.numeric.slice(0, -1);
    else if (value === '-' && this.operation === 'extrude' && !this.numeric) this.numeric = '-';
    else if (value === '.' && !this.numeric.includes('.')) this.numeric += '.';
    else if (/^\d$/.test(value)) this.numeric += value;
    else return false;

    if (!this.numeric || this.numeric === '-' || this.numeric === '.') return true;
    const parsed = Number(this.numeric);
    if (!Number.isFinite(parsed) || (this.operation === 'extrude' ? Math.abs(parsed) < 1e-4 || Math.abs(parsed) > 100 : parsed < 0.005 || parsed > 0.9)) {
      this.status?.(this.operation === 'extrude'
        ? 'Extrude distance must be non-zero and within ±100.'
        : 'Inset amount must be between 0.005 and 0.9.');
      this.onChange?.();
      return false;
    }
    return this.setValue(parsed, { preserveNumeric: true });
  }

  async confirm() {
    if (!this.active) return false;
    const after = await this.document.serialize();
    await this.undoManager?.record(this.operation === 'extrude' ? 'Extrude' : 'Inset', this.before, after);
    const result = this.lastResult ? { ...this.lastResult, value: this.value } : null;
    const operation = this.operation;
    this.clear();
    this.status?.(`${operation === 'extrude' ? 'Extrude' : 'Inset'} applied`);
    this.onChange?.();
    return result;
  }

  async cancel() {
    if (!this.active) return false;
    await this.document.restore(this.before);
    const operation = this.operation;
    this.clear();
    this.status?.(`${operation === 'extrude' ? 'Extrude' : 'Inset'} cancelled`);
    this.onChange?.();
    return true;
  }

  clear() {
    this.active = false;
    this.operation = null;
    this.value = 0;
    this.numeric = '';
    this.lastResult = null;
    this.mesh = null;
    this.before = null;
    this.basePositions = [];
    this.baseFaces = [];
    this.seedFaceIds = [];
    this.startPointer = null;
    this.startValue = 0;
    this.dragScale = 1;
  }
}
