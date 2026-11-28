/** Shared additive-selection policy for keyboard and touch input. */
export class SelectionAddMode {
  constructor(enabled = false) {
    this.enabled = Boolean(enabled);
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    return this.enabled;
  }

  reset() {
    return this.setEnabled(false);
  }

  shouldAdd(event = null) {
    return this.enabled || Boolean(event?.shiftKey);
  }
}
