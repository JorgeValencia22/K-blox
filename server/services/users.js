// Usuarios, sesiones, inventario, progresión y logros.
import { getDb, tx } from '../db/database.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword, newToken, hashToken, newId } from '../security/passwords.js';
import { DEFAULT_AVATAR, sanitizeAvatar } from '../../shared/avatar.js';
import { ACH_BY_ID, FREE_ITEMS, SHOP_BY_ID, levelFromXp, xpForLevel, LEVEL_REWARD_COINS } from '../../shared/catalog.js';
import { LIMITS } from '../../shared/constants.js';
import { presence } from '../realtime/presence.js';

const USERNAME_RE = /^[A-Za-z0-9_]+$/;
/** Fracción de las monedas de recompensa que se concede realmente (economía escasa). */
export const COIN_RATE = 0.5;
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
    rewards: rewardsStatus(u),
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
    if (u.coins < item.price) return { error: 'No tienes suficientes Kesty Coins' };
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
export function award(userId, { xp = 0, coins = 0, reason = '', raw = false }) {
  xp = Math.max(0, Math.floor(xp));
  // Las monedas que se ganan jugando son escasas (COIN_RATE); los regalos (raw) se dan enteros.
  coins = Math.max(0, Math.floor(raw ? coins : coins * COIN_RATE));
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

// --- Cuenta del dueño (modo desarrollador) -----------------------------------
/**
 * Crea o actualiza la cuenta del dueño a partir de OWNER_USERNAME / OWNER_PASSWORD.
 * La contraseña solo vive en el entorno (.env o panel del hosting) y en la BD como hash.
 */
export async function ensureOwner() {
  const name = config.ownerUsername;
  if (!name || !config.ownerPassword) return null;
  if (!USERNAME_RE.test(name)) {
    console.warn('[dueño] OWNER_USERNAME no es válido');
    return null;
  }
  const db = getDb();
  let u = getUserByName(name);
  if (!u) {
    const r = await createUser(name, config.ownerPassword.padEnd(LIMITS.passwordMin, '_').slice(0, LIMITS.passwordMax));
    if (r.error) return null;
    u = r.user;
  }
  const passHash = await hashPassword(config.ownerPassword);
  db.prepare("UPDATE users SET pass_hash = ?, role = 'admin', banned_until = 0 WHERE id = ?").run(passHash, u.id);
  return getUser(u.id);
}

export function isOwnerName(name) {
  return !!config.ownerUsername && String(name).toLowerCase() === config.ownerUsername.toLowerCase();
}

// --- Recompensa diaria, ruleta y códigos regalo --------------------------------
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - DAY).toISOString().slice(0, 10);
export const DAILY_REWARDS = [10, 15, 20, 25, 30, 40, 75]; // racha de 7 días
export const SPIN_PRIZES = [
  { coins: 5, w: 30 }, { coins: 10, w: 26 }, { coins: 15, w: 18 }, { coins: 25, w: 12 },
  { coins: 40, w: 8 }, { coins: 75, w: 4 }, { coins: 150, w: 1.5 }, { coins: 300, w: 0.5 },
];

export function rewardsStatus(u) {
  const s = u.stats || {};
  const d = s.daily || {};
  const claimedToday = d.last === today();
  const streak = claimedToday ? d.streak : d.last === yesterday() ? d.streak || 0 : 0;
  return {
    daily: { claimedToday, streak, next: DAILY_REWARDS[Math.min(streak, DAILY_REWARDS.length - 1) % DAILY_REWARDS.length], table: DAILY_REWARDS },
    spin: { available: s.spinDay !== today(), prizes: SPIN_PRIZES.map((p) => p.coins) },
  };
}

