// Pruebas de Fábrica Feliz: manos extensibles, puzles de cada puerta, cintas y persecución.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit, once, sleep } from './helpers.js';
import { POPPY, GRAB_BY_ID, MACHINE, TAPES, buildPoppy } from '../shared/worlds/poppy.js';

let srv, token, userId;

before(async () => {
  srv = await startServer();
  const r = await srv.api('POST', '/api/auth/register', { username: 'Explorador', password: 'secreto1' });
  token = r.body.token;
  userId = r.body.user.id;
});
after(async () => {
  await srv.close();
});

/** Coloca al jugador a `dist` metros del objetivo, mirándolo. */
function aimAt(room, p, target, dist = 4) {
  const pos = [target[0], 0.2, target[2] - dist];
  room.teleport(p, pos);
  p.ry = Math.atan2(target[0] - pos[0], target[2] - pos[2]);
}

test('mapa: puertas, agarres y cintas', () => {
  const w = buildPoppy();
  for (const id of ['pdoorA', 'pdoorB', 'pdoorC', 'pdoorD']) assert.ok(w.objects.some((o) => o.id === id));
  assert.equal(TAPES.length, 4);
});

test('puzles en orden, engranajes, cintas y persecución hasta la salida', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'poppy' });
    assert.deepEqual(j.mode.pp.doors, [false, false, false, false]);
    const room = srv.rooms.roomOf(userId);
    const m = room.mode;
    const p = room.players.get(userId);
    const grab = (id, hand) => emit(s, 'mode', { name: 'grab', data: { id, hand } });

    // Puerta A: mano azul en el escáner (la roja no vale; lejos tampoco)
    aimAt(room, p, GRAB_BY_ID.scanA.p, 30);
    let r = await grab('scanA', 'blue');
    assert.match(r.error, /lejos/);
    aimAt(room, p, GRAB_BY_ID.scanA.p, 5);
    r = await grab('scanA', 'red');
    assert.match(r.error, /AZUL/);
    // Apuntando hacia atrás no vale
    p.ry += Math.PI;
    r = await grab('scanA', 'blue');
    assert.match(r.error, /Apunta/);
    p.ry -= Math.PI;
    r = await grab('scanA', 'blue');
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(m.doors[0], true);

    // Puerta B: sin carga no funciona; con la carga de la mano roja sí
    aimAt(room, p, GRAB_BY_ID.recv.p, 6);
    r = await grab('recv', 'red');
    assert.match(r.error, /electricidad/);
    aimAt(room, p, GRAB_BY_ID.plug.p, 4);
    r = await grab('plug', 'red');
    assert.ok(r.charged);
    aimAt(room, p, GRAB_BY_ID.recv.p, 6);
    r = await grab('recv', 'red');
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(m.doors[1], true);

    // Puerta C: tres engranajes (uno en lo alto y otro tras la valla) y la máquina
    for (const id of ['gear1', 'gear2', 'gear3']) {
      aimAt(room, p, GRAB_BY_ID[id].p, 5);
      r = await grab(id, 'blue');
      assert.ok(r.ok, `${id}: ${JSON.stringify(r)}`);
    }
    r = await grab('gear1', 'red');
    assert.ok(r.error, 'no se coge dos veces');
    room.teleport(p, [MACHINE[0], 0.2, MACHINE[2] - 2]);
    r = await emit(s, 'mode', { name: 'machine' });
    assert.ok(r.ok);
    assert.equal(m.placed, 3);
    assert.equal(m.doors[2], true);

    // Puerta D: azul y rojo casi a la vez
    aimAt(room, p, GRAB_BY_ID.scanB.p, 6);
    r = await grab('scanB', 'blue');
    assert.match(r.msg, /otro mando/);
    m.dual.scanB = Date.now() - 10_000; // demasiado tarde
    aimAt(room, p, GRAB_BY_ID.lever.p, 6);
    r = await grab('lever', 'red');
    assert.equal(m.doors[3], false);
    aimAt(room, p, GRAB_BY_ID.scanB.p, 6);
    await grab('scanB', 'blue');
    assert.equal(m.doors[3], true);

    // Cinta VHS
    const t = TAPES[0];
    room.teleport(p, [t.p[0] + 1, 0.2, t.p[2]]);
    r = await emit(s, 'mode', { name: 'pick', data: { id: t.id } });
    assert.equal(r.tape, t.id);

    // Entrar en la vitrina despierta a Tito
    const wake = once(s, 'pp:wake');
    room.teleport(p, [0, 0.2, POPPY.chaseStartZ + 2]);
    m.tick(0.05);
    await wake;
    assert.equal(m.mon.state, 'chase');
    // Te persigue y te atrapa si te alcanza
    m.mon.waitUntil = 0;
    room.teleport(p, [0, 0.2, 110]);
    const z0 = m.mon.z;
    m.tick(0.5);
    assert.ok(m.mon.z > z0, 'avanza hacia el jugador');
    Object.assign(m.mon, { x: 0, z: 109.5 });
    const caught = once(s, 'pp:caught');
    m.tick(0.05);
    await caught;
    // Interruptor final: la caja cae sobre Tito y se gana
    m.mon.waitUntil = 0;
    aimAt(room, p, GRAB_BY_ID.final.p, 6);
    const win = once(s, 'pp:win');
    r = await grab('final', 'red');
    assert.ok(r.ok, JSON.stringify(r));
    await win;
    const prof = (await srv.api('GET', '/api/profile', null, token)).body.user;
    assert.ok(prof.inventory.includes('acc_grabpack'));
    assert.ok(prof.achievements.some((a) => a.id === 'poppy_escape'));
    assert.deepEqual(prof.stats.poppyTapes, [t.id]);
    // Nueva ronda: todo cerrado otra vez
    m.resetAt = 1;
    m.tick(0.05);
    assert.deepEqual(m.doors, [false, false, false, false]);
    assert.equal(m.mon.state, 'sleep');
  } finally {
    s.disconnect();
    await sleep(50);
  }
});
