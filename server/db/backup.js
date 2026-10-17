// Guardado continuo de todos los datos del juego fuera del servidor.
// El hosting gratuito borra el disco al reiniciarse; con esto los datos sobreviven:
//  - Al arrancar, si la base de datos está vacía, se lee la última copia y se restaura.
//  - Cada 60 s, si ha cambiado algo, se sube una copia nueva (sin bloquear el juego).
//  - Al apagarse el servidor se sube una última copia.
//
// La copia es un JSON con todas las tablas, comprimido (gzip) y cifrado con AES-256-GCM
// usando la clave KEST_DATA_KEY (solo la tiene el administrador). Formato del archivo:
//   "KWD1" | sal (16) | iv (12) | etiqueta (16) | datos cifrados
// Sin KEST_DATA_KEY se guarda solo comprimido ("KWD0" | datos).
// El Visor de datos (client/public/visor-datos.html) usa el mismo formato para leerla.
//
// Dónde se guarda (el primero que esté configurado):
//  - GitHub: GITHUB_DATA_REPO ("usuario/repo", privado) + GITHUB_DATA_TOKEN (acceso a ese repo).
//    Un único archivo (kestworlds.dat); cada copia reemplaza a la anterior sin acumular historial.
//  - Turso: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const EVERY_MS = 60_000;
const FILE = 'kestworlds.dat';
const KDF_ITER = 200_000;

let lastChanges = -1;
let busy = false;
let timer = null;
let cachedKey = null; // { salt, key } derivada una sola vez por proceso
let turso = null;
export const status = { provider: null, encrypted: false, lastSave: 0, lastSize: 0, lastError: null, restoredAt: 0, restoredUsers: 0 };

function provider() {
  if (process.env.GITHUB_DATA_REPO && process.env.GITHUB_DATA_TOKEN) return 'github';
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) return 'turso';
  return null;
}

export const backupEnabled = () => !!provider();

/** Solo para pruebas: olvida el estado del módulo. */
export function resetBackupClient() {
  turso = null;
  cachedKey = null;
  lastChanges = -1;
  busy = false;
}

// --- Cifrado ------------------------------------------------------------------------
function deriveKey(salt) {
  return crypto.pbkdf2Sync(String(process.env.KEST_DATA_KEY), salt, KDF_ITER, 32, 'sha256');
}

async function pack(json) {
  const zipped = await gzip(Buffer.from(json));
  if (!process.env.KEST_DATA_KEY) return Buffer.concat([Buffer.from('KWD0'), zipped]);
  if (!cachedKey) {
    const salt = crypto.randomBytes(16);
    cachedKey = { salt, key: deriveKey(salt) };
  }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cachedKey.key, iv);
  const enc = Buffer.concat([c.update(zipped), c.final()]);
  return Buffer.concat([Buffer.from('KWD1'), cachedKey.salt, iv, c.getAuthTag(), enc]);
}

async function unpack(buf) {
  const magic = buf.subarray(0, 4).toString();
  if (magic === 'KWD0') return (await gunzip(buf.subarray(4))).toString();
  if (magic !== 'KWD1') throw new Error('Formato de copia desconocido');
  if (!process.env.KEST_DATA_KEY) throw new Error('La copia está cifrada y falta KEST_DATA_KEY');
  const salt = buf.subarray(4, 20), iv = buf.subarray(20, 32), tag = buf.subarray(32, 48), enc = buf.subarray(48);
  const d = crypto.createDecipheriv('aes-256-gcm', deriveKey(salt), iv);
  d.setAuthTag(tag);
  const zipped = Buffer.concat([d.update(enc), d.final()]);
  return (await gunzip(zipped)).toString();
}

// --- Contenido: todas las tablas en JSON ------------------------------------------------
function tables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
}

function snapshot(db) {
  const out = {};
  for (const t of tables(db)) out[t] = db.prepare(`SELECT * FROM "${t}"`).all().map((r) => ({ ...r }));
  return JSON.stringify({ v: 2, app: 'KestWorlds', at: Date.now(), tables: out });
}

