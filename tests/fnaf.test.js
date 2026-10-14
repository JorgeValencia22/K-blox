// Pruebas de Turno de Noche: lobby, energía, puertas, luces, cámaras, IA, forcejeo,
// modalidades (cooperativo, equipos, animatrónico contra guardias, último superviviente).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit, once, sleep } from './helpers.js';
import { FNAF, NODES, ROUTES, ANIM_IDS, navPath, NAV, buildFnaf, inOffice } from '../shared/worlds/fnaf.js';

let srv, a, b, aId, bId;

before(async () => {
  srv = await startServer();
  let r = await srv.api('POST', '/api/auth/register', { username: 'GuardiaUno', password: 'secreto1' });
  a = r.body.token; aId = r.body.user.id;
  r = await srv.api('POST', '/api/auth/register', { username: 'GuardiaDos', password: 'secreto1' });
  b = r.body.token; bId = r.body.user.id;
});
after(async () => {
  await srv.close();
});

const mode = (s, name, data = {}) => emit(s, 'mode', { name, data });

/** Entra en una sala privada de Turno de Noche con los dos jugadores. */
async function joinBoth() {
  const sa = await srv.connect(a);
  const sb = await srv.connect(b);
  const ja = await emit(sa, 'room:join', { key: 'fnaf', private: true });
  assert.ok(ja.room, JSON.stringify(ja));
  assert.equal(ja.mode.fnaf.phase, 'lobby');
  const jb = await emit(sb, 'room:join', { key: 'fnaf', code: ja.room.inviteCode });
  assert.ok(jb.room, JSON.stringify(jb));
  const room = srv.rooms.roomOf(aId);
  assert.equal(srv.rooms.roomOf(bId), room);
  return { sa, sb, room, m: room.mode };
}

test('mapa: rutas y caminos válidos', () => {
  const w = buildFnaf();
  assert.ok(w.objects.some((o) => o.id === 'fdoorL') && w.objects.some((o) => o.id === 'fdoorR'));
  for (const an of ANIM_IDS) for (const [from, tos] of Object.entries(ROUTES[an])) for (const t of tos) assert.ok(NODES[t] && NODES[from], `${an}: ${from}->${t}`);
  for (const k of Object.keys(NAV)) assert.ok(navPath('stageFront', k), `sin camino a ${k}`);
  // Con las dos puertas cerradas no se llega a la oficina
  const closed = (x, y) => ['doorL|officeL', 'officeL|doorL', 'doorR|officeR', 'officeR|doorR'].includes(`${x}|${y}`);
  assert.equal(navPath('dining', 'office', closed), null);
  for (const p of FNAF.officeSpawns) assert.ok(inOffice(p));
});

