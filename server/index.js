// Punto de entrada del servidor de juego.
import { config } from './config.js';
import { createApp } from './app.js';
import { getBuiltinWorld } from '../shared/worlds/index.js';
import { EXPERIENCES } from '../shared/catalog.js';
import { closeDb, getDb, openDb } from './db/database.js';
import { restoreBackup, startBackups, saveBackup, stopBackups } from './db/backup.js';

// Pre-genera los mundos oficiales para que la primera entrada sea rápida.
for (const e of EXPERIENCES) getBuiltinWorld(e.id);

// Si la base de datos está vacía (el hosting gratuito borra el disco), se recupera la última copia guardada
openDb(config.dbFile);
await restoreBackup(getDb());
const { server, io } = createApp();
startBackups(getDb());

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] El puerto ${config.port} ya está en uso. Cierra el otro proceso o cambia PORT en .env\n`);
    process.exit(1);
  }
  throw e;
});

server.listen(config.port, config.host, () => {
  console.log(`\n  KestWorlds - servidor "${config.serverName}" escuchando en http://localhost:${config.port}`);
  console.log(`  Base de datos: ${config.dbFile}\n`);
  keepAwake();
});

/**
 * En el plan gratuito de Render el servidor se duerme tras 15 min sin visitas.
 * Se visita a sí mismo cada 10 min por su dirección pública para seguir despierto
 * (un solo servicio encendido todo el mes cabe en las 750 h gratuitas).
 * Se desactiva con KEEP_AWAKE=0.
 */
function keepAwake() {
  const url = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL;
  if (!url || process.env.KEEP_AWAKE === '0') return;
  setInterval(() => { fetch(`${url}/api/health`).catch(() => {}); }, 10 * 60_000).unref();
  console.log(`  Manteniendo despierto: ${url}`);
}

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  console.log('\nCerrando servidor...');
  stopBackups();
  setTimeout(() => process.exit(0), 15_000).unref();
  // Última copia en la nube antes de apagar
  try { await saveBackup(getDb(), { force: true }); } catch { /* sin copia */ }
  io.close();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
