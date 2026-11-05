// Slow Roads: conducción infinita. Cada conductor lleva la física en su pantalla
// (shared/slowroads/car.js) sobre una carretera generada por la misma semilla de la sala; el servidor
// reparte esa semilla, reenvía los coches a los demás y valida los kilómetros guardados: no pueden ser
// más de los que permite la velocidad máxima del coche durante el tiempo conectado.
import { BaseMode } from './BaseMode.js';
import * as users from '../../services/users.js';
import { CAR } from '../../../shared/slowroads/car.js';

export const MIN_SAVE_M = 150;
/** Metros por segundo que no se pueden superar de media (velocidad máxima del coche + margen). */
export const MAX_MS = CAR.maxSpeed * 1.04;
export const MAX_KMH = 300;

/** Normaliza un guardado; devuelve null si es imposible para el tiempo conectado. */
export function validateSave(d, run, now = Date.now()) {
  if (!d || typeof d !== 'object' || !run) return null;
  const dist = Math.floor(Number(d.dist)), ms = Math.floor(Number(d.ms)), top = Math.floor(Number(d.top) || 0);
  if (![dist, ms, top].every(Number.isFinite)) return null;
  const elapsed = now - run.t0;
  const played = Math.min(ms, elapsed + 2000);
  if (dist < MIN_SAVE_M || dist < run.dist) return null;
  if (dist > (played / 1000) * MAX_MS) return null;
  if (top < 0 || top > MAX_KMH) return null;
  return { dist, ms: played, top };
}

export class SlowRoadsMode extends BaseMode {
  constructor(room) {
    super(room);
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.runs = new Map(); // id -> { t0, dist, xp }
  }

  best(id) {
    return users.getUser(id)?.stats?.slowroads || {};
  }

  onJoin(p) {
    this.runs.delete(p.id);
    return { seed: this.seed, best: this.best(p.id), you: p.id };
  }

  onLeave(p) {
    this.runs.delete(p.id);
    this.broadcast('sr:gone', { id: p.id });
  }

  onEvent(p, name, data = {}) {
    if (name === 'start') {
      this.runs.set(p.id, { t0: Date.now(), dist: 0 });
      return { ok: true };
    }
    if (name === 'st') {
      const n = (v) => (Number.isFinite(+v) ? +v : 0);
      const msg = { id: p.id, name: p.name, x: n(data.x), y: n(data.y), z: n(data.z), yaw: n(data.yaw), s: n(data.s), pitch: n(data.pitch), roll: n(data.roll) };
      for (const other of this.room.players.values()) if (other.id !== p.id) other.socket.emit('sr:ally', msg);
      return null;
    }
    if (name === 'save') {
      const run = this.runs.get(p.id);
      const v = validateSave(data, run);
      if (!v) return { error: 'Viaje no válido' };
      return this.record(p, run, v);
    }
    return { error: 'Evento no soportado' };
  }

  record(p, run, v) {
    const delta = v.dist - run.dist;
    run.dist = v.dist;
    let totalKm = 0;
    const stats = users.updateStats(p.id, (s) => {
      const sr = s.slowroads || (s.slowroads = { dist: 0, total: 0, top: 0, trips: 0 });
      sr.total = (sr.total || 0) + delta;
      if (v.dist > (sr.dist || 0)) sr.dist = v.dist;
      if (v.top > (sr.top || 0)) sr.top = v.top;
      if (!run.counted) { sr.trips = (sr.trips || 0) + 1; run.counted = true; }
      totalKm = sr.total / 1000;
    });
    const xp = Math.min(150, Math.floor(delta / 120));
    if (xp > 0) users.award(p.id, { xp, coins: 0, reason: 'Slow Roads: kilómetros recorridos' });
    users.unlockAchievement(p.id, 'sr_first');
    if (v.dist >= 10000) users.unlockAchievement(p.id, 'sr_10k');
    if (totalKm >= 100) users.unlockAchievement(p.id, 'sr_100k');
    if (v.top >= 200) users.unlockAchievement(p.id, 'sr_speed');
    return { ok: true, xp, best: stats?.slowroads || {} };
  }
}
