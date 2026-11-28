import { estimateModifierWorkingSet, validateModifierBudget } from './ModifierBudget.js';
import { copyModifierStageDiagnostics, createModifierStageDiagnostic, getModifierGeometryCounts } from './ModifierStackOrder.js';

async function createThreeGeometry(result) {
  const THREE = await import('three');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function abortError(message = 'Modifier evaluation cancelled.') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function copyModifier(modifier) {
  return { ...modifier, ...(Array.isArray(modifier.offset) ? { offset: [...modifier.offset] } : {}) };
}

export class ModifierStack {
  constructor({ onStatus, onProgress, budget, workerFactory, geometryFactory = createThreeGeometry } = {}) {
    this.onStatus = onStatus;
    this.onProgress = onProgress;
    this.budget = budget;
    this.workerFactory = workerFactory || (() => new Worker(new URL('../workers/modifier.worker.js', import.meta.url), { type: 'module' }));
    this.geometryFactory = geometryFactory;
    this.worker = null;
    this.requestId = 0;
    this.activeTask = null;
    this.lastDiagnostics = new WeakMap();
  }

  get busy() { return Boolean(this.activeTask); }

  getLastDiagnostics(mesh) {
    if (!mesh || (typeof mesh !== 'object' && typeof mesh !== 'function')) return [];
    return copyModifierStageDiagnostics(this.lastDiagnostics.get(mesh));
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.onmessage = event => this.handleWorkerMessage(worker, event.data);
    worker.onerror = event => {
      if (worker !== this.worker) return;
      const message = event?.message || 'Modifier worker failed.';
      this.worker = null;
      worker.terminate?.();
      this.failTask(new Error(message));
    };
    this.worker = worker;
    return worker;
  }

  add(mesh, type) {
    const defaults = {
      subdivision: { level: 1 },
      mirror: { axis: 'x', mergeDistance: 0.001 },
      array: { count: 2, offset: [2,0,0] },
      solidify: { thickness: 0.08, offset: -1 }
    };
    if (!defaults[type]) throw new Error(`Unknown modifier: ${type}`);
    const modifiers = mesh.userData.modifiers || (mesh.userData.modifiers = []);
    modifiers.push({ id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2,7)}`, type, enabled: true, ...defaults[type] });
    return modifiers.at(-1);
  }

  report(progress) {
    try { this.onProgress?.(progress); } catch (error) { console.warn('[Bl3nd modifier progress]', error); }
  }

  async evaluate(mesh) {
    if (!mesh?.userData?.hem) return null;
    if (this.activeTask) throw new Error('A modifier evaluation is already running. Cancel it before starting another.');
    const base = mesh.userData.hem.toBufferGeometry();
    const modifiers = (mesh.userData.modifiers || []).map(copyModifier);
    if (!modifiers.length) { this.lastDiagnostics.delete(mesh); return null; }

    const estimate = estimateModifierWorkingSet({
      positions: base.positions,
      indices: base.indices,
      faces: mesh.userData.hem.faces,
      modifiers
    });
    validateModifierBudget(estimate, this.budget);

    const worker = this.ensureWorker();
    const id = ++this.requestId;
    return await new Promise((resolve, reject) => {
      const task = {
        id, mesh, worker, modifiers, estimate, resolve, reject,
        stageIndex: 0,
        stageStartedAt: null,
        stageInputCounts: null,
        stageDiagnostics: [],
        result: {
          positions: new Float32Array(base.positions),
          indices: new Uint32Array(base.indices),
          faces: mesh.userData.hem.faces.map(face => [...face])
        }
      };
      this.activeTask = task;
      this.onStatus?.('Evaluating modifier stack…');
      this.report({ state: 'running', progress: 0, stageIndex: 0, stageCount: modifiers.length, modifierType: modifiers[0]?.type || 'modifier', estimate, stageDiagnostics: [] });
      this.postStage(task);
    });
  }

  postStage(task) {
    if (this.activeTask !== task || task.worker !== this.worker) return;
    const modifier = task.modifiers[task.stageIndex];
    const result = task.result;
    task.stageInputCounts = getModifierGeometryCounts(result);
    task.stageStartedAt = this.now();
    const message = {
      type: 'evaluate-stage',
      id: task.id,
      stageIndex: task.stageIndex,
      positions: result.positions,
      indices: result.indices,
      faces: result.faces,
      modifier
    };
    try {
      task.worker.postMessage(message, [result.positions.buffer, result.indices.buffer]);
    } catch (error) {
      this.failTask(error instanceof Error ? error : new Error(String(error)));
    }
  }

  now() {
    const clock = globalThis.performance?.now?.bind(globalThis.performance);
    const value = clock ? clock() : Date.now();
    return Number.isFinite(value) ? value : Date.now();
  }

  async handleWorkerMessage(worker, message) {
    const task = this.activeTask;
    if (worker !== this.worker || !task || message?.id !== task.id) return;
    if (message.type === 'stage-error' || message.error) {
      this.failTask(new Error(message.error || 'Modifier evaluation failed.'));
      return;
    }
    if (message.type !== 'stage-result' || message.stageIndex !== task.stageIndex) return;

    task.result = {
      positions: message.positions,
      indices: message.indices,
      faces: Array.isArray(message.faces) ? message.faces : null
    };
    const modifier = task.modifiers[task.stageIndex];
    const diagnostic = createModifierStageDiagnostic({
      modifier,
      stageIndex: task.stageIndex,
      inputCounts: task.stageInputCounts,
      outputCounts: getModifierGeometryCounts(task.result),
      elapsedMs: this.now() - (task.stageStartedAt ?? this.now())
    });
    task.stageDiagnostics.push(diagnostic);
    const completedStages = task.stageIndex + 1;
    const progress = Math.round(completedStages / task.modifiers.length * 100);
    this.report({
      state: 'running', progress,
      stageIndex: completedStages,
      stageCount: task.modifiers.length,
      modifierType: modifier?.type || 'modifier',
      estimate: task.estimate,
      completedStage: diagnostic,
      stageDiagnostics: copyModifierStageDiagnostics(task.stageDiagnostics)
    });

    if (completedStages < task.modifiers.length) {
      task.stageIndex++;
      this.postStage(task);
      return;
    }

    try {
      const geometry = await this.geometryFactory(task.result);
      // Cancellation may happen while the renderer geometry is being created.
      if (this.activeTask !== task) {
        geometry?.dispose?.();
        return;
      }
      const old = task.mesh.userData.evaluatedGeometry;
      this.lastDiagnostics.set(task.mesh, copyModifierStageDiagnostics(task.stageDiagnostics));
      task.mesh.userData.evaluatedGeometry = geometry;
      task.mesh.geometry = geometry;
      old?.dispose?.();
      this.activeTask = null;
      this.onStatus?.('Modifier stack updated');
      this.report({ state: 'complete', progress: 100, estimate: task.estimate, stageDiagnostics: copyModifierStageDiagnostics(task.stageDiagnostics) });
      task.resolve(geometry);
    } catch (error) {
      if (this.activeTask === task) this.failTask(error);
    }
  }

  failTask(error) {
    const task = this.activeTask;
    if (!task) return;
    this.activeTask = null;
    this.onStatus?.(`Modifier evaluation failed · ${error?.message || 'unknown error'}`);
    this.report({ state: 'failed', error, estimate: task.estimate, stageDiagnostics: copyModifierStageDiagnostics(task.stageDiagnostics) });
    task.reject(error);
  }

  cancel(message = 'Modifier evaluation cancelled.') {
    const task = this.activeTask;
    if (!task) return false;
    this.activeTask = null;
    if (this.worker) {
      this.worker.terminate?.();
      this.worker = null;
    }
    const error = abortError(message);
    this.onStatus?.('Modifier evaluation cancelled');
    this.report({ state: 'cancelled', error, estimate: task.estimate, stageDiagnostics: copyModifierStageDiagnostics(task.stageDiagnostics) });
    task.reject(error);
    return true;
  }

  clearEvaluation(mesh) {
    if (!mesh) return;
    this.lastDiagnostics.delete(mesh);
    mesh.userData.evaluatedGeometry?.dispose?.();
    delete mesh.userData.evaluatedGeometry;
  }

  dispose() {
    this.cancel('Modifier stack disposed.');
    this.worker?.terminate?.();
    this.worker = null;
  }
}
