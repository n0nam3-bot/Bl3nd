export class CommandBus {
  constructor({ undoManager, status, onCommand = null }) {
    this.handlers = new Map();
    this.undoManager = undoManager;
    this.status = status;
    this.onCommand = onCommand;
    this.running = false;
  }

  register(name, handler, options = {}) {
    if (this.handlers.has(name)) throw new Error(`Command already registered: ${name}`);
    this.handlers.set(name, { handler, recordUndo: options.recordUndo !== false });
  }

  async dispatch(name, payload = {}) {
    const entry = this.handlers.get(name);
    if (!entry) throw new Error(`Unknown command: ${name}`);
    if (this.running) return false;
    this.running = true;
    try {
      const before = entry.recordUndo ? await payload.document?.serialize?.() : null;
      const result = await entry.handler(payload);
      if (entry.recordUndo && result !== false && before && payload.document) {
        const after = await payload.document.serialize();
        await this.undoManager?.record(name, before, after);
      }
      this.status?.(name.replaceAll('.', ' '));
      const normalizedResult = result ?? true;
      if (result !== false) {
        try { this.onCommand?.({ name, payload, result: normalizedResult }); }
        catch { /* Persistence/UI observers must not turn a successful command into a failure. */ }
      }
      return normalizedResult;
    } finally {
      this.running = false;
    }
  }
}
