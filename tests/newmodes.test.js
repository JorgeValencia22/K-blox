// Pruebas de Silencio Mortal, Desastres Naturales, Mi Huerto y Bloques Locos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit, once, sleep } from './helpers.js';
import { tilePos, SHOP_POS } from '../shared/worlds/huerto.js';
import { BLOQUES, tileCenter } from '../shared/worlds/bloques.js';

let srv, token, userId;

before(async () => {
  srv = await startServer();
  const r = await srv.api('POST', '/api/auth/register', { username: 'Probador2', password: 'secreto1' });
  token = r.body.token;
  userId = r.body.user.id;
});
after(async () => {
  await srv.close();
});
const roomOf = () => srv.rooms.roomOf(userId);

test('Pesadilla: el ruido atrae al Oyente y las tareas abren la puerta', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'pesadilla' });
    assert.equal(j.mode.pesadilla.total, 3);
    const room = roomOf();
    const mode = room.mode;
    const p = room.players.get(userId);
    const meta = room.world.meta;
    // Un grito cerca del monstruo hace que venga a por ti
    room.teleport(p, [mode.mon.x - 6, 0.2, mode.mon.z]);
    const heard = once(s, 'pesadilla:heard');
    await emit(s, 'mode', { name: 'noise', data: { l: 0.9 } });
    await heard;
    assert.equal(mode.mon.state, 'chase');
    mode.mon.retreatUntil = Date.now() + 60000; // que no nos atrape durante la prueba
    // La llave no se puede coger sin luz
    let r = await emit(s, 'mode', { name: 'pick', data: { id: 'key' } });
    assert.ok(r.error);
    for (const f of meta.fuses) {
      room.teleport(p, f.p);
      p.data.noiseAt = 0;
      r = await emit(s, 'mode', { name: 'pick', data: { id: f.id } });
      assert.ok(r.ok, JSON.stringify(r));
    }
    room.teleport(p, [meta.fuseBox.p[0], 0.2, meta.fuseBox.p[2] + 1]);
    r = await emit(s, 'mode', { name: 'fusebox' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(room.state.groups.power, true);
    room.teleport(p, meta.key.p);
    r = await emit(s, 'mode', { name: 'pick', data: { id: 'key' } });
    assert.ok(r.ok, JSON.stringify(r));
    room.teleport(p, [meta.door.p[0], 0.2, meta.door.p[2] - 1.5]);
    r = await emit(s, 'mode', { name: 'door' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(mode.doorOpen, true);
    // Esconderse en un armario
    const c = meta.closets[0];
    room.teleport(p, [c.p[0] + 1.5, 0.2, c.p[2]]);
    r = await emit(s, 'mode', { name: 'hide', data: { id: c.id, on: true } });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(p.data.hidden, c.id);
  } finally {
    s.disconnect();
  }
});

test('Desastres: la ronda empieza, quien muere vuelve a la sala y los supervivientes ganan', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'desastres' });
    const mode = roomOf().mode;
    mode.until = Date.now() - 1;
    mode.tick(0.1);
    assert.equal(mode.phase, 'disaster');
    assert.ok(mode.alive.has(userId));
    const r = await emit(s, 'mode', { name: 'died', data: { cause: 'lava' } });
    assert.ok(r.p, 'te devuelve a la sala de espera');
    assert.equal(mode.alive.has(userId), false);
    mode.tick(0.1);
    assert.equal(mode.phase, 'result', 'sin supervivientes la ronda termina');
  } finally {
    s.disconnect();
  }
});

