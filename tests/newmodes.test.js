// Pruebas de Kest Pesadilla, Kest Desastres, Kest Huerto y Kest Bloques Locos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit, once, sleep } from './helpers.js';
import { tilePos, SHOP_POS } from '../shared/worlds/huerto.js';
import { BLOQUES, tileCenter } from '../shared/worlds/bloques.js';

let srv, token, userId;

before(async () => {
  srv = await startServer();
  const r = await srv.api('POST', '/api/auth/register', { username: 'Probador2', password: 'secreto1' });
  token = r.body.token;
  userId = r.body.user.id;
});
after(async () => {
  await srv.close();
});
const roomOf = () => srv.rooms.roomOf(userId);

test('Pesadilla: el ruido atrae al Oyente y las tareas abren la puerta', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'pesadilla' });
    assert.equal(j.mode.pesadilla.total, 3);
    const room = roomOf();
    const mode = room.mode;
    const p = room.players.get(userId);
    const meta = room.world.meta;
    // Un grito cerca del monstruo hace que venga a por ti
    room.teleport(p, [mode.mon.x - 6, 0.2, mode.mon.z]);
    const heard = once(s, 'pesadilla:heard');
    await emit(s, 'mode', { name: 'noise', data: { l: 0.9 } });
    await heard;
    assert.equal(mode.mon.state, 'chase');
    mode.mon.retreatUntil = Date.now() + 60000; // que no nos atrape durante la prueba
    // La llave no se puede coger sin luz
    let r = await emit(s, 'mode', { name: 'pick', data: { id: 'key' } });
    assert.ok(r.error);
    for (const f of meta.fuses) {
      room.teleport(p, f.p);
      p.data.noiseAt = 0;
      r = await emit(s, 'mode', { name: 'pick', data: { id: f.id } });
      assert.ok(r.ok, JSON.stringify(r));
    }
    room.teleport(p, [meta.fuseBox.p[0], 0.2, meta.fuseBox.p[2] + 1]);
    r = await emit(s, 'mode', { name: 'fusebox' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(room.state.groups.power, true);
    room.teleport(p, meta.key.p);
    r = await emit(s, 'mode', { name: 'pick', data: { id: 'key' } });
    assert.ok(r.ok, JSON.stringify(r));
    room.teleport(p, [meta.door.p[0], 0.2, meta.door.p[2] - 1.5]);
    r = await emit(s, 'mode', { name: 'door' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(mode.doorOpen, true);
    // Esconderse en un armario
    const c = meta.closets[0];
    room.teleport(p, [c.p[0] + 1.5, 0.2, c.p[2]]);
    r = await emit(s, 'mode', { name: 'hide', data: { id: c.id, on: true } });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(p.data.hidden, c.id);
  } finally {
    s.disconnect();
  }
});

test('Desastres: la ronda empieza, quien muere vuelve a la sala y los supervivientes ganan', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'desastres' });
    const mode = roomOf().mode;
    mode.until = Date.now() - 1;
    mode.tick(0.1);
    assert.equal(mode.phase, 'disaster');
    assert.ok(mode.alive.has(userId));
    const r = await emit(s, 'mode', { name: 'died', data: { cause: 'lava' } });
    assert.ok(r.p, 'te devuelve a la sala de espera');
    assert.equal(mode.alive.has(userId), false);
    mode.tick(0.1);
    assert.equal(mode.phase, 'result', 'sin supervivientes la ronda termina');
  } finally {
    s.disconnect();
  }
});

test('Huerto: comprar, plantar, cosechar y vender; el huerto se guarda', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'huerto' });
    const k = j.mode.huerto.me.k;
    assert.equal(k, 0);
    const room = roomOf();
    const p = room.players.get(userId);
    room.teleport(p, [SHOP_POS[0], 0.2, SHOP_POS[1] + 2]);
    let r = await emit(s, 'mode', { name: 'buy', data: { seed: 'carrot', n: 2 } });
    assert.equal(r.me.seeds.carrot, 5);
    const [x, z] = tilePos(k, 0);
    room.teleport(p, [x, 0.2, z]);
    await sleep(130);
    r = await emit(s, 'mode', { name: 'plant', data: { tile: 0, seed: 'carrot' } });
    assert.ok(r.ok, JSON.stringify(r));
    await sleep(130);
    r = await emit(s, 'mode', { name: 'harvest', data: { tile: 0 } });
    assert.match(r.error, /madura/);
    p.data.g.tiles[0].at -= 31_000; // pasa el tiempo
    await sleep(130);
    r = await emit(s, 'mode', { name: 'harvest', data: { tile: 0 } });
    assert.ok(r.ok, JSON.stringify(r));
    room.teleport(p, [SHOP_POS[0], 0.2, SHOP_POS[1] + 2]);
    await sleep(130);
    r = await emit(s, 'mode', { name: 'sell' });
    assert.ok(r.total >= 16, JSON.stringify(r));
    const users = await import('../server/services/users.js');
    assert.equal(users.getUser(userId).stats.garden.seeds.carrot, 4, 'el huerto se guarda en el perfil');
  } finally {
    s.disconnect();
  }
});

test('Bloques Locos: se rellena con bots, las baldosas caen y hay ganador', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'bloques' });
    const room = roomOf();
    const mode = room.mode;
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'countdown');
    assert.equal(mode.bots.size, 4, '1 jugador + 4 bots');
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'show');
    // El jugador se coloca en una baldosa del color correcto y los bots en una incorrecta
    const good = mode.colors.findIndex((c) => c === mode.target);
    const [gx, gz] = tileCenter(good);
    room.teleport(room.players.get(userId), [gx, BLOQUES.y + 0.2, gz]);
    const bad = mode.colors.findIndex((c) => c !== mode.target);
    for (const b of mode.bots.values()) { const [bx, bz] = tileCenter(bad); b.pos = [bx, BLOQUES.y, bz]; b.goal = null; }
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'drop');
    assert.equal(mode.alive.size, 1, 'los bots se caen');
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'results');
    assert.equal(mode.winner, 'Probador2');
  } finally {
    s.disconnect();
  }
});
