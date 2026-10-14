// Conjuntos de avatar, color de accesorios y emotes personalizados del admin.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { startServer } = await import('./helpers.js');
const { sanitizeAvatar } = await import('../shared/avatar.js');
const { cleanEmote } = await import('../shared/emotes.js');
const { validAnim } = await import('../server/game/validation.js');

let srv, admin, player;

before(async () => {
  srv = await startServer();
  let r = await srv.api('POST', '/api/auth/register', { username: 'Keko_Star200', password: 'loquesea1' });
  assert.equal(r.body.user.role, 'admin');
  admin = r.body.token;
  r = await srv.api('POST', '/api/auth/register', { username: 'Hermano1', password: 'secreto1' });
  player = r.body.token;
});
after(async () => {
  await srv.close();
});

test('avatar: color de accesorios solo para los equipados y con formato válido', () => {
  const a = sanitizeAvatar({ accessories: ['acc_cap', 'acc_glasses'], accColors: { acc_cap: '#00FF00', acc_glasses: 'rojo', acc_crown: '#ffffff' } }, new Set());
  assert.deepEqual(a.accColors, { acc_cap: '#00ff00' });
});

test('conjuntos: guardar, reemplazar, listar, límite y borrar', async () => {
  const avatar = { hair: 'hair_messy', accessories: ['acc_cap'], accColors: { acc_cap: '#123456' } };
  let r = await srv.api('POST', '/api/presets', { name: 'Ninja', avatar }, player);
  assert.equal(r.status, 200);
  // El pelo no comprado se sustituye por el de por defecto
  assert.equal(r.body.presets[0].avatar.hair, 'hair_short');
  assert.equal(r.body.presets[0].avatar.accColors.acc_cap, '#123456');
  r = await srv.api('POST', '/api/presets', { name: 'Ninja', avatar: { ...avatar, shirtColor: '#ff0000' } }, player);
  assert.equal(r.body.presets.length, 1, 'mismo nombre = se reemplaza');
  assert.equal(r.body.presets[0].avatar.shirtColor, '#ff0000');
  for (let i = 0; i < 11; i++) await srv.api('POST', '/api/presets', { name: `Set ${i}`, avatar }, player);
  r = await srv.api('POST', '/api/presets', { name: 'Uno más', avatar }, player);
  assert.equal(r.status, 400);
  r = await srv.api('DELETE', `/api/presets/${encodeURIComponent('Ninja')}`, null, player);
  assert.equal(r.body.presets.length, 11);
  r = await srv.api('POST', '/api/presets', { name: '   ', avatar }, player);
  assert.equal(r.status, 400);
});

test('emotes personalizados: solo el admin los crea, todos los ven', async () => {
  const pose = (x) => ({ la: [x, 0, 0], ra: [0, 0, 0], ll: [0, 0, 0], rl: [0, 0, 0], body: [0, 0, 0], head: [0, 0, 0], y: 0 });
  const emote = { name: 'Mi baile', loop: true, frames: [{ t: 0, pose: pose(0) }, { t: 0.5, pose: pose(-2) }, { t: 1, pose: pose(0) }] };
  let r = await srv.api('POST', '/api/admin/emotes', { emote }, player);
  assert.equal(r.status, 403);
  r = await srv.api('POST', '/api/admin/emotes', { emote }, admin);
  assert.equal(r.status, 200);
  const id = r.body.emote.id;
  assert.match(id, /^[a-z0-9]{4,16}$/);
  assert.ok(validAnim(`c:${id}`));
  r = await srv.api('GET', '/api/emotes', null, player);
  assert.equal(r.body.emotes.length, 1);
  assert.equal(r.body.emotes[0].name, 'Mi baile');
  // Restaurar una copia con el mismo id (servidor reiniciado) actualiza en lugar de duplicar
  r = await srv.api('POST', '/api/admin/emotes', { emote: { ...emote, id, name: 'Renombrado' } }, admin);
  assert.equal(r.body.emotes.length, 1);
  assert.equal(r.body.emotes[0].name, 'Renombrado');
  r = await srv.api('DELETE', `/api/admin/emotes/${id}`, null, admin);
  assert.equal(r.body.emotes.length, 0);
});

test('emotes personalizados: validación de fotogramas', () => {
  assert.ok(cleanEmote({ name: 'x', frames: [{ t: 0, pose: {} }] }).error, 'hacen falta 2 fotogramas');
  assert.ok(cleanEmote({ name: '', frames: [{ t: 0 }, { t: 1 }] }).error, 'hace falta nombre');
  const e = cleanEmote({ name: 'ok', frames: [{ t: 2, pose: { la: [99, 'a', -99] } }, { t: 0.3, pose: { y: 50 } }, { t: 0.3 }] });
  assert.equal(e.frames[0].t, 0, 'ordenados y el primero empieza en 0');
  assert.ok(e.frames[1].t > e.frames[0].t && e.frames[2].t > e.frames[1].t, 'tiempos estrictamente crecientes');
  assert.equal(e.frames[0].pose.y, 2, 'altura acotada');
  const la = e.frames[2].pose.la;
  assert.ok(Math.abs(la[0]) <= Math.PI * 2 && la[1] === 0 && Math.abs(la[2]) <= Math.PI * 2, 'ángulos acotados');
  assert.ok(!validAnim('c:../../x') && !validAnim('hackear') && validAnim('floss'));
});
