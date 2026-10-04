import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit, once, sleep } from './helpers.js';

let srv;
const tokens = {};

before(async () => {
  srv = await startServer();
});
after(async () => {
  await srv.close();
});

test('registro: valida datos y rechaza duplicados', async () => {
  let r = await srv.api('POST', '/api/auth/register', { username: 'ab', password: 'secreto1' });
  assert.equal(r.status, 400);
  r = await srv.api('POST', '/api/auth/register', { username: 'bad name!', password: 'secreto1' });
  assert.equal(r.status, 400);
  r = await srv.api('POST', '/api/auth/register', { username: 'Alice', password: 'secreto1' });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  assert.equal(r.body.user.username, 'Alice');
  assert.equal(r.body.user.coins, 100);
  assert.equal(r.body.user.pass_hash, undefined, 'nunca se expone el hash');
  tokens.alice = r.body.token;
  r = await srv.api('POST', '/api/auth/register', { username: 'alice', password: 'otraclave' });
  assert.equal(r.status, 400, 'nombre único sin distinguir mayúsculas');
  r = await srv.api('POST', '/api/auth/register', { username: 'Bob', password: 'secreto2' });
  tokens.bob = r.body.token;
  r = await srv.api('POST', '/api/auth/register', { username: 'Carol', password: 'secreto3' });
  tokens.carol = r.body.token;
});

test('inicio de sesión, recuperación de sesión y cierre', async () => {
  let r = await srv.api('POST', '/api/auth/login', { username: 'alice', password: 'mal' });
  assert.equal(r.status, 401);
  r = await srv.api('POST', '/api/auth/login', { username: 'alice', password: 'secreto1' });
  assert.equal(r.status, 200);
  const t = r.body.token;
  r = await srv.api('GET', '/api/auth/me', null, t);
  assert.equal(r.body.user.username, 'Alice');
  await srv.api('POST', '/api/auth/logout', null, t);
  r = await srv.api('GET', '/api/auth/me', null, t);
  assert.equal(r.status, 401);
  r = await srv.api('GET', '/api/profile', null, 'token-inventado');
  assert.equal(r.status, 401);
});

test('bloqueo tras varios intentos fallidos', async () => {
  await srv.api('POST', '/api/auth/register', { username: 'Victima', password: 'secreto1' });
  for (let i = 0; i < 5; i++) await srv.api('POST', '/api/auth/login', { username: 'victima', password: 'x' + i });
  const r = await srv.api('POST', '/api/auth/login', { username: 'victima', password: 'secreto1' });
  assert.equal(r.status, 429);
});

test('tienda y avatar: no se puede equipar lo que no se tiene', async () => {
  let r = await srv.api('PUT', '/api/avatar', { avatar: { accessories: ['acc_crown', 'acc_cap'], skin: '#123456', hair: 'hair_buzz' } }, tokens.alice);
  assert.deepEqual(r.body.avatar.accessories, ['acc_cap']);
  assert.equal(r.body.avatar.hair, 'hair_short');
  assert.equal(r.body.avatar.skin, '#123456');
  r = await srv.api('POST', '/api/shop/buy', { itemId: 'acc_crown' }, tokens.alice);
  assert.equal(r.status, 400, 'monedas insuficientes');
  r = await srv.api('POST', '/api/shop/buy', { itemId: 'hair_buzz' }, tokens.alice);
  assert.equal(r.status, 200);
  r = await srv.api('POST', '/api/shop/buy', { itemId: 'hair_buzz' }, tokens.alice);
  assert.equal(r.status, 400, 'no se compra dos veces');
  r = await srv.api('PUT', '/api/avatar', { avatar: { hair: 'hair_buzz' } }, tokens.alice);
  assert.equal(r.body.avatar.hair, 'hair_buzz');
  r = await srv.api('GET', '/api/profile', null, tokens.alice);
  // 100 iniciales - 60 + 10 (logro "De compras": 20 × COIN_RATE)
  assert.equal(r.body.user.coins, 50);
  assert.ok(r.body.user.achievements.some((a) => a.id === 'shopper'));
});

