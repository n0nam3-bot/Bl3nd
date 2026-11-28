/** Build a renderer-independent, searchable scene/object/face tree for the UI. */
export function buildSceneExplorerRows({
  objects = [],
  activeObject = null,
  selectedObjects = [],
  mode = 'object',
  expandedObjects = new Set(),
  expandedFaces = new Set(),
  query = ''
} = {}) {
  const selected = selectedObjects instanceof Set ? selectedObjects : new Set(selectedObjects || []);
  const search = String(query || '').trim().toLocaleLowerCase();
  const rows = [];

  objects.forEach((object, objectIndex) => {
    const name = String(object?.name || `Mesh ${objectIndex + 1}`);
    const hem = object?.userData?.hem;
    const faces = Array.isArray(hem?.faces) ? hem.faces : [];
    const objectMatches = !search || name.toLocaleLowerCase().includes(search);
    const faceNumberMatch = search.match(/^(?:face\s*#?\s*)?0*(\d+)$/);
    const exactFaceNumber = faceNumberMatch ? Number(faceNumberMatch[1]) : null;
    const matchingFaces = faces.map((face, faceId) => ({ face, faceId }))
      .filter(({ face, faceId }) => objectMatches || !search || (Number.isSafeInteger(exactFaceNumber) && exactFaceNumber > 0
        ? faceId + 1 === exactFaceNumber
        : `face ${faceId + 1}`.includes(search) ||
          `face ${String(faceId + 1).padStart(3, '0')}`.includes(search) ||
          `${face.length} vert`.includes(search)));
    if (search && !objectMatches && !matchingFaces.length) return;

    const faceSearch = search && !objectMatches && matchingFaces.length > 0;
    const expanded = expandedObjects.has(object) || faceSearch;
    rows.push({
      kind: 'object', object, objectIndex, name, faceCount: faces.length,
      active: object === activeObject, selected: selected.has(object), expanded
    });

    if (!expanded) return;
    const facesExpanded = expandedFaces.has(object) || faceSearch;
    rows.push({
      kind: 'faces', object, objectIndex, count: faces.length,
      selectedCount: object === activeObject ? (hem?.faceSelection?.size || 0) : 0,
      expanded: Boolean(facesExpanded),
      selectable: true
    });

    if (!facesExpanded) return;
    for (const { face, faceId } of matchingFaces) {
      rows.push({
        kind: 'face', object, objectIndex, faceId,
        name: `Face ${String(faceId + 1).padStart(3, '0')}`,
        vertexCount: face.length,
        selected: object === activeObject && Boolean(hem?.faceSelection?.has(faceId)),
        active: object === activeObject && Boolean(hem?.faceSelection?.has(faceId))
      });
    }
  });

  return rows;
}

export function summarizeSceneExplorer({ objects = [], selectedObjects = [] } = {}) {
  const selected = selectedObjects instanceof Set ? selectedObjects.size : (selectedObjects?.length || 0);
  return {
    objectCount: objects.length,
    selectedCount: Math.min(objects.length, Math.max(0, selected))
  };
}