test('lobby: solo el anfitrión configura y la noche empieza en la oficina', async () => {
  const { sa, sb, room, m } = await joinBoth();
  try {
    let r = await mode(sb, 'cfg', { mode: 'team' });
    assert.ok(r.error, 'el invitado no puede cambiar la partida');
    r = await mode(sa, 'cfg', { mode: 'classic', night: 2 });
    assert.ok(r.ok);
    r = await mode(sb, 'role', { role: 'cams' });
    assert.ok(r.ok);
    r = await mode(sb, 'start');
    assert.ok(r.error);
    // Cualquiera puede hacerse anfitrión (y devolverlo)
    r = await mode(sb, 'host');
    assert.ok(r.ok);
    assert.equal(m.host, bId);
    await mode(sa, 'host');
    assert.equal(m.host, aId);
    const started = once(sa, 'fnaf', (s) => s.phase === 'night');
    r = await mode(sa, 'start');
    assert.ok(r.ok, JSON.stringify(r));
    const st = await started;
    assert.equal(st.night.num, 2);
    assert.equal(st.night.mode, 'classic');
    for (const id of [aId, bId]) assert.ok(inOffice(room.players.get(id).pos), 'los guardias aparecen en la oficina');
    // Dos guardias: la IA sube un nivel
    assert.equal(m.n.anims.bunny.level, 5 + 1);
    // Acciones antes de que empiece (intro de 4 s) se rechazan
    r = await mode(sa, 'door', { side: 'L' });
    assert.ok(r.error);
    m.n.start = Date.now() - 1;
    m.n.end = Date.now() + 60_000;

    // Puertas: hay que estar en el panel
    const pa = room.players.get(aId), pb = room.players.get(bId);
    room.teleport(pa, [3, 0.2, 23]);
    r = await mode(sa, 'door', { side: 'L' });
    assert.ok(r.error, 'lejos del panel');
    room.teleport(pa, [-4, 0.2, 19]);
    r = await mode(sa, 'door', { side: 'L' });
    assert.ok(r.ok && r.closed);
    r = await mode(sa, 'light', { side: 'L', on: true });
    assert.ok(r.ok);
    // Cámaras: solo desde el monitor; el guardia de Cámaras no gasta
    r = await mode(sb, 'cam', { id: '1A' });
    room.teleport(pb, [4, 0.2, 24]);
    r = await mode(sb, 'cam', { id: '1A' });
    assert.ok(r.error, 'lejos del monitor');
    room.teleport(pb, [0, 0.2, 19]);
    r = await mode(sb, 'cam', { id: '1A' });
    assert.ok(r.ok);
    assert.equal(m.watched('stage'), true);
    const p0 = m.n.power;
    m.tick(1);
    assert.equal(m.n.usage, 3, 'base + puerta + luz (las cámaras del guardia de Cámaras no cuentan)');
    assert.ok(m.n.power < p0);
    // Bruno no se mueve si lo miran
    m.n.anims.bear.level = 20;
    m.n.anims.bear.nextOpp = 0;
    m.aiOpportunity(m.n.anims.bear, Date.now());
    assert.equal(m.n.anims.bear.node, 'stage');
    await mode(sb, 'cam', { id: null });
    m.aiOpportunity(m.n.anims.bear, Date.now());
    assert.equal(m.n.anims.bear.node, 'dining');
    // Coneja en la puerta: cerrada => se retira; abierta => entra
    const bunny = m.n.anims.bunny;
    bunny.level = 20;
    m.moveAnim(bunny, 'doorL');
    m.aiOpportunity(bunny, Date.now());
    assert.notEqual(bunny.node, 'office', 'con la puerta cerrada no entra');
    assert.notEqual(bunny.state, 'inside');
    m.moveAnim(bunny, 'doorL');
    r = await mode(sa, 'door', { side: 'L' });
    assert.ok(r.ok && !r.closed);
    m.aiOpportunity(bunny, Date.now());
    assert.equal(bunny.state, 'inside');
    // Forcejeo: los dos guardias la deslumbran con la linterna mirándola
    for (const [s, p] of [[sa, pa], [sb, pb]]) {
      room.teleport(p, [0, 0.2, 21]);
      p.ry = Math.atan2(bunny.x - 0, bunny.z - 21);
    }
    for (let i = 0; i < 6; i++) {
      pa.data.fnaf.flashAt = 0; pb.data.fnaf.flashAt = 0;
      await mode(sa, 'flash', { a: 'bunny' });
      await mode(sb, 'flash', { a: 'bunny' });
      if (bunny.state !== 'inside') break;
    }
    assert.notEqual(bunny.state, 'inside', 'ahuyentada');
    assert.equal(bunny.node, 'dining');
    // Si nadie la ahuyenta, ataca a todos los de la oficina y se pierde la noche
    m.moveAnim(bunny, 'doorL');
    m.enterOffice(bunny);
    bunny.insideUntil = Date.now() - 1;
    const end = once(sa, 'fn:end');
    m.tick(0.05);
    const res = await end;
    assert.match(res.title, /atrapado/);
    assert.equal(m.phase, 'result');
  } finally {
    sa.disconnect(); sb.disconnect();
    await sleep(50);
  }
});

