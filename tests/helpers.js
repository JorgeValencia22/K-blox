// Utilidades de prueba: levanta el servidor en un puerto libre con una BD en memoria.
import { io as ioc } from 'socket.io-client';

process.env.NODE_ENV = 'test';
process.env.NEW_ACCOUNT_MINUTES = '0';
process.env.OWNER_USERNAME ??= '';
process.env.OWNER_PASSWORD ??= '';
process.env.STARTING_COINS = '100';

export async function startServer() {
  const { createApp } = await import('../server/app.js');
  const ctx = createApp({ dbFile: ':memory:' });
  await new Promise((r) => ctx.server.listen(0, '127.0.0.1', r));
  const port = ctx.server.address().port;
  const base = `http://127.0.0.1:${port}`;
  return {
    ...ctx,
    base,
    async api(method, path, body, token) {
      const res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json() };
    },
    connect(token) {
      return new Promise((resolve, reject) => {
        const s = ioc(base, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
    },
    async close() {
      ctx.rooms.stop();
      ctx.io.close();
      await new Promise((r) => ctx.server.close(r));
      const { closeDb } = await import('../server/db/database.js');
      closeDb();
    },
  };
}

export const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
export const once = (s, ev, filter = () => true, ms = 3000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timeout esperando ${ev}`)), ms);
  const h = (d) => {
    if (!filter(d)) return;
    clearTimeout(t);
    s.off(ev, h);
    resolve(d);
  };
  s.on(ev, h);
});
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
