import { HalfEdgeMesh } from '../core/HalfEdgeMesh.js';
import { analyzeSelectedFaceRegions } from '../core/SelectedFaceRegions.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Interactive, transactional preview for supported edge Bevel, connected and
 * multi-region planar Face Bevel, Continuous Surface and per-face Face Bevel.
 * Every update is rebuilt from immutable
 * source topology; cancel restores the full snapshot and confirm records one
 * undo transaction.
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
    this.heightAmount = 0.25;
    this.activeDimension = 'width';
    this.faceBevelMode = 'region';
    this.continuousCurvedRegionCandidate = false;
    this.planarRegionCandidate = false;
    this.multiRegionCandidate = false;
    this.faceSettings = new Map();
    this.activeFaceIndex = 0;
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
    if (this.mode === 'face-region') return this.faceStatusText();
    return `Bevel · ${this.segments} segment(s) · profile ${this.profile.toFixed(2)}${this.profileSafetyNote()} · amount ${this.amount.toFixed(2)} · width ${this.lastResult?.width?.toFixed(3) || '—'} · Enter apply / Esc cancel`;
  }

  async begin() {
    if (this.active) return false;
    if (this.document.mode !== 'edit') { this.lastError = 'Bevel is available in Edit Mode.'; return false; }
    const mesh = this.document.activeObject;
    const source = mesh?.userData?.hem;
    if (!source) { this.lastError = 'Select a mesh before using Bevel.'; return false; }
    const selectionMode = this.document.selectionMode || source.selectionMode;
    this.continuousCurvedRegionCandidate = false;
    this.planarRegionCandidate = false;
    this.multiRegionCandidate = false;
    if (selectionMode === 'face' && source.selectionMode === 'face' && source.faceSelection.size > 0) {
      this.mode = 'face-region';
      this.seedFaceIds = [...source.faceSelection].sort((a, b) => a - b);
      this.seedEdgeIds = [];
      this.faceBevelMode = 'region';
      this.activeFaceIndex = 0;
      if (this.seedFaceIds.length > 1) {
        const analysis = source.analyzeFaceRegion(this.seedFaceIds);
        const separateRegions = analyzeSelectedFaceRegions(source, this.seedFaceIds);
        this.multiRegionCandidate = Boolean(separateRegions.valid && separateRegions.regions.length > 1);
        this.planarRegionCandidate = Boolean(separateRegions.valid && separateRegions.regions.length === 1 && analysis.connected);
        if (this.multiRegionCandidate) {
          // Treat disconnected, non-touching planar islands as independent
          // shared regions, not as unrelated per-face panels.
          this.faceBevelMode = 'multi-region';
        } else if (analysis.valid && analysis.connected && !analysis.planar && analysis.loopCount === 1) {
          // Prefer a shared continuous transition on locally smooth curved
          // patches. The geometry validator may still fall back to panels.
          this.faceBevelMode = 'curved-region';
        } else if (analysis.valid && (!analysis.connected || !analysis.planar || analysis.loopCount !== 1)) {
          this.faceBevelMode = 'individual';
        }
      }
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
    this.heightAmount = this.startAmount;
    this.activeDimension = 'width';
    this.segments = 1;
    this.profile = 0.5;
    this.numeric = '';
    this.lastError = '';
    this.faceSettings = new Map(this.seedFaceIds.map(faceId => [faceId, {
      amount: this.amount, heightAmount: this.heightAmount, segments: this.segments, profile: this.profile
    }]));

    let preview = this.buildPreview(this.amount, this.segments, this.profile, this.heightAmount);
    if (!preview.result?.changed && ['curved-region', 'multi-region'].includes(this.faceBevelMode)) {
      // Keep the existing individually validated face-panel path as a safe
      // fallback when one shared component cannot pass its candidate checks.
      this.faceBevelMode = 'individual';
      this.continuousCurvedRegionCandidate = false;
      preview = this.buildPreview(this.amount, this.segments, this.profile, this.heightAmount);
    }
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This edge neighborhood is not supported.';
      this.clear();
      return false;
    }
    this.lastResult = preview.result;
    if (this.faceBevelMode === 'curved-region') this.continuousCurvedRegionCandidate = true;
    this.applyPreview(preview.hem);
    this.active = true;
    this.status?.(this.mode === 'face-region'
      ? this.faceStatusText()
      : `BEVEL · ${this.segments} segment(s) · profile ${this.profile.toFixed(2)}${this.profileSafetyNote()} · drag width · +/- segments · [ ] profile · Enter apply · Esc cancel`);
    this.onChange?.();
    return true;
  }

  currentFaceSettings() {
    const faceId = this.seedFaceIds?.[this.activeFaceIndex];
    return this.faceSettings?.get(faceId) || {
      amount: this.amount, heightAmount: this.heightAmount, segments: this.segments, profile: this.profile
    };
  }

  syncActiveFaceSettings() {
    if (this.mode !== 'face-region' || this.faceBevelMode !== 'individual') return;
    const settings = this.currentFaceSettings();
    this.amount = settings.amount;
    this.heightAmount = settings.heightAmount;
    this.segments = settings.segments;
    this.profile = settings.profile;
  }

  cloneFaceSettings() {
    return new Map([...this.faceSettings.entries()].map(([faceId, settings]) => [faceId, { ...settings }]));
  }

  faceStatusText() {
    const result = this.lastResult || {};
    const individual = this.faceBevelMode === 'individual';
    const curved = this.faceBevelMode === 'curved-region';
    const activeFaceId = individual ? this.seedFaceIds[this.activeFaceIndex] : null;
    const activeResult = individual ? result.perFace?.find(item => item.faceId === activeFaceId) : result;
    const multiRegion = this.faceBevelMode === 'multi-region';
    const target = individual ? `INDIVIDUAL · FACE ${this.activeFaceIndex + 1}/${this.seedFaceIds.length}`
      : curved ? 'CONTINUOUS SURFACE' : multiRegion ? `MULTI-REGION · ${result.regionCount || 0} islands` : 'CONNECTED REGION';
    const modeHint = this.seedFaceIds.length > 1 ? ' · I toggles mode' : '';
    const faceHint = individual ? ' · PageUp/PageDown changes face' : '';
    return `FACE BEVEL · ${target} · ${result.reflexCorners || 0} reflex · ${this.segments} segment(s) · profile ${this.profile.toFixed(2)} · width ${Number(activeResult?.width || 0).toFixed(3)} · height ${Number(activeResult?.height || 0).toFixed(3)} · H switches width/height${modeHint}${faceHint} · Enter apply / Esc cancel`;
  }

  buildPreview(amount = this.amount, segments = this.segments, profile = this.profile, heightAmount = this.heightAmount,
    faceSettings = this.faceSettings, faceBevelMode = this.faceBevelMode) {
    const hem = new HalfEdgeMesh(this.basePositions, this.baseFaces);
    if (this.mode === 'face-region') {
      hem.setSelectionMode('face');
      hem.faceSelection = new Set(this.seedFaceIds);
      const result = faceBevelMode === 'individual'
        ? hem.bevelSelectedFacesIndividually({ faceSettings })
        : faceBevelMode === 'curved-region'
          ? hem.bevelSelectedCurvedFaceRegion({ amount, heightAmount, segments, profile })
          : faceBevelMode === 'multi-region'
            ? this.bevelSelectedFaceRegions(hem, { amount, heightAmount, segments, profile })
            : hem.bevelSelectedFaceRegion({ amount, heightAmount, segments, profile });
      return { hem, result };
    }
    hem.setSelectionMode('edge');
    hem.edgeSelection = new Set(this.seedEdgeIds);
    const result = hem.bevelSelectedEdges({ amount, segments, profile });
    return { hem, result };
  }


  bevelSelectedFaceRegions(hem, options) {
    const fail = reason => ({ changed: false, reason });
    const partition = analyzeSelectedFaceRegions(hem, this.seedFaceIds);
    if (!partition.valid || partition.regions.length < 2) {
      return fail(partition.reason || 'Multi-region Face Bevel requires at least two separate planar regions.');
    }

    const perRegion = [];
    for (const region of partition.regions) {
      hem.setSelectionMode('face');
      hem.clearSelection();
      hem.faceSelection = new Set(region.faceIds);
      const result = hem.bevelSelectedFaceRegion(options);
      if (!result.changed) {
        return fail(`Face Bevel region ${perRegion.length + 1} was rejected: ${result.reason || 'unsupported geometry.'}`);
      }
      perRegion.push(result);
    }

    const topology = hem.validateTopology();
    if (!topology.valid) return fail('Combined multi-region Face Bevel failed final topology validation; the source mesh was not changed.');
    hem.setSelectionMode('face');
    hem.clearSelection();
    hem.faceSelection = new Set(this.seedFaceIds);
    const total = key => perRegion.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
    const average = key => total(key) / perRegion.length;
    return {
      changed: true,
      operation: 'face-multi-region',
      regionCount: perRegion.length,
      selectedFaces: total('selectedFaces'),
      width: average('width'),
      height: average('height'),
      boundaryEdges: total('boundaryEdges'),
      insertedVertices: total('insertedVertices'),
      createdFaces: total('createdFaces'),
      reflexCorners: total('reflexCorners'),
      perRegion,
      topology
    };
  }

  setFaceBevelMode(mode) {
    if (!this.active || this.mode !== 'face-region' || !['region', 'individual', 'curved-region', 'multi-region'].includes(mode)) return false;
    if (mode === this.faceBevelMode) return true;
    if (mode === 'individual' && this.seedFaceIds.length < 2) {
      this.lastError = 'Select at least two faces to use Individual Faces mode.';
      this.status?.(this.lastError);
      return false;
    }

    let nextSettings = this.cloneFaceSettings();
    let nextAmount = this.amount, nextHeight = this.heightAmount;
    let nextSegments = this.segments, nextProfile = this.profile;
    if (mode === 'individual') {
      nextSettings = new Map(this.seedFaceIds.map(faceId => [faceId, {
        amount: this.amount, heightAmount: this.heightAmount, segments: this.segments, profile: this.profile
      }]));
    } else {
      const active = this.currentFaceSettings();
      const values = this.seedFaceIds.map(faceId => nextSettings.get(faceId)).filter(Boolean);
      const first = values[0] || active;
      const same = values.every(item => item.amount === first.amount && item.heightAmount === first.heightAmount &&
        item.segments === first.segments && item.profile === first.profile);
      if (!same) {
        this.lastError = 'Match the selected faces settings before switching back to a shared surface operation.';
        this.status?.(this.lastError);
        return false;
      }
      nextAmount = first.amount;
      nextHeight = first.heightAmount;
      nextSegments = first.segments;
      nextProfile = first.profile;
    }

    const preview = this.buildPreview(nextAmount, nextSegments, nextProfile, nextHeight, nextSettings, mode);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || `Unable to use ${mode} Face Bevel mode.`;
      this.status?.(this.lastError);
      return false;
    }
    const hadContinuousCurvedCandidate = this.continuousCurvedRegionCandidate;
    const hadPlanarRegionCandidate = this.planarRegionCandidate;
    this.faceBevelMode = mode;
    // These flags describe which shared alternatives were validated for the
    // original selection, not merely the currently active preview mode. Keep
    // them while visiting Individual Faces so the owner can switch back later.
    this.continuousCurvedRegionCandidate = mode === 'curved-region' ||
      (mode === 'individual' && hadContinuousCurvedCandidate);
    this.planarRegionCandidate = mode === 'region' ||
      (mode === 'individual' && hadPlanarRegionCandidate);
    this.faceSettings = nextSettings;
    this.amount = nextAmount;
    this.heightAmount = nextHeight;
    this.segments = nextSegments;
    this.profile = nextProfile;
    this.activeFaceIndex = 0;
    this.syncActiveFaceSettings();
    this.lastResult = preview.result;
    this.lastError = '';
    this.numeric = '';
    this.startPointer = null;
    this.applyPreview(preview.hem);
    this.status?.(this.faceStatusText());
    this.onChange?.();
    return true;
  }

  hasContinuousCurvedRegionCandidate() {
    return this.mode === 'face-region' && this.continuousCurvedRegionCandidate;
  }

  hasPlanarRegionCandidate() {
    return this.mode === 'face-region' && this.planarRegionCandidate;
  }

  hasMultiRegionCandidate() {
    return this.mode === 'face-region' && this.multiRegionCandidate;
  }

  toggleFaceBevelMode() {
    if (this.faceBevelMode === 'individual') {
      if (this.hasContinuousCurvedRegionCandidate()) return this.setFaceBevelMode('curved-region');
      if (this.hasMultiRegionCandidate()) return this.setFaceBevelMode('multi-region');
      if (this.hasPlanarRegionCandidate()) return this.setFaceBevelMode('region');
      this.lastError = 'This curved selection did not pass Continuous Surface validation. Individual Faces is the supported safe mode.';
      this.status?.(this.lastError);
      return false;
    }
    return this.setFaceBevelMode('individual');
  }

  selectFaceTarget(delta) {
    if (!this.active || this.mode !== 'face-region' || this.faceBevelMode !== 'individual' || !this.seedFaceIds.length) return false;
    const count = this.seedFaceIds.length;
    this.activeFaceIndex = (this.activeFaceIndex + Math.sign(delta) + count) % count;
    this.syncActiveFaceSettings();
    this.numeric = '';
    this.startPointer = null;
    this.onChange?.();
    this.status?.(this.faceStatusText());
    return true;
  }

  applyPreview(hem) {
    this.mesh.userData.hem = hem;
    this.document.updateMesh(this.mesh);
  }

  setAmount(value, { preserveNumeric = false } = {}) {
    if (!this.active || !Number.isFinite(value)) return false;
    const next = clamp(value, 0.01, 0.95);
    const faceSettings = this.faceBevelMode === 'individual' ? this.cloneFaceSettings() : this.faceSettings;
    if (this.mode === 'face-region' && this.faceBevelMode === 'individual') {
      faceSettings.get(this.seedFaceIds[this.activeFaceIndex]).amount = next;
    }
    const preview = this.buildPreview(next, this.segments, this.profile, this.heightAmount, faceSettings);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This bevel amount is not supported.';
      this.status?.(`Bevel amount rejected · ${this.lastError}`);
      return false;
    }
    this.amount = next;
    if (this.faceBevelMode === 'individual') this.faceSettings = faceSettings;
    if (!preserveNumeric) this.numeric = '';
    this.lastResult = preview.result;
    this.lastError = '';
    this.applyPreview(preview.hem);
    this.status?.(this.previewStatus());
    this.onChange?.();
    return true;
  }

  setHeightAmount(value, { preserveNumeric = false } = {}) {
    if (!this.active || this.mode !== 'face-region' || !Number.isFinite(value)) return false;
    const next = clamp(value, 0.01, 0.95);
    const faceSettings = this.faceBevelMode === 'individual' ? this.cloneFaceSettings() : this.faceSettings;
    if (this.faceBevelMode === 'individual') faceSettings.get(this.seedFaceIds[this.activeFaceIndex]).heightAmount = next;
    const preview = this.buildPreview(this.amount, this.segments, this.profile, next, faceSettings);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This bevel height is not supported.';
      this.status?.(`Face Bevel height rejected · ${this.lastError}`);
      return false;
    }
    this.heightAmount = next;
    if (this.faceBevelMode === 'individual') this.faceSettings = faceSettings;
    if (!preserveNumeric) this.numeric = '';
    this.lastResult = preview.result;
    this.lastError = '';
    this.applyPreview(preview.hem);
    this.status?.(this.faceStatusText());
    this.onChange?.();
    return true;
  }

  setActiveDimension(dimension) {
    if (!this.active || this.mode !== 'face-region' || !['width', 'height'].includes(dimension)) return false;
    if (this.activeDimension === dimension) return true;
    this.activeDimension = dimension;
    this.numeric = '';
    // Start a fresh pointer anchor when the drag target changes.
    this.startPointer = null;
    this.onChange?.();
    this.status?.(this.faceStatusText());
    return true;
  }

  toggleActiveDimension() {
    return this.setActiveDimension(this.activeDimension === 'width' ? 'height' : 'width');
  }

  setSegments(value) {
    if (!this.active || !Number.isFinite(value)) return false;
    const next = Math.round(clamp(value, 1, 8));
    const faceSettings = this.faceBevelMode === 'individual' ? this.cloneFaceSettings() : this.faceSettings;
    if (this.faceBevelMode === 'individual') faceSettings.get(this.seedFaceIds[this.activeFaceIndex]).segments = next;
    const preview = this.buildPreview(this.amount, next, this.profile, this.heightAmount, faceSettings);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This segment count is not supported.';
      this.status?.(`Bevel segments rejected · ${this.lastError}`);
      return false;
    }
    this.segments = next;
    if (this.faceBevelMode === 'individual') this.faceSettings = faceSettings;
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
    const faceSettings = this.faceBevelMode === 'individual' ? this.cloneFaceSettings() : this.faceSettings;
    if (this.faceBevelMode === 'individual') faceSettings.get(this.seedFaceIds[this.activeFaceIndex]).profile = next;
    const preview = this.buildPreview(this.amount, this.segments, next, this.heightAmount, faceSettings);
    if (!preview.result?.changed) {
      this.lastError = preview.result?.reason || 'This profile is not supported.';
      this.status?.(`Bevel profile rejected · ${this.lastError}`);
      return false;
    }
    this.profile = next;
    if (this.faceBevelMode === 'individual') this.faceSettings = faceSettings;
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
      this.startAmount = this.mode === 'face-region' && this.activeDimension === 'height'
        ? this.heightAmount : this.amount;
      return;
    }
    const rect = this.viewport?.renderer?.domElement?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || 1);
    const delta = (Number(point.x) - this.startPointer.x) / width;
    const next = this.startAmount + delta * (fine ? 0.12 : 0.8);
    if (this.mode === 'face-region' && this.activeDimension === 'height') this.setHeightAmount(next);
    else this.setAmount(next);
  }

  nudge(direction, fine = false) {
    if (!this.active) return false;
    if (this.mode === 'face-region' && this.activeDimension === 'height') {
      return this.setHeightAmount(this.heightAmount + Math.sign(direction) * (fine ? 0.001 : 0.01));
    }
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
    if (parsed >= 0.01 && parsed <= 0.95) {
      return this.mode === 'face-region' && this.activeDimension === 'height'
        ? this.setHeightAmount(parsed, { preserveNumeric: true })
        : this.setAmount(parsed, { preserveNumeric: true });
    }
    if (parsed > 0.95 || (parsed > 0 && parsed < 0.01)) {
      this.numeric = (this.mode === 'face-region' && this.activeDimension === 'height' ? this.heightAmount : this.amount).toFixed(2);
    }
    this.lastError = this.mode === 'face-region' && this.activeDimension === 'height'
      ? 'Face Bevel height must be between 0.01 and 0.95.'
      : 'Bevel amount must be between 0.01 and 0.95.';
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
      heightAmount: this.heightAmount,
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
    this.heightAmount = 0.25;
    this.activeDimension = 'width';
    this.faceBevelMode = 'region';
    this.continuousCurvedRegionCandidate = false;
    this.planarRegionCandidate = false;
    this.multiRegionCandidate = false;
    this.faceSettings = new Map();
    this.activeFaceIndex = 0;
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
