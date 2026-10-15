// Copia de seguridad continua de la base de datos en Turso (base de datos en la nube, plan gratuito).
// El hosting gratuito borra el disco al reiniciarse; con esto los datos sobreviven:
//  - Al arrancar se descarga la última copia y se restaura el archivo SQLite.
//  - Cada 20 s, si ha cambiado algo, se sube una copia comprimida (sin bloquear el juego).
//  - Al apagarse el servidor se sube una última copia.
// Solo se activa si existen TURSO_DATABASE_URL y TURSO_AUTH_TOKEN (panel del hosting / .env).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const CHUNK = 1024 * 1024; // 1 MB por fila
const EVERY_MS = 20_000;

let client = null;
let lastChanges = -1;
let busy = false;
let timer = null;

async function getClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return null;
  if (!client) {
    // Cliente HTTP puro (sin módulos nativos); con file: (solo pruebas) se usa el cliente local
    const { createClient } = await import(url.startsWith('file:') ? '@libsql/client' : '@libsql/client/web');
    client = createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken });
    await client.execute('CREATE TABLE IF NOT EXISTS kest_backup (chunk INTEGER PRIMARY KEY, data BLOB NOT NULL, at INTEGER NOT NULL)');
  }
  return client;
}

/** Solo para pruebas: olvida el cliente actual. */
export function resetBackupClient() {
  client = null;
  lastChanges = -1;
}

export const backupEnabled = () => !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);

/** Restaura el archivo SQLite desde la última copia (antes de abrir la base de datos). */
export async function restoreBackup(file) {
  if (!backupEnabled() || file === ':memory:') return false;
  try {
    const c = await getClient();
    const rs = await c.execute('SELECT data FROM kest_backup ORDER BY chunk');
    if (!rs.rows.length) {
      console.log('[copia] No hay copia en Turso todavía: se empieza con una base de datos nueva');
      return false;
    }
    const parts = rs.rows.map((r) => Buffer.from(r.data));
    const data = await gunzip(Buffer.concat(parts));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true });
    fs.writeFileSync(file, data);
    console.log(`[copia] Base de datos restaurada desde Turso (${Math.round(data.length / 1024)} KB)`);
    return true;
  } catch (e) {
    console.error('[copia] No se pudo restaurar la copia:', e.message);
    return false;
  }
}

/** Sube una copia si ha habido cambios (force: siempre). */
export async function saveBackup(db, file, { force = false } = {}) {
  if (!backupEnabled() || busy || file === ':memory:') return false;
  const changes = db.prepare('SELECT total_changes() AS n').get().n;
  if (!force && changes === lastChanges) return false;
  busy = true;
  const tmp = `${file}.backup`;
  try {
    fs.rmSync(tmp, { force: true });
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); // copia coherente aunque haya escrituras
    const zipped = await gzip(fs.readFileSync(tmp));
    const c = await getClient();
    const now = Date.now();
    const stmts = [{ sql: 'DELETE FROM kest_backup', args: [] }];
    for (let i = 0; i * CHUNK < zipped.length; i++) {
      stmts.push({ sql: 'INSERT INTO kest_backup (chunk, data, at) VALUES (?, ?, ?)', args: [i, zipped.subarray(i * CHUNK, (i + 1) * CHUNK), now] });
    }
    await c.batch(stmts, 'write');
    lastChanges = changes;
    return true;
  } catch (e) {
    console.error('[copia] Error al guardar la copia:', e.message);
    return false;
  } finally {
    fs.rmSync(tmp, { force: true });
    busy = false;
  }
}

export function startBackups(db, file) {
  if (!backupEnabled() || file === ':memory:') return;
  lastChanges = db.prepare('SELECT total_changes() AS n').get().n;
  timer = setInterval(() => saveBackup(db, file), EVERY_MS);
  timer.unref();
  console.log('[copia] Copias automáticas en Turso activadas (cada 20 s si hay cambios)');
}

export function stopBackups() {
  if (timer) clearInterval(timer);
  timer = null;
}