test('amigos: solicitud, aceptación, búsqueda y bloqueo', async () => {
  let r = await srv.api('GET', '/api/users?q=bo', null, tokens.alice);
  assert.ok(r.body.users.some((u) => u.username === 'Bob'));
  r = await srv.api('POST', '/api/friends/request', { username: 'bob' }, tokens.alice);
  assert.equal(r.status, 200);
  r = await srv.api('GET', '/api/friends', null, tokens.bob);
  assert.equal(r.body.incoming.length, 1);
  const aliceId = r.body.incoming[0].id;
  r = await srv.api('POST', '/api/friends/accept', { userId: aliceId }, tokens.bob);
  assert.equal(r.status, 200);
  r = await srv.api('GET', '/api/friends', null, tokens.alice);
  assert.equal(r.body.friends[0].username, 'Bob');
  // Carol bloquea a Alice: Alice no puede enviarle solicitudes
  const carol = (await srv.api('GET', '/api/profile', null, tokens.carol)).body.user;
  const alice = (await srv.api('GET', '/api/profile', null, tokens.alice)).body.user;
  await srv.api('POST', '/api/block', { userId: alice.id }, tokens.carol);
  r = await srv.api('POST', '/api/friends/request', { username: 'carol' }, tokens.alice);
  assert.equal(r.status, 400);
  assert.ok(carol.id);
});

test('mundos: guardar con validación, publicar y descubrir', async () => {
  let r = await srv.api('POST', '/api/worlds', { name: 'Mi Parkour' }, tokens.bob);
  const id = r.body.id;
  r = await srv.api('GET', `/api/worlds/${id}`, null, tokens.bob);
  const data = r.body.data;
  data.objects.push({ id: 'x', t: 'script', code: 'alert(1)' }); // tipo no permitido
  data.objects.push({ id: 'b2', t: 'block', p: [1e9, 'a', 0], s: [1, 1, 1], c: 'red' });
  r = await srv.api('PUT', `/api/worlds/${id}`, { data }, tokens.bob);
  assert.equal(r.status, 200);
  r = await srv.api('GET', `/api/worlds/${id}`, null, tokens.bob);
  assert.ok(!r.body.data.objects.some((o) => o.t === 'script'), 'se eliminan tipos desconocidos');
  const b2 = r.body.data.objects.find((o) => o.id === 'b2');
  assert.equal(b2.p[0], 1000);
  assert.equal(b2.c, '#8bc34a');
  // Demasiados objetos
  const big = { ...data, objects: Array.from({ length: 3000 }, (_, i) => ({ id: 'o' + i, t: 'block', p: [0, 0, 0] })) };
  r = await srv.api('PUT', `/api/worlds/${id}`, { data: big }, tokens.bob);
  assert.equal(r.status, 400);
  // Otro usuario no puede leerlo ni modificarlo
  r = await srv.api('GET', `/api/worlds/${id}`, null, tokens.alice);
  assert.equal(r.status, 400);
  r = await srv.api('POST', `/api/worlds/${id}/publish`, { name: 'Parkour de Bob', description: 'Salta', category: 'obby', visibility: 'public', maxPlayers: 8 }, tokens.bob);
  assert.equal(r.status, 200);
  assert.equal(r.body.version, 1);
  r = await srv.api('GET', '/api/discover?category=obby', null, tokens.alice);
  assert.ok(r.body.worlds.some((w) => w.name === 'Parkour de Bob' && w.creator === 'Bob'));
  assert.ok(r.body.worlds.some((w) => w.id === 'obby' && w.official));
  r = await srv.api('POST', `/api/favorites/${id}`, null, tokens.alice);
  assert.equal(r.body.favorite, true);
});

