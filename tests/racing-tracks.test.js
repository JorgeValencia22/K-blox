// Fórmula Turbo: circuitos, parrilla, puntos de control y monoplazas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit } from './helpers.js';
import { buildRacing, RACING_TRACKS } from '../shared/worlds/racing.js';
import { EXPERIENCES } from '../shared/catalog.js';
import { VEHICLES } from '../shared/constants.js';

let srv, token;

before(async () => {
  srv = await startServer();
  const r = await srv.api('POST', '/api/auth/register', { username: 'Piloto', password: 'secreto1' });
  token = r.body.token;
});
after(async () => {
  await srv.close();
});

test('cuatro circuitos con parrilla, 8 puntos de control y turbos', () => {
  assert.equal(RACING_TRACKS.length, 4);
  for (const t of RACING_TRACKS) {
    const w = buildRacing(t);
    assert.equal(w.meta.grid.length, 8, t);
    assert.equal(w.meta.checkpoints, 8, t);
    assert.ok(w.meta.boosts.length >= 3, t);
    assert.equal(w.meta.vehicle, 'f1', t);
    assert.ok(w.objects.filter((o) => o.t === 'zone' && o.id.startsWith('rcp')).length === 8, t);
  }
});

test('los circuitos son deterministas (cliente y servidor ven el mismo mundo)', () => {
  const a = buildRacing('monza'), b = buildRacing('monza');
  assert.deepEqual(a.objects.map((o) => o.p), b.objects.map((o) => o.p));
});

test('existen monoplazas y las experiencias de Fórmula Turbo', () => {
  assert.ok(VEHICLES.f1);
  const ids = EXPERIENCES.map((e) => e.id);
  for (const id of ['racing', 'racing_monza', 'racing_monaco', 'racing_silverstone']) assert.ok(ids.includes(id), id);
});

test('en una sala de Fórmula Turbo se conduce un monoplaza', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'racing_monza' });
    assert.ok(!j.error, JSON.stringify(j));
    const room = srv.rooms.roomOf(j.you.id);
    const veh = [...room.vehicles.values()][0];
    assert.equal(veh.type, 'f1');
  } finally {
    s.disconnect();
  }
});
