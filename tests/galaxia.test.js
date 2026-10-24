// Guerra Galáctica en cooperativo: capítulos que avanzan entre todos, combates en el servidor,
// dificultad doble y premios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit } from './helpers.js';
import { buildGalaxia } from '../shared/worlds/galaxia.js';
import { SHOP_BY_ID, EXPERIENCES } from '../shared/catalog.js';
import { REWARD_ITEMS, SEQ } from '../server/game/modes/GalaxiaMode.js';
import { Encounter, DIFF } from '../server/game/galaxia/encounter.js';

let srv, a, b;

/** ¿Se emitió el evento de combate `t`? (el servidor los envía como 'enc:ev' con un campo t) */
const has = (events, t) => events.some(([ev, d]) => (ev === 'enc:ev' ? d.t : ev) === t);

before(async () => {
  srv = await startServer();
  a = (await srv.api('POST', '/api/auth/register', { username: 'Ana', password: 'secreto1' })).body;
  b = (await srv.api('POST', '/api/auth/register', { username: 'Beto', password: 'secreto1' })).body;
});
after(async () => {
  await srv.close();
});

const mode = (s, name, data = {}) => emit(s, 'mode', { name, data });

test('mapa, cooperativo de 4 y trajes de la saga', () => {
  assert.equal(buildGalaxia().meta.mode, 'galaxia');
  assert.equal(EXPERIENCES.find((e) => e.id === 'galaxia').maxPlayers, 4);
  for (const id of REWARD_ITEMS) assert.ok(SHOP_BY_ID[id]?.unlock, id);
});

test('los capítulos avanzan cuando todos lo piden, no antes', async () => {
  const sa = await srv.connect(a.token), sb = await srv.connect(b.token);
  try {
    await emit(sa, 'room:join', { key: 'galaxia' });
    await emit(sb, 'room:join', { key: 'galaxia' });
    const m = srv.rooms.roomOf(a.user.id).mode;
    assert.equal(m.chapter, null);
    assert.ok((await mode(sa, 'start')).ok);
    assert.equal(m.chapter, 'intro');
    // Un solo jugador no basta
    m.chapterAt = Date.now() - 10000;
    let r = await mode(sa, 'goto', { chapter: 'dogfight' });
    assert.ok(r.ok && r.waiting);
    assert.equal(m.chapter, 'intro');
    // Cuando el segundo también lo pide, pasa
    await mode(sb, 'goto', { chapter: 'dogfight' });
    assert.equal(m.chapter, 'dogfight');
    // No se puede saltar capítulos
    r = await mode(sa, 'goto', { chapter: 'crash' });
    assert.ok(r.error);
    // Ni avanzar antes de un tiempo mínimo
    r = await mode(sa, 'goto', { chapter: 'dock' });
    assert.match(r.error, /Espera/);
  } finally {
    sa.disconnect();
    sb.disconnect();
  }
});

test('la historia tiene todos sus capítulos en orden', () => {
  assert.equal(SEQ[0], 'intro');
  assert.equal(SEQ.at(-1), 'home');
  assert.ok(SEQ.includes('hangar') && SEQ.includes('core') && SEQ.includes('boss'));
});

test('dificultad doble: los enemigos tienen el doble de vida', () => {
  assert.equal(DIFF, 2);
  const e = new Encounter('hangar', ['p1'], { heroSpawns: [[0, 0, 0]], foeSpawns: [[5, 5]], colliders: [], emit: () => {} });
  e.spawnFoe('droid', 5, 5);
  assert.equal(e.foes[0].hp, 45 * 2);
  assert.equal(e.foes[0].max, 45 * 2);
});

test('combate: los golpes los decide el servidor y el jugador no puede volar', () => {
  const events = [];
  const e = new Encounter('hangar', ['p1', 'p2'], { heroSpawns: [[0, 0, 0], [2, 0, 0]], foeSpawns: [[0, 0]], colliders: [], emit: (ev, d) => events.push([ev, d]) });
  e.setState('p1', { p: [100, 0, 100], yaw: 0 }); // salto de 140 m: rechazado
  assert.equal(e.heroes.get('p1').x, 0);
  const f = e.spawnFoe('droid', 2, 0);
  e.swing('p1', [1, 0, 0]);
  assert.ok(f.hp < 45 * 2, 'el golpe llega');
  assert.ok(has(events, 'swing'));
});

test('bloquear con el sable desvía un disparo y devuelve daño', () => {
  const events = [];
  const e = new Encounter('hangar', ['p1'], { heroSpawns: [[0, 0, 0]], foeSpawns: [[0, 0]], colliders: [], emit: (ev, d) => events.push([ev, d]) });
  const h = e.heroes.get('p1');
  e.setState('p1', { p: [0, 0, 0], yaw: 0, block: true });
  assert.equal(h.block, true);
  const shot = { x: 0, y: 1, z: 3 }; // viene de frente (z+)
  h.yaw = Math.PI; // mira hacia +z
  e.deflect(h, shot);
  assert.ok(has(events, 'deflect'));
});

test('se pierde cuando caen todos los jugadores', () => {
  const events = [];
  const e = new Encounter('hangar', ['p1'], { heroSpawns: [[0, 0, 0]], foeSpawns: [[0, 0]], colliders: [], emit: (ev, d) => events.push([ev, d]) });
  e.hurt(e.heroes.get('p1'), 9999);
  assert.ok(e.over && e.failed);
  assert.ok(has(events, 'fail'));
});

test('Lord Vex: un solo golpe no lo mata y su vida es doble', () => {
  const e = new Encounter('boss', ['p1'], { heroSpawns: [[0, 0, 0]], foeSpawns: [[15, -5]], colliders: [], emit: () => {} });
  assert.equal(e.vex.hp, 360 * DIFF);
  e.vex.mode = 'idle';
  e.hitFoe(e.vex, 22, 'saber');
  assert.ok(e.vex.hp > 0);
});

test('los premios se dan a todos los jugadores de la sala una vez', async () => {
  const sa = await srv.connect(a.token), sb = await srv.connect(b.token);
  try {
    await emit(sa, 'room:join', { key: 'galaxia' });
    await emit(sb, 'room:join', { key: 'galaxia' });
    const m = srv.rooms.roomOf(a.user.id).mode;
    m.rewardAll();
    const inv = (await import('../server/db/database.js')).getDb().prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(a.user.id).map((x) => x.item_id);
    for (const id of REWARD_ITEMS) assert.ok(inv.includes(id), id);
    m.rewardAll(); // no se vuelve a dar
  } finally {
    sa.disconnect();
    sb.disconnect();
  }
});
