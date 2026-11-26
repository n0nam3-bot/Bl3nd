export const MeshOperators = {
  extrude(document, distance = 1) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem || !hem.extrudeSelected(distance)) return false;
    document.updateMesh(); return true;
  },
  inset(document, amount = 0.12) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem || !hem.insetSelected(amount)) return false;
    document.updateMesh(); return true;
  },
  deleteFaces(document) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem || !hem.deleteSelectedFaces()) return false;
    document.updateMesh(); return true;
  },
  subdivide(document) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem) return false;
    hem.subdivide(); document.updateMesh(); return true;
  }
};
