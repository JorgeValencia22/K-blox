// Pruebas de Guerra Galáctica: campaña de un jugador. El servidor solo valida el inicio y el final
// (tiempo mínimo) y entrega los premios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit } from './helpers.js';
import { buildGalaxia } from '../shared/worlds/galaxia.js';
import { SHOP_BY_ID, EXPERIENCES } from '../shared/catalog.js';
import { REWARD_ITEMS, MIN_CAMPAIGN_MS } from '../server/game/modes/GalaxiaMode.js';

let srv, token, userId;

before(async () => {
  srv = await startServer();
  const r = await srv.api('POST', '/api/auth/register', { username: 'Piloto', password: 'secreto1' });
  token = r.body.token;
  userId = r.body.user.id;
});
after(async () => {
  await srv.close();
});

const mode = (s, name, data = {}) => emit(s, 'mode', { name, data });
const inventory = async () => (await import('../server/db/database.js')).getDb().prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(userId).map((x) => x.item_id);

test('mapa, juego de un jugador y trajes de la saga', () => {
  const w = buildGalaxia();
  assert.equal(w.meta.mode, 'galaxia');
  assert.equal(EXPERIENCES.find((e) => e.id === 'galaxia').maxPlayers, 1);
  for (const id of REWARD_ITEMS) assert.ok(SHOP_BY_ID[id]?.unlock, id);
});

test('no se puede cobrar la misión sin jugarla', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'galaxia' });
    assert.equal(j.mode.campaign, true);
    let r = await mode(s, 'done');
    assert.match(r.error, /no válida/);
    r = await mode(s, 'start');
    assert.ok(r.ok);
    r = await mode(s, 'done');
    assert.match(r.error, /no válida/, 'demasiado rápido');
    r = await mode(s, 'invented');
    assert.ok(r.error);
  } finally {
    s.disconnect();
  }
});

test('al completar la campaña se desbloquean los 4 trajes y el logro', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'galaxia' });
    const m = srv.rooms.roomOf(userId).mode;
    await mode(s, 'start');
    m.starts.set(userId, Date.now() - MIN_CAMPAIGN_MS - 1000);
    const r = await mode(s, 'done');
    assert.ok(r.ok, JSON.stringify(r));
    const inv = await inventory();
    for (const id of REWARD_ITEMS) assert.ok(inv.includes(id), id);
    // No se puede cobrar dos veces
    assert.match((await mode(s, 'done')).error, /no válida/);
  } finally {
    s.disconnect();
  }
});

test('cada jugador tiene su propia partida (sala de 1)', async () => {
  const r2 = await srv.api('POST', '/api/auth/register', { username: 'Piloto2', password: 'secreto1' });
  const a = await srv.connect(token);
  const b = await srv.connect(r2.body.token);
  try {
    const ja = await emit(a, 'room:join', { key: 'galaxia' });
    const jb = await emit(b, 'room:join', { key: 'galaxia' });
    assert.ok(!ja.error && !jb.error);
    assert.notEqual(ja.room.id, jb.room.id);
  } finally {
    a.disconnect();
    b.disconnect();
  }
});
