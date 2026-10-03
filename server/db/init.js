// Inicializa (o actualiza) el esquema de la base de datos.
// Uso: npm run db:init
import { config } from '../config.js';
import { openDb, closeDb } from './database.js';

const db = openDb(config.dbFile);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
console.log(`Base de datos lista en ${config.dbFile}`);
console.log(`Tablas: ${tables.join(', ')}`);
closeDb();
