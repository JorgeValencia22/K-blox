// Cambios de datos que se aplican una sola vez (quedan anotados en la tabla meta, que también va
// en la copia de seguridad, así que no se repiten al recuperar la copia).
import { getDb, tx } from './database.js';
import { SHOP_BY_ID } from '../../shared/catalog.js';
import { sanitizeAvatar } from '../../shared/avatar.js';

const MIGRATIONS = [
  {
    // Nueva economía escasa (como Roblox): todos empiezan de cero. Se quitan las Kesty Coins de
    // todas las cuentas y los objetos que se compraron con ellas; se conservan los gratuitos y
    // los que se ganan jugando (logros, Turno de Noche, Fábrica Feliz…).
    id: 'economy-reset-2026-10',
    run(db) {
      const bought = db.prepare('SELECT DISTINCT item_id FROM inventory').all().map((r) => r.item_id)
        .filter((id) => { const it = SHOP_BY_ID[id]; return !it || (it.price > 0 && !it.unlock); });
      const delItem = db.prepare('DELETE FROM inventory WHERE item_id = ?');
      let items = 0;
      for (const id of bought) items += Number(delItem.run(id).changes);
      const coins = Number(db.prepare('UPDATE users SET coins = 0').run().changes);
      // Avatares y conjuntos guardados: lo que ya no se tiene vuelve a lo básico
      const inv = db.prepare('SELECT item_id FROM inventory WHERE user_id = ?');
      const setAvatar = db.prepare('UPDATE users SET avatar = ? WHERE id = ?');
      for (const u of db.prepare('SELECT id, avatar FROM users').all()) {
        let a = {};
        try { a = JSON.parse(u.avatar); } catch { /* avatar roto: valores por defecto */ }
        const owned = new Set(inv.all(u.id).map((r) => r.item_id));
        setAvatar.run(JSON.stringify(sanitizeAvatar(a, owned)), u.id);
      }
      const setPreset = db.prepare('UPDATE avatar_presets SET avatar = ? WHERE user_id = ? AND name = ?');
      for (const p of db.prepare('SELECT user_id, name, avatar FROM avatar_presets').all()) {
        let a = {};
        try { a = JSON.parse(p.avatar); } catch { /* sin datos */ }
        setPreset.run(JSON.stringify(sanitizeAvatar(a, new Set(inv.all(p.user_id).map((r) => r.item_id)))), p.user_id, p.name);
      }
      return `saldo a 0 en ${coins} cuentas, ${items} objetos comprados retirados`;
    },
  },
];

export function runMigrations() {
  const db = getDb();
  for (const m of MIGRATIONS) {
    if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(`migration:${m.id}`)) continue;
    const msg = tx((d) => {
      const r = m.run(d);
      d.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(`migration:${m.id}`, JSON.stringify({ at: Date.now(), result: r }));
      return r;
    });
    console.log(`  [datos] ${m.id}: ${msg}`);
  }
}
