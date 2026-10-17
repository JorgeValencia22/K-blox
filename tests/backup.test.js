// Guardado de datos fuera del servidor: GitHub (cifrado) y Turso.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { restoreBackup, saveBackup, resetBackupClient, status } from '../server/db/backup.js';

const ENV = ['GITHUB_DATA_REPO', 'GITHUB_DATA_TOKEN', 'KEST_DATA_KEY', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'];
const realFetch = globalThis.fetch;
afterEach(() => {
  for (const k of ENV) delete process.env[k];
  globalThis.fetch = realFetch;
  resetBackupClient();
});

/** Base de datos con el mismo esquema que el juego y algunos datos. */
function gameDb(file, withData = true) {
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, coins INTEGER, stats TEXT);
           CREATE TABLE inventory (user_id TEXT, item_id TEXT, PRIMARY KEY (user_id, item_id));`);
  if (withData) {
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run('u1', 'Keko_Star200', 20010, '{"fnafBest":5}');
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run('u2', 'Hermanito', 340, '{}');
    db.prepare('INSERT INTO inventory VALUES (?, ?)').run('u1', 'acc_guardcap');
  }
  return db;
}

/** GitHub falso en memoria: guarda el archivo y cuenta las llamadas. */
function fakeGitHub() {
  const gh = { file: null, blobs: new Map(), trees: new Map(), commits: new Map(), calls: [], empty: true };
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const p = u.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    const method = opts.method || 'GET';
    gh.calls.push(`${method} ${p}`);
    assert.equal(opts.headers.authorization, 'Bearer token-de-prueba');
    const body = opts.body ? JSON.parse(opts.body) : null;
    const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (method === 'GET' && p === '/contents/kestworlds.dat') return gh.file ? new Response(gh.file) : json(404, { message: 'Not Found' });
    if (method === 'PUT' && p === '/contents/kestworlds.dat') { gh.file = Buffer.from(body.content, 'base64'); gh.empty = false; return json(201, {}); }
    if (gh.empty) return json(409, { message: 'Git Repository is empty.' });
    if (method === 'POST' && p === '/git/blobs') { const sha = `b${gh.blobs.size}`; gh.blobs.set(sha, Buffer.from(body.content, 'base64')); return json(201, { sha }); }
    if (method === 'POST' && p === '/git/trees') { const sha = `t${gh.trees.size}`; gh.trees.set(sha, body.tree[0].sha); return json(201, { sha }); }
    if (method === 'POST' && p === '/git/commits') { assert.deepEqual(body.parents, []); const sha = `c${gh.commits.size}`; gh.commits.set(sha, body.tree); return json(201, { sha }); }
    if (method === 'GET' && p === '') return json(200, { default_branch: 'main' });
    if (method === 'PATCH' && p === '/git/refs/heads/main') { assert.equal(body.force, true); gh.file = gh.blobs.get(gh.trees.get(gh.commits.get(body.sha))); return json(200, {}); }
    return json(404, { message: 'ruta no simulada' });
  };
  return gh;
}

test('GitHub: copia cifrada, ilegible sin la clave y restaurada en un disco nuevo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kest-gh-'));
  Object.assign(process.env, { GITHUB_DATA_REPO: 'JorgeValencia22/kestworlds-datos', GITHUB_DATA_TOKEN: 'token-de-prueba', KEST_DATA_KEY: 'clave-secreta-de-prueba' });
  const gh = fakeGitHub();
  let db = gameDb(path.join(dir, 'a.db'));
  // Primera copia en un repositorio vacío (API de contenidos) y siguientes (commit único forzado)
  assert.equal(await saveBackup(db), true);
  assert.equal(await saveBackup(db), false, 'sin cambios no se sube nada');
  db.prepare('UPDATE users SET coins = 99999 WHERE id = ?').run('u2');
  assert.equal(await saveBackup(db), true);
  assert.ok(gh.calls.includes('PATCH /git/refs/heads/main'));
  // El archivo guardado está cifrado: no aparece ningún dato legible
  assert.equal(gh.file.subarray(0, 4).toString(), 'KWD1');
  assert.ok(!gh.file.includes('Keko_Star200') && !gh.file.includes('Hermanito'));
  db.close();

  // Disco nuevo (como al reiniciarse el hosting): se recupera todo
  resetBackupClient();
  db = gameDb(path.join(dir, 'b.db'), false);
  assert.equal(await restoreBackup(db), true);
  assert.equal(db.prepare('SELECT coins FROM users WHERE id = ?').get('u2').coins, 99999);
  assert.equal(db.prepare('SELECT username FROM users WHERE id = ?').get('u1').username, 'Keko_Star200');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory').get().n, 1);
  // Si ya hay datos no se pisan
  assert.equal(await restoreBackup(db), false);
  db.close();

  // Con una clave equivocada no se puede leer
  resetBackupClient();
  process.env.KEST_DATA_KEY = 'otra-clave';
  db = gameDb(path.join(dir, 'c.db'), false);
  assert.equal(await restoreBackup(db), false);
  assert.match(status.lastError, /Restaurar/);
  db.close();
});

test('Turso: la misma copia también funciona en una base de datos en la nube', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kest-tu-'));
  Object.assign(process.env, { TURSO_DATABASE_URL: 'file:' + path.join(dir, 'remota.db').replace(/\\/g, '/'), TURSO_AUTH_TOKEN: 'x' });
  let db = gameDb(path.join(dir, 'a.db'));
  assert.equal(await saveBackup(db), true);
  db.close();
  resetBackupClient();
  db = gameDb(path.join(dir, 'b.db'), false);
  assert.equal(await restoreBackup(db), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
  db.close();
});
