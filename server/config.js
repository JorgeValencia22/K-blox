// Configuración del servidor a partir de variables de entorno (.env opcional).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

export const config = {
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  dbFile: path.resolve(ROOT, process.env.DB_FILE || 'data/kest.db'),
  serverName: process.env.SERVER_NAME || 'kest-1',
  maxConnections: int(process.env.MAX_CONNECTIONS, 200),
  maxPlayersPerRoom: int(process.env.MAX_PLAYERS_PER_ROOM, 24),
  sessionDays: int(process.env.SESSION_DAYS, 14),
  newAccountMinutes: int(process.env.NEW_ACCOUNT_MINUTES, 30),
  adminUsernames: (process.env.ADMIN_USERNAMES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  filterWordsFile: path.resolve(ROOT, process.env.FILTER_WORDS_FILE || 'server/security/filter-words.json'),
  startingCoins: int(process.env.STARTING_COINS, 100),
  // Cuenta del dueño (modo desarrollador). Se define en .env o en el panel del hosting, nunca en el código.
  ownerUsername: (process.env.OWNER_USERNAME || '').trim(),
  ownerPassword: process.env.OWNER_PASSWORD || '',
  // Nº de proxies delante del servidor (hosting/Cloudflare). 0 = conexión directa.
  trustProxy: int(process.env.TRUST_PROXY, 0),
  isTest: process.env.NODE_ENV === 'test',
};
