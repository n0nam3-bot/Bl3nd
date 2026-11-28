import * as THREE from 'three';
import { resolveEditOverlayStyle } from '../core/EditOverlayStyle.js';

const EDGE_COLOR = new THREE.Color(0x8793a3);
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

  update(hem, selectionMode = 'face', { modifierActive = false } = {}) {
    this.clearChildren();
    if (!hem?.vertices?.length) return;

    const style = resolveEditOverlayStyle({ modifierActive });
    this.group.userData.modifierXray = style.xray;
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

    const regularEdgePositions = [], selectedEdgePositions = [];
    const edgePositions = edge => edge.vertices.flatMap(id => hem.positions[id]);
    for (const edge of hem.edges) {
      const target = selectedEdges.has(edge.id) ? selectedEdgePositions : regularEdgePositions;
      target.push(...edgePositions(edge));
    }
    const addLines = (positions, { name, color, opacity, depthTest, renderOrder }) => {
      if (!positions.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest, depthWrite: false });
      const lines = new THREE.LineSegments(geometry, material);
      lines.name = name;
      lines.renderOrder = renderOrder;
      lines.frustumCulled = false;
      lines.raycast = () => {};
      this.group.add(lines);
    };

    // Only the selected source edges get X-ray treatment. Unselected cage edges
    // continue to obey the shell's depth buffer, avoiding a cluttered full wireframe.
    addLines(regularEdgePositions, {
      name: 'Edit Edges', color: EDGE_COLOR, opacity: 0.95,
      depthTest: style.unselectedDepthTest, renderOrder: 21
    });
    addLines(selectedEdgePositions, {
      name: style.xray ? 'Selected Edges · X-Ray' : 'Selected Edges',
      color: style.selectedEdgeColor, opacity: style.selectedEdgeOpacity,
      depthTest: style.selectedDepthTest, renderOrder: style.xray ? 26 : 21
    });

    const selectedVertices = selectionMode === 'vertex' ? hem.vertexSelection : new Set();
    const regularPoints = [], selectedPoints = [];
    hem.positions.forEach((position, id) => (selectedVertices.has(id) ? selectedPoints : regularPoints).push(...position));
    if (regularPoints.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(regularPoints, 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({
        color: 0xdce4ef, size: 6, sizeAttenuation: false,
        depthTest: style.unselectedDepthTest, depthWrite: false
      }));
      points.name = 'Edit Vertices'; points.renderOrder = 22; points.frustumCulled = false; points.raycast = () => {};
      this.group.add(points);
    }
    if (selectedPoints.length) {
      if (style.selectedVertexHaloSize) {
        const haloGeometry = new THREE.BufferGeometry();
        haloGeometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedPoints, 3));
        const halo = new THREE.Points(haloGeometry, new THREE.PointsMaterial({
          color: style.selectedVertexHaloColor, size: style.selectedVertexHaloSize,
          sizeAttenuation: false, depthTest: style.selectedDepthTest, depthWrite: false
        }));
        halo.name = 'Selected Vertex Halos · X-Ray'; halo.renderOrder = 27;
        halo.frustumCulled = false; halo.raycast = () => {};
        this.group.add(halo);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedPoints, 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({
        color: style.selectedVertexColor, size: style.selectedVertexSize,
        sizeAttenuation: false, depthTest: style.selectedDepthTest, depthWrite: false
      }));
      points.name = style.xray ? 'Selected Vertices · X-Ray' : 'Selected Vertices';
      points.renderOrder = 28; points.frustumCulled = false; points.raycast = () => {};
      this.group.add(points);
    }

    if (selectionMode === 'face' && hem.faceSelection.size) {
      const positions = [];
      for (const faceId of hem.faceSelection) {
        for (const triangle of hem.triangulateFace(faceId)) {
          positions.push(...hem.positions[triangle[0]], ...hem.positions[triangle[1]], ...hem.positions[triangle[2]]);
        }
      }
      if (positions.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        const material = new THREE.MeshBasicMaterial({
          color: style.selectedFaceColor,
          transparent: true,
          opacity: style.selectedFaceOpacity,
          side: THREE.DoubleSide,
          depthTest: style.selectedDepthTest,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1
        });
        const fill = new THREE.Mesh(geometry, material);
        fill.name = style.xray ? 'Selected Faces · X-Ray' : 'Selected Faces';
        fill.renderOrder = style.xray ? 24 : 20;
        fill.frustumCulled = false; fill.raycast = () => {};
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
