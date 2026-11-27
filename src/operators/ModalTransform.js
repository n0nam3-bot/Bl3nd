import * as THREE from 'three';
import { resolveTransformAxis } from '../core/TransformOrientation.js';
import { normalizeMoveSnapSettings, resolveMoveSnapAmount } from '../core/TransformSnap.js';

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
  constructor({ document, undoManager, viewport, onChange, status, moveSnapSettings = {} }) {
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
    this.editPivot = new THREE.Vector3();
    this.worldPivot = new THREE.Vector3();
    this.viewFrame = null;
    this.arcballStart = null;
    this.orientation = 'global';
    this.startWorldQuaternion = new THREE.Quaternion();
    this.moveSnapSettings = normalizeMoveSnapSettings(moveSnapSettings);
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
      const selected = new Set(hem.vertexSelection);
      for (const faceId of hem.faceSelection) for (const id of hem.faces[faceId] || []) selected.add(id);
      for (const edgeId of hem.edgeSelection) for (const id of hem.edges[edgeId]?.vertices || []) selected.add(id);
      this.vertexIds = [...selected];
      if (!this.vertexIds.length) {
        this.before = null;
        this.object = null;
        return false;
      }
      this.originalVertices = this.vertexIds.map(id => [...hem.positions[id]]);
      this.editPivot.set(0, 0, 0);
      for (const point of this.originalVertices) this.editPivot.add(new THREE.Vector3(...point));
      this.editPivot.divideScalar(this.originalVertices.length);
      if (this.document.pivot === 'cursor') {
        this.editPivot.copy(this.object.worldToLocal(this.document.cursor.clone()));
      }
      this.worldPivot.copy(this.object.localToWorld(this.editPivot.clone()));
      this.original = null;
    } else {
      this.vertexIds = [];
      const worldPosition = this.object.getWorldPosition(new THREE.Vector3());
      const worldQuaternion = this.object.getWorldQuaternion(new THREE.Quaternion());
      this.worldPivot.copy(this.document.pivot === 'cursor' ? this.document.cursor : worldPosition);
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
    this.status?.(`${type.toUpperCase()} · ${this.orientation.toUpperCase()} orientation · drag in the current view · X/Y/Z axis · Shift+axis plane · numeric value · Enter apply · Esc cancel`);
    this.onChange?.();
    return true;
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
      const amount = resolveMoveSnapAmount(rawAmount, this.moveSnapSettings, this.orientation, false);
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

  rotationDelta(numeric) {
    const constrainedAxis = this.axis || this.planeNormal;
    if (numeric) {
      const axis = constrainedAxis ? this.axisVector(constrainedAxis) : this.viewFrame.forward;
      return new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(Number(this.numeric)));
    }
    if (constrainedAxis) {
      const projected = this.projectedAxis(constrainedAxis);
      const tangent = projected.lengthSq() < 1e-6
        ? new THREE.Vector2(1, 0)
        : new THREE.Vector2(-projected.y, projected.x).normalize();
      const radians = this.screenDelta.dot(tangent) * 0.01;
      return new THREE.Quaternion().setFromAxisAngle(this.axisVector(constrainedAxis), radians);
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
    return clamp(Math.exp(clamp(exponent, -6, 6)), 0.001, 1000);
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

      this.vertexIds.forEach((id, index) => {
        const localPoint = new THREE.Vector3(...this.originalVertices[index]);
        const worldPoint = this.object.localToWorld(localPoint.clone());
        let transformed;
        if (this.type === 'move') {
          transformed = worldPoint.add(delta);
        } else if (this.type === 'rotate') {
          transformed = worldPoint.sub(this.worldPivot).applyQuaternion(rotation).add(this.worldPivot);
        } else {
          const offset = worldPoint.sub(this.worldPivot);
          transformed = this.scaleWorldOffset(offset, factor).add(this.worldPivot);
        }
        hem.positions[id] = this.object.worldToLocal(transformed).toArray();
      });
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

  setMoveSnapSettings(settings = {}) {
    this.moveSnapSettings = normalizeMoveSnapSettings(settings, this.moveSnapSettings);
    if (this.active && this.type === 'move') this.apply();
    this.onChange?.();
    return { ...this.moveSnapSettings };
  }

  toggleMoveSnap() {
    return this.setMoveSnapSettings({ enabled: !this.moveSnapSettings.enabled });
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
    this.editPivot.set(0, 0, 0);
    this.worldPivot.set(0, 0, 0);
    this.viewFrame = null;
    this.arcballStart = null;
  }
}