test('Huerto: comprar, plantar, cosechar y vender; el huerto se guarda', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'huerto' });
    const k = j.mode.huerto.me.k;
    assert.equal(k, 0);
    const room = roomOf();
    const p = room.players.get(userId);
    room.teleport(p, [SHOP_POS[0], 0.2, SHOP_POS[1] + 2]);
    let r = await emit(s, 'mode', { name: 'buy', data: { seed: 'carrot', n: 2 } });
    assert.equal(r.me.seeds.carrot, 5);
    const [x, z] = tilePos(k, 0);
    room.teleport(p, [x, 0.2, z]);
    await sleep(130);
    r = await emit(s, 'mode', { name: 'plant', data: { tile: 0, seed: 'carrot' } });
    assert.ok(r.ok, JSON.stringify(r));
    await sleep(130);
    r = await emit(s, 'mode', { name: 'harvest', data: { tile: 0 } });
    assert.match(r.error, /madura/);
    p.data.g.tiles[0].at -= 31_000; // pasa el tiempo
    await sleep(130);
    r = await emit(s, 'mode', { name: 'harvest', data: { tile: 0 } });
    assert.ok(r.ok, JSON.stringify(r));
    room.teleport(p, [SHOP_POS[0], 0.2, SHOP_POS[1] + 2]);
    await sleep(130);
    r = await emit(s, 'mode', { name: 'sell' });
    assert.ok(r.total >= 16, JSON.stringify(r));
    const users = await import('../server/services/users.js');
    assert.equal(users.getUser(userId).stats.garden.seeds.carrot, 4, 'el huerto se guarda en el perfil');
  } finally {
    s.disconnect();
  }
});

test('Bloques Locos: se rellena con bots, las baldosas caen y hay ganador', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'bloques' });
    const room = roomOf();
    const mode = room.mode;
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'countdown');
    assert.equal(mode.bots.size, 4, '1 jugador + 4 bots');
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'show');
    // El jugador se coloca en una baldosa del color correcto y los bots en una incorrecta
    const good = mode.colors.findIndex((c) => c === mode.target);
    const [gx, gz] = tileCenter(good);
    room.teleport(room.players.get(userId), [gx, BLOQUES.y + 0.2, gz]);
    const bad = mode.colors.findIndex((c) => c !== mode.target);
    for (const b of mode.bots.values()) { const [bx, bz] = tileCenter(bad); b.pos = [bx, BLOQUES.y, bz]; b.goal = null; }
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'drop');
    assert.equal(mode.alive.size, 1, 'los bots se caen');
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'results');
    assert.equal(mode.winner, 'Probador2');
  } finally {
    s.disconnect();
  }
});

test('Asalto a la Casa: recoger, tapiar, la noche trae ladrones que rompen tablas y se les echa a golpes', async () => {
  const s = await srv.connect(token);
  try {
    const j = await emit(s, 'room:join', { key: 'asalto' });
    assert.equal(j.mode.asalto.phase, 'day');
    const room = roomOf();
    const mode = room.mode;
    const p = room.players.get(userId);
    // Recoger una tabla y tapiar la puerta principal
    const it = [...mode.items.values()][0];
    room.teleport(p, it.p);
    let r = await emit(s, 'mode', { name: 'pick', data: { id: it.id } });
    assert.ok(r.ok, JSON.stringify(r));
    p.data.inv.plank = 3;
    const door = mode.meta.openings[0];
    room.teleport(p, door.int);
    r = await emit(s, 'mode', { name: 'board', data: { id: door.id } });
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(mode.boards[door.id] > 0);
    // Llega la noche
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'night');
    mode.queue.forEach((q) => (q.at = 0));
    mode.tick(0.05);
    assert.ok(mode.bandits.size > 0, 'aparecen ladrones');
    // Un ladrón va hacia la puerta tapiada y rompe las tablas
    const b = [...mode.bandits.values()][0];
    b.open = door;
    b.step = 0;
    b.state = 'route';
    for (let i = 0; i < 400 && mode.boards[door.id] > 0; i++) { b.hitAt = 0; mode.tickBandit(b, 0.1, Date.now()); }
    assert.equal(mode.boards[door.id], 0, 'las tablas acaban rotas');
    // Golpear al ladrón hasta que huye
    room.teleport(p, [b.pos[0], 0.3, b.pos[2] + 1]);
    for (let i = 0; i < 10 && mode.bandits.has(b.id); i++) {
      p.data.hitAt = 0;
      r = await emit(s, 'mode', { name: 'hit' });
      assert.ok(r.ok, JSON.stringify(r));
    }
    assert.equal(mode.bandits.has(b.id), false, 'el ladrón huye');
  } finally {
    s.disconnect();
  }
});

