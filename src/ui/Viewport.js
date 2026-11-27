import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EditModeOverlay } from './EditModeOverlay.js';
import { chooseSelectionViewDirection } from '../core/SelectionView.js';

export class Viewport {
  constructor(container, { pixelRatio = 1.5, onSelect, onCursor, onStatus } = {}) {
    this.container = container; this.onSelect = onSelect; this.onCursor = onCursor; this.onStatus = onStatus;
    this.editOverlay = null;
    this.selectionTool = 'tap';
    this.onSelectionGestureStart = null;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x252a33);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.05, 2000); this.camera.up.set(0,0,1); this.camera.position.set(7, -9, 7);
    this.renderer = new THREE.WebGLRenderer({ antialias: pixelRatio > 1.1, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.target.set(0, 0, 0);
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.9;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 2500;
    this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.activeTouchPointers = new Set();
    this.lastPointer = null;
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock(); this.running = true;
    this.setupStage(); this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
    this.trackPointer = event => { this.lastPointer = { x: event.clientX, y: event.clientY }; };
    window.addEventListener('pointermove', this.trackPointer, { passive: true });
    this.renderer.domElement.addEventListener('pointerdown', e => this.onPointerDown(e), { capture: true });
    this.renderer.domElement.addEventListener('pointerup', e => this.onPointerUp(e));
    this.renderer.domElement.addEventListener('pointercancel', e => {
      this.activeTouchPointers.delete(e.pointerId);
      if (this.downPoint?.pointerId === e.pointerId) this.downPoint = null;
    });
    this.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    this.animate();
  }

  setupStage() {
    const hemi = new THREE.HemisphereLight(0xd9e6ff, 0x4b4139, 2.1); hemi.position.set(0,0,1); this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe1c0, 3.2); key.position.set(6,-5,9); key.castShadow = true; key.shadow.mapSize.set(1024,1024); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8caeff, 0.7); fill.position.set(-7,4,5); this.scene.add(fill);
    this.grid = new THREE.GridHelper(200, 100, 0x6d7785, 0x424a56); this.grid.rotation.x = Math.PI/2; this.grid.position.z = -0.002; this.scene.add(this.grid);
    this.axes = new THREE.AxesHelper(2.5); this.scene.add(this.axes);
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width,height,false);
  }

  setContent(group) {
    this.clearEditOverlay();
    if (this.contentGroup) this.scene.remove(this.contentGroup);
    this.contentGroup = group; this.scene.add(group);
  }

  clearEditOverlay() {
    this.editOverlay?.dispose();
    this.editOverlay = null;
  }

  updateEditOverlay(mesh, selectionMode = 'face') {
    if (!mesh?.userData?.hem) { this.clearEditOverlay(); return; }
    if (this.editOverlay?.mesh !== mesh) {
      this.clearEditOverlay();
      this.editOverlay = new EditModeOverlay(mesh);
    }
    this.editOverlay.update(mesh.userData.hem, selectionMode);
  }

  getPointerOrigin() {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = this.lastPointer;
    if (pointer && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom) {
      return { x: pointer.x, y: pointer.y };
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  onPointerDown(event) {
    this.lastPointer = { x: event.clientX, y: event.clientY };
    if (this.modalOperationActive) {
      this.onModalPointerStart?.(event);
      event.preventDefault();
      try { this.renderer.domElement.setPointerCapture(event.pointerId); } catch { /* capture is unavailable for some synthetic pointers */ }
      event.stopImmediatePropagation();
      return;
    }
    if (event.button === 0 && this.selectionTool !== 'tap') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.onSelectionGestureStart?.(event, this.selectionTool);
      return;
    }
    if (event.pointerType === 'touch') {
      this.activeTouchPointers.add(event.pointerId);
      // A second finger starts a gesture, never a tap-selection or cursor long-press.
      if (this.activeTouchPointers.size > 1) this.downPoint = null;
      else this.downPoint = { x: event.clientX, y: event.clientY, button: 0, pointerId: event.pointerId, pointerType: 'touch', time: Date.now() };
    } else {
      this.downPoint = { x: event.clientX, y: event.clientY, button: event.button, pointerId: event.pointerId, pointerType: 'mouse', time: Date.now() };
      if (event.button === 0) this.controls.mouseButtons.LEFT = event.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    }

    if (event.button === 1 && event.shiftKey) this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    else if (event.button === 1) this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;

    // Shift + right-click places the 3D cursor instead of starting a pan.
    if (event.pointerType !== 'touch' && event.button === 2 && event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.placeCursorFromPointer(event.clientX, event.clientY);
      this.downPoint = null;
    }
  }

  onPointerUp(event) {
    if (event.pointerType === 'touch') this.activeTouchPointers.delete(event.pointerId);
    if (event.button === 0 && event.pointerType !== 'touch') this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    if (event.button === 1) this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;

    const down = this.downPoint;
    if (!down || down.pointerId !== event.pointerId || down.button !== 0) return;
    const distance = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const isTap = distance < 6 && Date.now() - down.time < 650;
    this.downPoint = null;
    if (isTap && (event.pointerType !== 'touch' || this.activeTouchPointers.size === 0)) {
      this.pick(event.clientX, event.clientY, event);
    }
  }

  pointerToNdc(x,y) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((x-rect.left)/rect.width)*2-1,-((y-rect.top)/rect.height)*2+1);
  }

  pick(x,y,event = null) {
    if (!this.contentGroup) return;
    this.pointer.copy(this.pointerToNdc(x,y)); this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits = this.raycaster.intersectObjects(this.contentGroup.children,true).filter(hit => hit.object.isMesh && hit.object.userData.hem);
    this.onSelect?.(hits[0] || null, this.pointer, event);
  }

  placeCursorFromPointer(x,y) {
    this.pointer.copy(this.pointerToNdc(x,y)); this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits = this.contentGroup ? this.raycaster.intersectObjects(this.contentGroup.children,true) : [];
    let point;
    if (hits.length) point = hits[0].point.clone();
    else {
      const plane = new THREE.Plane(new THREE.Vector3(0,0,1),0); point = new THREE.Vector3(); this.raycaster.ray.intersectPlane(plane,point);
    }
    if (point) this.onCursor?.(point);
  }

  setView(view) {
    const target = this.controls.target.clone(); const distance = this.camera.position.distanceTo(target) || 10;
    const vectors = { front:new THREE.Vector3(0,-1,0), back:new THREE.Vector3(0,1,0), right:new THREE.Vector3(1,0,0), left:new THREE.Vector3(-1,0,0), top:new THREE.Vector3(0,0,1), bottom:new THREE.Vector3(0,0,-1) };
    const direction = vectors[view]; if (!direction) return;
    this.camera.position.copy(target).addScaledVector(direction,distance);
    if (view === 'top' || view === 'bottom') this.camera.up.set(0,1,0); else this.camera.up.set(0,0,1);
    this.camera.lookAt(target); this.controls.update();
  }

  frame(object) {
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object); const sphere = box.getBoundingSphere(new THREE.Sphere());
    const target = sphere.center; const radius = Math.max(1,sphere.radius);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(target); this.camera.position.copy(target).addScaledVector(direction,radius*3.1);
    this.camera.near = Math.max(0.01,radius/100); this.camera.far = radius*1000; this.camera.updateProjectionMatrix(); this.controls.update();
  }

  /**
   * Reframe a multi-face / multi-edge edit selection and choose a view that
   * exposes the greatest combined projected area of its incident faces.
   * The topology argument is the immutable source mesh captured before a modal
   * operator replaces the live half-edge data with its preview candidate.
   */
  frameSelection(object, topology, { faceIds = [], edgeIds = [], vertexIds = [] } = {}) {
    if (!object || !topology?.faces?.length || !topology?.positions?.length) return false;
    const selectedFaces = new Set();
    for (const faceId of faceIds) if (Number.isInteger(faceId) && topology.faces[faceId]) selectedFaces.add(faceId);
    for (const edgeId of edgeIds) {
      const edge = topology.edges?.[edgeId];
      for (const halfEdge of edge?.halfEdges || []) {
        const faceId = halfEdge.face?.id;
        if (Number.isInteger(faceId) && topology.faces[faceId]) selectedFaces.add(faceId);
      }
    }
    if (vertexIds.length) {
      const selectedVertices = new Set(vertexIds);
      topology.faces.forEach((face, faceId) => {
        if (face.some(vertexId => selectedVertices.has(vertexId))) selectedFaces.add(faceId);
      });
    }
    // One selected face/edge is already visible; avoid surprising camera
    // jumps. Reframe only when the user's actual topology selection is a set.
    const selectedElementCount = new Set(faceIds).size + new Set(edgeIds).size + new Set(vertexIds).size;
    if (selectedElementCount < 2 || selectedFaces.size < 2) return false;

    object.updateMatrixWorld(true);
    const selectedBounds = new THREE.Box3();
    const faceSamples = [];
    for (const faceId of selectedFaces) {
      const face = topology.faces[faceId];
      const points = face.map(vertexId => {
        const position = topology.positions[vertexId];
        return position ? new THREE.Vector3(...position).applyMatrix4(object.matrixWorld) : null;
      });
      if (points.length < 3 || points.some(point => !point || !point.toArray().every(Number.isFinite))) continue;
      points.forEach(point => selectedBounds.expandByPoint(point));

      // Newell's area vector provides a stable, area-weighted normal for both
      // convex and simple concave polygon faces, in the object's world frame.
      const areaVector = new THREE.Vector3();
      for (let index = 0; index < points.length; index++) {
        const a = points[index], b = points[(index + 1) % points.length];
        areaVector.x += (a.y - b.y) * (a.z + b.z);
        areaVector.y += (a.z - b.z) * (a.x + b.x);
        areaVector.z += (a.x - b.x) * (a.y + b.y);
      }
      const doubleArea = areaVector.length();
      if (doubleArea > 1e-9) faceSamples.push({ normal: areaVector.multiplyScalar(1 / doubleArea).toArray(), weight: doubleArea * 0.5 });
    }
    if (selectedBounds.isEmpty() || !faceSamples.length) return false;

    const target = selectedBounds.getCenter(new THREE.Vector3());
    const selectedSphere = selectedBounds.getBoundingSphere(new THREE.Sphere());
    const objectSphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(0.08, selectedSphere.radius * 1.12, objectSphere.radius * 0.62);
    const currentDirection = this.camera.position.clone().sub(this.controls.target).normalize();
    const viewDirection = new THREE.Vector3(...chooseSelectionViewDirection(faceSamples, currentDirection.toArray()));

    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.1, this.camera.aspect));
    const limitingHalfFov = Math.max(0.05, Math.min(verticalFov, horizontalFov) / 2);
    const distance = radius / Math.sin(limitingHalfFov) * 1.12;

    this.controls.target.copy(target);
    this.camera.up.set(0, 0, 1);
    if (Math.abs(viewDirection.dot(this.camera.up)) > 0.96) this.camera.up.set(0, 1, 0);
    this.camera.position.copy(target).addScaledVector(viewDirection, distance);
    this.camera.near = Math.max(0.01, radius / 100);
    this.camera.far = Math.max(2000, radius * 1000);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
    this.controls.update();
    return true;
  }

  animate = () => {
    if (!this.running) return;
    requestAnimationFrame(this.animate); this.controls.update(); this.renderer.render(this.scene,this.camera);
  };

  dispose() { this.running=false; this.clearEditOverlay(); window.removeEventListener('pointermove', this.trackPointer); this.resizeObserver?.disconnect(); this.controls.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
