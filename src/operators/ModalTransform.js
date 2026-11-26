import * as THREE from 'three';

const AXES = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) };

export class ModalTransform {
  constructor({ document, undoManager, onChange, status }) {
    this.document = document; this.undoManager = undoManager; this.onChange = onChange; this.status = status;
    this.active = false; this.type = null; this.axis = null; this.planeNormal = null; this.numeric = '';
    this.startPointer = { x: 0, y: 0 }; this.lastPointer = { x: 0, y: 0 }; this.before = null;
    this.object = null; this.original = null; this.vertexIds = []; this.originalVertices = []; this.editPivot = new THREE.Vector3();
  }

  async begin(type, pointer = { x: 0, y: 0 }) {
    if (!['move','rotate','scale'].includes(type) || !this.document.activeObject) return false;
    if (this.active) await this.cancel();
    this.before = await this.document.serialize(); this.type = type; this.axis = null; this.planeNormal = null; this.numeric = '';
    this.object = this.document.activeObject; this.startPointer = { ...pointer }; this.lastPointer = { ...pointer };
    const hem = this.object.userData.hem;
    if (this.document.mode === 'edit') {
      const picked = new Set(hem.vertexSelection);
      for (const faceId of hem.faceSelection) for (const id of hem.faces[faceId] || []) picked.add(id);
      for (const edgeId of hem.edgeSelection) for (const id of hem.edges[edgeId]?.vertices || []) picked.add(id);
      this.vertexIds = [...picked];
      this.originalVertices = this.vertexIds.map(id => [...hem.positions[id]]);
      this.editPivot.set(0,0,0);
      if (this.originalVertices.length) { for (const p of this.originalVertices) this.editPivot.add(new THREE.Vector3(...p)); this.editPivot.divideScalar(this.originalVertices.length); }
      if (this.document.pivot === 'cursor') { this.object.updateMatrixWorld(true); this.editPivot.copy(this.object.worldToLocal(this.document.cursor.clone())); }
      this.original = null;
    } else {
      this.vertexIds = [];
      this.original = { position: this.object.position.clone(), rotation: this.object.rotation.clone(), scale: this.object.scale.clone() };
    }
    this.active = true;
    this.status?.(`${type.toUpperCase()} · move mouse or type a value · X/Y/Z axis · Enter apply · Esc cancel`);
    this.onChange?.();
    return true;
  }

  setAxis(axis, plane = false) {
    if (!this.active || !AXES[axis]) return;
    if (plane) { this.axis = null; this.planeNormal = axis; }
    else { this.axis = axis; this.planeNormal = null; }
    this.onChange?.();
  }

  appendNumeric(value) {
    if (!this.active) return;
    if (value === 'backspace') this.numeric = this.numeric.slice(0, -1);
    else if (value === '-' && !this.numeric.startsWith('-')) this.numeric = `-${this.numeric}`;
    else if (value === '.' && !this.numeric.includes('.')) this.numeric += '.';
    else if (/^\d$/.test(value)) this.numeric += value;
    this.apply(); this.onChange?.();
  }

  pointerMove(point) {
    if (!this.active) return;
    this.lastPointer = { ...point };
    this.apply(); this.onChange?.();
  }

  get pointerDelta() { return { x:(this.lastPointer.x-this.startPointer.x)*0.01, y:(this.startPointer.y-this.lastPointer.y)*0.01 }; }
  get mouseAmount() { const d=this.pointerDelta; return Math.abs(d.x)>Math.abs(d.y)?d.x:d.y; }

