// Emisor de eventos mínimo.
export class Emitter {
  constructor() {
    this.handlers = new Map();
  }

  on(ev, fn) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev).add(fn);
    return () => this.off(ev, fn);
  }

  off(ev, fn) {
    this.handlers.get(ev)?.delete(fn);
  }

  emit(ev, data) {
    const set = this.handlers.get(ev);
    if (set) for (const fn of [...set]) fn(data);
  }
}
