const ARROW_SLOT = { ArrowUp: 0, ArrowRight: 2, ArrowDown: 4, ArrowLeft: 6 };

/** Map a pointer vector to one of eight clockwise pie sectors. */
export function pieSlotFromVector(dx, dy, deadZone = 26) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(deadZone) ||
      Math.hypot(dx, dy) <= Math.max(0, deadZone)) return null;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return ((Math.round((angle + 90) / 45) % 8) + 8) % 8;
}

/** Choose the available sector most closely aligned with an arrow key. */
export function nextPieSlot(currentSlot, direction, availableSlots = []) {
  const target = ARROW_SLOT[direction];
  const slots = [...new Set(availableSlots.filter(slot => Number.isInteger(slot) && slot >= 0 && slot < 8))];
  if (!Number.isInteger(target) || !slots.length) return null;
  const distance = slot => {
    const delta = Math.abs(slot - target);
    return Math.min(delta, 8 - delta);
  };
  return slots.sort((a, b) => distance(a) - distance(b) ||
    (a === currentSlot ? -1 : b === currentSlot ? 1 : a - b))[0];
}

/** Browser controller for a directional, keyboard/touch accessible radial menu. */
export class RadialPieMenu {
  constructor(element) {
    if (!element) throw new TypeError('RadialPieMenu requires a menu element.');
    this.element = element;
    this.entries = [];
    this.activeSlot = null;
    this.gestureKey = null;
    this.anchorScreen = null;
    this.pointerMove = event => this.onPointerMove(event);
    this.outsidePointerDown = event => {
      if (this.element.hidden || this.element.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    };
    window.addEventListener('pointermove', this.pointerMove, { passive: true });
    window.addEventListener('pointerdown', this.outsidePointerDown, true);
  }

  open({ kind, title, entries, center, screenAnchor, gestureKey = null }) {
    this.element.replaceChildren();
    this.entries = entries.map(entry => ({ ...entry }));
    this.activeSlot = null;
    this.gestureKey = gestureKey;
    this.anchorScreen = screenAnchor ? { ...screenAnchor } : null;
    this.element.dataset.kind = kind;
    this.element.setAttribute('role', 'menu');
    this.element.setAttribute('aria-label', `${title || kind} radial menu`);
    this.element.style.left = `${center.x}px`;
    this.element.style.top = `${center.y}px`;

    const core = document.createElement('div');
    core.className = 'pie-menu-core';
    core.textContent = title || 'BL3ND';
    core.setAttribute('aria-hidden', 'true');
    this.element.append(core);
    if (kind === 'selection-tools' || kind === 'selection-actions') {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'pie-center-action';
      back.dataset.command = 'pie_back';
      back.textContent = '← BACK';
      back.setAttribute('role', 'menuitem');
      back.setAttribute('aria-label', 'Back to selection menu');
      this.element.append(back);
    }

    for (const entry of this.entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.command = entry.command;
      button.dataset.slot = String(entry.slot);
      button.textContent = entry.label;
      button.setAttribute('role', 'menuitem');
      button.setAttribute('aria-label', entry.label);
      if (entry.enabled) button.classList.add('is-enabled');
      this.element.append(button);
    }
    this.element.hidden = false;
    this.element.querySelector('button[data-slot]')?.focus({ preventScroll: true });
  }

  get isOpen() { return !this.element.hidden; }
  get kind() { return this.element.dataset.kind || ''; }
  get availableSlots() { return this.entries.map(entry => entry.slot); }

  setActiveSlot(slot, { focus = false } = {}) {
    if (slot !== null && !this.availableSlots.includes(slot)) slot = null;
    this.activeSlot = slot;
    for (const button of this.element.querySelectorAll('button[data-slot]')) {
      const active = Number(button.dataset.slot) === slot;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      if (active && focus) button.focus({ preventScroll: true });
    }
    return slot;
  }

  onPointerMove(event) {
    if (!this.isOpen || !this.anchorScreen || event.pointerType === 'touch') return;
    this.setActiveSlot(pieSlotFromVector(
      event.clientX - this.anchorScreen.x,
      event.clientY - this.anchorScreen.y
    ));
  }

  moveSelection(direction) {
    if (!this.isOpen) return null;
    const slot = nextPieSlot(this.activeSlot, direction, this.availableSlots);
    return this.setActiveSlot(slot, { focus: true });
  }

  activateSelected() {
    if (!this.isOpen) return false;
    const selected = this.activeSlot === null
      ? this.element.querySelector('button[data-slot]')
      : this.element.querySelector(`button[data-slot="${this.activeSlot}"]`);
    if (!selected) return false;
    selected.click();
    return true;
  }

  finishGesture(key) {
    if (!this.isOpen || !this.gestureKey || key !== this.gestureKey) return false;
    const hasSelection = this.activeSlot !== null;
    this.gestureKey = null;
    if (hasSelection) return this.activateSelected();
    // Releasing the shortcut without a directional flick leaves the menu open
    // for ordinary tap/click or arrow-key selection.
    return true;
  }

  close() {
    this.element.hidden = true;
    this.element.replaceChildren();
    this.element.style.left = '';
    this.element.style.top = '';
    this.element.removeAttribute('data-kind');
    this.entries = [];
    this.activeSlot = null;
    this.gestureKey = null;
    this.anchorScreen = null;
  }

  dispose() {
    this.close();
    window.removeEventListener('pointermove', this.pointerMove);
    window.removeEventListener('pointerdown', this.outsidePointerDown, true);
  }
}
