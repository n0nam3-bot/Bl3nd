import * as THREE from 'three';
import { HalfEdgeMesh } from './HalfEdgeMesh.js';

const DEFAULT_MATERIAL = () => new THREE.MeshStandardMaterial({ color: 0xc8cbd0, roughness: 0.64, metalness: 0.08, flatShading: true, side: THREE.DoubleSide });

export class SceneDocument {
  constructor(scene) {
    this.scene = scene;
    this.content = new THREE.Group(); this.content.name = 'Scene Objects'; this.scene.add(this.content);
    this.objects = []; this.activeObject = null; this.cursor = new THREE.Vector3(0, 0, 0); this.mode = 'object';
    this.pivot = 'median'; this.selectionMode = 'face'; this.nameCounter = 1;
  }

  addPrimitive(type = 'cube', at = this.cursor) {
    let geometry;
    const size = 1;
    if (type === 'cube') geometry = new THREE.BoxGeometry(2, 2, 2);
    else if (type === 'sphere') geometry = new THREE.SphereGeometry(1, 24, 16);
    else if (type === 'cylinder') { geometry = new THREE.CylinderGeometry(1, 1, 2, 24, 1); geometry.rotateX(Math.PI / 2); }
    else if (type === 'plane') geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    else throw new Error(`Unsupported primitive: ${type}`);
    const name = `${type[0].toUpperCase()}${type.slice(1)}.${String(this.nameCounter++).padStart(3, '0')}`;
    return this.addMeshFromGeometry(geometry, name, at);
  }

  addMeshFromGeometry(geometry, name = 'Mesh', at = this.cursor, material = null) {
    const hem = HalfEdgeMesh.fromBufferGeometry(geometry);
    hem.setSelectionMode(this.selectionMode);
    const renderGeometry = this.geometryFromHem(hem);
    const renderMaterial = material || DEFAULT_MATERIAL();
    // Edit Mode transforms can legitimately fold adjacent polygons through
    // their shared vertices. Keep both sides visible in the modeling viewport
    // rather than presenting back-facing folded triangles as missing geometry.
    for (const item of Array.isArray(renderMaterial) ? renderMaterial : [renderMaterial]) {
      if (item) { item.side = THREE.DoubleSide; item.needsUpdate = true; }
    }
    const mesh = new THREE.Mesh(renderGeometry, renderMaterial);
    mesh.name = name; mesh.position.copy(at); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.hem = hem; mesh.userData.modifiers = []; mesh.userData.baseMaterialColor = mesh.material.color?.getHex?.() ?? 0xc8cbd0;
    this.content.add(mesh); this.objects.push(mesh); this.setActive(mesh);
    return mesh;
  }

  geometryFromHem(hem) {
    const data = hem.toBufferGeometry(); const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    return geometry;
  }

  updateMesh(mesh = this.activeObject) {
    if (!mesh?.userData?.hem) return;
    const previous = mesh.geometry; mesh.geometry = this.geometryFromHem(mesh.userData.hem);
    if (mesh.userData.evaluatedGeometry === previous) delete mesh.userData.evaluatedGeometry;
    previous?.dispose?.();
  }

  setActive(mesh) {
    this.objects.forEach(item => {
      if (item.material?.emissive) item.material.emissive.setHex(item === mesh ? 0x342315 : 0x000000);
    });
    this.activeObject = mesh || null;
  }

  deleteActiveObject() {
    if (!this.activeObject) return false;
    const mesh = this.activeObject; this.content.remove(mesh); mesh.geometry?.dispose?.();
    this.objects = this.objects.filter(item => item !== mesh); this.setActive(this.objects.at(-1) || null); return true;
  }

  setMode(mode) { this.mode = mode === 'edit' ? 'edit' : 'object'; }

  async serialize() {
    return {
      version: 1, cursor: this.cursor.toArray(), mode: this.mode, pivot: this.pivot, selectionMode: this.selectionMode,
      nameCounter: this.nameCounter,
      activeIndex: this.objects.indexOf(this.activeObject),
      objects: this.objects.map(mesh => ({
        name: mesh.name,
        positions: mesh.userData.hem.positions.map(position => [...position]),
        faces: mesh.userData.hem.faces.map(face => [...face]),
        position: mesh.position.toArray(), rotation: mesh.rotation.toArray(), scale: mesh.scale.toArray(),
        color: mesh.material?.color?.getHex?.() ?? 0xc8cbd0,
        modifiers: mesh.userData.modifiers || [],
        selection: {
          vertices: [...mesh.userData.hem.vertexSelection],
          edges: [...mesh.userData.hem.edgeSelection],
          faces: [...mesh.userData.hem.faceSelection]
        },
        visible: mesh.visible
      }))
    };
  }

  async restore(data) {
    for (const mesh of [...this.objects]) { this.content.remove(mesh); mesh.geometry?.dispose?.(); }
    this.objects = []; this.activeObject = null;
    this.cursor.fromArray(data.cursor || [0, 0, 0]); this.mode = data.mode || 'object'; this.pivot = data.pivot || 'median';
    this.selectionMode = data.selectionMode || 'face'; this.nameCounter = data.nameCounter || 1;
    for (const item of data.objects || []) {
      const hem = new HalfEdgeMesh(item.positions || [], item.faces || []);
      hem.setSelectionMode(this.selectionMode);
      hem.vertexSelection = new Set(item.selection?.vertices || []);
      hem.edgeSelection = new Set(item.selection?.edges || []);
      hem.faceSelection = new Set(item.selection?.faces || []);
      const mesh = new THREE.Mesh(this.geometryFromHem(hem), new THREE.MeshStandardMaterial({ color: item.color ?? 0xc8cbd0, roughness: 0.64, metalness: 0.08, flatShading: true, side: THREE.DoubleSide }));
      mesh.name = item.name || 'Mesh'; mesh.position.fromArray(item.position || [0,0,0]); mesh.rotation.fromArray(item.rotation || [0,0,0]); mesh.scale.fromArray(item.scale || [1,1,1]);
      mesh.visible = item.visible !== false; mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.hem = hem; mesh.userData.modifiers = item.modifiers || []; mesh.userData.baseMaterialColor = item.color ?? 0xc8cbd0;
      this.content.add(mesh); this.objects.push(mesh);
    }
    const index = data.activeIndex ?? this.objects.length - 1;
    this.setActive(this.objects[index] || this.objects.at(-1) || null);
  }

  stats() {
    const hem = this.activeObject?.userData?.hem;
    return { objects: this.objects.length, vertices: hem?.vertices.length || 0, edges: hem?.edges.length || 0, faces: hem?.faceRecords.length || 0 };
  }
}