function restoreInto(db, data) {
  const known = new Set(tables(db));
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    for (const [t, rows] of Object.entries(data.tables || {})) {
      if (!known.has(t) || !rows.length) continue;
      const cols = new Set(db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name));
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => cols.has(k));
        if (!keys.length) continue;
        db.prepare(`INSERT OR REPLACE INTO "${t}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
          .run(...keys.map((k) => row[k]));
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// --- GitHub --------------------------------------------------------------------------
async function gh(method, url, body, accept = 'application/vnd.github+json') {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_DATA_REPO}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_DATA_TOKEN}`,
      accept,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'KestWorlds',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function ghJson(method, url, body) {
  const res = await gh(method, url, body);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status}: ${data.message || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function githubRead() {
  const res = await gh('GET', `/contents/${FILE}`, null, 'application/vnd.github.raw');
  if (res.status === 404 || res.status === 409) return null; // repositorio vacío o sin copia
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function githubWrite(buf) {
  const content = buf.toString('base64');
  const message = `Copia de KestWorlds ${new Date().toISOString()}`;
  try {
    // Commit sin padres + referencia forzada: el repositorio solo guarda la última copia
    const blob = await ghJson('POST', '/git/blobs', { content, encoding: 'base64' });
    const tree = await ghJson('POST', '/git/trees', { tree: [{ path: FILE, mode: '100644', type: 'blob', sha: blob.sha }] });
    const commit = await ghJson('POST', '/git/commits', { message, tree: tree.sha, parents: [] });
    const repo = await ghJson('GET', '');
    await ghJson('PATCH', `/git/refs/heads/${repo.default_branch || 'main'}`, { sha: commit.sha, force: true });
  } catch (e) {
    if (e.status !== 409 && e.status !== 404 && e.status !== 422) throw e;
    // Repositorio todavía vacío: el primer archivo se crea con la API de contenidos
    await ghJson('PUT', `/contents/${FILE}`, { message, content });
  }
}

// --- Turso ---------------------------------------------------------------------------
async function tursoClient() {
  if (!turso) {
    const url = process.env.TURSO_DATABASE_URL;
    const { createClient } = await import(url.startsWith('file:') ? '@libsql/client' : '@libsql/client/web');
    turso = createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken: process.env.TURSO_AUTH_TOKEN });
    await turso.execute('CREATE TABLE IF NOT EXISTS kest_backup (chunk INTEGER PRIMARY KEY, data BLOB NOT NULL, at INTEGER NOT NULL)');
  }
  return turso;
}

async function tursoRead() {
  const c = await tursoClient();
  const rs = await c.execute('SELECT data FROM kest_backup ORDER BY chunk');
  return rs.rows.length ? Buffer.concat(rs.rows.map((r) => Buffer.from(r.data))) : null;
}

async function tursoWrite(buf) {
  const c = await tursoClient();
  const CHUNK = 1024 * 1024;
  const now = Date.now();
  const stmts = [{ sql: 'DELETE FROM kest_backup', args: [] }];
  for (let i = 0; i * CHUNK < buf.length; i++) stmts.push({ sql: 'INSERT INTO kest_backup (chunk, data, at) VALUES (?, ?, ?)', args: [i, buf.subarray(i * CHUNK, (i + 1) * CHUNK), now] });
  await c.batch(stmts, 'write');
}

// --- API pública ---------------------------------------------------------------------
/** Si la base de datos está vacía (disco nuevo), la rellena con la última copia. */
export async function restoreBackup(db) {
  const p = provider();
  status.provider = p;
  status.encrypted = !!process.env.KEST_DATA_KEY;
  if (!p) return false;
  try {
    const hasUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
    if (hasUsers) return false;
    const buf = p === 'github' ? await githubRead() : await tursoRead();
    if (!buf) {
      console.log(`[datos] Todavía no hay copia en ${p}: se empieza de cero`);
      return false;
    }
    const data = JSON.parse(await unpack(buf));
    restoreInto(db, data);
    status.restoredAt = Date.now();
    status.restoredUsers = data.tables?.users?.length || 0;
    console.log(`[datos] Restaurados ${status.restoredUsers} usuarios desde ${p} (copia del ${new Date(data.at).toISOString()})`);
    return true;
  } catch (e) {
    status.lastError = `Restaurar: ${e.message}`;
    console.error('[datos] No se pudo restaurar la copia:', e.message);
    return false;
  }
}

/** Sube una copia si ha habido cambios (force: siempre). */
export async function saveBackup(db, { force = false } = {}) {
  const p = provider();
  if (!p || busy) return false;
  const changes = db.prepare('SELECT total_changes() AS n').get().n;
  if (!force && changes === lastChanges) return false;
  busy = true;
  try {
    const buf = await pack(snapshot(db));
    if (p === 'github') await githubWrite(buf);
    else await tursoWrite(buf);
    lastChanges = changes;
    status.lastSave = Date.now();
    status.lastSize = buf.length;
    status.lastError = null;
    return true;
  } catch (e) {
    status.lastError = `Guardar: ${e.message}`;
    console.error('[datos] Error al guardar la copia:', e.message);
    return false;
  } finally {
    busy = false;
  }
}

export function startBackups(db) {
  if (!provider()) return;
  lastChanges = db.prepare('SELECT total_changes() AS n').get().n;
  timer = setInterval(() => saveBackup(db), EVERY_MS);
  timer.unref();
  console.log(`[datos] Guardado automático en ${provider()} activado (cada minuto si hay cambios${process.env.KEST_DATA_KEY ? ', cifrado' : ''})`);
}

export function stopBackups() {
  if (timer) clearInterval(timer);
  timer = null;
}
