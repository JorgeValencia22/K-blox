// Usuarios, sesiones, inventario, progresión y logros.
import { getDb, tx } from '../db/database.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword, newToken, hashToken, newId } from '../security/passwords.js';
import { DEFAULT_AVATAR, sanitizeAvatar } from '../../shared/avatar.js';
import { ACH_BY_ID, FREE_ITEMS, SHOP_BY_ID, levelFromXp, xpForLevel, LEVEL_REWARD_COINS } from '../../shared/catalog.js';
import { LIMITS } from '../../shared/constants.js';
import { presence } from '../realtime/presence.js';

const USERNAME_RE = /^[A-Za-z0-9_]+$/;
const DAY = 86_400_000;

export function validateCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return 'Datos inválidos';
  if (username.length < LIMITS.usernameMin || username.length > LIMITS.usernameMax) {
    return `El nombre debe tener entre ${LIMITS.usernameMin} y ${LIMITS.usernameMax} caracteres`;
  }
  if (!USERNAME_RE.test(username)) return 'El nombre solo puede contener letras, números y _';
  if (password.length < LIMITS.passwordMin || password.length > LIMITS.passwordMax) {
    return `La contraseña debe tener entre ${LIMITS.passwordMin} y ${LIMITS.passwordMax} caracteres`;
  }
  return null;
}

const parse = (s, d) => {
  try {
    return JSON.parse(s);
  } catch {
    return d;
  }
};

function rowToUser(r) {
  if (!r) return null;
  return { ...r, avatar: parse(r.avatar, DEFAULT_AVATAR), stats: parse(r.stats, {}) };
}

export function getUser(id) {
  return rowToUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

export function getUserByName(name) {
  return rowToUser(getDb().prepare('SELECT * FROM users WHERE username = ?').get(String(name)));
}

export async function createUser(username, password) {
  const err = validateCredentials(username, password);
  if (err) return { error: err };
  if (getUserByName(username)) return { error: 'Ese nombre de usuario ya existe' };
  const passHash = await hashPassword(password);
  const id = newId();
  const now = Date.now();
  const role = config.adminUsernames.includes(username.toLowerCase()) ? 'admin' : 'user';
  try {
    tx((db) => {
      db.prepare('INSERT INTO users (id, username, pass_hash, role, coins, avatar, stats, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, username, passHash, role, config.startingCoins, JSON.stringify(DEFAULT_AVATAR), '{}', now, now);
      const ins = db.prepare('INSERT INTO inventory (user_id, item_id, acquired_at) VALUES (?,?,?)');
      for (const item of FREE_ITEMS) ins.run(id, item, now);
    });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return { error: 'Ese nombre de usuario ya existe' };
    throw e;
  }
  return { user: getUser(id) };
}

export async function checkLogin(username, password) {
  const u = getUserByName(username);
  // Se ejecuta el hash aunque no exista para no revelar qué usuarios existen por tiempo de respuesta.
  const ok = await verifyPassword(String(password ?? ''), u ? u.pass_hash : 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(88));
  return ok && u ? u : null;
}

// --- Sesiones --------------------------------------------------------------
export function createSession(userId) {
  const token = newToken();
  const now = Date.now();
  getDb().prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(hashToken(token), userId, now, now + config.sessionDays * DAY);
  return token;
}

export function userFromToken(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const db = getDb();
  const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(hashToken(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    return null;
  }
  const u = getUser(row.user_id);
  if (!u) return null;
  return u;
}

export function deleteSession(token) {
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(String(token)));
}

export function isBanned(u) {
  return u.banned_until > Date.now();
}

export function touch(userId) {
  getDb().prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), userId);
}

// --- Perfiles --------------------------------------------------------------
export function publicProfile(u) {
  return {
    id: u.id,
    username: u.username,
    level: u.level,
    avatar: u.avatar,
    createdAt: u.created_at,
    online: presence.isOnline(u.id),
    stats: { gamesPlayed: u.stats.gamesPlayed || 0, wins: u.stats.wins || 0 },
  };
}

export function getInventory(userId) {
  return new Set(getDb().prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(userId).map((r) => r.item_id));
}

export function getAchievements(userId) {
  return getDb().prepare('SELECT ach_id, unlocked_at FROM achievements WHERE user_id = ?').all(userId)
    .map((r) => ({ id: r.ach_id, at: r.unlocked_at }));
}

export function privateProfile(u) {
  const db = getDb();
  return {
    ...publicProfile(u),
    role: u.role,
    xp: u.xp,
    coins: u.coins,
    xpLevelStart: xpForLevel(u.level),
    xpNextLevel: xpForLevel(u.level + 1),
    stats: u.stats,
    inventory: [...getInventory(u.id)],
    achievements: getAchievements(u.id),
    favorites: db.prepare('SELECT world_id FROM favorites WHERE user_id = ?').all(u.id).map((r) => r.world_id),
    history: db.prepare('SELECT world_id, world_name, started_at, ended_at, result FROM history WHERE user_id = ? ORDER BY started_at DESC LIMIT 20').all(u.id),
    newAccount: Date.now() - u.created_at < config.newAccountMinutes * 60_000,
  };
}

