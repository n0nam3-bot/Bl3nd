import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewport {
  constructor(container, { pixelRatio = 1.5, onSelect, onCursor, onStatus } = {}) {
    this.container = container; this.onSelect = onSelect; this.onCursor = onCursor; this.onStatus = onStatus;
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
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.075; this.controls.target.set(0,0,0);
    this.controls.mouseButtons.LEFT = null;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE; this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock(); this.running = true;
    this.setupStage(); this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
    this.renderer.domElement.addEventListener('pointerdown', e => this.onPointerDown(e), { capture: true });
    this.renderer.domElement.addEventListener('pointerup', e => this.onPointerUp(e));
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
    if (this.contentGroup) this.scene.remove(this.contentGroup);
    this.contentGroup = group; this.scene.add(group);
  }

  onPointerDown(event) {
    this.downPoint = { x:event.clientX, y:event.clientY, button:event.button, time:Date.now() };
    if (event.button === 1 && event.shiftKey) this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    else if (event.button === 1) this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    if (event.button === 2 && event.shiftKey) {
      event.preventDefault(); event.stopImmediatePropagation(); this.placeCursorFromPointer(event.clientX,event.clientY); this.downPoint = null;
    }
  }

  onPointerUp(event) {
    if (event.button === 1) this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    if (!this.downPoint || this.downPoint.button !== 0) return;
    const distance = Math.hypot(event.clientX-this.downPoint.x,event.clientY-this.downPoint.y);
    if (distance < 6 && Date.now()-this.downPoint.time < 650) this.pick(event.clientX,event.clientY);
    this.downPoint = null;
  }

  pointerToNdc(x,y) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((x-rect.left)/rect.width)*2-1,-((y-rect.top)/rect.height)*2+1);
  }

  pick(x,y) {
    if (!this.contentGroup) return;
    this.pointer.copy(this.pointerToNdc(x,y)); this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits = this.raycaster.intersectObjects(this.contentGroup.children,true).filter(hit => hit.object.isMesh && hit.object.userData.hem);
    this.onSelect?.(hits[0] || null, this.pointer);
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

  animate = () => {
    if (!this.running) return;
    requestAnimationFrame(this.animate); this.controls.update(); this.renderer.render(this.scene,this.camera);
  };

  dispose() { this.running=false; this.resizeObserver?.disconnect(); this.controls.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
