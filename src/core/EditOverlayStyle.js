/**
 * Visual policy for the editable source-cage overlay.
 * When a non-destructive modifier replaces the visible mesh geometry, selected
 * source elements switch to an X-ray treatment so the evaluated shell cannot
 * hide which cage elements are active. Unselected topology remains occluded.
 */
export function hasActiveEvaluatedModifiers(mesh) {
  const modifiers = mesh?.userData?.modifiers;
  return Boolean(mesh?.userData?.evaluatedGeometry && Array.isArray(modifiers) &&
    modifiers.some(modifier => modifier?.enabled !== false));
}

export function resolveEditOverlayStyle({ modifierActive = false } = {}) {
  const xray = Boolean(modifierActive);
  return {
    xray,
    unselectedDepthTest: true,
    selectedDepthTest: !xray,
    selectedFaceOpacity: xray ? 0.42 : 0.2,
    selectedFaceColor: xray ? 0xffad55 : 0xff9848,
    selectedEdgeColor: xray ? 0xffc16a : 0xffa45b,
    selectedEdgeOpacity: xray ? 1 : 0.95,
    selectedVertexColor: xray ? 0xffc16a : 0xffa45b,
    selectedVertexSize: xray ? 14 : 10,
    selectedVertexHaloSize: xray ? 19 : 0,
    selectedVertexHaloColor: 0x281b12
  };
}
