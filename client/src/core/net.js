// Conexión en tiempo real: socket autenticado, reloj sincronizado con el servidor
// y medición de latencia.
import { io } from 'socket.io-client';
import { Emitter } from './events.js';
import { auth } from './api.js';

class Net extends Emitter {
  constructor() {
    super();
    this.socket = null;
    this.latency = 0;
    this.clockOffset = 0; // serverTime ≈ Date.now() + clockOffset
    this.connected = false;
    this.pingTimer = null;
  }

  connect() {
    if (this.socket) return;
    const s = io({ auth: (cb) => cb({ token: auth.token }), transports: ['websocket', 'polling'], reconnectionDelay: 800, reconnectionDelayMax: 4000 });
    this.socket = s;
    s.on('connect', () => {
      const wasReconnect = this.everConnected;
      this.connected = true;
      this.everConnected = true;
      this.emit('status', 'online');
      this.ping();
      if (wasReconnect) this.emit('reconnected');
    });
    s.on('disconnect', (reason) => {
      this.connected = false;
      this.emit('status', 'offline');
      if (reason === 'io server disconnect') this.emit('kicked', { reason: 'Desconectado por el servidor' });
    });
    s.on('connect_error', (e) => {
      this.emit('status', 'offline');
      if (e.message === 'auth') return window.dispatchEvent(new Event('kest:unauthorized'));
      if (e.message === 'banned') return this.emit('kicked', { reason: 'Cuenta suspendida' });
      // Si Socket.IO deja de reintentar (p. ej. el servidor se reinició), se reintenta manualmente.
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        if (this.socket === s && !s.connected && !s.active) s.connect();
      }, 2500);
    });
    // Reenvía todos los eventos del servidor al emisor local.
    s.onAny((ev, data) => this.emit(ev, data));
    this.pingTimer = setInterval(() => this.ping(), 2000);
  }

  /** Fuerza un intento de conexión inmediato si no hay conexión. */
  ensure() {
    if (this.socket && !this.socket.connected && !this.socket.active) this.socket.connect();
  }

  disconnect() {
    clearInterval(this.pingTimer);
    clearTimeout(this.retryTimer);
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.everConnected = false;
  }

  ping() {
    if (!this.socket?.connected) return;
    const t0 = Date.now();
    this.socket.emit('ping', {}, (r) => {
      const t1 = Date.now();
      const rtt = t1 - t0;
      this.latency = this.latency ? this.latency * 0.7 + rtt * 0.3 : rtt;
      if (r?.t) {
        const offset = r.t - (t0 + rtt / 2);
        this.clockOffset = this.clockOffset ? this.clockOffset * 0.8 + offset * 0.2 : offset;
      }
      this.emit('latency', this.latency);
    });
  }

  serverNow() {
    return Date.now() + this.clockOffset;
  }

  /** Emite y espera respuesta (con tiempo límite). */
  request(ev, data = {}, timeout = 8000) {
    return new Promise((resolve) => {
      if (!this.socket?.connected) return resolve({ error: 'Sin conexión con el servidor' });
      const t = setTimeout(() => resolve({ error: 'El servidor no responde' }), timeout);
      this.socket.emit(ev, data, (r) => {
        clearTimeout(t);
        resolve(r || {});
      });
    });
  }

  send(ev, data) {
    if (this.socket?.connected) this.socket.volatile.emit(ev, data);
  }
}

export const net = new Net();