test('multijugador: los jugadores se ven, se mueven y chatean', async () => {
  const a = await srv.connect(tokens.alice);
  const b = await srv.connect(tokens.bob);
  try {
    const ja = await emit(a, 'room:join', { key: 'hangout' });
    assert.ok(ja.ok, JSON.stringify(ja));
    assert.equal(ja.world.builtin, 'hangout');
    const joinSeen = once(a, 'player:join', (p) => p.name === 'Bob');
    const jb = await emit(b, 'room:join', { key: 'hangout' });
    assert.equal(jb.room.id, ja.room.id, 'misma sala pública');
    assert.ok(jb.players.some((p) => p.name === 'Alice'));
    await joinSeen;

    // Movimiento válido se refleja en los snapshots del otro jugador
    const start = ja.you.spawn;
    a.emit('state', { p: [start[0] + 1, start[1], start[2]], ry: 1, a: 'walk' });
    const snap = await once(b, 'snap', (s) => s.players.some((p) => p.id !== jb.you.id && p.a === 'walk'));
    const pa = snap.players.find((p) => p.id === ja.you.id);
    assert.equal(pa.p[0], start[0] + 1);

    // Teletransporte imposible => corrección
    const corr = once(a, 'correction');
    a.emit('state', { p: [start[0] + 80, start[1], start[2]], ry: 0, a: 'run' });
    const c = await corr;
    assert.equal(c.p[0], start[0] + 1);

    // Chat con filtro de palabras y bloqueo de datos personales
    const msg = once(b, 'chat', (m) => m.kind === 'room');
    let r = await emit(a, 'chat', { text: 'hola eres un i.d.i.o.t.a' });
    assert.ok(r.ok);
    const m = await msg;
    assert.equal(m.from.name, 'Alice');
    assert.ok(!m.text.includes('i.d.i.o.t.a'));
    assert.ok(m.text.startsWith('hola eres un'));
    await sleep(750);
    r = await emit(a, 'chat', { text: 'mi numero es seis cinco cinco 1 2 3 4' });
    assert.ok(r.error);
    await sleep(750);
    r = await emit(a, 'chat', { text: 'visita www.ejemplo.com' });
    assert.ok(r.error);
    // Reportar un mensaje real del servidor
    r = await emit(b, 'report', { msgId: m.id, reason: 'insultos' });
    assert.ok(r.ok);
  } finally {
    a.disconnect();
    b.disconnect();
  }
});

test('obby: la meta no cuenta sin pasar los puntos de control', async () => {
  const a = await srv.connect(tokens.carol);
  try {
    const j = await emit(a, 'room:join', { key: 'obby' });
    assert.ok(j.ok);
    assert.equal(j.mode.obby.cp, 0);
    const { buildObby } = await import('../shared/worlds/obby.js');
    const w = buildObby();
    const cp1 = w.objects.find((o) => o.t === 'checkpoint' && o.n === 1);
    // Camina en pasos plausibles hasta el primer punto de control
    const from = j.you.spawn;
    const to = [cp1.p[0], cp1.p[1] + 1, cp1.p[2]];
    const got = once(a, 'obby', (d) => d.reached === 1, 6000);
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      a.emit('state', { p: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t], ry: 0, a: 'run' });
      await sleep(260);
    }
    const d = await got;
    assert.equal(d.cp, 1);
    const resp = await emit(a, 'respawn');
    assert.ok(Math.abs(resp.p[2] - cp1.p[2]) < 0.01, 'reaparece en el punto de control');
  } finally {
    a.disconnect();
  }
});

test('salas privadas: requieren código o invitación', async () => {
  const a = await srv.connect(tokens.alice);
  const b = await srv.connect(tokens.bob);
  const c = await srv.connect(tokens.carol);
  try {
    const ja = await emit(a, 'room:join', { key: 'city', private: true });
    assert.ok(ja.room.inviteCode);
    let r = await emit(c, 'room:join', { roomId: ja.room.id });
    assert.ok(r.error);
    r = await emit(c, 'room:join', { code: ja.room.inviteCode });
    assert.ok(r.ok);
    // Invitación a un amigo
    const inv = once(b, 'invite');
    const bobId = (await srv.api('GET', '/api/profile', null, tokens.bob)).body.user.id;
    r = await emit(a, 'invite', { userId: bobId });
    assert.ok(r.ok);
    const invite = await inv;
    r = await emit(b, 'room:join', { roomId: invite.roomId });
    assert.ok(r.ok);
    assert.equal(r.room.id, ja.room.id);
  } finally {
    a.disconnect();
    b.disconnect();
    c.disconnect();
  }
});

test('vehículos: entrar, ocupado y salir', async () => {
  const a = await srv.connect(tokens.alice);
  const b = await srv.connect(tokens.bob);
  try {
    const ja = await emit(a, 'room:join', { key: 'city' });
    const jb = await emit(b, 'room:join', { roomId: ja.room.id });
    assert.ok(jb.ok);
    const car = ja.vehicles.find((v) => v.id === 'car1');
    let r = await emit(a, 'vehicle:enter', { id: 'car1' });
    assert.ok(r.error, 'demasiado lejos desde el punto de aparición');
    // Coloca a ambos junto al coche mediante el servidor (prueba interna)
    const room = srv.rooms.roomOf(ja.you.id);
    room.teleport(room.players.get(ja.you.id), car.p);
    room.teleport(room.players.get(jb.you.id), car.p);
    r = await emit(a, 'vehicle:enter', { id: 'car1' });
    assert.ok(r.ok);
    r = await emit(b, 'vehicle:enter', { id: 'car1' });
    assert.ok(r.error, 'ocupado');
    r = await emit(a, 'vehicle:exit');
    assert.ok(r.ok);
    r = await emit(b, 'vehicle:enter', { id: 'car1' });
    assert.ok(r.ok);
  } finally {
    a.disconnect();
    b.disconnect();
  }
});

