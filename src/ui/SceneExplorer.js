import { buildSceneExplorerRows, summarizeSceneExplorer } from '../core/SceneExplorerModel.js';

/** UI-only scene tree. Selection and mesh operations remain in CommandBus handlers. */
export class SceneExplorer {
  constructor(root, { getDocument, dispatch, isAdditive = () => false } = {}) {
    this.root = root;
    this.getDocument = getDocument;
    this.dispatch = dispatch;
    this.isAdditive = isAdditive;
    this.expandedObjects = new Set();
    this.expandedFaces = new Set();
    this.query = '';
    this.lastActiveObject = null;
    this.lastRenderKey = '';

    this.searchInput = root?.querySelector('#scene-explorer-search');
    this.tree = root?.querySelector('#scene-explorer-tree');
    this.count = root?.querySelector('#scene-explorer-count');
    this.hint = root?.querySelector('#scene-explorer-hint');

    this.searchInput?.addEventListener('input', () => {
      this.query = this.searchInput.value;
      this.lastRenderKey = '';
      this.refresh();
    });
    this.tree?.addEventListener('click', event => this.onTreeClick(event));
  }

  resetView() {
    this.query = '';
    if (this.searchInput) this.searchInput.value = '';
    this.expandedObjects.clear();
    this.expandedFaces.clear();
    this.lastActiveObject = null;
    this.lastRenderKey = '';
    this.refresh();
  }

  onTreeClick(event) {
    const button = event.target.closest?.('button[data-explorer-action]');
    if (!button || !this.tree?.contains(button)) return;
    const action = button.dataset.explorerAction;
    const index = Number(button.dataset.objectIndex);
    const document = this.getDocument?.();
    const object = Number.isInteger(index) ? document?.objects?.[index] : null;
    if (!document || !object) return;

    if (action === 'toggle-object') {
      if (this.expandedObjects.has(object)) {
        this.expandedObjects.delete(object);
        this.expandedFaces.delete(object);
      } else {
        this.expandedObjects.add(object);
        this.expandedFaces.add(object);
      }
      this.lastRenderKey = '';
      this.refresh();
      return;
    }

    if (action === 'toggle-faces') {
      if (this.expandedFaces.has(object)) this.expandedFaces.delete(object);
      else this.expandedFaces.add(object);
      this.lastRenderKey = '';
      this.refresh();
      return;
    }

    if (action === 'select-object') {
      const additive = Boolean(event.shiftKey || this.isAdditive('object'));
      this.dispatch?.('explorer.select_object', { object, additive });
      return;
    }

    if (action === 'select-face') {
      const faceId = Number(button.dataset.faceId);
      if (!Number.isInteger(faceId) || faceId < 0) return;
      const additive = Boolean(event.shiftKey || this.isAdditive('face'));
      this.dispatch?.('explorer.select_face', { object, faceId, additive });
    }
  }

  refresh() {
    const scene = this.getDocument?.();
    if (!this.tree || !scene) return;

    const active = scene.activeObject;
    if (active && active !== this.lastActiveObject) {
      this.expandedObjects.add(active);
      this.expandedFaces.add(active);
    }
    this.lastActiveObject = active;

    const summary = summarizeSceneExplorer(scene);
    this.count.textContent = `${summary.selectedCount}/${summary.objectCount} SELECTED`;
    this.hint.textContent = scene.mode === 'edit'
      ? 'Tap a face to select it · Shift/Add toggles more'
      : 'Tap an object to select · expand it to pick a face';

    const rows = buildSceneExplorerRows({
      objects: scene.objects,
      activeObject: active,
      selectedObjects: scene.selectedObjects,
      mode: scene.mode,
      expandedObjects: this.expandedObjects,
      expandedFaces: this.expandedFaces,
      query: this.query
    });
    const renderKey = JSON.stringify({
      mode: scene.mode,
      selectionMode: scene.selectionMode,
      query: this.query,
      rows: rows.map(row => [row.kind, row.objectIndex, row.faceId ?? -1, row.name || '', row.faceCount ?? row.count ?? -1, row.vertexCount ?? -1, row.active, row.selected, row.expanded, row.selectedCount ?? -1])
    });
    if (renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;

    const scrollTop = this.tree.scrollTop;
    const fragment = document.createDocumentFragment();
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'scene-explorer-empty';
      empty.textContent = this.query ? 'No matching objects or faces.' : 'No objects yet. Use Add to create a mesh.';
      fragment.append(empty);
    }

    let renderedFaceRows = 0;
    let totalFaceRows = 0;
    for (const row of rows) {
      if (row.kind === 'object') fragment.append(this.makeObjectRow(row));
      else if (row.kind === 'faces') fragment.append(this.makeFacesRow(row));
      else if (row.kind === 'face') {
        totalFaceRows++;
        if (renderedFaceRows < 250) { fragment.append(this.makeFaceRow(row)); renderedFaceRows++; }
      }
    }
    if (totalFaceRows > renderedFaceRows) {
      const limit = document.createElement('div');
      limit.className = 'scene-explorer-limit';
      limit.textContent = `Showing ${renderedFaceRows} of ${totalFaceRows} faces · search by face number to narrow the list.`;
      fragment.append(limit);
    }
    this.tree.replaceChildren(fragment);
    this.tree.scrollTop = scrollTop;
  }

