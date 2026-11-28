/** Shared, projection-aware labels for the desktop and mobile camera toggles. */
export function projectionToggleState(mode = 'perspective') {
  const orthographic = mode === 'orthographic';
  const next = orthographic ? 'Perspective' : 'Orthographic';
  return {
    mode: orthographic ? 'orthographic' : 'perspective',
    label: orthographic ? 'O' : 'P',
    ariaPressed: String(orthographic),
    ariaLabel: `Switch to ${next} projection`,
    title: `${orthographic ? 'Orthographic' : 'Perspective'} · tap to switch (Numpad 5)`
  };
}

/** Synchronize either a desktop or mobile projection button. */
export function syncProjectionToggleButton(button, mode = 'perspective') {
  if (!button) return null;
  const state = projectionToggleState(mode);
  const label = button.querySelector?.('[data-projection-label]');
  if (label) label.textContent = state.label;
  else button.textContent = state.label;
  button.setAttribute?.('aria-pressed', state.ariaPressed);
  button.setAttribute?.('aria-label', state.ariaLabel);
  button.title = state.title;
  if (button.dataset) button.dataset.projection = state.mode;
  return state;
}

/** Bind one tap/click path and isolate it from viewport selection/orbit handlers. */
export function bindProjectionToggleButton(button, onToggle) {
  if (!button || typeof button.addEventListener !== 'function' || typeof onToggle !== 'function') return () => {};
  const handler = event => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    onToggle(event);
  };
  button.addEventListener('click', handler);
  return () => button.removeEventListener?.('click', handler);
}
