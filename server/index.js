// Punto de entrada del servidor de juego.
import { config } from './config.js';
import { createApp } from './app.js';
import { getBuiltinWorld } from '../shared/worlds/index.js';
import { EXPERIENCES } from '../shared/catalog.js';
import { closeDb } from './db/database.js';

// Pre-genera los mundos oficiales para que la primera entrada sea rápida.
for (const e of EXPERIENCES) getBuiltinWorld(e.id);

const { server, io } = createApp();

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] El puerto ${config.port} ya está en uso. Cierra el otro proceso o cambia PORT en .env\n`);
    process.exit(1);
  }
  throw e;
});

server.listen(config.port, config.host, () => {
  console.log(`\n  Kest Worlds - servidor "${config.serverName}" escuchando en http://localhost:${config.port}`);
  console.log(`  Base de datos: ${config.dbFile}\n`);
});

function shutdown() {
  console.log('\nCerrando servidor...');
  io.close();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
