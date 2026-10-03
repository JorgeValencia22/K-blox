// Construye la aplicación (Express + Socket.IO) sin empezar a escuchar.
// Separado de index.js para poder levantarla en las pruebas automáticas.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { config, ROOT } from './config.js';
import { openDb } from './db/database.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { RoomManager } from './game/RoomManager.js';
import { ChatService } from './chat/ChatService.js';
import { setupSockets } from './realtime/sockets.js';

export function createApp({ dbFile = config.dbFile } = {}) {
  openDb(dbFile);
  const app = express();
  app.disable('x-powered-by');
  // Detrás de un proxy, req.ip debe ser la IP real del jugador (límites e intentos de acceso por IP).
  app.set('trust proxy', config.trustProxy > 0 ? config.trustProxy : 'loopback');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 1e6, pingInterval: 10_000, pingTimeout: 8_000 });
  const rooms = new RoomManager(io);
  const chat = new ChatService(rooms);

  app.use('/api/auth', authRouter());
  app.use('/api', apiRouter(rooms));
  app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

  // En producción se sirve el cliente compilado (npm run build).
  const dist = path.join(ROOT, 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Datos demasiado grandes' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  });

  setupSockets(io, rooms, chat);
  return { app, server, io, rooms, chat };
}
