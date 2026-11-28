export const COMMAND_SEARCH_ITEMS = Object.freeze([
  { id:'add-cube', label:'Add Cube', category:'Add', description:'Create a new cube at the 3D cursor.', keywords:'primitive mesh object box', scope:'any', command:'object.add_primitive', payload:{ primitive:'cube' } },
  { id:'add-sphere', label:'Add UV Sphere', category:'Add', description:'Create a UV sphere at the 3D cursor.', keywords:'primitive mesh object ball', scope:'any', command:'object.add_primitive', payload:{ primitive:'sphere' } },
  { id:'add-cylinder', label:'Add Cylinder', category:'Add', description:'Create a cylinder at the 3D cursor.', keywords:'primitive mesh object', scope:'any', command:'object.add_primitive', payload:{ primitive:'cylinder' } },
  { id:'add-plane', label:'Add Plane', category:'Add', description:'Create a plane at the 3D cursor.', keywords:'primitive mesh object surface', scope:'any', command:'object.add_primitive', payload:{ primitive:'plane' } },

  { id:'mode-edit', label:'Switch to Edit Mode', category:'Mode', description:'Edit the active mesh topology.', keywords:'tab modeling vertices edges faces mesh', scope:'object', command:'mode.set', payload:{ mode:'edit' } },
  { id:'mode-object', label:'Switch to Object Mode', category:'Mode', description:'Return to object-level selection and transforms.', keywords:'tab transform return', scope:'edit', command:'mode.set', payload:{ mode:'object' } },
  { id:'move', label:'Move', category:'Transform', description:'Start a camera-aware Move operation.', keywords:'translate grab g location', scope:'any', command:'transform.modal_start', payload:{ type:'move' } },
  { id:'rotate', label:'Rotate', category:'Transform', description:'Start a camera-aware Rotate operation.', keywords:'rotation r turn', scope:'any', command:'transform.modal_start', payload:{ type:'rotate' } },
  { id:'scale', label:'Scale', category:'Transform', description:'Start a camera-aware Scale operation.', keywords:'resize s size', scope:'any', command:'transform.modal_start', payload:{ type:'scale' } },

  { id:'frame-object', label:'Frame Active Object', category:'View', description:'Center the active object in the viewport.', keywords:'focus home zoom fit', scope:'any', command:'view.frame' },
  { id:'frame-selection', label:'Frame Selection', category:'View', description:'Center selected mesh elements or the active object.', keywords:'focus numpad decimal period zoom fit', scope:'any', command:'view.frame_selection' },
  { id:'view-front', label:'Front View', category:'View', description:'Look at the scene from the front.', keywords:'camera axis cardinal', scope:'any', command:'view.set', payload:{ view:'front' } },
  { id:'view-back', label:'Back View', category:'View', description:'Look at the scene from the back.', keywords:'camera axis cardinal opposite', scope:'any', command:'view.set', payload:{ view:'back' } },
  { id:'view-right', label:'Right View', category:'View', description:'Look at the scene from the right.', keywords:'camera axis cardinal', scope:'any', command:'view.set', payload:{ view:'right' } },
  { id:'view-left', label:'Left View', category:'View', description:'Look at the scene from the left.', keywords:'camera axis cardinal opposite', scope:'any', command:'view.set', payload:{ view:'left' } },
  { id:'view-top', label:'Top View', category:'View', description:'Look down on the scene.', keywords:'camera axis cardinal overhead', scope:'any', command:'view.set', payload:{ view:'top' } },
  { id:'view-bottom', label:'Bottom View', category:'View', description:'Look up at the scene.', keywords:'camera axis cardinal underside', scope:'any', command:'view.set', payload:{ view:'bottom' } },
  { id:'projection-toggle', label:'Toggle Perspective / Orthographic', category:'View', description:'Switch projection while preserving view framing.', keywords:'camera po numpad 5 parallel', scope:'any', command:'view.toggle_projection' },
  { id:'shading-solid', label:'Solid Shading', category:'View', description:'Show solid viewport shading.', keywords:'display material wireframe', scope:'any', command:'shading.set', payload:{ mode:'solid' } },
  { id:'shading-wire', label:'Wireframe Shading', category:'View', description:'Show mesh edges through the surface.', keywords:'display wire edges', scope:'any', command:'shading.set', payload:{ mode:'wire' } },

  { id:'pivot-median', label:'Set Pivot: Median Point', category:'Pivot', description:'Transform around the selection median.', keywords:'origin center transform', scope:'any', command:'pivot.set', payload:{ pivot:'median' } },
  { id:'pivot-bounds', label:'Set Pivot: Bounding Box Center', category:'Pivot', description:'Transform around selection or object bounds.', keywords:'origin bounds center transform', scope:'any', command:'pivot.set', payload:{ pivot:'bounds' } },
  { id:'pivot-individual', label:'Set Pivot: Individual Origins', category:'Pivot', description:'Use one pivot for each disconnected Edit Mode region.', keywords:'origin separate groups transform', scope:'any', command:'pivot.set', payload:{ pivot:'individual' } },
  { id:'pivot-cursor', label:'Set Pivot: 3D Cursor', category:'Pivot', description:'Transform around the 3D cursor.', keywords:'origin cursor transform', scope:'any', command:'pivot.set', payload:{ pivot:'cursor' } },

  { id:'selection-vertex', label:'Vertex Select', category:'Selection', description:'Select vertices in Edit Mode.', keywords:'point component selection mode 1', scope:'edit', command:'mesh.selection_mode', payload:{ mode:'vertex' } },
  { id:'selection-edge', label:'Edge Select', category:'Selection', description:'Select edges in Edit Mode.', keywords:'line component selection mode 2', scope:'edit', command:'mesh.selection_mode', payload:{ mode:'edge' } },
  { id:'selection-face', label:'Face Select', category:'Selection', description:'Select faces in Edit Mode.', keywords:'polygon component selection mode 3', scope:'edit', command:'mesh.selection_mode', payload:{ mode:'face' } },
  { id:'select-all', label:'Select All', category:'Selection', description:'Select every element in the active selection mode.', keywords:'a mesh components', scope:'edit', command:'mesh.select_all' },
  { id:'deselect-all', label:'Deselect All', category:'Selection', description:'Clear the current mesh selection.', keywords:'none clear selection alt a', scope:'edit', command:'mesh.clear_selection' },
  { id:'invert-selection', label:'Invert Selection', category:'Selection', description:'Select unselected elements and clear selected ones.', keywords:'reverse swap selection ctrl i', scope:'edit', command:'mesh.invert_selection' },
  { id:'click-select', label:'Click Select Tool', category:'Selection', description:'Return to tap/click selection.', keywords:'tap point default tool', scope:'edit', command:'selection.tool.set', payload:{ tool:'tap' } },
  { id:'box-select', label:'Box Select Tool', category:'Selection', description:'Select elements inside a rectangular drag.', keywords:'marquee rectangle region b', scope:'edit', command:'selection.tool.set', payload:{ tool:'box' } },
  { id:'circle-select', label:'Circle Select Tool', category:'Selection', description:'Brush-select elements with a circular region.', keywords:'brush paint c region', scope:'edit', command:'selection.tool.set', payload:{ tool:'circle' } },
  { id:'lasso-select', label:'Lasso Select Tool', category:'Selection', description:'Select elements inside a freehand lasso.', keywords:'freehand polygon region l', scope:'edit', command:'selection.tool.set', payload:{ tool:'lasso' } },
  { id:'edge-loop', label:'Select Edge Loop', category:'Selection', description:'Expand edge selection through connected quad loops.', keywords:'alt l topology', scope:'edit', command:'mesh.select_edge_loop' },
  { id:'edge-ring', label:'Select Edge Ring', category:'Selection', description:'Expand edge selection through supported vertex fans.', keywords:'ctrl alt l topology', scope:'edit', command:'mesh.select_edge_ring' },
  { id:'proportional-toggle', label:'Toggle Proportional Editing', category:'Selection', description:'Toggle topology-distance influence for Edit Mode transforms.', keywords:'falloff radius o soft selection', scope:'edit', command:'transform.proportional_toggle' },

  { id:'extrude', label:'Extrude Selected Faces', category:'Edit Mesh', description:'Preview Extrude from the selected planar face region.', keywords:'e extend pull push', scope:'edit', command:'mesh.extrude_region' },
  { id:'inset', label:'Inset Selected Faces', category:'Edit Mesh', description:'Preview Inset inside the selected planar face region.', keywords:'i border offset', scope:'edit', command:'mesh.inset' },
  { id:'bevel', label:'Bevel Selection', category:'Edit Mesh', description:'Start the supported edge or face Bevel operation.', keywords:'ctrl b chamfer width segments', scope:'edit', command:'mesh.bevel' },
  { id:'loop-cut', label:'Loop Cut', category:'Edit Mesh', description:'Preview a cut through a supported quad loop.', keywords:'ctrl r edge ring subdivision', scope:'edit', command:'mesh.loop_cut' },
  { id:'subdivide', label:'Subdivide Mesh', category:'Edit Mesh', description:'Subdivide the selected mesh topology.', keywords:'split midpoint edges faces', scope:'edit', command:'mesh.subdivide' },
  { id:'delete-geometry', label:'Delete Selected Geometry', category:'Edit Mesh', description:'Delete selected vertices, edges or faces.', keywords:'remove erase x', scope:'edit', command:'mesh.delete' },
  { id:'dissolve-geometry', label:'Dissolve Selected Geometry', category:'Edit Mesh', description:'Dissolve a supported planar selected region.', keywords:'remove merge faces edges', scope:'edit', command:'mesh.dissolve' },
  { id:'validate-mesh', label:'Validate Mesh', category:'Edit Mesh', description:'Report topology and triangulation issues.', keywords:'diagnostic check inspect manifold', scope:'edit', command:'mesh.validate_topology' },
  { id:'repair-mesh', label:'Repair Safe Topology Issues', category:'Edit Mesh', description:'Repair malformed, duplicate and safely orientable mesh components.', keywords:'clean fix winding nonmanifold safe', scope:'edit', command:'mesh.repair_topology' },

  { id:'delete-object', label:'Delete Selected Objects', category:'Object', description:'Delete every selected scene object.', keywords:'remove erase active object x', scope:'object', command:'object.delete' },
  { id:'modifier-subdivision', label:'Add Subdivision Modifier', category:'Modifiers', description:'Add the current first-pass Subdivision modifier.', keywords:'smooth subdivide stack', scope:'any', command:'modifier.add', payload:{ type:'subdivision' } },
  { id:'modifier-mirror', label:'Add Mirror Modifier', category:'Modifiers', description:'Add a non-welded Mirror modifier.', keywords:'symmetry reflect stack', scope:'any', command:'modifier.add', payload:{ type:'mirror' } },
  { id:'modifier-array', label:'Add Array Modifier', category:'Modifiers', description:'Add a simple offset Array modifier.', keywords:'duplicate copies repeat stack', scope:'any', command:'modifier.add', payload:{ type:'array' } },
  { id:'modifier-solidify', label:'Add Solidify Modifier', category:'Modifiers', description:'Add a basic Solidify modifier.', keywords:'thickness shell stack', scope:'any', command:'modifier.add', payload:{ type:'solidify' } }
].map(item => Object.freeze({ ...item, payload: item.payload ? Object.freeze({ ...item.payload }) : undefined })));

