import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSolidifyOffset, clampSolidifyThickness, solidifyGeometry } from '../src/modifiers/SolidifyGeometry.js';

const quad = {
  positions: new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0]),
  indices: new Uint32Array([0,1,2, 0,2,3])
};

const cubePositions = new Float32Array([
  -1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1,
  -1,-1,1, 1,-1,1, 1,1,1, -1,1,1
]);
const cubeFaces = [
  [0,3,2,1], [4,5,6,7], [0,1,5,4],
  [3,7,6,2], [0,4,7,3], [1,2,6,5]
];
function triangulate(faces) {
  const indices=[];
  for(const face of faces) for(let i=1;i+1<face.length;i++)indices.push(face[0],face[i],face[i+1]);
  return new Uint32Array(indices);
}
const cubeIndices=triangulate(cubeFaces);
function edgeUseCounts(indices) {
  const uses=new Map();
  for(let i=0;i<indices.length;i+=3){
    const face=[indices[i],indices[i+1],indices[i+2]];
    for(let j=0;j<3;j++){
      const a=face[j],b=face[(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
      uses.set(key,(uses.get(key)||0)+1);
    }
  }
  return [...uses.values()];
}
function signedVolume(positions, indices) {
  let volume=0;
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const cross=[positions[b+1]*positions[c+2]-positions[b+2]*positions[c+1],positions[b+2]*positions[c]-positions[b]*positions[c+2],positions[b]*positions[c+1]-positions[b+1]*positions[c]];
    volume+=(positions[a]*cross[0]+positions[a+1]*cross[1]+positions[a+2]*cross[2])/6;
  }
  return volume;
}

test('Solidify turns an open quad patch into a closed two-layer shell with a rim', () => {
  const sourcePositions=new Float32Array(quad.positions),sourceIndices=new Uint32Array(quad.indices);
  const result=solidifyGeometry(sourcePositions,sourceIndices,{thickness:0.2,offset:-1});
  assert.equal(result.positions.length/3,8);
  assert.equal(result.indices.length/3,12); // 2 outer + 2 inner + 8 rim triangles.
  assert.deepEqual(edgeUseCounts(result.indices),Array(18).fill(2));
  assert.equal(result.stats.boundaryEdges,4);
  assert.equal(result.stats.openComponents,1);
  assert.equal(result.positions[2],0); // Inside keeps the source-facing surface in place.
  assert.ok(Math.abs(result.positions[4*3+2]+0.2)<1e-6);
  assert.deepEqual([...sourcePositions],[...quad.positions]);
  assert.deepEqual([...sourceIndices],[...quad.indices]);
});

test('Solidify supports centered and outside shell placement', () => {
  const centered=solidifyGeometry(quad.positions,quad.indices,{thickness:0.2,offset:0});
  const outside=solidifyGeometry(quad.positions,quad.indices,{thickness:0.2,offset:1});
  assert.ok(Math.abs(centered.positions[2]-0.1)<1e-6);
  assert.ok(Math.abs(centered.positions[4*3+2]+0.1)<1e-6);
  assert.equal(outside.positions[4*3+2],0);
  assert.ok(Math.abs(outside.positions[2]-0.2)<1e-6);
});

test('Solidify closes an oriented cube without adding boundary walls', () => {
  const result=solidifyGeometry(cubePositions,cubeIndices,{thickness:0.08,offset:-1});
  assert.equal(result.positions.length/3,16);
  assert.equal(result.indices.length/3,24);
  assert.equal(result.stats.boundaryEdges,0);
  assert.equal(result.stats.closedComponents,1);
  assert.ok(edgeUseCounts(result.indices).every(count=>count===2));
  assert.ok(signedVolume(result.positions,result.indices)>0.1);
});

test('Solidify corrects a consistently inward-wound closed component in the evaluated copy', () => {
  const reversed=[];
  for(let i=0;i<cubeIndices.length;i+=3)reversed.push(cubeIndices[i],cubeIndices[i+2],cubeIndices[i+1]);
  const result=solidifyGeometry(cubePositions,new Uint32Array(reversed),{thickness:0.08});
  assert.ok(signedVolume(result.positions,result.indices)>0.1);
  assert.ok(edgeUseCounts(result.indices).every(count=>count===2));
});

test('Solidify supports separate open components without merging their shells', () => {
  const positions=new Float32Array([
    0,0,0, 1,0,0, 0,1,0,
    3,0,0, 4,0,0, 3,1,0
  ]);
  const result=solidifyGeometry(positions,new Uint32Array([0,1,2,3,4,5]),{thickness:0.1});
  assert.equal(result.stats.openComponents,2);
  assert.equal(result.stats.boundaryEdges,6);
  assert.ok(edgeUseCounts(result.indices).every(count=>count===2));
});

test('Solidify rejects non-manifold edges before returning a candidate', () => {
  const positions=new Float32Array([0,0,0,1,0,0,0,1,0,0,-1,0,0,0,1]);
  const indices=new Uint32Array([0,1,2,1,0,3,0,1,4]);
  assert.throws(()=>solidifyGeometry(positions,indices),/non-manifold/);
});

test('Solidify rejects inconsistent winding across a shared edge', () => {
  const positions=new Float32Array([0,0,0,1,0,0,0,1,0,1,1,0]);
  assert.throws(()=>solidifyGeometry(positions,new Uint32Array([0,1,2,1,2,3])),/inconsistent triangle winding/);
});

test('Solidify rejects disconnected boundary fans that only touch at one vertex', () => {
  const positions=new Float32Array([0,0,0,1,0,0,0,1,0,-1,0,0,0,-1,0]);
  assert.throws(()=>solidifyGeometry(positions,new Uint32Array([0,1,2,0,3,4])),/ambiguous boundary fan|disconnected face fan/);
});

test('Solidify rejects degenerate triangles, unused vertices and collapsed large offsets', () => {
  assert.throws(()=>solidifyGeometry(new Float32Array([0,0,0,1,0,0,2,0,0]),new Uint32Array([0,1,2])),/degenerate/);
  assert.throws(()=>solidifyGeometry(new Float32Array([0,0,0,1,0,0,0,1,0,8,8,8]),new Uint32Array([0,1,2])),/unused/);
  assert.throws(()=>solidifyGeometry(cubePositions,cubeIndices,{thickness:2}),/folds or collapses/);
});

test('Solidify enforces a triangle output budget and normalizes user controls', () => {
  assert.throws(()=>solidifyGeometry(quad.positions,quad.indices,{maxTriangles:5}),/safety limit/);
  assert.equal(clampSolidifyThickness(0),0.0001);
  assert.equal(clampSolidifyThickness(5000),1000);
  assert.equal(clampSolidifyThickness('bad'),0.08);
  assert.equal(clampSolidifyOffset(-4),-1);
  assert.equal(clampSolidifyOffset(0.25),0.25);
  assert.equal(clampSolidifyOffset(4),1);
});
