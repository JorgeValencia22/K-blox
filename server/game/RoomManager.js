// Gestiona las salas de este servidor de juego. Está aislado detrás de una
// interfaz pequeña (find/create/join/lookup) para poder repartir salas entre
// varios procesos en el futuro (p. ej. con un directorio compartido en Redis).
import { Room } from './Room.js';
import { getBuiltinWorld } from '../../shared/worlds/index.js';
import { EXPERIENCES } from '../../shared/catalog.js';
import { config } from '../config.js';
import * as worldsSvc from '../services/worlds.js';
import * as users from '../services/users.js';

const EMPTY_ROOM_TTL = 30_000;

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.userRoom = new Map(); // userId -> roomId
    this.spectating = new Map(); // userId (admin) -> roomId
    this.last = Date.now();
    this.maintenance = false; // si está activo solo entran administradores
    this.timer = setInterval(() => this.tick(), Room.SNAPSHOT_MS);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }

  /** Construye la descripción de una experiencia (oficial o de usuario). */
  resolveExperience(key, user) {
    const exp = EXPERIENCES.find((e) => e.id === key);
    if (exp) {
      return { key, name: exp.name, world: getBuiltinWorld(key), builtin: true, mode: key, maxPlayers: Math.min(exp.maxPlayers, config.maxPlayersPerRoom) };
    }
    const row = worldsSvc.playableWorld(user.id, key, { isAdmin: users.isAdmin(user) });
    if (!row) return null;
    const isPublic = row.visibility === 'public';
    return {
      key, name: row.name, world: JSON.parse(row.published_data), builtin: false, mode: 'custom',
      maxPlayers: Math.min(row.max_players, config.maxPlayersPerRoom), ownerId: row.owner_id,
      privateWorld: !isPublic && row.owner_id !== user.id, // solo se entra con invitación
      forcePrivate: !isPublic,
    };
  }

  createRoom(exp, visibility, ownerId) {
    const room = new Room({ ...exp, visibility, ownerId: visibility === 'private' ? ownerId : exp.ownerId });
    room.io = this.io;
    this.rooms.set(room.id, room);
    return room;
  }

  /**
   * Decide a qué sala entra el usuario.
   * req: { key, roomId, code, private }
   */
  pickRoom(user, req) {
    if (req.roomId) {
      const room = this.rooms.get(String(req.roomId));
      if (!room) return { error: 'La partida ya no existe' };
      const can = room.canJoin(user, { code: req.code });
      return can.error ? can : { room };
    }
    if (req.code) {
      const code = String(req.code).toUpperCase();
      const room = [...this.rooms.values()].find((r) => r.inviteCode === code);
      if (!room) return { error: 'Código de invitación no válido' };
      const can = room.canJoin(user, { code });
      return can.error ? can : { room };
    }
    const exp = this.resolveExperience(String(req.key || ''), user);
    if (!exp) return { error: 'Experiencia no encontrada o no disponible' };
    if (exp.privateWorld) {
      // Mundo privado de otro usuario: solo mediante invitación/código a una sala concreta.
      return { error: 'Este mundo es privado' };
    }
    if (req.private || exp.forcePrivate) return { room: this.createRoom(exp, 'private', user.id), created: true };
    const open = [...this.rooms.values()]
      .filter((r) => r.key === exp.key && r.visibility === 'public' && r.players.size < r.maxPlayers)
      .sort((a, b) => b.players.size - a.players.size)[0];
    if (open) return { room: open };
    if (exp.builtin === false) worldsSvc.incrementVisits(exp.key);
    return { room: this.createRoom(exp, 'public', null), created: true };
  }

  join(socket, user, req) {
    if (this.maintenance && !users.isAdmin(user)) return { error: '🛠️ Los servidores están en mantenimiento. Vuelve en un rato.' };
    this.unspectate(user.id);
    const pick = this.pickRoom(user, req || {});
    if (pick.error) return pick;
    const prev = this.userRoom.get(user.id);
    if (prev && prev !== pick.room.id) this.leave(user.id);
    const payload = pick.room.join(socket, user);
    this.userRoom.set(user.id, pick.room.id);
    const room = pick.room;
    payload.world = room.worldIsBuiltin ? { builtin: room.key } : { data: room.world };
    return { ok: true, ...payload };
  }

  leave(userId) {
    this.unspectate(userId);
    const id = this.userRoom.get(userId);
    if (!id) return;
    this.userRoom.delete(userId);
    this.rooms.get(id)?.leave(userId);
  }

  // --- Herramientas de administración -----------------------------------------
  /** Entra en la sala de forma invisible para espectear (solo administradores). */
  spectate(socket, user, roomId) {
    const room = this.rooms.get(String(roomId));
    if (!room) return { error: 'La partida ya no existe' };
    const prev = this.userRoom.get(user.id);
    if (prev) this.leave(user.id);
    this.unspectate(user.id);
    const payload = room.addSpectator(socket, user);
    this.spectating.set(user.id, room.id);
    payload.world = room.worldIsBuiltin ? { builtin: room.key } : { data: room.world };
    return { ok: true, ...payload };
  }

  unspectate(userId) {
    const id = this.spectating.get(userId);
    if (!id) return;
    this.spectating.delete(userId);
    this.rooms.get(id)?.removeSpectator(userId);
  }

  spectatorRoom(userId) {
    const id = this.spectating.get(userId);
    return id ? this.rooms.get(id) : null;
  }

  /** Cierra una sala al instante: todos sus jugadores vuelven al menú. */
  closeRoom(roomId, reason = 'El servidor se ha cerrado') {
    const room = this.rooms.get(String(roomId));
    if (!room) return { error: 'La partida ya no existe' };
    const ids = [...room.players.keys()];
    for (const id of ids) {
      const p = room.players.get(id);
      p.socket.emit('kicked', { reason, closed: true });
      this.leave(id);
    }
    for (const [uid, sp] of room.spectators) {
      sp.socket.emit('kicked', { reason, closed: true });
      this.unspectate(uid);
    }
    this.rooms.delete(room.id);
    return { ok: true, players: ids.length };
  }

  closeAll(reason) {
    let players = 0;
    for (const id of [...this.rooms.keys()]) players += this.closeRoom(id, reason).players || 0;
    return { ok: true, players };
  }

  overview() {
    return [...this.rooms.values()].map((r) => ({
      id: r.id, key: r.key, name: r.name, visibility: r.visibility, maxPlayers: r.maxPlayers, createdAt: r.createdAt,
      players: [...r.players.values()].map((p) => ({ id: p.id, name: p.name, level: p.level, frozen: !!p.adminFrozen, controlled: !!p.controlledBy })),
      spectators: r.spectators.size,
    }));
  }

  roomOf(userId) {
    const id = this.userRoom.get(userId);
    return id ? this.rooms.get(id) : null;
  }

  /** Información de la sala de un usuario para mostrar a sus amigos. */
  roomInfoFor(userId, viewerId) {
    const room = this.roomOf(userId);
    if (!room) return null;
    return {
      id: room.id, key: room.key, name: room.name, players: room.players.size, maxPlayers: room.maxPlayers,
      joinable: room.visibility === 'public' || room.invited.has(viewerId),
    };
  }

  playersFor(key) {
    let n = 0;
    for (const r of this.rooms.values()) if (r.key === key) n += r.players.size;
    return n;
  }

  listRooms(key, viewerId) {
    return [...this.rooms.values()].filter((r) => r.key === key && r.visibility === 'public').map((r) => r.info(viewerId));
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    for (const room of this.rooms.values()) {
      try {
        room.tick(dt);
      } catch (e) {
        console.error(`[sala ${room.id}] error en tick:`, e);
      }
      if (room.players.size === 0 && room.spectators.size === 0 && room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL) this.rooms.delete(room.id);
    }
  }
}
