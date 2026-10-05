// Modo desarrollador: cuenta del dueño, poderes de administrador y economía de Kesty Coins.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.OWNER_USERNAME = 'Jefe';
process.env.OWNER_PASSWORD = 'clave-de-prueba';
const { startServer, emit, once, sleep } = await import('./helpers.js');

let srv, admin, player, playerId;

before(async () => {
  srv = await startServer();
  await srv.ownerReady;
  let r = await srv.api('POST', '/api/auth/login', { username: 'Jefe', password: 'clave-de-prueba' });
  assert.equal(r.status, 200, 'la cuenta del dueño existe y entra con la contraseña del entorno');
  assert.equal(r.body.user.role, 'admin');
  admin = r.body.token;
  r = await srv.api('POST', '/api/auth/register', { username: 'Jugador1', password: 'secreto1' });
  player = r.body.token;
  playerId = r.body.user.id;
});
after(async () => {
  await srv.close();
});

test('el nombre del dueño no se puede registrar y un jugador normal no tiene poderes', async () => {
  const r = await srv.api('POST', '/api/auth/register', { username: 'jefe', password: 'otraclave1' });
  assert.equal(r.status, 400);
  const s = await srv.connect(player);
  try {
    const res = await emit(s, 'admin', { action: 'closeAll' });
    assert.equal(res.error, 'Solo administradores');
  } finally {
    s.disconnect();
  }
});

test('admin: ver servidores, espectear invisible, congelar, matar, hacer perder y cerrar', async () => {
  const a = await srv.connect(admin);
  const p = await srv.connect(player);
  try {
    await emit(p, 'room:join', { key: 'obby' });
    let r = await emit(a, 'admin', { action: 'overview' });
    assert.equal(r.rooms.length, 1);
    assert.equal(r.rooms[0].players[0].name, 'Jugador1');
    const roomId = r.rooms[0].id;

    r = await emit(a, 'admin', { action: 'spectate', userId: playerId });
    assert.ok(r.ok && r.you.spectator, JSON.stringify(r));
    assert.equal(r.target, playerId);
    const room = srv.rooms.rooms.get(roomId);
    assert.equal(room.players.size, 1, 'el espectador no cuenta como jugador');
    assert.equal(room.spectators.size, 1);

    let ev = once(p, 'admin:freeze');
    await emit(a, 'admin', { action: 'freeze', userId: playerId, on: true });
    assert.equal((await ev).on, true);

    ev = once(p, 'admin:control');
    r = await emit(a, 'admin', { action: 'control', userId: playerId, on: true });
    assert.ok(r.ok, JSON.stringify(r));
    await ev;
    ev = once(p, 'admin:ctl');
    a.emit('admin:ctl', { target: playerId, x: 0, y: 1, yaw: 0.5, run: true });
    const ctl = await ev;
    assert.equal(ctl.y, 1);
    assert.equal(ctl.run, true);

    ev = once(p, 'admin:kill');
    await emit(a, 'admin', { action: 'kill', userId: playerId });
    await ev;

    ev = once(p, 'admin:lose');
    await emit(a, 'admin', { action: 'lose', userId: playerId });
    assert.equal((await ev).handled, true, 'en el obby perder reinicia el recorrido');

    ev = once(p, 'kicked');
    r = await emit(a, 'admin', { action: 'closeRoom', roomId });
    assert.equal(r.players, 1);
    assert.match((await ev).reason, /cerrado/);
    assert.equal(srv.rooms.rooms.size, 0);
  } finally {
    a.disconnect();
    p.disconnect();
  }
});

test('admin: mantenimiento bloquea la entrada y los anuncios llegan a todos', async () => {
  const a = await srv.connect(admin);
  const p = await srv.connect(player);
  try {
    await emit(a, 'admin', { action: 'closeAll', maintenance: true });
    let r = await emit(p, 'room:join', { key: 'city' });
    assert.match(r.error, /mantenimiento/);
    await emit(a, 'admin', { action: 'maintenance', on: false });
    r = await emit(p, 'room:join', { key: 'city' });
    assert.ok(r.ok);
    const ev = once(p, 'announce');
    await emit(a, 'admin', { action: 'announce', text: '¡Evento a las 6!' });
    assert.equal((await ev).text, '¡Evento a las 6!');
  } finally {
    a.disconnect();
    p.disconnect();
  }
});

