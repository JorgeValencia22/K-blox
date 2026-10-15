// Copia de seguridad en la nube: guardar, perder el disco y restaurar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { restoreBackup, saveBackup, resetBackupClient } from '../server/db/backup.js';

test('copia en Turso: se guarda y se restaura tras perder el disco', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kest-bk-'));
  const remote = path.join(dir, 'remota.db');
  const file = path.join(dir, 'juego.db');
  process.env.TURSO_DATABASE_URL = 'file:' + remote.replace(/\\/g, '/');
  process.env.TURSO_AUTH_TOKEN = 'prueba';
  resetBackupClient();
  try {
    // Sin copia todavía
    assert.equal(await restoreBackup(file), false);
    let db = new DatabaseSync(file);
    db.exec('CREATE TABLE users (id TEXT, name TEXT)');
    // Datos poco comprimibles: obliga a partir la copia en varios trozos de 1 MB
    const big = Array.from({ length: 300_000 }, () => Math.random().toString(36).slice(2, 10)).join('');
    db.prepare('INSERT INTO users VALUES (?, ?)').run('1', 'Keko_Star200');
    db.prepare('INSERT INTO users VALUES (?, ?)').run('2', big);
    assert.equal(await saveBackup(db, file), true);
    assert.equal(await saveBackup(db, file), false, 'sin cambios no se vuelve a subir');
    db.close();
    // El hosting borra el disco…
    fs.rmSync(file, { force: true });
    resetBackupClient();
    assert.equal(await restoreBackup(file), true);
    db = new DatabaseSync(file);
    assert.equal(db.prepare('SELECT name FROM users WHERE id = ?').get('1').name, 'Keko_Star200');
    assert.equal(db.prepare('SELECT name FROM users WHERE id = ?').get('2').name, big);
    db.close();
  } finally {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    resetBackupClient();
  }
});
