// Chat de voz y subtítulos: solo entre amigos; la foto de perfil se valida.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, emit } from './helpers.js';

let srv, a, b, c;
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

before(async () => {
  srv = await startServer();
  a = (await srv.api('POST', '/api/auth/register', { username: 'Ana', password: 'secreto1' })).body;
  b = (await srv.api('POST', '/api/auth/register', { username: 'Beto', password: 'secreto1' })).body;
  c = (await srv.api('POST', '/api/auth/register', { username: 'Carla', password: 'secreto1' })).body;
});
after(async () => {
  await srv.close();
});

test('la foto de perfil acepta solo imágenes pequeñas y válidas', async () => {
  let r = await srv.api('PUT', '/api/me/photo', { photo: PHOTO }, a.token);
  assert.equal(r.status, 200);
  r = await srv.api('PUT', '/api/me/photo', { photo: '<script>alert(1)</script>' }, a.token);
  assert.equal(r.status, 400);
  r = await srv.api('PUT', '/api/me/photo', { photo: 'data:image/jpeg;base64,' + 'A'.repeat(100000) }, a.token);
  assert.equal(r.status, 400);
  r = await srv.api('PUT', '/api/me/photo', { photo: '' }, a.token);
  assert.equal(r.status, 200);
});

test('voz y subtítulos solo llegan a amigos aceptados', async () => {
  const sa = await srv.connect(a.token), sb = await srv.connect(b.token), sc = await srv.connect(c.token);
  try {
    // Ana y Beto no son amigos todavía
    let r = await emit(sa, 'voice:signal', { to: b.user.id, data: { kind: 'offer', sdp: 'x' } });
    assert.match(r.error, /amigos/);
    // Se hacen amigos
    await srv.api('POST', '/api/friends/request', { username: 'Beto' }, a.token);
    await srv.api('POST', '/api/friends/accept', { userId: a.user.id }, b.token);
    r = await emit(sa, 'voice:signal', { to: b.user.id, data: { kind: 'offer', sdp: 'x' } });
    assert.ok(r.ok, JSON.stringify(r));
    // Señales no válidas se rechazan
    r = await emit(sa, 'voice:signal', { to: b.user.id, data: { kind: 'hack' } });
    assert.ok(r.error);
    // Subtítulos: a Carla (no amiga) no se envían; a Beto sí
    const got = [];
    sc.on('voice:caption', (m) => got.push(['carla', m]));
    sb.on('voice:caption', (m) => got.push(['beto', m]));
    await emit(sa, 'voice:caption', { to: [b.user.id, c.user.id], text: '¡Hola!' });
    await new Promise((res) => setTimeout(res, 150));
    assert.deepEqual(got.map((g) => g[0]), ['beto']);
    assert.equal(got[0][1].text, '¡Hola!');
  } finally {
    sa.disconnect();
    sb.disconnect();
    sc.disconnect();
  }
});
