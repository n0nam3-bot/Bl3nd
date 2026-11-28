import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EditModeOverlay } from './EditModeOverlay.js';
import { hasActiveEvaluatedModifiers } from '../core/EditOverlayStyle.js';
import { chooseSelectionViewDirection } from '../core/SelectionView.js';
import { buildTransformGuideGeometry } from '../core/TransformGuideGeometry.js';
import { isTransformGizmoDrag, isTransformPointerOwner, resolveTransformGizmoHandle, resolveTransformGuidePointerEvents } from '../core/TransformGizmoInput.js';
import { orbitOffsetBySteps, rotateViewUpByHorizontalSteps } from '../core/ViewportNavigation.js';
import { orthographicFrustum, orthographicViewHeight, perspectiveDistanceForViewHeight, perspectiveViewHeight } from '../core/CameraProjection.js';

export class Viewport {
  constructor(container, { pixelRatio = 1.5, onSelect, onCursor, onStatus, onProjectionChange } = {}) {
    this.container = container; this.onSelect = onSelect; this.onCursor = onCursor; this.onStatus = onStatus; this.onProjectionChange = onProjectionChange;
    this.perspectiveFov = 48;
    this.editOverlay = null;
    this.selectionTool = 'tap';
    this.onSelectionGestureStart = null;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x252a33);
    this.camera = new THREE.PerspectiveCamera(this.perspectiveFov, 1, 0.05, 2000); this.camera.up.set(0,0,1); this.camera.position.set(7, -9, 7);
    this.renderer = new THREE.WebGLRenderer({ antialias: pixelRatio > 1.1, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.transformGuideSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.transformGuideSvg.classList.add('transform-guide');
    this.transformGuideSvg.setAttribute('aria-hidden', 'true');
    this.transformGuideSvg.setAttribute('hidden', '');
    this.transformGuideSvg.style.pointerEvents = 'none';
    this.transformGuideSvg.addEventListener('pointerdown', event => this.onTransformGuidePointerDown(event));
    this.transformGuidePointerMove = event => this.onTransformGuidePointerMove(event);
    this.transformGuidePointerUp = event => this.onTransformGuidePointerUp(event);
    this.transformGuidePointerCancel = event => this.onTransformGuidePointerCancel(event);
    this.modalTransformPointerId = null;
    this.modalTransformPointerMove = event => {
      if (!this.modalOperationActive || !isTransformPointerOwner(this.modalTransformPointerId, event)) return;
      event.preventDefault();
      this.onModalTransformPointerMove?.({ x: event.clientX, y: event.clientY }, event);
    };
    this.modalTransformPointerEnd = event => {
      if (isTransformPointerOwner(this.modalTransformPointerId, event)) this.modalTransformPointerId = null;
    };
    window.addEventListener('pointermove', this.transformGuidePointerMove, { passive: false });
    // Capture at window level so another overlay cannot swallow a viewport drag.
    window.addEventListener('pointermove', this.modalTransformPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', this.transformGuidePointerUp);
    window.addEventListener('pointerup', this.modalTransformPointerEnd, true);
    window.addEventListener('pointercancel', this.transformGuidePointerCancel);
    window.addEventListener('pointercancel', this.modalTransformPointerEnd, true);
    this.container.appendChild(this.transformGuideSvg);
    this.transformGuideState = null;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.addEventListener('change', () => {
      if (this.transformGuideState) this.updateTransformGuide(this.transformGuideState);
    });
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
    const aspect = width / height;
    this.viewportAspect = aspect;
    if (this.camera.isOrthographicCamera) {
      const baseHeight = this.camera.top - this.camera.bottom;
      const frustum = orthographicFrustum(baseHeight, aspect);
      if (frustum) Object.assign(this.camera, frustum);
      this.camera.aspect = aspect;
    } else this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width,height,false);
    this.updateTransformGuide(this.transformGuideState);
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

  updateTransformGuide(state = null) {
    this.transformGuideState = state;
    const svg = this.transformGuideSvg;
    if (!svg) return;
    if (!state || !this.camera || !this.renderer) {
      svg.setAttribute('hidden', '');
      svg.style.pointerEvents = 'none';
      svg.replaceChildren();
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    this.camera.updateWorldMatrix(true, false);
    const distance = this.camera.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...state.pivot));
    const visibleHeight = this.camera.isOrthographicCamera
      ? orthographicViewHeight(this.camera.top, this.camera.bottom, this.camera.zoom)
      : perspectiveViewHeight(Math.max(0.01, distance), this.camera.fov || this.perspectiveFov, this.camera.zoom || 1);
    const worldLength = THREE.MathUtils.clamp(
      (78 * (visibleHeight || 0.1)) / height,
      0.04,
      500
    );
    const guide = buildTransformGuideGeometry({
      ...state,
      worldLength,
      ringRadius: worldLength * 0.72,
      axisRingBases: state.axisRingBases,
      ringSegments: 64
    });
    if (!guide) {
      svg.setAttribute('hidden', '');
      svg.style.pointerEvents = 'none';
      svg.replaceChildren();
      return;
    }

    const project = point => {
      const projected = new THREE.Vector3(...point).project(this.camera);
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z < -1.1 || projected.z > 1.1) return null;
      return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
    };
    const center = project(guide.pivot);
    if (!center || center.x < -width * 0.4 || center.x > width * 1.4 || center.y < -height * 0.4 || center.y > height * 1.4) {
      svg.setAttribute('hidden', '');
      svg.style.pointerEvents = 'none';
      svg.replaceChildren();
      return;
    }

    const colors = { x: '#ff7777', y: '#76d79b', z: '#82adff' };
    const elements = [];
    const pointString = point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    const planePoints = guide.planeCorners.map(project);
    if (planePoints.length === 4 && planePoints.every(Boolean)) {
      elements.push(`<polygon points="${planePoints.map(pointString).join(' ')}" fill="#edb16b" fill-opacity="0.10" stroke="#edb16b" stroke-opacity="0.48" stroke-width="1" stroke-dasharray="4 4"/>`);
    }

    for (const name of ['x', 'y', 'z']) {
      const line = guide.axisLines[name];
      if (!line) continue;
      const end = project(line.end);
      if (!end) continue;
      const color = colors[name];
      const active = guide.activeAxis === name;
      const muted = guide.activeAxis && !active;
      const dx = end.x - center.x, dy = end.y - center.y;
      const magnitude = Math.hypot(dx, dy);
      if (magnitude < 2) continue;
      const ux = dx / magnitude, uy = dy / magnitude;
      const tip = { x: end.x, y: end.y };
      const back = { x: end.x - ux * (active ? 11 : 8), y: end.y - uy * (active ? 11 : 8) };
      const wing = active ? 5.5 : 4;
      const left = { x: back.x - uy * wing, y: back.y + ux * wing };
      const right = { x: back.x + uy * wing, y: back.y - ux * wing };
      const opacity = muted ? 0.34 : 0.96;
      elements.push(`<line x1="${center.x.toFixed(2)}" y1="${center.y.toFixed(2)}" x2="${tip.x.toFixed(2)}" y2="${tip.y.toFixed(2)}" stroke="${color}" stroke-width="${active ? 3 : 2}" stroke-linecap="round" opacity="${opacity}"/>`);
      elements.push(`<path d="M ${pointString(tip)} L ${pointString(left)} L ${pointString(right)} Z" fill="${color}" opacity="${opacity}"/>`);
      if (state.type === 'scale') {
        elements.push(`<rect x="${(tip.x-4.5).toFixed(2)}" y="${(tip.y-4.5).toFixed(2)}" width="9" height="9" rx="1.5" fill="#20242d" stroke="${color}" stroke-width="2" opacity="${opacity}"/>`);
      }
      elements.push(`<text x="${(tip.x + ux * 10).toFixed(2)}" y="${(tip.y + uy * 10 + 4).toFixed(2)}" fill="${color}" opacity="${opacity}" font-size="12" font-weight="800" text-anchor="middle" paint-order="stroke" stroke="#151920" stroke-width="3">${name.toUpperCase()}</text>`);
      elements.push(`<line x1="${(center.x + ux * 12).toFixed(2)}" y1="${(center.y + uy * 12).toFixed(2)}" x2="${tip.x.toFixed(2)}" y2="${tip.y.toFixed(2)}" stroke="transparent" stroke-width="24" stroke-linecap="round" data-gizmo-hit data-gizmo-handle="axis" data-axis="${name}"/>`);
    }

    const planeColors = { xy: colors.z, yz: colors.x, xz: colors.y };
    for (const handle of guide.planeHandles || []) {
      const corners = handle.corners.map(project);
      if (!corners.every(Boolean)) continue;
      const centerPoint = project(handle.center);
      const points = corners.map(pointString).join(' ');
      const color = planeColors[handle.plane] || '#ffd08a';
      const active = Boolean(handle.active || guide.activePlane === handle.plane);
      elements.push(`<polygon points="${points}" fill="${color}" fill-opacity="${active ? 0.48 : 0.22}" stroke="${color}" stroke-opacity="${active ? 1 : 0.78}" stroke-width="${active ? 2 : 1.3}" stroke-linejoin="round"/>`);
      if (centerPoint) elements.push(`<text x="${centerPoint.x.toFixed(2)}" y="${centerPoint.y.toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="#17202a" fill-opacity="0.94" font-size="8" font-weight="900">${handle.plane.toUpperCase()}</text>`);
      // Expanded transparent outline gives the small plane square a forgiving
      // touch target without obscuring the visible axis/ring geometry.
      elements.push(`<polygon points="${points}" fill="transparent" stroke="transparent" stroke-width="16" stroke-linejoin="round" data-gizmo-hit data-gizmo-handle="plane" data-plane="${handle.plane}"/>`);
    }

    for (const ring of guide.axisRings || []) {
      const ringPoints = ring.points.map(project);
      if (!ringPoints.every(Boolean)) continue;
      const path = ringPoints.map((point, index) => `${index ? 'L' : 'M'} ${pointString(point)}`).join(' ');
      const color = colors[ring.axis];
      const active = guide.activeAxis === ring.axis;
      elements.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="${active ? 3 : 2}" stroke-opacity="${active ? 0.96 : 0.68}"/>`);
      elements.push(`<path d="${path}" fill="none" stroke="transparent" stroke-width="24" stroke-linecap="round" data-gizmo-hit data-gizmo-handle="axis" data-axis="${ring.axis}"/>`);
    }

    if (guide.ringPoints.length) {
      const ringPoints = guide.ringPoints.map(project);
      if (ringPoints.every(Boolean)) {
        const path = ringPoints.map((point, index) => `${index ? 'L' : 'M'} ${pointString(point)}`).join(' ');
        elements.push(`<path d="${path}" fill="none" stroke="#ffd08a" stroke-width="2.4" stroke-opacity="0.92" stroke-dasharray="6 3"/>`);
      }
    }

    const activeColor = colors[guide.activeAxis] || '#ffd08a';
    for (const markerWorld of state.pivotMarkers || []) {
      const marker = project(markerWorld);
      if (!marker || marker.x < -width * 0.4 || marker.x > width * 1.4 || marker.y < -height * 0.4 || marker.y > height * 1.4) continue;
      elements.push(`<circle cx="${marker.x.toFixed(2)}" cy="${marker.y.toFixed(2)}" r="5" fill="#1a1e25" fill-opacity="0.9" stroke="#ffd08a" stroke-width="2"/>`);
      elements.push(`<circle cx="${marker.x.toFixed(2)}" cy="${marker.y.toFixed(2)}" r="1.4" fill="#ffd08a"/>`);
    }
    elements.push(`<circle cx="${center.x.toFixed(2)}" cy="${center.y.toFixed(2)}" r="7" fill="#1a1e25" fill-opacity="0.88" stroke="${activeColor}" stroke-width="2"/>`);
    elements.push(`<path d="M ${(center.x-11).toFixed(2)} ${center.y.toFixed(2)} H ${(center.x+11).toFixed(2)} M ${center.x.toFixed(2)} ${(center.y-11).toFixed(2)} V ${(center.y+11).toFixed(2)}" stroke="#f3f4f6" stroke-opacity="0.72" stroke-width="1"/>`);
    elements.push(`<circle cx="${center.x.toFixed(2)}" cy="${center.y.toFixed(2)}" r="15" fill="transparent" data-gizmo-hit data-gizmo-handle="free"/>`);
    const markerLabel = state.pivotMarkerLabel || 'REGION';
    const regionBadge = state.pivotMode === 'individual' && state.regionCount ? ` · ${state.regionCount} ${markerLabel}${state.regionCount === 1 ? '' : 'S'}` : '';
    const badge = `${(state.orientation || 'global').toUpperCase()} · ${(state.pivotMode || 'median').toUpperCase()}${regionBadge}`;
    elements.push(`<text x="${(center.x+12).toFixed(2)}" y="${(center.y+20).toFixed(2)}" fill="#f0d6b5" font-size="9" font-weight="700" paint-order="stroke" stroke="#151920" stroke-width="3">${badge}</text>`);

    svg.innerHTML = elements.join('');
    svg.querySelectorAll('*').forEach(element => {
      element.style.pointerEvents = resolveTransformGuidePointerEvents(element);
      if (element.dataset.gizmoHandle) element.style.cursor = element.dataset.gizmoHandle === 'free' ? 'move' : 'grab';
    });
    // The SVG spans the entire viewport. It must never become the pointer target
    // itself: blank-area drags belong to the renderer canvas/modal transform;
    // only the explicit SVG handles above may override this pointer transparency.
    svg.style.pointerEvents = 'none';
    svg.removeAttribute('hidden');
  }

  onTransformGuidePointerDown(event) {
    if (!this.modalOperationActive || !this.transformGuideState || this.gizmoPointer) return;
    const target = event.target?.closest?.('[data-gizmo-hit]');
    const handle = resolveTransformGizmoHandle(target);
    if (!handle) return;
    event.preventDefault();
    event.stopPropagation();
    const point = { x: event.clientX, y: event.clientY };
    const accepted = this.onTransformGizmoStart?.({ handle, point, event });
    if (accepted === false) return;
    this.gizmoPointer = { pointerId: event.pointerId, start: point, moved: false };
    try { this.transformGuideSvg.setPointerCapture(event.pointerId); } catch { /* Pointer capture may be unavailable in embedded browsers. */ }
  }

  onTransformGuidePointerMove(event) {
    const gesture = this.gizmoPointer;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    if (!gesture.moved && !isTransformGizmoDrag(gesture.start, point, 3)) return;
    gesture.moved = true;
    this.onTransformGizmoMove?.(point, event);
  }

  onTransformGuidePointerUp(event) {
    const gesture = this.gizmoPointer;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.gizmoPointer = null;
    try { this.transformGuideSvg.releasePointerCapture(event.pointerId); } catch { /* The pointer may already have been released. */ }
    if (gesture.moved) this.onTransformGizmoEnd?.({ x: event.clientX, y: event.clientY }, event);
  }

  onTransformGuidePointerCancel(event) {
    const gesture = this.gizmoPointer;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.gizmoPointer = null;
    try { this.transformGuideSvg.releasePointerCapture(event.pointerId); } catch { /* The pointer may already have been released. */ }
    if (gesture.moved) this.onTransformGizmoCancel?.(event);
  }

  updateEditOverlay(mesh, selectionMode = 'face') {
    if (!mesh?.userData?.hem) { this.clearEditOverlay(); return; }
    if (this.editOverlay?.mesh !== mesh) {
      this.clearEditOverlay();
      this.editOverlay = new EditModeOverlay(mesh);
    }
    this.editOverlay.update(mesh.userData.hem, selectionMode, {
      // Non-destructive modifiers replace the visible render geometry while
      // Edit Mode still targets the original half-edge cage. Keep only the
      // selected cage elements visible through that evaluated surface.
      modifierActive: hasActiveEvaluatedModifiers(mesh)
    });
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
      // Own the pointer by ID, not by its current DOM target. Some mobile
      // browsers retarget captured moves while a full-screen SVG guide is open.
      this.modalTransformPointerId = event.pointerId;
      // Start the free/constrained drag at the actual viewport touch, not at
      // the toolbar's earlier pointer origin from when the modal was launched.
      this.onModalTransformPointerStart?.({ x: event.clientX, y: event.clientY }, event);
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

  projectionMode() {
    return this.camera?.isOrthographicCamera ? 'orthographic' : 'perspective';
  }

  setOrthographicViewHeight(viewHeight) {
    if (!this.camera?.isOrthographicCamera || !Number.isFinite(viewHeight) || viewHeight <= 1e-8) return false;
    const frustum = orthographicFrustum(viewHeight, this.viewportAspect || this.camera.aspect || 1);
    if (!frustum) return false;
    Object.assign(this.camera, frustum);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    return true;
  }

  /** Switch projection without changing the target, view direction or apparent scale. */
  toggleProjection() {
    if (this.modalOperationActive || this.controls?.enabled === false) {
      this.onStatus?.('Finish or cancel the active operation before changing projection.');
      return false;
    }
    const previous = this.camera;
    const target = this.controls.target.clone();
    const offset = previous.position.clone().sub(target);
    const distance = Math.max(0.15, offset.length());
    const direction = offset.lengthSq() > 1e-12 ? offset.normalize() : new THREE.Vector3(0, -1, 0);
    const up = previous.up.clone();
    const quaternion = previous.quaternion.clone();
    const aspect = previous.aspect || this.viewportAspect || Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight);
    const near = Math.max(0.001, previous.near || 0.05);
    const far = Math.max(near + 1, previous.far || 2000);
    let next;

    if (previous.isPerspectiveCamera) {
      const viewHeight = perspectiveViewHeight(distance, previous.fov || this.perspectiveFov, previous.zoom || 1);
      const frustum = orthographicFrustum(viewHeight, aspect);
      if (!frustum) return false;
      next = new THREE.OrthographicCamera(frustum.left, frustum.right, frustum.top, frustum.bottom, near, far);
      next.zoom = 1;
      next.aspect = aspect;
      next.position.copy(previous.position);
      next.up.copy(up);
      next.quaternion.copy(quaternion);
    } else {
      const viewHeight = orthographicViewHeight(previous.top, previous.bottom, previous.zoom || 1);
      const perspectiveZoom = 1;
      const nextDistance = perspectiveDistanceForViewHeight(viewHeight, this.perspectiveFov, perspectiveZoom);
      if (!Number.isFinite(nextDistance)) return false;
      next = new THREE.PerspectiveCamera(this.perspectiveFov, aspect, near, far);
      next.position.copy(target).addScaledVector(direction, Math.max(this.controls.minDistance || 0.15, nextDistance));
      next.up.copy(up);
      next.quaternion.copy(quaternion);
    }

    next.updateProjectionMatrix();
    next.updateMatrixWorld(true);
    this.camera = next;
    // OrbitControls exposes its camera as a replaceable public object; the DOM
    // listeners and damping state remain intact while subsequent updates use
    // the new camera's perspective/orthographic branch.
    this.controls.object = next;
    this.controls.target.copy(target);
    this.controls.update();
    this.updateTransformGuide(this.transformGuideState);
    const mode = this.projectionMode();
    this.onProjectionChange?.(mode);
    this.onStatus?.(`${mode === 'orthographic' ? 'Orthographic' : 'Perspective'} projection`);
    return true;
  }

  setView(view) {
    const target = this.controls.target.clone(); const distance = this.camera.position.distanceTo(target) || 10;
    const vectors = { front:new THREE.Vector3(0,-1,0), back:new THREE.Vector3(0,1,0), right:new THREE.Vector3(1,0,0), left:new THREE.Vector3(-1,0,0), top:new THREE.Vector3(0,0,1), bottom:new THREE.Vector3(0,0,-1) };
    const direction = vectors[view]; if (!direction) return;
    this.camera.position.copy(target).addScaledVector(direction,distance);
    if (view === 'top' || view === 'bottom') this.camera.up.set(0,1,0); else this.camera.up.set(0,0,1);
    this.camera.lookAt(target); this.controls.update();
  }

  orbitStep({ horizontalSteps = 0, verticalSteps = 0 } = {}) {
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    const nextOffset = orbitOffsetBySteps(offset.toArray(), this.camera.up.toArray(), horizontalSteps, verticalSteps);
    if (!nextOffset) return false;
    this.camera.position.copy(target).add(new THREE.Vector3(...nextOffset));
    const nextUp = rotateViewUpByHorizontalSteps(this.camera.up.toArray(), horizontalSteps);
    if (nextUp) this.camera.up.set(...nextUp).normalize();
    this.camera.lookAt(target);
    this.controls.update();
    return true;
  }

  frame(object) {
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object); const sphere = box.getBoundingSphere(new THREE.Sphere());
    const target = sphere.center; const radius = Math.max(1,sphere.radius);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const fitDistance = radius * 3.1;
    this.controls.target.copy(target); this.camera.position.copy(target).addScaledVector(direction,fitDistance);
    this.camera.near = Math.max(0.01,radius/100); this.camera.far = radius*1000;
    if (this.camera.isOrthographicCamera) this.setOrthographicViewHeight(perspectiveViewHeight(fitDistance, this.perspectiveFov));
    else this.camera.updateProjectionMatrix();
    this.camera.lookAt(target); this.controls.update();
  }

  /**
   * Reframe a multi-face / multi-edge edit selection and choose a view that
   * exposes the greatest combined projected area of its incident faces.
   * The topology argument is the immutable source mesh captured before a modal
   * operator replaces the live half-edge data with its preview candidate.
   * `focusFaceId` overrides group scoring and frames one active Individual Faces target.
   */
  frameSelection(object, topology, { faceIds = [], edgeIds = [], vertexIds = [], focusFaceId = null, force = false } = {}) {
    if (!object || !topology?.faces?.length || !topology?.positions?.length) return false;
    const focusedFaceId = Number.isInteger(focusFaceId) && topology.faces[focusFaceId] ? focusFaceId : null;
    const selectedFaces = new Set();
    if (focusedFaceId !== null) {
      // Individual Faces Bevel deliberately frames one editable target at a
      // time, even when the complete selection has balanced/opposing normals.
      selectedFaces.add(focusedFaceId);
    } else {
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
      if (!force && (selectedElementCount < 2 || selectedFaces.size < 2)) return false;
    }

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
    const radius = focusedFaceId !== null
      ? Math.max(0.08, selectedSphere.radius * 1.38, objectSphere.radius * 0.28)
      : Math.max(0.08, selectedSphere.radius * 1.12, objectSphere.radius * 0.62);
    const currentDirection = this.camera.position.clone().sub(this.controls.target).normalize();
    const viewDirection = new THREE.Vector3(...chooseSelectionViewDirection(faceSamples, currentDirection.toArray()));

    const verticalFov = THREE.MathUtils.degToRad(this.perspectiveFov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.1, this.camera.aspect));
    const limitingHalfFov = Math.max(0.05, Math.min(verticalFov, horizontalFov) / 2);
    const distance = radius / Math.sin(limitingHalfFov) * 1.12;

    this.controls.target.copy(target);
    this.camera.up.set(0, 0, 1);
    if (Math.abs(viewDirection.dot(this.camera.up)) > 0.96) this.camera.up.set(0, 1, 0);
    this.camera.position.copy(target).addScaledVector(viewDirection, distance);
    this.camera.near = Math.max(0.01, radius / 100);
    this.camera.far = Math.max(2000, radius * 1000);
    if (this.camera.isOrthographicCamera) this.setOrthographicViewHeight(perspectiveViewHeight(distance, this.perspectiveFov));
    else this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
    this.controls.update();
    return true;
  }

  animate = () => {
    if (!this.running) return;
    requestAnimationFrame(this.animate); this.controls.update(); this.renderer.render(this.scene,this.camera);
  };

  dispose() { this.running=false; this.clearEditOverlay(); this.transformGuideSvg?.remove(); window.removeEventListener('pointermove', this.trackPointer); window.removeEventListener('pointermove', this.transformGuidePointerMove); window.removeEventListener('pointermove', this.modalTransformPointerMove, true); window.removeEventListener('pointerup', this.transformGuidePointerUp); window.removeEventListener('pointerup', this.modalTransformPointerEnd, true); window.removeEventListener('pointercancel', this.transformGuidePointerCancel); window.removeEventListener('pointercancel', this.modalTransformPointerEnd, true); this.resizeObserver?.disconnect(); this.controls.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
