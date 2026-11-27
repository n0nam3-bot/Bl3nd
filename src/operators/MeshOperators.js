export const MeshOperators = {
  extrude(document, distance = 1) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem || !hem.extrudeSelected(distance)) return false;
    document.updateMesh(); return true;
  },
  inset(document, amount = 0.12) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem) return false;
    const result = hem.insetSelectedRegion(amount);
    if (!result.changed) return false;
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
  loopCut(document, options = {}) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem) return null;
    const result = hem.cutEdgeLoop(options);
    if (result.changed) document.updateMesh();
    return result;
  },
  bevel(document, options = {}) {
    const hem = document.activeObject?.userData?.hem;
    if (!hem) return null;
    const result = hem.bevelSelectedEdge(options);
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
