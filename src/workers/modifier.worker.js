import { clampSubdivisionLevel, subdivideCatmullClark } from '../modifiers/CatmullClark.js';
import { mirrorGeometry } from '../modifiers/MirrorGeometry.js';
import { solidifyGeometry } from '../modifiers/SolidifyGeometry.js';

function trianglesToFaces(indices) {
  const faces = [];
  for (let i = 0; i + 2 < indices.length; i += 3) faces.push([indices[i], indices[i + 1], indices[i + 2]]);
  return faces;
}

function facesToTriangleIndices(faces) {
  const indices = [];
  for (const face of faces) {
    for (let i = 1; i + 1 < face.length; i++) indices.push(face[0], face[i], face[i + 1]);
  }
  return new Uint32Array(indices);
}

function subdivide(positions, indices, sourceFaces, modifier) {
  let nextPositions = positions;
  let nextFaces = Array.isArray(sourceFaces) && sourceFaces.length ? sourceFaces : trianglesToFaces(indices);
  const levels = clampSubdivisionLevel(modifier.level);
  for (let level = 0; level < levels; level++) {
    const result = subdivideCatmullClark(nextPositions, nextFaces);
    nextPositions = result.positions;
    nextFaces = result.faces;
  }
  return { positions: nextPositions, faces: nextFaces, indices: facesToTriangleIndices(nextFaces) };
}

function arrayMesh(positions, indices, modifier) {
  const count = Math.max(1, Math.min(20, Math.round(Number(modifier.count) || 2)));
  const offset = Array.isArray(modifier.offset) ? modifier.offset : [2,0,0];
  const baseCount = positions.length / 3, points = [], out = [];
  for (let copy=0; copy<count; copy++) {
    for (let i=0;i<positions.length;i+=3) points.push(positions[i]+offset[0]*copy,positions[i+1]+offset[1]*copy,positions[i+2]+offset[2]*copy);
    for (const index of indices) out.push(index + baseCount*copy);
  }
  return { positions:new Float32Array(points), indices:new Uint32Array(out) };
}

const yieldToWorker = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Each modifier is a separate worker stage. Returning ownership of the buffers
 * between stages lets the main thread report progress and cancel the worker
 * immediately by terminating it, even while a geometry routine is running.
 */
self.onmessage = async ({ data }) => {
  if (data?.type !== 'evaluate-stage') return;
  try {
    // Yield before work so a newly posted stage can be superseded before it starts.
    await yieldToWorker();
    let result = {
      positions: new Float32Array(data.positions),
      indices: new Uint32Array(data.indices),
      faces: Array.isArray(data.faces) ? data.faces : null
    };
    const modifier = data.modifier || {};
    if (modifier.enabled !== false) {
      if (modifier.type === 'subdivision') result = subdivide(result.positions, result.indices, result.faces, modifier);
      else if (modifier.type === 'mirror') result = { ...mirrorGeometry(result.positions, result.indices, modifier), faces: null };
      else if (modifier.type === 'array') result = { ...arrayMesh(result.positions, result.indices, modifier), faces: null };
      else if (modifier.type === 'solidify') result = { ...solidifyGeometry(result.positions, result.indices, modifier), faces: null };
      else throw new Error(`Unknown modifier stage: ${modifier.type || 'undefined'}`);
    }
    await yieldToWorker();
    self.postMessage({
      id: data.id,
      stageIndex: data.stageIndex,
      type: 'stage-result',
      positions: result.positions,
      indices: result.indices,
      faces: result.faces
    }, [result.positions.buffer, result.indices.buffer]);
  } catch (error) {
    self.postMessage({ id: data.id, stageIndex: data.stageIndex, type: 'stage-error', error: error?.message || 'Modifier evaluation failed' });
  }
};
