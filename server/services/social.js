// Amigos, bloqueos y reportes.
import { getDb } from '../db/database.js';
import { getUser, getUserByName, publicProfile, unlockAchievement } from './users.js';
import { presence } from '../realtime/presence.js';
import { cleanText } from '../../shared/worldSchema.js';

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

export function isBlockedEither(a, b) {
  return !!getDb().prepare('SELECT 1 FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)').get(a, b, b, a);
}

export function blockedSet(userId) {
  // Usuarios que el jugador ha bloqueado o que le han bloqueado a él.
  const rows = getDb().prepare('SELECT blocked AS id FROM blocks WHERE blocker = ? UNION SELECT blocker AS id FROM blocks WHERE blocked = ?').all(userId, userId);
  return new Set(rows.map((r) => r.id));
}

export function areFriends(a, b) {
  const [x, y] = pair(a, b);
  return !!getDb().prepare("SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted'").get(x, y);
}

export function friendIds(userId) {
  return getDb().prepare("SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS id FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'accepted'")
    .all(userId, userId, userId).map((r) => r.id);
}

export function listFriends(userId, roomLookup) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM friendships WHERE user_a = ? OR user_b = ?').all(userId, userId);
  const friends = [], incoming = [], outgoing = [];
  for (const r of rows) {
    const otherId = r.user_a === userId ? r.user_b : r.user_a;
    const other = getUser(otherId);
    if (!other) continue;
    const p = publicProfile(other);
    if (r.status === 'accepted') {
      p.room = roomLookup ? roomLookup(otherId, userId) : null;
      friends.push(p);
    } else if (r.requested_by === userId) outgoing.push(p);
    else incoming.push(p);
  }
  const blocked = db.prepare('SELECT blocked FROM blocks WHERE blocker = ?').all(userId)
    .map((r) => getUser(r.blocked)).filter(Boolean).map((u) => ({ id: u.id, username: u.username }));
  friends.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  return { friends, incoming, outgoing, blocked };
}

export function searchUsers(userId, q) {
  q = cleanText(q, 20).replace(/[^A-Za-z0-9_]/g, '');
  if (q.length < 2) return [];
  const blocked = blockedSet(userId);
  return getDb().prepare("SELECT * FROM users WHERE username LIKE ? ESCAPE '\\' AND id != ? ORDER BY length(username) LIMIT 20")
    .all(q.replace(/_/g, '\\_') + '%', userId)
    .filter((r) => !blocked.has(r.id))
    .map((r) => ({ id: r.id, username: r.username, level: r.level, online: presence.isOnline(r.id) }));
}

export function sendFriendRequest(userId, targetName) {
  const target = getUserByName(targetName);
  if (!target || target.id === userId) return { error: 'Usuario no encontrado' };
  if (isBlockedEither(userId, target.id)) return { error: 'No puedes enviar una solicitud a este usuario' };
  const db = getDb();
  const [a, b] = pair(userId, target.id);
  const existing = db.prepare('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?').get(a, b);
  if (existing) {
    if (existing.status === 'accepted') return { error: 'Ya sois amigos' };
    if (existing.requested_by === userId) return { error: 'Solicitud ya enviada' };
    return acceptFriend(userId, target.id); // el otro ya lo había pedido
  }
  const count = db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE requested_by = ? AND status = 'pending'").get(userId).n;
  if (count >= 50) return { error: 'Demasiadas solicitudes pendientes' };
  db.prepare("INSERT INTO friendships (user_a, user_b, status, requested_by, created_at) VALUES (?,?,'pending',?,?)").run(a, b, userId, Date.now());
  const me = getUser(userId);
  presence.emit(target.id, 'notify', { kind: 'friend_request', from: { id: me.id, username: me.username }, text: `${me.username} quiere ser tu amigo` });
  return { ok: true };
}

export function acceptFriend(userId, otherId) {
  const db = getDb();
  const [a, b] = pair(userId, otherId);
  const r = db.prepare("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ? AND status = 'pending' AND requested_by != ?").run(a, b, userId);
  if (r.changes === 0) return { error: 'No hay solicitud pendiente' };
  const me = getUser(userId);
  presence.emit(otherId, 'notify', { kind: 'friend_accepted', from: { id: me.id, username: me.username }, text: `${me.username} aceptó tu solicitud` });
  presence.emit(otherId, 'friends:changed', {});
  unlockAchievement(userId, 'social');
  unlockAchievement(otherId, 'social');
  return { ok: true };
}

export function removeFriend(userId, otherId) {
  const [a, b] = pair(userId, otherId);
  getDb().prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(a, b);
  presence.emit(otherId, 'friends:changed', {});
  return { ok: true };
}

export function blockUser(userId, otherId) {
  if (userId === otherId || !getUser(otherId)) return { error: 'Usuario no válido' };
  getDb().prepare('INSERT OR IGNORE INTO blocks (blocker, blocked, created_at) VALUES (?,?,?)').run(userId, otherId, Date.now());
  removeFriend(userId, otherId);
  return { ok: true };
}

export function unblockUser(userId, otherId) {
  getDb().prepare('DELETE FROM blocks WHERE blocker = ? AND blocked = ?').run(userId, otherId);
  return { ok: true };
}

const REASONS = ['spam', 'insultos', 'datos_personales', 'contenido_inapropiado', 'trampas', 'otro'];

export function createReport(reporterId, { targetUserId, worldId, message, reason }) {
  if (!REASONS.includes(reason)) reason = 'otro';
  if (!targetUserId && !worldId) return { error: 'Reporte vacío' };
  const db = getDb();
  const recent = db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter_id = ? AND created_at > ?').get(reporterId, Date.now() - 3600_000).n;
  if (recent >= 20) return { error: 'Has enviado demasiados reportes, inténtalo más tarde' };
  db.prepare('INSERT INTO reports (reporter_id, target_user_id, world_id, message, reason, created_at) VALUES (?,?,?,?,?,?)')
    .run(reporterId, targetUserId ? cleanText(targetUserId, 64) : null, worldId ? cleanText(worldId, 64) : null, message ? cleanText(message, 300) : null, reason, Date.now());

  // Moderación automática preventiva (un moderador puede revertirla).
  if (worldId) {
    const n = db.prepare("SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE world_id = ? AND status = 'open'").get(String(worldId)).n;
    if (n >= 3) db.prepare('UPDATE worlds SET hidden = 1 WHERE id = ?').run(String(worldId));
  }
  if (targetUserId) {
    const n = db.prepare('SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE target_user_id = ? AND created_at > ?').get(String(targetUserId), Date.now() - 86_400_000).n;
    if (n >= 5) {
      db.prepare('UPDATE users SET chat_muted_until = MAX(chat_muted_until, ?) WHERE id = ?').run(Date.now() + 30 * 60_000, String(targetUserId));
    }
  }
  return { ok: true };
}
