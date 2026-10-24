// Pruebas de Guerra Galáctica: sable, bláster, bloqueo (desvío), duelo contra Lord Vex,
// Historia por oleadas y la misión de la Estación Oscura.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit } from './helpers.js';
import { GX, buildGalaxia } from '../shared/worlds/galaxia.js';
import { SHOP_BY_ID } from '../shared/catalog.js';

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

test('mapa y trajes de la saga', () => {
  const w = buildGalaxia();
  assert.equal(w.meta.mode, 'galaxia');
  assert.ok(w.objects.length > 100);
  for (const id of ['skin_starknight', 'skin_darklord', 'skin_droid']) assert.ok(SHOP_BY_ID[id]?.unlock, id);
});

test('duelo contra Lord Vex: golpes, bloqueo y victoria', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'galaxia' });
    assert.equal(j.mode.me.weapon, 'saber');
    const room = srv.rooms.roomOf(userId);
    const m = room.mode;
    const p = room.players.get(userId);

    // Fuera de un combate no se puede herir a nadie
    let r = await mode(s, 'swing', { d: [0, 0, 1] });
    assert.ok(r.ok);
    assert.equal(r.hits.length, 0);

    r = await mode(s, 'duel', { vs: 'bot' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(m.duel.phase, 'countdown');
    const vex = m.fighters.get(m.duel.b);
    assert.equal(vex.kind, 'vex');
    m.duel.startAt = Date.now() - 1;
    m.tick(0.05);
    assert.equal(m.duel.phase, 'fight');

    // Junto a Vex y mirándolo: el golpe entra (si no bloquea)
    room.teleport(p, [vex.pos[0] - 2, GX.arena.y, vex.pos[2]]);
    p.ry = Math.PI / 2;
    vex.block = false;
    m.fighters.get(userId).nextAtk = 0;
    r = await mode(s, 'swing', { d: [1, 0, 0] });
    assert.equal(r.hits[0].dmg, 20);
    assert.equal(vex.hp, vex.max - 20);
    // Si Vex bloquea, choque de sables y sin daño
    vex.block = true;
    vex.ry = -Math.PI / 2;
    const me = m.fighters.get(userId);
    me.nextAtk = 0;
    r = await mode(s, 'swing', { d: [1, 0, 0] });
    assert.equal(r.hits[0].blocked, true);
    assert.equal(vex.hp, vex.max - 20);

    // Bloquear con el sable desvía los disparos del bláster
    r = await mode(s, 'block', { on: true });
    assert.equal(me.block, true);
    const hp0 = me.hp;
    m.shoot(vex, [vex.pos[0], vex.pos[1] + 1.5, vex.pos[2]], [-1, 0, 0], 10);
    assert.equal(me.hp, hp0);
    await mode(s, 'block', { on: false });

    // Rematar a Vex: gana el jugador y desbloquea el droide
    vex.block = false;
    vex.hp = 5;
    me.nextAtk = 0;
    r = await mode(s, 'swing', { d: [1, 0, 0] });
    assert.equal(m.duel.phase, 'end');
    const inv = (await import('../server/db/database.js')).getDb().prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(userId).map((x) => x.item_id);
    assert.ok(inv.includes('skin_droid'));
    m.duel.resetAt = Date.now() - 1;
    m.tick(0.05);
    assert.equal(m.duel.phase, 'idle');
    assert.equal(m.bots.size, 0);
  } finally {
    s.disconnect();
  }
});

test('Historia: oleadas de droides y Lord Vex', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'galaxia' });
    const room = srv.rooms.roomOf(userId);
    const m = room.mode;
    let r = await mode(s, 'story');
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(m.story.members.has(userId));
    // Cada oleada: aparecen los droides; se eliminan y llega la siguiente
    for (let w = 0; w <= 3; w++) {
      m.story.nextAt = Date.now() - 1;
      m.tick(0.05);
      assert.equal(m.story.phase, 'wave');
      assert.ok(m.enemiesLeft() > 0);
      if (w === 3) assert.ok([...m.bots.values()].some((b) => b.kind === 'vex'));
      for (const b of [...m.bots.values()]) m.damage(b, 9999, m.fighters.get(userId));
      m.tick(0.05);
    }
    assert.equal(m.story.phase, 'done');
    const inv = (await import('../server/db/database.js')).getDb().prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(userId).map((x) => x.item_id);
    assert.ok(inv.includes('skin_starknight'));
  } finally {
    s.disconnect();
  }
});

test('Estación Oscura: hay que jugar la misión para el premio', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'galaxia' });
    let r = await mode(s, 'starDone', { ms: 99999 });
    assert.match(r.error, /no válida/);
    r = await mode(s, 'starStart');
    assert.ok(r.ok);
    r = await mode(s, 'starDone', { ms: 99999 });
    assert.match(r.error, /no válida/);
    const m = srv.rooms.roomOf(userId).mode;
    m.starts.set(userId, Date.now() - 60000);
    r = await mode(s, 'starDone', {});
    assert.ok(r.ok);
    const inv = (await import('../server/db/database.js')).getDb().prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(userId).map((x) => x.item_id);
    assert.ok(inv.includes('skin_darklord'));
  } finally {
    s.disconnect();
  }
});
