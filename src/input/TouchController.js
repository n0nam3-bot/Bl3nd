import { SelectionAddMode } from '../core/SelectionAddMode.js';
import { shouldMarkTouchSelectionAdditive } from '../core/TouchSelectionInput.js';

export class TouchController {
  constructor(viewport, notify, getSelectedObjectCount = () => 0) {
    this.viewport = viewport;
    this.notify = notify;
    this.getSelectedObjectCount = getSelectedObjectCount;
    this.timer = null;
    this.start = null;
    this.activePointers = new Set();
    this.selectionAddMode = new SelectionAddMode();
    this.objectSelectionAddMode = new SelectionAddMode();
    const el = viewport.renderer.domElement;
    this.selectionCanvas = el;
    this.down = event => this.onDown(event);
    this.move = event => this.onMove(event);
    this.up = event => this.onUp(event);
    this.cancel = event => this.onUp(event);
    this.selectionModifier = event => this.markAdditiveSelection(event);

    // Apply the touch modifier before the viewport's existing Shift-aware
    // selection handlers. Tap Select reads pointerup; region tools capture
    // pointerdown, so only the relevant phase is decorated.
    el.addEventListener('pointerdown', this.selectionModifier, true);
    el.addEventListener('pointerup', this.selectionModifier, true);
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);

