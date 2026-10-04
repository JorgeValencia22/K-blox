// API REST del juego: perfil, avatar, tienda, amigos, mundos y moderación.
import express from 'express';
import { requireAuth } from './auth.js';
import * as users from '../services/users.js';
import * as social from '../services/social.js';
import * as worlds from '../services/worlds.js';
import { getDb } from '../db/database.js';
import { presence } from '../realtime/presence.js';
import { SHOP_ITEMS, ACHIEVEMENTS, EXPERIENCES } from '../../shared/catalog.js';
import { CATEGORIES } from '../../shared/constants.js';
import { httpLimit } from '../security/rateLimit.js';

const send = (res, out) => (out && out.error ? res.status(400).json(out) : res.json(out));

export function apiRouter(rooms) {
  const r = express.Router();
  r.use(httpLimit(240, 60_000));

  r.get('/catalog', (req, res) => res.json({ shop: SHOP_ITEMS, achievements: ACHIEVEMENTS, categories: CATEGORIES, experiences: EXPERIENCES }));
  r.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.rooms.size, online: presence.count() }));

  r.use(requireAuth);

  // --- Perfil ---------------------------------------------------------------
  r.get('/profile', (req, res) => res.json({ user: users.privateProfile(req.user) }));
  r.get('/users/:id', (req, res) => {
    const u = users.getUser(req.params.id);
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: { ...users.publicProfile(u), friend: social.areFriends(req.user.id, u.id) } });
  });
  r.put('/avatar', (req, res) => res.json({ avatar: users.saveAvatar(req.user.id, req.body?.avatar) }));

  // --- Tienda ---------------------------------------------------------------
  r.post('/shop/buy', (req, res) => send(res, users.buyItem(req.user.id, String(req.body?.itemId || ''))));

  // --- Kesty Coins: recompensa diaria, ruleta y códigos regalo ---------------
  r.post('/rewards/daily', (req, res) => send(res, users.claimDaily(req.user.id)));
  r.post('/rewards/spin', (req, res) => send(res, users.spinWheel(req.user.id)));
  r.post('/codes/redeem', httpLimit(10, 60_000), (req, res) => send(res, users.redeemGiftCode(req.user.id, req.body?.code)));

  // --- Amigos ---------------------------------------------------------------
  r.get('/friends', (req, res) => res.json(social.listFriends(req.user.id, (fid, viewer) => rooms.roomInfoFor(fid, viewer))));
  r.get('/users', (req, res) => res.json({ users: social.searchUsers(req.user.id, req.query.q) }));
  r.post('/friends/request', (req, res) => send(res, social.sendFriendRequest(req.user.id, String(req.body?.username || ''))));
  r.post('/friends/accept', (req, res) => send(res, social.acceptFriend(req.user.id, String(req.body?.userId || ''))));
  r.post('/friends/decline', (req, res) => send(res, social.removeFriend(req.user.id, String(req.body?.userId || ''))));
  r.post('/friends/remove', (req, res) => send(res, social.removeFriend(req.user.id, String(req.body?.userId || ''))));
  r.post('/block', (req, res) => send(res, social.blockUser(req.user.id, String(req.body?.userId || ''))));
  r.post('/unblock', (req, res) => send(res, social.unblockUser(req.user.id, String(req.body?.userId || ''))));
  r.post('/report', (req, res) => send(res, social.createReport(req.user.id, {
    targetUserId: req.body?.userId, worldId: req.body?.worldId, message: req.body?.message, reason: req.body?.reason,
  })));

  // --- Descubrir ------------------------------------------------------------
  r.get('/discover', (req, res) => res.json({
    worlds: worlds.discover(req.user.id, { category: req.query.category, q: req.query.q, playersFor: (k) => rooms.playersFor(k) }),
  }));
  r.post('/favorites/:id', (req, res) => send(res, worlds.toggleFavorite(req.user.id, req.params.id)));

  // --- Proyectos del editor -------------------------------------------------
  r.get('/worlds/mine', (req, res) => res.json({ worlds: worlds.listMyWorlds(req.user.id) }));
  r.post('/worlds', (req, res) => send(res, worlds.createWorld(req.user.id, req.body?.name)));
  r.get('/worlds/:id', (req, res) => send(res, worlds.loadProject(req.user.id, req.params.id)));
  r.put('/worlds/:id', express.json({ limit: '1mb' }), (req, res) => send(res, worlds.saveProject(req.user.id, req.params.id, req.body?.data, { name: req.body?.name, cover: req.body?.cover })));
  r.post('/worlds/:id/publish', (req, res) => send(res, worlds.publishWorld(req.user.id, req.params.id, req.body || {})));
  r.post('/worlds/:id/unpublish', (req, res) => send(res, worlds.unpublishWorld(req.user.id, req.params.id)));
  r.delete('/worlds/:id', (req, res) => send(res, worlds.deleteWorld(req.user.id, req.params.id)));

  // --- Moderación (solo administradores) -----------------------------------
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Solo moderadores' }));
  r.get('/admin/reports', admin, (req, res) => {
    const rows = getDb().prepare(`SELECT r.*, ru.username AS reporter, tu.username AS target, w.name AS world_name
      FROM reports r LEFT JOIN users ru ON ru.id = r.reporter_id LEFT JOIN users tu ON tu.id = r.target_user_id LEFT JOIN worlds w ON w.id = r.world_id
      WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 100`).all();
    res.json({ reports: rows });
  });
  r.post('/admin/reports/:id/resolve', admin, (req, res) => {
    getDb().prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").run(Number(req.params.id));
    res.json({ ok: true });
  });
  r.post('/admin/users/:id/ban', admin, (req, res) => {
    const hours = Math.max(0, Math.min(24 * 365, Number(req.body?.hours) || 24));
    getDb().prepare('UPDATE users SET banned_until = ? WHERE id = ?').run(Date.now() + hours * 3600_000, req.params.id);
    getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
    presence.disconnectUser(req.params.id, 'Cuenta suspendida por moderación');
    res.json({ ok: true });
  });
  r.post('/admin/users/:id/mute', admin, (req, res) => {
    const minutes = Math.max(0, Math.min(60 * 24 * 30, Number(req.body?.minutes) || 60));
    getDb().prepare('UPDATE users SET chat_muted_until = ? WHERE id = ?').run(Date.now() + minutes * 60_000, req.params.id);
    presence.emit(req.params.id, 'toast', { text: `Un moderador ha silenciado tu chat durante ${minutes} min`, kind: 'warn' });
    res.json({ ok: true });
  });
  r.post('/admin/worlds/:id/hide', admin, (req, res) => {
    getDb().prepare('UPDATE worlds SET hidden = ? WHERE id = ?').run(req.body?.hidden === false ? 0 : 1, req.params.id);
    res.json({ ok: true });
  });

  return r;
}