test('Kesty Coins: recompensa diaria, ruleta, códigos regalo y regalos del admin', async () => {
  const before = (await srv.api('GET', '/api/profile', null, player)).body.user.coins;
  let r = await srv.api('POST', '/api/rewards/daily', {}, player);
  assert.equal(r.body.coins, 10);
  r = await srv.api('POST', '/api/rewards/daily', {}, player);
  assert.equal(r.status, 400, 'solo una vez al día');
  r = await srv.api('POST', '/api/rewards/spin', {}, player);
  assert.ok(r.body.coins > 0);
  const spun = r.body.coins;
  r = await srv.api('POST', '/api/rewards/spin', {}, player);
  assert.equal(r.status, 400);

  const a = await srv.connect(admin);
  try {
    r = await emit(a, 'admin', { action: 'createCode', code: 'FIESTA-1', coins: 250, uses: 1 });
    assert.ok(r.ok);
    r = await emit(a, 'admin', { action: 'coins', username: 'Jugador1', amount: 40 });
    assert.ok(r.ok);
  } finally {
    a.disconnect();
  }
  r = await srv.api('POST', '/api/codes/redeem', { code: 'fiesta-1' }, player);
  assert.equal(r.body.coins, 250);
  r = await srv.api('POST', '/api/codes/redeem', { code: 'FIESTA-1' }, player);
  assert.equal(r.status, 400);
  const after = (await srv.api('GET', '/api/profile', null, player)).body.user.coins;
  assert.ok(after >= before + 10 + spun + 250 + 40, `${before} -> ${after}`);
  await sleep(10);
});

test('modo admin con contraseña, baneo temporal y permanente, regalos y susto', async () => {
  // Un jugador normal activa el modo admin con la contraseña del dueño
  let r = await srv.api('POST', '/api/auth/register', { username: 'Ayudante', password: 'secreto1' });
  const helper = r.body.token;
  r = await srv.api('POST', '/api/admin/unlock', { password: 'mal' }, helper);
  assert.equal(r.status, 403);
  r = await srv.api('POST', '/api/admin/unlock', { password: 'clave-de-prueba' }, helper);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'admin');
  assert.equal(r.body.user.adminTemp, true);

  r = await srv.api('POST', '/api/auth/register', { username: 'Travieso', password: 'secreto1' });
  const victimId = r.body.user.id;
  const v = await srv.connect(r.body.token);
  const a = await srv.connect(helper);
  try {
    // Susto
    const scare = once(v, 'admin:jumpscare');
    r = await emit(a, 'admin', { action: 'jumpscare', userId: victimId });
    assert.ok(r.ok, JSON.stringify(r));
    await scare;
    // Regalar todos los objetos de la tienda
    r = await emit(a, 'admin', { action: 'giveItem', username: 'Travieso', itemId: 'all' });
    assert.ok(r.added > 50, JSON.stringify(r));
    // Baneo permanente: le echa y no puede volver a entrar
    const kicked = once(v, 'kicked');
    r = await emit(a, 'admin', { action: 'ban', userId: victimId, perma: true });
    assert.ok(r.ok && r.perma, JSON.stringify(r));
    assert.match((await kicked).reason, /para siempre/);
    r = await srv.api('POST', '/api/auth/login', { username: 'Travieso', password: 'secreto1' });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /para siempre/);
    // No se puede banear al dueño
    r = await emit(a, 'admin', { action: 'ban', username: 'Jefe', hours: 1 });
    assert.ok(r.error);
    // Desbanear
    r = await emit(a, 'admin', { action: 'unban', username: 'Travieso' });
    assert.ok(r.ok);
    r = await srv.api('POST', '/api/auth/login', { username: 'Travieso', password: 'secreto1' });
    assert.equal(r.status, 200);
    // Baneo temporal
    r = await emit(a, 'admin', { action: 'ban', username: 'Travieso', hours: 1 });
    assert.ok(r.ok && !r.perma);
    r = await srv.api('POST', '/api/auth/login', { username: 'Travieso', password: 'secreto1' });
    assert.match(r.body.error, /min más/);
  } finally {
    a.disconnect();
    v.disconnect();
  }
});