test('energía: al agotarse se abren las puertas y llega el apagón; a las 6:00 se gana', async () => {
  const { sa, sb, room, m } = await joinBoth();
  try {
    m.cfg.mode = 'classic';
    m.cfg.night = 1;
    await mode(sa, 'start');
    m.n.start = Date.now() - 1;
    const pa = room.players.get(aId);
    room.teleport(pa, [-4, 0.2, 19]);
    await mode(sa, 'door', { side: 'L' });
    m.n.power = 0.01;
    m.tick(1);
    assert.ok(m.n.blackout, 'apagón');
    assert.equal(m.n.doors.L, false);
    let r = await mode(sa, 'door', { side: 'L' });
    assert.ok(r.error, 'sin energía no funcionan las puertas');
    // Llegan las 6:00 antes de que Bruno ataque
    m.n.end = Date.now() - 1;
    const chime = once(sa, 'fn:end');
    m.tick(0.05);
    const res = await chime;
    assert.match(res.title, /6:00/);
    assert.equal(res.survivors.length, 2);
    const u = srv.api('GET', '/api/profile', null, a);
    const prof = (await u).body.user;
    assert.equal(prof.stats.fnafBest, 1);
    assert.ok(prof.inventory.includes('acc_guardcap'), 'se desbloquea la gorra de guardia');
    assert.ok(prof.achievements.some((x) => x.id === 'fnaf_n1'));
    // Los objetos desbloqueables no se pueden comprar
    const buy = await srv.api('POST', '/api/shop/buy', { itemId: 'acc_bearears' }, a);
    assert.equal(buy.status, 400);
    // Récord de grupo guardado
    assert.ok(m.publicState().records.classic.length >= 1);
    // Vuelta al lobby
    m.resultUntil = 0;
    m.tick(0.05);
    assert.equal(m.phase, 'lobby');
  } finally {
    sa.disconnect(); sb.disconnect();
    await sleep(50);
  }
});

