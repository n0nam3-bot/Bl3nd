const DATABASE_NAME = 'bl3nd-local-recovery-v1';
const DATABASE_VERSION = 1;
const OBJECT_STORE = 'documents';
const ACTIVE_SCENE_KEY = 'active-scene';

export function isRecoverableSceneSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.objects) || !Array.isArray(snapshot.cursor)) return false;
  if (snapshot.cursor.length !== 3 || !snapshot.cursor.every(Number.isFinite)) return false;
  return snapshot.objects.every(item =>
    item && typeof item === 'object' &&
    Array.isArray(item.positions) && Array.isArray(item.faces) &&
    Array.isArray(item.position) && item.position.length === 3 && item.position.every(Number.isFinite) &&
    Array.isArray(item.rotation) && item.rotation.length >= 3 && item.rotation.slice(0, 3).every(Number.isFinite) &&
    Array.isArray(item.scale) && item.scale.length === 3 && item.scale.every(Number.isFinite) &&
    item.positions.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)) &&
    item.faces.every(face => Array.isArray(face) && face.every(index => Number.isInteger(index) && index >= 0 && index < item.positions.length))
  );
}

/** A single IndexedDB record for the last committed scene on this browser/device. */
export class IndexedDBSceneStore {
  constructor(indexedDB = globalThis.indexedDB) {
    this.indexedDB = indexedDB;
    this.databasePromise = null;
  }

  open() {
    if (this.databasePromise) return this.databasePromise;
    if (!this.indexedDB?.open) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));

    this.databasePromise = new Promise((resolve, reject) => {
      let request;
      try {
        request = this.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(OBJECT_STORE)) database.createObjectStore(OBJECT_STORE);
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error('Could not open local scene recovery storage.'));
      request.onblocked = () => reject(new Error('Local scene recovery storage is busy in another tab.'));
    }).catch(error => {
      this.databasePromise = null;
      throw error;
    });
    return this.databasePromise;
  }

  async load() {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let snapshotRecord = null;
      let transaction;
      try {
        transaction = database.transaction(OBJECT_STORE, 'readonly');
        const request = transaction.objectStore(OBJECT_STORE).get(ACTIVE_SCENE_KEY);
        request.onsuccess = () => { snapshotRecord = request.result ?? null; };
        request.onerror = () => reject(request.error || new Error('Could not read the local recovery snapshot.'));
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => {
        if (!snapshotRecord) { resolve(null); return; }
        if (!isRecoverableSceneSnapshot(snapshotRecord.snapshot)) {
          reject(new Error('The saved local scene is not a supported recovery snapshot.'));
          return;
        }
        resolve(snapshotRecord);
      };
      transaction.onerror = () => reject(transaction.error || new Error('Could not finish reading the local recovery snapshot.'));
      transaction.onabort = () => reject(transaction.error || new Error('Reading the local recovery snapshot was interrupted.'));
    });
  }

  async save(snapshot) {
    if (!isRecoverableSceneSnapshot(snapshot)) throw new TypeError('Refusing to save an invalid scene recovery snapshot.');
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = database.transaction(OBJECT_STORE, 'readwrite');
        transaction.objectStore(OBJECT_STORE).put({ snapshot, savedAt: Date.now() }, ACTIVE_SCENE_KEY);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error('Could not save the local recovery snapshot.'));
      transaction.onabort = () => reject(transaction.error || new Error('Saving the local recovery snapshot was interrupted.'));
    });
  }
}

/** Debounced scene recovery writer. The caller supplies a guard to exclude live modal previews. */
export class SceneAutosave {
  constructor({ store = new IndexedDBSceneStore(), debounceMs = 850, onState = null } = {}) {
    this.store = store;
    this.debounceMs = Math.max(0, Number(debounceMs) || 0);
    this.onState = onState;
    this.timer = null;
    this.pending = null;
    this.writeQueue = Promise.resolve();
    this.disposed = false;
    this.disabled = false;
  }

  setState(state, detail = null) {
    try { this.onState?.(state, detail); } catch { /* UI status must not break persistence. */ }
  }

  async load() {
    this.setState('loading');
    try {
      const record = await this.store.load();
      this.setState(record ? 'restored' : 'ready', record?.savedAt ?? null);
      return record;
    } catch (error) {
      this.disabled = true;
      this.setState('unavailable', error);
      throw error;
    }
  }

  schedule(snapshotFactory, canSave = () => true) {
    if (this.disposed || this.disabled || typeof snapshotFactory !== 'function') return false;
    this.pending = { snapshotFactory, canSave };
    if (this.timer !== null) clearTimeout(this.timer);
    this.setState('pending');
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.writePending();
    }, this.debounceMs);
    return true;
  }

  async writePending() {
    const pending = this.pending;
    this.pending = null;
    if (!pending || this.disposed) return false;
    if (!this.isAllowed(pending.canSave)) {
      this.setState('deferred');
      return false;
    }
    return this.writeSnapshot(pending.snapshotFactory);
  }

  isAllowed(canSave) {
    try { return canSave?.() !== false; } catch { return false; }
  }

  async writeSnapshot(snapshotFactory) {
    try {
      const snapshot = await snapshotFactory();
      if (!isRecoverableSceneSnapshot(snapshot)) throw new TypeError('Scene snapshot failed recovery validation.');
      const write = this.writeQueue.then(() => {
        this.setState('saving');
        return this.store.save(snapshot);
      });
      this.writeQueue = write.catch(() => {});
      await write;
      this.setState('saved', Date.now());
      return true;
    } catch (error) {
      this.disabled = true;
      this.setState('error', error);
      return false;
    }
  }

  async flush(snapshotFactory = null, canSave = () => true) {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const pending = this.pending;
    this.pending = null;
    const factory = snapshotFactory || pending?.snapshotFactory;
    const guard = snapshotFactory ? canSave : pending?.canSave || canSave;
    if (!factory || this.disposed || this.disabled || !this.isAllowed(guard)) return false;
    return this.writeSnapshot(factory);
  }

  cancel() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }

  dispose() {
    this.cancel();
    this.disposed = true;
  }
}
