import * as THREE from 'three';
import { segmentRegionSamples } from '../core/ScreenRegion.js';

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || 1e-9) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function inRegion(point, tool, points, radius) {
  if (!point) return false;
  if (tool === 'box') {
    const a = points[0], b = points[points.length - 1];
    return point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x) &&
      point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
  }
  if (tool === 'lasso') return points.length >= 3 && pointInPolygon(point, points);
  return tool === 'circle' && points.some(center => Math.hypot(point.x - center.x, point.y - center.y) <= radius);
}

export const SelectionOperators = {
  selectRegion(mesh, camera, canvas, { tool, points, radius = 25, additive = false } = {}) {
    const hem = mesh?.userData?.hem;
    if (!hem || !camera || !canvas || !Array.isArray(points) || !points.length ||
        !['box', 'circle', 'lasso'].includes(tool)) return { selected: 0, mode: hem?.selectionMode };

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { selected: 0, mode: hem.selectionMode };
    mesh.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const project = local => {
      const world = local.clone().applyMatrix4(mesh.matrixWorld);
      const ndc = world.clone().project(camera);
      if (ndc.z < -1 || ndc.z > 1) return null;
      return { x: (ndc.x + 1) * rect.width / 2, y: (1 - ndc.y) * rect.height / 2, world };
    };

    // Match the exact ear-clipped triangles used by SceneDocument rendering.
    const faceAtTriangle = hem.triangleFaceMap();
    const visible = (screen, world, expectedFace = -1) => {
      if (!screen || !world) return false;
      pointer.set(screen.x / rect.width * 2 - 1, -(screen.y / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (!hit) return false;
      if (expectedFace >= 0) return faceAtTriangle[hit.faceIndex] === expectedFace;
      const tolerance = Math.max(0.012, camera.position.distanceTo(world) * 0.0018);
      return hit.point.distanceTo(world) <= tolerance;
    };
    const edgeIntersects = (a, b) => {
      const va = new THREE.Vector3(...hem.positions[a]);
      const vb = new THREE.Vector3(...hem.positions[b]);
      const pa = project(va), pb = project(vb);
      if (!pa || !pb) return false;
      const samples = segmentRegionSamples(pa, pb, tool, points, radius);
      for (const t of samples) {
        const screen = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
        if (!inRegion(screen, tool, points, radius)) continue;
        const world = va.clone().lerp(vb, t).applyMatrix4(mesh.matrixWorld);
        if (visible(screen, world)) return true;
      }
      return false;
    };

    const selected = [];
    if (hem.selectionMode === 'vertex') {
      hem.positions.forEach((position, id) => {
        const screen = project(new THREE.Vector3(...position));
        if (inRegion(screen, tool, points, radius) && visible(screen, screen.world)) selected.push(id);
      });
    } else if (hem.selectionMode === 'edge') {
      hem.edges.forEach(edge => {
        if (edgeIntersects(edge.vertices[0], edge.vertices[1])) selected.push(edge.id);
      });
    } else {
      hem.faces.forEach((_, faceId) => {
        for (const triangle of hem.triangulateFace(faceId)) {
          const center = new THREE.Vector3(...hem.positions[triangle[0]])
            .add(new THREE.Vector3(...hem.positions[triangle[1]]))
            .add(new THREE.Vector3(...hem.positions[triangle[2]])).multiplyScalar(1 / 3);
          const screen = project(center);
          if (inRegion(screen, tool, points, radius) && visible(screen, screen.world, faceId)) {
            selected.push(faceId); break;
          }
        }
      });
    }

    if (!additive) hem.clearSelection();
    const activeSet = hem.selectionMode === 'vertex' ? hem.vertexSelection :
      hem.selectionMode === 'edge' ? hem.edgeSelection : hem.faceSelection;
    for (const id of selected) {
      if (activeSet.has(id)) continue;
      if (hem.selectionMode === 'vertex') hem.selectVertex(id, true);
      else if (hem.selectionMode === 'edge') hem.selectEdge(id, true);
      else hem.selectFace(id, true);
    }
    return { selected: selected.length, mode: hem.selectionMode };
  }
};
