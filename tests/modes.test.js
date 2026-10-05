// Pruebas de los modos nuevos: Royale, Rocket, Terror, Castores, Only Up y Teclas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit, once, sleep } from './helpers.js';

let srv, token, userId;

before(async () => {
  srv = await startServer();
  const r = await srv.api('POST', '/api/auth/register', { username: 'Probador', password: 'secreto1' });
  token = r.body.token;
  userId = r.body.user.id;
});
after(async () => {
  await srv.close();
});

const roomOf = () => srv.rooms.roomOf(userId);

test('Royale: bots, disparos, botín y construcción', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'royale' });
    assert.equal(j.mode.royale.phase, 'lobby');
    let r = await emit(s, 'mode', { name: 'start' });
    assert.ok(r.ok);
    const room = roomOf();
    const mode = room.mode;
    assert.equal(mode.fighters.size, 6, '1 jugador + 5 bots');
    mode.startAt = Date.now() - 1; // salta la cuenta atrás
    await sleep(200);
    assert.equal(mode.phase, 'match');
    // Coloca un bot delante del jugador y dispara hacia él
    const p = room.players.get(userId);
    const bot = [...mode.bots.values()][0];
    room.teleport(p, [0, mode.ground(0, 0), 0]);
    bot.pos = [0, mode.ground(0, 6), 6];
    for (const b of mode.bots.values()) if (b !== bot) b.nextShot = Date.now() + 60000;
    bot.nextShot = Date.now() + 60000;
    const head = [0, p.pos[1] + 1.6, 0];
    const dir = [bot.pos[0] - head[0], bot.pos[1] + 1 - head[1], bot.pos[2] - head[2]];
    r = await emit(s, 'mode', { name: 'shoot', data: { d: dir } });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.hits.length, 1, 'acierta al bot');
    assert.ok(bot.hp < 100);
    // Cadencia: un segundo disparo inmediato se rechaza
    r = await emit(s, 'mode', { name: 'shoot', data: { d: dir } });
    assert.equal(r.error, 'cadencia');
    // Cofre de botín
    const chest = [...mode.chests.values()][0];
    room.teleport(p, chest.p);
    r = await emit(s, 'interact', { id: chest.id });
    assert.ok(r.ok && r.loot, JSON.stringify(r));
    r = await emit(s, 'interact', { id: chest.id });
    await sleep(160);
    r = await emit(s, 'interact', { id: chest.id });
    assert.ok(r.error);
    // Construcción
    const mats = mode.fighters.get(userId).mats;
    r = await emit(s, 'mode', { name: 'build', data: { kind: 'wall', x: chest.p[0] + 4, y: chest.p[1], z: chest.p[2], ry: 0 } });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(mode.fighters.get(userId).mats, mats - 10);
    // Eliminar a todos los bots da la victoria
    for (const b of mode.bots.values()) mode.eliminate(b, mode.fighters.get(userId));
    mode.tick(0.05);
    assert.equal(mode.phase, 'results');
    assert.equal(mode.winner, 'Probador');
  } finally {
    s.disconnect();
  }
});

test('Rocket: equipos con bots y gol', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'rocket' });
    assert.ok(j.ok);
    const mode = roomOf().mode;
    assert.equal(mode.teams.size, 4, '2 contra 2 completado con bots');
    assert.equal(j.players.filter((p) => p.bot).length, 3);
    mode.state = 'play';
    const team = mode.teams.get(userId);
    // Balón entrando en la portería rival
    const dirZ = team === 0 ? -1 : 1;
    mode.ball = { p: [0, 3, dirZ * 66], v: [0, 0, dirZ * 40] };
    mode.lastTouch = userId;
    const goal = once(s, 'rocket:goal');
    for (let i = 0; i < 20 && mode.state === 'play'; i++) mode.ballStep(0.02, Date.now(), true);
    const g = await goal;
    assert.equal(g.team, team);
    assert.equal(mode.score[team], 1);
    assert.equal(g.scorer, 'Probador');
  } finally {
    s.disconnect();
  }
});

test('Terror: almas compartidas abren la verja y el monstruo se mueve', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'horror' });
    assert.equal(j.mode.horror.collected.length, 0);
    const room = roomOf();
    const mode = room.mode;
    const p = room.players.get(userId);
    const m0 = [mode.mon.x, mode.mon.z];
    for (let i = 0; i < 20; i++) mode.tick(0.1);
    assert.ok(Math.hypot(mode.mon.x - m0[0], mode.mon.z - m0[1]) > 0.5, 'La Sombra patrulla');
    for (const soul of mode.souls) {
      room.teleport(p, soul.p);
      p.interactAt = 0;
      const r = await emit(s, 'interact', { id: soul.id });
      assert.ok(r.ok, JSON.stringify(r));
    }
    assert.equal(mode.gateOpen, true);
  } finally {
    s.disconnect();
  }
});

test('Castores: roer, coger y entregar troncos', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'castores' });
    const room = roomOf();
    const mode = room.mode;
    mode.state = 'heist';
    mode.endsAt = Date.now() + 100000;
    const p = room.players.get(userId);
    room.teleport(p, [0, 0.2, 12]);
    for (let i = 0; i < 4; i++) {
      p.data.gnawAt = 0;
      const r = await emit(s, 'mode', { name: 'gnaw', data: { id: 'plank0' } });
      assert.ok(r.ok, JSON.stringify(r));
    }
    assert.ok(mode.publicState().removed.includes('plank0'));
    const log = mode.logs[0];
    room.teleport(p, [log.p[0], 0.2, log.p[2]]);
    let r = await emit(s, 'mode', { name: 'grab', data: { id: log.id } });
    assert.ok(r.ok, JSON.stringify(r));
    r = await emit(s, 'mode', { name: 'grab', data: { id: mode.logs[1].id } });
    assert.ok(r.error, 'solo un tronco a la vez');
    room.teleport(p, [0, 0.2, mode.dropZone.p[2]]);
    mode.onState(p);
    assert.equal(mode.delivered, 1);
    assert.equal(log.delivered, true);
  } finally {
    s.disconnect();
  }
});

test('Only Up guarda la altura récord y Teclas usa sus propias estadísticas', async () => {
  const users = await import('../server/services/users.js');
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'onlyup' });
    const room = roomOf();
    const p = room.players.get(userId);
    room.teleport(p, [0, 57, 0]);
    room.mode.onState(p);
    room.mode.tick(1.1);
    assert.equal(users.getUser(userId).stats.upBest, 57);
    const j = await emit(s, 'room:join', { key: 'keys' });
    assert.equal(j.mode.obby.total, 4, 'cuatro puntos de control (barras espaciadoras)');
  } finally {
    s.disconnect();
  }
});
