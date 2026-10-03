// Mundos creados por usuarios: monedas coleccionables por jugador y, si el mundo
// tiene puntos de control/meta, recorrido validado como en el Obby.
import { ObbyMode } from './ObbyMode.js';

export class CustomMode extends ObbyMode {
  constructor(room) {
    super(room, { official: false });
    this.coins = this.objectsOfType('coin');
    this.hasCourse = !!this.finish;
  }

  onJoin(p) {
    const base = super.onJoin(p);
    p.data.coins = new Set();
    return { ...base, course: this.hasCourse, coins: { got: 0, total: this.coins.length } };
  }

  onState(p) {
    if (this.hasCourse) super.onState(p);
  }

  onInteract(p, o) {
    if (o.t !== 'coin') return null;
    if (p.data.coins.has(o.id)) return { error: 'Ya recogida' };
    p.data.coins.add(o.id);
    this.emit(p, 'coins', { got: p.data.coins.size, total: this.coins.length });
    return { ok: true, collected: o.id };
  }
}
