// Compra de Kesty Coins con dinero real a través de Microsoft Store.
// Cada paquete de monedas es un "complemento" consumible administrado por el desarrollador de la
// app en Partner Center. Microsoft cobra; el servidor comprueba la compra con la API de colecciones
// de Microsoft Store, la marca como entregada (consume) y suma las monedas. Nada se fía del cliente.
//
// Variables de entorno (panel de Render, nunca en el código):
//   MS_STORE_TENANT_ID, MS_STORE_CLIENT_ID, MS_STORE_CLIENT_SECRET  → aplicación de Microsoft Entra ID
//                                                                     asociada a la app en Partner Center
//   MS_STORE_PRODUCTS (opcional) → "9NXXXXXXXXXX=kc_100,9NYYYYYYYYYY=kc_500" si no están en catalog.js
import crypto from 'node:crypto';
import { getDb, tx } from '../db/database.js';
import { COIN_PACKS } from '../../shared/catalog.js';
import { award, getUser } from './users.js';

const env = () => ({
  tenant: process.env.MS_STORE_TENANT_ID || '',
  client: process.env.MS_STORE_CLIENT_ID || '',
  secret: process.env.MS_STORE_CLIENT_SECRET || '',
});
export const msStoreEnabled = () => { const e = env(); return !!(e.tenant && e.client && e.secret); };

/** Pack de monedas que corresponde a un complemento (por su Store ID o por su id de producto). */
function packFor(productId) {
  const extra = Object.fromEntries((process.env.MS_STORE_PRODUCTS || '').split(',').map((s) => s.trim().split('=')).filter((p) => p.length === 2));
  const id = extra[productId] || productId;
  return COIN_PACKS.find((p) => p.id === id || p.storeId === productId) || null;
}

// --- Tokens de Microsoft Entra ID (se reutilizan hasta poco antes de caducar) ------------------
const tokens = new Map();
async function aadToken(resource) {
  const c = tokens.get(resource);
  if (c && c.exp > Date.now() + 120_000) return c.token;
  const e = env();
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(e.tenant)}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: e.client, client_secret: e.secret, resource }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Microsoft no ha dado acceso (${j.error || r.status})`);
  tokens.set(resource, { token: j.access_token, exp: Number(j.expires_on) * 1000 || Date.now() + 3000_000 });
  return j.access_token;
}

const isGuest = (u) => /^Invitado_/.test(u?.username || '');

/** Ticket para que la app (KestStore.exe) pida a Windows la clave de colecciones del comprador. */
export async function purchaseTicket(userId) {
  if (!msStoreEnabled()) return { error: 'Las compras todavía no están activadas en este servidor' };
  if (isGuest(getUser(userId))) return { error: 'Crea tu cuenta (o inicia sesión) antes de comprar, para no perder las monedas' };
  return { ticket: await aadToken('https://onestore.microsoft.com/b2b/keys/create/collections'), userId };
}

async function collections(path, body) {
  const r = await fetch(`https://collections.mp.microsoft.com/v6.0/collections/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await aadToken('https://onestore.microsoft.com')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Microsoft Store respondió ${r.status}${j.code ? ` (${j.code})` : ''}`);
  return j;
}

/**
 * Entrega las compras pendientes del jugador: busca en su colección de Microsoft Store los
 * paquetes de monedas comprados y aún sin entregar, los consume y suma las monedas.
 * Si algo falla a medias, la compra sigue pendiente y se entrega en el siguiente intento
 * (el trackingId se reutiliza, así Microsoft no la consume dos veces).
 */
export async function redeemPurchases(userId, key) {
  if (!msStoreEnabled()) return { error: 'Las compras todavía no están activadas en este servidor' };
  if (typeof key !== 'string' || key.length < 20 || key.length > 8000) return { error: 'Clave de compra no válida' };
  const beneficiary = { identityType: 'b2b', identityValue: key, localTicketReference: userId };
  const res = await collections('query', { beneficiaries: [beneficiary], productTypes: ['UnmanagedConsumable'], validityType: 'Valid', maxPageSize: 100 });
  const db = getDb();
  let coins = 0;
  const granted = [];
  for (const item of res.items || []) {
    const pack = packFor(item.productId);
    if (!pack) continue;
    let row = db.prepare("SELECT tracking_id FROM coin_purchases WHERE user_id = ? AND product_id = ? AND status = 'pending'").get(userId, item.productId);
    if (!row) {
      row = { tracking_id: crypto.randomUUID() };
      db.prepare("INSERT INTO coin_purchases (tracking_id, user_id, store, product_id, pack_id, coins, status, created_at) VALUES (?, ?, 'microsoft', ?, ?, ?, 'pending', ?)")
        .run(row.tracking_id, userId, item.productId, pack.id, pack.coins, Date.now());
    }
    await collections('consume', { beneficiary, productId: item.productId, trackingId: row.tracking_id });
    const done = tx((d) => Number(d.prepare("UPDATE coin_purchases SET status = 'done' WHERE tracking_id = ? AND status = 'pending'").run(row.tracking_id).changes));
    if (done) {
      award(userId, { coins: pack.coins, raw: true, reason: `Compra: ${pack.coins} Kesty Coins` });
      coins += pack.coins;
      granted.push(pack.id);
    }
  }
  return { ok: true, coins, granted };
}

/** Compras del jugador (para su historial). */
export function listPurchases(userId) {
  return getDb().prepare("SELECT pack_id, coins, status, created_at FROM coin_purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(userId);
}
