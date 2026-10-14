// Conjuntos de avatar guardados con nombre y emotes personalizados del admin.
import crypto from 'node:crypto';
import { getDb } from '../db/database.js';
import { sanitizeAvatar } from '../../shared/avatar.js';
import { cleanEmote, EMOTE_LIMITS } from '../../shared/emotes.js';
import { getInventory } from './users.js';

export const MAX_PRESETS = 12;
const presetName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);

// --- Conjuntos (presets) -----------------------------------------------------------
export function listPresets(userId) {
  return getDb().prepare('SELECT name, avatar FROM avatar_presets WHERE user_id = ? ORDER BY created_at').all(userId)
    .map((r) => ({ name: r.name, avatar: JSON.parse(r.avatar) }));
}

/** Guarda (o sobrescribe si ya existe con ese nombre) un conjunto. */
export function savePreset(userId, name, avatar) {
  name = presetName(name);
  if (!name) return { error: 'Ponle un nombre al conjunto' };
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM avatar_presets WHERE user_id = ? AND name = ?').get(userId, name);
  if (!exists) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM avatar_presets WHERE user_id = ?').get(userId).n;
    if (n >= MAX_PRESETS) return { error: `Máximo ${MAX_PRESETS} conjuntos: borra alguno` };
  }
  const clean = sanitizeAvatar(avatar, getInventory(userId));
  db.prepare(`INSERT INTO avatar_presets (user_id, name, avatar, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, name) DO UPDATE SET avatar = excluded.avatar`).run(userId, name, JSON.stringify(clean), Date.now());
  return { ok: true, presets: listPresets(userId) };
}

export function deletePreset(userId, name) {
  getDb().prepare('DELETE FROM avatar_presets WHERE user_id = ? AND name = ?').run(userId, presetName(name));
  return { ok: true, presets: listPresets(userId) };
}

// --- Emotes personalizados -----------------------------------------------------------
export function listEmotes() {
  return getDb().prepare('SELECT id, data FROM custom_emotes ORDER BY created_at').all()
    .map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
}

/** Crea o actualiza un emote. Si llega un id válido se conserva (permite restaurar copias). */
export function saveEmote(userId, emote) {
  const clean = cleanEmote(emote);
  if (clean.error) return clean;
  const db = getDb();
  let id = typeof emote.id === 'string' && /^[a-z0-9]{4,16}$/.test(emote.id) ? emote.id : null;
  const exists = id && db.prepare('SELECT 1 FROM custom_emotes WHERE id = ?').get(id);
  if (!exists) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM custom_emotes').get().n;
    if (n >= EMOTE_LIMITS.maxEmotes) return { error: `Máximo ${EMOTE_LIMITS.maxEmotes} emotes` };
    id = id || crypto.randomBytes(5).toString('hex');
  }
  db.prepare(`INSERT INTO custom_emotes (id, data, created_by, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data`).run(id, JSON.stringify(clean), userId, Date.now());
  return { ok: true, emote: { id, ...clean }, emotes: listEmotes() };
}

export function deleteEmote(id) {
  getDb().prepare('DELETE FROM custom_emotes WHERE id = ?').run(String(id));
  return { ok: true, emotes: listEmotes() };
}
