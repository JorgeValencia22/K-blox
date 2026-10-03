// Registro, inicio y cierre de sesión, y recuperación de sesión (/me).
import express from 'express';
import * as users from '../services/users.js';
import { LoginGuard, httpLimit } from '../security/rateLimit.js';

const guard = new LoginGuard(5, 5 * 60_000);

/** Middleware: exige un token de sesión válido en "Authorization: Bearer ...". */
export function requireAuth(req, res, next) {
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const u = users.userFromToken(token);
  if (!u) return res.status(401).json({ error: 'Sesión no válida' });
  if (users.isBanned(u)) return res.status(403).json({ error: 'Cuenta suspendida temporalmente' });
  req.user = u;
  req.token = token;
  next();
}

export function authRouter() {
  const r = express.Router();
  r.use(httpLimit(30, 60_000));

  r.post('/register', async (req, res) => {
    const { username, password } = req.body || {};
    const out = await users.createUser(username, password);
    if (out.error) return res.status(400).json({ error: out.error });
    const token = users.createSession(out.user.id);
    res.json({ token, user: users.privateProfile(out.user) });
  });

  r.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 40 || password.length > 100) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    const keys = [`u:${username.toLowerCase()}`, `ip:${req.ip}`];
    const wait = Math.max(...keys.map((k) => guard.lockedFor(k)));
    if (wait > 0) return res.status(429).json({ error: `Demasiados intentos. Espera ${Math.ceil(wait / 60000)} min` });
    const u = await users.checkLogin(username, password);
    if (!u) {
      keys.forEach((k) => guard.fail(k));
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    if (users.isBanned(u)) return res.status(403).json({ error: 'Cuenta suspendida temporalmente' });
    keys.forEach((k) => guard.success(k));
    const token = users.createSession(u.id);
    res.json({ token, user: users.privateProfile(u) });
  });

  r.post('/logout', requireAuth, (req, res) => {
    users.deleteSession(req.token);
    res.json({ ok: true });
  });

  r.get('/me', requireAuth, (req, res) => {
    res.json({ user: users.privateProfile(req.user) });
  });

  return r;
}
