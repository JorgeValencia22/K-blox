// Mundos de usuarios: proyectos del editor, publicación, catálogo y favoritos.
import { getDb } from '../db/database.js';
import { newId } from '../security/passwords.js';
import { validateUserWorld, cleanText, newEmptyWorld } from '../../shared/worldSchema.js';
import { CATEGORIES, LIMITS } from '../../shared/constants.js';
import { EXPERIENCES, BUILTIN_IDS } from '../../shared/catalog.js';
import { unlockAchievement, getInventory } from './users.js';

const CAT_IDS = CATEGORIES.map((c) => c.id);
const MAX_PROJECTS = 30;

function validCover(cover) {
  if (typeof cover !== 'string') return null;
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(cover)) return null;
  if (cover.length > LIMITS.coverMaxBytes) return null;
  return cover;
}

function rowSummary(r, owner) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    visibility: r.visibility,
    maxPlayers: r.max_players,
    cover: r.cover,
    version: r.version,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
    published: !!r.published_data,
    hidden: !!r.hidden,
    visits: r.visits,
    creator: owner ?? r.owner_name,
    ownerId: r.owner_id,
  };
}

export function listMyWorlds(userId) {
  return getDb().prepare('SELECT w.*, u.username AS owner_name FROM worlds w JOIN users u ON u.id = w.owner_id WHERE owner_id = ? ORDER BY updated_at DESC')
    .all(userId).map((r) => rowSummary(r));
}

export function getWorldRow(id) {
  return getDb().prepare('SELECT w.*, u.username AS owner_name FROM worlds w JOIN users u ON u.id = w.owner_id WHERE w.id = ?').get(String(id));
}

