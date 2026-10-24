// Fórmula Turbo: un mapa con 4 circuitos para monoplazas; cada carrera usa uno distinto.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit } from './helpers.js';
import { buildRacing } from '../shared/worlds/racing.js';
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

test('un mapa con cuatro circuitos, cada uno con parrilla, 8 puntos de control y turbos', () => {
  const w = buildRacing();
  assert.equal(w.meta.tracks.length, 4);
  for (const t of w.meta.tracks) {
    assert.equal(t.grid.length, 8, t.key);
    assert.ok(t.boosts.length >= 3, t.key);
    const cps = w.objects.filter((o) => o.t === 'zone' && o.id.startsWith(`rcp_${t.key}_`));
    assert.equal(cps.length, 8, t.key);
  }
  assert.equal(w.meta.vehicle, 'f1');
});

test('los circuitos son deterministas (cliente y servidor ven el mismo mundo)', () => {
  const a = buildRacing(), b = buildRacing();
  assert.deepEqual(a.objects.map((o) => o.p), b.objects.map((o) => o.p));
});

test('solo existe una experiencia de Fórmula Turbo y hay monoplazas', () => {
  assert.ok(VEHICLES.f1);
  const ids = EXPERIENCES.map((e) => e.id).filter((id) => id.startsWith('racing'));
  assert.deepEqual(ids, ['racing']);
});

test('en la sala se conduce un monoplaza y las carreras rotan de circuito', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'racing' });
    assert.ok(!j.error, JSON.stringify(j));
    const room = srv.rooms.roomOf(j.you.id);
    const veh = [...room.vehicles.values()][0];
    assert.equal(veh.type, 'f1');
    const m = room.mode;
    await emit(s, 'mode', { name: 'start' });
    const first = m.track.key;
    m.state = 'waiting';
    await emit(s, 'mode', { name: 'start' });
    assert.notEqual(m.track.key, first);
  } finally {
    s.disconnect();
  }
});
