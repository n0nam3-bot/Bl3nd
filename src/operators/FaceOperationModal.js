import { HalfEdgeMesh } from '../core/HalfEdgeMesh.js';
import { analyzeSelectedFaceRegions } from '../core/SelectedFaceRegions.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Transactional preview for face-region Extrude and Inset across one or more
 * disconnected planar islands. Each preview is rebuilt from immutable source
 * topology. Unsupported or
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
      this.lastError = 'Switch to Face Select and select one or more separate planar face regions.';
      return false;
    }
    const sourceReport = source.validateTopology({ allowSafeWarpedQuads: true });
    if (!sourceReport.valid) {
      this.lastError = 'The source mesh has topology warnings. Validate and repair safe issues before using this operation.';
      return false;
    }
    this.baseSafeWarpedQuadSignatures = source.getSafeWarpedQuadSignatures();
    const regionAnalysis = analyzeSelectedFaceRegions(source, [...source.faceSelection]);
    if (!regionAnalysis.valid) {
      this.lastError = `${operation === 'extrude' ? 'Extrude' : 'Inset'} needs one or more separate connected planar regions. ${regionAnalysis.reason}`;
      return false;
    }
    this.regionCount = regionAnalysis.regions.length;

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
    const regionDetail = this.lastResult.regionCount > 1 ? ` · ${this.lastResult.regionCount} regions` : '';
    this.status?.(operation === 'extrude'
      ? `EXTRUDE · ${this.lastResult.selectedFaces} face(s)${regionDetail} · ${this.lastResult.boundaryEdges} boundary edges · distance ${this.lastResult.distance.toFixed(3)} · drag / type · Enter apply · Esc cancel`
      : `INSET · ${this.seedFaceIds.length} face(s)${regionDetail} · average offset ${this.lastResult.distance.toFixed(3)} · drag / type amount · Enter apply · Esc cancel`);
    this.onChange?.();
    return true;
  }

  isSupportedExtrudeRegion(source, faceIds) {
    return analyzeSelectedFaceRegions(source, faceIds).valid;
  }

  buildPreview(value) {
    const hem = new HalfEdgeMesh(this.basePositions, this.baseFaces);
    const partition = analyzeSelectedFaceRegions(hem, this.seedFaceIds);
    if (!partition.valid) return { hem, result: { changed: false, reason: partition.reason } };

    const faceSignature = face => JSON.stringify([...face].sort((a, b) => a - b));
    const selectedOutputSignatures = new Set();
    const operations = [];
    const operationName = this.operation === 'extrude' ? 'Extrude' : 'Inset';

    for (const region of partition.regions) {
      let selectedIds = region.faceIds;
      if (this.operation === 'inset') {
        const sourceSignatures = new Set(region.faceIds.map(faceId => faceSignature(this.baseFaces[faceId])));
        selectedIds = hem.faces.map((face, faceId) => sourceSignatures.has(faceSignature(face)) ? faceId : -1)
          .filter(faceId => faceId >= 0);
        if (selectedIds.length !== region.faceIds.length) {
          return { hem, result: { changed: false, reason: 'Inset could not safely match a remaining selected region after another region was processed.' } };
        }
      }

      hem.setSelectionMode('face');
      hem.clearSelection();
      hem.faceSelection = new Set(selectedIds);
      const details = this.operation === 'extrude'
        ? hem.extrudeSelectedRegion(value)
        : hem.insetSelectedRegion(value);
      if (!details?.changed) {
        return { hem, result: { changed: false, reason: `${operationName} region ${operations.length + 1} was rejected: ${details?.reason || 'unsupported region geometry.'} The source mesh was not changed.` } };
      }
      operations.push(details);
      for (const faceId of hem.faceSelection) {
        const face = hem.faces[faceId];
        if (face) selectedOutputSignatures.add(faceSignature(face));
      }
    }

    const report = hem.validateTopology({ allowedSafeWarpedQuadSignatures: this.baseSafeWarpedQuadSignatures });
    if (!report.valid || hem.faces.some((_, faceId) => !hem.triangulateFace(faceId).length)) {
      return { hem, result: { changed: false, reason: `${operationName} combined candidate failed final topology or triangulation validation; the source mesh was not changed.` } };
    }

    const selectedOutputIds = [];
    hem.faces.forEach((face, faceId) => {
      if (selectedOutputSignatures.has(faceSignature(face))) selectedOutputIds.push(faceId);
    });
    if (selectedOutputIds.length !== this.seedFaceIds.length) {
      return { hem, result: { changed: false, reason: `${operationName} could not recover every selected result face; the source mesh was not changed.` } };
    }
    hem.setSelectionMode('face');
    hem.clearSelection();
    hem.faceSelection = new Set(selectedOutputIds);

    const sum = key => operations.reduce((total, item) => total + (Number(item[key]) || 0), 0);
    const average = key => sum(key) / Math.max(1, operations.length);
    return {
      hem,
      result: {
        changed: true,
        operation: this.operation,
        value,
        regionCount: operations.length,
        selectedFaces: sum('selectedFaces'),
        distance: average('distance'),
        distances: operations.map(item => item.distance),
        normal: operations.length === 1 ? operations[0].normal : null,
        boundaryEdges: sum('boundaryEdges'),
        insertedVertices: hem.positions.length - this.basePositions.length,
        createdFaces: hem.faces.length - this.baseFaces.length,
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
    const distanceDetail = Number.isFinite(this.lastResult?.distance)
      ? ` · ${this.operation === 'extrude' ? 'distance' : 'offset'} ${this.lastResult.distance.toFixed(3)}` : '';
    const regionDetail = this.lastResult.regionCount > 1 ? ` · ${this.lastResult.regionCount} regions` : '';
    this.status?.(`${this.operation === 'extrude' ? 'Extrude' : 'Inset'} preview · ${this.value.toFixed(3)}${distanceDetail}${regionDetail} · Enter apply / Esc cancel`);
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
        : 'Inset amount must be between 0.005 and 0.9 (a fraction of the shortest region boundary edge).');
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
    this.baseSafeWarpedQuadSignatures = new Set();
    this.seedFaceIds = [];
    this.startPointer = null;
    this.startValue = 0;
    this.dragScale = 1;
    this.regionCount = 0;
  }
}