export function normalizeCommandSearchText(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function isEditableCommandSearchTarget(target) {
  const tag = String(target?.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
    Boolean(target?.isContentEditable) ||
    Boolean(target?.closest?.('[contenteditable="true"], [contenteditable=""]'));
}

export function isCommandSearchShortcut(event) {
  return event?.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
    !isEditableCommandSearchTarget(event.target);
}

export function searchCommandItems(query, mode = 'object', limit = 18, items = COMMAND_SEARCH_ITEMS) {
  const normalized = normalizeCommandSearchText(query);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const context = mode === 'edit' ? 'edit' : 'object';
  return items
    .map((item, index) => {
      if (item.scope !== 'any' && item.scope !== context) return null;
      const label = normalizeCommandSearchText(item.label);
      const haystack = normalizeCommandSearchText([item.label, item.category, item.description, item.keywords, item.command].filter(Boolean).join(' '));
      if (tokens.some(token => !haystack.includes(token))) return null;
      const score = !normalized ? index : label === normalized ? -3 : label.startsWith(normalized) ? -2 : label.includes(normalized) ? -1 : index;
      return { item, index, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, Math.max(1, limit))
    .map(entry => entry.item);
}

const SEARCH_STYLES = [
  '.command-search-trigger{min-width:32px;min-height:31px;display:grid;place-items:center;font-size:18px;line-height:1}',
  '.command-search-backdrop{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-start;justify-content:center;padding:clamp(54px,12vh,118px) 16px 18px;background:#07090dc7;backdrop-filter:blur(7px)}',
  '.command-search-backdrop[hidden]{display:none!important}',
  '.command-search-panel{width:min(620px,100%);max-height:min(690px,78vh);display:flex;flex-direction:column;overflow:hidden;background:#20242c;border:1px solid #566170;border-radius:13px;box-shadow:0 22px 80px #000b}',
  '.command-search-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 10px;color:#e9edf2}',
  '.command-search-heading strong{font-size:12px;letter-spacing:1.25px}.command-search-heading span{color:#aab3bf;font-size:10px}',
  '.command-search-input-wrap{padding:0 14px 12px}.command-search-input{width:100%;height:46px;padding:0 13px;background:#15181e;border:1px solid #626d7c;border-radius:8px;color:#f1f3f6;font-size:15px;outline:none}',
  '.command-search-input:focus{border-color:var(--accent);box-shadow:0 0 0 2px #ed9b5230}',
  '.command-search-list{overflow:auto;overscroll-behavior:contain;padding:3px 9px 9px;display:grid;gap:4px}',
  '.command-search-result{width:100%;min-height:54px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 11px;text-align:left;background:#282e38;border:1px solid transparent;border-radius:8px}',
  '.command-search-result:hover,.command-search-result.is-active{background:#3b3027;border-color:#a8764c}',
  '.command-search-result-main{min-width:0;display:grid;gap:3px}.command-search-result-title{font-size:12px;font-weight:700;color:#e9edf2;overflow-wrap:anywhere}',
  '.command-search-result-description{font-size:10px;line-height:1.35;color:#aeb8c5}.command-search-result-category{padding:4px 6px;border:1px solid #454e5b;border-radius:5px;color:#c1cad5;font-size:9px;white-space:nowrap}',
  '.command-search-empty{padding:22px 12px;text-align:center;color:#aeb8c5;font-size:12px}.command-search-footer{display:flex;justify-content:space-between;gap:12px;padding:10px 15px;border-top:1px solid #343b46;color:#9ca7b5;font-size:9px}',
  '.command-search-footer kbd{padding:2px 5px;border:1px solid #596371;border-radius:4px;color:#e5eaf0;font:inherit}',
  'body.command-search-open{overflow:hidden}',
  '@media(max-width:650px){.command-search-trigger{min-width:27px;min-height:28px;font-size:17px}.command-search-backdrop{padding:54px 9px 12px}.command-search-panel{max-height:calc(100dvh - 68px);border-radius:11px}.command-search-heading{padding:13px 13px 8px}.command-search-input{height:48px;font-size:16px}.command-search-result{min-height:58px;padding:9px 10px}.command-search-result-title{font-size:12px}.command-search-result-description{font-size:9px}.command-search-footer{flex-wrap:wrap;justify-content:center}}'
].join('');

export class CommandSearch {
  constructor({ parentSelector = '.top-actions', dispatch, getMode = () => 'object', canOpen = () => true, getPointerOrigin = () => null, notify = () => {} } = {}) {
    this.dispatch = dispatch;
    this.getMode = getMode;
    this.canOpen = canOpen;
    this.getPointerOrigin = getPointerOrigin;
    this.notify = notify;
    this.returnFocus = null;
    this.activeIndex = 0;
    this.results = [];
    if (typeof document === 'undefined' || !document.body) return;

    this.parent = document.querySelector(parentSelector);
    this.style = document.createElement('style');
    this.style.textContent = SEARCH_STYLES;
    document.head.append(this.style);

    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'icon-button command-search-trigger';
    this.trigger.dataset.commandSearchTrigger = '';
    this.trigger.textContent = '⌕';
    this.trigger.title = 'Search commands (/)';
    this.trigger.setAttribute('aria-label', 'Search commands');
    this.trigger.setAttribute('aria-haspopup', 'dialog');
    this.trigger.setAttribute('aria-controls', 'command-search-dialog');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.parent?.append(this.trigger);

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'command-search-backdrop';
    this.backdrop.hidden = true;
    this.backdrop.addEventListener('click', event => {
      if (event.target === this.backdrop) this.close();
    });

    this.panel = document.createElement('section');
    this.panel.id = 'command-search-dialog';
    this.panel.className = 'command-search-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'command-search-title');

    const heading = document.createElement('div');
    heading.className = 'command-search-heading';
    const title = document.createElement('strong');
    title.id = 'command-search-title';
    title.textContent = 'COMMAND SEARCH';
    const context = document.createElement('span');
    heading.append(title, context);

    const inputWrap = document.createElement('div');
    inputWrap.className = 'command-search-input-wrap';
    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.className = 'command-search-input';
    this.input.placeholder = 'Search actions, tools, views…';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'true');
    this.input.setAttribute('aria-controls', 'command-search-list');
    inputWrap.append(this.input);

    this.list = document.createElement('div');
    this.list.id = 'command-search-list';
    this.list.className = 'command-search-list';
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Available commands');

    this.empty = document.createElement('div');
    this.empty.className = 'command-search-empty';
    this.empty.hidden = true;
    this.empty.textContent = 'No matching commands. Try another search.';

    const footer = document.createElement('div');
    footer.className = 'command-search-footer';
    footer.innerHTML = '<span><kbd>↑</kbd> <kbd>↓</kbd> Navigate · <kbd>Enter</kbd> Run</span><span><kbd>Esc</kbd> Close · <kbd>/</kbd> Open</span>';

    this.panel.append(heading, inputWrap, this.list, this.empty, footer);
    this.backdrop.append(this.panel);
    document.body.append(this.backdrop);

    this.handleTriggerClick = () => this.open({ returnFocus: this.trigger });
    this.handleInput = () => { this.activeIndex = 0; this.render(); };
    this.handlePanelKeydown = event => this.onPanelKeyDown(event);
    this.trigger.addEventListener('click', this.handleTriggerClick);
    this.input.addEventListener('input', this.handleInput);
    this.panel.addEventListener('keydown', this.handlePanelKeydown);
    this.render();
  }

  get isOpen() { return Boolean(this.backdrop && !this.backdrop.hidden); }

  open({ returnFocus = null } = {}) {
    if (!this.backdrop) return false;
    if (this.isOpen) return true;
    if (!this.canOpen()) {
      this.notify('Finish the active operation and close the radial menu before opening Command Search.');
      return false;
    }
    this.returnFocus = returnFocus?.focus ? returnFocus : this.trigger;
    this.backdrop.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.input.value = '';
    this.activeIndex = 0;
    this.render();
    document.body.classList.add('command-search-open');
    try { this.input.focus({ preventScroll: true }); } catch { this.input.focus(); }
    return true;
  }

  close({ restoreFocus = true } = {}) {
    if (!this.isOpen) return false;
    this.backdrop.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('command-search-open');
    const target = this.returnFocus;
    this.returnFocus = null;
    if (restoreFocus && target?.isConnected && typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch { target.focus(); }
    }
    return true;
  }

  render() {
    if (!this.list) return;
    this.results = searchCommandItems(this.input?.value || '', this.getMode());
    this.list.replaceChildren();
    this.empty.hidden = this.results.length > 0;
    this.results.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'command-search-result';
      button.id = 'command-search-option-' + item.id;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === this.activeIndex));
      const main = document.createElement('span');
      main.className = 'command-search-result-main';
      const label = document.createElement('span');
      label.className = 'command-search-result-title';
      label.textContent = item.label;
      const description = document.createElement('small');
      description.className = 'command-search-result-description';
      description.textContent = item.description;
      main.append(label, description);
      const category = document.createElement('span');
      category.className = 'command-search-result-category';
      category.textContent = item.category;
      button.append(main, category);
      button.addEventListener('mouseenter', () => this.setActive(index));
      button.addEventListener('focus', () => this.setActive(index));
      button.addEventListener('click', () => this.execute(item));
      this.list.append(button);
    });
    this.syncActive();
    const context = this.panel?.querySelector('.command-search-heading span');
    if (context) context.textContent = this.getMode() === 'edit' ? 'Edit Mode commands' : 'Object Mode commands';
  }

  syncActive() {
    if (!this.input || !this.list) return;
    const buttons = [...this.list.querySelectorAll('[role="option"]')];
    buttons.forEach((button, index) => {
      const active = index === this.activeIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const active = buttons[this.activeIndex];
    if (active) {
      this.input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView?.({ block: 'nearest' });
    } else this.input.removeAttribute('aria-activedescendant');
  }

  setActive(index) {
    if (!this.results.length) return;
    this.activeIndex = (index + this.results.length) % this.results.length;
    this.syncActive();
  }

  onPanelKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      this.setActive(this.activeIndex + 1);
      this.input.focus({ preventScroll: true });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.setActive(this.activeIndex - 1);
      this.input.focus({ preventScroll: true });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const item = this.results[this.activeIndex] || this.results[0];
      if (item) this.execute(item);
    } else if (event.key === 'Tab') {
      const buttons = [...this.list.querySelectorAll('button')];
      const active = document.activeElement;
      if (!buttons.length) { event.preventDefault(); event.stopPropagation(); this.input.focus(); return; }
      if (event.shiftKey && active === this.input && buttons.length) {
        event.preventDefault();
        event.stopPropagation();
        buttons[buttons.length - 1].focus();
      } else if (!event.shiftKey && active === buttons[buttons.length - 1]) {
        event.preventDefault();
        event.stopPropagation();
        this.input.focus();
      }
    }
  }

  async execute(item) {
    if (!item || !this.dispatch) return false;
    const payload = { ...(item.payload || {}) };
    if (item.command === 'transform.modal_start') payload.pointer = this.getPointerOrigin?.() || null;
    this.close();
    try { return await this.dispatch(item.command, payload); }
    catch (error) {
      this.notify(error?.message || 'Unable to run that command.', 'error');
      return false;
    }
  }

  destroy() {
    this.close({ restoreFocus: false });
    this.trigger?.removeEventListener('click', this.handleTriggerClick);
    this.input?.removeEventListener('input', this.handleInput);
    this.panel?.removeEventListener('keydown', this.handlePanelKeydown);
    this.trigger?.remove();
    this.backdrop?.remove();
    this.style?.remove();
  }
}
