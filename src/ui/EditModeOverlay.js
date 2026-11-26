import * as THREE from 'three';

const EDGE_COLOR = new THREE.Color(0x8793a3);
const SELECTED_EDGE_COLOR = new THREE.Color(0xffa45b);
const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

/** Draws editable topology without changing the source mesh or intercepting viewport picking. */
export class EditModeOverlay {
  constructor(mesh) {
    this.mesh = mesh;
    this.group = new THREE.Group();
    this.group.name = 'Bl3nd Edit Overlay';
    this.group.renderOrder = 20;
    mesh.add(this.group);
    this.group.raycast = () => {};
  }

  clearChildren() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach(material => material.dispose?.());
      else child.material?.dispose?.();
    }
  }

  update(hem, selectionMode = 'face') {
    this.clearChildren();
    if (!hem?.vertices?.length) return;

    const selectedEdges = new Set();
    const edgeIds = new Map(hem.edges.map(edge => [edgeKey(...edge.vertices), edge.id]));
    if (selectionMode === 'edge') {
      for (const id of hem.edgeSelection) selectedEdges.add(id);
    } else if (selectionMode === 'face') {
      for (const faceId of hem.faceSelection) {
        const face = hem.faces[faceId] || [];
        for (let i = 0; i < face.length; i++) {
          const id = edgeIds.get(edgeKey(face[i], face[(i + 1) % face.length]));
          if (id !== undefined) selectedEdges.add(id);
        }
      }
    } else {
      for (const edge of hem.edges) if (hem.vertexSelection.has(edge.vertices[0]) && hem.vertexSelection.has(edge.vertices[1])) selectedEdges.add(edge.id);
    }

    const edgePositions = [], edgeColors = [];
    for (const edge of hem.edges) {
      const selected = selectedEdges.has(edge.id);
      const color = selected ? SELECTED_EDGE_COLOR : EDGE_COLOR;
      for (const id of edge.vertices) {
        edgePositions.push(...hem.positions[id]);
        edgeColors.push(color.r, color.g, color.b);
      }
    }
    if (edgePositions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3));
      const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false });
      const lines = new THREE.LineSegments(geometry, material);
      lines.name = 'Edit Edges'; lines.renderOrder = 21; lines.frustumCulled = false;
      lines.raycast = () => {};
      this.group.add(lines);
    }

    const selectedVertices = selectionMode === 'vertex' ? hem.vertexSelection : new Set();
    const regularPoints = [], selectedPoints = [];
    hem.positions.forEach((position, id) => (selectedVertices.has(id) ? selectedPoints : regularPoints).push(...position));
    if (regularPoints.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(regularPoints, 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xdce4ef, size: 6, sizeAttenuation: false, depthTest: true, depthWrite: false }));
      points.name = 'Edit Vertices'; points.renderOrder = 22; points.frustumCulled = false; points.raycast = () => {};
      this.group.add(points);
    }
    if (selectedPoints.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedPoints, 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffa45b, size: 10, sizeAttenuation: false, depthTest: true, depthWrite: false }));
      points.name = 'Selected Vertices'; points.renderOrder = 23; points.frustumCulled = false; points.raycast = () => {};
      this.group.add(points);
    }

    if (selectionMode === 'face' && hem.faceSelection.size) {
      const positions = [];
      for (const faceId of hem.faceSelection) {
        const face = hem.faces[faceId];
        if (!face || face.length < 3) continue;
        for (let i = 1; i < face.length - 1; i++) {
          positions.push(...hem.positions[face[0]], ...hem.positions[face[i]], ...hem.positions[face[i + 1]]);
        }
      }
      if (positions.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        const material = new THREE.MeshBasicMaterial({ color: 0xff9848, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
        const fill = new THREE.Mesh(geometry, material);
        fill.name = 'Selected Faces'; fill.renderOrder = 20; fill.frustumCulled = false; fill.raycast = () => {};
        this.group.add(fill);
      }
    }
  }

  dispose() {
    this.clearChildren();
    this.mesh?.remove(this.group);
    this.mesh = null;
  }
}