  makeObjectRow(row) {
    const wrap = document.createElement('div');
    wrap.className = 'scene-explorer-row scene-explorer-object-row';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'scene-explorer-expand';
    toggle.dataset.explorerAction = 'toggle-object';
    toggle.dataset.objectIndex = String(row.objectIndex);
    toggle.textContent = row.expanded ? '⌄' : '›';
    toggle.setAttribute('aria-label', `${row.expanded ? 'Collapse' : 'Expand'} ${row.name}`);
    const select = document.createElement('button');
    select.type = 'button';
    select.className = `scene-explorer-select scene-explorer-object${row.active ? ' is-active' : ''}${row.selected ? ' is-selected' : ''}`;
    select.dataset.explorerAction = 'select-object';
    select.dataset.objectIndex = String(row.objectIndex);
    select.setAttribute('role', 'treeitem');
    select.setAttribute('aria-selected', String(row.active || row.selected));
    select.setAttribute('aria-label', `${row.name}${row.active ? ', active' : ''}${row.selected ? ', selected' : ''}`);
    const icon = document.createElement('span'); icon.className = 'scene-explorer-icon'; icon.textContent = '▣';
    const name = document.createElement('span'); name.className = 'scene-explorer-name'; name.textContent = row.name;
    const meta = document.createElement('span'); meta.className = 'scene-explorer-meta'; meta.textContent = `${row.faceCount}F`;
    select.append(icon, name, meta);
    wrap.append(toggle, select);
    return wrap;
  }

  makeFacesRow(row) {
    const wrap = document.createElement('div'); wrap.className = 'scene-explorer-row scene-explorer-child-row';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'scene-explorer-expand';
    toggle.dataset.explorerAction = 'toggle-faces';
    toggle.dataset.objectIndex = String(row.objectIndex);
    toggle.textContent = row.expanded ? '⌄' : '›';
    toggle.setAttribute('aria-label', `${row.expanded ? 'Collapse' : 'Expand'} faces`);
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'scene-explorer-group';
    label.dataset.explorerAction = 'toggle-faces';
    label.dataset.objectIndex = String(row.objectIndex);
    label.setAttribute('aria-expanded', String(row.expanded));
    const icon = document.createElement('span'); icon.textContent = '◫';
    const text = document.createElement('span'); text.textContent = 'Faces';
    const meta = document.createElement('span'); meta.className = 'scene-explorer-meta'; meta.textContent = `${row.count}${row.selectedCount ? ` · ${row.selectedCount} selected` : ''}`;
    label.append(icon, text, meta); wrap.append(toggle, label); return wrap;
  }

  makeFaceRow(row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `scene-explorer-face${row.selected ? ' is-selected' : ''}`;
    button.dataset.explorerAction = 'select-face';
    button.dataset.objectIndex = String(row.objectIndex);
    button.dataset.faceId = String(row.faceId);
    button.setAttribute('role', 'treeitem');
    button.setAttribute('aria-selected', String(row.selected));
    button.setAttribute('aria-label', `${row.name}, ${row.vertexCount} vertices${row.selected ? ', selected' : ''}`);
    const indent = document.createElement('span'); indent.className = 'scene-explorer-face-indent'; indent.textContent = '·';
    const name = document.createElement('span'); name.className = 'scene-explorer-name'; name.textContent = row.name;
    const meta = document.createElement('span'); meta.className = 'scene-explorer-meta'; meta.textContent = `${row.vertexCount}V`;
    const marker = document.createElement('span'); marker.className = 'scene-explorer-face-marker'; marker.textContent = row.selected ? '●' : '○';
    button.append(indent, marker, name, meta); return button;
  }
}
