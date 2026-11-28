import * as THREE from 'three';
import { resolveTransformAxis } from '../core/TransformOrientation.js';
import { groupSelectedTransformVertices, resolveTransformPivotPoint } from '../core/TransformPivot.js';
import { getTransformSnapStep, normalizeTransformSnapSettings, resolveMoveSnapAmount, resolveRotateSnapDegrees, resolveScaleSnapFactor } from '../core/TransformSnap.js';
import { buildProportionalInfluence, normalizeProportionalSettings } from '../core/ProportionalEditing.js';

const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

/**
 * Camera-aware modal transforms.
 * Free movement follows the view plane at the pivot depth. Axis-constrained
 * pointer movement is projected into world-axis distance. Free rotation uses
 * a virtual trackball expressed in the camera's orientation.
 */
export class ModalTransform {
  constructor({ document, undoManager, viewport, onChange, status, transformSnapSettings = {}, proportionalSettings = {} }) {
    this.document = document;
    this.undoManager = undoManager;
    this.viewport = viewport;
    this.onChange = onChange;
    this.status = status;
    this.active = false;
    this.type = null;
    this.axis = null;
    this.planeNormal = null;
    this.numeric = '';
    this.startPointer = { x: 0, y: 0 };
    this.lastPointer = { x: 0, y: 0 };
    this.before = null;
    this.object = null;
    this.original = null;
    this.vertexIds = [];
    this.originalVertices = [];
    this.sourcePositions = [];
    this.selectedGroups = [];
    this.proportionalInfluencedCount = 0;
    this.transformGroups = [];
    this.individualPivotWorlds = [];
    this.editPivot = new THREE.Vector3();
    this.worldPivot = new THREE.Vector3();
    this.viewFrame = null;
    this.arcballStart = null;
    this.orientation = 'global';
    this.startWorldQuaternion = new THREE.Quaternion();
    this.transformSnapSettings = normalizeTransformSnapSettings(transformSnapSettings);
    this.proportionalSettings = normalizeProportionalSettings(proportionalSettings);
  }

  async begin(type, pointer = null) {
    if (!['move', 'rotate', 'scale'].includes(type) || !this.document.activeObject) return false;
    if (this.active) await this.cancel();

    this.before = await this.document.serialize();
    this.type = type;
    this.axis = null;
    this.planeNormal = null;
    this.numeric = '';
    this.object = this.document.activeObject;
    this.object.updateWorldMatrix(true, false);
    this.startWorldQuaternion.copy(this.object.getWorldQuaternion(new THREE.Quaternion()));
    const origin = pointer || this.viewport?.getPointerOrigin?.() || { x: 0, y: 0 };
    this.startPointer = { x: Number(origin.x) || 0, y: Number(origin.y) || 0 };
    this.lastPointer = { ...this.startPointer };

    const hem = this.object.userData.hem;
    if (this.document.mode === 'edit') {
      const selectedGroups = groupSelectedTransformVertices({
        positions: hem.positions,
        vertexIds: [...hem.vertexSelection],
        edgeIds: [...hem.edgeSelection],
        faceIds: [...hem.faceSelection],
        edges: hem.edges,
        faces: hem.faces
      });
      this.vertexIds = selectedGroups.flat();
      if (!this.vertexIds.length) {
        this.before = null;
        this.object = null;
        return false;
      }
      this.sourcePositions = hem.positions.map(position => [...position]);
      this.selectedGroups = selectedGroups.map(group => [...group]);
      this.originalVertices = this.vertexIds.map(id => [...this.sourcePositions[id]]);
      this.rebuildEditTransformGroups();
      this.original = null;
    } else {
      this.vertexIds = [];
      this.originalVertices = [];
      this.sourcePositions = [];
      this.selectedGroups = [];
      this.proportionalInfluencedCount = 0;
        this.transformGroups = [];
      this.individualPivotWorlds = [];
      const worldPosition = this.object.getWorldPosition(new THREE.Vector3());
      const worldQuaternion = this.object.getWorldQuaternion(new THREE.Quaternion());
      if (this.document.pivot === 'cursor') {
        this.worldPivot.copy(this.document.cursor);
      } else if (this.document.pivot === 'bounds') {
        const worldBounds = new THREE.Box3().setFromObject(this.object, true);
        this.worldPivot.copy(worldBounds.isEmpty() ? worldPosition : worldBounds.getCenter(new THREE.Vector3()));
      } else {
        // Median Point and Individual Origins coincide for one active object.
        this.worldPivot.copy(worldPosition);
      }
      this.original = {
        position: this.object.position.clone(),
        quaternion: this.object.quaternion.clone(),
        scale: this.object.scale.clone(),
        worldPosition,
        worldQuaternion
      };
    }

    this.viewFrame = this.captureViewFrame();
    this.arcballStart = this.mapArcball(this.startPointer);
    this.active = true;
    const individualNote = this.document.mode === 'edit' && this.document.pivot === 'individual'
      ? ` · ${this.transformGroups.length} connected origin${this.transformGroups.length === 1 ? '' : 's'}`
      : '';
    const proportionalNote = this.document.mode === 'edit' && this.proportionalSettings.enabled
      ? ` · PROP ${this.proportionalSettings.falloff.toUpperCase()} ${this.proportionalSettings.radius.toFixed(2)} · ${this.proportionalInfluencedCount} influenced`
      : '';
    this.status?.(`${type.toUpperCase()} · ${this.orientation.toUpperCase()} orientation${individualNote}${proportionalNote} · drag in the current view · X/Y/Z axis · Shift+axis plane · numeric value · Enter apply · Esc cancel`);
    this.onChange?.();
    return true;
  }

