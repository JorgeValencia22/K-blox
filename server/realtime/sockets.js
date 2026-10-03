// Protocolo en tiempo real (Socket.IO). Toda entrada del cliente se valida aquí
// o en la sala/modo correspondiente antes de modificar el estado.
import { presence } from './presence.js';
import { RateLimiter } from '../security/rateLimit.js';
import { config } from '../config.js';
import * as users from '../services/users.js';
import * as social from '../services/social.js';

export function setupSockets(io, rooms, chat) {
  const stateLimiter = new RateLimiter(40, 1000);
  const actionLimiter = new RateLimiter(25, 1000);
  setInterval(() => { stateLimiter.cleanup(); actionLimiter.cleanup(); }, 30_000).unref();

  io.use((socket, next) => {
    const u = users.userFromToken(socket.handshake.auth?.token);
    if (!u) return next(new Error('auth'));
    if (users.isBanned(u)) return next(new Error('banned'));
    if (io.engine.clientsCount > config.maxConnections) return next(new Error('full'));
    socket.data.userId = u.id;
    next();
  });

  presence.onChange((userId, online) => {
    for (const fid of social.friendIds(userId)) {
      presence.emit(fid, 'presence', { id: userId, online, room: online ? rooms.roomInfoFor(userId, fid) : null });
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    presence.add(userId, socket);
    users.touch(userId);

    // Envuelve cada manejador: límite de frecuencia + captura de errores + ack opcional.
    const on = (event, handler, limiter = actionLimiter) => {
      socket.on(event, (data, ack) => {
        if (typeof data === 'function') { ack = data; data = undefined; }
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!limiter.take(socket.id)) return reply({ error: 'Demasiadas acciones' });
        try {
          const r = handler(data ?? {});
          reply(r ?? { ok: true });
        } catch (e) {
          console.error(`[socket ${event}]`, e);
          reply({ error: 'Error interno' });
        }
      });
    };
    const me = () => rooms.roomOf(userId)?.players.get(userId) || null;

    on('ping', () => ({ t: Date.now() }));

    on('room:join', (req) => {
      const u = users.getUser(userId);
      if (!u || users.isBanned(u)) return { error: 'Cuenta no disponible' };
      return rooms.join(socket, u, { key: req.key, roomId: req.roomId, code: req.code, private: !!req.private });
    });

    on('room:leave', () => {
      rooms.leave(userId);
      return { ok: true };
    });

    on('room:list', (req) => ({ rooms: rooms.listRooms(String(req.key || ''), userId) }));

    on('state', (msg) => {
      const p = me();
      if (p) rooms.roomOf(userId).handleState(p, msg);
      return null;
    }, stateLimiter);

    on('interact', (req) => {
      const p = me();
      if (!p) return { error: 'No estás en una partida' };
      return rooms.roomOf(userId).interact(p, req.id, req.data);
    });

    on('respawn', (req) => {
      const p = me();
      if (!p) return { error: 'No estás en una partida' };
      return { ok: true, p: rooms.roomOf(userId).respawn(p, { resetVehicle: !!req.resetVehicle }) };
    });

    on('vehicle:enter', (req) => {
      const p = me();
      if (!p) return { error: 'No estás en una partida' };
      return rooms.roomOf(userId).enterVehicle(p, String(req.id));
    });

    on('vehicle:exit', () => {
      const p = me();
      if (!p || !p.vehicleId) return { error: 'No estás en un vehículo' };
      rooms.roomOf(userId).exitVehicle(p);
      return { ok: true };
    });

    on('mode', (req) => {
      const p = me();
      if (!p) return { error: 'No estás en una partida' };
      return rooms.roomOf(userId).mode.onEvent(p, String(req.name || ''), req.data || {});
    });

    on('npc', (req) => {
      const p = me();
      const room = rooms.roomOf(userId);
      if (!p || !room?.npcs) return { error: 'No hay personajes aquí' };
      return room.npcs.talk(p, String(req.id || ''), String(req.action || 'hola'));
    });

    on('chat', (req) => {
      const r = chat.send(userId, { text: req.text, to: req.to });
      return r.error ? r : { ok: true };
    });

    on('report', (req) => {
      let message = null, target = req.userId ? String(req.userId) : null;
      if (req.msgId) {
        const m = chat.findMessage(userId, String(req.msgId));
        if (!m) return { error: 'Mensaje no encontrado' };
        message = m.text;
        target = m.from?.id || target;
      }
      return social.createReport(userId, { targetUserId: target, message, reason: req.reason });
    });

    on('invite', (req) => {
      const room = rooms.roomOf(userId);
      if (!room) return { error: 'No estás en una partida' };
      const fid = String(req.userId || '');
      if (!social.areFriends(userId, fid)) return { error: 'Solo puedes invitar a amigos' };
      if (!presence.isOnline(fid)) return { error: 'Tu amigo no está conectado' };
      room.invited.add(fid);
      const u = users.getUser(userId);
      presence.emit(fid, 'invite', { from: { id: u.id, username: u.username }, roomId: room.id, name: room.name, key: room.key });
      return { ok: true };
    });

    socket.on('disconnect', () => {
      presence.remove(userId, socket);
      // Solo abandona la sala si este socket era el que estaba jugando.
      const room = rooms.roomOf(userId);
      const p = room?.players.get(userId);
      if (p && p.socket === socket) rooms.leave(userId);
      users.touch(userId);
    });
  });
}