  apply() {
    if (!this.active || !this.object) return;
    const numeric = this.numeric.trim() !== '' && Number.isFinite(Number(this.numeric));
    const amount = numeric ? Number(this.numeric) : this.mouseAmount;
    const axis = this.axis || (this.type === 'rotate' ? 'z' : null);
    if (this.document.mode === 'edit' && this.vertexIds.length) {
      const hem = this.object.userData.hem;
      this.vertexIds.forEach((id, index) => {
        const original = this.originalVertices[index]; let next = [...original];
        if (this.type === 'move') {
          if (axis) { const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2; next[i] += amount; }
          else if (this.planeNormal) {
            const allowed = ['x','y','z'].filter(name => name !== this.planeNormal), delta = this.pointerDelta;
            if (numeric) next[allowed[0] === 'x' ? 0 : allowed[0] === 'y' ? 1 : 2] += amount;
            else { next[allowed[0] === 'x' ? 0 : allowed[0] === 'y' ? 1 : 2] += delta.x; next[allowed[1] === 'x' ? 0 : allowed[1] === 'y' ? 1 : 2] += delta.y; }
          } else { const delta=this.pointerDelta; next[0] += numeric ? amount : delta.x; next[2] += numeric ? 0 : delta.y; }
        } else if (this.type === 'scale') {
          const factor = Math.max(0.001, numeric ? amount : 1 + amount);
          if (axis) { const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2; next[i] = this.editPivot.toArray()[i] + (original[i]-this.editPivot.toArray()[i])*factor; }
          else if (this.planeNormal) {
            const allowed=['x','y','z'].filter(name=>name!==this.planeNormal);
            for(const name of allowed){const i=name==='x'?0:name==='y'?1:2;next[i]=this.editPivot.toArray()[i]+(original[i]-this.editPivot.toArray()[i])*factor;}
          } else next = next.map((v,i) => this.editPivot.toArray()[i] + (original[i]-this.editPivot.toArray()[i])*factor);
        } else {
          const angle = THREE.MathUtils.degToRad(amount);
          const p = new THREE.Vector3(...original).sub(this.editPivot);
          const rotationAxis = axis ? AXES[axis] : AXES.z;
          p.applyAxisAngle(rotationAxis, angle); next = p.add(this.editPivot).toArray();
        }
        hem.positions[id] = next;
      });
      this.document.updateMesh(this.object);
    } else if (this.original) {
      if (this.type === 'move') {
        this.object.position.copy(this.original.position);
        if (axis) this.object.position.addScaledVector(AXES[axis], amount);
        else if (this.planeNormal) {
          const allowed=['x','y','z'].filter(name=>name!==this.planeNormal), delta=this.pointerDelta;
          if (numeric) this.object.position.addScaledVector(AXES[allowed[0]],amount);
          else this.object.position.addScaledVector(AXES[allowed[0]],delta.x).addScaledVector(AXES[allowed[1]],delta.y);
        } else { const delta=this.pointerDelta; this.object.position.add(new THREE.Vector3(numeric?amount:delta.x,0,numeric?0:delta.y)); }
      } else if (this.type === 'rotate') {
        this.object.rotation.copy(this.original.rotation);
        const rotateAxis = axis ? AXES[axis] : AXES.z;
        const angle = THREE.MathUtils.degToRad(amount);
        this.object.rotateOnWorldAxis(rotateAxis, angle);
      } else {
        this.object.scale.copy(this.original.scale);
        const factor = Math.max(0.001, numeric ? amount : 1 + amount);
        if (axis) this.object.scale[axis] = this.original.scale[axis] * factor;
        else if (this.planeNormal) { for (const name of ['x','y','z'].filter(item=>item!==this.planeNormal)) this.object.scale[name] = this.original.scale[name] * factor; }
        else this.object.scale.copy(this.original.scale).multiplyScalar(factor);
      }
    }
  }

  async commit() {
    if (!this.active) return false;
    const after = await this.document.serialize();
    await this.undoManager?.record(`${this.type} transform`, this.before, after);
    this.clear(); this.status?.('Transform applied'); this.onChange?.(); return true;
  }

  async cancel() {
    if (!this.active) return false;
    await this.document.restore(this.before);
    this.clear(); this.status?.('Transform cancelled'); this.onChange?.(); return true;
  }

  clear() {
    this.active = false; this.type = null; this.axis = null; this.planeNormal = null; this.numeric = '';
    this.before = null; this.object = null; this.original = null; this.vertexIds = []; this.originalVertices = []; this.editPivot.set(0,0,0);
  }
}
