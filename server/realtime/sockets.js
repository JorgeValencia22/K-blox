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

    // --- Modo desarrollador (solo administradores; el rol se comprueba en la BD cada vez) ---
    on('admin', (req) => {
      const admin = users.getUser(userId);
      if (!users.isAdmin(admin)) return { error: 'Solo administradores' };
      return adminAction(io, rooms, socket, admin, String(req.action || ''), req);
    });

    on('admin:ctl', (c) => {
      const room = rooms.roomOf(String(c.target || '')) || null;
      const t = room?.players.get(String(c.target || ''));
      if (!t || t.controlledBy !== userId) return null;
      const n = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
      t.socket.volatile.emit('admin:ctl', { x: n(c.x), y: n(c.y), yaw: Number.isFinite(c.yaw) ? c.yaw : 0, run: !!c.run, jump: !!c.jump });
      return null;
    }, stateLimiter);

    socket.on('disconnect', () => {
      presence.remove(userId, socket);
      // Solo abandona la sala si este socket era el que estaba jugando.
      const room = rooms.roomOf(userId);
      const p = room?.players.get(userId);
      if (p && p.socket === socket) rooms.leave(userId);
      const sp = rooms.spectatorRoom(userId);
      if (sp && sp.spectators.get(userId)?.socket === socket) rooms.unspectate(userId);
      users.touch(userId);
    });
  });
}

const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

/** Acciones del panel de administración. */
function adminAction(io, rooms, socket, admin, action, req) {
  const targetId = String(req.userId || '');
  const room = targetId ? rooms.roomOf(targetId) : null;
  const t = room?.players.get(targetId) || null;
  const needT = () => (t ? null : { error: 'Ese jugador no está en ninguna partida' });
  const log = (msg) => console.log(`[admin] ${admin.username}: ${msg}`);
  switch (action) {
    case 'overview':
      return { ok: true, rooms: rooms.overview(), online: presence.count(), maintenance: rooms.maintenance };
    case 'closeRoom': {
      log(`cierra la sala ${req.roomId}`);
      return rooms.closeRoom(req.roomId, '⛔ Un administrador ha cerrado este servidor');
    }
    case 'closeAll': {
      log('cierra TODOS los servidores');
      if (req.maintenance) rooms.maintenance = true;
      return rooms.closeAll('⛔ Los servidores se han cerrado' + (req.maintenance ? ' por mantenimiento' : ''));
    }
    case 'maintenance':
      rooms.maintenance = !!req.on;
      log(`mantenimiento ${rooms.maintenance ? 'ON' : 'OFF'}`);
      return { ok: true, maintenance: rooms.maintenance };
    case 'announce': {
      const text = String(req.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 140);
      if (!text) return { error: 'Escribe un mensaje' };
      io.emit('announce', { text, from: admin.username });
      return { ok: true };
    }
    case 'spectate': {
      const roomId = req.roomId || room?.id;
      if (!roomId) return { error: 'Ese jugador no está en ninguna partida' };
      const r = rooms.spectate(socket, admin, roomId);
      if (r.ok && targetId) {
        const sp = rooms.rooms.get(roomId)?.spectators.get(admin.id);
        if (sp) sp.target = targetId;
        r.target = targetId;
      }
      return r;
    }
    case 'kill':
      if (needT()) return needT();
      t.socket.emit('admin:kill', { by: admin.username });
      return { ok: true };
    case 'lose': {
      if (needT()) return needT();
      const handled = room.mode.adminLose?.(t);
      t.socket.emit('admin:lose', { by: admin.username, handled: !!handled });
      room.systemMessage(`💀 ${t.name} ha perdido`);
      return { ok: true };
    }
    case 'freeze':
      if (needT()) return needT();
      t.adminFrozen = !!req.on;
      t.socket.emit('admin:freeze', { on: t.adminFrozen });
      return { ok: true, frozen: t.adminFrozen };
    case 'launch':
      if (needT()) return needT();
      t.socket.emit('admin:launch', { power: Math.max(10, Math.min(80, Number(req.power) || 45)) });
      return { ok: true };
    case 'bring': {
      if (needT()) return needT();
      const mine = rooms.roomOf(admin.id)?.players.get(admin.id);
      const pos = isVec(req.pos) ? req.pos : mine?.pos;
      if (!pos) return { error: 'No se sabe dónde estás' };
      room.teleport(t, pos);
      t.socket.emit('admin:tp', { p: pos });
      return { ok: true };
    }
    case 'control': {
      if (needT()) return needT();
      if (req.on) {
        if (!room.spectators.has(admin.id)) return { error: 'Primero espectea a este jugador' };
        t.controlledBy = admin.id;
        t.socket.emit('admin:control', { on: true, by: admin.username });
      } else room.releaseControl(t);
      return { ok: true, controlling: !!t.controlledBy };
    }
    case 'jumpscare': {
      if (!presence.isOnline(targetId)) return { error: 'Ese jugador no está conectado' };
      presence.emit(targetId, 'admin:jumpscare', {});
      log(`susto a ${targetId}`);
      return { ok: true };
    }
    case 'spawn': {
      if (needT()) return needT();
      const pos = room.respawn(t);
      t.socket.emit('respawn', { p: pos });
      return { ok: true };
    }
    case 'goto': {
      if (needT()) return needT();
      const mine = rooms.roomOf(admin.id);
      if (mine !== room) return { ok: true, roomId: room.id, needJoin: true };
      const ap = mine.players.get(admin.id);
      const pos = [t.pos[0] + 1.5, t.pos[1] + 0.5, t.pos[2]];
      mine.teleport(ap, pos);
      socket.emit('admin:tp', { p: pos });
      return { ok: true };
    }
    case 'ban': {
      const u = users.getUser(targetId) || users.getUserByName(String(req.username || ''));
      if (!u) return { error: 'Usuario no encontrado' };
      if (u.id === admin.id) return { error: 'No puedes banearte a ti mismo' };
      const r = users.banUser(u.id, { hours: req.hours, perma: !!req.perma });
      if (r.ok) log(`banea a ${u.username} ${req.perma ? 'PARA SIEMPRE' : `${req.hours} h`}`);
      return r;
    }
    case 'unban': {
      const u = users.getUser(targetId) || users.getUserByName(String(req.username || ''));
      if (!u) return { error: 'Usuario no encontrado' };
      return users.unbanUser(u.id);
    }
    case 'giveItem': {
      const u = users.getUser(targetId) || users.getUserByName(String(req.username || ''));
      if (!u) return { error: 'Usuario no encontrado' };
      return users.grantItem(u.id, String(req.itemId || ''));
    }
    case 'users':
      return { ok: true, users: users.searchUsersAdmin(req.q) };
    case 'kick':
      if (needT()) return needT();
      t.socket.emit('kicked', { reason: 'Un administrador te ha expulsado de la partida' });
      rooms.leave(targetId);
      return { ok: true };
    case 'coins': {
      const u = users.getUser(targetId) || users.getUserByName(String(req.username || ''));
      if (!u) return { error: 'Usuario no encontrado' };
      return users.giveCoins(u.id, req.amount, `Regalo de ${admin.username}`);
    }
    case 'createCode':
      return users.createGiftCode(admin.id, { code: req.code, coins: req.coins, uses: req.uses });
    case 'codes':
      return { ok: true, codes: users.listGiftCodes() };
    default:
      return { error: 'Acción desconocida' };
  }
}