  rebuildEditTransformGroups() {
    if (!this.object || !this.sourcePositions.length || !this.selectedGroups.length) return false;
    const mode = this.document.pivot || 'median';
    const seedGroups = mode === 'individual' ? this.selectedGroups : [this.vertexIds];
    let influenceGroups = seedGroups.map(group => group.map(vertexId => ({ vertexId, weight: 1, distance: 0 })));
    this.proportionalInfluencedCount = 0;

    if (this.proportionalSettings.enabled) {
      const worldPositions = this.sourcePositions.map(position =>
        this.object.localToWorld(new THREE.Vector3(...position)).toArray()
      );
      const hem = this.object.userData.hem;
      const seedFaceGroups = hem.selectionMode === 'face' && hem.faceSelection?.size
        ? seedGroups.map(group => [...hem.faceSelection].filter(faceId =>
          (hem.faces[faceId] || []).some(vertexId => group.includes(vertexId))))
        : null;
      const influence = buildProportionalInfluence({
        positions: worldPositions,
        edges: hem.edges,
        faces: hem.faces,
        seedGroups,
        seedFaceGroups,
        radius: this.proportionalSettings.radius,
        falloff: this.proportionalSettings.falloff
      });
      if (influence.groups.length === seedGroups.length) {
        influenceGroups = influence.groups;
        this.proportionalInfluencedCount = influence.influencedCount;
      }
    }

    this.transformGroups = seedGroups.map((selectedIds, groupIndex) => {
      const influence = influenceGroups[groupIndex] || selectedIds.map(vertexId => ({ vertexId, weight: 1, distance: 0 }));
      const vertexIds = influence.map(item => item.vertexId);
      const originalVertices = vertexIds.map(id => [...this.sourcePositions[id]]);
      const selectedPoints = selectedIds.map(id => this.sourcePositions[id]).filter(Boolean);
      let pivot = resolveTransformPivotPoint(selectedPoints, mode === 'bounds' ? 'bounds' : 'median') || [0, 0, 0];
      if (mode === 'cursor') {
        pivot = this.object.worldToLocal(this.document.cursor.clone()).toArray();
      }
      const pivotLocal = new THREE.Vector3(...pivot);
      return {
        vertexIds,
        weights: influence.map(item => item.weight),
        originalVertices,
        pivotLocal,
        pivotWorld: this.object.localToWorld(pivotLocal.clone())
      };
    });

    // Pointer-to-world conversion uses one stable selection anchor. Individual
    // Origins are applied independently around each selected region's pivot.
    const interactionPivot = mode === 'individual'
      ? resolveTransformPivotPoint(this.originalVertices, 'median')
      : this.transformGroups[0]?.pivotLocal.toArray();
    this.editPivot.fromArray(interactionPivot || [0, 0, 0]);
    this.worldPivot.copy(this.object.localToWorld(this.editPivot.clone()));
    this.individualPivotWorlds = mode === 'individual'
      ? this.transformGroups.map(group => group.pivotWorld.clone())
      : [];
    return true;
  }