export function claimDaily(userId) {
  const u = getUser(userId);
  if (!u) return { error: 'Usuario no encontrado' };
  const st = rewardsStatus(u);
  if (st.daily.claimedToday) return { error: 'Ya has recogido la recompensa de hoy' };
  const streak = st.daily.streak + 1;
  const coins = DAILY_REWARDS[(streak - 1) % DAILY_REWARDS.length];
  updateStats(userId, (s) => { s.daily = { last: today(), streak }; });
  award(userId, { xp: 25, coins, raw: true, reason: `Recompensa diaria (día ${streak})` });
  return { ok: true, coins, streak };
}

export function spinWheel(userId, rnd = Math.random) {
  const u = getUser(userId);
  if (!u) return { error: 'Usuario no encontrado' };
  if (!rewardsStatus(u).spin.available) return { error: 'Ya has girado la ruleta hoy. ¡Vuelve mañana!' };
  const total = SPIN_PRIZES.reduce((a, p) => a + p.w, 0);
  let r = rnd() * total, index = 0;
  for (; index < SPIN_PRIZES.length - 1; index++) {
    r -= SPIN_PRIZES[index].w;
    if (r < 0) break;
  }
  const coins = SPIN_PRIZES[index].coins;
  updateStats(userId, (s) => { s.spinDay = today(); });
  award(userId, { coins, raw: true, reason: 'Ruleta diaria' });
  return { ok: true, index, coins };
}

const CODE_RE = /^[A-Z0-9-]{4,24}$/;
export function createGiftCode(adminId, { code, coins, uses }) {
  code = String(code || '').trim().toUpperCase() || `KEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  if (!CODE_RE.test(code)) return { error: 'Código no válido (4-24 letras, números o -)' };
  coins = Math.floor(Number(coins));
  uses = Math.floor(Number(uses) || 1);
  if (!(coins >= 1 && coins <= 100000)) return { error: 'Cantidad de monedas no válida' };
  if (!(uses >= 1 && uses <= 10000)) return { error: 'Número de usos no válido' };
  try {
    getDb().prepare('INSERT INTO gift_codes (code, coins, uses_left, created_by, created_at) VALUES (?,?,?,?,?)').run(code, coins, uses, adminId, Date.now());
  } catch {
    return { error: 'Ese código ya existe' };
  }
  return { ok: true, code, coins, uses };
}

export function listGiftCodes() {
  return getDb().prepare('SELECT code, coins, uses_left, created_at FROM gift_codes ORDER BY created_at DESC LIMIT 50').all();
}

export function redeemGiftCode(userId, code) {
  code = String(code || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return { error: 'Código no válido' };
  const r = tx((db) => {
    const row = db.prepare('SELECT coins, uses_left FROM gift_codes WHERE code = ?').get(code);
    if (!row || row.uses_left <= 0) return { error: 'Código no válido o agotado' };
    if (db.prepare('SELECT 1 FROM gift_redemptions WHERE code = ? AND user_id = ?').get(code, userId)) return { error: 'Ya has usado este código' };
    db.prepare('UPDATE gift_codes SET uses_left = uses_left - 1 WHERE code = ?').run(code);
    db.prepare('INSERT INTO gift_redemptions (code, user_id, redeemed_at) VALUES (?,?,?)').run(code, userId, Date.now());
    return { ok: true, coins: row.coins };
  });
  if (r.ok) award(userId, { coins: r.coins, raw: true, reason: `Código ${code}` });
  return r;
}

export function giveCoins(userId, amount, reason = 'Regalo del administrador') {
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return { error: 'Cantidad no válida' };
  if (amount > 0) return award(userId, { coins: amount, raw: true, reason }) ? { ok: true } : { error: 'Usuario no encontrado' };
  getDb().prepare('UPDATE users SET coins = MAX(0, coins + ?) WHERE id = ?').run(amount, userId);
  const u = getUser(userId);
  presence.emit(userId, 'progress', { xp: u.xp, level: u.level, coins: u.coins, xpLevelStart: xpForLevel(u.level), xpNextLevel: xpForLevel(u.level + 1), gainedXp: 0, gainedCoins: 0, reason: '' });
  return { ok: true };
}