export function saveAvatar(userId, avatar) {
  const clean = sanitizeAvatar(avatar, getInventory(userId));
  getDb().prepare('UPDATE users SET avatar = ? WHERE id = ?').run(JSON.stringify(clean), userId);
  return clean;
}

// --- Economía ---------------------------------------------------------------
export function buyItem(userId, itemId) {
  const item = SHOP_BY_ID[itemId];
  if (!item) return { error: 'Objeto desconocido' };
  const result = tx((db) => {
    const u = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
    if (!u) return { error: 'Usuario no encontrado' };
    if (db.prepare('SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?').get(userId, itemId)) return { error: 'Ya tienes este objeto' };
    if (u.coins < item.price) return { error: 'No tienes suficientes K-Coins' };
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(item.price, userId);
    db.prepare('INSERT INTO inventory (user_id, item_id, acquired_at) VALUES (?,?,?)').run(userId, itemId, Date.now());
    return { ok: true, coins: u.coins - item.price };
  });
  if (result.ok) {
    updateStats(userId, (s) => { s.itemsBought = (s.itemsBought || 0) + 1; });
    unlockAchievement(userId, 'shopper');
  }
  return result;
}

// --- Progresión -------------------------------------------------------------
export function updateStats(userId, fn) {
  const u = getUser(userId);
  if (!u) return null;
  const stats = u.stats || {};
  fn(stats);
  getDb().prepare('UPDATE users SET stats = ? WHERE id = ?').run(JSON.stringify(stats), userId);
  return stats;
}

/**
 * Concede experiencia y monedas. Toda recompensa pasa por aquí para que el
 * nivel, las recompensas de nivel y las notificaciones sean coherentes.
 */
export function award(userId, { xp = 0, coins = 0, reason = '' }) {
  xp = Math.max(0, Math.floor(xp));
  coins = Math.max(0, Math.floor(coins));
  const res = tx((db) => {
    const u = db.prepare('SELECT xp, level, coins FROM users WHERE id = ?').get(userId);
    if (!u) return null;
    const newXp = u.xp + xp;
    const newLevel = levelFromXp(newXp);
    let bonus = 0;
    for (let l = u.level + 1; l <= newLevel; l++) bonus += LEVEL_REWARD_COINS(l);
    db.prepare('UPDATE users SET xp = ?, level = ?, coins = coins + ? WHERE id = ?').run(newXp, newLevel, coins + bonus, userId);
    return { xp: newXp, level: newLevel, coins: u.coins + coins + bonus, leveledUp: newLevel > u.level, bonus };
  });
  if (!res) return null;
  presence.emit(userId, 'progress', {
    xp: res.xp, level: res.level, coins: res.coins,
    xpLevelStart: xpForLevel(res.level), xpNextLevel: xpForLevel(res.level + 1),
    gainedXp: xp, gainedCoins: coins + res.bonus, reason, leveledUp: res.leveledUp,
  });
  if (res.level >= 5) unlockAchievement(userId, 'level5');
  return res;
}

export function unlockAchievement(userId, achId) {
  const ach = ACH_BY_ID[achId];
  if (!ach) return false;
  const r = getDb().prepare('INSERT OR IGNORE INTO achievements (user_id, ach_id, unlocked_at) VALUES (?,?,?)').run(userId, achId, Date.now());
  if (r.changes === 0) return false;
  presence.emit(userId, 'achievement', { id: ach.id, name: ach.name, desc: ach.desc, reward: ach.reward });
  award(userId, { xp: 50, coins: ach.reward, reason: `Logro: ${ach.name}` });
  return true;
}

/**
 * Recompensa limitada por día (p. ej. monedas por pasar tiempo en Hangout).
 * Devuelve la cantidad realmente concedida.
 */
export function dailyCapped(userId, key, amount, cap) {
  const day = new Date().toISOString().slice(0, 10);
  return tx((db) => {
    const row = db.prepare('SELECT amount FROM daily_rewards WHERE user_id = ? AND key = ? AND day = ?').get(userId, key, day);
    const used = row ? row.amount : 0;
    const give = Math.max(0, Math.min(amount, cap - used));
    if (give > 0) {
      db.prepare('INSERT INTO daily_rewards (user_id, key, day, amount) VALUES (?,?,?,?) ON CONFLICT(user_id, key, day) DO UPDATE SET amount = amount + ?')
        .run(userId, key, day, give, give);
    }
    return give;
  });
}

// --- Historial ---------------------------------------------------------------
export function startHistory(userId, worldId, worldName) {
  const r = getDb().prepare('INSERT INTO history (user_id, world_id, world_name, started_at) VALUES (?,?,?,?)').run(userId, worldId, worldName, Date.now());
  return Number(r.lastInsertRowid);
}

export function endHistory(historyId, result = null) {
  getDb().prepare('UPDATE history SET ended_at = ?, result = COALESCE(?, result) WHERE id = ?').run(Date.now(), result, historyId);
}

export function setHistoryResult(historyId, result) {
  getDb().prepare('UPDATE history SET result = ? WHERE id = ?').run(result, historyId);
}
