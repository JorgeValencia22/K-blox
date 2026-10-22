// Skins creadas por el desarrollador desde el juego: trajes completos y conjuntos a la venta.
// Se guardan en la base de datos y se añaden al catálogo de la tienda (registerCustomItems).
import crypto from 'node:crypto';
import { getDb } from '../db/database.js';
import { SHOP_BY_ID, registerCustomItems } from '../../shared/catalog.js';
import { cleanCostume, cleanOutfit, COSTUME_LIMITS } from '../../shared/skins.js';

const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, COSTUME_LIMITS.nameMax);
const MAX_ITEMS = 200;

export function listCustomItems() {
  return getDb().prepare('SELECT id, type, data FROM custom_items ORDER BY created_at').all()
    .map((r) => ({ id: r.id, type: r.type, ...JSON.parse(r.data) }));
}

export function loadCustomItems() {
  registerCustomItems(listCustomItems());
}

/** Crea o actualiza una skin. item: { id?, type: 'costume'|'outfit', name, price, rare, costume|outfit } */
export function saveCustomItem(userId, username, item) {
  if (!item || !['costume', 'outfit'].includes(item.type)) return { error: 'Tipo de skin no válido' };
  const name = cleanName(item.name);
  if (!name) return { error: 'Ponle un nombre' };
  const price = Math.floor(Number(item.price));
  if (!(price >= COSTUME_LIMITS.priceMin && price <= COSTUME_LIMITS.priceMax)) return { error: `El precio debe estar entre ${COSTUME_LIMITS.priceMin} y ${COSTUME_LIMITS.priceMax} KC` };
  const data = { name, price, rare: !!item.rare, by: username };
  if (item.type === 'costume') {
    const c = cleanCostume(item.costume);
    if (c.error) return c;
    data.costume = c;
  } else {
    const o = cleanOutfit(item.outfit, (id) => SHOP_BY_ID[id]);
    if (o.error) return o;
    data.outfit = o;
  }
  const db = getDb();
  let id = typeof item.id === 'string' && /^cx_[a-z0-9]{6,12}$/.test(item.id) ? item.id : null;
  const exists = id && db.prepare('SELECT type FROM custom_items WHERE id = ?').get(id);
  if (exists && exists.type !== item.type) return { error: 'No se puede cambiar el tipo de una skin ya creada' };
  if (!exists) {
    if (db.prepare('SELECT COUNT(*) AS n FROM custom_items').get().n >= MAX_ITEMS) return { error: `Máximo ${MAX_ITEMS} skins` };
    id = `cx_${crypto.randomBytes(5).toString('hex')}`;
  }
  db.prepare(`INSERT INTO custom_items (id, type, data, created_by, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data`).run(id, item.type, JSON.stringify(data), userId, Date.now());
  loadCustomItems();
  return { ok: true, item: { id, type: item.type, ...data }, items: listCustomItems() };
}

/**
 * Retira una skin de la tienda (o la vuelve a poner). No se borra: quien ya la compró la sigue
 * teniendo y puede ponérsela.
 */
export function retireCustomItem(id, retired = true) {
  const db = getDb();
  const row = db.prepare('SELECT data FROM custom_items WHERE id = ?').get(String(id));
  if (!row) return { error: 'Skin no encontrada' };
  const data = { ...JSON.parse(row.data), retired: !!retired };
  db.prepare('UPDATE custom_items SET data = ? WHERE id = ?').run(JSON.stringify(data), String(id));
  loadCustomItems();
  return { ok: true, items: listCustomItems() };
}