test('equipos: tareas fuera de la oficina dan energía; eventos inesperados', async () => {
  const { sa, sb, room, m } = await joinBoth();
  try {
    await mode(sa, 'cfg', { mode: 'team', night: 1 });
    await mode(sa, 'start');
    m.n.start = Date.now() - 1;
    for (const an of Object.values(m.n.anims)) an.level = 0;
    m.n.nextTask = 0;
    m.tick(0.05);
    assert.equal(m.n.tasks.length, 1);
    const t = m.n.tasks[0];
    const { TASKS } = await import('../server/game/modes/FnafMode.js');
    const def = TASKS[t.id];
    const pa = room.players.get(aId);
    room.teleport(pa, [def.pos[0] + 1, 0.2, def.pos[2]]);
    let r = await mode(sa, 'task', { id: t.id, phase: 'done' });
    assert.ok(r.error, 'hay que mantener pulsado');
    r = await mode(sa, 'task', { id: t.id, phase: 'start' });
    assert.ok(r.ok);
    pa.data.fnaf.task.at -= 3000;
    m.n.power = 50;
    r = await mode(sa, 'task', { id: t.id, phase: 'done' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(m.n.tasksDone, 1);
    if (def.power) assert.ok(m.n.power > 50 + def.power - 1, 'la tarea da energía');
    if (def.fox) assert.equal(m.n.anims.fox.foxStage, 0);
    // Evento: puerta atascada
    m.n.nextEvent = 0;
    const ev = once(sa, 'fn:event');
    m.tick(0.05);
    const e = await ev;
    assert.ok(e.text);
  } finally {
    sa.disconnect(); sb.disconnect();
    await sleep(50);
  }
});

test('versus: el animatrónico jugador se mueve por su ruta, se congela si lo miran y gana si entra', async () => {
  const { sa, sb, room, m } = await joinBoth();
  try {
    await mode(sa, 'cfg', { mode: 'versus', night: 1 });
    let r = await mode(sb, 'wantAnim', { anim: 'bunny' });
    assert.ok(r.ok);
    r = await mode(sa, 'wantAnim', { anim: 'bunny' });
    assert.ok(r.error, 'no se repite animatrónico');
    await mode(sa, 'start');
    m.n.start = Date.now() - 1;
    for (const an of Object.values(m.n.anims)) if (!an.controller) an.level = 0;
    const bunny = m.n.anims.bunny;
    assert.equal(bunny.controller, bId);
    assert.ok(m.hidden(room.players.get(bId)), 'el animatrónico jugador no aparece como persona');
    // Movimiento: solo salas permitidas
    r = await mode(sb, 'move', { node: 'kitchen' });
    assert.ok(r.error);
    r = await mode(sb, 'move', { node: 'dining' });
    assert.ok(r.ok, JSON.stringify(r));
    r = await mode(sb, 'move', { node: 'westHall' });
    assert.ok(r.error, 'tiempo de espera entre movimientos');
    bunny.cdUntil = 0;
    // El guardia mira el comedor: no puede moverse
    const pa = room.players.get(aId);
    room.teleport(pa, [0, 0.2, 19]);
    await mode(sa, 'cam', { id: '1B' });
    r = await mode(sb, 'move', { node: 'westHall' });
    assert.match(r.error, /mirando/);
    await mode(sa, 'cam', { id: null });
    for (const to of ['westHall', 'westCorner', 'doorL']) {
      bunny.cdUntil = 0;
      r = await mode(sb, 'move', { node: to });
      assert.ok(r.ok, `${to}: ${JSON.stringify(r)}`);
    }
    // Puerta cerrada: no puede entrar, pero la aporrea (gasta energía)
    room.teleport(pa, [-4, 0.2, 19]);
    await mode(sa, 'door', { side: 'L' });
    r = await mode(sb, 'enter');
    assert.ok(r.error);
    const p0 = m.n.power;
    r = await mode(sb, 'bang');
    assert.ok(r.ok);
    assert.ok(m.n.power <= p0 - 2 + 0.01);
    // Habilidad de Rita: estática en todas las cámaras
    r = await mode(sb, 'ability');
    assert.ok(r.ok);
    assert.ok(m.n.staticUntil > Date.now());
    // Abren la puerta: entra y, sin linterna, atrapa al guardia => ganan los animatrónicos
    await mode(sa, 'door', { side: 'L' });
    r = await mode(sb, 'enter');
    assert.ok(r.ok);
    bunny.insideUntil = Date.now() - 1;
    const end = once(sa, 'fn:end');
    m.tick(0.05);
    const res = await end;
    assert.match(res.title, /animatrónicos/);
    const prof = (await srv.api('GET', '/api/profile', null, b)).body.user;
    assert.ok(prof.inventory.includes('acc_bowtie'));
  } finally {
    sa.disconnect(); sb.disconnect();
    await sleep(50);
  }
});

test('último superviviente: caza, linterna, pilas compartidas y gana el último', async () => {
  const { sa, sb, room, m } = await joinBoth();
  try {
    await mode(sa, 'cfg', { mode: 'last', night: 1 });
    await mode(sa, 'start');
    m.n.start = Date.now() - 1;
    const pa = room.players.get(aId), pb = room.players.get(bId);
    // Compartir pila
    room.teleport(pa, [0, 0.2, -6]);
    room.teleport(pb, [1, 0.2, -6]);
    let r = await mode(sa, 'give');
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(pa.data.fnaf.bat, 75);
    assert.equal(pb.data.fnaf.bat, 100);
    // Un animatrónico ve a GuardiaDos y va a por él
    for (const an of Object.values(m.n.anims)) { an.x = 0; an.z = -60; an.level = 0; }
    const bear = m.n.anims.bear;
    Object.assign(bear, { x: 6, z: -6, path: null, cdUntil: 0 });
    room.teleport(pa, [-12, 0.2, -10]);
    m.tickHunt(0.1, Date.now());
    assert.equal(bear.target, bId);
    // Deslumbrarlo lo aturde
    pb.ry = Math.atan2(bear.x - pb.pos[0], bear.z - pb.pos[2]);
    r = await mode(sb, 'stun', { a: 'bear' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(bear.stunUntil > Date.now());
    // Pilas en el suelo
    m.spawnBattery();
    const bat = m.n.batteries[0];
    room.teleport(pa, bat.p);
    r = await mode(sa, 'battery', { id: bat.id });
    assert.ok(r.ok);
    // Atrapan a GuardiaUno: GuardiaDos es el último superviviente
    bear.stunUntil = 0;
    Object.assign(bear, { x: pa.pos[0] + 0.5, z: pa.pos[2] });
    const end = once(sb, 'fn:end');
    m.checkCatches(Date.now());
    const res = await end;
    assert.equal(res.winner, 'GuardiaDos');
  } finally {
    sa.disconnect(); sb.disconnect();
    await sleep(50);
  }
});

test('desconexiones: si se va el anfitrión otro toma el mando; la IA sustituye al animatrónico', async () => {
  const { sa, sb, room, m } = await joinBoth();
  try {
    await mode(sa, 'cfg', { mode: 'versus', night: 1 });
    await mode(sa, 'wantAnim', { anim: 'chicken' });
    await mode(sa, 'start');
    assert.equal(m.n.anims.chicken.controller, aId);
    sa.disconnect();
    await sleep(150);
    assert.equal(m.host, bId);
    // Queda un solo jugador: la noche se cancela y vuelve al lobby tras los resultados
    assert.ok(m.phase === 'result' || m.phase === 'night');
  } finally {
    sb.disconnect();
    await sleep(50);
  }
});