  setProportionalSettings(settings = {}) {
    this.proportionalSettings = normalizeProportionalSettings(settings, this.proportionalSettings);
    if (this.active && this.document.mode === 'edit') {
      this.rebuildEditTransformGroups();
      const hem = this.object?.userData?.hem;
      if (hem) {
        this.sourcePositions.forEach((position, id) => {
          hem.positions[id] = [...position];
          if (hem.vertices[id]) hem.vertices[id].position = hem.positions[id];
        });
      }
      this.apply();
    }
    this.onChange?.();
    return { ...this.proportionalSettings };
  }

  captureViewFrame() {
    const camera = this.viewport?.camera;
    const canvas = this.viewport?.renderer?.domElement;
    if (!camera || !canvas) {
      return {
        camera: null,
        rect: { left: 0, top: 0, width: 1, height: 1 },
        right: new THREE.Vector3(1, 0, 0),
        up: new THREE.Vector3(0, 0, 1),
        forward: new THREE.Vector3(0, -1, 0),
        unitsPerPixel: 0.01
      };
    }
    camera.updateWorldMatrix(true, false);
    const rect = canvas.getBoundingClientRect();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const distance = Math.max(0.01, camera.getWorldPosition(new THREE.Vector3()).distanceTo(this.worldPivot));
    const fov = THREE.MathUtils.degToRad(camera.fov || 50);
    const unitsPerPixel = (2 * distance * Math.tan(fov / 2)) /
      (Math.max(1, rect.height) * Math.max(0.01, camera.zoom || 1));
    return {
      camera,
      rect: { left: rect.left, top: rect.top, width: Math.max(1, rect.width), height: Math.max(1, rect.height) },
      right, up, forward,
      unitsPerPixel: Math.max(1e-7, unitsPerPixel)
    };
  }

  get pointerDelta() {
    return {
      x: this.lastPointer.x - this.startPointer.x,
      y: this.lastPointer.y - this.startPointer.y
    };
  }

  get screenDelta() {
    const delta = this.pointerDelta;
    return new THREE.Vector2(delta.x, -delta.y);
  }

  axisVector(axisName) {
    const axis = resolveTransformAxis(axisName, this.orientation, this.startWorldQuaternion.toArray());
    return axis ? new THREE.Vector3(...axis) : null;
  }

  projectedAxis(axisName) {
    const axis = this.axisVector(axisName);
    const camera = this.viewFrame?.camera;
    if (!axis || !camera) return new THREE.Vector2(0, 0);
    const start = this.worldPivot.clone().project(camera);
    const end = this.worldPivot.clone().add(axis).project(camera);
    return new THREE.Vector2(
      (end.x - start.x) * this.viewFrame.rect.width * 0.5,
      -(end.y - start.y) * this.viewFrame.rect.height * 0.5
    );
  }

  axisMouseAmount(axisName) {
    const projected = this.projectedAxis(axisName);
    const length = projected.length();
    if (length < 0.02) return -this.pointerDelta.y * this.viewFrame.unitsPerPixel;
    return this.screenDelta.dot(projected.normalize()) / length;
  }

  planeBasis(normalName) {
    const normal = this.axisVector(normalName)?.normalize() || AXES[normalName].clone().normalize();
    const right = this.viewFrame.right;
    const up = this.viewFrame.up;
    let u = right.clone().addScaledVector(normal, -right.dot(normal));
    if (u.lengthSq() < 1e-8) u = up.clone().addScaledVector(normal, -up.dot(normal));
    u.normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    if (v.dot(up) < 0) v.negate();
    return { u, v };
  }

  getMoveWorldDelta(numeric) {
    const amount = Number(this.numeric);
    if (numeric) {
      if (this.axis) return this.axisVector(this.axis).multiplyScalar(amount);
      if (this.planeNormal) return this.planeBasis(this.planeNormal).u.multiplyScalar(amount);
      return this.viewFrame.right.clone().multiplyScalar(amount);
    }

    const delta = this.screenDelta;
    if (this.axis) {
      const rawAmount = this.axisMouseAmount(this.axis);
      const amount = resolveMoveSnapAmount(rawAmount, this.transformSnapSettings, this.orientation, false);
      return this.axisVector(this.axis).multiplyScalar(amount);
    }
    if (this.planeNormal) {
      const { u, v } = this.planeBasis(this.planeNormal);
      return u.multiplyScalar(delta.x * this.viewFrame.unitsPerPixel)
        .add(v.multiplyScalar(delta.y * this.viewFrame.unitsPerPixel));
    }
    return this.viewFrame.right.clone().multiplyScalar(delta.x * this.viewFrame.unitsPerPixel)
      .add(this.viewFrame.up.clone().multiplyScalar(delta.y * this.viewFrame.unitsPerPixel));
  }