export function createWorld(userId, name) {
  const db = getDb();
  const n = db.prepare('SELECT COUNT(*) AS n FROM worlds WHERE owner_id = ?').get(userId).n;
  if (n >= MAX_PROJECTS) return { error: `Máximo ${MAX_PROJECTS} proyectos` };
  const id = newId();
  const now = Date.now();
  db.prepare('INSERT INTO worlds (id, owner_id, name, data, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(id, userId, cleanText(name, LIMITS.worldNameMax) || 'Mi mundo', JSON.stringify(newEmptyWorld()), now, now);
  return { id };
}

export function loadProject(userId, id) {
  const r = getWorldRow(id);
  if (!r || r.owner_id !== userId) return { error: 'Proyecto no encontrado' };
  return { world: rowSummary(r), data: JSON.parse(r.data) };
}

export function saveProject(userId, id, data, meta = {}) {
  const r = getWorldRow(id);
  if (!r || r.owner_id !== userId) return { error: 'Proyecto no encontrado' };
  const v = validateUserWorld(data, { owned: getInventory(userId) });
  if (!v.ok) return { error: v.error };
  const name = cleanText(meta.name ?? r.name, LIMITS.worldNameMax) || r.name;
  const cover = meta.cover !== undefined ? validCover(meta.cover) ?? r.cover : r.cover;
  getDb().prepare('UPDATE worlds SET data = ?, name = ?, cover = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(v.world), name, cover, Date.now(), id);
  return { ok: true, objects: v.world.objects.length };
}

export function publishWorld(userId, id, meta) {
  const r = getWorldRow(id);
  if (!r || r.owner_id !== userId) return { error: 'Proyecto no encontrado' };
  if (r.hidden) return { error: 'Este mundo fue ocultado por moderación' };
  const data = JSON.parse(r.data);
  if (!data.objects.some((o) => o.t === 'spawn')) return { error: 'Añade al menos un punto de aparición antes de publicar' };
  const name = cleanText(meta.name, LIMITS.worldNameMax);
  if (name.length < 3) return { error: 'El nombre debe tener al menos 3 caracteres' };
  const description = cleanText(meta.description, LIMITS.worldDescMax);
  const category = CAT_IDS.includes(meta.category) ? meta.category : 'adventure';
  const visibility = meta.visibility === 'public' ? 'public' : 'private';
  const maxPlayers = Math.max(1, Math.min(30, parseInt(meta.maxPlayers, 10) || 12));
  const cover = validCover(meta.cover) ?? r.cover;
  const now = Date.now();
  getDb().prepare(`UPDATE worlds SET name = ?, description = ?, category = ?, visibility = ?, max_players = ?, cover = ?,
      published_data = data, version = version + 1, published_at = ?, updated_at = ? WHERE id = ?`)
    .run(name, description, category, visibility, maxPlayers, cover, now, now, id);
  unlockAchievement(userId, 'builder');
  return { ok: true, version: r.version + 1 };
}

export function unpublishWorld(userId, id) {
  const r = getWorldRow(id);
  if (!r || r.owner_id !== userId) return { error: 'Proyecto no encontrado' };
  getDb().prepare('UPDATE worlds SET published_data = NULL WHERE id = ?').run(id);
  return { ok: true };
}

export function deleteWorld(userId, id) {
  const r = getWorldRow(id);
  if (!r || r.owner_id !== userId) return { error: 'Proyecto no encontrado' };
  getDb().prepare('DELETE FROM worlds WHERE id = ?').run(id);
  getDb().prepare('DELETE FROM favorites WHERE world_id = ?').run(id);
  return { ok: true };
}

/** ¿Puede `userId` jugar el mundo publicado `id`? Devuelve la fila o null. */
export function playableWorld(userId, id, { isAdmin = false } = {}) {
  const r = getWorldRow(id);
  if (!r || !r.published_data) return null;
  if (r.hidden && !isAdmin && r.owner_id !== userId) return null;
  return r;
}

export function incrementVisits(id) {
  getDb().prepare('UPDATE worlds SET visits = visits + 1 WHERE id = ?').run(id);
}

/** Catálogo combinado: experiencias oficiales + mundos públicos de la comunidad. */
export function discover(userId, { category, q, playersFor }) {
  const db = getDb();
  const favs = new Set(db.prepare('SELECT world_id FROM favorites WHERE user_id = ?').all(userId).map((r) => r.world_id));
  const official = EXPERIENCES.map((e) => ({
    id: e.id, name: e.name, description: e.description, category: e.category, creator: e.creator, maxPlayers: e.maxPlayers,
    cover: null, coverStyle: e.cover, official: true, players: playersFor(e.id), favorite: favs.has(e.id), isNew: !!e.isNew,
  }));
  const rows = db.prepare(`SELECT w.*, u.username AS owner_name FROM worlds w JOIN users u ON u.id = w.owner_id
     WHERE w.published_data IS NOT NULL AND w.hidden = 0 AND (w.visibility = 'public' OR w.owner_id = ?) ORDER BY w.visits DESC, w.published_at DESC LIMIT 100`).all(userId);
  const community = rows.map((r) => ({ ...rowSummary(r), official: false, players: playersFor(r.id), favorite: favs.has(r.id) }));
  let all = [...official, ...community];
  if (category && CAT_IDS.includes(category)) all = all.filter((w) => w.category === category);
  if (q) {
    const s = String(q).toLowerCase().slice(0, 40);
    all = all.filter((w) => w.name.toLowerCase().includes(s) || String(w.creator).toLowerCase().includes(s));
  }
  return all;
}

export function toggleFavorite(userId, worldId) {
  worldId = String(worldId);
  if (!BUILTIN_IDS.includes(worldId) && !getWorldRow(worldId)) return { error: 'Mundo no encontrado' };
  const db = getDb();
  const has = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND world_id = ?').get(userId, worldId);
  if (has) db.prepare('DELETE FROM favorites WHERE user_id = ? AND world_id = ?').run(userId, worldId);
  else db.prepare('INSERT INTO favorites (user_id, world_id, created_at) VALUES (?,?,?)').run(userId, worldId, Date.now());
  return { ok: true, favorite: !has };
}
