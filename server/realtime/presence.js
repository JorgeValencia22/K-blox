// Registro de conexiones activas por usuario: permite notificar en tiempo real
// (amigos conectados, invitaciones, progreso) desde cualquier servicio.

const sockets = new Map(); // userId -> Set<Socket>
const listeners = new Set();

export const presence = {
  add(userId, socket) {
    let set = sockets.get(userId);
    const wasOnline = !!set && set.size > 0;
    if (!set) sockets.set(userId, (set = new Set()));
    set.add(socket);
    if (!wasOnline) listeners.forEach((fn) => fn(userId, true));
  },

  remove(userId, socket) {
    const set = sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) {
      sockets.delete(userId);
      listeners.forEach((fn) => fn(userId, false));
    }
  },

  isOnline(userId) {
    return sockets.has(userId);
  },

  count() {
    return sockets.size;
  },

  emit(userId, event, data) {
    const set = sockets.get(userId);
    if (set) for (const s of set) s.emit(event, data);
  },

  disconnectUser(userId, reason) {
    const set = sockets.get(userId);
    if (set) for (const s of [...set]) {
      s.emit('kicked', { reason });
      s.disconnect(true);
    }
  },

  onChange(fn) {
    listeners.add(fn);
  },
};
