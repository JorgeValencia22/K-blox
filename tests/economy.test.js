// Economía escasa, skins (trajes y conjuntos), skins del desarrollador, borrado de saldos y
// compras de Kesty Coins con Microsoft Store (sin configurar: deben quedar desactivadas).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let srv, token, userId, adminToken;
before(async () => {
  srv = await startServer();
  let r = await srv.api('POST', '/api/auth/register', { username: 'Compradora', password: 'secreto1' });
  token = r.body.token;
  userId = r.body.user.id;
  r = await srv.api('POST', '/api/auth/register', { username: 'Jefa', password: 'secreto1' });
  adminToken = r.body.token;
  const { getDb } = await import('../server/db/database.js');
  getDb().prepare("UPDATE users SET role = 'admin' WHERE username = 'Jefa'").run();
});
after(() => srv.close());

const coinsOf = async (t) => (await srv.api('GET', '/api/profile', null, t)).body.user.coins;
const giveCoins = async (n) => { const { getDb } = await import('../server/db/database.js'); getDb().prepare('UPDATE users SET coins = ? WHERE id = ?').run(n, userId); };

test('jugando no se ganan Kesty Coins', async () => {
  const users = await import('../server/services/users.js');
  const c0 = await coinsOf(token);
  users.award(userId, { xp: 10, coins: 50, reason: 'partida' });
  assert.equal(await coinsOf(token), c0);
  users.award(userId, { coins: 30, raw: true, reason: 'código' });
  assert.equal(await coinsOf(token), c0 + 30, 'los regalos sí llegan enteros');
});

test('traje completo: hay que comprarlo para ponérselo', async () => {
  let r = await srv.api('PUT', '/api/avatar', { avatar: { costume: 'skin_robot' } }, token);
  assert.equal(r.body.avatar.costume, null);
  await giveCoins(1000);
  r = await srv.api('POST', '/api/shop/buy', { itemId: 'skin_robot' }, token);
  assert.equal(r.status, 200);
  assert.equal(await coinsOf(token), 202, '1000 - 800 + 2 del logro "De compras"');
  r = await srv.api('PUT', '/api/avatar', { avatar: { costume: 'skin_robot' } }, token);
  assert.equal(r.body.avatar.costume, 'skin_robot');
});

test('conjunto: al comprarlo llegan todas sus prendas', async () => {
  const { SHOP_BY_ID } = await import('../shared/catalog.js');
  const o = SHOP_BY_ID.outfit_cowboy;
  await giveCoins(o.price);
  let r = await srv.api('POST', '/api/shop/buy', { itemId: 'outfit_cowboy' }, token);
  assert.equal(r.status, 200);
  r = await srv.api('PUT', '/api/avatar', { avatar: { ...o.outfit } }, token);
  assert.equal(r.body.avatar.shirt, 'shirt_flannel');
  assert.deepEqual(r.body.avatar.accessories, ['acc_cowboy', 'acc_scarf']);
});

test('skins del desarrollador: solo el admin las crea; retiradas no se venden', async () => {
  const item = { type: 'costume', name: 'Mi Robot', price: 250, costume: { head: 'box', face: 'robot', colors: { body: '#ff0000' }, parts: [{ k: 'antenna', c: '#00ff00' }, { k: 'no_existe' }] } };
  let r = await srv.api('POST', '/api/admin/items', { item }, token);
  assert.equal(r.status, 403);
  r = await srv.api('POST', '/api/admin/items', { item }, adminToken);
  assert.equal(r.status, 200);
  const id = r.body.item.id;
  assert.deepEqual(r.body.item.costume.parts.map((p) => p.k), ['antenna'], 'piezas desconocidas fuera');
  r = await srv.api('GET', '/api/shop/custom', null, token);
  assert.ok(r.body.items.some((i) => i.id === id && i.by === 'Jefa'));
  await giveCoins(300);
  r = await srv.api('POST', '/api/admin/items/' + id + '/retire', {}, adminToken);
  assert.equal(r.status, 200);
  r = await srv.api('POST', '/api/shop/buy', { itemId: id }, token);
  assert.equal(r.status, 400, 'retirada: ya no se vende');
  await srv.api('POST', '/api/admin/items/' + id + '/retire', { retired: false }, adminToken);
  r = await srv.api('POST', '/api/shop/buy', { itemId: id }, token);
  assert.equal(r.status, 200);
  r = await srv.api('PUT', '/api/avatar', { avatar: { costume: id } }, token);
  assert.equal(r.body.avatar.costume, id);
});

test('compras con dinero real: desactivadas sin configurar Microsoft Store', async () => {
  let r = await srv.api('GET', '/api/store/packs', null, token);
  assert.equal(r.body.enabled, false);
  assert.ok(r.body.packs.length >= 3);
  r = await srv.api('POST', '/api/store/ms/ticket', {}, token);
  assert.equal(r.status, 400);
});

test('borrado de la economía: saldo a 0 y fuera lo comprado (una sola vez)', async () => {
  const { runMigrations } = await import('../server/db/migrations.js');
  const { getDb } = await import('../server/db/database.js');
  await giveCoins(777);
  runMigrations();
  assert.equal(await coinsOf(token), 0);
  const p = (await srv.api('GET', '/api/profile', null, token)).body.user;
  assert.equal(p.avatar.costume, null, 'el traje comprado se quita');
  const inv = getDb().prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(userId).map((r) => r.item_id);
  assert.ok(!inv.includes('skin_robot') && !inv.includes('shirt_flannel'));
  assert.ok(inv.includes('shirt_tee'), 'los gratis se quedan');
  await giveCoins(5);
  runMigrations();
  assert.equal(await coinsOf(token), 5, 'no se repite');
});
