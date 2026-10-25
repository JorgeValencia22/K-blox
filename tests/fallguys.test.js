// Fall Guys (modo Pro): 10 recorridos, torneo por rondas contra bots, clasificación y ganador.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit } from './helpers.js';
import { buildFallGuys } from '../shared/worlds/fallguys.js';
import { EXPERIENCES } from '../shared/catalog.js';

let srv, token, userId;

before(async () => {
  srv = await startServer();
  const r = await srv.api('POST', '/api/auth/register', { username: 'Fallero', password: 'secreto1' });
  token = r.body.token;
  userId = r.body.user.id;
});
after(async () => {
  await srv.close();
});

test('diez recorridos con sus puntos de control y su meta', () => {
  const w = buildFallGuys();
  assert.equal(w.meta.courses.length, 10);
  for (const c of w.meta.courses) {
    assert.equal(w.objects.filter((o) => o.t === 'checkpoint' && o.id.startsWith(c.key + '_')).length, 4, c.key);
    assert.equal(w.objects.filter((o) => o.t === 'finish' && o.id === `${c.key}_fin`).length, 1, c.key);
  }
  assert.ok(EXPERIENCES.some((e) => e.id === 'fallguys' && e.maxPlayers === 12));
});

test('el torneo completo termina con un ganador (contra bots)', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'fallguys' });
    const room = srv.rooms.roomOf(userId);
    const m = room.mode;
    const r0 = await emit(s, 'mode', { name: 'start', data: { fill: 'bots' } });
    assert.ok(r0.ok, JSON.stringify(r0));
    let guard = 0;
    while (m.phase !== 'final' && guard++ < 500) {
      if (m.phase === 'gather') m.gatherAt = 0;
      if (m.phase === 'countdown') m.startAt = 0;
      if (m.phase === 'round') { for (let i = 0; i < 4; i++) m.tick(0.5); m.roundAt = 0; }
      if (m.phase === 'results') m.resultsAt = 0;
      if (m.phase === 'final') break;
      m.tick(0.5);
    }
    assert.equal(m.phase, 'final');
    assert.ok(m.winner, 'hay ganador');
    assert.ok(m.racers.size >= 4, 'hay bots suficientes');
    // Al acabar, los jugadores reales reciben premio (una vez)
    assert.ok(m.publicState().standings.length >= 4);
  } finally {
    s.disconnect();
  }
});

test('contra jugadores reales: espera y después rellena con bots', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'fallguys' });
    const m = srv.rooms.roomOf(userId).mode;
    m.resetLobby();
    await emit(s, 'mode', { name: 'start', data: { fill: 'real' } });
    assert.equal(m.phase, 'gather');
    m.tick(0.5);
    assert.equal(m.phase, 'gather', 'espera a jugadores reales');
    m.gatherAt = 0;
    m.tick(0.5);
    assert.equal(m.phase, 'countdown');
    assert.ok([...m.racers.values()].some((r) => r.bot), 'rellenado con bots');
  } finally {
    s.disconnect();
  }
});
