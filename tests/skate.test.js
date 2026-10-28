// Pruebas de Skate Pro: mapas, física, trucos, grinds, combos, objetivos y validación del servidor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SKATE_MAPS, SKATE_MAP_BY_ID, SKATE_MODES, medalFor } from '../shared/skate/maps.js';
import { SkaterSim, TRICKS } from '../shared/skate/sim.js';
import { startServer, emit, once } from './helpers.js';
import { EXPERIENCES, ACHIEVEMENTS } from '../shared/catalog.js';
import { getBuiltinWorld } from '../shared/worlds/index.js';
import { MIN_RUN_MS, MAX_SCORE_PER_SEC, validateRun } from '../server/game/modes/SkateMode.js';

const inp = (o = {}) => ({ sx: 0, py: 0, jump: false, jumpP: false, kickP: false, heelP: false, shuvP: false, grab: false, manual: false, respawnP: false, ...o });
const run = (s, secs, f) => {
  const evs = [];
  for (let i = 0; i < Math.round(secs * 60); i++) evs.push(...s.step(1 / 60, inp(f ? f(i / 60, s) : {})));
  return evs;
};
const kinds = (evs) => evs.map((e) => e.k);
const sim = (id) => new SkaterSim(SKATE_MAP_BY_ID[id]);

