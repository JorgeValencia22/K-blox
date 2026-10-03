// Chat de sala y mensajes privados con filtro, antispam y bloqueos.
import { RateLimiter } from '../security/rateLimit.js';
import { ChatFilter } from '../security/chatFilter.js';
import { config } from '../config.js';
import { LIMITS } from '../../shared/constants.js';
import { getUser, getUserByName } from '../services/users.js';
import { blockedSet, areFriends, isBlockedEither } from '../services/social.js';
import { presence } from '../realtime/presence.js';

export class ChatService {
  constructor(rooms, filter = ChatFilter.fromFile(config.filterWordsFile)) {
    this.rooms = rooms;
    this.filter = filter;
    this.burst = new RateLimiter(5, 8000);
    this.lastByUser = new Map(); // userId -> { at, texts: [] }
    this.seq = 1;
  }

  /** Devuelve { ok, message } o { error }. */
  send(userId, { text, to } = {}) {
    const user = getUser(userId);
    if (!user) return { error: 'Usuario no válido' };
    const now = Date.now();
    if (user.chat_muted_until > now) {
      return { error: `Tu chat está silenciado durante ${Math.ceil((user.chat_muted_until - now) / 60000)} min` };
    }
    if (typeof text !== 'string' || !text.trim()) return { error: 'Mensaje vacío' };
    if (text.length > LIMITS.chatMax) return { error: `Máximo ${LIMITS.chatMax} caracteres` };

    const last = this.lastByUser.get(userId) || { at: 0, texts: [] };
    if (now - last.at < 700) return { error: 'Espera un momento antes de enviar otro mensaje' };
    const norm = text.trim().toLowerCase();
    if (last.texts.some((t) => t.text === norm && now - t.at < 30_000)) return { error: 'No repitas el mismo mensaje' };
    if (!this.burst.take(userId, now)) return { error: 'Estás enviando mensajes demasiado rápido' };

    const isNew = now - user.created_at < config.newAccountMinutes * 60_000;
    const res = this.filter.check(text, { strict: isNew });
    if (!res.ok) return { error: res.reason };

    last.at = now;
    last.texts = [...last.texts.slice(-2), { text: norm, at: now }];
    this.lastByUser.set(userId, last);

    const msg = { id: `m${this.seq++}`, kind: 'room', from: { id: user.id, name: user.username }, text: res.text, ts: now };

    if (to) {
      if (isNew) return { error: `Las cuentas nuevas no pueden enviar mensajes privados durante ${config.newAccountMinutes} min` };
      const target = getUserByName(String(to));
      if (!target || target.id === userId || !presence.isOnline(target.id)) return { error: 'Ese jugador no está conectado' };
      const sameRoom = this.rooms.roomOf(userId) && this.rooms.roomOf(userId) === this.rooms.roomOf(target.id);
      if (!sameRoom && !areFriends(userId, target.id)) return { error: 'Solo puedes escribir en privado a amigos o jugadores de tu sala' };
      if (isBlockedEither(userId, target.id)) return { error: 'No puedes escribir a este jugador' };
      msg.kind = 'pm';
      msg.to = { id: target.id, name: target.username };
      this.remember(this.rooms.roomOf(userId), msg);
      presence.emit(target.id, 'chat', msg);
      presence.emit(userId, 'chat', msg);
      return { ok: true, message: msg };
    }

    const room = this.rooms.roomOf(userId);
    if (!room) return { error: 'No estás en ninguna partida' };
    this.remember(room, msg);
    const blocked = blockedSet(userId);
    for (const p of room.players.values()) {
      if (!blocked.has(p.id)) p.socket.emit('chat', msg);
    }
    return { ok: true, message: msg };
  }

  remember(room, msg) {
    if (!room) return;
    room.messages.push(msg);
    if (room.messages.length > 150) room.messages.shift();
  }

  /** Busca un mensaje real (del servidor) para adjuntarlo a un reporte. */
  findMessage(userId, msgId) {
    const room = this.rooms.roomOf(userId);
    return room?.messages.find((m) => m.id === msgId) || null;
  }
}
