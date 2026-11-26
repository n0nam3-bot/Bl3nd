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
  deleteSelected(document) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem || !hem.deleteSelectedElements()) return false;
    document.updateMesh(); return true;
  },
  deleteFaces(document) { return this.deleteSelected(document); },
  dissolveSelected(document) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem || !hem.dissolveSelected()) return false;
    document.updateMesh(); return true;
  },
  repairTopology(document) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem) return null;
    const result = hem.repairTopology();
    if (result.changed) document.updateMesh();
    return result;
  },
  validateTopology(document) {
    return document.activeObject?.userData?.hem?.validateTopology() || null;
  },
  subdivide(document) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem) return false;
    hem.subdivide(); document.updateMesh(); return true;
  }
};