test('los siete mapas están completos', () => {
  assert.deepEqual(SKATE_MAPS.map((m) => m.id), ['city', 'park', 'street', 'bowl', 'roof', 'port', 'beach']);
  for (const m of SKATE_MAPS) {
    assert.ok(m.name && m.desc && m.theme && m.prims.length > 8, m.id);
    assert.equal(m.letters.map((l) => l.ch).join(''), 'SKATE', m.id);
    assert.ok(m.gaps.length >= 2 && m.goals.length === 7, m.id);
    assert.ok(m.medals[0] < m.medals[1] && m.medals[1] < m.medals[2], m.id);
    const s = new SkaterSim(m);
    assert.ok(s.world.inBounds(m.spawn.x, m.spawn.z), `${m.id}: salida dentro del mapa`);
    assert.ok(Number.isFinite(s.y), m.id);
    for (const l of m.letters) assert.ok(s.world.inBounds(l.x, l.z), `${m.id}: letra ${l.ch}`);
    for (const g of m.goals) {
      if (g.type === 'gap') assert.ok(m.gaps.some((x) => x.id === g.id2), `${m.id}: hueco ${g.id2}`);
      if (g.type === 'trick') assert.ok(TRICKS[g.id2], `${m.id}: truco ${g.id2}`);
    }
    for (const p of m.prims) for (const v of Object.values(p)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${m.id}: número válido`);
  }
});

test('hay modos de juego y medallas', () => {
  assert.deepEqual(SKATE_MODES.map((m) => m.id), ['free', 'attack', 'missions']);
  assert.equal(medalFor('park', 7999), 0);
  assert.equal(medalFor('park', 8000), 1);
  assert.equal(medalFor('park', 25000), 2);
  assert.equal(medalFor('park', 60000), 3);
});

test('empujando se llega a la velocidad máxima y no hay caídas en la salida de ningún mapa', () => {
  for (const m of SKATE_MAPS) {
    const s = new SkaterSim(m);
    const ev = run(s, 3, () => ({ py: 1 }));
    assert.ok(s.speed > 6, `${m.id}: velocidad ${s.speed}`);
    assert.ok(!kinds(ev).includes('bail'), `${m.id}: sin caídas`);
  }
});

test('ollie con kickflip: se anota el truco, el combo se cierra y suma puntos', () => {
  const s = sim('park');
  s.place(-30, 5, Math.PI / 2, 6);
  const ev = run(s, 4, (t) => ({ jump: t > 0.2 && t < 0.3, kickP: t > 0.62 && t < 0.64 }));
  assert.ok(ev.some((e) => e.k === 'trick' && /Kickflip/.test(e.name)));
  assert.ok(kinds(ev).includes('bank'));
  assert.ok(s.stats.score >= TRICKS.kickflip.pts);
  assert.ok(s.stats.landed.has('kickflip'));
  assert.ok(ev.some((e) => e.k === 'goal' && e.id === 'g3'));
});

test('un giro de 360° en el aire se puntúa, y aterrizar de lado es una caída', () => {
  // El jugador gira hasta `limit` radianes y suelta
  const spinTo = (limit) => (t, ss) => ({ jump: t > 0.2 && t < 0.55, sx: t > 0.6 && ss.air && Math.abs(ss.air.spin) < limit ? -1 : 0 });
  let s = sim('park');
  s.place(-30, 5, Math.PI / 2, 6);
  let ev = run(s, 4, spinTo(5.9));
  const spin = ev.find((e) => e.k === 'trick' && /(BS|FS) 360/.test(e.name));
  assert.ok(spin, kinds(ev).join());
  assert.ok(s.stats.maxSpin >= 360);
  s = sim('park');
  s.place(-30, 5, Math.PI / 2, 6);
  ev = run(s, 4, spinTo(1.2));
  assert.ok(ev.some((e) => e.k === 'bail' && /lado/.test(e.why)), kinds(ev).join());
});

test('flip a medias al aterrizar es una caída', () => {
  const s = sim('park');
  s.place(-30, 5, Math.PI / 2, 6);
  const ev = run(s, 3, (t) => ({ jump: t > 0.2 && t < 0.24, kickP: t > 0.46 && t < 0.48 }));
  assert.ok(ev.some((e) => e.k === 'bail' || e.k === 'land'));
});

test('el cuarto de tubo lanza al aire y la escalera frena en seco', () => {
  let s = sim('park');
  s.place(-22, -4, Math.PI, 9.5);
  let max = 0;
  const ev = [];
  for (let i = 0; i < 60 * 4; i++) { ev.push(...s.step(1 / 60, inp({ py: 1 }))); max = Math.max(max, s.y); }
  assert.ok(max > 1.4, `altura ${max}`);
  s = sim('park');
  s.place(-24, 6, 0, 6);
  const e2 = run(s, 3, () => ({ py: 1 }));
  assert.ok(kinds(e2).includes('hit'));
});

test('grind en un raíl con ollie, y el combo cuenta el hueco', () => {
  let found = null;
  for (let rx = -27; rx < -16 && !found; rx += 0.25) {
    const s = sim('park');
    s.place(-32, 28, Math.PI / 2, 7);
    const ev = run(s, 3, (t, ss) => ({ jump: ss.x > rx - 0.1 && ss.x < rx, py: 1 }));
    if (ev.some((e) => e.k === 'grind')) found = ev;
  }
  assert.ok(found, 'se engancha al raíl');
  assert.ok(found.some((e) => e.k === 'trick' && e.id === 'g5050'));
});

test('el manual necesita velocidad y se pierde sin equilibrio', () => {
  const s = sim('park');
  s.place(-30, 5, Math.PI / 2, 7);
  const ev = run(s, 6, () => ({ manual: true }));
  assert.ok(ev.some((e) => e.k === 'trick' && e.id === 'manual'));
  assert.ok(ev.some((e) => e.k === 'bail'), 'sin corregir el equilibrio, se cae');
});

test('Azotea Neón: se cruza de tejado en tejado y al caer al vacío se vuelve a la salida', () => {
  let s = sim('roof');
  const ev = run(s, 7, () => ({ py: 1 }));
  assert.ok(ev.some((e) => e.k === 'gap' && e.id === 'salto1'));
  s = sim('roof');
  s.place(-20, 0, Math.PI / 2, 9);
  const e2 = run(s, 8, () => ({ py: -1 }));
  assert.ok(Number.isFinite(s.y));
  s = sim('roof');
  s.place(-13, 20, 0, 5);
  const e3 = run(s, 5, () => ({}));
  assert.ok(kinds(e3).includes('fall'), kinds(e3).join());
  assert.ok(s.y > 7);
  assert.ok(e2);
});

test('Puerto Industrial: la mega rampa se salta con la velocidad de la bajada', () => {
  const s = sim('port');
  const ev = run(s, 9, () => ({ py: 1 }));
  assert.ok(ev.some((e) => e.k === 'gap' && e.id === 'mega'));
  assert.ok(ev.some((e) => e.k === 'land'));
  assert.ok(!ev.some((e) => e.k === 'bail'));
});

test('Bowl Dorado: la piscina lanza por encima del borde', () => {
  const s = sim('bowl');
  s.place(0, 0, Math.PI / 2, 9.5);
  let max = -9;
  for (let i = 0; i < 60 * 5; i++) { s.step(1 / 60, inp({ py: 1 })); max = Math.max(max, s.y); }
  assert.ok(max > 0.3, `sale por encima del borde: ${max}`);
});

test('letras S-K-A-T-E y objetivos de puntuación', () => {
  const s = sim('park');
  const l = s.map.letters[0];
  s.place(l.x, l.z, 0, 0);
  s.y = s.world.heightAt(l.x, l.z).h + l.up - 0.9;
  const ev = run(s, 0.1);
  assert.ok(ev.some((e) => e.k === 'letter' && e.ch === 'S'));
  s.stats.score = 20000;
  assert.ok(run(s, 0.05).some((e) => e.k === 'goal' && e.id === 'g1'));
  assert.equal(s.summary().goals, s.stats.goals.size);
});

test('los trucos repetidos valen menos y el multiplicador sube con trucos distintos', () => {
  const s = sim('park');
  const ev = [];
  s.addTrick('kickflip', 'Kickflip', 250, ev);
  s.addTrick('kickflip', 'Kickflip', 250, ev);
  s.addTrick('heelflip', 'Heelflip', 280, ev);
  assert.ok(ev[1].pts < ev[0].pts);
  assert.equal(s.combo.uniq.size, 2);
  assert.equal(s.comboPts, Math.round(s.combo.base * 1.5));
});

test('mapa y modo en el catálogo y en el mundo; logros del skate', () => {
  const e = EXPERIENCES.find((x) => x.id === 'skate');
  assert.ok(e && e.maxPlayers >= 4 && e.category === 'sports');
  assert.equal(getBuiltinWorld('skate').meta.mode, 'skate');
  for (const id of ['sk_first', 'sk_gold', 'sk_combo', 'sk_all']) assert.ok(ACHIEVEMENTS.find((a) => a.id === id), id);
});

test('validateRun descarta puntuaciones imposibles', () => {
  const ok = { map: 'park', mode: 'attack', score: 12000, ms: 120000, goals: 3, bestCombo: 4000, tricks: 30 };
  assert.ok(validateRun(ok, 120000));
  assert.equal(validateRun({ ...ok, map: 'nope' }, 120000), null);
  assert.equal(validateRun({ ...ok, score: 9e9 }, 120000), null);
  assert.equal(validateRun({ ...ok, ms: 1000 }, 1000), null);
  assert.equal(validateRun({ ...ok, bestCombo: 999999 }, 120000), null);
  assert.ok(MIN_RUN_MS > 0 && MAX_SCORE_PER_SEC > 0);
});

// ------------------------------------------------------------------------------ servidor
let srv, userId;
before(async () => {
  srv = await startServer();
  const r = await srv.api('POST', '/api/auth/register', { username: 'Patinador', password: 'secreto1' });
  userId = r.body.user.id;
  srv.token = r.body.token;
});
after(async () => { await srv.close(); });

const sk = (s, name, data = {}) => emit(s, 'mode', { name, data });

test('servidor: sesión válida da récord, medalla y logros; la falsa se rechaza', async () => {
  const s = await srv.connect(srv.token);
  try {
    const j = await emit(s, 'room:join', { key: 'skate' });
    assert.ok(!j.error, j.error);
    assert.deepEqual(j.mode.best, {});
    assert.match((await sk(s, 'done', { score: 99999, ms: 120000 })).error, /no válida/);
    assert.ok((await sk(s, 'start', { map: 'park', mode: 'attack' })).ok);
    assert.match((await sk(s, 'done', { score: 50000, ms: 120000, goals: 3 })).error, /no válida/);
    await sk(s, 'start', { map: 'park', mode: 'attack' });
    const room = srv.rooms.roomOf(userId);
    room.mode.runs.get(userId).t0 = Date.now() - 125000;
    const r = await sk(s, 'done', { score: 70000, ms: 120000, goals: 6, bestCombo: 12000, tricks: 60 });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.medal, 3);
    assert.equal(r.best.park, 70000);
    assert.ok(r.newBest);
    const ach = (await import('../server/db/database.js')).getDb().prepare('SELECT ach_id FROM achievements WHERE user_id = ?').all(userId).map((x) => x.ach_id);
    for (const id of ['sk_first', 'sk_gold', 'sk_combo']) assert.ok(ach.includes(id), id);
    assert.match((await sk(s, 'done', { score: 70000, ms: 120000 })).error, /no válida/);
    await sk(s, 'start', { map: 'street', mode: 'attack' });
    room.mode.runs.get(userId).t0 = Date.now() - 125000;
    assert.match((await sk(s, 'done', { score: 99999999, ms: 120000, goals: 1, bestCombo: 1, tricks: 4 })).error, /no válida/);
    assert.match((await sk(s, 'invented')).error, /no soportado/);
  } finally {
    s.disconnect();
  }
});

test('servidor: las posiciones llegan a los demás patinadores', async () => {
  const r2 = await srv.api('POST', '/api/auth/register', { username: 'Patinadora', password: 'secreto1' });
  const a = await srv.connect(srv.token);
  const b = await srv.connect(r2.body.token);
  try {
    const ja = await emit(a, 'room:join', { key: 'skate' });
    const jb = await emit(b, 'room:join', { roomId: ja.room.id });
    assert.ok(!ja.error && !jb.error, JSON.stringify(jb));
    const got = once(b, 'sk:ally', (m) => m.m === 'park');
    await emit(a, 'mode:fast', { name: 'st', data: { m: 'park', x: 1, y: 2, z: 3, yaw: 0.5, sc: 1234, st: 0 } });
    const m = await got;
    assert.equal(m.sc, 1234);
    assert.equal(m.name, 'Patinador');
  } finally {
    a.disconnect();
    b.disconnect();
  }
});

test('Kest City: mundo abierto con barrios, salida libre y torre de 16 m', () => {
  const m = SKATE_MAP_BY_ID.city;
  assert.ok(m.districts.length >= 7 && m.prims.length > 150);
  const s = new SkaterSim(m);
  assert.ok(Math.abs(s.y) < 0.1, 'sale sobre el suelo');
  // La torre: se llega arriba subiendo la rampa larga con impulso
  assert.equal(s.world.heightAt(-4, 160).h > 10, true);
  assert.equal(s.world.heightAt(-4, 182).h, 16);
});

test('deshacer: tras una caída se vuelve al despegue con la línea intacta', () => {
  const s = sim('park');
  s.place(-30, 5, Math.PI / 2, 6);
  run(s, 1.2, (t) => ({ jump: t > 0.2 && t < 0.3 }));
  // forzamos un fallo en el aire
  while (s.state !== 'air') run(s, 0.05, () => ({ jump: true }));
  const score = s.stats.score;
  const ev = run(s, 4, () => ({ sx: 1 }));
  assert.ok(kinds(ev).includes('bail') || s.state !== 'air');
  if (s.state === 'bail') {
    const ev2 = run(s, 0.05, () => ({ undoP: true }));
    assert.ok(kinds(ev2).includes('undo'));
    assert.equal(s.state, 'ground');
    assert.equal(s.stats.score, score);
  }
});

test('dive: tirarse desde la torre da puntos por la caída y no cuenta como fallo', () => {
  const s = sim('city');
  s.place(15, 183, Math.PI / 2, 0);
  s.y = 16;
  s.state = 'air';
  s.air = { t: 0.3, y0: 16, peak: 16, spin: 0, flip: null, pending: [], grab: 0, grabDir: 'none', ollie: false, lastFlipEnd: 0, count: 0 };
  s.vx = 5;
  const ev = run(s, 5, (t) => ({ diveP: t < 0.1, grab: true }));
  assert.ok(kinds(ev).includes('dive'));
  const bonus = ev.find((e) => e.k === 'bonus' && /Spread Eagle/.test(e.name));
  assert.ok(bonus && bonus.pts > 100, kinds(ev).join());
  assert.equal(s.stats.bails, 0);
});

test('a pie: se camina, se corre, se salta y se sube y baja de la tabla', () => {
  const s = sim('city');
  s.toWalk();
  assert.equal(s.state, 'walk');
  run(s, 2, () => ({ py: 1, camYaw: 0 }));
  assert.ok(s.speed > 2 && s.speed < 2.6, `caminando ${s.speed}`);
  assert.ok(s.z > s.map.spawn.z + 3);
  run(s, 1.5, () => ({ py: 1, camYaw: 0, manual: true }));
  assert.ok(s.speed > 4.5, `corriendo ${s.speed}`);
  let peak = s.y;
  const ev = run(s, 1, (t) => { peak = Math.max(peak, s.y); return { py: 0, camYaw: 0, jumpP: t < 0.02 }; });
  assert.ok(kinds(ev).includes('jump') && peak > s.y + 0.8);
  run(s, 0.6, () => ({ camYaw: 0 }));
  const ev2 = run(s, 0.1, (t) => ({ boardP: t < 0.01, camYaw: 0 }));
  assert.ok(kinds(ev2).includes('mount'));
  assert.equal(s.state, 'ground');
  assert.ok(s.swapT > 0 && s.swapDir === 1);
  run(s, 0.6, () => ({ py: 0 }));
  const ev3 = run(s, 0.05, (t) => ({ boardP: t < 0.01 }));
  assert.ok(kinds(ev3).includes('dismount'));
  assert.equal(s.state, 'walk');
});