test('progresión persistente: experiencia, nivel y logros', async () => {
  const users = await import('../server/services/users.js');
  const p = (await srv.api('GET', '/api/profile', null, tokens.carol)).body.user;
  users.award(p.id, { xp: 1000, coins: 5 });
  const after = (await srv.api('GET', '/api/profile', null, tokens.carol)).body.user;
  assert.ok(after.level > p.level);
  assert.ok(after.coins > p.coins + 5, 'recompensa por subir de nivel');
  assert.ok(after.achievements.some((a) => a.id === 'first_steps'));
  assert.ok(after.history.length >= 1);
});

test('moderación: reportes, silenciar y ocultar mundos', async () => {
  const { getDb } = await import('../server/db/database.js');
  const alice = (await srv.api('GET', '/api/profile', null, tokens.alice)).body.user;
  const bob = (await srv.api('GET', '/api/profile', null, tokens.bob)).body.user;
  // Un usuario normal no accede al panel
  let r = await srv.api('GET', '/api/admin/reports', null, tokens.alice);
  assert.equal(r.status, 403);
  getDb().prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(alice.id);
  r = await srv.api('GET', '/api/admin/reports', null, tokens.alice);
  assert.equal(r.status, 200);
  assert.ok(r.body.reports.length >= 1, 'el reporte del chat aparece');
  // Silenciar a Bob: su chat queda bloqueado
  await srv.api('POST', `/api/admin/users/${bob.id}/mute`, { minutes: 5 }, tokens.alice);
  const b = await srv.connect(tokens.bob);
  try {
    await emit(b, 'room:join', { key: 'hangout' });
    const c = await emit(b, 'chat', { text: 'hola' });
    assert.match(c.error, /silenciado/);
  } finally {
    b.disconnect();
  }
  // Ocultar el mundo de Bob lo retira de Descubrir
  const mine = (await srv.api('GET', '/api/worlds/mine', null, tokens.bob)).body.worlds[0];
  await srv.api('POST', `/api/admin/worlds/${mine.id}/hide`, { hidden: true }, tokens.alice);
  r = await srv.api('GET', '/api/discover', null, tokens.carol);
  assert.ok(!r.body.worlds.some((w) => w.id === mine.id));
  const first = (await srv.api('GET', '/api/admin/reports', null, tokens.alice)).body.reports[0];
  r = await srv.api('POST', `/api/admin/reports/${first.id}/resolve`, {}, tokens.alice);
  assert.equal(r.status, 200);
});

test('NPC: pasean, se ven en la sala y responden al hablarles', async () => {
  const a = await srv.connect(tokens.carol);
  try {
    const j = await emit(a, 'room:join', { key: 'hangout' });
    const npcs = j.players.filter((p) => p.npc);
    assert.equal(npcs.length, 7);
    const snap1 = await once(a, 'snap');
    await sleep(1200);
    const snap2 = await once(a, 'snap');
    const moved = npcs.some((n) => {
      const p1 = snap1.players.find((p) => p.id === n.id).p, p2 = snap2.players.find((p) => p.id === n.id).p;
      return Math.hypot(p1[0] - p2[0], p1[2] - p2[2]) > 0.1;
    });
    assert.ok(moved, 'algún NPC se mueve');
    // Lejos: no se puede hablar
    let r = await emit(a, 'npc', { id: npcs[0].id, action: 'hola' });
    assert.ok(r.error);
    // Cerca: responde con frase y opciones
    const room = srv.rooms.roomOf(j.you.id);
    const n = room.npcs.npcs[0];
    room.teleport(room.players.get(j.you.id), [n.pos[0] + 1, n.pos[1], n.pos[2]]);
    r = await emit(a, 'npc', { id: n.id, action: 'hola' });
    assert.ok(r.ok && r.say.includes(n.name));
    assert.equal(r.options.length, 5);
    r = await emit(a, 'npc', { id: n.id, action: 'sigue' });
    assert.equal(n.state, 'follow');
  } finally {
    a.disconnect();
  }
});