    this.setupSelectionAddMode();
  }

  setupSelectionAddMode() {
    this.selectionMenu = document.querySelector('#pie-menu');
    this.selectionButton = document.querySelector('#selection-menu-btn');
    this.multiSelectButton = document.querySelector('#mobile-multi-select');
    this.editModeButton = document.querySelector('#edit-mode-btn');
    this.viewportContainer = document.querySelector('#viewport');
    this.isTouchDevice = Boolean(
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      ('ontouchstart' in window)
    );
    this.syncObjectSelectionButton();
    if (this.multiSelectButton) {
      this.multiSelectClick = () => {
        const enabled = this.objectSelectionAddMode.toggle();
        this.syncObjectSelectionButton();
        const count = Math.max(0, Number(this.getSelectedObjectCount()) || 0);
        const message = enabled
          ? `Multi-Select ON · ${count} selected · tap another object to add it`
          : 'Multi-Select OFF · new taps replace the selection';
        const status = document.querySelector('#status-message');
        if (status) status.textContent = message;
        this.notify?.(enabled ? 'Object Multi-Select enabled' : 'Object Multi-Select disabled', 'success');
      };
      this.multiSelectButton.addEventListener('click', this.multiSelectClick);
    }

    if (this.selectionMenu) {
      this.selectionMenuClick = event => {
        const toggle = event.target.closest?.('button[data-command="mobile_add_selection"]');
        if (!toggle) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.setAddSelectionEnabled(!this.selectionAddMode.enabled);
        this.selectionMenu.hidden = true;
      };
      this.selectionMenu.addEventListener('click', this.selectionMenuClick, true);
      this.selectionMenuObserver = new MutationObserver(() => this.ensureSelectionMenuToggle());
      this.selectionMenuObserver.observe(this.selectionMenu, { childList: true });
      this.ensureSelectionMenuToggle();
    }

    if (this.selectionButton) {
      this.selectionButtonObserver = new MutationObserver(() => this.syncSelectionButton());
      this.selectionButtonObserver.observe(this.selectionButton, {
        attributes: true,
        attributeFilter: ['data-tool', 'aria-pressed'],
        childList: true,
        characterData: true,
        subtree: true
      });
      this.syncSelectionButton();
    }

    if (this.editModeButton) {
      this.editModeObserver = new MutationObserver(() => {
        if (this.isEditMode()) {
          if (this.selectionAddMode.enabled) this.setAddSelectionEnabled(false, { notify: false });
          this.objectSelectionAddMode.reset();
        } else if (this.selectionAddMode.enabled) {
          this.setAddSelectionEnabled(false, { notify: false });
        }
        this.syncObjectSelectionButton();
      });
      this.editModeObserver.observe(this.editModeButton, { attributes: true, attributeFilter: ['class'] });
    }

    // main.js creates the renderer canvas after device detection. Observe the
    // viewport so this controller always decorates the current canvas only.
    if (this.viewportContainer) {
      this.canvasObserver = new MutationObserver(() => this.syncSelectionCanvas());
      this.canvasObserver.observe(this.viewportContainer, { childList: true, subtree: true });
    }
  }

  isEditMode() {
    return Boolean(this.editModeButton?.classList.contains('active'));
  }

  syncObjectSelectionButton() {
    const button = this.multiSelectButton;
    if (!button) return;
    const enabled = this.objectSelectionAddMode.enabled;
    const selectedCount = Math.max(0, Number(this.getSelectedObjectCount()) || 0);
    button.dataset.selectedCount = String(selectedCount);
    button.hidden = !this.isTouchDevice || this.isEditMode();
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', `Object Multi-Select ${enabled ? 'on' : 'off'} · ${selectedCount} object(s) selected`);
    button.title = enabled
      ? `Multi-Select ON · ${selectedCount} selected · tap another object to add it; tap a selected object to remove it`
      : 'Multi-Select OFF · tap to add/remove objects without a keyboard';
    const label = button.querySelector('small');
    if (label) label.textContent = enabled ? `ON · ${selectedCount}` : 'Multi OFF';
  }

  ensureSelectionMenuToggle() {
    const menu = this.selectionMenu;
    if (!this.isTouchDevice || !menu || menu.dataset.kind !== 'selection') return;

    let button = menu.querySelector('button[data-command="mobile_add_selection"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.classList.add('pie-center-action');
      button.dataset.command = 'mobile_add_selection';
      const loopEntry = menu.querySelector('button[data-command="edge_loop"]');
      menu.insertBefore(button, loopEntry || null);
    }
    button.classList.add('pie-center-action');
    button.setAttribute('role', 'menuitemcheckbox');
    button.setAttribute('aria-label', 'Add to Selection');
    const enabled = this.selectionAddMode.enabled;
    button.textContent = `Add to Selection · ${enabled ? 'ON' : 'OFF'}`;
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled
      ? 'Add mode is on. Tap more elements; tap a selected element again to remove it.'
      : 'Turn on to keep existing elements selected while adding more.';
  }

  syncSelectionButton() {
    const button = this.selectionButton;
    if (!button) return;
    const tool = button.dataset.tool || 'tap';
    const labels = { tap: 'Select', box: 'Box', circle: 'Circle', lasso: 'Lasso' };
    const label = labels[tool] || (tool[0]?.toUpperCase() + tool.slice(1)) || 'Select';
    const enabled = this.selectionAddMode.enabled;
    const text = `${label}${enabled ? '+' : ''} ▾`;
    if (button.textContent !== text) button.textContent = text;
    const pressed = enabled || tool !== 'tap';
    if (button.getAttribute('aria-pressed') !== String(pressed)) {
      button.setAttribute('aria-pressed', String(pressed));
    }
    const description = `Selection tools · active: ${label}${enabled ? ' · Add to Selection on' : ''}`;
    if (button.getAttribute('aria-label') !== description) button.setAttribute('aria-label', description);
    button.title = enabled
      ? 'Add to Selection is ON · open to turn it off'
      : 'Selection tools and actions';
  }

  setAddSelectionEnabled(value, { notify = true } = {}) {
    const enabled = this.selectionAddMode.setEnabled(value);
    this.syncSelectionButton();
    this.ensureSelectionMenuToggle();
    const message = enabled
      ? 'Add to Selection ON · tap more elements to extend the selection'
      : 'Add to Selection OFF · new taps replace the selection';
    const status = document.querySelector('#status-message');
    if (status) status.textContent = message;
    if (notify) this.notify?.(enabled ? 'Add to Selection enabled' : 'Add to Selection disabled', 'success');
    return enabled;
  }

  markAdditiveSelection(event) {
    const editMode = this.isEditMode();
    const shouldMark = shouldMarkTouchSelectionAdditive({
      pointerType: event.pointerType,
      modalOperationActive: this.viewport.modalOperationActive,
      editMode,
      objectAddModeEnabled: this.objectSelectionAddMode.enabled,
      editAddModeEnabled: this.selectionAddMode.shouldAdd(),
      selectionTool: this.viewport.selectionTool || 'tap',
      eventType: event.type,
      shiftKey: event.shiftKey
    });
    if (!shouldMark) return;

    // Viewport picking and region gestures already share the Shift-aware path.
    // Decorate only the relevant touch phase rather than duplicating picking.
    try {
      Object.defineProperty(event, 'shiftKey', { configurable: true, value: true });
    } catch {
      try { event.shiftKey = true; } catch { /* Immutable events safely fall back to ordinary selection. */ }
    }
  }

  syncSelectionCanvas() {
    const next = this.viewportContainer?.querySelector('canvas');
    if (!next || next === this.selectionCanvas) return;
    this.selectionCanvas?.removeEventListener('pointerdown', this.selectionModifier, true);
    this.selectionCanvas?.removeEventListener('pointerup', this.selectionModifier, true);
    this.selectionCanvas = next;
    this.selectionCanvas.addEventListener('pointerdown', this.selectionModifier, true);
    this.selectionCanvas.addEventListener('pointerup', this.selectionModifier, true);
  }

  onDown(event) {
    if (event.pointerType !== 'touch' || this.viewport.modalOperationActive) return;
    this.activePointers.add(event.pointerId);
    if (this.activePointers.size > 1) {
      this.clear();
      return;
    }

    this.start = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.timer = setTimeout(() => {
      if (!this.start || this.activePointers.size !== 1) return;
      this.viewport.placeCursorFromPointer(event.clientX, event.clientY);
      this.notify?.('3D Cursor placed');
      this.clear();
    }, 560);
  }

  onMove(event) {
    if (!this.start || event.pointerId !== this.start.id) return;
    if (Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > 12) this.clear();
  }

  onUp(event) {
    this.activePointers.delete(event.pointerId);
    if (this.start?.id === event.pointerId || this.activePointers.size > 1) this.clear();
  }

  clear() {
    clearTimeout(this.timer);
    this.timer = null;
    this.start = null;
  }

  dispose() {
    this.clear();
    this.selectionCanvas?.removeEventListener('pointerdown', this.selectionModifier, true);
    this.selectionCanvas?.removeEventListener('pointerup', this.selectionModifier, true);
    this.viewport.renderer.domElement.removeEventListener('pointerdown', this.down);
    this.viewport.renderer.domElement.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.cancel);
    this.selectionMenu?.removeEventListener('click', this.selectionMenuClick, true);
    this.multiSelectButton?.removeEventListener('click', this.multiSelectClick);
    this.selectionMenuObserver?.disconnect();
    this.selectionButtonObserver?.disconnect();
    this.editModeObserver?.disconnect();
    this.canvasObserver?.disconnect();
  }
}
