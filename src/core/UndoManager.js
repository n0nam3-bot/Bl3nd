export class UndoManager {
  constructor({ maxEntries = 20, onRestore, status }) {
    this.maxEntries = maxEntries; this.onRestore = onRestore; this.status = status;
    this.entries = []; this.index = -1; this.directoryPromise = null; this.serial = 0;
  }
  async directory() {
    if (!navigator.storage?.getDirectory) return null;
    if (!this.directoryPromise) this.directoryPromise = navigator.storage.getDirectory().then(root => root.getDirectoryHandle('forge-undo', { create: true })).catch(() => null);
    return this.directoryPromise;
  }
  async saveSnapshot(snapshot) {
    const dir = await this.directory();
    if (!dir) return { memory: snapshot };
    const name = `snapshot-${Date.now()}-${++this.serial}.json`;
    try {
      const handle = await dir.getFileHandle(name, { create: true });
      const writer = await handle.createWritable();
      await writer.write(JSON.stringify(snapshot)); await writer.close();
      return { file: name };
    } catch { return { memory: snapshot }; }
  }
  async loadSnapshot(ref) {
    if (ref.memory) return ref.memory;
    const dir = await this.directory();
    if (!dir) throw new Error('Undo snapshot storage is unavailable.');
    const handle = await dir.getFileHandle(ref.file); const file = await handle.getFile();
    return JSON.parse(await file.text());
  }
  async removeSnapshot(ref) {
    if (!ref?.file) return;
    try { const dir = await this.directory(); await dir?.removeEntry(ref.file); } catch { /* stale entries are harmless */ }
  }
  async record(label, before, after) {
    const beforeRef = await this.saveSnapshot(before), afterRef = await this.saveSnapshot(after);
    const stale = this.entries.splice(this.index + 1);
    for (const e of stale) { await this.removeSnapshot(e.before); await this.removeSnapshot(e.after); }
    this.entries.push({ label, before: beforeRef, after: afterRef }); this.index = this.entries.length - 1;
    while (this.entries.length > this.maxEntries) {
      const old = this.entries.shift(); this.index--;
      await this.removeSnapshot(old.before); await this.removeSnapshot(old.after);
    }
  }
  async undo() {
    if (this.index < 0) return false;
    const entry = this.entries[this.index--];
    await this.onRestore(await this.loadSnapshot(entry.before)); this.status?.(`Undo: ${entry.label}`); return true;
  }
  async redo() {
    if (this.index + 1 >= this.entries.length) return false;
    const entry = this.entries[++this.index];
    await this.onRestore(await this.loadSnapshot(entry.after)); this.status?.(`Redo: ${entry.label}`); return true;
  }
  get canUndo() { return this.index >= 0; }
  get canRedo() { return this.index + 1 < this.entries.length; }
}
