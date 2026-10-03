// Limitadores de frecuencia en memoria (ventana deslizante).

export class RateLimiter {
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  /** Devuelve true si la acción está permitida y la registra. */
  take(key, now = Date.now()) {
    let arr = this.hits.get(key);
    if (!arr) this.hits.set(key, (arr = []));
    while (arr.length && arr[0] <= now - this.windowMs) arr.shift();
    if (arr.length >= this.max) return false;
    arr.push(now);
    return true;
  }

  cleanup(now = Date.now()) {
    for (const [k, arr] of this.hits) {
      if (!arr.length || arr[arr.length - 1] <= now - this.windowMs) this.hits.delete(k);
    }
  }
}

/**
 * Protección de inicio de sesión: tras `maxFails` fallos para un mismo
 * usuario o IP se bloquea durante `lockMs`.
 */
export class LoginGuard {
  constructor(maxFails = 5, lockMs = 5 * 60_000) {
    this.maxFails = maxFails;
    this.lockMs = lockMs;
    this.state = new Map();
  }

  lockedFor(key, now = Date.now()) {
    const s = this.state.get(key);
    if (!s || !s.lockedUntil) return 0;
    if (s.lockedUntil <= now) {
      this.state.delete(key);
      return 0;
    }
    return s.lockedUntil - now;
  }

  fail(key, now = Date.now()) {
    const s = this.state.get(key) || { fails: 0, lockedUntil: 0 };
    s.fails++;
    if (s.fails >= this.maxFails) {
      s.lockedUntil = now + this.lockMs;
      s.fails = 0;
    }
    this.state.set(key, s);
  }

  success(key) {
    this.state.delete(key);
  }
}

/** Middleware Express genérico por IP. */
export function httpLimit(max, windowMs) {
  const rl = new RateLimiter(max, windowMs);
  setInterval(() => rl.cleanup(), 60_000).unref();
  return (req, res, next) => {
    if (!rl.take(req.ip)) return res.status(429).json({ error: 'Demasiadas peticiones, espera un momento' });
    next();
  };
}
