// Clase base de los modos de juego del servidor. Cada experiencia define sus
// objetivos, puntuaciones y recompensas sobre estos ganchos.
import { insideObject } from '../validation.js';

export class BaseMode {
  constructor(room) {
    this.room = room;
    this.world = room.world;
  }

  /** Estado inicial que recibe el jugador al entrar. */
  onJoin() {
    return {};
  }

  onLeave() {}

  /** Tras aceptar una posición: comprobar zonas, puntos de control, etc. */
  onState() {}

  onInteract() {
    return null;
  }

  /** Eventos propios del modo ('mode:event'). */
  onEvent() {
    return { error: 'Evento no soportado' };
  }

  tick() {}

  getRespawn() {
    return null;
  }

  objectsOfType(t) {
    return (this.world.objects || []).filter((o) => o.t === t);
  }

  inside(p, o, pad = 0.6, padY = 1.6) {
    return insideObject(p.pos, o, pad, padY);
  }

  emit(p, event, data) {
    p.socket.emit(event, data);
  }

  broadcast(event, data) {
    this.room.io?.to(this.room.channel).emit(event, data);
  }

  toast(p, text, kind = 'info') {
    p.socket.emit('toast', { text, kind });
  }
}