test('Pinta y Escóndete: pintarse camufla, los bots buscan y el buscador pilla con clic', async () => {
  const s = await srv.connect(token);
  try {
    await emit(s, 'room:join', { key: 'camaleon' });
    const room = roomOf();
    const mode = room.mode;
    const p = room.players.get(userId);
    mode.mapIdx = mode.maps.length - 1; // ronda 1: Juguetería, ronda 2: Jardín
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'hide');
    assert.equal(mode.roles.get(userId), 'hider', 'jugando solo, la primera ronda te escondes');
    assert.equal(mode.bots.size, 3);
    // Pintarse del color del suelo sube el camuflaje
    const m = mode.map;
    room.teleport(p, [m.center[0] + 3, 0.2, m.center[2] + 3]);
    let r = await emit(s, 'mode', { name: 'paint', data: { part: 'all', color: '#ff00ff' } });
    const before = mode.camo(p.pos, mode.paints.get(userId));
    p.data.paintAt = 0;
    r = await emit(s, 'mode', { name: 'paint', data: { part: 'all', color: m.floorColor } });
    assert.ok(r.ok, JSON.stringify(r));
    r = await emit(s, 'mode', { name: 'paint', data: { pose: 'tumbado' } });
    assert.ok(r.ok);
    const after = mode.camo(p.pos, mode.paints.get(userId));
    assert.ok(after > before + 0.3, `camuflaje ${before} -> ${after}`);
    // Pintar a mano: el trazo llega a los demás y el color medio cuenta para el camuflaje
    const stroke = once(s, 'cam:stroke');
    r = await emit(s, 'mode', { name: 'stroke', data: { part: 'body', color: '#ff0000', r: 9, pts: [[0.2, 0.5], [0.4, 0.5]] } });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await stroke).color, '#ff0000');
    assert.equal(mode.strokes.get(userId).length, 1);
    r = await emit(s, 'mode', { name: 'avg', data: { colors: { head: '#ff00ff', body: '#ff00ff', arms: '#ff00ff', legs: '#ff00ff' } } });
    assert.ok(mode.camo(p.pos, mode.paints.get(userId)) < after, 'si la pintura a mano no pega, baja el camuflaje');
    p.data.paintAt = 0;
    r = await emit(s, 'mode', { name: 'paint', data: { part: 'body', color: m.floorColor } });
    assert.equal(mode.strokes.get(userId).length, 0, 'rellenar con el bote borra los trazos de esa parte');
    // Ronda siguiente: ahora eres buscador y pillas a un bot escondido
    mode.finish();
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.roles.get(userId), 'seeker');
    mode.until = Date.now() - 1;
    mode.tick(0.05);
    assert.equal(mode.phase, 'seek');
    const hider = [...mode.bots.values()].find((b) => mode.roles.get(b.id) === 'hider');
    hider.pos = [mode.map.center[0], 0.2, mode.map.center[2]];
    mode.paints.get(hider.id).pose = 'normal';
    room.teleport(p, [hider.pos[0], 0.2, hider.pos[2] + 6]);
    // Un fallo bloquea un momento
    r = await emit(s, 'mode', { name: 'tag', data: { d: [0, 1, 0] } });
    assert.equal(r.hit, null);
    r = await emit(s, 'mode', { name: 'tag', data: { d: [0, -0.1, -1] } });
    assert.equal(r.error, 'cadencia');
    p.data.missUntil = 0;
    p.data.tagAt = 0;
    r = await emit(s, 'mode', { name: 'tag', data: { d: [0, -0.1, -1] } });
    assert.equal(r.hit, hider.id, JSON.stringify(r));
    assert.equal(mode.roles.get(hider.id), 'seeker', 'el pillado pasa a buscar');
  } finally {
    s.disconnect();
  }
});