  mapArcball(point) {
    const { rect } = this.viewFrame;
    const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.48);
    const x = (point.x - (rect.left + rect.width / 2)) / radius;
    const y = ((rect.top + rect.height / 2) - point.y) / radius;
    const lengthSq = x * x + y * y;
    const z = lengthSq <= 0.5 ? Math.sqrt(1 - lengthSq) : 0.5 / Math.sqrt(lengthSq);
    const vector = new THREE.Vector3(x, y, z);
    if (vector.lengthSq() < 1e-10) vector.set(0, 0, 1);
    return vector.normalize();
  }

  rotationPointerDegrees() {
    const constrainedAxis = this.axis || this.planeNormal;
    if (!constrainedAxis) return null;
    const projected = this.projectedAxis(constrainedAxis);
    const tangent = projected.lengthSq() < 1e-6
      ? new THREE.Vector2(1, 0)
      : new THREE.Vector2(-projected.y, projected.x).normalize();
    const rawDegrees = THREE.MathUtils.radToDeg(this.screenDelta.dot(tangent) * 0.01);
    return this.axis
      ? resolveRotateSnapDegrees(rawDegrees, this.transformSnapSettings, this.orientation, false)
      : rawDegrees;
  }

  rotationDelta(numeric) {
    const constrainedAxis = this.axis || this.planeNormal;
    if (numeric) {
      const axis = constrainedAxis ? this.axisVector(constrainedAxis) : this.viewFrame.forward;
      return new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(Number(this.numeric)));
    }
    if (constrainedAxis) {
      return new THREE.Quaternion().setFromAxisAngle(
        this.axisVector(constrainedAxis),
        THREE.MathUtils.degToRad(this.rotationPointerDegrees())
      );
    }
    const current = this.mapArcball(this.lastPointer);
    const cameraDelta = new THREE.Quaternion().setFromUnitVectors(this.arcballStart, current);
    const cameraQuaternion = this.viewFrame.camera?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
    return cameraQuaternion.clone().multiply(cameraDelta).multiply(cameraQuaternion.clone().invert()).normalize();
  }

  scaleFactor(numeric) {
    if (numeric) return Math.max(0.001, Number(this.numeric));
    let exponent;
    if (this.axis) {
      const projected = this.projectedAxis(this.axis);
      exponent = projected.lengthSq() < 1e-6
        ? -this.pointerDelta.y * 0.01
        : this.screenDelta.dot(projected.normalize()) * 0.01;
    } else exponent = this.screenDelta.y * 0.01;
    const factor = clamp(Math.exp(clamp(exponent, -6, 6)), 0.001, 1000);
    return this.axis
      ? resolveScaleSnapFactor(factor, this.transformSnapSettings, this.orientation, false)
      : factor;
  }

  scaleWorldOffset(offset, factor) {
    if (this.axis) {
      const axis = this.axisVector(this.axis);
      return offset.clone().addScaledVector(axis, offset.dot(axis) * (factor - 1));
    }
    if (this.planeNormal) {
      const normal = this.axisVector(this.planeNormal);
      const inPlane = offset.clone().addScaledVector(normal, -offset.dot(normal));
      return offset.clone().addScaledVector(inPlane, factor - 1);
    }
    return offset.clone().multiplyScalar(factor);
  }

  setObjectWorldPosition(position) {
    const local = position.clone();
    if (this.object.parent) this.object.parent.worldToLocal(local);
    this.object.position.copy(local);
    this.object.updateMatrixWorld(true);
  }

  setObjectWorldQuaternion(quaternion) {
    const local = quaternion.clone();
    if (this.object.parent) {
      const parentQuaternion = this.object.parent.getWorldQuaternion(new THREE.Quaternion());
      local.premultiply(parentQuaternion.invert());
    }
    this.object.quaternion.copy(local);
    this.object.updateMatrixWorld(true);
  }

  apply() {
    if (!this.active || !this.object || !this.viewFrame) return;
    const numeric = this.numeric.trim() !== '' && Number.isFinite(Number(this.numeric));

    if (this.document.mode === 'edit') {
      const hem = this.object.userData.hem;
      const delta = this.type === 'move' ? this.getMoveWorldDelta(numeric) : null;
      const factor = this.type === 'scale' ? this.scaleFactor(numeric) : 1;
      const rotation = this.type === 'rotate' ? this.rotationDelta(numeric) : null;

      for (const group of this.transformGroups) {
        const groupPivot = this.document.pivot === 'individual' ? group.pivotWorld : this.worldPivot;
        group.vertexIds.forEach((id, index) => {
          const weight = Math.max(0, Math.min(1, Number(group.weights[index]) || 0));
          const localPoint = new THREE.Vector3(...group.originalVertices[index]);
          const worldPoint = this.object.localToWorld(localPoint.clone());
          let transformed;
          if (this.type === 'move') {
            transformed = worldPoint.addScaledVector(delta, weight);
          } else if (this.type === 'rotate') {
            const weightedRotation = new THREE.Quaternion().identity().slerp(rotation, weight);
            transformed = worldPoint.sub(groupPivot).applyQuaternion(weightedRotation).add(groupPivot);
          } else {
            const effectiveFactor = 1 + (factor - 1) * weight;
            const offset = worldPoint.sub(groupPivot);
            transformed = this.scaleWorldOffset(offset, effectiveFactor).add(groupPivot);
          }
          hem.positions[id] = this.object.worldToLocal(transformed).toArray();
          if (hem.vertices[id]) hem.vertices[id].position = hem.positions[id];
        });
      }
      this.document.updateMesh(this.object);
      return;
    }

    if (!this.original) return;
    if (this.type === 'move') {
      this.setObjectWorldPosition(this.original.worldPosition.clone().add(this.getMoveWorldDelta(numeric)));
      return;
    }

    if (this.type === 'rotate') {
      const delta = this.rotationDelta(numeric);
      const worldQuaternion = delta.clone().multiply(this.original.worldQuaternion).normalize();
      this.setObjectWorldQuaternion(worldQuaternion);
      const offset = this.original.worldPosition.clone().sub(this.worldPivot).applyQuaternion(delta);
      this.setObjectWorldPosition(this.worldPivot.clone().add(offset));
      return;
    }

    const factor = this.scaleFactor(numeric);
    this.object.scale.copy(this.original.scale);
    if (this.axis) this.object.scale[this.axis] = this.original.scale[this.axis] * factor;
    else if (this.planeNormal) {
      for (const name of ['x', 'y', 'z'].filter(item => item !== this.planeNormal)) {
        this.object.scale[name] = this.original.scale[name] * factor;
      }
    } else this.object.scale.copy(this.original.scale).multiplyScalar(factor);
    const offset = this.original.worldPosition.clone().sub(this.worldPivot);
    this.setObjectWorldPosition(this.worldPivot.clone().add(this.scaleWorldOffset(offset, factor)));
  }

  setAxis(axis, plane = false) {
    if (!this.active || !AXES[axis]) return;
    if (plane) { this.axis = null; this.planeNormal = axis; }
    else { this.axis = axis; this.planeNormal = null; }
    this.apply();
    this.status?.(`${this.type.toUpperCase()} · ${this.orientation.toUpperCase()} ${plane ? `${axis.toUpperCase()} plane` : `${axis.toUpperCase()} axis`} · Enter apply / Esc cancel`);
    this.onChange?.();
  }

  setTransformSnapSettings(settings = {}) {
    this.transformSnapSettings = normalizeTransformSnapSettings(settings, this.transformSnapSettings);
    if (this.active && this.axis && ['move', 'rotate', 'scale'].includes(this.type)) this.apply();
    this.onChange?.();
    return { ...this.transformSnapSettings };
  }

  toggleTransformSnap() {
    return this.setTransformSnapSettings({ enabled: !this.transformSnapSettings.enabled });
  }

  getActiveSnapStep() {
    return getTransformSnapStep(this.transformSnapSettings, this.type, this.orientation);
  }

  getGuideState() {
    if (!this.active || !this.viewFrame || !this.worldPivot) return null;

    const numeric = this.numeric.trim() !== '' && Number.isFinite(Number(this.numeric));
    const pivot = this.worldPivot.clone();
    // The guide follows a moving object/selection, but a cursor pivot is fixed.
    if (this.type === 'move' && this.document.pivot !== 'cursor') {
      pivot.add(this.getMoveWorldDelta(numeric));
    }

    const axes = Object.fromEntries(['x', 'y', 'z'].map(name => [name, this.axisVector(name).toArray()]));
    const constraint = this.axis || this.planeNormal;
    let planeBasis = null;
    if (this.type === 'move' && !constraint) {
      planeBasis = { u: this.viewFrame.right.toArray(), v: this.viewFrame.up.toArray() };
    } else if ((this.type === 'move' || this.type === 'scale') && this.planeNormal) {
      const basis = this.planeBasis(this.planeNormal);
      planeBasis = { u: basis.u.toArray(), v: basis.v.toArray() };
    }

    let ringBasis = null;
    if (this.type === 'rotate') {
      const normal = constraint ? this.axisVector(constraint) : this.viewFrame.forward.clone();
      const u = this.viewFrame.right.clone().addScaledVector(normal, -this.viewFrame.right.dot(normal));
      if (u.lengthSq() < 1e-8) u.copy(this.viewFrame.up).addScaledVector(normal, -this.viewFrame.up.dot(normal));
      u.normalize();
      const v = new THREE.Vector3().crossVectors(normal, u).normalize();
      ringBasis = { u: u.toArray(), v: v.toArray() };
    }

    const pivotMarkers = this.document.mode === 'edit' && this.document.pivot === 'individual'
      ? this.individualPivotWorlds.map(groupPivot => {
          const marker = groupPivot.clone();
          if (this.type === 'move') marker.add(this.getMoveWorldDelta(numeric));
          return marker.toArray();
        })
      : [];

    return {
      type: this.type,
      pivot: pivot.toArray(),
      pivotMarkers,
      regionCount: pivotMarkers.length,
      axes,
      activeAxis: this.axis || this.planeNormal,
      planeBasis,
      ringBasis,
      orientation: this.orientation,
      pivotMode: this.document.pivot || 'median',
      proportional: this.document.mode === 'edit' && this.proportionalSettings.enabled,
      proportionalRadius: this.proportionalSettings.radius,
      proportionalInfluencedCount: this.proportionalInfluencedCount
    };
  }

  toggleOrientation() {
    if (!this.active) return false;
    this.orientation = this.orientation === 'global' ? 'local' : 'global';
    this.apply();
    const constraint = this.axis ? `${this.axis.toUpperCase()} axis` : this.planeNormal ? `${this.planeNormal.toUpperCase()} plane` : 'free view-plane';
    this.status?.(`${this.type.toUpperCase()} · ${this.orientation.toUpperCase()} orientation · ${constraint} · Enter apply / Esc cancel`);
    this.onChange?.();
    return this.orientation;
  }

  appendNumeric(value) {
    if (!this.active) return;
    if (value === 'backspace') this.numeric = this.numeric.slice(0, -1);
    else if (value === '-' && !this.numeric.startsWith('-')) this.numeric = `-${this.numeric}`;
    else if (value === '.' && !this.numeric.includes('.')) this.numeric += '.';
    else if (/^\d$/.test(value)) this.numeric += value;
    this.apply();
    this.onChange?.();
  }

  pointerMove(point) {
    if (!this.active || !point) return;
    this.lastPointer = { x: Number(point.x) || 0, y: Number(point.y) || 0 };
    this.apply();
    this.onChange?.();
  }

  async commit() {
    if (!this.active) return false;
    const after = await this.document.serialize();
    await this.undoManager?.record(`${this.type} transform`, this.before, after);
    this.clear();
    this.status?.('Transform applied');
    this.onChange?.();
    return true;
  }

  async cancel() {
    if (!this.active) return false;
    await this.document.restore(this.before);
    this.clear();
    this.status?.('Transform cancelled');
    this.onChange?.();
    return true;
  }

  clear() {
    this.active = false;
    this.type = null;
    this.axis = null;
    this.planeNormal = null;
    this.numeric = '';
    this.before = null;
    this.object = null;
    this.original = null;
    this.vertexIds = [];
    this.originalVertices = [];
    this.sourcePositions = [];
    this.selectedGroups = [];
    this.proportionalInfluencedCount = 0;
    this.transformGroups = [];
    this.individualPivotWorlds = [];
    this.editPivot.set(0, 0, 0);
    this.worldPivot.set(0, 0, 0);
    this.viewFrame = null;
    this.arcballStart = null;
  }
}
