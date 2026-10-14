// Modo desarrollador: sanciones sin avisos, teletransportes y poderes dentro de la partida.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit, once, sleep } from './helpers.js';

let srv, admin, adminId, kid, kidId;

before(async () => {
  srv = await startServer();
  let r = await srv.api('POST', '/api/auth/register', { username: 'Keko_Star200', password: 'loquesea1' });
  admin = r.body.token; adminId = r.body.user.id;
  r = await srv.api('POST', '/api/auth/register', { username: 'Hermanito', password: 'secreto1' });
  kid = r.body.token; kidId = r.body.user.id;
});
after(async () => {
  await srv.close();
});

test('sanciones sin avisos, traer/ir y poderes', async () => {
  const a = await srv.connect(admin);
  const k = await srv.connect(kid);
  try {
    const ja = await emit(a, 'room:join', { key: 'hangout', private: true });
    const jk = await emit(k, 'room:join', { key: 'hangout', code: ja.room.inviteCode });
    assert.ok(jk.room);
    const room = srv.rooms.roomOf(adminId);
    const pa = room.players.get(adminId), pk = room.players.get(kidId);

    // Congelar, matar y hacer bailar: el jugador no recibe quién lo hizo
    for (const [action, ev] of [['freeze', 'admin:freeze'], ['kill', 'admin:kill'], ['dance', 'admin:dance']]) {
      const got = once(k, ev);
      const r = await emit(a, 'admin', { action, userId: kidId, on: true });
      assert.ok(r.ok, `${action}: ${JSON.stringify(r)}`);
      const data = await got;
      assert.equal(data.by, undefined, `${action} no revela al admin`);
    }

    // Traer hacia mí e ir hacia él
    room.teleport(pa, [10, 0.2, 10]);
    room.teleport(pk, [-20, 0.2, -20]);
    let r = await emit(a, 'admin', { action: 'bring', userId: kidId });
    assert.ok(r.ok);
    assert.ok(Math.hypot(pk.pos[0] - 10, pk.pos[2] - 10) < 3, 'traído junto al admin');
    room.teleport(pk, [-20, 0.2, -20]);
    r = await emit(a, 'admin', { action: 'goto', userId: kidId });
    assert.ok(r.ok);
    assert.ok(Math.hypot(pa.pos[0] + 20, pa.pos[2] + 20) < 3, 'el admin va junto al jugador');

    // Poderes: la sala entera se entera (para ver gigantes o invisibles)
    const seen = once(a, 'player:powers', (d) => d.id === kidId);
    r = await emit(a, 'admin', { action: 'power', userId: kidId, power: 'fly', on: true });
    assert.deepEqual(r.powers, ['fly']);
    assert.deepEqual((await seen).powers, ['fly']);
    // Con poderes, un salto enorme no se corrige como trampa
    let corrected = false;
    k.on('correction', () => { corrected = true; });
    pk.lastAccept = Date.now();
    k.emit('state', { p: [pk.pos[0] + 40, 30, pk.pos[2]], ry: 0, a: 'swim' });
    await sleep(120);
    assert.equal(corrected, false);
    assert.equal(pk.pos[1], 30);
    // Gigante y mini se excluyen; el admin también puede darse poderes
    await emit(a, 'admin', { action: 'power', userId: kidId, power: 'giant', on: true });
    r = await emit(a, 'admin', { action: 'power', userId: kidId, power: 'mini', on: true });
    assert.deepEqual(r.powers.sort(), ['fly', 'mini']);
    r = await emit(a, 'admin', { action: 'power', power: 'speed', on: true });
    assert.deepEqual(r.powers, ['speed']);
    r = await emit(a, 'admin', { action: 'power', userId: kidId, power: 'volar-raro', on: true });
    assert.ok(r.error);
    // Un jugador normal no puede dar poderes
    r = await emit(k, 'admin', { action: 'power', power: 'fly', on: true });
    assert.equal(r.error, 'Solo administradores');

    // Echar: parece una desconexión normal
    const kicked = once(k, 'kicked');
    r = await emit(a, 'admin', { action: 'kick', userId: kidId });
    assert.ok(r.ok);
    const { reason } = await kicked;
    assert.doesNotMatch(reason, /admin|expuls/i);
  } finally {
    a.disconnect(); k.disconnect();
    await sleep(50);
  }
});
