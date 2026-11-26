export class ModifierStack {
  constructor({ onStatus }) {
    this.onStatus = onStatus; this.worker = null; this.requestId = 0; this.pending = new Map();
    try {
      this.worker = new Worker(new URL('../workers/modifier.worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = event => {
        const task = this.pending.get(event.data.id); if (!task) return;
        this.pending.delete(event.data.id);
        if (event.data.error) task.reject(new Error(event.data.error));
        else task.resolve(event.data);
      };
      this.worker.onerror = () => { for (const task of this.pending.values()) task.reject(new Error('Modifier worker failed')); this.pending.clear(); };
    } catch { this.worker = null; }
  }

  add(mesh, type) {
    const defaults = {
      subdivision: { level: 1 }, mirror: { axis: 'x' }, array: { count: 2, offset: [2,0,0] }, solidify: { thickness: 0.08 }
    };
    if (!defaults[type]) throw new Error(`Unknown modifier: ${type}`);
    const modifiers = mesh.userData.modifiers || (mesh.userData.modifiers = []);
    modifiers.push({ id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2,7)}`, type, enabled: true, ...defaults[type] });
    return modifiers.at(-1);
  }

  async evaluate(mesh) {
    if (!mesh?.userData?.hem) return;
    const base = mesh.userData.hem.toBufferGeometry();
    const modifiers = (mesh.userData.modifiers || []).map(m => ({ ...m }));
    if (!modifiers.length) return;
    this.onStatus?.('Evaluating modifier stack…');
    let result;
    if (this.worker) {
      const id = ++this.requestId;
      result = await new Promise((resolve,reject) => {
        this.pending.set(id,{resolve,reject});
        const p = new Float32Array(base.positions), i = new Uint32Array(base.indices);
        this.worker.postMessage({id,positions:p,indices:i,modifiers},[p.buffer,i.buffer]);
      });
    } else {
      throw new Error('Module Workers are unavailable; modifier evaluation was skipped.');
    }
    const THREE = await import('three');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(result.positions,3));
    geometry.setIndex(new THREE.BufferAttribute(result.indices,1));
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const old = mesh.userData.evaluatedGeometry; mesh.userData.evaluatedGeometry = geometry; mesh.geometry = geometry; old?.dispose?.();
    this.onStatus?.('Modifier stack updated');
  }

  clearEvaluation(mesh) {
    if (!mesh) return;
    mesh.userData.evaluatedGeometry?.dispose?.(); delete mesh.userData.evaluatedGeometry;
  }
}
