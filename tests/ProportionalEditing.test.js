import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProportionalInfluence,
  normalizeProportionalSettings,
  proportionalFalloffWeight
} from '../src/core/ProportionalEditing.js';

function lineMesh(count, spacing = 1) {
  return {
    positions: Array.from({ length: count }, (_, id) => [id * spacing, 0, 0]),
    edges: Array.from({ length: count - 1 }, (_, id) => ({ vertices: [id, id + 1] }))
  };
}

test('smooth proportional influence uses edge-geodesic distance and leaves selected vertices at full weight', () => {
  const mesh = lineMesh(5);
  const result = buildProportionalInfluence({
    positions: mesh.positions,
    edges: mesh.edges,
    seedGroups: [[0]],
    radius: 3
  });
  assert.deepEqual(result.groups[0].map(item => item.vertexId), [0, 1, 2]);
  assert.equal(result.groups[0][0].weight, 1);
  assert.ok(Math.abs(result.groups[0][1].weight - 20 / 27) < 1e-12);
  assert.ok(Math.abs(result.groups[0][2].weight - 7 / 27) < 1e-12);
  assert.equal(result.influencedCount, 2);
});

test('influence follows topology paths rather than straight-line proximity', () => {
  const positions = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0.1,0.1,0]];
  const edges = [
    { vertices:[0,1] }, { vertices:[1,2] }, { vertices:[2,3] },
    { vertices:[3,4] }
  ];
  const result = buildProportionalInfluence({ positions, edges, seedGroups:[[0]], radius:1.5 });
  assert.deepEqual(result.groups[0].map(item=>item.vertexId), [0,1]);
  assert.equal(result.groups[0].some(item=>item.vertexId===4), false);
});

test('disconnected mesh islands remain uninfluenced even when spatially adjacent', () => {
  const positions = [[0,0,0],[1,0,0],[1.01,0,0],[2.01,0,0]];
  const edges = [{ vertices:[0,1] },{ vertices:[2,3] }];
  const result = buildProportionalInfluence({ positions, edges, seedGroups:[[0]], radius:10 });
  assert.deepEqual(result.groups[0].map(item=>item.vertexId), [0,1]);
  assert.equal(result.influencedCount, 1);
});

test('disconnected selected groups keep separate influence basins and overlapping vertices choose nearest group', () => {
  const mesh = lineMesh(7);
  const result = buildProportionalInfluence({
    positions: mesh.positions,
    edges: mesh.edges,
    seedGroups: [[0],[6]],
    radius: 4
  });
  const first = result.groups[0].map(item=>item.vertexId);
  const second = result.groups[1].map(item=>item.vertexId);
  assert.deepEqual(first, [0,1,2,3]);
  assert.deepEqual(second, [4,5,6]);
  assert.equal(new Set([...first,...second]).size, first.length + second.length);
  assert.equal(result.groups[0].find(item=>item.vertexId===3).weight, 0.15625);
  assert.equal(result.groups[1].find(item=>item.vertexId===4).weight, 0.5);
});

test('equidistant overlapping vertices are assigned deterministically to the first selected region', () => {
  const mesh = lineMesh(5);
  const result = buildProportionalInfluence({
    positions: mesh.positions,
    edges: mesh.edges,
    seedGroups: [[0],[4]],
    radius: 3
  });
  assert.equal(result.groups[0].some(item=>item.vertexId===2), true);
  assert.equal(result.groups[1].some(item=>item.vertexId===2), false);
});

test('falloff curves are bounded, monotonic and reach zero at the radius', () => {
  for (const falloff of ['smooth','linear','sharp','root','sphere']) {
    assert.equal(proportionalFalloffWeight(0, 2, falloff), 1);
    assert.equal(proportionalFalloffWeight(2, 2, falloff), 0);
    const values = [0.25,0.5,0.75].map(distance=>proportionalFalloffWeight(distance,2,falloff));
    assert.ok(values.every(value=>value>0 && value<1));
    assert.ok(values[0] > values[1] && values[1] > values[2]);
  }
});

test('radius and falloff settings normalize invalid values conservatively', () => {
  assert.deepEqual(normalizeProportionalSettings({ enabled:1, radius:0, falloff:'unknown' }), {
    enabled:true, radius:0.01, falloff:'smooth'
  });
  assert.deepEqual(normalizeProportionalSettings({ enabled:false, radius:Infinity, falloff:'linear' }), {
    enabled:false, radius:1, falloff:'linear'
  });
  assert.equal(normalizeProportionalSettings({ radius:1e20 }).radius, 1000000);
});

test('malformed, duplicate, reversed and zero-length edges cannot corrupt influence', () => {
  const positions = [[0,0,0],[1,0,0],[2,0,0],[NaN,0,0]];
  const edges = [
    { vertices:[0,1] }, { vertices:[1,0] }, { vertices:[1,1] },
    { vertices:[1,2] }, { vertices:[2,3] }, { vertices:[80,90] }, null
  ];
  const result = buildProportionalInfluence({ positions, edges, seedGroups:[[0]], radius:10 });
  assert.deepEqual(result.groups[0].map(item=>item.vertexId), [0,1,2]);
  assert.equal(result.groups[0].every(item=>Number.isFinite(item.weight)), true);
});

test('empty or invalid seed groups return no influence without throwing', () => {
  assert.deepEqual(buildProportionalInfluence({ positions:[[0,0,0]], edges:[], seedGroups:[] }), { groups:[], influencedCount:0 });
  const result = buildProportionalInfluence({ positions:[[0,0,0]], edges:[], seedGroups:[[50,null]] });
  assert.deepEqual(result.groups, [[]]);
  assert.equal(result.influencedCount, 0);
});

test('selectable falloff curves produce their documented distinct weights', () => {
  const distance = 0.5;
  const radius = 2;
  const weights = Object.fromEntries(['smooth', 'linear', 'sharp', 'root', 'sphere'].map(falloff => [
    falloff, proportionalFalloffWeight(distance, radius, falloff)
  ]));
  assert.ok(Math.abs(weights.smooth - 0.84375) < 1e-12);
  assert.ok(Math.abs(weights.linear - 0.75) < 1e-12);
  assert.ok(Math.abs(weights.sharp - 0.5625) < 1e-12);
  assert.ok(Math.abs(weights.root - Math.sqrt(0.75)) < 1e-12);
  assert.ok(Math.abs(weights.sphere - Math.sqrt(0.9375)) < 1e-12);
  assert.equal(new Set(Object.values(weights)).size, 5);
});

test('falloff selection survives radius-only updates through settings normalization', () => {
  const selected = normalizeProportionalSettings({ enabled: true, radius: 3, falloff: 'root' });
  assert.deepEqual(normalizeProportionalSettings({ radius: 5 }, selected), {
    enabled: true, radius: 5, falloff: 'root'
  });
  assert.equal(normalizeProportionalSettings({ falloff: 'unknown' }, selected).falloff, 'smooth');
});

